import { getLatestWebhookActivityForLead } from "@/lib/webhook-events";
import { getLeadActivityBumpedAt } from "@/lib/execution-audit";
import { maxIsoTimestamp } from "@/lib/activity-freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE: polls webhook table + lead_activity_touches and pushes when freshness cursor changes.
 * Client reconnects after idle — keeps Vercel-ish runtimes bounded.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const leadId = params.id?.trim();
  if (!leadId) {
    return new Response("missing id", { status: 400 });
  }

  const encoder = new TextEncoder();

  async function freshnessCursor(): Promise<string | null> {
    const [wh, bumped] = await Promise.all([
      getLatestWebhookActivityForLead(leadId),
      getLeadActivityBumpedAt(leadId),
    ]);
    return maxIsoTimestamp(wh.latestReceivedAt, bumped);
  }

  let last = await freshnessCursor();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      send({ type: "hello", latestReceivedAt: last });

      const tick = setInterval(async () => {
        try {
          const cur = await freshnessCursor();
          if (cur !== last) {
            last = cur;
            const wh = await getLatestWebhookActivityForLead(leadId);
            send({
              type: "bump",
              latestReceivedAt: cur,
              count24h: wh.count24h,
            });
          }
        } catch {
          send({ type: "error", message: "poll failed" });
        }
      }, 12000);

      const abort = () => {
        clearInterval(tick);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
