"use client";

/**
 * Client beacon for cross-surface plan-state sync.
 *
 * Server-action forms on /lead/[id] (generate / approve / pause / kill /
 * refine / per-touch edits) trigger revalidatePath; the page re-renders
 * with the new plan state. This beacon hashes the rendered plan and
 * dispatches `comeketo:plan-changed` on the window when the hash shifts.
 *
 * Listeners (cockpit's PlanDayStrip, /lead/[id]/graph PlanGraphView)
 * re-fetch on the event so they stay in sync with the lead page within
 * the same window — no tab-focus refresh needed.
 *
 * Renders nothing.
 */
import { useEffect, useRef } from "react";

type PlanLite = {
  plan_id: string;
  status: string;
  generated_at: string;
  days: Array<{ approval_status: string }>;
} | null;

function fingerprint(plan: PlanLite): string {
  if (!plan) return "none";
  return [
    plan.plan_id,
    plan.status,
    plan.generated_at,
    plan.days.map((d) => d.approval_status).join("|"),
  ].join("::");
}

export function PlanPageBeacon({ leadId, plan }: { leadId: string; plan: PlanLite }) {
  const fp = fingerprint(plan);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip the initial mount — only fire when the fingerprint actually
    // shifts between renders. That way we don't spam listeners with a
    // dispatch every time someone navigates onto the Plan tab.
    if (lastRef.current !== null && lastRef.current !== fp) {
      window.dispatchEvent(
        new CustomEvent("comeketo:plan-changed", { detail: { lead_id: leadId } })
      );
    }
    lastRef.current = fp;
  }, [fp, leadId]);

  return null;
}
