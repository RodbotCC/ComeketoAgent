"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AutomationDraftRow } from "@/lib/automation-drafts";
import { deleteWorkflowDraftAction } from "./actions";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stepCount(d: AutomationDraftRow): number {
  return d.workflow_json?.nodes?.filter((n) => n.kind !== "wait").length ?? 0;
}

export function WorkflowDraftCard({ draft }: { draft: AutomationDraftRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const count = stepCount(draft);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${draft.name || "Untitled"}"?`)) return;
    setHidden(true);
    const fd = new FormData();
    fd.set("draft_id", draft.id);
    fd.set("stay_on_list", "1");
    try {
      await deleteWorkflowDraftAction(fd);
      startTransition(() => router.refresh());
    } catch (err) {
      setHidden(false);
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (hidden) return null;

  return (
    <Link href={`/workflows/${draft.id}`} className="cmk-workflows-card">
      <button
        type="button"
        onClick={handleDelete}
        className="cmk-workflows-card-x"
        disabled={pending}
        aria-label="Delete draft"
        title="Delete draft"
      >
        ×
      </button>
      <div className="cmk-workflows-card-head">
        <span className={`cmk-workflows-status cmk-workflows-status-${draft.status}`}>
          {draft.status}
        </span>
        <span className="cmk-workflows-card-meta">
          {count} {count === 1 ? "step" : "steps"}
        </span>
      </div>
      <strong className="cmk-workflows-card-title">{draft.name || "Untitled"}</strong>
      {draft.operator_goal && (
        <p className="cmk-workflows-card-goal">{draft.operator_goal.slice(0, 160)}</p>
      )}
      <div className="cmk-workflows-card-foot">Updated {fmtDate(draft.updated_at)}</div>
    </Link>
  );
}
