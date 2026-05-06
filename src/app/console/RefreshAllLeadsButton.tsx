"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { sweepAllActiveLeadsAction } from "./actions";

export function RefreshAllLeadsButton() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    const ok = window.confirm(
      "Refresh raw box for ALL active leads from Close?\n\n" +
      "This fans out a write per active lead and burns Close API quota. " +
      "Run only when you actually need every box rehydrated."
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await sweepAllActiveLeadsAction();
      if (r.ok) {
        const s = r.summary;
        toast.push(
          `Swept ${s.swept.length} leads (${s.considered} considered, ${s.archived.length} archived${s.errors.length ? `, ${s.errors.length} errors` : ""}).`,
          { tone: s.errors.length ? "warn" : "success", ttl: 7000 }
        );
      } else {
        toast.push(`Sweep failed: ${r.error}`, { tone: "error" });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="lead-back"
    >
      {pending ? "Sweeping all leads…" : "Refresh all active leads from Close"}
    </button>
  );
}
