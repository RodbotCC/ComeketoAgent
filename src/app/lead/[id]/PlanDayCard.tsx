"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { refinePlanDayAction, setDayStatusAction, type RefineDayState } from "./actions";
import type { SevenDayPlanDay } from "@/lib/plan";
import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "@/lib/nepq";

const CHANNEL_GLYPH: Record<string, string> = {
  call: "📞",
  email: "✉",
  sms: "⌨",
  task: "▢",
};

type Props = {
  day: SevenDayPlanDay;
  dayIndex: number;
  tone: string;
  planId: string;
  leadId: string;
  goalSummary: string;
};

export function PlanDayCard({ day, dayIndex, tone, planId, leadId, goalSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<RefineDayState>({ ok: true });
  const [pending, startTransition] = useTransition();

  // NEPQ voice scan for every email/sms draft seed in this day.
  const voiceHits = useMemo(() => {
    const map: Record<number, VoiceViolation[]> = {};
    day.required_actions.forEach((a, i) => {
      if (a.channel === "email" || a.channel === "sms") {
        const text = a.draft_seed || a.intent || "";
        const v = validateNepqVoice(text);
        if (v.length > 0) map[i] = v;
      }
    });
    return map;
  }, [day]);
  const dayHasBlocking = Object.values(voiceHits).some(hasBlockingViolation);
  const dayHitCount = Object.values(voiceHits).reduce((s, arr) => s + arr.length, 0);

  function submit(form: FormData) {
    startTransition(async () => {
      const r = await refinePlanDayAction({ ok: true }, form);
      setState(r);
      if (r.ok) {
        setOpen(false);
        setInstruction("");
      }
    });
  }

  function setStatus(status: string) {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("lead_id", leadId);
    fd.set("day_index", String(dayIndex));
    fd.set("status", status);
    startTransition(async () => {
      await setDayStatusAction(fd);
    });
  }

  const items: ContextMenuItem[] = [
    { kind: "label", text: `Day ${day.day}` },
    { kind: "item", label: "Edit & refine…", onSelect: () => setOpen(true) },
    { kind: "divider" },
    { kind: "item", label: "Mark approved", onSelect: () => setStatus("approved") },
    { kind: "item", label: "Mark needs review", onSelect: () => setStatus("needs_review") },
    { kind: "item", label: "Mark sent", onSelect: () => setStatus("sent") },
    { kind: "item", label: "Skip this day", tone: "danger", onSelect: () => setStatus("skipped") },
  ];

  return (
    <>
      <ContextMenu items={items}>
      <div
        className="plan-day plan-day-clickable"
        data-tone={tone}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="plan-day-head">
          <span className="plan-day-num">Day {day.day}</span>
          <div className="plan-day-head-r">
            {dayHitCount > 0 && (
              <span
                className={`plan-day-voice ${dayHasBlocking ? "block" : "warn"}`}
                title={`${dayHitCount} voice ${dayHitCount === 1 ? "issue" : "issues"} — open to view`}
              >
                {dayHasBlocking ? "voice ✗" : "voice ⚠"}
              </span>
            )}
            {day.approval_status === "needs_review" ? (
              <button
                type="button"
                className="plan-day-approve"
                disabled={pending || dayHasBlocking}
                title={dayHasBlocking ? "Resolve voice violations before approving" : "Approve this day"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!dayHasBlocking) setStatus("approved");
                }}
              >
                {pending ? "…" : dayHasBlocking ? "blocked" : "approve"}
              </button>
            ) : (
              <span className={`plan-day-status plan-day-status-${day.approval_status}`}>
                {day.approval_status.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        <div className="plan-day-objective">{day.objective}</div>
        {day.required_actions.map((a, i) => (
          <div key={i} className="plan-action">
            <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
              <span className="plan-action-glyph">{CHANNEL_GLYPH[a.channel] || "·"}</span>
              {a.channel}
            </span>
            <div className="plan-action-body">
              <div className="plan-action-intent">{a.intent}</div>
              {a.draft_seed && <div className="plan-action-seed">{a.draft_seed}</div>}
              {a.tasting_date && <div className="plan-action-tasting">tasting: {a.tasting_date}</div>}
              {a.notes && <div className="plan-action-notes">{a.notes}</div>}
            </div>
          </div>
        ))}
        <div className="plan-day-window">{day.send_window}</div>
      </div>
      </ContextMenu>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`day-modal-h-${day.day}`}>
        <div className={`plan-day-modal plan-day-modal-${tone}`}>
          <header className="plan-day-modal-head">
            <span className="cme-eyebrow">day {day.day} of 7</span>
            <h2 id={`day-modal-h-${day.day}`} className="plan-day-modal-title">
              {day.objective}
            </h2>
            {goalSummary && <p className="plan-day-modal-context">Toward: {goalSummary}</p>}
          </header>

          <div className="plan-day-modal-body">
            <section className="plan-day-modal-section">
              <h3 className="cme-eyebrow">Required actions</h3>
              {day.required_actions.map((a, i) => (
                <div key={i} className="plan-action">
                  <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
                    <span className="plan-action-glyph">{CHANNEL_GLYPH[a.channel] || "·"}</span>
                    {a.channel}
                  </span>
                  <div className="plan-action-body">
                    <div className="plan-action-intent">{a.intent}</div>
                    {a.draft_seed && <div className="plan-action-seed">{a.draft_seed}</div>}
                    {a.tasting_date && <div className="plan-action-tasting">tasting: {a.tasting_date}</div>}
                    {a.notes && <div className="plan-action-notes">{a.notes}</div>}
                    {voiceHits[i] && voiceHits[i].length > 0 && (
                      <ul className="plan-action-voice">
                        {voiceHits[i].map((v, vi) => (
                          <li
                            key={vi}
                            className={`plan-action-voice-row plan-action-voice-${v.severity}`}
                          >
                            <span className="plan-action-voice-tag">{v.severity}</span>
                            <span className="plan-action-voice-rule">{v.rule}</span>
                            <span className="plan-action-voice-match">&ldquo;{v.matched}&rdquo;</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </section>

            <section className="plan-day-modal-section">
              <h3 className="cme-eyebrow">Send window</h3>
              <p className="plan-day-modal-meta">{day.send_window}</p>
            </section>

            <section className="plan-day-modal-refine">
              <h3 className="cme-eyebrow">Tell the AI what to change</h3>
              <p className="plan-day-modal-hint">
                Plain English. Examples: &ldquo;Make this more aggressive about scheduling a call.&rdquo;
                &nbsp;&nbsp;&ldquo;Switch to email-first.&rdquo;&nbsp;&nbsp;&ldquo;Pivot to a tasting offer for May 17.&rdquo;
              </p>
              <form
                action={(fd) => {
                  fd.set("plan_id", planId);
                  fd.set("lead_id", leadId);
                  fd.set("day_index", String(dayIndex));
                  fd.set("instruction", instruction);
                  submit(fd);
                }}
              >
                <textarea
                  name="instruction"
                  className="plan-day-modal-textarea"
                  placeholder="What should this day do differently?"
                  rows={3}
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
                    type="submit"
                    className="plan-btn plan-btn-primary"
                    disabled={pending}
                  >
                    {pending ? "AI is rewriting…" : "Take another crack"}
                  </button>
                </div>
                {!state.ok && state.error && (
                  <div className="plan-day-modal-error">Error: {state.error}</div>
                )}
              </form>
            </section>
          </div>
        </div>
      </Modal>
    </>
  );
}
