import { NextResponse } from "next/server";
import { closeGetLead } from "@/lib/close";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tiny endpoint backing the chat scope dock — just enough to label the pinned lead. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const lead = await closeGetLead(params.id);
    return NextResponse.json({
      ok: true,
      id: lead.id,
      display_name: lead.display_name,
      status_label: lead.status_label,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
