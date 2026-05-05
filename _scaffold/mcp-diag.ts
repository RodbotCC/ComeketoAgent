/**
 * MCP server diagnostic. Run with: npx tsx _scaffold/mcp-diag.ts
 *
 * Tests Close MCP server step by step:
 *   1. Bare tools/list (current client behavior — no handshake)
 *   2. Full handshake: initialize → notifications/initialized → tools/list
 *   3. Calls one read-only tool (org_info) to verify end-to-end
 *
 * Reports HTTP status, content-type, and parsed body at each step so we
 * can see exactly where it fails.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local manually (this script doesn't go through Next.js).
function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnv();
const URL = (env.CLOSE_MCP_URL || "").trim();
const AUTH_OVERRIDE = (env.CLOSE_MCP_AUTH_HEADER || "").trim();
const API_KEY = (env.CLOSE_API_KEY || "").trim();
const AUTH = AUTH_OVERRIDE || (API_KEY ? `Bearer ${API_KEY}` : "");

if (!URL) {
  console.error("CLOSE_MCP_URL not set in .env.local — abort");
  process.exit(1);
}
if (!AUTH) {
  console.error("No auth — set CLOSE_MCP_AUTH_HEADER or CLOSE_API_KEY in .env.local");
  process.exit(1);
}

console.log(`URL: ${URL}`);
console.log(`Auth: ${AUTH.slice(0, 14)}…${AUTH.slice(-4)} (${AUTH.length} chars)`);
console.log("");

let id = 1;
let sessionId: string | null = null;

async function rpc(method: string, params?: Record<string, unknown>, isNotification = false) {
  const body = isNotification
    ? { jsonrpc: "2.0", method, params: params ?? {} }
    : { jsonrpc: "2.0", id: id++, method, params: params ?? {} };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: AUTH,
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  console.log(`→ ${method}${isNotification ? " (notification)" : ""}`);
  const res = await fetch(URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid && !sessionId) {
    sessionId = sid;
    console.log(`  session-id received: ${sid}`);
  }

  console.log(`  HTTP ${res.status} · content-type: ${res.headers.get("content-type") || "(none)"}`);
  const text = await res.text();
  if (!text) {
    console.log("  (empty body)");
    return null;
  }

  // Try JSON first, then SSE.
  try {
    const json = JSON.parse(text);
    console.log(`  body: ${JSON.stringify(json).slice(0, 800)}`);
    return json;
  } catch {
    // SSE
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          console.log(`  SSE data: ${JSON.stringify(json).slice(0, 800)}`);
          return json;
        } catch {
          console.log(`  SSE non-JSON: ${data.slice(0, 200)}`);
        }
      }
    }
    console.log(`  raw body (first 600): ${text.slice(0, 600)}`);
    return null;
  }
}

async function main() {
  // ── Test 1: bare tools/list (current client behavior) ──
  console.log("=== Test 1: bare tools/list (NO handshake — current client behavior) ===");
  await rpc("tools/list");
  console.log("");

  // Reset session for handshake test.
  sessionId = null;
  id = 1;

  // ── Test 2: full MCP handshake ──
  console.log("=== Test 2: MCP handshake → tools/list → tools/call ===");
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "comeketo-diag", version: "0.1" },
  });
  await rpc("notifications/initialized", undefined, true);
  console.log("");

  console.log("--- after handshake: tools/list ---");
  const list = await rpc("tools/list");
  console.log("");

  if (list?.result?.tools && list.result.tools.length > 0) {
    const first = list.result.tools[0];
    console.log(`--- tools/call on first tool (${first.name}) ---`);
    // Try with empty args; some tools will error which is fine — we just want to see HTTP behavior.
    await rpc("tools/call", { name: first.name, arguments: {} });
    console.log("");
  }

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Diagnostic crashed:", err);
  process.exit(1);
});
