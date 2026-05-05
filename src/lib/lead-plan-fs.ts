/**
 * Per-lead plan mirror (Phase 4 of harness/ overhaul, 2026-05-05).
 *
 * Writes the latest `SevenDayPlan` for a lead to
 * `harness/leads/{state}/{lead_id}__{slug}/plan.json` after every successful
 * Supabase write. The file is a read-replica that the chat agent and any
 * future LLM regen can consume; Supabase remains the canonical source of
 * truth during this phase.
 *
 * Phase 6 will flip canonicality (file becomes source, Supabase is dropped).
 *
 * All writes are fire-and-forget — caller does NOT await. Failure logs a
 * warning but never breaks the primary Supabase write.
 */

import { writeLeadFile } from "./lead-folder";
import { closeGetLead } from "./close";
import { logStructured } from "./observability";
import type { SevenDayPlan } from "./plan";

type PlanWithMeta = SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
};

/** Mirror a plan to its lead's harness folder as `plan.json`. Resolves the
 *  lead's display_name via Close to build the slug. Failures swallowed. */
export async function mirrorPlanToFile(plan: PlanWithMeta): Promise<void> {
  try {
    let leadName = plan.close_lead_id;
    try {
      const lead = await closeGetLead(plan.close_lead_id);
      if (lead?.display_name) leadName = lead.display_name;
    } catch {
      // Slug derivation is best-effort. If Close lookup fails, use lead_id
      // as the name — slug stays unique by lead_id prefix.
    }

    const content = JSON.stringify(
      {
        ...plan,
        _mirror_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n";

    await writeLeadFile(plan.close_lead_id, leadName, "plan.json", content, {
      commitMessage: `plan: ${leadName} — ${plan.status} (${plan.plan_id.slice(-8)})`,
    });
  } catch (e) {
    logStructured("warn", "harness.plans", "mirrorPlanToFile failed", {
      plan_id: plan.plan_id,
      close_lead_id: plan.close_lead_id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
