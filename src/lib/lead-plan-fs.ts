/**
 * Per-lead plan mirror (Phase 4 of harness/ overhaul, 2026-05-05).
 *
 * Writes the latest `SevenDayPlan` for a lead to
 * `harness/leads/{state}/{lead_id}__{slug}/plan.json` after every successful
 * Supabase write. The file is a read-replica that the chat agent and any
 * future LLM regen can consume; Supabase remains the canonical source of
 * truth during this phase.
 *
 * Phase 6 will flip canonicality (file becomes source, Supabase is dropped).
 *
 * All writes are fire-and-forget — caller does NOT await. Failure logs a
 * warning but never breaks the primary Supabase write.
 */

import type { Octokit } from "octokit";
import { findLeadFolderPath, readLeadFile, writeLeadFile } from "./lead-folder";
import { getOctokit } from "./github";
import { closeGetLead } from "./close";
import { logStructured } from "./observability";
import { env } from "./env";
import type { SevenDayPlan, PlanStatus } from "./plan";

const REPO_OWNER = env.GITHUB_LEADS_OWNER || "RodbotCC";
const REPO_NAME = env.GITHUB_LEADS_REPO || "ComeketoAgent";
const REPO_BRANCH = env.GITHUB_LEADS_BRANCH || "main";

type PlanWithMeta = SevenDayPlan & {
  approved_at?: string;
  approved_by?: string;
  killed_at?: string;
  killed_reason?: string;
  _mirror_at?: string;
};

/** Mirror a plan to its lead's harness folder as `plan.json`. Resolves the
 *  lead's display_name via Close to build the slug. Failures swallowed. */
export async function mirrorPlanToFile(plan: PlanWithMeta): Promise<void> {
  try {
    let leadName = plan.close_lead_id;
    try {
      const lead = await closeGetLead(plan.close_lead_id);
      if (lead?.display_name) leadName = lead.display_name;
    } catch {
      // Slug derivation is best-effort. If Close lookup fails, use lead_id
      // as the name — slug stays unique by lead_id prefix.
    }

    const content = JSON.stringify(
      {
        ...plan,
        _mirror_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n";

    await writeLeadFile(plan.close_lead_id, leadName, "plan.json", content, {
      commitMessage: `plan: ${leadName} — ${plan.status} (${plan.plan_id.slice(-8)})`,
    });
  } catch (e) {
    logStructured("warn", "harness.plans", "mirrorPlanToFile failed", {
      plan_id: plan.plan_id,
      close_lead_id: plan.close_lead_id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Read a single lead's current plan from `plan.json`. Returns null if no
 *  folder yet or no plan written. */
export async function readPlanFromFile(
  leadId: string,
): Promise<PlanWithMeta | null> {
  const raw = await readLeadFile(leadId, "plan.json");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlanWithMeta;
  } catch (e) {
    logStructured("warn", "harness.plans", "plan.json parse failed", {
      lead_id: leadId,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Scan every active-state lead folder for `plan.json`. Used by surfaces
 *  that need cross-lead plan visibility (proposals, briefing, /personal).
 *  Concurrency-capped at 8 lanes. At our volume (~50 leads) this is ~5s
 *  worst case; cache-able by callers. */
export async function listAllPlans(opts: {
  state?: "active" | "archive";
  filterStatus?: PlanStatus[];
  limit?: number;
} = {}): Promise<PlanWithMeta[]> {
  const state = opts.state ?? "active";
  const limit = opts.limit ?? 200;
  if (!env.GITHUB_PAT) return [];

  const octo = getOctokit();
  let folders: string[] = [];
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `harness/leads/${state}`,
      ref: REPO_BRANCH,
    });
    const items = Array.isArray(r.data) ? r.data : [r.data];
    for (const it of items) {
      if (
        it &&
        typeof it === "object" &&
        "type" in it &&
        it.type === "dir" &&
        "path" in it &&
        typeof it.path === "string"
      ) {
        folders.push(it.path);
      }
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return [];
    throw e;
  }

  if (folders.length > limit) folders = folders.slice(0, limit);

  const out: PlanWithMeta[] = [];
  let cursor = 0;
  const lanes = Math.min(8, folders.length);
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= folders.length) return;
      const folder = folders[i];
      if (!folder) continue;
      const plan = await readPlanFile(octo, `${folder}/plan.json`);
      if (!plan) continue;
      if (opts.filterStatus && !opts.filterStatus.includes(plan.status)) continue;
      out.push(plan);
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  // Newest-first by generated_at
  out.sort((a, b) =>
    (b.generated_at ?? "").localeCompare(a.generated_at ?? ""),
  );
  return out;
}

/** Find a plan by id by scanning active + archive folders. Slow path —
 *  callers that hit it frequently should cache. */
export async function getPlanByIdFromFiles(
  planId: string,
): Promise<PlanWithMeta | null> {
  for (const state of ["active", "archive"] as const) {
    const all = await listAllPlans({ state });
    const hit = all.find((p) => p.plan_id === planId);
    if (hit) return hit;
  }
  return null;
}

/** Find which lead's folder contains a plan with the given plan_id. */
export async function findLeadIdByPlanId(planId: string): Promise<string | null> {
  const plan = await getPlanByIdFromFiles(planId);
  return plan?.close_lead_id ?? null;
}

/** Read-modify-write a lead's plan.json. Pure helper used by all mutators
 *  to keep the find-by-id pattern consistent. Returns the new plan or
 *  throws if the plan can't be located. */
export async function mutatePlan(
  planId: string,
  mutator: (plan: PlanWithMeta) => PlanWithMeta,
): Promise<PlanWithMeta> {
  const current = await getPlanByIdFromFiles(planId);
  if (!current) {
    throw new Error(`mutatePlan: plan ${planId} not found`);
  }
  const next = mutator(current);
  await mirrorPlanToFile(next);
  return next;
}

async function readPlanFile(
  octo: Octokit,
  path: string,
): Promise<PlanWithMeta | null> {
  try {
    const r = await octo.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: REPO_BRANCH,
    });
    const data = r.data as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    const text = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(text) as PlanWithMeta;
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 404) return null;
    return null;
  }
}

/** Resolve a lead's display_name (used by mirror writers). */
async function resolveLeadName(leadId: string): Promise<string> {
  try {
    const lead = await closeGetLead(leadId);
    if (lead?.display_name) return lead.display_name;
  } catch {
    // ignore
  }
  return leadId;
}

void resolveLeadName; // referenced indirectly; keep export-clean

