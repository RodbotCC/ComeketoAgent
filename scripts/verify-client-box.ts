/**
 * Verify the canonical client-box file contract for active lead folders.
 *
 * This checks the whole application-facing box shape, not only the raw
 * substrate. Missing AI docs are warnings; missing raw docs are errors.
 *
 *   npx tsx scripts/verify-client-box.ts
 *   npx tsx scripts/verify-client-box.ts lead_xxx
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

type Issue = { level: "error" | "warn"; lead_id: string; message: string };

async function main() {
  const { listActiveLeadIds, listLeadFolderFiles } = await import(
    "../src/lib/lead-folder"
  );
  const { CLIENT_BOX_DOCS, LEGACY_CLIENT_BOX_FILES } = await import(
    "../src/lib/client-box-contract"
  );

  const argId = process.argv[2];
  const ids = argId ? [argId] : await listActiveLeadIds();
  const issues: Issue[] = [];

  for (const id of ids) {
    const files = await listLeadFolderFiles(id);
    if (!files) {
      issues.push({ level: "error", lead_id: id, message: "missing folder" });
      continue;
    }

    for (const legacy of LEGACY_CLIENT_BOX_FILES) {
      if (files.has(legacy)) {
        issues.push({
          level: "warn",
          lead_id: id,
          message: `legacy file present: ${legacy}`,
        });
      }
    }

    for (const doc of CLIENT_BOX_DOCS) {
      if (files.has(doc.file)) continue;
      const level = doc.phase === "raw" ? "error" : "warn";
      issues.push({
        level,
        lead_id: id,
        message: `${doc.file} missing (${doc.owner})`,
      });
    }

    const comms = [...files.keys()].filter(
      (f) => f.startsWith("comms/") && f.endsWith(".json"),
    );
    if (comms.length === 0) {
      issues.push({
        level: "warn",
        lead_id: id,
        message: "no raw comm JSON files present",
      });
    }
  }

  const byLead = new Map<string, Issue[]>();
  for (const issue of issues) {
    const bucket = byLead.get(issue.lead_id) ?? [];
    bucket.push(issue);
    byLead.set(issue.lead_id, bucket);
  }

  console.log(`Checked ${ids.length} lead box(es).`);
  for (const id of ids) {
    const leadIssues = byLead.get(id) ?? [];
    if (leadIssues.length === 0) {
      console.log(`  ✓ ${id}`);
      continue;
    }
    console.log(`  ! ${id}`);
    for (const issue of leadIssues) {
      console.log(`      [${issue.level}] ${issue.message}`);
    }
  }

  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  console.log(`\nSummary: ${errors} error(s), ${warns} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
