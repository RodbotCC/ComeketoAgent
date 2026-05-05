"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AutomationCanvas, type Workflow } from "@/components/AutomationCanvas";
import { icons } from "@/components/icons";
import type { AutomationDraftRow } from "@/lib/automation-drafts";
import {
  publishWorkflowDraftAction,
  renameWorkflowDraftAction,
  deleteWorkflowDraftAction,
} from "./actions";

type OperatorQuestion = {
  question: string;
  choices: string[];
  allow_freeform: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: string;
  /** When set, this assistant message renders a multi-choice question card. */
  question?: OperatorQuestion;
  /** Once the operator answered, chips disable. */
  answered?: boolean;
};

type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  template: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "branded",
    label: "/branded",
    hint: "Add a branded HTML email with sections",
    template: "Add a branded HTML email — multi-section, structured headings, our voice. ",
  },
  {
    id: "timeline",
    label: "/timeline",
    hint: "Date-anchored countdown email (Rhonna shape)",
    template:
      "Add a date-anchored timeline email like Rhonna's pre-event countdown — bold date headers, soft sign-off. ",
  },
  {
    id: "html",
    label: "/html",
    hint: "Add a structured HTML body to the next email step",
    template: "The next email step should have a structured HTML body. ",
  },
  {
    id: "sms",
    label: "/sms",
    hint: "Add an SMS touch",
    template: "Add an SMS touch — short, NEPQ voice, day ",
  },
  {
    id: "wait",
    label: "/wait",
    hint: "Insert a wait step",
    template: "Insert a wait of N days before the next step. ",
  },
  {
    id: "task",
    label: "/task",
    hint: "Add a phone-call task",
    template: "Add a phone-call task on day ",
  },
  {
    id: "rewrite",
    label: "/rewrite",
    hint: "Rewrite a specific step",
    template: "Rewrite step N — ",
  },
  {
    id: "help",
    label: "/help",
    hint: "What can the AI build?",
    template: "What kinds of workflows can you build? Give me 3 examples I could ask for.",
  },
];

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
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const slashMatches = useMemo(() => {
    if (!slashOpen) return [];
    const q = input.trim().toLowerCase();
    if (!q.startsWith("/")) return [];
    const term = q.slice(1);
    return SLASH_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(term) || c.hint.toLowerCase().includes(term)
    );
  }, [input, slashOpen]);

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
      setSlashOpen(false);
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
          operator_question?: OperatorQuestion | null;
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
        } else if (j.operator_question) {
          setMessages((prev) => [
            ...prev,
            {
              id: `q-${Date.now()}`,
              role: "assistant",
              content: j.output || "",
              question: j.operator_question || undefined,
              ts: new Date().toISOString(),
            },
          ]);
          startTransition(() => router.refresh());
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

  const handleAnswerChoice = useCallback(
    (msgId: string, choice: string) => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, answered: true } : m)));
      void send(choice);
    },
    [send]
  );

  const handleAnswerFreeform = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, answered: true } : m)));
    setTimeout(() => taRef.current?.focus(), 30);
  }, []);

  const runSlashCommand = useCallback((cmd: SlashCommand) => {
    setInput(cmd.template);
    setSlashOpen(false);
    setSlashIndex(0);
    setTimeout(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(cmd.template.length, cmd.template.length);
      }
    }, 0);
  }, []);

  const onInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        runSlashCommand(slashMatches[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

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
          <div className="cmk-wfa-chat-head">
            <span className="cmk-wfa-chat-head-eyebrow">
              WORKFLOW · {isPublished ? "PUBLISHED" : "DRAFT"}
            </span>
            <span className="cmk-wfa-chat-head-eyebrow" aria-hidden="true">
              {wf.nodes.length} {wf.nodes.length === 1 ? "STEP" : "STEPS"}
            </span>
          </div>
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
                {m.content && <div className="cmk-wfa-msg-body">{m.content}</div>}
                {m.question && (
                  <div className="cmk-wfa-q">
                    <p className="cmk-wfa-q-question">{m.question.question}</p>
                    <div className="cmk-wfa-q-choices">
                      {m.question.choices.map((c, i) => (
                        <button
                          key={`${m.id}-c-${i}`}
                          type="button"
                          className="cmk-wfa-q-chip"
                          onClick={() => handleAnswerChoice(m.id, c)}
                          disabled={busy || m.answered}
                        >
                          {c}
                        </button>
                      ))}
                      {m.question.allow_freeform && (
                        <button
                          type="button"
                          className="cmk-wfa-q-chip cmk-wfa-q-chip-freeform"
                          onClick={() => handleAnswerFreeform(m.id)}
                          disabled={busy || m.answered}
                        >
                          Type my own answer →
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
            {slashOpen && slashMatches.length > 0 && (
              <div className="cmk-wfa-slash-palette" role="listbox" aria-label="Slash commands">
                {slashMatches.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    type="button"
                    role="option"
                    aria-selected={i === slashIndex}
                    className={`cmk-wfa-slash-row${i === slashIndex ? " active" : ""}`}
                    onMouseEnter={() => setSlashIndex(i)}
                    onClick={() => runSlashCommand(cmd)}
                  >
                    <span className="cmk-wfa-slash-key">{cmd.label}</span>
                    <span className="cmk-wfa-slash-hint">{cmd.hint}</span>
                  </button>
                ))}
                <div className="cmk-wfa-slash-foot">
                  <kbd>↑↓</kbd> select <kbd>↵</kbd> run <kbd>esc</kbd> dismiss
                </div>
              </div>
            )}
            <div className="cmk-wfa-composer-pill">
              <button
                type="button"
                className="cmk-wfa-composer-add"
                onClick={() => {
                  setInput((v) => (v.startsWith("/") ? v : "/"));
                  setSlashOpen(true);
                  setSlashIndex(0);
                  setTimeout(() => taRef.current?.focus(), 0);
                }}
                aria-label="Slash commands"
                title="Type / for commands"
                disabled={busy}
              >
                +
              </button>
              <textarea
                ref={taRef}
                className="cmk-wfa-composer-input"
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={
                  isEmpty
                    ? "Tell me what to build. Type / for commands · Enter to send"
                    : "Refine — 'make the second touch SMS', /branded, /timeline · Enter to send"
                }
                rows={1}
                disabled={busy}
              />
              <button
                type="submit"
                className="cmk-wfa-composer-send"
                disabled={busy || !input.trim()}
                aria-label="Send"
              >
                {icons.send}
              </button>
            </div>
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
