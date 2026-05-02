-- Explicit deny for Supabase `anon` and `authenticated` roles on app tables that
-- already enable RLS. The Next.js server uses the service role key, which
-- bypasses RLS; this guards against accidentally wiring the publishable key in
-- a browser client.

drop policy if exists "close_webhook_events_block_publishable" on public.close_webhook_events;
create policy "close_webhook_events_block_publishable"
  on public.close_webhook_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "intake_artifacts_block_publishable" on public.intake_artifacts;
create policy "intake_artifacts_block_publishable"
  on public.intake_artifacts
  for all
  to anon, authenticated
  using (false)
  with check (false);
