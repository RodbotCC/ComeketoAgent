/**
 * One-shot, idempotent: pull the newest 25 Andre-tagged leads from Close and
 * lay down their raw substrate folders under `harness/leads/active/`.
 *
 * After the first run, additional new Andre leads land via the hourly cron;
 * this script is fine to re-run any time as a manual refresh — byte-stable
 * writes mean it produces zero commits when nothing changed.
 *
 * Run from repo root: npx tsx scripts/seed-active-25.ts
 *
 * Flags:
 *   --limit N    Override Close fetch cap (default 200; the seed cap of 25
 *                is enforced inside sweepActiveLeads on first run).
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

function parseLimit(): number | undefined {
  const i = process.argv.indexOf("--limit");
  if (i >= 0 && process.argv[i + 1]) {
    const n = Number(process.argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

async function main() {
  // Dynamic import after env is loaded so the env module captures values.
  const { sweepActiveLeads } = await import("../src/lib/lead-folder-sweeper");

  const limit = parseLimit();
  console.log(
    "Sweeping active leads from Close…" +
      (limit ? ` (Close fetch limit=${limit})` : ""),
  );
  const t0 = Date.now();
  const summary = await sweepActiveLeads(limit ? { limit } : undefined);
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);

  console.log();
  console.log(
    `Considered: ${summary.considered}   In scope: ${summary.in_scope}   ` +
      `Seed run: ${summary.seed_run}   Time: ${seconds}s`,
  );
  console.log();

  if (summary.swept.length) {
    console.log("Swept:");
    for (const r of summary.swept) {
      console.log(
        `  • ${r.name.padEnd(40)} wrote ${r.written}  unchanged ${r.skipped_identical}  total ${r.total_rendered}  (${r.duration_ms}ms)`,
      );
    }
    console.log();
  }
  if (summary.archived.length) {
    console.log("Archived (terminal status):");
    for (const a of summary.archived) {
      console.log(`  • ${a.name.padEnd(40)} moved ${a.moved} files`);
    }
    console.log();
  }
  if (summary.errors.length) {
    console.log("Errors:");
    for (const e of summary.errors) {
      console.log(
        `  ! ${(e.name ?? e.lead_id).padEnd(40)} ${e.message}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
