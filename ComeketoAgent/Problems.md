# Problems

Running ledger of blockers, bugs, friction, anything broken. Tapped before & after every move.

---

## 2026-05-01

- **inception:** None yet. Workspace was empty. Build has not started.
- **watch:** Scheduled tasks were disabled, not deleted — if the new functionality doesn't supersede them, the live customer follow-ups (Hugo, Steve, Daphney, Dawn, Eliana, Elizabeth) are now silent until re-enabled.
- **after inception:** No new problems surfaced setting up the ledgers. Clean.
- **before [foundation alignment]:** Three forks blocking foundation kickoff — (1) stack choice, (2) project location, (3) credential + MCP-hosting posture. None of these are recoverable without churn if I guess wrong, so I'm asking Jake to lock them.
- **architectural watch:** OpenAI Responses API needs *remote/HTTP* MCP servers, not local stdio. GitHub has an official hosted MCP. Supabase MCP options are local-only or self-hosted as of last I checked. This may need verification before Settings page can offer real fields.
- **resolved 2026-05-01:** Supabase ships a hosted HTTP MCP at `https://mcp.supabase.com/mcp?project_ref=...`. My earlier "trickier" call was wrong. Both MCPs can be remote-attached to Responses calls.
- **new watch [auth wiring]:** Supabase + GitHub MCPs both expect OAuth flows in the Claude/IDE world. OpenAI Responses API tool config takes static `headers` instead. Need to confirm at Test-page time whether bearer tokens (PATs / service role keys) work in headers, or whether we need a pre-auth bridge.
- **security flag 2026-05-01:** OpenAI API key was pasted in chat. I am NOT saving it to memory and I am NOT writing it to disk yet (no scaffold exists). Will land in `.env.local` (gitignored) once project is scaffolded. Jake should consider this key exposed — recommend rotation post-scaffold once we have a path to receive a fresh one safely.
- **resolved 2026-05-01:** Supabase key naming was wrong in my head — current format is `sb_publishable_*` and `sb_secret_*`, not legacy anon/service_role. Updating env wiring to match.
- **resolved 2026-05-01:** Operator-key-handling policy clarified — when Jake provides a key, use it. He owns rotation. No more security lectures.
- **before [scaffold] watch:** GitHub MCP auth value not in the .env. Stubbing as empty in `.env.local`; Settings page will let Jake fill it once we know the auth shape (PAT vs OAuth bearer).
