/**
 * Lead-plan persistence — file-canonical (Phase 6 of harness/ overhaul, 2026-05-05).
 *
 * Plans live at `harness/leads/{lead_id}__{slug}/plan.json`. Reads and writes
 * go through Octokit against `branch=GITHUB_LEADS_BRANCH`. Supabase
 * `lead_plans` table is no longer used.
 *
 * Cross-plan operations (proposal review, count by status) iterate every
 * lead's plan.json. At our volume (~50 leads) this is a few seconds per
 * call worst case; callers cache where appropriate. If volume grows past
 * a few hundred, rebuild a `harness/catalog/plans-active.json` rollup.
 *
 * The exported function signatures mirror the old Supabase-backed API so
 * all UI consumers stay unchanged. The "Row" type is kept for back-compat
 * — it now describes the shape returned by readers, derived from plan.json.
 */

import type { SevenDayPlan, PlanStatus } from "./plan";
import {
  mirrorPlanToFile,
  readPlanFromFile,
  listAllPlans,
  getPlanByIdFromFiles,
  mutatePlan,
} from "./lead-plan-fs";

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

type PlanWithMeta = SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
};

/** Adapter: a read PlanWithMeta into the legacy Row shape used by the queue
 *  pages and a few internal helpers. */
function planToRow(p: PlanWithMeta): Row {
  return {
    id: p.plan_id,
    close_lead_id: p.close_lead_id,
    cycle_started_at: p.cycle_started_at,
    generated_at: p.generated_at,
    based_on_snapshot_id: p.based_on_snapshot_id,
    status: p.status,
    primary_goal: p.primary_goal,
    goal_summary: p.goal_summary,
    lead_state_summary: p.lead_state_summary,
    known_facts: p.known_facts,
    unknowns: p.unknowns,
    best_next_question: p.best_next_question,
    days: p.days,
    stop_conditions: p.stop_conditions,
    approval_required: p.approval_required,
    approved_at: p.approved_at ?? null,
    approved_by: p.approved_by ?? null,
    killed_at: p.killed_at ?? null,
    killed_reason: p.killed_reason ?? null,
  };
}

function rowToPlan(r: Row): PlanWithMeta {
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

void rowToPlan; // exported back-compat shape converter; kept for callers

export async function savePlan(plan: SevenDayPlan): Promise<void> {
  await mirrorPlanToFile(plan as PlanWithMeta);
}

export async function getLatestPlanForLead(
  leadId: string,
): Promise<PlanWithMeta | null> {
  return readPlanFromFile(leadId);
}

export async function listPlansForLead(
  leadId: string,
  _limit = 10,
): Promise<PlanWithMeta[]> {
  void _limit;
  // Phase 6: only the current plan is mirrored to file. Historical plans
  // live in Supabase if at all (orphaned). Return [latest] or [].
  const latest = await readPlanFromFile(leadId);
  return latest ? [latest] : [];
}

/** Recent active plans for the Proposals workbench. Iterates active lead
 *  folders. */
export async function listPlansForProposalReview(
  limit = 80,
): Promise<PlanWithMeta[]> {
  const all = await listAllPlans({
    state: "active",
    filterStatus: ["draft", "approved", "active", "paused"],
    limit,
  });
  return all;
}

export async function approvePlan(
  planId: string,
  approver: string,
): Promise<void> {
  await mutatePlan(planId, (p) => ({
    ...p,
    status: "approved" as PlanStatus,
    approved_at: new Date().toISOString(),
    approved_by: approver,
  }));
}

export async function killPlan(planId: string, reason: string): Promise<void> {
  await mutatePlan(planId, (p) => ({
    ...p,
    status: "killed" as PlanStatus,
    killed_at: new Date().toISOString(),
    killed_reason: reason || "(no reason)",
  }));
}

export async function pausePlan(planId: string): Promise<void> {
  await mutatePlan(planId, (p) => ({
    ...p,
    status: "paused" as PlanStatus,
  }));
}

export async function appendRequiredActionToPlanDay(
  planId: string,
  dayIndex: number,
  touch: import("./plan").PlannedTouchpoint,
): Promise<void> {
  await mutatePlan(planId, (p) => {
    const days = p.days.slice();
    if (dayIndex < 0 || dayIndex >= days.length) {
      throw new Error(
        `appendRequiredActionToPlanDay: day index ${dayIndex} out of range (have ${days.length})`,
      );
    }
    const d = days[dayIndex]!;
    days[dayIndex] = {
      ...d,
      required_actions: [...d.required_actions, touch],
      approval_status: "needs_review",
    };
    return { ...p, days };
  });
}

export async function editPlanDayTouch(
  planId: string,
  dayIndex: number,
  touchIndex: number,
  touch: import("./plan").PlannedTouchpoint,
): Promise<void> {
  await mutatePlan(planId, (p) => {
    const days = p.days.slice();
    if (dayIndex < 0 || dayIndex >= days.length) {
      throw new Error(
        `editPlanDayTouch: day index ${dayIndex} out of range (have ${days.length})`,
      );
    }
    const d = days[dayIndex]!;
    if (touchIndex < 0 || touchIndex >= d.required_actions.length) {
      throw new Error(
        `editPlanDayTouch: touch index ${touchIndex} out of range (have ${d.required_actions.length})`,
      );
    }
    const newActions = [...d.required_actions];
    newActions[touchIndex] = touch;
    days[dayIndex] = {
      ...d,
      required_actions: newActions,
      approval_status: "needs_review",
    };
    return { ...p, days };
  });
}

export async function deletePlanDayTouch(
  planId: string,
  dayIndex: number,
  touchIndex: number,
): Promise<void> {
  await mutatePlan(planId, (p) => {
    const days = p.days.slice();
    if (dayIndex < 0 || dayIndex >= days.length) {
      throw new Error(`deletePlanDayTouch: day index ${dayIndex} out of range`);
    }
    const d = days[dayIndex]!;
    if (touchIndex < 0 || touchIndex >= d.required_actions.length) {
      throw new Error(`deletePlanDayTouch: touch index ${touchIndex} out of range`);
    }
    const newActions = d.required_actions.filter((_, i) => i !== touchIndex);
    days[dayIndex] = {
      ...d,
      required_actions: newActions,
      approval_status: "needs_review",
    };
    return { ...p, days };
  });
}

export async function updatePlanDay(
  planId: string,
  dayIndex: number,
  newDay: import("./plan").SevenDayPlanDay,
): Promise<void> {
  await mutatePlan(planId, (p) => {
    const days = p.days.slice();
    if (dayIndex < 0 || dayIndex >= days.length) {
      throw new Error(
        `updatePlanDay: day index ${dayIndex} out of range (have ${days.length})`,
      );
    }
    days[dayIndex] = newDay;
    return { ...p, days };
  });
}

export async function getPlanById(
  planId: string,
): Promise<PlanWithMeta | null> {
  return getPlanByIdFromFiles(planId);
}

export async function replacePlanDays(
  planId: string,
  days: import("./plan").SevenDayPlanDay[],
): Promise<void> {
  await mutatePlan(planId, (p) => ({ ...p, days }));
}

export async function setDayStatus(
  planId: string,
  dayIndex: number,
  status: import("./plan").ApprovalStatus,
): Promise<void> {
  await mutatePlan(planId, (p) => {
    const days = p.days.slice();
    if (dayIndex < 0 || dayIndex >= days.length) {
      throw new Error(`setDayStatus: day index ${dayIndex} out of range`);
    }
    days[dayIndex] = { ...days[dayIndex]!, approval_status: status };
    return { ...p, days };
  });
}

function planHasNeedsReviewDay(p: PlanWithMeta): boolean {
  return (p.days || []).some((d) => d.approval_status === "needs_review");
}

async function fetchPlansEligibleForReviewScan(): Promise<PlanWithMeta[]> {
  return listAllPlans({
    state: "active",
    filterStatus: ["draft", "approved", "active"],
    limit: 120,
  });
}

export async function countPlansNeedingReview(): Promise<number> {
  const plans = await fetchPlansEligibleForReviewScan();
  return plans.filter(planHasNeedsReviewDay).length;
}

export async function countPlansWithStatus(status: PlanStatus): Promise<number> {
  const plans = await listAllPlans({
    state: "active",
    filterStatus: [status],
    limit: 1000,
  });
  return plans.length;
}

/** Plans with at least one day in needs_review (approval queue). Returns
 *  Row shape for back-compat with existing UI consumers. */
export async function listPlansNeedingReview(limit = 40): Promise<Row[]> {
  const plans = await fetchPlansEligibleForReviewScan();
  const filtered: PlanWithMeta[] = [];
  for (const p of plans) {
    if (planHasNeedsReviewDay(p)) {
      filtered.push(p);
      if (filtered.length >= limit) break;
    }
  }
  return filtered.map(planToRow);
}
