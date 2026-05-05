# `harness/` — single primary memory for Comeketo Agent

The **harness** is the durable, file-based memory that the Comeketo Agent
app and the agent itself both reason from. It lives on the same branch as
the code (`main`) — code in `src/`, memory in `harness/`.

The runtime reads these files via the GitHub Contents API (Octokit), not
via the deployed bundle. `.vercelignore` excludes `harness/` from the build
artifact.

> **Vercel rebuilds are skipped for harness-only commits** via Vercel's
> "Ignored Build Step" — a `git diff` command that aborts the build when
> nothing outside `harness/` changed. Cron sweeps (every 2h) commit lead
> updates here without triggering deploys.

## Top-level structure

```
harness/
├── README.md                     ← you are here
├── leads/                        ← per-lead state (one folder per lead)
│   ├── active/{lead_id}__{slug}/
│   ├── archive/{lead_id}__{slug}/
│   └── README.md                 ← per-lead folder contract
├── ledger/                       ← global "what Andre did" — append-only JSONL per UTC day
├── approvals/                    ← day-level approval transitions, monthly partition
├── heartbeat/                    ← per-run snapshots (skip_breakdown, day verdicts)
├── automations/                  ← workflow drafts + published manifests
├── catalog/                      ← cron-rebuilt UI rollups (recent-actions, leads-by-status)
├── staff/                        ← operator profiles (Andre, Bibi, Jake/dev)
├── venues/                       ← venue rolodex (Mistletoe Acres, etc.)
├── people/                       ← contact rolodex independent of leads (referrals, vendors)
├── intelligence/                 ← web research, enrichment, competitor notes
├── summaries/                    ← daily/weekly digests
└── catalog-content/              ← what Comeketo sells (menu, packages, pricing)
```

Each top-level subfolder has its own `README.md` documenting:
- what files live there
- what code writes them
- what code reads them

## Architectural rules

1. **The app reads + writes via Octokit** against the configured branch
   (default: `main`). Local checkouts are fine for browsing but the
   runtime always goes through the GitHub API for consistency.
2. **Sweeper writes are idempotent.** Re-running a sweep with no upstream
   changes should produce zero commits.
3. **Operator override files (e.g. `10_andre_feedback.md`) are sacred.**
   Sweepers and LLM regen never touch them.
4. **Numbered file prefixes (`00_`, `01_`, `01b_`, `04_`, `05_`, `06_`,
   `09_`, `10_`)** force a stable read-order when an LLM ingests a folder
   alphabetically. Do not renumber.
5. **The ledger (`harness/ledger/`) is append-only.** Never rewrite past
   day files. The compactor cron is the sole writer.

## What stays in Supabase (auxiliary memory)

The harness replaces Supabase as primary memory. Supabase retains a small
auxiliary role for genuinely Postgres-shaped concerns:

- `close_webhook_events` — needs transactional unique-index dedup on
  `event_id`. Git can't enforce uniqueness atomically.
- `threads` + `messages` — chat cockpit history; tokens stream in
  per-message; per-token git commits would be absurd.
- `lead_activity_touches` — single-row freshness signal updated 1000s
  of times per day; commit thrash risk too high.
- Storage buckets `intake` and `assets` — files >1MB exceed GitHub
  Contents API. Bytes stay in object storage; harness carries metadata
  + `blob_url`.

The deprecated `lead_facts` migration lives in `supabase/_deprecated/`
as a record of the architecture pivot. Do not re-add it.

## How files get written

Three writer types:

- **Cron writers** (heartbeat, sweeper) buffer all rows in memory during
  a run, then commit once with all writes batched.
- **Webhook writers** never write the ledger directly. They enqueue to
  `harness/ledger/_inbox/{webhook_id}.json`; a 5-min compactor cron
  consumes the inbox and appends to today's `.jsonl` in one commit.
- **Manual/UI writers** use a 2-second debounce window in
  `src/lib/harness-batch.ts`, then flush.

Result: webhook flood → max 1 ledger commit per 5 min. Quiet day → ~100
commits total. Busy day → ~300. Well within GitHub's 5000 req/hr ceiling.

## Phase migration history

- **Phase 0** (2026-05-05) — orphan `leads-data` branch created;
  per-lead folder scaffold landed.
- **Phase 1+2** (2026-05-05) — intake migrated to file tree; per-lead
  folder root renamed `_leads/` → `harness/leads/`; top-level harness
  dirs scaffolded.
- **Branch collapse** (2026-05-05) — moved harness from `leads-data`
  branch to `main`. Vercel "Ignored Build Step" handles the rebuild
  concern. Single branch, single mental model.
- **Phase 3+** (future) — global ledger dual-write, plans-fs, audit
  cutover, full Supabase wind-down.

See `~/.claude/plans/this-is-going-to-cryptic-turing.md` for the full
migration plan.
