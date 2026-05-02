"use client";

import { useEffect, useState } from "react";
import { getSequenceSubscriptionSnapshotAction } from "./actions";

type Snap = {
  status?: string;
  date_updated?: string;
  pause_reason?: string;
};

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Near–real-time subscription telemetry: polls GET /sequence_subscription/{id}/ while the tab is visible.
 * Not millisecond-accurate; honest limits (Guardrails-aligned).
 */
export function SubscriptionRunWatch({
  subscriptionId,
  initial,
}: {
  subscriptionId: string;
  initial: Snap;
}) {
  const [snap, setSnap] = useState<Snap>(initial);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const r = await getSequenceSubscriptionSnapshotAction(subscriptionId);
      if (cancelled) return;
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setErr(null);
      const sub = r.sub;
      setSnap({
        status: pickStr(sub.status),
        date_updated: pickStr(sub.date_updated),
        pause_reason: pickStr(sub.pause_reason),
      });
    };
    const id = window.setInterval(() => void tick(), 22000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [subscriptionId]);

  return (
    <div style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 6, maxWidth: 520, lineHeight: 1.45 }}>
      <strong>Run watch</strong> · polls ~22s while this tab is visible (Close subscription GET — not instant
      delivery telemetry).
      {err && <> · error: {err}</>}
      {!err && (
        <>
          {" "}
          · status <code>{snap.status ?? "—"}</code>
          {snap.pause_reason && (
            <>
              {" "}
              · pause_reason: {snap.pause_reason}
            </>
          )}
          {snap.date_updated && (
            <>
              {" "}
              · updated {new Date(snap.date_updated).toLocaleString()}
            </>
          )}
        </>
      )}
    </div>
  );
}
