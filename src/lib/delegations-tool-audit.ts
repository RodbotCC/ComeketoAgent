/**
 * Maps delegations-chat Close tool outcomes to execution_log rows so `/console`
 * and approvals counts stay honest without scraping thread content.
 */

import { logExecution } from "./execution-audit";
import { looksLikeMcpWrite } from "./close-mcp";

const AUDITED_CLOSE_WRITE_TOOLS = new Set([
  "close_update_sequence_subscription",
  "close_log_internal_note",
  "close_enroll_in_workflow",
  "close_create_opportunity",
  "close_update_lead",
  "close_create_task",
  "close_log_email_activity",
  "close_log_sms_activity",
  "close_create_lead",
  "close_create_sequence",
  "close_update_sequence",
]);

const GENERATE_TOOL = "generate_seven_day_plan";

const MCP_FALLBACK_CALL_TOOL = "close_mcp_call";

/**
 * Composite (batch) write-class tools — they self-log per-success rows via
 * direct `logExecution` calls inside `lib/composite-tools.ts` (sharing the
 * route's `traceId`), so we don't re-log here. We just acknowledge them so
 * the chat route's `delegationsAuditLogged` flag flips and `/console` +
 * `/approvals` get revalidated after the turn.
 */
const COMPOSITE_SELF_AUDITED_TOOLS = new Set([
  "generate_plans_for_leads",
  "approve_and_fire_plans",
  "extract_discovery_facts",
  "set_discovery_slot",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function leadIdFromContext(
  tool: string,
  args: Record<string, unknown>,
  result: unknown
): string | null {
  const lid = args.lead_id;
  if (typeof lid === "string" && lid.startsWith("lead_")) return lid;
  if (tool === "close_create_lead" && isRecord(result)) {
    const id = result.id;
    if (typeof id === "string" && id.startsWith("lead_")) return id;
  }
  if (isRecord(result)) {
    const lr = result.lead_id;
    if (typeof lr === "string" && lr.startsWith("lead_")) return lr;
    const cl = result.close_lead_id;
    if (typeof cl === "string" && cl.startsWith("lead_")) return cl;
  }
  return null;
}

function planIdFromGenerateResult(result: unknown): string | null {
  if (!isRecord(result)) return null;
  const p = result.plan_id;
  return typeof p === "string" ? p : null;
}

/**
 * @returns true when a row was queued for insert (failed inserts are still swallowed inside logExecution).
 */
export function logDelegationsToolCall(input: {
  traceId: string;
  threadId: string;
  round: number;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}): boolean {
  const { traceId, threadId, round, name, args, result } = input;

  if (name === GENERATE_TOOL) {
    const leadIdRaw =
      (typeof args.lead_id === "string" && args.lead_id.startsWith("lead_") ? args.lead_id : null) ??
      (isRecord(result) && typeof result.close_lead_id === "string" ? result.close_lead_id : null);

    if (isRecord(result) && result.skipped === true) {
      const code = typeof result.skip_code === "string" ? result.skip_code : null;
      void logExecution({
        action_kind: "generate_plan",
        close_lead_id: leadIdRaw,
        result: "ok",
        skip_code: code,
        trace_id: traceId,
        payload: {
          source: "delegations_chat",
          thread_id: threadId,
          round,
          tool: name,
        },
      });
      return true;
    }
    if (isRecord(result) && typeof result.error === "string") {
      void logExecution({
        action_kind: "generate_plan",
        close_lead_id: leadIdRaw,
        result: "error",
        trace_id: traceId,
        payload: {
          source: "delegations_chat",
          thread_id: threadId,
          round,
          tool: name,
          error: result.error,
        },
      });
      return true;
    }
    const planId = planIdFromGenerateResult(result);
    if (planId) {
      void logExecution({
        action_kind: "generate_plan",
        close_lead_id: leadIdRaw,
        plan_id: planId,
        result: "ok",
        trace_id: traceId,
        payload: {
          source: "delegations_chat",
          thread_id: threadId,
          round,
          tool: name,
        },
      });
      return true;
    }
    return false;
  }

  if (name === MCP_FALLBACK_CALL_TOOL) {
    // Every `close_mcp_call` reaches outside the gated direct-API path.
    // We always log it so /console can show fallback usage; the verb
    // heuristic just flags whether to treat it as a write.
    const targetTool =
      typeof args.tool_name === "string" ? args.tool_name.trim() : "(unspecified)";
    const isWrite = looksLikeMcpWrite(targetTool);
    let execResult: "ok" | "error" = "ok";
    if (isRecord(result) && (typeof result.error === "string" || result.ok === false)) {
      execResult = "error";
    }
    void logExecution({
      action_kind: "mcp_fallback",
      close_lead_id: null,
      result: execResult,
      trace_id: traceId,
      payload: {
        source: "delegations_chat",
        thread_id: threadId,
        round,
        tool: name,
        target_tool: targetTool,
        is_write: isWrite,
        arg_keys: Object.keys(
          (isRecord(args.tool_args) ? args.tool_args : args) as Record<string, unknown>
        ),
      },
    });
    return true;
  }

  // Composite write-class tools have already written their own audit rows
  // (per-success, sharing the same traceId). Returning true triggers the
  // chat route's revalidate without double-logging.
  if (COMPOSITE_SELF_AUDITED_TOOLS.has(name)) return true;

  if (!AUDITED_CLOSE_WRITE_TOOLS.has(name)) return false;

  let skipCode: string | null = null;
  let execResult: "ok" | "error" = "ok";

  if (isRecord(result)) {
    if (typeof result.error === "string") execResult = "error";
    if (result.skipped === true && typeof result.skip_code === "string") skipCode = result.skip_code;
  }

  const leadId = leadIdFromContext(name, args, result);

  void logExecution({
    action_kind: "delegations_close_tool",
    close_lead_id: leadId,
    result: execResult,
    skip_code: skipCode,
    trace_id: traceId,
    payload: {
      source: "delegations_chat",
      thread_id: threadId,
      round,
      tool: name,
      arg_keys: Object.keys(args),
    },
  });
  return true;
}
