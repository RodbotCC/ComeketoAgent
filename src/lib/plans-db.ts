/**
 * Lead-plan persistence (Supabase). Server-only.
 *
 * The DB row column shape mirrors lib/plan.ts SevenDayPlan. Reads round-trip
 * cleanly through SevenDayPlan; writes accept either a freshly-generated
 * SevenDayPlan or a status update.
 */

import { getSupabaseServer } from "./supabase";
import type { SevenDayPlan, PlanStatus } from "./plan";
import { mirrorPlanToFile } from "./lead-plan-fs";

type Row = {
  id: string;
  close_lead_id: string;
  cycle_started_at: string;
  generated_at: string;
  based_on_snapshot_id: string;
  status: PlanStatus;
  primary_goal: SevenDayPlan["primary_goal"];
  goal_summary: string;
  lead_state_summary: string;
  known_facts: SevenDayPlan["known_facts"];
  unknowns: SevenDayPlan["unknowns"];
  best_next_question: string;
  days: SevenDayPlan["days"];
  stop_conditions: SevenDayPlan["stop_conditions"];
  approval_required: boolean;
  approved_at: string | null;
  approved_by: string | null;
  killed_at: string | null;
  killed_reason: string | null;
};

/** Phase 4 helper: fetch the latest row after a mutation and mirror to
 *  `harness/leads/.../plan.json`. Fire-and-forget — failures swallowed. */
async function refreshAndMirrorPlan(planId: string): Promise<void> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("lead_plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (error || !data) return;
    void mirrorPlanToFile(rowToPlan(data as Row));
  } catch {
    // swallow — mirror is best-effort during dual-write phase
  }
}

function rowToPlan(r: Row): SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
} {
  return {
    plan_id: r.id,
    close_lead_id: r.close_lead_id,
    cycle_started_at: r.cycle_started_at,
    generated_at: r.generated_at,
    based_on_snapshot_id: r.based_on_snapshot_id,
    status: r.status,
    primary_goal: r.primary_goal,
    goal_summary: r.goal_summary,
    lead_state_summary: r.lead_state_summary,
    known_facts: r.known_facts,
    unknowns: r.unknowns,
    best_next_question: r.best_next_question,
    days: r.days,
    stop_conditions: r.stop_conditions,
    approval_required: r.approval_required,
    approved_at: r.approved_at ?? undefined,
    approved_by: r.approved_by ?? undefined,
    killed_at: r.killed_at ?? undefined,
    killed_reason: r.killed_reason ?? undefined,
  };
}

export async function savePlan(plan: SevenDayPlan): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb.from("lead_plans").insert({
    id: plan.plan_id,
    close_lead_id: plan.close_lead_id,
    cycle_started_at: plan.cycle_started_at,
    generated_at: plan.generated_at,
    based_on_snapshot_id: plan.based_on_snapshot_id,
    status: plan.status,
    primary_goal: plan.primary_goal,
    goal_summary: plan.goal_summary,
    lead_state_summary: plan.lead_state_summary,
    known_facts: plan.known_facts,
    unknowns: plan.unknowns,
    best_next_question: plan.best_next_question,
    days: plan.days,
    stop_conditions: plan.stop_conditions,
    approval_required: plan.approval_required,
  });
  if (error) throw new Error(`savePlan failed: ${error.message}`);
  void mirrorPlanToFile(plan);
}

export async function getLatestPlanForLead(
  leadId: string
): Promise<ReturnType<typeof rowToPlan> | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_plans")
    .select("*")
    .eq("close_lead_id", leadId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestPlanForLead failed: ${error.message}`);
  if (!data) return null;
  return rowToPlan(data as Row);
}

export async function listPlansForLead(
  leadId: string,
  limit = 10
): Promise<Array<ReturnType<typeof rowToPlan>>> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_plans")
    .select("*")
    .eq("close_lead_id", leadId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listPlansForLead failed: ${error.message}`);
  return ((data as Row[]) ?? []).map(rowToPlan);
}

/**
 * Recent active plans for the Proposals workbench. This intentionally scans
 * plan JSON in app code because day/touch status lives inside `days`.
 */
export async function listPlansForProposalReview(
  limit = 80
): Promise<Array<ReturnType<typeof rowToPlan>>> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_plans")
    .select("*")
    .in("status", ["draft", "approved", "active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listPlansForProposalReview failed: ${error.message}`);
  return ((data as Row[]) ?? []).map(rowToPlan);
}

export async function approvePlan(planId: string, approver: string): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("lead_plans")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approver,
    })
    .eq("id", planId);
  if (error) throw new Error(`approvePlan failed: ${error.message}`);
  void refreshAndMirrorPlan(planId);
}

export async function killPlan(planId: string, reason: string): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("lead_plans")
    .update({
      status: "killed",
      killed_at: new Date().toISOString(),
      killed_reason: reason || "(no reason)",
    })
    .eq("id", planId);
  if (error) throw new Error(`killPlan failed: ${error.message}`);
  void refreshAndMirrorPlan(planId);
}

export async function pausePlan(planId: string): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("lead_plans")
    .update({ status: "paused" })
    .eq("id", planId);
  if (error) throw new Error(`pausePlan failed: ${error.message}`);
  void refreshAndMirrorPlan(planId);
}

/**
 * Append one `required_action` to a day. Sets `approval_status` to `needs_review` so multi-touch edits surface in the queue.
 */
export async function appendRequiredActionToPlanDay(
  planId: string,
  dayIndex: number,
  touch: import("./plan").PlannedTouchpoint
): Promise<void> {
  const sb = getSupabaseServer();
  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("days")
    .eq("id", planId)
    .single();
  if (readErr) throw new Error(`appendRequiredActionToPlanDay read failed: ${readErr.message}`);
  const days = ((row as { days: import("./plan").SevenDayPlanDay[] }).days ?? []).slice();
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error(`appendRequiredActionToPlanDay: day index ${dayIndex} out of range (have ${days.length})`);
  }
  const d = days[dayIndex];
  days[dayIndex] = {
    ...d,
    required_actions: [...d.required_actions, touch],
    approval_status: "needs_review",
  };
  const { error: writeErr } = await sb.from("lead_plans").update({ days }).eq("id", planId);
  if (writeErr) throw new Error(`appendRequiredActionToPlanDay write failed: ${writeErr.message}`);
  void refreshAndMirrorPlan(planId);
}

/**
 * Edit a single touch in place (at a given day + touch index). Used by the
 * day-card modal inline editor — operator changes channel / intent / draft
 * without going through AI refinement. Bumps approval_status to needs_review
 * since the operator just changed the contract.
 */
export async function editPlanDayTouch(
  planId: string,
  dayIndex: number,
  touchIndex: number,
  touch: import("./plan").PlannedTouchpoint
): Promise<void> {
  const sb = getSupabaseServer();
  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("days")
    .eq("id", planId)
    .single();
  if (readErr) throw new Error(`editPlanDayTouch read failed: ${readErr.message}`);
  const days = ((row as { days: import("./plan").SevenDayPlanDay[] }).days ?? []).slice();
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error(`editPlanDayTouch: day index ${dayIndex} out of range (have ${days.length})`);
  }
  const d = days[dayIndex];
  if (touchIndex < 0 || touchIndex >= d.required_actions.length) {
    throw new Error(`editPlanDayTouch: touch index ${touchIndex} out of range (have ${d.required_actions.length})`);
  }
  const newActions = [...d.required_actions];
  newActions[touchIndex] = touch;
  days[dayIndex] = {
    ...d,
    required_actions: newActions,
    approval_status: "needs_review",
  };
  const { error: writeErr } = await sb.from("lead_plans").update({ days }).eq("id", planId);
  if (writeErr) throw new Error(`editPlanDayTouch write failed: ${writeErr.message}`);
  void refreshAndMirrorPlan(planId);
}

/**
 * Delete one touch from a day. Used by the day-card modal when the operator
 * removes a planned action. Bumps approval_status to needs_review.
 */
export async function deletePlanDayTouch(
  planId: string,
  dayIndex: number,
  touchIndex: number
): Promise<void> {
  const sb = getSupabaseServer();
  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("days")
    .eq("id", planId)
    .single();
  if (readErr) throw new Error(`deletePlanDayTouch read failed: ${readErr.message}`);
  const days = ((row as { days: import("./plan").SevenDayPlanDay[] }).days ?? []).slice();
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error(`deletePlanDayTouch: day index ${dayIndex} out of range`);
  }
  const d = days[dayIndex];
  if (touchIndex < 0 || touchIndex >= d.required_actions.length) {
    throw new Error(`deletePlanDayTouch: touch index ${touchIndex} out of range`);
  }
  const newActions = d.required_actions.filter((_, i) => i !== touchIndex);
  days[dayIndex] = {
    ...d,
    required_actions: newActions,
    approval_status: "needs_review",
  };
  const { error: writeErr } = await sb.from("lead_plans").update({ days }).eq("id", planId);
  if (writeErr) throw new Error(`deletePlanDayTouch write failed: ${writeErr.message}`);
  void refreshAndMirrorPlan(planId);
}

/**
 * Replace one day in a plan's `days` array. Used by the per-day AI
 * refinement flow: the LLM regenerates a single day from the user's
 * instruction; everything else stays.
 */
export async function updatePlanDay(
  planId: string,
  dayIndex: number,
  newDay: import("./plan").SevenDayPlanDay
): Promise<void> {
  const sb = getSupabaseServer();
  // Read current days, splice in the new one, write back.
  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("days")
    .eq("id", planId)
    .single();
  if (readErr) throw new Error(`updatePlanDay read failed: ${readErr.message}`);
  const days = ((row as { days: import("./plan").SevenDayPlanDay[] }).days ?? []).slice();
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error(`updatePlanDay: day index ${dayIndex} out of range (have ${days.length})`);
  }
  days[dayIndex] = newDay;
  const { error: writeErr } = await sb
    .from("lead_plans")
    .update({ days })
    .eq("id", planId);
  if (writeErr) throw new Error(`updatePlanDay write failed: ${writeErr.message}`);
  void refreshAndMirrorPlan(planId);
}

export async function getPlanById(planId: string) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (error) throw new Error(`getPlanById failed: ${error.message}`);
  return data;
}

/** Replace a plan's full days[] in one write (used by whole-plan refine). */
export async function replacePlanDays(
  planId: string,
  days: import("./plan").SevenDayPlanDay[]
): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb.from("lead_plans").update({ days }).eq("id", planId);
  if (error) throw new Error(`replacePlanDays failed: ${error.message}`);
  void refreshAndMirrorPlan(planId);
}

/** Update a single day's approval_status in place. */
export async function setDayStatus(
  planId: string,
  dayIndex: number,
  status: import("./plan").ApprovalStatus
): Promise<void> {
  const sb = getSupabaseServer();
  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("days")
    .eq("id", planId)
    .single();
  if (readErr) throw new Error(`setDayStatus read failed: ${readErr.message}`);
  const days = ((row as { days: import("./plan").SevenDayPlanDay[] }).days ?? []).slice();
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error(`setDayStatus: day index ${dayIndex} out of range`);
  }
  days[dayIndex] = { ...days[dayIndex], approval_status: status };
  const { error: writeErr } = await sb.from("lead_plans").update({ days }).eq("id", planId);
  if (writeErr) throw new Error(`setDayStatus write failed: ${writeErr.message}`);
  void refreshAndMirrorPlan(planId);
}

function planHasNeedsReviewDay(r: Row): boolean {
  return (r.days || []).some((d) => d.approval_status === "needs_review");
}

/**
 * Recent plans that might contain `needs_review` days (same window as list/count queue).
 * Capped at 120 by generated_at — very old pending rows beyond the window won't appear in counts.
 */
async function fetchPlansEligibleForReviewScan(): Promise<Row[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_plans")
    .select("*")
    .in("status", ["draft", "approved", "active"])
    .order("generated_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(`fetchPlansEligibleForReviewScan failed: ${error.message}`);
  return (data as Row[]) ?? [];
}

/** Count plans with at least one day in `needs_review` (within scan window). */
export async function countPlansNeedingReview(): Promise<number> {
  const rows = await fetchPlansEligibleForReviewScan();
  return rows.filter(planHasNeedsReviewDay).length;
}

export async function countPlansWithStatus(status: PlanStatus): Promise<number> {
  const sb = getSupabaseServer();
  const { count, error } = await sb
    .from("lead_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (error) throw new Error(`countPlansWithStatus failed: ${error.message}`);
  return count ?? 0;
}

/** Plans with at least one day in needs_review (approval queue). */
export async function listPlansNeedingReview(limit = 40): Promise<Row[]> {
  const rows = await fetchPlansEligibleForReviewScan();
  const filtered: Row[] = [];
  for (const r of rows) {
    if (planHasNeedsReviewDay(r)) {
      filtered.push(r);
      if (filtered.length >= limit) break;
    }
  }
  return filtered;
}
