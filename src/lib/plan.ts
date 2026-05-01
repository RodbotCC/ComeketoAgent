/**
 * Seven-day plan generator for a Lead Box.
 *
 * Per Guardrails §D — every Andre-owned lead enters a tailored 7-day cycle
 * that prefers a scheduled phone call as the conversion target. The plan
 * is generated from the hydrated Box (Close lead + activity feed +
 * subscriptions) by an LLM call with strict JSON output.
 *
 * This module is server-only. It composes a system prompt that bakes in
 * NEPQ voice rules, hard gates, send windows, frequency caps, and the
 * canonical tasting dates. It returns a SevenDayPlan matching the schema
 * in Guardrails §D4 (with a generated plan_id).
 */

import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "./settings";
import { closeGetLeadFull, type CloseActivity, type CloseLeadFull } from "./close";
import { savePlan } from "./plans-db";

// ─── Types ────────────────────────────────────────────────────────────────

export type PlanGoal = "scheduled_call" | "tasting" | "quote" | "clarify" | "re_engage";
export type PlanStatus = "draft" | "approved" | "active" | "paused" | "completed" | "killed";
export type ApprovalStatus = "not_ready" | "needs_review" | "approved" | "sent" | "skipped";
export type PlanChannel = "call" | "email" | "sms" | "task";

export type PlannedTouchpoint = {
  channel: PlanChannel;
  intent: string;        // one-line move description (NEPQ voice)
  draft_seed?: string;   // 1-2 sentences the writer can expand
  tasting_date?: string; // only when channel implies tasting offer
  notes?: string;
};

export type SevenDayPlanDay = {
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  objective: string;
  required_actions: PlannedTouchpoint[];
  send_window: string;   // human-readable send window
  approval_status: ApprovalStatus;
};

export type StopCondition = {
  trigger: string;
  action: string;
};

export type SevenDayPlan = {
  plan_id: string;
  close_lead_id: string;
  cycle_started_at: string;
  generated_at: string;
  based_on_snapshot_id: string;
  status: PlanStatus;
  primary_goal: PlanGoal;
  goal_summary: string;       // one sentence — what the week is FOR
  lead_state_summary: string; // one paragraph — current state in plain English
  known_facts: string[];
  unknowns: string[];
  best_next_question: string;
  days: SevenDayPlanDay[];
  stop_conditions: StopCondition[];
  approval_required: boolean;
};

// ─── Box → snapshot id (cheap, deterministic) ─────────────────────────────

/**
 * Generate a snapshot id for a Box state. Per Guardrails §E3 the heartbeat
 * compares snapshot ids to detect staleness. Hash the lead update timestamp
 * + activity count + last activity timestamp — anything that changes when
 * the lead changes in Close will change the snapshot id.
 */
export function snapshotIdForBox(box: CloseLeadFull): string {
  const last = box.activities[0]?.date_created || "";
  const subs = box.subscriptions.map((s) => `${s.id}:${s.status}`).sort().join("|");
  const stamp = `${box.lead.id}|${box.lead.date_updated || ""}|${box.activities.length}|${last}|${subs}`;
  // Tiny non-cryptographic hash to keep the id short.
  let h = 0;
  for (let i = 0; i < stamp.length; i++) {
    h = (h << 5) - h + stamp.charCodeAt(i);
    h |= 0;
  }
  return `snap_${Math.abs(h).toString(36)}_${box.activities.length}`;
}

// ─── Prompt assembly ──────────────────────────────────────────────────────

const TASTING_DATES = [
  "Sunday, May 3, 2026 at 5:30 PM",
  "Sunday, May 17, 2026 at 2:00 PM",
  "Sunday, May 31, 2026 at 2:00 PM",
];

const SYSTEM_PROMPT = `You are the Seven-Day Plan composer for Comeketo Agent.

You compose a tailored 7-day plan to move a single catering lead toward a SCHEDULED PHONE CALL with Andre. You are NOT a generic nurture sequence. You read the lead's full Box (profile + activity feed + workflow enrollments) and write a real plan that respects what has already happened.

## Voice (NEPQ-style — ALWAYS)
- Ask, don't pitch.
- Grounded curiosity. Low pressure.
- Specific to THIS lead. Mention real details from the activity feed.
- Calm. Direct. Short enough to feel human.
- Designed to get a reply.
- AVOID: "checking in", "touching base", "circle back", "I hope this finds you well", "just wanted to follow up", "please don't hesitate".
- No more than one exclamation point in any drafted line.
- Every move should be one a real human catering operator would make.

## Primary goal (default)
A SCHEDULED PHONE CALL with Andre. Tasting is secondary unless the lead has already asked for one or the lead is clearly tasting-ready.

## Tasting dates (only ones allowed)
${TASTING_DATES.map((d) => `  - ${d}`).join("\n")}
Do NOT invent tasting dates.

## Send windows (must be inside these)
- SMS: 9:00 AM – 7:00 PM lead-local time
- Email: 7:00 AM – 9:00 PM lead-local time
- Sunday SMS: after 11:00 AM lead-local time

## Frequency cap
- Max 1 outbound per lead per rolling 24h.
- Max 4 outbound per lead per rolling 7d.

## Hard rules for the plan
- Day 1 starts today.
- Channel mix should be realistic given what comms exist on the lead.
- If the last touch was an email, lean SMS or call next.
- If the last inbound was a question, the next move answers it.
- Recognize stop signals if present in activity ("stop", "remove me", "not interested") — if seen, return primary_goal "re_engage" only if it would be safe; otherwise return a plan with a single day_1 that surfaces the stop signal and recommends pausing.
- Acknowledge what's already enrolled in workflows. Do not double-enroll into the same Close sequence.
- Every day must include at least one required_action (call/email/sms/task). Empty days are not allowed.
- The "primary_goal" you pick MUST be one of: scheduled_call | tasting | quote | clarify | re_engage.
- "approval_required" is ALWAYS true (plans never auto-execute without Andre's explicit approval).

## Output
Return ONLY a single JSON object matching this exact shape (no prose, no code fences):

{
  "primary_goal": "scheduled_call" | "tasting" | "quote" | "clarify" | "re_engage",
  "goal_summary": "one sentence — what this week is for",
  "lead_state_summary": "one paragraph — concrete current state, name real specifics from the activity feed",
  "known_facts": ["fact 1", "fact 2", ...],
  "unknowns": ["unknown 1", "unknown 2", ...],
  "best_next_question": "one specific NEPQ-style question Andre should ask this lead",
  "days": [
    {
      "day": 1,
      "objective": "string",
      "required_actions": [
        { "channel": "call|email|sms|task", "intent": "string", "draft_seed": "string", "notes": "optional" }
      ],
      "send_window": "string"
    },
    ... 7 entries total
  ],
  "stop_conditions": [
    { "trigger": "string", "action": "pause|kill|surface" }
  ]
}`;

function summarizeBoxForPrompt(box: CloseLeadFull): string {
  const lead = box.lead;
  const contactsLine = (lead.contacts ?? [])
    .map((c) => {
      const e = (c.emails ?? []).map((x) => x.email).join(", ");
      const p = (c.phones ?? []).map((x) => x.phone).join(", ");
      return `${c.name || "(unnamed)"} — emails: ${e || "none"} | phones: ${p || "none"}`;
    })
    .join("\n");

  const cf = Object.entries(lead as unknown as Record<string, unknown>)
    .filter(([k]) => k.startsWith("custom."))
    .map(([k, v]) => `  ${k.replace("custom.", "")}: ${typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}`)
    .join("\n");

  const subs = box.subscriptions
    .map((s) => `  - ${s.sequence_name || s.sequence_id}: ${s.status}`)
    .join("\n");

  // Activity feed (newest first, capped). Compact one-line format the LLM can scan.
  const acts = [...box.activities]
    .sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())
    .slice(0, 30)
    .map((a) => activityCompactLine(a))
    .join("\n");

  return [
    `# Lead`,
    `id: ${lead.id}`,
    `name: ${lead.display_name || lead.name || "(unnamed)"}`,
    `status: ${lead.status_label || "—"}`,
    `created: ${lead.date_created || "—"}`,
    `updated: ${lead.date_updated || "—"}`,
    "",
    `# Contacts`,
    contactsLine || "(none)",
    "",
    `# Custom fields`,
    cf || "(none)",
    "",
    `# Workflow enrollments`,
    subs || "(none)",
    "",
    `# Activity feed (newest first, capped at 30)`,
    acts || "(no activity)",
  ].join("\n");
}

function activityCompactLine(a: CloseActivity): string {
  const when = (a.date_created || "").slice(0, 16).replace("T", " ");
  const dir = a.direction || "·";
  const t = a._type;
  let body = "";
  if (t === "Email") body = `subject="${(a.subject || "").slice(0, 80)}"`;
  else if (t === "SMS") body = `text="${(a.text || "").slice(0, 100)}"`;
  else if (t === "Call") body = `dur=${a.duration ?? "?"}s note="${((a.note as string) || "").slice(0, 80)}"`;
  else if (t === "Note") body = `note="${((a.note as string) || "").slice(0, 100)}"`;
  else if (t === "Task") body = `task="${((a.text as string) || (a.note as string) || "").slice(0, 80)}"`;
  return `[${when}] ${dir} ${t} ${body}`;
}

// ─── Generate ─────────────────────────────────────────────────────────────

export type GeneratePlanResult =
  | { ok: true; plan: SevenDayPlan; saveError?: string }
  | { ok: false; error: string; raw?: string };

export async function generateSevenDayPlanForLead(leadId: string): Promise<GeneratePlanResult> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };

  const box = await closeGetLeadFull(leadId);
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const userPrompt = [
    "Generate a 7-day plan for the following lead Box. Output ONLY the JSON object as instructed.",
    "",
    summarizeBoxForPrompt(box),
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: SYSTEM_PROMPT,
      input: userPrompt,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Defensive parse: find first balanced JSON object in the output.
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { ok: false, error: "no JSON object in model output", raw };
  }
  let parsed: Partial<SevenDayPlan> & { days?: SevenDayPlanDay[] };
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : err}`, raw };
  }

  // Validate minimum shape.
  if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length !== 7) {
    return { ok: false, error: `expected 7 days, got ${parsed.days?.length ?? 0}`, raw };
  }

  const now = new Date().toISOString();
  const planId = `plan_${Math.random().toString(36).slice(2, 10)}`;
  const snapshotId = snapshotIdForBox(box);

  // Fill in approval_status defaults on each day.
  const days: SevenDayPlanDay[] = parsed.days.map((d) => ({
    day: d.day,
    objective: d.objective,
    required_actions: d.required_actions ?? [],
    send_window: d.send_window || "9:00 AM – 7:00 PM lead-local",
    approval_status: "needs_review" as const,
  }));

  const plan: SevenDayPlan = {
    plan_id: planId,
    close_lead_id: leadId,
    cycle_started_at: now,
    generated_at: now,
    based_on_snapshot_id: snapshotId,
    status: "draft",
    primary_goal: parsed.primary_goal ?? "scheduled_call",
    goal_summary: parsed.goal_summary ?? "",
    lead_state_summary: parsed.lead_state_summary ?? "",
    known_facts: parsed.known_facts ?? [],
    unknowns: parsed.unknowns ?? [],
    best_next_question: parsed.best_next_question ?? "",
    days,
    stop_conditions: parsed.stop_conditions ?? [],
    approval_required: true,
  };

  // Persist to Supabase. If this fails, return the plan with a warning rather
  // than dropping it — the user still gets a plan they can re-save by hand.
  try {
    await savePlan(plan);
    return { ok: true, plan };
  } catch (err) {
    return {
      ok: true,
      plan,
      saveError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Per-day refinement (AI re-prompt) ────────────────────────────────────

const REFINE_DAY_SYSTEM = `You revise ONE day of an existing 7-day Comeketo plan based on the operator's refinement instruction.

Voice: same NEPQ rules — ask, don't pitch; specific to the lead; no "checking in" / "touching base" / "circle back" / "I hope this finds you well"; max one exclamation point; designed to get a reply.

You will receive:
1. The full plan context (all 7 days) so you understand the cadence.
2. The specific day to revise (its index and current contents).
3. The operator's refinement instruction in plain English.

You return ONLY a single JSON object matching this exact shape (no prose, no code fences):

{
  "day": 1-7,
  "objective": "string",
  "required_actions": [
    { "channel": "call|email|sms|task", "intent": "string", "draft_seed": "string", "tasting_date": "optional", "notes": "optional" }
  ],
  "send_window": "string"
}

Hard rules:
- Keep the day number unchanged.
- Every day must include at least one required_action.
- Do NOT invent tasting dates. Allowed tasting dates are: Sun May 3 5:30pm, Sun May 17 2:00pm, Sun May 31 2:00pm.
- Send windows: SMS 9am–7pm lead-local, email 7am–9pm, Sunday SMS after 11am.
- Respect what other days in the plan are doing — don't double-book the same channel back-to-back unless the instruction asks for it.`;

export type RefineDayResult =
  | { ok: true; day: SevenDayPlanDay }
  | { ok: false; error: string; raw?: string };

/**
 * Re-generate a single day of an existing plan based on an operator's
 * natural-language refinement instruction. The new day inherits the
 * existing day's index, but its objective, actions, send_window, and
 * approval_status reset to "needs_review".
 */
export async function refinePlanDay(
  fullPlan: SevenDayPlan,
  dayIndex: number,
  instruction: string
): Promise<RefineDayResult> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };
  if (dayIndex < 0 || dayIndex >= fullPlan.days.length) {
    return { ok: false, error: `dayIndex ${dayIndex} out of range` };
  }
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const currentDay = fullPlan.days[dayIndex];
  const planContext = JSON.stringify(
    {
      primary_goal: fullPlan.primary_goal,
      goal_summary: fullPlan.goal_summary,
      lead_state_summary: fullPlan.lead_state_summary,
      known_facts: fullPlan.known_facts,
      unknowns: fullPlan.unknowns,
      best_next_question: fullPlan.best_next_question,
      days: fullPlan.days,
    },
    null,
    2
  );

  const userPrompt = [
    "PLAN CONTEXT (all 7 days):",
    planContext,
    "",
    `DAY TO REVISE (index ${dayIndex}, currently day ${currentDay.day}):`,
    JSON.stringify(currentDay, null, 2),
    "",
    "OPERATOR INSTRUCTION:",
    instruction.trim() || "(no instruction — regenerate this day with same intent but fresher language)",
    "",
    "Return the revised day as a single JSON object matching the schema.",
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: REFINE_DAY_SYSTEM,
      input: userPrompt,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return { ok: false, error: "no JSON in model output", raw };
  }
  let parsed: Partial<SevenDayPlanDay> | null = null;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : err}`, raw };
  }
  if (!parsed || !Array.isArray(parsed.required_actions) || parsed.required_actions.length === 0) {
    return { ok: false, error: "revised day must have at least one required_action", raw };
  }

  const newDay: SevenDayPlanDay = {
    day: currentDay.day, // preserve day number
    objective: parsed.objective ?? currentDay.objective,
    required_actions: parsed.required_actions,
    send_window: parsed.send_window || currentDay.send_window,
    approval_status: "needs_review",
  };
  return { ok: true, day: newDay };
}

// ─── Whole-plan refinement (AI re-prompt all 7 days) ──────────────────────

const REFINE_PLAN_SYSTEM = `You revise an existing 7-day Comeketo plan based on the operator's refinement instruction.

You will receive:
1. The CURRENT plan (all 7 days).
2. The operator's refinement instruction in plain English.

You return ONLY a single JSON object with the same shape as the original plan generation output:

{
  "primary_goal": "scheduled_call|tasting|quote|clarify|re_engage",
  "goal_summary": "string",
  "lead_state_summary": "string",
  "known_facts": ["..."],
  "unknowns": ["..."],
  "best_next_question": "string",
  "days": [ { "day":1, "objective":"...", "required_actions":[{"channel":"...","intent":"...","draft_seed":"..."}], "send_window":"..." }, ... 7 entries ],
  "stop_conditions": [{ "trigger":"...", "action":"..." }]
}

NEPQ voice rules:
- Ask, don't pitch. Specific to the lead. No "checking in", "touching base", "circle back", "I hope this finds you well". Max one exclamation.
- Designed to get a reply.
- Calm, direct, short.

Hard rules:
- Always 7 days. No empty days. Every day needs at least one required_action.
- Allowed tasting dates ONLY: Sun May 3 5:30pm, Sun May 17 2pm, Sun May 31 2pm. Don't invent dates.
- Send windows: SMS 9am–7pm, email 7am–9pm, Sunday SMS after 11am.
- Frequency cap: max 1 outbound/24h, 4/7d.
- Respect the existing plan's structure UNLESS the instruction tells you to break it.
- Apply the operator's instruction concretely — don't just paraphrase the existing plan.`;

export type RefineWholePlanResult =
  | { ok: true; plan: Pick<
        SevenDayPlan,
        | "primary_goal"
        | "goal_summary"
        | "lead_state_summary"
        | "known_facts"
        | "unknowns"
        | "best_next_question"
        | "days"
        | "stop_conditions"
      >; }
  | { ok: false; error: string; raw?: string };

export async function refineWholePlan(
  fullPlan: SevenDayPlan,
  instruction: string
): Promise<RefineWholePlanResult> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const planContext = JSON.stringify(
    {
      primary_goal: fullPlan.primary_goal,
      goal_summary: fullPlan.goal_summary,
      lead_state_summary: fullPlan.lead_state_summary,
      known_facts: fullPlan.known_facts,
      unknowns: fullPlan.unknowns,
      best_next_question: fullPlan.best_next_question,
      days: fullPlan.days,
      stop_conditions: fullPlan.stop_conditions,
    },
    null,
    2
  );

  const userPrompt = [
    "CURRENT PLAN:",
    planContext,
    "",
    "OPERATOR INSTRUCTION:",
    instruction.trim() || "(no instruction — regenerate with same intent but fresher language)",
    "",
    "Return the revised plan as a single JSON object.",
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: REFINE_PLAN_SYSTEM,
      input: userPrompt,
    });
    raw = response.output_text ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return { ok: false, error: "no JSON in model output", raw };
  }
  let parsed: {
    primary_goal?: PlanGoal;
    goal_summary?: string;
    lead_state_summary?: string;
    known_facts?: string[];
    unknowns?: string[];
    best_next_question?: string;
    days?: SevenDayPlanDay[];
    stop_conditions?: StopCondition[];
  };
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : err}`, raw };
  }
  if (!Array.isArray(parsed.days) || parsed.days.length !== 7) {
    return { ok: false, error: `expected 7 days, got ${parsed.days?.length ?? 0}`, raw };
  }
  // Reset all days to needs_review so the operator re-approves the new plan.
  const days: SevenDayPlanDay[] = parsed.days.map((d) => ({
    day: d.day,
    objective: d.objective,
    required_actions: d.required_actions ?? [],
    send_window: d.send_window || "9:00 AM – 7:00 PM lead-local",
    approval_status: "needs_review" as const,
  }));

  return {
    ok: true,
    plan: {
      primary_goal: parsed.primary_goal ?? fullPlan.primary_goal,
      goal_summary: parsed.goal_summary ?? fullPlan.goal_summary,
      lead_state_summary: parsed.lead_state_summary ?? fullPlan.lead_state_summary,
      known_facts: parsed.known_facts ?? fullPlan.known_facts,
      unknowns: parsed.unknowns ?? fullPlan.unknowns,
      best_next_question: parsed.best_next_question ?? fullPlan.best_next_question,
      days,
      stop_conditions: parsed.stop_conditions ?? fullPlan.stop_conditions,
    },
  };
}
