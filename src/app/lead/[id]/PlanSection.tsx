import {
  generatePlanAction,
  approvePlanAction,
  killPlanAction,
  pausePlanAction,
} from "./actions";
import type { SevenDayPlan } from "@/lib/plan";
import { PlanDayCard } from "./PlanDayCard";
import { PlanCardClient } from "./PlanCardClient";
import { CloseActionsPreview } from "./CloseActionsPreview";

type PersistedPlan = SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
};

const GOAL_LABEL: Record<SevenDayPlan["primary_goal"], string> = {
  scheduled_call: "Scheduled call with Andre",
  tasting: "Tasting offer",
  quote: "Quote",
  clarify: "Clarify",
  re_engage: "Re-engage",
};

// Pastel tones cycle for any plan length.
const DAY_TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;

const HORIZON_PRESETS = [1, 2, 3, 5, 7, 14, 21, 30, 45, 60, 90] as const;

function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PlanSection({
  leadId,
  plan,
  planError,
  currentSnapshotId,
  defaultHorizonDays,
}: {
  leadId: string;
  plan: PersistedPlan | null;
  planError?: string | null;
  currentSnapshotId: string;
  defaultHorizonDays: number;
}) {
  // ─── Plan fetch failed (Supabase blip etc.) — distinct from "no plan yet" ───
  if (!plan && planError) {
    return (
      <div className="lead-card widget plan-empty">
        <h3 className="lead-card-h">Plan fetch failed</h3>
        <p className="plan-empty-msg">
          A plan probably exists for this lead, but we couldn&rsquo;t load it from storage just now.
          Refresh to retry — if it keeps failing, check the server console for the underlying error.
        </p>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          <strong>Error:</strong> {planError}
        </p>
        <p style={{ marginTop: 12 }}>
          <a href={`/lead/${leadId}?retry=${Date.now()}`} className="plan-btn plan-btn-primary">
            Refresh
          </a>
        </p>
      </div>
    );
  }

  // ─── No plan yet — show the generate button ───
  if (!plan) {
    return (
      <div className="lead-card widget plan-empty">
        <h3 className="lead-card-h">Cycle plan</h3>
        <p className="plan-empty-msg">
          No plan yet. Generate from the current Box — NEPQ voice, Guardrails §D. Default week length is 7 days (NEPQ sweep); pick another length for same-day blitz or a longer bridge.
        </p>
        <form action={generatePlanAction} className="plan-generate-form">
          <input type="hidden" name="lead_id" value={leadId} />
          <label className="plan-horizon-label">
            <span>Calendar days in cycle</span>
            <input
              type="number"
              name="horizon_days"
              min={1}
              max={180}
              defaultValue={defaultHorizonDays}
              list={`plan-horizon-presets-${leadId}`}
              className="plan-horizon-input"
            />
            <datalist id={`plan-horizon-presets-${leadId}`}>
              {HORIZON_PRESETS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <button type="submit" className="plan-btn plan-btn-primary">Generate plan</button>
        </form>
      </div>
    );
  }

  const stale = plan.based_on_snapshot_id !== currentSnapshotId && plan.status !== "killed";
  const isLocked = plan.status === "killed" || plan.status === "completed";

  return (
    <PlanCardClient
      planId={plan.plan_id}
      leadId={leadId}
      status={plan.status}
      planDayCount={plan.days.length}
      regenerateHorizonDays={plan.days.length}
      planStale={stale}
    >
    <div className="lead-card widget plan-card">
      <div className="plan-head">
        <div className="plan-head-l">
          <h3 className="lead-card-h" style={{ marginBottom: 4 }}>
            Cycle plan <span className="plan-horizon-pill">{plan.days.length} days</span>
          </h3>
          <div className="plan-meta">
            <span className={`plan-status plan-status-${plan.status}`}>{plan.status}</span>
            <span className="lead-sep">·</span>
            <span>goal: <strong>{GOAL_LABEL[plan.primary_goal]}</strong></span>
            <span className="lead-sep">·</span>
            <span>generated {fmtTime(plan.generated_at)}</span>
            {plan.approved_at && (
              <>
                <span className="lead-sep">·</span>
                <span>approved by {plan.approved_by} {fmtTime(plan.approved_at)}</span>
              </>
            )}
          </div>
        </div>
        <div className="plan-head-r">
          <span
            className={`plan-snap-badge${stale ? " stale" : ""}`}
            title={`Plan snapshot: ${plan.based_on_snapshot_id}\nCurrent Box snapshot: ${currentSnapshotId}\n${stale ? "Box has changed — regenerate before any sends." : "Plan is in sync with the Box."}`}
          >
            {stale ? "Stale" : "In sync"}
          </span>
        </div>
      </div>

      {plan.goal_summary && <p className="plan-summary">{plan.goal_summary}</p>}
      {plan.lead_state_summary && <p className="plan-state">{plan.lead_state_summary}</p>}

      <p className="muted" style={{ fontSize: 11, margin: "6px 0 4px" }}>
        <strong>Same-day multi-touch:</strong> you can add several touches per calendar day; the heartbeat runs each
        in order. Rolling caps (1/24h, 4/7d) still apply — a second outbound may show{" "}
        <code>FREQUENCY_CAP_*</code> until the window passes.
      </p>

      <div className="plan-facts">
        {plan.known_facts.length > 0 && (
          <div>
            <div className="plan-facts-eyebrow">known</div>
            <ul className="plan-facts-list">
              {plan.known_facts.map((f, i) => <li key={`k${i}`}>{f}</li>)}
            </ul>
          </div>
        )}
        {plan.unknowns.length > 0 && (
          <div>
            <div className="plan-facts-eyebrow">unknowns</div>
            <ul className="plan-facts-list">
              {plan.unknowns.map((f, i) => <li key={`u${i}`}>{f}</li>)}
            </ul>
          </div>
        )}
      </div>

      {plan.best_next_question && (
        <div className="plan-question">
          <span className="plan-question-eyebrow">best next question</span>
          <span className="plan-question-text">{plan.best_next_question}</span>
        </div>
      )}

      <div className="plan-days">
        {plan.days.map((d, idx) => (
          <PlanDayCard
            key={`${plan.plan_id}-${idx}`}
            day={d}
            dayIndex={idx}
            tone={DAY_TONES[idx % DAY_TONES.length]}
            planId={plan.plan_id}
            leadId={leadId}
            goalSummary={plan.goal_summary}
            planStale={stale}
          />
        ))}
      </div>

      {plan.stop_conditions.length > 0 && (
        <div className="plan-stops">
          <div className="plan-facts-eyebrow">stop conditions</div>
          <ul className="plan-facts-list">
            {plan.stop_conditions.map((s, i) => (
              <li key={i}>
                <strong>{s.trigger}</strong> → {s.action}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isLocked && (
        <div className="plan-actions">
          {plan.status === "draft" && (
            <form action={approvePlanAction} style={{ display: "inline" }}>
              <input type="hidden" name="plan_id" value={plan.plan_id} />
              <input type="hidden" name="lead_id" value={leadId} />
              <button type="submit" className="plan-btn plan-btn-primary">Approve</button>
            </form>
          )}
          {(plan.status === "approved" || plan.status === "active") && (
            <form action={pausePlanAction} style={{ display: "inline" }}>
              <input type="hidden" name="plan_id" value={plan.plan_id} />
              <input type="hidden" name="lead_id" value={leadId} />
              <button type="submit" className="plan-btn">Pause</button>
            </form>
          )}
          <form action={generatePlanAction} style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input type="hidden" name="lead_id" value={leadId} />
            <label className="plan-horizon-label plan-horizon-inline">
              <span>Regenerate as</span>
              <input
                type="number"
                name="horizon_days"
                min={1}
                max={180}
                defaultValue={plan.days.length}
                list={`plan-horizon-presets-regen-${leadId}`}
                className="plan-horizon-input"
              />
              <span className="plan-horizon-suffix">days</span>
            </label>
            <datalist id={`plan-horizon-presets-regen-${leadId}`}>
              {HORIZON_PRESETS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button type="submit" className="plan-btn">Regenerate</button>
          </form>
          <CloseActionsPreview planId={plan.plan_id} />
          <form action={killPlanAction} style={{ display: "inline" }}>
            <input type="hidden" name="plan_id" value={plan.plan_id} />
            <input type="hidden" name="lead_id" value={leadId} />
            <input type="hidden" name="reason" value="killed by operator" />
            <button type="submit" className="plan-btn plan-btn-danger">Kill</button>
          </form>
        </div>
      )}

    </div>
    </PlanCardClient>
  );
}
