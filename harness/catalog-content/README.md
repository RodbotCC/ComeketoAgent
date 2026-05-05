# `harness/catalog-content/` — what Comeketo sells

Reference content the agent loads to know the product. Menu, packages,
pricing, service styles. Read by the chat agent, by LLM regen for
per-lead profiles (so it can match the lead's vision to actual offerings),
and by the workflow author.

## Files

- `menu.md` — full menu (Brazilian BBQ, churrasco, drop-off, full-service).
- `packages.md` — bundled packages (deluxe buffet, churrasco rodizio, etc.).
- `pricing.md` — per-person tiers, deposit structure, payment milestones.
- (Add additional reference docs as they emerge — `service-styles.md`,
  `dietary-handling.md`, etc.)

## File shape

Plain Markdown. Frontmatter optional. The agent reads these as
authoritative. Keep them current — outdated content here means the
agent talks about offerings that don't exist.

## Status

**Empty.** Populate from existing Comeketo materials when ready.
Recommended to do this alongside `staff/andre.md` since both feed the
chat agent's grounding context.
