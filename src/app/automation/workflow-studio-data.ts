/** Static catalog for workflow studio (mirrors CC Agent `LIBRARY`; compose-only reference). */
export const WORKFLOW_STUDIO_LIBRARY: Array<{
  role: string;
  title: string;
  items: Array<{ kind: string; label: string; sub: string; glyph: string }>;
}> = [
  {
    role: "actor",
    title: "Actors",
    items: [
      { kind: "llm_call", label: "AI agent", sub: "model step", glyph: "✺" },
      { kind: "human", label: "Human operator", sub: "manual step", glyph: "◐" },
      { kind: "andre", label: "Salesperson", sub: "people/*.json", glyph: "▲" },
      { kind: "sub_agent", label: "Sub-agent", sub: "delegated", glyph: "◎" },
      { kind: "customer", label: "Customer", sub: "buyer-side", glyph: "♛" },
      { kind: "external_api", label: "External API", sub: "third-party", glyph: "⧉" },
    ],
  },
  {
    role: "trigger",
    title: "Triggers",
    items: [
      { kind: "cron", label: "Cron schedule", sub: "time-based", glyph: "⧗" },
      { kind: "webhook", label: "Webhook", sub: "inbound http", glyph: "⌁" },
      { kind: "mcp_event", label: "MCP event", sub: "connector", glyph: "◈" },
      { kind: "manual", label: "Manual", sub: "user action", glyph: "✦" },
      { kind: "interval", label: "Interval", sub: "every N sec", glyph: "↻" },
      { kind: "file_watch", label: "File watcher", sub: "on change", glyph: "⌥" },
    ],
  },
  {
    role: "transform",
    title: "Transforms",
    items: [
      { kind: "llm_call", label: "LLM call", sub: "claude / openai", glyph: "✺" },
      { kind: "filter", label: "Filter", sub: "condition gate", glyph: "▽" },
      { kind: "reflect", label: "Reflection", sub: "structured json", glyph: "◯" },
      { kind: "score", label: "Score", sub: "priority", glyph: "☆" },
      { kind: "format", label: "Format", sub: "template", glyph: "§" },
      { kind: "extract", label: "Extract", sub: "pull fields", glyph: "⎔" },
      { kind: "merge", label: "Merge", sub: "combine", glyph: "⋈" },
      { kind: "sort", label: "Sort", sub: "reorder", glyph: "↕" },
    ],
  },
  {
    role: "sink",
    title: "Sinks",
    items: [
      { kind: "slack_post", label: "Slack post", sub: "#channel", glyph: "#" },
      { kind: "email_send", label: "Email send", sub: "via smtp", glyph: "✉" },
      { kind: "sms_send", label: "SMS / WhatsApp", sub: "twilio", glyph: "⌨" },
      { kind: "grid_render", label: "Grid render", sub: "ui view", glyph: "▤" },
      { kind: "file_write", label: "File write", sub: "json / log", glyph: "↓" },
      { kind: "webhook_out", label: "Webhook out", sub: "outbound http", glyph: "⇥" },
      { kind: "dashboard", label: "Dashboard", sub: "analytics", glyph: "▨" },
    ],
  },
  {
    role: "state",
    title: "State stores",
    items: [
      { kind: "inbox", label: "Inbox", sub: "_inbox/", glyph: "▣" },
      { kind: "ledger", label: "Activity", sub: "_ledger/", glyph: "≡" },
      { kind: "memory", label: "Memory", sub: "agent mem", glyph: "◉" },
      { kind: "people", label: "People DB", sub: "people/*", glyph: "▦" },
      { kind: "threads", label: "Threads", sub: "threads/*", glyph: "╎" },
      { kind: "cache", label: "Cache", sub: "ephemeral", glyph: "⊡" },
      { kind: "vector_index", label: "Vector index", sub: "embeddings", glyph: "⋮" },
    ],
  },
];
