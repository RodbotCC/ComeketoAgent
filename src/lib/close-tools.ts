/**
 * Close CRM tools exposed to the chat agent via OpenAI Responses tool-calling.
 *
 * Each tool is a thin wrapper around lib/close.ts. The dispatcher translates
 * a tool name + JSON arguments into a real Close API call and returns the
 * result as JSON for the model to read on the next turn.
 */

import {
  closeListWorkflows,
  closeSearchLeads,
  closeGetLead,
  closeEnrollInWorkflow,
  closeListEmailTemplates,
  closeCreateOpportunity,
  closeGetLeadFull,
  closeListEmailThreadsForLead,
  checkOwnershipAndStatus,
  closeGetWorkflow,
  closeGetSequenceSubscription,
  closeUpdateSequenceSubscription,
  closeListSmsTemplates,
  closeListLeadStatuses,
  closeListPhoneNumbers,
  closeLogNote,
  closeListLeads,
  closeListActivities,
  closeListSequenceSubscriptions,
  closeUpdateLead,
  closeCreateTask,
  closeLogEmail,
  closeLogSms,
  closeCreateLead,
  closeListWebhookSubscriptions,
  closeCreateSequence,
  closeUpdateSequence,
  closeListLeadsByAssignee,
  closeListLeadsByStatusId,
} from "./close";
import { env } from "./env";
import { generateSevenDayPlanForLead } from "./plan";
import { clampPlanHorizonDays } from "./settings";

/**
 * Tool definitions in OpenAI Responses tool format.
 * Note: Responses API uses `type: "function"` with name/description/parameters
 * at the top level (not nested under `function`).
 */
export const CLOSE_TOOLS = [
  {
    type: "function" as const,
    name: "close_list_workflows",
    description:
      "List automation workflows (sequences) in the user's Close CRM. Returns id, name, status, and step summary. Use to see what's available before enrolling a lead.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max workflows to return (default 50)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_search_leads",
    description:
      "Search leads in Close using a Close query string (e.g. 'name:Hugo' or 'status:\"Potential\"' or 'has:email'). Returns up to `limit` matches with id, display_name, status, contacts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Close query string." },
        limit: { type: "number", description: "Max results (default 10, capped at 50)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_get_lead",
    description: "Fetch a single lead by id. Returns full record with contacts, status, opportunities.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "The Close lead id (lead_*)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_email_templates",
    description: "List email templates available in the user's Close org.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max templates to return (default 50)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_get_lead_full",
    description:
      "Fetch a lead's complete Box: core lead + paginated activity feed (up to 500 rows: emails/calls/sms/notes/tasks/…) + email conversation threads + workflow enrollments. One call — prefer this over close_get_lead when comms history matters.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "The Close lead id (lead_*)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_email_threads",
    description:
      "List EmailThread rows for a lead (one object per email conversation / subject grouping). Supplements individual Email activities in the activity feed.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*)." },
        limit: { type: "number", description: "Max threads (default 50)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_enroll_in_workflow",
    description:
      "Enroll a contact (within a lead) into a Close workflow (sequence). Hard-gated by Guardrails: refuses unless lead is owned by Andre and not Won/Lost. Pass lead_id so the gate can check; the tool will return a skip code instead of executing if the gate fails.",
    parameters: {
      type: "object",
      properties: {
        sequence_id: { type: "string", description: "Workflow id (seq_*)." },
        contact_id: { type: "string", description: "Contact id (cont_*) inside the lead." },
        lead_id: { type: "string", description: "Lead id (lead_*) — used for the ownership/status gate." },
        sender_email: { type: "string", description: "Optional sender email override." },
        sender_name: { type: "string", description: "Optional sender name override." },
      },
      required: ["sequence_id", "contact_id", "lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "generate_seven_day_plan",
    description:
      "Generate a tailored N-day cycle plan for a lead (default 7 for NEPQ-style week), per Guardrails §D. Reads the lead's full Box and produces a structured plan in NEPQ voice toward a scheduled phone call. Pass horizon_days to set length (e.g. 1 for immediate push, 14 for a longer bridge). Returns the full plan JSON. Use when the user asks for a plan, cadence, or what to do with a lead over the next days.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*) to plan for." },
        horizon_days: {
          type: "number",
          description: "Number of calendar-day buckets (1–180). Default 7 if omitted.",
        },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_create_opportunity",
    description:
      "Create an opportunity on a lead. Hard-gated by Guardrails: refuses unless lead is owned by Andre and not Won/Lost.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        status_id: { type: "string", description: "Optional opportunity status id (stat_*)." },
        value: { type: "number", description: "Dollar value." },
        value_period: {
          type: "string",
          enum: ["one_time", "monthly", "annual"],
        },
        note: { type: "string" },
        contact_id: { type: "string" },
        confidence: { type: "number", description: "0-100." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_get_workflow",
    description:
      "Fetch one automation workflow (sequence) by id, including full step definitions. Use after close_list_workflows when you need delays, step types, or template references.",
    parameters: {
      type: "object",
      properties: {
        sequence_id: { type: "string", description: "Workflow id (seq_*)." },
      },
      required: ["sequence_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_sms_templates",
    description: "List SMS templates in the org (for matching plan steps to Close templates).",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max templates (default 50)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_lead_statuses",
    description: "List all lead statuses for the org (ids + labels). Use for automation branching and status_id when creating/updating leads.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_phone_numbers",
    description:
      "List phone numbers on the org (sending lines). Helps debug SMS outbox/local_phone requirements.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max numbers (default 50)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_get_sequence_subscription",
    description:
      "Fetch a single workflow enrollment by subscription id (status, pause_reason, sequence_id, lead_id, contact_id).",
    parameters: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "sequence_subscription id (sub_*_...)." },
      },
      required: ["subscription_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_update_sequence_subscription",
    description:
      "Update a workflow subscription (e.g. pause or resume with status paused/active). Hard-gated: the subscription's lead must be owned by Andre and not Won/Lost.",
    parameters: {
      type: "object",
      properties: {
        subscription_id: { type: "string" },
        status: {
          type: "string",
          description: 'Usually "paused" or "active" (per Close API).',
        },
      },
      required: ["subscription_id", "status"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_log_internal_note",
    description:
      "Add an internal note activity on a lead (plaintext or note_html). Not a customer-facing send. Hard-gated: Andre-owned, not Won/Lost.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        note: { type: "string", description: "Plaintext note body." },
        note_html: { type: "string", description: "HTML body (overrides note if both set)." },
        title: { type: "string" },
        pinned: { type: "boolean" },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_leads",
    description:
      "List leads (newest first) with optional Close `query` string. Use for browsing recent leads without a full-text search. For assignee-scoped lists prefer close_list_leads_by_assignee.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max leads (default 25, cap 100)." },
        query: { type: "string", description: "Optional Close list query parameter." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_leads_by_assignee",
    description:
      "List leads assigned to a Close user (uses GET /lead/ scan). If assignee_user_id is omitted, uses Andre's user id from app settings env.",
    parameters: {
      type: "object",
      properties: {
        assignee_user_id: { type: "string", description: "Close user id (user_*); omit for Andre default." },
        limit: { type: "number", description: "Max leads (default 80, cap 200)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_leads_by_status_id",
    description:
      "List leads in a specific pipeline status. Pass status_id from close_list_lead_statuses (stat_*).",
    parameters: {
      type: "object",
      properties: {
        status_id: { type: "string", description: "Lead status id (stat_*)." },
        limit: { type: "number", description: "Max leads (default 80, cap 200)." },
      },
      required: ["status_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_activities",
    description:
      "Fetch activity rows for a lead (emails, calls, SMS, notes, …) — one page, max `_limit` (default 100). Lighter than close_get_lead_full when you only need recent activity.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        limit: { type: "number", description: "Max rows (default 100, cap 200)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_sequence_subscriptions",
    description:
      "List workflow (sequence) enrollments for a lead — active/paused subscriptions with sequence id and contact id.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        limit: { type: "number", description: "Max rows (default 50)." },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_update_lead",
    description:
      "Update lead fields (PUT /lead/{id}/). Andre-owned, non-Won/Lost only. Pass any subset: status_id, name, description, user_id, url, plus optional merge_patch_json for custom fields (e.g. {\"custom.cf_xyz\": \"value\"}).",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        status_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        user_id: { type: "string", description: "Assignee user_*." },
        url: { type: "string" },
        merge_patch_json: {
          type: "string",
          description: "JSON object merged into the patch (custom fields, etc.).",
        },
      },
      required: ["lead_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_create_task",
    description:
      "Create a task on a lead (calendar date yyyy-mm-dd, assigned_to user_*). Andre-owned, non-Won/Lost only.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        text: { type: "string" },
        date: { type: "string", description: "Due date ISO date yyyy-mm-dd." },
        assigned_to: { type: "string", description: "Close user id (user_*)." },
        is_complete: { type: "boolean" },
      },
      required: ["lead_id", "text", "date", "assigned_to"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_log_email_activity",
    description:
      "Log an email activity on a lead (POST /activity/email/). Default status is draft (visible in feed, not SMTP send). Use outbox/sent only after explicit user confirmation. Andre-owned, non-Won/Lost only.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        contact_id: { type: "string" },
        subject: { type: "string" },
        body_text: { type: "string" },
        status: { type: "string", enum: ["draft", "outbox", "sent"], description: "Default draft." },
      },
      required: ["lead_id", "contact_id", "subject", "body_text"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_log_sms_activity",
    description:
      "Log an SMS activity on a lead (POST /activity/sms/). Default draft. Real sends may require local_phone / integration — prefer draft until operator confirms. Andre-owned, non-Won/Lost only.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        contact_id: { type: "string" },
        text: { type: "string" },
        status: { type: "string", enum: ["draft", "outbox", "sent"], description: "Default draft." },
      },
      required: ["lead_id", "contact_id", "text"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_create_lead",
    description:
      "Create a new lead with at least one contact (POST /lead/). For assignee pass user_id (often Andre user_*). Does not use the Andre-owned gate (new lead).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lead / company name." },
        description: { type: "string" },
        user_id: { type: "string", description: "Optional assignee user_*." },
        contact_name: { type: "string", description: "Primary contact name." },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
      },
      required: ["name", "contact_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_list_webhook_subscriptions",
    description: "List inbound webhook subscriptions configured in Close (ops / debugging). Read-only.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows (default 30)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_create_sequence",
    description:
      "Create an automation sequence (POST /sequence/). Pass sequence_json: stringified JSON body per Close API (name, timezone, schedule, steps, …). Org-wide write — confirm with the user before calling.",
    parameters: {
      type: "object",
      properties: {
        sequence_json: { type: "string", description: "Full JSON string for POST /sequence/ body." },
      },
      required: ["sequence_json"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "close_update_sequence",
    description:
      "Update an existing sequence (PUT /sequence/{id}/). Pass patch_json stringified object. Org-wide — confirm with the user first.",
    parameters: {
      type: "object",
      properties: {
        sequence_id: { type: "string", description: "seq_*" },
        patch_json: { type: "string", description: "Stringified JSON patch for Close." },
      },
      required: ["sequence_id", "patch_json"],
      additionalProperties: false,
    },
  },
];

export type CloseToolName =
  | "close_list_workflows"
  | "close_search_leads"
  | "close_get_lead"
  | "close_get_lead_full"
  | "close_list_email_threads"
  | "close_list_email_templates"
  | "close_get_workflow"
  | "close_list_sms_templates"
  | "close_list_lead_statuses"
  | "close_list_phone_numbers"
  | "close_get_sequence_subscription"
  | "close_update_sequence_subscription"
  | "close_log_internal_note"
  | "close_enroll_in_workflow"
  | "close_create_opportunity"
  | "generate_seven_day_plan"
  | "close_list_leads"
  | "close_list_leads_by_assignee"
  | "close_list_leads_by_status_id"
  | "close_list_activities"
  | "close_list_sequence_subscriptions"
  | "close_update_lead"
  | "close_create_task"
  | "close_log_email_activity"
  | "close_log_sms_activity"
  | "close_create_lead"
  | "close_list_webhook_subscriptions"
  | "close_create_sequence"
  | "close_update_sequence";

/**
 * Execute a tool call. Returns a value the model will see as JSON on its
 * next turn. Errors are stringified into the result so the model can react
 * instead of the whole turn blowing up.
 */
export async function dispatchCloseTool(
  name: string,
  args: Record<string, unknown>,
  /**
   * Optional auxiliary hooks. When provided, the voice_lint_buddy slot
   * intercepts outbound email/SMS bodies before they hit Close and rewrites
   * them to clear blocking voice/lint violations.
   */
  hooks?: {
    voiceLint?: (
      channel: "email" | "sms",
      body: string
    ) => Promise<{ rewritten: string; slot: string } | null>;
  }
): Promise<unknown> {
  try {
    switch (name as CloseToolName) {
      case "close_list_workflows": {
        const wfs = await closeListWorkflows({ limit: (args.limit as number) ?? 50 });
        return wfs.map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          step_count: w.steps?.length ?? 0,
          step_types: [...new Set((w.steps ?? []).map((s) => s.step_type))],
        }));
      }
      case "close_search_leads": {
        const limit = Math.min((args.limit as number) ?? 10, 50);
        return await closeSearchLeads(args.query as string, limit);
      }
      case "close_get_lead":
        return await closeGetLead(args.lead_id as string);
      case "close_get_lead_full":
        return await closeGetLeadFull(args.lead_id as string);
      case "close_list_email_threads":
        return await closeListEmailThreadsForLead(args.lead_id as string, {
          limit: (args.limit as number) ?? 50,
        });
      case "close_list_email_templates":
        return await closeListEmailTemplates({ limit: (args.limit as number) ?? 50 });
      case "close_get_workflow":
        return await closeGetWorkflow(args.sequence_id as string);
      case "close_list_sms_templates":
        return await closeListSmsTemplates({ limit: (args.limit as number) ?? 50 });
      case "close_list_lead_statuses":
        return await closeListLeadStatuses();
      case "close_list_phone_numbers":
        return await closeListPhoneNumbers({ limit: (args.limit as number) ?? 50 });
      case "close_get_sequence_subscription":
        return await closeGetSequenceSubscription(args.subscription_id as string);
      case "close_update_sequence_subscription": {
        const subId = args.subscription_id as string;
        const sub = await closeGetSequenceSubscription(subId);
        const leadId = sub.lead_id as string;
        if (!leadId) {
          return { error: "Subscription has no lead_id — cannot verify ownership." };
        }
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Subscription ${subId} is on lead ${leadId} which fails Guardrails gate: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        return await closeUpdateSequenceSubscription(subId, { status: args.status });
      }
      case "close_log_internal_note": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Cannot log note on lead ${leadId}: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        if (!args.note && !args.note_html) {
          return { error: "Provide note or note_html." };
        }
        return await closeLogNote({
          lead_id: leadId,
          note: args.note as string | undefined,
          note_html: args.note_html as string | undefined,
          title: args.title as string | undefined,
          pinned: args.pinned as boolean | undefined,
          user_id: env.CLOSE_USER_ID_ANDRE || undefined,
        });
      }
      case "generate_seven_day_plan": {
        // Plan generation is read-only (no Close writes), but per Guardrails
        // §C1 still gate on ownership so we don't compose plans for leads
        // that aren't Andre's.
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Lead ${leadId} (${lead.display_name}) is not eligible for plan generation: ${skip}.`,
          };
        }
        const horizon =
          args.horizon_days !== undefined && args.horizon_days !== null
            ? clampPlanHorizonDays(Number(args.horizon_days))
            : undefined;
        const r = await generateSevenDayPlanForLead(leadId, { horizonDays: horizon });
        if (!r.ok) return { error: r.error, raw: r.raw };
        return r.plan;
      }
      case "close_enroll_in_workflow": {
        // Guardrails §C1+C2 + §M4: ownership/status gate before any write.
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason:
              skip === "OWNERSHIP"
                ? `Lead ${leadId} is not owned by Andre (or Andre user id not configured) — refusing per Guardrails §C1.`
                : `Lead ${leadId} status is "${lead.status_label}" — outbound forbidden per Guardrails §C2.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        return await closeEnrollInWorkflow({
          sequence_id: args.sequence_id as string,
          contact_id: args.contact_id as string,
          sender_email: args.sender_email as string | undefined,
          sender_name: args.sender_name as string | undefined,
        });
      }
      case "close_create_opportunity": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason:
              skip === "OWNERSHIP"
                ? `Lead ${leadId} is not owned by Andre — refusing per Guardrails §C1.`
                : `Lead ${leadId} status is "${lead.status_label}" — refusing per Guardrails §C2.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        return await closeCreateOpportunity({
          lead_id: args.lead_id as string,
          status_id: args.status_id as string | undefined,
          value: args.value as number | undefined,
          value_period: args.value_period as "one_time" | "monthly" | "annual" | undefined,
          note: args.note as string | undefined,
          contact_id: args.contact_id as string | undefined,
          confidence: args.confidence as number | undefined,
        });
      }
      case "close_list_leads": {
        const lim = Math.min((args.limit as number) ?? 25, 100);
        const q = args.query;
        return await closeListLeads({
          limit: lim,
          query: typeof q === "string" && q.trim() ? q.trim() : undefined,
        });
      }
      case "close_list_leads_by_assignee": {
        const uid =
          (typeof args.assignee_user_id === "string" && args.assignee_user_id.trim()
            ? args.assignee_user_id.trim()
            : env.CLOSE_USER_ID_ANDRE) || "";
        if (!uid) {
          return {
            error: "assignee_user_id missing and CLOSE_USER_ID_ANDRE not configured",
          };
        }
        const lim = Math.min((args.limit as number) ?? 80, 200);
        return await closeListLeadsByAssignee(uid, lim);
      }
      case "close_list_leads_by_status_id": {
        const lim = Math.min((args.limit as number) ?? 80, 200);
        return await closeListLeadsByStatusId(args.status_id as string, lim);
      }
      case "close_list_activities": {
        const lim = Math.min((args.limit as number) ?? 100, 200);
        return await closeListActivities(args.lead_id as string, lim);
      }
      case "close_list_sequence_subscriptions": {
        return await closeListSequenceSubscriptions(
          args.lead_id as string,
          (args.limit as number) ?? 50
        );
      }
      case "close_update_lead": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Cannot update lead ${leadId}: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        const patch: Record<string, unknown> = {};
        const setIf = (k: string, v: unknown) => {
          if (v === undefined || v === null) return;
          if (typeof v === "string" && v.trim() === "") return;
          patch[k] = v;
        };
        setIf("status_id", args.status_id);
        setIf("name", args.name);
        setIf("description", args.description);
        setIf("user_id", args.user_id);
        setIf("url", args.url);
        const mergeRaw = args.merge_patch_json;
        if (typeof mergeRaw === "string" && mergeRaw.trim()) {
          try {
            const extra = JSON.parse(mergeRaw) as unknown;
            if (extra && typeof extra === "object" && !Array.isArray(extra)) {
              Object.assign(patch, extra as Record<string, unknown>);
            } else {
              return { error: "merge_patch_json must be a JSON object" };
            }
          } catch {
            return { error: "merge_patch_json must be valid JSON" };
          }
        }
        if (Object.keys(patch).length === 0) {
          return { error: "No fields to update — pass status_id, name, description, user_id, url and/or merge_patch_json." };
        }
        return await closeUpdateLead(leadId, patch);
      }
      case "close_create_task": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Cannot create task on lead ${leadId}: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        return await closeCreateTask({
          lead_id: leadId,
          text: args.text as string,
          date: args.date as string,
          assigned_to: args.assigned_to as string,
          is_complete: args.is_complete as boolean | undefined,
        });
      }
      case "close_log_email_activity": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Cannot log email on lead ${leadId}: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        const st = args.status as string | undefined;
        const status =
          st === "outbox" || st === "sent" ? st : "draft";
        let body = args.body_text as string;
        let lintRewriteSlot: string | null = null;
        if (hooks?.voiceLint && body) {
          const rew = await hooks.voiceLint("email", body);
          if (rew) {
            body = rew.rewritten;
            lintRewriteSlot = rew.slot;
          }
        }
        const r = await closeLogEmail({
          lead_id: leadId,
          contact_id: args.contact_id as string,
          subject: args.subject as string,
          body_text: body,
          status,
          user_id: env.CLOSE_USER_ID_ANDRE || undefined,
        });
        return lintRewriteSlot ? { ...r, voice_lint_rewrite: { slot: lintRewriteSlot } } : r;
      }
      case "close_log_sms_activity": {
        const leadId = args.lead_id as string;
        const lead = await closeGetLead(leadId);
        const skip = checkOwnershipAndStatus(lead, env.CLOSE_USER_ID_ANDRE);
        if (skip) {
          return {
            skipped: true,
            skip_code: skip,
            reason: `Cannot log SMS on lead ${leadId}: ${skip}.`,
            lead: { id: lead.id, display_name: lead.display_name, status_label: lead.status_label },
          };
        }
        const st = args.status as string | undefined;
        const status =
          st === "outbox" || st === "sent" ? st : "draft";
        let text = args.text as string;
        let lintRewriteSlot: string | null = null;
        if (hooks?.voiceLint && text) {
          const rew = await hooks.voiceLint("sms", text);
          if (rew) {
            text = rew.rewritten;
            lintRewriteSlot = rew.slot;
          }
        }
        const r = await closeLogSms({
          lead_id: leadId,
          contact_id: args.contact_id as string,
          text,
          status,
          user_id: env.CLOSE_USER_ID_ANDRE || undefined,
        });
        return lintRewriteSlot ? { ...r, voice_lint_rewrite: { slot: lintRewriteSlot } } : r;
      }
      case "close_create_lead": {
        const contactName = args.contact_name as string;
        const emails =
          typeof args.contact_email === "string" && args.contact_email.trim()
            ? [{ email: args.contact_email.trim(), type: "office" as const }]
            : undefined;
        const phones =
          typeof args.contact_phone === "string" && args.contact_phone.trim()
            ? [{ phone: args.contact_phone.trim(), type: "office" as const }]
            : undefined;
        return await closeCreateLead({
          name: args.name as string,
          description:
            typeof args.description === "string" && args.description.trim()
              ? args.description.trim()
              : undefined,
          user_id:
            typeof args.user_id === "string" && args.user_id.trim()
              ? args.user_id.trim()
              : undefined,
          contacts: [
            {
              name: contactName,
              ...(emails ? { emails } : {}),
              ...(phones ? { phones } : {}),
            },
          ],
        });
      }
      case "close_list_webhook_subscriptions": {
        const lim = Math.min((args.limit as number) ?? 30, 50);
        return await closeListWebhookSubscriptions({ limit: lim });
      }
      case "close_create_sequence": {
        const raw = args.sequence_json as string;
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return { error: "sequence_json must be valid JSON" };
        }
        if (!body || typeof body !== "object") {
          return { error: "sequence_json must be a JSON object" };
        }
        return await closeCreateSequence(body);
      }
      case "close_update_sequence": {
        let patch: Record<string, unknown>;
        try {
          patch = JSON.parse(args.patch_json as string) as Record<string, unknown>;
        } catch {
          return { error: "patch_json must be valid JSON object" };
        }
        return await closeUpdateSequence(args.sequence_id as string, patch);
      }
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
