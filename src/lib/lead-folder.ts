import type { Octokit } from "octokit";
import { env } from "./env";
import { getOctokit } from "./github";

export type LeadFolderState = "active" | "archive";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "leads-data";

const RETRY_DELAYS_MS = [50, 150, 400];

/**
 * Lowercase, ASCII-only, hyphenated. Strips accents, drops symbols/punct,
 * caps at 60 chars. Empty input → "unnamed". Never throws.
 *
 * Examples:
 *   "Eliana Lopes" → "eliana-lopes"
 *   "Sakamoto Family" → "sakamoto-family"
 *   "☼ Sunny ☼" → "sunny"
 *   "Café d'Or" → "cafe-d-or"
 */
export function slugify(name: string): string {
  const out = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return out || "unnamed";
}

export function leadFolderPath(
  leadId: string,
  name: string,
  state: LeadFolderState = "active",
): string {
  return `_leads/${state}/${leadId}__${slugify(name)}`;
}

/** Locate an existing lead folder by id, scanning active then archive. Returns
 *  null if no folder exists yet (brand-new lead). */
export async function findLeadFolderPath(
  leadId: string,
): Promise<{ path: string; state: LeadFolderState } | null> {
  const octo = getOctokit();
  for (const state of ["active", "archive"] as const) {
    try {
      const r = await octo.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: `_leads/${state}`,
        ref: REPO_BRANCH,
      });
      const items = Array.isArray(r.data) ? r.data : [r.data];
      const match = items.find(
        (it) =>
          it &&
          typeof it === "object" &&
          "type" in it &&
          it.type === "dir" &&
          "name" in it &&
          typeof it.name === "string" &&
          it.name.startsWith(`${leadId}__`),
      );
      if (match && "path" in match && typeof match.path === "string") {
        return { path: match.path, state };
      }
    } catch (e: unknown) {
      if (statusOf(e) !== 404) throw e;
    }
  }
  return null;
}

/** Read a single file from a lead's folder. Returns null when file or folder
 *  doesn't exist (caller treats absent files as empty state). */
export async function readLeadFile(
  leadId: string,
  fileName: string,
): Promise<string | null> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return null;

  const octo = getOctokit();
  const filePath = `${folder.path}/${fileName}`;
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch (e: unknown) {
    if (statusOf(e) === 404) return null;
    throw e;
  }
}

/** Write a single file. Folder is created on first write. Optimistic-SHA
 *  retry on 409 (another writer raced). Idempotent: writing identical content
 *  to an existing file is a no-op (same SHA, GitHub returns 200 with no
 *  history change). */
export async function writeLeadFile(
  leadId: string,
  leadName: string,
  fileName: string,
  content: string,
  opts?: { commitMessage?: string; state?: LeadFolderState },
): Promise<void> {
  const existing = await findLeadFolderPath(leadId);
  const targetState = opts?.state ?? existing?.state ?? "active";
  const folderPath =
    existing?.path ?? leadFolderPath(leadId, leadName, targetState);
  const filePath = `${folderPath}/${fileName}`;
  const message =
    opts?.commitMessage ?? `sweep: ${leadId} — update ${fileName}`;
  const octo = getOctokit();
  const encoded = Buffer.from(content, "utf-8").toString("base64");

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const sha = await getFileSha(octo, filePath);
      await octo.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: filePath,
        message,
        content: encoded,
        sha,
        branch: REPO_BRANCH,
      });
      return;
    } catch (e: unknown) {
      lastErr = e;
      const status = statusOf(e);
      if (status === 409 || status === 422) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          await sleep(delay);
          continue;
        }
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("writeLeadFile: exhausted retries");
}

/** Snapshot every file in a lead's folder. Used by the sweeper (Atom 4) to
 *  diff rendered output against existing state and skip identical writes.
 *  Returns a Map keyed by relative path within the folder (e.g.
 *  `"00_meta.json"`, `"comms/call_2026-04-23_asnatj4b.json"`). Returns null
 *  if the lead has no folder yet (brand-new lead). */
export async function listLeadFolderFiles(
  leadId: string,
): Promise<Map<string, { sha: string; content: string }> | null> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return null;

  const octo = getOctokit();
  const files = await listFolderRecursive(octo, folder.path);
  const out = new Map<string, { sha: string; content: string }>();
  const prefix = folder.path + "/";
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rel = f.path.slice(prefix.length);
    const decoded = Buffer.from(f.contentBase64, "base64").toString("utf-8");
    out.set(rel, { sha: f.sha, content: decoded });
  }
  return out;
}

/** Move a lead's folder from `active/` to `archive/`. Per-file copy + delete
 *  (not atomic — if interrupted, files split across both states; next sweep
 *  recovers). For the volume we run (Won/Lost transitions) this is fine. */
export async function archiveLead(
  leadId: string,
  leadName: string,
): Promise<{ moved: number } | { skipped: "missing" | "already-archived" }> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return { skipped: "missing" };
  if (folder.state === "archive") return { skipped: "already-archived" };

  const octo = getOctokit();
  const archivePath = leadFolderPath(leadId, leadName, "archive");
  const files = await listFolderRecursive(octo, folder.path);

  let moved = 0;
  for (const file of files) {
    const rel = file.path.slice(folder.path.length + 1);
    const newPath = `${archivePath}/${rel}`;

    await octo.rest.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: newPath,
      message: `archive: ${leadId} → archive (${rel})`,
      content: file.contentBase64,
      branch: REPO_BRANCH,
    });
    await octo.rest.repos.deleteFile({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: file.path,
      message: `archive: ${leadId} → archive (rm ${rel})`,
      sha: file.sha,
      branch: REPO_BRANCH,
    });
    moved++;
  }
  return { moved };
}

/** Returns SHA of the file at `path` on the configured branch, or undefined
 *  if it doesn't exist. Used for create-vs-update detection in writeLeadFile. */
async function getFileSha(
  octo: Octokit,
  path: string,
): Promise<string | undefined> {
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: REPO_BRANCH,
    });
    const data = r.data as { sha?: string };
    return data.sha;
  } catch (e: unknown) {
    if (statusOf(e) === 404) return undefined;
    throw e;
  }
}

type FileEntry = { path: string; sha: string; contentBase64: string };

/** Recursively walk a folder on the configured branch, returning every leaf
 *  file with its SHA + base64 content. */
async function listFolderRecursive(
  octo: Octokit,
  folderPath: string,
): Promise<FileEntry[]> {
  const r = await octo.rest.repos.getContent({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: folderPath,
    ref: REPO_BRANCH,
  });
  const items = Array.isArray(r.data) ? r.data : [r.data];

  const out: FileEntry[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || !("type" in it)) continue;
    if (it.type === "dir" && "path" in it && typeof it.path === "string") {
      const sub = await listFolderRecursive(octo, it.path);
      out.push(...sub);
    } else if (
      it.type === "file" &&
      "path" in it &&
      typeof it.path === "string" &&
      "sha" in it &&
      typeof it.sha === "string"
    ) {
      const fileR = await octo.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: it.path,
        ref: REPO_BRANCH,
      });
      const data = fileR.data as { content?: string; encoding?: string };
      if (data.content && data.encoding === "base64") {
        out.push({ path: it.path, sha: it.sha, contentBase64: data.content });
      }
    }
  }
  return out;
}

function statusOf(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Exposed for tests: the constants the helpers resolve against. */
export const __TEST_ONLY = {
  REPO_OWNER,
  REPO_NAME,
  REPO_BRANCH,
  RETRY_DELAYS_MS,
};
