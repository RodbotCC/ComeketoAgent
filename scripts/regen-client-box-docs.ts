/**
 * Regenerate AI-owned client-box docs from the raw substrate.
 *
 * All leads:
 *   npx tsx scripts/regen-client-box-docs.ts
 *
 * One lead:
 *   npx tsx scripts/regen-client-box-docs.ts lead_xxx
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
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

async function main() {
  const leadId = process.argv[2];
  const llm = await import("../src/lib/lead-folder-llm");

  if (leadId) {
    const jobs = [
      ["03_comms_interpreted.md", llm.regenerateLeadCommsInterpretation],
      ["04_profile.md", llm.regenerateLeadProfile],
      ["06_discovery.md", llm.regenerateLeadDiscovery],
      ["07_andre_alerts.md", llm.regenerateLeadAndreAlerts],
      ["08_client_ledger.md", llm.regenerateLeadClientLedger],
    ] as const;
    console.log(`Regenerating client-box AI docs for ${leadId}\n`);
    for (const [file, fn] of jobs) {
      const r = await fn(leadId);
      console.log(
        `  ${file.padEnd(26)} ${r.regenerated ? `regenerated (${r.reason})` : `skipped (${r.reason})`}`,
      );
    }
    return;
  }

  const summary = await llm.regenerateAllLeadDocs();
  console.log(
    `Considered ${summary.considered}; in scope ${summary.in_scope}; errors ${summary.errors.length}`,
  );
  console.log("  comms     ", summary.comms);
  console.log("  profile   ", summary.profile);
  console.log("  discovery ", summary.discovery);
  console.log("  alerts    ", summary.alerts);
  console.log("  ledger    ", summary.ledger);
  for (const e of summary.errors.slice(0, 20)) {
    console.log(`  ! ${e.file} ${e.name ?? e.lead_id}: ${e.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
