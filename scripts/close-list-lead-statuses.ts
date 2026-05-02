/**
 * List Close lead statuses (picklist) for the configured org.
 *
 *   npm run close:list-lead-statuses
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

async function main() {
  loadEnvLocal();
  const { closeListLeadStatuses } = await import("../src/lib/close");
  const statuses = await closeListLeadStatuses();
  console.log(JSON.stringify({ count: statuses.length, statuses }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
