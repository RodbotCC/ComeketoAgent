-- lead_facts: persisted Discovery Map values that aren't represented as
-- canonical Close custom fields. Sources: 'llm_extraction' (from
-- extract_discovery_facts composite tool) and 'operator' (manual override
-- from /lead/[id]/discovery slot editor).
--
-- 'close_custom' is NOT stored here — those values live on Close and the
-- resolver reads them directly from LeadBoxPageData.customFields.

create table if not exists public.lead_facts (
  lead_id text not null,
  slot_id text not null,
  value jsonb,
  source text not null check (source in ('llm_extraction', 'operator')),
  evidence jsonb,
  extracted_at timestamptz not null default now(),
  primary key (lead_id, slot_id)
);

create index if not exists lead_facts_lead_idx
  on public.lead_facts (lead_id);

create index if not exists lead_facts_extracted_idx
  on public.lead_facts (extracted_at desc);

alter table public.lead_facts enable row level security;

comment on table public.lead_facts is 'Discovery Map fact overrides (LLM extraction + operator edits). Service role only.';

drop policy if exists "lead_facts_block_publishable" on public.lead_facts;
create policy "lead_facts_block_publishable"
  on public.lead_facts for all to anon, authenticated
  using (false) with check (false);
