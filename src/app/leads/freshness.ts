"use server";

import { getOctokit } from "@/lib/github";
import { env } from "@/lib/env";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

/** Per-lead harness-folder freshness summary. Derived purely from path
 *  presence — no per-file reads — so a 200-lead universe is two GitHub API
 *  calls total, not 200+. */
export type LeadFreshness = {
  lead_id: string;
  has_folder: boolean;
  state: "active" | "archive" | null;
  last_checked_at: string | null;
  has_ai_comms: boolean;
  has_ai_profile: boolean;
  has_ai_discovery: boolean;
  has_ai_alerts: boolean;
  has_ai_ledger: boolean;
  has_plan: boolean;
};

const AI_FILES = {
  comms:     "03_comms_interpreted.md",
  profile:   "04_profile.md",
  discovery: "06_discovery.md",
  alerts:    "07_andre_alerts.md",
  ledger:    "08_client_ledger.md",
} as const;

const PLAN_FILES = ["05_seven_day_plan.md", "plan.json"];

type LeadFolderIndex = {
  state: "active" | "archive";
  files: Set<string>;
  meta_blob_sha: string | null;
};

/** Pull the entire harness file tree in one Git Trees API call, then bucket
 *  paths by `{lead_id}` from `harness/leads/{state}/{lead_id}__{slug}/...`.
 *  Cached in-memory for ~30s so back-to-back navigations dont thrash. */
let _cache: { at: number; map: Map<string, LeadFolderIndex> } | null = null;
const CACHE_MS = 30_000;

async function loadHarnessIndex(): Promise<Map<string, LeadFolderIndex>> {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return _cache.map;
  }

  const octo = getOctokit();
  const branchRes = await octo.rest.repos.getBranch({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    branch: REPO_BRANCH,
  });
  const treeSha = branchRes.data.commit.commit.tree.sha;

  const treeRes = await octo.rest.git.getTree({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    tree_sha: treeSha,
    recursive: "true",
  });

  const map = new Map<string, LeadFolderIndex>();
  for (const node of treeRes.data.tree) {
    if (!node.path) continue;
    if (node.type !== "blob") continue;
    const m = node.path.match(/^harness\/leads\/(active|archive)\/([^/]+)\/(.+)$/);
    if (!m) continue;
    const state = m[1] as "active" | "archive";
    const folderName = m[2];
    const rel = m[3];

    const sep = folderName.indexOf("__");
    if (sep <= 0) continue;
    const leadId = folderName.slice(0, sep);
    if (!leadId.startsWith("lead_")) continue;

    let entry = map.get(leadId);
    if (!entry) {
      entry = { state, files: new Set(), meta_blob_sha: null };
      map.set(leadId, entry);
    }
    entry.files.add(rel);
    if (rel === "00_meta.json" && typeof node.sha === "string") {
      entry.meta_blob_sha = node.sha;
    }
  }

  _cache = { at: Date.now(), map };
  return map;
}

function emptyFreshness(leadId: string): LeadFreshness {
  return {
    lead_id: leadId,
    has_folder: false,
    state: null,
    last_checked_at: null,
    has_ai_comms: false,
    has_ai_profile: false,
    has_ai_discovery: false,
    has_ai_alerts: false,
    has_ai_ledger: false,
    has_plan: false,
  };
}

async function readLastCheckedAtFromMetaBlob(
  sha: string | null,
): Promise<string | null> {
  if (!sha) return null;
  try {
    const octo = getOctokit();
    const blob = await octo.rest.git.getBlob({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      file_sha: sha,
    });
    const raw = Buffer.from(blob.data.content, "base64").toString("utf8");
    const meta = JSON.parse(raw) as { last_sweep_at?: unknown };
    return typeof meta.last_sweep_at === "string" ? meta.last_sweep_at : null;
  } catch {
    return null;
  }
}

export async function getLeadFreshnessBatch(
  leadIds: string[],
): Promise<Record<string, LeadFreshness>> {
  const out: Record<string, LeadFreshness> = {};
  if (leadIds.length === 0) return out;

  let index: Map<string, LeadFolderIndex>;
  try {
    index = await loadHarnessIndex();
  } catch (err) {
    // GitHub flake / quota-exhausted etc. — degrade gracefully: all rows
    // render as "no harness folder". Buttons still work, action creates one.
    for (const id of leadIds) out[id] = emptyFreshness(id);
    return out;
  }

  await Promise.all(
    leadIds.map(async (leadId) => {
    const entry = index.get(leadId);
    if (!entry) {
      out[leadId] = emptyFreshness(leadId);
      return;
    }
    const lastCheckedAt = await readLastCheckedAtFromMetaBlob(entry.meta_blob_sha);
    out[leadId] = {
      lead_id: leadId,
      has_folder: true,
      state: entry.state,
      last_checked_at: lastCheckedAt,
      has_ai_comms:     entry.files.has(AI_FILES.comms),
      has_ai_profile:   entry.files.has(AI_FILES.profile),
      has_ai_discovery: entry.files.has(AI_FILES.discovery),
      has_ai_alerts:    entry.files.has(AI_FILES.alerts),
      has_ai_ledger:    entry.files.has(AI_FILES.ledger),
      has_plan:         PLAN_FILES.some((p) => entry.files.has(p)),
    };
    }),
  );
  return out;
}
