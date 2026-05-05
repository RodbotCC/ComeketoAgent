/**
 * End-to-end MCP test using the updated close-mcp.ts client.
 * Run: npx tsx _scaffold/mcp-end-to-end.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvLocal();

// Dynamic import AFTER env load so the env module sees populated vars.
async function main() {
  const { env } = await import("../src/lib/env");
  console.log("env.CLOSE_MCP_URL:", JSON.stringify(env.CLOSE_MCP_URL));
  console.log("env.CLOSE_MCP_AUTH_HEADER:", JSON.stringify(env.CLOSE_MCP_AUTH_HEADER), "len:", env.CLOSE_MCP_AUTH_HEADER.length);
  console.log("env.CLOSE_API_KEY first/len:", env.CLOSE_API_KEY?.slice(0, 8), "/", env.CLOSE_API_KEY?.length);
  const { closeMcpListTools, closeMcpCallTool } = await import("../src/lib/close-mcp");

  console.log("\n--- closeMcpListTools (with Basic auth fallback) ---");
  const list = await closeMcpListTools();
  if (!list.ok) {
    console.error("FAIL:", list.error);
    process.exit(1);
  }
  console.log(`OK — ${list.tools.length} tools advertised`);
  console.log("First 8:", list.tools.slice(0, 8).map((t) => t.name));
  console.log("");

  const orgInfo = list.tools.find((t) => t.name === "org_info") || list.tools[0];
  if (orgInfo) {
    console.log(`--- closeMcpCallTool('${orgInfo.name}', {}) ---`);
    const call = await closeMcpCallTool(orgInfo.name, {});
    if (!call.ok) {
      console.error("FAIL:", call.error);
    } else {
      const s = JSON.stringify(call.content);
      console.log(`OK — content (first 600): ${s.slice(0, 600)}`);
    }
  }
}

main().catch((err) => { console.error("crashed:", err); process.exit(1); });
