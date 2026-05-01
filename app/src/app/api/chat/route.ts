import { NextResponse } from "next/server";
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
  "When you propose an automation, structure it as: trigger, writes, guard.";

/**
 * Convert a Supabase message into the OpenAI Responses input message shape.
 * Attachments are packed alongside text as content blocks.
 */
function toResponsesMessage(msg: Pick<Message, "role" | "content" | "attachments">) {
  const role = msg.role === "system" ? "developer" : msg.role;
  const hasImages = (msg.attachments ?? []).some((a) => a.type === "image");
  if (!hasImages) {
    return { role, content: msg.content };
  }
  // Mixed content: text + images.
  const blocks: Array<Record<string, unknown>> = [];
  if (msg.content) {
    blocks.push({
      type: role === "assistant" ? "output_text" : "input_text",
      text: msg.content,
    });
  }
  for (const att of msg.attachments) {
    if (att.type === "image" && role !== "assistant") {
      blocks.push({ type: "input_image", image_url: att.data_url, detail: "auto" });
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

  // 4) Fire OpenAI Responses (NOT chat completions).
  let assistantText = "";
  let modelUsage: unknown = null;
  let modelError: string | null = null;
  try {
    const response = await client.responses.create({
      model: settings.model,
      input: responsesInput as unknown as Parameters<typeof client.responses.create>[0]["input"],
      instructions: body.instructions ?? DEFAULT_INSTRUCTIONS,
    });
    assistantText = response.output_text ?? "";
    modelUsage = response.usage ?? null;
  } catch (err) {
    modelError = err instanceof Error ? err.message : String(err);
  }

  // 5) Persist the assistant turn (or the error) so the thread is consistent.
  const assistantMessage = await addMessage({
    thread_id: threadId,
    role: "assistant",
    content: modelError ? `error: ${modelError}` : (assistantText || "(empty response)"),
  });

  // 6) Bump the thread updated_at; if it was new and still default-titled, set the title.
  await touchThread(threadId, isNewThread ? { title: deriveTitle(userText) } : undefined);

  return NextResponse.json({
    ok: !modelError,
    thread_id: threadId,
    model: settings.model,
    durationMs: Date.now() - startedAt,
    user_message: userMessage,
    assistant_message: assistantMessage,
    usage: modelUsage,
    error: modelError,
  });
}
