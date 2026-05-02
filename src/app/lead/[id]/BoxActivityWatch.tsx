"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to `/api/leads/[id]/activity-stream` SSE; on bump, surfaces refresh CTA.
 * Falls back silently if EventSource unsupported.
 */
export function BoxActivityWatch({
  leadId,
  initialLatestReceivedAt,
}: {
  leadId: string;
  initialLatestReceivedAt: string | null;
}) {
  const router = useRouter();
  const [bump, setBump] = useState(false);
  const initialRef = useRef(initialLatestReceivedAt);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const url = `/api/leads/${encodeURIComponent(leadId)}/activity-stream`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; latestReceivedAt?: string | null };
        if (msg.type === "bump" && msg.latestReceivedAt !== initialRef.current) {
          setBump(true);
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [leadId]);

  if (!bump) return null;

  return (
    <div
      className="lead-webhook-bump"
      style={{
        marginTop: 8,
        padding: "8px 12px",
        borderRadius: 8,
        background: "color-mix(in oklab, var(--sage-deep) 12%, var(--card))",
        border: "0.5px solid var(--rule)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>New Close webhook activity — Box may be stale.</span>
      <button
        type="button"
        className="leads-search-submit"
        onClick={() => {
          setBump(false);
          initialRef.current = null;
          router.refresh();
        }}
      >
        Refresh Box
      </button>
    </div>
  );
}
