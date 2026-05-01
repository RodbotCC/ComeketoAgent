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
  checkOwnershipAndStatus,
} from "./close";
import { env } from "./env";
import { generateSevenDayPlanForLead } from "./plan";

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
      "Fetch a lead's complete Box: core lead + recent activity feed (emails/calls/sms/notes/meetings) + active workflow enrollments. One call. Use this when the user asks about a specific lead's history, status, or what to do next.",
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
      "Generate a tailored 7-day plan for a lead, per Guardrails §D. Reads the lead's full Box (lead + activity feed + workflow subscriptions) and produces a structured plan in NEPQ voice that prefers a scheduled phone call as the conversion target. Returns the full plan JSON. Use when the user asks for a plan, weekly cadence, or 'what should we do this week with X'.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Close lead id (lead_*) to plan for." },
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
];

export type CloseToolName =
  | "close_list_workflows"
  | "close_search_leads"
  | "close_get_lead"
  | "close_get_lead_full"
  | "close_list_email_templates"
  | "close_enroll_in_workflow"
  | "close_create_opportunity"
  | "generate_seven_day_plan";

/**
 * Execute a tool call. Returns a value the model will see as JSON on its
 * next turn. Errors are stringified into the result so the model can react
 * instead of the whole turn blowing up.
 */
export async function dispatchCloseTool(
  name: string,
  args: Record<string, unknown>
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
      case "close_list_email_templates":
        return await closeListEmailTemplates({ limit: (args.limit as number) ?? 50 });
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
        const r = await generateSevenDayPlanForLead(leadId);
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
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
