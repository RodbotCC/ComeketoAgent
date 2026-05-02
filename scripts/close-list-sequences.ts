/**
 * List Close sequences (workflows) for the configured org.
 *
 *   npm run close:list-sequences
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
  const { closeListWorkflows, closeSequenceBrowserUrl } = await import("../src/lib/close");

  const workflows = await closeListWorkflows({ limit: 200 });
  const out = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    step_count: w.steps?.length ?? 0,
    step_types: [...new Set((w.steps ?? []).map((s) => s.step_type))],
    browser_url: closeSequenceBrowserUrl(w),
    html_url: w.html_url,
    date_updated: w.date_updated,
  }));

  console.log(JSON.stringify({ count: out.length, sequences: out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
