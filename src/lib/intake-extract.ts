/**
 * Pure text extraction from uploaded intake buffers.
 *
 * Lifted out of the old `src/app/api/intake/extract/route.ts` so the upload
 * route (Phase 1 of the harness/ overhaul) can extract inline and write the
 * result directly to the lead's folder, eliminating the two-call upload→extract
 * dance that previously routed through Supabase Storage.
 */

const TEXT_CAP = 50_000;
export const SUMMARY_CAP = 600;

export type ExtractionResult = {
  extracted_text: string | null;
  summary: string;
};

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

export async function extractFromBuffer(
  buf: Buffer,
  mime: string | null,
  filename: string,
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
