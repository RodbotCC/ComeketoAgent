/**
 * Journey Score — derives the four player-facing metrics from existing
 * audit signals.
 *
 *   - clarity:      0..100   (DiscoveryMap.clarity, weighted-by-slot)
 *   - readiness:    0..100   (blend of clarity + plan approval + voice clean)
 *   - restraint:    0..100   (good skips vs failures over last N heartbeats)
 *   - discovery_xp: integer  (sum of weights of known + 0.5×stale slots)
 *
 * Plus the current pipeline stage (resolved from custom fields, not from
 * lead.status_label alone — see resolveStage in discovery-map).
 *
 * Pure scoring functions take inputs; the orchestrator
 * `journeyScoreForLead(leadId)` reads the existing tables and composes.
 */

import {
  buildDiscoveryMap,
  indexCustomFields,
  resolveStage,
  type DiscoveryMap,
  type StageProgress,
} from "./discovery-map";

// ─── Skip-code classification for the restraint score ────────────────────
// The skip-code vocabulary in close.ts:741–766 IS the guardrail-discipline
// scoring system; we just classify each code as "rewarded restraint",
// "real failure", or "neutral / not applicable to journey".

export const RESTRAINT_GOOD_SKIPS = new Set<string>([
  "STOP_SIGNAL",
  "REPLY_GATE",
  "FREQUENCY_CAP",
  "FREQUENCY_CAP_24H",
  "FREQUENCY_CAP_7D",
  "VOICE_FAIL",
  "NEEDS_APPROVAL",
  "SEND_WINDOW",
  "STALE_BOX",
  "COMMITMENT_FLAG",
]);

export const RESTRAINT_BAD_SKIPS = new Set<string>([
  "CLOSE_API_ERROR",
  "HTML_FAIL",
  "WORKFLOW_MISMATCH",
  "NO_SMS_ROUTE",
  "NO_CONTACT",
]);

// All other codes (OWNERSHIP, STATUS_WON, STATUS_LOST, DAY_*, EXECUTION_*,
// ENRICHMENT_BOUNDARY, CALL_TRANSCRIPT_PENDING) are treated as neutral —
// they're operational filters, not buyer-journey decisions.

// ─── Score types ─────────────────────────────────────────────────────────

export type JourneyScore = {
  /** Discovery XP — integer sum of weights of known + 0.5×stale slots. */
  discovery_xp: number;
  /** 0..100 weighted-clarity score from DiscoveryMap. */
  clarity: number;
  /** 0..100 readiness blend (clarity + plan approval + voice clean). */
  readiness: number;
  /**
   * 0..100 restraint score over the last N heartbeats. `null` when there
   * isn't enough data (no heartbeats yet) — UI shows "—" rather than 100.
   */
  restraint: number | null;
  /** Pipeline stage progress (catering-specific). */
  stage: StageProgress;
  /** Andre's operator-set 🟢 SCORE tags from Close (multi-choice list). */
  hot_tags: string[];
  /**
   * Surfaced for the UI: count of good vs bad skips driving the restraint
   * score. Lets the Restraint panel render a chip rail with real counts.
   */
  restraint_breakdown: {
    fires: number;
    good_skips: number;
    bad_skips: number;
    neutral_skips: number;
    by_code: Record<string, number>;
  };
};

// ─── Pure scorers ────────────────────────────────────────────────────────

export function computeDiscoveryXP(map: DiscoveryMap): number {
  let xp = 0;
  for (const s of map.slots) {
    if (s.status === "known") xp += s.slot.weight;
    else if (s.status === "stale") xp += Math.round(s.slot.weight * 0.5);
  }
  return xp;
}

export type ReadinessInputs = {
  clarity: number;
  /** "none" | "draft" | "needs_review" | "approved" — closer to launchable. */
  planApprovalState: "none" | "draft" | "needs_review" | "approved";
  /** True if the latest heartbeat had no VOICE_FAIL skips. */
  voiceClean: boolean;
};

export function computeReadiness(input: ReadinessInputs): number {
  const planFactor =
    input.planApprovalState === "approved"
      ? 1.0
      : input.planApprovalState === "needs_review" || input.planApprovalState === "draft"
        ? 0.5
        : 0;
  const voiceFactor = input.voiceClean ? 1.0 : 0.5;
  const blended = 0.5 * input.clarity + 0.3 * planFactor * 100 + 0.2 * voiceFactor * 100;
  return Math.round(Math.max(0, Math.min(100, blended)));
}

export type RestraintInputs = {
  /** Aggregate skip_breakdown from last N heartbeats merged. */
  skipBreakdown: Record<string, number>;
  /** Total fires across the same window (counts as "intentional sends"). */
  fires: number;
};

export function computeRestraint(
  input: RestraintInputs
): { score: number | null; breakdown: JourneyScore["restraint_breakdown"] } {
  let good = 0;
  let bad = 0;
  let neutral = 0;
  for (const [code, n] of Object.entries(input.skipBreakdown)) {
    if (RESTRAINT_GOOD_SKIPS.has(code)) good += n;
    else if (RESTRAINT_BAD_SKIPS.has(code)) bad += n;
    else neutral += n;
  }
  const total = good + bad + input.fires;
  const score = total === 0 ? null : Math.round((100 * (good + input.fires)) / total);
  return {
    score,
    breakdown: {
      fires: input.fires,
      good_skips: good,
      bad_skips: bad,
      neutral_skips: neutral,
      by_code: { ...input.skipBreakdown },
    },
  };
}

// ─── Orchestrator (server-only — reads existing tables) ──────────────────

export async function journeyScoreForLead(
  leadId: string
): Promise<{ score: JourneyScore; map: DiscoveryMap } | { error: string }> {
  // Dynamic import so unit tests of the pure scorers don't pull in the
  // React Server Component `cache()` from load-lead-box (which crashes
  // in a vitest node env).
  const { loadLeadBoxPageData } = await import("@/app/lead/[id]/load-lead-box");
  const data = await loadLeadBoxPageData(leadId);
  if ("error" in data) return { error: data.error };

  const customFieldsMap = indexCustomFields(data.customFields);
  // lead_facts persistence retired — discovery map reads from Close only.
  const lastInboundAt = data.lastInbound?.date_created ?? null;
  const map = buildDiscoveryMap({
    customFields: customFieldsMap,
    leadFacts: undefined,
    lastInboundAt,
  });

  const lead = data.box.lead as { date_created?: string; status_label?: string };
  const stage = resolveStage({
    customFields: customFieldsMap,
    leadCreatedAt: lead.date_created ?? new Date().toISOString(),
    statusLabel: (lead.status_label || "").toLowerCase(),
  });

  // 🟢 SCORE multi-choice tags (cf_9vVeQH1oYtJbtdHoL9VPwGhNpuCzVCgi95p7MCasszj)
  const hotRaw = customFieldsMap.get("cf_9vVeQH1oYtJbtdHoL9VPwGhNpuCzVCgi95p7MCasszj");
  const hot_tags = Array.isArray(hotRaw)
    ? hotRaw.filter((x): x is string => typeof x === "string")
    : typeof hotRaw === "string" && hotRaw.length > 0
      ? [hotRaw]
      : [];

  // Plan approval state
  const plan = data.plan as ({ status?: string } & Record<string, unknown>) | null;
  const planApprovalState: ReadinessInputs["planApprovalState"] = !plan
    ? "none"
    : plan.status === "approved" || plan.status === "active"
      ? "approved"
      : plan.status === "needs_review"
        ? "needs_review"
        : "draft";

  // Restraint over last 10 lead-scoped heartbeats. Aggregates skip_breakdown
  // and fires across runs so a single sweep doesn't dominate.
  // Phase 6: file-canonical via harness-heartbeat.
  const { listRecentHeartbeatRuns } = await import("./harness-heartbeat");
  const allRecent = await listRecentHeartbeatRuns(500, 14);
  const hbRows = allRecent
    .filter((r) => r.close_lead_id === leadId)
    .slice(0, 10);

  const aggregatedSkips: Record<string, number> = {};
  let aggregatedFires = 0;
  for (const r of hbRows) {
    for (const [code, n] of Object.entries(r.skip_breakdown ?? {})) {
      aggregatedSkips[code] = (aggregatedSkips[code] ?? 0) + (n ?? 0);
    }
    aggregatedFires += r.actions_fired ?? 0;
  }
  const restraint = computeRestraint({ skipBreakdown: aggregatedSkips, fires: aggregatedFires });

  // Voice-clean = no VOICE_FAIL in latest heartbeat
  const latest = data.latestHeartbeat as { skip_breakdown?: Record<string, number> } | null;
  const voiceClean = !latest?.skip_breakdown?.VOICE_FAIL;

  const readiness = computeReadiness({
    clarity: map.clarity,
    planApprovalState,
    voiceClean,
  });

  const score: JourneyScore = {
    discovery_xp: computeDiscoveryXP(map),
    clarity: map.clarity,
    readiness,
    restraint: restraint.score,
    stage,
    hot_tags,
    restraint_breakdown: restraint.breakdown,
  };

  return { score, map };
}
