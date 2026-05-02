-- Close webhook events (Guardrails: live activity / eventual Realtime feed).
-- Apply in Supabase SQL editor or via CLI. Service role bypasses RLS.

create table if not exists public.close_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  subscription_id text,
  event_id text not null,
  object_type text,
  action text,
  lead_id text,
  object_id text,
  organization_id text,
  payload jsonb not null,
  signature_verified boolean not null default false
);

create unique index if not exists close_webhook_events_event_id_key
  on public.close_webhook_events (event_id);

create index if not exists close_webhook_events_lead_received_idx
  on public.close_webhook_events (lead_id, received_at desc);

create index if not exists close_webhook_events_received_idx
  on public.close_webhook_events (received_at desc);

alter table public.close_webhook_events enable row level security;

comment on table public.close_webhook_events is 'Ingress log for Close CRM webhooks (POST /api/webhooks/close).';
