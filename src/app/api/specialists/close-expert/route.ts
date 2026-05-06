import { NextResponse } from "next/server";
import { askCloseExpert } from "@/lib/specialists/close-expert";
import {
  addMessage,
  createThread,
  deriveTitle,
  getThread,
  touchThread,
  type Message,
} from "@/lib/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Req = {
  thread_id?: string | null;
  input?: string;
  conversation?: Array<Pick<Message, "role" | "content" | "created_at">>;
};

function conversationContext(messages: Req["conversation"]): string {
  return (messages ?? [])
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()} (${m.created_at ?? ""}):\n${String(m.content || "").slice(0, 1200)}`)
    .join("\n\n---\n\n");
}

export async function POST(req: Request) {
  let body: Req;
  try {
    body = (await req.json()) as Req;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const input = String(body.input || "").trim();
  if (!input) {
    return NextResponse.json({ ok: false, error: "input required" }, { status: 400 });
  }

  try {
    let thread =
      body.thread_id && (await getThread(body.thread_id))
        ? await getThread(body.thread_id)
        : null;
    if (!thread) thread = await createThread(deriveTitle(`/close-expert ${input}`));

    const userMessage = await addMessage({
      thread_id: thread.id,
      role: "user",
      content: `/close-expert ${input}`,
      attachments: [],
    });

    const result = await askCloseExpert({
      question: input,
      conversationContext: conversationContext(body.conversation),
    });

    const sourceLines = result.sources
      .slice(0, 6)
      .map((s) => `- ${s.url ? `[${s.title}](${s.url})` : s.title}${s.topic ? ` (${s.topic})` : ""}`)
      .join("\n");

    const assistantContent = [
      "## Close Expert",
      "",
      result.answer,
      "",
      result.routed_topics.length ? ` _Routed topics: ${result.routed_topics.slice(0, 6).join(", ")}_` : "",
      sourceLines ? "\n### Sources\n" + sourceLines : "",
      "",
      "---",
      "",
      "_Comeketo Agent: I pulled in the Close specialist for this. Ask a tighter follow-up or tell me what you want wired into the app from this answer._",
    ].filter(Boolean).join("\n");

    const assistantMessage = await addMessage({
      thread_id: thread.id,
      role: "assistant",
      content: assistantContent,
      attachments: [],
    });

    await touchThread(thread.id);

    return NextResponse.json({
      ok: true,
      thread_id: thread.id,
      user_message: userMessage,
      assistant_message: assistantMessage,
      specialist: {
        id: "close-expert",
        routed_topics: result.routed_topics,
        sources: result.sources,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

