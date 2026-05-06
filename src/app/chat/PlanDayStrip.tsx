"use client";

/**
 * Plan day-strip — renders the active lead's latest plan as a vertical
 * stack of PlanDayCard instances inside the cockpit's right rail (Lead mode).
 *
 * Reuses the existing PlanDayCard from /lead/[id] wholesale — same modal,
 * same edit/refine UX. We just stack them in a sticky-rail layout.
 *
 * Fetches /api/lead/[id]/plan client-side. Shows three states:
 *   - Loading
 *   - No plan yet → "Generate plan" form (fires generatePlanAction)
 *   - Plan present → cards + a small heartbeat tile
 *
 * Simulator + per-day editing live on the lead's Plan tab (workbench
 * overlay). The cockpit is for chat-driven editing, not visualization.
 */
import { useEffect, useState, useTransition } from "react";
import { PlanDayCard } from "@/app/lead/[id]/PlanDayCard";
import { generatePlanAction } from "@/app/lead/[id]/actions";
import type { SevenDayPlan } from "@/lib/plan";

type LatestHeartbeat = {
  ran_at: string;
  actions_fired: number;
  actions_skipped: number;
  snapshot_match: boolean | null;
  plan_was_stale: boolean | null;
} | null;

const TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;

export function PlanDayStrip({ leadId, leadName }: { leadId: string; leadName: string | null }) {
  const [plan, setPlan] = useState<SevenDayPlan | null>(null);
  const [heartbeat, setHeartbeat] = useState<LatestHeartbeat>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [horizon, setHorizon] = useState(7);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lead/${encodeURIComponent(leadId)}/plan`);
      const data = await res.json();
      if (data.ok) {
        setPlan((data.plan as SevenDayPlan) ?? null);
        setHeartbeat((data.heartbeat as LatestHeartbeat) ?? null);
      } else {
        setError(data.error || "load failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Cross-surface state sync: re-fetch when plan changes anywhere (lead page,
  // chat tool call) AND when the tab regains focus. Prevents the
  // "I generated a plan elsewhere but cockpit still shows 'no plan yet'"
  // duplicate-create trap.
  useEffect(() => {
    function onVisibility() {
      if (typeof document !== "undefined" && !document.hidden) {
        void load();
      }
    }
    function onPlanChanged(ev: Event) {
      const detail = (ev as CustomEvent<{ lead_id?: string }>).detail;
      if (!detail?.lead_id || detail.lead_id === leadId) {
        void load();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function generate() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lead_id", leadId);
      fd.set("horizon_days", String(horizon));
      try {
        await generatePlanAction(fd);
        await load();
        // Notify other plan consumers (lead-page workbench in another tab, etc.)
        window.dispatchEvent(
          new CustomEvent("comeketo:plan-changed", { detail: { lead_id: leadId } })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (loading) {
    return (
      <div className="cmk-strip-card">
        <div className="cmk-strip-eyebrow">plan</div>
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cmk-strip-card">
        <div className="cmk-strip-eyebrow">plan</div>
        <p className="muted" style={{ fontSize: 11 }}>
          <strong>load failed:</strong> {error}
        </p>
        <button type="button" className="plan-btn" onClick={() => void load()} style={{ fontSize: 11 }}>
          Retry
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="cmk-strip-card">
        <div className="cmk-strip-eyebrow">no plan yet</div>
        <p className="muted" style={{ fontSize: 11, margin: "4px 0 8px" }}>
          {leadName ? `${leadName} has no active plan.` : "This lead has no active plan."} Generate one to start
          working it from the cockpit.
        </p>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            max={180}
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, Math.min(180, parseInt(e.target.value, 10) || 7)))}
            className="plan-horizon-input"
            style={{ width: 56 }}
            aria-label="cycle days"
          />
          <span style={{ fontSize: 11, color: "var(--ink-mid)" }}>day cycle</span>
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            onClick={generate}
            disabled={pending}
            style={{ fontSize: 11 }}
          >
            {pending ? "generating…" : "Generate plan"}
          </button>
        </div>
      </div>
    );
  }

  const needsReviewCount = plan.days.filter((d) => d.approval_status === "needs_review").length;
  const approvedCount = plan.days.filter((d) => d.approval_status === "approved").length;
  const sentCount = plan.days.filter((d) => d.approval_status === "sent").length;

  return (
    <div className="cmk-strip-wrap">
      <div className="cmk-strip-card">
        <div className="cmk-strip-eyebrow">plan · {plan.status}</div>
        <div style={{ fontSize: 12, fontFamily: "var(--serif)", margin: "2px 0 4px" }}>
          {plan.days.length}-day cycle · {sentCount} sent
        </div>
        <div className="cmk-plan-strip-summary">
          <span>{needsReviewCount} needs review</span>
          <span>{approvedCount} approved</span>
          <span>{sentCount} sent</span>
        </div>
      </div>

      {heartbeat && (
        <div className="cmk-strip-card">
          <div className="cmk-strip-eyebrow">last heartbeat</div>
          <div style={{ fontSize: 11, color: "var(--ink-mid)" }}>
            {new Date(heartbeat.ran_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <strong>{heartbeat.actions_fired}</strong> fired · <strong>{heartbeat.actions_skipped}</strong> skipped
          </div>
        </div>
      )}

      <div className="cmk-strip-days">
        {plan.days.map((d, idx) => (
          <PlanDayCard
            key={`${plan.plan_id}-${idx}`}
            day={d}
            dayIndex={idx}
            tone={TONES[idx % TONES.length]}
            planId={plan.plan_id}
            leadId={leadId}
            goalSummary={plan.goal_summary}
            planStale={false}
          />
        ))}
      </div>
    </div>
  );
}
