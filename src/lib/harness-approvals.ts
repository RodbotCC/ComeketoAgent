/**
 * Approval audit ledger (Phase 5 of harness/ overhaul, 2026-05-05).
 *
 * Mirrors every `logApprovalChange` row to `harness/approvals/YYYY-MM.jsonl`
 * (monthly partition — lower volume than the main ledger). Append-only.
 *
 * Phase 5 is dual-write alongside Supabase `approval_audit`. Phase 6 will
 * cut over to file-canonical and drop the Supabase side.
 */

import type { Octokit } from "octokit";
import { env } from "./env";
import { getOctokit } from "./github";
import { logStructured } from "./observability";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

const RETRY_DELAYS_MS = [80, 240, 600];

export type ApprovalAuditRow = {
  at: string;
  plan_id: string;
  day_index: number | null;
  from_status: string;
  to_status: string;
  actor: string | null;
  reason: string | null;
  based_on_snapshot_id: string | null;
};

export async function appendApprovalAudit(row: ApprovalAuditRow): Promise<void> {
  if (!env.GITHUB_PAT) return;
  const path = approvalsPathForDate(new Date(row.at));
  const line = JSON.stringify(row) + "\n";
  const octo = getOctokit();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const existing = await readFileWithSha(octo, path);
      const newContent = (existing?.content ?? "") + line;
      await octo.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        message: `approvals: ${row.from_status}→${row.to_status} (${row.plan_id.slice(-8)} d${row.day_index ?? "?"})`,
        content: Buffer.from(newContent, "utf-8").toString("base64"),
        sha: existing?.sha,
        branch: REPO_BRANCH,
      });
      return;
    } catch (e: unknown) {
      lastError = e;
      const status = (e as { status?: number }).status;
      if (status === 409 || status === 422) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          await sleep(delay);
          continue;
        }
      }
      logStructured("warn", "harness.approvals", "appendApprovalAudit failed", {
        path,
        plan_id: row.plan_id,
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }
  logStructured("warn", "harness.approvals", "appendApprovalAudit exhausted retries", {
    path,
    plan_id: row.plan_id,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

function approvalsPathForDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `harness/approvals/${yyyy}-${mm}.jsonl`;
}

async function readFileWithSha(
  octo: Octokit,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string; sha?: string };
    if (!data.content || data.encoding !== "base64" || !data.sha) return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const __TEST_ONLY = { approvalsPathForDate };
