"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reusable modal primitive: backdrop scrim + centered card.
 *
 * Closes on: backdrop click, ESC key, or programmatic onClose.
 * Locks body scroll while open. Auto-focuses the first focusable element.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus first focusable inside card.
    const t = window.setTimeout(() => {
      const first = cardRef.current?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      first?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cme-modal-backdrop"
      onMouseDown={(e) => {
        // Only close when the backdrop itself is clicked, not bubbled events
        // from the card.
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="cme-modal-card" ref={cardRef}>
        <button
          type="button"
          className="cme-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
