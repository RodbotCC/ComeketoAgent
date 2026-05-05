/**
 * Heartbeat — Guardrails §E.
 *
 * The heartbeat sweeps active plans every 30-60 minutes during work hours.
 * For each plan it: rehydrates the Box from Close, recomputes the snapshot
 * id, marks the plan stale on mismatch, and (if not stale) walks each day
 * and every `required_action` to evaluate gate outcomes (ownership, reply
 * gate, send window, frequency cap, voice, execution mode).
 *
 * Execution semantics by mode:
 * - `draft_only` — no Close writes; gate-passing touches appear as skipped with
 *   skip_code `EXECUTION_DISABLED` in the persisted report.
 * - `approval_required` — eligible touches have `verdict.fire: true` but the
 *   heartbeat still does not call Close (eligibility snapshot only).
 * - `approved_plan_execution` — eligible touches trigger real Close API writes
 *   (tasks, draft email/SMS activities per plan-to-close helpers).
 *
 * Each run writes a row to `heartbeat_runs` for audit (Guardrails §O).
 */

import { getSupabaseServer } from "./supabase";
import { env } from "./env";
import { getSettings } from "./settings";
import {
  closeGetLeadFull,
  checkOwnershipAndStatus,
  detectStopSignal,
  isReplyGateActive,
  isInSendWindow,
  checkFrequencyCap,
  closeCreateTask,
  closeLogEmail,
  closeLogSms,
  type CloseLeadFull,
  type SkipCode,
} from "./close";
import {
  snapshotIdForBox,
  type SevenDayPlan,
  type SevenDayPlanDay,
  type PlannedTouchpoint,
} from "./plan";
import { codegenPlanForClose } from "./plan-to-close";
import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "./nepq";
import { setDayStatus } from "./plans-db";
import { resolveLeadTimezone, type TimezoneResolution } from "./timezone";
import { randomUUID } from "crypto";
import { logExecution } from "./execution-audit";

export type ExecutionMode =
  | "draft_only"            // heartbeat reports only, never sends
  | "approval_required"     // heartbeat fires only days that are approved (still defers actual send)
  | "approved_plan_execution" // heartbeat fires real Close API calls (NOT YET ENABLED)
  | "manual_send_only";

export type ActionVerdict =
  | { fire: true; reason: "would-fire" | "fired"; executed?: { kind: string; close_id?: string } }
  | { fire: false; skip_code: SkipCode | "FREQUENCY_CAP_24H" | "FREQUENCY_CAP_7D"; reason: string }
  | { fire: false; skip_code: "CLOSE_API_ERROR"; reason: string; close_error: string };

export type DayVerdict = {
  day_index: number;
  day_number: number;
  approval_status: SevenDayPlanDay["approval_status"];
  date: string;
  is_today: boolean;
  actions: Array<{
    channel: PlannedTouchpoint["channel"];
    intent: string;
    verdict: ActionVerdict;
  }>;
};

export type HeartbeatReport = {
  ran_at: string;
  plan_id: string;
  close_lead_id: string;
  snapshot_match: boolean;
  plan_was_stale: boolean;
  current_snapshot_id: string;
  plan_snapshot_id: string;
  stop_signal_active: boolean;
  reply_gate_active: boolean;
  ownership_status_skip: SkipCode | null;
  lead_tz: string;
  lead_tz_source: TimezoneResolution["source"];
  lead_tz_detail?: string;
  days: DayVerdict[];
  actions_eligible: number;
  actions_fired: number;
  actions_skipped: number;
  skip_breakdown: Record<string, number>;
  duration_ms: number;
};

// ─── Box → SevenDayPlan hydration ────────────────────────────────────────

function rowToPlan(row: Record<string, unknown>): SevenDayPlan {
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
    days: (row.days as SevenDayPlanDay[]) || [],
    stop_conditions: (row.stop_conditions as SevenDayPlan["stop_conditions"]) || [],
    approval_required: Boolean(row.approval_required),
  };
}

// ─── Verdict per action ──────────────────────────────────────────────────

/** Catchup window — actions scheduled today OR up to N days in the past
 *  are still fire-eligible. Yesterday's missed day shouldn't get stuck in
 *  DAY_NOT_TODAY purgatory; the operator wants the agent to catch up.
 *  Future-dated days are still gated (don't fire tomorrow's plan today). */
const DAY_CATCHUP_WINDOW_DAYS = 2;

function isToday(dayDateIso: string, now: Date): boolean {
  const a = new Date(dayDateIso);
  // Normalize both to midnight in local time, then compare day-deltas.
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const deltaDays = Math.round((nMid - aMid) / 86_400_000);
  // Today (delta 0) or in the catchup window (delta 1..N) → eligible.
  // Future days (delta < 0) still skip with DAY_NOT_TODAY.
  return deltaDays >= 0 && deltaDays <= DAY_CATCHUP_WINDOW_DAYS;
}

/**
 * Verdict for a single planned action.
 *
 * Two postures:
 *
 * - **Solo-operator mode** (`opts.soloOperator === true`, default in
 *   `lib/settings.ts`): the only hard blocks are STOP_SIGNAL (legal opt-out
 *   compliance) and DAY_SKIPPED / DAY_ALREADY_SENT (correct skip semantics).
 *   Everything else — ownership splits, status_won/lost, stale-box pause,
 *   send-window hours, frequency cap, reply-gate, day-not-approved, no
 *   primary contact for email/sms — is dropped or downgraded so the agent
 *   actually fires for the single human driving it.
 *
 * - **Multi-operator mode** (`opts.soloOperator === false`): full Guardrails
 *   stack as originally written. Use this when the same Close org has
 *   multiple owners and the agent must respect ownership lanes + reply
 *   gates per Andre/Jake convention.
 */
function verdictForAction(opts: {
  channel: PlannedTouchpoint["channel"];
  isTodayDay: boolean;
  dayApproval: SevenDayPlanDay["approval_status"];
  ownershipSkip: SkipCode | null;
  stopActive: boolean;
  replyActive: boolean;
  freqSkip: "FREQUENCY_CAP_24H" | "FREQUENCY_CAP_7D" | null;
  hasContact: boolean;
  inWindow: boolean;
  voiceBlocked: boolean;
  executionMode: ExecutionMode;
  /** When true, strip operator-imposed gates (see fn doc). */
  soloOperator?: boolean;
}): ActionVerdict {
  const o = opts;
  const solo = o.soloOperator ?? true;

  if (o.dayApproval === "skipped") return { fire: false, skip_code: "DAY_SKIPPED", reason: "Day marked skipped" };
  if (o.dayApproval === "sent") return { fire: false, skip_code: "DAY_ALREADY_SENT", reason: "Day already sent" };

  // Day-not-approved: in solo mode we treat any non-skipped/non-sent day as
  // implicitly approved (operator drives the agent directly; no separate
  // approval workflow).
  if (!solo && o.dayApproval !== "approved") {
    return { fire: false, skip_code: "DAY_NOT_APPROVED", reason: `Day status is ${o.dayApproval}` };
  }

  if (!o.isTodayDay) return { fire: false, skip_code: "DAY_NOT_TODAY", reason: "Day is not in catchup window" };

  // STOP_SIGNAL is the one hard block kept in solo mode — opt-out compliance
  // is non-negotiable regardless of operator preference.
  if (o.stopActive) return { fire: false, skip_code: "STOP_SIGNAL", reason: "Lead has issued an opt-out" };

  // Ownership / status / reply-gate / stale-box become advisory in solo mode.
  if (!solo) {
    if (o.ownershipSkip) return { fire: false, skip_code: o.ownershipSkip, reason: `Ownership/status gate: ${o.ownershipSkip}` };
    if (o.replyActive) return { fire: false, skip_code: "REPLY_GATE", reason: "New inbound since last outbound" };
  }

  // Channel-specific gates for email/sms.
  if (o.channel === "email" || o.channel === "sms") {
    // No contact is a real failure even in solo mode — there's nobody to send to.
    if (!o.hasContact) return { fire: false, skip_code: "NO_CONTACT", reason: "No primary contact" };
    // Send window + freq cap + voice are operator-tunable; off in solo mode.
    if (!solo) {
      if (!o.inWindow) return { fire: false, skip_code: "SEND_WINDOW", reason: "Outside send window" };
      if (o.freqSkip) return { fire: false, skip_code: o.freqSkip, reason: `Frequency cap: ${o.freqSkip}` };
      if (o.voiceBlocked) return { fire: false, skip_code: "VOICE_FAIL", reason: "Draft seed contains blocking voice violations (Guardrails §G4)" };
    }
  }

  if (o.executionMode === "draft_only") {
    return { fire: false, skip_code: "EXECUTION_DISABLED", reason: "draft_only mode — emitting report only" };
  }
  if (o.executionMode === "manual_send_only") {
    return { fire: false, skip_code: "EXECUTION_DISABLED", reason: "manual_send_only mode" };
  }
  // approval_required: gates passed but we don't actually write to Close.
  if (o.executionMode === "approval_required") {
    return { fire: true, reason: "would-fire" };
  }
  // approved_plan_execution: caller will execute after this verdict.
  return { fire: true, reason: "would-fire" };
}

// ─── Executor: turn fire-eligible verdicts into real Close API calls ─────

async function executeAction(
  channel: PlannedTouchpoint["channel"],
  action: PlannedTouchpoint,
  ctx: { lead_id: string; contact_id: string | null; date: string; andre_user_id: string }
): Promise<{ ok: true; kind: string; close_id: string } | { ok: false; error: string }> {
  try {
    if (channel === "call") {
      const r = await closeCreateTask({
        lead_id: ctx.lead_id,
        text: `📞 Call: ${action.intent}`,
        date: ctx.date,
        assigned_to: ctx.andre_user_id,
      });
      return { ok: true, kind: "task", close_id: r.id };
    }
    if (channel === "task") {
      const r = await closeCreateTask({
        lead_id: ctx.lead_id,
        text: action.intent,
        date: ctx.date,
        assigned_to: ctx.andre_user_id,
      });
      return { ok: true, kind: "task", close_id: r.id };
    }
    if (!ctx.contact_id) return { ok: false, error: "no contact for email/sms" };
    if (channel === "email") {
      const subject = action.intent.length > 80 ? action.intent.slice(0, 77) + "…" : action.intent;
      const body = action.draft_seed || action.intent;
      const r = await closeLogEmail({
        lead_id: ctx.lead_id,
        contact_id: ctx.contact_id,
        subject,
        body_text: body,
        status: "draft", // SAFE DEFAULT: lands as draft in Close, not auto-sent.
        user_id: ctx.andre_user_id,
      });
      return { ok: true, kind: "email_draft", close_id: r.id };
    }
    if (channel === "sms") {
      const text = action.draft_seed || action.intent;
      const r = await closeLogSms({
        lead_id: ctx.lead_id,
        contact_id: ctx.contact_id,
        text,
        status: "draft",
        user_id: ctx.andre_user_id,
      });
      return { ok: true, kind: "sms_draft", close_id: r.id };
    }
    return { ok: false, error: `unsupported channel: ${channel}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Run heartbeat for one plan ───────────────────────────────────────────

export async function runHeartbeatForPlan(
  planId: string,
  trigger: "cron" | "manual" | "api" = "manual",
  executionMode: ExecutionMode = "draft_only",
  traceId?: string | null
): Promise<HeartbeatReport> {
  const startedAt = Date.now();
  const sb = getSupabaseServer();
  const settings = await getSettings();

  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("*")
    .eq("id", planId)
    .single();
  if (readErr || !row) throw new Error(`heartbeat: plan ${planId} not found (${readErr?.message ?? ""})`);

  const plan = rowToPlan(row as Record<string, unknown>);
  const box = await closeGetLeadFull(plan.close_lead_id);
  const currentSnapshotId = snapshotIdForBox(box);
  const snapshotMatch = currentSnapshotId === plan.based_on_snapshot_id;

  // If the plan is stale and was approved/active, pause it (Guardrails §D5/§E3).
  let planWasStale = false;
  if (!snapshotMatch && (plan.status === "approved" || plan.status === "active")) {
    planWasStale = true;
    await sb.from("lead_plans").update({ status: "paused" }).eq("id", plan.plan_id);
    void logExecution({
      action_kind: "plan_paused_stale",
      close_lead_id: plan.close_lead_id,
      plan_id: plan.plan_id,
      trace_id: traceId ?? null,
      snapshot_id_at_action: currentSnapshotId,
      payload: {
        plan_snapshot_id: plan.based_on_snapshot_id,
        trigger,
      },
    });
  }

  // Run all the gates against the current Box.
  const ownershipSkip = checkOwnershipAndStatus(box.lead, env.CLOSE_USER_ID_ANDRE);
  const stopHits = detectStopSignal(box.activities);
  const stopActive = stopHits.length > 0;
  const replyActive = isReplyGateActive(box.activities);
  const freqSkip = checkFrequencyCap(box.activities, new Date());
  const hasContact = (box.lead.contacts?.length ?? 0) > 0;
  const tzRes = resolveLeadTimezone(box.lead);

  const codegen = codegenPlanForClose({ plan, box, andreUserId: env.CLOSE_USER_ID_ANDRE });
  const now = new Date();

  const primaryContactId = box.lead.contacts?.[0]?.id ?? null;
  const ctxBase = {
    lead_id: plan.close_lead_id,
    contact_id: primaryContactId,
    andre_user_id: env.CLOSE_USER_ID_ANDRE,
  };

  const days: DayVerdict[] = [];
  for (let idx = 0; idx < codegen.groups.length; idx++) {
    const group = codegen.groups[idx];
    const dayObj = plan.days[idx];
    const today = isToday(group.date, now);
    const dayActions: DayVerdict["actions"] = [];
    let dayHadFire = false;
    let dayAllFiresSucceeded = true;

    for (const req of dayObj.required_actions) {
      const draft = req.draft_seed || req.intent || "";
      const violations: VoiceViolation[] =
        req.channel === "email" || req.channel === "sms" ? validateNepqVoice(draft) : [];
      const voiceBlocked = hasBlockingViolation(violations);

      const verdict0 = verdictForAction({
        channel: req.channel,
        isTodayDay: today,
        dayApproval: dayObj.approval_status,
        ownershipSkip: snapshotMatch ? ownershipSkip : "STALE_BOX",
        stopActive,
        replyActive,
        freqSkip,
        hasContact,
        inWindow: isInSendWindow(req.channel, now, tzRes.tz),
        voiceBlocked,
        executionMode,
        soloOperator: settings.solo_operator,
      });

      let finalVerdict: ActionVerdict = verdict0;

      // Real execution path: only fires when mode is approved_plan_execution
      // AND verdict0 came back fire:true. Per Guardrails §I + §I4, this
      // requires deliberate enablement in Settings.
      if (verdict0.fire && executionMode === "approved_plan_execution") {
        dayHadFire = true;
        const result = await executeAction(req.channel, req, { ...ctxBase, date: group.date });
        if (result.ok) {
          finalVerdict = {
            fire: true,
            reason: "fired",
            executed: { kind: result.kind, close_id: result.close_id },
          };
          void logExecution({
            action_kind: "close_write",
            close_lead_id: plan.close_lead_id,
            plan_id: plan.plan_id,
            trace_id: traceId ?? null,
            snapshot_id_at_action: currentSnapshotId,
            payload: {
              channel: req.channel,
              kind: result.kind,
              close_id: result.close_id,
              intent: req.intent,
              trigger,
            },
          });
        } else {
          dayAllFiresSucceeded = false;
          finalVerdict = {
            fire: false,
            skip_code: "CLOSE_API_ERROR",
            reason: `Close write failed: ${result.error}`,
            close_error: result.error,
          };
          void logExecution({
            action_kind: "close_write",
            close_lead_id: plan.close_lead_id,
            plan_id: plan.plan_id,
            trace_id: traceId ?? null,
            result: "error",
            skip_code: "CLOSE_API_ERROR",
            snapshot_id_at_action: currentSnapshotId,
            payload: { channel: req.channel, error: result.error, trigger },
          });
        }
      }

      dayActions.push({
        channel: req.channel,
        intent: req.intent,
        verdict: finalVerdict,
      });
    }

    // If we executed at least one action successfully and all fires succeeded,
    // promote the day's approval_status to "sent" so future heartbeats skip it.
    if (
      executionMode === "approved_plan_execution" &&
      dayHadFire &&
      dayAllFiresSucceeded &&
      dayObj.approval_status === "approved"
    ) {
      try {
        await setDayStatus(plan.plan_id, idx, "sent");
        dayObj.approval_status = "sent"; // local mirror so the report reflects it
      } catch {
        // non-fatal — day will retry next sweep
      }
    }

    days.push({
      day_index: idx,
      day_number: group.day,
      approval_status: dayObj.approval_status,
      date: group.date,
      is_today: today,
      actions: dayActions,
    });
  }

  // Aggregate.
  const skip_breakdown: Record<string, number> = {};
  let actions_eligible = 0;
  let actions_fired = 0;
  let actions_skipped = 0;
  for (const d of days) {
    for (const a of d.actions) {
      actions_eligible += 1;
      if (a.verdict.fire) {
        actions_fired += 1;
      } else {
        actions_skipped += 1;
        const code = a.verdict.skip_code;
        skip_breakdown[code] = (skip_breakdown[code] ?? 0) + 1;
      }
    }
  }

  const ranAtIso = new Date(startedAt).toISOString();
  const report: HeartbeatReport = {
    ran_at: ranAtIso,
    plan_id: plan.plan_id,
    close_lead_id: plan.close_lead_id,
    snapshot_match: snapshotMatch,
    plan_was_stale: planWasStale,
    current_snapshot_id: currentSnapshotId,
    plan_snapshot_id: plan.based_on_snapshot_id,
    stop_signal_active: stopActive,
    reply_gate_active: replyActive,
    ownership_status_skip: ownershipSkip,
    lead_tz: tzRes.tz,
    lead_tz_source: tzRes.source,
    lead_tz_detail: tzRes.detail,
    days,
    actions_eligible,
    actions_fired,
    actions_skipped,
    skip_breakdown,
    duration_ms: Date.now() - startedAt,
  };

  // Persist the run for audit.
  await sb.from("heartbeat_runs").insert({
    scope: "lead",
    plan_id: plan.plan_id,
    close_lead_id: plan.close_lead_id,
    snapshot_match: snapshotMatch,
    plan_was_stale: planWasStale,
    actions_eligible,
    actions_fired,
    actions_skipped,
    skip_breakdown,
    report: days,
    duration_ms: report.duration_ms,
    trigger,
  });

  void logExecution({
    action_kind: "heartbeat_run",
    close_lead_id: plan.close_lead_id,
    plan_id: plan.plan_id,
    trace_id: traceId ?? null,
    snapshot_id_at_action: currentSnapshotId,
    payload: {
      trigger,
      execution_mode: executionMode,
      actions_eligible,
      actions_fired,
      actions_skipped,
      skip_breakdown,
      snapshot_match: snapshotMatch,
      plan_was_stale: planWasStale,
      duration_ms: report.duration_ms,
    },
  });

  return report;
}

// ─── Dry-run simulator: verdicts only, NO writes ─────────────────────────

export type SimulatedTouchVerdict = {
  touch_index: number;
  channel: PlannedTouchpoint["channel"];
  intent: string;
  fire: boolean;
  skip_code: string | null;
  reason: string | null;
};

export type SimulatedDay = {
  day_index: number;
  day_number: number;
  date: string;
  is_today: boolean;
  approval_status: SevenDayPlanDay["approval_status"];
  verdicts: SimulatedTouchVerdict[];
};

export type SimulatedPlan = {
  plan_id: string;
  close_lead_id: string;
  ran_at: string;
  snapshot_match: boolean;
  plan_was_stale: boolean;
  current_snapshot_id: string;
  plan_snapshot_id: string;
  reply_gate_active: boolean;
  ownership_status_skip: SkipCode | null;
  lead_tz: string;
  days: SimulatedDay[];
  actions_eligible: number;
  would_fire: number;
  would_skip: number;
  skip_breakdown: Record<string, number>;
  duration_ms: number;
};

/**
 * Pure read: walk the plan's days and emit per-touch verdicts using the
 * same logic the heartbeat runner uses, but with NO side effects.
 *
 * - No Close API writes (executor branch never entered).
 * - No Supabase writes (no heartbeat_runs insert, no plan-status update,
 *   no execution_log entry).
 * - Stale-plan check is computed and reported, but never persisted.
 *
 * Powers the "Simulate" button in the cockpit + lead page so the operator
 * sees what would fire before clicking Approve & run.
 */
export async function simulatePlanForLead(leadId: string): Promise<SimulatedPlan | null> {
  const startedAt = Date.now();
  const sb = getSupabaseServer();
  const settings = await getSettings();

  const { data: row, error: readErr } = await sb
    .from("lead_plans")
    .select("*")
    .eq("close_lead_id", leadId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(`simulate: plan read failed: ${readErr.message}`);
  if (!row) return null;

  const plan = rowToPlan(row as Record<string, unknown>);
  const box = await closeGetLeadFull(plan.close_lead_id);
  const currentSnapshotId = snapshotIdForBox(box);
  const snapshotMatch = currentSnapshotId === plan.based_on_snapshot_id;
  const planWasStale = !snapshotMatch && (plan.status === "approved" || plan.status === "active");

  const ownershipSkip = checkOwnershipAndStatus(box.lead, env.CLOSE_USER_ID_ANDRE);
  const stopHits = detectStopSignal(box.activities);
  const stopActive = stopHits.length > 0;
  const replyActive = isReplyGateActive(box.activities);
  const freqSkip = checkFrequencyCap(box.activities, new Date());
  const hasContact = (box.lead.contacts?.length ?? 0) > 0;
  const tzRes = resolveLeadTimezone(box.lead);

  const codegen = codegenPlanForClose({ plan, box, andreUserId: env.CLOSE_USER_ID_ANDRE });
  const now = new Date();

  const days: SimulatedDay[] = [];
  let would_fire = 0;
  let would_skip = 0;
  let actions_eligible = 0;
  const skip_breakdown: Record<string, number> = {};

  for (let idx = 0; idx < codegen.groups.length; idx++) {
    const group = codegen.groups[idx];
    const dayObj = plan.days[idx];
    const today = isToday(group.date, now);
    const verdicts: SimulatedTouchVerdict[] = [];

    for (let ti = 0; ti < dayObj.required_actions.length; ti++) {
      const req = dayObj.required_actions[ti];
      const draft = req.draft_seed || req.intent || "";
      const violations: VoiceViolation[] =
        req.channel === "email" || req.channel === "sms" ? validateNepqVoice(draft) : [];
      const voiceBlocked = hasBlockingViolation(violations);

      // Force draft_only-equivalent semantics by passing approval_required:
      // gates evaluate fully, but the function returns fire:true on success
      // (which is what we want — "would fire if the operator hit run").
      const verdict = verdictForAction({
        channel: req.channel,
        isTodayDay: today,
        dayApproval: dayObj.approval_status,
        ownershipSkip: snapshotMatch ? ownershipSkip : "STALE_BOX",
        stopActive,
        replyActive,
        freqSkip,
        hasContact,
        inWindow: isInSendWindow(req.channel, now, tzRes.tz),
        voiceBlocked,
        executionMode: "approval_required",
        soloOperator: settings.solo_operator,
      });

      actions_eligible += 1;
      const tv: SimulatedTouchVerdict = verdict.fire
        ? { touch_index: ti, channel: req.channel, intent: req.intent, fire: true, skip_code: null, reason: null }
        : { touch_index: ti, channel: req.channel, intent: req.intent, fire: false, skip_code: verdict.skip_code, reason: verdict.reason };
      verdicts.push(tv);
      if (verdict.fire) {
        would_fire += 1;
      } else {
        would_skip += 1;
        skip_breakdown[verdict.skip_code] = (skip_breakdown[verdict.skip_code] ?? 0) + 1;
      }
    }

    days.push({
      day_index: idx,
      day_number: group.day,
      date: group.date,
      is_today: today,
      approval_status: dayObj.approval_status,
      verdicts,
    });
  }

  return {
    plan_id: plan.plan_id,
    close_lead_id: plan.close_lead_id,
    ran_at: new Date(startedAt).toISOString(),
    snapshot_match: snapshotMatch,
    plan_was_stale: planWasStale,
    current_snapshot_id: currentSnapshotId,
    plan_snapshot_id: plan.based_on_snapshot_id,
    reply_gate_active: replyActive,
    ownership_status_skip: ownershipSkip,
    lead_tz: tzRes.tz,
    days,
    actions_eligible,
    would_fire,
    would_skip,
    skip_breakdown,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Sweep all eligible plans ─────────────────────────────────────────────

export async function runHeartbeatSweep(
  trigger: "cron" | "manual" | "api" = "cron",
  executionMode: ExecutionMode = "draft_only"
): Promise<{
  runs: HeartbeatReport[];
  errors: Array<{ plan_id: string; error: string }>;
  trace_id: string;
}> {
  const sweepStarted = Date.now();
  const traceId = randomUUID();
  const sb = getSupabaseServer();
  // Sweep approved + active + draft (draft so we still catch staleness).
  const { data, error } = await sb
    .from("lead_plans")
    .select("id")
    .in("status", ["draft", "approved", "active"]);
  if (error) throw new Error(`heartbeat sweep read failed: ${error.message}`);
  const ids = ((data as Array<{ id: string }>) ?? []).map((r) => r.id);

  const runs: HeartbeatReport[] = [];
  const errors: Array<{ plan_id: string; error: string }> = [];
  for (const pid of ids) {
    try {
      const r = await runHeartbeatForPlan(pid, trigger, executionMode, traceId);
      runs.push(r);
    } catch (err) {
      errors.push({ plan_id: pid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Write a sweep summary row.
  const totalEligible = runs.reduce((s, r) => s + r.actions_eligible, 0);
  const totalFired = runs.reduce((s, r) => s + r.actions_fired, 0);
  const totalSkipped = runs.reduce((s, r) => s + r.actions_skipped, 0);
  const breakdown: Record<string, number> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.skip_breakdown)) {
      breakdown[k] = (breakdown[k] ?? 0) + v;
    }
  }
  const lead_summaries = runs.map((r) => ({
    close_lead_id: r.close_lead_id,
    plan_id: r.plan_id,
    snapshot_match: r.snapshot_match,
    plan_was_stale: r.plan_was_stale,
    current_snapshot_id: r.current_snapshot_id,
    plan_snapshot_id: r.plan_snapshot_id,
    actions_eligible: r.actions_eligible,
    actions_fired: r.actions_fired,
    actions_skipped: r.actions_skipped,
    skip_breakdown: r.skip_breakdown,
  }));
  await sb.from("heartbeat_runs").insert({
    scope: "all",
    actions_eligible: totalEligible,
    actions_fired: totalFired,
    actions_skipped: totalSkipped,
    skip_breakdown: breakdown,
    report: {
      trace_id: traceId,
      sweep_duration_ms: Date.now() - sweepStarted,
      plan_count: runs.length,
      error_count: errors.length,
      errors,
      lead_summaries,
    },
    trigger,
  });

  return { runs, errors, trace_id: traceId };
}

// ─── DB helpers for the UI ──────────────────────────────────────────────

export async function getLatestHeartbeatForLead(leadId: string) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("heartbeat_runs")
    .select("*")
    .eq("close_lead_id", leadId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestHeartbeatForLead failed: ${error.message}`);
  return data as
    | (Record<string, unknown> & {
        ran_at: string;
        actions_eligible: number;
        actions_fired: number;
        actions_skipped: number;
        skip_breakdown: Record<string, number>;
        snapshot_match: boolean;
        plan_was_stale: boolean;
      })
    | null;
}

// ─── Dashboard helpers (used by /heartbeat page) ──────────────────────────

export type HeartbeatRunRow = {
  id: string;
  ran_at: string;
  scope: "lead" | "all" | "manual";
  plan_id: string | null;
  close_lead_id: string | null;
  snapshot_match: boolean | null;
  plan_was_stale: boolean | null;
  actions_eligible: number;
  actions_fired: number;
  actions_skipped: number;
  skip_breakdown: Record<string, number>;
  report: unknown;
  duration_ms: number | null;
  trigger: "cron" | "manual" | "api";
};

/** List recent heartbeat runs (most recent first). */
export async function listRecentHeartbeats(
  opts: { limit?: number; scope?: HeartbeatRunRow["scope"] } = {}
): Promise<HeartbeatRunRow[]> {
  const sb = getSupabaseServer();
  let q = sb
    .from("heartbeat_runs")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.scope) q = q.eq("scope", opts.scope);
  const { data, error } = await q;
  if (error) throw new Error(`listRecentHeartbeats failed: ${error.message}`);
  return (data as HeartbeatRunRow[]) ?? [];
}

/** Fetch a single heartbeat run by id. */
export async function getHeartbeatRunById(id: string): Promise<HeartbeatRunRow | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("heartbeat_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getHeartbeatRunById failed: ${error.message}`);
  return (data as HeartbeatRunRow) || null;
}

/**
 * Aggregate stats for the last 24h. Used by the dashboard KPI strip.
 * Counts only `scope = 'lead'` runs to avoid double-counting sweep summaries.
 */
export async function aggregateLast24h(): Promise<{
  sweep_summary_count: number;
  lead_run_count: number;
  total_actions_eligible: number;
  total_actions_fired: number;
  total_actions_skipped: number;
  top_skip_codes: Array<{ code: string; count: number }>;
  earliest_ran_at: string | null;
  latest_ran_at: string | null;
}> {
  const sb = getSupabaseServer();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("heartbeat_runs")
    .select("scope, ran_at, actions_eligible, actions_fired, actions_skipped, skip_breakdown")
    .gte("ran_at", since);
  if (error) throw new Error(`aggregateLast24h failed: ${error.message}`);
  const rows = (data as Array<Pick<HeartbeatRunRow,
    "scope" | "ran_at" | "actions_eligible" | "actions_fired" | "actions_skipped" | "skip_breakdown"
  >>) ?? [];

  let leadRuns = 0;
  let sweepSummaries = 0;
  let elig = 0;
  let fired = 0;
  let skipped = 0;
  const skipMap: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const r of rows) {
    if (r.scope === "all") {
      sweepSummaries += 1;
    } else {
      leadRuns += 1;
      elig += r.actions_eligible || 0;
      fired += r.actions_fired || 0;
      skipped += r.actions_skipped || 0;
      for (const [code, n] of Object.entries(r.skip_breakdown || {})) {
        skipMap[code] = (skipMap[code] || 0) + (n as number);
      }
    }
    if (!earliest || r.ran_at < earliest) earliest = r.ran_at;
    if (!latest || r.ran_at > latest) latest = r.ran_at;
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
