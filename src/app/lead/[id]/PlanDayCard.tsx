"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { useToast } from "@/components/Toast";
import { refinePlanDayAction, setDayStatusAction, addPlanDayTouchAction, editPlanDayTouchAction, deletePlanDayTouchAction, type RefineDayState } from "./actions";
import type { SevenDayPlanDay, PlannedTouchpoint } from "@/lib/plan";
import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "@/lib/nepq";
import { lintOutboundDraft, draftLintHasBlocking, type DraftLintIssue } from "@/lib/draft-lint";
import { emailDraftPlainToPreviewHtml } from "@/lib/email-draft-html";

const CHANNEL_GLYPH: Record<string, string> = {
  call: "📞",
  email: "✉",
  sms: "⌨",
  task: "▢",
};

const CHANNELS = ["sms", "email", "call", "task"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Pill-row channel picker — replaces the boring native <select>. Each chip
 * uses the same channel color tokens as the rest of the plan UI so it reads
 * as part of the family. Backed by a hidden input so the surrounding <form>
 * action picks it up under `name`.
 */
function ChannelChips({ name, defaultValue }: { name: string; defaultValue: Channel }) {
  const [value, setValue] = useState<Channel>(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div className="plan-touch-chips" role="radiogroup" aria-label="Channel">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            type="button"
            role="radio"
            aria-checked={value === ch}
            onClick={() => setValue(ch)}
            className={`plan-touch-chip plan-touch-chip-${ch}${value === ch ? " on" : ""}`}
          >
            <span className="plan-touch-chip-glyph">{CHANNEL_GLYPH[ch]}</span>
            {ch}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Per-touch dry-run verdict from /api/lead/[id]/plan/simulate. Renders as
 * an inline pill on each touch row so the operator can see what would fire
 * before clicking Approve & run.
 */
export type TouchVerdictForCard = {
  touch_index: number;
  channel: PlannedTouchpoint["channel"];
  intent: string;
  fire: boolean;
  skip_code: string | null;
  reason: string | null;
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
  /** Per-touch dry-run verdicts (from the cockpit's Simulate button). */
  verdicts?: TouchVerdictForCard[];
};

export function PlanDayCard({ day, dayIndex, tone, planId, leadId, goalSummary, planStale, verdicts }: Props) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<RefineDayState>({ ok: true });
  const [pending, startTransition] = useTransition();
  const [editingTouch, setEditingTouch] = useState<number | null>(null);
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
        {day.required_actions.map((a, i) => {
          const v = verdicts?.[i];
          return (
            <div key={i} className="plan-action">
              <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
                <span className="plan-action-glyph">{CHANNEL_GLYPH[a.channel] || "·"}</span>
                {a.channel}
              </span>
              <div className="plan-action-body">
                <div className="plan-action-intent">
                  {a.intent}
                  {v && (
                    <span
                      className={`plan-verdict-pill ${v.fire ? "ok" : "skip"}`}
                      title={v.reason ?? (v.fire ? "would fire" : v.skip_code ?? "would skip")}
                    >
                      {v.fire ? "would fire" : (v.skip_code ?? "skip").toLowerCase().replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                {a.draft_seed && <div className="plan-action-seed">{a.draft_seed}</div>}
                {a.tasting_date && <div className="plan-action-tasting">tasting: {a.tasting_date}</div>}
                {a.notes && <div className="plan-action-notes">{a.notes}</div>}
              </div>
            </div>
          );
        })}
        <div className="plan-day-window">{day.send_window}</div>
      </div>
      </ContextMenu>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`day-modal-h-${day.day}`} width="wide">
        <div className={`plan-day-modal plan-day-modal-${tone}`}>
          <header className="plan-day-modal-head">
            <span className="cme-eyebrow">day {day.day} of 7</span>
            <h2 id={`day-modal-h-${day.day}`} className="plan-day-modal-title">
              {day.objective}
            </h2>
            {goalSummary && <p className="plan-day-modal-context">Toward: {goalSummary}</p>}
          </header>

          {/* Modal-header actions: approve from inside the modal too. */}
          {!planStale && day.approval_status !== "sent" && day.approval_status !== "skipped" && (
            <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--rule)", borderBottom: "0.5px solid var(--rule)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--paper-2)" }}>
              {day.approval_status !== "approved" && (
                <button
                  type="button"
                  className="plan-btn plan-btn-primary"
                  disabled={pending || dayHasBlocking}
                  title={dayHasBlocking ? "Resolve voice violations before approving" : "Approve this day from the modal"}
                  onClick={() => setStatus("approved")}
                >
                  {dayHasBlocking ? "Approve (blocked)" : "Approve day"}
                </button>
              )}
              {day.approval_status === "approved" && (
                <button type="button" className="plan-btn" disabled={pending} onClick={() => setStatus("needs_review")}>
                  Move back to needs review
                </button>
              )}
              <button type="button" className="plan-btn" disabled={pending} onClick={() => setStatus("sent")}>
                Mark sent
              </button>
              <button type="button" className="plan-btn plan-btn-danger" disabled={pending} onClick={() => setStatus("skipped")}>
                Skip this day
              </button>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-faint)" }}>
                status: <strong>{day.approval_status.replace(/_/g, " ")}</strong>
              </span>
            </div>
          )}

          <div className="plan-day-modal-body">
            <section className="plan-day-modal-section">
              <h3 className="cme-eyebrow">Required actions</h3>
              {day.required_actions.map((a, i) =>
                editingTouch === i ? (
                  <form
                    key={i}
                    action={(fd) => {
                      fd.set("plan_id", planId);
                      fd.set("lead_id", leadId);
                      fd.set("day_index", String(dayIndex));
                      fd.set("touch_index", String(i));
                      startTransition(async () => {
                        try {
                          await editPlanDayTouchAction(fd);
                          setEditingTouch(null);
                          toast.push("Touch updated", { tone: "success" });
                        } catch (err) {
                          toast.push(`Edit failed — ${err instanceof Error ? err.message : String(err)}`, { tone: "error", ttl: 4500 });
                        }
                      });
                    }}
                    className="plan-touch-form"
                    style={{ marginBottom: 8 }}
                  >
                    <div className="plan-touch-form-row">
                      <div className="plan-touch-field" style={{ flex: "0 0 auto" }}>
                        <span className="plan-touch-field-label">Channel</span>
                        <ChannelChips name="channel" defaultValue={(a.channel as Channel) || "sms"} />
                      </div>
                      <div className="plan-touch-field">
                        <label className="plan-touch-field-label" htmlFor={`intent-edit-${dayIndex}-${i}`}>Intent (one line)</label>
                        <input
                          id={`intent-edit-${dayIndex}-${i}`}
                          name="intent"
                          className="plan-touch-input"
                          defaultValue={a.intent}
                          placeholder="What this touch is meant to do"
                          required
                        />
                      </div>
                    </div>
                    <div className="plan-touch-field">
                      <label className="plan-touch-field-label" htmlFor={`draft-edit-${dayIndex}-${i}`}>Draft body (optional — email/SMS)</label>
                      <textarea
                        id={`draft-edit-${dayIndex}-${i}`}
                        name="draft_seed"
                        className="plan-touch-input"
                        rows={4}
                        defaultValue={a.draft_seed || ""}
                        placeholder="The actual body the operator/heartbeat will send"
                        style={{ resize: "vertical" }}
                      />
                    </div>
                    <div className="plan-touch-form-actions">
                      <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
                        {pending ? "saving…" : "Save touch"}
                      </button>
                      <button type="button" className="plan-btn" onClick={() => setEditingTouch(null)} disabled={pending}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="plan-btn plan-btn-danger"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`Delete this ${a.channel} touch?`)) return;
                          const fd = new FormData();
                          fd.set("plan_id", planId);
                          fd.set("lead_id", leadId);
                          fd.set("day_index", String(dayIndex));
                          fd.set("touch_index", String(i));
                          startTransition(async () => {
                            try {
                              await deletePlanDayTouchAction(fd);
                              setEditingTouch(null);
                              toast.push("Touch deleted", { tone: "success" });
                            } catch (err) {
                              toast.push(`Delete failed — ${err instanceof Error ? err.message : String(err)}`, { tone: "error", ttl: 4500 });
                            }
                          });
                        }}
                        style={{ marginLeft: "auto" }}
                      >
                        Delete touch
                      </button>
                    </div>
                  </form>
                ) : (
                <div key={i} className="plan-action">
                  <span className={`plan-action-chip plan-action-chip-${a.channel}`}>
                    <span className="plan-action-glyph">{CHANNEL_GLYPH[a.channel] || "·"}</span>
                    {a.channel}
                  </span>
                  <div className="plan-action-body">
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div className="plan-action-intent" style={{ flex: 1 }}>{a.intent}</div>
                      {!planStale && day.approval_status !== "sent" && (
                        <button
                          type="button"
                          className="plan-btn"
                          style={{ fontSize: 10, padding: "2px 8px", flexShrink: 0 }}
                          onClick={() => setEditingTouch(i)}
                          disabled={pending}
                          title="Edit this touch — change channel, intent, or draft text"
                        >
                          edit
                        </button>
                      )}
                    </div>
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
                <form action={addPlanDayTouchAction} className="plan-touch-form">
                  <input type="hidden" name="plan_id" value={planId} />
                  <input type="hidden" name="lead_id" value={leadId} />
                  <input type="hidden" name="day_index" value={String(dayIndex)} />
                  <div className="plan-touch-form-row">
                    <div className="plan-touch-field" style={{ flex: "0 0 auto" }}>
                      <span className="plan-touch-field-label">Channel</span>
                      <ChannelChips name="channel" defaultValue="sms" />
                    </div>
                    <div className="plan-touch-field">
                      <label className="plan-touch-field-label" htmlFor={`intent-add-${dayIndex}`}>Intent (one line)</label>
                      <input
                        id={`intent-add-${dayIndex}`}
                        name="intent"
                        className="plan-touch-input"
                        placeholder="One-line move (e.g. 'soft SMS bump asking about timeline')"
                        required
                      />
                    </div>
                  </div>
                  <div className="plan-touch-field">
                    <label className="plan-touch-field-label" htmlFor={`draft-add-${dayIndex}`}>Draft body (optional)</label>
                    <textarea
                      id={`draft-add-${dayIndex}`}
                      name="draft_seed"
                      className="plan-touch-input"
                      rows={3}
                      placeholder="For email/SMS — the actual body to send"
                      style={{ resize: "vertical" }}
                    />
                  </div>
                  <div className="plan-touch-form-actions">
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
