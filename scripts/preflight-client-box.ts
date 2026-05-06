/**
 * No-write preflight for the real Close -> client-box pipeline.
 *
 * This does not sweep, regenerate, write files, or call OpenAI. It checks the
 * environment, canonical contract, cron schedule, and current active-folder
 * visibility so Jake can run the live seed with eyes open.
 *
 *   npx tsx scripts/preflight-client-box.ts
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
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

type Check = { name: string; ok: boolean; detail: string };

function envCheck(name: string, value: string | undefined, detail: string): Check {
  return {
    name,
    ok: !!value && value.trim().length > 0,
    detail: value && value.trim().length > 0 ? detail : "missing",
  };
}

async function main() {
  loadEnvLocal();

  const { env } = await import("../src/lib/env");
  const { CLIENT_BOX_DOCS } = await import("../src/lib/client-box-contract");
  const { listActiveLeadIds } = await import("../src/lib/lead-folder");

  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const sweepCron = vercel.crons?.find((c) => c.path === "/api/cron/sweep-leads");

  let activeIds: string[] = [];
  let activeReadable = true;
  try {
    activeIds = await listActiveLeadIds();
  } catch (e) {
    activeReadable = false;
    activeIds = [];
    console.log(
      `[warn] Could not read harness/leads/active from GitHub: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const checks: Check[] = [
    envCheck("CLOSE_API_KEY", env.CLOSE_API_KEY, "Close REST available"),
    envCheck("GITHUB_PAT", env.GITHUB_PAT, "GitHub file writes available"),
    envCheck("GITHUB_LEADS_OWNER", env.GITHUB_LEADS_OWNER, env.GITHUB_LEADS_OWNER || "default owner will be used"),
    envCheck("GITHUB_LEADS_REPO", env.GITHUB_LEADS_REPO, env.GITHUB_LEADS_REPO || "default repo will be used"),
    {
      name: "GITHUB_LEADS_BRANCH",
      ok: (env.GITHUB_LEADS_BRANCH || "main") === "main",
      detail: env.GITHUB_LEADS_BRANCH || "main",
    },
    envCheck("CLOSE_OWNER_FIELD_ID", env.CLOSE_OWNER_FIELD_ID, "Andre custom-field ownership enabled"),
    envCheck("CLOSE_OWNER_TAG_ANDRE", env.CLOSE_OWNER_TAG_ANDRE, "Andre owner tag configured"),
    envCheck("CLOSE_USER_ID_ANDRE", env.CLOSE_USER_ID_ANDRE, "Andre fallback/list query id configured"),
    {
      name: "OPENAI_API_KEY",
      ok: !!env.OPENAI_API_KEY,
      detail: env.OPENAI_API_KEY ? "AI interpretation can run" : "missing; raw sweep can run, AI regen cannot",
    },
    {
      name: "sweep cron",
      ok: sweepCron?.schedule === "0 * * * *",
      detail: sweepCron?.schedule || "missing",
    },
    {
      name: "client-box contract",
      ok: CLIENT_BOX_DOCS.length === 11,
      detail: `${CLIENT_BOX_DOCS.length} canonical docs`,
    },
    {
      name: "active folder visibility",
      ok: activeReadable,
      detail: activeReadable
        ? `${activeIds.length} active lead folder(s) visible`
        : "not readable",
    },
  ];

  console.log("Client-box preflight\n");
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name.padEnd(24)} ${c.detail}`);
  }

  console.log("\nCanonical box:");
  for (const doc of CLIENT_BOX_DOCS) {
    console.log(`  ${doc.file.padEnd(26)} ${doc.owner.padEnd(8)} ${doc.phase}`);
  }

  console.log("\nSuggested live sequence:");
  console.log("  1. npm run leads:seed-active");
  console.log("  2. npm run leads:verify-raw");
  console.log("  3. npm run leads:regen-box");
  console.log("  4. npm run leads:verify-box");

  const hardFailures = checks.filter(
    (c) =>
      !c.ok &&
      !["OPENAI_API_KEY", "GITHUB_LEADS_OWNER", "GITHUB_LEADS_REPO"].includes(c.name),
  );
  process.exit(hardFailures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
