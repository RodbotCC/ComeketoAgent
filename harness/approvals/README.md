# `harness/approvals/` — day-level approval state transitions

Append-only record of every plan-day approval/skip/kill. Replaces
Supabase `approval_audit` table after Phase 5.

## Files

- `YYYY-MM.jsonl` — monthly partition (lower volume than the main ledger).

## Row schema

```json
{
  "at": "2026-05-05T14:12:45Z",
  "plan_id": "pln_2026_05_05_abc",
  "day_index": 3,
  "from_status": "needs_review",
  "to_status": "approved",
  "actor": "andre",
  "trace_id": "trc_ui_92",
  "based_on_snapshot_id": "sha256:..."
}
```

## Status

**Not yet active.** Scaffold only as of Phase 2. Phase 5 cuts the writer
over from Supabase; until then this folder stays empty.
