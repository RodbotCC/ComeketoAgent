import Link from "next/link";
import type { TimelineItem } from "@/lib/box-timeline";
import { activityLine } from "./timeline-activity-line";

/** Unified comms + threads + plan days (newest first). */
export function BoxTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <div className="lead-empty">Nothing on the timeline yet.</div>;
  }

  return (
    <ul className="lead-timeline">
      {items.slice(0, 80).map((it) => {
        if (it.kind === "activity") {
          const { line, direction, kind } = activityLine(it.activity);
          return (
            <li key={it.id} className="lead-timeline-item">
              <span className="lead-timeline-dot" data-kind={kind} />
              <div>
                <div className="lead-timeline-meta">
                  <span className="lead-timeline-kind">{kind}</span>
                  <span className="lead-timeline-dir">{direction}</span>
                  <time dateTime={it.at}>{it.at}</time>
                </div>
                <div className="lead-timeline-body">{line}</div>
              </div>
            </li>
          );
        }
        if (it.kind === "thread") {
          const subj = it.thread.subject || "(thread)";
          return (
            <li key={it.id} className="lead-timeline-item">
              <span className="lead-timeline-dot" data-kind="thread" />
              <div>
                <div className="lead-timeline-meta">
                  <span className="lead-timeline-kind">email thread</span>
                  <time dateTime={it.at}>{it.at}</time>
                </div>
                <div className="lead-timeline-body">{subj}</div>
              </div>
            </li>
          );
        }
        return (
          <li key={it.id} className="lead-timeline-item">
            <span className="lead-timeline-dot" data-kind="plan" />
            <div>
              <div className="lead-timeline-meta">
                <span className="lead-timeline-kind">plan day {it.dayNumber}</span>
                <span className={`lead-timeline-appr appr-${it.approval_status}`}>{it.approval_status}</span>
                <time dateTime={it.date}>{it.date}</time>
              </div>
              <div className="lead-timeline-body">
                {it.channels.join(" · ")} — {it.intents.slice(0, 2).join(" | ")}
                {it.intents.length > 2 ? "…" : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentExecutionStrip({
  leadId,
  rows,
}: {
  leadId: string;
  rows: Array<{
    id: string;
    at: string;
    action_kind: string;
    result: string;
    skip_code: string | null;
    trace_id: string | null;
  }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="lead-recent-audit widget" style={{ marginTop: 12, padding: "10px 12px", fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent actions</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((r) => (
          <li key={r.id} style={{ borderBottom: "1px solid var(--rule-soft)", padding: "6px 0" }}>
            <span style={{ color: "var(--ink-soft)" }}>{new Date(r.at).toLocaleString()}</span>
            {" · "}
            <code>{r.action_kind}</code>
            {r.result !== "ok" && <span style={{ color: "var(--accent-bad)" }}> ({r.result})</span>}
            {r.skip_code && <span> · {r.skip_code}</span>}
            {r.trace_id && (
              <>
                {" · "}
                <Link href={`/heartbeat`} className="ag-back-link" title={r.trace_id}>
                  trace
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 8, color: "var(--ink-faint)" }}>
        Full audit in Supabase <code>execution_log</code> for lead <code>{leadId.slice(0, 12)}…</code>
      </p>
    </div>
  );
}

/** Analytics strip — explainable summary (Guardrails §N1). */
export function BoxAnalyticsStrip(props: {
  planFresh: boolean;
  replyGate: boolean;
  cycleDayDisplay: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}) {
  return (
    <div
      className="lead-analytics-strip widget"
      style={{
        marginTop: 12,
        padding: "10px 14px",
        fontSize: 12,
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 20px",
        alignItems: "center",
      }}
    >
      <span>
        <strong>Plan vs Box:</strong> {props.planFresh ? "in sync" : "stale — review §I3"}
      </span>
      <span>
        <strong>Reply gate:</strong> {props.replyGate ? "on (inbound newer)" : "off"}
      </span>
      <span>
        <strong>Cadence:</strong> {props.cycleDayDisplay}
      </span>
      <span style={{ color: "var(--ink-soft)" }}>
        Last in {props.lastInboundAt || "—"} · Last out {props.lastOutboundAt || "—"}
      </span>
    </div>
  );
}
