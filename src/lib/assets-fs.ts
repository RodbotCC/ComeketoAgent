/**
 * Lead asset library — file-canonical (Phase 6.1 of harness/ overhaul, 2026-05-05).
 *
 * Replaces the Supabase `lead_assets` table + `assets` Storage bucket with
 * files under `harness/leads/{id}__{slug}/assets/{asset_id}/` (lead-scoped)
 * and `harness/assets/global/{asset_id}/` (org-wide).
 *
 * v1 file size: GitHub Contents API caps at 1MB per file. Uploads >1MB are
 * rejected with a clear error. For larger binaries (high-res photos, video),
 * a future Git Data API blob path can be added — same pattern, just more
 * scaffolding.
 *
 * Files written per upload:
 *   {asset_id}/meta.json     metadata (filename, mime, size, kind, etc.)
 *   {asset_id}/file.{ext}    the binary, inline base64 via Octokit
 */

import { randomUUID } from "node:crypto";
import type { Octokit } from "octokit";
import {
  findLeadFolderPath,
  writeLeadFile,
  leadFolderPath,
} from "./lead-folder";
import { getOctokit } from "./github";
import { env } from "./env";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

/** Max byte size we'll inline. GitHub's createOrUpdateFileContents endpoint
 *  accepts ≤1MB; we leave a little headroom for the base64 expansion. */
const MAX_INLINE_BYTES = 950_000;

const GLOBAL_ASSETS_ROOT = "harness/assets/global";

export type AssetScope = "lead" | "global";

export type AssetMeta = {
  id: string;
  scope: AssetScope;
  close_lead_id: string | null;
  title: string;
  filename: string;
  mime: string | null;
  byte_size: number | null;
  kind: string;
  description: string | null;
  alt_text: string | null;
  approved_for_customer: boolean;
  source: string;
  created_at: string;
  updated_at: string;
  /** Path within the harness branch — informational. */
  storage_path: string;
};

export type AssetWithRawUrl = AssetMeta & {
  /** Direct raw GitHub URL for the binary (use for previews; cached aggressively). */
  raw_url: string | null;
};

export function assetKind(filename: string, mime?: string | null): string {
  const m = (mime || "").toLowerCase();
  const f = filename.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(f)) return "image";
  if (m.includes("html") || /\.html?$/i.test(f)) return "html";
  if (m.includes("pdf") || /\.pdf$/i.test(f)) return "pdf";
  if (m.includes("csv") || /\.csv$/i.test(f)) return "csv";
  if (m.includes("json") || /\.json$/i.test(f)) return "json";
  if (m.startsWith("text/") || /\.(txt|md)$/i.test(f)) return "text";
  return "file";
}

function fileExtFromName(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "bin";
  return filename.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "asset";
}

/** Write a per-lead asset. Returns metadata + relative path. Throws on
 *  >MAX_INLINE_BYTES (caller surfaces a clear UI error). */
export async function writeLeadAssetFs(opts: {
  leadId: string;
  leadName: string;
  filename: string;
  mime: string | null;
  buffer: Buffer;
  title?: string;
  description?: string;
  altText?: string;
  approvedForCustomer?: boolean;
}): Promise<AssetMeta> {
  if (opts.buffer.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      `Asset too large for harness inline storage (${opts.buffer.byteLength} bytes; max ${MAX_INLINE_BYTES}). Use a smaller export or compress.`,
    );
  }

  const id = randomUUID();
  const ext = fileExtFromName(opts.filename);
  const dir = `assets/${id}`;
  const filePath = `${dir}/file.${ext}`;
  const now = new Date().toISOString();

  const meta: AssetMeta = {
    id,
    scope: "lead",
    close_lead_id: opts.leadId,
    title: (opts.title ?? opts.filename).trim() || opts.filename,
    filename: safeName(opts.filename),
    mime: opts.mime,
    byte_size: opts.buffer.byteLength,
    kind: assetKind(opts.filename, opts.mime),
    description: (opts.description ?? "").trim() || null,
    alt_text: (opts.altText ?? "").trim() || null,
    approved_for_customer: !!opts.approvedForCustomer,
    source: "operator_upload",
    created_at: now,
    updated_at: now,
    storage_path: filePath,
  };

  await writeLeadFile(
    opts.leadId,
    opts.leadName,
    `${dir}/meta.json`,
    JSON.stringify(meta, null, 2) + "\n",
    { commitMessage: `assets: ${opts.leadName} — ${meta.title} (meta)` },
  );
  // Binary as base64 — writeLeadFile takes a string, so we pre-encode.
  await writeLeadFile(
    opts.leadId,
    opts.leadName,
    filePath,
    opts.buffer.toString("base64"),
    {
      commitMessage: `assets: ${opts.leadName} — ${meta.title} (file)`,
    },
  );
  return meta;
}

/** Write a global (org-wide) asset under harness/assets/global/. */
export async function writeGlobalAssetFs(opts: {
  filename: string;
  mime: string | null;
  buffer: Buffer;
  title?: string;
  description?: string;
  altText?: string;
  approvedForCustomer?: boolean;
}): Promise<AssetMeta> {
  if (opts.buffer.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      `Asset too large for harness inline storage (${opts.buffer.byteLength} bytes; max ${MAX_INLINE_BYTES}).`,
    );
  }

  const id = randomUUID();
  const ext = fileExtFromName(opts.filename);
  const dir = `${GLOBAL_ASSETS_ROOT}/${id}`;
  const now = new Date().toISOString();

  const meta: AssetMeta = {
    id,
    scope: "global",
    close_lead_id: null,
    title: (opts.title ?? opts.filename).trim() || opts.filename,
    filename: safeName(opts.filename),
    mime: opts.mime,
    byte_size: opts.buffer.byteLength,
    kind: assetKind(opts.filename, opts.mime),
    description: (opts.description ?? "").trim() || null,
    alt_text: (opts.altText ?? "").trim() || null,
    approved_for_customer: !!opts.approvedForCustomer,
    source: "operator_upload",
    created_at: now,
    updated_at: now,
    storage_path: `${dir}/file.${ext}`,
  };

  const octo = getOctokit();
  await octo.rest.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: `${dir}/meta.json`,
    message: `assets: global — ${meta.title} (meta)`,
    content: Buffer.from(JSON.stringify(meta, null, 2) + "\n", "utf-8").toString("base64"),
    branch: REPO_BRANCH,
  });
  await octo.rest.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: `${dir}/file.${ext}`,
    message: `assets: global — ${meta.title} (file)`,
    content: opts.buffer.toString("base64"),
    branch: REPO_BRANCH,
  });
  return meta;
}

/** List assets visible to a lead (per-lead + all global). Newest first. */
export async function listAssetsForLeadFs(
  leadId: string,
  limit = 40,
): Promise<AssetWithRawUrl[]> {
  const octo = getOctokit();
  const out: AssetWithRawUrl[] = [];

  // Lead-scoped
  const folder = await findLeadFolderPath(leadId);
  if (folder) {
    out.push(...(await listAssetMetaInDir(octo, `${folder.path}/assets`)));
  }
  // Globals
  out.push(...(await listAssetMetaInDir(octo, GLOBAL_ASSETS_ROOT)));

  out.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return out.slice(0, limit);
}

async function listAssetMetaInDir(
  octo: Octokit,
  dir: string,
): Promise<AssetWithRawUrl[]> {
  let entries: { name: string; path: string }[] = [];
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: dir,
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

  // Read each meta.json. Concurrency-capped.
  const out: AssetWithRawUrl[] = [];
  let cursor = 0;
  const lanes = Math.min(5, entries.length);
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= entries.length) return;
      const entry = entries[i];
      if (!entry) continue;
      try {
        const r = await octo.rest.repos.getContent({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: `${entry.path}/meta.json`,
          ref: REPO_BRANCH,
        });
        const data = r.data as { content?: string; encoding?: string };
        if (!data.content || data.encoding !== "base64") continue;
        const text = Buffer.from(data.content, "base64").toString("utf-8");
        const meta = JSON.parse(text) as AssetMeta;
        out.push({
          ...meta,
          raw_url: rawUrlFor(meta.storage_path),
        });
      } catch {
        // skip unreadable asset
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return out;
}

function rawUrlFor(storagePath: string): string {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${storagePath}`;
}

/** Get one asset by id. Scans lead + global. */
export async function getAssetByIdFs(id: string): Promise<AssetMeta | null> {
  // Best path is to know the scope. Without it, fall back to scanning. Most
  // callers know if it's lead-scoped (they have the leadId in context) so
  // we add a lookup helper below. This generic version is slow.
  const octo = getOctokit();
  // Try global first (smaller)
  const globals = await listAssetMetaInDir(octo, GLOBAL_ASSETS_ROOT);
  const inGlobals = globals.find((a) => a.id === id);
  if (inGlobals) return inGlobals;
  // Otherwise scan all active lead folders for this asset id.
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "harness/leads/active",
      ref: REPO_BRANCH,
    });
    const items = Array.isArray(r.data) ? r.data : [r.data];
    for (const it of items) {
      if (
        it &&
        typeof it === "object" &&
        "type" in it &&
        it.type === "dir" &&
        "path" in it &&
        typeof it.path === "string"
      ) {
        const found = await listAssetMetaInDir(octo, `${it.path}/assets`);
        const hit = found.find((a) => a.id === id);
        if (hit) return hit;
      }
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  return null;
}

/** Delete an asset (meta + binary). Per-lead OR global. */
export async function deleteAssetByIdFs(id: string): Promise<void> {
  const meta = await getAssetByIdFs(id);
  if (!meta) return;

  const octo = getOctokit();
  // Determine the directory the meta.json lived in by trimming /file.{ext}
  const fileIdx = meta.storage_path.lastIndexOf("/");
  const dir = fileIdx >= 0 ? meta.storage_path.slice(0, fileIdx) : meta.storage_path;

  for (const path of [`${dir}/meta.json`, meta.storage_path]) {
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
        message: `assets: delete ${id}`,
        sha,
        branch: REPO_BRANCH,
      });
    } catch (e: unknown) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
}

void leadFolderPath; // keeps the symbol referenced for back-compat tooling
