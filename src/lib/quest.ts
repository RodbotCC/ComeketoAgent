/**
 * Quest synthesizer — deterministic, rule-based for v1.
 *
 * Given a lead's DiscoveryMap + StageProgress + plan, produce a Quest
 * card with: current task, optional bonus, risk, and recommended move.
 *
 * Rule-based by design — keeps the demo cost-bounded and predictable. A
 * future v2 can swap in an LLM call for richer phrasing using the same
 * inputs.
 */

import type {
  DiscoveryMap,
  SlotState,
  StageProgress,
  PipelineStageId,
  SlotCategory,
} from "./discovery-map";

export type Quest = {
  current: { title: string; body: string; slot_id: string | null };
  bonus: { title: string; body: string; slot_id: string | null } | null;
  risk: { title: string; body: string } | null;
  recommended_move: { headline: string; question: string | null };
};

type PlanLite = {
  status?: string;
  best_next_question?: string;
  primary_goal?: { kind: string; details?: string };
  days?: { day_number: number; required_actions?: { intent: string; channel: string }[] }[];
} | null;

const CATEGORY_PRIORITY: SlotCategory[] = ["quest", "clarity", "consequence"];

function pickUnknown(map: DiscoveryMap, exclude: Set<string>): SlotState | null {
  for (const cat of CATEGORY_PRIORITY) {
    // Within a category, prefer the highest-weight unknown
    const candidates = map.slots
      .filter((s) => s.slot.category === cat)
      .filter((s) => s.status === "unknown" || s.status === "stale")
      .filter((s) => !exclude.has(s.slot.id))
      .sort((a, b) => b.slot.weight - a.slot.weight);
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}

const STAGE_RECOMMENDATIONS: Record<PipelineStageId, string> = {
  lead: "Open with a single discovery question — get the date or venue on the table.",
  discovery_started: "Stack two more discovery facts before pitching anything.",
  tasting_booked: "Confirm the tasting in the next outreach. Build anticipation, don't sell.",
  tasting_done: "Recap what they liked, then ask the consequence question (timeline / decision-maker).",
  beo_sent: "Don't repitch — ask the smallest clarifying question that unblocks the signature.",
  agreement_signed: "Move to logistics. Confirm deposit timing and event-day contact.",
  deposit_in: "Pre-event hospitality cadence: confirmations, head-count locks, dietary final pass.",
  event_won: "Post-event review request + handoff to retention.",
  lost: "No active quest — log lost reason and let the cool-off cadence run.",
};

function detectRisk(
  map: DiscoveryMap,
  stage: StageProgress,
  plan: PlanLite
): { title: string; body: string } | null {
  const knownIds = new Set(
    map.slots.filter((s) => s.status === "known").map((s) => s.slot.id)
  );

  // Risk 1: Plan calls for proposal/contract action without budget known
  const planMentionsProposal = (plan?.days ?? []).some((d) =>
    (d.required_actions ?? []).some((a) =>
      /proposal|quote|beo|contract|agreement/i.test(a.intent || "")
    )
  );
  if (planMentionsProposal && !knownIds.has("budget")) {
    return {
      title: "Premature proposal risk",
      body: "Plan mentions a proposal/quote action but Budget is unknown. Ask the budget-range question before sending pricing.",
    };
  }

  // Risk 2: BEO/agreement stage with unknown guest_count
  if (
    (stage.current === "beo_sent" || stage.current === "agreement_signed") &&
    !knownIds.has("guest_count")
  ) {
    return {
      title: "Quoting on guess",
      body: "We're past BEO without a confirmed guest count. The quote is variable until that lands.",
    };
  }

  // Risk 3: Tasting done with no decision_timeline
  if (stage.current === "tasting_done" && !knownIds.has("decision_timeline")) {
    return {
      title: "Open-ended tasting",
      body: "Tasting completed but we don't have a decision timeline. Risk: silent drift. Ask when they need to decide.",
    };
  }

  // Risk 4: Plan stale (status_label has 'lost' or plan was killed)
  if (plan?.status === "killed" || plan?.status === "paused") {
    return {
      title: "Plan inactive",
      body: `Plan status is "${plan.status}" — the cycle isn't running. Decide whether to revive, regenerate, or close out.`,
    };
  }

  // Risk 5: Clarity below 30 — proposing anything is high-risk
  if (map.clarity < 30) {
    return {
      title: "Low clarity",
      body: "Discovery is below 30%. Any outreach right now is firing into fog — fill at least 2 quest-category slots before pitching.",
    };
  }

  return null;
}

export function synthesizeQuest(
  map: DiscoveryMap,
  stage: StageProgress,
  plan: PlanLite
): Quest {
  // 1. Current quest = highest-priority unknown slot
  const currentSlot = pickUnknown(map, new Set());
  const current = currentSlot
    ? {
        title: `Confirm ${currentSlot.slot.label.toLowerCase()}`,
        body: currentSlot.slot.why_it_matters,
        slot_id: currentSlot.slot.id,
      }
    : {
        title: "All discovery slots known",
        body: "Move to consequence questions or advance the pipeline stage.",
        slot_id: null,
      };

  // 2. Bonus = next-priority unknown
  const exclude = new Set(currentSlot ? [currentSlot.slot.id] : []);
  const bonusSlot = pickUnknown(map, exclude);
  const bonus = bonusSlot
    ? {
        title: `Bonus — ${bonusSlot.slot.label.toLowerCase()}`,
        body: bonusSlot.slot.why_it_matters,
        slot_id: bonusSlot.slot.id,
      }
    : null;

  // 3. Risk
  const risk = detectRisk(map, stage, plan);

  // 4. Recommended move
  const stageHeadline = STAGE_RECOMMENDATIONS[stage.current];
  const planQuestion = plan?.best_next_question?.trim() || null;
  const recommended_move = {
    headline: stageHeadline,
    question:
      planQuestion ??
      (currentSlot
        ? questionForSlot(currentSlot.slot.id, currentSlot.slot.label)
        : null),
  };

  return { current, bonus, risk, recommended_move };
}

function questionForSlot(slotId: string, label: string): string {
  // NEPQ-style "ask, don't pitch" templates per slot.
  switch (slotId) {
    case "event_date":
      return "Out of curiosity — when's the actual event date you're working toward?";
    case "venue":
      return "Have you locked the venue yet, or are you still weighing options?";
    case "location":
      return "Where's the event happening? Helps me know if our crews can serve cleanly.";
    case "client_type":
      return "Are you organizing this for yourself, or are you the venue / planner?";
    case "budget":
      return "What range are you working with on food per head, ballpark?";
    case "guest_count":
      return "How many guests are you expecting — same as the tasting or different?";
    case "service_style":
      return "Do you picture this as a buffet, plated, family-style — or somewhere in between?";
    case "decision_timeline":
      return "When do you need to have a caterer locked in by?";
    case "dietary_constraints":
      return "Any allergies, vegan / kosher / kid-menu needs we should plan around?";
    default:
      return `Could you share a bit about ${label.toLowerCase()}?`;
  }
}
