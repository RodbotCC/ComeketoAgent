/**
 * Group a flat tool-call trace into intent-level chains for the chat UI.
 *
 * Why: the agent's loop runs API tools first; on failure, it falls through
 * to `close_mcp_call`. Each call is one row in the trace. Rendered flat,
 * a recovered chain looks "broken" because the failed API attempt still
 * paints a red FAILED badge.
 *
 * This helper rewrites the trace as a list of GROUPS — each group has one
 * displayed status (the LAST call's outcome drives it) and 1+ underlying
 * calls. The chat UI renders one panel per group, with prior failed
 * attempts collapsed underneath when a recovery happened.
 *
 * Heuristic: a failure is grouped with the very next successful call,
 * regardless of which tool succeeded. The LLM recovers in two common
 * shapes — fall through to `close_mcp_call`, OR drop down to a simpler
 * API tool (e.g. failed `close_search_leads` with Klaus DSL → succeed
 * with `close_list_leads` + a plain query). Both shapes deserve to
 * render as one happy panel. The cost of occasionally grouping an
 * unrelated success after a failure is tiny — the user just sees the
 * answer they got — versus the much louder cost of a red FAILED badge
 * on a chain that actually worked.
 */

export type ToolCall = {
  name: string;
  ok: boolean;
  args: Record<string, unknown>;
  lead_id?: string;
  summary?: string;
};

export type ToolGroup = {
  /**
   * - `ok`        — single successful call (no recovery needed).
   * - `recovered` — one or more failures, then a `close_mcp_call` that worked.
   * - `failed`    — one or more failures with no recovery.
   */
  status: "ok" | "recovered" | "failed";
  calls: ToolCall[];
};

export function groupToolTrace(calls: ToolCall[]): ToolGroup[] {
  const groups: ToolGroup[] = [];
  let buffer: ToolCall[] = [];

  for (const c of calls) {
    if (c.ok) {
      if (buffer.length === 0) {
        groups.push({ status: "ok", calls: [c] });
      } else {
        // Failures preceded this success — fold them all into one group.
        groups.push({ status: "recovered", calls: [...buffer, c] });
        buffer = [];
      }
    } else {
      buffer.push(c);
    }
  }

  if (buffer.length > 0) {
    groups.push({ status: "failed", calls: [...buffer] });
  }

  return groups;
}
