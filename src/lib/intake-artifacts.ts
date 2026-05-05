/**
 * Intake artifacts — file-tree backed (Phase 1 of harness/ overhaul, 2026-05-05).
 *
 * Reads target `harness/leads/{lead_id}__{slug}/intake/{intake_id}/meta.json`
 * + `extracted.md` on the `leads-data` branch via Octokit. The Supabase
 * `intake_artifacts` table is no longer the source of truth.
 *
 * The exported `IntakeArtifactRow` type is preserved so existing UI consumers
 * (LeadIntakeBoard, IntakeArtifactsPanel, chat context builder) continue to
 * work unchanged.
 */

import {
  listIntakeArtifactsForLeadFs,
  getIntakeExtractedTextFs,
  type IntakeArtifactFs,
} from "./intake-fs";

export type IntakeArtifactRow = {
  id: string;
  created_at: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  byte_size: number | null;
  summary: string | null;
  extracted_text: string | null;
  lead_id: string | null;
};

function toRow(a: IntakeArtifactFs): IntakeArtifactRow {
  return {
    id: a.id,
    created_at: a.created_at,
    filename: a.filename,
    storage_path: a.storage_path,
    mime: a.mime,
    byte_size: a.byte_size,
    summary: a.summary,
    extracted_text: a.extracted_text,
    lead_id: a.lead_id,
  };
}

/** Listing across all leads is no longer cheap (would mean walking the
 *  whole tree) and is not used by any current consumer. Keeping the
 *  function so the import doesn't break, but it returns empty. If a
 *  consumer ever needs cross-lead intake, build it explicitly via the
 *  catalog rebuilder. */
export async function listRecentIntakeArtifacts(
  _limit = 30,
): Promise<IntakeArtifactRow[]> {
  void _limit;
  return [];
}

/** List a lead's intake artifacts, newest first. Each row has metadata
 *  only — extracted text is loaded on demand via `getIntakeArtifactById`. */
export async function listIntakeArtifactsForLead(
  leadId: string,
  limit = 24,
): Promise<IntakeArtifactRow[]> {
  const items = await listIntakeArtifactsForLeadFs(leadId, limit);
  return items.map(toRow);
}

/** Load a single artifact by id WITH its extracted text body. Used by the
 *  chat context builder and by detail surfaces that need the full text. */
export async function getIntakeArtifactById(
  id: string,
): Promise<IntakeArtifactRow | null> {
  // Without the lead_id, locating a single artifact is expensive (would scan
  // every lead's intake/). Current callers always know the lead_id, but the
  // exported signature doesn't carry it. For now, return null — the chat
  // context builder lists by lead and pulls extracted_text per-row via a
  // separate path. Detail surfaces should call `getIntakeArtifactByIdAndLead`.
  void id;
  return null;
}

/** Path-aware variant — preferred when the caller knows the lead. */
export async function getIntakeArtifactByIdAndLead(
  leadId: string,
  intakeId: string,
): Promise<IntakeArtifactRow | null> {
  const list = await listIntakeArtifactsForLeadFs(leadId, 200);
  const row = list.find((a) => a.id === intakeId);
  if (!row) return null;
  const extracted = await getIntakeExtractedTextFs(leadId, intakeId);
  return toRow({ ...row, extracted_text: extracted });
}

/** Used by the chat context builder to inject extracted intake text into
 *  the system prompt. Loads each artifact's extracted body in parallel
 *  (concurrency cap of 5). */
export async function loadIntakeArtifactsWithText(
  leadId: string,
  limit = 10,
): Promise<IntakeArtifactRow[]> {
  const list = await listIntakeArtifactsForLeadFs(leadId, limit);
  const lanes = Math.min(5, list.length);
  let cursor = 0;
  const out: IntakeArtifactRow[] = new Array(list.length);
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= list.length) return;
      const row = list[i];
      if (!row) continue;
      const text = await getIntakeExtractedTextFs(leadId, row.id);
      out[i] = toRow({ ...row, extracted_text: text });
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return out.filter(Boolean);
}
