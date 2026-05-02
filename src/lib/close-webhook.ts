/**
 * Close webhook ingress: HMAC verification + Supabase persistence.
 * Spec: https://developer.close.com/api/resources/webhooks.md
 */

import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseServer } from "./supabase";

export function verifyCloseWebhookSignature(
  rawBody: string,
  sigHash: string | null,
  sigTs: string | null,
  secretHex: string
): boolean {
  if (!sigHash || !sigTs || !secretHex) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secretHex.trim(), "hex");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const data = sigTs + rawBody;
  const expected = createHmac("sha256", key).update(data, "utf8").digest("hex");
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sigHash, "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type CloseWebhookIngestBody = {
  event?: {
    id?: string;
    object_type?: string;
    action?: string;
    lead_id?: string;
    object_id?: string;
    organization_id?: string;
  };
  subscription_id?: string;
};

export async function insertCloseWebhookEventRow(params: {
  subscription_id: string | null;
  event_id: string;
  object_type: string | null;
  action: string | null;
  lead_id: string | null;
  object_id: string | null;
  organization_id: string | null;
  payload: unknown;
  signature_verified: boolean;
}): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb.from("close_webhook_events").insert({
    subscription_id: params.subscription_id,
    event_id: params.event_id,
    object_type: params.object_type,
    action: params.action,
    lead_id: params.lead_id,
    object_id: params.object_id,
    organization_id: params.organization_id,
    payload: params.payload,
    signature_verified: params.signature_verified,
  });
  if (!error) return;
  // Idempotent retries: Close may POST the same event again.
  if ((error as { code?: string }).code === "23505") return;
  throw new Error(`close_webhook_events insert: ${error.message}`);
}
