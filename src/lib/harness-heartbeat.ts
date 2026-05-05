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

