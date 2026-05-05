/**
 * Minimal MCP (Model Context Protocol) client for Close's official MCP server.
 *
 * Speaks JSON-RPC 2.0 over plain HTTP. Two methods exposed:
 *   - closeMcpListTools()        → lists tools the MCP server advertises.
 *   - closeMcpCallTool(name, a)  → invokes one of those tools by name.
 *
 * This module is the FALLBACK path. Primary writes still go through
 * `lib/close.ts` direct REST helpers because those carry Guardrails gates
 * (ownership, status, voice, snapshot match). MCP is for operations we
 * haven't yet wrapped directly — read coverage today, write coverage when
 * the operator explicitly asks for something the gated path doesn't do.
 *
 * Configuration (all in `.env.local`):
 *   CLOSE_MCP_URL         — full HTTP URL of the MCP server (e.g.
 *                           https://mcp.close.com/mcp). Blank disables.
 *   CLOSE_MCP_AUTH_HEADER — full header value to send (e.g.
 *                           "Bearer <some-token>"). When blank, falls back
 *                           to "Bearer ${CLOSE_API_KEY}".
 *
 * When `CLOSE_MCP_URL` is empty, every method short-circuits with a
 * structured `{ error }` object — the dispatcher surfaces that to the model
 * cleanly instead of throwing.
 */

import { env } from "./env";

const REQUEST_TIMEOUT_MS = 15_000;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: number;
      result: unknown;
      error?: undefined;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      error: { code: number; message: string; data?: unknown };
      result?: undefined;
    };

export type CloseMcpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type CloseMcpListResult =
  | { ok: true; tools: CloseMcpToolDescriptor[] }
  | { ok: false; error: string };

export type CloseMcpCallResult =
  | { ok: true; content: unknown }
  | { ok: false; error: string };

let requestCounter = 1;

function authHeader(): string {
  const override = env.CLOSE_MCP_AUTH_HEADER.trim();
  if (override) return override;
  if (env.CLOSE_API_KEY) return `Bearer ${env.CLOSE_API_KEY}`;
  return "";
}

function isConfigured(): boolean {
  return env.CLOSE_MCP_URL.trim().length > 0;
}

async function callRpc(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
  const url = env.CLOSE_MCP_URL.trim();
  if (!url) {
    return {
      jsonrpc: "2.0",
      id: 0,
      error: { code: -32000, message: "CLOSE_MCP_URL not set in .env.local" },
    };
  }

  const auth = authHeader();
  if (!auth) {
    return {
      jsonrpc: "2.0",
      id: 0,
      error: { code: -32001, message: "No MCP auth available (set CLOSE_MCP_AUTH_HEADER or CLOSE_API_KEY)" },
    };
  }

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestCounter++,
    method,
    params: params ?? {},
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // MCP HTTP transport sometimes negotiates SSE; we accept both shapes.
        Accept: "application/json, text/event-stream",
        Authorization: auth,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: res.status,
          message: `MCP HTTP ${res.status}: ${text.slice(0, 240) || res.statusText}`,
        },
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    let parsed: JsonRpcResponse | null = null;

    if (contentType.includes("text/event-stream")) {
      // SSE — accumulate the stream and pull the last JSON-RPC envelope out
      // of the data: lines. MCP servers that prefer SSE typically send a
      // single "message" event whose data is the JSON-RPC response.
      const text = await res.text();
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          parsed = JSON.parse(data) as JsonRpcResponse;
        } catch {
          /* keep scanning — last valid JSON wins */
        }
      }
      if (!parsed) {
        return {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32700, message: "MCP SSE response had no parseable JSON-RPC payload" },
        };
      }
    } else {
      const json = (await res.json().catch(() => null)) as JsonRpcResponse | null;
      if (!json) {
        return {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32700, message: "MCP response was not valid JSON" },
        };
      }
      parsed = json;
    }

    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32002,
        message: `MCP fetch failed: ${message}`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function closeMcpListTools(): Promise<CloseMcpListResult> {
  if (!isConfigured()) {
    return { ok: false, error: "Close MCP not configured (CLOSE_MCP_URL is empty in .env.local)." };
  }
  const resp = await callRpc("tools/list");
  if (resp.error) {
    return { ok: false, error: resp.error.message };
  }
  const result = resp.result as { tools?: CloseMcpToolDescriptor[] } | undefined;
  const tools = Array.isArray(result?.tools) ? result!.tools : [];
  return { ok: true, tools };
}

export async function closeMcpCallTool(
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<CloseMcpCallResult> {
  if (!isConfigured()) {
    return { ok: false, error: "Close MCP not configured (CLOSE_MCP_URL is empty in .env.local)." };
  }
  const name = (toolName ?? "").trim();
  if (!name) {
    return { ok: false, error: "tool_name is required" };
  }
  const resp = await callRpc("tools/call", {
    name,
    arguments: toolArgs ?? {},
  });
  if (resp.error) {
    return { ok: false, error: resp.error.message };
  }
  return { ok: true, content: resp.result };
}

/**
 * Heuristic: does this MCP tool name look like a write/mutation? Used to
 * decide whether to stamp an `execution_log` row when the model uses the
 * fallback path. False positives just mean an extra read row in the log.
 */
const WRITE_VERB_RE = /(create|update|delete|remove|patch|log|enroll|send|post|set|add|merge)/i;

export function looksLikeMcpWrite(toolName: string): boolean {
  return WRITE_VERB_RE.test(toolName ?? "");
}

export function closeMcpStatus(): { configured: boolean; url_set: boolean; auth_resolved: boolean } {
  return {
    configured: isConfigured(),
    url_set: env.CLOSE_MCP_URL.trim().length > 0,
    auth_resolved: authHeader().length > 0,
  };
}
