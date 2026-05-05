"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-refresh pill for the Lead Box page.
 *
 * Triggers `router.refresh()` on a configurable interval so changes made
 * directly in Close (status flips, new emails, new notes, etc.) propagate
 * into the Box without a manual reload.
 *
 * Defaults to OFF on the lead page: this page is actively edited, so
 * passive 30s polling raced with plan generation and made the just-rendered
 * plan vanish whenever a plan-read transiently failed. Operator can opt in
 * by clicking the pill.
 *
 * Click to toggle on/off. Pauses automatically when the tab is hidden so
 * we don't burn Close API quota on a backgrounded window.
 */
export function AutoRefresh({
  intervalMs = 30000,
  defaultEnabled = false,
}: {
  intervalMs?: number;
  defaultEnabled?: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [tickedAt, setTickedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    function fire() {
      if (typeof document !== "undefined" && document.hidden) return; // don't refetch while tab is backgrounded
      setPending(true);
      router.refresh();
      setTickedAt(Date.now());
      // router.refresh() is fire-and-forget; clear pending after a brief delay
      // to give the eye some feedback.
      window.setTimeout(() => setPending(false), 800);
    }

    if (enabled) {
      timerRef.current = setInterval(fire, intervalMs);
    } else {
      clearTimer();
    }

    return clearTimer;
  }, [enabled, intervalMs, router]);

  // Pause briefly when tab visibility changes to hidden, resume when visible.
  useEffect(() => {
    function onVisibility() {
      if (typeof document === "undefined") return;
      if (!document.hidden && enabled) {
        // Tab regained focus — refresh once immediately, then the interval continues.
        router.refresh();
        setTickedAt(Date.now());
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, router]);

  function manualRefresh() {
    setPending(true);
    router.refresh();
    setTickedAt(Date.now());
    window.setTimeout(() => setPending(false), 800);
  }

  const seconds = Math.round(intervalMs / 1000);
  const lastLabel = tickedAt
    ? `last ${Math.max(1, Math.round((Date.now() - tickedAt) / 1000))}s ago`
    : "ready";

  return (
    <div className="auto-refresh-row">
      <button
        type="button"
        className={`auto-refresh-pill${enabled ? " on" : " off"}${pending ? " pulsing" : ""}`}
        onClick={() => setEnabled((v) => !v)}
        title={enabled ? `Auto-refreshing every ${seconds}s — click to turn off` : `Auto-refresh off — click to enable (every ${seconds}s)`}
      >
        <span className="auto-refresh-dot" />
        {enabled ? `auto · ${seconds}s` : "auto off"}
      </button>
      <button
        type="button"
        className="auto-refresh-now"
        onClick={manualRefresh}
        disabled={pending}
        title="Refresh now"
      >
        ↻
      </button>
      <span className="auto-refresh-last">{lastLabel}</span>
    </div>
  );
}
