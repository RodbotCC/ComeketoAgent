# `harness/summaries/` — daily and weekly digests

Generated digests of "what happened this day/week" — written by the
briefing flow, read by the agent + by `/briefing` page.

## Files

- `daily/{YYYY-MM-DD}.md` — end-of-day summary.
- `weekly/{YYYY-WW}.md` — week-summary, written Sunday night.

## File shape

```yaml
---
date: 2026-05-05
generated_at: 2026-05-05T23:55:00Z
counts:
  new_leads: 3
  fires: 18
  skips: 22
  approvals: 7
  webhooks: 41
hot_leads: [lead_abc, lead_xyz]
---

# Daily summary — 2026-05-05

(prose: what moved, what's stuck, top wins, top concerns)
```

## Status

**Empty.** Phase 7+ work; not in current migration scope. The
`/briefing` page currently computes its summaries on the fly from
`execution_log` + `heartbeat_runs`.
