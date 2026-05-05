"use client";

/**
 * Plan-as-graph view — renders the 7-day plan as a graph using the existing
 * AutomationCanvas. Each day is a node; sequential edges connect days.
 *
 * Shape per day: rotates through the canvas's 5 role shapes (actor / trigger
 * / transform / sink / state) so the day index reads as visual rhythm
 * rather than a wall of identical capsules.
 *
 * Click a day → inspector rail shows the full PlanDayCard, which carries
 * its OWN modal trigger (click the card → existing edit/refine/approve
 * flow). No duplicate UI, no need for a second editor.
 *
 * Simulate button calls /api/lead/[id]/plan/simulate and lights up each
 * day node green ("would fire") or yellow ("would skip") based on the
 * per-day verdict aggregate (any-touch fires → fire; else skip).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AutomationCanvas,
  type AutomationCanvasHandle,
  type Workflow,
  type WorkflowNode,
  type NodeRole,
} from "@/components/AutomationCanvas";
import { leadPlanToManifest } from "@/lib/workflow-manifest";
import { PlanDayCard } from "./PlanDayCard";
import type { SevenDayPlan } from "@/lib/plan";

type SimVerdict = {
  touch_index: number;
  channel: string;
  intent: string;
  fire: boolean;
  skip_code: string | null;
  reason: string | null;
};
type SimDay = {
  day_index: number;
  day_number: number;
  date: string;
  is_today: boolean;
  approval_status: string;
  verdicts: SimVerdict[];
};
type Simulation = {
  ran_at: string;
  would_fire: number;
  would_skip: number;
  skip_breakdown: Record<string, number>;
  days: SimDay[];
};

const DAY_X_STEP = 220;
const DAY_X_BASE = 120;
const DAY_Y = 240;

// Cycle through the canvas's five role shapes so each day reads distinctly.
// Order chosen for visual rhythm (alternating wide/narrow, geometric/round).
const DAY_ROLES: NodeRole[] = ["trigger", "actor", "transform", "sink", "state"];

const TONES = ["lavender", "sky", "sage", "lemon", "peach", "rose", "blue"] as const;

export function PlanGraphView({
  plan,
  leadId,
}: {
  plan: SevenDayPlan;
  leadId: string;
}) {
  const router = useRouter();
  const canvasRef = useRef<AutomationCanvasHandle>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cross-surface state sync: if the plan changes elsewhere (chat tool call,
  // cockpit Generate-plan button, /lead/[id] PlanSection action) OR the tab
  // regains focus, re-fetch the server-rendered plan via router.refresh().
  // PlanGraphView receives `plan` as a prop from the server component, so
  // refreshing the route re-runs loadLeadBoxPageData and bubbles up the
  // latest plan.
  useEffect(() => {
    function onVisibility() {
      if (typeof document !== "undefined" && !document.hidden) {
        router.refresh();
      }
    }
    function onPlanChanged(ev: Event) {
      const detail = (ev as CustomEvent<{ lead_id?: string }>).detail;
      if (!detail?.lead_id || detail.lead_id === leadId) {
        router.refresh();
        // Stale simulation no longer matches the refreshed plan.
        setSimulation(null);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("comeketo:plan-changed", onPlanChanged as EventListener);
    };
  }, [router, leadId]);

  // Build the Workflow shape AutomationCanvas consumes from the plan via
  // the shared leadPlanToManifest adapter. Lay days out linearly L→R with
  // shape-per-day cycling so the graph reads with rhythm, not as identical
  // capsules.
  const workflow: Workflow = useMemo(() => {
    const m = leadPlanToManifest(plan);
    const nodes: WorkflowNode[] = m.nodes.map((n, idx) => ({
      id: n.id,
      role: DAY_ROLES[idx % DAY_ROLES.length],
      kind: n.kind,
      label: n.label,
      x: DAY_X_BASE + idx * DAY_X_STEP,
      y: DAY_Y,
      config: n.config,
    }));
    return {
      id: m.id,
      name: m.name,
      nodes,
      connections: m.edges.map((e) => ({
        id: e.id,
        src: e.from,
        dst: e.to,
        kind: e.kind,
        label: e.label,
      })),
    };
  }, [plan]);

  // Per-day node state from the simulation: a day fires iff at least one
  // of its touches would fire; otherwise it's a skip. No simulation → no
  // state set (nodes render in their normal role tint).
  const nodeStates: Map<string, "fire" | "skip"> = useMemo(() => {
    const m = new Map<string, "fire" | "skip">();
    if (!simulation) return m;
    for (const d of simulation.days) {
      const nodeId = `${plan.plan_id}:day:${d.day_index}`;
      const anyFire = d.verdicts.some((v) => v.fire);
      m.set(nodeId, anyFire ? "fire" : "skip");
    }
    return m;
  }, [simulation, plan.plan_id]);

  const selectedDayIndex = (() => {
    if (!selected) return null;
    const cfg = selected.config as { day_number?: number } | undefined;
    return typeof cfg?.day_number === "number" ? cfg.day_number - 1 : null;
  })();

  async function runSimulate() {
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch(`/api/lead/${encodeURIComponent(leadId)}/plan/simulate`);
      const data = await res.json();
      if (data.ok && data.simulation) {
        setSimulation(data.simulation as Simulation);
      } else {
        setError(data.error || "simulate failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="lead-graph-wrap">
      <div className="lead-graph-toolbar">
        <div>
          <span className="cme-eyebrow">plan graph · {plan.days.length} days</span>
          <h2 className="lead-graph-title">{plan.primary_goal} cycle</h2>
        </div>
        <div className="lead-graph-toolbar-r">
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            onClick={runSimulate}
            disabled={simulating}
            title="Dry-run heartbeat — light up each day node by its verdict"
          >
            {simulating ? "simulating…" : simulation ? "Re-simulate" : "Simulate"}
          </button>
          {simulation && (
            <span className="lead-graph-sim-summary">
              <strong>{simulation.would_fire}</strong> would fire ·{" "}
              <strong>{simulation.would_skip}</strong> would skip
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="lead-error" style={{ marginBottom: 12 }}>
          <strong>Simulate failed:</strong> {error}
        </div>
      )}

      <div className="lead-graph-grid">
        <div className="lead-graph-canvas-wrap widget" style={{ padding: 8 }}>
          <AutomationCanvas
            ref={canvasRef}
            workflow={workflow}
            externalInspector
            onSelectionChange={setSelected}
            nodeStates={nodeStates}
          />
        </div>
        <aside className="lead-graph-inspector widget">
          {selectedDayIndex == null || !plan.days[selectedDayIndex] ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Click any day on the canvas to inspect it. Then click the day card to edit, approve, or refine — same modal as the chat cockpit.
            </p>
          ) : (
            <>
              <div className="cme-eyebrow" style={{ marginBottom: 8 }}>
                inspect · click the card to edit
              </div>
              <PlanDayCard
                key={`graph-card-${selectedDayIndex}`}
                day={plan.days[selectedDayIndex]}
                dayIndex={selectedDayIndex}
                tone={TONES[selectedDayIndex % TONES.length]}
                planId={plan.plan_id}
                leadId={leadId}
                goalSummary={plan.goal_summary}
                planStale={false}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
