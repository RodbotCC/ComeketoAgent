/**
 * Pipeline state aggregator — Lane A.
 *
 * Answers the morning-briefing question in one call: "what's my morning?"
 * Cross-cuts active plans + last 24h of heartbeat runs to produce a compact
 * structured shape that chat can render as a widget instead of forcing the
 * operator over to /heartbeat.
 *
 * Design constraint: the chat UI persists tool-call summaries truncated at
 * 600 chars. Lists are capped to a few example items so the widget can render
 * structured content without falling through to a generic JSON pre.
 *
 * Sources of truth:
 * - `lead_plans` (Supabase) for what's planned across active cycles
 * - `heartbeat_runs` (Supabase, last 24h, scope='lead') for what actually
 *   fired and why other actions were skipped
 * - `closeListLeadsByAssignee` (Close REST) for owner-filtered name map
 */

import { getSupabaseServer } from "./supabase";
import { closeListLeadsByAssignee, type CloseLead } from "./close";
import { env } from "./env";
import { getSettings } from "./settings";
import type { SevenDayPlanDay, PlanChannel } from "./plan";

export type PipelineOwner = "andre" | "jake" | "all";

/** Compact action reference — uses short keys to fit lists inside the
 * 600-char widget summary budget. */
export type PipelineActionRef = {
  lead_id: string;
  name: string;       // display_name (or short id when name unavailable)
  channel: PlanChannel | string;
  intent: string;     // truncated to ~60 chars
  day?: number;       // day number within the cycle
};

export type PipelineStateOut = {
  owner: PipelineOwner;
  generated_at: string;
  solo_mode: boolean;       // tells agent which gates are active
  plans_active: number;     // total active plans for this owner
  today_eligible: number;   // total actions whose day is in the catchup window and not skipped/sent
  waiting_count: number;    // subset of today_eligible whose day approval is needs_review/not_ready/draft
  fired_count: number;      // count of actions that actually fired in last 24h
  waiting_top: PipelineActionRef[];   // up to 5 examples, full list omitted to fit summary
  fired_top: PipelineActionRef[];     // up to 5 examples
  gated_top: Array<{ code: string; count: number }>;  // up to 6
};

const DAY_CATCHUP_WINDOW_DAYS = 2; // mirrors lib/heartbeat.ts
// Caps tightened in R2 to keep the JSON-stringified payload under the chat
// widget's 600-char `cmk:tools` summary budget so the structured widget
// renders reliably instead of falling through to the raw-JSON path.
const EXAMPLE_CAP = 3;  // was 5 — at 5, full lead_ids + names overran the budget
const GATED_CAP = 5;    // was 6
const INTENT_TRIM = 40; // was 60 — trims to first ~40 chars + ellipsis

function isTodayOrCatchup(dayDate: Date, now: Date): boolean {
  const aMid = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate()
  ).getTime();
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const deltaDays = Math.round((nMid - aMid) / 86_400_000);
  return deltaDays >= 0 && deltaDays <= DAY_CATCHUP_WINDOW_DAYS;
}

function trimIntent(s: string): string {
  if (!s) return "";
  if (s.length <= INTENT_TRIM) return s;
  return s.slice(0, INTENT_TRIM - 1) + "…";
}

function shortLeadName(leadId: string, nameMap: Map<string, string>): string {
  const found = nameMap.get(leadId);
  if (found) return found;
  // last 8 chars of lead id as fallback identifier
  return leadId.length > 12 ? `…${leadId.slice(-8)}` : leadId;
}

type PlanRow = {
  id: string;
  close_lead_id: string;
  cycle_started_at: string;
  status: string;
  days: SevenDayPlanDay[];
};

type HeartbeatRow = {
  close_lead_id: string | null;
  ran_at: string;
  scope: "lead" | "all" | "manual";
  skip_breakdown: Record<string, number>;
  report: unknown; // For scope='lead' it's DayVerdict[]
};

/** Walk an array of plan rows and bucket today-actions into eligible + waiting. */
function walkPlansForToday(
  plans: PlanRow[],
  nameMap: Map<string, string>,
  now: Date
): {
  today_eligible: number;
  waiting_count: number;
  waiting_top: PipelineActionRef[];
} {
  let today_eligible = 0;
  let waiting_count = 0;
  const waiting_top: PipelineActionRef[] = [];

  for (const plan of plans) {
    const cycleStart = new Date(plan.cycle_started_at);
    if (Number.isNaN(cycleStart.getTime())) continue;

    const days = (plan.days ?? []) as SevenDayPlanDay[];
    for (let idx = 0; idx < days.length; idx++) {
      const day = days[idx];
      if (!day) continue;

      const dayDate = new Date(cycleStart);
      dayDate.setDate(cycleStart.getDate() + idx);
      if (!isTodayOrCatchup(dayDate, now)) continue;

      // Skipped + already-sent days don't count as eligible — they're closed.
      if (day.approval_status === "skipped") continue;
      if (day.approval_status === "sent") continue;

      const isWaiting =
        day.approval_status === "needs_review" ||
        day.approval_status === "not_ready" ||
        // Treat undefined/draft as waiting too — operator hasn't decided.
        !day.approval_status;

      for (const action of day.required_actions ?? []) {
        today_eligible += 1;
        if (isWaiting) {
          waiting_count += 1;
          if (waiting_top.length < EXAMPLE_CAP) {
            waiting_top.push({
              lead_id: plan.close_lead_id,
              name: shortLeadName(plan.close_lead_id, nameMap),
              channel: action.channel,
              intent: trimIntent(action.intent || ""),
              day: day.day,
            });
          }
        }
      }
    }
  }

  return { today_eligible, waiting_count, waiting_top };
}

/** Walk recent heartbeat runs (last 24h, scope='lead') to find:
 *  (a) actions that fired
 *  (b) skip-code aggregation for the gated panel */
function walkHeartbeatRuns(
  rows: HeartbeatRow[],
  nameMap: Map<string, string>,
  ownerScope: Set<string> | null
): {
  fired_count: number;
  fired_top: PipelineActionRef[];
  gated_top: Array<{ code: string; count: number }>;
} {
  // Dedup by plan_id keeping most recent — heartbeat may have run multiple
  // times for the same plan in 24h and we only want each plan counted once
  // for the "current" snapshot. But the rows we get already have
  // close_lead_id, so dedup by lead_id (most recent ran_at).
  const latestByLead = new Map<string, HeartbeatRow>();
  for (const r of rows) {
    if (!r.close_lead_id) continue;
    if (ownerScope && !ownerScope.has(r.close_lead_id)) continue;
    const prev = latestByLead.get(r.close_lead_id);
    if (!prev || r.ran_at > prev.ran_at) {
      latestByLead.set(r.close_lead_id, r);
    }
  }

  let fired_count = 0;
  const fired_top: PipelineActionRef[] = [];
  const gateAccum: Record<string, number> = {};

  for (const r of latestByLead.values()) {
    // Skip-code aggregation — sum across the latest-per-lead snapshot.
    for (const [code, count] of Object.entries(r.skip_breakdown ?? {})) {
      gateAccum[code] = (gateAccum[code] ?? 0) + (typeof count === "number" ? count : 0);
    }

    // Walk report for fired actions. report shape for scope='lead' is
    // DayVerdict[] (see lib/heartbeat.ts:503).
    const days = Array.isArray(r.report) ? (r.report as Array<Record<string, unknown>>) : [];
    for (const day of days) {
      const isToday = Boolean(day.is_today);
      if (!isToday) continue;
      const actions = (day.actions as Array<Record<string, unknown>>) ?? [];
      for (const a of actions) {
        const verdict = a.verdict as { fire?: boolean; reason?: string } | undefined;
        if (verdict?.fire && verdict.reason === "fired") {
          fired_count += 1;
          if (fired_top.length < EXAMPLE_CAP) {
            const lead_id = r.close_lead_id || "";
            fired_top.push({
              lead_id,
              name: shortLeadName(lead_id, nameMap),
              channel: (a.channel as string) || "—",
              intent: trimIntent((a.intent as string) || ""),
              day: typeof day.day_number === "number" ? day.day_number : undefined,
            });
          }
        }
      }
    }
  }

  const gated_top = Object.entries(gateAccum)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, GATED_CAP);

  return { fired_count, fired_top, gated_top };
}

/**
 * Aggregate the morning-briefing state for one owner (or all).
 *
 * Returns a compact, JSON-stringify-friendly shape designed to fit in the
 * chat UI's 600-char tool-result summary budget so the widget renders
 * structured content rather than truncated JSON.
 */
export async function pipelineStateForOwner(
  owner: PipelineOwner = "andre"
): Promise<PipelineStateOut> {
  const sb = getSupabaseServer();
  const settings = await getSettings();

  // 1) Owner → user_id resolution + name map. For 'all' we don't filter and
  //    accept short-id fallbacks for names.
  const ownerUserId =
    owner === "andre" ? env.CLOSE_USER_ID_ANDRE :
    owner === "jake" ? env.CLOSE_USER_ID_JAKE :
    "";

  let ownerLeads: CloseLead[] = [];
  if (ownerUserId) {
    try {
      ownerLeads = await closeListLeadsByAssignee(ownerUserId, 200);
    } catch {
      // Fail soft: empty name map means short-id fallback in widget.
      ownerLeads = [];
    }
  }
  const nameMap = new Map(
    ownerLeads.map((l) => [l.id, l.display_name || l.name || l.id])
  );
  const ownerLeadIds = ownerUserId
    ? new Set(ownerLeads.map((l) => l.id))
    : null;

  // 2) Active plans (draft + approved + active — heartbeat sweeps these too).
  const { data: planRows, error: planErr } = await sb
    .from("lead_plans")
    .select("id, close_lead_id, cycle_started_at, status, days")
    .in("status", ["draft", "approved", "active"]);
  if (planErr) {
    throw new Error(`pipelineStateForOwner plans read failed: ${planErr.message}`);
  }
  const allPlans = (planRows as PlanRow[]) ?? [];
  const scopedPlans =
    ownerLeadIds === null
      ? allPlans
      : allPlans.filter((p) => ownerLeadIds.has(p.close_lead_id));

  const now = new Date();
  const planWalk = walkPlansForToday(scopedPlans, nameMap, now);

  // 3) Heartbeat runs from last 24h, scope='lead' (sweep summaries excluded).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: hbRows, error: hbErr } = await sb
    .from("heartbeat_runs")
    .select("close_lead_id, ran_at, scope, skip_breakdown, report")
    .eq("scope", "lead")
    .gte("ran_at", since);
  if (hbErr) {
    throw new Error(`pipelineStateForOwner heartbeat read failed: ${hbErr.message}`);
  }
  const hbWalk = walkHeartbeatRuns(
    (hbRows as HeartbeatRow[]) ?? [],
    nameMap,
    ownerLeadIds
  );

  return {
    owner,
    generated_at: now.toISOString(),
    solo_mode: Boolean(settings.solo_operator),
    plans_active: scopedPlans.length,
    today_eligible: planWalk.today_eligible,
    waiting_count: planWalk.waiting_count,
    fired_count: hbWalk.fired_count,
    waiting_top: planWalk.waiting_top,
    fired_top: hbWalk.fired_top,
    gated_top: hbWalk.gated_top,
  };
}
