/**
 * LLM regeneration for interpreted client-box docs (Atom 7).
 *
 * Reads the raw lead substrate (`01_raw_lead.json`, `02_continuity.jsonl`, and
 * referenced `comms/*.json`) from a lead's folder, runs OpenAI Responses
 * calls, writes back interpreted prose. Skip-when-hash-matches keeps cost
 * under control: most cron ticks for most leads = zero LLM calls.
 *
 * The Discovery + Personal pages (Atom 8) read these files as their source
 * of truth instead of the deprecated `lead_facts` Supabase table.
 */

import { createHash } from "crypto";
import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "./settings";
import { readLeadFile, writeLeadFile, findLeadFolderPath } from "./lead-folder";
import { closeListLeadsByAssignee, type CloseLead } from "./close";
import { isLeadInScope } from "./lead-folder-sweeper";
import { getSalesPlaybook } from "./sales-playbook";

const PROFILE_SYSTEM = `${getSalesPlaybook({ tight: true })}

---

You are summarizing a Comeketo Catering lead for the sales operator (Andre). You read the verbatim communication history and produce a Markdown profile document. **Apply the Sales Playbook framework above** when shaping Win Angles, Risks, and NEPQ Openers — the openers MUST follow Mirror → Sounds-Like → Open-question structure and use the playbook's exact NEPQ progression idioms.

Required sections, in this order:
## Snapshot
3–5 bullet points: who they are, what event, when, where, current status.

## Identity & Context
What we know about the buyer's situation, decision drivers, cultural notes if relevant. Be specific — if comms reveal a pattern (e.g. "they keep asking about churrasco"), name it.

## Win angles
2–4 specific ways Comeketo could close this lead. Tied to their actual signals — pricing tier, service style fit, timing, family/cultural fit, etc. Concrete, not abstract.

## Risks
What could lose this deal. Stop signals, competitor mentions, price sensitivity, silence patterns, decision-maker ambiguity.

## NEPQ openers
2–3 question-shaped openings Andre could use. NEPQ voice: curious, not pitchy. Ask, don't pitch.

Voice rules:
- No fake warmth. No "I hope this email finds you well." No "We're excited to..."
- Specific over generic. If you don't know something, say "unknown" — never invent.
- Andre's voice is direct and warm-but-not-saccharine.

Output ONLY the Markdown body (the frontmatter is added by the caller).`;

const COMMS_SYSTEM = `${getSalesPlaybook({ tight: true })}

---

You are interpreting a Comeketo Catering lead's communications for Andre.
You read the raw Close substrate and produce a concise Markdown comms read.

Required sections, in this order:
## Timeline read
Oldest-to-newest narrative of what happened. Mention calls, SMS, email, and
missed windows only when grounded in the raw records.

## Buyer signals
What the lead has revealed through behavior, timing, replies, questions,
silence, objections, and channel preference.

## Deal state
Where the relationship appears to stand right now. Be direct and evidence-led.

## Next interpretation
What Andre should understand before he writes or calls. Do not draft the
outreach here; this is interpretation, not execution.

Rules:
- Never invent facts.
- Quote or cite activity dates when a claim depends on a specific comm.
- If the raw comms are thin, say so.
- Output ONLY the Markdown body (frontmatter is added by the caller).`;

const DISCOVERY_SYSTEM = `${getSalesPlaybook({ tight: true })}

---

You are extracting structured discovery facts from a Comeketo Catering lead's verbatim communication history. The Sales Playbook above defines the NEPQ progression — your "Current quest" and "NEPQ ask" must reflect the right stage of that progression for this lead.

The 9 canonical discovery slots:
1. event_date — date of the event
2. venue — physical location (specific venue name or "TBD")
3. location — city/state/zip if event is at home or vague venue
4. client_type — wedding / corporate / birthday / graduation / family reunion / etc.
5. budget — explicit budget figure, range, or per-person target
6. guest_count — headcount
7. service_style — drop-off / full-service / churrasco / buffet / etc.
8. decision_timeline — when they're choosing a caterer
9. dietary_constraints — restrictions, preferences, allergies

For each slot you can ground in the comms, output a row in the table. For unknowns, leave the row out. **Be conservative — never invent. Quote evidence with the activity date.**

After the table:

## Current quest
Pick the most blocking unknown slot — the one whose absence prevents Andre from quoting accurately or proposing a fit. State why it matters for this specific lead.

## NEPQ ask
One question, NEPQ voice (curious, not pitchy), shaped to surface that slot.

Format:

| Slot | Value | Evidence |
|---|---|---|
| event_date | 2026-08-15 | "August 15 reception" — outbound email 2026-04-12 |
| guest_count | ~275 | "around 275 family" — call transcript 2026-04-23 |

Output ONLY the Markdown body (the frontmatter is added by the caller).`;

const ALERTS_SYSTEM = `${getSalesPlaybook({ tight: true })}

---

You are generating Andre's lead alerts from the raw Close substrate.

Required sections:
## Immediate alerts
Bullets for anything Andre should notice before the next touch: inbound
messages, missed call windows, status mismatch, timing risk, budget risk,
dietary/logistics risk, or silence pattern.

## Response frame
How Andre should respond at the strategy level. Do not write a full message
unless the raw comms clearly require one.

## Do-not-do
Moves that would damage this lead right now.

Rules:
- Ground every alert in raw evidence.
- No invented urgency.
- If there are no real alerts, say "No acute alerts." and explain why.
- Output ONLY the Markdown body (frontmatter is added by the caller).`;

const LEDGER_SYSTEM = `${getSalesPlaybook({ tight: true })}

---

You are generating a global client ledger for one Comeketo lead from the raw
Close substrate. This is not a prose profile. It is the current state of the
deal as a ledger Andre can inspect.

Required sections:
## Cadence position
Current lifecycle state, most recent inbound/outbound, whether the lead needs
operator review, and whether the seven-day plan appears stale.

## Recent fires
Compact table of recent outbound touches. Exactly THREE columns:
\`Date | Channel | What it said\`.
- Do NOT add an Actor column — Andre is always the actor in this app, redundant.
- Do NOT include a full \`activity_id\` column — the IDs are visually noisy
  and Andre doesn't read them. If you need to cite a specific activity for
  traceability, append the last 8 chars in brackets at the end of the
  description, e.g. "Sent ballpark for May 15 [a4f9c8b2]".

## Inbound activity
Compact table of recent inbound touches. Exactly THREE columns:
\`Date | Channel | What they said\`. Same rules as Recent fires — no
activity_id column, no actor column.

## State changes
Anything that changed the lifecycle state: status, reply, missed window,
plan action, opt-out, likely terminal signal.

Rules:
- Use tables where requested. Keep them compact — Andre scans, he doesn't read.
- Factual descriptions only. No sales pep talk.
- Output ONLY the Markdown body (frontmatter is added by the caller).`;

type RegenResult =
  | { regenerated: true; reason: "first_run" | "hash_changed" }
  | { regenerated: false; reason: "no_folder" | "no_comms" | "hash_match" | "no_api_key" }
  | { regenerated: false; reason: "error"; error: string };

async function callModel(
  system: string,
  userInput: string,
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: system,
      input: userInput,
    });
    const out = (response.output_text ?? "").trim();
    if (!out) return { ok: false, error: "empty model output" };
    return { ok: true, output: out };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read frontmatter `from_hash` field if present. Used to skip regen when
 *  the underlying comms haven't changed. */
function frontmatterHash(markdown: string): string | null {
  if (!markdown.startsWith("---")) return null;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = markdown.slice(3, end);
  const m = block.match(/^from_hash:\s*(\S+)$/m);
  return m && typeof m[1] === "string" ? m[1] : null;
}

function buildFrontmatter(opts: {
  leadId: string;
  leadName: string;
  fromHash: string;
}): string {
  return [
    "---",
    `close_lead_id: ${opts.leadId}`,
    `lead_name: ${opts.leadName.replace(/[\r\n]/g, " ")}`,
    `generated_at: ${new Date().toISOString()}`,
    `from_hash: ${opts.fromHash}`,
    "---",
    "",
  ].join("\n");
}

type LeadContext = {
  leadId: string;
  name: string;
  contentHash: string;
  rawContext: string;
};

async function readLeadContext(
  leadId: string,
): Promise<LeadContext | { error: "no_folder" | "no_comms" }> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return { error: "no_folder" };

  const leadRaw =
    (await readLeadFile(leadId, "01_raw_lead.json")) ??
    (await readLeadFile(leadId, "00_lead.json"));
  if (!leadRaw) return { error: "no_folder" };

  let lead: Record<string, unknown>;
  try {
    lead = JSON.parse(leadRaw) as Record<string, unknown>;
  } catch {
    return { error: "no_folder" };
  }

  const name =
    typeof lead.display_name === "string" && lead.display_name.length > 0
      ? lead.display_name
      : leadId;

  const continuity =
    (await readLeadFile(leadId, "02_continuity.jsonl")) ??
    (await readLeadFile(leadId, "00_continuity.jsonl")) ??
    "";
  const refs = parseContinuityRefs(continuity);
  const comms: Array<{ ref: string; content: string }> = [];
  for (const ref of refs) {
    const content = await readLeadFile(leadId, ref);
    if (content) comms.push({ ref, content });
  }

  const contentHash = hashRawContext(leadRaw, continuity, comms);
  const rawContext = buildRawModelContext({
    leadId,
    name,
    leadRaw,
    continuity,
    comms,
  });

  if (rawContext.trim().length < 60) return { error: "no_comms" };

  return { leadId, name, contentHash, rawContext };
}

async function regenerateOne(
  leadId: string,
  fileName:
    | "03_comms_interpreted.md"
    | "04_profile.md"
    | "06_discovery.md"
    | "07_andre_alerts.md"
    | "08_client_ledger.md",
  system: string,
): Promise<RegenResult> {
  const ctx = await readLeadContext(leadId);
  if ("error" in ctx) return { regenerated: false, reason: ctx.error };

  const existing = await readLeadFile(leadId, fileName);
  const priorHash = existing ? frontmatterHash(existing) : null;
  if (existing && priorHash && priorHash === ctx.contentHash) {
    return { regenerated: false, reason: "hash_match" };
  }

  const userInput = [
    `Lead: ${ctx.name} (${leadId})`,
    "",
    "RAW CLOSE SUBSTRATE:",
    fitForModel(ctx.rawContext),
  ].join("\n");

  const r = await callModel(system, userInput);
  if (!r.ok) {
    if (r.error === "OPENAI_API_KEY not set") {
      return { regenerated: false, reason: "no_api_key" };
    }
    return { regenerated: false, reason: "error", error: r.error };
  }

  const frontmatter = buildFrontmatter({
    leadId,
    leadName: ctx.name,
    fromHash: ctx.contentHash,
  });
  const body = r.output.startsWith("---") ? r.output : frontmatter + r.output;
  const final = body.endsWith("\n") ? body : body + "\n";

  await writeLeadFile(leadId, ctx.name, fileName, final, {
    commitMessage: `regen: ${ctx.name} — ${fileName}`,
  });

  return {
    regenerated: true,
    reason: priorHash ? "hash_changed" : "first_run",
  };
}

/** Regenerate the AI-read communications doc (`03_comms_interpreted.md`) for one lead.
 *  Skip-on-hash-match keeps costs under control. */
export async function regenerateLeadCommsInterpretation(
  leadId: string,
): Promise<RegenResult> {
  return regenerateOne(leadId, "03_comms_interpreted.md", COMMS_SYSTEM);
}

/** Regenerate the operator-facing profile (`04_profile.md`) for one lead.
 *  Skip-on-hash-match keeps costs under control. */
export async function regenerateLeadProfile(
  leadId: string,
): Promise<RegenResult> {
  return regenerateOne(leadId, "04_profile.md", PROFILE_SYSTEM);
}

/** Regenerate the discovery slot doc (`06_discovery.md`) for one lead. */
export async function regenerateLeadDiscovery(
  leadId: string,
): Promise<RegenResult> {
  return regenerateOne(leadId, "06_discovery.md", DISCOVERY_SYSTEM);
}

export async function regenerateLeadAndreAlerts(
  leadId: string,
): Promise<RegenResult> {
  return regenerateOne(leadId, "07_andre_alerts.md", ALERTS_SYSTEM);
}

export async function regenerateLeadClientLedger(
  leadId: string,
): Promise<RegenResult> {
  return regenerateOne(leadId, "08_client_ledger.md", LEDGER_SYSTEM);
}

export type LeadRegenSummary = {
  considered: number;
  in_scope: number;
  comms: { regenerated: number; skipped: number; errored: number };
  profile: { regenerated: number; skipped: number; errored: number };
  discovery: { regenerated: number; skipped: number; errored: number };
  alerts: { regenerated: number; skipped: number; errored: number };
  ledger: { regenerated: number; skipped: number; errored: number };
  errors: Array<{
    lead_id: string;
    name?: string;
    file:
      | "03_comms_interpreted.md"
      | "04_profile.md"
      | "06_discovery.md"
      | "07_andre_alerts.md"
      | "08_client_ledger.md";
    message: string;
  }>;
  started_at: string;
  finished_at: string;
};

/** Regenerate interpreted docs for every Andre-owned, in-scope lead.
 *  Concurrency-1 against OpenAI to be polite — these aren't latency-sensitive
 *  and serial keeps the cost picture predictable. Per-lead errors don't
 *  abort the run. */
export async function regenerateAllLeadDocs(): Promise<LeadRegenSummary> {
  const startedAt = new Date().toISOString();
  const all: CloseLead[] = env.CLOSE_USER_ID_ANDRE
    ? await closeListLeadsByAssignee(env.CLOSE_USER_ID_ANDRE, 200)
    : [];
  const inScope = all.filter(isLeadInScope);

  const summary: LeadRegenSummary = {
    considered: all.length,
    in_scope: inScope.length,
    comms: { regenerated: 0, skipped: 0, errored: 0 },
    profile: { regenerated: 0, skipped: 0, errored: 0 },
    discovery: { regenerated: 0, skipped: 0, errored: 0 },
    alerts: { regenerated: 0, skipped: 0, errored: 0 },
    ledger: { regenerated: 0, skipped: 0, errored: 0 },
    errors: [],
    started_at: startedAt,
    finished_at: "",
  };

  for (const lead of inScope) {
    const commsR = await regenerateLeadCommsInterpretation(lead.id);
    if (commsR.regenerated) {
      summary.comms.regenerated++;
    } else if (commsR.reason === "error") {
      summary.comms.errored++;
      summary.errors.push({
        lead_id: lead.id,
        name: lead.display_name,
        file: "03_comms_interpreted.md",
        message: commsR.error,
      });
    } else {
      summary.comms.skipped++;
    }

    const profileR = await regenerateLeadProfile(lead.id);
    if (profileR.regenerated) {
      summary.profile.regenerated++;
    } else if (profileR.reason === "error") {
      summary.profile.errored++;
      summary.errors.push({
        lead_id: lead.id,
        name: lead.display_name,
        file: "04_profile.md",
        message: profileR.error,
      });
    } else {
      summary.profile.skipped++;
    }

    const discoveryR = await regenerateLeadDiscovery(lead.id);
    if (discoveryR.regenerated) {
      summary.discovery.regenerated++;
    } else if (discoveryR.reason === "error") {
      summary.discovery.errored++;
      summary.errors.push({
        lead_id: lead.id,
        name: lead.display_name,
        file: "06_discovery.md",
        message: discoveryR.error,
      });
    } else {
      summary.discovery.skipped++;
    }

    const alertsR = await regenerateLeadAndreAlerts(lead.id);
    if (alertsR.regenerated) {
      summary.alerts.regenerated++;
    } else if (alertsR.reason === "error") {
      summary.alerts.errored++;
      summary.errors.push({
        lead_id: lead.id,
        name: lead.display_name,
        file: "07_andre_alerts.md",
        message: alertsR.error,
      });
    } else {
      summary.alerts.skipped++;
    }

    const ledgerR = await regenerateLeadClientLedger(lead.id);
    if (ledgerR.regenerated) {
      summary.ledger.regenerated++;
    } else if (ledgerR.reason === "error") {
      summary.ledger.errored++;
      summary.errors.push({
        lead_id: lead.id,
        name: lead.display_name,
        file: "08_client_ledger.md",
        message: ledgerR.error,
      });
    } else {
      summary.ledger.skipped++;
    }
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

function parseContinuityRefs(jsonl: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const line of jsonl.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t) as { ref?: unknown };
      if (
        typeof row.ref === "string" &&
        row.ref.startsWith("comms/") &&
        !seen.has(row.ref)
      ) {
        seen.add(row.ref);
        refs.push(row.ref);
      }
    } catch {
      // Bad continuity rows are ignored here; verify-raw-substrate catches
      // contract failures. Regen should degrade rather than brick the run.
    }
  }
  return refs;
}

function hashRawContext(
  leadRaw: string,
  continuity: string,
  comms: Array<{ ref: string; content: string }>,
): string {
  const hash = createHash("sha256");
  hash.update("01_raw_lead.json\n");
  hash.update(leadRaw);
  hash.update("\n02_continuity.jsonl\n");
  hash.update(continuity);
  for (const c of comms.slice().sort((a, b) => a.ref.localeCompare(b.ref))) {
    hash.update(`\n${c.ref}\n`);
    hash.update(c.content);
  }
  return `sha256:${hash.digest("hex")}`;
}

function buildRawModelContext(opts: {
  leadId: string;
  name: string;
  leadRaw: string;
  continuity: string;
  comms: Array<{ ref: string; content: string }>;
}): string {
  const parts = [
    `# Raw lead substrate for ${opts.name} (${opts.leadId})`,
    "",
    "## 01_raw_lead.json",
    opts.leadRaw.trim(),
    "",
    "## 02_continuity.jsonl",
    opts.continuity.trim() || "(no activity rows)",
    "",
    "## comms/*.json",
  ];

  if (opts.comms.length === 0) {
    parts.push("(no comm files referenced)");
  } else {
    for (const c of opts.comms) {
      parts.push("", `### ${c.ref}`, c.content.trim());
    }
  }

  return parts.join("\n");
}

function fitForModel(input: string): string {
  const maxChars = 24000;
  if (input.length <= maxChars) return input;
  return [
    input.slice(0, maxChars),
    "",
    "_Model input truncated for this interpretation pass; raw source files remain complete._",
  ].join("\n");
}
