/**
 * Execution + approval audit (Guardrails §O, §I).
 *
 * Phase 6 of harness/ overhaul (2026-05-05): Supabase is OUT. Writes go
 * directly to the harness file tree:
 *   - execution_log → harness/ledger/YYYY-MM-DD.jsonl
 *   - approval_audit → harness/approvals/YYYY-MM.jsonl
 * Reads go through harness-ledger.ts and harness-approvals.ts respectively.
 *
 * Failures are swallowed where noted so audit never blocks primary flows.
 *
 * `lead_activity_touches` (single-row freshness signal updated on every
 * webhook) stays in Supabase as auxiliary memory — too high-frequency for
 * git-backed storage.
 */

import { getSupabaseServer } from "./supabase";
import {
  appendLedger,
  listExecutionGlobal as ledgerListGlobal,
  listExecutionForLead as ledgerListForLead,
  listExecutionByKind as ledgerListByKind,
  listExecutionByTraceId as ledgerListByTraceId,
  getLatestSkipForPlan as ledgerGetLatestSkipForPlan,
  type LedgerRow,
} from "./harness-ledger";
import { appendApprovalAudit } from "./harness-approvals";

export const EXECUTION_LOG_KINDS = [
  "heartbeat_run",
  "close_write",
  "delegations_close_tool",
  "plan_paused_stale",
  "approve_plan",
  "kill_plan",
  "pause_plan",
  "generate_plan",
  "approve_run",
  "manual_heartbeat",
  "reject_plan_queue",
  "enroll_workflow",
  "publish_automation_draft",
  "intake_extract",
  "asset_library",
  "pause_subscription",
  "resume_subscription",
  "add_plan_day_touch",
  "webhook_ingest",
  "mcp_fallback",
  "refine_plan_day",
  "refine_whole_plan",
  "day_status_change",
  "regenerate_client_box_docs",
  "sweep_lead_box",
  "run_lead_box_workflow",
  "append_client_ledger",
] as const;

export type ExecutionLogKind = (typeof EXECUTION_LOG_KINDS)[number];

export function isExecutionLogKind(s: string): s is ExecutionLogKind {
  return (EXECUTION_LOG_KINDS as readonly string[]).includes(s);
}

export type LogExecutionInput = {
  action_kind: ExecutionLogKind;
  close_lead_id?: string | null;
  plan_id?: string | null;
  operator_id?: string | null;
  payload?: Record<string, unknown> | null;
  result?: "ok" | "error";
  skip_code?: string | null;
  trace_id?: string | null;
  snapshot_id_at_action?: string | null;
};

export async function logExecution(input: LogExecutionInput): Promise<void> {
  // Phase 6: file-canonical. Writes go directly to harness/ledger/.
  await appendLedger({
    at: new Date().toISOString(),
    action_kind: input.action_kind,
    close_lead_id: input.close_lead_id ?? null,
    plan_id: input.plan_id ?? null,
    operator_id: input.operator_id ?? null,
    payload: input.payload ?? null,
    result: input.result ?? "ok",
    skip_code: input.skip_code ?? null,
    trace_id: input.trace_id ?? null,
    snapshot_id_at_action: input.snapshot_id_at_action ?? null,
  });
}

export type ApprovalAuditInput = {
  plan_id: string;
  day_index?: number | null;
  from_status: string;
  to_status: string;
  actor?: string | null;
  reason?: string | null;
  based_on_snapshot_id?: string | null;
};

export async function logApprovalChange(input: ApprovalAuditInput): Promise<void> {
  await appendApprovalAudit({
    at: new Date().toISOString(),
    plan_id: input.plan_id,
    day_index: input.day_index ?? null,
    from_status: input.from_status,
    to_status: input.to_status,
    actor: input.actor ?? null,
    reason: input.reason ?? null,
    based_on_snapshot_id: input.based_on_snapshot_id ?? null,
  });
}

/** UI-facing row shape preserved across the migration. The harness ledger
 *  emits `LedgerRow`s; this helper adapts them to the legacy shape so
 *  callers (`/console`, briefing, lead activity) don't need to change. */
export type ExecutionLogRow = {
  id: string;
  at: string;
  action_kind: string;
  close_lead_id: string | null;
  plan_id: string | null;
  payload: unknown;
  result: string;
  skip_code: string | null;
  trace_id: string | null;
  snapshot_id_at_action: string | null;
};

function rowFromLedger(r: LedgerRow): ExecutionLogRow {
  return {
    // The ledger has no id (JSONL is append-only and rows are content-keyed).
    // Synthesize a stable-ish id from at + trace + kind so React keys work.
    id: `${r.at}__${r.trace_id ?? "no-trace"}__${r.action_kind}`,
    at: r.at,
    action_kind: r.action_kind,
    close_lead_id: r.close_lead_id ?? null,
    plan_id: r.plan_id ?? null,
    payload: r.payload ?? null,
    result: r.result ?? "ok",
    skip_code: r.skip_code ?? null,
    trace_id: r.trace_id ?? null,
    snapshot_id_at_action: r.snapshot_id_at_action ?? null,
  };
}

export async function listRecentExecutionForLead(
  leadId: string,
  limit = 12,
): Promise<ExecutionLogRow[]> {
  const rows = await ledgerListForLead(leadId, limit);
  return rows.map(rowFromLedger);
}

export async function listRecentExecutionGlobal(limit = 40): Promise<ExecutionLogRow[]> {
  const rows = await ledgerListGlobal(limit);
  return rows.map(rowFromLedger);
}

export async function listExecutionByKind(
  kind: ExecutionLogKind,
  limit = 80,
): Promise<ExecutionLogRow[]> {
  const rows = await ledgerListByKind(kind, limit);
  return rows.map(rowFromLedger);
}

export async function listExecutionByTraceId(
  traceId: string,
  limit = 80,
): Promise<ExecutionLogRow[]> {
  const tid = traceId.trim();
  if (!tid) return [];
  const rows = await ledgerListByTraceId(tid, limit);
  return rows.map(rowFromLedger);
}

/** Upsert lead freshness bump (webhook path). Stays in Supabase as
 *  auxiliary memory — too high-frequency for git. */
export async function touchLeadActivity(leadId: string): Promise<void> {
  if (!leadId?.trim()) return;
  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("lead_activity_touches").upsert(
      { lead_id: leadId.trim(), bumped_at: new Date().toISOString() },
      { onConflict: "lead_id" },
    );
    if (error) {
      console.error("[lead_activity_touches] upsert failed", error.message);
    }
  } catch (e) {
    console.error("[lead_activity_touches] exception", e);
  }
}

export async function getLeadActivityBumpedAt(leadId: string): Promise<string | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_activity_touches")
    .select("bumped_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) return null;
  return (data as { bumped_at?: string } | null)?.bumped_at ?? null;
}

/** Latest row with a skip_code for this plan (approvals queue / explainability). */
export async function getLatestExecutionSkipForPlan(
  planId: string,
): Promise<{ skip_code: string; at: string } | null> {
  const row = await ledgerGetLatestSkipForPlan(planId);
  if (!row || !row.skip_code || !row.at) return null;
  return { skip_code: row.skip_code, at: row.at };
}
