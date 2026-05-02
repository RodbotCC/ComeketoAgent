import { NextResponse } from "next/server";
import { archiveThread, deleteThread, renameThread, unarchiveThread } from "@/lib/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: { title?: string; action?: "archive" | "unarchive" | "rename" } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  try {
    if (body.action === "archive") {
      await archiveThread(params.id);
    } else if (body.action === "unarchive") {
      await unarchiveThread(params.id);
    } else if (body.action === "rename" || body.title) {
      if (!body.title) {
        return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
      }
      await renameThread(params.id, body.title);
    } else {
      return NextResponse.json({ ok: false, error: "no action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteThread(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
