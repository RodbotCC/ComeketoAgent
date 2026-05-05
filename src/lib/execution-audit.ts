/**
 * Single writer for execution_log + approval_audit (Guardrails §O, §I).
 * Failures are swallowed where noted so audit never blocks primary flows.
 */

import { getSupabaseServer } from "./supabase";

export const EXECUTION_LOG_KINDS = [
  "heartbeat_run",
  "close_write",
  "delegations_close_tool",
  "plan_paused_stale",
  "approve_plan",
  "kill_plan",
  "pause_plan",
  "generate_plan",
  "enroll_workflow",
  "webhook_ingest",
  "refine_plan_day",
  "refine_whole_plan",
  "day_status_change",
  "approve_run",
  "manual_heartbeat",
  "reject_plan_queue",
  "intake_extract",
  "pause_subscription",
  "resume_subscription",
  "publish_automation_draft",
  "add_plan_day_touch",
  "mcp_fallback",
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
  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("execution_log").insert({
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
    if (error) {
      console.error("[execution-audit] insert failed", error.message);
    }
  } catch (e) {
    console.error("[execution-audit] insert exception", e);
  }
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
  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("approval_audit").insert({
      plan_id: input.plan_id,
      day_index: input.day_index ?? null,
      from_status: input.from_status,
      to_status: input.to_status,
      actor: input.actor ?? null,
      reason: input.reason ?? null,
      based_on_snapshot_id: input.based_on_snapshot_id ?? null,
    });
    if (error) {
      console.error("[approval-audit] insert failed", error.message);
    }
  } catch (e) {
    console.error("[approval-audit] insert exception", e);
  }
}

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

export async function listRecentExecutionForLead(
  leadId: string,
  limit = 12
): Promise<ExecutionLogRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("execution_log")
    .select(
      "id, at, action_kind, close_lead_id, plan_id, payload, result, skip_code, trace_id, snapshot_id_at_action"
    )
    .eq("close_lead_id", leadId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentExecutionForLead: ${error.message}`);
  return (data as ExecutionLogRow[]) ?? [];
}

/** Org-wide recent execution log rows (operator console / demo tail). */
export async function listRecentExecutionGlobal(limit = 40): Promise<ExecutionLogRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("execution_log")
    .select(
      "id, at, action_kind, close_lead_id, plan_id, payload, result, skip_code, trace_id, snapshot_id_at_action"
    )
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentExecutionGlobal: ${error.message}`);
  return (data as ExecutionLogRow[]) ?? [];
}

/** All recent log rows for a single action_kind (console kind filter). */
export async function listExecutionByKind(
  kind: ExecutionLogKind,
  limit = 80
): Promise<ExecutionLogRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("execution_log")
    .select(
      "id, at, action_kind, close_lead_id, plan_id, payload, result, skip_code, trace_id, snapshot_id_at_action"
    )
    .eq("action_kind", kind)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listExecutionByKind: ${error.message}`);
  return (data as ExecutionLogRow[]) ?? [];
}

/** All log rows for a delegations/chat trace_id (console deep-link). */
export async function listExecutionByTraceId(traceId: string, limit = 80): Promise<ExecutionLogRow[]> {
  const tid = traceId.trim();
  if (!tid) return [];
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("execution_log")
    .select(
      "id, at, action_kind, close_lead_id, plan_id, payload, result, skip_code, trace_id, snapshot_id_at_action"
    )
    .eq("trace_id", tid)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listExecutionByTraceId: ${error.message}`);
  return (data as ExecutionLogRow[]) ?? [];
}

/** Upsert lead freshness bump (webhook path). */
export async function touchLeadActivity(leadId: string): Promise<void> {
  if (!leadId?.trim()) return;
  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("lead_activity_touches").upsert(
      { lead_id: leadId.trim(), bumped_at: new Date().toISOString() },
      { onConflict: "lead_id" }
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
  planId: string
): Promise<{ skip_code: string; at: string } | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("execution_log")
    .select("skip_code, at")
    .eq("plan_id", planId)
    .not("skip_code", "is", null)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { skip_code?: string; at?: string };
  if (!row.skip_code || !row.at) return null;
  return { skip_code: row.skip_code, at: row.at };
}
