"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutomationCanvas, type AutomationCanvasHandle, type Workflow, type WorkflowNode } from "./AutomationCanvas";
import { WORKFLOW_STUDIO_LIBRARY } from "./workflow-studio-data";

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.15, 1.35] as const;

const LS_THEME = "ag:studioTheme";
const LS_ZOOM = "ag:studioZoom";

function readLs(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function WorkflowStudio({ workflow }: { workflow: Workflow }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [canvasTheme, setCanvasTheme] = useState<"light" | "dark">("light");
  const [zoomIdx, setZoomIdx] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [pulseIdx, setPulseIdx] = useState(0);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const canvasRef = useRef<AutomationCanvasHandle>(null);

  const onCanvasSelection = useCallback((node: WorkflowNode | null) => {
    setSelectedNode(node);
    if (node) setInspectorOpen(true);
  }, []);

  useEffect(() => {
    const t = readLs(LS_THEME, "light");
    setCanvasTheme(t === "dark" ? "dark" : "light");
    const z = parseInt(readLs(LS_ZOOM, "2"), 10);
    if (z >= 0 && z < ZOOM_LEVELS.length) setZoomIdx(z);
  }, []);

  const toggleTheme = useCallback(() => {
    setCanvasTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      try {
        localStorage.setItem(LS_THEME, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const scale = ZOOM_LEVELS[zoomIdx] ?? 1;

  const zoomIn = useCallback(() => {
    setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomIdx((i) => Math.max(0, i - 1));
  }, []);
  const zoomReset = useCallback(() => setZoomIdx(2), []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ZOOM, String(zoomIdx));
    } catch {
      /* ignore */
    }
  }, [zoomIdx]);

  const nodeOrder = useMemo(() => workflow.nodes.map((n) => n.id), [workflow.nodes]);
  const pulseId = playing && nodeOrder.length ? nodeOrder[pulseIdx % nodeOrder.length]! : null;

  useEffect(() => {
    if (!playing || nodeOrder.length === 0) return;
    const t = window.setInterval(() => setPulseIdx((i) => i + 1), 880);
    return () => clearInterval(t);
  }, [playing, nodeOrder.length]);

  useEffect(() => {
    if (!playing) setPulseIdx(0);
  }, [playing]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const clearSelection = useCallback(() => {
    canvasRef.current?.clearSelection();
    setSelectedNode(null);
  }, []);

  return (
    <div
      className={`ag-studio${canvasTheme === "dark" ? " ag-studio-dark" : ""}`}
      data-zoom-idx={zoomIdx}
    >
      <header className="ag-studio-header">
        <div className="ag-studio-header-l">
          <div className="ag-studio-header-row">
            <h1 className="ag-studio-title">{workflow.name}</h1>
            <Link href="/automation" className="ag-studio-header-link">
              Sequences
            </Link>
          </div>
          <p className="ag-studio-tagline muted">Demo canvas · not executed against live Close data</p>
        </div>
      </header>

      <div className="ag-studio-body">
        <button
          type="button"
          className={`ag-studio-rail-tab${libraryOpen ? " ag-studio-rail-tab-open" : ""}`}
          onClick={() => setLibraryOpen((v) => !v)}
          aria-expanded={libraryOpen ? "true" : "false"}
        >
          LIBRARY
        </button>

        {libraryOpen && (
          <aside className="ag-studio-library widget scroll-hide" aria-label="Node library">
            <div className="ag-studio-library-h">Templates</div>
            <p className="ag-studio-library-note muted">
              Reference shapes from the legacy composer. Drag-and-add is not wired in this app yet.
            </p>
            <div className="ag-studio-library-scroll scroll-hide">
              {WORKFLOW_STUDIO_LIBRARY.map((sec) => (
                <section key={sec.role} className="ag-studio-lib-sec">
                  <div className="ag-studio-lib-sec-title">{sec.title}</div>
                  <ul className="ag-studio-lib-list">
                    {sec.items.map((it) => (
                      <li key={it.kind} className="ag-studio-lib-item">
                        <span className="ag-studio-lib-glyph" aria-hidden>
                          {it.glyph}
                        </span>
                        <span className="ag-studio-lib-label">{it.label}</span>
                        <span className="ag-studio-lib-sub muted">{it.sub}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
        )}

        <div className="ag-studio-canvas-wrap">
          <div
            className="ag-studio-zoom-inner"
            style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%" }}
          >
            <AutomationCanvas
              ref={canvasRef}
              workflow={workflow}
              pulseNodeId={pulseId}
              externalInspector
              onSelectionChange={onCanvasSelection}
            />
          </div>
        </div>

        {inspectorOpen && (
          <aside className="ag-studio-inspector widget scroll-hide" aria-label="Inspector">
            <div className="ag-studio-inspector-h">Inspector</div>
            {selectedNode ? (
              <div className="ag-studio-inspector-body">
                <div className="ag-inspector-eyebrow">
                  {selectedNode.role} · {selectedNode.kind}
                </div>
                <h3 className="ag-inspector-h">{selectedNode.label}</h3>
                {selectedNode.description && (
                  <p className="ag-inspector-desc">{selectedNode.description}</p>
                )}
                {selectedNode.config && Object.keys(selectedNode.config).length > 0 && (
                  <>
                    <div className="ag-inspector-eyebrow ag-studio-inspector-gap">config</div>
                    <pre className="ag-inspector-config">
                      {JSON.stringify(selectedNode.config, null, 2)}
                    </pre>
                  </>
                )}
                {selectedNode.notes && (
                  <>
                    <div className="ag-inspector-eyebrow ag-studio-inspector-gap">notes</div>
                    <p className="ag-inspector-desc ag-inspector-notes">{selectedNode.notes}</p>
                  </>
                )}
                <button type="button" className="ag-studio-inspector-clear" onClick={clearSelection}>
                  Clear selection
                </button>
              </div>
            ) : (
              <p className="ag-studio-inspector-empty muted">Click a node on the canvas to see details here.</p>
            )}
          </aside>
        )}

        <button
          type="button"
          className={`ag-studio-rail-tab ag-studio-rail-tab-right${inspectorOpen ? " ag-studio-rail-tab-open" : ""}`}
          onClick={() => setInspectorOpen((v) => !v)}
          aria-expanded={inspectorOpen ? "true" : "false"}
        >
          INSPECTOR
        </button>
      </div>

      <footer className="ag-studio-footer">
        <span className="ag-studio-crumb">grid · morning / automation</span>
        <div className="ag-studio-toolbar-center">
          <button
            type="button"
            className={`ag-studio-tool${playing ? " ag-studio-tool-on" : ""}`}
            onClick={togglePlay}
            title="Step highlight through nodes"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="ag-studio-tool" onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button type="button" className="ag-studio-tool" onClick={zoomReset} title="Reset zoom">
            1:1
          </button>
          <button type="button" className="ag-studio-tool" onClick={zoomIn} title="Zoom in">
            +
          </button>
          <button type="button" className="ag-studio-tool" onClick={toggleTheme} title="Canvas light / dark">
            Theme
          </button>
        </div>
        <span className="ag-studio-zoom-label muted">{Math.round(scale * 100)}%</span>
      </footer>
    </div>
  );
}
