"use client";

import { useTransition } from "react";
import { runDiscoveryScanAction } from "./actions";

export function RunScanButton({ leadId }: { leadId: string }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      className="plan-btn-primary"
      onClick={() => start(() => runDiscoveryScanAction(leadId))}
      disabled={isPending}
    >
      {isPending ? "Scanning Box…" : "Run discovery scan"}
    </button>
  );
}
