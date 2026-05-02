-- Sequence drafts + AI-proposed Close steps (Guardrails §M).
-- Next.js uses the Supabase service role; RLS blocks publishable keys.

create table if not exists public.automation_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled draft',
  status text not null default 'draft',
  workflow_json jsonb not null default '{"id":"local","name":"Untitled","nodes":[],"connections":[]}'::jsonb,
  close_steps_json jsonb,
  risk_notes text,
  close_sequence_id text,
  operator_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_drafts_status_idx on public.automation_drafts (status);
create index if not exists automation_drafts_updated_idx on public.automation_drafts (updated_at desc);

alter table public.automation_drafts enable row level security;

comment on table public.automation_drafts is 'Operator automation drafts; Close steps are proposed then reviewed (§M3).';

drop policy if exists "automation_drafts_block_publishable" on public.automation_drafts;
create policy "automation_drafts_block_publishable"
  on public.automation_drafts for all to anon, authenticated
  using (false) with check (false);
