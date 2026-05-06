"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { regenerateClientBoxDocsAction } from "../actions";

export function RefreshAiProfileButton({ leadId }: { leadId: string }) {
  const toast = useToast();
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      className="plan-btn-primary"
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("lead_id", leadId);
          try {
            await regenerateClientBoxDocsAction(fd);
            toast.push("AI profile refreshed from the raw lead box.", {
              tone: "success",
            });
          } catch (err) {
            toast.push(
              `AI profile refresh failed: ${err instanceof Error ? err.message : String(err)}`,
              { tone: "error" },
            );
          }
        })
      }
      disabled={isPending}
      title="Regenerates the interpreted comms, profile, discovery, alerts, and client ledger from the raw lead box."
    >
      {isPending ? "Refreshing AI…" : "Refresh AI profile"}
    </button>
  );
}
