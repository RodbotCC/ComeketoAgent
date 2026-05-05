"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addPlanDayTouchAction,
  editPlanDayTouchAction,
  refinePlanDayAction,
  refineWholePlanAction,
  setDayStatusAction,
} from "@/app/lead/[id]/actions";
import { useToast } from "@/components/Toast";
import type { ApprovalStatus, PlanChannel, PlannedTouchpoint } from "@/lib/plan";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";

const AUTO_REFINE_INSTRUCTION =
  "(no operator instruction — take your best shot at improving this based on the current Box state, the plan goal, and NEPQ voice. Apply your judgment.)";

function assetRefForArtifact(a: IntakeArtifactRow): string {
  if (a.mime?.startsWith("image/")) {
    return `<img src="{ASSET:${a.id}}" alt="${a.filename.replace(/"/g, "&quot;")}" />`;
  }
  const tail = a.extracted_text ? ` · ${a.extracted_text.length} chars extracted` : "";
  return `[asset: ${a.filename}${tail}]`;
}

function fmtAssetSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Per-day shape — the inner unit, surfaced inside the workbench. */
export type ProposalDayItem = {
  day_index: number;
  day_number: number;
  objective: string;
  send_window: string;
  approval_status: ApprovalStatus;
  touches: PlannedTouchpoint[];
};

/** Top-level item — one tile per plan. */
export type ProposalPlanItem = {
  key: string;
  plan_id: string;
  lead_id: string;
  lead_name: string;
  plan_status: string;
  goal_summary: string;
  generated_at: string;
  days: ProposalDayItem[];
  /** Highest-priority day status — drives column bucketing on the board. */
  summary_status: ApprovalStatus;
  status_counts: Record<ApprovalStatus, number>;
  total_touches: number;
};

/** Adapter shape kept for the inner forms so they didn't need to be rewritten. */
type ProposalReviewItem = {
  key: string;
  plan_id: string;
  lead_id: string;
  lead_name: string;
  plan_status: string;
  day_index: number;
  day_number: number;
  objective: string;
  goal_summary: string;
  approval_status: ApprovalStatus;
  send_window: string;
  touches: PlannedTouchpoint[];
  generated_at: string;
};

function buildItem(plan: ProposalPlanItem, day: ProposalDayItem): ProposalReviewItem {
  return {
    key: `${plan.plan_id}:${day.day_index}`,
    plan_id: plan.plan_id,
    lead_id: plan.lead_id,
    lead_name: plan.lead_name,
    plan_status: plan.plan_status,
    day_index: day.day_index,
    day_number: day.day_number,
    objective: day.objective,
    goal_summary: plan.goal_summary,
    approval_status: day.approval_status,
    send_window: day.send_window,
    touches: day.touches,
    generated_at: plan.generated_at,
  };
}

type Props = {
  plans: ProposalPlanItem[];
  counts: {
    needs_review: number;
    approved: number;
    not_ready: number;
    sent: number;
    skipped: number;
    touches: number;
  };
};

const CHANNELS: PlanChannel[] = ["sms", "email", "task"];
const CHANNEL_GLYPH: Record<PlanChannel, string> = {
  sms: "⌨",
  email: "✉",
  task: "□",
};
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  not_ready: "not ready",
  needs_review: "needs review",
  approved: "approved",
  sent: "sent",
  skipped: "skipped",
};
export const STATUS_ORDER: ApprovalStatus[] = [
  "needs_review",
  "approved",
  "not_ready",
  "sent",
  "skipped",
];

/** Tab → which `ApprovalStatus` values land here. `not_ready` plans (drafts) roll
 *  into Needs review so they don't get orphaned. `cancelled` is the friendly label
 *  for `skipped`. */
type TabKey = "needs_review" | "approved" | "sent" | "cancelled";

type TabDef = {
  key: TabKey;
  label: string;
  statuses: ApprovalStatus[];
};

const TABS: TabDef[] = [
  { key: "needs_review", label: "Needs review", statuses: ["needs_review", "not_ready"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "sent", label: "Sent", statuses: ["sent"] },
  { key: "cancelled", label: "Cancelled", statuses: ["skipped"] },
];

const TAB_STORAGE_KEY = "cmk:proposals:tab";

type ActivePanel =
  | { kind: "overview" }
  | { kind: "touch"; touchIndex: number }
  | { kind: "add" }
  | { kind: "rewrite" };

function shortText(value: string, fallback = "No detail yet.") {
  const clean = value.trim();
  if (!clean) return fallback;
  return clean.length > 112 ? `${clean.slice(0, 109).trim()}...` : clean;
}

function formatGeneratedDay(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function panelKey(panel: ActivePanel) {
  return panel.kind === "touch" ? `touch-${panel.touchIndex}` : panel.kind;
}

function ChannelPicker({
  value,
  onChange,
}: {
  value: PlanChannel;
  onChange: (channel: PlanChannel) => void;
}) {
  return (
    <div className="proposal-channel-picker" role="radiogroup" aria-label="Channel">
      {CHANNELS.map((channel) => (
        <button
          key={channel}
          type="button"
          className={`proposal-channel proposal-channel-${channel}${value === channel ? " on" : ""}`}
          role="radio"
          aria-checked={value === channel}
          onClick={() => onChange(channel)}
        >
          <span>{CHANNEL_GLYPH[channel]}</span>
          {channel}
        </button>
      ))}
    </div>
  );
}

function StatusButton({
  item,
  status,
  label,
}: {
  item: ProposalReviewItem;
  status: ApprovalStatus;
  label: string;
}) {
  return (
    <form action={setDayStatusAction}>
      <input type="hidden" name="plan_id" value={item.plan_id} />
      <input type="hidden" name="lead_id" value={item.lead_id} />
      <input type="hidden" name="day_index" value={String(item.day_index)} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`proposal-mini-action proposal-mini-action-${status}`}>
        {label}
      </button>
    </form>
  );
}

function TouchEditForm({
  item,
  touch,
  touchIndex,
  onDone,
}: {
  item: ProposalReviewItem;
  touch: PlannedTouchpoint;
  touchIndex: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<PlanChannel>(touch.channel);
  return (
    <form
      className="proposal-touch-edit"
      action={(fd) => {
        fd.set("plan_id", item.plan_id);
        fd.set("lead_id", item.lead_id);
        fd.set("day_index", String(item.day_index));
        fd.set("touch_index", String(touchIndex));
        fd.set("channel", channel);
        startTransition(async () => {
          try {
            await editPlanDayTouchAction(fd);
            toast.push("Draft updated", { tone: "success" });
            onDone();
          } catch (err) {
            toast.push(`Edit failed — ${err instanceof Error ? err.message : String(err)}`, {
              tone: "error",
              ttl: 4500,
            });
          }
        });
      }}
    >
      <div className="proposal-edit-row">
        <ChannelPicker value={channel} onChange={setChannel} />
        <input name="intent" className="proposal-input" defaultValue={touch.intent} required />
      </div>
      <textarea
        name="draft_seed"
        className="proposal-input proposal-textarea"
        defaultValue={touch.draft_seed || ""}
        placeholder="Draft body / call note / task detail"
        rows={4}
      />
      <div className="proposal-card-actions">
        <button type="button" className="plan-btn" onClick={onDone} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
          {pending ? "Saving..." : "Save draft"}
        </button>
      </div>
    </form>
  );
}

function AddTouchPanel({
  item,
  onDone,
}: {
  item: ProposalReviewItem;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [addChannel, setAddChannel] = useState<PlanChannel>("sms");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        fd.set("plan_id", item.plan_id);
        fd.set("lead_id", item.lead_id);
        fd.set("day_index", String(item.day_index));
        fd.set("channel", addChannel);
        startTransition(async () => {
          try {
            await addPlanDayTouchAction(fd);
            toast.push("Touch added", { tone: "success" });
            onDone?.();
          } catch (err) {
            toast.push(`Add touch failed — ${err instanceof Error ? err.message : String(err)}`, {
              tone: "error",
              ttl: 4500,
            });
          }
        });
      }}
      className="proposal-inline-form"
    >
      <ChannelPicker value={addChannel} onChange={setAddChannel} />
      <input name="intent" className="proposal-input" placeholder="What should this extra touch do?" required />
      <textarea
        name="draft_seed"
        className="proposal-input proposal-textarea"
        rows={4}
        placeholder="Optional draft body"
      />
      <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
        {pending ? "Adding..." : "Add touch"}
      </button>
    </form>
  );
}

function RefinePanel({ item }: { item: ProposalReviewItem }) {
  const toast = useToast();
  return (
    <div className="proposal-refine-grid">
      <form
        action={async (fd) => {
          fd.set("plan_id", item.plan_id);
          fd.set("lead_id", item.lead_id);
          fd.set("day_index", String(item.day_index));
          const result = await refinePlanDayAction({ ok: true }, fd);
          if (!result.ok) {
            toast.push(`Day rewrite failed — ${result.error ?? "unknown"}`, { tone: "error", ttl: 5000 });
          } else {
            toast.push("Day rewrite queued", { tone: "success" });
          }
        }}
        className="proposal-inline-form"
      >
        <span className="proposal-form-label">Rewrite this day</span>
        <textarea
          name="instruction"
          className="proposal-input proposal-textarea"
          rows={4}
          placeholder="Make this less pushy, switch to SMS, ask a sharper question..."
          required
        />
        <button type="submit" className="plan-btn plan-btn-primary">
          Rewrite day
        </button>
      </form>
      <form
        action={async (fd) => {
          fd.set("plan_id", item.plan_id);
          fd.set("lead_id", item.lead_id);
          const result = await refineWholePlanAction({ ok: true }, fd);
          if (!result.ok) {
            toast.push(`Plan rewrite failed — ${result.error ?? "unknown"}`, { tone: "error", ttl: 5000 });
          } else {
            toast.push("Plan rewrite queued", { tone: "success" });
          }
        }}
        className="proposal-inline-form"
      >
        <span className="proposal-form-label">Change the whole plan</span>
        <textarea
          name="instruction"
          className="proposal-input proposal-textarea"
          rows={4}
          placeholder="Change everything: calmer cadence, quote-first, call-first, restart the week..."
          required
        />
        <button type="submit" className="plan-btn">
          Rewrite plan
        </button>
      </form>
    </div>
  );
}

function AiChangePanel({
  item,
  activePanel,
  intakeArtifacts,
}: {
  item: ProposalReviewItem;
  activePanel: ActivePanel;
  intakeArtifacts: IntakeArtifactRow[];
}) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  const touch =
    activePanel.kind === "touch" ? item.touches[activePanel.touchIndex] : item.touches[0] ?? null;
  const contextLabel =
    activePanel.kind === "touch"
      ? `${touch?.channel ?? "touch"} · ${touch?.intent ?? "selected touch"}`
      : activePanel.kind === "add"
        ? "new touch"
        : activePanel.kind === "rewrite"
          ? "plan rewrite"
          : "day overview";

  function insertAssetRef(a: IntakeArtifactRow) {
    const ta = textareaRef.current;
    const snippet = assetRefForArtifact(a);
    if (!ta) {
      setInstruction((prev) => (prev ? `${prev} ${snippet}` : snippet));
    } else {
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const padBefore = before && !/\s$/.test(before) ? " " : "";
      const padAfter = after && !/^\s/.test(after) ? " " : "";
      const next = `${before}${padBefore}${snippet}${padAfter}${after}`;
      setInstruction(next);
      // Restore focus + caret after React re-renders
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const caret = (before + padBefore + snippet).length;
          textareaRef.current.setSelectionRange(caret, caret);
        }
      });
    }
    setPickerOpen(false);
  }

  async function submit(scope: "day" | "plan", auto: boolean) {
    const fd = new FormData();
    fd.set("plan_id", item.plan_id);
    fd.set("lead_id", item.lead_id);
    fd.set("day_index", String(item.day_index));
    const text = instruction.trim();
    fd.set("instruction", auto || !text ? AUTO_REFINE_INSTRUCTION : text);
    const result =
      scope === "plan"
        ? await refineWholePlanAction({ ok: true }, fd)
        : await refinePlanDayAction({ ok: true }, fd);
    if (!result.ok) {
      toast.push(`AI change failed — ${result.error ?? "unknown"}`, { tone: "error", ttl: 5000 });
      return;
    }
    const verb = auto || !text ? "Auto rewrite" : "Rewrite";
    toast.push(`${verb} ${scope === "plan" ? "plan" : "day"} queued`, { tone: "success" });
    if (auto) setInstruction("");
  }

  const hasAssets = intakeArtifacts.length > 0;

  return (
    <section className="proposal-ai-panel">
      <div className="proposal-panel-heading">
        <span>AI change request</span>
        <small>{contextLabel}</small>
      </div>
      <form
        action={() => {}}
        onSubmit={(e) => e.preventDefault()}
        className="proposal-ai-form"
      >
        <div className="proposal-ai-textwrap">
          <textarea
            ref={textareaRef}
            name="instruction"
            className="proposal-input proposal-textarea"
            rows={4}
            placeholder={`Tell the AI how to change this ${activePanel.kind === "touch" ? "touch" : "day"} — or click "Auto" and let the AI take a crack on its own.`}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="proposal-ai-asset-attach">
            <button
              type="button"
              className="proposal-ai-asset-btn"
              onClick={() => setPickerOpen((o) => !o)}
              disabled={!hasAssets}
              title={
                hasAssets
                  ? "Attach an intake artifact reference"
                  : "No intake assets yet — upload via the Intake tab on this lead"
              }
              aria-expanded={pickerOpen}
            >
              + Asset
            </button>
            {pickerOpen && hasAssets && (
              <div className="proposal-ai-asset-picker" role="menu">
                {intakeArtifacts.slice(0, 12).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="proposal-ai-asset-row"
                    onClick={() => insertAssetRef(a)}
                    title={a.summary || a.filename}
                  >
                    <span className="proposal-ai-asset-name">{a.filename}</span>
                    <span className="proposal-ai-asset-meta">
                      {fmtAssetSize(a.byte_size)}
                      {a.extracted_text ? ` · ${a.extracted_text.length} chars` : ""}
                    </span>
                  </button>
                ))}
                {intakeArtifacts.length > 12 && (
                  <div className="proposal-ai-asset-more">
                    +{intakeArtifacts.length - 12} more — see Intake tab
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="proposal-ai-actions">
          <div className="proposal-ai-actions-cluster">
            <button
              type="button"
              className="plan-btn plan-btn-primary"
              onClick={() => submit("day", false)}
              title="Apply your typed instruction to this day"
            >
              Rewrite day
            </button>
            <button
              type="button"
              className="plan-btn"
              onClick={() => submit("day", true)}
              title="Let the AI improve this day on its own — no operator instruction required"
            >
              Auto · day
            </button>
          </div>
          <div className="proposal-ai-actions-cluster">
            <button
              type="button"
              className="plan-btn"
              onClick={() => submit("plan", false)}
              title="Apply your typed instruction to the entire plan"
            >
              Rewrite plan
            </button>
            <button
              type="button"
              className="plan-btn"
              onClick={() => submit("plan", true)}
              title="Let the AI rewrite the whole plan on its own — no operator instruction required"
            >
              Auto · plan
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function ProposalPlate({
  plan,
  selected,
  onOpen,
}: {
  plan: ProposalPlanItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const channels = Array.from(
    new Set(plan.days.flatMap((d) => d.touches.map((t) => t.channel)))
  );
  const statusChips = STATUS_ORDER.filter((s) => (plan.status_counts[s] ?? 0) > 0);
  const dayCount = plan.days.length;

  return (
    <button
      type="button"
      className="proposal-plate"
      data-status={plan.summary_status}
      data-selected={selected ? "true" : "false"}
      onClick={onOpen}
    >
      <span className="proposal-plate-bar" aria-hidden="true" />
      <span className="proposal-plate-top">
        <span className="proposal-card-kicker">
          {dayCount}-day plan · {formatGeneratedDay(plan.generated_at)}
        </span>
        <span className={`proposal-status proposal-status-${plan.summary_status}`}>
          {STATUS_LABEL[plan.summary_status]}
        </span>
      </span>
      <strong>{plan.lead_name}</strong>
      <span className="proposal-plate-objective">
        {shortText(plan.goal_summary, "Move this proposal forward cleanly.")}
      </span>
      <span className="proposal-plate-foot">
        <span className="proposal-plate-counts">
          {statusChips.map((s) => (
            <span key={s} className={`proposal-plate-count proposal-plate-count-${s}`}>
              {plan.status_counts[s]} {STATUS_LABEL[s]}
            </span>
          ))}
        </span>
        <span className="proposal-plate-meta">
          <span>
            {plan.total_touches} {plan.total_touches === 1 ? "touch" : "touches"}
          </span>
          <span className="proposal-plate-channels">
            {channels.map((channel) => (
              <span key={channel} data-channel={channel}>
                {CHANNEL_GLYPH[channel]}
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

function WorkbenchPanel({
  item,
  activePanel,
  setActivePanel,
}: {
  item: ProposalReviewItem;
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
}) {
  const touch = activePanel.kind === "touch" ? item.touches[activePanel.touchIndex] : null;
  if (activePanel.kind === "touch" && touch) {
    return (
      <section className="proposal-active-panel">
        <div className="proposal-panel-heading">
          <span>{touch.channel} touch</span>
          <small>Day {item.day_number}</small>
        </div>
        <TouchEditForm
          item={item}
          touch={touch}
          touchIndex={activePanel.touchIndex}
          onDone={() => setActivePanel({ kind: "overview" })}
        />
      </section>
    );
  }

  if (activePanel.kind === "add") {
    return (
      <section className="proposal-active-panel">
        <div className="proposal-panel-heading">
          <span>Add touch</span>
          <small>Sets review</small>
        </div>
        <AddTouchPanel item={item} onDone={() => setActivePanel({ kind: "overview" })} />
      </section>
    );
  }

  if (activePanel.kind === "rewrite") {
    return (
      <section className="proposal-active-panel">
        <div className="proposal-panel-heading">
          <span>Regenerate / change</span>
          <small>AI assisted</small>
        </div>
        <RefinePanel item={item} />
      </section>
    );
  }

  return (
    <section className="proposal-active-panel">
      <div className="proposal-panel-heading">
        <span>Status & context</span>
        <small>{item.send_window}</small>
      </div>
      <div className="proposal-overview-copy">
        <p>{item.objective}</p>
        {item.goal_summary && <blockquote>{item.goal_summary}</blockquote>}
      </div>
      <div className="proposal-card-actions">
        <StatusButton item={item} status="approved" label="Approve" />
        <StatusButton item={item} status="needs_review" label="Needs review" />
        <StatusButton item={item} status="sent" label="Mark sent" />
        <StatusButton item={item} status="skipped" label="Skip" />
        <Link href={`/lead/${item.lead_id}`} className="plan-btn">
          Lead
        </Link>
      </div>
    </section>
  );
}

export function ProposalWorkbench({
  plan,
  onClose,
  intakeArtifacts = [],
  initialDayIndex,
}: {
  plan: ProposalPlanItem;
  onClose: () => void;
  /** Lead's intake artifacts — surface as inline picker in the AI change panel.
   *  Pass empty array (default) on org-wide views like /proposals; per-lead callers
   *  pass the loaded artifacts. */
  intakeArtifacts?: IntakeArtifactRow[];
  /** When set, opens directly to this day instead of the first needs_review. */
  initialDayIndex?: number;
}) {
  const initialDay = useMemo(() => {
    if (
      typeof initialDayIndex === "number" &&
      initialDayIndex >= 0 &&
      initialDayIndex < plan.days.length
    ) {
      return initialDayIndex;
    }
    const idx = plan.days.findIndex((d) => d.approval_status === "needs_review");
    return idx >= 0 ? idx : 0;
  }, [plan.days, initialDayIndex]);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(initialDay);
  const [activePanel, setActivePanel] = useState<ActivePanel>({ kind: "overview" });

  const day = plan.days[activeDayIndex] ?? plan.days[0];
  const item = useMemo(() => buildItem(plan, day), [plan, day]);
  const activeKey = panelKey(activePanel);

  const switchDay = (idx: number) => {
    setActiveDayIndex(idx);
    setActivePanel({ kind: "overview" });
  };

  return (
    <div className="proposal-workbench-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="proposal-workbench"
        role="dialog"
        aria-modal="true"
        aria-label={`${plan.lead_name} proposal workbench`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="proposal-workbench-head">
          <div>
            <span className="proposal-card-kicker">
              {plan.days.length}-day plan · generated {formatGeneratedDay(plan.generated_at)}
            </span>
            <h2>{plan.lead_name}</h2>
            <p>{plan.goal_summary || "Move this proposal forward cleanly."}</p>
          </div>
          <button type="button" className="graph-editor-close" onClick={onClose} aria-label="Close workbench">
            ×
          </button>
        </header>

        <div className="proposal-workbench-body">
          <nav className="proposal-workbench-nav" aria-label="Plan days">
            {plan.days.map((d, i) => {
              const isActive = i === activeDayIndex;
              return (
                <div
                  key={d.day_index}
                  className={`proposal-day-section${isActive ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="proposal-day-row"
                    data-active={isActive ? "true" : "false"}
                    data-status={d.approval_status}
                    onClick={() => switchDay(i)}
                  >
                    <span className="proposal-day-num">Day {d.day_number}</span>
                    <span className={`proposal-status proposal-status-${d.approval_status}`}>
                      {STATUS_LABEL[d.approval_status]}
                    </span>
                    <span className="proposal-day-touches">
                      {d.touches.length} {d.touches.length === 1 ? "touch" : "touches"}
                    </span>
                  </button>
                  {isActive && (
                    <div className="proposal-day-panels">
                      <button
                        type="button"
                        className="proposal-panel-tab"
                        data-active={activeKey === "overview" ? "true" : "false"}
                        onClick={() => setActivePanel({ kind: "overview" })}
                      >
                        <span className="proposal-panel-tab-kicker">overview</span>
                        <strong>Status, approval, links</strong>
                        <small>{STATUS_LABEL[d.approval_status]}</small>
                      </button>
                      {d.touches.map((touch, touchIndex) => (
                        <button
                          key={`${plan.plan_id}-${d.day_index}-${touchIndex}`}
                          type="button"
                          className="proposal-panel-tab"
                          data-channel={touch.channel}
                          data-active={activeKey === `touch-${touchIndex}` ? "true" : "false"}
                          onClick={() => setActivePanel({ kind: "touch", touchIndex })}
                        >
                          <span className="proposal-panel-tab-kicker">
                            {CHANNEL_GLYPH[touch.channel]} {touch.channel}
                          </span>
                          <strong>{shortText(touch.intent, "Untitled touch")}</strong>
                          {touch.draft_seed && <small>{shortText(touch.draft_seed, "")}</small>}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="proposal-panel-tab proposal-panel-tab-add"
                        data-active={activeKey === "add" ? "true" : "false"}
                        onClick={() => setActivePanel({ kind: "add" })}
                      >
                        <span className="proposal-panel-tab-kicker">add touch</span>
                        <strong>Add another move to this day</strong>
                        <small>SMS, email, call, or task</small>
                      </button>
                      <button
                        type="button"
                        className="proposal-panel-tab proposal-panel-tab-rewrite"
                        data-active={activeKey === "rewrite" ? "true" : "false"}
                        onClick={() => setActivePanel({ kind: "rewrite" })}
                      >
                        <span className="proposal-panel-tab-kicker">regenerate</span>
                        <strong>Change this day or the whole plan</strong>
                        <small>Use plain English</small>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="proposal-workbench-right">
            <WorkbenchPanel item={item} activePanel={activePanel} setActivePanel={setActivePanel} />
            <AiChangePanel item={item} activePanel={activePanel} intakeArtifacts={intakeArtifacts} />
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProposalReviewBoard({ plans, counts }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<ProposalPlanItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("needs_review");

  // Restore last-active tab from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (saved && TABS.some((t) => t.key === saved)) {
      setActiveTab(saved as TabKey);
    }
  }, []);

  const persistTab = (key: TabKey) => {
    setActiveTab(key);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_STORAGE_KEY, key);
    }
  };

  const tabPlans = useMemo(() => {
    const map = new Map<TabKey, ProposalPlanItem[]>();
    for (const tab of TABS) map.set(tab.key, []);
    for (const plan of plans) {
      const tab = TABS.find((t) => t.statuses.includes(plan.summary_status));
      if (tab) map.get(tab.key)?.push(plan);
    }
    return map;
  }, [plans]);

  const visiblePlans = tabPlans.get(activeTab) ?? [];

  return (
    <div className="proposal-board">
      <section className="proposal-hero">
        <div>
          <span className="cme-eyebrow">proposals</span>
          <h1>Review what is going out.</h1>
          <p>
            Drafts, approvals, and sent proposal follow-ups across every active plan. This is the daily desk:
            read it, change it, approve it, or stop it.
          </p>
        </div>
        <div className="proposal-kpis" aria-label="Proposal counts">
          <span><strong>{counts.needs_review}</strong> needs review</span>
          <span><strong>{counts.approved}</strong> approved</span>
          <span><strong>{counts.touches}</strong> touches</span>
        </div>
      </section>

      {plans.length === 0 ? (
        <div className="proposal-empty">No active proposal plans found. Generate plans from a lead page or chat.</div>
      ) : (
        <>
          <nav className="proposal-tabs" aria-label="Proposal status">
            {TABS.map((tab) => {
              const tabCount = (tabPlans.get(tab.key) ?? []).length;
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`proposal-tab${isActive ? " proposal-tab-active" : ""}`}
                  data-tab={tab.key}
                  onClick={() => persistTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <span className="proposal-tab-count">{tabCount}</span>
                </button>
              );
            })}
          </nav>

          {visiblePlans.length === 0 ? (
            <div className="proposal-tab-empty">
              <p>No plans here yet.</p>
              {activeTab !== "needs_review" && (
                <button
                  type="button"
                  className="plan-btn"
                  onClick={() => persistTab("needs_review")}
                >
                  Try Needs review →
                </button>
              )}
            </div>
          ) : (
            <div className="proposal-grid">
              {visiblePlans.map((plan) => (
                <ProposalPlate
                  key={plan.key}
                  plan={plan}
                  selected={selectedPlan?.key === plan.key}
                  onOpen={() => setSelectedPlan(plan)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {selectedPlan && (
        <ProposalWorkbench plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
      )}
    </div>
  );
}
