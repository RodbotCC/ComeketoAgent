/**
 * Verify the new custom-field ownership gate against the live Comeketo Close org.
 *
 * Reads .env.local, then:
 *   1) Fetches a small page of leads via the same path the app uses
 *      (closeListLeadsByAssignee → scanLeadsMatching with custom-field predicate).
 *   2) For each, runs `checkOwnershipAndStatus` and `isOwnedByAndre` to confirm
 *      the gate behavior in isolation.
 *   3) Prints a summary so we can sanity-check before doing anything bigger.
 *
 * Does NOT call the sweeper, write any harness/ files, or touch Supabase.
 *
 * Run from repo root: npx tsx scripts/verify-andre-ownership.ts
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
  // Dynamic import AFTER loadEnvLocal() so env.ts captures the values.
  const { env } = await import("../src/lib/env");
  const { closeListLeadsByAssignee, isOwnedByAndre, checkOwnershipAndStatus } =
    await import("../src/lib/close");

  console.log("─── env ───────────────────────────────────────────────");
  console.log("CLOSE_API_KEY:           ", env.CLOSE_API_KEY ? "set" : "MISSING");
  console.log("CLOSE_USER_ID_ANDRE:     ", env.CLOSE_USER_ID_ANDRE || "MISSING");
  console.log("CLOSE_OWNER_FIELD_ID:    ", env.CLOSE_OWNER_FIELD_ID || "MISSING");
  console.log("CLOSE_OWNER_TAG_ANDRE:   ", env.CLOSE_OWNER_TAG_ANDRE || "MISSING");
  console.log();

  const SAMPLE = 5;
  console.log(`─── closeListLeadsByAssignee(ANDRE, limit=${SAMPLE}) ──`);
  const t0 = Date.now();
  const leads = await closeListLeadsByAssignee(env.CLOSE_USER_ID_ANDRE, SAMPLE);
  const ms = Date.now() - t0;
  console.log(`Returned ${leads.length} lead(s) in ${ms}ms.\n`);

  if (leads.length === 0) {
    console.log("FAIL: zero matches. The custom-field predicate isn't catching anything.");
    process.exit(1);
  }

  console.log("─── per-lead gate check ──────────────────────────────");
  let pass = 0;
  let block = 0;
  for (const lead of leads) {
    const tag =
      env.CLOSE_OWNER_FIELD_ID
        ? (lead as Record<string, unknown>)[`custom.${env.CLOSE_OWNER_FIELD_ID}`]
        : "(no field id)";
    const owned = isOwnedByAndre(lead as never);
    const skip = checkOwnershipAndStatus(lead as never, env.CLOSE_USER_ID_ANDRE);
    const verdict = skip ? `BLOCK[${skip}]` : "PASS";
    if (skip) block++;
    else pass++;
    console.log(
      `  • ${(lead as { display_name?: string }).display_name ?? "(no name)"}\n` +
        `      status: ${(lead as { status_label?: string }).status_label ?? "—"}\n` +
        `      owner-tag: ${JSON.stringify(tag)}\n` +
        `      isOwnedByAndre: ${owned}\n` +
        `      checkOwnershipAndStatus: ${verdict}`
    );
  }

  console.log();
  console.log("─── summary ──────────────────────────────────────────");
  console.log(`PASS (gate open):   ${pass}`);
  console.log(`BLOCK (gate shut):  ${block}`);
  console.log(
    pass > 0
      ? "\n✅ Custom-field gate is working — at least one Andre lead passes."
      : "\n❌ Gate is blocking everything — investigate."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
