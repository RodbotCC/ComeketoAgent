import { describe, expect, it } from "vitest";
import {
  leadPlanToManifest,
  automationDraftToManifest,
  manifestToMermaid,
} from "./workflow-manifest";
import type { SevenDayPlan } from "./plan";
import type { AutomationDraftRow } from "./automation-drafts";
import type { Workflow } from "@/components/AutomationCanvas";

const SAMPLE_PLAN: SevenDayPlan = {
  plan_id: "plan_abc",
  close_lead_id: "lead_xyz",
  cycle_started_at: "2026-05-04T00:00:00Z",
  generated_at: "2026-05-04T12:00:00Z",
  based_on_snapshot_id: "snap_123",
  status: "draft",
  primary_goal: "scheduled_call",
  goal_summary: "Get Andre on a call",
  lead_state_summary: "Warm",
  known_facts: ["VIP donor"],
  unknowns: ["Date locked?"],
  best_next_question: "Are you still considering Q3?",
  days: [
    {
      day: 1,
      objective: "soft outreach",
      required_actions: [{ channel: "sms", intent: "open the door" }],
      send_window: "morning",
      approval_status: "needs_review",
    },
    {
      day: 2,
      objective: "follow up",
      required_actions: [{ channel: "email", intent: "share menu" }],
      send_window: "afternoon",
      approval_status: "not_ready",
    },
    {
      day: 3,
      objective: "close the call",
      required_actions: [
        { channel: "sms", intent: "morning bump" },
        { channel: "call", intent: "Andre dials" },
      ],
      send_window: "all_day",
      approval_status: "not_ready",
    },
  ],
  stop_conditions: [{ trigger: "STOP signal", action: "halt" }],
  approval_required: true,
};

const SAMPLE_DRAFT: AutomationDraftRow = {
  id: "draft_001",
  name: "Morning Sweep",
  status: "draft",
  workflow_json: {
    id: "wf_local",
    name: "Morning Sweep",
    nodes: [
      { id: "trig", role: "trigger", kind: "cron", label: "8:45 AM", x: 0, y: 0 },
      { id: "agent", role: "actor", kind: "sub_agent", label: "Agent", x: 100, y: 0 },
      { id: "grid", role: "sink", kind: "grid_render", label: "Morning grid", x: 200, y: 0 },
    ],
    connections: [
      { id: "e1", src: "trig", dst: "agent", kind: "trigger", label: "fire" },
      { id: "e2", src: "agent", dst: "grid", kind: "data" },
    ],
  } satisfies Workflow,
  close_steps_json: null,
  risk_notes: null,
  close_sequence_id: null,
  operator_goal: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("leadPlanToManifest", () => {
  it("emits one node per plan day", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    expect(m.nodes).toHaveLength(3);
    expect(m.nodes.every((n) => n.role === "actor" && n.kind === "plan_day")).toBe(true);
  });

  it("connects days with sequential edges", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    expect(m.edges).toHaveLength(2);
    expect(m.edges[0].from).toBe(m.nodes[0].id);
    expect(m.edges[0].to).toBe(m.nodes[1].id);
    expect(m.edges[1].from).toBe(m.nodes[1].id);
    expect(m.edges[1].to).toBe(m.nodes[2].id);
  });

  it("sets lead scope, snapshot id, and source pointer", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    expect(m.scope).toBe("lead");
    expect(m.subject_id).toBe("lead_xyz");
    expect(m.based_on_snapshot_id).toBe("snap_123");
    expect(m.source).toEqual({ table: "lead_plans", plan_id: "plan_abc" });
  });

  it("preserves multi-touch days inside config.required_actions", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    const day3 = m.nodes[2];
    const actions = (day3.config.required_actions as unknown[]) ?? [];
    expect(actions).toHaveLength(2);
  });

  it("mirrors per-day approval_status onto the node", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    expect(m.nodes[0].approval_status).toBe("needs_review");
    expect(m.nodes[1].approval_status).toBe("not_ready");
  });

  it("keeps plan-level summary fields in metadata", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    expect(m.metadata.primary_goal).toBe("scheduled_call");
    expect(m.metadata.best_next_question).toBe("Are you still considering Q3?");
    expect(m.metadata.stop_conditions).toEqual([{ trigger: "STOP signal", action: "halt" }]);
  });
});

describe("automationDraftToManifest", () => {
  it("preserves node and edge counts", () => {
    const m = automationDraftToManifest(SAMPLE_DRAFT);
    expect(m.nodes).toHaveLength(3);
    expect(m.edges).toHaveLength(2);
  });

  it("renames src/dst → from/to on edges", () => {
    const m = automationDraftToManifest(SAMPLE_DRAFT);
    expect(m.edges[0].from).toBe("trig");
    expect(m.edges[0].to).toBe("agent");
    expect(m.edges[0].kind).toBe("trigger");
    expect(m.edges[0].label).toBe("fire");
  });

  it("lifts x/y into position", () => {
    const m = automationDraftToManifest(SAMPLE_DRAFT);
    expect(m.nodes[1].position).toEqual({ x: 100, y: 0 });
  });

  it("sets org scope and source pointer", () => {
    const m = automationDraftToManifest(SAMPLE_DRAFT);
    expect(m.scope).toBe("org");
    expect(m.subject_id).toBeNull();
    expect(m.based_on_snapshot_id).toBeNull();
    expect(m.source).toEqual({ table: "automation_drafts", draft_id: "draft_001" });
  });

  it("accepts both lead_plans and automation_drafts status enums in ManifestStatus", () => {
    // SAMPLE_DRAFT.status="draft" works (smoke). Manifest type is the union.
    const m = automationDraftToManifest({ ...SAMPLE_DRAFT, status: "needs_review" });
    expect(m.status).toBe("needs_review");
  });
});

describe("manifestToMermaid", () => {
  it("emits flowchart LR with one line per node and edge", () => {
    const m = automationDraftToManifest(SAMPLE_DRAFT);
    const out = manifestToMermaid(m);
    expect(out.startsWith("flowchart LR")).toBe(true);
    expect(out).toContain('trig{"8:45 AM"}'); // diamond shape for trigger role
    expect(out).toContain('agent(("Agent"))'); // double-paren for actor
    expect(out).toContain('grid["Morning grid"]'); // bracket for sink
    expect(out).toContain("trig -->|fire| agent");
    expect(out).toContain("agent --> grid");
  });

  it("lead-scoped mermaid uses actor shape per day", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    const out = manifestToMermaid(m);
    expect(out).toContain("flowchart LR");
    // Each day is rendered as an actor (double parens).
    expect(out.match(/\(\(/g)?.length).toBe(3);
    // Two sequential edges with "next day" label.
    expect((out.match(/-->\|next day\|/g) ?? []).length).toBe(2);
  });

  it("escapes mermaid-unsafe id characters", () => {
    const m = leadPlanToManifest(SAMPLE_PLAN);
    const out = manifestToMermaid(m);
    // plan_abc:day:0 → plan_abc_day_0 (colons become underscores)
    expect(out).toContain("plan_abc_day_0");
    expect(out).not.toContain("plan_abc:day:0");
  });
});
