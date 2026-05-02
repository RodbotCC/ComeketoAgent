/**
 * Read path for Close webhook events persisted to Supabase (operator dashboard).
 */

import { getSupabaseServer } from "./supabase";

export type CloseWebhookEventRow = {
  id: string;
  received_at: string;
  subscription_id: string | null;
  event_id: string;
  object_type: string | null;
  action: string | null;
  lead_id: string | null;
  object_id: string | null;
  organization_id: string | null;
  signature_verified: boolean;
};

/** Recent webhook rows (newest first). Optional lead filter. */
export async function listRecentCloseWebhookEvents(opts: {
  leadId?: string | null;
  limit?: number;
}): Promise<CloseWebhookEventRow[]> {
  const sb = getSupabaseServer();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let q = sb
    .from("close_webhook_events")
    .select(
      "id, received_at, subscription_id, event_id, object_type, action, lead_id, object_id, organization_id, signature_verified"
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  const lid = opts.leadId?.trim();
  if (lid) q = q.eq("lead_id", lid);
  const { data, error } = await q;
  if (error) throw new Error(`listRecentCloseWebhookEvents: ${error.message}`);
  return (data as CloseWebhookEventRow[]) ?? [];
}

/** Latest ingest timestamp for a lead (for activity bump / SSE poll). */
export async function getLatestWebhookActivityForLead(leadId: string): Promise<{
  latestReceivedAt: string | null;
  count24h: number;
}> {
  const sb = getSupabaseServer();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: latest, error: e1 } = await sb
    .from("close_webhook_events")
    .select("received_at")
    .eq("lead_id", leadId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw new Error(`getLatestWebhookActivityForLead latest: ${e1.message}`);
  const { count, error: e2 } = await sb
    .from("close_webhook_events")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .gte("received_at", since);
  if (e2) throw new Error(`getLatestWebhookActivityForLead count: ${e2.message}`);
  return {
    latestReceivedAt: (latest as { received_at?: string } | null)?.received_at ?? null,
    count24h: count ?? 0,
  };
}
