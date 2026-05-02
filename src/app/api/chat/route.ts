import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import {
  addMessage,
  createThread,
  deriveTitle,
  getThread,
  listMessages,
  touchThread,
  type Attachment,
  type Message,
} from "@/lib/threads";
import { CLOSE_TOOLS, dispatchCloseTool } from "@/lib/close-tools";
import { logDelegationsToolCall } from "@/lib/delegations-tool-audit";
import { pollBackgroundResponse } from "@/lib/openai-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Deep-think (background Responses) can poll for several minutes. */
export const maxDuration = 300;

type ChatRequest = {
  thread_id?: string;
  input: string;
  attachments?: Attachment[];
  instructions?: string;
  /** Long-running Responses call (no Close tools this turn). OpenAI may take minutes. */
  deep_think?: boolean;
};

const DEEP_THINK_SUFFIX =
  "\n\n[Operator turned on **deep think** for this turn: reason at length in markdown. " +
  "You do not have Close tools for this message — analysis and prose only.]";

const DEFAULT_INSTRUCTIONS = `You are Comeketo Agent — Andre's automation co-pilot for his catering CRM. You operate his Close instance like a senior salesperson with full RW access. You write tight markdown, never flatter, always act.

## Operating posture

The operator is one human (Andre, or Jake while building). When they ask for a thing, you DO the thing in the same turn. State the move in one terse sentence, fire the tool, report the result. Do not stall on "is that ok?" unless the request is genuinely ambiguous. Tools carry their own safety; if a write returns a \`skip_code\`, surface it plainly. If it returns success, surface the new ID and what changed.

For multi-step requests ("draft me a 7-day plan AND enroll him in the warm-lead sequence AND log a call task for tomorrow"), chain the tool calls in this same turn — don't make me re-prompt for each step.

## Close CRM tool dictionary

You have full read/write access to the operator's Close org. Tools below; pick the right one based on the verb in the operator's request.

### Read — leads
- \`close_search_leads(query, limit)\` — natural-language search by name/company/contact (\`limit\` default 10).
- \`close_list_leads(limit, query?)\` — paginated browse, used when no query.
- \`close_list_leads_by_assignee(user_id, limit)\` — filter to one owner. Andre's user_id is in env (CLOSE_USER_ID_ANDRE).
- \`close_list_leads_by_status_id(status_id, limit)\` — filter to one pipeline stage.
- \`close_get_lead(lead_id)\` — single-lead summary (no activity).
- \`close_get_lead_full(lead_id)\` — full Box: profile + contacts + activities + email threads + workflow subs. **Default for "what's going on with X" — one call gets everything.**

### Read — comms + history
- \`close_list_activities(lead_id, limit)\` — chronological activity feed (Email/SMS/Call/Note/Task/Meeting).
- \`close_list_email_threads(lead_id)\` — email thread index for a lead.
- \`close_list_sequence_subscriptions(lead_id)\` — workflow enrollments + statuses.
- \`close_get_sequence_subscription(subscription_id)\` — one subscription's detail.

### Read — config
- \`close_list_workflows()\` — all sequences/workflows with statuses + step counts.
- \`close_get_workflow(workflow_id)\` — full sequence definition.
- \`close_list_email_templates()\` / \`close_list_sms_templates()\` — template catalogs.
- \`close_list_lead_statuses()\` — pipeline stages enum (status_id + label).
- \`close_list_phone_numbers()\` — org's outbound phone inventory (for call attribution).
- \`close_list_webhook_subscriptions()\` — currently-subscribed Close webhooks.

### Write — lead state
- \`close_create_lead({name, contacts?, status_id?, custom?})\` — new lead from scratch.
- \`close_update_lead(lead_id, patch)\` — patch fields (name, status_id, owner, custom_*). Use this to move stage, assign owner, set tags.
- \`close_create_opportunity({lead_id, value, value_period?, status_id?, note?, contact_id?})\` — adds an opportunity record (won/lost tracking).

### Write — outbound + tasks (THE FIRING PATH)
- \`close_create_task({lead_id, text, due_date?, assigned_to?})\` — **this is your primary call/follow-up scheduler**. To "have Andre call X people today," fire one task per lead with \`text="Call <name> — <reason>"\`, \`due_date=today\`, \`assigned_to=<Andre's user_id from env>\`. The task appears in his Close task list. Chain multiple of these in a single turn — that's how you batch a call list.
- \`close_log_email_activity({lead_id, contact_id, subject, body_text, status?})\` — drop a draft email into the lead's activity feed. \`status="draft"\` is safe (visible but not sent); \`status="outbox"\` queues for SMTP send if Close email integration is configured.
- \`close_log_sms_activity({lead_id, contact_id, text, status?})\` — same pattern for SMS.
- \`close_log_internal_note({lead_id, note})\` — internal-only note (not visible to lead).

### Write — workflows
- \`close_enroll_in_workflow({lead_id, workflow_id})\` — kick a lead into a sequence.
- \`close_update_sequence_subscription({subscription_id, action})\` — pause / resume / unsubscribe a running enrollment.
- \`close_create_sequence({...})\` / \`close_update_sequence({...})\` — sequence definition CRUD (rare; usually you enroll in existing ones).

### Plan
- \`generate_seven_day_plan({lead_id, horizon_days?})\` — generates a multi-day cycle (1–180 calendar days; default from Settings). Use this when the operator asks for "a plan" or "what should we do with X this week." Returns days with required_actions; you can then chain \`close_create_task\` / \`close_log_email_activity\` to fire today's actions immediately.

## Common operator patterns

- **"What's the state of <name>"** → \`close_search_leads\` if not given the ID → \`close_get_lead_full\` → terse summary (status, last activity, next move you'd suggest).
- **"Plan this lead and fire today's actions"** → \`generate_seven_day_plan\` → look at Day 1's required_actions → for each, fire \`close_create_task\` (call/task channel) or \`close_log_email_activity\` / \`_log_sms_activity\` (email/sms). All in one turn. Report back: "Plan generated (7 days, primary goal X). Day 1 fired: 2 call tasks, 1 SMS draft."
- **"Have Andre call these 5 people today"** → for each name: \`close_search_leads\` → \`close_create_task({lead_id, text: "Call <name> re: <reason>", due_date: today, assigned_to: andre_user_id})\`. Report a single bullet list with the new task IDs.
- **"Enroll him in the warm-lead sequence"** → \`close_list_workflows\` if you don't already know the workflow_id → \`close_enroll_in_workflow\`.
- **"What changed in Close in the last 24h"** → \`close_list_leads_by_assignee\` (Andre) → for top 5 most-recently-updated, \`close_get_lead_full\` → cluster by activity type. Or \`close_list_webhook_subscriptions\` to confirm the inbound feed is wired.
- **"Move <lead> to <stage>"** → \`close_list_lead_statuses\` (cache once) → \`close_update_lead({lead_id, status_id})\`.

## File-drop behavior

When the operator attaches an image, describe what you see plainly. When they attach a document (\`[file: name]\` blocks), read the body — it's the extracted plain text. If they ask you to file it (attach to a lead, log as a note, save as intake artifact), use the matching tool. Otherwise treat it as conversation context.

## Safety floor

These are the only things that should EVER stop you, and they come from the tools themselves not from your judgment:
- \`STOP_SIGNAL\` — lead has explicitly opted out (legal compliance).
- \`STATUS_WON\` / \`STATUS_LOST\` — deal is closed, don't re-engage.
- \`OWNERSHIP\` — only fires in multi-operator mode; in solo mode the gates are off.
Surface these honestly when they happen but don't pre-flinch.

Be fast. Be specific. Use real lead IDs and real status_ids and real workflow_ids in your reports. The operator can always click through to verify; don't make them re-ask.`;

const MAX_TOOL_ROUNDS = 6;

/**
 * Convert a Supabase message into the OpenAI Responses input message shape.
 * Attachments are packed alongside text as content blocks.
 */
function toResponsesMessage(msg: Pick<Message, "role" | "content" | "attachments">) {
  const role = msg.role === "system" ? "developer" : msg.role;
  const atts = msg.attachments ?? [];
  const hasAttachments = atts.length > 0;
  if (!hasAttachments) {
    return { role, content: msg.content };
  }
  // Mixed content: user text + images + extracted-document text. The model
  // sees images as vision inputs and document bodies as additional input_text
  // blocks (with a small framing line so it's clear which file they came from).
  const blocks: Array<Record<string, unknown>> = [];
  if (msg.content) {
    blocks.push({
      type: role === "assistant" ? "output_text" : "input_text",
      text: msg.content,
    });
  }
  if (role !== "assistant") {
    for (const att of atts) {
      if (att.type === "image") {
        blocks.push({ type: "input_image", image_url: att.data_url, detail: "auto" });
      } else if (att.type === "text") {
        const label = att.name ? `[file: ${att.name}]` : "[file]";
        blocks.push({
          type: "input_text",
          text: `${label}\n\n${att.text}`,
        });
      }
    }
  }
  return { role, content: blocks };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not set in .env.local" },
      { status: 400 }
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const userText = (body.input ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!userText && attachments.length === 0) {
    return NextResponse.json({ ok: false, error: "input or attachments required" }, { status: 400 });
  }

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // 1) Resolve thread (create if missing).
  let threadId = body.thread_id;
  let isNewThread = false;
  if (!threadId) {
    const t = await createThread(deriveTitle(userText || "New chat"));
    threadId = t.id;
    isNewThread = true;
  } else {
    const t = await getThread(threadId);
    if (!t) {
      return NextResponse.json({ ok: false, error: "thread not found" }, { status: 404 });
    }
  }

  // 2) Persist the user's message FIRST so it shows up even if the model errors.
  const userMessage = await addMessage({
    thread_id: threadId,
    role: "user",
    content: userText,
    attachments,
  });

  // 3) Pull full history and pack it for Responses input.
  const history = await listMessages(threadId);
  const responsesInput = history.map(toResponsesMessage);

  // 4) Fire OpenAI Responses with Close tools attached. Loop on tool_calls.
  let assistantText = "";
  let modelUsage: unknown = null;
  let modelError: string | null = null;
  const toolTrace: Array<{ name: string; ok: boolean; args: Record<string, unknown>; lead_id?: string; summary?: string }> = [];

  const traceId = randomUUID();
  let delegationsAuditLogged = false;

  const deepThink = Boolean(body.deep_think);

  try {
    // Mutable input that grows with each tool round.
    let runningInput: Array<unknown> = [...responsesInput];

    if (deepThink) {
      const started = (await client.responses.create({
        model: settings.model,
        input: runningInput as unknown as Parameters<typeof client.responses.create>[0]["input"],
        instructions: (body.instructions ?? DEFAULT_INSTRUCTIONS) + DEEP_THINK_SUFFIX,
        tools: [],
        store: true,
        background: true,
      } as Parameters<typeof client.responses.create>[0])) as { id: string; usage?: unknown };

      modelUsage = started.usage ?? null;
      const rid = started.id;
      const finalResp = await pollBackgroundResponse(client, rid, { maxWaitMs: 280_000 });
      if (finalResp.status === "queued" || finalResp.status === "in_progress") {
        modelError = `deep think still ${finalResp.status} after wait — copy response id ${rid} and retry, or turn off deep think.`;
      } else {
        assistantText = finalResp.output_text ?? "";
      }
    } else {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create({
        model: settings.model,
        // Cast: Responses input typing here is permissive at runtime; we pack
        // mixed message/function_call/function_call_output items by spec.
        input: runningInput as unknown as Parameters<typeof client.responses.create>[0]["input"],
        instructions: body.instructions ?? DEFAULT_INSTRUCTIONS,
        tools: CLOSE_TOOLS as unknown as Parameters<typeof client.responses.create>[0]["tools"],
      });

      modelUsage = response.usage ?? null;

      // Pull any function calls the model emitted in this round.
      const output = (response.output ?? []) as Array<{
        type: string;
        name?: string;
        arguments?: string;
        call_id?: string;
      }>;
      const toolCalls = output.filter((o) => o.type === "function_call");

      if (toolCalls.length === 0) {
        // No more tool calls — final assistant text is ready.
        assistantText = response.output_text ?? "";
        break;
      }

      // Append the model's output (the function_call items) to running input,
      // then append a function_call_output for each call.
      runningInput = [...runningInput, ...output];

      for (const call of toolCalls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        const result = await dispatchCloseTool(call.name ?? "", parsed);
        const ok = !(result && typeof result === "object" && "error" in (result as object));
        delegationsAuditLogged =
          logDelegationsToolCall({
            traceId,
            threadId: threadId!,
            round,
            name: call.name ?? "",
            args: parsed,
            result,
          }) || delegationsAuditLogged;
        // Try to surface a lead_id from either args or result so the UI can
        // pin a "currently in scope" lead pointer.
        let leadId: string | undefined;
        const argLead = (parsed as { lead_id?: unknown }).lead_id;
        if (typeof argLead === "string" && argLead.startsWith("lead_")) leadId = argLead;
        if (!leadId && ok && result && typeof result === "object") {
          const r = result as { id?: unknown; lead_id?: unknown };
          if (typeof r.id === "string" && r.id.startsWith("lead_")) leadId = r.id;
          else if (typeof r.lead_id === "string" && r.lead_id.startsWith("lead_")) leadId = r.lead_id;
        }
        // Capture a small JSON summary of the result so the UI can preview it
        // in the tool-panel modal without a separate fetch.
        let summary: string | undefined;
        try {
          const s = JSON.stringify(result);
          summary = s.length > 600 ? s.slice(0, 600) + "…" : s;
        } catch {
          /* unserializable — skip */
        }
        toolTrace.push({
          name: call.name ?? "(unknown)",
          ok,
          args: parsed,
          lead_id: leadId,
          summary,
        });
        runningInput.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result).slice(0, 100_000), // keep tool outputs bounded
        });
      }
      // Loop continues — the next responses.create() sees the tool results.
      }

      if (!assistantText) {
        assistantText = "(tool round cap reached without a final reply — try asking again)";
      }
    }
  } catch (err) {
    modelError = err instanceof Error ? err.message : String(err);
  }

  if (delegationsAuditLogged) {
    try {
      revalidatePath("/console");
      revalidatePath("/approvals");
    } catch {
      /* revalidate is best-effort from route handlers */
    }
  }

  // 5) Persist the assistant turn
  //     when the model used Close so the user can see what fired.
  // Persist tool trace as a fenced JSON block at the top of the message body.
  // ChatPanel parses this out and renders structured tool-call cards, then
  // markdown-renders whatever follows. Plain text falls back gracefully if a
  // future client doesn't know about the block.
  const trace =
    toolTrace.length > 0
      ? "```cmk:tools\n" +
        JSON.stringify(toolTrace) +
        "\n```\n\n" +
        "```cmk:trace\n" +
        traceId +
        "\n```\n\n"
      : "";
  const assistantMessage = await addMessage({
    thread_id: threadId,
    role: "assistant",
    content: modelError ? `error: ${modelError}` : (trace + (assistantText || "(empty response)")),
  });

  // 6) Bump the thread updated_at; if it was new and still default-titled, set the title.
  await touchThread(threadId, isNewThread ? { title: deriveTitle(userText) } : undefined);

  return NextResponse.json({
    ok: !modelError,
    thread_id: threadId,
    trace_id: toolTrace.length > 0 ? traceId : undefined,
    deep_think: deepThink,
    model: settings.model,
    durationMs: Date.now() - startedAt,
    user_message: userMessage,
    assistant_message: assistantMessage,
    usage: modelUsage,
    tools_used: toolTrace,
    error: modelError,
  });
}
