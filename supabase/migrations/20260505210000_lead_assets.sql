-- Lead/global asset library: reusable and lead-scoped files for rich email,
-- proposal, delegation, and future Close attachment workflows.
--
-- Files live in private Storage bucket `assets`; this table stores metadata.
-- Customer-facing sends must still go through an explicit approval/publish path.

create table if not exists public.lead_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope text not null default 'lead' check (scope in ('lead', 'global')),
  close_lead_id text,
  title text not null,
  filename text not null,
  storage_bucket text not null default 'assets',
  storage_path text not null,
  mime text,
  byte_size int,
  kind text not null default 'file',
  description text,
  alt_text text,
  approved_for_customer boolean not null default false,
  source text not null default 'operator_upload',
  metadata jsonb not null default '{}'::jsonb,
  constraint lead_assets_scope_lead_check
    check ((scope = 'global' and close_lead_id is null) or (scope = 'lead' and close_lead_id is not null))
);

create index if not exists lead_assets_scope_created_idx
  on public.lead_assets (scope, created_at desc);

create index if not exists lead_assets_lead_created_idx
  on public.lead_assets (close_lead_id, created_at desc)
  where close_lead_id is not null;

create unique index if not exists lead_assets_storage_path_idx
  on public.lead_assets (storage_bucket, storage_path);

alter table public.lead_assets enable row level security;

drop policy if exists "lead_assets_block_publishable" on public.lead_assets;
create policy "lead_assets_block_publishable"
  on public.lead_assets
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

comment on table public.lead_assets is 'Private lead/global asset library metadata. App uses service role; sends require explicit approval.';
