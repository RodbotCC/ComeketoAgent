/**
 * Workflow author tool — `propose_close_workflow`.
 *
 * Loads the current draft, calls a sub-LLM with structured-output to produce a
 * step list per the operator's plain-English instruction, lays the steps out
 * as nodes on the canvas, and writes back to `automation_drafts.workflow_json`.
 *
 * v1 vocabulary: email_send, sms_send, task_create, wait.
 * NEPQ voice gate runs on email/SMS body text; blocking violations get a single
 * rewrite pass before the tool returns.
 */

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "./settings";
import {
  getAutomationDraft,
  updateAutomationDraft,
  type AutomationDraftRow,
} from "./automation-drafts";
import type { Workflow, WorkflowNode, WorkflowEdge } from "@/components/AutomationCanvas";
import { validateNepqVoice, hasBlockingViolation } from "./nepq";
import { logExecution } from "./execution-audit";

// ─── Tool def (OpenAI Responses format) ────────────────────────────────────

export const WORKFLOW_AUTHOR_TOOLS = [
  {
    type: "function" as const,
    name: "propose_close_workflow",
    description:
      "Build or refine the Close workflow (sequence) the operator is currently authoring on this page. The draft is bound to this chat session — you do NOT need to know or ask for an id; just pass the operator's instruction and the tool edits the draft they're already looking at. v1 step vocabulary: email_send, sms_send, task_create, wait. Use for: 'build me a 5-touch revival sequence for stale wedding leads', 'make the second touch SMS', 'add a 3-day wait before the call task', 'rewrite the second email to be warmer'. After the tool returns the canvas re-renders automatically.",
    parameters: {
      type: "object",
      properties: {
        operator_instruction: {
          type: "string",
          description: "What to build or change, in plain English.",
        },
      },
      required: ["operator_instruction"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "ask_operator",
    description:
      "Surface a multiple-choice clarifying question to the operator. Use this — and ONLY this — whenever you need to clarify intent before authoring rich/branded content (sections? tone? embeds? audience?). Never ask clarifying questions as plain assistant text; always call this tool. The operator sees the question rendered as a card with chip buttons for each choice plus a 'Type my own answer' fallback. The chat will pause until they answer. Do NOT call propose_close_workflow on the same turn as ask_operator — wait for their reply.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The single clarifying question (one short sentence).",
        },
        choices: {
          type: "array",
          description:
            "2-5 distinct, concrete answer options. Each is a short label (3-8 words). Avoid 'other' — the freeform fallback handles that.",
          items: { type: "string" },
        },
        allow_freeform: {
          type: "boolean",
          description:
            "Whether to show a 'Type my own answer' button that focuses the composer. Default true; set false only if the question is strictly enumerable.",
        },
      },
      required: ["question", "choices"],
      additionalProperties: false,
    },
  },
];

export type WorkflowAuthorToolName = "propose_close_workflow" | "ask_operator";

export function isWorkflowAuthorTool(name: string): name is WorkflowAuthorToolName {
  return name === "propose_close_workflow" || name === "ask_operator";
}

// ─── Step shape the sub-LLM emits ──────────────────────────────────────────

type StepKind = "email_send" | "sms_send" | "task_create" | "wait";

type EmailStep = {
  kind: "email_send";
  label: string;
  config: { subject: string; body_text: string; body_html?: string; delay_days?: number };
};
type SmsStep = { kind: "sms_send"; label: string; config: { body: string; delay_days?: number } };
type TaskStep = { kind: "task_create"; label: string; config: { text: string; delay_days?: number } };
type WaitStep = { kind: "wait"; label: string; config: { days: number } };
type ComposedStep = EmailStep | SmsStep | TaskStep | WaitStep;

type ProposedWorkflow = {
  name: string;
  steps: ComposedStep[];
};

const VALID_KINDS: ReadonlySet<StepKind> = new Set([
  "email_send",
  "sms_send",
  "task_create",
  "wait",
]);

// ─── Sub-LLM prompt ────────────────────────────────────────────────────────

const SUB_LLM_INSTRUCTIONS = `You are the workflow architect inside Comeketo Agent. The operator gives you a natural-language description; you produce a Close-compatible workflow as a structured step list.

## Vocabulary (v1)

You have exactly four step kinds. Do NOT invent others.

1. \`email_send\` — config: { subject: string, body_text: string, body_html?: string, delay_days?: number }
2. \`sms_send\` — config: { body: string, delay_days?: number }
3. \`task_create\` — config: { text: string, delay_days?: number } — phone-call task or follow-up the operator handles manually
4. \`wait\` — config: { days: number } — pure cadence; folded into the next step's delay at compile time

## Output shape

Return ONLY a JSON object:
\`\`\`json
{
  "name": "Workflow name (5-7 words, sentence case)",
  "steps": [
    { "kind": "...", "label": "short label (3-6 words)", "config": { ... } }
  ]
}
\`\`\`

## Plain text vs rich HTML on email_send

Two body fields. Use them as follows:

- \`body_text\` is REQUIRED on every email_send. Plain text. NEPQ voice rules apply (see below). This is what plain-text email clients see and what NEPQ voice gating runs over.
- \`body_html\` is OPTIONAL. Use it when the operator asks for a structured / branded / multi-section email — the kind Rhonna sends ("a 45-day pre-event timeline email with bolded date headers", "a tasting hero card with the video and a CTA", "the 5-email inbound nurture drip with branded section blocks"). Skip it for short, conversational, ask-don't-pitch touches — those should be plain text only.

When you DO emit body_html, follow Close's XHTML subset exactly:

- Wrap the entire body in \`<body>...</body>\`. Required.
- Allowed tags: \`<h1>\` through \`<h6>\`, \`<p>\`, \`<strong>\`, \`<em>\`, \`<b>\`, \`<i>\`, \`<u>\`, \`<s>\`, \`<ul>\`, \`<ol>\`, \`<li>\`, \`<a href="...">\`, \`<img src="..." alt="..." />\`, \`<hr />\`, \`<code>\`, \`<span style="color: #...">\` for inline color.
- No \`<script>\`, no \`<style>\`, no \`<table>\`, no class names other than \`class="mention"\` on mention spans, no inline styles other than the \`color\` property on \`<span>\`.
- Self-close \`<img />\` and \`<hr />\` (XHTML, not HTML5).

The plain-text version (\`body_text\`) should be the same MESSAGE without the formatting — same intent, same NEPQ voice, just stripped of tags. Operators on plain-text clients should still get the gist.

## Voice for body_text and sms_send body

NEPQ voice. Ask, don't pitch. No fake warmth, no exclamation marks, no "I hope this email finds you well", no "Just checking in!" Short sentences. Curiosity over claim. Specifically:
- Lead with a question or observation about the recipient's situation.
- Acknowledge what's actually going on for them ("I imagine you're juggling…").
- End with a low-pressure ask or a soft door open.
- Do not stack adjectives. Do not perform.

The same voice rules apply to the visible text inside body_html — the structure can be richer (headings, lists, emphasis) but the words still don't perform.

## Refinement mode

If the operator's instruction references "the second touch" / "rewrite the email" / "add a wait" / "give the third email a branded HTML version" — they're refining an existing draft. Use the current_workflow_state at the bottom of the input to ground your changes. Keep what they didn't ask you to change. Replace what they did.

## Build mode

If they're asking for a fresh workflow ("build me a 5-touch revival sequence") and the current state is empty, design the cadence from scratch. Default cadence shape for revival/follow-up: SMS day 0 → email day 2 → task (phone) day 5 → email day 9 → email day 14. Adjust based on what they describe.

## Rich-HTML example (use as a reference for shape, not as boilerplate)

Operator: "Build me Rhonna's 45-day pre-event email — bold date headers, the timeline of what they need to confirm, soft sign-off."

\`\`\`html
<body>
  <p>Hey {{lead.first_name}} — your event is 45 days out. Here's what's still ahead so nothing slips through.</p>
  <hr />
  <p><strong>45 Days Before · Final Guest Count Due</strong><br />Lead time we need so the kitchen and rentals lock in. If anything's still up in the air, say the word.</p>
  <p><strong>30 Days Before · Last Day for Menu or Service Changes</strong><br />After this, it's harder for us to pivot without trade-offs.</p>
  <p><strong>14 Days Before · Final Walk-Look</strong><br />We confirm staffing, timing, and any special-handling notes.</p>
  <hr />
  <p>If anything on this list is causing you to pause, the easiest thing is to hit reply with what's on your mind. We'll handle the rest.</p>
</body>
\`\`\`

Notice: real branded structure, but every sentence still asks or acknowledges — no "we're so excited!", no exclamation marks. That's the bar.`;

// ─── Sub-LLM call ──────────────────────────────────────────────────────────

async function callSubLLM(
  operatorInstruction: string,
  currentWorkflow: Workflow
): Promise<{ proposed?: ProposedWorkflow; error?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY not set" };
  }
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const currentDescription = describeCurrentWorkflow(currentWorkflow);
  const input = [
    `Operator instruction: ${operatorInstruction}`,
    "",
    "Current workflow state (refine, don't redo, unless they ask for a rebuild):",
    currentDescription,
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: SUB_LLM_INSTRUCTIONS,
      input,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { error: `OpenAI call failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return { error: "Sub-LLM returned no JSON object" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return { error: `Sub-LLM JSON parse failed: ${err instanceof Error ? err.message : err}` };
  }

  const validation = validateProposedWorkflow(parsed);
  if ("error" in validation) return { error: validation.error };
  return { proposed: validation.proposed };
}

function describeCurrentWorkflow(wf: Workflow): string {
  if (!wf.nodes.length) return "(empty — fresh workflow)";
  const lines: string[] = [`Name: ${wf.name}`];
  for (let i = 0; i < wf.nodes.length; i++) {
    const n = wf.nodes[i];
    const cfg = JSON.stringify(n.config ?? {}).slice(0, 200);
    lines.push(`Step ${i + 1}: ${n.kind} — ${n.label} — config ${cfg}`);
  }
  return lines.join("\n");
}

function validateProposedWorkflow(
  raw: unknown
): { proposed: ProposedWorkflow } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "not an object" };
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Untitled workflow";
  if (!Array.isArray(obj.steps)) return { error: "missing steps array" };

  const out: ComposedStep[] = [];
  for (const item of obj.steps) {
    if (!item || typeof item !== "object") continue;
    const step = item as Record<string, unknown>;
    const kind = step.kind as StepKind;
    if (!VALID_KINDS.has(kind)) continue;
    const label = typeof step.label === "string" ? step.label.slice(0, 80) : kind;
    const config = (step.config as Record<string, unknown>) ?? {};

    if (kind === "email_send") {
      const rawHtml = typeof config.body_html === "string" ? config.body_html.trim() : "";
      out.push({
        kind,
        label,
        config: {
          subject: String(config.subject ?? "(no subject)"),
          body_text: String(config.body_text ?? config.body ?? ""),
          ...(rawHtml ? { body_html: rawHtml } : {}),
          delay_days: numFromUnknown(config.delay_days),
        },
      });
    } else if (kind === "sms_send") {
      out.push({
        kind,
        label,
        config: {
          body: String(config.body ?? config.body_text ?? ""),
          delay_days: numFromUnknown(config.delay_days),
        },
      });
    } else if (kind === "task_create") {
      out.push({
        kind,
        label,
        config: {
          text: String(config.text ?? config.body ?? ""),
          delay_days: numFromUnknown(config.delay_days),
        },
      });
    } else if (kind === "wait") {
      out.push({
        kind,
        label,
        config: { days: numFromUnknown(config.days) ?? 1 },
      });
    }
  }

  if (out.length === 0) return { error: "no valid steps in proposed output" };
  return { proposed: { name, steps: out } };
}

function numFromUnknown(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// ─── NEPQ voice gate (post-pass over generated bodies) ─────────────────────

async function rewriteForNepqVoice(
  text: string,
  context: string
): Promise<string> {
  if (!env.OPENAI_API_KEY) return text;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const settings = await getSettings();
  try {
    const r = await client.responses.create({
      model: settings.model,
      instructions: `Rewrite the following ${context} text to pass NEPQ voice rules: short sentences, no fake warmth, no exclamation marks, no "I hope this email finds you well" / "Just checking in", curiosity over claim, ask don't pitch. Return ONLY the rewritten text — no preamble, no quotes around it.`,
      input: text,
    });
    const out = (r.output_text ?? "").trim();
    return out || text;
  } catch {
    return text;
  }
}

async function applyVoiceGate(steps: ComposedStep[]): Promise<{ steps: ComposedStep[]; rewritten: number }> {
  let rewritten = 0;
  const out: ComposedStep[] = [];
  for (const s of steps) {
    if (s.kind === "email_send") {
      const body = s.config.body_text;
      if (body && hasBlockingViolation(validateNepqVoice(body))) {
        const fixed = await rewriteForNepqVoice(body, "email body");
        out.push({ ...s, config: { ...s.config, body_text: fixed } });
        rewritten += 1;
        continue;
      }
    } else if (s.kind === "sms_send") {
      const body = s.config.body;
      if (body && hasBlockingViolation(validateNepqVoice(body))) {
        const fixed = await rewriteForNepqVoice(body, "SMS body");
        out.push({ ...s, config: { ...s.config, body: fixed } });
        rewritten += 1;
        continue;
      }
    }
    out.push(s);
  }
  return { steps: out, rewritten };
}

// ─── Layout: steps → nodes + edges with x/y positions ──────────────────────

const ROLE_BY_KIND: Record<StepKind, "trigger" | "actor" | "sink" | "transform" | "state"> = {
  email_send: "sink",
  sms_send: "sink",
  task_create: "actor",
  wait: "transform",
};

function stepsToWorkflow(name: string, steps: ComposedStep[], existingId: string): Workflow {
  const baseX = 80;
  const stepX = 200;
  const y = 120;

  const nodes: WorkflowNode[] = steps.map((s, i) => ({
    id: `n-${i}-${randomUUID().slice(0, 6)}`,
    role: ROLE_BY_KIND[s.kind],
    kind: s.kind,
    label: s.label,
    x: baseX + i * stepX,
    y,
    config: s.config as Record<string, unknown>,
  }));

  const connections: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    connections.push({
      id: `e-${i}-${randomUUID().slice(0, 6)}`,
      src: nodes[i].id,
      dst: nodes[i + 1].id,
      kind: "trigger",
    });
  }

  return {
    id: existingId,
    name,
    nodes,
    connections,
  };
}

// ─── Public dispatcher ─────────────────────────────────────────────────────

export type ProposeWorkflowResult =
  | {
      ok: true;
      kind: "workflow_proposed";
      draft_id: string;
      workflow_name: string;
      step_count: number;
      step_summary: Array<{ kind: StepKind; label: string }>;
      voice_rewrites: number;
    }
  | {
      ok: true;
      kind: "operator_question";
      question: string;
      choices: string[];
      allow_freeform: boolean;
    }
  | { ok: false; error: string };

export async function dispatchWorkflowAuthorTool(
  name: string,
  args: Record<string, unknown>,
  opts: { draftId: string; traceId?: string | null }
): Promise<ProposeWorkflowResult> {
  if (name === "ask_operator") {
    const question = String(args.question ?? "").trim();
    const choicesArr = Array.isArray(args.choices) ? args.choices : [];
    const choices = choicesArr
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter((c) => c.length > 0)
      .slice(0, 5);
    const allow_freeform = args.allow_freeform === false ? false : true;
    if (!question) return { ok: false, error: "ask_operator: question required" };
    if (choices.length < 2) {
      return { ok: false, error: "ask_operator: need at least 2 choices" };
    }
    void logExecution({
      action_kind: "publish_automation_draft",
      trace_id: opts?.traceId ?? null,
      payload: {
        stage: "ask_operator",
        draft_id: opts.draftId,
        question,
        choice_count: choices.length,
      },
    });
    return { ok: true, kind: "operator_question", question, choices, allow_freeform };
  }

  if (name !== "propose_close_workflow") {
    return { ok: false, error: `unknown workflow author tool: ${name}` };
  }

  // draft_id is bound to the chat session server-side. We accept whatever
  // the LLM may have passed but always prefer the server-bound id.
  const draftId = (opts.draftId || String(args.draft_id ?? "")).trim();
  const instruction = String(args.operator_instruction ?? "").trim();
  if (!draftId) return { ok: false, error: "draft_id missing on server context" };
  if (!instruction) return { ok: false, error: "operator_instruction required" };

  const draft: AutomationDraftRow | null = await getAutomationDraft(draftId);
  if (!draft) return { ok: false, error: `draft not found: ${draftId}` };

  const sub = await callSubLLM(instruction, draft.workflow_json);
  if (sub.error || !sub.proposed) {
    return { ok: false, error: sub.error || "sub-LLM returned no proposal" };
  }

  const gated = await applyVoiceGate(sub.proposed.steps);
  const newName = sub.proposed.name || draft.name;
  const newWorkflow = stepsToWorkflow(newName, gated.steps, draft.workflow_json.id || "local");

  await updateAutomationDraft(draftId, {
    name: newName,
    workflow_json: newWorkflow,
    operator_goal: instruction,
  });

  void logExecution({
    action_kind: "publish_automation_draft",
    trace_id: opts?.traceId ?? null,
    payload: {
      stage: "propose",
      draft_id: draftId,
      step_count: gated.steps.length,
      voice_rewrites: gated.rewritten,
    },
  });

  return {
    ok: true,
    kind: "workflow_proposed",
    draft_id: draftId,
    workflow_name: newName,
    step_count: gated.steps.length,
    step_summary: gated.steps.map((s) => ({ kind: s.kind, label: s.label })),
    voice_rewrites: gated.rewritten,
  };
}
