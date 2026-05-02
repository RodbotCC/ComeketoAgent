-- Intake artifacts: files stored in Storage bucket `intake`, indexed here for Box attachment later.

create table if not exists public.intake_artifacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  filename text not null,
  storage_path text not null,
  mime text,
  byte_size int,
  summary text,
  lead_id text
);

create index if not exists intake_artifacts_created_idx
  on public.intake_artifacts (created_at desc);

alter table public.intake_artifacts enable row level security;

comment on table public.intake_artifacts is 'Uploaded intake files; app uses service role for writes.';

insert into storage.buckets (id, name, public)
values ('intake', 'intake', false)
on conflict (id) do nothing;
