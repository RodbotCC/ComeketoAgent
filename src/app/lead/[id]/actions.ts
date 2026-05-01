"use server";

import { revalidatePath } from "next/cache";
import {
  approvePlan,
  killPlan,
  pausePlan,
  getPlanById,
  updatePlanDay,
  replacePlanDays,
  setDayStatus,
} from "@/lib/plans-db";
import {
  generateSevenDayPlanForLead,
  refinePlanDay,
  refineWholePlan,
  type SevenDayPlan,
  type ApprovalStatus,
} from "@/lib/plan";
import { getSupabaseServer } from "@/lib/supabase";
import { codegenPlanForClose, type CodegenResult } from "@/lib/plan-to-close";
import { closeGetLeadFull } from "@/lib/close";
import { env } from "@/lib/env";
import { runHeartbeatForPlan, type HeartbeatReport } from "@/lib/heartbeat";
import { getSettings } from "@/lib/settings";

export async function generatePlanAction(formData: FormData) {
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) throw new Error("lead_id required");
  const r = await generateSevenDayPlanForLead(leadId);
  if (!r.ok) throw new Error(r.error);
  revalidatePath(`/lead/${leadId}`);
}

export async function approvePlanAction(formData: FormData) {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  await approvePlan(planId, "andre");
  revalidatePath(`/lead/${leadId}`);
}

export async function killPlanAction(formData: FormData) {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const reason = String(formData.get("reason") || "killed by operator");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  await killPlan(planId, reason);
  revalidatePath(`/lead/${leadId}`);
}

export async function pausePlanAction(formData: FormData) {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  await pausePlan(planId);
  revalidatePath(`/lead/${leadId}`);
}

export type RefineDayState = { ok: boolean; error?: string };

/** Hydrate a plan row from the DB into the SevenDayPlan shape. */
async function hydratePlan(planId: string): Promise<SevenDayPlan> {
  const row = (await getPlanById(planId)) as Record<string, unknown>;
  return {
    plan_id: String(row.id),
    close_lead_id: String(row.close_lead_id),
    cycle_started_at: String(row.cycle_started_at),
    generated_at: String(row.generated_at),
    based_on_snapshot_id: String(row.based_on_snapshot_id),
    status: row.status as SevenDayPlan["status"],
    primary_goal: row.primary_goal as SevenDayPlan["primary_goal"],
    goal_summary: String(row.goal_summary || ""),
    lead_state_summary: String(row.lead_state_summary || ""),
    known_facts: (row.known_facts as string[]) || [],
    unknowns: (row.unknowns as string[]) || [],
    best_next_question: String(row.best_next_question || ""),
    days: (row.days as SevenDayPlan["days"]) || [],
    stop_conditions: (row.stop_conditions as SevenDayPlan["stop_conditions"]) || [],
    approval_required: Boolean(row.approval_required),
  };
}

export async function refinePlanDayAction(
  prev: RefineDayState,
  formData: FormData
): Promise<RefineDayState> {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") || -1);
  const instruction = String(formData.get("instruction") || "");

  if (!planId || !leadId || dayIndex < 0) {
    return { ok: false, error: "plan_id, lead_id, day_index required" };
  }

  try {
    const plan = await hydratePlan(planId);
    const r = await refinePlanDay(plan, dayIndex, instruction);
    if (!r.ok) return { ok: false, error: r.error };

    await updatePlanDay(planId, dayIndex, r.day);
    revalidatePath(`/lead/${leadId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type RefinePlanState = { ok: boolean; error?: string };

/** Refine the entire plan based on a plain-English instruction. */
export async function refineWholePlanAction(
  prev: RefinePlanState,
  formData: FormData
): Promise<RefinePlanState> {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const instruction = String(formData.get("instruction") || "");
  if (!planId || !leadId) return { ok: false, error: "plan_id and lead_id required" };

  try {
    const plan = await hydratePlan(planId);
    const r = await refineWholePlan(plan, instruction);
    if (!r.ok) return { ok: false, error: r.error };

    // Replace days, plus update the top-level summary fields in one write.
    const sb = getSupabaseServer();
    const { error } = await sb
      .from("lead_plans")
      .update({
        primary_goal: r.plan.primary_goal,
        goal_summary: r.plan.goal_summary,
        lead_state_summary: r.plan.lead_state_summary,
        known_facts: r.plan.known_facts,
        unknowns: r.plan.unknowns,
        best_next_question: r.plan.best_next_question,
        days: r.plan.days,
        stop_conditions: r.plan.stop_conditions,
        // Refining resets the plan to draft so it gets re-approved.
        status: "draft",
        approved_at: null,
        approved_by: null,
      })
      .eq("id", planId);
    if (error) return { ok: false, error: `db update failed: ${error.message}` };

    revalidatePath(`/lead/${leadId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Set a single day's approval_status (used by right-click menu). */
export async function setDayStatusAction(formData: FormData) {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") || -1);
  const status = String(formData.get("status") || "") as ApprovalStatus;
  if (!planId || !leadId || dayIndex < 0) throw new Error("plan_id, lead_id, day_index required");
  if (!["not_ready", "needs_review", "approved", "sent", "skipped"].includes(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  await setDayStatus(planId, dayIndex, status);
  revalidatePath(`/lead/${leadId}`);
}

/**
 * Approve every needs_review day in the plan. Skips days that would fail
 * the NEPQ voice gate (§G4) — caller gets a count of skipped days back so
 * the UI can surface them.
 */
export async function approveAllDaysAction(
  prev: { ok: boolean; approved?: number; skipped?: number; error?: string },
  formData: FormData
): Promise<{ ok: boolean; approved?: number; skipped?: number; error?: string }> {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) return { ok: false, error: "plan_id and lead_id required" };

  try {
    const r = await approveAllDaysInternal(planId);
    revalidatePath(`/lead/${leadId}`);
    return { ok: true, approved: r.approved, skipped: r.skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function approveAllDaysInternal(planId: string): Promise<{ approved: number; skipped: number }> {
  const plan = await hydratePlan(planId);
  const { validateNepqVoice, hasBlockingViolation } = await import("@/lib/nepq");

  let approved = 0;
  let skipped = 0;
  for (let i = 0; i < plan.days.length; i++) {
    const d = plan.days[i];
    if (d.approval_status !== "needs_review") continue;
    const dayHasBlocking = d.required_actions.some((a) => {
      if (a.channel !== "email" && a.channel !== "sms") return false;
      const text = a.draft_seed || a.intent || "";
      return hasBlockingViolation(validateNepqVoice(text));
    });
    if (dayHasBlocking) {
      skipped += 1;
      continue;
    }
    await setDayStatus(planId, i, "approved");
    approved += 1;
  }
  return { approved, skipped };
}

/**
 * Combined "approve & run" — approve every voice-clean needs_review day
 * AND immediately fire a heartbeat sweep. The natural full-cycle flow:
 * operator reviewed, hit one button, Close gets writes (if mode allows),
 * report comes back inline.
 */
export async function approveAndRunAction(
  prev: {
    ok: boolean;
    approved?: number;
    skipped_voice?: number;
    report?: HeartbeatReport;
    execution_mode?: string;
    error?: string;
  },
  formData: FormData
): Promise<{
  ok: boolean;
  approved?: number;
  skipped_voice?: number;
  report?: HeartbeatReport;
  execution_mode?: string;
  error?: string;
}> {
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) return { ok: false, error: "plan_id and lead_id required" };

  try {
    const ar = await approveAllDaysInternal(planId);
    const settings = await getSettings();
    const report = await runHeartbeatForPlan(planId, "manual", settings.execution_mode);
    revalidatePath(`/lead/${leadId}`);
    return {
      ok: true,
      approved: ar.approved,
      skipped_voice: ar.skipped,
      report,
      execution_mode: settings.execution_mode,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Suppress "unused" lint for replacePlanDays — kept exported for future direct use.
export const _internalReplacePlanDays = replacePlanDays;

/** Fetch a Close-actions preview for the most recent plan + current Box. */
export async function getCloseCodegenPreview(planId: string): Promise<
  | { ok: true; preview: CodegenResult }
  | { ok: false; error: string }
> {
  try {
    const plan = await hydratePlan(planId);
    const box = await closeGetLeadFull(plan.close_lead_id);
    const preview = codegenPlanForClose({
      plan,
      box,
      andreUserId: env.CLOSE_USER_ID_ANDRE,
    });
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run a manual heartbeat sweep for one plan. Uses the Settings execution_mode. */
export async function runHeartbeatNowAction(
  planId: string,
  leadId: string
): Promise<{ ok: true; report: HeartbeatReport; execution_mode: string } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    const report = await runHeartbeatForPlan(planId, "manual", settings.execution_mode);
    revalidatePath(`/lead/${leadId}`);
    return { ok: true, report, execution_mode: settings.execution_mode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
