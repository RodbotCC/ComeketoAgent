# `harness/ledger/` — global activity ledger

The constantly-updated record of "what Andre actually does" plus every
agent action. Append-only. One file per UTC day.

## Files

- `YYYY-MM-DD.jsonl` — one JSON object per line, one file per UTC day.
- `_inbox/{webhook_id}.json` — transient buffer; webhooks enqueue here,
  the 5-min compactor cron drains and appends to today's `.jsonl`.
- `_by-trace/{trace_id}.jsonl` — optional shard for long traces.

## Row schema

```json
{
  "at": "2026-05-05T14:23:11.412Z",
  "action_kind": "plan_paused_stale",
  "close_lead_id": "lead_abc123",
  "plan_id": "pln_2026_05_05_abc",
  "trace_id": "trc_8f2",
  "operator_id": "andre",
  "payload": { "reason": "box_age_min=73" },
  "result": "ok",
  "skip_code": "STALE_BOX",
  "snapshot_id_at_action": "sha256:..."
}
```

Required: `at`, `action_kind`, `result`. Everything else optional.

## Writers

- `src/lib/harness-ledger.ts` (when shipped) — debounced 2-second
  batcher, SHA-retry on conflict.
- `src/app/api/cron/ledger-compact/route.ts` — drains `_inbox/`.

## Readers

- `harness/catalog/recent-actions.json` covers ~99% of UI hot path —
  the ledger files are never touched on a typical request.
- For deep queries: `git grep` + `jq` against the `.jsonl` files.

## Status

**Not yet active.** Scaffold only as of Phase 1+2. Phase 3 ships the
writer; until then this folder stays empty.
