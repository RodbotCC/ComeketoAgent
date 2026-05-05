# `harness/heartbeat/` — per-run heartbeat snapshots

One JSON file per heartbeat run, partitioned by date. Replaces Supabase
`heartbeat_runs` table after Phase 5.

## Files

- `YYYY-MM-DD/{run_id}.json` — per-run snapshot.

## Row shape (file content)

```json
{
  "run_id": "hb_2026_05_05T14_00_02Z",
  "at": "2026-05-05T14:00:02Z",
  "scope": "all",
  "leads_scanned": 42,
  "actions_eligible": 18,
  "actions_fired": 5,
  "actions_skipped": 13,
  "skip_breakdown": { "STALE_BOX": 8, "REPLY_GATE": 3, "STOP_SIGNAL": 2 },
  "report": [ { "lead_id": "...", "plan_id": "...", "verdict": "..." } ],
  "duration_ms": 87234
}
```

## Status

**Not yet active.** Scaffold only as of Phase 2. Phase 5 cuts the writer
over.
