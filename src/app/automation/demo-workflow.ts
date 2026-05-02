import type { Workflow } from "./AutomationCanvas";

/**
 * Dev-only layout sandbox — not live Close data (Guardrails §M2). Shipped UI must
 * not imply this graph executes. Import only from `NODE_ENV === "development"` blocks.
 */
export const DEMO_WORKFLOW: Workflow = {
  id: "wf_morning_sweep",
  slug: "morning-sweep",
  name: "Morning Sweep → Grid v1",
  nodes: [
    { id: "n_trg_dawn", role: "trigger", kind: "cron", label: "8:45 AM…", x: 160, y: 200, config: { cron: "45 8 * * *", tz: "America/New_York" }, notes: "Fires at dawn, weekdays and weekends alike.", description: "The day opens. A cron clock fires and wakes the workflow." },
    { id: "n_sto_inbox", role: "state", kind: "inbox", label: "Inbox", x: 160, y: 380, config: { path: "_inbox/inbox.jsonl" }, notes: "Yesterday's residue — notes, commits, drifts.", description: "Yesterday's residue — notes, commits, and drifts — waits to be swept up." },
    { id: "n_act_agent", role: "actor", kind: "sub_agent", label: "Agent", x: 400, y: 280, config: { model: "claude-sonnet-4-6", register: "intimate" }, notes: "Reads the trigger + inbox residue, writes the grid.", description: "The agent reads yesterday's residue and decides what today should look like." },
    { id: "n_xf_reflect", role: "transform", kind: "reflect", label: "Reflection", x: 640, y: 200, config: { schema: "grid_cell_v1", max_cells: 9 }, notes: "Turns raw state into 9 named cells.", description: "Raw thinking becomes nine named cells, ready to render as the morning grid." },
    { id: "n_sto_ledger", role: "state", kind: "ledger", label: "Activity", x: 640, y: 380, config: { path: "_ledger/activity.jsonl" }, notes: "Audit trail (append-only JSONL).", description: "Every pass leaves a trace in the append-only activity ledger." },
    { id: "n_snk_grid", role: "sink", kind: "grid_render", label: "Morning grid", x: 880, y: 200, config: { grid_id: "morning" }, notes: "The 3×3 that Jake sees at open.", description: "The 3×3 morning grid lands in the UI — the first thing Jake sees." },
    { id: "n_snk_slack", role: "sink", kind: "slack_post", label: "Team Slack", x: 880, y: 340, config: { channel: "#comeketo-ops" }, notes: "Briefs the team on the day's shape.", description: "If the day has heat, the team gets a Slack brief." },
  ],
  connections: [
    { id: "c_trg_rod", src: "n_trg_dawn", dst: "n_act_agent", kind: "trigger", label: "fire" },
    { id: "c_inbox_rod", src: "n_sto_inbox", dst: "n_act_agent", kind: "reference", label: "read" },
    { id: "c_rod_reflect", src: "n_act_agent", dst: "n_xf_reflect", kind: "data", label: "raw state" },
    { id: "c_reflect_led", src: "n_xf_reflect", dst: "n_sto_ledger", kind: "data", label: "append" },
    { id: "c_reflect_grid", src: "n_xf_reflect", dst: "n_snk_grid", kind: "data" },
    { id: "c_reflect_slack", src: "n_xf_reflect", dst: "n_snk_slack", kind: "conditional", label: "if interesting" },
  ],
};
