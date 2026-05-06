"use server";

import { revalidatePath } from "next/cache";
import { extractDiscoveryFactsForLead } from "@/lib/composite-tools";
import { logExecution } from "@/lib/execution-audit";
import { randomUUID } from "node:crypto";

/**
 * Discovery slot persistence is currently OFFLINE — Phase 6 of the harness
 * overhaul retired the Supabase `lead_facts` table without yet wiring a
 * file-canonical replacement. The operator slot editor still calls these
 * actions; for now they no-op (the modal closes, the page revalidates), and
 * the LLM scan still extracts and logs facts but doesn't persist them.
 *
 * When discovery memory is re-platformed, write to a per-lead file under
 * `harness/leads/{lead_id}__{slug}/discovery_facts.jsonl` (or extend
 * `06_discovery.md` with a fenced JSON block) and re-enable the writes here.
 */

export async function setSlotValueAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get("lead_id") || "");
  if (!leadId.startsWith("lead_")) return;
  // No-op pending file-canonical replacement.
  revalidatePath(`/lead/${leadId}/discovery`);
}

/** Run the LLM discovery extraction. Currently logs only — does NOT persist. */
export async function runDiscoveryScanAction(leadId: string): Promise<void> {
  if (!leadId.startsWith("lead_")) return;
  const traceId = randomUUID();
  const result = await extractDiscoveryFactsForLead(leadId);
  if ("error" in result) {
    await logExecution({
      action_kind: "intake_extract",
      close_lead_id: leadId,
      trace_id: traceId,
      payload: { tool: "extract_discovery_facts", scope: "discovery_map", source: "ui_button", error: result.error },
      result: "error",
    });
    revalidatePath(`/lead/${leadId}/discovery`);
    return;
  }
  await logExecution({
    action_kind: "intake_extract",
    close_lead_id: leadId,
    trace_id: traceId,
    payload: {
      tool: "extract_discovery_facts",
      scope: "discovery_map",
      source: "ui_button",
      slots_extracted: result.facts.map((f) => f.slot_id),
      slots_skipped_already_known: result.skipped_known,
      note: "lead_facts persistence offline — extraction logged only",
    },
    result: "ok",
  });
  revalidatePath(`/lead/${leadId}/discovery`);
}
