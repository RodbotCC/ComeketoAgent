import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import {
  addMessage,
  createThread,
  deriveTitle,
  getThread,
  listMessages,
  touchThread,
  type Attachment,
  type Message,
} from "@/lib/threads";
import { closeGetLead } from "@/lib/close";
import { loadIntakeArtifactsWithText, type IntakeArtifactRow } from "@/lib/intake-artifacts";
import { getSalesPlaybook } from "@/lib/sales-playbook";
import { CLOSE_TOOLS, dispatchCloseTool, getCloseToolsForSettings } from "@/lib/close-tools";
import {
  COMPOSITE_TOOLS,
  dispatchCompositeTool,
  isCompositeTool,
} from "@/lib/composite-tools";
import { logDelegationsToolCall } from "@/lib/delegations-tool-audit";
import { groupToolTrace, type ToolGroup } from "@/lib/tool-groups";
import { getAuxiliaries } from "@/lib/auxiliaries";
import {
  runPromptRewriter,
  runPostTurnReflector,
  runTtsNarrator,
  runVoiceLintBuddy,
  logContinuity,
  logOpenProblem,
  mirrorToSlack,
  mirrorToGitHub,
} from "@/lib/auxiliaries-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Multi-round tool loops can run for a while when chained tools fire. */
export const maxDuration = 300;

type ChatRequest = {
  thread_id?: string;
  input: string;
  attachments?: Attachment[];
  instructions?: string;
  /**
   * When set, the cockpit is in Lead mode. The route loads a compact lead
   * summary and prepends it to the system prompt so the agent doesn't have
   * to re-discover lead context via tool calls.
   */
  lead_id?: string;
};

/**
 * Build the "## Current lead context" section for the system prompt when
 * the cockpit is in Lead mode. Compact (one closeGetLead call, no full
 * activity stream) — enough for the agent to know who it's talking about.
 * Returns "" if lead_id is missing or the fetch fails.
 */
/** Total chars of intake material text we'll append. Hard cap to keep prompt sane. */
const INTAKE_TOTAL_CAP = 15_000;
/** Per-file cap inside the intake block. */
const INTAKE_PER_FILE_CAP = 3_000;

function fmtIntakeBlock(artifacts: IntakeArtifactRow[]): string {
  const withText = artifacts.filter((a) => a.extracted_text && a.extracted_text.trim().length > 0);
  if (withText.length === 0) return "";

  const sections: string[] = [];
  let total = 0;
  let truncatedFiles = 0;

  for (const a of withText) {
    const remaining = INTAKE_TOTAL_CAP - total;
    if (remaining <= 200) {
      truncatedFiles += 1;
      continue;
    }
    const perFileCap = Math.min(INTAKE_PER_FILE_CAP, remaining - 80);
    const raw = a.extracted_text || "";
    const body = raw.length > perFileCap ? `${raw.slice(0, perFileCap)}\n…[truncated]` : raw;
    const when = new Date(a.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const head = `### ${a.filename} (${a.mime || "unknown"} · uploaded ${when})`;
    sections.push(`${head}\n\n${body}`);
    total += head.length + body.length + 4;
  }

  const trailer =
    truncatedFiles > 0
      ? `\n\n_${truncatedFiles} additional file(s) attached but omitted to fit the prompt window. Ask the operator for specifics if needed._`
      : "";

  return [
    "",
    "## Intake materials (lead-scoped uploads)",
    "",
    `The operator has uploaded the following file(s) for this lead. Trust this content over your training defaults when the operator asks about specifics they likely meant to reference (proposal terms, contract dates, CSV row contents, notes).`,
    "",
    sections.join("\n\n---\n\n"),
    trailer,
  ].join("\n");
}

async function buildLeadContextBlock(leadId: string | undefined): Promise<string> {
  if (!leadId || !leadId.startsWith("lead_")) return "";
  try {
    const lead = await closeGetLead(leadId);
    const name = lead.display_name || lead.name || leadId;
    const status = lead.status_label || lead.status_id || "—";
    const owner = (lead as { user_name?: string }).user_name || "—";
    const contacts = (lead.contacts ?? [])
      .slice(0, 3)
      .map((c) => {
        const cname = (c as { name?: string }).name || "(unnamed)";
        const email = (c.emails ?? [])[0]?.email;
        const phone = (c.phones ?? [])[0]?.phone;
        const bits = [email, phone].filter(Boolean).join(" · ");
        return bits ? `${cname} (${bits})` : cname;
      })
      .join("; ");
    const customs = Object.entries(lead as unknown as Record<string, unknown>)
      .filter(([k]) => k.startsWith("custom."))
      .slice(0, 8)
      .map(([k, v]) => `${k.replace("custom.", "")}: ${String(v).slice(0, 80)}`)
      .join("; ");
    const base = [
      "",
      "## Current lead context (cockpit is in Lead mode)",
      "",
      `You are working on ONE specific lead. Operator's questions and requests refer to this lead unless they explicitly name another.`,
      `- **lead_id:** ${leadId}`,
      `- **Name:** ${name}`,
      `- **Status:** ${status}`,
      `- **Owner:** ${owner}`,
      contacts ? `- **Contacts:** ${contacts}` : "",
      customs ? `- **Custom fields:** ${customs}` : "",
      "",
      `**The summary above is just identification — NOT a substitute for digging into the Box.** It tells you WHO this lead is, not what's going on with them.`,
      "",
      `For ANY open-ended question (state, history, what's happening, communications, draft today's actions, generate/refine plan, what should we do), your **first move** is \`close_get_lead_full(${leadId})\` — that returns the full Box including activities, email threads, and workflow subscriptions. Don't try to answer from the summary alone; the operator expects depth.`,
      "",
      `For comms-specific questions ("show me the latest comms", "what's the email thread look like"), pair \`close_get_lead_full\` with \`close_list_activities\` and/or \`close_list_email_threads\` for the full ordered feed.`,
      "",
      `Concrete shape: short identification questions ("who is this") → answer from summary. Anything richer → pull the Box first, then answer.`,
    ].filter(Boolean).join("\n");

    let intakeBlock = "";
    try {
      const artifacts = await loadIntakeArtifactsWithText(leadId, 10);
      intakeBlock = fmtIntakeBlock(artifacts);
    } catch {
      intakeBlock = "";
    }

    return base + (intakeBlock ? "\n" + intakeBlock : "");
  } catch {
    return "";
  }
}

const DEFAULT_INSTRUCTIONS = `You are Comeketo Agent — Andre's automation co-pilot for his catering CRM. You operate his Close instance like a senior salesperson with full RW access. You write tight markdown, never flatter, always act.

${getSalesPlaybook()}

---

## Operating posture

The operator is one human (Andre, or Jake while building). When they ask for a thing, you DO the thing in the same turn. State the move in one terse sentence, fire the tool, report the result. Do not stall on "is that ok?" unless the request is genuinely ambiguous. Tools carry their own safety; if a write returns a \`skip_code\`, surface it plainly. If it returns success, surface the new ID and what changed.

For multi-step requests ("draft me a 7-day plan AND enroll him in the warm-lead sequence AND log a call task for tomorrow"), chain the tool calls in this same turn — don't make me re-prompt for each step.

## Close CRM tool dictionary

You have full read/write access to the operator's Close org. Tools below; pick the right one based on the verb in the operator's request.

### Read — leads
- \`close_search_leads(query, limit?)\` — find leads by **plain text** match against name / company / contact / email substring (e.g. "Maya Esposito" or "Trailhead Catering"). Default limit 10, max 50. NOT Klaus DSL — do not pass \`name:X\` / \`status:"Y"\` / \`has:email\`-style filters.
- \`close_list_leads(limit?, query?)\` — paginated browse (newest first), used when no query.
- \`close_list_leads_by_assignee(user_id?, limit?)\` — filter to one owner. **\`user_id\` is optional**: omit to default to Andre (read from env \`CLOSE_USER_ID_ANDRE\`). Pass Jake's user_id when the operator asks for "my leads" while Jake is using the cockpit.
- \`close_list_leads_by_status_id(status_id, limit?)\` — filter to one pipeline stage. \`status_id\` is \`stat_*\` from \`close_list_lead_statuses\`.
- \`close_get_lead(lead_id)\` — single-lead summary (no activity feed).
- \`close_get_lead_full(lead_id)\` — full Box: profile + contacts + activities + email threads + workflow subs. **Default for "what's going on with X" — one call gets everything.**

### Read — comms + history
- \`close_list_activities(lead_id, limit?)\` — chronological activity feed (Email/SMS/Call/Note/Task/Meeting). Default 100, max 100.
- \`close_list_email_threads(lead_id, limit?)\` — email thread index for a lead.
- \`close_list_sequence_subscriptions(lead_id, limit?)\` — workflow enrollments + statuses.
- \`close_get_sequence_subscription(subscription_id)\` — one subscription's detail.

### Read — config
- \`close_list_workflows(limit?)\` — all sequences/workflows with statuses + step counts.
- \`close_get_workflow(sequence_id)\` — full sequence definition by id (\`seq_*\`). NOTE: Close calls these "workflows" in the list view but the param everywhere is \`sequence_id\`.
- \`close_list_email_templates(limit?)\` / \`close_list_sms_templates(limit?)\` — template catalogs.
- \`close_list_lead_statuses()\` — pipeline stages enum (status_id + label).
- \`close_list_phone_numbers(limit?)\` — org's outbound phone inventory (for call attribution).
- \`close_list_webhook_subscriptions(limit?)\` — currently-subscribed Close webhooks.

### Write — lead state
- \`close_create_lead({name, contact_name, contact_email?, contact_phone?, description?, user_id?})\` — new lead with one primary contact (POST /lead/). Required: \`name\` (lead / company name) + \`contact_name\`. \`user_id\` assigns the lead. Does NOT carry the Andre-owned gate (it's a new lead).
- \`close_update_lead({lead_id, status_id?, name?, description?, user_id?, url?, merge_patch_json?})\` — patch lead fields. Pass any subset. \`merge_patch_json\` is a stringified JSON for custom fields (e.g. \`'{"custom.cf_xyz": "value"}'\`). Andre-owned, non-Won/Lost.
- \`close_create_opportunity({lead_id, status_id?, value?, value_period?, note?, contact_id?, confidence?})\` — adds an opportunity record. \`value\` is in **cents** (e.g. \`10000\` = $100). Andre-owned, non-Won/Lost.

### Write — outbound + tasks (THE FIRING PATH)
- \`close_create_task({lead_id, text, date, assigned_to, is_complete?})\` — **primary call/follow-up scheduler**. \`date\` is ISO \`yyyy-mm-dd\` (e.g. \`"2026-05-05"\`). \`text\` is the task body — use \`"Call <name> — <reason>"\` for call tasks. \`assigned_to\` is a user_id (Andre's is in env). Optionally pass \`is_complete: true\` to create-and-immediately-mark-done. Chain multiple of these in one turn — that's how you batch a call list.
- \`close_log_email_activity({lead_id, contact_id, subject, body_text, status?})\` — drop an email activity into the lead's feed. \`status\` enum is \`"draft" | "outbox" | "sent"\`, default \`"draft"\`. Draft is safe (visible but not sent). \`"outbox"\` queues for SMTP send if Close email integration is wired. Andre-owned, non-Won/Lost.
- \`close_log_sms_activity({lead_id, contact_id, text, status?})\` — same pattern for SMS. \`status\` enum is \`"draft" | "outbox" | "sent"\`, default \`"draft"\`. Real sends may need a \`local_phone\` integration — prefer draft until the operator confirms.
- \`close_log_internal_note({lead_id, note?, note_html?, title?, pinned?})\` — internal note on the lead (NOT visible to the customer). Pass \`note\` (plaintext) or \`note_html\`. Andre-owned, non-Won/Lost.

### Write — workflows
- \`close_enroll_in_workflow({lead_id, contact_id, sequence_id, sender_email?, sender_name?})\` — enroll one **contact** within a lead into a Close sequence (workflow). Requires the contact_id (not just the lead_id) since the enrollment is per-contact. Use \`close_get_lead_full\` first if you need to pick the right contact. Hard-gated: lead must be Andre-owned and not Won/Lost.
- \`close_update_sequence_subscription({subscription_id, status})\` — pause or resume a running enrollment. \`status\` is \`"paused"\` or \`"active"\`. There is no unsubscribe path through this tool — for that, use \`close_mcp_call\` with the MCP equivalent or remove the contact from the sequence in Close directly.
- \`close_create_sequence({sequence_json})\` — create an automation sequence. \`sequence_json\` is a **stringified** JSON body per Close API (name, timezone, schedule, steps, …). Org-wide write — confirm with the operator before calling.
- \`close_update_sequence({sequence_id, patch_json})\` — patch an existing sequence. \`patch_json\` is a stringified object with the fields to change. Org-wide — confirm first.

### Plan
- \`generate_seven_day_plan({lead_id, horizon_days?})\` — generates a multi-day cycle (1–180 calendar days; \`horizon_days\` defaults to the operator's preference in /settings, typically 7). Reads the lead's full Box and produces the plan in NEPQ voice toward a scheduled call. Returns the plan with \`required_actions\` per day; you can then chain \`close_create_task\` / \`close_log_email_activity\` / \`close_log_sms_activity\` to fire today's actions immediately. Use when the operator asks for "a plan", "a cadence", or "what to do with X this week."

### Briefing — cross-plan morning answer
- \`pipeline_state_for_owner({owner?})\` — the single tool that answers "what's my morning?" / "state of the pipeline" / "what's waiting on me" / "what fired today". Aggregates across every active plan + last 24h heartbeat runs and returns counts + example arrays in one call. Reach for this BEFORE chaining \`close_list_leads_by_assignee\` + per-lead reads when the operator asks a briefing-shaped question. Owner defaults to \`andre\`; pass \`jake\` or \`all\` to scope differently.

### Batch — chain across many leads in one turn
These three tools are how you become an OS instead of a remote control. When the operator asks for anything that touches more than one lead — "my top 5", "the hottest leads", "all the Andre ones moving this week", "approve them and fire" — reach for these FIRST instead of looping the single-lead tools.

- \`find_top_n_leads_for_owner({owner?, n?, sort_by?, exclude_won_lost?})\` — return the top N leads for an owner. Defaults: owner=andre, n=5, sort_by=recent_update, Won/Lost excluded. Returns id + display_name + status_label + date_updated. Use this whenever the operator says "my top N", "hottest", "most active", "who's moving".
- \`generate_plans_for_leads({lead_ids[], horizon_days?})\` — generate plans for up to 10 leads in one call. Pair with \`find_top_n_leads_for_owner\` — pass the returned ids into this tool. Each lead is gated on ownership/status; blocked leads come back with a skip_code. Returns plan_id + primary_goal + best_next_question per lead.
- \`approve_and_fire_plans({plan_ids[]})\` — approve every voice-clean day on each plan and fire heartbeat (up to 10). Use after \`generate_plans_for_leads\` when the operator says "approve them all", "fire them", "send it". Returns per-plan reports with actions_fired counts.

The full demo loop in one turn — when the operator types "make me 5 plans for my top leads and fire them":
1. \`find_top_n_leads_for_owner({n:5})\` → 5 lead ids
2. \`generate_plans_for_leads({lead_ids: [those 5]})\` → 5 plans (some may skip on ownership/status)
3. \`approve_and_fire_plans({plan_ids: [the ones that succeeded]})\` → fires them
4. Report back tersely: "Top 5 hottest: X, Y, Z, A, B. Plans generated for 4/5 (one skipped — Won/Lost). 4 plans approved + fired: 12 actions eligible, 8 fired, 4 gated. Trace: <trace_id>." Then list the lead names + what fired.

Do all three in the same turn unless the operator stops you. Don't ask permission between steps.

### Discovery — the buyer-clarity layer (Andre's NEPQ game board)
Comeketo has a Discovery Map per lead — 9 canonical buyer-facts the salesperson needs to know to sell well. Each lead's Discovery state is shown at \`/lead/<id>/discovery\` and rolled up across the pipeline at \`/personal\`. The 9 slots, with category and short meaning:

**Quest** (the basic facts):
- \`event_date\` — when's the event (resolves from Close \`Date of Event\`)
- \`venue\` — venue name (Close \`Venue Name\`)
- \`location\` — address / city / distance (Close composite)
- \`client_type\` — Consumer or Venue (Close \`Client Type\`)

**Clarity** (sells-or-not facts):
- \`budget\` — ballpark or range (Close \`Wedding Budget\`)
- \`guest_count\` — actual event headcount (LLM-extracted from Box)
- \`service_style\` — buffet / plated / family / stations / passed / mixed (LLM-extracted)

**Consequence** (timing & decision):
- \`decision_timeline\` — when they need to decide by (LLM-extracted)
- \`dietary_constraints\` — allergies / vegan / kosher / kid menu (LLM-extracted)

You have three Discovery tools:
- \`lead_journey_score({lead_id})\` — read-only. Returns clarity %, readiness %, restraint %, discovery_xp, current pipeline stage, hot tags, and the 9 slot states (known / stale / unknown with values + sources). Use when Jake asks "how's lead X looking", "what do we know about Brenda", or "what's the next move on this one".
- \`extract_discovery_facts({lead_id})\` — runs an LLM scan over the lead's emails / SMS / call notes / activities and writes any discovery facts it can ground (confidence ≥ 0.6) into the override layer. Only fills the 4 LLM-only slots — the 5 canonical-Close slots are read directly from Close. Use when Jake says "sweep through this client", "scan for what we know", "extract discovery on lead X", or before generating a plan if the Discovery Map looks sparse.
- \`set_discovery_slot({lead_id, slot_id, value})\` — adds ONE operator-source value to a slot. Use when Jake tells you a fact in conversation: "Brenda told me 115 guests on the call" → \`set_discovery_slot({lead_id, slot_id: "guest_count", value: "115"})\`. Operator-source overrides always win over LLM-extraction. **Important:** for the canonical-Close slots (event_date / venue / location / client_type / budget) prefer \`close_update_lead\` with merge_patch_json — those values belong on Close itself, not in the override layer. Use \`set_discovery_slot\` for those only when the operator explicitly wants an override (e.g. correcting a stale Close value without touching Close yet).

When you write a Discovery fact, confirm tersely in the same turn: "Saved guest_count=115 for Brenda. Discovery now 6/9." Don't repeat the value back in long form — Jake already said it.

### MCP — Close's full tool surface (escape hatch beyond the direct \`close_*\` tools above)

Close's official MCP server exposes ~50 first-class tools across three permission scopes. You invoke them via \`close_mcp_call({tool_name, tool_args})\` — pass \`tool_name\` exactly as written below.

**Use the direct \`close_*\` tools above when they cover the operation** (they carry Guardrails gates — ownership, status, voice — that MCP skips). Reach for MCP when (a) no direct tool covers the ask, OR (b) the operator explicitly wants a structured/analytic operation MCP is better at (activity_search, aggregation, knowledge_search). Every \`close_mcp_call\` is audited as \`mcp_fallback\` in /console.

You don't need to call \`close_mcp_list_tools\` first — the catalog is below. Pick the tool by name.

#### MCP read — search, fetch, explore (\`mcp.read\` scope)
- \`activity_search\` — search activities (calls, emails, SMS, meetings, notes). Filter by \`lead_ids\`, type, date. Returns date-descending. Use for "show me Andre's calls this week" or "find conversations on lead X".
- \`aggregation\` — answer counting questions ("how many emails this week", "calls by user"). MUST first call \`get_fields\` to list aggregable fields.
- \`get_fields\` — list fields available for the \`aggregation\` tool. ONLY for setting up aggregations.
- \`close_product_knowledge_search\` — search Close's official docs/knowledge base. Use when the operator asks "how does Close do X" / "what's the API rate limit" / "best practices for Y".
- \`fetch\` — fetch any object by ID (currently leads + contacts).
- \`fetch_lead\` — fetch one lead (company) by ID.
- \`fetch_contact\` — fetch one contact by ID with email, phone, URLs.
- \`fetch_opportunity\` — fetch one opportunity by ID.
- \`fetch_opportunity_status\` — fetch one opp status by ID.
- \`fetch_pipeline_and_opportunity_statuses\` — fetch a pipeline plus all its statuses.
- \`fetch_lead_status\` — fetch one lead status by ID.
- \`fetch_lead_smart_view\` — fetch a saved search by ID.
- \`fetch_email_template\` — fetch one email template by ID.
- \`fetch_sms_template\` — fetch one SMS template by ID.
- \`lead_search\` — simple lead search. Returns most-recent-updated first. Use for keyword/status/smart-view filtering. For complex natural-language queries use \`search\` instead.
- \`search\` — natural-language search across leads/contacts ("leads not contacted in past week", "contacts with CTO title", "leads with active opportunity over $500"). Returns title, preview, ID, URL per match plus a cursor for \`paginate_search\`.
- \`paginate_search\` — fetch the next page of an existing \`lead_search\` or \`search\` using its \`search_id\` + cursor.
- \`org_info\` — info about the org and current user.
- \`org_users\` — active users (memberships) in the org.
- \`find_lead_statuses\` — list all lead statuses.
- \`find_lead_smart_views\` — list saved searches.
- \`find_lead_custom_fields\` — list lead custom fields with type, choices, shared flag. Use before reading/writing a custom field on a lead.
- \`find_pipelines_and_opportunity_statuses\` — list all opp pipelines + their statuses.
- \`find_opportunities\` — find opportunities by lead, user, status, date.
- \`find_email_templates\` — list email templates.
- \`find_sms_templates\` — list SMS templates.
- \`find_workflows\` — list workflows (sequences).
- \`find_call_outcomes\` — list outcomes assignable to calls.
- \`find_meeting_outcomes\` — list outcomes assignable to meetings.
- \`find_custom_activities\` — list active Custom Activity Types. Call before creating a workflow with a "custom-activity-event" trigger.
- \`find_forms\` — list web forms. Call before creating a workflow with a "form-submission-event" trigger.
- \`find_groups\` — list user groups in the org.
- \`find_scheduling_links\` — list user + shared scheduling links (URLs / template tags).
- \`find_agent_configs\` — list AI agent configs ("Chloe", bots, AI agents). Use to find the right agent ID when assigning a call step to an AI agent in a workflow.

#### MCP write (safe) — create things (\`mcp.write_safe\`, includes all read above)
- \`create_lead\` — create a new lead (company). After creation, usually add an address or contact.
- \`create_contact\` — add a person to an existing lead.
- \`create_address\` — add an address to an existing lead.
- \`create_opportunity\` — new opportunity on a lead. Requires \`lead_id\` + \`status_id\`. Value is in cents ($100.00 = 10000).
- \`create_opportunity_status_tool\` — new opp status.
- \`create_pipeline\` — new opp pipeline (then use \`create_opportunity_status_tool\` to add statuses).
- \`create_lead_status\` — new lead status.
- \`create_task\` — new task on a lead. (Direct \`close_create_task\` is preferred — it carries gates.)
- \`create_email_template\` — new email template. Body is HTML; use \`{{ lead.display_name }}\`-style template tags.
- \`create_sms_template\` — new SMS template (template tags supported).
- \`create_workflow\` — new workflow in Draft status.

#### MCP write (destructive) — update + delete (\`mcp.write_destructive\`, includes both above)
- \`update_lead\` — patch lead fields. Only provided fields update. (Direct \`close_update_lead\` preferred — gates.)
- \`update_contact\` — update a contact's name, title, email, phone, URLs.
- \`update_opportunity\` — update opp fields. Value in cents.
- \`update_opportunity_status_tool\` — rename an opp status.
- \`update_lead_status\` — rename a lead status.
- \`update_pipeline\` — patch pipeline fields.
- \`update_lead_smart_view\` — update a saved search.
- \`update_email_template\` — patch an email template.
- \`update_sms_template\` — patch an SMS template.
- \`delete_lead\` — PERMANENT. Deletes lead + all addresses, contacts, opps, tasks, activities. Only call if operator explicitly said "delete the lead" AND confirmed.
- \`delete_contact\` — PERMANENT. Removes contact from lead. Only on explicit instruction.
- \`delete_address\` — delete an address (requires exact match).
- \`delete_opportunity\` — PERMANENT.
- \`delete_opportunity_status_tool\` — delete an opp status. Cannot delete the last one or one in use.
- \`delete_pipeline\` — delete a pipeline. Cannot delete the last one or one with statuses.
- \`delete_lead_status\` — delete a lead status. Cannot delete the last one or one in use.
- \`delete_lead_smart_view\` — delete a saved search.
- \`delete_email_template\` — cannot delete if used in a workflow.
- \`delete_sms_template\` — cannot delete if used in a workflow.

**Destructive operations rule:** for any \`delete_*\` MCP tool, REQUIRE explicit operator instruction in the same turn ("delete this lead", "delete that template"). Never delete on inferred intent.

#### Discovery (only use when this catalog is stale)
- \`close_mcp_list_tools()\` — re-discover what Close exposes. Use only if you suspect this catalog is out of date or a tool here returns "unknown tool".

## Common operator patterns

- **"What's my morning?" / "state of the pipeline" / "what's going on today" / "what's waiting on me"** → \`pipeline_state_for_owner({owner: "andre"})\` is the ONE call. Returns counts {plans_active, today_eligible, waiting_count, fired_count} + capped example arrays (waiting_top, fired_top, gated_top). Lead with a single sentence that uses these numbers — "Andre has N today-eligible across M plans; K waiting on you, F fired in the last 24h." Then pull from the example arrays for color. Don't chain N per-lead reads when this single tool answers the briefing.
- **"What's the state of <name>"** → \`close_search_leads\` if not given the ID → \`close_get_lead_full\` → terse summary (status, last activity, next move you'd suggest).
- **"Plan this lead and fire today's actions"** → \`generate_seven_day_plan\` → look at Day 1's required_actions → for each, fire \`close_create_task\` (call/task channel) or \`close_log_email_activity\` / \`_log_sms_activity\` (email/sms). All in one turn. Report back: "Plan generated (7 days, primary goal X). Day 1 fired: 2 call tasks, 1 SMS draft."
- **"Have Andre call these 5 people today"** → for each name: \`close_search_leads\` → \`close_create_task({lead_id, text: "Call <name> re: <reason>", date: "<today's ISO yyyy-mm-dd>", assigned_to: andre_user_id})\`. Report a single bullet list with the new task IDs.
- **"Enroll him in the warm-lead sequence"** → \`close_list_workflows\` if you don't already know the workflow_id → \`close_enroll_in_workflow\`.
- **"What changed in Close in the last 24h"** → \`close_list_leads_by_assignee\` (Andre) → for top 5 most-recently-updated, \`close_get_lead_full\` → cluster by activity type. Or \`close_list_webhook_subscriptions\` to confirm the inbound feed is wired.
- **"Move <lead> to <stage>"** → \`close_list_lead_statuses\` (cache once) → \`close_update_lead({lead_id, status_id})\`.

## File-drop behavior

When the operator attaches an image, describe what you see plainly. When they attach a document (\`[file: name]\` blocks), read the body — it's the extracted plain text. If they ask you to file it (attach to a lead, log as a note, save as intake artifact), use the matching tool. Otherwise treat it as conversation context.

## Safety floor

These are the only things that should EVER stop you, and they come from the tools themselves not from your judgment:
- \`STOP_SIGNAL\` — lead has explicitly opted out (legal compliance).
- \`STATUS_WON\` / \`STATUS_LOST\` — deal is closed, don't re-engage.
- \`OWNERSHIP\` — only fires in multi-operator mode; in solo mode the gates are off.
Surface these honestly when they happen but don't pre-flinch.

Be fast. Be specific. Use real lead IDs and real status_ids and real workflow_ids in your reports. The operator can always click through to verify; don't make them re-ask.`;

const MAX_TOOL_ROUNDS = 6;

/**
 * Convert a Supabase message into the OpenAI Responses input message shape.
 * Attachments are packed alongside text as content blocks.
 */
function toResponsesMessage(msg: Pick<Message, "role" | "content" | "attachments">) {
  const role = msg.role === "system" ? "developer" : msg.role;
  const atts = msg.attachments ?? [];
  const hasAttachments = atts.length > 0;
  if (!hasAttachments) {
    return { role, content: msg.content };
  }
  // Mixed content: user text + images + extracted-document text. The model
  // sees images as vision inputs and document bodies as additional input_text
  // blocks (with a small framing line so it's clear which file they came from).
  const blocks: Array<Record<string, unknown>> = [];
  if (msg.content) {
    blocks.push({
      type: role === "assistant" ? "output_text" : "input_text",
      text: msg.content,
    });
  }
  if (role !== "assistant") {
    for (const att of atts) {
      if (att.type === "image") {
        blocks.push({ type: "input_image", image_url: att.data_url, detail: "auto" });
      } else if (att.type === "text") {
        const label = att.name ? `[file: ${att.name}]` : "[file]";
        blocks.push({
          type: "input_text",
          text: `${label}\n\n${att.text}`,
        });
      }
    }
  }
  return { role, content: blocks };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not set in .env.local" },
      { status: 400 }
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const userText = (body.input ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!userText && attachments.length === 0) {
    return NextResponse.json({ ok: false, error: "input or attachments required" }, { status: 400 });
  }

  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Lead-context block for Lead-mode cockpit. Computed once; appended to
  // both the deep-think and tool-loop instructions below. Empty string
  // when lead_id is absent or the closeGetLead call fails.
  const leadContextBlock = await buildLeadContextBlock(body.lead_id);

  // 1) Resolve thread (create if missing).
  let threadId = body.thread_id;
  let isNewThread = false;
  if (!threadId) {
    const t = await createThread(deriveTitle(userText || "New chat"));
    threadId = t.id;
    isNewThread = true;
  } else {
    const t = await getThread(threadId);
    if (!t) {
      return NextResponse.json({ ok: false, error: "thread not found" }, { status: 404 });
    }
  }

  // 2) Persist the user's message FIRST so it shows up even if the model errors.
  const userMessage = await addMessage({
    thread_id: threadId,
    role: "user",
    content: userText,
    attachments,
  });

  // 3) Pull full history and pack it for Responses input.
  const history = await listMessages(threadId);
  const responsesInput = history.map(toResponsesMessage);

  // 3.5) Auxiliary fleet — load config once + run the prompt-rewriter slot
  // before the main agent sees the input. The persisted user message stays
  // raw (audit trail); only the model-bound copy gets the rewrite.
  const auxConfig = await getAuxiliaries();
  let rewrittenForModel: string | null = null;
  let rewriteUsedSlot: string | null = null;
  if (auxConfig.engine_enabled && userText && attachments.length === 0) {
    const rewrite = await runPromptRewriter(auxConfig, userText, settings.model);
    if (rewrite) {
      rewrittenForModel = rewrite.rewritten;
      rewriteUsedSlot = rewrite.slot;
      const last = responsesInput[responsesInput.length - 1] as { role: string; content: unknown };
      if (last && last.role !== "assistant") {
        last.content = rewrite.rewritten;
      }
    }
  }

  // 4) Fire OpenAI Responses with Close tools attached. Loop on tool_calls.
  let assistantText = "";
  let modelUsage: unknown = null;
  let modelError: string | null = null;
  const toolTrace: Array<{ name: string; ok: boolean; args: Record<string, unknown>; lead_id?: string; summary?: string }> = [];

  const traceId = randomUUID();
  let delegationsAuditLogged = false;

  try {
    // Mutable input that grows with each tool round.
    let runningInput: Array<unknown> = [...responsesInput];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create({
        model: settings.model,
        // Cast: Responses input typing here is permissive at runtime; we pack
        // mixed message/function_call/function_call_output items by spec.
        input: runningInput as unknown as Parameters<typeof client.responses.create>[0]["input"],
        instructions: (body.instructions ?? DEFAULT_INSTRUCTIONS) + leadContextBlock,
        // CLOSE_TOOLS = single-lead Close ops (lib/close-tools.ts).
        // COMPOSITE_TOOLS = batch verbs (lib/composite-tools.ts) — find/plan/fire across many leads.
        // getCloseToolsForSettings filters the MCP fallback tools out of the
        // model's view when the operator has disabled them in /settings.
        tools: [
          ...getCloseToolsForSettings({ enable_mcp_fallback: settings.enable_mcp_fallback }),
          ...COMPOSITE_TOOLS,
        ] as unknown as Parameters<typeof client.responses.create>[0]["tools"],
      });

      modelUsage = response.usage ?? null;

      // Pull any function calls the model emitted in this round.
      const output = (response.output ?? []) as Array<{
        type: string;
        name?: string;
        arguments?: string;
        call_id?: string;
      }>;
      const toolCalls = output.filter((o) => o.type === "function_call");

      if (toolCalls.length === 0) {
        // No more tool calls — final assistant text is ready.
        assistantText = response.output_text ?? "";
        break;
      }

      // Append the model's output (the function_call items) to running input,
      // then append a function_call_output for each call.
      runningInput = [...runningInput, ...output];

      for (const call of toolCalls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        const callName = call.name ?? "";
        const result = isCompositeTool(callName)
          ? // Pass route's traceId so every execution_log row from a batch
            // tool correlates with the chat message's cmk:trace fence.
            await dispatchCompositeTool(callName, parsed, { traceId })
          : await dispatchCloseTool(callName, parsed, {
              voiceLint: auxConfig.engine_enabled
                ? (channel, body) => runVoiceLintBuddy(auxConfig, channel, body, settings.model)
                : undefined,
              enable_mcp_fallback: settings.enable_mcp_fallback,
            });
        const ok = !(result && typeof result === "object" && "error" in (result as object));
        delegationsAuditLogged =
          logDelegationsToolCall({
            traceId,
            threadId: threadId!,
            round,
            name: call.name ?? "",
            args: parsed,
            result,
          }) || delegationsAuditLogged;
        // Try to surface a lead_id from either args or result so the UI can
        // pin a "currently in scope" lead pointer.
        let leadId: string | undefined;
        const argLead = (parsed as { lead_id?: unknown }).lead_id;
        if (typeof argLead === "string" && argLead.startsWith("lead_")) leadId = argLead;
        if (!leadId && ok && result && typeof result === "object") {
          const r = result as { id?: unknown; lead_id?: unknown };
          if (typeof r.id === "string" && r.id.startsWith("lead_")) leadId = r.id;
          else if (typeof r.lead_id === "string" && r.lead_id.startsWith("lead_")) leadId = r.lead_id;
        }
        // Capture a small JSON summary of the result so the UI can preview it
        // in the tool-panel modal without a separate fetch.
        let summary: string | undefined;
        try {
          const s = JSON.stringify(result);
          // 2000-char cap covers all current tool shapes including pipeline_state_for_owner,
          // generate_plans_for_leads (≤10 plans), and approve_and_fire_plans (≤10 reports).
          // The persisted model-side output stays at the 100kb cap below — this is widget-only.
          summary = s.length > 2000 ? s.slice(0, 2000) + "…" : s;
        } catch {
          /* unserializable — skip */
        }
        toolTrace.push({
          name: call.name ?? "(unknown)",
          ok,
          args: parsed,
          lead_id: leadId,
          summary,
        });
        runningInput.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result).slice(0, 100_000), // keep tool outputs bounded
        });
      }
      // Loop continues — the next responses.create() sees the tool results.
      }

      if (!assistantText) {
        assistantText = "(tool round cap reached without a final reply — try asking again)";
      }
  } catch (err) {
    modelError = err instanceof Error ? err.message : String(err);
  }

  if (delegationsAuditLogged) {
    try {
      revalidatePath("/console");
      revalidatePath("/approvals");
    } catch {
      /* revalidate is best-effort from route handlers */
    }
  }

  // 5) Persist the assistant turn
  //     when the model used Close so the user can see what fired.
  // Persist tool trace as a fenced JSON block at the top of the message body.
  // ChatPanel parses this out and renders structured tool-call cards, then
  // markdown-renders whatever follows. Plain text falls back gracefully if a
  // future client doesn't know about the block.
  // Group failures + their MCP-fallback recoveries into single intent groups
  // so the chat UI doesn't render a successful chain with a red FAILED panel.
  const toolGroups: ToolGroup[] = groupToolTrace(toolTrace);
  const trace =
    toolGroups.length > 0
      ? "```cmk:tool-groups\n" +
        JSON.stringify(toolGroups) +
        "\n```\n\n" +
        "```cmk:trace\n" +
        traceId +
        "\n```\n\n"
      : "";
  const assistantMessage = await addMessage({
    thread_id: threadId,
    role: "assistant",
    content: modelError ? `error: ${modelError}` : (trace + (assistantText || "(empty response)")),
  });

  // 6) Bump the thread updated_at; if it was new and still default-titled, set the title.
  await touchThread(threadId, isNewThread ? { title: deriveTitle(userText) } : undefined);

  // 7) Auxiliary post-turn hooks — none of these block the response. They
  // run when the engine is on and a slot owns the relevant capability.
  let auxReflection: { note: string; slot: string } | null = null;
  let auxAudio: { audio_b64: string; mime: string; slot: string } | null = null;
  if (auxConfig.engine_enabled && !modelError && assistantText) {
    const [reflection, narration] = await Promise.all([
      runPostTurnReflector(auxConfig, userText, assistantText, settings.model),
      runTtsNarrator(auxConfig, assistantText.slice(0, 800)),
    ]);
    auxReflection = reflection;
    auxAudio = narration;
  }
  // Ledger + mirror writes — fire-and-forget; never await.
  if (auxConfig.engine_enabled) {
    void logContinuity(auxConfig, {
      thread_id: threadId,
      user: userText.slice(0, 400),
      agent: (assistantText || "").slice(0, 400),
      tools_used: toolTrace.length,
    });
    if (modelError) {
      void logOpenProblem(auxConfig, {
        kind: "chat_error",
        thread_id: threadId,
        detail: modelError.slice(0, 400),
      });
    }
    const failedTools = toolTrace.filter((t) => !t.ok);
    for (const f of failedTools) {
      void logOpenProblem(auxConfig, {
        kind: "tool_failure",
        thread_id: threadId,
        detail: `${f.name}: ${(f.summary ?? "").slice(0, 240)}`,
      });
    }
    const summary = `*${threadId.slice(0, 8)}* · ${
      toolTrace.length ? `${toolTrace.length} tool call${toolTrace.length === 1 ? "" : "s"}` : "no tools"
    }${modelError ? " · ERROR" : ""}\n> ${userText.slice(0, 200)}`;
    void mirrorToSlack(auxConfig, summary);
    void mirrorToGitHub(auxConfig, {
      kind: "chat_turn",
      thread_id: threadId,
      tool_count: toolTrace.length,
      error: modelError ?? null,
      user_excerpt: userText.slice(0, 200),
    });
  }

  return NextResponse.json({
    ok: !modelError,
    thread_id: threadId,
    trace_id: toolTrace.length > 0 ? traceId : undefined,
    model: settings.model,
    durationMs: Date.now() - startedAt,
    user_message: userMessage,
    assistant_message: assistantMessage,
    usage: modelUsage,
    tools_used: toolGroups,
    aux_rewrite: rewrittenForModel
      ? { slot: rewriteUsedSlot, rewritten_text: rewrittenForModel }
      : null,
    aux_reflection: auxReflection,
    aux_audio: auxAudio,
    error: modelError,
  });
}
