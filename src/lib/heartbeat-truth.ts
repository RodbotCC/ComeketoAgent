/**
 * Operator-truth aggregator for `/heartbeat`.
 *
 * The historical aggregator (`aggregateLast24h` in `heartbeat.ts`) sums every
 * action across every gate and reports "X eligible / Y fired / Z skipped" —
 * math that's correct but reads as failure when most of the skip volume is
 * `DAY_NOT_TODAY` (scheduled for other days in the cycle, working as designed).
 *
 * This module reads `heartbeat_runs.report` (DayVerdict[]) and walks the
 * latest-per-lead runs to answer the question Andre's actually asking:
 *
 *   1. **Today eligible** — actions in the catchup window across all leads.
 *   2. **Waiting on you** — today-eligible actions blocked on operator action
 *      (DAY_NOT_APPROVED in multi-op, EXECUTION_DISABLED when draft mode is on).
 *   3. **Fired today** — actions that actually wrote to Close.
 *
 * Pure read; no DB writes. Server-only (uses the service-role Supabase client).
 */
import { getSupabaseServer } from "./supabase";
import type { DayVerdict, ActionVerdict } from "./heartbeat";
import type { PlannedTouchpoint } from "./plan";

export type HeartbeatTruthAction = {
  lead_id: string;
  plan_id: string | null;
  day_index: number;
  day_number: number;
  date: string;
  channel: PlannedTouchpoint["channel"];
  intent: string;
};

export type HeartbeatTruthFire = HeartbeatTruthAction & {
  fired_at: string;
  close_kind: string | null;
  close_id: string | null;
};

export type HeartbeatTruthWait = HeartbeatTruthAction & {
  skip_code: string;
  reason: string;
};

export type HeartbeatTruthSummary = {
  // Operator-truth headline numbers.
  today_eligible: number;
  waiting_count: number;
  fired_count: number;
  // Inline lists for the dashboard cards (capped at the page level).
  waiting_on_approval: HeartbeatTruthWait[];
  fired_today: HeartbeatTruthFire[];
  // Forensics breakdown.
  not_today_count: number;
  /** Today-eligible actions blocked by NON-operator gates (window/freq/stale/voice/etc).
   *  Sorted desc by count. */
  gated_today: Array<{ code: string; count: number }>;
  // Existing-shape rollups (carried over for the forensics collapse on the page).
  total_actions_eligible: number;
  total_actions_skipped: number;
  total_actions_fired: number;
  total_skip_breakdown: Record<string, number>;
  earliest_ran_at: string | null;
  latest_ran_at: string | null;
  lead_run_count: number;
  sweep_summary_count: number;
};

/** Skip codes that mean "operator needs to do something." */
const WAITING_ON_OPERATOR_CODES = new Set<string>([
  "DAY_NOT_APPROVED",   // multi-op mode — operator hasn't clicked Approve
  "EXECUTION_DISABLED", // any mode — operator hasn't flipped to live execution
]);

/** Defensive type guard — heartbeat_runs.report (jsonb) might be older shape. */
function isDayVerdictArray(x: unknown): x is DayVerdict[] {
  if (!Array.isArray(x)) return false;
  if (x.length === 0) return true; // empty array is fine
  const first = x[0] as Record<string, unknown>;
  return (
    typeof first === "object" &&
    first !== null &&
    "day_index" in first &&
    "actions" in first &&
    Array.isArray(first.actions)
  );
}

/**
 * Aggregate operator-truth from the last 24h of heartbeat_runs.
 *
 * Strategy:
 *   - For "today eligible / waiting / gated": use only the LATEST lead-scope
 *     run per lead within 24h (current state — older runs are stale).
 *   - For "fired today": walk EVERY lead-scope run and collect each fired
 *     action with `executed` present (each represents a real Close write).
 */
export async function aggregateOperatorTruth(): Promise<HeartbeatTruthSummary> {
  const sb = getSupabaseServer();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("heartbeat_runs")
    .select(
      "id, scope, ran_at, plan_id, close_lead_id, actions_eligible, actions_fired, actions_skipped, skip_breakdown, report"
    )
    .gte("ran_at", since)
    .order("ran_at", { ascending: false });
  if (error) throw new Error(`aggregateOperatorTruth failed: ${error.message}`);
  const rows = (data as Array<Record<string, unknown>>) ?? [];

  let sweep_summary_count = 0;
  let lead_run_count = 0;
  let total_actions_eligible = 0;
  let total_actions_skipped = 0;
  let total_actions_fired = 0;
  const total_skip_breakdown: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  // Track the latest per-lead row (rows are pre-sorted desc, so the first one
  // we see for any lead_id is the latest).
  const latestPerLead = new Map<string, Record<string, unknown>>();
  // Every row that contains at least one fire — needed for fired_today reconstruction.
  const fireRows: Record<string, unknown>[] = [];

  for (const r of rows) {
    const ran_at = String(r.ran_at);
    if (!earliest || ran_at < earliest) earliest = ran_at;
    if (!latest || ran_at > latest) latest = ran_at;

    if (r.scope === "all") {
      sweep_summary_count += 1;
      continue;
    }
    lead_run_count += 1;
    total_actions_eligible += Number(r.actions_eligible) || 0;
    total_actions_skipped += Number(r.actions_skipped) || 0;
    total_actions_fired += Number(r.actions_fired) || 0;
    for (const [code, n] of Object.entries((r.skip_breakdown as Record<string, number>) || {})) {
      total_skip_breakdown[code] = (total_skip_breakdown[code] || 0) + (Number(n) || 0);
    }

    const leadId = r.close_lead_id ? String(r.close_lead_id) : "";
    if (leadId && !latestPerLead.has(leadId)) latestPerLead.set(leadId, r);
    if ((Number(r.actions_fired) || 0) > 0) fireRows.push(r);
  }

  // Walk current-state lead rows for today_eligible / waiting / gated.
  let today_eligible = 0;
  let not_today_count = 0;
  const waiting_on_approval: HeartbeatTruthWait[] = [];
  const gatedTodayMap: Record<string, number> = {};

  for (const r of latestPerLead.values()) {
    const leadId = String(r.close_lead_id || "");
    const planId = r.plan_id ? String(r.plan_id) : null;
    const days = r.report;
    if (!isDayVerdictArray(days)) continue;
    for (const d of days) {
      const isToday = Boolean(d.is_today);
      for (const a of d.actions ?? []) {
        if (!isToday) {
          not_today_count += 1;
          continue;
        }
        today_eligible += 1;
        const v = a.verdict as ActionVerdict;
        if (v.fire) continue; // fires reconstructed below from fireRows
        const code = v.skip_code;
        if (WAITING_ON_OPERATOR_CODES.has(code)) {
          waiting_on_approval.push({
            lead_id: leadId,
            plan_id: planId,
            day_index: d.day_index,
            day_number: d.day_number,
            date: d.date,
            channel: a.channel,
            intent: a.intent,
            skip_code: code,
            reason: v.reason,
          });
        } else {
          gatedTodayMap[code] = (gatedTodayMap[code] || 0) + 1;
        }
      }
    }
  }

  // Walk every fire-bearing row in 24h to build fired_today. Each entry is a
  // real Close write (verdict.reason === "fired" + executed present).
  const fired_today: HeartbeatTruthFire[] = [];
  for (const r of fireRows) {
    const leadId = String(r.close_lead_id || "");
    const planId = r.plan_id ? String(r.plan_id) : null;
    const ranAt = String(r.ran_at);
    const days = r.report;
    if (!isDayVerdictArray(days)) continue;
    for (const d of days) {
      for (const a of d.actions ?? []) {
        const v = a.verdict as ActionVerdict;
        if (!v.fire) continue;
        if (v.reason !== "fired") continue; // skip "would-fire" — no Close write happened
        const executed = "executed" in v ? v.executed : undefined;
        if (!executed) continue;
        fired_today.push({
          lead_id: leadId,
          plan_id: planId,
          day_index: d.day_index,
          day_number: d.day_number,
          date: d.date,
          channel: a.channel,
          intent: a.intent,
          fired_at: ranAt,
          close_kind: executed.kind ?? null,
          close_id: executed.close_id ?? null,
        });
      }
    }
  }

  // Sort fired list newest-first so the dashboard shows latest wins on top.
  fired_today.sort((x, y) => (x.fired_at < y.fired_at ? 1 : -1));

  const gated_today = Object.entries(gatedTodayMap)
    .sort((x, y) => y[1] - x[1])
    .map(([code, count]) => ({ code, count }));

  return {
    today_eligible,
    waiting_count: waiting_on_approval.length,
    fired_count: fired_today.length,
    waiting_on_approval,
    fired_today,
    not_today_count,
    gated_today,
    total_actions_eligible,
    total_actions_skipped,
    total_actions_fired,
    total_skip_breakdown,
    earliest_ran_at: earliest,
    latest_ran_at: latest,
    lead_run_count,
    sweep_summary_count,
  };
}
