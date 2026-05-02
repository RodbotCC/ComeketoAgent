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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  thread_id?: string;
  input: string;
  attachments?: Attachment[];
  instructions?: string;
};

const DEFAULT_INSTRUCTIONS =
  "You are Comeketo Agent — an automation assistant for catering operators. Be terse, grounded, useful. " +
  "Format your replies in markdown when structure helps (lists, code, headers). " +
  "When a user attaches an image, describe what you see plainly and answer their question. " +
  "When a user attaches a document (`[file: name]` blocks), the body is the extracted plain text " +
  "of a file they dropped — read it carefully and answer their question against it. If they ask " +
  "you to file it somewhere (e.g. attach to a Close lead, save as an intake artifact), use the " +
  "matching tool. Otherwise treat it as context for the conversation. " +
  "You have direct access to the user's Close CRM via tools (read/write patterns: list and search leads, full Box, threads, activities, subscriptions, workflows, templates, phones, statuses, webhooks, lead update, task, draft email/SMS activity, create lead, sequence create/update, " +
  "close_list_workflows, close_get_workflow, close_search_leads, close_list_leads, close_list_leads_by_assignee, close_list_leads_by_status_id, " +
  "close_get_lead, close_get_lead_full, close_list_email_threads, close_list_activities, close_list_sequence_subscriptions, " +
  "close_list_email_templates, close_list_sms_templates, close_list_lead_statuses, close_list_phone_numbers, close_list_webhook_subscriptions, " +
  "close_get_sequence_subscription, close_update_sequence_subscription, generate_seven_day_plan, " +
  "close_enroll_in_workflow, close_create_opportunity, close_update_lead, close_create_task, close_log_email_activity, close_log_sms_activity, " +
  "close_log_internal_note, close_create_lead, close_create_sequence, close_update_sequence). " +
  "Prefer fetching live data over guessing. Use close_get_lead_full when discussing a specific lead's " +
  "history or next move (one call gets the full Box). Use generate_seven_day_plan when the user asks " +
  "for a plan, multi-day cadence, or what to do with a lead over the next days (optional horizon_days 1–180; default from Settings). " +
  "Before any write action (enroll, create_opportunity, update_lead, create_task, log_email_activity, log_sms_activity, " +
  "update_sequence_subscription, log_internal_note, create_lead, create_sequence, update_sequence), show the user what you're about to do and " +
  "wait for confirmation in a follow-up turn. Per Guardrails: only Andre-owned, non-Won/Lost leads " +
  "are eligible for outbound; the tools enforce this and will return skip_code='OWNERSHIP' or " +
  "'STATUS_WON'/'STATUS_LOST' if violated. Surface skip codes plainly to the user.";

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

  try {
    // Mutable input that grows with each tool round.
    let runningInput: Array<unknown> = [...responsesInput];

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
      // Hit the round cap without a final message.
      assistantText = "(tool round cap reached without a final reply — try asking again)";
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
    model: settings.model,
    durationMs: Date.now() - startedAt,
    user_message: userMessage,
    assistant_message: assistantMessage,
    usage: modelUsage,
    tools_used: toolTrace,
    error: modelError,
  });
}
