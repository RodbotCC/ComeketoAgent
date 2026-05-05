import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { assertOperatorSession } from "@/lib/operator-guard";
import { assetKind } from "@/lib/assets";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "asset";
}

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

  const safeName = safeFilename(file.name);
  const storagePath = `${scope}/${scope === "lead" ? leadId : "shared"}/${randomUUID()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const sb = getSupabaseServer();

  const { error: upErr } = await sb.storage.from("assets").upload(storagePath, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const title = String(fd.get("title") || "").trim() || file.name;
  const description = String(fd.get("description") || "").trim() || null;
  const altText = String(fd.get("alt_text") || "").trim() || null;
  const approvedForCustomer = String(fd.get("approved_for_customer") || "") === "true";

  const { data, error: insErr } = await sb
    .from("lead_assets")
    .insert({
      scope,
      close_lead_id: scope === "lead" ? leadId : null,
      title,
      filename: file.name,
      storage_bucket: "assets",
      storage_path: storagePath,
      mime: file.type || null,
      byte_size: file.size,
      kind: assetKind(file.name, file.type || null),
      description,
      alt_text: altText,
      approved_for_customer: approvedForCustomer,
      source: "operator_upload",
      metadata: {},
    })
    .select("id")
    .single();

  if (insErr) {
    await sb.storage.from("assets").remove([storagePath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asset_id: (data as { id: string }).id });
}
