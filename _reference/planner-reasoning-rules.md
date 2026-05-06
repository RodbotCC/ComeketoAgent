# Lead Planner Reasoning Rules

This sheet is the “if this, then that” layer for Comeketo Agent’s seven-day plan generation.

The sales playbook tells the agent how Comeketo should sound. This document tells the planner what to infer from the lead substrate so it does not create dumb-but-plausible actions.

Primary objective: get the lead onto a specific phone call with Andre.

## Core Rule

Never write a plan around a channel, stage, or fact that is not actually available in the lead folder.

The planner must distinguish:

- **known fact**: explicitly present in raw Close data, comms, AI docs, or operator override
- **reasonable inference**: implied by multiple facts, but not directly confirmed
- **missing blocker**: required before a channel/action can be used
- **stop condition**: something that should pause, reroute, or kill the plan

If a channel or action is blocked, the plan should first collect the blocker.

## Channel Rules

### If There Is No Phone Number

Then do not create SMS actions and do not create direct call tasks as if they are executable.

Correct action:

- Use email or the known source channel.
- Ask for the best phone number.
- If there is a live-chat/Crisp/source link, create an operator task to check whether a phone number exists there.

Bad action:

- “Send SMS tomorrow.”
- “Call the lead on Day 1.”
- “Text them two time windows.”

Better:

> “Reply with the best phone number and Andre can call you for a quick 10-minute fit check.”

### If Email Is The Only Confirmed Channel

Then the plan should be email-first until the lead gives another channel.

Correct action:

- Use short emails that ask one concrete question.
- Avoid pretending we have SMS or call access.
- Use email opens as engagement signals, not as consent to intensify blindly.

### If The Lead Opened An Email But Did Not Reply

Then the lead has engaged with the content, but has not accepted the next step.

Correct interpretation:

- Interest exists.
- Friction or uncertainty remains.
- The next message should be smaller and more answerable.

Correct action:

- Ask one or two concrete questions.
- Reference what they opened only indirectly.
- Do not send another broad PDF/info dump.

Bad action:

- “Here is more info.”
- “Just checking in.”
- “Are you ready to book?”

Better:

> “Is the quote direction close, or were you picturing something lighter?”

### If There Are Multiple Outbound Messages And No Inbound Reply

Then the planner should reduce pressure and reduce complexity.

Correct interpretation:

- We may already be over-talking.
- The next move should be a concise recovery prompt.
- Do not add another long educational touch.

Correct action:

- Ask a binary fit question.
- Ask whether to close the loop.
- Give permission to say no.

Bad action:

- More menus, packages, tasting info, or brand explanation.

## Missing Data Rules

### If Venue / Address Is Missing

Then the plan should treat venue/address as a top blocker.

Correct interpretation:

- Quote, delivery, staffing, setup, and call usefulness are all limited.
- The next useful step is not “sell harder”; it is “collect logistics.”

Correct action:

- Ask for venue/address or at least city.
- Ask for food-ready/service time.
- Tie the ask to Andre being able to give a reliable recommendation.

Better:

> “What venue/address and food-ready time should Andre plan around?”

### If Guest Count Is Missing

Then do not write a plan that quotes, recommends service level, or pushes deposit.

Correct action:

- Ask for a rough count or range.
- Offer range-based framing if appropriate: “closer to 40, 75, or 125?”

### If Event Date Is Missing

Then the plan should first identify timeline.

Correct action:

- Ask the date or month.
- If the lead says “next Saturday” or “this weekend,” resolve that against the lead-created date and write the absolute date in the plan.

### If Event Date Is Soon

Then urgency is real, but pressure still needs to be useful.

Correct interpretation:

- The plan should move faster.
- It should ask for logistics and call scheduling sooner.
- It should avoid slow nurture or tasting-first sequences unless tasting is explicitly requested and possible.

Correct action:

- “Because this is coming up fast, the cleanest next step is a 10-minute call.”
- Ask for the few details needed to make that call useful.

Bad action:

- “Would you like to explore our services?”
- “Here are more menu options.”

### If Budget Is Missing

Then do not assume price sensitivity, but prepare for it.

Correct action:

- Ask what matters most: staying within a range, maximizing variety, or making setup easy.
- If a quote was already sent, ask whether the direction is close before defending price.

### If Dietary Restrictions Are Missing

Then treat them as secondary unless the event is already near execution or the lead mentions them.

Correct action:

- Ask after venue/time/service format, or include it as a small add-on question.

Bad action:

- Let dietary questions replace the call objective.

## Stage Rules

### If Status Is Maybe / Prospect

Then do not assume commitment.

Correct action:

- Plan should qualify and schedule a call.
- Do not write “lock deposit” as the main next move unless the lead has explicitly confirmed fit and logistics.

### If No Tasting Is Booked

Then do not write “follow up after tasting” or “confirm tasting details.”

Correct action:

- Only mention tasting if the lead asked for it, the timeline supports it, or the sales playbook requires it for that type of lead.
- For tight events, prioritize call and logistics over tasting.

### If BEO / Agreement / Deposit Is Not Present

Then do not speak as if the event is won.

Correct action:

- Keep plan focused on qualification, scheduling, and next commitment.

### If The Lead Has A Terminal Status

Then do not generate a seven-day sales plan.

Correct action:

- Archive or mark complete.
- If terminal status conflicts with fresh inbound communication, surface for operator review.

## Content Rules

### If Broad Info Has Already Been Sent

Then do not send more broad info.

Correct interpretation:

- The lead already has menus/packages/service info.
- The planner should move to fit, blockers, or decision criteria.

Correct action:

- Reference the specific thing already sent and ask what is blocking the next step.

Bad action:

- “Here are our packages.”
- “Here is our website.”
- “Here is how catering works.”

### If A Quote Was Already Sent

Then the next plan should ask whether the quote direction is close.

Correct action:

- Ask whether the quote matches the event they imagined.
- Ask whether they want a lighter/heavier package.
- Ask what would need to change for it to fit.

Bad action:

- “Send payment now” if no response or logistics are missing.
- Defend the quote.

Better:

> “When you said mostly appetizers with some meat and rice, were you picturing a lighter appetizer-heavy menu or closer to a full meal?”

### If The Quote Seems Potentially Misaligned With The Ask

Then the plan should create a fit-check question before pushing the quote.

Example:

- Lead asked for “mainly appetizers”
- Quote was built around Full Churrasco / Deluxe Churrasco

Correct interpretation:

- The quote may feel heavier or more expensive than the lead expected.

Correct action:

- Ask whether they wanted a lighter appetizer-heavy menu or full-meal feel.

### If The Lead Asked For “Information”

Then do not satisfy that forever.

Correct action:

- Send the minimum useful information once.
- Next touch asks a diagnostic question tied to their event.

## NEPQ Rules

### If The Lead Gave Specific Language

Then reuse their words.

Correct action:

- “mainly Brazilian appetizers”
- “some meat and rice”
- “party next Saturday”

Bad action:

- Generic catering phrasing that ignores their exact request.

### If The Lead Has Not Replied

Then the NEPQ question should be low-friction.

Correct action:

- one concrete question
- binary choice
- multiple-choice response
- “am I reading that right?”

Bad action:

- 5-question discovery dump.

### If The Lead Is Comparing Options

Then the plan should make Comeketo the simplest path to clarity.

Correct action:

- “Andre can tell you plainly what is doable.”
- “The call saves you from more PDFs.”
- “Reply with the address/time/phone and he can tighten it fast.”

## Timing Rules

### If It Is Outside SMS Hours

Then do not recommend SMS for immediate send.

Correct action:

- Use email, or schedule SMS for the next valid window.

### If The Event Is Within 7-10 Days

Then shorten the discovery cycle.

Correct action:

- Day 1 asks for blockers and phone.
- Day 2 asks fit/service style.
- Day 3 asks quote alignment.
- Day 4 creates a respectful yes/no branch.

### If The Event Has Already Passed

Then do not generate normal pre-event outreach.

Correct action:

- Check if this is a stale record, post-event follow-up, or data error.
- Surface for operator review.

## Operator Task Rules

### If Close Has A Source Link Like Crisp Chat

Then use it as a possible missing-context source.

Correct action:

- Create an operator task to inspect source chat for phone/address/details before abandoning the lead.

### If A Required Action Cannot Be Automated

Then write it as an operator task, not fake automation.

Examples:

- “Check Crisp for phone number.”
- “Call only if phone is found.”
- “Manually verify venue constraints.”

## Approval Rules

### If The First Action Is Customer-Facing

Then mark it `needs_review` unless the operator already approved it.

### If The Action Uses Unverified Inference

Then mark it `not_ready` or include an operator note.

### If The Plan Contains Pricing, Deposit, Or Contract Language

Then require approval.

## Stop / Pause Rules

### If The Lead Replies With A Phone Number

Then pause the cadence and create a same-day call task.

### If The Lead Replies With Venue But No Phone

Then ask for phone and offer two call windows.

### If The Lead Says “Too Expensive”

Then do not defend price.

Correct action:

- Ask if they wanted lighter appetizer-heavy, simpler drop-off, or a specific target range.

### If The Lead Says They Only Want Drop-Off

Then stop pushing staffed/churrasco language.

Correct action:

- Route toward tray/drop-off feasibility and delivery logistics.

### If The Lead Says They Booked Elsewhere / Not Interested

Then stop active outreach and mark appropriately.

### If The Lead Schedules A Call

Then stop the seven-day plan. The plan achieved its objective.

## Common Situation Matrix

| Situation | Correct Interpretation | Correct Planner Move |
|---|---|---|
| No phone number | SMS/call not executable | Email first; ask for phone |
| Email opened, no reply | Interest without commitment | Ask a smaller question |
| Many outbounds, no inbound | We may be over-talking | Reduce pressure; ask yes/no or fit question |
| Venue missing | Logistics blocker | Ask venue/address + food-ready time |
| Event soon | Urgency is real | Move quickly to call/logistics |
| Quote sent, no reply | Possible mismatch or delay | Ask if quote direction is close |
| Asked for apps, quote is heavy | Potential service mismatch | Ask lighter apps vs full-meal feel |
| No guest count | Cannot quote reliably | Ask count/range first |
| Tasting not requested and event soon | Tasting may distract | Prioritize call, not tasting |
| Lead says too expensive | Price objection, not rejection | Ask what needs to change |
| Lead replies with phone | Objective nearly achieved | Create call task; pause cadence |
| Lead replies with stop/no | Terminal signal | Stop outreach |
| Lead has source chat link | Possible hidden details | Operator task to inspect source |
| Existing broad info sent | Education layer done | Move to decision criteria |
| Status still Prospect/Maybe | Not committed | Qualify and schedule call |
| Event passed | Normal plan invalid | Surface for review |

## Final Planner Test

Before writing any seven-day plan, answer:

1. What is the next missing fact that blocks a call with Andre?
2. What channel is actually available?
3. Has broad information already been sent?
4. Has the lead replied, opened, clicked, called, or gone silent?
5. Is the event timing urgent enough to skip slow nurture?
6. What would make the next message easy to answer?
7. What action should stop the plan immediately?

If the plan does not answer those questions, it is not ready.
