# Global

Running snapshot of project state. Tapped before & after every move.

---

## 2026-05-01

- Workspace `/Users/jakeaaron/ComeketoAgent/` initialized.
- Three-ledger workflow established: `Goals.md`, `Problems.md`, `Global.md`.
- `CLAUDE.md` written; tap rule set as top priority with announcement requirement (before + after).
- Scheduled-task deck cleared earlier today — only `atlas-tldr-index` remains active. 8 tasks disabled, 13 already-fired tasks left as-is on disk.
- Jake mentioned new functionality coming that motivated the wipe — details pending.
- **after inception:** All four files written (CLAUDE.md + 3 ledgers). Tap rule is now the single most important behavior in this directory.
- **architecture decided by Jake:** New app pivots off ChatGPT 5.5 + agents + Close CRM connection (just released). GitHub MCP becomes the coordination layer — Comeketo agent designs automations conceptually → posts to GitHub → ChatGPT agents poll on schedule → trigger when conditions met. Unlimited agents, unlimited schedules.
- **client-facing constraint:** Must read as an evolution of the existing app, not a rebuild. Aesthetic Asset Kit at `/Users/jakeaaron/Downloads/CC Agent/CCAgentindex/boxes/assets/Aesthetic Asset Kit` is the visual contract. Old `/Users/jakeaaron/Downloads/CC Agent/` is reference only — no wholesale cloning.
- **before [foundation alignment]:** Standing by for Jake's call on stack/location/creds before laying any brick.
- **alignment finalized:** OpenAI key received (treated as exposed, will land in gitignored `.env.local` at scaffold time). Supabase MCP confirmed as hosted HTTP. Defaults locked unless Jake vetoes: Next.js 14 + TS + App Router, project root at `/Users/jakeaaron/ComeketoAgent/app/`, GitHub hosted MCP (`https://api.githubcopilot.com/mcp/`), Supabase hosted MCP. Auth via static headers in Responses API tool config.
