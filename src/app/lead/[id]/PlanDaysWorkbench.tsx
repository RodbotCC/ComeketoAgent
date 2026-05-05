"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ProposalWorkbench,
  type ProposalPlanItem,
  type ProposalDayItem,
} from "@/app/proposals/ProposalReviewBoard";
import type { ApprovalStatus, SevenDayPlan } from "@/lib/plan";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  not_ready: "not ready",
  needs_review: "needs review",
  approved: "approved",
  sent: "sent",
  skipped: "skipped",
};

const DAY_TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;

const STATUS_PRIORITY: ApprovalStatus[] = [
  "needs_review",
  "not_ready",
  "approved",
  "sent",
  "skipped",
];

function pickInitialDayIndex(days: ProposalDayItem[]): number {
  for (const status of STATUS_PRIORITY) {
    const idx = days.findIndex((d) => d.approval_status === status);
    if (idx !== -1) return idx;
  }
  return 0;
}

function summaryStatus(days: ProposalDayItem[]): ApprovalStatus {
  // Same priority order the proposals board uses.
  const order: ApprovalStatus[] = ["needs_review", "approved", "not_ready", "sent", "skipped"];
  for (const s of order) {
    if (days.some((d) => d.approval_status === s)) return s;
  }
  return "not_ready";
}

function planToProposalPlanItem(
  plan: SevenDayPlan,
  leadName: string
): ProposalPlanItem {
  const days: ProposalDayItem[] = plan.days.map((d, i) => ({
    day_index: i,
    day_number: d.day,
    objective: d.objective,
    send_window: d.send_window,
    approval_status: d.approval_status,
    touches: d.required_actions,
  }));

  const status_counts: Record<ApprovalStatus, number> = {
    not_ready: 0,
    needs_review: 0,
    approved: 0,
    sent: 0,
    skipped: 0,
  };
  for (const d of days) status_counts[d.approval_status] += 1;

  return {
    key: `lead-plan-${plan.plan_id}`,
    plan_id: plan.plan_id,
    lead_id: plan.close_lead_id,
    lead_name: leadName || "(unnamed lead)",
    plan_status: plan.status,
    goal_summary: plan.goal_summary,
    generated_at: plan.generated_at,
    days,
    summary_status: summaryStatus(days),
    status_counts,
    total_touches: days.reduce((acc, d) => acc + d.touches.length, 0),
  };
}

export function PlanDaysWorkbench({
  plan,
  leadName,
  intakeArtifacts,
}: {
  plan: SevenDayPlan;
  leadName: string;
  intakeArtifacts: IntakeArtifactRow[];
}) {
  const proposalItem = useMemo(() => planToProposalPlanItem(plan, leadName), [plan, leadName]);
  const days = proposalItem.days;
  const dayCount = days.length;

  // Active day in the pager (single-day focus). Default to the first
  // needs-review (or not-ready) day so Andre lands on the actionable one.
  // localStorage-keyed by plan_id so re-visits remember position.
  const storageKey = `cmk:plan-pager:${plan.plan_id}`;
  const [activeIdx, setActiveIdx] = useState<number>(() => pickInitialDayIndex(days));
  const [openDayIndex, setOpenDayIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n < dayCount) setActiveIdx(n);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, dayCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(storageKey, String(activeIdx)); } catch {}
  }, [storageKey, activeIdx]);

  const active = days[activeIdx] ?? days[0];
  const tone = DAY_TONES[activeIdx % DAY_TONES.length];

  function go(delta: number) {
    setActiveIdx((i) => Math.max(0, Math.min(dayCount - 1, i + delta)));
  }

  return (
    <>
      {/* Chip rail — always-visible day index with status-colored dots */}
      <nav className="cmk-pdw-chips" aria-label="Plan day navigation">
        {days.map((d, idx) => {
          const isActive = idx === activeIdx;
          return (
            <button
              key={`${plan.plan_id}-chip-${idx}`}
              type="button"
              className={`cmk-pdw-chip${isActive ? " is-active" : ""}`}
              data-status={d.approval_status}
              onClick={() => setActiveIdx(idx)}
              title={`Day ${d.day_number} · ${STATUS_LABEL[d.approval_status]}`}
            >
              <span className="cmk-pdw-chip-dot" aria-hidden />
              <span className="cmk-pdw-chip-num">Day {d.day_number}</span>
            </button>
          );
        })}
      </nav>

      {/* Single-day pager — full-width tile with prev/next arrows */}
      <div className="cmk-pdw-pager">
        <button
          type="button"
          className="cmk-pdw-pager-arrow"
          onClick={() => go(-1)}
          disabled={activeIdx === 0}
          aria-label="Previous day"
        >
          ◀
        </button>

        <button
          type="button"
          className={`cmk-pdw-tile cmk-pdw-tile-${tone} cmk-pdw-tile--full`}
          data-status={active.approval_status}
          onClick={() => setOpenDayIndex(activeIdx)}
        >
          <div className="cmk-pdw-tile-head">
            <span className="cmk-pdw-tile-num">Day {active.day_number}</span>
            <span
              className={`cmk-pdw-tile-status proposal-status-${active.approval_status}`}
            >
              {STATUS_LABEL[active.approval_status]}
            </span>
            <span className="cmk-pdw-tile-touches">
              {active.touches.length} {active.touches.length === 1 ? "touch" : "touches"}
            </span>
          </div>
          <p className="cmk-pdw-tile-obj cmk-pdw-tile-obj--full">
            {active.objective || "(no objective)"}
          </p>
          {active.touches.length > 0 && (
            <ul className="cmk-pdw-tile-touchlist">
              {active.touches.slice(0, 4).map((t, i) => (
                <li key={i}>
                  <span className="cmk-pdw-tile-touchchan">{t.channel}</span>
                  <span className="cmk-pdw-tile-touchintent">{t.intent || "(no intent)"}</span>
                </li>
              ))}
              {active.touches.length > 4 && (
                <li className="cmk-pdw-tile-touchmore">
                  +{active.touches.length - 4} more
                </li>
              )}
            </ul>
          )}
          <span className="cmk-pdw-tile-cta">Click to edit day →</span>
        </button>

        <button
          type="button"
          className="cmk-pdw-pager-arrow"
          onClick={() => go(1)}
          disabled={activeIdx >= dayCount - 1}
          aria-label="Next day"
        >
          ▶
        </button>
      </div>

      {openDayIndex !== null && (
        <ProposalWorkbench
          plan={proposalItem}
          onClose={() => setOpenDayIndex(null)}
          initialDayIndex={openDayIndex}
          intakeArtifacts={intakeArtifacts}
        />
      )}
    </>
  );
}
