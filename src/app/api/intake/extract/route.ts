import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { logExecution } from "@/lib/execution-audit";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractTextFromBuffer(
  buf: Buffer,
  mime: string | null,
  filename: string
): Promise<string> {
  const m = (mime || "").toLowerCase();
  if (m.includes("json") || filename.endsWith(".json")) {
    try {
      return JSON.stringify(JSON.parse(buf.toString("utf8")), null, 2).slice(0, 12000);
    } catch {
      return buf.toString("utf8").slice(0, 12000);
    }
  }
  if (m.includes("text/html") || filename.endsWith(".html") || filename.endsWith(".htm")) {
    return stripHtml(buf.toString("utf8")).slice(0, 12000);
  }
  if (
    m.startsWith("text/") ||
    m.includes("markdown") ||
    filename.endsWith(".md") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".csv")
  ) {
    return buf.toString("utf8").slice(0, 12000);
  }
  return "";
}

/** POST body `{ artifact_id: uuid }` — fills `summary` from text-ish bodies (no OCR in v1). */
export async function POST(req: Request) {
  let artifactId = "";
  try {
    const body = await req.json();
    artifactId = String(body?.artifact_id || "").trim();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!artifactId) {
    return NextResponse.json({ error: "artifact_id required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data: row, error: readErr } = await sb
    .from("intake_artifacts")
    .select("id, storage_path, filename, mime, lead_id")
    .eq("id", artifactId)
    .maybeSingle();
  if (readErr || !row) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }

  const r = row as {
    id: string;
    storage_path: string;
    filename: string;
    mime: string | null;
    lead_id: string | null;
  };

  const dl = await sb.storage.from("intake").download(r.storage_path);
  if (dl.error || !dl.data) {
    logStructured("warn", "intake.extract", "storage download failed", {
      artifact_id: r.id,
      message: dl.error?.message,
    });
    return NextResponse.json({ error: dl.error?.message || "download failed" }, { status: 500 });
  }

  const buf = Buffer.from(await dl.data.arrayBuffer());
  let text = await extractTextFromBuffer(buf, r.mime, r.filename);
  if (!text) {
    text = `[binary or unsupported type — ${r.mime || "unknown"} — ${r.filename}]`;
  }
  const summary = text.length > 600 ? `${text.slice(0, 600)}…` : text;

  const { error: upErr } = await sb.from("intake_artifacts").update({ summary }).eq("id", r.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  void logExecution({
    action_kind: "intake_extract",
    close_lead_id: r.lead_id,
    payload: { artifact_id: r.id, bytes: buf.length, mime: r.mime },
  });
  logStructured("info", "intake.extract", "summary written", {
    artifact_id: r.id,
    lead_id: r.lead_id,
    summary_len: summary.length,
  });

  return NextResponse.json({ ok: true, summary_len: summary.length });
}
