"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { icons } from "@/components/icons";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

/* ============ TYPES ============ */

type Role = "user" | "assistant" | "system";

type Attachment =
  | { type: "image"; data_url: string; mime: string; name?: string }
  | { type: "text"; text: string; mime: string; name?: string; artifact_id?: string };

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

type ToolCall = {
  name: string;
  ok: boolean;
  args: Record<string, unknown>;
  lead_id?: string;
  summary?: string;
};

type PaneMode = "hidden" | "normal" | "wide";

type ChatLayout = {
  rail: PaneMode;
  scope: PaneMode;
};

const DEFAULT_LAYOUT: ChatLayout = { rail: "normal", scope: "normal" };
const LAYOUT_KEY = "cmk-chat-layout-v1";

/* ============ PINBOARD ============
   The right In-Scope dock is a stack of pinned widgets — Andre's active work
   surface. Each pin is a snapshot; we don't refetch on render, so closing
   chat and reopening still shows what was pinned. */

type PinKind = "lead" | "plan-day" | "plan" | "tool-result";

type PinSnapshot = {
  /** Optional Close lead id this pin belongs to — drives the "Open Box" link. */
  lead_id?: string;
  /** Lead display name (when applicable) — shown as the pin headline. */
  display_name?: string;
  /** Lead status_label (when applicable). */
  status_label?: string;
  /** Tool name for tool-result kind. */
  tool_name?: string;
  /** Truncated JSON summary for tool-result kind. */
  summary_text?: string;
  /** Optional structured day snapshot for plan-day kind. */
  day?: { day_number: number; objective: string; approval_status: string };
  /** Plan id for plan / plan-day kinds. */
  plan_id?: string;
};

type Pin = {
  id: string;
  kind: PinKind;
  label: string;
  sublabel?: string;
  added_at: string;
  collapsed: boolean;
  data: PinSnapshot;
};

const PINBOARD_KEY = "cmk-pinboard-v1";
const PINBOARD_MAX = 12;

function usePinboard() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PINBOARD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Pin[];
        if (Array.isArray(parsed)) setPins(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PINBOARD_KEY, JSON.stringify(pins));
    } catch {
      /* ignore */
    }
  }, [pins, hydrated]);

  const addPin = useCallback((pin: Omit<Pin, "id" | "added_at" | "collapsed"> & { collapsed?: boolean }) => {
    setPins((prev) => {
      // Dedup: if a pin with same kind + same key field exists, replace it (refresh snapshot).
      const matchKey = pin.data.lead_id ?? pin.data.tool_name ?? pin.label;
      const existing = prev.findIndex(
        (p) => p.kind === pin.kind && (p.data.lead_id ?? p.data.tool_name ?? p.label) === matchKey
      );
      const fresh: Pin = {
        id: newId(),
        added_at: new Date().toISOString(),
        collapsed: pin.collapsed ?? false,
        ...pin,
      };
      let next = existing >= 0 ? [...prev.slice(0, existing), fresh, ...prev.slice(existing + 1)] : [fresh, ...prev];
      if (next.length > PINBOARD_MAX) next = next.slice(0, PINBOARD_MAX);
      return next;
    });
  }, []);

  const removePin = useCallback((id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, collapsed: !p.collapsed } : p)));
  }, []);

  const clearPins = useCallback(() => setPins([]), []);

  return { pins, addPin, removePin, togglePin, clearPins };
}

/** Context exposes addPin to nested components (tool panels, modals). */
type PinboardCtx = {
  addPin: ReturnType<typeof usePinboard>["addPin"];
};
const PinboardContext = createContext<PinboardCtx | null>(null);
function usePinboardCtx(): PinboardCtx {
  const ctx = useContext(PinboardContext);
  if (!ctx) return { addPin: () => undefined };
  return ctx;
}

/* ============ QUICK DELEGATIONS ============ */

type QuickDelegation = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  tone: "sage" | "lavender" | "peach" | "lemon" | "sky";
};

const QUICK_DELEGATIONS: QuickDelegation[] = [
  {
    id: "today-andre",
    label: "Today's Andre leads",
    hint: "Plan + sweep",
    tone: "sage",
    prompt:
      "List my Andre-owned leads (status not Won/Lost). For the top 5 by recency, " +
      "tell me what state each is in (last activity, next move, any blockers). Be terse.",
  },
  {
    id: "heartbeat",
    label: "Run heartbeat sweep",
    hint: "Audit, no send",
    tone: "lavender",
    prompt:
      "Walk every active Andre plan and give me a heartbeat audit: which actions would fire today, " +
      "which are skip-coded and why. Don't fire anything — draft mode summary only.",
  },
  {
    id: "needs-touch",
    label: "Find leads needing a touch",
    hint: "Cold or stale",
    tone: "peach",
    prompt:
      "Find Andre's leads where the last outbound was 4+ days ago, or last inbound is unreplied. " +
      "Suggest a single sharp NEPQ-voice next move per lead.",
  },
  {
    id: "draft-tasting",
    label: "Draft tasting follow-ups",
    hint: "NEPQ voice",
    tone: "lemon",
    prompt:
      "For Andre's leads with an upcoming tasting on the calendar, draft a one-line confirmation " +
      "follow-up in NEPQ voice. No fake warmth. Show me the drafts before doing anything.",
  },
  {
    id: "snapshot",
    label: "What changed in Close",
    hint: "Recent activity",
    tone: "sky",
    prompt:
      "Show me what's changed in Close in the last 24h on Andre's leads — replies, status moves, " +
      "stop signals, new opportunities. Cluster by lead.",
  },
];

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

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  const s = Math.floor(delta / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

function useCopy() {
  const { push } = useToast();
  return useCallback(
    (text: string, label = "Copied") => {
      void copyToClipboard(text).then((ok) => {
        push(ok ? label : "Copy failed", { tone: ok ? "success" : "error" });
      });
    },
    [push]
  );
}

const TOOL_BLOCK = /^```cmk:tools\n([\s\S]*?)\n```\n\n?/;
const TRACE_BLOCK =
  /^```cmk:trace\n([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n```\n\n?/i;

function parseToolTrace(content: string): { calls: ToolCall[]; rest: string } {
  const m = content.match(TOOL_BLOCK);
  if (!m) return { calls: [], rest: content };
  try {
    const calls = JSON.parse(m[1]) as ToolCall[];
    return { calls, rest: content.slice(m[0].length) };
  } catch {
    return { calls: [], rest: content };
  }
}

function parseAssistantPayload(content: string): { calls: ToolCall[]; traceId: string | null; rest: string } {
  const { calls, rest: afterTools } = parseToolTrace(content);
  const tm = afterTools.match(TRACE_BLOCK);
  if (tm) {
    return { calls, traceId: tm[1], rest: afterTools.slice(tm[0].length) };
  }
  return { calls, traceId: null, rest: afterTools };
}

/* ============ TOOL CATEGORIZATION ============ */

type ToolCategory = "read" | "list" | "generate" | "write";

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  close_get_lead: "read",
  close_get_lead_full: "read",
  close_get_workflow: "read",
  close_get_sequence_subscription: "read",
  close_search_leads: "read",
  close_list_workflows: "list",
  close_list_email_templates: "list",
  close_list_sms_templates: "list",
  close_list_lead_statuses: "list",
  close_list_phone_numbers: "list",
  generate_seven_day_plan: "generate",
  close_enroll_in_workflow: "write",
  close_create_opportunity: "write",
  close_update_sequence_subscription: "write",
  close_log_internal_note: "write",
};

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  read: "Read",
  list: "Survey",
  generate: "Generate",
  write: "Write",
};

const CATEGORY_GLYPH: Record<ToolCategory, string> = {
  read: "◉",
  list: "▤",
  generate: "✦",
  write: "↗",
};

function categoryOf(name: string): ToolCategory {
  return TOOL_CATEGORY[name] ?? "read";
}

function toolHeadline(call: ToolCall): string {
  const a = call.args ?? {};
  switch (call.name) {
    case "close_get_lead":
    case "close_get_lead_full":
      return `Lead ${typeof a.lead_id === "string" ? a.lead_id.slice(0, 14) + "…" : ""}`;
    case "close_search_leads":
      return `Search · "${typeof a.query === "string" ? a.query : ""}"`;
    case "close_list_workflows":
      return "Workflows";
    case "close_get_workflow":
      return `Workflow ${typeof a.workflow_id === "string" ? a.workflow_id.slice(0, 12) + "…" : ""}`;
    case "close_list_email_templates":
      return "Email templates";
    case "close_list_sms_templates":
      return "SMS templates";
    case "close_list_lead_statuses":
      return "Lead statuses";
    case "close_list_phone_numbers":
      return "Phone numbers";
    case "close_get_sequence_subscription":
      return `Subscription ${typeof a.subscription_id === "string" ? a.subscription_id.slice(0, 12) + "…" : ""}`;
    case "generate_seven_day_plan":
      return `7-day plan · ${typeof a.lead_id === "string" ? a.lead_id.slice(0, 12) + "…" : "lead"}`;
    case "close_enroll_in_workflow":
      return "Enroll lead in workflow";
    case "close_create_opportunity":
      return "Create opportunity";
    case "close_update_sequence_subscription":
      return "Update subscription";
    case "close_log_internal_note":
      return "Internal note";
    default:
      return call.name.replace(/^close_/, "").replace(/_/g, " ");
  }
}

/* ============ LEAD MENTION CHIPS ============ */

const LEAD_ID_RE = /(lead_[A-Za-z0-9]{16,})/g;

function LeadChip({ id }: { id: string }) {
  return (
    <Link href={`/lead/${id}`} className="cmk-lead-chip" title={id}>
      ◉ {id.slice(0, 8)}…{id.slice(-4)}
    </Link>
  );
}

function linkifyLeadIds(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LEAD_ID_RE.lastIndex = 0;
  while ((m = LEAD_ID_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<LeadChip key={`${m.index}-${m[1]}`} id={m[1]} />);
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownText({ children }: { children?: ReactNode }) {
  const out: ReactNode[] = [];
  function walk(node: ReactNode, key: string) {
    if (typeof node === "string") {
      const linked = linkifyLeadIds(node);
      linked.forEach((n, i) => out.push(typeof n === "string" ? <span key={`${key}-${i}`}>{n}</span> : n));
    } else if (Array.isArray(node)) {
      node.forEach((c, i) => walk(c, `${key}-${i}`));
    } else if (node !== null && node !== undefined) {
      out.push(<span key={key}>{node}</span>);
    }
  }
  walk(children, "k");
  return <>{out}</>;
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const copy = useCopy();
  // Pull the raw text from any nested <code> child.
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="md-pre-wrap">
      <button
        type="button"
        className="md-pre-copy"
        onClick={() => copy(ref.current?.innerText ?? "", "Code copied")}
        aria-label="Copy code"
        title="Copy"
      >
        ⎘
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p><MarkdownText>{children}</MarkdownText></p>,
          li: ({ children }) => <li><MarkdownText>{children}</MarkdownText></li>,
          td: ({ children }) => <td><MarkdownText>{children}</MarkdownText></td>,
          th: ({ children }) => <th><MarkdownText>{children}</MarkdownText></th>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/* ============ TOOL PANEL ============ */

function pinFromCall(call: ToolCall): Pin | null {
  // Convert a known tool call into a structured pin. Returns null for kinds
  // that don't make sense to pin (lists, surveys without lead context).
  const parsed = parseToolResult(call);
  const str = (k: string): string | undefined => {
    const v = parsed?.[k];
    return typeof v === "string" ? v : undefined;
  };
  if (call.name === "close_get_lead_full" || call.name === "close_get_lead") {
    if (!call.lead_id) return null;
    return {
      id: "",
      kind: "lead",
      label: str("display_name") || str("name") || call.lead_id,
      sublabel: str("status_label"),
      added_at: "",
      collapsed: false,
      data: {
        lead_id: call.lead_id,
        display_name: str("display_name") || str("name"),
        status_label: str("status_label"),
      },
    };
  }
  if (call.name === "generate_seven_day_plan") {
    if (!call.lead_id) return null;
    return {
      id: "",
      kind: "plan",
      label: `7-day plan`,
      sublabel: str("primary_goal") || `lead ${call.lead_id.slice(0, 12)}…`,
      added_at: "",
      collapsed: false,
      data: { lead_id: call.lead_id, plan_id: str("plan_id") },
    };
  }
  // Generic tool result pin for everything else.
  return {
    id: "",
    kind: "tool-result",
    label: toolHeadline(call),
    sublabel: call.name,
    added_at: "",
    collapsed: false,
    data: {
      lead_id: call.lead_id,
      tool_name: call.name,
      summary_text: call.summary,
    },
  };
}

function parseToolResult(call: ToolCall): Record<string, unknown> | null {
  if (!call.summary) return null;
  try {
    return JSON.parse(call.summary.replace(/…$/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Renders a tool call's result as a structured widget when we know the shape. */
function RichToolResult({ call }: { call: ToolCall }) {
  const parsed = parseToolResult(call) as Record<string, unknown> | null;
  if (!parsed) return null;

  if (call.name === "close_get_lead_full" || call.name === "close_get_lead") {
    const lead = (parsed.lead ?? parsed) as Record<string, unknown>;
    const display = (lead.display_name as string) || (lead.name as string) || "(unnamed lead)";
    const status = (lead.status_label as string) || "—";
    const contacts = (lead.contacts as Array<Record<string, unknown>>) || [];
    return (
      <div className="cmk-rich-lead">
        <div className="cmk-rich-lead-head">
          <div className="cmk-rich-lead-name">{display}</div>
          <div className="cmk-rich-lead-meta">
            <span className="cmk-rich-lead-status">{status}</span>
            {call.lead_id && <span className="cmk-rich-lead-id">{call.lead_id}</span>}
          </div>
        </div>
        {contacts.length > 0 && (
          <div className="cmk-rich-section">
            <div className="cme-eyebrow">Contacts</div>
            <div className="cmk-rich-contacts">
              {contacts.slice(0, 6).map((c, i) => (
                <div key={i} className="cmk-rich-contact">
                  <div className="cmk-rich-contact-name">{(c.name as string) || "(unnamed)"}</div>
                  <div className="cmk-rich-contact-routes">
                    {((c.emails as Array<{ email: string }>) || []).slice(0, 1).map((e, j) => (
                      <span key={`e${j}`}>✉ {e.email}</span>
                    ))}
                    {((c.phones as Array<{ phone: string }>) || []).slice(0, 1).map((p, j) => (
                      <span key={`p${j}`}>⌨ {p.phone}</span>
                    ))}
                  </div>
                </div>
              ))}
              {contacts.length > 6 && (
                <div className="cmk-rich-more">+ {contacts.length - 6} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (call.name === "generate_seven_day_plan") {
    const days = (parsed.days as Array<Record<string, unknown>>) || [];
    const goal = parsed.primary_goal as string | undefined;
    return (
      <div className="cmk-rich-plan">
        {goal && (
          <div className="cmk-rich-plan-goal">
            <span className="cme-eyebrow">Goal</span>
            <div className="cmk-rich-plan-goal-body">{goal}</div>
          </div>
        )}
        {days.length > 0 && (
          <div className="cmk-rich-plan-days">
            {days.map((d, i) => (
              <div key={i} className="cmk-rich-plan-day">
                <div className="cmk-rich-plan-day-num">Day {(d.day as number) ?? i + 1}</div>
                <div className="cmk-rich-plan-day-obj">{(d.objective as string) || "—"}</div>
                <div className="cmk-rich-plan-day-status">{(d.approval_status as string) || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (call.name === "close_search_leads") {
    const results = (parsed.data as Array<Record<string, unknown>>) || (Array.isArray(parsed) ? parsed : []);
    return (
      <div className="cmk-rich-search">
        {results.slice(0, 8).map((l, i) => (
          <Link key={i} href={`/lead/${l.id as string}`} className="cmk-rich-search-row">
            <span className="cmk-rich-search-name">{(l.display_name as string) || (l.name as string)}</span>
            <span className="cmk-rich-search-status">{(l.status_label as string) || "—"}</span>
          </Link>
        ))}
      </div>
    );
  }

  return null;
}

function ToolPanel({ call, index }: { call: ToolCall; index: number }) {
  const [open, setOpen] = useState(false);
  const copy = useCopy();
  const toast = useToast();
  const { addPin } = usePinboardCtx();
  const cat = categoryOf(call.name);
  const headline = toolHeadline(call);
  const ok = call.ok;
  const summaryText = call.summary ?? "";

  // Try to render result summary as markdown if it looks textual; else as JSON.
  const renderedSummary = useMemo(() => {
    if (!summaryText) return null;
    try {
      const parsed = JSON.parse(summaryText.replace(/…$/, ""));
      return (
        <pre className="cmk-tool-modal-json">
          {JSON.stringify(parsed, null, 2)}
          {summaryText.endsWith("…") ? "\n…" : ""}
        </pre>
      );
    } catch {
      return <MarkdownBody source={summaryText} />;
    }
  }, [summaryText]);

  function handlePin() {
    const candidate = pinFromCall(call);
    if (!candidate) {
      toast.push("Nothing pinnable here", { tone: "warn" });
      return;
    }
    addPin(candidate);
    toast.push(`Pinned · ${candidate.label.slice(0, 30)}`, { tone: "success" });
  }

  const items: ContextMenuItem[] = [
    { kind: "label", text: cat.toUpperCase() },
    { kind: "item", label: "View details…", onSelect: () => setOpen(true) },
    { kind: "item", label: "📌 Pin to dock", onSelect: handlePin },
    {
      kind: "item",
      label: "Copy result JSON",
      onSelect: () => copy(summaryText || "", "Result copied"),
    },
    ...(call.lead_id
      ? ([
          { kind: "divider" },
          {
            kind: "item",
            label: "Open lead Box",
            onSelect: () => {
              window.location.href = `/lead/${call.lead_id}`;
            },
          },
          {
            kind: "item",
            label: "Copy lead ID",
            onSelect: () => copy(call.lead_id ?? "", "Lead ID copied"),
          },
        ] as ContextMenuItem[])
      : []),
  ];

  return (
    <>
      <ContextMenu items={items}>
        <button
          type="button"
          className={`cmk-tp cmk-tp-${cat}${ok ? "" : " cmk-tp-fail"}`}
          onClick={() => setOpen(true)}
          aria-label="View tool details"
          style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
        >
          <span className="cmk-tp-ribbon" aria-hidden />
          <span className="cmk-tp-row">
            <span className="cmk-tp-cat">
              <span className="cmk-tp-glyph">{CATEGORY_GLYPH[cat]}</span>
              {CATEGORY_LABEL[cat]}
            </span>
            <span className="cmk-tp-headline">{headline}</span>
            {call.lead_id && (
              <Link
                href={`/lead/${call.lead_id}`}
                className="cmk-tp-jump"
                onClick={(e) => e.stopPropagation()}
              >
                box →
              </Link>
            )}
            {!ok && <span className="cmk-tp-status cmk-tp-status-fail">failed</span>}
          </span>
        </button>
      </ContextMenu>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className={`cmk-tp-modal-head cmk-tp-${cat}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="cmk-tp-glyph cmk-tp-glyph-lg">{CATEGORY_GLYPH[cat]}</span>
            <div>
              <div className="cmk-tp-modal-cat">{CATEGORY_LABEL[cat]} · {call.name}</div>
              <div className="cmk-tp-modal-h">{headline}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" onClick={handlePin} className="cmk-pin-fab" title="Pin to dock">
              📌 Pin
            </button>
            {call.lead_id && (
              <Link href={`/lead/${call.lead_id}`} className="cmk-scope-btn cmk-scope-btn-primary" onClick={() => setOpen(false)}>
                Open Box →
              </Link>
            )}
          </div>
        </div>
        <div className="cmk-tp-modal-body">
          {ok && <RichToolResult call={call} />}
          <details className="cmk-tp-modal-details">
            <summary>Raw arguments + result</summary>
            <div className="cmk-tp-modal-section" style={{ marginTop: 10 }}>
              <div className="cmk-eyebrow">Arguments</div>
              <pre className="cmk-tool-modal-json">{JSON.stringify(call.args ?? {}, null, 2)}</pre>
            </div>
            {summaryText && (
              <div className="cmk-tp-modal-section">
                <div className="cmk-eyebrow">Result {summaryText.endsWith("…") && <span style={{ color: "var(--ink-faint)", fontSize: 9 }}>(truncated)</span>}</div>
                <div className="cmk-tp-modal-result">{renderedSummary}</div>
              </div>
            )}
          </details>
          {!ok && !summaryText && (
            <div className="cmk-tp-modal-section" style={{ color: "#8a3a3a" }}>
              Tool returned an error with no result body.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function RunTraceBar({ traceId }: { traceId: string }) {
  const copy = useCopy();
  const href = `/console?trace=${encodeURIComponent(traceId)}`;
  return (
    <div className="cmk-run-trace">
      <span className="cmk-run-trace-label">Run trace</span>
      <code className="cmk-run-trace-id" title={traceId}>
        {traceId.slice(0, 8)}…{traceId.slice(-4)}
      </code>
      <button type="button" className="cmk-run-trace-btn" onClick={() => copy(traceId, "Trace copied")}>
        Copy
      </button>
      <Link href={href} className="cmk-run-trace-console">
        Console →
      </Link>
    </div>
  );
}

function ToolTrace({ calls, traceId }: { calls: ToolCall[]; traceId?: string | null }) {
  if (calls.length === 0 && !traceId) return null;
  return (
    <div className="cmk-tp-stack">
      {calls.map((c, i) => (
        <ToolPanel key={i} call={c} index={i} />
      ))}
      {traceId ? <RunTraceBar traceId={traceId} /> : null}
    </div>
  );
}

/* ============ MESSAGE RENDERERS ============ */

function MessageMenu({ message, onCopyText, onCopyMd }: { message: Message; onCopyText: () => void; onCopyMd: () => void; }) {
  const items: ContextMenuItem[] = [
    { kind: "label", text: message.role.toUpperCase() },
    { kind: "item", label: "Copy plain text", onSelect: onCopyText },
    { kind: "item", label: "Copy markdown source", onSelect: onCopyMd },
  ];
  return items as unknown as ContextMenuItem[]; // silenced for typing — we use directly below
}

function UserMessage({ message }: { message: Message }) {
  const copy = useCopy();
  const items: ContextMenuItem[] = [
    { kind: "label", text: "USER" },
    { kind: "item", label: "Copy text", onSelect: () => copy(message.content, "Message copied") },
  ];
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <ContextMenu items={items}>
        <div className="chat-msg-user" style={{ maxWidth: "78%" }}>
          {message.attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: message.content ? 8 : 0 }}>
              {message.attachments.map((a, i) =>
                a.type === "image" ? (
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
                ) : (
                  <div
                    key={i}
                    className="muted"
                    style={{
                      fontSize: 11,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "0.5px solid var(--rule)",
                      maxWidth: 220,
                    }}
                  >
                    {a.name ?? "Text"} · {a.text.slice(0, 120)}
                    {a.text.length > 120 ? "…" : ""}
                  </div>
                )
              )}
            </div>
          )}
          {message.content && <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>}
        </div>
      </ContextMenu>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  const copy = useCopy();
  const { calls, traceId, rest } = useMemo(() => parseAssistantPayload(message.content), [message.content]);
  const plainText = useMemo(() => {
    return rest.replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z:]*\n?|\n?```/g, ""))
      .replace(/[*_`]/g, "")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1");
  }, [rest]);
  const items: ContextMenuItem[] = [
    { kind: "label", text: "ASSISTANT" },
    { kind: "item", label: "Copy plain text", onSelect: () => copy(plainText, "Reply copied") },
    { kind: "item", label: "Copy markdown source", onSelect: () => copy(rest, "Markdown copied") },
    ...(calls.length > 0
      ? ([
          { kind: "divider" },
          { kind: "label", text: `${calls.length} TOOL CALL${calls.length === 1 ? "" : "S"}` },
        ] as ContextMenuItem[])
      : []),
  ];
  return (
    <ContextMenu items={items}>
      <div className="chat-msg-text">
        <ToolTrace calls={calls} traceId={traceId} />
        <MarkdownBody source={rest} />
      </div>
    </ContextMenu>
  );
}

/* ============ ANIMATED THINKING ============ */

const THINKING_PHRASES = [
  "composing the move",
  "checking the box",
  "running the gates",
  "reading Close",
  "drafting in NEPQ",
  "pricing skip codes",
  "lining up the week",
  "weighing the next ask",
  "scanning recent activity",
  "tasting the brief",
];

function AnimatedThinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % THINKING_PHRASES.length), 1700);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="cmk-thinking">
      <span className="cmk-thinking-dots" aria-hidden>
        <span /><span /><span />
      </span>
      <span className="cmk-thinking-phrase">{THINKING_PHRASES[i]}…</span>
    </div>
  );
}

/* ============ EMPTY STATE ============ */

function DemoEmptyState({ onSeed }: { onSeed: (text: string) => void }) {
  const seeds = [
    "Set up a 7-day pre-tasting cadence for a wedding on May 18.",
    "What automations do I have running this week?",
    "Show me Andre's leads that haven't been touched in a week.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 20px", color: "var(--ink-soft)" }}>
      <div className="cmk-empty-breathe" style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", fontStyle: "italic" }}>
        What are we delegating today?
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
      <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
        Or pick a quick delegation from the rail.
      </div>
    </div>
  );
}

/* ============ SCOPE DOCK ============ */

/* (ScopeLead type removed — pinboard now drives the right dock.) */

function ScopeDock({
  pins,
  onUnpin,
  onToggle,
  onClearAll,
  narrow,
}: {
  pins: Pin[];
  onUnpin: (id: string) => void;
  onToggle: (id: string) => void;
  onClearAll: () => void;
  narrow: boolean;
}) {
  const copy = useCopy();

  if (pins.length === 0) {
    const empty: ContextMenuItem[] = [{ kind: "label", text: "Nothing pinned" }];
    return (
      <ContextMenu items={empty}>
        <div className="cmk-scope-empty" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div className="cmk-scroll scroll-hide" style={{ flex: 1, padding: "14px 14px", color: "var(--ink-faint)", fontSize: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, marginBottom: 6, color: "var(--ink-soft)" }}>
              Nothing pinned.
            </div>
            <div>{narrow ? "Pin a tool result here." : "Click any tool-call panel and tap Pin to dock — leads, plans, days, anything you want at a glance while you keep working in chat."}</div>
          </div>
        </div>
      </ContextMenu>
    );
  }

  const dockItems: ContextMenuItem[] = [
    { kind: "label", text: `Pinboard · ${pins.length}` },
    { kind: "divider" },
    { kind: "item", label: "Clear all pins", tone: "danger", onSelect: onClearAll },
  ];

  return (
    <ContextMenu items={dockItems}>
      <div className="cmk-pinboard" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <div className="cmk-scroll scroll-hide" style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px" }}>
          {pins.map((pin, i) => {
            const items: ContextMenuItem[] = [
              { kind: "label", text: pin.label.slice(0, 40) },
              { kind: "item", label: pin.collapsed ? "Expand" : "Collapse", onSelect: () => onToggle(pin.id) },
              ...(pin.data.lead_id
                ? [
                    {
                      kind: "item" as const,
                      label: "Open Box",
                      onSelect: () => {
                        window.location.href = `/lead/${pin.data.lead_id}`;
                      },
                    },
                    {
                      kind: "item" as const,
                      label: "Open in Close",
                      onSelect: () =>
                        window.open(`https://app.close.com/lead/${pin.data.lead_id}/`, "_blank"),
                    },
                    {
                      kind: "item" as const,
                      label: "Copy lead ID",
                      onSelect: () => copy(pin.data.lead_id ?? "", "Lead ID copied"),
                    },
                  ]
                : []),
              { kind: "divider" },
              { kind: "item", label: "Unpin", tone: "danger", onSelect: () => onUnpin(pin.id) },
            ];
            return (
              <ContextMenu key={pin.id} items={items}>
                <div
                  className={`cmk-pin cmk-pin-${pin.kind}${pin.collapsed ? " cmk-pin-collapsed" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                >
                  <div className="cmk-pin-head" onClick={() => onToggle(pin.id)} role="button" tabIndex={0}>
                    <span className="cmk-pin-kind">{pinKindGlyph(pin.kind)}</span>
                    <div className="cmk-pin-title-wrap">
                      <div className="cmk-pin-title">{pin.label}</div>
                      {pin.sublabel && <div className="cmk-pin-sub">{pin.sublabel}</div>}
                    </div>
                    <button
                      type="button"
                      className="cmk-pin-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnpin(pin.id);
                      }}
                      aria-label="Unpin"
                      title="Unpin"
                    >
                      ×
                    </button>
                  </div>
                  {!pin.collapsed && <PinBody pin={pin} />}
                </div>
              </ContextMenu>
            );
          })}
        </div>
      </div>
    </ContextMenu>
  );
}

function pinKindGlyph(kind: PinKind): string {
  switch (kind) {
    case "lead":
      return "◉";
    case "plan":
      return "✦";
    case "plan-day":
      return "▤";
    case "tool-result":
      return "▦";
  }
}

function PinBody({ pin }: { pin: Pin }) {
  if (pin.kind === "lead") {
    return (
      <div className="cmk-pin-body">
        {pin.data.status_label && (
          <div className="cmk-pin-row">
            <span className="cmk-pin-k">status</span>
            <span className="cmk-pin-v">{pin.data.status_label}</span>
          </div>
        )}
        {pin.data.lead_id && (
          <div className="cmk-pin-row" title={pin.data.lead_id}>
            <span className="cmk-pin-k">id</span>
            <span className="cmk-pin-v cmk-pin-id">{pin.data.lead_id.slice(0, 12)}…</span>
          </div>
        )}
        {pin.data.lead_id && (
          <div className="cmk-pin-actions">
            <Link href={`/lead/${pin.data.lead_id}`} className="cmk-pin-btn cmk-pin-btn-primary">
              Open Box →
            </Link>
          </div>
        )}
      </div>
    );
  }
  if (pin.kind === "plan-day" && pin.data.day) {
    return (
      <div className="cmk-pin-body">
        <div className="cmk-pin-row">
          <span className="cmk-pin-k">objective</span>
          <span className="cmk-pin-v" style={{ fontStyle: "italic", fontFamily: "var(--serif)" }}>
            {pin.data.day.objective}
          </span>
        </div>
        <div className="cmk-pin-row">
          <span className="cmk-pin-k">status</span>
          <span className="cmk-pin-v">{pin.data.day.approval_status}</span>
        </div>
        {pin.data.lead_id && (
          <div className="cmk-pin-actions">
            <Link href={`/lead/${pin.data.lead_id}`} className="cmk-pin-btn cmk-pin-btn-primary">
              Open Box →
            </Link>
          </div>
        )}
      </div>
    );
  }
  if (pin.kind === "tool-result") {
    return (
      <div className="cmk-pin-body">
        {pin.data.summary_text && (
          <pre className="cmk-pin-summary">
            {pin.data.summary_text.length > 320
              ? pin.data.summary_text.slice(0, 320) + "…"
              : pin.data.summary_text}
          </pre>
        )}
      </div>
    );
  }
  return (
    <div className="cmk-pin-body">
      <div className="cmk-pin-row">
        <span className="cmk-pin-v">{pin.sublabel || "(pinned)"}</span>
      </div>
    </div>
  );
}

/* ============ PANE CONTROLS ============ */

function PaneControl({ mode, onCycle, onHide }: { mode: PaneMode; onCycle: () => void; onHide: () => void }) {
  const next = mode === "normal" ? "wide" : "normal";
  return (
    <div className="cmk-pane-ctrl">
      <button
        type="button"
        onClick={onCycle}
        className="cmk-pane-btn"
        title={`Make ${next}`}
        aria-label={`Make ${next}`}
      >
        {mode === "wide" ? "›‹" : "‹›"}
      </button>
      <button
        type="button"
        onClick={onHide}
        className="cmk-pane-btn"
        title="Hide pane"
        aria-label="Hide pane"
      >
        ×
      </button>
    </div>
  );
}

function RevealTab({ side, label, onReveal }: { side: "left" | "right"; label: string; onReveal: () => void }) {
  return (
    <button
      type="button"
      className={`cmk-reveal cmk-reveal-${side}`}
      onClick={onReveal}
      title={`Show ${label}`}
      aria-label={`Show ${label}`}
    >
      <span className="cmk-reveal-arrow">{side === "left" ? "›" : "‹"}</span>
      <span className="cmk-reveal-label">{label}</span>
    </button>
  );
}

/* ============ LAYOUT HOOK ============ */

function useChatLayout() {
  const [layout, setLayout] = useState<ChatLayout>(DEFAULT_LAYOUT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ChatLayout>;
        setLayout({
          rail: parsed.rail ?? DEFAULT_LAYOUT.rail,
          scope: parsed.scope ?? DEFAULT_LAYOUT.scope,
        });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  }, [layout, hydrated]);

  const cycle = useCallback((pane: keyof ChatLayout) => {
    setLayout((prev) => {
      const cur = prev[pane];
      const next: PaneMode = cur === "normal" ? "wide" : cur === "wide" ? "normal" : "normal";
      return { ...prev, [pane]: next };
    });
  }, []);
  const hide = useCallback((pane: keyof ChatLayout) => {
    setLayout((prev) => ({ ...prev, [pane]: "hidden" }));
  }, []);
  const show = useCallback((pane: keyof ChatLayout) => {
    setLayout((prev) => ({ ...prev, [pane]: "normal" }));
  }, []);

  return { layout, cycle, hide, show };
}

function gridTemplate(rail: PaneMode, scope: PaneMode): string {
  // Hidden mode keeps an 18px slot reserved for the reveal tab — otherwise
  // the tab auto-places into another grid cell and pokes into chat's space.
  // Always returning 3 columns means the chat panel sits in the same grid
  // track regardless of pane state, so toggling never breaks the layout.
  const railWidth = rail === "hidden" ? "18px" : rail === "wide" ? "440px" : "220px";
  const scopeWidth = scope === "hidden" ? "18px" : scope === "wide" ? "520px" : "260px";
  // minmax(420px, 1fr) prevents chat from being crushed when both side panes
  // go wide on a narrow viewport.
  return `${railWidth} minmax(420px, 1fr) ${scopeWidth}`;
}

/* ============ MAIN ============ */

export function ChatLayout() {
  const searchParams = useSearchParams();
  const draftLinkConsumed = useRef(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeQuickId, setActiveQuickId] = useState<string | null>(null);
  const [lastDelegation, setLastDelegation] = useState<QuickDelegation | null>(null);
  const [sendSuccess, setSendSuccess] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [threadFilter, setThreadFilter] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { layout, cycle, hide, show } = useChatLayout();
  const { pins, addPin, removePin, togglePin, clearPins } = usePinboard();
  const toast = useToast();
  const copy = useCopy();

  useEffect(() => {
    const draftId = searchParams.get("draft");
    const draftName = searchParams.get("draftName")?.trim();
    if (!draftId || draftLinkConsumed.current) return;
    draftLinkConsumed.current = true;
    const label = draftName || "Draft";
    const seed = [
      `I'm working on automation draft "${label}" (id ${draftId}).`,
      "",
      "Goal: [describe what this Close sequence should accomplish]",
      "",
      "Please help me propose Close sequence steps (SMS/email/etc.) and call out risks.",
    ].join("\n");
    setInput(seed);
    toast.push("Draft linked — edit the goal in the composer, then send.");
    try {
      window.history.replaceState(null, "", "/chat");
    } catch {
      /* ignore */
    }
    queueMicrotask(() => inputRef.current?.focus());
  }, [searchParams, toast]);

  /* ---- Threads ---- */

  async function refreshThreads(): Promise<Thread[] | null> {
    const res = await fetch("/api/threads", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setThreads(data.threads as Thread[]);
      return data.threads as Thread[];
    }
    return null;
  }

  useEffect(() => {
    void (async () => {
      setThreadsLoading(true);
      try {
        const list = await refreshThreads();
        if (list && list.length > 0) setActiveId(list[0].id);
      } finally {
        setThreadsLoading(false);
      }
    })();
  }, []);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Smooth scroll on new content; jump on first mount to avoid a slow open.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance > 0 && distance < 600) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  /* ---- Auto-pin: when a tool call references a lead, surface it as a pin ---- */

  const lastAutoPinned = useRef<string | null>(null);
  useEffect(() => {
    // Walk newest-first, find the most recent tool call with a known lead_id +
    // structured snapshot. Auto-pin once per detection so we don't keep
    // re-pinning the same lead on every render.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const { calls } = parseToolTrace(m.content);
      for (let j = calls.length - 1; j >= 0; j--) {
        const c = calls[j];
        if (!c.lead_id) continue;
        if (lastAutoPinned.current === `${m.id}:${j}`) return;
        const candidate = pinFromCall(c);
        if (candidate) {
          lastAutoPinned.current = `${m.id}:${j}`;
          addPin(candidate);
        }
        return;
      }
    }
  }, [messages, addPin]);

  /* ---- Thread actions ---- */

  function handleNewThread() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setPending([]);
    inputRef.current?.focus();
  }

  async function handleRename(thread: Thread) {
    const next = window.prompt("Rename thread", thread.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === thread.title) return;
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rename", title: trimmed }),
    });
    if (res.ok) {
      await refreshThreads();
      toast.push("Renamed", { tone: "success" });
    } else {
      toast.push("Rename failed", { tone: "error" });
    }
  }

  async function handleArchive(thread: Thread) {
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    if (res.ok) {
      if (activeId === thread.id) handleNewThread();
      await refreshThreads();
      toast.push("Thread archived", { tone: "success" });
    } else {
      toast.push("Archive failed", { tone: "error" });
    }
  }

  async function handleDelete(thread: Thread) {
    if (!window.confirm(`Delete "${thread.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/threads/${thread.id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeId === thread.id) handleNewThread();
      await refreshThreads();
      toast.push("Thread deleted", { tone: "success" });
    } else {
      toast.push("Delete failed", { tone: "error" });
    }
  }

  /* ---- Files ---- */

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

  /**
   * Multi-format ingest. Images attach inline as multimodal data-URL inputs
   * (the model sees the picture). Everything else routes through the intake
   * pipeline (`/api/intake/upload` → `/extract`) which stores the file in
   * Supabase storage and returns the extracted text body — that text becomes
   * a text attachment the model reads in the next turn.
   */
  async function ingestFiles(files: File[]) {
    if (files.length === 0) return;
    const out: PendingAttachment[] = [];
    let imageCount = 0;
    let textCount = 0;
    let unsupportedCount = 0;

    for (const f of files) {
      if (f.type.startsWith("image/")) {
        const data_url = await fileToDataURL(f);
        out.push({ localId: newId(), type: "image", data_url, mime: f.type, name: f.name });
        imageCount++;
        continue;
      }
      // Non-image: upload + extract via intake pipeline.
      try {
        const fd = new FormData();
        fd.append("file", f);
        const upRes = await fetch("/api/intake/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          unsupportedCount++;
          toast.push(`Upload failed for ${f.name}`, { tone: "error", ttl: 4500 });
          continue;
        }
        const upData = (await upRes.json()) as { ok?: boolean; artifact_id?: string };
        if (!upData.ok || !upData.artifact_id) {
          unsupportedCount++;
          continue;
        }
        const exRes = await fetch("/api/intake/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artifact_id: upData.artifact_id }),
        });
        const exData = (await exRes.json()) as { ok?: boolean; summary?: string };
        const text = (exData.summary ?? "").trim();
        if (!text) {
          unsupportedCount++;
          toast.push(`Can't read ${f.name} yet — try a screenshot or paste text`, {
            tone: "warn",
            ttl: 4500,
          });
          continue;
        }
        out.push({
          localId: newId(),
          type: "text",
          text,
          mime: f.type || "application/octet-stream",
          name: f.name,
          artifact_id: upData.artifact_id,
        });
        textCount++;
      } catch (err) {
        unsupportedCount++;
        toast.push(`Upload failed: ${err instanceof Error ? err.message : String(err)}`, {
          tone: "error",
          ttl: 4500,
        });
      }
    }

    if (out.length > 0) {
      setPending((prev) => [...prev, ...out]);
      const parts: string[] = [];
      if (imageCount) parts.push(`${imageCount} image${imageCount === 1 ? "" : "s"}`);
      if (textCount) parts.push(`${textCount} doc${textCount === 1 ? "" : "s"}`);
      toast.push(`${parts.join(" · ")} attached`, { tone: "success" });
    }
  }

  /* ---- Drag-drop attachments on the chat pane ---- */

  const [dragOver, setDragOver] = useState(false);
  function onDragEnter(e: React.DragEvent) { e.preventDefault(); setDragOver(true); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    await ingestFiles(files);
  }

  /* ---- Paste from clipboard (any file kind) ---- */

  async function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const fileItems = items.filter((it) => it.kind === "file");
    if (fileItems.length === 0) return; // plain text paste — let the textarea handle it
    e.preventDefault();
    const files = fileItems.map((it) => it.getAsFile()).filter((f): f is File => Boolean(f));
    await ingestFiles(files);
  }

  /* ---- Send ---- */

  async function send(textOverride?: string, e?: FormEvent) {
    e?.preventDefault();
    const text = (textOverride ?? input).trim();
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
    if (textOverride === undefined) setInput("");
    const sentAttachments = pending.map(({ localId: _l, ...a }) => a);
    setPending([]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: activeId, input: text, attachments: sentAttachments }),
        signal: ctrl.signal,
      });
      const data = await res.json();

      if (data.ok || data.assistant_message) {
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optimisticUser.id);
          return [...without, data.user_message as Message, data.assistant_message as Message];
        });
        if (data.thread_id && data.thread_id !== activeId) setActiveId(data.thread_id);
        await refreshThreads();
        setSendSuccess((n) => n + 1);
        if (typeof data.trace_id === "string" && data.trace_id.length > 8) {
          toast.push(`Run trace ${data.trace_id.slice(0, 8)}… — see bar above reply`, { tone: "success", ttl: 4200 });
        }
      } else {
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
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          thread_id: activeId ?? "pending",
          role: "assistant",
          content: aborted ? "_(canceled)_" : `error: ${msg}`,
          attachments: [],
          created_at: new Date().toISOString(),
        },
      ]);
      if (aborted) {
        toast.push("Canceled", { tone: "warn", ttl: 1800 });
      } else {
        toast.push(`Send failed — ${msg.slice(0, 80)}`, { tone: "error", ttl: 5000 });
      }
    } finally {
      setLoading(false);
      setActiveQuickId(null);
      abortRef.current = null;
    }
  }

  function cancelInFlight() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash palette navigation
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
      if (e.key === "Tab") {
        e.preventDefault();
        const cmd = slashMatches[slashIndex];
        if (cmd) setInput(cmd.keys[0] + " ");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const cmd = slashMatches[slashIndex];
        if (cmd) runSlashCommand(cmd);
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
      void send();
    }
  }

  function fireQuickDelegation(q: QuickDelegation) {
    handleNewThread();
    setActiveQuickId(q.id);
    setLastDelegation(q);
    toast.push(`Delegating: ${q.label}`, { tone: "default" });
    setTimeout(() => {
      void send(q.prompt);
    }, 0);
  }

  /* ---- Live timestamp ticker — refreshes thread "2h" labels every 60s ---- */

  useEffect(() => {
    const t = window.setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /* ---- Slash command catalog ---- */

  type SlashCommand = {
    id: string;
    keys: string[];
    label: string;
    hint: string;
    run: (rest: string) => void | Promise<void>;
  };

  const slashCommands: SlashCommand[] = [
      {
        id: "help",
        keys: ["/help", "/?"],
        label: "/help",
        hint: "Open the keyboard shortcut overlay",
        run: () => {
          setInput("");
          setShortcutsOpen(true);
        },
      },
      {
        id: "new",
        keys: ["/new"],
        label: "/new",
        hint: "Start a fresh thread",
        run: () => {
          handleNewThread();
        },
      },
      {
        id: "clear",
        keys: ["/clear"],
        label: "/clear",
        hint: "Clear the input bar",
        run: () => setInput(""),
      },
      {
        id: "lead",
        keys: ["/lead"],
        label: "/lead <id-or-query>",
        hint: "Ask the agent to read a lead Box",
        run: (rest) => {
          const q = rest.trim();
          if (!q) {
            setInput("");
            toast.push("Type a lead id or query after /lead", { tone: "warn" });
            return;
          }
          if (q.startsWith("lead_")) {
            void send(`Read lead ${q} (close_get_lead_full) and tell me what state it's in.`);
          } else {
            void send(`Search Close for "${q}" (close_search_leads). If there's an obvious match, read it (close_get_lead_full) and tell me what state it's in.`);
          }
        },
      },
      {
        id: "heartbeat",
        keys: ["/heartbeat", "/hb"],
        label: "/heartbeat",
        hint: "Run a heartbeat audit (draft mode, no sends)",
        run: () => {
          void send(
            "Walk every active Andre plan and give me a heartbeat audit: which actions would fire today, " +
              "which are skip-coded and why. Don't fire anything — draft mode summary only."
          );
        },
      },
      {
        id: "today",
        keys: ["/today"],
        label: "/today",
        hint: "Today's Andre leads — top 5",
        run: () => {
          void send(
            "List my Andre-owned leads (status not Won/Lost). For the top 5 by recency, " +
              "tell me what state each is in (last activity, next move, any blockers). Be terse."
          );
        },
      },
      {
        id: "rerun",
        keys: ["/rerun", "/again"],
        label: "/rerun",
        hint: lastDelegation ? `Re-run: ${lastDelegation.label}` : "No previous delegation",
        run: () => {
          if (lastDelegation) fireQuickDelegation(lastDelegation);
          else toast.push("No previous delegation to re-run", { tone: "warn" });
        },
      },
      {
        id: "wide-rail",
        keys: ["/wide-rail", "/rail"],
        label: "/rail",
        hint: "Cycle the Delegations rail (normal ↔ wide)",
        run: () => {
          if (layout.rail === "hidden") show("rail");
          else cycle("rail");
        },
      },
      {
        id: "scope-toggle",
        keys: ["/scope"],
        label: "/scope",
        hint: "Cycle the In-scope dock",
        run: () => {
          if (layout.scope === "hidden") show("scope");
          else cycle("scope");
        },
      },
      {
        id: "panes-reset",
        keys: ["/reset", "/panes"],
        label: "/reset",
        hint: "Reset both panes to normal",
        run: () => {
          if (layout.rail !== "normal") show("rail");
          if (layout.scope !== "normal") show("scope");
          toast.push("Panes reset", { tone: "default" });
        },
      },
      {
        id: "pins-clear",
        keys: ["/unpin-all", "/clear-pins"],
        label: "/unpin-all",
        hint: pins.length > 0 ? `Clear ${pins.length} pinned widget${pins.length === 1 ? "" : "s"}` : "No pins to clear",
        run: () => {
          if (pins.length === 0) {
            toast.push("No pins to clear", { tone: "warn" });
            return;
          }
          clearPins();
          toast.push("All pins cleared", { tone: "success" });
        },
      },
      {
        id: "pin-last",
        keys: ["/pin"],
        label: "/pin",
        hint: "Pin the most recent tool result to the dock",
        run: () => {
          // Walk newest-first across messages → tool calls; pin the first pinnable.
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== "assistant") continue;
            const { calls } = parseToolTrace(m.content);
            for (let j = calls.length - 1; j >= 0; j--) {
              const candidate = pinFromCall(calls[j]);
              if (candidate) {
                addPin(candidate);
                toast.push(`Pinned · ${candidate.label.slice(0, 30)}`, { tone: "success" });
                if (layout.scope === "hidden") show("scope");
                return;
              }
            }
          }
          toast.push("Nothing recent to pin", { tone: "warn" });
        },
      },
    ];

  const slashMatches: SlashCommand[] = (() => {
    if (!slashOpen) return [];
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return [];
    const head = trimmed.split(/\s+/)[0].toLowerCase();
    return slashCommands.filter((c) => c.keys.some((k) => k.startsWith(head)));
  })();

  // Keep slashOpen in sync with input.
  useEffect(() => {
    setSlashOpen(input.startsWith("/"));
    setSlashIndex(0);
  }, [input]);

  function runSlashCommand(cmd: SlashCommand) {
    const trimmed = input.trim();
    const head = trimmed.split(/\s+/)[0];
    const rest = trimmed.slice(head.length).trim();
    setInput("");
    setSlashOpen(false);
    void cmd.run(rest);
  }

  /* ---- Keyboard shortcuts ---- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // Esc cancels any in-flight request from anywhere.
      if (e.key === "Escape" && abortRef.current) {
        abortRef.current.abort();
        return;
      }
      // "?" — opens shortcuts overlay (only when not typing).
      if (e.key === "?" && !inEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      // ⌘K — focus input
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      // ⌘\ — toggle rail
      if (e.key === "\\") {
        e.preventDefault();
        if (layout.rail === "hidden") show("rail");
        else hide("rail");
        return;
      }
      // ⌘. — toggle scope
      if (e.key === ".") {
        e.preventDefault();
        if (layout.scope === "hidden") show("scope");
        else hide("scope");
        return;
      }
      // ⌘N — new thread (lowercase n; capital N would conflict with browser new-window)
      if (e.key.toLowerCase() === "n" && e.shiftKey) {
        e.preventDefault();
        handleNewThread();
        return;
      }
      // ⌘/ — alt focus
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout.rail, layout.scope, hide, show]);

  /* ---- Auto-grow textarea ---- */

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${next}px`;
  }, [input]);

  /* ---- Send-success ring (auto-clears) ---- */

  useEffect(() => {
    if (sendSuccess === 0) return;
    const t = window.setTimeout(() => setSendSuccess(0), 900);
    return () => window.clearTimeout(t);
  }, [sendSuccess]);

  /* ---- Render ---- */

  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const turnLabel = userTurnCount === 0 ? "new chat" : `${userTurnCount} turn${userTurnCount === 1 ? "" : "s"}`;

  const railHidden = layout.rail === "hidden";
  const scopeHidden = layout.scope === "hidden";
  const scopeNarrow = layout.scope !== "wide";

  return (
    <PinboardContext.Provider value={{ addPin }}>
    <div
      className="cmk-chat-grid"
      style={{ gridTemplateColumns: gridTemplate(layout.rail, layout.scope) }}
      data-rail={layout.rail}
      data-scope={layout.scope}
    >
      {railHidden && <RevealTab side="left" label="Delegations" onReveal={() => show("rail")} />}

      {!railHidden && (
        <aside className="cmk-panel cmk-rail" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="cmk-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cmk-eyebrow">Delegations</span>
              <span className="cmk-mode-pill">{layout.rail}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {lastDelegation && !loading && (
                <button
                  type="button"
                  onClick={() => fireQuickDelegation(lastDelegation)}
                  className="cmk-rail-new cmk-rail-rerun"
                  title={`Re-run: ${lastDelegation.label}`}
                  aria-label="Re-run last delegation"
                >
                  ↻
                </button>
              )}
              <button type="button" onClick={handleNewThread} className="cmk-rail-new">+ new</button>
              <PaneControl
                mode={layout.rail}
                onCycle={() => cycle("rail")}
                onHide={() => hide("rail")}
              />
            </div>
          </div>

          <div className="cmk-scroll scroll-hide" style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            <div className="cmk-quick-list">
              {QUICK_DELEGATIONS.map((q, qi) => {
                const isRunning = activeQuickId === q.id && loading;
                const items: ContextMenuItem[] = [
                  { kind: "label", text: "QUICK DELEGATION" },
                  { kind: "item", label: "Run now", onSelect: () => fireQuickDelegation(q) },
                  { kind: "item", label: "Copy prompt", onSelect: () => copy(q.prompt, "Prompt copied") },
                  {
                    kind: "item",
                    label: "Seed input bar",
                    onSelect: () => {
                      setInput(q.prompt);
                      inputRef.current?.focus();
                      toast.push("Seeded — edit and send", { tone: "default" });
                    },
                  },
                ];
                return (
                  <ContextMenu key={q.id} items={items}>
                    <button
                      type="button"
                      onClick={() => fireQuickDelegation(q)}
                      className={`cmk-quick cmk-quick-${q.tone}${isRunning ? " cmk-quick-running" : ""}`}
                      disabled={loading}
                      title={q.prompt}
                      style={{ animationDelay: `${qi * 50}ms` }}
                    >
                      <div className="cmk-quick-label">{q.label}</div>
                      <div className="cmk-quick-hint">{isRunning ? "running…" : q.hint}</div>
                      {isRunning && <span className="cmk-quick-flare" aria-hidden />}
                    </button>
                  </ContextMenu>
                );
              })}
            </div>

            <div className="cmk-rail-divider">
              <span className="cmk-eyebrow" style={{ fontSize: 9.5 }}>Threads</span>
              {threads.length > 4 && (
                <span className="cmk-eyebrow" style={{ fontSize: 9, color: "var(--ink-faint)" }}>{threads.length}</span>
              )}
            </div>

            {threads.length > 4 && (
              <div className="cmk-rail-filter-wrap">
                <input
                  type="text"
                  value={threadFilter}
                  onChange={(e) => setThreadFilter(e.target.value)}
                  placeholder="filter…"
                  className="cmk-rail-filter"
                  aria-label="Filter threads"
                />
                {threadFilter && (
                  <button
                    type="button"
                    onClick={() => setThreadFilter("")}
                    className="cmk-rail-filter-x"
                    aria-label="Clear filter"
                  >×</button>
                )}
              </div>
            )}

            {threadsLoading ? (
              <div className="cmk-rail-item dim">loading…</div>
            ) : (
              <>
                {!activeId && (
                  <div className="cmk-rail-item active">
                    <span className="cmk-dot" style={{ background: "#6B8E5A" }} />
                    New chat (unsent)
                  </div>
                )}
                {threads.length === 0 && activeId && (
                  <div className="cmk-rail-item dim">no threads yet</div>
                )}
                {threads
                  .filter((t) => !threadFilter || t.title.toLowerCase().includes(threadFilter.toLowerCase()))
                  .map((t) => {
                  const isActive = t.id === activeId;
                  const items: ContextMenuItem[] = [
                    { kind: "label", text: "THREAD" },
                    { kind: "item", label: "Rename…", onSelect: () => void handleRename(t) },
                    { kind: "item", label: "Archive", onSelect: () => void handleArchive(t) },
                    { kind: "divider" },
                    { kind: "item", label: "Delete", tone: "danger", onSelect: () => void handleDelete(t) },
                  ];
                  return (
                    <ContextMenu key={t.id} items={items}>
                      <button
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        className={"cmk-rail-item cmk-rail-thread" + (isActive ? " active" : "")}
                      >
                        {isActive && <span className="cmk-rail-stripe" aria-hidden />}
                        <span
                          className="cmk-dot"
                          style={{ background: isActive ? "#6B8E5A" : "#9B8FB8" }}
                        />
                        <span className="cmk-rail-title">{t.title}</span>
                        <span className="cmk-rail-when" title={new Date(t.updated_at).toLocaleString()}>
                          {relativeTime(t.updated_at)}
                        </span>
                      </button>
                    </ContextMenu>
                  );
                })}
              </>
            )}
          </div>
        </aside>
      )}

      {/* === CHAT PANEL === */}
      <section
        className={`cmk-panel cmk-chat-pane${sendSuccess > 0 ? " cmk-chat-pane-success" : ""}${dragOver ? " cmk-chat-pane-drop" : ""}`}
        style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="cmk-drop-overlay" aria-hidden>
            <div className="cmk-drop-msg">
              <span className="cmk-drop-glyph">↓</span>
              <span>Drop images to attach</span>
            </div>
          </div>
        )}
        {loading && <div className="cmk-progress-bar" aria-hidden />}
        <div className="cmk-panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="cmk-dot" style={{ background: loading ? "#C4923D" : "#6B8E5A" }} />
            <span className="cmk-eyebrow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeThread?.title ?? "New chat"}
            </span>
          </div>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "#9a9a93" }}>{turnLabel}</span>
        </div>

        <div
          ref={scrollRef}
          className="cmk-scroll scroll-hide"
          style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}
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
              {loading && <AnimatedThinking />}
            </>
          )}
        </div>

        {pending.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 14px 0" }}>
            {pending.map((p) => (
              <div key={p.localId} style={{ position: "relative", display: "inline-block" }}>
                {p.type === "image" ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.data_url}
                      alt={p.name ?? ""}
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.12)", display: "block" }}
                    />
                    <button
                      type="button"
                      onClick={() => removePending(p.localId)}
                      aria-label="Remove"
                      style={{
                        position: "absolute", top: -6, right: -6, width: 16, height: 16,
                        borderRadius: "50%", background: "#1a1a1a", color: "#FCFBF8",
                        border: "none", fontSize: 10, cursor: "pointer", lineHeight: 1, padding: 0,
                      }}
                    >×</button>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      className="muted"
                      style={{
                        fontSize: 10,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "0.5px solid rgba(0,0,0,0.12)",
                        maxWidth: 120,
                      }}
                    >
                      {p.name ?? "text"}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(p.localId)}
                      aria-label="Remove"
                      style={{
                        width: 16, height: 16,
                        borderRadius: "50%", background: "#1a1a1a", color: "#FCFBF8",
                        border: "none", fontSize: 10, cursor: "pointer", lineHeight: 1, padding: 0,
                      }}
                    >×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form className="chat-input-bar" onSubmit={(e) => void send(undefined, e)}>
          {slashOpen && slashMatches.length > 0 && (
            <div className="cmk-slash-palette" role="listbox" aria-label="Slash commands">
              {slashMatches.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={i === slashIndex}
                  className={`cmk-slash-row${i === slashIndex ? " active" : ""}`}
                  onMouseEnter={() => setSlashIndex(i)}
                  onClick={() => runSlashCommand(cmd)}
                >
                  <span className="cmk-slash-key">{cmd.label}</span>
                  <span className="cmk-slash-hint">{cmd.hint}</span>
                </button>
              ))}
              <div className="cmk-slash-foot">
                <kbd>↑↓</kbd> select <kbd>↵</kbd> run <kbd>⇥</kbd> complete <kbd>esc</kbd> dismiss
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input
              ref={fileRef}
              type="file"
              /* Images go inline as vision; everything else routes through intake. */
              accept="image/*,text/*,.pdf,.json,.csv,.md,.txt,.html,.htm,.yaml,.yml,.tsx,.ts,.js,.jsx,.py,.css,.docx"
              multiple
              hidden
              onChange={handleFiles}
            />
            <button
              type="button"
              className="chat-input-add"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach image"
              disabled={loading}
            >+</button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Delegate to Comeketo Agent. Type / for commands · Enter to send · ⌘K focus"
              disabled={loading}
              rows={1}
              style={{
                flex: 1, fontSize: 12, color: "var(--ink)", background: "transparent",
                border: "none", outline: "none", padding: 0, fontFamily: "inherit",
                resize: "none", lineHeight: 1.5, maxHeight: 160,
              }}
            />
            {loading ? (
              <button
                type="button"
                onClick={cancelInFlight}
                className="chat-input-send cmk-stop-btn"
                aria-label="Cancel"
                title="Cancel (Esc)"
              >
                <span className="cmk-stop-square" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                className="chat-input-send"
                aria-label="Send"
                disabled={!input.trim() && pending.length === 0}
                style={{ opacity: !input.trim() && pending.length === 0 ? 0.4 : 1 }}
              >{icons.send}</button>
            )}
          </div>
        </form>
      </section>

      {scopeHidden && <RevealTab side="right" label="In scope" onReveal={() => show("scope")} />}

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)}>
        <div className="cmk-shortcuts-head">
          <div className="cmk-tp-modal-cat">Keyboard</div>
          <div className="cmk-tp-modal-h">Shortcuts</div>
        </div>
        <div className="cmk-shortcuts-body">
          {[
            { keys: ["⌘", "K"], label: "Focus the input bar" },
            { keys: ["⌘", "/"], label: "Focus the input bar (alt)" },
            { keys: ["⌘", "\\"], label: "Toggle the Delegations rail" },
            { keys: ["⌘", "."], label: "Toggle the In-scope dock" },
            { keys: ["⌘", "⇧", "N"], label: "Start a new thread" },
            { keys: ["⏎"], label: "Send the message" },
            { keys: ["⇧", "⏎"], label: "Newline in the message" },
            { keys: ["/"], label: "Slash commands (in the input)" },
            { keys: ["Esc"], label: "Cancel an in-flight request / close overlay" },
            { keys: ["?"], label: "Open this overlay" },
          ].map((row, i) => (
            <div key={i} className="cmk-shortcut-row">
              <div className="cmk-shortcut-keys">
                {row.keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </div>
              <div className="cmk-shortcut-label">{row.label}</div>
            </div>
          ))}
          <div className="cmk-shortcut-foot">Right-click is a delegate path on every panel — try it on a thread, a tool call, or the scope dock.</div>
        </div>
      </Modal>

      {!scopeHidden && (
        <aside className="cmk-panel cmk-scope" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="cmk-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cmk-eyebrow">In scope</span>
              <span className="cmk-mode-pill">{layout.scope}</span>
            </div>
            <PaneControl
              mode={layout.scope}
              onCycle={() => cycle("scope")}
              onHide={() => hide("scope")}
            />
          </div>
          <ScopeDock
            pins={pins}
            onUnpin={removePin}
            onToggle={togglePin}
            onClearAll={clearPins}
            narrow={scopeNarrow}
          />
        </aside>
      )}
    </div>
    </PinboardContext.Provider>
  );
}
