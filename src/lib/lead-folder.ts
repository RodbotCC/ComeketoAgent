import type { Octokit } from "octokit";
import { env } from "./env";
import { getOctokit } from "./github";

export type LeadFolderState = "active" | "archive";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "leads-data";

/** Canonical root for per-lead folders (Phase 2 of the harness/ overhaul,
 *  2026-05-05). Was `_leads/`. The transitional fallback below still probes
 *  `_leads/` if a lead's folder isn't yet under `harness/leads/`. */
const LEADS_ROOT = "harness/leads";
const LEGACY_LEADS_ROOT = "_leads";

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
  return `${LEADS_ROOT}/${state}/${leadId}__${slugify(name)}`;
}

/** Locate an existing lead folder by id, scanning active then archive. Returns
 *  null if no folder exists yet (brand-new lead).
 *
 *  Phase 2 transitional behavior (2026-05-05): probes `harness/leads/` first;
 *  if not found, falls back to `_leads/` (the pre-rename root). The fallback
 *  is removed one phase after the rename ships. */
export async function findLeadFolderPath(
  leadId: string,
): Promise<{ path: string; state: LeadFolderState } | null> {
  const octo = getOctokit();
  // Probe canonical root first, then legacy. Each root is searched in
  // active → archive order.
  for (const root of [LEADS_ROOT, LEGACY_LEADS_ROOT] as const) {
    for (const state of ["active", "archive"] as const) {
      try {
        const r = await octo.rest.repos.getContent({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: `${root}/${state}`,
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
          if (root === LEGACY_LEADS_ROOT) {
            // One-time signal that something is still living under the
            // legacy path. Operationally fine; sweeper will write to
            // canonical on next pass.
            console.warn(
              `[lead-folder] lead ${leadId} found under legacy ${LEGACY_LEADS_ROOT}/ root; will be migrated on next sweep`,
            );
          }
          return { path: match.path, state };
        }
      } catch (e: unknown) {
        if (statusOf(e) !== 404) throw e;
      }
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

/** Flip `comms_dirty: true` in a lead's `00_meta.json`. Called by the Close
 *  webhook handler so the next sweeper pass knows the lead has fresh data.
 *  No-op (returns "no_folder") if the lead has no folder yet — the sweeper
 *  creates the folder on its next tick anyway. Idempotent: writing
 *  `comms_dirty: true` to a file that already has it is a content-unchanged
 *  no-op once `writeLeadFile`'s diff sees identical content.
 *
 *  Errors are caught at the call site (webhook); this fn surfaces them
 *  honestly so the caller can decide. */
export async function markLeadCommsDirty(
  leadId: string,
): Promise<"flipped" | "already_dirty" | "no_folder"> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return "no_folder";

  const raw = await readLeadFile(leadId, "00_meta.json");
  if (!raw) return "no_folder";

  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(raw);
  } catch {
    return "no_folder";
  }

  if (meta.comms_dirty === true) return "already_dirty";

  meta.comms_dirty = true;
  meta.last_dirty_at = new Date().toISOString();

  const name =
    typeof meta.name === "string" && meta.name.length > 0
      ? meta.name
      : leadId;

  await writeLeadFile(
    leadId,
    name,
    "00_meta.json",
    JSON.stringify(meta, null, 2) + "\n",
    {
      commitMessage: `webhook: ${name} comms dirty`,
      state: folder.state,
    },
  );
  return "flipped";
}

/** Strip the YAML frontmatter from a Markdown doc, returning just the body.
 *  Used by the Discovery page to render LLM-generated profile/discovery prose
 *  without exposing the bookkeeping fields. */
export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

/** Read `04_profile.md`'s body (frontmatter stripped). Returns null if the
 *  lead has no folder yet or the file hasn't been generated. */
export async function readLeadProfileBody(leadId: string): Promise<string | null> {
  const raw = await readLeadFile(leadId, "04_profile.md");
  return raw ? stripFrontmatter(raw) : null;
}

/** Read `06_discovery.md`'s body (frontmatter stripped). */
export async function readLeadDiscoveryBody(leadId: string): Promise<string | null> {
  const raw = await readLeadFile(leadId, "06_discovery.md");
  return raw ? stripFrontmatter(raw) : null;
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
