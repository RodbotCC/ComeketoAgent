/**
 * AI helper: draft Workflow + operator goal → proposed Close sequence steps + risks (§M3).
 * Server-only. Does not call Close.
 */

import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "./settings";
import type { Workflow } from "@/components/AutomationCanvas";

export type SequenceAiResult = {
  steps: Array<Record<string, unknown>>;
  risks: string[];
};

const SYSTEM = `You translate a Comeketo automation draft (workflow JSON + operator goal) into a Close CRM sequence **steps** array for POST /sequence/.

Return ONLY valid JSON (no prose, no markdown fences) of this exact shape:
{ "steps": [ ... ], "risks": [ "string", ... ] }

Rules for each step object:
- Must include "step_type": one of "delay", "email", "sms", "call" (prefer these four for v1).
- Must include "delay": non-negative integer **seconds** after the previous step (use 0 for first step).
- For "email": include "email_template_id" when you can infer a real Close template id from context; otherwise omit it and add a risk that the operator must pick a template in Close.
- For "sms": same pattern with "sms_template_id" if applicable; otherwise risks.
- For "call": optional "required": true for Close examples.
- Keep steps minimal and linear (v1). If uncertain, add a risk and use a conservative step (e.g. delay only).

Risks must explicitly call out: reply sensitivity, frequency/over-messaging, missing template IDs, timezone assumptions, anything you could not verify.`;

export async function interpretWorkflowToCloseSteps(
  workflow: Workflow,
  operatorGoal: string
): Promise<
  | { ok: true; result: SequenceAiResult }
  | { ok: false; error: string; raw?: string }
> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };
  const goal = operatorGoal.trim();
  if (!goal) return { ok: false, error: "operator goal required" };

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const user = [
    "OPERATOR GOAL:",
    goal,
    "",
    "WORKFLOW_JSON:",
    JSON.stringify(workflow, null, 2),
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: SYSTEM,
      input: user,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return { ok: false, error: "no JSON in model output", raw };
  }
  let parsed: { steps?: unknown[]; risks?: unknown[] };
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`, raw };
  }
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const risks = Array.isArray(parsed.risks)
    ? parsed.risks.map((r) => String(r))
    : ["Model did not return a risk list — treat as needs_review"];
  if (steps.length === 0) {
    return { ok: false, error: "model returned zero steps", raw };
  }

  const norm: Array<Record<string, unknown>> = [];
  for (const s of steps) {
    if (s && typeof s === "object" && !Array.isArray(s)) norm.push(s as Record<string, unknown>);
  }
  if (norm.length === 0) return { ok: false, error: "no usable step objects", raw };

  return { ok: true, result: { steps: norm, risks } };
}
