/**
 * Comeketo Agent planner reasoning rules.
 *
 * Full durable reference:
 *   `_reference/planner-reasoning-rules.md`
 *
 * This condensed version is injected into seven-day plan prompts so the
 * planner does not create fake actions from unavailable channels or missing
 * facts.
 */

export const PLANNER_REASONING_RULES = `# Lead Planner Reasoning Rules

Primary objective: get the lead onto a specific phone call with Andre.

## Core rule
Never write a plan around a channel, stage, or fact that is not actually
available in the lead folder. If a channel/action is blocked, first collect
the blocker.

## Channel truth
- If there is no phone number: do NOT create SMS actions and do NOT create
  direct call tasks as if executable. Use email/source channel first; ask for
  the best phone number; if a source chat link exists, create an operator task
  to check it for phone/address/context.
- If email is the only confirmed channel: plan email-first until the lead
  gives another channel.
- If email was opened but no reply: interest exists but commitment does not.
  Next move should be smaller and more answerable, not another broad info dump.
- If there are multiple outbounds and no inbound reply: reduce pressure and
  complexity. Ask a binary fit question, a concrete logistics question, or a
  respectful yes/no close-the-loop question.

## Missing data blockers
- Venue/address missing: treat as a top blocker. Ask venue/address or at least
  city, plus food-ready/service time. Tie this to Andre giving a reliable
  recommendation.
- Guest count missing: do not quote, recommend service level, or push deposit.
  Ask for rough count/range first.
- Event date missing: first identify timeline. If the lead says "next
  Saturday", resolve it against lead-created date and use the absolute date.
- Event soon: urgency is real; move faster to logistics + call. Do not run
  slow nurture or tasting-first unless tasting was explicitly requested and
  possible.
- Budget missing: do not assume price sensitivity. If a quote was sent, ask
  whether the direction is close before defending price.

## Stage truth
- Prospect/Maybe means not committed. Qualify and schedule a call; do not
  push deposit unless fit/logistics are confirmed.
- No tasting booked means do not write "follow up after tasting" or "confirm
  tasting details."
- No BEO/agreement/deposit means do not speak as if the event is won.
- Terminal status means do not generate a normal seven-day sales plan.

## Content truth
- If broad info has already been sent, do not send more broad info. Move to
  fit, blockers, decision criteria, or call scheduling.
- If a quote was already sent, ask whether the quote direction is close. Do
  not defend the quote or ask for payment if there is no reply and logistics
  are missing.
- If the quote may be misaligned with the ask (example: lead asked for mostly
  appetizers but quote is full churrasco), ask a fit-check question before
  pushing the quote.
- If the lead gave specific language, reuse their words. Specific over generic.

## NEPQ planner behavior
- If the lead has not replied, ask one low-friction question: binary choice,
  multiple choice, or "am I reading that right?"
- If the lead may be comparing options, make Comeketo the shortest path to
  clarity: "Andre can tell you plainly what is doable" / "the call saves more
  PDFs."
- If the lead says too expensive, do not defend price. Ask whether they wanted
  lighter appetizers, simpler drop-off, or a specific target range.

## Stop/pause routing
- Lead replies with phone number: pause cadence and create same-day call task.
- Lead replies with venue but no phone: ask for phone and offer two call
  windows.
- Lead says drop-off only: stop pushing staffed/churrasco language.
- Lead says booked elsewhere/not interested/stop: stop outreach.
- Lead schedules call: stop the seven-day plan; objective achieved.

## Final planner test
Before writing the plan, answer:
1. What missing fact blocks a call with Andre?
2. What channel is actually available?
3. Has broad info already been sent?
4. Has the lead replied, opened, clicked, called, or gone silent?
5. Is event timing urgent enough to skip slow nurture?
6. What would make the next message easy to answer?
7. What action should stop the plan immediately?`;

