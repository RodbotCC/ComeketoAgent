/**
 * Plan → Close codegen.
 *
 * Maps each `required_action` on the seven-day plan to typed `PlannedCloseAction`
 * records (tasks, logged email/SMS drafts, enrollment hints). Used by the Lead
 * Box preview and by `runHeartbeatForPlan` when building the per-action verdict
 * and executing writes under `approved_plan_execution`.
 *
 * Per Guardrails §I4, customer-facing sends still require operator-controlled
 * execution mode and gates; this module only describes the intended Close shape.
 */

import type { SevenDayPlan, SevenDayPlanDay, PlannedTouchpoint } from "./plan";
import type { CloseLeadFull } from "./close";

/** Discriminated union of every Close action this app might fire. */
export type PlannedCloseAction =
  | {
      kind: "create_task";
      day: number;
      due_date: string; // ISO yyyy-mm-dd
      due_window: string; // e.g. "9:00 AM – 7:00 PM lead-local"
      assigned_to: string; // user_id (Andre)
      text: string;
      lead_id: string;
      // For preview rendering:
      origin: { channel: "task"; intent: string };
    }
  | {
      kind: "log_activity";
      day: number;
      activity_type: "Email" | "SMS";
      lead_id: string;
      contact_id: string;
      direction: "outbound";
      body_seed: string;
      send_window: string;
      send_after: string; // ISO date
      origin: { channel: "email" | "sms"; intent: string };
    }
  | {
      kind: "enroll_in_workflow";
      day: number;
      lead_id: string;
      contact_id: string;
      sequence_id_hint: string; // human-readable; resolved at execution
      origin: { channel: "email" | "sms"; intent: string };
    }
  | {
      kind: "skip";
      day: number;
      reason: string;
      origin: { channel: PlannedTouchpoint["channel"]; intent: string };
    };

export type PlannedCloseActionGroup = {
  day: number;
  date: string; // ISO yyyy-mm-dd
  objective: string;
  approval_status: SevenDayPlanDay["approval_status"];
  send_window: string;
  actions: PlannedCloseAction[];
};

export type CodegenInput = {
  plan: SevenDayPlan;
  box: CloseLeadFull;
  andreUserId: string;
};

export type CodegenResult = {
  groups: PlannedCloseActionGroup[];
  total_actions: number;
  blocking_warnings: string[]; // soft warnings that don't fail codegen
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDaysIso(startIso: string, daysOffset: number): string {
  const d = new Date(startIso);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function pickPrimaryContactId(box: CloseLeadFull): string | null {
  const c = box.lead.contacts?.[0];
  return c?.id ?? null;
}

// ─── Translator ───────────────────────────────────────────────────────────

/**
 * Translate a plan into the list of Close actions the heartbeat evaluates and may execute.
 *
 * Conventions:
 * - Day 1 = plan.cycle_started_at; Day 2 = +1d; etc.
 * - Skipped days emit a single "skip" action so the preview shows them.
 * - call & task channels → create_task assigned to Andre
 * - email & sms channels → log_activity (draft status in Close until outbox/send is enabled).
 * - Missing primary contact → blocking_warnings (no contact to send to).
 */
export function codegenPlanForClose(input: CodegenInput): CodegenResult {
  const { plan, box, andreUserId } = input;
  const warnings: string[] = [];
  const contactId = pickPrimaryContactId(box);
  if (!contactId) {
    warnings.push(
      "Lead has no primary contact — email/SMS actions cannot resolve a recipient and will be marked skipped."
    );
  }
  if (!andreUserId) {
    warnings.push(
      "CLOSE_USER_ID_ANDRE is not configured — call/task actions cannot be assigned."
    );
  }

  const groups: PlannedCloseActionGroup[] = plan.days.map((day, idx) => {
    const date = addDaysIso(plan.cycle_started_at, idx);
    const actions: PlannedCloseAction[] = [];

    if (day.approval_status === "skipped") {
      actions.push({
        kind: "skip",
        day: day.day,
        reason: "Day marked skipped",
        origin: { channel: day.required_actions[0]?.channel ?? "task", intent: day.objective },
      });
    } else {
      for (const req of day.required_actions) {
        if (req.channel === "task") {
          if (!andreUserId) {
            actions.push({
              kind: "skip",
              day: day.day,
              reason: "No Andre user_id configured — task cannot be assigned.",
              origin: { channel: req.channel, intent: req.intent },
            });
            continue;
          }
          actions.push({
            kind: "create_task",
            day: day.day,
            due_date: date,
            due_window: day.send_window,
            assigned_to: andreUserId,
            text: req.intent,
            lead_id: plan.close_lead_id,
            origin: { channel: req.channel, intent: req.intent },
          });
          continue;
        }

        if (req.channel === "email" || req.channel === "sms") {
          if (!contactId) {
            actions.push({
              kind: "skip",
              day: day.day,
              reason: `No primary contact — cannot send ${req.channel}.`,
              origin: { channel: req.channel, intent: req.intent },
            });
            continue;
          }
          // Default: direct activity log/send via Close. The heartbeat may
          // upgrade this to enroll_in_workflow when a matching template
          // sequence is found.
          actions.push({
            kind: "log_activity",
            day: day.day,
            activity_type: req.channel === "email" ? "Email" : "SMS",
            lead_id: plan.close_lead_id,
            contact_id: contactId,
            direction: "outbound",
            body_seed: req.draft_seed || req.intent,
            send_window: day.send_window,
            send_after: date,
            origin: { channel: req.channel, intent: req.intent },
          });
        }
      }
    }

    return {
      day: day.day,
      date,
      objective: day.objective,
      approval_status: day.approval_status,
      send_window: day.send_window,
      actions,
    };
  });

  const total = groups.reduce((sum, g) => sum + g.actions.filter((a) => a.kind !== "skip").length, 0);

  return { groups, total_actions: total, blocking_warnings: warnings };
}
