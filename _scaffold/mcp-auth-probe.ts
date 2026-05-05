/**
 * Probe alt auth schemes against Close MCP.
 * Run: npx tsx _scaffold/mcp-auth-probe.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnv();
const URL = (env.CLOSE_MCP_URL || "").trim();
const KEY = (env.CLOSE_API_KEY || "").trim();

async function probe(label: string, headers: Record<string, string>) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0.1" } },
  });
  const res = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18", ...headers }, body });
  const text = await res.text();
  const status = res.status;
  const ok = status >= 200 && status < 300 && !text.includes("invalid_token") && !text.includes("Authentication required");
  console.log(`[${ok ? "OK " : "FAIL"}] ${label.padEnd(40)} HTTP ${status} · ${text.slice(0, 100)}`);
  return ok;
}

(async () => {
  console.log(`URL: ${URL}\n`);
  await probe("Authorization: Bearer api_…", { Authorization: `Bearer ${KEY}` });
  await probe("Authorization: api_… (raw)", { Authorization: KEY });
  await probe("X-API-Key: api_…", { "X-API-Key": KEY });
  await probe("Authorization: Basic <api_:>", { Authorization: `Basic ${Buffer.from(KEY + ":").toString("base64")}` });
  await probe("Authorization: Token api_…", { Authorization: `Token ${KEY}` });
  await probe("X-Close-API-Key: api_…", { "X-Close-API-Key": KEY });
  console.log("\n(401/invalid_token = wrong scheme; 200 + result = right scheme)");
})();
