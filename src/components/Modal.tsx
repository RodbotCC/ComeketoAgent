"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reusable modal primitive: backdrop scrim + centered card.
 *
 * Closes on: backdrop click, ESC key, or programmatic onClose.
 * Locks body scroll while open. Auto-focuses the first focusable element.
 *
 * Animates entrance via CSS keyframe on `.cme-modal-card`. On exit, applies
 * `data-exit="true"` for an exit animation frame, then unmounts after 180ms
 * so consumers don't lose state to abrupt unmount.
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
  // Two-phase render so we can animate exit. `mounted` controls DOM presence;
  // `visible` controls which keyframe class applies.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next tick so the entrance keyframe fires after mount.
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => setMounted(false), 180);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className="cme-modal-backdrop"
      data-exit={visible ? "false" : "true"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="cme-modal-card"
        data-exit={visible ? "false" : "true"}
        ref={cardRef}
      >
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
