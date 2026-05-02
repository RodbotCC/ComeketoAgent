import type { CloseSequenceSubscription } from "@/lib/close";
import { updateSequenceSubscriptionAction } from "./actions";
import { SubscriptionRunWatch } from "./SubscriptionRunWatch";

export function WorkflowSubscriptionControls({
  leadId,
  subscriptions,
}: {
  leadId: string;
  subscriptions: CloseSequenceSubscription[];
}) {
  if (subscriptions.length === 0) return null;

  return (
    <div className="lead-enroll widget" style={{ marginTop: 12, padding: "12px 14px" }}>
      <h4 className="lead-card-h" style={{ fontSize: 13, marginBottom: 8 }}>
        Subscription controls (Close write)
      </h4>
      <p style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10 }}>
        Pause or resume sequence subscriptions. Confirm checkbox required per §I4.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {subscriptions.map((s) => (
          <li
            key={s.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "0.5px solid var(--rule)",
            }}
          >
            <div style={{ flex: "1 1 160px", minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.sequence_name || s.sequence_id}</div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                <span className={`lead-sub-status lead-sub-status-${s.status}`}>{s.status}</span>
                <span className="lead-sep">·</span>
                <code style={{ fontSize: 10 }}>{s.id.slice(0, 14)}…</code>
              </div>
              <SubscriptionRunWatch
                subscriptionId={s.id}
                initial={{
                  status: s.status,
                  date_updated: s.date_updated,
                  pause_reason: s.pause_reason,
                }}
              />
            </div>
            {s.status === "active" && (
              <form action={updateSequenceSubscriptionAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="lead_id" value={leadId} />
                <input type="hidden" name="subscription_id" value={s.id} />
                <input type="hidden" name="next_status" value="paused" />
                <label style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="confirm" value="yes" required />
                  confirm pause
                </label>
                <button type="submit" className="plan-btn">
                  Pause
                </button>
              </form>
            )}
            {s.status === "paused" && (
              <form action={updateSequenceSubscriptionAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="lead_id" value={leadId} />
                <input type="hidden" name="subscription_id" value={s.id} />
                <input type="hidden" name="next_status" value="active" />
                <label style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="confirm" value="yes" required />
                  confirm resume
                </label>
                <button type="submit" className="plan-btn plan-btn-primary">
                  Resume
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
