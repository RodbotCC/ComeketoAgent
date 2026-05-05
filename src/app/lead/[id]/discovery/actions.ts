"use server";

import { revalidatePath } from "next/cache";
import { upsertLeadFact, deleteLeadFact } from "@/lib/lead-facts";
import { upsertLeadFactsBulk } from "@/lib/lead-facts";
import { extractDiscoveryFactsForLead } from "@/lib/composite-tools";
import { logExecution } from "@/lib/execution-audit";
import { randomUUID } from "node:crypto";

/**
 * Operator override — Andre fills (or corrects) a slot from the editor modal.
 * Always wins over llm_extraction values for the same slot.
 */
export async function setSlotValueAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get("lead_id") || "");
  const slotId = String(formData.get("slot_id") || "");
  const valueRaw = String(formData.get("value") || "").trim();
  if (!leadId.startsWith("lead_") || !slotId) return;

  if (valueRaw.length === 0) {
    await deleteLeadFact(leadId, slotId);
  } else {
    // Try integer for guest_count; otherwise keep as string.
    let value: unknown = valueRaw;
    if (slotId === "guest_count") {
      const n = Number(valueRaw);
      if (Number.isFinite(n) && n > 0) value = Math.round(n);
    }
    await upsertLeadFact({
      lead_id: leadId,
      slot_id: slotId,
      value,
      source: "operator",
      evidence: { excerpt: "operator-entered", confidence: 1.0 },
      extracted_at: new Date().toISOString(),
    });
  }
  revalidatePath(`/lead/${leadId}/discovery`);
}

/** Run the LLM discovery extraction. Persists everything it grounds with confidence ≥ 0.6. */
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
  await upsertLeadFactsBulk(
    result.facts.map((f) => ({
      lead_id: leadId,
      slot_id: f.slot_id,
      value: f.value,
      source: "llm_extraction" as const,
      evidence: f.evidence,
      extracted_at: new Date().toISOString(),
    }))
  );
  await logExecution({
    action_kind: "intake_extract",
    close_lead_id: leadId,
    trace_id: traceId,
    payload: {
      tool: "extract_discovery_facts",
      scope: "discovery_map",
      source: "ui_button",
      slots_written: result.facts.map((f) => f.slot_id),
      slots_skipped_already_known: result.skipped_known,
    },
    result: "ok",
  });
  revalidatePath(`/lead/${leadId}/discovery`);
}
