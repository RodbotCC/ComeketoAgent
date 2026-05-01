import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { AutomationCanvas, type Workflow } from "./AutomationCanvas";

/**
 * Demo workflow — Morning Sweep → Grid.
 * Same shape as `comeketo.automation_graph.v1` from CC Agent. Will be
 * replaced by Supabase-loaded workflows once persistence lands.
 */
const DEMO_WORKFLOW: Workflow = {
  id: "wf_morning_sweep",
  slug: "morning-sweep",
  name: "Morning Sweep → Grid",
  nodes: [
    { id: "n_trg_dawn",   role: "trigger",   kind: "cron",        label: "6:45 AM daily", x: 160, y: 200, config: { cron: "45 6 * * *", tz: "America/New_York" }, notes: "Fires at dawn, weekdays and weekends alike.", description: "The day opens. A cron clock fires at 6:45 AM and wakes the workflow." },
    { id: "n_sto_inbox",  role: "state",     kind: "inbox",       label: "Inbox",         x: 160, y: 380, config: { path: "_inbox/inbox.jsonl" }, notes: "Yesterday's residue — notes, commits, drifts.", description: "Yesterday's residue — notes, commits, and drifts — waits to be swept up." },
    { id: "n_act_rodbot", role: "actor",     kind: "rodbot",      label: "Rodbot",        x: 400, y: 280, config: { model: "claude-sonnet-4-6", register: "intimate" }, notes: "Reads the trigger + inbox residue, writes the grid.", description: "Rodbot reads yesterday's residue and decides what today should look like." },
    { id: "n_xf_reflect", role: "transform", kind: "reflect",     label: "Reflection",    x: 640, y: 200, config: { schema: "grid_cell_v1", max_cells: 9 }, notes: "Turns raw state into 9 named cells.", description: "Raw thinking becomes nine named cells, ready to render as the morning grid." },
    { id: "n_sto_ledger", role: "state",     kind: "ledger",      label: "Activity",      x: 640, y: 380, config: { path: "_ledger/activity.jsonl" }, notes: "Audit trail (append-only JSONL).", description: "Every pass leaves a trace in the append-only activity ledger." },
    { id: "n_snk_grid",   role: "sink",      kind: "grid_render", label: "Morning grid",  x: 880, y: 200, config: { grid_id: "morning" }, notes: "The 3×3 that Jake sees at open.", description: "The 3×3 morning grid lands in the UI — the first thing Jake sees." },
    { id: "n_snk_slack",  role: "sink",      kind: "slack_post",  label: "Team Slack",    x: 880, y: 340, config: { channel: "#comeketo-ops" }, notes: "Briefs the team on the day's shape.", description: "If the day has heat, the team gets a Slack brief." },
  ],
  connections: [
    { id: "c_trg_rod",       src: "n_trg_dawn",   dst: "n_act_rodbot", kind: "trigger",     label: "fire" },
    { id: "c_inbox_rod",     src: "n_sto_inbox",  dst: "n_act_rodbot", kind: "reference",   label: "read" },
    { id: "c_rod_reflect",   src: "n_act_rodbot", dst: "n_xf_reflect", kind: "data",        label: "raw state" },
    { id: "c_reflect_led",   src: "n_xf_reflect", dst: "n_sto_ledger", kind: "data",        label: "append" },
    { id: "c_reflect_grid",  src: "n_xf_reflect", dst: "n_snk_grid",   kind: "data" },
    { id: "c_reflect_slack", src: "n_xf_reflect", dst: "n_snk_slack",  kind: "conditional", label: "if interesting" },
  ],
};

export default function AutomationPage() {
  return (
    <div className="cme-shell">
      <AppHeader wordmarkHref="/" />
      <TabNav active="automation" />

      <main className="ag-main">
        <div className="ag-toolbar">
          <div className="ag-toolbar-l">
            <span className="cme-eyebrow">workflow</span>
            <h1 className="ag-title">{DEMO_WORKFLOW.name}</h1>
          </div>
          <div className="ag-toolbar-r">
            <span className="ag-toolbar-meta">{DEMO_WORKFLOW.nodes.length} nodes · {DEMO_WORKFLOW.connections.length} edges</span>
          </div>
        </div>
        <AutomationCanvas workflow={DEMO_WORKFLOW} />
      </main>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 28px",
          fontSize: 10.5,
          color: "var(--ink-faint)",
          flexShrink: 0,
          borderTop: "0.5px solid rgba(0,0,0,0.05)",
        }}
      >
        <span>graph · read-only</span>
        <span>
          comeketo.automation_graph.v1{" "}
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>· Comeketo Agent</span>
        </span>
      </footer>
    </div>
  );
}
