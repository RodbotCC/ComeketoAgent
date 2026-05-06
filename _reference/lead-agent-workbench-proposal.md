# Lead Agent Workbench Proposal

## The Move

The lead experience should stop being a set of separate subtab pages and become one chat-first workbench:

```text
left widget dock  |  lead-aware delegation chat  |  right widget dock
```

The current Delegations page is already the strongest pattern in the app. It has:

- a lead-scoped chat session
- a left rail of quick lead actions
- a right rail for plan/context widgets
- pane controls for hiding/widening docks
- chat API support for `lead_id`
- tool-result widgets that can already render structured data

So the clean architecture is not “make six better subtabs.” It is:

> Make every meaningful lead subtab become a dockable widget around the agent.

The agent should always be the center of the lead page. The docs, plan, profile, comms, enrichment, heartbeat, and proposal queue become instruments the agent can see, reason over, open, pin, collapse, and act on.

## Why This Is Better

This removes the bloat because the user no longer has to ask:

- Which tab am I in?
- Is this stale?
- Do I refresh raw here or AI there?
- Where do I go to fix the plan?
- Does the agent know what I’m looking at?

Instead, the user asks one question:

> What do I want the agent to help me do with this lead right now?

The answer happens in chat, with the relevant widgets open beside it.

## Product Principle

Comeketo Agent is not replacing Close CRM.

The lead workbench exists for one job:

> Understand the changing state of the lead well enough to get Andre onto a scheduled phone call at a concrete time the lead has agreed to.

Everything else is supporting evidence.

That means every widget should answer one of these questions:

1. What do we know?
2. What changed?
3. What is the current buyer state?
4. What should we ask next?
5. What is the plan?
6. What can safely go out?
7. What needs Andre/Jake approval?
8. Are we closer to a scheduled call?

## New Page Model

### Current

```text
/lead/[id]/box
/lead/[id]/discovery
/lead/[id]
/lead/[id]/intake
/lead/[id]/heartbeat
/chat?lead=[id]
```

### Target

```text
/lead/[id]             -> lead agent workbench
/chat?lead=[id]        -> redirects or aliases to /lead/[id]
/lead/[id]/box         -> optional deep-link opens Box widget
/lead/[id]/discovery   -> optional deep-link opens AI Profile widget
/lead/[id]/plan        -> optional deep-link opens Plan widget
```

The old routes can survive as compatibility redirects for a while, but the UX should make the workbench the canonical lead page.

## Workbench Layout

### Center

Lead-aware delegation chat.

The chat is always scoped to the selected lead. If no lead is selected, it becomes global Andre mode.

### Left Dock

The left dock is for navigation and actions.

Recommended widgets:

- Lead Scope Card
  - lead name
  - status
  - owner
  - last checked
  - gate badge
  - Close link

- Workflow Launcher
  - Refresh raw
  - Refresh AI profile
  - Generate/regenerate plan
  - Run full flow: raw -> AI -> plan

- Quick Delegations
  - What’s the state?
  - Draft today’s actions
  - Latest comms
  - Generate/refine plan
  - What changed since last check?

- Widget Switcher
  - Box
  - AI Profile
  - Plan
  - Proposals
  - Ledger
  - Enrichment
  - Heartbeat

### Right Dock

The right dock is for evidence and work surfaces.

Recommended widgets:

- Plan Widget
  - seven-day plan
  - day cards
  - approval buttons
  - draft preview
  - stale warning

- AI Profile Widget
  - snapshot
  - NEPQ openers
  - buyer state
  - risks
  - readiness/clarity/restraint

- Comms Widget
  - latest inbound
  - latest outbound
  - call transcript snippets
  - SMS/email timeline
  - “what changed” marker

- Raw Box Widget
  - `00_meta.json`
  - `01_raw_lead.json`
  - `02_continuity.jsonl`
  - raw comm refs

- Client Ledger Widget
  - deal continuity
  - state transitions
  - lifecycle notes
  - latest interpretation

- Proposal Review Widget
  - plan days needing review
  - approved/sent/cancelled counts
  - approve/kick-back controls

- Heartbeat Widget
  - last run
  - actions fired
  - actions skipped
  - guardrail hits
  - stale plan detection

## “Agent Sees What Is On Screen”

This is the crucial piece.

Every widget should expose a compact context contract:

```ts
type WorkbenchContextCard = {
  widget_id: string;
  title: string;
  lead_id: string;
  priority: "primary" | "supporting" | "background";
  summary: string;
  facts: Array<{ label: string; value: string }>;
  warnings: string[];
  open_questions: string[];
  source_refs: Array<{
    kind: "file" | "activity" | "plan" | "heartbeat" | "close";
    ref: string;
  }>;
};
```

When the user sends a chat message, the client sends:

```ts
{
  lead_id,
  visible_widgets: WorkbenchContextCard[],
  focused_widget_id,
  selected_text_or_item,
  user_message
}
```

The chat API then prepends a screen-context block before the normal tool instructions:

```text
The operator is looking at these lead widgets:

1. Plan Widget, primary
   Summary: Day 1 needs review. Goal is lock a specific Andre call window.
   Warnings: Plan is stale vs latest raw box.
   Open questions: Has the lead agreed to either proposed time?

2. Comms Widget, supporting
   Summary: Last inbound SMS asked for package link.
   Source refs: comms/sms_...

Use this screen context as UI context, not as authoritative truth.
If a decision depends on exact facts, call the appropriate tool/read the raw box.
```

This gives the agent awareness of what Jake/Andre is seeing without pretending the UI summary is the source of truth.

## Widget Registry

Create a registry instead of hardcoding subtabs:

```ts
type LeadWidgetId =
  | "scope"
  | "workflow"
  | "quick_delegations"
  | "raw_box"
  | "ai_profile"
  | "plan"
  | "proposal_review"
  | "comms"
  | "ledger"
  | "enrichment"
  | "heartbeat";

type LeadWidgetDefinition = {
  id: LeadWidgetId;
  label: string;
  defaultDock: "left" | "right";
  defaultMode: "open" | "collapsed" | "hidden";
  requires: Array<"raw" | "ai" | "plan" | "heartbeat">;
  load: (leadId: string) => Promise<unknown>;
  render: React.ComponentType<LeadWidgetProps>;
  getContextCard: (data: unknown) => WorkbenchContextCard;
};
```

This lets us add widgets without adding new pages.

## Route Strategy

### Phase 1: Keep Routes, Add Workbench Links

No scary rewrite.

- Keep current pages working.
- Make `/chat?lead=id` the best experience.
- Add buttons from every subtab: “Open in Workbench.”
- Add URL params to open widgets:

```text
/chat?lead=lead_x&left=workflow&right=plan,ai_profile
```

### Phase 2: Convert Existing Subtabs Into Widgets

Extract the meaningful pieces:

- `ClientBoxActions` -> Workflow Widget
- `box/page.tsx` doc list -> Raw Box Widget
- `discovery/page.tsx` score/profile/pipeline -> AI Profile Widget
- `PlanSection` / `PlanDayStrip` -> Plan Widget
- `heartbeat/page.tsx` -> Heartbeat Widget
- `intake/page.tsx` -> Enrichment Widget
- proposal day approval UI -> Proposal Review Widget

Do not duplicate behavior. Move shared logic into widget components.

### Phase 3: Make `/lead/[id]` The Workbench

Once widgets are extracted:

- `/lead/[id]` renders the workbench.
- Top lead subtabs become widget shortcuts, not page tabs.
- Clicking “AI Profile” opens the AI Profile widget in the right dock.
- Clicking “Client Box” opens Workflow + Raw Box widgets.
- Clicking “Seven-Day Plan” opens Plan + Proposal Review widgets.

### Phase 4: Retire Subtab Pages

When the workbench is stable:

- `/lead/[id]/box` redirects to `/lead/[id]?right=raw_box`
- `/lead/[id]/discovery` redirects to `/lead/[id]?right=ai_profile`
- `/lead/[id]/heartbeat` redirects to `/lead/[id]?right=heartbeat`
- `/lead/[id]/intake` redirects to `/lead/[id]?right=enrichment`

## Default Widget Presets

### “State”

For asking what is going on.

```text
left:  scope, quick_delegations
right: ai_profile, comms, ledger
```

### “Plan”

For generating/refining the seven-day cycle.

```text
left:  scope, workflow
right: plan, ai_profile, comms
```

### “Review”

For approving what goes out.

```text
left:  scope, quick_delegations
right: proposal_review, plan
```

### “Raw”

For auditing exact substrate.

```text
left:  workflow
right: raw_box, comms, ledger
```

### “Heartbeat”

For seeing what fired/held.

```text
left:  scope
right: heartbeat, plan, ledger
```

## What Each Existing Lead Subtab Becomes

| Current Page | Target Widget | Notes |
|---|---|---|
| Client Box | Raw Box + Workflow | Raw files, sweep buttons, exact comm refs |
| AI Profile | AI Profile | NEPQ scoring, buyer state, pipeline-to-call |
| Seven-Day Plan | Plan + Proposal Review | Plan editing, day approvals, stale warnings |
| Delegations | Center Chat | Becomes the actual lead page center |
| Enrichment | Enrichment | Operator-added facts/assets |
| Heartbeat | Heartbeat | Execution audit and guardrail history |

## Chat Tool Changes

The chat API already has lead mode and direct Close tools.

Needed additions:

1. Accept `visible_widgets` in `/api/chat`.
2. Add a system block describing current widget state.
3. Add a rule:

```text
Screen context is UI context. For exact facts, call tools or read raw files.
```

4. Add tool helpers for local harness docs:
   - `lead_box_get_contract_status`
   - `lead_box_read_ai_profile`
   - `lead_box_read_ledger`
   - `lead_box_read_comms_index`
   - `lead_box_refresh_raw`
   - `lead_box_refresh_ai`
   - `lead_box_run_full_flow`

5. Add widget-aware responses:
   - “Open the AI Profile widget”
   - “Pin this comm”
   - “Show Plan Day 2”
   - “Compare plan vs latest comms”

## State Model

Persist layout per lead:

```ts
type LeadWorkbenchLayout = {
  lead_id: string;
  left: Array<{ widget_id: LeadWidgetId; collapsed: boolean }>;
  right: Array<{ widget_id: LeadWidgetId; collapsed: boolean }>;
  focused_widget_id: LeadWidgetId | null;
  preset: "state" | "plan" | "review" | "raw" | "heartbeat" | "custom";
};
```

Storage v1 can be `localStorage`.

Storage v2 can be server-backed if Andre wants the same layout across devices.

## The Main Workflow

This becomes the normal day:

1. Andre opens `/leads`.
2. Lead rows show:
   - raw state
   - AI state
   - plan state
   - last checked
3. Andre opens a lead.
4. Workbench loads with:
   - left: scope + workflow
   - center: chat
   - right: plan + AI profile
5. Agent sees visible widget cards.
6. Andre asks:

```text
What changed, and should I approve Day 1?
```

7. Agent reads:
   - visible widget context
   - raw comms if needed
   - current plan
   - execution audit
8. Agent responds with:
   - state
   - recommended change
   - exact approval/firing suggestion
9. Andre approves or asks agent to edit.

## Important Guardrail

Widgets should not replace raw data.

They are lenses.

The source of truth remains:

- raw Close substrate files
- interpreted AI docs
- plan JSON / plan markdown
- execution audit
- heartbeat runs

If the agent needs precision, it must read the source.

## Implementation Order

### Pass 1: Workbench Shell

- Create `src/app/lead/[id]/workbench/page.tsx` or make `/lead/[id]` render workbench behind a flag.
- Extract current chat layout into reusable `LeadWorkbench`.
- Support URL widget params:

```text
?left=workflow,quick_delegations&right=plan,ai_profile
```

- Keep current subtabs untouched.

### Pass 2: Widget Registry

- Add `src/app/lead/[id]/workbench/widgets/registry.ts`.
- Define widget IDs, defaults, loaders, context-card builders.
- Implement:
  - Scope Widget
  - Workflow Widget
  - Plan Widget using `PlanDayStrip`

### Pass 3: AI + Box Widgets

- Extract:
  - Raw Box Widget from `box/page.tsx`
  - AI Profile Widget from `discovery/page.tsx`
  - Comms Widget from raw continuity/comms files
  - Ledger Widget from `08_client_ledger.md`

### Pass 4: Screen Context To Agent

- Modify `ChatPanel` send payload to include visible widget context cards.
- Modify `/api/chat/route.ts` to include those cards in the model input.
- Add tests for:
  - no widget context
  - lead mode with widget context
  - context-card truncation
  - screen context never bypasses tools for exact writes

### Pass 5: Redirect Tabs

- Update `AppHeader` lead subtabs into workbench presets.
- Deep links open widgets instead of changing pages.
- Keep old routes as compatibility redirects.

### Pass 6: Clean Up

- Delete duplicate page-only UI once widget equivalents are stable.
- Keep server loaders/actions.
- Keep tests around raw/AI/plan ordering.

## Risks

### Risk: The chat payload gets too large.

Mitigation:

- Context cards must be compact.
- Each widget gets a strict character budget.
- Raw file bodies are never injected by default.
- Agent calls tools when it needs full text.

### Risk: Widgets and chat disagree.

Mitigation:

- Widgets should show source timestamps and stale badges.
- Chat should treat widgets as screen context only.
- The exact write path still gates on current raw/plan snapshots.

### Risk: We rewrite too much at once.

Mitigation:

- Keep old routes.
- Extract one widget at a time.
- Start with Plan and Workflow, because they are the highest leverage.

## Final Shape

The final app feels like this:

> Every lead is a cockpit.  
> The agent is in the middle.  
> The left side is intent.  
> The right side is evidence.  
> The only mission is to get Andre on the phone with the lead.

That is the clean version.

