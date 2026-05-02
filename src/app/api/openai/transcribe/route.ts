import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'expected multipart field "file" (audio blob)' }, { status: 400 });
  }

  const rawModel = form.get("model");
  const model =
    rawModel === "whisper-1" ||
    rawModel === "gpt-4o-transcribe" ||
    rawModel === "gpt-4o-mini-transcribe"
      ? rawModel
      : "gpt-4o-mini-transcribe";

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    const ab = await file.arrayBuffer();
    const blob = new File([ab], "audio.webm", { type: file.type || "application/octet-stream" });

    const tr = await client.audio.transcriptions.create({
      file: blob,
      model,
    });

    const text = typeof tr === "string" ? tr : "text" in tr ? tr.text : "";
    return NextResponse.json({ ok: true, model, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
