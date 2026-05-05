"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEmptyDraftsAction } from "./actions";

export function ClearEmptyDraftsButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!confirm("Delete every draft with zero steps? This can't be undone.")) return;
    setBusy(true);
    try {
      const r = await deleteEmptyDraftsAction();
      if (r.deleted === 0) {
        alert("No empty drafts to delete.");
      } else {
        alert(`Cleared ${r.deleted} empty draft${r.deleted === 1 ? "" : "s"}.`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      className="cmk-workflows-clear-btn"
      disabled={busy || pending || disabled}
    >
      {busy ? "Clearing…" : "Clear empty drafts"}
    </button>
  );
}
