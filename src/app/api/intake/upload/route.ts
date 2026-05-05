import { NextResponse } from "next/server";
import { closeGetLead } from "@/lib/close";
import { extractFromBuffer, SUMMARY_CAP } from "@/lib/intake-extract";
import { writeIntakeArtifact } from "@/lib/intake-fs";
import { logExecution } from "@/lib/execution-audit";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Long-running for big PDFs that need extraction, plus two GitHub commits. */
export const maxDuration = 60;

/** POST multipart: field `file`, required `lead_id`.
 *
 *  Phase 1 of harness/ overhaul (2026-05-05): writes directly to the
 *  `harness/leads/{id}__{slug}/intake/{intake_id}/` folder on `leads-data`
 *  via Octokit. Extraction runs inline (replaces the old upload→extract
 *  two-call dance through Supabase Storage). Original binary is NOT
 *  persisted — the agent reads `extracted.md`, which is what the LLM needs.
 *  If we want binary persistence later, that's a Git Data API addition.
 */
export async function POST(req: Request) {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const leadRaw = fd.get("lead_id");
  const lead_id =
    typeof leadRaw === "string" && leadRaw.startsWith("lead_") ? leadRaw.trim() : null;
  if (!lead_id) {
    return NextResponse.json(
      { error: "lead_id required (must start with `lead_`)" },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || null;

  // Resolve the lead's display_name for slug derivation. If the lead lookup
  // fails, fall back to the lead_id as the name — slug will be unique by
  // virtue of the lead_id prefix anyway.
  let leadName = lead_id;
  try {
    const lead = await closeGetLead(lead_id);
    if (lead?.display_name) leadName = lead.display_name;
  } catch (e) {
    logStructured("warn", "intake.upload", "closeGetLead failed; using lead_id as slug", {
      lead_id,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // Extract text inline. Failures are caught and recorded in the placeholder.
  let extractedText: string | null = null;
  let summary = `[uploaded — ${file.name}]`;
  try {
    const r = await extractFromBuffer(buf, mime, file.name);
    extractedText = r.extracted_text;
    summary =
      r.summary.length > SUMMARY_CAP
        ? `${r.summary.slice(0, SUMMARY_CAP)}…`
        : r.summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    summary = `[extraction failed — ${msg.slice(0, 200)}]`;
    logStructured("warn", "intake.upload", "extraction threw", {
      lead_id,
      filename: file.name,
      message: msg,
    });
  }

  // Write to the file tree. Two commits per upload (meta + extracted) — fine
  // for a low-frequency, operator-driven action.
  let result;
  try {
    result = await writeIntakeArtifact({
      leadId: lead_id,
      leadName,
      filename: file.name,
      mime,
      byteSize: file.size,
      extractedText,
      summary,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStructured("error", "intake.upload", "fs write failed", {
      lead_id,
      filename: file.name,
      message: msg,
    });
    return NextResponse.json({ error: `fs write failed: ${msg}` }, { status: 500 });
  }

  void logExecution({
    action_kind: "intake_extract",
    close_lead_id: lead_id,
    payload: {
      artifact_id: result.intake_id,
      bytes: buf.length,
      mime,
      filename: file.name,
      extracted_chars: extractedText?.length ?? 0,
      backend: "fs",
    },
  });
  logStructured("info", "intake.upload", "intake artifact written to fs", {
    lead_id,
    intake_id: result.intake_id,
    filename: file.name,
    rel_path: result.rel_path,
  });

  return NextResponse.json({
    ok: true,
    artifact_id: result.intake_id,
    storage_path: result.rel_path,
    summary_len: summary.length,
    extracted_len: extractedText?.length ?? 0,
  });
}
