# Kyle Melo — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Kyle Melo, status `🔘 Maybe`, primary_email `kylemelo1999@gmail.com`, primary_phone `+1 617-480-9931` (Boston area code), 12 total activities (3 emails, 3 SMS, 2 calls, 3 notes, 3 threads), 0 WhatsApp.
- `01_raw_lead.json` + opportunity record: source = Facebook lead ad, event = wedding, event_date = `2026-08-08`, guest_count = 30, opportunity status `⬜ 00. Prospect`, confidence `20%`, custom field `NEEDS VENUE NAME`.
- `02_continuity.jsonl`: lead created 2026-05-05 01:58 UTC; outbound cluster in first hour (welcome email, 2 SMS in 2 min, sequence follow-up email at 03:04). **One inbound SMS from Kyle at 11:09 UTC the next morning.** Two back-to-back outbound calls at 13:21:53 + 13:21:57 (4 seconds apart) — no connection logged. Follow-up email at 13:22.
- `03_comms_interpreted.md`: confirms inbound SMS content is missing from raw substrate; flags that the calls and the inbound message both need to be read before composing a follow-up.
- `04_profile.md`: identifies the 30-person wedding as the defining frame — small enough to be intentional, but small enough that pricing/minimums can become a friction point if mishandled.
- `06_discovery.md`: known slots = event_date, client_type (wedding), guest_count (30); current quest is venue.
- `07_andre_alerts.md`: explicit warnings — *"Inbound SMS needs review before next touch,"* *"Do not send another generic 'just following up' message,"* *"Do not pitch packages/menu details before clarifying venue and format,"* *"Do not assume urgency beyond the evidence."*

## Core Read

Kyle is a high-quality lead by FB-ad-form standards: he gave us event date, headcount, and event type up front. He opened the welcome email twice, replied via SMS the next morning, and is reachable on phone. He is not Sarah (silent) or Thelma (silent and missing event facts). He is engaged.

The two real problems are both on our side:

1. **Andre hasn't read Kyle's SMS yet.** The reply content isn't in our captured substrate. Composing the next message without reading what he said is the same trap that wasted time on Cassandra.
2. **The two calls four seconds apart at 13:21 are auto-dialer pattern.** They didn't connect. Repeating that pattern won't connect either.

The third opportunity is positional: this is a 30-person wedding. The original welcome email pushed Brazilian BBQ video content. There is no evidence Kyle wants Brazilian BBQ specifically — he came in for "wedding catering." Doubling down on churrasco for an intimate 30-person wedding could miss the actual intent (which might be plated, family-style, or backyard-casual — none of which the Brazilian BBQ video addresses).

## Why The Plan Starts With An Operator Task, Not An Automated Send

`07_andre_alerts.md` says it explicitly: *"Start with Kyle's inbound text, not a fresh script."* Day 1 of the plan is Andre opening the SMS thread, reading what Kyle actually said, and replying directly. No template send, no scripted message — just acknowledgment of his actual words plus one small ask.

This is the same pattern as Cassandra's plan, for the same reason: when an inbound message exists and hasn't been read, every other channel push is fake action.

## Why The Plan Reframes The "30-Person" Angle

A 30-person wedding triggers two failure modes if mishandled:

1. **Treating it as too small to bother with** — operators who specialize in 100+ events often communicate condescension toward smaller weddings, and the lead feels it.
2. **Treating it as a downgrade and immediately discussing minimums** — which signals to the buyer that we don't really want the job.

Both are mistakes for Comeketo with this lead. A small wedding is a *format choice*, not a budget compromise. People choosing 30 guests are usually choosing intentionality — close family, no plus-ones-of-plus-ones, real conversation across the table. The food matters more, not less.

The Day 3 email opens with "A wedding for 30 is one of my favorite formats to work on." That's not flattery — it's strategically positioning Comeketo as the kind of caterer who *gets* this format, which is exactly what the buyer wants to hear from a vendor that doesn't push them into a pre-packaged "wedding banquet" structure.

## Why The Plan Doesn't Push Brazilian BBQ

The original Facebook lead-form welcome email referenced the Brazilian BBQ video. But Kyle did not select Brazilian BBQ — he selected "more catering info" for a wedding. We have zero evidence he wants churrasco specifically.

For an intimate 30-person wedding, churrasco may not even be the right format. A backyard family-style dinner, a small plated meal, or a station-style buffet all fit differently. The Day 5 NEPQ question (*"What do you want the day to feel like?"*) is built specifically to surface what Kyle actually wants before we lock the conversation around any cuisine.

This honors the planner-reasoning rule: *"broad info already sent → move to fit/decision criteria."*

## Why The Plan Is SMS + Email Mixed, Not Single-Channel

Kyle has shown engagement on both channels — opens on email, one reply on SMS. Days 1, 2, 5, 7 use SMS for the high-engagement, conversational moves. Days 3, 4, 6 use email for the longer-form pieces: format reframe, voicemail follow-up, and forwardable recap.

The day-of-week pacing is also intentional. Day 1 goes today (or whenever Andre opens the plan). Day 2 only fires if venue is confirmed; otherwise Day 3 takes over. Day 4 is the call attempt. Day 5 onward is paced for one touch every 1-2 days, which respects the 3-month-out timeline — Kyle has time, we should not act like we don't.

## Why The Plan Reschedules The Phone Attempt

The two attempts on May 5 at 13:21 were within 4 seconds of each other — auto-dialer behavior, not a deliberate connection strategy. Kyle is in Massachusetts area code 617. 13:21 UTC is 9:21 AM Boston — likely commute or first-meeting time.

Day 4's task explicitly directs Andre to attempt at a different time of day (around 10 AM or 1 PM Boston) and to leave a real voicemail. Single attempt. Different time. Voicemail with a clear reason to call back.

## Why The Email Is Forwardable On Day 6

We don't know if Kyle is the sole decision-maker. He's getting married — there's likely a partner involved, possibly a parent helping plan. The Day 6 email is intentionally structured as a forwardable recap (date / headcount / what's still needed) so that if the answer is "let me check with my partner first," Kyle has something useful to send rather than retyping the conversation.

This also avoids putting any content in writing that would be awkward to forward (no pricing speculation, no packages by name, no over-personalized lines).

## The Deal Theory

Kyle is plausibly in one of these states:

1. **He's actively planning and ready to talk.** Day 1's SMS reply gets the conversation moving. Days 2-4 land him on a call.
2. **He's exploring caterers in parallel.** Days 3 and 5's "what does the day feel like?" questions surface differentiation — Comeketo positioned as the caterer who asks about *the wedding*, not *the menu*.
3. **He has venue uncertainty.** Many couples planning small weddings haven't locked the venue yet because the format is flexible. Day 3 explicitly invites him to share even just the city, which lowers the bar to reply.
4. **He's not actually the buyer — partner is.** Day 6's forwardable email gives him an artifact to pass along.

The plan is built so all four states route through the same SMS-first opening.

## Success Definition

The plan succeeds when Kyle confirms the venue (or city) and agrees to a 15-minute call window with Andre. It does not need to close the wedding catering — the app's job is to get to a real conversation. Everything from there is Andre's to handle.

## Open Threads For Sweep Re-Run

- The actual text of Kyle's inbound SMS at 11:09 UTC May 5 is not yet in the raw substrate. A re-sweep that captures SMS body content (or a manual paste of the message into `10_operator_overrides.md`) would meaningfully sharpen Day 1's reply.
- The two notes from May 5 13:22 and 14:06 — content not visible in the substrate either — may contain Andre's call-attempt outcomes or post-call observations. Worth checking when reading the SMS thread.
