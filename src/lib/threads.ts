import { getSupabaseServer } from "./supabase";

export type Role = "user" | "assistant" | "system";

/**
 * Attachment shape stored on a message. Supports two kinds today:
 *
 *  - `image`: inline data URL the model sees as a vision input.
 *  - `text`: extracted text body from a file the operator dropped (PDF/text/
 *    JSON/CSV/HTML stripped to plain text). Pulled from the intake pipeline
 *    (`/api/intake/upload` → `/api/intake/extract`). The model sees the
 *    content as input_text in the next turn.
 */
export type Attachment =
  | {
      type: "image";
      /** Data URL: "data:image/png;base64,...". */
      data_url: string;
      mime: string;
      name?: string;
    }
  | {
      type: "text";
      /** Plain-text body extracted from the file. Truncated upstream. */
      text: string;
      mime: string;
      name?: string;
      /** Supabase intake_artifacts row id, when produced by the intake pipeline. */
      artifact_id?: string;
    };

export type Thread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type Message = {
  id: string;
  thread_id: string;
  role: Role;
  content: string;
  attachments: Attachment[];
  created_at: string;
};

const TITLE_MAX = 80;

function deriveTitle(firstMessage: string): string {
  const trimmed = firstMessage.replace(/\s+/g, " ").trim();
  if (!trimmed) return "New chat";
  return trimmed.length > TITLE_MAX ? trimmed.slice(0, TITLE_MAX - 1) + "…" : trimmed;
}

/* ============ THREADS ============ */

export async function listThreads(): Promise<Thread[]> {
  const supa = getSupabaseServer();
  const { data, error } = await supa
    .from("threads")
    .select("*")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`listThreads: ${error.message}`);
  return (data ?? []) as Thread[];
}

export async function createThread(title?: string): Promise<Thread> {
  const supa = getSupabaseServer();
  const { data, error } = await supa
    .from("threads")
    .insert({ title: title?.slice(0, TITLE_MAX) || "New chat" })
    .select("*")
    .single();
  if (error) throw new Error(`createThread: ${error.message}`);
  return data as Thread;
}

export async function getThread(id: string): Promise<Thread | null> {
  const supa = getSupabaseServer();
  const { data, error } = await supa.from("threads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getThread: ${error.message}`);
  return (data as Thread) ?? null;
}

export async function touchThread(id: string, partial?: { title?: string }): Promise<void> {
  const supa = getSupabaseServer();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (partial?.title) update.title = partial.title.slice(0, TITLE_MAX);
  const { error } = await supa.from("threads").update(update).eq("id", id);
  if (error) throw new Error(`touchThread: ${error.message}`);
}

export async function archiveThread(id: string): Promise<void> {
  const supa = getSupabaseServer();
  const { error } = await supa
    .from("threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`archiveThread: ${error.message}`);
}

export async function unarchiveThread(id: string): Promise<void> {
  const supa = getSupabaseServer();
  const { error } = await supa
    .from("threads")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw new Error(`unarchiveThread: ${error.message}`);
}

export async function renameThread(id: string, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, TITLE_MAX);
  if (!trimmed) throw new Error("renameThread: title required");
  const supa = getSupabaseServer();
  const { error } = await supa.from("threads").update({ title: trimmed }).eq("id", id);
  if (error) throw new Error(`renameThread: ${error.message}`);
}

export async function deleteThread(id: string): Promise<void> {
  const supa = getSupabaseServer();
  const { error: msgErr } = await supa.from("messages").delete().eq("thread_id", id);
  if (msgErr) throw new Error(`deleteThread (messages): ${msgErr.message}`);
  const { error } = await supa.from("threads").delete().eq("id", id);
  if (error) throw new Error(`deleteThread: ${error.message}`);
}

/* ============ MESSAGES ============ */

export async function listMessages(threadId: string): Promise<Message[]> {
  const supa = getSupabaseServer();
  const { data, error } = await supa
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMessages: ${error.message}`);
  return (data ?? []) as Message[];
}

export async function addMessage(args: {
  thread_id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
}): Promise<Message> {
  const supa = getSupabaseServer();
  const { data, error } = await supa
    .from("messages")
    .insert({
      thread_id: args.thread_id,
      role: args.role,
      content: args.content,
      attachments: args.attachments ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(`addMessage: ${error.message}`);
  return data as Message;
}

/* ============ HELPERS ============ */

export { deriveTitle };
