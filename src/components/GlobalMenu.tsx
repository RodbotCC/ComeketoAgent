"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ITEMS: { label: string; href: string }[] = [
  { label: "console", href: "/console" },
  { label: "analytics", href: "/analytics" },
  { label: "heartbeat", href: "/heartbeat" },
  { label: "personal", href: "/personal" },
  { label: "briefing", href: "/briefing" },
];

export function GlobalMenu() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const anyActive = ITEMS.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cmk-utility-link"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          fontWeight: anyActive ? 600 : undefined,
          textDecoration: anyActive ? "underline" : "none",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Global ▾
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--paper, #fff)",
            border: "0.5px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "6px 0",
            minWidth: 140,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 100,
            fontSize: 12,
          }}
        >
          {ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "6px 14px",
                  color: active ? "#1a1a1a" : "#555",
                  fontWeight: active ? 600 : 400,
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
