/**
 * Discovery Map — canonical fact slots for the catering buyer journey.
 *
 * The "what we need to know about this lead" contract. Powers the
 * /lead/[id]/discovery surface, the journey-score readiness/clarity
 * metrics, and quest synthesis.
 *
 * Slot ids and `close_custom_key` values are mirrored to Andre's actual
 * Close custom-field schema (read via find_lead_custom_fields on
 * 2026-05-05). Five slots resolve directly from canonical Close fields;
 * four are LLM-extracted from Box content (emails / call transcripts /
 * notes) and persisted to the `lead_facts` table.
 *
 * Pure module: no DB, no API calls. Resolver and aggregator take the
 * already-loaded LeadBoxPageData.customFields + activities + an optional
 * lead_facts map. Higher-level callers (server components, composite
 * tools) compose with persistence.
 */

export type SlotCategory = "quest" | "clarity" | "consequence";
export type SlotSource = "close_custom" | "llm_extraction" | "operator";
export type SlotStatus = "known" | "unknown" | "stale";

export type DiscoverySlot = {
  id: string;
  label: string;
  category: SlotCategory;
  /** Slot weight for clarity score; higher = more important. */
  weight: number;
  /**
   * Canonical Close custom-field id (`cf_…`) when the slot resolves from
   * Close directly. `null` for LLM-extracted-only slots. Composite keys
   * (e.g. address+city+distance) use the primary key here and consult
   * `extra_close_keys` for the rest.
   */
  close_custom_key: string | null;
  /** Additional Close keys merged into the resolved value (composite slots). */
  extra_close_keys?: string[];
  /** One-liner shown next to the slot when unknown — feeds quest synth. */
  why_it_matters: string;
};

export type LeadFactRecord = {
  slot_id: string;
  value: unknown;
  source: Exclude<SlotSource, "close_custom">;
  evidence?: { activity_id?: string; excerpt?: string; confidence?: number } | null;
  extracted_at: string;
};

export type SlotState = {
  slot: DiscoverySlot;
  status: SlotStatus;
  value: unknown | null;
  source: SlotSource | null;
  evidence?: LeadFactRecord["evidence"] | null;
  /** ISO timestamp the value was last observed (close write or extracted_at). */
  observed_at: string | null;
};

export type DiscoveryMap = {
  slots: SlotState[];
  /** 0..1 fraction of slots known (stale counts as half). */
  completeness: number;
  /** 0..100 weighted-by-slot.weight clarity score. */
  clarity: number;
  by_category: Record<SlotCategory, { known: number; total: number }>;
};

// ─── Pipeline Stage track ────────────────────────────────────────────────

export type PipelineStageId =
  | "lead"
  | "discovery_started"
  | "tasting_booked"
  | "tasting_done"
  | "beo_sent"
  | "agreement_signed"
  | "deposit_in"
  | "event_won"
  | "lost";

export type PipelineStage = {
  id: PipelineStageId;
  label: string;
  /** Deterministic check against customFields + lead state. */
  reached: (ctx: StageCtx) => boolean;
  /** Best-effort timestamp ISO when the stage was reached, or null. */
  reached_at: (ctx: StageCtx) => string | null;
};

export type StageCtx = {
  customFields: ReadonlyMap<string, unknown>;
  /** ISO date_created for the lead — earliest possible stage timestamp. */
  leadCreatedAt: string;
  /** Close lead.status_label, lowercased. */
  statusLabel: string;
};

// ─── Slot definitions ────────────────────────────────────────────────────
// Five canonical-Close slots first (in importance order), then four LLM-only.

export const DISCOVERY_SLOTS: readonly DiscoverySlot[] = [
  {
    id: "event_date",
    label: "Event date",
    category: "quest",
    weight: 18,
    close_custom_key: "cf_FV2xBkviv7BAQZkkjUf8NUOc3fOpPTObMy5lVxZbyiP", // Date of Event
    why_it_matters:
      "Without a date we can't sequence anything — no tasting, no BEO, no urgency.",
  },
  {
    id: "venue",
    label: "Venue",
    category: "quest",
    weight: 14,
    close_custom_key: "cf_bMmcNeKx2ltaIMgNPLXg3cQCVcKguZe28ilBnOilnO5", // Venue Name
    why_it_matters:
      "Tells us logistics, kitchen access, and whether they're shopping or committed.",
  },
  {
    id: "location",
    label: "Location",
    category: "quest",
    weight: 10,
    close_custom_key: "cf_l7gEKQsPZLqjEw35V4WB6ewUuc84dS3nohisc0BeCdy", // Address
    extra_close_keys: [
      "cf_xD3AKAnhwHeZy3OAUrZvbbFYiDPFwtFfTrSLAbDbmA2", // 🏠 City
      "cf_pXTVEI1DdERiT91NKuWAndlV6WuS4n6ZG2334fBR4b8", // 🏠 Zip Code
      "cf_jTUqt7xP9Pv2UrBiqPnmPpg49KPZIPW9pjAlbtXQ5iL", // 🏠 Distance
    ],
    why_it_matters:
      "Distance drives travel-fee math and which crews can serve. Fills service-area decisions.",
  },
  {
    id: "client_type",
    label: "Client type",
    category: "quest",
    weight: 8,
    close_custom_key: "cf_QfX8ZrR1sRNYK67a1hsggbrqzpVKnYSNXdHJNTOH46k", // Client Type (Consumer / Venue)
    why_it_matters:
      "B2C vs B2B changes the script entirely — venue partners get a different motion than end consumers.",
  },
  {
    id: "budget",
    label: "Budget",
    category: "clarity",
    weight: 16,
    close_custom_key: "cf_imMCu3Pod85W2K5ZkVUjBD7m3E5iZxbSf3mueeNpibM", // Wedding Budget
    why_it_matters:
      "Without a budget range we're guessing on package fit — proposals go out unanchored.",
  },
  // ─── LLM-extracted slots ─────────────────────────────────────────────
  {
    id: "guest_count",
    label: "Guest count",
    category: "clarity",
    weight: 14,
    // Tasting Event Party Size as fallback hint, but the real number comes
    // from event communications (often differs from tasting headcount).
    close_custom_key: null,
    extra_close_keys: [
      "cf_Ji1VNYJHnXT7CGi2VPOVnaO5FxslWkOAdtitKBH1QIM", // Tasting Event Party Size (proxy hint)
    ],
    why_it_matters:
      "Drives quote, food quantity, and staffing. The single biggest variance lever in a catering quote.",
  },
  {
    id: "service_style",
    label: "Service style",
    category: "clarity",
    weight: 10,
    close_custom_key: null,
    why_it_matters:
      "Buffet / plated / family / stations / passed — each is a different operation and price.",
  },
  {
    id: "decision_timeline",
    label: "Decision timeline",
    category: "consequence",
    weight: 12,
    close_custom_key: null,
    why_it_matters:
      "When are they signing? Without this we can't tell if we're in a closing window or a fishing trip.",
  },
  {
    id: "dietary_constraints",
    label: "Dietary constraints",
    category: "consequence",
    weight: 8,
    close_custom_key: null,
    why_it_matters:
      "Allergies / vegan / kosher / kid menu — late surprises here blow up the kitchen on event day.",
  },
] as const;

// Sanity: keep visual-grid 9-slot ceiling locked.
if (DISCOVERY_SLOTS.length !== 9) {
  // Build-time check via no-op; throws if someone edits the array carelessly.
  throw new Error(
    `discovery-map: DISCOVERY_SLOTS must hold exactly 9 entries (got ${DISCOVERY_SLOTS.length}).`
  );
}

// ─── Pipeline stage definitions ──────────────────────────────────────────
// All keys reference Close custom fields verified on 2026-05-05.

const CF_VISIT_STATUS = "cf_GGYkQSVNFOgGaPQ0GjFaTKdlyKpBNu3uEs7cHvBtXwQ"; // BOOKED / CANCELED
const CF_VISIT_DATE = "cf_pwsRX35x1yQARZ5o0oBmSZyt69uoROzrI4NofjCcpyp";
const CF_BEO_STATUS = "cf_pic3ufMdrIRgABujfMuf9mWHkFRHBJPMHKnALFq1s9c"; // 01..03
const CF_AGREEMENT_STATUS = "cf_9DKFeuKphaS8HcK70MkP5mXMKCKbq8LCBQFqb3OgRH7"; // 01..04
const CF_DEPOSIT_DATE = "cf_QpQkq9FJreb7tNkzGTZhyvlflmhTv7yy1Ls7OttDrL6";
const CF_EVENT_DATE = "cf_FV2xBkviv7BAQZkkjUf8NUOc3fOpPTObMy5lVxZbyiP";
const CF_VENUE_NAME = "cf_bMmcNeKx2ltaIMgNPLXg3cQCVcKguZe28ilBnOilnO5";

function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  return String(v);
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    id: "lead",
    label: "Lead",
    reached: () => true,
    reached_at: (ctx) => ctx.leadCreatedAt,
  },
  {
    id: "discovery_started",
    label: "Discovery",
    reached: (ctx) =>
      isPresent(ctx.customFields.get(CF_EVENT_DATE)) ||
      isPresent(ctx.customFields.get(CF_VENUE_NAME)),
    reached_at: (ctx) => {
      const ed = ctx.customFields.get(CF_EVENT_DATE);
      // Event date as a string; we can't infer when discovery *started*, so
      // fall back to lead creation when any discovery fact is present.
      if (isPresent(ed) || isPresent(ctx.customFields.get(CF_VENUE_NAME))) {
        return ctx.leadCreatedAt;
      }
      return null;
    },
  },
  {
    id: "tasting_booked",
    label: "Tasting booked",
    reached: (ctx) => asString(ctx.customFields.get(CF_VISIT_STATUS)).toUpperCase().includes("BOOKED"),
    reached_at: (ctx) => {
      const v = ctx.customFields.get(CF_VISIT_DATE);
      return isPresent(v) ? asString(v) : null;
    },
  },
  {
    id: "tasting_done",
    label: "Tasting done",
    reached: (ctx) => {
      const visitStatus = asString(ctx.customFields.get(CF_VISIT_STATUS)).toUpperCase();
      const visitDate = ctx.customFields.get(CF_VISIT_DATE);
      if (!visitStatus.includes("BOOKED")) return false;
      if (!isPresent(visitDate)) return false;
      const t = Date.parse(asString(visitDate));
      return Number.isFinite(t) && t < Date.now();
    },
    reached_at: (ctx) => {
      const v = ctx.customFields.get(CF_VISIT_DATE);
      return isPresent(v) ? asString(v) : null;
    },
  },
  {
    id: "beo_sent",
    label: "BEO sent",
    reached: (ctx) => {
      const beo = asString(ctx.customFields.get(CF_BEO_STATUS));
      return beo.includes("02.") || beo.includes("03.");
    },
    reached_at: () => null,
  },
  {
    id: "agreement_signed",
    label: "Agreement signed",
    reached: (ctx) =>
      asString(ctx.customFields.get(CF_AGREEMENT_STATUS)).includes("CLIENT SIGNED"),
    reached_at: () => null,
  },
  {
    id: "deposit_in",
    label: "Deposit in",
    reached: (ctx) => isPresent(ctx.customFields.get(CF_DEPOSIT_DATE)),
    reached_at: (ctx) => {
      const v = ctx.customFields.get(CF_DEPOSIT_DATE);
      return isPresent(v) ? asString(v) : null;
    },
  },
  {
    id: "event_won",
    label: "Event won",
    reached: (ctx) => ctx.statusLabel.includes("won"),
    reached_at: () => null,
  },
  {
    id: "lost",
    label: "Lost",
    reached: (ctx) => ctx.statusLabel.includes("lost"),
    reached_at: () => null,
  },
];

export type StageProgress = {
  current: PipelineStageId;
  reached: { id: PipelineStageId; label: string; reached_at: string | null }[];
  next: { id: PipelineStageId; label: string } | null;
};

/**
 * Walk the pipeline in order and return the furthest-reached stage plus
 * everything before it. "lost" short-circuits — terminal.
 */
export function resolveStage(ctx: StageCtx): StageProgress {
  const lostStage = PIPELINE_STAGES.find((s) => s.id === "lost");
  if (lostStage && lostStage.reached(ctx)) {
    return {
      current: "lost",
      reached: [{ id: "lost", label: lostStage.label, reached_at: lostStage.reached_at(ctx) }],
      next: null,
    };
  }
  // Linear stages excluding "lost"
  const linear = PIPELINE_STAGES.filter((s) => s.id !== "lost");
  const reached: StageProgress["reached"] = [];
  let current: PipelineStageId = "lead";
  for (const s of linear) {
    if (s.reached(ctx)) {
      reached.push({ id: s.id, label: s.label, reached_at: s.reached_at(ctx) });
      current = s.id;
    }
  }
  const currentIdx = linear.findIndex((s) => s.id === current);
  const next =
    currentIdx >= 0 && currentIdx < linear.length - 1
      ? { id: linear[currentIdx + 1].id, label: linear[currentIdx + 1].label }
      : null;
  return { current, reached, next };
}

// ─── Slot resolver ───────────────────────────────────────────────────────

export type ResolveCtx = {
  /** Indexed by `cf_<id>` (post-`custom.` strip). */
  customFields: ReadonlyMap<string, unknown>;
  /** Optional overrides keyed by slot id. Most-recent extracted wins. */
  leadFacts?: ReadonlyMap<string, LeadFactRecord>;
  /** ISO timestamp of the latest inbound activity, used for staleness. */
  lastInboundAt?: string | null;
};

export function resolveSlot(slot: DiscoverySlot, ctx: ResolveCtx): SlotState {
  // 1. Canonical Close custom field
  if (slot.close_custom_key) {
    const primary = ctx.customFields.get(slot.close_custom_key);
    const extras = (slot.extra_close_keys ?? []).map((k) => ctx.customFields.get(k));
    const present = isPresent(primary) || extras.some(isPresent);
    if (present) {
      const composite = [primary, ...extras].filter(isPresent);
      const value = composite.length === 1 ? composite[0] : composite;
      return {
        slot,
        status: "known",
        value,
        source: "close_custom",
        evidence: null,
        observed_at: null, // Close doesn't surface a per-field observation timestamp
      };
    }
  }

  // 2. lead_facts override
  const fact = ctx.leadFacts?.get(slot.id);
  if (fact && isPresent(fact.value)) {
    const stale = isFactStale(fact.extracted_at, ctx.lastInboundAt ?? null);
    return {
      slot,
      status: stale ? "stale" : "known",
      value: fact.value,
      source: fact.source,
      evidence: fact.evidence ?? null,
      observed_at: fact.extracted_at,
    };
  }

  // 3. Unknown
  return { slot, status: "unknown", value: null, source: null, evidence: null, observed_at: null };
}

function isFactStale(extractedAt: string, lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const e = Date.parse(extractedAt);
  const i = Date.parse(lastInboundAt);
  if (!Number.isFinite(e) || !Number.isFinite(i)) return false;
  return e < i;
}

// ─── Aggregator ──────────────────────────────────────────────────────────

export function buildDiscoveryMap(ctx: ResolveCtx): DiscoveryMap {
  const slots = DISCOVERY_SLOTS.map((s) => resolveSlot(s, ctx));

  let weightSum = 0;
  let weightedKnown = 0;
  let knownCount = 0;
  let staleCount = 0;
  const byCat: Record<SlotCategory, { known: number; total: number }> = {
    quest: { known: 0, total: 0 },
    clarity: { known: 0, total: 0 },
    consequence: { known: 0, total: 0 },
  };

  for (const state of slots) {
    weightSum += state.slot.weight;
    byCat[state.slot.category].total += 1;
    if (state.status === "known") {
      weightedKnown += state.slot.weight;
      knownCount += 1;
      byCat[state.slot.category].known += 1;
    } else if (state.status === "stale") {
      // Stale counts as half-credit on completeness, full weight ignored.
      weightedKnown += state.slot.weight * 0.5;
      staleCount += 1;
    }
  }

  const completeness = slots.length > 0
    ? (knownCount + staleCount * 0.5) / slots.length
    : 0;
  const clarity = weightSum > 0 ? Math.round((weightedKnown / weightSum) * 100) : 0;

  return { slots, completeness, clarity, by_category: byCat };
}

// ─── Public helper for callers building ResolveCtx from LeadBoxPageData ──

/**
 * Convert the `customFields` array (`{ key, value }[]` from load-lead-box)
 * into the indexed map the resolver needs. Keys are already post-`custom.`
 * stripped by load-lead-box, so we use them as-is.
 */
export function indexCustomFields(
  customFields: { key: string; value: unknown }[]
): ReadonlyMap<string, unknown> {
  const m = new Map<string, unknown>();
  for (const { key, value } of customFields) m.set(key, value);
  return m;
}
