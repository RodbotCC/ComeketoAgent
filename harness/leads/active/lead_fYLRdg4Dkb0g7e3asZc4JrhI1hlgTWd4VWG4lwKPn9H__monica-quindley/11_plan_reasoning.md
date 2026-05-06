# Monica Quindley — Plan Reasoning

This document explains why the seven-day plan is structured the way it is, based only on the available lead folder data.

## Evidence Used

- `00_meta.json`: Monica Quindley, status `🔥 Definitely` (the highest non-won status in the pipeline), primary_email `quindley95@gmail.com`, primary_phone `+1 508-944-2944`, **40 total activities** (14 emails, 12 SMS, 2 calls, 2 meetings, 2 notes, 1 task, 10 threads). The activity count alone signals this is the most-engaged lead in the active set.
- `01_raw_lead.json` + opportunity record: source = Facebook Lead Form (`Comeketo Crown+` campaign — premium tier), opportunity status `🔥 03. Booked for Tasting`, value `$5,400`, confidence `20%`, `date_won = 2027-06-12` (this is the daughter's wedding date), cadence step `-05. 📅 Event is far away (12mo+)`, ZIP `02360`.
- `02_continuity.jsonl`: Spans April 19 to May 5 — almost 3 weeks of activity. Multiple inbound replies from Monica (3 SMS on April 19 and 27, 2 emails on May 5). Two meeting events on April 27 (one titled `Monica Quindley PAX 4 Tasting CANCELLED FOR NOW`, the other appears to be the original tasting calendar invite for May 17).
- `comms/email_2026-05-05_6low361q.json` (inbound from Monica, May 4 night): "we will not be able to attend this weekend. My mom fell and broke her arm and will have to take care of her. Also, my daughter's fiancé got mandated to work this weekend."
- `comms/email_2026-05-05_avlvafhl.json` (inbound from Monica, May 5 evening): "I am not going to be able to make 31st. I will be out of town. **I think I'm gonna have to hold off on the tasting for now and we'll figure this out when I get back. If you wouldn't mind just refunding the tasting fee, that would be good.**"
- Andre's reply at May 5 morning bumping the tasting to May 31 was kindly worded ("Hope your mom gets better soon :)") — that's the right tone.
- After Monica's second cancellation/refund email at 21:50 UTC, our system fired two more outbound emails at 22:06 and 22:41 UTC. **Those were almost certainly inappropriate** given she had just asked to pause and refund.

## Core Read

This is the only lead in the active set where the right move is **less work, not more**. Monica is in a family crisis. Her explicit asks are:

1. Refund the tasting fee.
2. Hold off on the tasting.
3. "We'll figure this out when I get back."

There are zero questions to ask her right now. There are zero pieces of information we need to extract. The opportunity is **not at risk** — she did not say she's going with another caterer, she did not say she changed her mind, she did not push back on price. She said *life is hard right now, give me space*.

The risk to this deal is not Monica losing interest. The risk is Comeketo making her feel chased while her mom is in the hospital. That's the trust break that loses a $5,400 wedding catering contract for June 2027.

The plan inverts the usual cycle structure: most days are no-touch days. Day 1 is the only customer-facing email. Day 6 is an optional "thinking of you" SMS only if appropriate. Everything else is internal.

## Why The Plan Refunds Without Negotiation

Monica asked for the refund. She gave a perfectly legitimate reason. She is the highest-status lead in the active book. There is exactly one correct answer to a refund request from a customer in this situation: yes, immediately, with no friction.

Treating the refund as a recovery moment ("we'd love to keep the tasting on file as a credit toward...") is a classic mistake. It signals that Comeketo would prefer to hold her money than honor her request. That perception, even subtly, would damage the relationship.

Day 1 of the plan explicitly says: process the refund **before** sending the email. The email confirms what's already in motion. This is a small operational detail with a large trust implication — if Andre says "I'll refund it" and then the refund stalls in the back office for a week, Monica's trust drops. If Andre says "I refunded it this morning," there's no gap.

## Why The Plan Mostly Says "Do Nothing"

For Sarah, Cassandra, Kyle, Bruna, Thelma, Miosoty — every plan I've written for the active set so far has been some flavor of "engage thoughtfully across 7 days." Monica's plan is mostly silence.

The reason is the explicit ask. Monica did not just go quiet — she **wrote a clear sentence**: "I think I'm gonna have to hold off on the tasting for now and we'll figure this out when I get back." That sentence is a contract. She is telling us how she wants to be treated. The right move is to honor that contract literally — pause, wait, let her come back.

If we ignore that sentence and run a "stay top of mind" cadence anyway, we've broken the contract she set. The cost is the relationship.

## Why The Day 1 Email Is Personally-Written, Not Templated

Templates work fine for early-stage discovery and quote-stage follow-ups. They do not work for "your mom is in the hospital." Monica has been in our system for almost three weeks; she knows what our templates feel like by now. A template at this moment would land like a corporate response card.

Andre writing the Day 1 email himself, in his own words, is the only version that earns the trust this moment requires. The template provided in the plan is a *starting point* — Andre should rewrite it in his actual voice, mention something specific that proves he read both her emails (the daughter's fiancé being mandated to work, the out-of-town trip, the mom's arm).

## Why The Plan Disables Sequences Explicitly On Day 2

The two outbound emails on May 5 at 22:06 and 22:41 — fired *after* Monica had explicitly asked to pause — prove that the sequence engine is not currently respecting her cancellation. That's a system-level problem worth flagging, but for *this lead specifically*, the fix is to manually disable her sequence enrollments on Day 2 so it doesn't happen again.

Even if Day 1's email is perfect, sending another automated "just checking in" on day 4 would re-break the trust we just rebuilt. The system has to be muted manually for Monica until *she* re-initiates contact.

## Why The Day 6 SMS Is Optional, Not Required

The instinct in catering sales is: "stay top of mind, send a touch every few days." That instinct is wrong here.

Day 6 is intentionally optional and gated on Andre's read of Monica's tone. The "thinking of you" SMS is a lovely human gesture *if* the relationship before this had any warmth. If Monica's emails read curt or cold, the SMS would feel performative. If they read tender (which the May 4 email does — "So sorry"), the SMS works.

The plan defaults to skipping Day 6 unless Andre specifically decides it's right.

## Why The Plan Schedules A 60-Day Follow-Up, Not A 7-Day One

The wedding is in June 2027 — 13+ months from now. We have *enormous* runway. Setting a 7-day "did she come back?" reminder would create artificial urgency on our side that reflects nothing about her actual timeline.

The 60-day reminder (~July 6, 2026) is calibrated to a realistic guess of when her family situation might have settled and when she might be ready to think about the wedding again. Even that is a guess — Monica may come back sooner, or much later. The reminder is just a forcing function so she doesn't fall completely off the radar; it is not a deadline.

If Monica reaches out before July 6, that pre-empts the reminder and the conversation picks back up wherever she is.

## The Deal Theory

Monica's deal is in one of these states:

1. **Family crisis is genuine and temporary.** Mom recovers, daughter's fiancé schedule normalizes, Monica gets back from her trip — within 4-6 weeks she's mentally able to plan again. The right move is patience, then a warm pickup when she signals she's ready. **High probability — this is what most family crises look like.**
2. **Family crisis is genuine and longer-term.** Mom's injury leads to more complications, Monica is in primary-caregiver mode for months. She doesn't return to wedding planning until late summer. The right move is more patience. The 60-day reminder lets us check gently and pull back if the answer is "still not ready."
3. **The "tasting" cancellation is a soft signal she's pulling back on Comeketo specifically.** Maybe she found another caterer, maybe pricing was higher than she expected, maybe she just doesn't feel the spark. The refund-then-pause approach respects this without forcing the conversation. If she comes back, great. If she doesn't, we lost the deal as gracefully as it can be lost.
4. **Worst case — mom's situation deteriorates.** This is real for falls in older adults. The plan flags this in stop conditions. If anything goes that direction, our role is brief, human, and respectful — not catering-related.

The plan handles all four states with the same restraint. Restraint is the answer in all of them.

## Success Definition

The plan succeeds in any of these outcomes:

1. Refund processes cleanly, Day 1 email lands, Monica feels heard and respected, comes back in 4-12 weeks ready to reschedule the tasting.
2. Monica replies to Day 1 with a "thank you" and we keep the door open without further action until she initiates.
3. The 60-day check-in (July 6) finds her ready to pick the wedding planning back up.
4. Monica chooses another caterer for reasons unrelated to how this moment was handled, and we lose the deal cleanly without having damaged her family situation in the process.

The undesirable outcome is the system continuing to fire automated outbound at her, and Monica unsubscribing or marking us as spam — costing not just this $5,400 deal but any future word-of-mouth referral she would otherwise have given. The plan is built specifically to prevent that.

## Open Threads For Sweep Re-Run

- The two outbound emails on May 5 at 22:06 and 22:41 (post-cancellation) need their content read. If they were generic sequence templates that ignored her request, that's a system bug worth flagging across the org. If they happened to be human-written and appropriate, the timing alone still made them risky.
- The April 27 meeting record titled `Monica Quindley PAX 4 Tasting CANCELLED FOR NOW` deserves a closer read — it indicates the system already knows the tasting was cancelled, but the opportunity status hasn't moved. CRM hygiene gap.
- Whoever processes the refund should paste a confirmation note into `10_operator_overrides.md` for this lead so the next plan iteration knows the refund cleared.
