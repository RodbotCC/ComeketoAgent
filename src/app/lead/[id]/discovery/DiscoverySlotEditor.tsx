"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { setSlotValueAction } from "./actions";

type Props = {
  leadId: string;
  slotId: string;
  slotLabel: string;
  whyItMatters: string;
  currentValue: string;
  source: "close_custom" | "llm_extraction" | "operator" | null;
  evidenceExcerpt: string | null;
  status: "known" | "unknown" | "stale";
  /** Disabled when the slot resolves from a canonical Close field — operator
   *  edits don't make sense (Close is the source of truth). */
  readonly?: boolean;
};

export function DiscoverySlotEditor({
  leadId,
  slotId,
  slotLabel,
  whyItMatters,
  currentValue,
  source,
  evidenceExcerpt,
  status,
  readonly,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentValue);
  const [isPending, start] = useTransition();

  const onClick = () => {
    if (readonly) return;
    setDraft(currentValue);
    setOpen(true);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await setSlotValueAction(fd);
      setOpen(false);
    });
  };

  const onClear = () => {
    const fd = new FormData();
    fd.set("lead_id", leadId);
    fd.set("slot_id", slotId);
    fd.set("value", "");
    start(async () => {
      await setSlotValueAction(fd);
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`cmk-discovery-slot cmk-discovery-slot--${status}${readonly ? " cmk-discovery-slot--readonly" : ""}`}
        aria-label={`Edit ${slotLabel}`}
      >
        <span className="cmk-discovery-slot-label">{slotLabel}</span>
        <span className="cmk-discovery-slot-value">
          {status === "unknown" ? <em>unknown</em> : currentValue || "—"}
        </span>
        {source && (
          <span className={`cmk-discovery-slot-source cmk-discovery-slot-source--${source}`}>
            {source === "close_custom" ? "Close" : source === "llm_extraction" ? "scan" : "operator"}
            {status === "stale" ? " · stale" : ""}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`slot-${slotId}-title`}>
        <form onSubmit={onSubmit} className="cmk-discovery-edit-form">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="slot_id" value={slotId} />

          <header className="cmk-discovery-edit-head">
            <div className="cme-eyebrow">discovery slot</div>
            <h2 id={`slot-${slotId}-title`} className="cmk-discovery-edit-title">
              {slotLabel}
            </h2>
            <p className="cmk-discovery-edit-why">{whyItMatters}</p>
          </header>

          {evidenceExcerpt && (
            <div className="cmk-discovery-edit-evidence">
              <span className="cme-eyebrow">extracted from</span>
              <blockquote>"{evidenceExcerpt}"</blockquote>
            </div>
          )}

          <label className="cmk-discovery-edit-field">
            <span className="cme-eyebrow">value</span>
            <input
              name="value"
              className="plan-touch-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder={status === "unknown" ? "Enter what you know…" : currentValue}
            />
          </label>

          <footer className="cmk-discovery-edit-footer">
            <button type="button" className="plan-btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            {status !== "unknown" && (
              <button type="button" className="plan-btn-secondary" onClick={onClear} disabled={isPending}>
                Clear override
              </button>
            )}
            <button type="submit" className="plan-btn-primary" disabled={isPending || !draft.trim()}>
              {isPending ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
