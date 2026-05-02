"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { runHeartbeatNowAction } from "./actions";
import {
  heartbeatReportHeadline,
  type ExecutionMode,
} from "@/lib/heartbeat-summary";
import type { HeartbeatReport } from "@/lib/heartbeat";

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
  DAY_ALREADY_SENT: "Day already sent",
  DAY_NOT_TODAY: "Not today",
  EXECUTION_DISABLED: "Draft-only mode",
  NEEDS_APPROVAL: "Needs approval",
  VOICE_FAIL: "NEPQ voice fail",
  CLOSE_API_ERROR: "Close API error",
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type LatestSummary = {
  ran_at: string;
  actions_eligible: number;
  actions_fired: number;
  actions_skipped: number;
  skip_breakdown: Record<string, number>;
  snapshot_match: boolean;
  plan_was_stale: boolean;
} | null;

const MODE_LABEL: Record<string, { label: string; tone: "ok" | "live" | "warn" }> = {
  draft_only: { label: "draft only", tone: "ok" },
  approval_required: { label: "approval required", tone: "ok" },
  approved_plan_execution: { label: "live → close", tone: "live" },
  manual_send_only: { label: "manual only", tone: "warn" },
};

export function HeartbeatPanel({
  planId,
  leadId,
  latest,
  executionMode,
}: {
  planId: string;
  leadId: string;
  latest: LatestSummary;
  executionMode: ExecutionMode;
}) {
  const modeInfo = MODE_LABEL[executionMode] ?? { label: executionMode, tone: "ok" as const };
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<HeartbeatReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await runHeartbeatNowAction(planId, leadId);
      if (r.ok) {
        setReport(r.report);
        setOpen(true);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="hb-panel">
      <div className="hb-panel-l">
        <span className="cme-eyebrow">
          heartbeat
          <span className={`hb-mode hb-mode-${modeInfo.tone}`}>{modeInfo.label}</span>
        </span>
        {latest ? (
          <div className="hb-panel-summary">
            <span>last sweep <strong>{fmtTime(latest.ran_at)}</strong></span>
            <span className="lead-sep">·</span>
            <span>
              <strong>{latest.actions_eligible}</strong> touches ·{" "}
              {heartbeatReportHeadline(
                {
                  actions_fired: latest.actions_fired,
                  actions_skipped: latest.actions_skipped,
                  skip_breakdown: latest.skip_breakdown,
                },
                executionMode as ExecutionMode
              )}
            </span>
            {!latest.snapshot_match && (
              <>
                <span className="lead-sep">·</span>
                <span className="hb-stale">box changed since plan</span>
              </>
            )}
            {latest.plan_was_stale && (
              <>
                <span className="lead-sep">·</span>
                <span className="hb-stale">plan was paused</span>
              </>
            )}
          </div>
        ) : (
          <div className="hb-panel-summary">no sweep yet for this lead</div>
        )}
      </div>
      <div className="hb-panel-r">
        <button
          type="button"
          className="plan-btn"
          onClick={run}
          disabled={pending}
        >
          {pending ? "Sweeping…" : "Run heartbeat now"}
        </button>
        {report && !pending && (
          <button
            type="button"
            className="plan-btn"
            onClick={() => setOpen(true)}
          >
            View last report
          </button>
        )}
      </div>
      {error && <div className="hb-error">Error: {error}</div>}

      <Modal open={open && !!report} onClose={() => setOpen(false)} labelledBy="hb-h">
        {report && (
          <div className="plan-day-modal">
            <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
              <span className="cme-eyebrow">heartbeat report</span>
              <h2 id="hb-h" className="plan-day-modal-title">
                {heartbeatReportHeadline(report, executionMode as ExecutionMode)}
              </h2>
              <p className="plan-day-modal-context">
                Ran {fmtTime(report.ran_at)} · {report.duration_ms}ms · lead tz <strong>{report.lead_tz}</strong>
                {report.lead_tz_source !== "fallback_operator" && report.lead_tz_detail && (
                  <span> ({report.lead_tz_detail})</span>
                )}
              </p>
            </header>
            <div className="plan-day-modal-body">
              <div className="hb-summary">
                <span><strong>Snapshot:</strong> {report.snapshot_match ? "in sync ✓" : "MISMATCH — plan paused"}</span>
                {report.stop_signal_active && (
                  <span className="hb-flag">⚠ Stop signal detected — all sends blocked</span>
                )}
                {report.reply_gate_active && (
                  <span className="hb-flag">⚠ Reply gate active — new inbound since last outbound</span>
                )}
                {report.ownership_status_skip && (
                  <span className="hb-flag">⚠ Ownership/status gate: {report.ownership_status_skip}</span>
                )}
              </div>

              {Object.keys(report.skip_breakdown).length > 0 && (
                <div className="hb-skips">
                  <h3 className="cme-eyebrow">Skip breakdown</h3>
                  <div className="hb-skips-grid">
                    {Object.entries(report.skip_breakdown)
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

              <div className="hb-days">
                <h3 className="cme-eyebrow">Day-by-day verdicts</h3>
                {report.days.map((d) => (
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
                            <span className="hb-action-fire" title={a.verdict.reason}>
                              {a.verdict.reason === "fired" ? "Close write ok" : "Gate-eligible (not sent)"}
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
          </div>
        )}
      </Modal>
    </div>
  );
}
