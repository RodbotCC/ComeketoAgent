import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { logExecution } from "@/lib/execution-audit";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_CAP = 50_000;
const SUMMARY_CAP = 600;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPdf(mime: string, filename: string): boolean {
  return mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
}

function isImage(mime: string, filename: string): boolean {
  if (mime.startsWith("image/")) return true;
  const lower = filename.toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lower);
}

function isAudioVideo(mime: string, filename: string): boolean {
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  const lower = filename.toLowerCase();
  return /\.(mp3|wav|m4a|aac|ogg|mp4|mov|webm|mkv)$/.test(lower);
}

async function extractPdfText(buf: Buffer): Promise<string> {
  // pdf-parse@1 has a side-effect on bare import (looks for a test fixture in some forks).
  // Dynamic-import inside the branch keeps it cold-load until a PDF actually arrives.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = (await import("pdf-parse")) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>;
  };
  const data = await mod.default(buf);
  return (data.text || "").trim();
}

type ExtractionResult = { extracted_text: string | null; summary: string };

async function extractFromBuffer(
  buf: Buffer,
  mime: string | null,
  filename: string
): Promise<ExtractionResult> {
  const m = (mime || "").toLowerCase();

  if (m.includes("json") || filename.endsWith(".json")) {
    let text: string;
    try {
      text = JSON.stringify(JSON.parse(buf.toString("utf8")), null, 2);
    } catch {
      text = buf.toString("utf8");
    }
    text = text.slice(0, TEXT_CAP);
    return { extracted_text: text, summary: text.slice(0, SUMMARY_CAP) };
  }

  if (m.includes("text/html") || filename.endsWith(".html") || filename.endsWith(".htm")) {
    const text = stripHtml(buf.toString("utf8")).slice(0, TEXT_CAP);
    return { extracted_text: text, summary: text.slice(0, SUMMARY_CAP) };
  }

  if (
    m.startsWith("text/") ||
    m.includes("markdown") ||
    filename.endsWith(".md") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".csv")
  ) {
    const text = buf.toString("utf8").slice(0, TEXT_CAP);
    return { extracted_text: text, summary: text.slice(0, SUMMARY_CAP) };
  }

  if (isPdf(m, filename)) {
    const text = (await extractPdfText(buf)).slice(0, TEXT_CAP);
    if (!text) {
      return {
        extracted_text: null,
        summary: `[PDF — no extractable text — ${filename}]`,
      };
    }
    return { extracted_text: text, summary: text.slice(0, SUMMARY_CAP) };
  }

  if (isImage(m, filename)) {
    return {
      extracted_text: null,
      summary: `[image — extraction deferred to Phase 2 (Gemini) — ${filename}]`,
    };
  }

  if (isAudioVideo(m, filename)) {
    return {
      extracted_text: null,
      summary: `[audio/video — extraction deferred to Phase 2 (Gemini) — ${filename}]`,
    };
  }

  return {
    extracted_text: null,
    summary: `[binary or unsupported type — ${m || "unknown"} — ${filename}]`,
  };
}

/** POST body `{ artifact_id: uuid }` — fills `summary` + `extracted_text`. */
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

  let result: ExtractionResult;
  try {
    result = await extractFromBuffer(buf, r.mime, r.filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = {
      extracted_text: null,
      summary: `[extraction failed — ${msg.slice(0, 200)}]`,
    };
    logStructured("warn", "intake.extract", "extractor threw", {
      artifact_id: r.id,
      message: msg,
    });
  }

  const summary =
    result.summary.length > SUMMARY_CAP ? `${result.summary.slice(0, SUMMARY_CAP)}…` : result.summary;

  const { error: upErr } = await sb
    .from("intake_artifacts")
    .update({ summary, extracted_text: result.extracted_text })
    .eq("id", r.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  void logExecution({
    action_kind: "intake_extract",
    close_lead_id: r.lead_id,
    payload: {
      artifact_id: r.id,
      bytes: buf.length,
      mime: r.mime,
      extracted_chars: result.extracted_text?.length ?? 0,
    },
  });
  logStructured("info", "intake.extract", "summary written", {
    artifact_id: r.id,
    lead_id: r.lead_id,
    summary_len: summary.length,
    extracted_len: result.extracted_text?.length ?? 0,
  });

  return NextResponse.json({
    ok: true,
    summary_len: summary.length,
    extracted_len: result.extracted_text?.length ?? 0,
  });
}
