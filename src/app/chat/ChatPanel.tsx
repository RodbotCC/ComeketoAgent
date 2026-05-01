"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { icons } from "@/components/icons";

/* ============ TYPES ============ */

type Role = "user" | "assistant" | "system";

type Attachment = {
  type: "image";
  data_url: string;
  mime: string;
  name?: string;
};

type Message = {
  id: string;
  thread_id: string;
  role: Role;
  content: string;
  attachments: Attachment[];
  created_at: string;
};

type Thread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type PendingAttachment = Attachment & { localId: string };

/* ============ HELPERS ============ */

function newId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* ============ MARKDOWN RENDERER ============ */

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}

/* ============ MESSAGE RENDERERS ============ */

function UserMessage({ message }: { message: Message }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div className="chat-msg-user" style={{ maxWidth: "78%" }}>
        {message.attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: message.content ? 8 : 0 }}>
            {message.attachments.map((a, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={a.data_url}
                alt={a.name ?? "attachment"}
                style={{
                  maxWidth: 220,
                  maxHeight: 180,
                  borderRadius: 6,
                  border: "0.5px solid rgba(0,0,0,0.08)",
                  display: "block",
                }}
              />
            ))}
          </div>
        )}
        {message.content && <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="chat-msg-text">
      <MarkdownBody source={message.content} />
    </div>
  );
}

/* ============ DEMO TURNS (only when fresh thread, no messages) ============ */

function DemoEmptyState({ onSeed }: { onSeed: (text: string) => void }) {
  const seeds = [
    "Set up a 7-day pre-tasting cadence for a wedding on May 18.",
    "Draft a Slack message to the crew about Friday's recap.",
    "What automations do I have running this week?",
    "Look at this image and tell me what's in it.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 20px", color: "var(--ink-soft)" }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", fontStyle: "italic" }}>
        What are we composing today?
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 560 }}>
        {seeds.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSeed(s)}
            className="cmk-chip"
            style={{ fontFamily: "inherit" }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============ MAIN COMPONENT — full chat layout (rail + panel) ============ */

export function ChatLayout() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load threads on mount.
  useEffect(() => {
    void (async () => {
      setThreadsLoading(true);
      try {
        const res = await fetch("/api/threads", { cache: "no-store" });
        const data = await res.json();
        if (data.ok) {
          setThreads(data.threads as Thread[]);
          if (data.threads.length > 0 && !activeId) {
            setActiveId(data.threads[0].id);
          }
        }
      } finally {
        setThreadsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages whenever active thread changes.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/threads/${activeId}/messages`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setMessages(data.messages as Message[]);
    })();
  }, [activeId]);

  // Auto-scroll on message change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleNewThread() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setPending([]);
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const next: PendingAttachment[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const data_url = await fileToDataURL(f);
      next.push({ localId: newId(), type: "image", data_url, mime: f.type, name: f.name });
    }
    setPending((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePending(localId: string) {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && pending.length === 0) || loading) return;

    const optimisticUser: Message = {
      id: newId(),
      thread_id: activeId ?? "pending",
      role: "user",
      content: text,
      attachments: pending.map(({ localId: _l, ...a }) => a),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    const sentAttachments = pending.map(({ localId: _l, ...a }) => a);
    setPending([]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thread_id: activeId,
          input: text,
          attachments: sentAttachments,
        }),
      });
      const data = await res.json();

      if (data.ok || data.assistant_message) {
        // Replace optimistic with real persisted user + add assistant.
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optimisticUser.id);
          return [...without, data.user_message as Message, data.assistant_message as Message];
        });
        // If thread was newly created, add it to the rail and select it.
        if (data.thread_id && data.thread_id !== activeId) {
          setActiveId(data.thread_id);
          // Refresh threads list to capture the new title.
          void (async () => {
            const r = await fetch("/api/threads", { cache: "no-store" });
            const d = await r.json();
            if (d.ok) setThreads(d.threads as Thread[]);
          })();
        } else {
          // Bump the active thread to the top with new updated_at — refresh.
          void (async () => {
            const r = await fetch("/api/threads", { cache: "no-store" });
            const d = await r.json();
            if (d.ok) setThreads(d.threads as Thread[]);
          })();
        }
      } else {
        // Failure with no assistant message — show inline error.
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            thread_id: activeId ?? "pending",
            role: "assistant",
            content: `error: ${data.error ?? "unknown"}`,
            attachments: [],
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          thread_id: activeId ?? "pending",
          role: "assistant",
          content: `error: ${err instanceof Error ? err.message : String(err)}`,
          attachments: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const turnLabel = userTurnCount === 0 ? "new chat" : `${userTurnCount} turn${userTurnCount === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "210px 1fr",
        gap: 14,
        padding: "16px 22px",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* === LEFT RAIL === */}
      <aside className="cmk-panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="cmk-panel-head">
          <span className="cmk-eyebrow">Today</span>
          <button
            type="button"
            onClick={handleNewThread}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              border: "0.5px solid rgba(0,0,0,0.12)",
              borderRadius: 4,
              background: "#FAFAF7",
              color: "#6b6b66",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            + new
          </button>
        </div>

        <div className="cmk-scroll scroll-hide" style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {threadsLoading ? (
            <div className="cmk-rail-item dim">loading…</div>
          ) : threads.length === 0 && !activeId ? (
            <div className="cmk-rail-item dim">no threads yet</div>
          ) : (
            <>
              {!activeId && (
                <div className="cmk-rail-item active">
                  <span className="cmk-dot" style={{ background: "#6B8E5A" }} />
                  New chat (unsent)
                </div>
              )}
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={"cmk-rail-item" + (t.id === activeId ? " active" : "")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: t.id === activeId ? "rgba(0,0,0,0.04)" : "transparent",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 12.5,
                    color: t.id === activeId ? "#1a1a1a" : "#6b6b66",
                  }}
                >
                  <span
                    className="cmk-dot"
                    style={{
                      background: t.id === activeId ? "#6B8E5A" : "#9B8FB8",
                    }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {t.title}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* === CHAT PANEL === */}
      <section className="cmk-panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="cmk-panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="cmk-dot" style={{ background: "#6B8E5A" }} />
            <span className="cmk-eyebrow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeThread?.title ?? "New chat"}
            </span>
          </div>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "#9a9a93" }}>{turnLabel}</span>
        </div>

        {/* Message column */}
        <div
          ref={scrollRef}
          className="cmk-scroll scroll-hide"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.length === 0 && !loading ? (
            <DemoEmptyState onSeed={(s) => setInput(s)} />
          ) : (
            <>
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <UserMessage key={msg.id} message={msg} />
                ) : (
                  <AssistantMessage key={msg.id} message={msg} />
                )
              )}
              {loading && (
                <div className="chat-msg-text" style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                  thinking…
                </div>
              )}
            </>
          )}
        </div>

        {/* Pending attachments preview */}
        {pending.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 14px 0" }}>
            {pending.map((p) => (
              <div
                key={p.localId}
                style={{ position: "relative", display: "inline-block" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.data_url}
                  alt={p.name ?? ""}
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "0.5px solid rgba(0,0,0,0.12)",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removePending(p.localId)}
                  aria-label="Remove"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#1a1a1a",
                    color: "#FCFBF8",
                    border: "none",
                    fontSize: 10,
                    cursor: "pointer",
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form className="chat-input-bar" onSubmit={send}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFiles}
            />
            <button
              type="button"
              className="chat-input-add"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach image"
            >
              +
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Comeketo Agent. ⌘/Ctrl+Enter."
              disabled={loading}
              rows={1}
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--ink)",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: 0,
                fontFamily: "inherit",
                resize: "none",
                lineHeight: 1.5,
                maxHeight: 120,
              }}
            />
            <button
              type="submit"
              className="chat-input-send"
              aria-label="Send"
              disabled={loading || (!input.trim() && pending.length === 0)}
              style={{ opacity: !input.trim() && pending.length === 0 ? 0.4 : 1 }}
            >
              {icons.send}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
