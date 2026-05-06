import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import {
  closeListLeads,
  closeListLeadsByAssignee,
  closeListLeadsByAssigneeAndStatus,
  closeListLeadStatuses,
  isOwnedByAndre,
  type CloseLead,
  type CloseLeadStatusEntry,
} from "@/lib/close";
import { env } from "@/lib/env";
import { isPracticeSeedLead } from "@/lib/practice-seed";
import { isLeadInScope } from "@/lib/lead-folder-sweeper";
import { listActiveLeadIds } from "@/lib/lead-folder";
import { LeadsTableClient } from "./LeadsTableClient";
import type { LeadRowSeed } from "./LeadActionsRow";

export const dynamic = "force-dynamic";

/**
 * /leads — Andre's working universe. Single-tenant by design: only Andre-owned
 * leads ever surface here, regardless of search or status filter. There is no
 * org-wide widen, no Jake/other operator path, no escape hatch.
 *
 * Query: ?q=term · ?status_id=stat_*. Both filters are intersected with the
 * Andre-ownership gate before render.
 */

type SearchParams = {
  q?: string;
  status_id?: string;
};

function leadsListHref(extra?: { q?: string; status_id?: string }): string {
  const p = new URLSearchParams();
  const qv = extra?.q?.trim();
  if (qv) p.set("q", qv);
  const sid = extra?.status_id?.trim();
  if (sid && /^stat_[A-Za-z0-9]+$/.test(sid)) p.set("status_id", sid);
  const qs = p.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

function sortNewestFirst<T extends { date_created?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ad = a.date_created ? Date.parse(a.date_created) : 0;
    const bd = b.date_created ? Date.parse(b.date_created) : 0;
    return bd - ad;
  });
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const qRaw = typeof searchParams.q === "string" ? searchParams.q : "";
  const q = qRaw.trim();
  const statusRaw = typeof searchParams.status_id === "string" ? searchParams.status_id.trim() : "";
  const statusId = /^stat_[A-Za-z0-9]+$/.test(statusRaw) ? statusRaw : "";

  type LeadRow = CloseLead & { user_id?: string; user_name?: string };
  let leads: LeadRow[] = [];
  let fetchError: string | null = null;
  let statusCatalog: CloseLeadStatusEntry[] = [];
  let totalAndreCount = 0;

  // Pull the set of leads that have harness substrate. The default index
  // shows only these — the "working set" Andre is actually moving on.
  // Unprimed leads can still be found via search (q) or status filter so
  // operators have an escape hatch.
  const primedIds = new Set<string>(await listActiveLeadIds().catch(() => []));

  const andreUserId = env.CLOSE_USER_ID_ANDRE;

  if (!andreUserId) {
    fetchError =
      "CLOSE_USER_ID_ANDRE is not configured. /leads is single-tenant on Andre — set the env var before this page can render.";
  } else {
    try {
      statusCatalog = await closeListLeadStatuses().catch(() => [] as CloseLeadStatusEntry[]);

      // Always Andre. Always. No org-wide path. Filters layer on top.
      if (q) {
        // Search: widen-then-filter (Close `query` cant be intersected with
        // owner server-side). Belt-and-suspenders: also re-check isOwnedByAndre.
        const raw = (await closeListLeads({ limit: 200, query: q })) as LeadRow[];
        const ownedFiltered = raw.filter((l) => isOwnedByAndre(l));
        const statusFiltered = statusId
          ? ownedFiltered.filter((l) => l.status_id === statusId)
          : ownedFiltered;
        // For search, also drop terminal statuses unless explicitly status-filtered.
        const finalFiltered = statusId ? statusFiltered : statusFiltered.filter(isLeadInScope);
        leads = sortNewestFirst(finalFiltered);
      } else if (statusId) {
        // Operator chose a status → trust it (so they can intentionally view
        // Won/Lost/Disqualified inside Andre's universe).
        const raw = (await closeListLeadsByAssigneeAndStatus(andreUserId, statusId, 200)) as LeadRow[];
        leads = sortNewestFirst(raw);
      } else {
        // Default: Andre-owned + non-terminal + has harness substrate. Leads
        // without a primed folder are hidden from the default view — sweep
        // them in (cron / manual /api/cron/sweep-leads) to surface them.
        const owned = (await closeListLeadsByAssignee(andreUserId, 200)) as LeadRow[];
        const inScope = owned.filter(isLeadInScope);
        totalAndreCount = inScope.length;
        const primedOnly = primedIds.size > 0
          ? inScope.filter((l) => primedIds.has(l.id))
          : inScope;
        leads = sortNewestFirst(primedOnly);
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  const statusChipLabel =
    statusId && statusCatalog.find((s) => s.id === statusId)?.label;

  const emptyMessage = (() => {
    if (q || statusId) return "No Andre leads match the current search and filters.";
    return "No active Andre-owned leads. Check the owner tag in Close.";
  })();

  return (
    <div className="cme-shell">
      <AppHeader />
      <main className="leads-main">
        <div className="leads-toolbar">
          <div>
            <span className="cme-eyebrow">andre · active</span>
            <h1 className="leads-title">Lead Box index</h1>
          </div>
          <div className="leads-toolbar-r">
            <span
              className="leads-count"
              title={
                !q && !statusId && totalAndreCount > leads.length
                  ? `Showing ${leads.length} primed leads (Andre owns ${totalAndreCount} active total). Unprimed leads are hidden — find them via search or status filter, or run a sweep.`
                  : undefined
              }
            >
              {!q && !statusId && totalAndreCount > leads.length
                ? `${leads.length} primed · ${totalAndreCount - leads.length} unswept`
                : `${leads.length} leads`}
            </span>
          </div>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sky cmk-stack-panel--tight-top cmk-leads-filter-panel">
          <form method="get" className="leads-search-form" action="/leads">
            <input
              type="search"
              name="q"
              defaultValue={qRaw}
              placeholder="Search Andre's leads…"
              className="leads-search-input"
              aria-label="Search Andre's leads"
            />
            <select
              name="status_id"
              defaultValue={statusId}
              className="leads-search-select"
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {statusCatalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id}
                </option>
              ))}
            </select>
            <button type="submit" className="leads-search-submit">
              Apply
            </button>
            {(q || statusId) && (
              <Link href={leadsListHref()} className="leads-search-clear">
                Clear filters
              </Link>
            )}
          </form>

          {(q || statusId) && (
            <div className="leads-filter-chips">
              {q ? (
                <Link
                  href={leadsListHref({ status_id: statusId || undefined })}
                  className="leads-chip"
                >
                  Search: {q} <span className="leads-chip-x">×</span>
                </Link>
              ) : null}
              {statusId ? (
                <Link
                  href={leadsListHref({ q: q || undefined })}
                  className="leads-chip"
                >
                  Status: {statusChipLabel || statusId} <span className="leads-chip-x">×</span>
                </Link>
              ) : null}
            </div>
          )}
        </div>

        {fetchError && (
          <div className="leads-error">
            <strong>Close API:</strong> {fetchError}
          </div>
        )}

        {!fetchError && leads.length === 0 && (
          <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top cmk-leads-results-panel">
            <div className="leads-empty">{emptyMessage}</div>
          </div>
        )}

        {!fetchError && leads.length > 0 && (
          <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top cmk-leads-results-panel">
            <LeadsTableClient
              seeds={leads.map<LeadRowSeed>((l) => ({
                lead_id: l.id,
                display_name: l.display_name || l.name || "(unnamed)",
                status_label: l.status_label ?? null,
                status_id: l.status_id ?? null,
                date_created: l.date_created ?? null,
                date_updated: l.date_updated ?? null,
                is_practice: isPracticeSeedLead(l.description),
              }))}
            />
          </div>
        )}
      </main>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 28px",
          fontSize: 10.5,
          color: "var(--ink-faint)",
          flexShrink: 0,
          borderTop: "0.5px solid rgba(0,0,0,0.05)",
        }}
      >
        <span>andre · active universe</span>
        <span>direct Close REST</span>
      </footer>
    </div>
  );
}
