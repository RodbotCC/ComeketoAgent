/**
 * Personal scoreboard — Andre's player dashboard at /personal.
 *
 * Aggregates Discovery Map + Journey Score signals across every active
 * lead in Andre's pipeline. Cost-bounded by design:
 *   - 1 Close call (closeListLeadsByAssignee) — gets all leads + custom.*
 *   - 1 Supabase select on lead_facts (all rows for Andre's leads)
 *   - 1 Supabase select on heartbeat_runs (last 30d, scope 'lead')
 * No per-lead Box fetches, no LLM calls.
 *
 * Reuses every pure scorer in discovery-map / journey-score / quest.
 */

import { closeListLeadsByAssignee } from "./close";
import { env } from "./env";
import { getSupabaseServer } from "./supabase";
import {
  DISCOVERY_SLOTS,
  PIPELINE_STAGES,
  buildDiscoveryMap,
  indexCustomFields,
  resolveStage,
  type PipelineStageId,
  type LeadFactRecord,
} from "./discovery-map";
import {
  computeRestraint,
  RESTRAINT_GOOD_SKIPS,
  RESTRAINT_BAD_SKIPS,
} from "./journey-score";

export type PersonalScoreboard = {
  /** Andre's lead pool size (post-status filter). */
  total_leads: number;
  /** Total Discovery XP across the book. */
  total_xp: number;
  /** Average clarity (0..100) across leads with at least one known slot. */
  avg_clarity: number;
  /** Org-wide aggregate restraint over the last 30 days (or null when no data). */
  restraint_30d: number | null;
  /** Skip-code breakdown for the 30d window. */
  restraint_breakdown: {
    fires: number;
    good_skips: number;
    bad_skips: number;
    neutral_skips: number;
    by_code: Record<string, number>;
  };
  /** "🟢 SCORE" hot-tag occurrences across pipeline. */
  hot_tag_counts: Array<{ tag: string; count: number }>;
  /** Per-slot fill stats — "62% have event_date set". */
  slot_fill_rates: Array<{
    slot_id: string;
    label: string;
    category: string;
    weight: number;
    known: number;
    total: number;
    pct: number;
  }>;
  /** Pipeline stage funnel — leads at each stage. */
  pipeline_funnel: Array<{ id: PipelineStageId; label: string; count: number }>;
  /** Top quest themes — most-frequently-unknown slots. */
  top_quests: Array<{ slot_id: string; label: string; unknown_count: number }>;
  /** Top hottest leads — most recently updated, with score chips. */
  top_leads: Array<{
    lead_id: string;
    display_name: string;
    status_label: string | null;
    clarity: number;
    completeness: number;
    stage: PipelineStageId;
    date_updated: string | null;
  }>;
  /** When the snapshot was computed. */
  generated_at: string;
};

/** Hot-score field id (multi-choice tags Andre maintains in Close). */
const CF_HOT_SCORE = "cf_9vVeQH1oYtJbtdHoL9VPwGhNpuCzVCgi95p7MCasszj";

function isPresentValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function pluckCustomFields(lead: Record<string, unknown>): { key: string; value: unknown }[] {
  return Object.entries(lead)
    .filter(([k]) => k.startsWith("custom."))
    .map(([k, v]) => ({ key: k.replace("custom.", ""), value: v }));
}

export async function buildPersonalScoreboard(): Promise<
  PersonalScoreboard | { error: string }
> {
  const andreId = env.CLOSE_USER_ID_ANDRE;
  if (!andreId) {
    return { error: "CLOSE_USER_ID_ANDRE not set." };
  }

  // 1. Pull all of Andre's leads (with custom.* fields populated).
  let leads: Awaited<ReturnType<typeof closeListLeadsByAssignee>> = [];
  try {
    leads = await closeListLeadsByAssignee(andreId, 200);
  } catch (err) {
    return {
      error: `closeListLeadsByAssignee: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Drop terminal leads — Won is fine to count for context but Lost is noise.
  const active = leads.filter((l) => {
    const s = (l.status_label || "").toLowerCase();
    return !s.includes("lost");
  });
  const leadIds = active.map((l) => l.id);

  // 2. Batch lead_facts in one query. Treat Supabase errors as empty (page
  //    still works pre-migration; resolver falls back to Close-only).
  const factsByLead = new Map<string, Map<string, LeadFactRecord>>();
  if (leadIds.length > 0) {
    try {
      const sb = getSupabaseServer();
      const { data: factRows } = await sb
        .from("lead_facts")
        .select("*")
        .in("lead_id", leadIds);
      type Row = {
        lead_id: string;
        slot_id: string;
        value: unknown;
        source: "llm_extraction" | "operator";
        evidence: unknown;
        extracted_at: string;
      };
      for (const r of (factRows ?? []) as Row[]) {
        if (!factsByLead.has(r.lead_id)) factsByLead.set(r.lead_id, new Map());
        factsByLead.get(r.lead_id)!.set(r.slot_id, {
          slot_id: r.slot_id,
          value: r.value,
          source: r.source,
          evidence: (r.evidence as LeadFactRecord["evidence"]) ?? null,
          extracted_at: r.extracted_at,
        });
      }
    } catch {
      // table may not exist yet — proceed empty
    }
  }

  // 3. Walk leads — compute discovery map + stage per lead.
  let totalXp = 0;
  let claritySum = 0;
  let clarityCount = 0;
  const slotKnownCounts = new Map<string, number>();
  const slotUnknownCounts = new Map<string, number>();
  const stageCounts = new Map<PipelineStageId, number>();
  const hotTagCounts = new Map<string, number>();
  const topLeadsRaw: Array<{
    lead: typeof active[number];
    clarity: number;
    completeness: number;
    stage: PipelineStageId;
  }> = [];

  for (const lead of active) {
    const leadAny = lead as unknown as Record<string, unknown>;
    const customFields = pluckCustomFields(leadAny);
    const cfMap = indexCustomFields(customFields);
    const map = buildDiscoveryMap({
      customFields: cfMap,
      leadFacts: factsByLead.get(lead.id),
    });
    totalXp += map.slots.reduce((sum, s) => {
      if (s.status === "known") return sum + s.slot.weight;
      if (s.status === "stale") return sum + Math.round(s.slot.weight * 0.5);
      return sum;
    }, 0);
    if (map.clarity > 0) {
      claritySum += map.clarity;
      clarityCount += 1;
    }
    for (const s of map.slots) {
      const isKnown = s.status === "known" || s.status === "stale";
      slotKnownCounts.set(s.slot.id, (slotKnownCounts.get(s.slot.id) ?? 0) + (isKnown ? 1 : 0));
      slotUnknownCounts.set(s.slot.id, (slotUnknownCounts.get(s.slot.id) ?? 0) + (isKnown ? 0 : 1));
    }

    const stage = resolveStage({
      customFields: cfMap,
      leadCreatedAt: lead.date_created ?? new Date().toISOString(),
      statusLabel: (lead.status_label || "").toLowerCase(),
    });
    stageCounts.set(stage.current, (stageCounts.get(stage.current) ?? 0) + 1);

    const hot = cfMap.get(CF_HOT_SCORE);
    if (Array.isArray(hot)) {
      for (const t of hot) if (typeof t === "string") hotTagCounts.set(t, (hotTagCounts.get(t) ?? 0) + 1);
    } else if (typeof hot === "string" && isPresentValue(hot)) {
      hotTagCounts.set(hot, (hotTagCounts.get(hot) ?? 0) + 1);
    }

    topLeadsRaw.push({ lead, clarity: map.clarity, completeness: map.completeness, stage: stage.current });
  }

  // 4. Aggregate restraint over last 30d (Andre's leads only).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const aggSkips: Record<string, number> = {};
  let aggFires = 0;
  if (leadIds.length > 0) {
    try {
      const sb = getSupabaseServer();
      const { data: hbRows } = await sb
        .from("heartbeat_runs")
        .select("skip_breakdown, actions_fired, close_lead_id")
        .gte("ran_at", since)
        .in("close_lead_id", leadIds);
      type Row = {
        skip_breakdown: Record<string, number> | null;
        actions_fired: number | null;
      };
      for (const r of (hbRows ?? []) as Row[]) {
        for (const [code, n] of Object.entries(r.skip_breakdown ?? {})) {
          aggSkips[code] = (aggSkips[code] ?? 0) + (n ?? 0);
        }
        aggFires += r.actions_fired ?? 0;
      }
    } catch {
      // no heartbeat table or empty — leave zeros
    }
  }
  const restraint = computeRestraint({ skipBreakdown: aggSkips, fires: aggFires });

  // 5. Build derived collections.
  const slot_fill_rates = DISCOVERY_SLOTS.map((s) => {
    const known = slotKnownCounts.get(s.id) ?? 0;
    const total = active.length;
    const pct = total > 0 ? Math.round((100 * known) / total) : 0;
    return {
      slot_id: s.id,
      label: s.label,
      category: s.category,
      weight: s.weight,
      known,
      total,
      pct,
    };
  });

  const pipeline_funnel = PIPELINE_STAGES.filter((s) => s.id !== "lost").map((s) => ({
    id: s.id,
    label: s.label,
    count: stageCounts.get(s.id) ?? 0,
  }));

  const top_quests = [...slotUnknownCounts.entries()]
    .map(([slotId, count]) => {
      const def = DISCOVERY_SLOTS.find((s) => s.id === slotId);
      return {
        slot_id: slotId,
        label: def?.label ?? slotId,
        unknown_count: count,
      };
    })
    .filter((q) => q.unknown_count > 0)
    .sort((a, b) => b.unknown_count - a.unknown_count)
    .slice(0, 5);

  const top_leads = topLeadsRaw
    .sort((a, b) => {
      // Sort by 🟢 hot-tag count desc, then clarity desc, then date_updated desc.
      const aHot = pluckCustomFields(a.lead as unknown as Record<string, unknown>);
      const bHot = pluckCustomFields(b.lead as unknown as Record<string, unknown>);
      const aHotN = (() => {
        const v = aHot.find((f) => f.key === CF_HOT_SCORE)?.value;
        return Array.isArray(v) ? v.length : v ? 1 : 0;
      })();
      const bHotN = (() => {
        const v = bHot.find((f) => f.key === CF_HOT_SCORE)?.value;
        return Array.isArray(v) ? v.length : v ? 1 : 0;
      })();
      if (aHotN !== bHotN) return bHotN - aHotN;
      if (a.clarity !== b.clarity) return b.clarity - a.clarity;
      const ad = a.lead.date_updated ?? "";
      const bd = b.lead.date_updated ?? "";
      return bd.localeCompare(ad);
    })
    .slice(0, 8)
    .map((entry) => ({
      lead_id: entry.lead.id,
      display_name: entry.lead.display_name,
      status_label: entry.lead.status_label ?? null,
      clarity: entry.clarity,
      completeness: entry.completeness,
      stage: entry.stage,
      date_updated: entry.lead.date_updated ?? null,
    }));

  const hot_tag_counts = [...hotTagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total_leads: active.length,
    total_xp: totalXp,
    avg_clarity: clarityCount > 0 ? Math.round(claritySum / clarityCount) : 0,
    restraint_30d: restraint.score,
    restraint_breakdown: restraint.breakdown,
    hot_tag_counts,
    slot_fill_rates,
    pipeline_funnel,
    top_quests,
    top_leads,
    generated_at: new Date().toISOString(),
  };
}

// Re-export so the page doesn't need a separate import for the constants.
export { RESTRAINT_GOOD_SKIPS, RESTRAINT_BAD_SKIPS };
