# Thelma González — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Thelma González, status `🔘 Maybe`, primary_email `tyolita@gmail.com`, primary_phone `+1 781-795-5922`, 15 total activities (4 emails, 4 SMS, 3 calls, 3 notes, 3 threads), 0 WhatsApp.
- `01_raw_lead.json`: Source = Facebook paid lead ad, creative `DOM'S FACELESS`, campaign `[CATER] LF EVERGREEN - QUOTE`. Crisp live-chat profile linked in custom field `cf_smf4xXJP...`. No event date, no guest count, no event type, no venue captured anywhere on the lead.
- `01_raw_lead.json` opportunity record: created 2026-05-05 21:04, status `⬜ 00. Prospect`, value `$236,300` (sequence-default placeholder, not a real quote), confidence `20%`.
- `02_continuity.jsonl`: 15 events on 2026-05-05 between 21:03 and 23:26. Heavy outbound cluster — three calls back-to-back at 22:04:46 / 22:04:50 / 22:05:29; four outbound SMS; four outbound emails (welcome + 3 sequence follow-ups). **Zero inbound activity. No replies of any kind.**
- `comms/email_2026-05-05_ligaxyjt.json`: Welcome email "[✅ CATERING] You're in Thelma!" — sent 21:04, opened twice (once at 21:04:15, again at 02:17 the next morning). `has_reply: false`.
- Custom field `cf_l37qDcsFYbEZQJhRRrImt3cwFPY23IbG4kjLBJRN3GZ`: `["5x5", "✉️ FB Lead Form 1EMAIL"]` — confirms she came in via the standard FB lead form path that uses the auto-sequence.
- Custom field `cf_ka2oCzzw0j2k9T0zlxpQ0udWHP1wUW8fP0LAieNjzXl`: `["01. 📞 DAY 1 CALL"]` — confirms the cadence step is set to Day 1 call, but the three call attempts on May 5 don't appear to have completed (no call duration / outcome notes captured).

## Core Read

Thelma is the hardest kind of lead to plan around: **we have her contact info and we know she's reading our emails, but we have almost no facts about what she actually needs.** The FB form for her variant did not capture event date, headcount, or event type — it only collected name, email, phone. That makes any plan based on event specifics fake.

The system responded to her form fill with a textbook spam-shaped sequence: welcome email + 3 SMS + 3 calls within four seconds of each other + 3 follow-up emails, all in roughly 70 minutes. She opened the welcome email twice (the second time the next morning at 02:17 — she's reading), but has not replied on any channel.

The diagnosis is not "she's silent." It's "we asked the wrong questions, very loudly, very fast." The next move is the opposite of more outreach.

## Why The Plan Resets The Tone In Day 1

The Day 1 email opens with "sorry if my team came in a little hot last night." This is unusual for a sales sequence and was a deliberate choice. Three calls in four seconds plus four SMS plus four emails, viewed from Thelma's side, looks like spam — even if our intent was urgency. Acknowledging it once, in a single sentence, is more honest than pretending it didn't happen, and signals that the next interaction will be different.

The rest of Day 1 is then: three simple questions (date, headcount, event type), no video link, no quote, no tasting offer. That is the minimum we need to do anything useful, and it's also small enough that the answer can fit in a one-sentence reply.

## Why The Plan Does Not Push Brazilian BBQ

The welcome email already pushed the Brazilian BBQ video (creative `DOM'S FACELESS`, video at `dom-12.wistia.com/medias/bu7v9ttoaa`). If Brazilian BBQ resonated, she would have replied or asked. She did not. Doubling down on the same pitch is exactly the failure mode the planner-reasoning rules call out: *"broad info already sent → move to fit/decision criteria."*

So the plan moves from "broadcast Brazilian BBQ" to "ask what kind of event this actually is." If the answer turns out to be a corporate office lunch or a kid's birthday, churrasco is not the right pitch.

## Why The Plan Is Email-First, With SMS On Day 2

She opened the email twice. We know email is at least getting through her filter and being read. The Day 1 ask is email because that's the channel where we have observed engagement.

Day 2 is a single SMS — phone is on file, and SMS is one of the only two channels we have. One single SMS that mirrors the email's three-question ask is the fallback in case email is not her preferred channel. After Day 2 SMS, the plan does not go back to high-frequency texting.

This satisfies the planner-reasoning rule: *"opened email but no reply → smaller ask, not more info."*

## Why The Plan Has An Operator Task On Day 3, Not An Outbound

The Crisp live-chat link is in Thelma's custom fields (`cf_smf4xXJP...`). That's a separate channel from Close email/SMS/call where she may have given context the FB form did not capture — perhaps a venue mention, a date, a budget concern, or a "looking for X". Right now nobody on Andre's side has checked it.

The Day 3 task is explicitly to open Crisp, look for any details, and paste useful context into `10_operator_overrides.md` so the next plan iteration uses real information instead of assumptions. This is a "collect the blocker before sending another fake action" move, directly per planner-reasoning rules.

## Why The Plan Reschedules The Phone Attempt

The three call attempts on May 5 were all clustered at 22:04-22:05 UTC, two of them four seconds apart. That timing pattern is auto-dialer behavior — not a deliberate connection strategy. Thelma is in Massachusetts area code 781, so 22:04 UTC is 6:04 PM her time. Late workday, possibly commuting or having dinner.

Day 5's task explicitly directs Andre to call once at a different time of day (mid-morning or early afternoon) and to leave a real voicemail. The single attempt + voicemail + different time is the opposite of the May 5 pattern.

## Why The Opportunity Value Is Ignored

The opportunity record shows `$236,300` value at 20% confidence. That number is a sequence-default placeholder that gets stamped on every FB-lead-form opportunity automatically — it does not reflect anything Thelma has said, asked, or quoted. Treating it as a real revenue signal would be misleading. The plan does not mention dollar amounts because we don't have a real one.

## The Deal Theory

Thelma is in one of these states:

1. **She's planning an early-stage event and just wanted to know what's available.** Day 1's three-question ask gives her room to say "still figuring it out." Day 4 expands that with "where are you in your process?" — both meant to elicit a reply that's about her, not about us.
2. **She's not the decision-maker.** She filled out the form because someone asked her to. In that case, the heavy outbound flood made her stop forwarding our messages. Day 1's calmer reset email may get a reply from her or from whoever she's actually doing this for.
3. **She filled out the form on a whim and isn't actually planning anything yet.** Day 6 explicitly gives her permission to say so. Day 7 closes the file gracefully.
4. **She wanted a different cuisine entirely** — she clicked "more catering info" on a Brazilian BBQ ad, but that doesn't mean she wants Brazilian BBQ. The Day 4 question opens that door.

The plan covers all four states without committing to any one of them, because we genuinely do not know which one she is yet.

## Success Definition

The plan succeeds when Thelma replies with even minimal event details (date, headcount, type) so Andre can make a real qualification decision. It does not need to close anything. The catering sale is downstream of basic qualification, and right now we don't have basic qualification.

If by Day 7 there is still no reply, the right move is to close the file and stop spending attention on this lead. Nothing about the current data justifies indefinite cadence.

## Open Threads For Sweep Re-Run

- The Crisp chat link is the highest-value unread context for this lead. Whoever opens it should paste what they find into `10_operator_overrides.md` so the next plan iteration starts from richer ground.
- If a re-sweep ever populates the FB form's deeper fields (some FB forms include event-detail questions), regenerate this plan from those facts rather than from the void we have today.
- The opportunity value field (`$236,300`) is a sequence default. If a real ballpark is ever quoted, replace this plan's "we don't have a real number" framing.
