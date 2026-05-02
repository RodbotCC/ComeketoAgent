"use client";

import { AutomationCanvas } from "./AutomationCanvas";
import type { Workflow } from "./AutomationCanvas";

/** Read-only Close step graph for sequence detail (Guardrails §M2). */
export function AutomationDetailGraph({ workflow }: { workflow: Workflow }) {
  return <AutomationCanvas workflow={workflow} readOnly />;
}
