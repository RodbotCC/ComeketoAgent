/**
 * Pure mapping from Close GET /sequence/{id}/ steps → AutomationCanvas `Workflow`.
 * Keeps M2 honest: graph pixels reflect API-returned steps (read-only inspection v1).
 */

import type { Workflow, WorkflowEdge, WorkflowNode, NodeRole } from "@/app/automation/AutomationCanvas";

export type CloseStep = {
  id?: string;
  step_type?: string;
  delay?: number | string;
  [k: string]: unknown;
};

function stepRole(stepType: string): NodeRole {
  const t = stepType.toLowerCase();
  if (t === "delay" || t === "wait") return "trigger";
  if (t === "email") return "sink";
  if (t === "sms") return "sink";
  // fallback
  if (t === "call" || t === "voicemail") return "actor";
  return "transform";
}

/** Maps Close step_type → canvas `kind` (glyph library in AutomationCanvas). */
function stepKind(stepType: string): string {
  const t = stepType.toLowerCase();
  if (t === "email") return "email_send";
  if (t === "sms") return "sms_send";
  if (t === "call") return "andre";
  if (t === "delay" || t === "wait") return "interval";
  return t || "format";
}

function stepLabel(step: CloseStep, index: number): string {
  const st = String(step.step_type ?? "step");
  const d = step.delay;
  const delayPart = d !== undefined && d !== "" ? ` · ${d}` : "";
  return `${st}${delayPart}` || `step ${index + 1}`;
}

/**
 * Linear top-to-bottom auto-layout: one node per step, edges chain in order.
 */
export function closeStepsToWorkflow(
  sequenceId: string,
  sequenceName: string,
  steps: CloseStep[]
): Workflow {
  const baseX = 220;
  const baseY = 100;
  const vGap = 110;

  const nodes: WorkflowNode[] = steps.map((step, i) => {
    const st = String(step.step_type ?? "unknown");
    const id = typeof step.id === "string" && step.id ? step.id : `step-${i}`;
    return {
      id,
      role: stepRole(st),
      kind: stepKind(st),
      label: stepLabel(step, i),
      x: baseX,
      y: baseY + i * vGap,
      config: { ...step },
      description: summarizeStepForInspector(step),
    };
  });

  const connections: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    connections.push({
      id: `e-${nodes[i].id}-${nodes[i + 1].id}`,
      src: nodes[i].id,
      dst: nodes[i + 1].id,
      kind: "data",
    });
  }

  return {
    id: sequenceId,
    slug: sequenceId,
    name: sequenceName || "Sequence",
    nodes,
    connections,
  };
}

function summarizeStepForInspector(step: CloseStep): string {
  const skip = new Set(["id", "step_type", "delay"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(step)) {
    if (skip.has(k) || v === undefined || v === null) continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}: ${s.length > 160 ? `${s.slice(0, 157)}…` : s}`);
    if (parts.length >= 6) break;
  }
  return parts.join("\n") || "—";
}
