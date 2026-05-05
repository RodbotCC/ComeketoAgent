/**
 * WorkflowManifest — canonical schema unifying lead plans and automation drafts.
 *
 * Today the codebase has two parallel models:
 *   - SevenDayPlan (src/lib/plan.ts) — lead-scoped, drives heartbeat
 *   - Workflow (src/app/automation/AutomationCanvas.tsx) — org-wide, hand-designed,
 *     persisted as automation_drafts, publishes to Close as a sequence
 *
 * Both are sequences of typed action nodes against Close objects, gated by
 * guardrails, audited via execution_log. This module defines the unified
 * shape (read-side projection only — Phase 1) and adapters from each.
 *
 * No Supabase, no React. Pure functions only.
 */
import type { SevenDayPlan } from "./plan";
import type { AutomationDraftRow } from "./automation-drafts";
import type { Workflow, WorkflowNode, WorkflowEdge, NodeRole, EdgeKind } from "@/components/AutomationCanvas";

export type ManifestStatus =
  | "draft"
  | "preview"
  | "needs_review"
  | "approved"
  | "active"
  | "paused"
  | "archived"
  | "killed"
  | "completed";

export type ManifestNode = {
  id: string;
  role: NodeRole;
  kind: string;
  label: string;
  config: Record<string, unknown>;
  /** Per-node guard overrides; absent = inherit defaults from manifest runtime. */
  guards?: {
    ownership?: boolean;
    reply_gate?: boolean;
    send_window?: boolean;
    voice_lint?: boolean;
    frequency_cap?: boolean;
  };
  /** Day-level plans mirror approval_status here for the inspector. */
  approval_status?: "not_ready" | "needs_review" | "approved" | "sent" | "skipped";
  position?: { x: number; y: number };
};

export type ManifestEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  condition?: { path: string; equals?: unknown };
};

/**
 * Origin pointer so writes route back to the correct table.
 * Phase 1 is read-only; this exists so future phases don't have to add it.
 */
export type ManifestSource =
  | { table: "lead_plans"; plan_id: string }
  | { table: "automation_drafts"; draft_id: string };

export type WorkflowManifest = {
  id: string;
  name: string;
  /** lead = a plan (lead-scoped). org = an automation (org-wide). */
  scope: "lead" | "org";
  /** close_lead_id when scope === "lead". */
  subject_id: string | null;
  status: ManifestStatus;
  /** Snapshot match for lead-scoped manifests; null for org-wide. */
  based_on_snapshot_id: string | null;
  nodes: ManifestNode[];
  edges: ManifestEdge[];
  source: ManifestSource;
  /** Plan-level summary fields (goal, known facts, etc.) for lead scope; arbitrary for org. */
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ─── Adapter: SevenDayPlan → WorkflowManifest ────────────────────────────

/**
 * Each plan day becomes one actor node with kind "plan_day"; sequential edges
 * connect days in order. The day's required_actions live inside config so the
 * inspector can render them, but heartbeat keeps reading the original
 * lead_plans row — this manifest is a render-side projection only.
 */
export function leadPlanToManifest(plan: SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
}): WorkflowManifest {
  const nodes: ManifestNode[] = plan.days.map((d, idx) => ({
    id: `${plan.plan_id}:day:${idx}`,
    role: "actor",
    kind: "plan_day",
    label: `Day ${d.day}`,
    config: {
      day_number: d.day,
      objective: d.objective,
      required_actions: d.required_actions,
      send_window: d.send_window,
    },
    approval_status: d.approval_status,
  }));

  const edges: ManifestEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `${plan.plan_id}:edge:${i}`,
      from: nodes[i].id,
      to: nodes[i + 1].id,
      kind: "data",
      label: "next day",
    });
  }

  return {
    id: plan.plan_id,
    name: `${plan.primary_goal} cycle (${plan.days.length} days)`,
    scope: "lead",
    subject_id: plan.close_lead_id,
    status: plan.status as ManifestStatus,
    based_on_snapshot_id: plan.based_on_snapshot_id,
    nodes,
    edges,
    source: { table: "lead_plans", plan_id: plan.plan_id },
    metadata: {
      primary_goal: plan.primary_goal,
      goal_summary: plan.goal_summary,
      lead_state_summary: plan.lead_state_summary,
      known_facts: plan.known_facts,
      unknowns: plan.unknowns,
      best_next_question: plan.best_next_question,
      stop_conditions: plan.stop_conditions,
      cycle_started_at: plan.cycle_started_at,
      approval_required: plan.approval_required,
      approved_at: plan.approved_at,
      approved_by: plan.approved_by,
      killed_at: plan.killed_at,
      killed_reason: plan.killed_reason,
    },
    created_at: plan.generated_at,
    updated_at: plan.generated_at,
  };
}

// ─── Adapter: AutomationDraftRow → WorkflowManifest ──────────────────────

/**
 * The draft already has nodes + edges in a near-compatible shape. Adapter
 * does the field rename (src/dst → from/to) and lifts x/y into position.
 */
export function automationDraftToManifest(draft: AutomationDraftRow): WorkflowManifest {
  const wf: Workflow = draft.workflow_json;
  const nodes: ManifestNode[] = (wf.nodes ?? []).map((n: WorkflowNode) => ({
    id: n.id,
    role: n.role,
    kind: n.kind,
    label: n.label,
    config: {
      ...(n.config ?? {}),
      // Preserve render-side context fields inside config so the inspector
      // can show them without a separate top-level slot.
      ...(n.notes ? { notes: n.notes } : {}),
      ...(n.description ? { description: n.description } : {}),
    },
    position: { x: n.x, y: n.y },
  }));

  const edges: ManifestEdge[] = (wf.connections ?? []).map((e: WorkflowEdge) => ({
    id: e.id,
    from: e.src,
    to: e.dst,
    kind: e.kind,
    label: e.label,
  }));

  return {
    id: draft.id,
    name: draft.name,
    scope: "org",
    subject_id: null,
    status: draft.status as ManifestStatus,
    based_on_snapshot_id: null,
    nodes,
    edges,
    source: { table: "automation_drafts", draft_id: draft.id },
    metadata: {
      operator_goal: draft.operator_goal,
      risk_notes: draft.risk_notes,
      close_sequence_id: draft.close_sequence_id,
      close_steps_json: draft.close_steps_json,
      slug: wf.slug,
    },
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}

// ─── Mermaid emitter (render-only, no parser) ────────────────────────────

const ROLE_SHAPE_OPEN: Record<NodeRole, string> = {
  trigger: "{",
  actor: "((",
  transform: "{{",
  sink: "[",
  state: "[(",
};
const ROLE_SHAPE_CLOSE: Record<NodeRole, string> = {
  trigger: "}",
  actor: "))",
  transform: "}}",
  sink: "]",
  state: ")]",
};

/** Make an id mermaid-safe: alphanumeric + underscore only. */
function mermaidId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Escape label for inside mermaid node bracket. */
function mermaidLabel(label: string): string {
  // Strip characters mermaid hates inside brackets; quote-wrap to be safe.
  const safe = label.replace(/["`\n]/g, " ").trim();
  return `"${safe}"`;
}

/**
 * Emit a mermaid `flowchart LR` string. Pure function — operator pastes the
 * output into mermaid.live, a Slack code block, or a markdown doc.
 */
export function manifestToMermaid(m: WorkflowManifest): string {
  const lines: string[] = [`flowchart LR`];
  if (m.name) lines.push(`  %% ${m.name.replace(/\n/g, " ")}`);

  for (const n of m.nodes) {
    const id = mermaidId(n.id);
    const open = ROLE_SHAPE_OPEN[n.role];
    const close = ROLE_SHAPE_CLOSE[n.role];
    lines.push(`  ${id}${open}${mermaidLabel(n.label)}${close}`);
  }

  for (const e of m.edges) {
    const from = mermaidId(e.from);
    const to = mermaidId(e.to);
    if (e.label && e.label.trim().length > 0) {
      const safe = e.label.replace(/[|\n]/g, " ").trim();
      lines.push(`  ${from} -->|${safe}| ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  }

  return lines.join("\n");
}
