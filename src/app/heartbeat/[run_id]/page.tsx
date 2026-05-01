import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { getHeartbeatRunById, type HeartbeatRunRow } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";

const SKIP_LABEL: Record<string, string> = {
  OWNERSHIP: "Not Andre's lead",
  STATUS_WON: "Won — no-touch",
  STATUS_LOST: "Lost — no-touch",
  STOP_SIGNAL: "Stop signal",
  REPLY_GATE: "Reply gate",
  SEND_WINDOW: "Outside send window",
  FREQUENCY_CAP_24H: "1/24h cap",
  FREQUENCY_CAP_7D: "4/7d cap",
  STALE_BOX: "Box changed",
  NO_CONTACT: "No contact",
  DAY_NOT_APPROVED: "Day not approved",
  DAY_SKIPPED: "Day skipped",
  DAY_ALREADY_SENT: "Already sent",
  DAY_NOT_TODAY: "Not today",
  EXECUTION_DISABLED: "Draft-only mode",
  VOICE_FAIL: "NEPQ voice fail",
  CLOSE_API_ERROR: "Close API error",
};

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type DayReport = {
  day_index: number;
  day_number: number;
  approval_status: string;
  date: string;
  is_today: boolean;
  actions: Array<{
    channel: string;
    intent: string;
    verdict:
      | { fire: true; reason: string; executed?: { kind: string; close_id?: string } }
      | { fire: false; skip_code: string; reason: string };
  }>;
};

export default async function HeartbeatRunPage({ params }: { params: { run_id: string } }) {
  let run: HeartbeatRunRow | null = null;
  let fetchError: string | null = null;
  try {
    run = await getHeartbeatRunById(params.run_id);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !run) {
    return (
      <div className="cme-shell">
        <AppHeader wordmarkHref="/" />
        <TabNav active="heartbeat" />
        <main className="hb-page-main">
          <p>
            <Link href="/heartbeat" className="lead-back">← back to heartbeat</Link>
          </p>
          <h1 className="hb-page-title">Run not found</h1>
          {fetchError && <pre className="lead-error">{fetchError}</pre>}
        </main>
      </div>
    );
  }

  const reportDays = (run.report as DayReport[]) || [];
  const isSweepSummary = run.scope === "all";

  return (
    <div className="cme-shell">
      <AppHeader wordmarkHref="/" />
      <TabNav active="heartbeat" />

      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <Link href="/heartbeat" className="lead-back">← heartbeat</Link>
            <h1 className="hb-page-title">
              {isSweepSummary ? "Sweep summary" : "Lead sweep"}
            </h1>
            <div className="hb-page-meta">
              <span>{fmtTime(run.ran_at)}</span>
              <span className="lead-sep">·</span>
              <span>{run.actions_fired} fired</span>
              <span className="lead-sep">·</span>
              <span>{run.actions_skipped} skipped</span>
              <span className="lead-sep">·</span>
              <span>trigger: <strong>{run.trigger}</strong></span>
              {run.duration_ms != null && (
                <>
                  <span className="lead-sep">·</span>
                  <span>{run.duration_ms}ms</span>
                </>
              )}
            </div>
          </div>
          <div className="hb-page-toolbar-r">
            {run.close_lead_id && (
              <Link href={`/lead/${run.close_lead_id}`} className="plan-btn">
                Open Lead Box
              </Link>
            )}
          </div>
        </div>

        {/* Snapshot status */}
        {!isSweepSummary && (
          <div className="hb-summary">
            <span>
              <strong>Snapshot:</strong>{" "}
              {run.snapshot_match ? "in sync ✓" : "MISMATCH"}
            </span>
            {run.plan_was_stale && <span className="hb-flag">⚠ Plan was paused (stale)</span>}
          </div>
        )}

        {/* Skip breakdown */}
        {Object.keys(run.skip_breakdown || {}).length > 0 && (
          <div className="hb-section">
            <h2 className="hb-section-h">Skip breakdown</h2>
            <div className="hb-skips-grid">
              {Object.entries(run.skip_breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => (
                  <div key={code} className="hb-skip-row">
                    <span className="hb-skip-count">{count}</span>
                    <span className="hb-skip-code">{SKIP_LABEL[code] || code}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Day-by-day verdicts */}
        {!isSweepSummary && reportDays.length > 0 && (
          <div className="hb-section">
            <h2 className="hb-section-h">Day-by-day verdicts</h2>
            <div className="hb-days">
              {reportDays.map((d) => (
                <div key={d.day_index} className="hb-day">
                  <header className="hb-day-head">
                    <span className="hb-day-num">Day {d.day_number}</span>
                    <span className="hb-day-date">{d.date}</span>
                    <span className={`hb-day-status hb-day-status-${d.approval_status}`}>
                      {d.approval_status.replace(/_/g, " ")}
                    </span>
                    {d.is_today && <span className="hb-day-today">today</span>}
                  </header>
                  {d.actions.length === 0 ? (
                    <div className="hb-empty">no actions</div>
                  ) : (
                    d.actions.map((a, i) => (
                      <div key={i} className="hb-action">
                        <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
                          {a.channel}
                        </span>
                        <span className="hb-action-intent">{a.intent}</span>
                        {a.verdict.fire ? (
                          <span className="hb-action-fire" title={a.verdict.executed?.close_id || a.verdict.reason}>
                            {a.verdict.reason === "fired" ? "fired ✓" : "would fire"}
                          </span>
                        ) : (
                          <span className="hb-action-skip" title={a.verdict.reason}>
                            {SKIP_LABEL[a.verdict.skip_code] || a.verdict.skip_code}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sweep summary fallback (scope=all) */}
        {isSweepSummary && (
          <div className="hb-section">
            <h2 className="hb-section-h">Sweep payload</h2>
            <pre className="activity-body-pre">{JSON.stringify(run.report, null, 2)}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
