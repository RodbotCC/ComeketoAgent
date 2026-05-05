import { NextResponse } from "next/server";
import { assertOperatorSession } from "@/lib/operator-guard";
import { writeLeadAssetFs, writeGlobalAssetFs } from "@/lib/assets-fs";
import { closeGetLead } from "@/lib/close";
import { logExecution } from "@/lib/execution-audit";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST multipart: field `file`, optional `scope` (lead|global), optional
 *  `lead_id` (required when scope=lead), optional `title`/`description`/
 *  `alt_text`/`approved_for_customer`.
 *
 *  Phase 6.1 of harness/ overhaul (2026-05-05): writes directly to the
 *  harness file tree:
 *    - lead-scoped: harness/leads/{lead_id}__{slug}/assets/{asset_id}/
 *    - global:      harness/assets/global/{asset_id}/
 *
 *  Files >~950KB rejected (GitHub Contents API cap). Operator surfaces a
 *  clear error so they can compress or use a smaller export. */
export async function POST(req: Request) {
  await assertOperatorSession();
  const fd = await req.formData();
  const file = fd.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const rawScope = String(fd.get("scope") || "lead");
  const scope = rawScope === "global" ? "global" : "lead";
  const rawLeadId = String(fd.get("lead_id") || "").trim();
  const leadId = rawLeadId.startsWith("lead_") ? rawLeadId : "";
  if (scope === "lead" && !leadId) {
    return NextResponse.json({ error: "lead_id required for lead assets" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const title = String(fd.get("title") || "").trim() || file.name;
  const description = String(fd.get("description") || "").trim();
  const altText = String(fd.get("alt_text") || "").trim();
  const approvedForCustomer = String(fd.get("approved_for_customer") || "") === "true";

  try {
    let assetId: string;
    if (scope === "lead") {
      // Resolve lead display_name for slug derivation.
      let leadName = leadId;
      try {
        const lead = await closeGetLead(leadId);
        if (lead?.display_name) leadName = lead.display_name;
      } catch {
        // best-effort
      }
      const meta = await writeLeadAssetFs({
        leadId,
        leadName,
        filename: file.name,
        mime: file.type || null,
        buffer: buf,
        title,
        description,
        altText,
        approvedForCustomer,
      });
      assetId = meta.id;
    } else {
      const meta = await writeGlobalAssetFs({
        filename: file.name,
        mime: file.type || null,
        buffer: buf,
        title,
        description,
        altText,
        approvedForCustomer,
      });
      assetId = meta.id;
    }

    void logExecution({
      action_kind: "asset_library",
      close_lead_id: scope === "lead" ? leadId : null,
      payload: {
        asset_id: assetId,
        scope,
        filename: file.name,
        bytes: buf.length,
        backend: "fs",
      },
    });

    return NextResponse.json({ ok: true, asset_id: assetId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStructured("warn", "assets.upload", "fs write failed", {
      lead_id: leadId || null,
      scope,
      filename: file.name,
      message: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
