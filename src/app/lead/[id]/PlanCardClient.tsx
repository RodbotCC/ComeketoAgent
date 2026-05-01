"use client";

import { useState, useTransition } from "react";
import { Modal } from "./Modal";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import {
  refineWholePlanAction,
  approvePlanAction,
  killPlanAction,
  pausePlanAction,
  generatePlanAction,
  approveAllDaysAction,
  approveAndRunAction,
  type RefinePlanState,
} from "./actions";
import type { HeartbeatReport } from "@/lib/heartbeat";

/**
 * Client wrapper around the plan card chrome that owns:
 *  - the "Refine plan" button + whole-plan modal
 *  - the right-click context menu on the plan card
 *
 * The actual plan rendering (header, days, stop conditions, footer buttons)
 * stays as server-rendered children so we don't pay client cost for static
 * content.
 */
export function PlanCardClient({
  planId,
  leadId,
  status,
  children,
}: {
  planId: string;
  leadId: string;
  status: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<RefinePlanState>({ ok: true });
  const [pending, startTransition] = useTransition();

  function fireForm(action: (fd: FormData) => Promise<unknown> | unknown, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("lead_id", leadId);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      await action(fd);
    });
  }

  function refine() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("plan_id", planId);
      fd.set("lead_id", leadId);
      fd.set("instruction", instruction);
      const r = await refineWholePlanAction({ ok: true }, fd);
      setState(r);
      if (r.ok) {
        setOpen(false);
        setInstruction("");
      }
    });
  }

  const [allDaysToast, setAllDaysToast] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<HeartbeatReport | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  function approveAll() {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("lead_id", leadId);
    startTransition(async () => {
      const r = await approveAllDaysAction({ ok: true }, fd);
      if (r.ok) {
        const parts = [];
        if (r.approved) parts.push(`${r.approved} approved`);
        if (r.skipped) parts.push(`${r.skipped} skipped (voice blocked)`);
        setAllDaysToast(parts.length ? parts.join(" · ") : "no days needed approval");
        window.setTimeout(() => setAllDaysToast(null), 4000);
      } else {
        setAllDaysToast(`error: ${r.error}`);
      }
    });
  }

  function approveAndRun() {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("lead_id", leadId);
    startTransition(async () => {
      const r = await approveAndRunAction({ ok: true }, fd);
      if (r.ok) {
        const approvedPart = r.approved ? `${r.approved} approved` : "";
        const skippedPart = r.skipped_voice ? `${r.skipped_voice} voice-blocked` : "";
        const fired = r.report?.actions_fired ?? 0;
        const skipped = r.report?.actions_skipped ?? 0;
        const mode = r.execution_mode === "approved_plan_execution" ? "fired" : "would-fire";
        const parts = [approvedPart, skippedPart, `${fired} ${mode} · ${skipped} skipped`].filter(Boolean);
        setAllDaysToast(parts.join(" · "));
        if (r.report) setRunReport(r.report);
        window.setTimeout(() => setAllDaysToast(null), 5000);
      } else {
        setAllDaysToast(`error: ${r.error}`);
      }
    });
  }

  const items: ContextMenuItem[] = [
    { kind: "label", text: "Plan actions" },
    { kind: "item", label: "Approve & run heartbeat", onSelect: approveAndRun },
    { kind: "item", label: "Approve all days", onSelect: approveAll },
    { kind: "item", label: "Refine whole plan…", onSelect: () => setOpen(true) },
    { kind: "item", label: "Regenerate from scratch", onSelect: () => fireForm(generatePlanAction) },
    { kind: "divider" },
  ];
  if (status === "draft") {
    items.push({ kind: "item", label: "Approve", onSelect: () => fireForm(approvePlanAction) });
  }
  if (status === "approved" || status === "active") {
    items.push({ kind: "item", label: "Pause", onSelect: () => fireForm(pausePlanAction) });
  }
  if (status !== "killed" && status !== "completed") {
    items.push({
      kind: "item",
      label: "Kill plan",
      tone: "danger",
      onSelect: () => fireForm(killPlanAction, { reason: "killed by operator (right-click)" }),
    });
  }

  return (
    <>
      <ContextMenu items={items}>
        {children}
        <div className="plan-card-fab">
          <button
            type="button"
            className="plan-fab-btn plan-fab-btn-run"
            onClick={approveAndRun}
            disabled={pending}
            title="Approve every voice-clean day AND run a heartbeat sweep immediately"
          >
            {pending ? "…" : "Approve & run"}
          </button>
          <button
            type="button"
            className="plan-fab-btn"
            onClick={approveAll}
            disabled={pending}
            title="Approve every day that passes the voice gate"
          >
            Approve all
          </button>
          <button
            type="button"
            className="plan-fab-btn plan-fab-btn-primary"
            onClick={() => setOpen(true)}
            title="Refine the entire plan with a plain-English instruction"
          >
            Refine plan…
          </button>
        </div>
        {allDaysToast && (
          <div className="plan-card-toast">
            {allDaysToast}
            {runReport && (
              <button
                type="button"
                className="plan-card-toast-link"
                onClick={() => setRunOpen(true)}
              >
                view report →
              </button>
            )}
          </div>
        )}
      </ContextMenu>

      <Modal open={runOpen && !!runReport} onClose={() => setRunOpen(false)} labelledBy="run-report-h">
        {runReport && (
          <div className="plan-day-modal">
            <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
              <span className="cme-eyebrow">approve &amp; run</span>
              <h2 id="run-report-h" className="plan-day-modal-title">
                {runReport.actions_fired} would fire · {runReport.actions_skipped} skipped
              </h2>
              <p className="plan-day-modal-context">
                Lead tz {runReport.lead_tz}
                {runReport.lead_tz_detail && ` (${runReport.lead_tz_detail})`} · {runReport.duration_ms}ms
              </p>
            </header>
            <div className="plan-day-modal-body">
              {Object.keys(runReport.skip_breakdown).length > 0 && (
                <div className="hb-skips">
                  <h3 className="cme-eyebrow">Skip breakdown</h3>
                  <div className="hb-skips-grid">
                    {Object.entries(runReport.skip_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([code, count]) => (
                        <div key={code} className="hb-skip-row">
                          <span className="hb-skip-count">{count}</span>
                          <span className="hb-skip-code">{code.replace(/_/g, " ").toLowerCase()}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <p className="plan-day-modal-context" style={{ marginTop: 12 }}>
                Full per-day verdicts available in the heartbeat dashboard.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="plan-refine-h">
        <div className="plan-day-modal">
          <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
            <span className="cme-eyebrow">refine plan</span>
            <h2 id="plan-refine-h" className="plan-day-modal-title">
              Tell the AI how to revise this plan
            </h2>
            <p className="plan-day-modal-context">
              The AI will rewrite all 7 days. Approval resets to draft so you can review the new version before anything fires.
            </p>
          </header>
          <div className="plan-day-modal-body">
            <section className="plan-day-modal-refine">
              <h3 className="cme-eyebrow">Instruction</h3>
              <p className="plan-day-modal-hint">
                Examples: &ldquo;Make the whole week more aggressive about scheduling a call.&rdquo;&nbsp;&nbsp;
                &ldquo;Pivot from email-first to SMS-first.&rdquo;&nbsp;&nbsp;
                &ldquo;Cut Day 7 down — they&rsquo;ve gone cold, just one re-engage SMS.&rdquo;
              </p>
              <textarea
                className="plan-day-modal-textarea"
                placeholder="What should change about the plan?"
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={pending}
              />
              <div className="plan-day-modal-actions">
                <button
                  type="button"
                  className="plan-btn"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="plan-btn plan-btn-primary"
                  onClick={refine}
                  disabled={pending}
                >
                  {pending ? "AI is rewriting all 7 days…" : "Rewrite plan"}
                </button>
              </div>
              {!state.ok && state.error && (
                <div className="plan-day-modal-error">Error: {state.error}</div>
              )}
            </section>
          </div>
        </div>
      </Modal>
    </>
  );
}
