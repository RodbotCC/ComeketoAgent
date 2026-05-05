"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AutomationCanvas, type Workflow } from "@/components/AutomationCanvas";
import type { AutomationDraftRow } from "@/lib/automation-drafts";
import {
  publishWorkflowDraftAction,
  renameWorkflowDraftAction,
  deleteWorkflowDraftAction,
} from "./actions";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: string;
};

type Props = {
  draft: AutomationDraftRow;
};

const STARTER_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "5-touch revival",
    prompt:
      "Build me a 5-touch revival sequence for stale wedding leads. Start with a soft check-in SMS, then a value email two days later, then a phone task four days after, then a final email a week later.",
  },
  {
    label: "Post-tasting follow-up",
    prompt:
      "Build a post-tasting follow-up workflow: thank-you email same day, then a soft scheduling SMS three days later if they go quiet, then a phone task day 7.",
  },
  {
    label: "Cold ghosted lead",
    prompt:
      "Build a cold ghosted lead recovery — three touches over two weeks. Final touch should give them a clear out so we can close the loop either way.",
  },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function WorkflowAuthor({ draft }: Props) {
  const router = useRouter();
  const [name, setName] = useState(draft.name);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        ts: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setBusy(true);

      const history = messages.map((m) => ({
        role: m.role === "system" ? "assistant" : (m.role as "user" | "assistant"),
        content: m.content,
      }));

      try {
        const res = await fetch("/api/workflows/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draft_id: draft.id,
            input: trimmed,
            history,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          output?: string;
          error?: string;
          tools_used?: Array<{ name: string; ok: boolean; summary?: string }>;
        };
        if (!res.ok || !j.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "system",
              content: `Error: ${j.error || `request failed (${res.status})`}`,
              ts: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: j.output || "(no response)",
              ts: new Date().toISOString(),
            },
          ]);
          // Refresh server data so canvas re-renders from the updated draft.
          startTransition(() => router.refresh());
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "system",
            content: `Network error: ${err instanceof Error ? err.message : String(err)}`,
            ts: new Date().toISOString(),
          },
        ]);
      } finally {
        setBusy(false);
        setTimeout(() => taRef.current?.focus(), 50);
      }
    },
    [busy, draft.id, messages, router]
  );

  const handlePublish = async () => {
    setPublishMsg("Publishing…");
    const result = await publishWorkflowDraftAction(draft.id);
    if (!result.ok) {
      setPublishMsg(`Publish failed — ${result.error}`);
      return;
    }
    setPublishMsg(
      `Published to Close (sequence ${result.sequence_id.slice(0, 12)}…)${
        result.html_url ? " · open in Close ↗" : ""
      }`
    );
    if (result.html_url) {
      window.open(result.html_url, "_blank", "noopener,noreferrer");
    }
    startTransition(() => router.refresh());
  };

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === draft.name) return;
    const fd = new FormData();
    fd.set("draft_id", draft.id);
    fd.set("name", trimmed);
    await renameWorkflowDraftAction(fd);
    startTransition(() => router.refresh());
  };

  const handleDelete = async () => {
    if (!confirm("Delete this draft? This can't be undone.")) return;
    const fd = new FormData();
    fd.set("draft_id", draft.id);
    await deleteWorkflowDraftAction(fd);
    // Action redirects on success; no need to handle locally.
  };

  const wf: Workflow = draft.workflow_json;
  const isEmpty = wf.nodes.length === 0;
  const isPublished = !!draft.close_sequence_id;

  return (
    <div className="cmk-workflow-author">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="cmk-wfa-header">
        <input
          className="cmk-wfa-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Workflow name"
        />
        <span className={`cmk-wfa-status cmk-wfa-status-${draft.status}`}>{draft.status}</span>
        {isPublished && (
          <span className="cmk-wfa-published-pill" title={`Close sequence ${draft.close_sequence_id}`}>
            Published in Close
          </span>
        )}
        <div className="cmk-wfa-header-spacer" />
        <button
          type="button"
          onClick={handlePublish}
          className="plan-btn plan-btn-primary"
          disabled={isEmpty || busy}
          title={isEmpty ? "Add at least one step before publishing" : "Publish to Close"}
        >
          {isPublished ? "Re-publish" : "Publish to Close"}
        </button>
        <button type="button" onClick={handleDelete} className="cmk-wfa-delete-btn" aria-label="Delete draft">
          ×
        </button>
      </header>
      {publishMsg && <div className="cmk-wfa-publish-msg">{publishMsg}</div>}

      <div className="cmk-wfa-body">
        {/* ── Chat composer (left) ───────────────────────────────────── */}
        <section className="cmk-wfa-chat">
          <div className="cmk-wfa-chat-scroll scroll-hide">
            {messages.length === 0 && (
              <div className="cmk-wfa-chat-empty">
                <p>Tell me what kind of workflow you want.</p>
                <div className="cmk-wfa-starters">
                  {STARTER_PROMPTS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="cmk-wfa-starter"
                      onClick={() => send(s.prompt)}
                      disabled={busy}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`cmk-wfa-msg cmk-wfa-msg-${m.role}`}>
                <div className="cmk-wfa-msg-meta">
                  <span>{m.role === "user" ? "you" : m.role === "assistant" ? "agent" : "system"}</span>
                  <time dateTime={m.ts}>{fmtTime(m.ts)}</time>
                </div>
                <div className="cmk-wfa-msg-body">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="cmk-wfa-msg cmk-wfa-msg-assistant cmk-wfa-msg-loading">
                <div className="cmk-wfa-msg-meta">
                  <span>agent</span>
                </div>
                <div className="cmk-wfa-msg-body">building…</div>
              </div>
            )}
          </div>

          <form
            className="cmk-wfa-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={taRef}
              className="cmk-wfa-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={
                isEmpty
                  ? "What kind of workflow do you want? e.g. 'a 4-touch tasting follow-up'"
                  : "Refine the workflow — 'make the second touch SMS', 'add a 3-day wait', 'rewrite the second email warmer'…"
              }
              rows={3}
              disabled={busy}
            />
            <button type="submit" className="plan-btn plan-btn-primary" disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>

        {/* ── Live graph (right) ────────────────────────────────────── */}
        <section className="cmk-wfa-graph">
          {isEmpty ? (
            <div className="cmk-wfa-graph-empty">
              <p>Tell the AI what kind of workflow you want.</p>
              <p className="cmk-wfa-graph-empty-sub">
                The graph will build itself here as you describe it.
              </p>
            </div>
          ) : (
            <AutomationCanvas workflow={wf} readOnly externalInspector />
          )}
        </section>
      </div>
    </div>
  );
}
