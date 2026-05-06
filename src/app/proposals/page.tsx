import { AppHeader } from "@/components/AppHeader";
import { displayName, resolveLeadNames } from "@/lib/lead-names";
import { listPlansForProposalReview } from "@/lib/plans-db";
import { ProposalReviewBoard, type ProposalPlanItem } from "./ProposalReviewBoard";
import type { ApprovalStatus } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** Same priority order the board uses; copied so we can derive `summary_status` server-side. */
const SUMMARY_PRIORITY: ApprovalStatus[] = [
  "needs_review",
  "approved",
  "not_ready",
  "sent",
  "skipped",
];

const ZERO_COUNTS: Record<ApprovalStatus, number> = {
  not_ready: 0,
  needs_review: 0,
  approved: 0,
  sent: 0,
  skipped: 0,
};

export default async function ProposalsPage() {
  let plans: ProposalPlanItem[] = [];
  let err: string | null = null;

  try {
    const [rawPlans, names] = await Promise.all([
      listPlansForProposalReview(100),
      resolveLeadNames(),
    ]);

    plans = rawPlans.map((plan) => {
      const days = plan.days.map((day, dayIndex) => ({
        day_index: dayIndex,
        day_number: day.day,
        objective: day.objective,
        send_window: day.send_window,
        approval_status: day.approval_status,
        touches: day.required_actions,
      }));

      const status_counts: Record<ApprovalStatus, number> = { ...ZERO_COUNTS };
      for (const d of days) status_counts[d.approval_status] += 1;

      const summary_status =
        SUMMARY_PRIORITY.find((s) => status_counts[s] > 0) ?? "not_ready";

      const total_touches = days.reduce((sum, d) => sum + d.touches.length, 0);

      return {
        key: plan.plan_id,
        plan_id: plan.plan_id,
        lead_id: plan.close_lead_id,
        lead_name: displayName(plan.close_lead_id, names),
        plan_status: plan.status,
        goal_summary: plan.goal_summary,
        generated_at: plan.generated_at,
        days,
        summary_status,
        status_counts,
        total_touches,
      };
    });

    plans.sort((a, b) => {
      const byStatus =
        SUMMARY_PRIORITY.indexOf(a.summary_status) - SUMMARY_PRIORITY.indexOf(b.summary_status);
      if (byStatus !== 0) return byStatus;
      return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();
    });
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  // Counts strip is plan-level for the bucket numbers (matching column tallies),
  // plus a total touches across all plans.
  const counts = {
    needs_review: plans.filter((p) => p.summary_status === "needs_review").length,
    approved: plans.filter((p) => p.summary_status === "approved").length,
    not_ready: plans.filter((p) => p.summary_status === "not_ready").length,
    sent: plans.filter((p) => p.summary_status === "sent").length,
    skipped: plans.filter((p) => p.summary_status === "skipped").length,
    touches: plans.reduce((sum, p) => sum + p.total_touches, 0),
  };

  return (
    <div className="cme-shell">
      <AppHeader />
      <main className="proposal-page scroll-hide">
        {err ? (
          <div className="lead-error">
            <strong>Proposals failed to load:</strong> {err}
          </div>
        ) : (
          <ProposalReviewBoard plans={plans} counts={counts} />
        )}
      </main>
    </div>
  );
}
