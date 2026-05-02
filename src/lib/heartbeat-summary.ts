/**
 * Client-safe heartbeat report copy — no imports from `heartbeat.ts` (avoids bundling Node-only deps).
 */

export type ExecutionMode =
  | "draft_only"
  | "approval_required"
  | "approved_plan_execution"
  | "manual_send_only";

/** One-line summary for operator UI — wording matches actual counter semantics. */
export function heartbeatReportHeadline(
  report: Pick<
    { actions_fired: number; actions_skipped: number; skip_breakdown: Record<string, number> },
    "actions_fired" | "actions_skipped" | "skip_breakdown"
  >,
  executionMode: ExecutionMode
): string {
  if (executionMode === "approved_plan_execution") {
    return `${report.actions_fired} executed (Close writes attempted) · ${report.actions_skipped} skipped`;
  }
  if (executionMode === "draft_only" || executionMode === "manual_send_only") {
    const pass = report.skip_breakdown["EXECUTION_DISABLED"] ?? 0;
    const blocked = report.actions_skipped - pass;
    return `${pass} passed gates (no Close write in this mode) · ${blocked} gated off`;
  }
  return `${report.actions_fired} gate-eligible (no auto Close write in this mode) · ${report.actions_skipped} skipped`;
}
