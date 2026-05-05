/**
 * GET /api/lead/[id]/plan — return the latest plan for a lead, or null.
 * Used by the cockpit's day-strip rail (Lead mode) to render plan days
 * client-side without a full page navigation.
 */
import { NextResponse } from "next/server";
import { getLatestPlanForLead } from "@/lib/plans-db";
import { getLatestHeartbeatForLead } from "@/lib/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id || !id.startsWith("lead_")) {
    return NextResponse.json({ ok: false, error: "invalid lead id" }, { status: 400 });
  }
  try {
    const plan = await getLatestPlanForLead(id);
    const heartbeat = plan ? await getLatestHeartbeatForLead(id).catch(() => null) : null;
    return NextResponse.json({ ok: true, plan, heartbeat });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
