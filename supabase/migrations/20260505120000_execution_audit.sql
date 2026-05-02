-- execution_log: append-only Close/heartbeat/operator actions (Guardrails §O).
-- approval_audit: day approval transitions (§I).

create table if not exists public.execution_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  operator_id text,
  close_lead_id text,
  plan_id text,
  action_kind text not null,
  payload jsonb,
  result text not null default 'ok',
  skip_code text,
  trace_id text,
  snapshot_id_at_action text
);

create index if not exists execution_log_lead_at_idx
  on public.execution_log (close_lead_id, at desc);

create index if not exists execution_log_plan_at_idx
  on public.execution_log (plan_id, at desc);

create index if not exists execution_log_trace_idx
  on public.execution_log (trace_id) where trace_id is not null;

alter table public.execution_log enable row level security;

comment on table public.execution_log is 'Durable audit of heartbeat, Close writes, and operator actions; app uses service role.';

create table if not exists public.approval_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  plan_id text not null,
  day_index int,
  from_status text not null,
  to_status text not null,
  actor text,
  reason text,
  based_on_snapshot_id text
);

create index if not exists approval_audit_plan_at_idx
  on public.approval_audit (plan_id, at desc);

alter table public.approval_audit enable row level security;

comment on table public.approval_audit is 'Plan/day approval transitions; app uses service role.';

-- Bump channel for Realtime/SSE (webhook touches).
create table if not exists public.lead_activity_touches (
  lead_id text primary key,
  bumped_at timestamptz not null default now()
);

create index if not exists lead_activity_touches_bumped_idx
  on public.lead_activity_touches (bumped_at desc);

alter table public.lead_activity_touches enable row level security;

comment on table public.lead_activity_touches is 'Last webhook activity bump per lead (freshness signal).';

-- Block publishable keys (service role bypasses RLS).
drop policy if exists "execution_log_block_publishable" on public.execution_log;
create policy "execution_log_block_publishable"
  on public.execution_log for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "approval_audit_block_publishable" on public.approval_audit;
create policy "approval_audit_block_publishable"
  on public.approval_audit for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "lead_activity_touches_block_publishable" on public.lead_activity_touches;
create policy "lead_activity_touches_block_publishable"
  on public.lead_activity_touches for all to anon, authenticated
  using (false) with check (false);
