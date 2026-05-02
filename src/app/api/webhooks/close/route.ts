import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  verifyCloseWebhookSignature,
  insertCloseWebhookEventRow,
  type CloseWebhookIngestBody,
} from "@/lib/close-webhook";
import { logExecution, touchLeadActivity } from "@/lib/execution-audit";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Close → us: POST JSON body + `close-sig-timestamp` + `close-sig-hash` (HMAC-SHA256).
 * Configure subscription URL to `https://<host>/api/webhooks/close`.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sigHash = req.headers.get("close-sig-hash");
  const sigTs = req.headers.get("close-sig-timestamp");
  const key = env.CLOSE_WEBHOOK_SIGNATURE_KEY.trim();
  const prod = process.env.NODE_ENV === "production";

  let signatureVerified = false;
  if (key) {
    signatureVerified = verifyCloseWebhookSignature(rawBody, sigHash, sigTs, key);
    if (!signatureVerified) {
      return new NextResponse("invalid webhook signature", { status: 401 });
    }
  } else if (prod) {
    return new NextResponse("CLOSE_WEBHOOK_SIGNATURE_KEY not configured", { status: 503 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const body = parsed as CloseWebhookIngestBody;
  const event = body.event;
  const eventId = event?.id;
  if (!eventId) {
    return new NextResponse("missing event.id", { status: 400 });
  }

  try {
    await insertCloseWebhookEventRow({
      subscription_id: body.subscription_id ?? null,
      event_id: eventId,
      object_type: event.object_type ?? null,
      action: event.action ?? null,
      lead_id: event.lead_id ?? null,
      object_id: event.object_id ?? null,
      organization_id: event.organization_id ?? null,
      payload: parsed,
      signature_verified: signatureVerified,
    });
    const lid = event.lead_id?.trim();
    if (lid) await touchLeadActivity(lid);
    void logExecution({
      action_kind: "webhook_ingest",
      close_lead_id: lid || null,
      payload: {
        event_id: eventId,
        object_type: event.object_type,
        action: event.action,
        signature_verified: signatureVerified,
      },
    });
    logStructured("info", "webhook.close", "ingested", {
      event_id: eventId,
      lead_id: lid,
      object_type: event.object_type,
      action: event.action,
    });
  } catch (e) {
    console.error("[api/webhooks/close] persist error", e);
    return new NextResponse("persist failed", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
