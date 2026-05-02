"use client";

import Link from "next/link";
import { AutomationCanvas } from "./AutomationCanvas";
import { DEMO_WORKFLOW } from "./demo-workflow";

/** Shown when the Sequences list is empty — same demo graph as Workflows. */
export function SequencesWorkflowPreview() {
  return (
    <div className="ag-seq-preview widget">
      <p className="ag-seq-preview-lede muted">
        Close returned no sequences to list. Here is the Morning Sweep demo workflow (compose-only reference).
      </p>
      <div className="ag-seq-preview-canvas">
        <AutomationCanvas workflow={DEMO_WORKFLOW} />
      </div>
      <p className="ag-seq-preview-foot muted">
        <Link href="/automation/workflows">Open workflow studio →</Link>
      </p>
    </div>
  );
}
