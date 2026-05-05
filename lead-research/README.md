# Lead Research Drop Zone

This folder is for GPT agents that research Andre's real Close CRM leads and write the resulting client dossiers back into this repository through the GitHub MCP server.

This is not wired directly into the application yet. Treat it as a docs-only research lane. The app can read from this folder later after the shape proves stable.

## Scope

Only research leads connected to:

`01. Andre`

Do not collect, summarize, or write folders for leads owned by other users unless Jake explicitly changes this rule.

The first sweep should include:

- The 50 newest Andre-owned Close leads.
- Any previously researched Andre lead whose communication chain is still open.
- Any Andre lead that newly enters the active/open pool after the first sweep.

Keep researching an already discovered lead until its communication chain is closed. A chain is closed when the lead is won, lost, not interested, explicitly asks to stop, or Andre/Jake marks it closed.

## Folder Layout

Every client gets one directory inside:

`lead-research/clients/`

Use this folder-name pattern:

`{close_lead_id}__{client_or_company_slug}/`

Examples:

- `lead_abc123__civic-arts-collective-wendy-quinn/`
- `lead_def456__whitman-family-reunion/`

Use lowercase slugs, ASCII letters/numbers/hyphens only. Do not rename an existing client folder just because the lead name changes. Update the metadata file instead.

## Required Files Per Client

Each client folder should contain these files:

- `00_meta.json`
- `01_profile.md`
- `02_comms_digest.md`
- `03_comms_verbatim.md`
- `04_open_questions.md`
- `05_research_notes.md`
- `06_next_actions.md`
- `raw/`

The `raw/` directory may contain JSON exports or payload snapshots from Close MCP calls when useful.

## What To Capture

Capture all relevant available Close CRM data, including:

- Lead id, lead display name, status, owner, date created, date updated.
- Contacts, names, roles, emails, phones, and known company/event information.
- Opportunities, pipeline status, value, event date, guest count, service style, venue, budget, and custom fields when present.
- Email threads and full email bodies.
- SMS history and full message text.
- Phone call records and full transcripts when available.
- Meeting records and transcripts/notes when available.
- Notes, comments, tasks, workflow/sequence enrollments, and status changes.
- The full back-and-forth between Andre and the client, in chronological order.
- Profile-level interpretation: what the client likely wants, what is known, what is unknown, what would move the conversation forward.

Do not invent missing facts. Use `unknown` when the record does not show an answer.

## File Contracts

### `00_meta.json`

Machine-readable summary. Keep it valid JSON.

Recommended fields:

```json
{
  "close_lead_id": "lead_xxx",
  "folder_slug": "lead_xxx__client-name",
  "display_name": "Client Name",
  "owner": "01. Andre",
  "status": "Potential",
  "chain_state": "open",
  "date_created": "2026-05-01T00:00:00Z",
  "date_updated": "2026-05-05T00:00:00Z",
  "last_close_activity_at": "2026-05-05T00:00:00Z",
  "last_researched_at": "2026-05-05T00:00:00Z",
  "transcripts_included": true,
  "open_loop": true,
  "source": "Close MCP",
  "research_agent": "GPT lead research agent"
}
```

### `01_profile.md`

Human-readable lead profile:

- Who the lead is.
- What they appear to need.
- Known event/business details.
- Unknowns.
- Relationship tone.
- Buying signals.
- Stop signals.
- Recommended discovery angle.

### `02_comms_digest.md`

Chronological digest of communications. Summarize every meaningful exchange and preserve dates, channels, participants, and direction.

### `03_comms_verbatim.md`

Verbatim communication record. Include the full available bodies/transcripts from emails, SMS, calls, meetings, and notes. Keep chronological order. If a transcript is unavailable, explicitly write that it was unavailable.

### `04_open_questions.md`

What Andre still needs to know before the next strong move.

### `05_research_notes.md`

Agent reasoning and observations. Keep this separate from verbatim records so we can distinguish facts from interpretation.

### `06_next_actions.md`

Recommended next moves, including:

- Best next question.
- Suggested channel.
- Why this move fits the communication history.
- Conditions that should pause, stop, or escalate.

## GitHub MCP Write Rules

- Write only inside `lead-research/`.
- Create missing client directories as needed.
- Never delete another agent's work unless Jake explicitly asks.
- Update existing client files when new Close activity appears.
- Prefer small, clear commits or file updates grouped by client.
- Do not commit secrets, API keys, private credentials, or unrelated app code.
- Preserve raw transcript text exactly where possible.

## Closure Rules

Set `chain_state` in `00_meta.json` to:

- `open` when Andre may still need to act.
- `paused` when waiting on the client or Andre.
- `closed_won` when the lead is won.
- `closed_lost` when the lead is lost.
- `closed_not_interested` when the client says no or stop.
- `closed_unknown` only if Close clearly marks it inactive but the reason is unclear.

Closed leads can remain in the folder. Do not remove them.

