"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  approvePlan,
  killPlan,
  pausePlan,
  getPlanById,
  updatePlanDay,
  replacePlanDays,
  setDayStatus,
  appendRequiredActionToPlanDay,
  editPlanDayTouch,
  deletePlanDayTouch,
} from "@/lib/plans-db";
import {
  generateSevenDayPlanForLead,
  refinePlanDay,
  refineWholePlan,
  type SevenDayPlan,
  type ApprovalStatus,
  type PlannedTouchpoint,
} from "@/lib/plan";
import { codegenPlanForClose, type CodegenResult } from "@/lib/plan-to-close";
import {
  closeGetLeadFull,
  closeEnrollInWorkflow,
  closeListPhoneNumbers,
  closeUpdateSequenceSubscription,
  closeGetSequenceSubscription,
} from "@/lib/close";
import { snapshotIdForBox } from "@/lib/plan";
import { assertOperatorSession } from "@/lib/operator-guard";
import { env } from "@/lib/env";
import { runHeartbeatForPlan, type HeartbeatReport } from "@/lib/heartbeat";
import { getSettings, clampPlanHorizonDays } from "@/lib/settings";
import { logExecution, logApprovalChange } from "@/lib/execution-audit";
import { redirect } from "next/navigation";
import { getIntakeArtifactById } from "@/lib/intake-artifacts";
import { deleteAssetById, getAssetById } from "@/lib/assets";
import {
  regenerateLeadAndreAlerts,
  regenerateLeadClientLedger,
  regenerateLeadCommsInterpretation,
  regenerateLeadDiscovery,
  regenerateLeadProfile,
} from "@/lib/lead-folder-llm";
import { sweepLead } from "@/lib/lead-folder-sweeper";
import { findLeadFolderPath, listLeadFolderFiles, readLeadFile, writeLeadFile, stripFrontmatter } from "@/lib/lead-folder";

async function regenerateAllAiDocsForLead(leadId: string) {
  return {
    comms: await regenerateLeadCommsInterpretation(leadId),
    profile: await regenerateLeadProfile(leadId),
    discovery: await regenerateLeadDiscovery(leadId),
    alerts: await regenerateLeadAndreAlerts(leadId),
    ledger: await regenerateLeadClientLedger(leadId),
  };
}

export async function sweepLeadBoxAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) throw new Error("lead_id required");
  const result = await sweepLead(leadId);
  void logExecution({
    action_kind: "sweep_lead_box",
    close_lead_id: leadId,
    payload: result,
  });

  // Raw substrate changed → chain AI regeneration. Each regen has its own
  // skip-hash so chains-without-change are cheap; we only chain when something
  // was actually written so the common no-op case stays a no-op.
  if (result.written > 0) {
    try {
      const chained = await regenerateAllAiDocsForLead(leadId);
      void logExecution({
        action_kind: "regenerate_client_box_docs",
        close_lead_id: leadId,
        payload: { trigger: "auto_after_sweep", chained },
      });
    } catch (err) {
      void logExecution({
        action_kind: "regenerate_client_box_docs",
        close_lead_id: leadId,
        payload: {
          trigger: "auto_after_sweep",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  revalidatePath(`/lead/${leadId}`, "layout");
}

export async function regenerateClientBoxDocsAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) throw new Error("lead_id required");

  // Hard gate: AI regen reads the raw substrate. Without a folder there is
  // nothing to interpret.
  const folder = await findLeadFolderPath(leadId);
  if (!folder) {
    throw new Error(
      "Refresh raw box from Close first — no harness folder for this lead yet."
    );
  }

  const results = await regenerateAllAiDocsForLead(leadId);

  void logExecution({
    action_kind: "regenerate_client_box_docs",
    close_lead_id: leadId,
    payload: results,
  });
  revalidatePath(`/lead/${leadId}`, "layout");
}

export async function runLeadBoxWorkflowAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) throw new Error("lead_id required");
  const rawH = formData.get("horizon_days");
  const horizonDays =
    rawH != null && String(rawH).trim() !== ""
      ? clampPlanHorizonDays(Number(rawH))
      : undefined;

  const raw = await sweepLead(leadId);
  const ai = await regenerateAllAiDocsForLead(leadId);
  const plan = await generateSevenDayPlanForLead(leadId, { horizonDays });
  if (!plan.ok) throw new Error(plan.error);

  void logExecution({
    action_kind: "run_lead_box_workflow",
    close_lead_id: leadId,
    payload: { raw, ai, horizonDays: horizonDays ?? "default" },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export type ClientBoxDocKey = "comms" | "profile" | "discovery" | "alerts" | "ledger";

const DOC_REGENERATORS: Record<
  ClientBoxDocKey,
  (leadId: string) => Promise<unknown>
> = {
  comms: regenerateLeadCommsInterpretation,
  profile: regenerateLeadProfile,
  discovery: regenerateLeadDiscovery,
  alerts: regenerateLeadAndreAlerts,
  ledger: regenerateLeadClientLedger,
};

const REQUIRED_AI_DOCS_FOR_PLAN = [
  "03_comms_interpreted.md",
  "04_profile.md",
  "06_discovery.md",
  "08_client_ledger.md",
] as const;

async function assertAiDocsReadyForPlan(leadId: string): Promise<void> {
  const files = await listLeadFolderFiles(leadId);
  const missing = REQUIRED_AI_DOCS_FOR_PLAN.filter((file) => !files?.has(file));
  if (missing.length > 0) {
    throw new Error(
      `Regenerate AI docs before planning — missing ${missing.join(", ")}.`
    );
  }
}

export async function regenerateOneClientBoxDocAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  const docKey = String(formData.get("doc_key") || "") as ClientBoxDocKey;
  if (!leadId) throw new Error("lead_id required");
  if (!(docKey in DOC_REGENERATORS)) throw new Error(`unknown doc_key: ${docKey}`);

  const result = await DOC_REGENERATORS[docKey](leadId);
  void logExecution({
    action_kind: "regenerate_client_box_docs",
    close_lead_id: leadId,
    payload: { doc_key: docKey, result },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
}

export async function generatePlanAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) throw new Error("lead_id required");

  // Hard gate: cannot generate a plan without a hydrated raw substrate.
  // The plan generator reads from the harness folder; running it before a
  // sweep silently produces a thin / wrong plan.
  const folder = await findLeadFolderPath(leadId);
  if (!folder) {
    throw new Error(
      "Refresh raw box from Close first — no harness folder for this lead yet."
    );
  }
  await assertAiDocsReadyForPlan(leadId);

  const rawH = formData.get("horizon_days");
  const horizonDays =
    rawH != null && String(rawH).trim() !== ""
      ? clampPlanHorizonDays(Number(rawH))
      : undefined;
  const r = await generateSevenDayPlanForLead(leadId, { horizonDays });
  if (!r.ok) throw new Error(r.error);
  void logExecution({
    action_kind: "generate_plan",
    close_lead_id: leadId,
    payload: { horizonDays: horizonDays ?? "default" },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function approvePlanAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  const row = (await getPlanById(planId)) as Record<string, unknown>;
  const prevStatus = String(row.status || "");
  await approvePlan(planId, "andre");
  void logApprovalChange({
    plan_id: planId,
    from_status: prevStatus,
    to_status: "approved",
    actor: "andre",
    based_on_snapshot_id: String(row.based_on_snapshot_id || ""),
  });
  void logExecution({
    action_kind: "approve_plan",
    close_lead_id: leadId,
    plan_id: planId,
    snapshot_id_at_action: String(row.based_on_snapshot_id || ""),
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function killPlanAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const reason = String(formData.get("reason") || "killed by operator");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  const row = (await getPlanById(planId)) as Record<string, unknown>;
  const prevStatus = String(row.status || "");
  await killPlan(planId, reason);
  void logApprovalChange({
    plan_id: planId,
    from_status: prevStatus,
    to_status: "killed",
    actor: "andre",
    reason,
  });
  void logExecution({
    action_kind: "kill_plan",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { reason },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function pausePlanAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");
  const row = (await getPlanById(planId)) as Record<string, unknown>;
  const prevStatus = String(row.status || "");
  await pausePlan(planId);
  void logApprovalChange({
    plan_id: planId,
    from_status: prevStatus,
    to_status: "paused",
    actor: "andre",
  });
  void logExecution({ action_kind: "pause_plan", close_lead_id: leadId, plan_id: planId });
  revalidatePath(`/lead/${leadId}`, "layout");
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

/** Block AI refine when Box fingerprint no longer matches the plan (§I3). */
async function assertPlanSnapshotFresh(planId: string, leadId: string): Promise<string | null> {
  const [box, row] = await Promise.all([closeGetLeadFull(leadId), getPlanById(planId)]);
  const rec = row as Record<string, unknown>;
  const status = String(rec.status || "");
  if (status === "killed") return null;
  const cur = snapshotIdForBox(box);
  const planSnap = String(rec.based_on_snapshot_id || "");
  if (cur !== planSnap) {
    return `Box changed since this plan was generated (Guardrails §I3). Regenerate the plan from the current Box before refining.`;
  }
  return null;
}

export async function addPlanDayTouchAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") ?? -1);
  const channel = String(formData.get("channel") || "task");
  const intent = String(formData.get("intent") || "").trim();
  const draftSeed = String(formData.get("draft_seed") || "").trim();
  if (!planId || !leadId || dayIndex < 0) throw new Error("plan_id, lead_id, day_index required");
  if (!intent) throw new Error("intent required");

  const ch: PlannedTouchpoint["channel"] =
    channel === "email" || channel === "sms" || channel === "task"
      ? channel
      : "task";
  const touch: PlannedTouchpoint = {
    channel: ch,
    intent,
    ...(draftSeed ? { draft_seed: draftSeed } : {}),
  };
  await appendRequiredActionToPlanDay(planId, dayIndex, touch);
  void logExecution({
    action_kind: "add_plan_day_touch",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { day_index: dayIndex, channel: ch },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function editPlanDayTouchAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") ?? -1);
  const touchIndex = Number(formData.get("touch_index") ?? -1);
  const channel = String(formData.get("channel") || "task");
  const intent = String(formData.get("intent") || "").trim();
  const draftSeed = String(formData.get("draft_seed") || "").trim();
  if (!planId || !leadId || dayIndex < 0 || touchIndex < 0) {
    throw new Error("plan_id, lead_id, day_index, touch_index required");
  }
  if (!intent) throw new Error("intent required");

  const ch: PlannedTouchpoint["channel"] =
    channel === "email" || channel === "sms" || channel === "task"
      ? channel
      : "task";
  const touch: PlannedTouchpoint = {
    channel: ch,
    intent,
    ...(draftSeed ? { draft_seed: draftSeed } : {}),
  };
  await editPlanDayTouch(planId, dayIndex, touchIndex, touch);
  void logExecution({
    action_kind: "add_plan_day_touch",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { day_index: dayIndex, touch_index: touchIndex, channel: ch, edit: true },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function deletePlanDayTouchAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") ?? -1);
  const touchIndex = Number(formData.get("touch_index") ?? -1);
  if (!planId || !leadId || dayIndex < 0 || touchIndex < 0) {
    throw new Error("plan_id, lead_id, day_index, touch_index required");
  }
  await deletePlanDayTouch(planId, dayIndex, touchIndex);
  void logExecution({
    action_kind: "add_plan_day_touch",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { day_index: dayIndex, touch_index: touchIndex, deleted: true },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
}

export async function refinePlanDayAction(
  prev: RefineDayState,
  formData: FormData
): Promise<RefineDayState> {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") || -1);
  const instruction = String(formData.get("instruction") || "");

  if (!planId || !leadId || dayIndex < 0) {
    return { ok: false, error: "plan_id, lead_id, day_index required" };
  }

  try {
    const staleMsg = await assertPlanSnapshotFresh(planId, leadId);
    if (staleMsg) return { ok: false, error: staleMsg };

    const plan = await hydratePlan(planId);
    const r = await refinePlanDay(plan, dayIndex, instruction);
    if (!r.ok) return { ok: false, error: r.error };

    await updatePlanDay(planId, dayIndex, r.day);
    void logExecution({
      action_kind: "refine_plan_day",
      close_lead_id: leadId,
      plan_id: planId,
      payload: { day_index: dayIndex, instruction_len: instruction.length },
      snapshot_id_at_action: plan.based_on_snapshot_id,
    });
    revalidatePath(`/lead/${leadId}`, "layout");
    revalidatePath("/proposals");
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
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const instruction = String(formData.get("instruction") || "");
  if (!planId || !leadId) return { ok: false, error: "plan_id and lead_id required" };

  try {
    const staleMsg = await assertPlanSnapshotFresh(planId, leadId);
    if (staleMsg) return { ok: false, error: staleMsg };

    const plan = await hydratePlan(planId);
    const r = await refineWholePlan(plan, instruction);
    if (!r.ok) return { ok: false, error: r.error };

    // Replace days + update the top-level summary fields. Phase 6: file-canonical.
    try {
      const { mutatePlan } = await import("@/lib/lead-plan-fs");
      await mutatePlan(planId, (current) => ({
        ...current,
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
        approved_at: undefined,
        approved_by: undefined,
      }));
    } catch (e) {
      return { ok: false, error: `plan write failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    void logExecution({
      action_kind: "refine_whole_plan",
      close_lead_id: leadId,
      plan_id: planId,
      payload: { instruction_len: instruction.length },
      snapshot_id_at_action: plan.based_on_snapshot_id,
    });
    revalidatePath(`/lead/${leadId}`, "layout");
    revalidatePath("/proposals");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Set a single day's approval_status (used by right-click menu). */
export async function setDayStatusAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const dayIndex = Number(formData.get("day_index") || -1);
  const status = String(formData.get("status") || "") as ApprovalStatus;
  if (!planId || !leadId || dayIndex < 0) throw new Error("plan_id, lead_id, day_index required");
  if (!["not_ready", "needs_review", "approved", "sent", "skipped"].includes(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  const planRow = (await getPlanById(planId)) as Record<string, unknown>;
  const days = (planRow.days as SevenDayPlan["days"]) || [];
  const prevDay = days[dayIndex];
  const fromStatus = prevDay?.approval_status ?? "not_ready";
  const snap = String(planRow.based_on_snapshot_id || "");
  await setDayStatus(planId, dayIndex, status);
  void logApprovalChange({
    plan_id: planId,
    day_index: dayIndex,
    from_status: fromStatus,
    to_status: status,
    actor: "andre",
    based_on_snapshot_id: snap,
  });
  void logExecution({
    action_kind: "day_status_change",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { day_index: dayIndex, from: fromStatus, to: status },
    snapshot_id_at_action: snap,
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/proposals");
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
    await assertOperatorSession();
    const r = await approveAllDaysInternal(planId);
    revalidatePath(`/lead/${leadId}`, "layout");
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
    await assertOperatorSession();
    const ar = await approveAllDaysInternal(planId);
    const settings = await getSettings();
    const traceId = randomUUID();
    const report = await runHeartbeatForPlan(
      planId,
      "manual",
      settings.execution_mode,
      traceId
    );
    void logExecution({
      action_kind: "approve_run",
      close_lead_id: leadId,
      plan_id: planId,
      trace_id: traceId,
      payload: {
        approved_days: ar.approved,
        skipped_voice: ar.skipped,
        execution_mode: settings.execution_mode,
      },
      snapshot_id_at_action: report.current_snapshot_id,
    });
    revalidatePath(`/lead/${leadId}`, "layout");
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

/** Enroll a contact in a Close sequence (workflow). Requires confirm + operator session when lock enabled. */
export async function enrollInSequenceAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  const sequenceId = String(formData.get("sequence_id") || "");
  const contactId = String(formData.get("contact_id") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!leadId || !sequenceId || !contactId) throw new Error("lead_id, sequence_id, and contact_id required");
  if (confirm !== "yes") throw new Error("Confirm enrollment (writes to Close)");

  const phones = await closeListPhoneNumbers({ limit: 30 });
  const primaryLine = phones[0];
  await closeEnrollInWorkflow({
    sequence_id: sequenceId,
    contact_id: contactId,
    ...(primaryLine?.id ? { sender_account_id: primaryLine.id } : {}),
  });
  void logExecution({
    action_kind: "enroll_workflow",
    close_lead_id: leadId,
    payload: {
      sequence_id: sequenceId,
      contact_id: contactId,
      sender_account_id: primaryLine?.id,
    },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
}

/** Clear the approval queue: needs_review → not_ready, plan → draft (operator rejected bulk review). */
export async function rejectApprovalQueueAction(formData: FormData) {
  await assertOperatorSession();
  const planId = String(formData.get("plan_id") || "");
  const leadId = String(formData.get("lead_id") || "");
  const reason = String(formData.get("reason") || "rejected_from_queue");
  if (!planId || !leadId) throw new Error("plan_id and lead_id required");

  const row = (await getPlanById(planId)) as Record<string, unknown>;
  const dayList = (row.days as SevenDayPlan["days"]) || [];
  const hasNeeds = dayList.some((d) => d.approval_status === "needs_review");
  if (!hasNeeds) throw new Error("no days in needs_review");

  const prevStatus = String(row.status || "");
  const days = dayList.map((d) =>
    d.approval_status === "needs_review"
      ? { ...d, approval_status: "not_ready" as const }
      : d
  );
  // Phase 6: file-canonical.
  const { mutatePlan } = await import("@/lib/lead-plan-fs");
  await mutatePlan(planId, (current) => ({
    ...current,
    days,
    status: "draft",
    approved_at: undefined,
    approved_by: undefined,
  }));

  void logApprovalChange({
    plan_id: planId,
    from_status: prevStatus,
    to_status: "draft",
    actor: "andre",
    reason,
    based_on_snapshot_id: String(row.based_on_snapshot_id || ""),
  });
  void logExecution({
    action_kind: "reject_plan_queue",
    close_lead_id: leadId,
    plan_id: planId,
    payload: { reason },
    snapshot_id_at_action: String(row.based_on_snapshot_id || ""),
  });
  revalidatePath(`/lead/${leadId}`, "layout");
  revalidatePath("/approvals");
}

/** Pause or resume a Close sequence subscription (writes to Close). */
export async function updateSequenceSubscriptionAction(formData: FormData) {
  await assertOperatorSession();
  const leadId = String(formData.get("lead_id") || "");
  const subscriptionId = String(formData.get("subscription_id") || "");
  const nextStatus = String(formData.get("next_status") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!leadId || !subscriptionId) throw new Error("lead_id and subscription_id required");
  if (nextStatus !== "paused" && nextStatus !== "active") {
    throw new Error("next_status must be paused or active");
  }
  if (confirm !== "yes") throw new Error("Confirm writes to Close");

  await closeUpdateSequenceSubscription(subscriptionId, { status: nextStatus });
  void logExecution({
    action_kind: nextStatus === "paused" ? "pause_subscription" : "resume_subscription",
    close_lead_id: leadId,
    payload: { subscription_id: subscriptionId, next_status: nextStatus },
  });
  revalidatePath(`/lead/${leadId}`, "layout");
}

/** Poll snapshot for subscription run watch (read-only GET). */
export async function getSequenceSubscriptionSnapshotAction(subscriptionId: string): Promise<
  { ok: true; sub: Record<string, unknown> } | { ok: false; error: string }
> {
  try {
    await assertOperatorSession();
    if (!subscriptionId.trim()) return { ok: false, error: "subscription_id required" };
    const sub = await closeGetSequenceSubscription(subscriptionId.trim());
    return { ok: true, sub };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Kept for rare direct migrations / tooling.
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

/**
 * Redirect to a short-lived signed download URL for an intake artifact.
 * Form: hidden `artifact_id`, `lead_id`. On any failure, redirects back to the
 * lead's intake tab with a query-string code the page renders into a banner.
 */
export async function redirectIntakeArtifactDownload(formData: FormData) {
  const artifactId = String(formData.get("artifact_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const intakePath = (code?: string) =>
    `/lead/${encodeURIComponent(leadId)}/intake${code ? `?intake_dl=${code}` : ""}`;

  if (!artifactId || !leadId) {
    redirect(leadId ? intakePath("bad_request") : "/leads");
  }

  // Intake binaries are not persisted (file-canonical extracts only — see
  // `intake-fs.ts`). The download flow now points operators back to the
  // intake page with an offline code; the UI surfaces the extracted text
  // inline instead. Re-enable when binary persistence ships.
  void artifactId;
  redirect(intakePath("download_offline"));
}

/**
 * Delete an intake artifact: removes the storage object and the DB row.
 * Lead-id-scoped — refuses to delete an artifact that doesn't belong to this lead
 * to prevent accidental cross-lead removal from a stale form post.
 */
export async function deleteIntakeArtifactAction(formData: FormData) {
  await assertOperatorSession();
  const artifactId = String(formData.get("artifact_id") || "").trim();
  const leadId = String(formData.get("lead_id") || "").trim();
  if (!artifactId || !leadId) throw new Error("artifact_id and lead_id required");

  // Delete is currently a no-op pending the file-tree delete path (would need
  // an Octokit `deleteFile` for both `meta.json` and `extracted.md` under the
  // intake folder). For now, log the intent and refresh the page so the UI
  // doesn't appear frozen. Re-enable when harness intake-delete ships.
  void logExecution({
    action_kind: "intake_extract",
    close_lead_id: leadId,
    payload: { artifact_id: artifactId, delete_attempted: true, note: "harness intake-delete not yet wired" },
  });
  revalidatePath(`/lead/${leadId}/intake`);
  revalidatePath(`/lead/${leadId}/box`);
}

export async function redirectAssetDownload(formData: FormData) {
  const assetId = String(formData.get("asset_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const boxPath = (code?: string) =>
    `/lead/${encodeURIComponent(leadId)}/box${code ? `?asset_dl=${code}` : ""}`;

  if (!assetId || !leadId) {
    redirect(leadId ? boxPath("bad_request") : "/leads");
  }

  // Assets storage is file-canonical (assets-fs.ts) but a download URL flow
  // hasn't been wired through harness yet. Until then, redirect with an
  // offline code so the UI degrades cleanly.
  void assetId;
  redirect(boxPath("download_offline"));
}

export async function deleteLeadAssetAction(formData: FormData) {
  await assertOperatorSession();
  const assetId = String(formData.get("asset_id") || "").trim();
  const leadId = String(formData.get("lead_id") || "").trim();
  if (!assetId || !leadId) throw new Error("asset_id and lead_id required");

  const row = await getAssetById(assetId);
  if (!row) {
    revalidatePath(`/lead/${leadId}/box`);
    return;
  }
  if (row.scope === "lead" && row.close_lead_id !== leadId) throw new Error("asset lead mismatch");

  await deleteAssetById(assetId);
  void logExecution({
    action_kind: "asset_library",
    close_lead_id: row.close_lead_id ?? leadId,
    payload: {
      asset_id: assetId,
      deleted: true,
      filename: row.filename,
      scope: row.scope,
    },
  });
  revalidatePath(`/lead/${leadId}/box`);
}

/** Run a manual heartbeat sweep for one plan. Uses the Settings execution_mode. */
export async function runHeartbeatNowAction(
  planId: string,
  leadId: string
): Promise<{ ok: true; report: HeartbeatReport; execution_mode: string } | { ok: false; error: string }> {
  try {
    await assertOperatorSession();
    const settings = await getSettings();
    const traceId = randomUUID();
    const report = await runHeartbeatForPlan(
      planId,
      "manual",
      settings.execution_mode,
      traceId
    );
    void logExecution({
      action_kind: "manual_heartbeat",
      close_lead_id: leadId,
      plan_id: planId,
      trace_id: traceId,
      snapshot_id_at_action: report.current_snapshot_id,
      payload: {
        execution_mode: settings.execution_mode,
        actions_fired: report.actions_fired,
        actions_skipped: report.actions_skipped,
      },
    });
    revalidatePath(`/lead/${leadId}`, "layout");
    return { ok: true, report, execution_mode: settings.execution_mode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Append a date-stamped operator entry to `08_client_ledger.md`.
 *
 * The Client Ledger is the per-lead running ledger — analogous to the global
 * Goals/Problems/Global scaffold but scoped to one lead. Both the operator (UI
 * button) and the chat agent (tool-call) write through this single action so
 * the file stays the canonical source of truth.
 *
 * Idempotent on identical content (writeLeadFile bails on same SHA). Falls
 * back gracefully if the file or folder doesn't exist yet — creates a stub.
 */
export async function appendClientLedgerEntryAction(
  leadId: string,
  body: string,
  opts?: { source?: "operator" | "agent"; leadName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertOperatorSession();
    const trimmed = body.trim();
    if (!leadId || !leadId.startsWith("lead_")) return { ok: false, error: "invalid lead id" };
    if (!trimmed) return { ok: false, error: "entry body required" };
    if (trimmed.length > 4000) return { ok: false, error: "entry too long (4000 char max)" };

    const today = new Date().toISOString().slice(0, 10);
    const source = opts?.source === "agent" ? "agent" : "operator";
    const bullet = `- **${source} · ${new Date().toISOString().slice(11, 16)}Z** — ${trimmed.replace(/\n+/g, " ")}\n`;

    const existing = await readLeadFile(leadId, "08_client_ledger.md");
    const frontmatter = existing && existing.startsWith("---") ? existing.slice(0, existing.indexOf("\n---", 3) + 4) + "\n" : "";
    const bodyOnly = existing ? stripFrontmatter(existing) : "";

    const dayHeading = `## ${today}`;
    let nextBody: string;
    if (bodyOnly.includes(dayHeading)) {
      // Append under today's heading — find the next h2 (or end) and insert before it.
      const start = bodyOnly.indexOf(dayHeading);
      const afterHeading = bodyOnly.indexOf("\n", start) + 1;
      const nextH2 = bodyOnly.indexOf("\n## ", afterHeading);
      const insertAt = nextH2 === -1 ? bodyOnly.length : nextH2;
      nextBody = bodyOnly.slice(0, insertAt).replace(/\n*$/, "\n") + bullet + bodyOnly.slice(insertAt);
    } else {
      // Prepend a fresh day section so newest is on top.
      const heading = bodyOnly.startsWith("# ")
        ? bodyOnly
        : `# Client Ledger\n\nRunning ledger for this lead. Operator + agent entries land here.\n\n` + bodyOnly;
      const headerEnd = heading.indexOf("\n\n", heading.indexOf("# "));
      const insertAt = headerEnd === -1 ? heading.length : headerEnd + 2;
      nextBody = heading.slice(0, insertAt) + `${dayHeading}\n\n${bullet}\n` + heading.slice(insertAt);
    }

    const final = frontmatter + nextBody.replace(/\n*$/, "\n");

    // leadName is optional — only used if folder doesn't exist (very rare for
    // an active lead). Fall back to id-as-name if caller didn't supply.
    const leadName = opts?.leadName?.trim() || leadId;
    await writeLeadFile(leadId, leadName, "08_client_ledger.md", final, {
      commitMessage: `ledger: ${leadId} — ${source} entry`,
    });

    void logExecution({
      action_kind: "append_client_ledger",
      close_lead_id: leadId,
      payload: { source, length: trimmed.length },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
