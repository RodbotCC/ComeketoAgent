/**
 * File-tree backed intake artifacts (Phase 1 of harness/ overhaul, 2026-05-05).
 *
 * Replaces the Supabase `intake_artifacts` table + `intake` Storage bucket
 * with files under `harness/leads/{lead_id}__{slug}/intake/{intake_id}/` on
 * the `leads-data` branch.
 *
 * Files written per upload:
 *   meta.json     { id, filename, mime, byte_size, created_at, lead_id }
 *   extracted.md  the extracted text (or "[no extractable text]" placeholder)
 *
 * Original binaries are NOT persisted in v1 — extraction is what the agent
 * needs and binaries >1MB don't fit GitHub's Contents API. If we want
 * binary persistence later, that's a Git Data API addition.
 */

import { randomUUID } from "node:crypto";
import { Octokit } from "octokit";
import {
  findLeadFolderPath,
  writeLeadFile,
  leadFolderPath,
} from "./lead-folder";
import { getOctokit } from "./github";
import { env } from "./env";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "leads-data";

/** Shape every read site sees. Mirrors the old Supabase row enough that
 *  existing UI components don't need to change. `storage_path` is now the
 *  in-tree path (informational only — the file IS the source). */
export type IntakeArtifactFs = {
  id: string;
  created_at: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  byte_size: number | null;
  summary: string | null;
  extracted_text: string | null;
  lead_id: string;
};

export type IntakeWriteResult = {
  intake_id: string;
  rel_path: string;
  bytes_written: number;
};

/** Write a fresh intake artifact for a lead. Idempotent only by intake_id;
 *  re-uploading the same file under a new id creates a new entry. */
export async function writeIntakeArtifact(opts: {
  leadId: string;
  leadName: string;
  filename: string;
  mime: string | null;
  byteSize: number;
  extractedText: string | null;
  summary: string;
}): Promise<IntakeWriteResult> {
  const intakeId = randomUUID();
  const intakeDir = `intake/${intakeId}`;
  const createdAt = new Date().toISOString();

  const meta = {
    id: intakeId,
    filename: opts.filename,
    mime: opts.mime,
    byte_size: opts.byteSize,
    created_at: createdAt,
    lead_id: opts.leadId,
    summary: opts.summary,
    extracted_chars: opts.extractedText?.length ?? 0,
  };

  const extractedBody = opts.extractedText
    ? buildExtractedDoc(
        {
          filename: opts.filename,
          mime: opts.mime,
          byteSize: opts.byteSize,
          extractedText: opts.extractedText,
        },
        intakeId,
        createdAt,
      )
    : buildPlaceholderDoc(
        {
          filename: opts.filename,
          mime: opts.mime,
          byteSize: opts.byteSize,
          summary: opts.summary,
        },
        intakeId,
        createdAt,
      );

  await writeLeadFile(
    opts.leadId,
    opts.leadName,
    `${intakeDir}/meta.json`,
    JSON.stringify(meta, null, 2) + "\n",
    {
      commitMessage: `intake: ${opts.leadName} — ${opts.filename} (meta)`,
    },
  );
  await writeLeadFile(
    opts.leadId,
    opts.leadName,
    `${intakeDir}/extracted.md`,
    extractedBody,
    {
      commitMessage: `intake: ${opts.leadName} — ${opts.filename} (extract)`,
    },
  );

  return {
    intake_id: intakeId,
    rel_path: intakeDir,
    bytes_written: extractedBody.length,
  };
}

function buildExtractedDoc(
  opts: { filename: string; mime: string | null; byteSize: number; extractedText: string },
  intakeId: string,
  createdAt: string,
): string {
  const text = opts.extractedText;
  const body = [
    "---",
    `intake_id: ${intakeId}`,
    `filename: ${opts.filename.replace(/[\r\n]/g, " ")}`,
    `mime: ${opts.mime ?? "unknown"}`,
    `byte_size: ${opts.byteSize}`,
    `created_at: ${createdAt}`,
    "---",
    "",
    text,
  ].join("\n");
  return body.endsWith("\n") ? body : body + "\n";
}

function buildPlaceholderDoc(
  opts: { filename: string; mime: string | null; byteSize: number; summary: string },
  intakeId: string,
  createdAt: string,
): string {
  return [
    "---",
    `intake_id: ${intakeId}`,
    `filename: ${opts.filename.replace(/[\r\n]/g, " ")}`,
    `mime: ${opts.mime ?? "unknown"}`,
    `byte_size: ${opts.byteSize}`,
    `created_at: ${createdAt}`,
    "extracted: false",
    "---",
    "",
    `_(no extractable text — ${opts.summary})_`,
    "",
  ].join("\n");
}

/** Read all intake artifact metadata for a lead, ordered newest-first. */
export async function listIntakeArtifactsForLeadFs(
  leadId: string,
  limit = 24,
): Promise<IntakeArtifactFs[]> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return [];

  const octo = getOctokit();
  const intakeRoot = `${folder.path}/intake`;
  const entries: Array<{ name: string; path: string }> = [];
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: intakeRoot,
      ref: REPO_BRANCH,
    });
    const items = Array.isArray(r.data) ? r.data : [r.data];
    for (const it of items) {
      if (
        it &&
        typeof it === "object" &&
        "type" in it &&
        it.type === "dir" &&
        "name" in it &&
        typeof it.name === "string" &&
        "path" in it &&
        typeof it.path === "string"
      ) {
        entries.push({ name: it.name, path: it.path });
      }
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return [];
    throw e;
  }

  // Read each intake_id/meta.json. Concurrency cap to stay polite.
  const out: IntakeArtifactFs[] = [];
  const lanes = Math.min(5, entries.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= entries.length) return;
      const entry = entries[i];
      if (!entry) continue;
      const meta = await readMetaJson(octo, `${entry.path}/meta.json`);
      if (!meta) continue;
      out.push({
        id: meta.id,
        created_at: meta.created_at,
        filename: meta.filename,
        storage_path: entry.path,
        mime: meta.mime ?? null,
        byte_size: meta.byte_size ?? null,
        summary: meta.summary ?? null,
        extracted_text: null, // lazy — only loaded on demand via getIntakeExtractedText
        lead_id: meta.lead_id,
      });
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  // newest-first by created_at desc
  out.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return out.slice(0, limit);
}

async function readMetaJson(
  octo: Octokit,
  path: string,
): Promise<{
  id: string;
  filename: string;
  mime: string | null;
  byte_size: number | null;
  created_at: string;
  lead_id: string;
  summary?: string | null;
} | null> {
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    const text = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(text);
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** Lazy-load extracted text for a single intake artifact (read on demand to
 *  avoid loading every body when the list page only needs file names). */
export async function getIntakeExtractedTextFs(
  leadId: string,
  intakeId: string,
): Promise<string | null> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return null;
  const octo = getOctokit();
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `${folder.path}/intake/${intakeId}/extracted.md`,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    const md = Buffer.from(data.content, "base64").toString("utf-8");
    return stripFrontmatter(md);
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** Delete an intake artifact (both meta.json and extracted.md). */
export async function deleteIntakeArtifactFs(
  leadId: string,
  intakeId: string,
): Promise<void> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return;
  const octo = getOctokit();
  for (const file of ["meta.json", "extracted.md"]) {
    const path = `${folder.path}/intake/${intakeId}/${file}`;
    try {
      const r = await octo.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        ref: REPO_BRANCH,
      });
      const sha = (r.data as { sha?: string }).sha;
      if (!sha) continue;
      await octo.rest.repos.deleteFile({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        message: `intake: delete ${intakeId}/${file}`,
        sha,
        branch: REPO_BRANCH,
      });
    } catch (e: unknown) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

// Path helper for callers that need to construct a write target before
// calling a low-level helper (e.g., manual seeds).
export function intakeArtifactPath(
  leadId: string,
  leadName: string,
  intakeId: string,
  state: "active" | "archive" = "active",
): { dir: string; metaPath: string; extractedPath: string } {
  const folder = leadFolderPath(leadId, leadName, state);
  const dir = `${folder}/intake/${intakeId}`;
  return {
    dir,
    metaPath: `${dir}/meta.json`,
    extractedPath: `${dir}/extracted.md`,
  };
}

