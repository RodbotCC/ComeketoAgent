/**
 * Wipe ALL client-lead-scoped data from Supabase auxiliary tables.
 * Files (harness/leads/*, harness/ledger, harness/approvals, harness/heartbeat)
 * are wiped separately via git rm. This script handles the DB side only.
 *
 * Run from repo root: npx tsx scripts/wipe-client-data.ts
 *
 * Reads .env.local for SUPABASE_URL + SUPABASE_SECRET_KEY.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
if (!url || !key) {
  console.error("SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Tables that hold lead-scoped or activity data populated from Close.
// Order: children before parents (FKs).
const TABLES: Array<{ name: string; pk: string }> = [
  { name: "messages", pk: "id" },
  { name: "threads", pk: "id" },
  { name: "intake_artifacts", pk: "id" },
  { name: "lead_assets", pk: "id" },
  { name: "automation_drafts", pk: "id" },
  { name: "lead_activity_touches", pk: "lead_id" },
  { name: "close_webhook_events", pk: "id" },
  { name: "execution_log", pk: "id" },
  { name: "approval_audit", pk: "id" },
];

async function wipeTable(name: string, pk: string) {
  const { error, count } = await sb
    .from(name)
    .delete({ count: "exact" })
    .not(pk, "is", null);
  if (error) {
    console.log(`  ${name}: SKIP (${error.message})`);
    return;
  }
  console.log(`  ${name}: ${count ?? "?"} rows deleted`);
}

async function main() {
  console.log("Wiping Supabase auxiliary lead-data tables…");
  for (const t of TABLES) {
    await wipeTable(t.name, t.pk);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
