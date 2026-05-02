"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastTone = "default" | "success" | "warn" | "error";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  ttl: number;
  /** Wall-clock ms when this toast (or its dedup ancestor) was first added. */
  bornAt: number;
  /** Incremented on dedup re-fire to force a re-flash via React key change. */
  bumpKey: number;
};

type ToastContextValue = {
  push: (message: string, opts?: { tone?: ToastTone; ttl?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: no provider mounted — silently no-op so consumers don't crash in tests.
    return { push: () => undefined };
  }
  return ctx;
}

let _seed = 0;
function nextId() {
  _seed = (_seed + 1) % Number.MAX_SAFE_INTEGER;
  return `t${Date.now().toString(36)}${_seed}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue["push"]>((message, opts) => {
    const tone = opts?.tone ?? "default";
    const ttl = opts?.ttl ?? 2400;
    // Dedup: if the same message+tone is already visible (or landed in the
    // last ~1.5s), reuse its slot — extend its TTL instead of stacking.
    const now = Date.now();
    setToasts((prev) => {
      const dupIdx = prev.findIndex(
        (t) => t.message === message && t.tone === tone && now - t.bornAt < 1500
      );
      if (dupIdx >= 0) {
        const existing = prev[dupIdx];
        // Reset its timer.
        const oldHandle = timersRef.current.get(existing.id);
        if (oldHandle !== undefined) window.clearTimeout(oldHandle);
        if (ttl > 0) {
          timersRef.current.set(
            existing.id,
            window.setTimeout(() => dismiss(existing.id), ttl)
          );
        }
        // Visually flash it.
        const next = [...prev];
        next[dupIdx] = { ...existing, bornAt: now, bumpKey: existing.bumpKey + 1 };
        return next;
      }
      // Cap visible toasts at 5; drop the oldest if we'd exceed.
      const id = nextId();
      const fresh: Toast = { id, message, tone, ttl, bornAt: now, bumpKey: 0 };
      const merged = [...prev, fresh];
      if (merged.length > 5) {
        const dropped = merged.shift();
        if (dropped) {
          const h = timersRef.current.get(dropped.id);
          if (h !== undefined) {
            window.clearTimeout(h);
            timersRef.current.delete(dropped.id);
          }
        }
      }
      if (ttl > 0) {
        const handle = window.setTimeout(() => dismiss(id), ttl);
        timersRef.current.set(id, handle);
      }
      return merged;
    });
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((h) => window.clearTimeout(h));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="cmk-toast-host" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={`${t.id}-${t.bumpKey}`}
            role="status"
            className={`cmk-toast cmk-toast-${t.tone}`}
            onClick={() => dismiss(t.id)}
          >
            {t.tone === "success" && <span className="cmk-toast-glyph">✓</span>}
            {t.tone === "error" && <span className="cmk-toast-glyph">!</span>}
            {t.tone === "warn" && <span className="cmk-toast-glyph">⚠</span>}
            <span className="cmk-toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
