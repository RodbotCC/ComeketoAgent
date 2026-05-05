import { NextResponse } from "next/server";
import { sweepActiveLeads, sweepLead } from "@/lib/lead-folder-sweeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel may kill long-running functions at the default 10s timeout. A full
 *  sweep runs 30-90s comfortably for ~50 leads × 3 lanes; this gives us a
 *  5-minute ceiling without crossing into Pro-plan-only territory. */
export const maxDuration = 300;

/** Auth is enforced by `src/middleware.ts`: when CRON_SECRET is set, only
 *  requests with `Authorization: Bearer ${CRON_SECRET}` reach this handler.
 *  Vercel Cron sends that header automatically. The manual `/test` button
 *  uses `/api/test` (which carries the operator session) instead. */
async function runSweep(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leadId = url.searchParams.get("lead_id");
  try {
    if (leadId) {
      const result = await sweepLead(leadId);
      return NextResponse.json({ ok: true, mode: "single", result });
    }
    const summary = await sweepActiveLeads();
    return NextResponse.json({ ok: true, mode: "all", summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  return runSweep(req);
}

export async function POST(req: Request): Promise<Response> {
  return runSweep(req);
}
