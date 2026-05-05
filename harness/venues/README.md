# `harness/venues/` — venue rolodex

One Markdown file per recurring venue. Lets the agent recognize repeat
locations across leads (Mistletoe Acres, Waveny House, etc.) and pull
relevant logistics/notes when a lead mentions one.

## Files

- `{slug}.md` — one per venue. Slug derived from venue name.

## File shape

```yaml
---
name: Mistletoe Acres Tree Farm
city: East Bridgewater
state: MA
zip: 02333
type: outdoor / wedding / barn
amenities: [tent_provided_by_client, kitchen_access_no, power_limited]
notes_link: ...
---

# Mistletoe Acres Tree Farm

(prose: layout notes, photos, past events, what worked / didn't)
```

## Status

**Empty.** Populate as venues recur in real leads.
