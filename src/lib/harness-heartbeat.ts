/**
 * Heartbeat run snapshots (Phase 5 of harness/ overhaul, 2026-05-05).
 *
 * Writes one JSON file per heartbeat run to
 * `harness/heartbeat/YYYY-MM-DD/{run_id}.json`. Mirrors the Supabase
 * `heartbeat_runs` table during the dual-write phase. Phase 6 cuts over.
 *
 * Run-snapshots are large-ish (full per-day verdict reports), so they get
 * one file per run rather than appending to a daily JSONL like the main
 * ledger.
 */

import { logStructured } from "./observability";
import { env } from "./env";
import { getOctokit } from "./github";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

export type HeartbeatRunSnapshot = {
  run_id: string;
  at: string;
  scope: "lead" | "all" | "manual";
  plan_id?: string | null;
  close_lead_id?: string | null;
  snapshot_match?: boolean;
  plan_was_stale?: boolean;
  actions_eligible: number;
  actions_fired: number;
  actions_skipped: number;
  skip_breakdown: Record<string, number>;
  report: unknown;
  duration_ms: number;
  trigger?: string | null;
  trace_id?: string | null;
};

/** Fire-and-forget writer. Caller does NOT await — failures swallowed. */
export async function writeHeartbeatRunSnapshot(
  snap: HeartbeatRunSnapshot,
): Promise<void> {
  if (!env.GITHUB_PAT) return;
  const path = heartbeatRunPath(snap);
  const content = JSON.stringify(snap, null, 2) + "\n";

  const octo = getOctokit();
  try {
    // First-write semantics: heartbeat run files are immutable once written
    // (one file per unique run_id). No SHA needed for create. If a duplicate
    // somehow arrives, the second write 422s and is ignored.
    await octo.rest.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      message: `heartbeat: ${snap.scope} run ${snap.run_id.slice(-8)} (${snap.actions_fired}f/${snap.actions_skipped}s)`,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: REPO_BRANCH,
    });
  } catch (e) {
    logStructured("warn", "harness.heartbeat", "writeHeartbeatRunSnapshot failed", {
      run_id: snap.run_id,
      path,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function heartbeatRunPath(snap: HeartbeatRunSnapshot): string {
  const d = new Date(snap.at);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `harness/heartbeat/${yyyy}-${mm}-${dd}/${snap.run_id}.json`;
}

function heartbeatDayDir(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `harness/heartbeat/${yyyy}-${mm}-${dd}`;
}

/** List heartbeat run snapshots for a single UTC day. */
export async function listHeartbeatRunsForDay(date: Date): Promise<HeartbeatRunSnapshot[]> {
  if (!env.GITHUB_PAT) return [];
  const octo = getOctokit();
  const dir = heartbeatDayDir(date);
  let entries: { path: string }[] = [];
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
        it.type === "file" &&
        "path" in it &&
        typeof it.path === "string" &&
        it.path.endsWith(".json")
      ) {
        entries.push({ path: it.path });
      }
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return [];
    throw e;
  }

  const out: HeartbeatRunSnapshot[] = [];
  let cursor = 0;
  const lanes = Math.min(8, entries.length);
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
          path: entry.path,
          ref: REPO_BRANCH,
        });
        const data = r.data as { content?: string; encoding?: string };
        if (!data.content || data.encoding !== "base64") continue;
        const text = Buffer.from(data.content, "base64").toString("utf-8");
        out.push(JSON.parse(text) as HeartbeatRunSnapshot);
      } catch {
        // skip unreadable file
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return out;
}

/** Most recent N heartbeat runs across the past M days. */
export async function listRecentHeartbeatRuns(
  limit = 40,
  daysBack = 3,
): Promise<HeartbeatRunSnapshot[]> {
  const out: HeartbeatRunSnapshot[] = [];
  const today = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const rows = await listHeartbeatRunsForDay(d);
    out.push(...rows);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Find a heartbeat run by id. Scans recent days. Slow path — only used
 *  by the run-detail page. */
export async function getHeartbeatRunByIdFromFiles(
  id: string,
  daysBack = 14,
): Promise<HeartbeatRunSnapshot | null> {
  const today = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const rows = await listHeartbeatRunsForDay(d);
    const hit = rows.find((r) => r.run_id === id);
    if (hit) return hit;
  }
  return null;
}

/** Aggregate over runs in the last N hours (default 24). Used by the
 *  /heartbeat dashboard KPI strip. Counts only `scope='lead'` runs to
 *  avoid double-counting sweep summaries. */
export async function aggregateRecentHeartbeat(hoursBack = 24): Promise<{
  sweep_summary_count: number;
  lead_run_count: number;
  total_actions_eligible: number;
  total_actions_fired: number;
  total_actions_skipped: number;
  top_skip_codes: Array<{ code: string; count: number }>;
  earliest_ran_at: string | null;
  latest_ran_at: string | null;
}> {
  const since = Date.now() - hoursBack * 60 * 60 * 1000;
  // Read enough days to cover the window
  const daysBack = Math.max(1, Math.ceil(hoursBack / 24) + 1);
  const all = await listRecentHeartbeatRuns(2000, daysBack);
  const rows = all.filter((r) => new Date(r.at).getTime() >= since);

  let leadRuns = 0;
  let sweepSummaries = 0;
  let elig = 0;
  let fired = 0;
  let skipped = 0;
  const skipMap: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const r of rows) {
    if (r.scope === "all") sweepSummaries += 1;
    else {
      leadRuns += 1;
      elig += r.actions_eligible || 0;
      fired += r.actions_fired || 0;
      skipped += r.actions_skipped || 0;
      for (const [code, n] of Object.entries(r.skip_breakdown ?? {})) {
        skipMap[code] = (skipMap[code] ?? 0) + (n as number);
      }
    }
    if (!earliest || r.at < earliest) earliest = r.at;
    if (!latest || r.at > latest) latest = r.at;
  }

  const top_skip_codes = Object.entries(skipMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, count]) => ({ code, count }));

  return {
    sweep_summary_count: sweepSummaries,
    lead_run_count: leadRuns,
    total_actions_eligible: elig,
    total_actions_fired: fired,
    total_actions_skipped: skipped,
    top_skip_codes,
    earliest_ran_at: earliest,
    latest_ran_at: latest,
  };
}

