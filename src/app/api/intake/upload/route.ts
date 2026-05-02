import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST multipart: field `file`, optional `lead_id`. */
export async function POST(req: Request) {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const leadRaw = fd.get("lead_id");
  const lead_id =
    typeof leadRaw === "string" && leadRaw.startsWith("lead_") ? leadRaw.trim() : null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  const path = `${randomUUID()}-${safeName || "upload"}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const sb = getSupabaseServer();

  const { error: upErr } = await sb.storage.from("intake").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: inserted, error: insErr } = await sb
    .from("intake_artifacts")
    .insert({
      filename: file.name,
      storage_path: path,
      mime: file.type || null,
      byte_size: file.size,
      summary: null,
      lead_id,
    })
    .select("id")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const id = (inserted as { id: string })?.id;
  return NextResponse.json({ ok: true, storage_path: path, artifact_id: id });
}
