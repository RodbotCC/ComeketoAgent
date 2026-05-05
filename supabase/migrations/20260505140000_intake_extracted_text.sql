-- Intake artifacts: scope to lead + retain full extracted text alongside the short `summary`.
-- See `~/.claude/plans/perfect-i-m-going-to-eager-twilight.md` (atom 1).

-- Drop orphaned (org-wide) artifact rows. Operator confirmed: pre-lead-scope rows are demo sludge.
-- Note: Supabase blocks direct DELETE on `storage.objects` via a trigger
-- (`storage.protect_delete()` — error 42501). Their guard is "use the Storage API."
-- We accept the small cost of orphaned bucket files — bucket is private, no harm — in exchange
-- for keeping this migration a single SQL transaction. If we ever want to clean the bucket,
-- it's a one-off Storage API call, not part of schema.
delete from public.intake_artifacts where lead_id is null;

-- Full extracted text. `summary` stays as the 600-char preview; this carries the longer body
-- that gets threaded into the chat system prompt when in Lead mode.
alter table public.intake_artifacts
  add column if not exists extracted_text text;

create index if not exists intake_artifacts_lead_idx
  on public.intake_artifacts (lead_id, created_at desc);
