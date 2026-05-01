"use client";

/**
 * Automation graph canvas — read-only first cut.
 *
 * Renders a workflow (nodes + connections) as SVG. Five node shapes
 * (capsule/diamond/hexagon/rounded/stacked) keyed off node.role, with
 * orthogonal Manhattan-routed edges and per-edge-kind styling.
 *
 * Ported from CC Agent's automation.jsx. Future rounds add: library
 * click-to-add, drag-to-move, drag-to-connect, inspector, persistence,
 * chat-emitted workflow JSON ingestion.
 */

import { useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type NodeRole = "actor" | "trigger" | "transform" | "sink" | "state";

export type WorkflowNode = {
  id: string;
  role: NodeRole;
  kind: string;
  label: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
  notes?: string;
  description?: string;
  annotations?: unknown[];
};

export type EdgeKind = "data" | "trigger" | "reference" | "observe" | "conditional" | "live" | "invalid";

export type WorkflowEdge = {
  id: string;
  src: string;
  dst: string;
  kind: EdgeKind;
  label?: string;
  description?: string;
};

export type Workflow = {
  id: string;
  slug?: string;
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowEdge[];
};

// ─── Node taxonomy ────────────────────────────────────────────────────────

const NODE_DIMS: Record<NodeRole, { w: number; h: number; shape: string }> = {
  actor:     { w: 80,  h: 64, shape: "capsule" },
  trigger:   { w: 72,  h: 72, shape: "diamond" },
  transform: { w: 88,  h: 64, shape: "hexagon" },
  sink:      { w: 120, h: 60, shape: "rounded" },
  state:     { w: 88,  h: 64, shape: "stacked" },
};

function endpointOffsets(role: NodeRole) {
  const d = NODE_DIMS[role];
  return { dx: d.w / 2, dy: 0 };
}

const NODE_LABEL_CHAR_LIMITS: Record<NodeRole, number> = {
  actor: 11, trigger: 9, transform: 12, sink: 16, state: 12,
};

function truncateLabel(label: string, role: NodeRole) {
  const limit = NODE_LABEL_CHAR_LIMITS[role] ?? 12;
  if (label.length <= limit) return label;
  return label.slice(0, Math.max(1, limit - 1)) + "…";
}

// Glyphs by kind — pulled from CC Agent LIBRARY.
const KIND_GLYPHS: Record<string, string> = {
  // actors
  rodbot: "◉", human: "◐", andre: "▲", sub_agent: "◎", customer: "♛", external_api: "⧉",
  // triggers
  cron: "⧗", webhook: "⌁", mcp_event: "◈", manual: "✦", interval: "↻", file_watch: "⌥",
  // transforms
  llm_call: "✺", filter: "▽", reflect: "◯", score: "☆", format: "§", extract: "⎔", merge: "⋈", sort: "↕",
  // sinks
  slack_post: "#", email_send: "✉", sms_send: "⌨", grid_render: "▤", file_write: "↓",
  webhook_out: "⇥", dashboard: "▨",
  // state
  inbox: "▣", ledger: "≡", memory: "◉", people: "▦", threads: "╎", cache: "⊡", vector_index: "⋮",
};

// ─── Geometry: orthogonal Manhattan routing ───────────────────────────────

function orthogonalPath(sx: number, sy: number, dx: number, dy: number): string {
  const r = 8;
  if (Math.abs(dy - sy) < 1) return `M ${sx} ${sy} L ${dx} ${dy}`;
  const dir = sy < dy ? 1 : -1;
  if (dx > sx + 40) {
    const mx = (sx + dx) / 2;
    return [
      `M ${sx} ${sy}`,
      `L ${mx - r} ${sy}`,
      `Q ${mx} ${sy} ${mx} ${sy + dir * r}`,
      `L ${mx} ${dy - dir * r}`,
      `Q ${mx} ${dy} ${mx + r} ${dy}`,
      `L ${dx} ${dy}`,
    ].join(" ");
  }
  const jut = 28;
  const midY = (sy + dy) / 2;
  const ax = sx + jut;
  const bx = dx - jut;
  return [
    `M ${sx} ${sy}`,
    `L ${ax - r} ${sy}`,
    `Q ${ax} ${sy} ${ax} ${sy + dir * r}`,
    `L ${ax} ${midY - dir * r}`,
    `Q ${ax} ${midY} ${ax - r} ${midY}`,
    `L ${bx + r} ${midY}`,
    `Q ${bx} ${midY} ${bx} ${midY + dir * r}`,
    `L ${bx} ${dy - dir * r}`,
    `Q ${bx} ${dy} ${bx + r} ${dy}`,
    `L ${dx} ${dy}`,
  ].join(" ");
}

// ─── Node shapes ──────────────────────────────────────────────────────────

function NodeShape({ role }: { role: NodeRole }) {
  const d = NODE_DIMS[role];
  switch (d.shape) {
    case "capsule":
      return <rect className="ag-shape" x={-d.w/2} y={-d.h/2} width={d.w} height={d.h} rx={d.h/2} ry={d.h/2} />;
    case "diamond": {
      const h = d.h/2;
      return <path className="ag-shape" d={`M 0 ${-h} L ${h} 0 L 0 ${h} L ${-h} 0 Z`} />;
    }
    case "hexagon": {
      const w = d.w/2, h = d.h/2, inset = 22;
      return <path className="ag-shape" d={`M ${-w} 0 L ${-w+inset} ${-h} L ${w-inset} ${-h} L ${w} 0 L ${w-inset} ${h} L ${-w+inset} ${h} Z`} />;
    }
    case "rounded":
      return <rect className="ag-shape" x={-d.w/2} y={-d.h/2} width={d.w} height={d.h} rx={12} ry={12} />;
    case "stacked":
      return (
        <g>
          <rect className="ag-shape ag-shape-back" x={-d.w/2 + 5} y={-d.h/2 - 5} width={d.w - 10} height={d.h - 10} rx={6} ry={6} />
          <rect className="ag-shape" x={-d.w/2} y={-d.h/2} width={d.w} height={d.h - 4} rx={6} ry={6} />
          <line className="ag-shape-rule" x1={-d.w/2 + 10} y1={-d.h/2 + 12} x2={d.w/2 - 10} y2={-d.h/2 + 12} />
        </g>
      );
    default:
      return null;
  }
}

function SelectionRing({ role }: { role: NodeRole }) {
  const d = NODE_DIMS[role];
  const pad = 6;
  if (d.shape === "diamond") {
    const h = d.h/2 + pad;
    return <path className="ag-selection-ring" d={`M 0 ${-h} L ${h} 0 L 0 ${h} L ${-h} 0 Z`} />;
  }
  if (d.shape === "hexagon") {
    const w = d.w/2 + pad, h = d.h/2 + pad, inset = 22;
    return <path className="ag-selection-ring" d={`M ${-w} 0 L ${-w+inset} ${-h} L ${w-inset} ${-h} L ${w} 0 L ${w-inset} ${h} L ${-w+inset} ${h} Z`} />;
  }
  const rx = d.shape === "capsule" ? (d.h + pad*2)/2 : 14;
  return <rect className="ag-selection-ring" x={-d.w/2 - pad} y={-d.h/2 - pad} width={d.w + pad*2} height={d.h + pad*2} rx={rx} ry={rx} />;
}

// ─── Node ─────────────────────────────────────────────────────────────────

function GraphNode({
  node,
  selected,
  onSelect,
}: {
  node: WorkflowNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const off = endpointOffsets(node.role);
  const glyph = KIND_GLYPHS[node.kind] || "·";
  return (
    <g
      className={"ag-node" + (selected ? " selected" : "")}
      data-role={node.role}
      transform={`translate(${node.x} ${node.y})`}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      style={{ cursor: "pointer" }}
    >
      <SelectionRing role={node.role} />
      <NodeShape role={node.role} />
      <text className="ag-glyph" x={0} y={-6}>{glyph}</text>
      <text className="ag-label" x={0} y={14}>
        {truncateLabel(node.label, node.role)}
        <title>{node.label}</title>
      </text>
      <circle className="ag-endpoint" cx={-off.dx} cy={0} r={3} />
      <circle className="ag-endpoint" cx={ off.dx} cy={0} r={3} />
    </g>
  );
}

// ─── Edge ─────────────────────────────────────────────────────────────────

function ConnectionPath({
  conn,
  nodes,
}: {
  conn: WorkflowEdge;
  nodes: WorkflowNode[];
}) {
  const src = nodes.find(n => n.id === conn.src);
  const dst = nodes.find(n => n.id === conn.dst);
  if (!src || !dst) return null;
  const so = endpointOffsets(src.role);
  const dO = endpointOffsets(dst.role);
  const sx = src.x + so.dx, sy = src.y;
  const dx = dst.x - dO.dx, dy = dst.y;
  const path = orthogonalPath(sx, sy, dx, dy);
  const midX = (sx + dx) / 2;
  const midY = (sy + dy) / 2;
  const label = (conn.label || "").trim();
  const labelW = label ? Math.min(160, 14 + Math.max(label.length, 3) * 6.2) : 0;
  const markerEnd = conn.kind === "trigger" ? "url(#ag-arrow-trigger)" : undefined;
  return (
    <g className="ag-edge">
      <path className="ag-link" data-kind={conn.kind} d={path} markerEnd={markerEnd} />
      {label && (
        <g transform={`translate(${midX} ${midY})`}>
          <rect className="ag-edge-label-bg" x={-labelW / 2} y={-9} width={labelW} height={18} rx={4} ry={4} />
          <text className="ag-edge-label" x={0} y={0} textAnchor="middle" dominantBaseline="central">
            {label.length > 24 ? label.slice(0, 23) + "…" : label}
            <title>{label}</title>
          </text>
        </g>
      )}
      {conn.kind === "conditional" && (
        <polygon
          className="ag-edge-diamond"
          points={`${midX},${midY - (label ? 18 : 8)} ${midX + 7},${midY - (label ? 11 : 1)} ${midX},${midY - (label ? 4 : 6) + 2} ${midX - 7},${midY - (label ? 11 : 1)}`}
        />
      )}
    </g>
  );
}

// ─── Main canvas ──────────────────────────────────────────────────────────

export function AutomationCanvas({ workflow }: { workflow: Workflow }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Compute viewBox bounds from node positions so the canvas auto-fits.
  const bounds = useMemo(() => {
    if (workflow.nodes.length === 0) return { x: 0, y: 0, w: 800, h: 400 };
    const xs = workflow.nodes.map(n => n.x);
    const ys = workflow.nodes.map(n => n.y);
    const pad = 100;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    const w = (Math.max(...xs) - Math.min(...xs)) + pad * 2;
    const h = (Math.max(...ys) - Math.min(...ys)) + pad * 2;
    return { x, y, w: Math.max(w, 400), h: Math.max(h, 300) };
  }, [workflow.nodes]);

  const selectedNode = selected ? workflow.nodes.find(n => n.id === selected) : null;

  return (
    <div className="ag-canvas-frame">
      <svg
        className="ag-canvas"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={() => setSelected(null)}
      >
        <defs>
          <marker id="ag-arrow-trigger" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
          <pattern id="ag-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" />
          </pattern>
        </defs>
        <rect className="ag-grid-bg" x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="url(#ag-grid)" />
        {workflow.connections.map(c => (
          <ConnectionPath key={c.id} conn={c} nodes={workflow.nodes} />
        ))}
        {workflow.nodes.map(n => (
          <GraphNode key={n.id} node={n} selected={selected === n.id} onSelect={setSelected} />
        ))}
      </svg>
      {selectedNode && (
        <aside className="ag-inspector">
          <div className="ag-inspector-eyebrow">{selectedNode.role} · {selectedNode.kind}</div>
          <h3 className="ag-inspector-h">{selectedNode.label}</h3>
          {selectedNode.description && (
            <p className="ag-inspector-desc">{selectedNode.description}</p>
          )}
          {selectedNode.config && Object.keys(selectedNode.config).length > 0 && (
            <>
              <div className="ag-inspector-eyebrow" style={{ marginTop: 16 }}>config</div>
              <pre className="ag-inspector-config">
                {JSON.stringify(selectedNode.config, null, 2)}
              </pre>
            </>
          )}
          {selectedNode.notes && (
            <>
              <div className="ag-inspector-eyebrow" style={{ marginTop: 16 }}>notes</div>
              <p className="ag-inspector-desc" style={{ fontStyle: "italic" }}>{selectedNode.notes}</p>
            </>
          )}
          <button className="ag-inspector-close" onClick={() => setSelected(null)} aria-label="close">×</button>
        </aside>
      )}
    </div>
  );
}
