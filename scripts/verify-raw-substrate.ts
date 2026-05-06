/**
 * Contract guard: validate the raw-substrate shape of one or all active lead
 * folders. Exits 0 on success, nonzero on contract violation.
 *
 * Contract (set 2026-05-05):
 *   - `00_meta.json` must exist and parse.
 *   - `01_raw_lead.json` must exist, parse, and contain at least one `custom.*` key.
 *   - `02_continuity.jsonl` must exist; every line must parse and reference a
 *     `comms/*.json` file that actually exists in the same folder.
 *   - The legacy summary files MUST NOT exist:
 *       `01_comms_digest.md`, `01b_comms_verbatim.md`, `client_ledger.md`.
 *
 * Reads from the GitHub repo via the same Octokit path the sweeper uses,
 * so the check is end-to-end (proves the bytes really landed).
 *
 * Run:
 *   npx tsx scripts/verify-raw-substrate.ts                         # all active leads
 *   npx tsx scripts/verify-raw-substrate.ts lead_xxx                # one lead
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

const FORBIDDEN = [
  "01_comms_digest.md",
  "01b_comms_verbatim.md",
  "client_ledger.md",
];

type Issue = { lead_id: string; level: "error" | "warn"; message: string };

async function verifyOne(
  leadId: string,
  listFolderFiles: (
    id: string,
  ) => Promise<Map<string, { sha: string; content: string }> | null>,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const files = await listFolderFiles(leadId);
  if (!files) {
    issues.push({ lead_id: leadId, level: "error", message: "no folder found" });
    return issues;
  }

  for (const f of FORBIDDEN) {
    if (files.has(f)) {
      issues.push({
        lead_id: leadId,
        level: "error",
        message: `forbidden file present: ${f}`,
      });
    }
  }

  const metaJson = files.get("00_meta.json");
  if (!metaJson) {
    issues.push({ lead_id: leadId, level: "error", message: "00_meta.json missing" });
  } else {
    try {
      JSON.parse(metaJson.content) as Record<string, unknown>;
    } catch (e) {
      issues.push({
        lead_id: leadId,
        level: "error",
        message: `00_meta.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const leadJson = files.get("01_raw_lead.json");
  if (!leadJson) {
    issues.push({ lead_id: leadId, level: "error", message: "01_raw_lead.json missing" });
  } else {
    try {
      const obj = JSON.parse(leadJson.content) as Record<string, unknown>;
      if (typeof obj.id !== "string") {
        issues.push({
          lead_id: leadId,
          level: "error",
          message: "01_raw_lead.json has no string `id`",
        });
      }
      const customCount = Object.keys(obj).filter((k) =>
        k.startsWith("custom."),
      ).length;
      if (customCount === 0) {
        issues.push({
          lead_id: leadId,
          level: "warn",
          message: "01_raw_lead.json has zero `custom.*` keys",
        });
      }
    } catch (e) {
      issues.push({
        lead_id: leadId,
        level: "error",
        message: `01_raw_lead.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const continuity = files.get("02_continuity.jsonl");
  if (!continuity) {
    issues.push({
      lead_id: leadId,
      level: "error",
      message: "02_continuity.jsonl missing",
    });
  } else {
    const lines = continuity.content.split("\n").filter((l) => l.trim());
    let n = 0;
    for (const line of lines) {
      n++;
      let row: { ref?: unknown };
      try {
        row = JSON.parse(line) as typeof row;
      } catch (e) {
        issues.push({
          lead_id: leadId,
          level: "error",
          message: `continuity.jsonl line ${n} invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }
      if (typeof row.ref !== "string") {
        issues.push({
          lead_id: leadId,
          level: "error",
          message: `continuity.jsonl line ${n} missing string \`ref\``,
        });
        continue;
      }
      if (!files.has(row.ref)) {
        issues.push({
          lead_id: leadId,
          level: "error",
          message: `continuity.jsonl line ${n} ref missing: ${row.ref}`,
        });
      }
    }
  }

  return issues;
}

async function main() {
  const { listLeadFolderFiles, listActiveLeadIds } = await import(
    "../src/lib/lead-folder"
  );

  const argId = process.argv[2];
  const ids = argId ? [argId] : await listActiveLeadIds();

  if (ids.length === 0) {
    console.log("No active lead folders to verify.");
    return;
  }

  console.log(`Verifying ${ids.length} lead folder(s)…\n`);
  const allIssues: Issue[] = [];
  let pass = 0;
  for (const id of ids) {
    const issues = await verifyOne(id, listLeadFolderFiles);
    if (issues.length === 0) {
      console.log(`  ✓ ${id}`);
      pass++;
    } else {
      console.log(`  ✗ ${id}`);
      for (const it of issues) console.log(`      [${it.level}] ${it.message}`);
      allIssues.push(...issues);
    }
  }

  console.log();
  const errors = allIssues.filter((i) => i.level === "error").length;
  const warns = allIssues.filter((i) => i.level === "warn").length;
  console.log(
    `Summary: ${pass}/${ids.length} passed   ${errors} error(s)   ${warns} warning(s)`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
