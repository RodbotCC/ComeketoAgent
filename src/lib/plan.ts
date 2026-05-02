/**
 * Variable-horizon cycle plan generator for a Lead Box.
 *
 * Per Guardrails §D — Andre-owned leads get a tailored N-calendar-day cycle
 * (default 7 for NEPQ-style week) toward a scheduled phone call. The plan is
 * generated from the hydrated Box by an LLM with strict JSON output.
 *
 * Sub-day or sub-year scheduling is not modeled here: each "day" is one
 * calendar bucket; heartbeat still applies send windows inside that day.
 *
 * This module is server-only.
 */

import OpenAI from "openai";
import { env } from "./env";
import { getSettings, clampPlanHorizonDays } from "./settings";
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
  /** 1-based index within this plan (1 … days.length). */
  day: number;
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
  goal_summary: string;       // one sentence — what the cycle is FOR
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
 * compares snapshot ids to detect staleness. Uses sorted activity timestamps,
 * newest activity id, email-thread count + latest thread touch, lead
 * `date_updated`, and subscription rows — so new comms or thread updates
 * invalidate the plan without relying on API sort order of `/activity/`.
 */
export function snapshotIdForBox(box: CloseLeadFull): string {
  const sortedActs = [...box.activities].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
  );
  const lastActTime = sortedActs[0]?.date_created || "";
  const lastActId = sortedActs[0]?.id || "";
  const threads = box.email_threads ?? [];
  const sortedThreads = [...threads].sort(
    (a, b) =>
      new Date(b.date_updated || b.date_created || 0).getTime() -
      new Date(a.date_updated || a.date_created || 0).getTime()
  );
  const lastThreadTouch =
    sortedThreads[0]?.date_updated || sortedThreads[0]?.date_created || "";
  const lastThreadId = sortedThreads[0]?.id || "";
  const subs = box.subscriptions.map((s) => `${s.id}:${s.status}`).sort().join("|");
  const stamp = `${box.lead.id}|${box.lead.date_updated || ""}|${sortedActs.length}|${lastActTime}|${lastActId}|${threads.length}|${lastThreadTouch}|${lastThreadId}|${subs}`;
  // Tiny non-cryptographic hash to keep the id short.
  let h = 0;
  for (let i = 0; i < stamp.length; i++) {
    h = (h << 5) - h + stamp.charCodeAt(i);
    h |= 0;
  }
  return `snap_${Math.abs(h).toString(36)}_${sortedActs.length}`;
}

// ─── Prompt assembly ──────────────────────────────────────────────────────

const TASTING_DATES = [
  "Sunday, May 3, 2026 at 5:30 PM",
  "Sunday, May 17, 2026 at 2:00 PM",
  "Sunday, May 31, 2026 at 2:00 PM",
];

function buildGenerateSystemPrompt(horizonDays: number): string {
  const n = horizonDays;
  const tasting = TASTING_DATES.map((d) => `  - ${d}`).join("\n");
  return `You are the Cycle Plan composer for Comeketo Agent.

You compose a tailored ${n}-calendar-day plan to move a single catering lead toward a SCHEDULED PHONE CALL with Andre. You are NOT a generic nurture sequence. You read the lead's full Box (profile + activity feed + workflow enrollments) and write a real plan that respects what has already happened.

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
${tasting}
Do NOT invent tasting dates.

## Send windows (must be inside these)
- SMS: 9:00 AM – 7:00 PM lead-local time
- Email: 7:00 AM – 9:00 PM lead-local time
- Sunday SMS: after 11:00 AM lead-local time

## Frequency cap (rolling wall-clock, independent of plan length)
- Max 1 outbound per lead per rolling 24h.
- Max 4 outbound per lead per rolling 7d.
- **Multi-touch same calendar day:** you may still *plan* more than one outbound for a day when channels/timing differ, but the heartbeat applies this cap — the second touch may show \`FREQUENCY_CAP_24H\` / \`FREQUENCY_CAP_7D\` in the report until the window clears (strict default; see product note in Box plan UI).

## Hard rules for the plan
- Day 1 is the first calendar bucket of the cycle (today). The plan has exactly ${n} calendar-day buckets numbered 1…${n}.
- **Multiple touchpoints per day are normal when the Box warrants it** (e.g. morning SMS + afternoon email). Use **distinct intent** per touch, explicit order in \`required_actions\`, and do **not** duplicate the same move twice the same day.
- Channel mix should be realistic given what comms exist on the lead.
- If the last touch was an email, lean SMS or call next.
- If the last inbound was a question, the next move answers it.
- Recognize stop signals if present in activity ("stop", "remove me", "not interested") — if seen, return primary_goal "re_engage" only if it would be safe; otherwise return a plan with a single day (day=1) that surfaces the stop signal and recommends pausing (still emit exactly ${n} days: day 1 = the warning; later days = minimal safe holding actions or explicit "wait" tasks if you must fill buckets).
- Acknowledge what's already enrolled in workflows. Do not double-enroll into the same Close sequence.
- Every day must include at least one required_action (call/email/sms/task). Empty days are not allowed.
- The "primary_goal" you pick MUST be one of: scheduled_call | tasting | quote | clarify | re_engage.
- "approval_required" in the JSON spec below is implied always true — plans never auto-execute without Andre's explicit approval.

## Output
Return ONLY a single JSON object matching this exact shape (no prose, no code fences):

{
  "primary_goal": "scheduled_call" | "tasting" | "quote" | "clarify" | "re_engage",
  "goal_summary": "one sentence — what this ${n}-day cycle is for",
  "lead_state_summary": "one paragraph — concrete current state, name real specifics from the activity feed",
  "known_facts": ["fact 1", "fact 2", ...],
  "unknowns": ["unknown 1", "unknown 2", ...],
  "best_next_question": "one specific NEPQ-style question Andre should ask this lead",
  "days": [
    /* Exactly ${n} objects. "day" must run 1 through ${n} in order with no gaps or duplicates. */
    {
      "day": 1,
      "objective": "string",
      "required_actions": [
        { "channel": "call|email|sms|task", "intent": "string", "draft_seed": "string", "notes": "optional" }
        /* You MAY include >1 object here when multiple touches the same calendar day are justified. */
      ],
      "send_window": "string"
    }
  ],
  "stop_conditions": [
    { "trigger": "string", "action": "pause|kill|surface" }
  ]
}`;
}

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

  const thr = (box.email_threads ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.date_updated || b.date_created || 0).getTime() -
        new Date(a.date_updated || a.date_created || 0).getTime()
    )
    .slice(0, 15)
    .map((t) => {
      const when = (t.date_updated || t.date_created || "").slice(0, 16).replace("T", " ");
      return `  [${when}] "${(t.subject || "(no subject)").slice(0, 80)}"`;
    })
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
    `# Email threads (conversation grouping — use with activity feed)`,
    thr || "(none)",
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
  else if (t === "WhatsApp") body = `text="${String((a.text as string | undefined) ?? "").slice(0, 100)}"`;
  return `[${when}] ${dir} ${t} ${body}`;
}

// ─── Generate ─────────────────────────────────────────────────────────────

export type GeneratePlanResult =
  | { ok: true; plan: SevenDayPlan; saveError?: string }
  | { ok: false; error: string; raw?: string };

export async function generateSevenDayPlanForLead(
  leadId: string,
  opts?: { horizonDays?: number }
): Promise<GeneratePlanResult> {
  if (!env.OPENAI_API_KEY) return { ok: false, error: "OPENAI_API_KEY not set" };

  const box = await closeGetLeadFull(leadId);
  const settings = await getSettings();
  const horizon = clampPlanHorizonDays(opts?.horizonDays ?? settings.default_plan_horizon_days);
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const userPrompt = [
    `Generate a ${horizon}-calendar-day cycle plan for the following lead Box. Output ONLY the JSON object as instructed.`,
    "",
    summarizeBoxForPrompt(box),
  ].join("\n");

  let raw = "";
  try {
    const response = await client.responses.create({
      model: settings.model,
      instructions: buildGenerateSystemPrompt(horizon),
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
  if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length !== horizon) {
    return { ok: false, error: `expected ${horizon} days, got ${parsed.days?.length ?? 0}`, raw };
  }

  const now = new Date().toISOString();
  const planId = `plan_${Math.random().toString(36).slice(2, 10)}`;
  const snapshotId = snapshotIdForBox(box);

  // Force canonical day indices 1…N (model sometimes drifts labels).
  const days: SevenDayPlanDay[] = parsed.days.map((d, i) => ({
    day: i + 1,
    objective: d.objective ?? "",
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

function buildRefineDaySystem(totalDays: number): string {
  return `You revise ONE day of an existing ${totalDays}-calendar-day Comeketo cycle plan based on the operator's refinement instruction.

Voice: same NEPQ rules — ask, don't pitch; specific to the lead; no "checking in" / "touching base" / "circle back" / "I hope this finds you well"; max one exclamation point; designed to get a reply.

You will receive:
1. The full plan context (all ${totalDays} day buckets) so you understand the cadence.
2. The specific day to revise (its index and current contents).
3. The operator's refinement instruction in plain English.

You return ONLY a single JSON object (no prose, no code fences) with keys:
- day (integer): MUST equal the calendar bucket number being revised — see "DAY TO REVISE" in the user message.
- objective (string)
- required_actions: array of { "channel": "call|email|sms|task", "intent": "string", "draft_seed": "string", "tasting_date": "optional", "notes": "optional" }
- send_window (string)

Example shape (values are illustrative):
{ "day": 3, "objective": "string", "required_actions": [{ "channel": "email", "intent": "string", "draft_seed": "string" }], "send_window": "string" }

Hard rules:
- Keep the day number unchanged (it must match the day being revised).
- Every day must include at least one required_action; **you may include several** when cadence calls for multi-touch (ordered; unique intent per touch).
- Do NOT invent tasting dates. Allowed tasting dates are: Sun May 3 5:30pm, Sun May 17 2:00pm, Sun May 31 2:00pm.
- Send windows: SMS 9am–7pm lead-local, email 7am–9pm, Sunday SMS after 11am.
- Respect what other days in the plan are doing — don't double-book the same channel back-to-back unless the instruction asks for it.`;
}

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

  const n = fullPlan.days.length;
  const userPrompt = [
    `PLAN CONTEXT (all ${n} calendar-day buckets):`,
    planContext,
    "",
    `DAY TO REVISE (index ${dayIndex}, calendar bucket ${currentDay.day}):`,
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
      instructions: buildRefineDaySystem(n),
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
    day: currentDay.day,
    objective: parsed.objective ?? currentDay.objective,
    required_actions: parsed.required_actions,
    send_window: parsed.send_window || currentDay.send_window,
    approval_status: "needs_review",
  };
  return { ok: true, day: newDay };
}

// ─── Whole-plan refinement (AI re-prompt full cycle) ─────────────────────

function buildRefineWholePlanSystem(horizonDays: number): string {
  const n = horizonDays;
  return `You revise an existing ${n}-calendar-day Comeketo cycle plan based on the operator's refinement instruction.

You will receive:
1. The CURRENT plan (all ${n} day buckets).
2. The operator's refinement instruction in plain English.

You return ONLY a single JSON object with the same shape as the original plan generation output:

{
  "primary_goal": "scheduled_call|tasting|quote|clarify|re_engage",
  "goal_summary": "string",
  "lead_state_summary": "string",
  "known_facts": ["..."],
  "unknowns": ["..."],
  "best_next_question": "string",
  "days": [ { "day":1, "objective":"...", "required_actions":[{"channel":"...","intent":"...","draft_seed":"..."}], "send_window":"..." }, ... exactly ${n} entries with day running 1..${n} ],
  "stop_conditions": [{ "trigger":"...", "action":"..." }]
}

NEPQ voice rules:
- Ask, don't pitch. Specific to the lead. No "checking in", "touching base", "circle back", "I hope this finds you well". Max one exclamation.
- Designed to get a reply.
- Calm, direct, short.

Hard rules:
- Always exactly ${n} calendar-day buckets. No empty days. Every day needs at least one required_action (**multiple ordered touches allowed** when justified).
- Allowed tasting dates ONLY: Sun May 3 5:30pm, Sun May 17 2pm, Sun May 31 2pm. Don't invent dates.
- Send windows: SMS 9am–7pm, email 7am–9pm, Sunday SMS after 11am.
- Frequency cap: max 1 outbound/24h, 4/7d rolling — heartbeat enforces; a second outbound the same calendar day may be skipped (FREQUENCY_CAP_*) even if listed in the plan.
- Respect the existing plan's structure UNLESS the instruction tells you to break it.
- Apply the operator's instruction concretely — don't just paraphrase the existing plan.`;
}

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
  const n = fullPlan.days.length;

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
      instructions: buildRefineWholePlanSystem(n),
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
  if (!Array.isArray(parsed.days) || parsed.days.length !== n) {
    return { ok: false, error: `expected ${n} days, got ${parsed.days?.length ?? 0}`, raw };
  }
  // Reset all days to needs_review so the operator re-approves the new plan.
  const days: SevenDayPlanDay[] = parsed.days.map((d, i) => ({
    day: i + 1,
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
