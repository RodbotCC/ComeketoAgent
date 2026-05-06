"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import {
  sweepLeadBoxAction,
  regenerateClientBoxDocsAction,
  generatePlanAction,
  runLeadBoxWorkflowAction,
} from "@/app/lead/[id]/actions";
import type { LeadFreshness } from "./freshness";

export type LeadRowSeed = {
  lead_id: string;
  display_name: string;
  status_label: string | null;
  status_id: string | null;
  date_created: string | null;
  date_updated: string | null;
  is_practice: boolean;
};

type Props = {
  seed: LeadRowSeed;
  freshness: LeadFreshness | null; // null = still loading
};

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function computeNamePanelLane(
  seed: LeadRowSeed,
  freshness: LeadFreshness | null,
  hasFolder: boolean,
  hasAnyAi: boolean,
  hasPlan: boolean,
): "loading" | "none" | "ready" | "stale" {
  if (!freshness) return "loading";
  const complete = hasFolder && hasAnyAi && hasPlan;
  if (!complete) return "none";

  const lastMs = freshness.last_checked_at
    ? Date.parse(freshness.last_checked_at)
    : NaN;
  const closeMs = seed.date_updated ? Date.parse(seed.date_updated) : NaN;

  if (!Number.isFinite(lastMs)) {
    return "stale";
  }
  if (!Number.isFinite(closeMs)) {
    return "ready";
  }
  return closeMs > lastMs ? "stale" : "ready";
}

function namePanelTitle(lane: ReturnType<typeof computeNamePanelLane>): string {
  switch (lane) {
    case "loading":
      return "Checking harness folder…";
    case "none":
      return "Raw + Ai + plan not all present yet";
    case "ready":
      return "Pipeline complete — box matches last Close activity";
    case "stale":
      return "Pipeline complete — Close updated since last box refresh; refresh raw";
    default:
      return "";
  }
}

function fmtChecked(iso: string | null | undefined): string {
  if (!iso) return "not checked";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "checked unknown";
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function LeadActionsRow({ seed, freshness }: Props) {
  const toast = useToast();
  const [refreshPending, startRefresh] = useTransition();
  const [regenPending, startRegen] = useTransition();
  const [planPending, startPlan] = useTransition();
  const [flowPending, startFlow] = useTransition();

  const hasFolder = !!freshness?.has_folder;
  const hasAnyAi =
    !!freshness &&
    (freshness.has_ai_comms ||
      freshness.has_ai_profile ||
      freshness.has_ai_discovery ||
      freshness.has_ai_alerts ||
      freshness.has_ai_ledger);
  const hasPlan = !!freshness?.has_plan;

  function fireRefresh() {
    if (refreshPending) return;
    const fd = new FormData();
    fd.set("lead_id", seed.lead_id);
    startRefresh(async () => {
      try {
        await sweepLeadBoxAction(fd);
        toast.push(
          `Raw box saved → harness/leads/active/${seed.lead_id}__…`,
          { tone: "success", ttl: 4000 }
        );
      } catch (err) {
        toast.push(
          `Refresh failed (${seed.display_name}): ${err instanceof Error ? err.message : String(err)}`,
          { tone: "error" }
        );
      }
    });
  }

  function fireRegen() {
    if (regenPending) return;
    if (!hasFolder) {
      toast.push("Refresh raw box first — no harness folder yet.", { tone: "warn" });
      return;
    }
    const fd = new FormData();
    fd.set("lead_id", seed.lead_id);
    startRegen(async () => {
      try {
        await regenerateClientBoxDocsAction(fd);
        toast.push(`Ai docs regenerated → harness/leads/active/${seed.lead_id}__…`, {
          tone: "success",
          ttl: 4000,
        });
      } catch (err) {
        toast.push(
          `Regen failed (${seed.display_name}): ${err instanceof Error ? err.message : String(err)}`,
          { tone: "error" }
        );
      }
    });
  }

  function firePlan() {
    if (planPending) return;
    if (!hasFolder) {
      toast.push("Refresh raw box first — no harness folder yet.", { tone: "warn" });
      return;
    }
    if (!hasAnyAi) {
      toast.push("Regenerate Ai docs before planning — plan should read the interpreted box.", { tone: "warn" });
      return;
    }
    const fd = new FormData();
    fd.set("lead_id", seed.lead_id);
    startPlan(async () => {
      try {
        await generatePlanAction(fd);
        toast.push(`Plan generated → harness/leads/active/${seed.lead_id}__…`, {
          tone: "success",
          ttl: 5000,
        });
      } catch (err) {
        toast.push(
          `Plan failed (${seed.display_name}): ${err instanceof Error ? err.message : String(err)}`,
          { tone: "error" }
        );
      }
    });
  }

  function fireFlow() {
    if (flowPending) return;
    const fd = new FormData();
    fd.set("lead_id", seed.lead_id);
    startFlow(async () => {
      try {
        await runLeadBoxWorkflowAction(fd);
        toast.push(`Workflow complete for ${seed.display_name}: raw → Ai → plan`, {
          tone: "success",
          ttl: 5000,
        });
      } catch (err) {
        toast.push(
          `Workflow failed (${seed.display_name}): ${err instanceof Error ? err.message : String(err)}`,
          { tone: "error" }
        );
      }
    });
  }

  const created = fmtDateShort(seed.date_created);
  const checked = freshness ? fmtChecked(freshness.last_checked_at) : "checking…";
  const nameLane = computeNamePanelLane(seed, freshness, hasFolder, hasAnyAi, hasPlan);

  return (
    <div className="leads-row leads-row-with-actions">
      <div className="leads-col-name">
        <div
          className={`leads-name-panel leads-name-panel--${nameLane}`}
          title={namePanelTitle(nameLane)}
        >
          <Link
            href={`/chat?lead=${encodeURIComponent(seed.lead_id)}&leadName=${encodeURIComponent(seed.display_name)}&preset=state&right=ai_profile,plan,comms&from=lead-index`}
            className="leads-name-link"
          >
            {seed.display_name}
          </Link>
          {seed.is_practice ? <span className="leads-practice-badge">Practice</span> : null}
        </div>
        <FreshnessChips
          freshness={freshness}
          hasAnyAi={hasAnyAi}
          hasPlan={hasPlan}
        />
      </div>
      <div className="leads-col-status">
        <span className="leads-status">{seed.status_label || "—"}</span>
      </div>
      <div className="leads-col-meta leads-col-meta-stack">
        <span>{created}</span>
        <span title={freshness?.last_checked_at ?? undefined}>{checked}</span>
      </div>
      <div className="leads-actions-cell">
        <div className="leads-actions-panel">
          <ActionBtn
            label="Run flow"
            pendingLabel="Running"
            pending={flowPending}
            disabled={refreshPending || regenPending || planPending}
            slot="flow"
            onClick={fireFlow}
            hint="Runs raw → Ai → plan in order"
          />
          <ActionBtn
            label="Refresh raw"
            pendingLabel="Refreshing"
            pending={refreshPending}
            disabled={flowPending}
            slot="raw"
            onClick={fireRefresh}
          />
          <ActionBtn
            label="Regen Ai"
            pendingLabel="Regen"
            pending={regenPending}
            disabled={!hasFolder || flowPending}
            slot="ai"
            onClick={fireRegen}
            hint={!hasFolder ? "Refresh raw box first" : undefined}
          />
          <ActionBtn
            label="Plan"
            pendingLabel="Planning"
            pending={planPending}
            disabled={!hasFolder || !hasAnyAi || flowPending}
            slot="plan"
            onClick={firePlan}
            hint={!hasFolder ? "Refresh raw box first" : !hasAnyAi ? "Regenerate Ai docs first" : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function FreshnessChips({
  freshness,
  hasAnyAi,
  hasPlan,
}: {
  freshness: LeadFreshness | null;
  hasAnyAi: boolean;
  hasPlan: boolean;
}) {
  if (!freshness) {
    return (
      <div className="leads-fresh-slot">
        <span className="leads-fresh-skeleton" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="leads-fresh-slot">
      <span className="leads-fresh-panel">
        <span className="leads-fresh-chips">
          <Chip
            kind="raw"
            on={freshness.has_folder}
            label="Raw"
            title={freshness.has_folder ? "Harness folder present" : "No harness folder yet — refresh to seed"}
          />
          <Chip
            kind="ai"
            on={hasAnyAi}
            label="Ai"
            title={hasAnyAi ? "Ai docs present" : "No Ai docs yet"}
          />
          <Chip
            kind="plan"
            on={hasPlan}
            label="Plan"
            title={hasPlan ? "Seven-day plan present" : "No plan yet"}
          />
        </span>
      </span>
    </div>
  );
}

function Chip({
  kind,
  on,
  label,
  title,
}: {
  kind: "raw" | "ai" | "plan";
  on: boolean;
  label: string;
  title?: string;
}) {
  const state = on ? "on" : "off";
  const cls = ["leads-fresh-chip", `leads-fresh-chip--${kind}`, `leads-fresh-chip--${state}`].join(" ");
  return (
    <span className={cls} title={title}>
      {label}
    </span>
  );
}

function ActionBtn({
  label,
  pendingLabel,
  pending,
  disabled,
  onClick,
  slot,
  hint,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  slot: "flow" | "raw" | "ai" | "plan";
  hint?: string;
}) {
  const cls = [
    "leads-action-btn",
    `leads-action-btn--${slot}`,
    pending ? "leads-action-btn-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled || pending} title={hint}>
      {pending ? <span className="leads-action-spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
