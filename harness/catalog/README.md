# `harness/catalog/` — UI hot-path rollups

Cron-rebuilt JSON files that the app reads to avoid scanning the harness
tree on every UI request. Treat as derived/disposable; nothing lives here
that can't be regenerated from other harness folders.

## Files (when active)

- `recent-actions.json` — last 200 ledger rows for the cockpit's "what
  just happened" widget.
- `leads-by-status.json` — index of `harness/leads/active/*` by Close
  status_label.
- `plans-active.json` — list of active plans across all leads.

## Writer

`src/app/api/cron/catalog-rebuild/route.ts` (when shipped, Phase 3+) —
runs every 5-15 min, scans the source folders, writes the rollups.

## Status

**Not yet active.** Scaffold only as of Phase 2.
