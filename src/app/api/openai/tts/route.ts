import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);

export async function POST(req: Request) {
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  let body: {
    text: string;
    voice?: string;
    model?: string;
    response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
  }
  if (text.length > 4096) {
    return NextResponse.json({ ok: false, error: "text exceeds 4096 chars" }, { status: 400 });
  }

  const voice = body.voice && VOICES.has(body.voice) ? body.voice : "sage";
  const model =
    body.model === "tts-1" || body.model === "tts-1-hd" || body.model === "gpt-4o-mini-tts"
      ? body.model
      : "gpt-4o-mini-tts";
  const response_format = body.response_format ?? "mp3";

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    const speech = await client.audio.speech.create({
      model,
      voice,
      input: text,
      response_format,
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    const base64 = buf.toString("base64");
    const mime =
      response_format === "mp3"
        ? "audio/mpeg"
        : response_format === "opus"
          ? "audio/opus"
          : response_format === "aac"
            ? "audio/aac"
            : response_format === "wav"
              ? "audio/wav"
              : "application/octet-stream";

    return NextResponse.json({
      ok: true,
      model,
      voice,
      format: response_format,
      mime,
      base64,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
