# Little Sage Farmhouse — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Lead name `Little Sage Farmhouse`, contact = Miosoty Gonzalez, primary_email `miosotygonzalez@gmail.com`, primary_phone `+1 781-964-9537`, status `🔘 Maybe`. 11 activities (3 emails, 4 SMS, 0 calls, 3 notes, 2 threads).
- `01_raw_lead.json` + opportunity: source = Facebook Lead Ad (`LF EVERGREEN - QUOTE` campaign, `RODS WEDDING & FACELESS` creative). Event = wedding, guest_count ~150, **event_date = not yet determined**, status `⬜ 00. Prospect`, confidence `20%`, custom field `NEEDS VENUE NAME`.
- `02_continuity.jsonl`: Lead created May 5 17:19 UTC. First-hour cluster — note + welcome email + 2 SMS within 90 seconds. **Inbound SMS from Miosoty at 17:21:17, just 91 seconds after the second outbound SMS.** After her reply, our flow continued with: another outbound email at 17:39, another SMS at 17:39:59, another email at 18:30 — none acknowledging her reply.
- `04_profile.md`: explicitly identifies the lead as researching future options, no date yet, low confidence (20%), and flags the format-decision angle for a 150-person wedding.

## Core Read

This is an **exploratory** lead, not a near-term deal. Three signals make that clear:

1. The CRM stamps it `Prospect / Maybe` at 20% confidence.
2. Miosoty's own framing (per `04_profile.md`) is "just looking into the future for options."
3. There is no event date — for a 150-person wedding, that means she's months or years from a real commitment.

Treating an exploratory lead like an urgent close-stage one is the failure mode this plan must avoid. The May 5 outbound cluster (5+ touches in ~70 minutes after she had already replied) is exactly that failure mode — it shows the system doesn't know how to slow down for a long-runway lead.

The second important read: **the lead name itself is "Little Sage Farmhouse"**, which sounds like a venue. Yet the CRM has `NEEDS VENUE NAME` flagged. That's contradictory — if Little Sage Farmhouse were the venue, it would already be filled in. So either:
- "Little Sage Farmhouse" is what Miosoty is calling her event (a pet name or a stylistic identifier), and she has no venue locked yet, OR
- "Little Sage Farmhouse" is a venue she runs or is associated with, and she's coordinating catering on behalf of someone else (or herself for a personal event there)

The plan's Day 1 explicitly asks her to disambiguate this, because it changes everything downstream — a venue manager has different needs than a bride.

## Why Day 1 Is The Disambiguation Question

Sarah, Cassandra, Kyle, Bruna, Thelma — all five had clearer identities (a buyer with an event). Miosoty's identity is genuinely ambiguous. Until we know if she's the bride, the venue manager, or a planner working with the venue, every other move is partially guessing.

The Day 1 SMS asks two questions: (1) is "Little Sage Farmhouse" the venue or the event, and (2) what's your rough date window. Both answers significantly reshape Days 2-7.

## Why The Plan Is Slow-Paced, Not Aggressive

For Sarah (May 15 event, ~10 days out), the plan was urgent and structured around a closing timeline. For Miosoty (no date, "future options"), the plan is paced for months. Cadence highlights:

- Day 1, 2, 3 are SMS / email but each gates on engagement.
- Day 5 has the first call attempt (much later in cycle than for time-sensitive leads).
- Day 7 explicitly *pauses outbound* and holds the door open for her to come back.

The frequency-cap rules (max 1/24h, 4/7d) are satisfied easily because the plan deliberately does less, not more.

## Why The Plan Doesn't Push A Quote

For a 150-person wedding with no date, there is no honest quote to give. Pricing depends on date (peak vs off-peak), format (sit-down 150 ≠ buffet 150 in cost), venue (city affects logistics), and bar/no-bar. Sending a packaged quote at this stage would either be wildly inaccurate or so generic it provides no useful information.

The Day 4 forwardable email explicitly avoids pricing and instead says "what we'd need from you to put a real number together" — listing date window, venue or city, format, dietary, bar service. That's honest and gives her a clear sense of what conversation will happen *when she's ready*.

## Why The Plan Apologizes For The May 5 Spam

After Miosoty's inbound SMS at 17:21, the system fired three more outbound touches in the next 70 minutes without anyone acknowledging her message. From her side, that looks like a bot, not a person. The Day 1 SMS opens with "sorry the system spammed you a bit, that wasn't intentional" — one sentence, then move on.

This is similar to Thelma's plan, where the same acknowledgment was warranted for the same reason. The honesty matters more than maintaining a smooth-template tone.

## Why The Plan Asks About Format On Day 2

For weddings under 50 people, format is a feel choice. For weddings at 150, format is the cost-driver and the planning-driver. A 150-person sit-down dinner is a different operation from a 150-person family-style or buffet. Asking format early gives Andre what he needs to be useful, and it gives Miosoty agency in shaping what we propose.

## Why The Plan Holds The Door Open On Day 7

Most exploratory leads don't close in their first 7-day cycle. They come back 3-6 months later when the date is locked, the venue is chosen, and they're ready to actually contract. The worst thing we can do is over-message *now* and burn the relationship before that future window opens.

Day 7's email explicitly pauses our outreach and tells her exactly how to come back when she's ready. This is patient catering sales, not urgent FB-lead-form catering sales. For a 150-person wedding, patience is the right move.

## The Deal Theory

Miosoty is in one of these states:

1. **She's the bride, exploring early, no date yet.** The plan's slow pace and "we can be helpful early" framing fits this perfectly. Day 1 disambiguates and starts a real exploratory conversation.
2. **She runs Little Sage Farmhouse as a venue and is shopping caterers for partner-vendor lists.** Day 1's first question surfaces this. If she is, the conversation pivots toward a venue-vendor relationship rather than a single-event catering pitch.
3. **She's planning her own wedding at the Little Sage Farmhouse venue.** Day 1's questions still work; we just confirm venue is locked and pivot to format.
4. **The lead source got noisy and she filled out the form casually.** Day 6/7's "I'll pause unless you reach out" closes gracefully without burning her.

Across all four states, Day 1 is the same: read her SMS, reply with the disambiguation question, slow down.

## Success Definition

The plan succeeds when Miosoty either (a) confirms a date window and format direction, enabling Andre to put together a real proposal, or (b) clearly indicates she's not ready and consents to a pause-with-door-open. Both are wins for an exploratory lead.

The undesirable outcome is more of the May 5 pattern — system blasts, she stops engaging, lead goes cold while still listed as active. The plan is built to prevent that.

## Open Threads For Sweep Re-Run

- Miosoty's inbound SMS at 17:21 needs its body content captured. Without it, Day 1's reply is "Andre reads it manually" but ideally the next sweep makes the text available so the plan's draft can cite specific phrasing.
- The "Little Sage Farmhouse" name ambiguity is the most important unresolved fact for this lead. Whatever Andre learns from Day 1's question should be pasted into `10_operator_overrides.md` so the next plan iteration doesn't re-derive it.
- The opportunity has `date_won` set without supporting agreement/deposit signals — same data inconsistency seen in Bruna's record. Worth flagging to whoever does CRM hygiene.
