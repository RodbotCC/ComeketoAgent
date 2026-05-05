"use client";

import { useMemo, useState } from "react";
import {
  ProposalWorkbench,
  type ProposalPlanItem,
  type ProposalDayItem,
} from "@/app/proposals/ProposalReviewBoard";
import type { ApprovalStatus, SevenDayPlan } from "@/lib/plan";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  not_ready: "not ready",
  needs_review: "needs review",
  approved: "approved",
  sent: "sent",
  skipped: "skipped",
};

const DAY_TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;

function summaryStatus(days: ProposalDayItem[]): ApprovalStatus {
  // Same priority order the proposals board uses.
  const order: ApprovalStatus[] = ["needs_review", "approved", "not_ready", "sent", "skipped"];
  for (const s of order) {
    if (days.some((d) => d.approval_status === s)) return s;
  }
  return "not_ready";
}

function planToProposalPlanItem(
  plan: SevenDayPlan,
  leadName: string
): ProposalPlanItem {
  const days: ProposalDayItem[] = plan.days.map((d, i) => ({
    day_index: i,
    day_number: d.day,
    objective: d.objective,
    send_window: d.send_window,
    approval_status: d.approval_status,
    touches: d.required_actions,
  }));

  const status_counts: Record<ApprovalStatus, number> = {
    not_ready: 0,
    needs_review: 0,
    approved: 0,
    sent: 0,
    skipped: 0,
  };
  for (const d of days) status_counts[d.approval_status] += 1;

  return {
    key: `lead-plan-${plan.plan_id}`,
    plan_id: plan.plan_id,
    lead_id: plan.close_lead_id,
    lead_name: leadName || "(unnamed lead)",
    plan_status: plan.status,
    goal_summary: plan.goal_summary,
    generated_at: plan.generated_at,
    days,
    summary_status: summaryStatus(days),
    status_counts,
    total_touches: days.reduce((acc, d) => acc + d.touches.length, 0),
  };
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function artifactKindGlyph(mime: string | null, filename: string): string {
  const m = (mime || "").toLowerCase();
  const n = filename.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return "🖼";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📄";
  if (m.includes("html") || n.endsWith(".html") || n.endsWith(".htm")) return "⟨/⟩";
  if (m.includes("csv") || n.endsWith(".csv")) return "▦";
  if (m.includes("json") || n.endsWith(".json")) return "{}";
  if (m.includes("video") || /\.(mp4|mov|webm)$/.test(n)) return "▶";
  if (m.includes("audio") || /\.(mp3|wav|m4a)$/.test(n)) return "♪";
  return "◆";
}

function AssetsPanel({
  artifacts,
  leadId,
}: {
  artifacts: IntakeArtifactRow[];
  leadId: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (a: IntakeArtifactRow) => {
    const ref =
      a.mime?.startsWith("image/")
        ? `<img src="{ASSET:${a.id}}" alt="${a.filename.replace(/"/g, "&quot;")}" />`
        : `[asset: ${a.filename}${a.extracted_text ? ` · ${a.extracted_text.length} chars extracted` : ""}]`;
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(a.id);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      // fallback: prompt
      window.prompt("Copy this reference into the AI change request:", ref);
    }
  };

  if (artifacts.length === 0) {
    return (
      <section className="cmk-pdw-assets cmk-pdw-assets-empty">
        <div className="proposal-panel-heading">
          <span>Lead assets</span>
          <small>0 files</small>
        </div>
        <p className="cmk-pdw-assets-empty-msg">
          No intake artifacts yet for this lead.{" "}
          <a href={`/lead/${leadId}/intake`}>Upload some →</a>
        </p>
      </section>
    );
  }

  return (
    <section className="cmk-pdw-assets">
      <div className="proposal-panel-heading">
        <span>Lead assets</span>
        <small>{artifacts.length} {artifacts.length === 1 ? "file" : "files"}</small>
      </div>
      <p className="cmk-pdw-assets-hint">
        Click any asset to copy a reference. Paste into the AI change request — the agent will pull
        the asset into the touch.
      </p>
      <div className="cmk-pdw-assets-grid">
        {artifacts.map((a) => (
          <button
            key={a.id}
            type="button"
            className="cmk-pdw-asset"
            onClick={() => handleCopy(a)}
            title={a.summary || a.filename}
          >
            <span className="cmk-pdw-asset-glyph">{artifactKindGlyph(a.mime, a.filename)}</span>
            <span className="cmk-pdw-asset-name">{a.filename}</span>
            <span className="cmk-pdw-asset-meta">
              {fmtSize(a.byte_size)}
              {a.extracted_text ? ` · ${a.extracted_text.length} chars` : ""}
            </span>
            <span className="cmk-pdw-asset-action">
              {copied === a.id ? "Copied ✓" : "Copy ref"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

type TileProps = {
  day: ProposalDayItem;
  tone: string;
  onOpen: () => void;
};

function DayTile({ day, tone, onOpen }: TileProps) {
  return (
    <button
      type="button"
      className={`cmk-pdw-tile cmk-pdw-tile-${tone}`}
      data-status={day.approval_status}
      onClick={onOpen}
    >
      <span className="cmk-pdw-tile-num">Day {day.day_number}</span>
      <span className={`cmk-pdw-tile-status proposal-status-${day.approval_status}`}>
        {STATUS_LABEL[day.approval_status]}
      </span>
      <p className="cmk-pdw-tile-obj">{day.objective || "(no objective)"}</p>
      <span className="cmk-pdw-tile-touches">
        {day.touches.length} {day.touches.length === 1 ? "touch" : "touches"}
      </span>
    </button>
  );
}

export function PlanDaysWorkbench({
  plan,
  leadName,
  intakeArtifacts,
}: {
  plan: SevenDayPlan;
  leadName: string;
  intakeArtifacts: IntakeArtifactRow[];
}) {
  const [openDayIndex, setOpenDayIndex] = useState<number | null>(null);
  const proposalItem = useMemo(() => planToProposalPlanItem(plan, leadName), [plan, leadName]);

  // When the workbench opens, it auto-selects the first needs-review day. We
  // pre-shift the active day by reordering — simpler: the workbench handles its
  // own `initialDay`. We just open it.

  return (
    <>
      <div className="cmk-pdw-grid">
        {proposalItem.days.map((d, idx) => (
          <DayTile
            key={`${plan.plan_id}-${idx}`}
            day={d}
            tone={DAY_TONES[idx % DAY_TONES.length]}
            onOpen={() => setOpenDayIndex(idx)}
          />
        ))}
      </div>
      {openDayIndex !== null && (
        <ProposalWorkbench
          plan={proposalItem}
          onClose={() => setOpenDayIndex(null)}
          assetsSlot={
            <AssetsPanel artifacts={intakeArtifacts} leadId={plan.close_lead_id} />
          }
        />
      )}
    </>
  );
}
