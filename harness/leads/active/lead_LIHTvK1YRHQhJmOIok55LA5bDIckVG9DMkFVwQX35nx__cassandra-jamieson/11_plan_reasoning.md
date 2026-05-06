# Cassandra Jamieson — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Cassandra Jamieson, status `🔘 Maybe`, primary_email `cassandrajamieson4@gmail.com`, primary_phone `+1 617-987-5638`, 16 total activities (3 emails, 7 SMS, 2 calls, 3 notes, 2 threads), 0 WhatsApp.
- `01_raw_lead.json` / opportunity record: event date `2026-05-30 15:00 UTC`, guest count `25`, event type `Graduation party`, expected value `$15,760`, confidence `20%`, custom field `NEEDS VENUE NAME`, source = `Facebook paid lead ads` (campaign `[CATER] LF EVERGREEN - QUOTE`, creative `RODS WEDDING & FACELESS`).
- `02_continuity.jsonl`: lead created 2026-05-05 17:26; cluster of outbound activity 17:26-17:48 (welcome email, 2 outbound calls back-to-back at 17:43, 4+ outbound SMS); follow-up email at 18:50 from Rhonna Ricafort.
- `03_comms_interpreted.md`: confirms Cassandra opened the welcome email twice within ~1 minute and replied via SMS three times — at 17:29, 17:45, 17:48. Reply text not captured in raw substrate.
- `06_discovery.md`: identifies venue as the most blocking unknown; everything else (date, headcount, event type) is known.
- `07_andre_alerts.md`: explicit warning — *"Don't increase call/SMS volume again without reading the inbound replies (could look pushy or irrelevant)"*. Also flags decision-maker ambiguity (only Cassandra is on the contact, unclear if she's the buyer or the info-gatherer).
- `08_client_ledger.md`: confirms multiple outbound touches with limited observable engagement; Day-1 call task already scheduled for 2026-05-07 13:00 (not yet completed).

## Core Read

Cassandra is the inverse of a typical "no-reply" lead in two important ways: **she has a phone number on file**, and **she replied via SMS three times within 25 minutes of landing**. That makes her materially different from a lead like Sarah Broderick, who never replied at all.

The blocker is not Cassandra's silence — it is that the system blasted outreach (email + 2 calls + cluster of SMS) without anyone on Andre's side reading her actual SMS replies. The next message we send must be grounded in what she said back, not in another generic "ready to help!" template.

A second blocker is the missing venue name, explicitly flagged on the opportunity. Without that, no quote is operationally real.

## Why The Plan Starts With An Operator Task, Not An Automated Send

Sarah's plan started with an automated email because Sarah had not engaged at all — there was nothing to read. Cassandra has engaged. Three SMS replies sit in the Close thread that Andre has not been routed to read. If Day 1 fired off another scripted email or SMS, it would either repeat what's already been said (looking robotic) or contradict what she actually asked (looking like nobody's listening).

So Day 1 is explicitly an **operator task**, not an outbound channel send. Andre opens the SMS thread, reads the three inbound messages, and replies to her last message in human voice. Only after that does the cadence shift back to a structured plan.

This directly satisfies the rule in `07_andre_alerts.md`: *"Don't increase call/SMS volume again without reading the inbound replies."*

## Why The Plan Is SMS-First, Not Email-First

For Sarah, email was the only confirmed channel because she had no phone. For Cassandra:

- Phone is on file (`+1 617-987-5638`).
- She replied **via SMS** three times. Email opens twice, but no email reply.
- That signals SMS as her preferred channel.

So the plan uses SMS for the early high-engagement moves (Day 1 reply, Day 2 call windows, Day 3 NEPQ fit question) and only switches to email on Day 4 for the forwardable recap and Day 7 for the close-the-loop message.

This is the planner-reasoning-rules principle: don't write a plan around a channel the lead hasn't actually engaged on.

## Why The First Ask Is Venue, Not A Tasting

The CRM explicitly flags `NEEDS VENUE NAME`. The event is May 30 — about 24 days out from the sweep, so not panic-urgent, but enough that we want venue locked before mid-cycle. Without venue, the $15,760 ballpark is a guess; service radius and setup are unknowns.

Tasting is not the goal here for two reasons:
1. Cassandra never asked for one.
2. A graduation party for 25 is a smaller-format event where tasting overhead may not match the budget. Pushing tasting could feel like over-selling for the size of the event.

The Day 3 NEPQ question (drop-off vs. Brazilian BBQ) is a tasting-equivalent — it asks her to articulate the experience she wants without forcing a commitment to a tasting visit.

## Why The Plan Reschedules The Phone Attempt

The two call attempts on May 5 at 17:43 were back-to-back within seconds of each other. That's an urgency move from our side, not a connection strategy. People at 5:43 PM on a weekday are commuting, picking up kids, in dinner mode — not a high-pickup-rate window.

Day 5's task explicitly directs Andre to attempt at a different time of day (mid-morning or early afternoon) and to leave a real voicemail. Single attempt. Different conditions. Better odds.

## Why The Email Recap Is On Day 4

Decision-maker ambiguity is flagged in `07_andre_alerts.md`. We don't know if Cassandra is the buyer or just gathering info for someone else (a parent paying, a partner organizing). The Day 4 email is intentionally structured as a forwardable summary — date, headcount, format options, what's still needed from her side. If she's not the sole decision-maker, this email gives her something to share without having to retype everything.

Day 4 is also positioned after the SMS-heavy early moves so it doesn't compete with them. By Day 4, if SMS hasn't worked, email-as-recap is a sensible escalation.

## Why The Plan Avoids Pushing Churrasco

The original Facebook ad creative referenced "Brazilian BBQ Option" video. We don't know if Cassandra opened the welcome email because she wanted Brazilian BBQ specifically, or because she wanted catering for a graduation party and the welcome email happened to mention churrasco.

Day 3 directly tests this with the drop-off vs. Brazilian-BBQ NEPQ question. Until she signals one way, the plan does not double down on pushing churrasco — that would risk locking the conversation around a format she may not actually want.

## The Deal Theory

Cassandra is responsive but not yet qualified. Three plausible states:

1. She replied with venue or details we haven't seen yet, and Andre just hasn't read the SMS thread. Day 1 closes this gap.
2. She asked clarifying questions in her SMS replies that the system never answered. Day 1 closes this gap too.
3. She lost interest after the heavy outbound cluster (5+ touches in 25 minutes) felt like spam. Day 1's slower, human-toned reply opens the door for her to re-engage.

The plan is built so all three states route to the same Day 1 move: read what she actually said, reply to her last message, get the venue.

## Success Definition

The plan succeeds when Cassandra confirms a venue and a phone-call window with Andre. It does not need to close the catering sale — the app's job is to get her into a real conversation with Andre. Everything after the call is Andre's job.

## Open Threads For Sweep Re-Run

- The actual text of Cassandra's three inbound SMS messages is not yet in our captured raw substrate. A re-sweep that pulls SMS body content (or a manual paste of the messages into `10_operator_overrides.md`) would significantly sharpen Day 1's reply draft.
- If the sweeper begins capturing WhatsApp activities and Cassandra has any, the channel-priority section above should be revisited.
