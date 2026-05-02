import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function needKey() {
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }
  return null;
}

export async function POST(req: Request) {
  const deny = needKey();
  if (deny) return deny;

  let body: { prompt: string; model?: string; size?: string; n?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt required" }, { status: 400 });
  }

  const model =
    body.model === "dall-e-3" || body.model === "dall-e-2" || body.model === "gpt-image-1"
      ? body.model
      : "gpt-image-1";
  const n = typeof body.n === "number" && body.n >= 1 && body.n <= 4 ? Math.floor(body.n) : 1;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    const size =
      body.size === "1024x1024" ||
      body.size === "1536x1024" ||
      body.size === "1024x1536" ||
      body.size === "1792x1024" ||
      body.size === "1024x1792" ||
      body.size === "auto"
        ? body.size
        : "1024x1024";

    const img = await client.images.generate(
      model === "gpt-image-1"
        ? {
            model: "gpt-image-1",
            prompt,
            n,
            size: size === "auto" || size === "1792x1024" || size === "1024x1792" ? "1024x1024" : size,
          }
        : model === "dall-e-3"
          ? {
              model: "dall-e-3",
              prompt,
              n: 1,
              size:
                size === "1792x1024" || size === "1024x1792" || size === "1024x1024"
                  ? size
                  : "1024x1024",
              response_format: "b64_json",
            }
          : {
              model: "dall-e-2",
              prompt,
              n,
              size: "1024x1024",
              response_format: "b64_json",
            }
    );

    const first = img.data?.[0];
    const b64 = first?.b64_json;
    const url = first?.url;
    return NextResponse.json({
      ok: true,
      model,
      created: img.created,
      b64_json: b64 ?? null,
      url: url ?? null,
      usage: img.usage ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
