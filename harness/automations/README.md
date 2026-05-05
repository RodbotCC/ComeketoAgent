# `harness/automations/` — workflow drafts + published manifests

Replaces Supabase `automation_drafts` table after Phase 7+ (deferred —
not in current migration scope).

## Files

- `drafts/{draft_id}.json` — in-progress workflow drafts.
- `published/{automation_id}.json` — manifests of workflows that landed
  in Close.

## Status

**Not yet active.** Scaffold only as of Phase 2. Migration of
automation_drafts is deferred per the harness migration plan — it's
small-volume and recently added by a parallel agent. Don't move it
without coordinating.
