/**
 * lead_facts persistence — Discovery Map values that don't live on Close
 * custom fields. Source is 'llm_extraction' (from the extract_discovery_facts
 * composite tool) or 'operator' (manual override from the slot editor).
 *
 * Server-only. App uses the service role; RLS denies anon/authenticated.
 *
 * Note: 'close_custom' source is never written here — those values are
 * read directly from LeadBoxPageData.customFields by the resolver.
 */

import { getSupabaseServer } from "./supabase";
import type { LeadFactRecord } from "./discovery-map";

type Row = {
  lead_id: string;
  slot_id: string;
  value: unknown;
  source: "llm_extraction" | "operator";
  evidence: unknown;
  extracted_at: string;
};

function rowToRecord(r: Row): LeadFactRecord {
  return {
    slot_id: r.slot_id,
    value: r.value,
    source: r.source,
    evidence: (r.evidence as LeadFactRecord["evidence"]) ?? null,
    extracted_at: r.extracted_at,
  };
}

/**
 * Load every lead_facts row for a lead, indexed by slot_id (the shape the
 * Discovery Map resolver wants). Returns an empty Map on no rows.
 */
export async function getLeadFacts(leadId: string): Promise<Map<string, LeadFactRecord>> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_facts")
    .select("*")
    .eq("lead_id", leadId);
  if (error) throw new Error(`getLeadFacts(${leadId}): ${error.message}`);
  const map = new Map<string, LeadFactRecord>();
  for (const r of (data ?? []) as Row[]) {
    map.set(r.slot_id, rowToRecord(r));
  }
  return map;
}

export type UpsertLeadFactInput = {
  lead_id: string;
  slot_id: string;
  value: unknown;
  source: "llm_extraction" | "operator";
  evidence?: LeadFactRecord["evidence"] | null;
  extracted_at?: string;
};

/**
 * Upsert a single fact. Operator-source writes always overwrite extraction
 * rows for the same slot (operator is the authoritative correction).
 * LLM-extraction writes do NOT overwrite an existing operator row.
 */
export async function upsertLeadFact(input: UpsertLeadFactInput): Promise<void> {
  const sb = getSupabaseServer();

  // Guard: don't let llm_extraction stomp an operator override
  if (input.source === "llm_extraction") {
    const { data: existing } = await sb
      .from("lead_facts")
      .select("source")
      .eq("lead_id", input.lead_id)
      .eq("slot_id", input.slot_id)
      .maybeSingle();
    if (existing && (existing as { source: string }).source === "operator") {
      return; // operator wins
    }
  }

  const { error } = await sb.from("lead_facts").upsert(
    {
      lead_id: input.lead_id,
      slot_id: input.slot_id,
      value: input.value,
      source: input.source,
      evidence: input.evidence ?? null,
      extracted_at: input.extracted_at ?? new Date().toISOString(),
    },
    { onConflict: "lead_id,slot_id" }
  );
  if (error) throw new Error(`upsertLeadFact(${input.lead_id}, ${input.slot_id}): ${error.message}`);
}

/**
 * Bulk upsert (used by extract_discovery_facts after one tool call writes
 * multiple slots at once). Operator-source overrides are preserved per the
 * single-row guard.
 */
export async function upsertLeadFactsBulk(inputs: UpsertLeadFactInput[]): Promise<void> {
  for (const input of inputs) {
    await upsertLeadFact(input);
  }
}

export async function deleteLeadFact(leadId: string, slotId: string): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("lead_facts")
    .delete()
    .eq("lead_id", leadId)
    .eq("slot_id", slotId);
  if (error) throw new Error(`deleteLeadFact(${leadId}, ${slotId}): ${error.message}`);
}
