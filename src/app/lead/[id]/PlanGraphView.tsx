"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlanDayTouchAction,
  deletePlanDayTouchAction,
  editPlanDayTouchAction,
  refinePlanDayAction,
  setDayStatusAction,
  type RefineDayState,
} from "./actions";
import type {
  ApprovalStatus,
  PlanChannel,
  PlannedTouchpoint,
  SevenDayPlan,
  SevenDayPlanDay,
} from "@/lib/plan";
import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "@/lib/nepq";
import { lintOutboundDraft, draftLintHasBlocking, type DraftLintIssue } from "@/lib/draft-lint";
import { useToast } from "@/components/Toast";

type SimVerdict = {
  touch_index: number;
  channel: string;
  intent: string;
  fire: boolean;
  skip_code: string | null;
  reason: string | null;
};
type SimDay = {
  day_index: number;
  day_number: number;
  date: string;
  is_today: boolean;
  approval_status: string;
  verdicts: SimVerdict[];
};
type Simulation = {
  ran_at: string;
  would_fire: number;
  would_skip: number;
  skip_breakdown: Record<string, number>;
  days: SimDay[];
};

const CHANNELS: PlanChannel[] = ["sms", "email", "call", "task"];
const CHANNEL_GLYPH: Record<PlanChannel, string> = {
  sms: "⌨",
  email: "✉",
  call: "☎",
  task: "□",
};
const TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;
const STATUS_LABELS: Record<ApprovalStatus, string> = {
  not_ready: "not ready",
  needs_review: "needs review",
  approved: "approved",
  sent: "sent",
  skipped: "skipped",
};

type TouchAudit = {
  voice: VoiceViolation[];
  lint: DraftLintIssue[];
  blocking: boolean;
  count: number;
};

function clonePlan(plan: SevenDayPlan): SevenDayPlan {
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      required_actions: d.required_actions.map((a) => ({ ...a })),
    })),
  };
}

function replaceDay(plan: SevenDayPlan, dayIndex: number, nextDay: SevenDayPlanDay): SevenDayPlan {
  return {
    ...plan,
    days: plan.days.map((d, i) => (i === dayIndex ? nextDay : d)),
  };
}

function auditTouch(touch: PlannedTouchpoint): TouchAudit {
  const text = touch.draft_seed || touch.intent || "";
  const voice =
    touch.channel === "email" || touch.channel === "sms" ? validateNepqVoice(text) : [];
  const lint =
    touch.channel === "email" || touch.channel === "sms"
      ? lintOutboundDraft({ channel: touch.channel, text })
      : [];
  const blocking = hasBlockingViolation(voice) || draftLintHasBlocking(lint);
  return { voice, lint, blocking, count: voice.length + lint.length };
}

function auditDay(day: SevenDayPlanDay) {
  const touches = day.required_actions.map(auditTouch);
  return {
    touches,
    blocking: touches.some((a) => a.blocking),
    count: touches.reduce((sum, a) => sum + a.count, 0),
  };
}

function verdictFor(simulation: Simulation | null, dayIndex: number, touchIndex: number) {
  return simulation?.days
    .find((d) => d.day_index === dayIndex)
    ?.verdicts.find((v) => v.touch_index === touchIndex);
}

function verdictTone(verdict?: SimVerdict) {
  if (!verdict) return "idle";
  return verdict.fire ? "fire" : "skip";
}

function dayVerdictTone(simulation: Simulation | null, dayIndex: number) {
  const day = simulation?.days.find((d) => d.day_index === dayIndex);
  if (!day) return "idle";
  return day.verdicts.some((v) => v.fire) ? "fire" : "skip";
}

function statusVerb(status: ApprovalStatus) {
  if (status === "approved") return "Move back to review";
  if (status === "sent") return "Sent";
  if (status === "skipped") return "Skipped";
  return "Approve day";
}

function ChannelPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: PlanChannel;
  onChange: (channel: PlanChannel) => void;
}) {
  return (
    <div className="graph-channel-picker" role="radiogroup" aria-label="Channel">
      <input type="hidden" name={name} value={value} />
      {CHANNELS.map((ch) => (
        <button
          key={ch}
          type="button"
          role="radio"
          aria-checked={value === ch}
          className={`graph-channel graph-channel-${ch}${value === ch ? " on" : ""}`}
          onClick={() => onChange(ch)}
        >
          <span>{CHANNEL_GLYPH[ch]}</span>
          {ch}
        </button>
      ))}
    </div>
  );
}

function GraphDayCard({
  day,
  dayIndex,
  selected,
  simulation,
  onSelect,
}: {
  day: SevenDayPlanDay;
  dayIndex: number;
  selected: boolean;
  simulation: Simulation | null;
  onSelect: () => void;
}) {
  const audit = useMemo(() => auditDay(day), [day]);
  const tone = TONES[dayIndex % TONES.length];
  const dayTone = dayVerdictTone(simulation, dayIndex);
  const fireCount =
    simulation?.days
      .find((d) => d.day_index === dayIndex)
      ?.verdicts.filter((v) => v.fire).length ?? 0;
  const channels = Array.from(new Set(day.required_actions.map((touch) => touch.channel)));

  return (
    <button
      type="button"
      className="graph-day-card"
      data-tone={tone}
      data-selected={selected ? "true" : "false"}
      data-verdict={dayTone}
      onClick={onSelect}
    >
      <span className="graph-day-spine" />
      <span className="graph-day-top">
        <span className="graph-day-kicker">Day {day.day}</span>
        <span className={`graph-status graph-status-${day.approval_status}`}>
          {STATUS_LABELS[day.approval_status]}
        </span>
      </span>
      <span className="graph-node-core">
        <span className="graph-node-num">{String(day.day).padStart(2, "0")}</span>
        <span className="graph-node-label">{day.objective}</span>
      </span>
      <span className="graph-node-lanes" aria-label={`${day.required_actions.length} touches`}>
        {day.required_actions.map((touch, touchIndex) => {
          const auditForTouch = audit.touches[touchIndex];
          const verdict = verdictFor(simulation, dayIndex, touchIndex);
          return (
            <span
              key={`${touch.channel}-${touchIndex}`}
              className="graph-lane-dot"
              data-channel={touch.channel}
              data-verdict={verdictTone(verdict)}
              data-blocking={auditForTouch?.blocking ? "true" : "false"}
              title={`${touch.channel}: ${touch.intent}`}
            />
          );
        })}
      </span>
      <span className="graph-node-channel-row">
        {channels.map((channel) => (
          <span key={channel} className="graph-node-channel" data-channel={channel}>
            {CHANNEL_GLYPH[channel]}
          </span>
        ))}
      </span>
      <span className="graph-day-foot">
        <span>{day.required_actions.length} touch{day.required_actions.length === 1 ? "" : "es"}</span>
        {simulation ? (
          dayTone === "fire" ? (
            <strong>{fireCount} fire</strong>
          ) : (
            <strong>gated</strong>
          )
        ) : (
          <span>{audit.count ? `${audit.count} audit` : "clean"}</span>
        )}
      </span>
    </button>
  );
}

function TouchEditor({
  planId,
  leadId,
  dayIndex,
  touchIndex,
  touch,
  pending,
  onCancel,
  onSaved,
  onDeleted,
}: {
  planId: string;
  leadId: string;
  dayIndex: number;
  touchIndex: number;
  touch: PlannedTouchpoint;
  pending: boolean;
  onCancel: () => void;
  onSaved: (touch: PlannedTouchpoint) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<PlanChannel>(touch.channel);
  return (
    <form
      className="graph-touch-editor"
      action={async (fd) => {
        fd.set("plan_id", planId);
        fd.set("lead_id", leadId);
        fd.set("day_index", String(dayIndex));
        fd.set("touch_index", String(touchIndex));
        fd.set("channel", channel);
        try {
          await editPlanDayTouchAction(fd);
          onSaved({
            channel,
            intent: String(fd.get("intent") || ""),
            draft_seed: String(fd.get("draft_seed") || "") || undefined,
          });
        } catch (err) {
          toast.push(`Save failed — ${err instanceof Error ? err.message : String(err)}`, {
            tone: "error",
            ttl: 4500,
          });
        }
      }}
    >
      <div className="graph-editor-row">
        <div className="graph-field graph-field-compact">
          <span className="graph-label">Channel</span>
          <ChannelPicker name="channel" value={channel} onChange={setChannel} />
        </div>
        <label className="graph-field">
          <span className="graph-label">Intent</span>
          <input name="intent" className="graph-input" defaultValue={touch.intent} required />
        </label>
      </div>
      <label className="graph-field">
        <span className="graph-label">Draft body</span>
        <textarea
          name="draft_seed"
          className="graph-input graph-textarea"
          defaultValue={touch.draft_seed || ""}
          rows={3}
          placeholder="Email/SMS body, call note, or task detail"
        />
      </label>
      <div className="graph-form-actions">
        <button type="button" className="plan-btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="plan-btn plan-btn-danger"
          disabled={pending}
          onClick={async () => {
            const fd = new FormData();
            fd.set("plan_id", planId);
            fd.set("lead_id", leadId);
            fd.set("day_index", String(dayIndex));
            fd.set("touch_index", String(touchIndex));
            try {
              await deletePlanDayTouchAction(fd);
              onDeleted();
            } catch (err) {
              toast.push(`Delete failed — ${err instanceof Error ? err.message : String(err)}`, {
                tone: "error",
                ttl: 4500,
              });
            }
          }}
        >
          Delete
        </button>
        <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
          Save touch
        </button>
      </div>
    </form>
  );
}

function AddTouchForm({
  planId,
  leadId,
  dayIndex,
  pending,
  onAdded,
}: {
  planId: string;
  leadId: string;
  dayIndex: number;
  pending: boolean;
  onAdded: (touch: PlannedTouchpoint) => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<PlanChannel>("sms");
  return (
    <form
      className="graph-add-touch"
      action={async (fd) => {
        fd.set("plan_id", planId);
        fd.set("lead_id", leadId);
        fd.set("day_index", String(dayIndex));
        fd.set("channel", channel);
        try {
          await addPlanDayTouchAction(fd);
          onAdded({
            channel,
            intent: String(fd.get("intent") || ""),
            draft_seed: String(fd.get("draft_seed") || "") || undefined,
          });
          (document.getElementById(`graph-add-intent-${dayIndex}`) as HTMLInputElement | null)?.form?.reset();
          setChannel("sms");
        } catch (err) {
          toast.push(`Add touch failed — ${err instanceof Error ? err.message : String(err)}`, {
            tone: "error",
            ttl: 4500,
          });
        }
      }}
    >
      <div className="graph-editor-row">
        <div className="graph-field graph-field-compact">
          <span className="graph-label">Add channel</span>
          <ChannelPicker name="channel" value={channel} onChange={setChannel} />
        </div>
        <label className="graph-field">
          <span className="graph-label">Intent</span>
          <input
            id={`graph-add-intent-${dayIndex}`}
            name="intent"
            className="graph-input"
            placeholder="One clean move for this day"
            required
          />
        </label>
      </div>
      <label className="graph-field">
        <span className="graph-label">Draft body</span>
        <textarea
          name="draft_seed"
          className="graph-input graph-textarea"
          rows={2}
          placeholder="Optional body or operator note"
        />
      </label>
      <div className="graph-form-actions">
        <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
          Add touch
        </button>
      </div>
    </form>
  );
}

function DayEditor({
  day,
  dayIndex,
  plan,
  leadId,
  simulation,
  pending,
  onClose,
  onStatus,
  onTouchSaved,
  onTouchDeleted,
  onTouchAdded,
  onRefined,
}: {
  day: SevenDayPlanDay;
  dayIndex: number;
  plan: SevenDayPlan;
  leadId: string;
  simulation: Simulation | null;
  pending: boolean;
  onClose: () => void;
  onStatus: (status: ApprovalStatus) => void;
  onTouchSaved: (touchIndex: number, touch: PlannedTouchpoint) => void;
  onTouchDeleted: (touchIndex: number) => void;
  onTouchAdded: (touch: PlannedTouchpoint) => void;
  onRefined: () => void;
}) {
  const [editingTouch, setEditingTouch] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [refineState, setRefineState] = useState<RefineDayState>({ ok: true });
  const audit = useMemo(() => auditDay(day), [day]);

  return (
    <aside className="graph-editor-drawer" aria-label={`Edit day ${day.day}`}>
      <header className="graph-editor-head">
        <div>
          <span className="cme-eyebrow">day {day.day} of {plan.days.length}</span>
          <h3>{day.objective}</h3>
          <p>Toward: {plan.goal_summary}</p>
        </div>
        <button className="graph-editor-close" type="button" onClick={onClose} aria-label="Close editor">
          ×
        </button>
      </header>

      <div className="graph-editor-statusbar">
        <button
          type="button"
          className="plan-btn plan-btn-primary"
          disabled={pending || day.approval_status === "sent" || day.approval_status === "skipped" || audit.blocking}
          title={audit.blocking ? "Resolve blocking voice/lint issues before approving" : undefined}
          onClick={() => onStatus(day.approval_status === "approved" ? "needs_review" : "approved")}
        >
          {audit.blocking ? "Approval blocked" : statusVerb(day.approval_status)}
        </button>
        <button type="button" className="plan-btn" disabled={pending} onClick={() => onStatus("sent")}>
          Mark sent
        </button>
        <button type="button" className="plan-btn plan-btn-danger" disabled={pending} onClick={() => onStatus("skipped")}>
          Skip
        </button>
        <span className={`graph-status graph-status-${day.approval_status}`}>
          {STATUS_LABELS[day.approval_status]}
        </span>
      </div>

      <div className="graph-editor-body">
        <section className="graph-editor-section">
          <div className="graph-section-head">
            <span className="cme-eyebrow">Touches</span>
            <span>{day.required_actions.length}</span>
          </div>
          <div className="graph-editor-touch-list">
            {day.required_actions.map((touch, i) => {
              const auditForTouch = audit.touches[i];
              const verdict = verdictFor(simulation, dayIndex, i);
              if (editingTouch === i) {
                return (
                  <TouchEditor
                    key={`edit-${i}`}
                    planId={plan.plan_id}
                    leadId={leadId}
                    dayIndex={dayIndex}
                    touchIndex={i}
                    touch={touch}
                    pending={pending}
                    onCancel={() => setEditingTouch(null)}
                    onSaved={(nextTouch) => {
                      setEditingTouch(null);
                      onTouchSaved(i, nextTouch);
                    }}
                    onDeleted={() => {
                      setEditingTouch(null);
                      onTouchDeleted(i);
                    }}
                  />
                );
              }
              return (
                <article
                  key={`${touch.channel}-${i}`}
                  className="graph-editor-touch"
                  data-channel={touch.channel}
                  data-verdict={verdictTone(verdict)}
                >
                  <div className="graph-editor-touch-top">
                    <span className="graph-touch-chip">{CHANNEL_GLYPH[touch.channel]} {touch.channel}</span>
                    {verdict && (
                      <span className={`graph-verdict graph-verdict-${verdict.fire ? "fire" : "skip"}`}>
                        {verdict.fire ? "would fire" : (verdict.skip_code ?? "skip").toLowerCase().replace(/_/g, " ")}
                      </span>
                    )}
                    <button type="button" className="graph-mini-btn" onClick={() => setEditingTouch(i)}>
                      edit
                    </button>
                  </div>
                  <p className="graph-editor-intent">{touch.intent}</p>
                  {touch.draft_seed && <blockquote>{touch.draft_seed}</blockquote>}
                  {auditForTouch?.count ? (
                    <div className="graph-audit-list">
                      {auditForTouch.voice.map((v, vi) => (
                        <span key={`v-${vi}`} className={v.severity === "block" ? "block" : "warn"}>
                          {v.severity}: {v.rule}
                        </span>
                      ))}
                      {auditForTouch.lint.map((issue, li) => (
                        <span key={`l-${li}`} className={issue.blocking ? "block" : "warn"}>
                          {issue.blocking ? "block" : "lint"}: {issue.code}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="graph-editor-section">
          <div className="graph-section-head">
            <span className="cme-eyebrow">Add touch</span>
            <span>sets review</span>
          </div>
          <AddTouchForm
            planId={plan.plan_id}
            leadId={leadId}
            dayIndex={dayIndex}
            pending={pending}
            onAdded={onTouchAdded}
          />
        </section>

        <section className="graph-editor-section graph-refine-panel">
          <div className="graph-section-head">
            <span className="cme-eyebrow">AI rewrite</span>
            <span>one day</span>
          </div>
          <p>Tell the agent what this day should do differently. The graph refreshes after the rewrite lands.</p>
          <form
            action={async (fd) => {
              fd.set("plan_id", plan.plan_id);
              fd.set("lead_id", leadId);
              fd.set("day_index", String(dayIndex));
              fd.set("instruction", instruction);
              const result = await refinePlanDayAction({ ok: true }, fd);
              setRefineState(result);
              if (result.ok) {
                setInstruction("");
                onRefined();
              }
            }}
          >
            <textarea
              className="graph-input graph-textarea"
              name="instruction"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Make it more direct, switch to email-first, add a call task..."
            />
            <div className="graph-form-actions">
              <button type="submit" className="plan-btn plan-btn-primary" disabled={pending || !instruction.trim()}>
                Take another crack
              </button>
            </div>
            {!refineState.ok && refineState.error && (
              <div className="graph-editor-error">{refineState.error}</div>
            )}
          </form>
        </section>

        <section className="graph-editor-section graph-window-panel">
          <span className="cme-eyebrow">Send window</span>
          <p>{day.send_window}</p>
        </section>
      </div>
    </aside>
  );
}

export function PlanGraphView({
  plan,
  leadId,
}: {
  plan: SevenDayPlan;
  leadId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draftPlan, setDraftPlan] = useState(() => clonePlan(plan));
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraftPlan(clonePlan(plan));
    setSelectedDayIndex((idx) =>
      idx == null ? null : Math.min(idx, Math.max(0, plan.days.length - 1))
    );
  }, [plan]);

  useEffect(() => {
    function onVisibility() {
      if (typeof document !== "undefined" && !document.hidden) router.refresh();
    }
    function onPlanChanged(ev: Event) {
      const detail = (ev as CustomEvent<{ lead_id?: string }>).detail;
      if (!detail?.lead_id || detail.lead_id === leadId) {
        router.refresh();
        setSimulation(null);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    };
  }, [router, leadId]);

  const selectedDay = selectedDayIndex == null ? null : draftPlan.days[selectedDayIndex] ?? null;
  const totals = useMemo(() => {
    const touches = draftPlan.days.reduce((sum, day) => sum + day.required_actions.length, 0);
    const blockers = draftPlan.days.reduce((sum, day) => sum + (auditDay(day).blocking ? 1 : 0), 0);
    const approved = draftPlan.days.filter((day) => day.approval_status === "approved").length;
    return { touches, blockers, approved };
  }, [draftPlan.days]);

  function optimisticDay(dayIndex: number, updater: (day: SevenDayPlanDay) => SevenDayPlanDay) {
    setDraftPlan((cur) => replaceDay(cur, dayIndex, updater(cur.days[dayIndex])));
    setSimulation(null);
  }

  function refreshSoon() {
    window.dispatchEvent(new CustomEvent("comeketo:plan-changed", { detail: { lead_id: leadId } }));
    router.refresh();
  }

  async function runSimulate() {
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch(`/api/lead/${encodeURIComponent(leadId)}/plan/simulate`);
      const data = await res.json();
      if (data.ok && data.simulation) {
        setSimulation(data.simulation as Simulation);
        toast.push("Simulation refreshed", { tone: "success" });
      } else {
        setError(data.error || "simulate failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  }

  function setStatus(status: ApprovalStatus) {
    if (!selectedDay || selectedDayIndex == null) return;
    const dayIndex = selectedDayIndex;
    startTransition(async () => {
      const previous = draftPlan.days[dayIndex];
      optimisticDay(dayIndex, (day) => ({ ...day, approval_status: status }));
      const fd = new FormData();
      fd.set("plan_id", draftPlan.plan_id);
      fd.set("lead_id", leadId);
      fd.set("day_index", String(dayIndex));
      fd.set("status", status);
      try {
        await setDayStatusAction(fd);
        toast.push(`Day ${previous.day} → ${STATUS_LABELS[status]}`, { tone: "success" });
        refreshSoon();
      } catch (err) {
        optimisticDay(dayIndex, () => previous);
        toast.push(`Status failed — ${err instanceof Error ? err.message : String(err)}`, { tone: "error", ttl: 4500 });
      }
    });
  }

  function onTouchSaved(touchIndex: number, touch: PlannedTouchpoint) {
    if (selectedDayIndex == null) return;
    optimisticDay(selectedDayIndex, (day) => ({
      ...day,
      approval_status: "needs_review",
      required_actions: day.required_actions.map((t, i) => (i === touchIndex ? touch : t)),
    }));
    toast.push("Touch updated", { tone: "success" });
    refreshSoon();
  }

  function onTouchDeleted(touchIndex: number) {
    if (selectedDayIndex == null) return;
    optimisticDay(selectedDayIndex, (day) => ({
      ...day,
      approval_status: "needs_review",
      required_actions: day.required_actions.filter((_, i) => i !== touchIndex),
    }));
    toast.push("Touch deleted", { tone: "success" });
    refreshSoon();
  }

  function onTouchAdded(touch: PlannedTouchpoint) {
    if (selectedDayIndex == null) return;
    optimisticDay(selectedDayIndex, (day) => ({
      ...day,
      approval_status: "needs_review",
      required_actions: [...day.required_actions, touch],
    }));
    toast.push("Touch added", { tone: "success" });
    refreshSoon();
  }

  return (
    <div className="lead-graph-wrap plan-graph-board">
      <div className="lead-graph-toolbar plan-graph-hero">
        <div>
          <span className="cme-eyebrow">plan graph · {draftPlan.days.length} days</span>
          <p className="plan-graph-subtitle">{draftPlan.goal_summary || draftPlan.lead_state_summary}</p>
        </div>
        <div className="lead-graph-toolbar-r plan-graph-stats">
          <span><strong>{totals.touches}</strong> touches</span>
          <span><strong>{totals.approved}</strong> approved</span>
          {totals.blockers > 0 && <span className="warn"><strong>{totals.blockers}</strong> blocked</span>}
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            onClick={runSimulate}
            disabled={simulating}
            title="Dry-run heartbeat — paint each touch with its verdict"
          >
            {simulating ? "simulating..." : simulation ? "Re-simulate" : "Simulate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="lead-error">
          <strong>Simulate failed:</strong> {error}
        </div>
      )}

      {simulation && (
        <div className="plan-graph-simbar">
          <span>Dry run at {new Date(simulation.ran_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          <strong>{simulation.would_fire} would fire</strong>
          <strong>{simulation.would_skip} gated</strong>
          {Object.entries(simulation.skip_breakdown).slice(0, 4).map(([code, count]) => (
            <span key={code}>{code.toLowerCase().replace(/_/g, " ")} · {count}</span>
          ))}
        </div>
      )}

      <section className="plan-graph-canvas" aria-label="Plan timeline">
        <div className="plan-graph-river">
          {draftPlan.days.map((day, index) => (
            <div className="plan-graph-day-wrap" key={`graph-day-${day.day}`}>
              <GraphDayCard
                day={day}
                dayIndex={index}
                selected={selectedDayIndex === index}
                simulation={simulation}
                onSelect={() => setSelectedDayIndex(index)}
              />
              {index < draftPlan.days.length - 1 && (
                <div className="plan-graph-connector" aria-hidden="true">
                  <span />
                  <em>next day</em>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {selectedDay && selectedDayIndex != null && (
        <div
          className="graph-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit day ${selectedDay.day}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedDayIndex(null);
          }}
        >
          <DayEditor
            day={selectedDay}
            dayIndex={selectedDayIndex}
            plan={draftPlan}
            leadId={leadId}
            simulation={simulation}
            pending={pending}
            onClose={() => setSelectedDayIndex(null)}
            onStatus={setStatus}
            onTouchSaved={onTouchSaved}
            onTouchDeleted={onTouchDeleted}
            onTouchAdded={onTouchAdded}
            onRefined={() => {
              toast.push("Day rewrite requested", { tone: "success" });
              refreshSoon();
            }}
          />
        </div>
      )}
    </div>
  );
}
