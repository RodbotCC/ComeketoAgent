/**
 * Composite chat tools — multi-lead/multi-plan operations exposed to the
 * delegations chat agent. Each tool is a thin wrapper over existing
 * single-lead paths in lib/close.ts, lib/plan.ts, lib/plans-db.ts, and
 * lib/heartbeat.ts.
 *
 * Why these exist:
 *   The 29 close_* tools all operate on one lead at a time. Andre says
 *   "make plans for my top 5 hot leads and fire them" — without a batch
 *   verb, the agent has to chain ~30 calls and the result shape gets lost.
 *   These tools give the agent the verbs it needs: find → plan-batch → fire-batch.
 *
 * Design notes:
 *   - "Hot" today = `date_updated` desc. LATTICE will replace this once it
 *     lands; the tool keeps the same name with a new sort impl.
 *   - Hard cap of 10 ids per batch tool — keeps tool-loop latency bounded
 *     and prevents accidental org-wide fire.
 *   - Concurrency capped per tool so we don't stampede OpenAI/Close.
 *   - All gating is delegated to existing helpers (checkOwnershipAndStatus
 *     for ownership, validateNepqVoice for day approval, runHeartbeatForPlan
 *     for the rest).
 *
 * Coordination:
 *   - This file is purely additive. It does NOT edit close-tools.ts (Lane C
 *     adds tools there) or actions.ts (Lane A may add auto_approve_clean_days
 *     consumption). The voice-clean approve loop in approveCleanDaysForPlan
 *     duplicates `approveAllDaysInternal` in src/app/lead/[id]/actions.ts —
 *     fold both back into a shared helper when Lane A lands.
 */

import { randomUUID } from "node:crypto";
import { env } from "./env";
import { getSettings } from "./settings";
import {
  closeListLeadsByAssignee,
  closeListLeads,
  closeGetLead,
  checkOwnershipAndStatus,
  type CloseLead,
} from "./close";
import { generateSevenDayPlanForLead } from "./plan";
import type { SevenDayPlan } from "./plan";
import { getPlanById, setDayStatus } from "./plans-db";
import { runHeartbeatForPlan, type HeartbeatReport } from "./heartbeat";
import { validateNepqVoice, hasBlockingViolation } from "./nepq";
import { logExecution } from "./execution-audit";
import OpenAI from "openai";
import { closeGetLeadFull } from "./close";
import { DISCOVERY_SLOTS } from "./discovery-map";
import { journeyScoreForLead } from "./journey-score";

// ─── Tool defs (OpenAI Responses tool format, top-level name/desc/params) ───

export const COMPOSITE_TOOLS = [
  {
    type: "function" as const,
    name: "find_top_n_leads_for_owner",
    description:
      "Return the top N leads for an owner, sorted by most-recently-updated. Use BEFORE generate_plans_for_leads when the operator says 'my top 5', 'hottest leads', 'who's been moving recently', or 'the ones I care about most'. Defaults: owner=andre, n=5, sort_by=recent_update, exclude_won_lost=true. Returns lead id, display_name, status_label, status_id, date_updated.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          enum: ["andre", "jake", "all"],
          description: "Whose pipeline to scan. Default andre.",
        },
        n: {
          type: "number",
          description: "How many leads to return (default 5, cap 25).",
        },
        sort_by: {
          type: "string",
          enum: ["recent_update", "oldest_update"],
          description: "Default recent_update.",
        },
        exclude_won_lost: {
          type: "boolean",
          description:
            "Drop leads whose status_label is Won or Lost. Default true.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "generate_plans_for_leads",
    description:
      "Generate an N-day cycle plan for MULTIPLE leads in one call (cap 10). Wraps generate_seven_day_plan. Each lead is gated on ownership/status; blocked leads return a skip_code instead of a plan. Default behaviour: pair with find_top_n_leads_for_owner — 'plan my top 5' → find → generate_plans_for_leads. Returns one entry per lead with plan_id + primary_goal + best_next_question on success, or skip_code/error on failure. Runs at concurrency 3 to avoid OpenAI stampede.",
    parameters: {
      type: "object",
      properties: {
        lead_ids: {
          type: "array",
          items: { type: "string" },
          description: "Close lead ids (lead_*). Max 10 — anything past index 9 is dropped.",
        },
        horizon_days: {
          type: "number",
          description:
            "Calendar-day length, 1–180. Default from Settings (usually 7).",
        },
      },
      required: ["lead_ids"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "extract_discovery_facts",
    description:
      "Scan a lead's Box (emails / SMS / call notes / activities) for the four LLM-only Discovery Map slots (guest_count, service_style, decision_timeline, dietary_constraints) and persist what's grounded in evidence. Use when the operator says 'scan for facts on lead X', 'what do we know about this lead', or before generating a plan if the Discovery Map is sparse. Skips slots that are already filled by Close custom fields. Returns one entry per slot with extracted value + evidence excerpt + confidence, or null if not found in Box.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "set_discovery_slot",
    description:
      "Add or correct a SINGLE Discovery Map slot for a lead — operator-source write. Use when Jake tells you a fact in chat (e.g. 'Brenda confirmed 115 guests on the call', 'budget is around $15k', 'tasting moved to June 4'). The slot_id MUST be one of: event_date, venue, location, client_type, budget, guest_count, service_style, decision_timeline, dietary_constraints. Operator-source values always win over LLM-extraction. For canonical-Close slots (event_date / venue / location / client_type / budget) prefer using close_update_lead with custom field merge_patch_json instead — those live on Close itself; only use this tool when the user wants the value in our Discovery Map override layer.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*)." },
        slot_id: {
          type: "string",
          enum: [
            "event_date",
            "venue",
            "location",
            "client_type",
            "budget",
            "guest_count",
            "service_style",
            "decision_timeline",
            "dietary_constraints",
          ],
          description: "Which Discovery Map slot to fill.",
        },
        value: {
          type: "string",
          description:
            "The value to record. For guest_count, send a number as a string (e.g. '115') — it'll be coerced. For service_style use one of: buffet, plated, family, stations, passed, mixed.",
        },
      },
      required: ["lead_id", "slot_id", "value"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "lead_journey_score",
    description:
      "Read-only — return the Journey Score for a lead: clarity (0-100), readiness (0-100), restraint (0-100 or null), discovery_xp (integer), pipeline stage (lead → discovery_started → tasting_booked → tasting_done → beo_sent → agreement_signed → deposit_in → event_won), Andre's 🟢 SCORE hot-tags, plus the Discovery Map (9 slots with status + value). Use when the operator asks 'how is lead X doing', 'what do we know about Brenda', 'what's the next move for this lead', or wants a single-line readiness check before approving a plan.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "approve_and_fire_plans",
    description:
      "Approve every voice-clean needs_review day across MULTIPLE plans and fire a heartbeat sweep on each (cap 10). Equivalent to clicking Approve & run on each lead's plan card, batched. Use after generate_plans_for_leads when the operator says 'approve them all', 'send it', or 'fire them'. Returns one report per plan: approved_days, skipped_voice, actions_eligible, actions_fired, actions_skipped, skip_breakdown. Runs at concurrency 2 — heartbeat hits Close hard.",
    parameters: {
      type: "object",
      properties: {
        plan_ids: {
          type: "array",
          items: { type: "string" },
          description: "Plan ids to approve and fire. Max 10.",
        },
      },
      required: ["plan_ids"],
      additionalProperties: false,
    },
  },
];

export type CompositeToolName =
  | "find_top_n_leads_for_owner"
  | "generate_plans_for_leads"
  | "approve_and_fire_plans"
  | "extract_discovery_facts"
  | "lead_journey_score"
  | "set_discovery_slot";

const COMPOSITE_NAMES: ReadonlySet<string> = new Set([
  "find_top_n_leads_for_owner",
  "generate_plans_for_leads",
  "approve_and_fire_plans",
  "extract_discovery_facts",
  "lead_journey_score",
  "set_discovery_slot",
]);

export function isCompositeTool(name: string): name is CompositeToolName {
  return COMPOSITE_NAMES.has(name);
}

// ─── helpers ─────────────────────────────────────────────────────────────

/** Run promises with a fixed concurrency cap so we don't stampede. */
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runnerCount = Math.max(1, Math.min(limit, items.length));
  const runners = new Array(runnerCount).fill(0).map(async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Approve every needs_review day on a plan that doesn't trigger a blocking
 * NEPQ-voice violation. Mirrors `approveAllDaysInternal` in actions.ts;
 * fold both into a shared helper when Lane A lands `auto_approve_clean_days`.
 */
async function approveCleanDaysForPlan(
  planId: string
): Promise<{ approved: number; skipped_voice: number }> {
  const row = (await getPlanById(planId)) as Record<string, unknown> | null;
  if (!row) return { approved: 0, skipped_voice: 0 };
  const days = (row.days as SevenDayPlan["days"]) || [];
  let approved = 0;
  let skipped_voice = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.approval_status !== "needs_review") continue;
    const dayHasBlocking = (d.required_actions || []).some((a) => {
      if (a.channel !== "email" && a.channel !== "sms") return false;
      const text = a.draft_seed || a.intent || "";
      return hasBlockingViolation(validateNepqVoice(text));
    });
    if (dayHasBlocking) {
      skipped_voice += 1;
      continue;
    }
    await setDayStatus(planId, i, "approved");
    approved += 1;
  }
  return { approved, skipped_voice };
}

// ─── dispatcher ──────────────────────────────────────────────────────────

export async function dispatchCompositeTool(
  name: string,
  args: Record<string, unknown>,
  /**
   * Caller context. The chat route passes its own `traceId` so every
   * `execution_log` row written by this dispatcher correlates with the
   * `cmk:trace` fence persisted in the assistant message — clicking
   * `trace ↗` on a batch widget shows every row from that whole turn.
   * If absent (e.g. invoked from a script), each branch falls back to
   * its own `randomUUID()`.
   */
  opts?: { traceId?: string | null }
): Promise<unknown> {
  try {
    switch (name as CompositeToolName) {
      case "find_top_n_leads_for_owner": {
        const owner = (typeof args.owner === "string"
          ? args.owner
          : "andre") as "andre" | "jake" | "all";
        const n = Math.max(1, Math.min(Number(args.n ?? 5) || 5, 25));
        const sort_by =
          (typeof args.sort_by === "string" ? args.sort_by : "recent_update") as
            | "recent_update"
            | "oldest_update";
        const exclude_won_lost = args.exclude_won_lost !== false;

        let leads: CloseLead[] = [];
        if (owner === "andre") {
          if (!env.CLOSE_USER_ID_ANDRE) {
            return {
              error:
                "CLOSE_USER_ID_ANDRE not configured — pass owner='all' or set the env var.",
            };
          }
          leads = await closeListLeadsByAssignee(env.CLOSE_USER_ID_ANDRE, 200);
        } else if (owner === "jake") {
          if (!env.CLOSE_USER_ID_JAKE) {
            return {
              error:
                "CLOSE_USER_ID_JAKE not configured — pass owner='all' or set the env var.",
            };
          }
          leads = await closeListLeadsByAssignee(env.CLOSE_USER_ID_JAKE, 200);
        } else {
          leads = await closeListLeads({ limit: 200 });
        }

        const totalInPool = leads.length;

        if (exclude_won_lost) {
          leads = leads.filter((l) => {
            const label = (l.status_label || "").toLowerCase();
            return label !== "won" && label !== "lost";
          });
        }

        leads.sort((a, b) => {
          const ad = String(a.date_updated || "");
          const bd = String(b.date_updated || "");
          return sort_by === "recent_update"
            ? bd.localeCompare(ad)
            : ad.localeCompare(bd);
        });

        const top = leads.slice(0, n);
        return {
          owner,
          sort_by,
          exclude_won_lost,
          n: top.length,
          total_in_pool: totalInPool,
          eligible_after_filter: leads.length,
          leads: top.map((l) => ({
            id: l.id,
            display_name: l.display_name,
            status_label: l.status_label,
            status_id: l.status_id,
            date_updated: l.date_updated,
          })),
        };
      }

      case "generate_plans_for_leads": {
        const ids = Array.isArray(args.lead_ids) ? (args.lead_ids as unknown[]) : [];
        const cleanIds = ids
          .filter((x): x is string => typeof x === "string" && x.startsWith("lead_"))
          .slice(0, 10);
        if (cleanIds.length === 0) {
          return {
            error: "lead_ids must be a non-empty array of lead_* ids (max 10).",
          };
        }
        const horizonRaw = args.horizon_days;
        const horizon =
          typeof horizonRaw === "number" && horizonRaw > 0
            ? Math.min(Math.max(Math.round(horizonRaw), 1), 180)
            : undefined;

        const traceId = opts?.traceId ?? randomUUID();
        const results = await withConcurrency(cleanIds, 3, async (leadId) => {
          try {
            const lead = await closeGetLead(leadId);
            const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
            if (skip) {
              return {
                lead_id: leadId,
                ok: false,
                skipped: true,
                skip_code: skip,
                lead_name: lead.display_name,
                status_label: lead.status_label,
                reason:
                  skip === "OWNERSHIP"
                    ? `Lead ${leadId} is not owned by Andre.`
                    : `Lead ${leadId} status is "${lead.status_label}".`,
              };
            }
            const r = await generateSevenDayPlanForLead(leadId, {
              horizonDays: horizon,
            });
            if (!r.ok) {
              return {
                lead_id: leadId,
                ok: false,
                error: r.error,
                lead_name: lead.display_name,
              };
            }
            void logExecution({
              action_kind: "generate_plan",
              close_lead_id: leadId,
              plan_id: r.plan.plan_id,
              trace_id: traceId,
              payload: { batch: true, horizon_days: horizon ?? "default" },
            });
            return {
              lead_id: leadId,
              ok: true,
              plan_id: r.plan.plan_id,
              primary_goal: r.plan.primary_goal,
              goal_summary: r.plan.goal_summary,
              best_next_question: r.plan.best_next_question,
              day_count: r.plan.days.length,
              horizon_days: r.plan.days.length,
              lead_name: lead.display_name,
            };
          } catch (err) {
            return {
              lead_id: leadId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        });

        const succeeded = results.filter((r) => r.ok).length;
        const skipped = results.filter(
          (r) => !r.ok && (r as { skipped?: boolean }).skipped
        ).length;
        const failed = results.filter(
          (r) => !r.ok && !(r as { skipped?: boolean }).skipped
        ).length;

        return {
          requested: cleanIds.length,
          succeeded,
          skipped,
          failed,
          horizon_days: horizon ?? "default",
          trace_id: traceId,
          results,
        };
      }

      case "approve_and_fire_plans": {
        const ids = Array.isArray(args.plan_ids)
          ? (args.plan_ids as unknown[])
          : [];
        const cleanIds = ids
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .slice(0, 10);
        if (cleanIds.length === 0) {
          return {
            error: "plan_ids must be a non-empty array of plan ids (max 10).",
          };
        }

        const settings = await getSettings();
        const traceId = opts?.traceId ?? randomUUID();

        type FireResult =
          | {
              plan_id: string;
              close_lead_id: string;
              ok: true;
              approved_days: number;
              skipped_voice: number;
              execution_mode: string;
              actions_eligible: number;
              actions_fired: number;
              actions_skipped: number;
              snapshot_match: boolean;
              snapshot_was_stale: boolean;
              skip_breakdown: Record<string, number>;
            }
          | { plan_id: string; ok: false; error: string };

        const results: FireResult[] = await withConcurrency(
          cleanIds,
          2,
          async (planId): Promise<FireResult> => {
            try {
              const planRow = (await getPlanById(planId)) as
                | Record<string, unknown>
                | null;
              if (!planRow) {
                return { plan_id: planId, ok: false, error: "plan not found" };
              }
              const leadId = String(planRow.close_lead_id || "");
              if (!leadId) {
                return {
                  plan_id: planId,
                  ok: false,
                  error: "plan has no close_lead_id",
                };
              }
              const ar = await approveCleanDaysForPlan(planId);
              const report: HeartbeatReport = await runHeartbeatForPlan(
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
                  skipped_voice: ar.skipped_voice,
                  execution_mode: settings.execution_mode,
                  batch: true,
                },
                snapshot_id_at_action: report.current_snapshot_id,
              });
              return {
                plan_id: planId,
                close_lead_id: leadId,
                ok: true,
                approved_days: ar.approved,
                skipped_voice: ar.skipped_voice,
                execution_mode: settings.execution_mode,
                actions_eligible: report.actions_eligible,
                actions_fired: report.actions_fired,
                actions_skipped: report.actions_skipped,
                snapshot_match: report.snapshot_match,
                snapshot_was_stale: report.plan_was_stale,
                skip_breakdown: report.skip_breakdown,
              };
            } catch (err) {
              return {
                plan_id: planId,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        );

        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok).length;
        const totalEligible = results.reduce(
          (sum, r) =>
            sum + (r.ok ? r.actions_eligible : 0),
          0
        );
        const totalFired = results.reduce(
          (sum, r) => sum + (r.ok ? r.actions_fired : 0),
          0
        );
        const totalSkipped = results.reduce(
          (sum, r) => sum + (r.ok ? r.actions_skipped : 0),
          0
        );
        const totalApproved = results.reduce(
          (sum, r) => sum + (r.ok ? r.approved_days : 0),
          0
        );

        return {
          requested: cleanIds.length,
          succeeded,
          failed,
          execution_mode: settings.execution_mode,
          totals: {
            approved_days: totalApproved,
            actions_eligible: totalEligible,
            actions_fired: totalFired,
            actions_skipped: totalSkipped,
          },
          trace_id: traceId,
          reports: results,
        };
      }

      case "extract_discovery_facts": {
        const leadId = typeof args.lead_id === "string" ? args.lead_id : "";
        if (!leadId.startsWith("lead_")) {
          return { error: "lead_id required (lead_*)" };
        }
        if (!env.OPENAI_API_KEY) {
          return { error: "OPENAI_API_KEY not set" };
        }
        const traceId = opts?.traceId ?? randomUUID();
        const result = await extractDiscoveryFactsForLead(leadId);
        if ("error" in result) {
          await logExecution({
            action_kind: "intake_extract",
            close_lead_id: leadId,
            trace_id: traceId,
            payload: {
              tool: "extract_discovery_facts",
              scope: "discovery_map",
              error: result.error,
            },
            result: "error",
          });
          return result;
        }
        // Persistence offline — lead_facts retired in Supabase rip-out
        // (2026-05-06). Facts are extracted and logged but not stored until
        // file-canonical replacement lands.
        await logExecution({
          action_kind: "intake_extract",
          close_lead_id: leadId,
          trace_id: traceId,
          payload: {
            tool: "extract_discovery_facts",
            scope: "discovery_map",
            slots_extracted: result.facts.map((f) => f.slot_id),
            note: "lead_facts persistence offline — extraction logged only",
          },
          result: "ok",
        });
        return {
          lead_id: leadId,
          slots_extracted: result.facts.length,
          slots_skipped_already_known: result.skipped_known,
          facts: result.facts,
          trace_id: traceId,
        };
      }

      case "set_discovery_slot": {
        const leadId = typeof args.lead_id === "string" ? args.lead_id : "";
        const slotId = typeof args.slot_id === "string" ? args.slot_id : "";
        const valueRaw = typeof args.value === "string" ? args.value.trim() : "";
        const validSlots = new Set([
          "event_date", "venue", "location", "client_type", "budget",
          "guest_count", "service_style", "decision_timeline", "dietary_constraints",
        ]);
        if (!leadId.startsWith("lead_")) return { error: "lead_id required (lead_*)" };
        if (!validSlots.has(slotId)) return { error: `slot_id must be one of: ${[...validSlots].join(", ")}` };
        if (valueRaw.length === 0) return { error: "value cannot be empty (use a separate clear if needed)" };

        // Coerce guest_count to integer
        let value: unknown = valueRaw;
        if (slotId === "guest_count") {
          const n = Number(valueRaw);
          if (Number.isFinite(n) && n > 0) value = Math.round(n);
        }

        const traceId = opts?.traceId ?? randomUUID();
        try {
          // No-op: lead_facts persistence retired in Supabase rip-out.
          // Operator-set values are logged but not stored until file-canonical
          // replacement lands.
          void value;
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
        await logExecution({
          action_kind: "intake_extract",
          close_lead_id: leadId,
          trace_id: traceId,
          payload: {
            tool: "set_discovery_slot",
            scope: "discovery_map",
            slot_id: slotId,
            value,
            via: "chat_agent",
          },
          result: "ok",
        });
        return {
          ok: true,
          lead_id: leadId,
          slot_id: slotId,
          value,
          source: "operator",
          trace_id: traceId,
        };
      }

      case "lead_journey_score": {
        const leadId = typeof args.lead_id === "string" ? args.lead_id : "";
        if (!leadId.startsWith("lead_")) {
          return { error: "lead_id required (lead_*)" };
        }
        const out = await journeyScoreForLead(leadId);
        if ("error" in out) return out;
        // Compact payload for the chat widget — keep slot evidence excerpts
        // tight so the 2000-char tool-summary cap holds even with 9 slots.
        return {
          lead_id: leadId,
          stage: out.score.stage,
          clarity: out.score.clarity,
          readiness: out.score.readiness,
          restraint: out.score.restraint,
          discovery_xp: out.score.discovery_xp,
          completeness: Math.round(out.map.completeness * 100) / 100,
          hot_tags: out.score.hot_tags,
          restraint_breakdown: out.score.restraint_breakdown,
          slots: out.map.slots.map((s) => ({
            id: s.slot.id,
            label: s.slot.label,
            category: s.slot.category,
            status: s.status,
            source: s.source,
            value: s.value,
          })),
        };
      }

      default:
        return { error: `unknown composite tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Discovery extraction (LLM) ──────────────────────────────────────────

const EXTRACTION_SLOTS = ["guest_count", "service_style", "decision_timeline", "dietary_constraints"] as const;
type ExtractionSlotId = (typeof EXTRACTION_SLOTS)[number];

type ExtractedFact = {
  slot_id: string;
  value: unknown;
  evidence: { activity_id?: string; excerpt: string; confidence: number };
};

export async function extractDiscoveryFactsForLead(
  leadId: string
): Promise<{ facts: ExtractedFact[]; skipped_known: string[] } | { error: string }> {
  let box;
  try {
    box = await closeGetLeadFull(leadId);
  } catch (err) {
    return { error: `closeGetLeadFull: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Skip slots that are already filled by Close custom fields. We don't
  // overwrite canonical-Close values — those win on read regardless.
  const lead = box.lead as Record<string, unknown>;
  const skipped_known: string[] = [];
  const slotsToExtract: ExtractionSlotId[] = [];
  for (const slotId of EXTRACTION_SLOTS) {
    const def = DISCOVERY_SLOTS.find((s) => s.id === slotId);
    if (def?.close_custom_key) {
      const v = lead[`custom.${def.close_custom_key}`];
      if (v != null && (typeof v !== "string" || v.trim().length > 0)) {
        skipped_known.push(slotId);
        continue;
      }
    }
    slotsToExtract.push(slotId);
  }
  if (slotsToExtract.length === 0) {
    return { facts: [], skipped_known };
  }

  // Build tight Box summary: latest 8 inbound + 4 outbound activities
  // with body text. Shorter than plan-generation prompt — extraction
  // doesn't need full history.
  const sortedActivities = [...box.activities].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
  );
  const inbound = sortedActivities.filter((a) => a.direction === "inbound").slice(0, 8);
  const outbound = sortedActivities.filter((a) => a.direction === "outbound").slice(0, 4);
  const lines: string[] = [];
  for (const a of [...inbound, ...outbound]) {
    const dir = a.direction === "inbound" ? "← " : "→ ";
    const t = a._type;
    const body = (a as { body_text?: string; body?: string; subject?: string; note?: string });
    const text = (body.body_text || body.body || body.note || body.subject || "").slice(0, 400);
    if (text) lines.push(`[${a.id}] ${dir}${t}: ${text}`);
  }
  const activitiesSummary = lines.join("\n");

  const slotPrompt = slotsToExtract
    .map((id) => {
      const def = DISCOVERY_SLOTS.find((s) => s.id === id)!;
      return `- "${id}" (${def.label}): ${def.why_it_matters}`;
    })
    .join("\n");

  const instructions = `You are extracting catering buyer facts from a lead's communication history.

Slots to fill:
${slotPrompt}

Output ONLY a JSON object: { facts: [ { slot_id, value, evidence: { activity_id, excerpt, confidence } } ] }

Rules:
- value: keep concise. guest_count = integer (best-effort from text). service_style = one of "buffet" | "plated" | "family" | "stations" | "passed" | "mixed" | other quote. decision_timeline = short phrase (e.g. "by July 1", "next 2 weeks"). dietary_constraints = comma-separated list.
- evidence.excerpt: a verbatim ~120-char span from the message you're grounding the fact in.
- evidence.confidence: 0.0..1.0. ONLY include facts with confidence >= 0.6.
- evidence.activity_id: the [acti_…] id from the line you grounded in.
- If a slot has no evidence, omit it from facts. Do NOT invent.
`;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY! });
  let raw = "";
  try {
    const settings = await getSettings();
    const response = await client.responses.create({
      model: settings.model,
      instructions,
      input: `Lead: ${box.lead.display_name}\n\nActivities:\n${activitiesSummary || "(none)"}`,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { error: `OpenAI call failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return { error: "no JSON object in extraction output" };
  }
  let parsed: { facts?: ExtractedFact[] };
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return { error: `JSON parse failed: ${err instanceof Error ? err.message : err}` };
  }

  const facts = (parsed.facts ?? [])
    .filter((f): f is ExtractedFact => {
      return (
        typeof f === "object" &&
        f !== null &&
        typeof (f as ExtractedFact).slot_id === "string" &&
        EXTRACTION_SLOTS.includes((f as ExtractedFact).slot_id as ExtractionSlotId) &&
        (f as ExtractedFact).value != null &&
        typeof (f as ExtractedFact).evidence === "object"
      );
    })
    .filter((f) => Number(f.evidence.confidence ?? 0) >= 0.6);

  return { facts, skipped_known };
}
