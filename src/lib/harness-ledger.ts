/**
 * Global activity ledger (Phase 3 of harness/ overhaul, 2026-05-05).
 *
 * Mirrors every `logExecution` call into a per-UTC-day JSONL file at
 * `harness/ledger/YYYY-MM-DD.jsonl`. Append-only, greppable, diffable.
 *
 * v1 design: direct read-modify-write via Octokit Contents API with SHA-retry
 * on conflict. No inbox/compactor pattern — at our volume (~100-500 rows per
 * day) the simple path is fine. If commit volume becomes a concern, swap to
 * the inbox+compactor pattern documented in `harness/ledger/README.md`.
 *
 * Phase 3 ships dual-write: existing Supabase `execution_log` table still
 * receives the canonical row, this file is built up in parallel. Phase 6
 * drops the Supabase side.
 */

import type { Octokit } from "octokit";
import { env } from "./env";
import { getOctokit } from "./github";
import { logStructured } from "./observability";
import type { ExecutionLogKind } from "./execution-audit";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

const RETRY_DELAYS_MS = [80, 240, 600];

/** Shape of a row in `harness/ledger/YYYY-MM-DD.jsonl`. Mirrors the
 *  execution_log Supabase row (with `at` and `kind` instead of
 *  `created_at`/`action_kind` — terser for grep). */
export type LedgerRow = {
  at: string;
  action_kind: ExecutionLogKind | string;
  close_lead_id?: string | null;
  plan_id?: string | null;
  operator_id?: string | null;
  payload?: Record<string, unknown> | null;
  result?: "ok" | "error";
  skip_code?: string | null;
  trace_id?: string | null;
  snapshot_id_at_action?: string | null;
};

/** Append one row to today's ledger file. Caller can fire-and-forget — any
 *  failure logs a warning but does not throw. SHA-retry handles concurrent
 *  writers (3 attempts at 80/240/600ms backoff = <1s total). */
export async function appendLedger(row: LedgerRow): Promise<void> {
  // Stamp `at` if caller didn't.
  const completeRow: LedgerRow = {
    at: row.at ?? new Date().toISOString(),
    action_kind: row.action_kind,
    close_lead_id: row.close_lead_id ?? null,
    plan_id: row.plan_id ?? null,
    operator_id: row.operator_id ?? null,
    payload: row.payload ?? null,
    result: row.result ?? "ok",
    skip_code: row.skip_code ?? null,
    trace_id: row.trace_id ?? null,
    snapshot_id_at_action: row.snapshot_id_at_action ?? null,
  };

  const path = ledgerPathForDate(new Date(completeRow.at));
  const line = JSON.stringify(completeRow) + "\n";

  if (!env.GITHUB_PAT) {
    // Dev or misconfigured envs without a token — skip silently. Supabase
    // still has the row from the dual-write call upstream.
    return;
  }

  const octo = getOctokit();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const existing = await readFileWithSha(octo, path);
      const newContent = (existing?.content ?? "") + line;
      await octo.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        message: `ledger: ${completeRow.action_kind}${completeRow.close_lead_id ? ` (${completeRow.close_lead_id.slice(0, 16)})` : ""}`,
        content: Buffer.from(newContent, "utf-8").toString("base64"),
        sha: existing?.sha,
        branch: REPO_BRANCH,
      });
      return;
    } catch (e: unknown) {
      lastError = e;
      const status = (e as { status?: number }).status;
      if (status === 409 || status === 422) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          await sleep(delay);
          continue;
        }
      }
      // Non-retryable or out of retries — log and stop. Caller should
      // not break on ledger failures.
      logStructured("warn", "harness.ledger", "appendLedger failed", {
        path,
        action_kind: completeRow.action_kind,
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }
  logStructured("warn", "harness.ledger", "appendLedger exhausted retries", {
    path,
    action_kind: completeRow.action_kind,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

/** Read every row from a single day's ledger file. */
export async function readLedgerDay(date: Date): Promise<LedgerRow[]> {
  const path = ledgerPathForDate(date);
  if (!env.GITHUB_PAT) return [];
  const octo = getOctokit();
  const file = await readFileWithSha(octo, path);
  if (!file) return [];
  return parseJsonl(file.content);
}

/** Read the last `limit` rows across the most-recent days. Reads today
 *  first, then yesterday, etc., until limit is satisfied or N days back. */
export async function readRecentLedger(limit = 100, daysBack = 3): Promise<LedgerRow[]> {
  const out: LedgerRow[] = [];
  const today = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const rows = await readLedgerDay(d);
    // Newest-first within a day: `at` is ISO-8601 so lexical sort works.
    rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    out.push(...rows);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Filter pre-loaded rows to a single lead. Pure helper. */
export function filterLedgerByLead(rows: LedgerRow[], leadId: string): LedgerRow[] {
  return rows.filter((r) => r.close_lead_id === leadId);
}

/** Read recent rows globally (replaces Supabase listRecentExecutionGlobal). */
export async function listExecutionGlobal(limit = 40): Promise<LedgerRow[]> {
  return readRecentLedger(limit, 7);
}

/** Filter recent rows by lead. Replaces Supabase listRecentExecutionForLead. */
export async function listExecutionForLead(
  leadId: string,
  limit = 50,
): Promise<LedgerRow[]> {
  const rows = await readRecentLedger(500, 14);
  return filterLedgerByLead(rows, leadId).slice(0, limit);
}

/** Filter by action_kind. Replaces Supabase listExecutionByKind. */
export async function listExecutionByKind(
  kind: string,
  limit = 60,
): Promise<LedgerRow[]> {
  const rows = await readRecentLedger(500, 14);
  return rows.filter((r) => r.action_kind === kind).slice(0, limit);
}

/** Filter by trace_id. Replaces Supabase listExecutionByTraceId. */
export async function listExecutionByTraceId(
  traceId: string,
  limit = 80,
): Promise<LedgerRow[]> {
  const rows = await readRecentLedger(500, 14);
  return rows.filter((r) => r.trace_id === traceId).slice(0, limit);
}

/** Most-recent skip row for a plan (replaces Supabase
 *  getLatestExecutionSkipForPlan). Used by heartbeat to detect repeated
 *  skip patterns. */
export async function getLatestSkipForPlan(
  planId: string,
): Promise<LedgerRow | null> {
  const rows = await readRecentLedger(300, 7);
  return (
    rows.find(
      (r) => r.plan_id === planId && r.skip_code != null && r.skip_code !== "",
    ) ?? null
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function ledgerPathForDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `harness/ledger/${yyyy}-${mm}-${dd}.jsonl`;
}

async function readFileWithSha(
  octo: Octokit,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string; sha?: string };
    if (!data.content || data.encoding !== "base64" || !data.sha) return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

function parseJsonl(text: string): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // Skip malformed lines; ledger should be append-only but a partial
      // write could corrupt one row. Don't let one bad line break the read.
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const __TEST_ONLY = {
  ledgerPathForDate,
  parseJsonl,
};
