import { NextResponse } from "next/server";
import { getLatestWebhookActivityForLead } from "@/lib/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON bump probe for Box freshness (webhook feed). */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const leadId = params.id?.trim();
  if (!leadId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  try {
    const { latestReceivedAt, count24h } = await getLatestWebhookActivityForLead(leadId);
    return NextResponse.json({ latestReceivedAt, count24h });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
