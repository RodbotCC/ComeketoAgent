import { hydrateLead } from "./close-hydrate";
import { renderLeadFolder, type FileMap } from "./lead-folder-renderer";
import {
  archiveLead,
  listActiveLeadIds,
  listLeadFolderFiles,
  writeLeadFile,
} from "./lead-folder";
import {
  closeListLeadsByAssignee,
  isOwnedByAndre,
  type CloseLead,
} from "./close";
import { env } from "./env";
import { manualClientBoxPlaceholders } from "./client-box-contract";

const CONCURRENCY = 3;

/**
 * On a first-run install (zero folders under `harness/leads/active/`), seed
 * with the newest N Andre-tagged leads by `date_created` desc. On every
 * subsequent run the active set grows naturally — new Andre leads created
 * in Close land in active/ on the next sweep tick, and active-set entries
 * archive out only when they hit a terminal status.
 */
const INITIAL_SEED_CAP = 25;

/** Status labels we treat as terminal — folder belongs in `harness/leads/archive/`,
 *  not active. Match the emoji-prefixed labels used in Comeketo's Close org. */
const TERMINAL_STATUS_LABELS = new Set([
  "✅ Won",
  "🔴 Lost",
  "🔴 Not Interested",
]);

export type SweepLeadResult = {
  lead_id: string;
  name: string;
  written: number;
  skipped_identical: number;
  total_rendered: number;
  duration_ms: number;
};

export type ArchiveResult = {
  lead_id: string;
  name: string;
  moved: number;
};

export type SweepActiveLeadsSummary = {
  considered: number;
  in_scope: number;
  seed_run: boolean;
  swept: SweepLeadResult[];
  archived: ArchiveResult[];
  errors: Array<{ lead_id: string; name?: string; message: string }>;
  started_at: string;
  finished_at: string;
};

/** Sweep a single lead. Idempotent: re-running produces zero commits when
 *  nothing in Close changed since the last sweep. */
export async function sweepLead(leadId: string): Promise<SweepLeadResult> {
  const t0 = Date.now();
  const hydration = await hydrateLead(leadId);
  const rendered: FileMap = renderLeadFolder(hydration);
  const existing = (await listLeadFolderFiles(leadId)) ?? new Map();

  let written = 0;
  let skipped = 0;
  for (const [relPath, content] of rendered.entries()) {
    const prior = existing.get(relPath);
    if (prior && prior.content === content) {
      skipped++;
      continue;
    }
    await writeLeadFile(
      leadId,
      hydration.lead.display_name,
      relPath,
      content,
      {
        commitMessage:
          `sweep: ${hydration.lead.display_name} — ${relPath}` +
          (prior ? " (update)" : " (create)"),
      },
    );
    written++;
  }

  for (const [relPath, content] of manualClientBoxPlaceholders(
    hydration.lead.display_name,
  ).entries()) {
    if (existing.has(relPath)) {
      skipped++;
      continue;
    }
    await writeLeadFile(leadId, hydration.lead.display_name, relPath, content, {
      commitMessage: `box: ${hydration.lead.display_name} — scaffold ${relPath}`,
    });
    written++;
  }

  return {
    lead_id: leadId,
    name: hydration.lead.display_name,
    written,
    skipped_identical: skipped,
    total_rendered:
      rendered.size + manualClientBoxPlaceholders(hydration.lead.display_name).size,
    duration_ms: Date.now() - t0,
  };
}

/** Decide whether a lead is in scope for the sweeper.
 *  Owned by Andre (custom-field tag in this org) AND status not terminal. */
export function isLeadInScope(lead: CloseLead): boolean {
  if (!isOwnedByAndre(lead)) return false;
  if (lead.status_label && TERMINAL_STATUS_LABELS.has(lead.status_label)) {
    return false;
  }
  return true;
}

/** True when the lead's status_label says the lifecycle is over. */
function isTerminalStatus(lead: CloseLead): boolean {
  return !!(
    lead.status_label && TERMINAL_STATUS_LABELS.has(lead.status_label)
  );
}

/**
 * Sweep the active universe.
 *
 *  1. Pull all Andre-tagged leads from Close.
 *  2. List existing folders under `harness/leads/active/`.
 *  3. Compute the active universe:
 *     - existing-folder leads (refresh + check for terminal transition)
 *     - PLUS any new non-terminal Andre lead not yet in active/
 *     - PLUS, on first-run only (zero existing folders), seed with newest
 *       INITIAL_SEED_CAP non-terminal leads by `date_created` desc.
 *  4. For each lead in the universe:
 *     - terminal status → `archiveLead()` (skip the sweep — folder moves to archive/)
 *     - else → `sweepLead()` (write the raw substrate)
 *  5. Per-file SHA-diff inside `sweepLead` makes unchanged content a no-op.
 */
export async function sweepActiveLeads(opts: {
  /** Optional override of how many leads to fetch from Close. Defaults to 200
   *  (Close's per-call cap is usually plenty). */
  limit?: number;
} = {}): Promise<SweepActiveLeadsSummary> {
  const startedAt = new Date().toISOString();

  const allFromClose = env.CLOSE_USER_ID_ANDRE
    ? await closeListLeadsByAssignee(env.CLOSE_USER_ID_ANDRE, opts.limit ?? 200)
    : [];

  // Andre filter is already applied by closeListLeadsByAssignee in tag mode,
  // but be defensive in case callers run without the env tag set.
  const andreLeads = allFromClose.filter(isOwnedByAndre);

  const existingActiveIds = new Set(await listActiveLeadIds());
  const seedRun = existingActiveIds.size === 0;

  // Build an id→lead map so we can dispatch by lead_id.
  const leadById = new Map<string, CloseLead>();
  for (const l of andreLeads) leadById.set(l.id, l);

  // Active universe: existing folders ∪ new non-terminal leads (or seed set
  // on first run).
  const universeIds = new Set<string>();

  // Existing folders always stay in scope until archived.
  for (const id of existingActiveIds) universeIds.add(id);

  if (seedRun) {
    // First run — seed with the newest N non-terminal leads by date_created.
    const seed = andreLeads
      .filter((l) => !isTerminalStatus(l))
      .slice()
      .sort((a, b) =>
        ((b as { date_created?: string }).date_created ?? "").localeCompare(
          (a as { date_created?: string }).date_created ?? "",
        ),
      )
      .slice(0, INITIAL_SEED_CAP);
    for (const l of seed) universeIds.add(l.id);
  } else {
    // Steady state — every new non-terminal Andre lead joins.
    for (const l of andreLeads) {
      if (!isTerminalStatus(l)) universeIds.add(l.id);
    }
  }

  const swept: SweepLeadResult[] = [];
  const archived: ArchiveResult[] = [];
  const errors: SweepActiveLeadsSummary["errors"] = [];

  // Split into archive vs sweep buckets up front so we can pipeline.
  const toArchive: Array<{ id: string; name: string }> = [];
  const toSweep: string[] = [];

  for (const id of universeIds) {
    const lead = leadById.get(id);
    if (!lead) {
      // Folder exists but Close didn't return the lead in the Andre filter.
      // Most common cause: status moved to terminal (closeListLeadsByAssignee
      // currently returns terminal leads too, so this branch is rare —
      // but possible if ownership changed or the lead was deleted).
      // Conservatively leave it alone; flag in errors so we notice.
      errors.push({
        lead_id: id,
        message:
          "folder exists in active/ but lead not in current Andre list — likely re-assigned or deleted",
      });
      continue;
    }
    if (isTerminalStatus(lead)) {
      toArchive.push({ id, name: lead.display_name });
    } else {
      toSweep.push(id);
    }
  }

  // Archive pass — sequential (small N, GitHub API isn't a bottleneck here
  // and parallel branch deletes invite 409s).
  for (const a of toArchive) {
    try {
      const result = await archiveLead(a.id, a.name);
      if ("moved" in result) {
        archived.push({ lead_id: a.id, name: a.name, moved: result.moved });
      }
      // skipped (missing/already-archived) — quiet success
    } catch (e: unknown) {
      errors.push({
        lead_id: a.id,
        name: a.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sweep pass — bounded concurrency.
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= toSweep.length) return;
      const id = toSweep[i];
      if (!id) continue;
      try {
        const result = await sweepLead(id);
        swept.push(result);
      } catch (e: unknown) {
        errors.push({
          lead_id: id,
          name: leadById.get(id)?.display_name,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  const lanes = Math.min(CONCURRENCY, toSweep.length);
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  return {
    considered: andreLeads.length,
    in_scope: universeIds.size,
    seed_run: seedRun,
    swept,
    archived,
    errors,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}
