import { getSupabaseServer } from "./supabase";

export type Role = "user" | "assistant" | "system";

export type Attachment = {
  /** "image" for now; future: "file", "audio". */
  type: "image";
  /** Data URL: "data:image/png;base64,...". Client encodes; server stores as-is. */
  data_url: string;
  mime: string;
  /** Optional file name for display. */
  name?: string;
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
