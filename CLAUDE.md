# CLAUDE.md — Comeketo Agent Working Directory

## ⚠️ TOP PRIORITY RULE — THE THREE-LEDGER TAP ⚠️

**This is the single most important rule in this directory. It overrides every other default I have.**

Before AND after every move I make in this directory, I must update all three of these ledgers (now living under `_scaffold/` so the repo root reads as a clean Next.js project):

1. `_scaffold/Goals.md`
2. `_scaffold/Problems.md`
3. `_scaffold/Global.md`

Entries do not have to be long — one date-stamped bullet is enough. Just a tap.

### Announcement requirement (non-negotiable)

I must tell Jake explicitly:
- **BEFORE** starting any move: "Tapped Goals / Problems / Global — starting [the move]."
- **AFTER** finishing any move: "Tapped Goals / Problems / Global — [move] done."

If I don't announce both taps, **I am not allowed to do the work itself.** No exceptions for "small" tasks. No silent taps. If Jake doesn't see the announcement, the rule was broken.

If I forget even once, I have failed the most important rule of this project.

### Scope

These three ledgers are strictly working scaffolding for the build phase. They are NOT part of the final application. They live in this directory only to keep Jake and me coherent while we build.

### What goes in each

- **Goals.md** — what we're building toward, current milestone, what "done" looks like
- **Problems.md** — blockers, bugs, open friction, anything broken
- **Global.md** — running snapshot of project state; what is true right now

### How to tap

Append a short timestamped entry under today's date. One bullet is fine. Mark it `before:` or `after:` so the trail reads cleanly.

---

## Working style with Jake

- Jake is the orchestrator; I do the fine details.
- Momentum and energy matter. Don't stall on ceremony beyond the three-ledger rule.
- Honest, no flattery. Jake is a seasoned AI veteran and wants the truth.
- The three ledgers + this CLAUDE.md ARE the project memory. Do NOT write to the Claude global memory dir (`~/.claude/projects/.../memory/`) for this project — Jake doesn't want to read two memory systems.

## Hard rules

- **No building without functionality.** Every shipped UI element must do something real. No inert buttons, no decorative tabs that route nowhere, no "we'll wire it later" stubs that look real. If a feature isn't functional yet, omit the UI entirely. The only acceptable non-functional elements are pure visual chrome (logos, dividers, decorative dots). When in doubt, ask before adding a stub.
- **Don't push to main on every change.** Local edits stay local until Jake explicitly says push. Vercel deploys only on push to `main`, so the live site (`comeketo-agent-ra8h.vercel.app`) is intentionally behind the working tree. Always ask before pushing.

- **Don't dramatize routine decisions — pick and go.** Jake's flow gets killed by careful "this is your call, here are three options, want me to proceed?" framing on normal operations. When the answer is almost always "do whatever you think is best," asking is friction without payoff. Jake is orchestrating multiple parallel agents; he literally can't be a synchronous gatekeeper for everything. **Just decide and move when the operation is:** committing my own coherent stream, pushing a feature branch with passing tests, picking a sensible default, choosing between two near-equivalent implementation paths, naming a file, or any reversible local action. **Still pause and confirm explicitly when:** force-push, history rewrite, secrets exposure risk, deleting work, modifying production database state, or pushing a tree that mixes my work with another agent's mid-flight stream I can't verify is shippable. Default = act. Confirm only when the action is genuinely destructive or genuinely ambiguous about another agent's intent. The cost of asking unnecessarily is Jake having to read carefully to learn the answer is "yes obviously"; the cost of acting unnecessarily is rare and usually reversible.
- **Tell Jake to `npm run fresh` after any non-trivial sprint.** Next 14's dev server caches webpack chunks in memory. When we add Server Actions, new dynamic routes (`[param]`), or shuffle client/server boundaries underneath a running `next dev`, the cache desyncs and pages start throwing "Cannot find module '../XXX.js'" or 404'ing. `npm run fresh` (added as a script) nukes `.next` and any phantom `app/.next` then restarts. Mention this proactively after any sprint that touches Server Actions, new routes, or client-component shape — don't make Jake debug a stale-cache phantom.
- **Land in position. Don't ask "what's next" by default.** When a sprint completes, the job isn't shipped — the next move has to be teed up. Read the current Goals milestone, look at the Watch items in the latest after-tap, and pick the most *blocking-removal* next move (not the most exciting one). Then either execute it inline as part of the sprint, or land the workspace one click from doing it (file scaffolding in place, todos clear, dependencies wired). Only hand the choice back to Jake when there's a real fork his judgment is needed for. If I find myself listing 3+ options as a question, I'm avoiding the work of choosing — pick one and go. Jake will course-correct if it's wrong; that's cheaper than him navigating from a menu every time.

- **Atomize hard moves before executing.** When a move is non-trivial (touches multiple files / multiple systems / could fan out), write the atomization first: a numbered list of micro-tasks where each atom names (a) what files/state it touches, (b) its inputs, (c) what "done" looks like — concrete enough that another agent could pick it up cold. This is the artifact that makes parallelism possible: Jake can fan 10 versions of me at independent atoms and just let it rip. The discipline isn't "more planning" — it's *making the work parceleable*. If I can't write a clean atomization for a move, I don't actually understand it yet.

## Harness architecture (locked 2026-05-05; single-branch since 2026-05-05 collapse)

Per-lead narrative content lives in **files** under `harness/`, not Supabase tables. The harness lives on `main` alongside the code — single branch, single mental model.

**File tree** (full doc at `harness/README.md`):
- `harness/leads/active/{lead_id}__{slug}/` — per-lead state (`00_meta.json`, `01_comms_digest.md`, `01b_comms_verbatim.md`, `04_profile.md` (LLM-generated), `06_discovery.md` (LLM-generated), `09_andre_alerts.md`, **`10_andre_feedback.md`** (operator override — sweeper never touches), `client_ledger.md`, `comms/{kind}_{date}_{shortid}.json`, `intake/{intake_id}/{meta.json,extracted.md}`).
- `harness/ledger/` — global "what Andre did" ledger (Phase 3+).
- `harness/{approvals,heartbeat,automations,catalog,staff,venues,people,intelligence,summaries,catalog-content}/` — broader memory categories scaffolded for incremental fill.

**Vercel rebuild discipline:**
- `.vercelignore` excludes `harness/` from the deploy bundle. The runtime reads files via the GitHub Contents API (Octokit), not from the bundle.
- Vercel's "Ignored Build Step" command aborts builds when nothing outside `harness/` changed. Cron sweeps writing dozens-to-hundreds of harness commits per day produce **zero** Vercel rebuilds.

**Direct REST**, not MCP, hydrates the folders. `closeListActivities` + per-call `closeGetCall` for transcripts. MCP stays as the chat agent's escape hatch only.

**Sweeper** (`src/lib/lead-folder-sweeper.ts`) runs every 2h via Vercel cron, plus manual trigger on `/test`. Idempotent — byte-diff means zero commits when nothing changed.

**What stays in Supabase as auxiliary memory:**
- `close_webhook_events` (transactional unique-index dedup on `event_id`).
- `threads` + `messages` (chat cockpit history; per-token git commits would be absurd).
- `lead_activity_touches` (single-row freshness signal updated 1000s of times per day).
- Storage buckets for >1MB binaries.

**What moved to files:**
- Per-lead profile, discovery slots, NEPQ openers, comms history, call transcripts, win angles, identity notes, intake artifacts.

**Don't add new Supabase tables for lead-scoped narrative content.** If a feature wants to attach prose, slots, or contextual data to a single lead, write a new file in that lead's folder. Reach for a table only when (a) cross-lead aggregation is the primary access pattern, (b) the data needs ACID transaction semantics, or (c) per-event commit thrash would dominate.

The deprecated `lead_facts` migration lives in `supabase/_deprecated/` as a record of the architecture pivot — do not re-add it.

## Product North Star — `Guardrails.md`

The product spec lives at `/Users/jakeaaron/ComeketoAgent/Guardrails.md` (v3.0+). It is the durable contract for what Comeketo Agent is and how it must behave. Read it before making product decisions. Key shape:

- **Lead OS, not inbox sender.** Every Andre-owned lead gets a hydrated **Box** (Close state + comms + call transcripts + extracted facts) and a tailored **seven-day cycle**.
- **Hard gates** non-negotiable: ownership=Andre, status≠Won/Lost, stop signals, reply gate, send window, frequency cap, fresh-Box requirement, snapshot match.
- **Heartbeat** every 30-60 min rehydrates Boxes and pauses stale plans before sending.
- **No customer-facing send without explicit execution-mode + Andre approval + snapshot match.**
- **NEPQ voice** on drafts. No fake warmth. Ask, don't pitch.
- **Skip codes** enum is the language of "why this didn't fire." Always explicit, never silent.

When my work conflicts with Guardrails, Guardrails wins. When Guardrails is silent or vague on a build choice, ask Jake.
