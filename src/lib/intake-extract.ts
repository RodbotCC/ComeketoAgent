/**
 * Text extraction from uploaded intake buffers.
 *
 * - Plain text / JSON / HTML / markdown → buffer.toString
 * - PDF → pdf-parse (lazy-loaded to avoid its bare-import side-effect)
 * - Image → OpenAI Vision via the Responses API ("extract every visible
 *   word + describe what the image is showing for sales context")
 * - Audio / video → still deferred (whisper for audio, frame extraction
 *   for video — both larger lifts than this round needs)
 */

import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "./settings";

const TEXT_CAP = 50_000;
export const SUMMARY_CAP = 600;
/** OpenAI accepts ~20MB base64 images; we cap at 8MB inline to stay well
 *  inside our route timeout budget when uploads come from Vercel. */
const VISION_MAX_BYTES = 8 * 1024 * 1024;

const VISION_INSTRUCTIONS = `You are reading an image uploaded as catering-lead intake. Andre (the sales operator) needs every actionable signal pulled out.

Output PLAIN TEXT (no markdown, no headers, no JSON). Two short sections, separated by a blank line:

(1) Every visible word, transcribed exactly as it appears. Receipts → line items, prices, totals, dates. Forms → field labels and values. Screenshots → all visible UI text. If the image is a sign or photo of an event venue, transcribe any text on signage, menus, names, etc.

(2) One paragraph describing what the image is showing in sales-relevant terms. Mention venue type if visible (restaurant, backyard, hall), guest-count clues, event-style cues (formal, casual, themed), brands, dishes, decor that signals budget tier, or anything else useful for tailoring catering.

If the image has no extractable signal at all (blank, corrupted, abstract pattern), say "[no extractable signal — {one-line description}]" and nothing else.`;

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
    return await extractImageWithVision(buf, mime, filename);
  }

  if (isAudioVideo(m, filename)) {
    // Audio (Whisper) + video (frame extraction) deferred — separate lift.
    return {
      extracted_text: null,
      summary: `[audio/video — transcription not yet wired — ${filename}]`,
    };
  }

  return {
    extracted_text: null,
    summary: `[binary or unsupported type — ${m || "unknown"} — ${filename}]`,
  };
}

/** OpenAI Vision read of an image. Returns transcribed text + a sales-context
 *  description in one call. Cheap and fast for typical screenshots/photos. */
async function extractImageWithVision(
  buf: Buffer,
  mime: string | null,
  filename: string,
): Promise<ExtractionResult> {
  if (!env.OPENAI_API_KEY) {
    return {
      extracted_text: null,
      summary: `[image — OPENAI_API_KEY not set — ${filename}]`,
    };
  }
  if (buf.byteLength > VISION_MAX_BYTES) {
    return {
      extracted_text: null,
      summary: `[image too large for inline vision (${buf.byteLength} bytes; max ${VISION_MAX_BYTES}) — ${filename}]`,
    };
  }

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const dataUrl = `data:${mime || "image/png"};base64,${buf.toString("base64")}`;

  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: VISION_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `Filename: ${filename}` },
            { type: "input_image", image_url: dataUrl, detail: "auto" },
          ],
        },
      ],
    });
    const out = (response.output_text ?? "").trim();
    if (!out) {
      return {
        extracted_text: null,
        summary: `[image — vision returned empty — ${filename}]`,
      };
    }
    const capped = out.length > TEXT_CAP ? out.slice(0, TEXT_CAP) : out;
    return {
      extracted_text: capped,
      summary: capped.slice(0, SUMMARY_CAP),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      extracted_text: null,
      summary: `[image — vision failed: ${msg.slice(0, 200)} — ${filename}]`,
    };
  }
}
