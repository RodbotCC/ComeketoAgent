/**
 * Compile a draft Workflow (the AutomationCanvas on-disk shape) into the
 * Close sequence body that `closeCreateSequence` expects.
 *
 * v1 vocabulary (must match what `propose_close_workflow` emits):
 *   - email_send     → Close step type "email"
 *   - sms_send       → Close step type "sms"
 *   - task_create    → Close step type "call" (closest analogue in Close sequences)
 *   - wait           → folded into the next step's delay
 *
 * Linear flow only; v1 doesn't emit branches. Walks nodes in connection-order
 * starting from any node with no incoming edges.
 */

import type { Workflow, WorkflowNode } from "@/components/AutomationCanvas";
import type { AutomationDraftRow } from "@/lib/automation-drafts";

export type CloseSequenceBody = {
  name: string;
  timezone?: string;
  schedule?: unknown;
  steps: CloseSequenceStep[];
};

export type CloseSequenceStep = Record<string, unknown> & {
  step_type: "email" | "sms" | "call";
  delay?: string;
  delay_in_seconds?: number;
};

/** ISO-8601 duration for "N days" — Close uses this format on the `delay` field. */
function isoDays(days: number): string {
  const d = Math.max(0, Math.round(days));
  return `P${d}D`;
}

/** Order nodes by walking from any incoming-edge-free root via connections. */
function topologicalOrder(wf: Workflow): WorkflowNode[] {
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  for (const n of wf.nodes) incoming.set(n.id, 0);
  for (const e of wf.connections) {
    incoming.set(e.dst, (incoming.get(e.dst) ?? 0) + 1);
  }
  const outBy = new Map<string, string[]>();
  for (const e of wf.connections) {
    const arr = outBy.get(e.src) ?? [];
    arr.push(e.dst);
    outBy.set(e.src, arr);
  }
  const roots = wf.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const visited = new Set<string>();
  const out: WorkflowNode[] = [];
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    out.push(cur);
    for (const nextId of outBy.get(cur.id) ?? []) {
      const next = byId.get(nextId);
      if (next) queue.push(next);
    }
  }
  // Anything left (disconnected) appended in declaration order so we don't drop nodes.
  for (const n of wf.nodes) if (!visited.has(n.id)) out.push(n);
  return out;
}

function readDelayDays(node: WorkflowNode): number {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const v = cfg.delay_days ?? cfg.days ?? cfg.delay;
  const num = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function emailStep(node: WorkflowNode, delayDays: number): CloseSequenceStep {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const subject = String(cfg.subject ?? node.label ?? "(no subject)");
  const body = String(cfg.body_text ?? cfg.body ?? cfg.draft_seed ?? "");
  return {
    step_type: "email",
    delay: isoDays(delayDays),
    delay_in_seconds: delayDays * 86400,
    subject,
    body_text: body,
  };
}

function smsStep(node: WorkflowNode, delayDays: number): CloseSequenceStep {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const body = String(cfg.body ?? cfg.body_text ?? cfg.draft_seed ?? "");
  return {
    step_type: "sms",
    delay: isoDays(delayDays),
    delay_in_seconds: delayDays * 86400,
    body,
  };
}

function callStep(node: WorkflowNode, delayDays: number): CloseSequenceStep {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const text = String(cfg.text ?? cfg.body ?? node.label ?? "Call");
  return {
    step_type: "call",
    delay: isoDays(delayDays),
    delay_in_seconds: delayDays * 86400,
    text,
  };
}

/**
 * Compile a draft into the Close sequence body shape.
 * Throws if the draft has zero compilable steps so the caller surfaces a
 * clear error before hitting Close's API.
 */
export function workflowToCloseSequence(draft: AutomationDraftRow): CloseSequenceBody {
  const wf = draft.workflow_json;
  const ordered = topologicalOrder(wf);

  const steps: CloseSequenceStep[] = [];
  let pendingWaitDays = 0;

  for (const node of ordered) {
    const kind = node.kind;
    const inherentDelay = readDelayDays(node);
    const totalDelay = pendingWaitDays + inherentDelay;

    if (kind === "wait") {
      // Wait nodes are pure cadence; fold into next step's delay.
      pendingWaitDays = totalDelay;
      continue;
    }
    if (kind === "email_send") {
      steps.push(emailStep(node, totalDelay));
      pendingWaitDays = 0;
      continue;
    }
    if (kind === "sms_send") {
      steps.push(smsStep(node, totalDelay));
      pendingWaitDays = 0;
      continue;
    }
    if (kind === "task_create" || kind === "call_task" || kind === "call") {
      steps.push(callStep(node, totalDelay));
      pendingWaitDays = 0;
      continue;
    }
    // Unknown kind — skip silently rather than emit a malformed step. Caller
    // can spot a step-count mismatch in the UI summary if it matters.
  }

  if (steps.length === 0) {
    throw new Error(
      "Draft has no compilable steps. Add at least one email/SMS/call step before publishing."
    );
  }

  return {
    name: draft.name || wf.name || "Untitled workflow",
    timezone: "America/Los_Angeles",
    steps,
  };
}
