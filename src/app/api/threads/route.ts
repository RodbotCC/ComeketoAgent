import { NextResponse } from "next/server";
import { listThreads, createThread } from "@/lib/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const threads = await listThreads();
    return NextResponse.json({ ok: true, threads });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  try {
    const thread = await createThread(body.title);
    return NextResponse.json({ ok: true, thread });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
