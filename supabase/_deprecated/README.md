# Deprecated migrations

Files in this folder are NOT applied by Supabase CLI — they sit outside
`supabase/migrations/` so the migration runner ignores them.

We keep them around (rather than deleting) because:
- They document architectural decisions that were tried and reversed.
- If the table was applied to the live DB before deprecation, the SQL here
  is the schema you need to drop it cleanly later.

## `20260505200000_lead_facts.sql`

Created the `lead_facts` table for storing per-lead discovery slot data
(event_date, venue, guest_count, etc.) keyed by `slot_id`.

**Deprecated 2026-05-05** — replaced by per-lead Markdown folders on the
`leads-data` branch. See `_leads/README.md` for the file-based architecture.
The Discovery page reads `06_discovery.md` (LLM-generated) directly; the
old `journey-score.ts` SQL queries return empty when the table is empty
or missing.

If `lead_facts` was applied to the live database, dropping it is safe:

```sql
DROP TABLE IF EXISTS public.lead_facts CASCADE;
```

The `journey-score.ts` query is wrapped in try/catch and treats a missing
table as an empty result set.
