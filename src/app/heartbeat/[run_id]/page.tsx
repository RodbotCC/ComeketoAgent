import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { getHeartbeatRunById, type DayVerdict, type HeartbeatRunRow } from "@/lib/heartbeat";
import { resolveLeadNames, displayName } from "@/lib/lead-names";

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

type LeadSummaryRow = {
  close_lead_id: string;
  plan_id: string;
  snapshot_match: boolean;
  plan_was_stale: boolean;
  current_snapshot_id?: string;
  plan_snapshot_id?: string;
  actions_eligible: number;
  actions_fired: number;
  actions_skipped: number;
  skip_breakdown?: Record<string, number>;
};

function SweepLeadSummary({ report, leadNames }: { report: Record<string, unknown>; leadNames: Map<string, string> }) {
  const traceId = typeof report.trace_id === "string" ? report.trace_id : null;
  const sweepMs = typeof report.sweep_duration_ms === "number" ? report.sweep_duration_ms : null;
  const leadSummaries = Array.isArray(report.lead_summaries)
    ? (report.lead_summaries as LeadSummaryRow[])
    : [];
  const errors = Array.isArray(report.errors) ? (report.errors as Array<{ plan_id: string; error: string }>) : [];

  return (
    <div className="hb-section">
      <h2 className="hb-section-h">Sweep trace</h2>
      <div className="hb-summary" style={{ marginBottom: 16 }}>
        {traceId && (
          <span>
            <strong>trace_id:</strong> <code className="ag-seq-mono">{traceId}</code>
          </span>
        )}
        {sweepMs != null && (
          <>
            <span className="lead-sep">·</span>
            <span>
              <strong>sweep:</strong> {sweepMs}ms
            </span>
          </>
        )}
      </div>

      {leadSummaries.length > 0 && (
        <>
          <h3 className="hb-section-h" style={{ fontSize: 13 }}>
            Per-lead results
          </h3>
          <div className="hb-runs-table widget">
            <div className="hb-runs-row hb-runs-head">
              <div>Lead</div>
              <div>Snapshot</div>
              <div className="hb-num">Eligible</div>
              <div className="hb-num">Fired</div>
              <div className="hb-num">Skipped</div>
            </div>
            {leadSummaries.map((row) => (
              <div key={`${row.plan_id}-${row.close_lead_id}`} className="hb-runs-row">
                <div>
                  <Link href={`/lead/${row.close_lead_id}`} className="ag-back-link" title={row.close_lead_id}>
                    {displayName(row.close_lead_id, leadNames)}
                  </Link>
                </div>
                <div>
                  {row.snapshot_match ? (
                    <span className="hb-snap-ok">in sync</span>
                  ) : (
                    <span className="hb-snap-stale">stale</span>
                  )}
                  {row.plan_was_stale && <span className="hb-flag"> paused</span>}
                </div>
                <div className="hb-num">{row.actions_eligible}</div>
                <div className="hb-num hb-num-fire">{row.actions_fired}</div>
                <div className="hb-num hb-num-skip">{row.actions_skipped}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {errors.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 className="hb-section-h" style={{ fontSize: 13 }}>
            Errors
          </h3>
          <ul style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {errors.map((e) => (
              <li key={e.plan_id}>
                <code>{e.plan_id}</code>: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SkipBreakdownSection({ skips }: { skips: Record<string, number> }) {
  if (Object.keys(skips).length === 0) return null;
  return (
    <div className="hb-section">
      <h2 className="hb-section-h">Skip breakdown</h2>
      <div className="hb-skips-grid">
        {Object.entries(skips)
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => (
            <div key={code} className="hb-skip-row">
              <span className="hb-skip-count">{count}</span>
              <span className="hb-skip-code">{SKIP_LABEL[code] || code}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default async function HeartbeatRunPage({ params }: { params: { run_id: string } }) {
  let run: HeartbeatRunRow | null = null;
  let fetchError: string | null = null;
  try {
    run = await getHeartbeatRunById(params.run_id);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }
  const leadNames = await resolveLeadNames();

  if (fetchError || !run) {
    return (
      <div className="cme-shell">
        <AppHeader />
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

  const isSweepSummary = run.scope === "all";
  const reportDays =
    !isSweepSummary && Array.isArray(run.report) ? (run.report as DayVerdict[]) : [];

  return (
    <div className="cme-shell">
      <AppHeader />
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
        {!isSweepSummary ? (
          <div className="hb-summary">
            <span>
              <strong>Snapshot:</strong>{" "}
              {run.snapshot_match ? "in sync ✓" : "MISMATCH"}
            </span>
            {run.plan_was_stale ? <span className="hb-flag">⚠ Plan was paused (stale)</span> : null}
          </div>
        ) : null}

        {/* Skip breakdown */}
        <SkipBreakdownSection skips={(run.skip_breakdown ?? {}) as Record<string, number>} />

        {/* Day-by-day verdicts */}
        {!isSweepSummary && reportDays.length > 0 ? (
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
                    {d.is_today ? <span className="hb-day-today">today</span> : null}
                  </header>
                  {d.actions.length === 0 ? (
                    <div className="hb-empty">no actions</div>
                  ) : (
                    d.actions.map((a, i: number) => (
                      <div key={i} className="hb-action">
                        <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
                          {a.channel}
                        </span>
                        <span className="hb-action-intent">{a.intent}</span>
                        {a.verdict.fire ? (
                          <span className="hb-action-fire" title={a.verdict.executed?.close_id || a.verdict.reason}>
                            {a.verdict.reason === "fired" ? "Close write ✓" : "gate-eligible"}
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
        ) : null}

        {/* Sweep: structured per-lead summary + trace */}
        {isSweepSummary && run.report && typeof run.report === "object" && run.report !== null ? (
          <SweepLeadSummary report={run.report as Record<string, unknown>} leadNames={leadNames} />
        ) : null}

        {/* Sweep summary fallback (scope=all) legacy */}
        {isSweepSummary && (!run.report || typeof run.report !== "object") ? (
          <div className="hb-section">
            <h2 className="hb-section-h">Sweep payload</h2>
            <pre className="activity-body-pre">{JSON.stringify(run.report, null, 2)}</pre>
          </div>
        ) : null}
      </main>
    </div>
  );
}
