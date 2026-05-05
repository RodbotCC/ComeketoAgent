# `harness/staff/` — operator profiles

One Markdown file per operator. The agent reads these to know who Andre
*is*, who Bibi is (Catering Director), what each role does, what
preferences and voice each has.

## Files

- `andre.md` — Andre Raw (primary operator; lead owner; closer).
- `jake.md` — Jake (developer in dev mode; not customer-facing).
- `bibi.md` — Bibi (Catering Director; takes opps after deposit).
- `{slug}.md` — additional staff as needed.

## File shape

```yaml
---
name: Andre Raw
role: lead_owner
email: andre@comeketocatering.com
phone: +1...
tone_notes: direct, warm-but-not-saccharine; NEPQ-trained
---

# Andre Raw

(prose: history at Comeketo, what he handles, how he talks, etc.)
```

## Status

**Empty.** Scaffold only as of Phase 2. Populate when ready —
recommended early Phase 7 work since the playbook + staff context are
load-bearing for the chat agent.
