import {
  generatePlanAction,
  approvePlanAction,
  killPlanAction,
  pausePlanAction,
} from "./actions";
import type { SevenDayPlan } from "@/lib/plan";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";
import { PlanCardClient } from "./PlanCardClient";
import { PlanDaysWorkbench } from "./PlanDaysWorkbench";
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
  leadName,
  intakeArtifacts,
}: {
  leadId: string;
  plan: PersistedPlan | null;
  planError?: string | null;
  currentSnapshotId: string;
  defaultHorizonDays: number;
  leadName: string;
  intakeArtifacts: IntakeArtifactRow[];
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

      <PlanDaysWorkbench
        plan={plan}
        leadName={leadName}
        intakeArtifacts={intakeArtifacts}
      />
      {stale && (
        <p className="plan-empty-msg" style={{ marginTop: 8, fontSize: 11 }}>
          <strong>Plan is stale:</strong> Box snapshot has changed since plan generation. Regenerate before sending.
        </p>
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
