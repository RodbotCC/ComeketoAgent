# Bruna Andrade — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Bruna Andrade, status `🔘 Maybe`, primary_email `bgrade80@gmail.com`, primary_phone `+1 774-244-8237`, 25 total activities (1 email, 10 SMS, 4 calls, 5 notes, 3 tasks, 1 thread), 0 WhatsApp.
- `01_raw_lead.json` + opportunity: source = Facebook Ads "BAR SERVICE" creative, event_date `2026-05-23 15:00 UTC`, location `Framingham, MA 01701`, guest_count `50`, opportunity status `🔥 05A. Quote sent`, `date_won` set to `2026-05-23` (optimistic placeholder, not real won), `NEEDS VENUE NAME` flag still active.
- `02_continuity.jsonl`: 25 events across May 2-5. Heavy outbound on May 2 (note + 3 SMS + call + SMS + 2 tasks + note) and May 3 (2 calls back-to-back at 16:09:55 + 16:10:17, SMS, task). Quote-bearing email sent May 4 at 22:55 after another call/SMS cluster. Final outbound on May 5 morning.
- **Two inbound SMS replies from Bruna:** May 2 at 16:32 and May 5 at 14:46. Both reply contents missing from raw substrate.
- `04_profile.md`: identifies the self-narrowing from "free tasting request" to "bar service only" — Bruna refined her own ask, which signals clarity of intent. Also flags decision-maker ambiguity and `NEEDS VENUE NAME` as the operational blocker.

## Core Read

Bruna is the most advanced lead in the active set. Where Sarah, Cassandra, Kyle, and Thelma are at discovery stage, Bruna is at quote stage — the opportunity has already moved to `🔥 05A. Quote sent`. The quote landed in her inbox on May 4 evening. Her May 5 SMS reply (content unknown) sits temporally after the quote, which means it could be:

- "Got the quote, looks good, what's next?"
- "The quote is too high"
- "I have a question about the scope"
- "Still figuring out the venue, then I'll respond"
- Or something completely unrelated

Until Andre reads that May 5 reply, every other move is a guess.

The plan's structure flips a key assumption from the discovery-stage plans: instead of asking for missing facts, we are asking for the **specific blocker to a yes**. That's the right post-quote move per the planner-reasoning rules: *"quote sent but no reply → ask if quote direction is close."*

## Why The Plan Is SMS-First, Not Email-First

Bruna has replied **twice via SMS** and has not replied via email at all (the quote email's `has_reply` would presumably be true if she had). SMS is her actual channel of choice. The plan's high-engagement moves (Days 1, 2, 3, 6) are all SMS. Email shows up on Days 4 and 7 only — Day 4 because we need a forwardable artifact, Day 7 because final close-out emails are slightly more formal than text.

This satisfies the planner-reasoning principle: don't write a plan around a channel the lead hasn't actually used.

## Why Day 1 Is The Closing Question, Not A Quote-Re-Send

Sending the quote again would be the worst possible move. We just sent it on May 4. Re-sending implies nobody on our side has noticed she received it.

The right Day 1 move is the question that closes deals at quote stage: *"What would need to be true on the quote for it to be a yes?"* This question:

1. Shows we understand she's seen the quote.
2. Invites the specific objection (which we cannot answer until we hear it).
3. Frames us as flexible without giving away discount before she's asked for one.
4. Filters out leads who are not actually close — if she says "honestly the price is double what I was thinking," we know to either revise or fold.

This question is the planner-reasoning rule made concrete.

## Why The Plan Doesn't Repeat The May 2 / May 3 / May 4 Pattern

Looking at the May 2-5 timeline, the system was on autopilot: every 24 hours, fire another outbound. By May 5, Bruna had already received 10 outbound SMS, 4 outbound calls, and the quote email — in 4 days. That's a high-volume cadence even for a hot lead.

The plan deliberately slows down. Days 2, 4, and 6 all gate on either "she replied" or "no reply" rather than firing on schedule. The plan also caps at one outbound per day. The frequency-cap rules (max 1 outbound per 24h, 4 per 7d rolling) are satisfied with room to spare.

## Why The Venue Ask Is Lower Priority Than The Quote-Concern Ask

The CRM flag `NEEDS VENUE NAME` is real, but at quote stage it's a *finalization* issue, not a *progression* issue. Andre can sign a deal-in-principle without the venue name; he just can't fully confirm setup logistics until he has it.

By contrast, *whatever's keeping Bruna from saying yes on the quote* is the real progression issue. If the quote is the blocker, knowing the venue doesn't help. If the venue is the blocker, asking the quote question still surfaces it ("the venue's not locked yet, so I'm waiting").

So the plan's primary ask is "is the quote in the right direction?" and the venue ask comes second (Day 4) as a finalization step.

## Why The Plan Reschedules The Phone Attempt

The May 4 call at 22:43 UTC is 6:43 PM Framingham time — past dinner hour, often past adult-decision-window. The May 3 calls at 16:09 + 16:10 (12:09 PM local) might have been better timed but were back-to-back within 22 seconds, which is auto-dialer behavior.

Day 5's task explicitly directs Andre to call once at a different time of day (mid-morning or early afternoon) and to leave a real voicemail. This is the same correction made in Cassandra's, Thelma's, and Kyle's plans. It keeps appearing because the auto-dialer pattern keeps appearing.

## Why The "Date Won = May 23" Field Is Ignored

The opportunity's `date_won` field is set to May 23, but the status remains `🔥 05A. Quote sent` and there is no signed agreement, no deposit, no won-stage transition. That's a CRM data inconsistency — `date_won` was probably stamped automatically from the event date. Treating it as a real won signal would lead to calling Bruna a customer when she is actually at quote stage and has not committed.

The plan ignores this field and treats the opportunity as exactly what its status says: quote sent, awaiting yes/no/revise.

## The Deal Theory

Bruna is in one of these states:

1. **The quote is close, she just needs to confirm with someone.** Day 1's question gives her room to say "yes, just waiting on partner." Day 4's email gives her something to forward.
2. **The quote is too high, but she doesn't want to negotiate.** Day 1's "what would need to be true" wording gives her permission to say a number without it feeling adversarial.
3. **The scope confused her** (bar service + 50 people can mean a lot of different things). Day 2's clarification path handles this.
4. **She's still locking the venue and won't commit until that's done.** Day 1 surfaces this; Day 4's email turns it into an explicit ask.
5. **She's already booked someone else but feels bad telling us.** Day 6's permission-to-step-back gives her clean exit.

The plan covers all five states with one consistent first move: ask what would need to be true.

## Success Definition

The plan succeeds in any of three outcomes: (a) Bruna agrees to sign + deposit on the existing quote, (b) Bruna names a specific change, Andre revises, signature follows within the 7-day cycle, or (c) Bruna says no clearly and the opportunity closes lost without further attention drain.

The undesirable outcome is more of the May 2-5 pattern — silence on her side, more outbound on ours, no resolution. The plan is built to avoid that by gating on engagement signals.

## Open Threads For Sweep Re-Run

- Both inbound SMS replies (May 2 and May 5) need their actual content captured. Without them, Day 1's task is "Andre reads them in Close manually," but ideally the next sweep pulls SMS body text into the comm files so the plan's drafts can cite specific lines.
- The notes from May 2, 3, 4, and 5 may contain context about call attempts, tasting feedback, or pricing reasoning that didn't make it into the visible substrate. Worth scanning when reading the SMS thread.
- The `date_won` data inconsistency in the opportunity should probably be cleaned up in CRM hygiene, separately from this plan.
