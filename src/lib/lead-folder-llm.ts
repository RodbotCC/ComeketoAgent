/**
 * LLM regeneration for `04_profile.md` and `06_discovery.md` (Atom 7).
 *
 * Reads `00_meta.json` + `01b_comms_verbatim.md` from a lead's folder, runs
 * OpenAI Responses calls, writes back the prose. Skip-when-hash-matches keeps
 * cost under control: most cron ticks for most leads = zero LLM calls.
 *
 * The Discovery + Personal pages (Atom 8) read these files as their source
 * of truth instead of the deprecated `lead_facts` Supabase table.
 */

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
  verbatim: string;
};

async function readLeadContext(
  leadId: string,
): Promise<LeadContext | { error: "no_folder" | "no_comms" }> {
  const folder = await findLeadFolderPath(leadId);
  if (!folder) return { error: "no_folder" };

  const metaRaw = await readLeadFile(leadId, "00_meta.json");
  if (!metaRaw) return { error: "no_folder" };
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return { error: "no_folder" };
  }
  const contentHash =
    typeof meta.comms_content_hash === "string" ? meta.comms_content_hash : "";
  const name =
    typeof meta.name === "string" && meta.name.length > 0
      ? meta.name
      : leadId;

  const verbatim = await readLeadFile(leadId, "01b_comms_verbatim.md");
  if (!verbatim || verbatim.trim().length < 60) return { error: "no_comms" };

  return { leadId, name, contentHash, verbatim };
}

async function regenerateOne(
  leadId: string,
  fileName: "04_profile.md" | "06_discovery.md",
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
    "VERBATIM COMMUNICATIONS:",
    ctx.verbatim.length > 24000 ? ctx.verbatim.slice(0, 24000) + "\n\n_(truncated)_" : ctx.verbatim,
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

export type LeadRegenSummary = {
  considered: number;
  in_scope: number;
  profile: { regenerated: number; skipped: number; errored: number };
  discovery: { regenerated: number; skipped: number; errored: number };
  errors: Array<{
    lead_id: string;
    name?: string;
    file: "04_profile.md" | "06_discovery.md";
    message: string;
  }>;
  started_at: string;
  finished_at: string;
};

/** Regenerate profile + discovery for every Andre-owned, in-scope lead.
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
    profile: { regenerated: 0, skipped: 0, errored: 0 },
    discovery: { regenerated: 0, skipped: 0, errored: 0 },
    errors: [],
    started_at: startedAt,
    finished_at: "",
  };

  for (const lead of inScope) {
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
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}
