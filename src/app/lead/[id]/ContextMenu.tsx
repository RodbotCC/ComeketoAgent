"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type ContextMenuItem =
  | { kind: "item"; label: string; onSelect: () => void; tone?: "default" | "danger" }
  | { kind: "divider" }
  | { kind: "label"; text: string };

/**
 * Right-click context menu primitive.
 *
 * Wraps any children. On contextmenu (right-click) inside the wrapped area,
 * pops a menu at the cursor position with the items provided. Closes on:
 * outside click, ESC, item select, or scroll/resize.
 */
export function ContextMenu({
  items,
  children,
  className,
}: {
  items: ContextMenuItem[];
  children: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  // Clamp menu to viewport.
  useEffect(() => {
    if (!pos || !menuRef.current) return;
    const el = menuRef.current;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let nx = pos.x;
    let ny = pos.y;
    if (nx + r.width > window.innerWidth - pad) nx = window.innerWidth - r.width - pad;
    if (ny + r.height > window.innerHeight - pad) ny = window.innerHeight - r.height - pad;
    if (nx !== pos.x || ny !== pos.y) {
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    }
  }, [pos]);

  return (
    <>
      <div
        className={className}
        onContextMenu={(e) => {
          e.preventDefault();
          setPos({ x: e.clientX, y: e.clientY });
        }}
      >
        {children}
      </div>
      {pos && (
        <div
          ref={menuRef}
          className="cme-cm"
          style={{ left: pos.x, top: pos.y }}
          role="menu"
        >
          {items.map((it, i) => {
            if (it.kind === "divider") return <div key={i} className="cme-cm-divider" />;
            if (it.kind === "label") return <div key={i} className="cme-cm-label">{it.text}</div>;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`cme-cm-item${it.tone === "danger" ? " cme-cm-item-danger" : ""}`}
                onClick={() => {
                  setPos(null);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
