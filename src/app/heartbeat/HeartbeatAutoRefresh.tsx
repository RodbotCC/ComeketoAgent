"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mount once on `/heartbeat`. Calls `router.refresh()` every `intervalMs`
 * while the tab is foreground; pauses when hidden so a backgrounded tab
 * doesn't burn Close API calls.
 *
 * Uses `router.refresh()` (App Router) which re-runs the Server Component
 * data path without a hard navigation — so the truth strip + recent-runs
 * table tick in place with no flash.
 */
export function HeartbeatAutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        router.refresh();
      }, intervalMs);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Refresh once on return so the operator doesn't see stale data
        // from when the tab was backgrounded, then resume the interval.
        router.refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);

  return null;
}
