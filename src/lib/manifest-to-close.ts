/**
 * Compile a draft Workflow (the AutomationCanvas on-disk shape) into the
 * Close sequence body that `closeCreateSequence` expects.
 *
 * v1 vocabulary (must match what `propose_close_workflow` emits):
 *   - email_send     → Close step type "email" (creates an email template, references its id)
 *   - sms_send       → Close step type "sms"   (creates an SMS template, references its id)
 *   - task_create    → Close step type "call"  (inline `text` field; no template needed)
 *   - wait           → folded into the next step's `delay_in_seconds`
 *
 * Linear flow only; v1 doesn't emit branches.
 *
 * Why templates: Close's /sequence/ API does NOT accept inline subject/body on
 * email or sms steps. Each email/sms step must reference a pre-created
 * `email_template_id` / `sms_template_id`. This module creates those templates
 * on the fly during publish.
 */

import type { Workflow, WorkflowNode } from "@/components/AutomationCanvas";
import type { AutomationDraftRow } from "@/lib/automation-drafts";
import { closeCreateEmailTemplate, closeCreateSmsTemplate } from "@/lib/close";

export type CloseSequenceBody = {
  name: string;
  timezone?: string;
  schedule?: unknown;
  steps: CloseSequenceStep[];
};

export type CloseSequenceStep = Record<string, unknown> & {
  step_type: "email" | "sms" | "call";
  delay_in_seconds?: number;
};

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
  for (const n of wf.nodes) if (!visited.has(n.id)) out.push(n);
  return out;
}

function readDelayDays(node: WorkflowNode): number {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const v = cfg.delay_days ?? cfg.days ?? cfg.delay;
  const num = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** Short slug used to disambiguate templates created for this draft. */
function templateSuffix(draftId: string, stepIndex: number): string {
  const tail = draftId.replace(/-/g, "").slice(0, 6);
  return `${tail}-${stepIndex + 1}`;
}

async function emailStep(
  node: WorkflowNode,
  delayDays: number,
  draft: AutomationDraftRow,
  stepIndex: number
): Promise<CloseSequenceStep> {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const subject = String(cfg.subject ?? node.label ?? "(no subject)");
  const body = String(cfg.body_text ?? cfg.body ?? cfg.draft_seed ?? "");
  const bodyHtmlRaw = typeof cfg.body_html === "string" ? cfg.body_html.trim() : "";
  const tplName = `${draft.name || "Workflow"} · email ${stepIndex + 1} · ${templateSuffix(
    draft.id,
    stepIndex
  )}`;
  const tpl = await closeCreateEmailTemplate({
    name: tplName,
    subject,
    body_text: body,
    ...(bodyHtmlRaw ? { body_html: bodyHtmlRaw } : {}),
  });
  return {
    step_type: "email",
    delay_in_seconds: delayDays * 86400,
    email_template_id: tpl.id,
  };
}

async function smsStep(
  node: WorkflowNode,
  delayDays: number,
  draft: AutomationDraftRow,
  stepIndex: number
): Promise<CloseSequenceStep> {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const body = String(cfg.body ?? cfg.body_text ?? cfg.draft_seed ?? "");
  const tplName = `${draft.name || "Workflow"} · sms ${stepIndex + 1} · ${templateSuffix(
    draft.id,
    stepIndex
  )}`;
  const tpl = await closeCreateSmsTemplate({
    name: tplName,
    body,
  });
  return {
    step_type: "sms",
    delay_in_seconds: delayDays * 86400,
    sms_template_id: tpl.id,
  };
}

function callStep(node: WorkflowNode, delayDays: number): CloseSequenceStep {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  const text = String(cfg.text ?? cfg.body ?? node.label ?? "Call");
  return {
    step_type: "call",
    delay_in_seconds: delayDays * 86400,
    text,
  };
}

/**
 * Compile a draft into the Close sequence body shape, creating any
 * email/SMS templates this draft needs along the way.
 *
 * Side effect: posts to /email_template/ and /sms_template/ on Close. The
 * template ids end up referenced inside the returned step shapes.
 */
export async function workflowToCloseSequence(
  draft: AutomationDraftRow
): Promise<CloseSequenceBody> {
  const wf = draft.workflow_json;
  const ordered = topologicalOrder(wf);

  const steps: CloseSequenceStep[] = [];
  let pendingWaitDays = 0;

  for (const node of ordered) {
    const kind = node.kind;
    const inherentDelay = readDelayDays(node);
    const totalDelay = pendingWaitDays + inherentDelay;

    if (kind === "wait") {
      pendingWaitDays = totalDelay;
      continue;
    }
    if (kind === "email_send") {
      steps.push(await emailStep(node, totalDelay, draft, steps.length));
      pendingWaitDays = 0;
      continue;
    }
    if (kind === "sms_send") {
      steps.push(await smsStep(node, totalDelay, draft, steps.length));
      pendingWaitDays = 0;
      continue;
    }
    if (kind === "task_create" || kind === "call_task" || kind === "call") {
      steps.push(callStep(node, totalDelay));
      pendingWaitDays = 0;
      continue;
    }
    // Unknown kind — skip silently.
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
