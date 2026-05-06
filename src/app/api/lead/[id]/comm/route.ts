import { NextResponse } from "next/server";
import { readLeadFile } from "@/lib/lead-folder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lead/[id]/comm?ref=comms/<kind>_<date>_<shortid>.json
 *
 * Returns the full body of a single per-activity comm payload from the lead's
 * harness folder. Used by the Comms widget detail view to lazy-load full
 * transcripts / email bodies / SMS threads only when the operator clicks a row.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const leadId = params.id?.trim();
  if (!leadId || !leadId.startsWith("lead_")) {
    return NextResponse.json({ ok: false, error: "invalid lead id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get("ref")?.trim() || "";
  if (!ref.startsWith("comms/") || !ref.endsWith(".json")) {
    return NextResponse.json({ ok: false, error: "ref must be comms/*.json" }, { status: 400 });
  }
  if (ref.includes("..")) {
    return NextResponse.json({ ok: false, error: "invalid ref" }, { status: 400 });
  }

  try {
    const raw = await readLeadFile(leadId, ref);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "comm not found" }, { status: 404 });
    }
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = null;
    }
    const text =
      typeof payload?.recording_transcript === "string" ? payload.recording_transcript :
      typeof payload?.body_text === "string" ? payload.body_text :
      typeof payload?.text === "string" ? payload.text :
      typeof payload?.note === "string" ? payload.note :
      "";

    return NextResponse.json({
      ok: true,
      ref,
      kind: typeof payload?._activity_type === "string" ? payload._activity_type : null,
      direction: typeof payload?.direction === "string" ? payload.direction : null,
      subject: typeof payload?.subject === "string" ? payload.subject : null,
      date_created: typeof payload?.date_created === "string" ? payload.date_created : null,
      contact_name: typeof payload?.contact_name === "string" ? payload.contact_name : null,
      duration: typeof payload?.duration === "number" ? payload.duration : null,
      body: text || null,
      raw: payload,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
