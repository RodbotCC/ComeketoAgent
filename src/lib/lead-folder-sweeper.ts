import { hydrateLead } from "./close-hydrate";
import { renderLeadFolder, type FileMap } from "./lead-folder-renderer";
import {
  listLeadFolderFiles,
  writeLeadFile,
} from "./lead-folder";
import { closeListLeadsByAssignee, type CloseLead } from "./close";
import { env } from "./env";

const CONCURRENCY = 3;

/** Status labels we treat as terminal (lead is done; folder belongs in
 *  `harness/leads/archive/`, not `harness/leads/active/`). Match Andre's Close org's
 *  emoji-prefixed labels. The exact strings are confirmed at first sweep
 *  smoke; if a label drifts, sweep simply doesn't filter that label out
 *  (over-includes, harmless). */
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

export type SweepActiveLeadsSummary = {
  considered: number;
  in_scope: number;
  swept: SweepLeadResult[];
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

  return {
    lead_id: leadId,
    name: hydration.lead.display_name,
    written,
    skipped_identical: skipped,
    total_rendered: rendered.size,
    duration_ms: Date.now() - t0,
  };
}

/** Decide whether a lead is in scope for the sweeper. Andre-owned + status
 *  not in (Won/Lost/Not-Interested). Pure helper, exposed for testing. */
export function isLeadInScope(lead: CloseLead): boolean {
  if (env.CLOSE_USER_ID_ANDRE && lead.user_id !== env.CLOSE_USER_ID_ANDRE) {
    return false;
  }
  if (lead.status_label && TERMINAL_STATUS_LABELS.has(lead.status_label)) {
    return false;
  }
  return true;
}

/** Sweep every Andre-owned, in-progress lead with concurrency 3. Per-lead
 *  errors are caught and reported; the sweep continues. */
export async function sweepActiveLeads(opts: {
  /** Optional override of how many leads to fetch. Defaults to 200 (Close's
   *  per-call cap), which is enough at our scale. Pass smaller for tests. */
  limit?: number;
} = {}): Promise<SweepActiveLeadsSummary> {
  const startedAt = new Date().toISOString();
  const all = env.CLOSE_USER_ID_ANDRE
    ? await closeListLeadsByAssignee(env.CLOSE_USER_ID_ANDRE, opts.limit ?? 200)
    : [];
  const considered = all.length;
  const inScope = all.filter(isLeadInScope);

  const swept: SweepLeadResult[] = [];
  const errors: SweepActiveLeadsSummary["errors"] = [];

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= inScope.length) return;
      const lead = inScope[i];
      if (!lead) continue;
      try {
        const result = await sweepLead(lead.id);
        swept.push(result);
      } catch (e: unknown) {
        errors.push({
          lead_id: lead.id,
          name: lead.display_name,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const lanes = Math.min(CONCURRENCY, inScope.length);
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  return {
    considered,
    in_scope: inScope.length,
    swept,
    errors,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}
