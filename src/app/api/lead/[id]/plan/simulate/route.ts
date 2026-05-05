/**
 * GET /api/lead/[id]/plan/simulate — dry-run the latest plan against the
 * current Box state and return per-touch verdicts. Pure read; no Close
 * writes, no Supabase writes, no execution log. Powers the cockpit's
 * "Simulate" button.
 */
import { NextResponse } from "next/server";
import { simulatePlanForLead } from "@/lib/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id || !id.startsWith("lead_")) {
    return NextResponse.json({ ok: false, error: "invalid lead id" }, { status: 400 });
  }
  try {
    const result = await simulatePlanForLead(id);
    return NextResponse.json({ ok: true, simulation: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
