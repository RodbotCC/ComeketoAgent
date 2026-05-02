"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { useToast } from "@/components/Toast";
import { refinePlanDayAction, setDayStatusAction, addPlanDayTouchAction, type RefineDayState } from "./actions";
import type { SevenDayPlanDay } from "@/lib/plan";
import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "@/lib/nepq";
import { lintOutboundDraft, draftLintHasBlocking, type DraftLintIssue } from "@/lib/draft-lint";
import { emailDraftPlainToPreviewHtml } from "@/lib/email-draft-html";

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
  /** When true, AI day refinements are blocked (§I3). */
  planStale?: boolean;
};

export function PlanDayCard({ day, dayIndex, tone, planId, leadId, goalSummary, planStale }: Props) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<RefineDayState>({ ok: true });
  const [pending, startTransition] = useTransition();
  const toast = useToast();

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
  const draftLintHits = useMemo(() => {
    const map: Record<number, DraftLintIssue[]> = {};
    day.required_actions.forEach((a, i) => {
      if (a.channel === "email" || a.channel === "sms") {
        const text = a.draft_seed || a.intent || "";
        const issues = lintOutboundDraft({ channel: a.channel, text });
        if (issues.length) map[i] = issues;
      }
    });
    return map;
  }, [day]);

  const dayHasBlocking = (() => {
    const voiceBlock = Object.values(voiceHits).some(hasBlockingViolation);
    const lintBlock = Object.values(draftLintHits).some(draftLintHasBlocking);
    return voiceBlock || lintBlock;
  })();
  const dayHitCount =
    Object.values(voiceHits).reduce((s, arr) => s + arr.length, 0) +
    Object.values(draftLintHits).reduce((s, arr) => s + arr.length, 0);

  function submit(form: FormData) {
    startTransition(async () => {
      const r = await refinePlanDayAction({ ok: true }, form);
      setState(r);
      if (r.ok) {
        setOpen(false);
        setInstruction("");
        toast.push(`Day ${day.day} refined`, { tone: "success" });
      } else {
        toast.push(`Refine failed — ${r.error ?? "unknown"}`, { tone: "error", ttl: 4500 });
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
      try {
        await setDayStatusAction(fd);
        toast.push(`Day ${day.day} → ${status.replace(/_/g, " ")}`, { tone: "success" });
      } catch (err) {
        toast.push(
          `Status change failed — ${err instanceof Error ? err.message : String(err)}`,
          { tone: "error", ttl: 4500 }
        );
      }
    });
  }

  const items: ContextMenuItem[] = [
    { kind: "label" as const, text: `Day ${day.day}` },
    ...(planStale
      ? [{ kind: "label" as const, text: "Refine blocked — box stale (§I3)" }]
      : [{ kind: "item" as const, label: "Edit & refine…", onSelect: () => setOpen(true) }]),
    { kind: "divider" as const },
    { kind: "item" as const, label: "Mark approved", onSelect: () => setStatus("approved") },
    { kind: "item" as const, label: "Mark needs review", onSelect: () => setStatus("needs_review") },
    { kind: "item" as const, label: "Mark sent", onSelect: () => setStatus("sent") },
    { kind: "item" as const, label: "Skip this day", tone: "danger" as const, onSelect: () => setStatus("skipped") },
  ];

  return (
    <>
      <ContextMenu items={items}>
      <div
        className="plan-day plan-day-clickable"
        data-tone={tone}
        onClick={() => {
          if (!planStale) setOpen(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (planStale) return;
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
                title={`${dayHitCount} guardrail ${dayHitCount === 1 ? "issue" : "issues"} — open to view`}
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
                    {a.channel === "email" && a.draft_seed && (
                      <div
                        className="plan-email-html-preview"
                        style={{
                          marginTop: 8,
                          padding: 10,
                          background: "var(--paper-2)",
                          borderRadius: 6,
                          border: "0.5px solid var(--rule)",
                        }}
                      >
                        <div className="cme-eyebrow" style={{ marginBottom: 6 }}>
                          Email preview (§H1 safe HTML)
                        </div>
                        <div
                          className="plan-email-html-body"
                          dangerouslySetInnerHTML={{
                            __html: emailDraftPlainToPreviewHtml(a.draft_seed),
                          }}
                        />
                      </div>
                    )}
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
                    {draftLintHits[i] && draftLintHits[i].length > 0 && (
                      <ul className="plan-action-voice">
                        {draftLintHits[i].map((issue, li) => (
                          <li
                            key={li}
                            className={`plan-action-voice-row plan-action-voice-${issue.blocking ? "block" : "warn"}`}
                          >
                            <span className="plan-action-voice-tag">{issue.blocking ? "block" : "lint"}</span>
                            <span className="plan-action-voice-rule">{issue.code}</span>
                            <span>{issue.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </section>

            {!planStale && (
              <section className="plan-day-modal-section">
                <h3 className="cme-eyebrow">Add another touch</h3>
                <p className="plan-day-modal-hint" style={{ fontSize: 11, marginBottom: 10 }}>
                  Appends to this calendar day and sets the day to <strong>needs review</strong>. The rolling
                  frequency cap can still skip a second SMS/email the same day — see heartbeat skip codes.
                </p>
                <form action={addPlanDayTouchAction} className="plan-add-touch-form">
                  <input type="hidden" name="plan_id" value={planId} />
                  <input type="hidden" name="lead_id" value={leadId} />
                  <input type="hidden" name="day_index" value={String(dayIndex)} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      Channel
                      <select name="channel" className="plan-horizon-input" defaultValue="sms">
                        <option value="sms">sms</option>
                        <option value="email">email</option>
                        <option value="call">call</option>
                        <option value="task">task</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, flex: "1 1 160px" }}>
                      Intent
                      <input
                        name="intent"
                        className="plan-horizon-input"
                        placeholder="One-line move (required)"
                        required
                      />
                    </label>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, width: "100%" }}>
                    Draft seed (optional)
                    <input name="draft_seed" className="plan-horizon-input" placeholder="For email/SMS body seed" />
                  </label>
                  <div style={{ marginTop: 12 }}>
                    <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
                      Add touch
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="plan-day-modal-section">
              <h3 className="cme-eyebrow">Send window</h3>
              <p className="plan-day-modal-meta">{day.send_window}</p>
            </section>

            <section className="plan-day-modal-refine">
              <h3 className="cme-eyebrow">Tell the AI what to change</h3>
              {planStale ? (
                <div className="plan-day-modal-error" style={{ marginBottom: 10 }}>
                  Box changed since this plan was generated. Regenerate the plan from the Box before AI day
                  refinements (Guardrails §I3).
                </div>
              ) : (
                <p className="plan-day-modal-hint">
                  Plain English. Examples: &ldquo;Make this more aggressive about scheduling a call.&rdquo;
                  &nbsp;&nbsp;&ldquo;Switch to email-first.&rdquo;&nbsp;&nbsp;&ldquo;Pivot to a tasting offer for May
                  17.&rdquo;
                </p>
              )}
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
                  disabled={pending || planStale}
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
                    disabled={pending || planStale}
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
