/**
 * Quick Close saved-search lead probe (POST /data/search/).
 *
 *   npm run close:search-leads -- --q "acme" --limit 25
 *
 * Requires `.env.local` with CLOSE_API_KEY.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("Missing .env.local at", p);
    process.exit(1);
  }
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let q = "";
  let limit = 25;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--q" && argv[i + 1]) {
      q = argv[++i];
    } else if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[++i], 10) || 25);
    }
  }
  return { q, limit };
}

async function main() {
  loadEnvLocal();
  const { q, limit } = parseArgs();
  if (!q.trim()) {
    console.error("Usage: npm run close:search-leads -- --q <close query string> [--limit N]");
    process.exit(1);
  }
  const { closeSearchLeads } = await import("../src/lib/close");
  const leads = await closeSearchLeads(q.trim(), limit);
  console.log(JSON.stringify({ count: leads.length, leads }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
