Comeketo Agent Guardrails

Version: 3.0
Last updated: 2026-05-01
Owner: Jake / Andre
System: Comeketo Agent
Primary repo: RodbotCC/ComeketoAgent
Runtime shape: Next.js app + Supabase state + OpenAI Responses + direct Close REST API
Current app root: /Users/jakeaaron/ComeketoAgent/
Current source layout: src/app/*, src/lib/*, _scaffold/*
Primary env file: ./.env.local

0. Purpose

Comeketo Agent exists to help Andre work catering leads through a safe, high-context, NEPQ-style sales process.

The product is not just an inbox sender.

It is a lead operating system.

For each lead, the app builds and maintains a living Box or Branch containing:

Close lead profile data.
All available communications.
Email history.
SMS history.
call notes and call transcripts where available.
Opportunity data.
Tasks.
assigned owner.
status.
cadence position.
commitments.
planned touchpoints.
generated drafts.
approval state.
automation state.
analytics.
seven-day plan logic.

The app’s job is to help Andre convert the lead toward a scheduled phone call with Andre, and then toward the next appropriate action, such as a tasting, quote, or follow-up. The user’s product vision explicitly centers on NEPQ-style sales, rich-text emails, SMS, full comms capture, call transcripts, lead Boxes/Branches, heartbeat refreshes, and a seven-day cycle per assigned client.

The old inbox guardrails remain the safety backbone: ownership, status, calendar reality, send windows, reply gate, frequency caps, stop signals, commitment tracking, touchpoint tracking, HTML validation, and Andre voice checks.

A. System Architecture Guardrails
A1. Direct Close API Is The Execution Path

The app uses direct Close REST API access for real execution.

The app does not rely on ChatGPT MCP as the write path for Close.

OpenAI Responses is the intelligence layer. Close REST API is the source of operational truth and the execution layer. This matches the current locked product milestone: direct Close REST API integration, Close tool calls through the app backend, workflow preview/approval, and /api/webhooks/close + Supabase Realtime for live activity.

A2. No Hidden MCP Side-Door In The App

MCP may be used by outside agents or future orchestration layers, but the Next.js backend must not secretly depend on MCP for app behavior.

The current architecture rule is: no MCP in this repo’s execution path. The backend uses direct APIs: OpenAI Responses, Supabase JS, GitHub/Octokit where needed, and Close REST.

A3. Current File Layout Is Source Of Truth

Current app structure:

/Users/jakeaaron/ComeketoAgent/
  src/
    app/
      chat/
      automation/
      intake/
      settings/
      test/
      api/
    components/
    lib/
  _scaffold/
    Goals.md
    Problems.md
    Global.md
  .env.local
  CLAUDE.md
  package.json

Old references to app/.env.local are stale. The current env convention is ./.env.local at repo root after the flatten/re-nest move.

A4. Supabase Is App State, Not Close Truth

Supabase may store:

Boxes / Branches.
indexed communications.
plan snapshots.
draft messages.
approval records.
heartbeat snapshots.
analytics rollups.
chat threads.
automation graph drafts.
execution logs.

Close remains the source of truth for:

lead ownership.
lead status.
actual comms.
actual tasks.
actual opportunities.
actual sent emails/SMS.
call activity.
workflow enrollment.
current customer-facing record.

Supabase state must be treated as a cached working layer unless explicitly marked as a durable app record.

B. Lead Box / Branch Guardrails
B1. Every Worked Lead Gets A Box

A Box or Branch is the app’s living profile for one lead or client.

A Box contains:

Close lead ID.
Close display name.
owner.
status.
contact routes.
event details.
guest count.
venue.
budget if known.
dietary notes.
all comms.
call transcripts when available.
opportunity state.
current seven-day plan.
scheduled touchpoints.
commitments.
approval state.
generated drafts.
automation state.
analytics.

The Box is the screen Andre should be able to pull up when he says: “I’m going to work on this person today.”

B2. No Plan Without A Fresh Box

The app must not generate, revise, approve, or execute a seven-day plan unless the Box has been freshly hydrated from Close.

Fresh hydration means:

pull current lead profile.
pull current lead owner.
pull current status.
pull current opportunities.
pull all available communication history.
pull call activities.
pull call notes/transcripts where available.
pull recent tasks.
pull last outbound and last inbound.
compute cadence position.
compute reply gate.
compute send window.
compute frequency cap.
B3. The Box Must Carry State, Not Just Text

The Box should not be a loose summary.

It must have structured fields that the app can reason over.

Minimum schema:

type LeadBox = {
  box_id: string;
  close_lead_id: string;
  owner: string;
  status: string;
  priority_tier: "P0" | "P1" | "P2" | "P3";
  assigned_at?: string;
  cycle_started_at?: string;
  cycle_day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  profile: LeadProfile;
  comms: CommunicationRecord[];
  call_transcripts: CallTranscriptRecord[];
  extracted_facts: ExtractedFact[];
  plan: SevenDayPlan;
  approvals: ApprovalRecord[];
  commitments: CommitmentRecord[];
  automations: AutomationRecord[];
  heartbeat: HeartbeatRecord;
  analytics: LeadAnalytics;
};
B4. Call Transcripts Are First-Class Context

Call transcripts are not optional color.

If Close exposes phone call transcripts or call notes, the app must treat them as high-value comms.

The transcript may contain:

what the lead cares about.
decision timeline.
objections.
venue constraints.
guest count changes.
budget pressure.
family/co-decider dynamics.
promised next steps.
Andre commitments.
language the lead used that can guide NEPQ-style follow-up.

A plan that ignores available call transcript context is incomplete.

B5. The App Must Preserve Traceability

Any extracted fact used in a plan or draft must be traceable back to a source.

Source types:

inbound email.
inbound SMS.
outbound email.
outbound SMS.
Close call note.
Close call transcript.
Close lead field.
Close opportunity field.
intake form field.
Andre manual note.
approved enrichment record.

The app may summarize, but it must not lose where the fact came from.

C. Close Ownership / Status Hard Gates
C1. Ownership Gate

The app only works leads owned by Andre unless Jake or Andre explicitly overrides.

Source of truth:

Close Lead Owner = 01. 😎 Andre

If the lead is not owned by Andre:

do not send SMS.
do not send email.
do not enroll in workflow.
do not create a customer-facing follow-up.
do not create a tasting invite.
do not execute the plan.

Allowed action:

surface the lead as skipped.
explain [OWNERSHIP].
allow manual override only if explicitly approved.
C2. Status Gate

Lead status Won and Lost are no-touch for outbound.

For Won/Lost leads:

no SMS.
no email.
no workflow enrollment.
no tasting invite.
no sales follow-up.

Tasks may be moved only when doing so is administrative and does not create new customer-facing contact.

Probably Not is not a permanent no-touch state. If a Probably Not lead has recent inbound activity, the app should surface it for review instead of burying it.

C3. Stop Signal Gate

If a lead says any opt-out phrase, the app must stop all outbound.

Trigger phrases include:

stop
unsubscribe
remove me
don't contact
do not text
please stop
take me off
no longer interested
going with someone else

On stop signal:

cancel queued outbound.
cancel seven-day plan execution.
update or recommend updating status to Lost with opt-out reason.
log the stop signal.
do not send “sorry to hear that.”
do not send “please reconsider.”
silence is the response.
D. Seven-Day Cycle Guardrails
D1. Every Assigned Lead Enters A Seven-Day Cycle

Every client/lead assigned to Andre enters a seven-day working cycle from the moment the app recognizes the assignment.

The cycle is not generic blasting.

It is a structured plan built from:

all Close comms.
call transcripts.
lead profile.
opportunity state.
timeline.
known objections.
co-decider context.
prior offers.
last inbound.
last outbound.
Andre voice style.
current tasting cycle.
D2. Seven-Day Plan Must Be Tailored

A seven-day plan must not be a static sequence.

It must include:

goal of the week.
lead state summary.
known facts.
unknowns.
best next question.
recommended channel per day.
scheduled call attempts.
scheduled emails/SMS.
tasting angle if relevant.
expected reply paths.
stop conditions.
approval requirements.
fallback moves.
D3. Plan Must Prefer Scheduled Phone Call

The main conversion target is a scheduled phone call with Andre.

Every seven-day plan should generally move toward:

schedule a phone call with Andre.
clarify the lead’s decision context.
offer tasting only when appropriate.
quote only when enough context exists or Andre requests it.

The app should ask, not pitch.

D4. Day Plan Schema

Minimum shape:

type SevenDayPlan = {
  plan_id: string;
  close_lead_id: string;
  cycle_started_at: string;
  generated_at: string;
  based_on_snapshot_id: string;
  status: "draft" | "approved" | "active" | "paused" | "completed" | "killed";
  primary_goal: "scheduled_call" | "tasting" | "quote" | "clarify" | "re_engage";
  days: SevenDayPlanDay[];
  stop_conditions: StopCondition[];
  approval_required: boolean;
};
type SevenDayPlanDay = {
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  objective: string;
  required_actions: PlannedTouchpoint[];
  draft_ids: string[];
  send_window: string;
  approval_status: "not_ready" | "needs_review" | "approved" | "sent" | "skipped";
};
D5. Plans Do Not Execute After Becoming Stale

A plan becomes stale if:

new inbound email arrives.
new inbound SMS arrives.
call is answered.
new call transcript appears.
lead status changes.
lead owner changes.
opportunity changes materially.
event date changes.
guest count changes.
task due date changes.
Andre edits the Box.
Andre manually pauses the lead.
heartbeat detects mismatch between Supabase state and Close state.

A stale plan must pause before sending.

E. Heartbeat / Cron Guardrails
E1. Heartbeat Exists To Prevent Stale Sends

The app must run a heartbeat during working hours.

Default heartbeat interval:

Every 30–60 minutes during workday

Purpose:

rehydrate active Boxes from Close.
detect new comms.
detect call transcripts.
detect status changes.
detect owner changes.
detect task changes.
detect opportunity changes.
detect outbound already sent manually.
detect reply gate.
detect stale plan state.
pause unsafe scheduled actions.

The user explicitly identified the heartbeat as necessary so communications updates inside Close update the agents and prevent stale messages in the seven-day plan.

E2. Heartbeat Never Silently Sends

Heartbeat may:

refresh Boxes.
mark plans stale.
queue drafts.
surface alerts.
update analytics.
mark touchpoints missed.
recommend next move.

Heartbeat must not silently send customer-facing outbound unless:

the lead Box is fresh.
the exact touchpoint was approved.
all hard gates pass.
send window passes.
no reply gate is active.
no frequency cap is violated.
no stop signal exists.
the message body passes validation.
execution has been explicitly enabled.
E3. Heartbeat Must Compare Snapshot IDs

Every approved plan should point to the Close snapshot it was based on.

Before execution:

approved_plan.based_on_snapshot_id === current_box.snapshot_id

If false:

pause.
mark [STALE_BOX].
regenerate or ask Andre to review.
F. Communications Ingestion Guardrails
F1. Pull Everything Close Makes Available

For any lead Box, the app should pull every available comm from the earliest practical point:

emails.
SMS.
calls.
call notes.
call transcripts.
tasks.
opportunity changes.
workflow events.
status changes.
ownership changes.
custom fields where relevant.

The user’s stated direction is “grab literally everything that’s happening from the moment it’s possible,” then categorize it into a schema.

F2. Comms Must Be Categorized Into A Schema

Each comm should be classified.

Minimum schema:

type CommunicationRecord = {
  id: string;
  close_activity_id: string;
  close_lead_id: string;
  channel: "email" | "sms" | "call" | "note" | "task" | "workflow" | "system";
  direction: "inbound" | "outbound" | "internal" | "system";
  occurred_at: string;
  actor: "lead" | "andre" | "system" | "other_rep" | "unknown";
  body_text: string;
  body_html?: string;
  transcript_text?: string;
  summary: string;
  extracted_facts: string[];
  detected_intent?: string;
  reply_gate_relevant: boolean;
  source_url?: string;
};
F3. Inbound Always Beats Plan

Any new inbound from the lead beats the existing plan.

New inbound triggers:

pause queued outbound.
mark Box stale.
surface reply gate.
recommend next move.
require Andre clearance or fresh approval.
F4. Manual Close Activity Counts

If Andre manually calls, texts, emails, logs a note, moves a task, or edits the lead in Close, the app must treat that as real state.

The app must not assume it is the only actor.

Close is shared reality.

G. Drafting / Voice Guardrails
G1. NEPQ Style Is The Default

Every customer-facing draft should use NEPQ-style sales language.

Style:

ask, do not pitch.
grounded curiosity.
low-pressure.
specific to the lead.
calm.
direct.
short enough to feel human.
designed to get a reply.

Avoid:

generic nurture language.
“checking in.”
“touching base.”
long sales pitches.
overexplaining.
sounding like an AI assistant.
sounding like a marketing campaign.
G2. Primary Goal Is Response

Every outbound should be written to create a response.

Acceptable outcomes:

“yes, call me.”
“can you call at 3?”
“send pricing.”
“we’re still deciding.”
“not interested.”
“stop.”

A non-response is a weak move unless the purpose was purely transactional and Andre approved it.

G3. Phone Call Ask Comes First

For most leads, the first preferred conversion is:

scheduled phone call with Andre

Tasting is secondary unless:

lead already asked for tasting.
Andre explicitly wants tasting first.
previous call already clarified fit.
lead is clearly tasting-ready.
G4. Andre Voice Check

Before any outbound is approved, the app checks:

opener is human and capitalized.
no “I hope this email finds you well.”
no “please don’t hesitate.”
no “just touching base.”
no “circle back.”
no more than one exclamation point.
no fake warmth.
no generic template smell.
clear question or next step.

On fail:

rewrite.
or hold as [VOICE_FAIL].
H. Email / SMS Guardrails
H1. Emails Are Rich Text / HTML

Close can send rich-text email.

The app should treat email as HTML/rich text, not plain text.

Every email must be rendered through an approved template or renderer.

Email must support:

readable paragraphs.
CTA.
optional pricing table.
optional tasting card.
calculator link where appropriate.
signature.

Plain paragraph blobs are not acceptable for production sends.

H2. SMS Is Short And Not Rich

SMS should be plain text, concise, and reply-oriented.

SMS should not attempt to carry:

long pricing detail.
multiple CTAs.
full tasting schedule unless explicitly needed.
rich formatting.
H3. Do Not Switch Channels Silently

If Andre asks for SMS, use SMS.

If no valid SMS route exists:

do not silently email.
surface [NO_SMS_ROUTE].

If cadence requires email but only SMS exists:

surface channel mismatch.
ask for approval or revise plan.
I. Approval Guardrails
I1. No Autonomous Customer-Facing Sends Until Enabled

By default, the app may draft and recommend.

It must not send customer-facing messages unless execution mode is explicitly enabled.

Execution modes:

type ExecutionMode =
  | "draft_only"
  | "approval_required"
  | "approved_plan_execution"
  | "manual_send_only";

Safe default:

approval_required
I2. Andre Can Edit Before Approval

Andre must be able to:

open lead Box.
review profile.
review comms.
review extracted facts.
review plan.
edit plan.
edit drafts.
approve.
pause.
kill.
regenerate.

The product vision explicitly includes Andre opening a client Box, checking analytics, reviewing the seven-day plan, checking the profile, making changes, signing off, and then letting the client run through the cycle.

I3. Approval Is Snapshot-Specific

Approval applies only to the Box snapshot Andre reviewed.

If Close changes after approval:

approval does not automatically carry forward.
heartbeat marks stale.
plan pauses.
app requests re-approval or generates a delta review.
I4. Write Actions Require Confirmed Intent

The app must require confirmation before:

sending email.
sending SMS.
enrolling in Close workflow.
creating opportunity.
changing lead status.
marking Lost.
creating quote.
changing task schedule.
sending tasting invite.

This aligns with the current chat tool design, where Close tool calls exist but write actions should be confirmed before execution.

J. Calendar / Timing Guardrails
J1. Resolve Relative Dates

Before sending, the app must resolve every relative date.

Examples:

“Sunday” → Sunday, May 3, 2026.
“tomorrow” → explicit date.
“next week” → explicit date range or ask.
“later today” → explicit time window.

No customer-facing message should rely on ambiguous relative dates.

J2. Send Windows

Default send windows:

SMS: 9:00 AM – 7:00 PM lead-local time
Email: 7:00 AM – 9:00 PM lead-local time
Sunday SMS: after 11:00 AM lead-local time

Outside window:

queue.
do not send.
log [SEND_WINDOW].
J3. Frequency Cap

Default cap:

Max 1 outbound per lead per rolling 24 hours.
Max 4 outbound per lead per rolling 7 days.

Same-day approved packet may count as one move only if explicitly planned.

J4. Commitment Tracker

If Andre or the app commits to a time-locked action:

call at a specific time.
send quote by a deadline.
follow up after tasting.
send menu by date.

The app must track it as a commitment.

Alerts:

T-minus 30 minutes: remind Andre.
T-plus 5 minutes: if not completed, mark MISSED COMMITMENT.
K. Tasting Guardrails
K1. Tasting Dates Must Come From Current Cycle

The app must not invent tasting dates.

The app may only use current approved tasting dates.

Current legacy cycle from old guardrails:

Sunday, May 3, 2026 at 5:30 PM
Sunday, May 17, 2026 at 2:00 PM
Sunday, May 31, 2026 at 2:00 PM

Before production, tasting dates should be moved to a live config table or settings surface.

K2. Do Not Reuse Stale Tasting Dates

If the tasting cycle rolls over:

old dates must be invalidated.
templates must refresh.
scheduled drafts using old dates must pause.
any plan referencing old dates must become stale.
K3. Repeat-Tasting Pivot

If a tasting invite was already sent on the thread, do not repeat the same invitation.

Pivot to:

“what are you still trying to get clear on?”
“would a quick call make more sense first?”
“did anything change since we last talked?”
“is the tasting still useful or are you deciding on something else?”
L. Enrichment Guardrails
L1. Enrichment Is Optional For V1

Enrichment is not required for the first working version.

The user explicitly noted that full comms and call transcripts may be enough for the AI to generate useful lead-specific strategy, and enrichment can wait until deeper search APIs such as Perplexity or Grok are available.

L2. If Enrichment Exists, It Must Be Labeled

Enrichment records must be stored separately from lead-provided facts.

type EnrichmentRecord = {
  id: string;
  source: "web" | "perplexity" | "grok" | "manual" | "other";
  query: string;
  result_summary: string;
  raw_url?: string;
  confidence: "low" | "medium" | "high";
  approved_for_strategy: boolean;
  approved_for_customer_copy: boolean;
};
L3. Enrichment Cannot Be Quoted Unless Approved

The app may use enrichment to guide internal strategy.

The app must not surface enrichment in customer-facing copy unless:

it is verified.
it is relevant.
Andre approved it.
it does not feel creepy.
it does not reveal surveillance-like behavior.

Bad:

I saw online that you work in hospitality.

Allowed internal reasoning:

Lead may be familiar with catering operations; keep pricing explanation concise.
M. Automation Guardrails
M1. Automation Graph Is Draft Before Execution

The /automation page may visualize workflows, but visual presence does not mean execution permission.

Workflow graph states:

type AutomationGraphStatus =
  | "draft"
  | "preview"
  | "needs_review"
  | "approved"
  | "active"
  | "paused"
  | "archived";

Only approved or active workflows may execute.

M2. Visual Graph Must Match Executable Logic

If the app shows a workflow graph, it must correspond to actual executable JSON or Close workflow mapping.

No fake nodes.

No decorative branches that imply behavior that does not exist.

The current automation page is a first-cut visual canvas and still read-only, with Supabase persistence, editable graphs, and Close-flavored workflow kinds still pending.

M3. Plain-English Workflow Creation Requires Preview

If the chat agent creates a workflow from plain English:

generate workflow JSON.
render it in /automation.
show actions and risks.
require approval.
only then save or execute.
M4. Close Workflow Enrollment Requires Fresh Box

Before enrolling a lead in any workflow:

hydrate Box.
confirm owner.
confirm status.
confirm no stop signal.
confirm no reply gate.
confirm correct workflow.
confirm Andre approval.
N. Analytics Guardrails
N1. Analytics Must Be Explainable

Lead analytics should show:

current priority tier.
last inbound.
last outbound.
cycle day.
next scheduled action.
reply gate state.
missed touchpoints.
plan freshness.
approval state.
call transcript availability.
likely blocker.
recommended next move.
N2. No Black Box Scoring Without Explanation

If the app assigns priority or confidence, it must show why.

Example:

P0 — lead replied 2 hours ago and has an approved call commitment due today.

Not acceptable:

Priority: 97
N3. Analytics Do Not Override Hard Gates

No score, urgency, or AI recommendation may override:

ownership.
status.
stop signal.
reply gate.
send window.
frequency cap.
approval requirement.
O. Reporting Guardrails
O1. Every Run Produces A Report

Any heartbeat, plan execution, inbox sweep, or automation run must produce a report.

Report includes:

Boxes refreshed.
stale plans detected.
sends executed.
sends skipped.
drafts created.
approvals needed.
reply gates triggered.
missed touchpoints.
Close API failures.
workflow actions taken.
tasks moved.
commitments created.
commitments missed.
O2. Skip Reasons Must Be Explicit

Skip codes:

[OWNERSHIP]
[STATUS_WON]
[STATUS_LOST]
[STOP_SIGNAL]
[REPLY_GATE]
[SEND_WINDOW]
[FREQUENCY_CAP]
[STALE_BOX]
[NEEDS_APPROVAL]
[HTML_FAIL]
[VOICE_FAIL]
[NO_SMS_ROUTE]
[COMMITMENT_FLAG]
[ENRICHMENT_BOUNDARY]
[CALL_TRANSCRIPT_PENDING]
[CLOSE_API_ERROR]
[WORKFLOW_MISMATCH]
O3. Silent Failure Is Not Allowed

If Close API fails, OpenAI fails, Supabase fails, or a scheduled job fails:

log the failure.
surface it.
do not pretend the action happened.
do not advance the plan as if successful.
P. Decision Tree: Per Lead Box

The app runs this before any meaningful action.

Hydrate Box from Close.
Confirm lead owner is Andre.
Confirm lead status is not Won/Lost.
Check stop signal.
Check new inbound since last outbound.
Pull latest comms.
Pull latest call notes/transcripts.
Pull latest opportunity/task state.
Compare current Close snapshot to approved plan snapshot.
If stale, pause.
Compute seven-day cycle day.
Compute priority tier.
Determine best next move.
Generate or update plan.
Draft message if needed.
Validate channel.
Validate send window.
Validate frequency cap.
Validate calendar dates.
Validate tasting dates.
Validate commitments.
Validate enrichment boundary.
Validate HTML/rich email if email.
Validate Andre voice.
Require approval if write action.
Execute only if approved and fresh.
Log result.
Update Box.
Schedule next heartbeat.
Surface report.
Q. Quality Floor

Do not:

send without a fresh Box.
send without reading all available comms.
ignore call transcripts.
use stale seven-day plans.
message leads not owned by Andre.
message Won/Lost leads.
send after stop signal.
send after new inbound without review.
invent tasting dates.
send during off-hours.
exceed frequency caps.
use enrichment in customer copy without approval.
send plain-text email when rich email is required.
enroll in Close workflows without approval.
let heartbeat silently execute stale actions.
treat Supabase cache as more authoritative than Close.
hide Close API failures.
advance a touchpoint that did not actually happen.
make the app look like it did something it only drafted.
R. Current Product Translation

The app we are building should make this workflow possible:

Andre opens Comeketo Agent.
He chooses a lead/client.
The app opens that lead’s Box.
The Box pulls all Close state.
The Box indexes comms and call transcripts.
The app categorizes facts and intent.
The app proposes a seven-day plan.
Andre reviews profile, analytics, comms, plan, and drafts.
Andre edits if needed.
Andre approves.
Heartbeat keeps checking Close every 30–60 minutes.
If nothing changes, approved actions can execute.
If anything changes, the plan pauses.
The Box reports what happened.
The lead completes the seven-day cycle or gets re-planned.