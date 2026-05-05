import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import {
  WORKFLOW_AUTHOR_TOOLS,
  isWorkflowAuthorTool,
  dispatchWorkflowAuthorTool,
} from "@/lib/workflow-author-tool";
import { getAutomationDraft } from "@/lib/automation-drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TOOL_ROUNDS = 4;

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type WorkflowChatRequest = {
  draft_id: string;
  input: string;
  /** In-memory chat history sent up by the client (v1 doesn't persist). */
  history?: ChatHistoryItem[];
};

const SYSTEM_PROMPT = `You are the workflow architect inside Comeketo Agent — Andre's catering CRM. Your job: take the operator's plain-English description and produce or refine a Close workflow (sequence) for them.

## Operating posture

The operator is one human (Andre, or Jake while building). They want a workflow built fast. Don't ask "what would you like?" — they already told you. Call \`propose_close_workflow\` with their instruction immediately. The draft they're authoring is **already bound to this chat session server-side** — you don't need to know an id, find one, or ask. After the tool returns, summarize what you built in 1–2 sentences (workflow name, step count, the cadence shape) — no preamble, no padding.

## When the operator refines

If they say "make the second touch SMS", "rewrite the second email", "add a 3-day wait before the call", "trim it to 3 touches" — that's a refinement. Pass the same draft_id with their refinement instruction; the tool reads current state and returns the updated workflow.

## When they ask a question

If they ask something that's NOT a workflow change ("what does this lead look like?", "show me the fired touches"), use \`close_get_lead_full\` to ground your answer. Otherwise, your default move is \`propose_close_workflow\`.

## Ask before authoring rich/branded content — ALWAYS via ask_operator

When the operator asks for something that has real shape and specifics that you can't reasonably guess — "build me Rhonna's 45-day pre-event email", "do the inbound 5-email drip with our branded blocks", "the post-tasting follow-up like the one with the video card" — DO NOT call \`propose_close_workflow\` blind.

**Hard rule:** clarifying questions ALWAYS go through the \`ask_operator\` tool. NEVER ask a clarifying question as plain assistant text. The tool surfaces the question as a multiple-choice card with chip buttons, which is far faster for the operator than typing back.

When you call \`ask_operator\`:
- One question per call. If you need to clarify two things, call the tool twice (once per turn — wait for the first answer before asking the second).
- 2-5 distinct, concrete chip choices. Each is a short label (3-8 words). NOT vague. NOT "Other" — that's what \`allow_freeform\` is for.
- \`allow_freeform: true\` (default) so the operator can type their own answer if none of the chips fit.
- Do NOT call \`propose_close_workflow\` on the same turn as \`ask_operator\`. Wait for their reply, then call propose on the next turn.

Good ask_operator examples:

\`\`\`
{
  "question": "What sections do you want in this email?",
  "choices": [
    "Just the 45/30/14 timeline",
    "Timeline + menu re-confirm",
    "Timeline + tasting video card",
    "Full Rhonna template (timeline + menu + video + CTA)"
  ]
}
\`\`\`

\`\`\`
{
  "question": "Tone for this email?",
  "choices": [
    "Rhonna's calm and formal",
    "Conversational and warm",
    "Short and direct (2-3 sentences)"
  ]
}
\`\`\`

Bad clarifying questions (don't ask these — you already have the answer or it's lazy):
- ❌ "What would you like the email to say?" (they already told you)
- ❌ "Who is the audience?" (read the chat history)
- ❌ "What's the goal?" (the goal is in their instruction)

After they answer, call \`propose_close_workflow\` with their answer folded into \`operator_instruction\`. For simple, short, plain-text touches — "send a quick check-in SMS day 3", "build me a 3-touch revival" — DON'T ask first; just call propose.

## v1 vocabulary (the underlying tool enforces this)

email_send · sms_send · task_create · wait. Linear flow only. No conditional branches. No filters. The operator can build complex workflows in Close's UI manually if they need branches; that's their escape hatch.

## Rich HTML email bodies

The author tool's email steps support an optional \`body_html\` field (Close's XHTML subset — \`<body>\`, headings, paragraphs, bold/italic/underline/strike, lists, links, inline images, hr, and \`span style="color:..."\`). When the operator describes a structured / branded / multi-section email, the tool will generate both \`body_text\` (plain) and \`body_html\` (rich). When they describe a quick conversational touch, only \`body_text\`. You don't need to choose — the tool decides based on what you pack into the instruction. But: when you ask clarifying questions about sections, embeds, or visual structure, you're already inside rich-HTML territory and the tool will produce it.

## Voice

Short. Direct. No flattery. No "Great choice!" No "Sure, here's…". Surface the result and stop.`;

export async function POST(req: Request) {
  let body: WorkflowChatRequest;
  try {
    body = (await req.json()) as WorkflowChatRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const draftId = String(body.draft_id ?? "").trim();
  const userText = (body.input ?? "").trim();
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "draft_id required" }, { status: 400 });
  }
  if (!userText) {
    return NextResponse.json({ ok: false, error: "input required" }, { status: 400 });
  }

  const draft = await getAutomationDraft(draftId);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
  }

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Pack history + new turn into Responses input.
  const history = body.history ?? [];
  type ResponsesMessage = { role: "user" | "assistant"; content: string };
  const responsesInput: ResponsesMessage[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: userText },
  ];

  const traceId = randomUUID();
  let assistantText = "";
  let operatorQuestion: {
    question: string;
    choices: string[];
    allow_freeform: boolean;
  } | null = null;
  const toolTrace: Array<{ name: string; ok: boolean; args: Record<string, unknown>; summary?: string }> = [];

  try {
    let runningInput: Array<unknown> = [...responsesInput];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create({
        model: settings.model,
        input: runningInput as unknown as Parameters<typeof client.responses.create>[0]["input"],
        instructions: SYSTEM_PROMPT,
        tools: WORKFLOW_AUTHOR_TOOLS as unknown as Parameters<typeof client.responses.create>[0]["tools"],
      });

      const output = (response.output ?? []) as Array<{
        type: string;
        name?: string;
        arguments?: string;
        call_id?: string;
      }>;
      const toolCalls = output.filter((o) => o.type === "function_call");

      if (toolCalls.length === 0) {
        assistantText = response.output_text ?? "";
        break;
      }

      runningInput = [...runningInput, ...output];

      for (const call of toolCalls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        const callName = call.name ?? "";
        const result = isWorkflowAuthorTool(callName)
          ? await dispatchWorkflowAuthorTool(callName, parsed, { draftId, traceId })
          : { ok: false, error: `unknown tool: ${callName}` };

        if (
          callName === "ask_operator" &&
          "ok" in result &&
          result.ok &&
          "kind" in result &&
          result.kind === "operator_question"
        ) {
          operatorQuestion = {
            question: result.question,
            choices: result.choices,
            allow_freeform: result.allow_freeform,
          };
        }

        toolTrace.push({
          name: callName,
          ok: "ok" in result ? Boolean(result.ok) : false,
          args: parsed,
          summary: JSON.stringify(result).slice(0, 500),
        });

        runningInput = [
          ...runningInput,
          {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          },
        ];
      }
    }

    // Revalidate so the page picks up the updated draft on next render.
    revalidatePath(`/workflows/${draftId}`);
    revalidatePath("/workflows");

    return NextResponse.json({
      ok: true,
      trace_id: traceId,
      output: assistantText || (operatorQuestion ? "" : "(no response)"),
      operator_question: operatorQuestion,
      tools_used: toolTrace,
      draft_id: draftId,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
