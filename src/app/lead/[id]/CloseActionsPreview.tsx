"use client";

import { useState, useTransition } from "react";
import { Modal } from "./Modal";
import { getCloseCodegenPreview } from "./actions";
import type { CodegenResult, PlannedCloseAction } from "@/lib/plan-to-close";

const ACTION_LABEL: Record<PlannedCloseAction["kind"], string> = {
  create_task: "Create Task",
  log_activity: "Send & log",
  enroll_in_workflow: "Enroll in workflow",
  skip: "Skip",
};

const CHANNEL_GLYPH: Record<string, string> = {
  call: "📞",
  email: "✉",
  sms: "⌨",
  task: "▢",
};

export function CloseActionsPreview({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CodegenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const r = await getCloseCodegenPreview(planId);
      if (r.ok) setPreview(r.preview);
      else setError(r.error);
    });
  }

  function openModal() {
    setOpen(true);
    if (!preview) load();
  }

  return (
    <>
      <button
        type="button"
        className="plan-btn"
        onClick={openModal}
        title="See the Close API actions this plan would fire"
      >
        Preview Close actions
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="close-codegen-h">
        <div className="plan-day-modal">
          <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
            <span className="cme-eyebrow">close codegen</span>
            <h2 id="close-codegen-h" className="plan-day-modal-title">
              What this plan would do in Close
            </h2>
            <p className="plan-day-modal-context">
              Preview of the API calls. Nothing fires from this screen — execution happens via the heartbeat once the plan is approved and fresh.
            </p>
          </header>
          <div className="plan-day-modal-body">
            {pending && <div className="codegen-loading">Computing…</div>}
            {error && (
              <div className="plan-day-modal-error">Error: {error}</div>
            )}
            {preview && (
              <>
                <div className="codegen-summary">
                  <span className="codegen-stat">
                    <strong>{preview.total_actions}</strong> actions across {preview.groups.length} days
                  </span>
                  {preview.blocking_warnings.length > 0 && (
                    <ul className="codegen-warnings">
                      {preview.blocking_warnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="codegen-groups">
                  {preview.groups.map((g) => (
                    <div key={g.day} className="codegen-group">
                      <header className="codegen-group-head">
                        <span className="codegen-day-num">Day {g.day}</span>
                        <span className="codegen-date">{g.date}</span>
                        <span className="codegen-objective">{g.objective}</span>
                      </header>
                      {g.actions.length === 0 ? (
                        <div className="codegen-empty">no actions</div>
                      ) : (
                        g.actions.map((a, i) => (
                          <CodegenActionRow key={i} action={a} sendWindow={g.send_window} />
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function CodegenActionRow({
  action,
  sendWindow,
}: {
  action: PlannedCloseAction;
  sendWindow: string;
}) {
  const channel = action.origin.channel;
  return (
    <div className={`codegen-row codegen-row-${action.kind}`}>
      <span className={`plan-action-chip plan-action-chip-${channel}`}>
        <span className="plan-action-glyph">{CHANNEL_GLYPH[channel] || "·"}</span>
        {channel}
      </span>
      <div className="codegen-row-body">
        <div className="codegen-row-head">
          <span className="codegen-kind">{ACTION_LABEL[action.kind]}</span>
          {action.kind === "create_task" && (
            <span className="codegen-meta">due {action.due_date} · {sendWindow}</span>
          )}
          {action.kind === "log_activity" && (
            <span className="codegen-meta">send after {action.send_after} · {sendWindow}</span>
          )}
          {action.kind === "skip" && <span className="codegen-meta">{action.reason}</span>}
        </div>
        <div className="codegen-row-intent">{action.origin.intent}</div>
        {action.kind === "log_activity" && (
          <div className="codegen-row-seed">{action.body_seed}</div>
        )}
      </div>
    </div>
  );
}
