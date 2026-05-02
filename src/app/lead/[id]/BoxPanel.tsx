"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { useToast } from "@/components/Toast";

/**
 * Serializable menu prop — server components can pass these from page.tsx
 * because there are no functions in the shape. The client component below
 * converts each entry into a real ContextMenuItem with a live onSelect.
 */
export type BoxPanelMenuAction =
  | { kind: "label"; text: string }
  | { kind: "divider" }
  | {
      kind: "item";
      label: string;
      tone?: "default" | "danger";
      action:
        | { type: "open_expanded" }
        | { type: "open_url"; url: string }
        | { type: "copy"; text: string };
    };

/**
 * Reusable wrapper that gives any Box panel:
 *  - click-to-expand modal
 *  - right-click context menu
 *
 * Pass `summary` (the inline rendering) and `expanded` (the modal body).
 * `menu` is an optional list of declarative actions (no functions, so it
 * crosses the server/client boundary cleanly).
 */
export function BoxPanel({
  title,
  eyebrow,
  summary,
  expanded,
  menu,
  hint,
  index = 0,
}: {
  title: string;
  eyebrow?: string;
  summary: ReactNode;
  expanded: ReactNode;
  menu?: BoxPanelMenuAction[];
  hint?: string;
  /** Position in a sibling group — drives staggered entrance keyframe delay. */
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  function resolveAction(action: Extract<BoxPanelMenuAction, { kind: "item" }>["action"], label: string): () => void {
    switch (action.type) {
      case "open_expanded":
        return () => setOpen(true);
      case "open_url":
        return () => window.open(action.url, "_blank", "noreferrer");
      case "copy":
        return () => {
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(action.text).then(
              () => toast.push(`${label} copied`, { tone: "success" }),
              () => toast.push("Copy failed", { tone: "error" })
            );
          }
        };
    }
  }

  const defaultItems: ContextMenuItem[] = [
    { kind: "label", text: title },
    { kind: "item", label: "Open expanded view", onSelect: () => setOpen(true) },
  ];

  const items: ContextMenuItem[] = menu
    ? menu.map<ContextMenuItem>((m) => {
        if (m.kind === "label") return { kind: "label", text: m.text };
        if (m.kind === "divider") return { kind: "divider" };
        return {
          kind: "item",
          label: m.label,
          tone: m.tone,
          onSelect: resolveAction(m.action, m.label),
        };
      })
    : defaultItems;

  return (
    <>
      <ContextMenu items={items}>
        <div
          className="lead-card widget box-panel"
          style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
          onClick={() => setOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          title={hint || `Click to expand · right-click for actions`}
        >
          <h3 className="lead-card-h">{eyebrow || title}</h3>
          {summary}
        </div>
      </ContextMenu>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`box-panel-h-${title}`}>
        <div className="plan-day-modal">
          <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
            <span className="cme-eyebrow">{eyebrow || "panel"}</span>
            <h2 id={`box-panel-h-${title}`} className="plan-day-modal-title">{title}</h2>
          </header>
          <div className="plan-day-modal-body">{expanded}</div>
        </div>
      </Modal>
    </>
  );
}
