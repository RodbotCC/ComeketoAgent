import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import {
  closeListLeads,
  closeListLeadsByAssignee,
  closeListLeadsByAssigneeAndStatus,
  closeListLeadsByStatusId,
  closeListLeadStatuses,
  type CloseLead,
  type CloseLeadStatusEntry,
} from "@/lib/close";
import { env } from "@/lib/env";
import { isPracticeSeedLead } from "@/lib/practice-seed";

export const dynamic = "force-dynamic";

/**
 * /leads — list of leads in the Close org. Click a row → /lead/{id} (Box).
 * Per Guardrails §A1, this is direct Close REST. No MCP path.
 *
 * Query: ?owner=andre (default) | all | jake (when CLOSE_USER_ID_JAKE) · ?seed=practice
 * (GET /lead/?query=) · ?status_id=stat_* (Advanced Filtering; AND with assignee when Andre tab + no ?q).
 */

type SearchParams = {
  owner?: string;
  seed?: string;
  q?: string;
  status_id?: string;
};

function leadsListHref(
  owner: "andre" | "all" | "jake",
  seed: "all" | "practice",
  extra?: { q?: string; status_id?: string }
): string {
  const p = new URLSearchParams();
  if (owner === "all") p.set("owner", "all");
  if (owner === "jake") p.set("owner", "jake");
  if (seed === "practice") p.set("seed", "practice");
  const qv = extra?.q?.trim();
  if (qv) p.set("q", qv);
  const sid = extra?.status_id?.trim();
  if (sid && /^stat_[A-Za-z0-9]+$/.test(sid)) p.set("status_id", sid);
  const qs = p.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

function ownerBadge(lead: CloseLead & { user_id?: string; user_name?: string }) {
  const isAndre = env.CLOSE_USER_ID_ANDRE && lead.user_id === env.CLOSE_USER_ID_ANDRE;
  const isJake = env.CLOSE_USER_ID_JAKE && lead.user_id === env.CLOSE_USER_ID_JAKE;
  if (isAndre) return { label: "Andre", tone: "andre" as const };
  if (isJake) return { label: "Jake", tone: "jake" as const };
  if (lead.user_name) return { label: lead.user_name, tone: "other" as const };
  return { label: "—", tone: "other" as const };
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const ownerFilter: "andre" | "all" | "jake" =
    searchParams.owner === "all"
      ? "all"
      : searchParams.owner === "jake" && env.CLOSE_USER_ID_JAKE
        ? "jake"
        : "andre";
  const seedFilter = searchParams.seed === "practice" ? "practice" : "all";
  const qRaw = typeof searchParams.q === "string" ? searchParams.q : "";
  const q = qRaw.trim();
  const statusRaw = typeof searchParams.status_id === "string" ? searchParams.status_id.trim() : "";
  const statusId = /^stat_[A-Za-z0-9]+$/.test(statusRaw) ? statusRaw : "";

  const assigneeId: string | null =
    ownerFilter === "andre" && env.CLOSE_USER_ID_ANDRE
      ? env.CLOSE_USER_ID_ANDRE
      : ownerFilter === "jake" && env.CLOSE_USER_ID_JAKE
        ? env.CLOSE_USER_ID_JAKE
        : null;

  type LeadRow = CloseLead & { user_id?: string; user_name?: string };
  let leads: LeadRow[] = [];
  let totalAll = 0;
  let andreCount = 0;
  let jakeCount = 0;
  let practiceAllCount = 0;
  let practiceAndreCount = 0;
  let practiceJakeCount = 0;
  let fetchError: string | null = null;
  let statusCatalog: CloseLeadStatusEntry[] = [];

  try {
    const [summary, st] = await Promise.all([
      closeListLeads({ limit: 200 }),
      closeListLeadStatuses().catch(() => [] as CloseLeadStatusEntry[]),
    ]);
    statusCatalog = st;
    const summaryRows = summary as LeadRow[];
    totalAll = summaryRows.length;
    andreCount = env.CLOSE_USER_ID_ANDRE
      ? summaryRows.filter((l) => l.user_id === env.CLOSE_USER_ID_ANDRE).length
      : 0;
    jakeCount = env.CLOSE_USER_ID_JAKE
      ? summaryRows.filter((l) => l.user_id === env.CLOSE_USER_ID_JAKE).length
      : 0;

    practiceAllCount = summaryRows.filter((l) => isPracticeSeedLead(l.description)).length;
    practiceAndreCount =
      env.CLOSE_USER_ID_ANDRE
        ? summaryRows.filter(
            (l) => l.user_id === env.CLOSE_USER_ID_ANDRE && isPracticeSeedLead(l.description)
          ).length
        : 0;
    practiceJakeCount =
      env.CLOSE_USER_ID_JAKE
        ? summaryRows.filter(
            (l) => l.user_id === env.CLOSE_USER_ID_JAKE && isPracticeSeedLead(l.description),
          ).length
        : 0;

    if (q) {
      leads = (await closeListLeads({ limit: 200, query: q })) as LeadRow[];
      if (assigneeId) {
        leads = leads.filter((l) => l.user_id === assigneeId);
      }
      if (statusId) {
        leads = leads.filter((l) => l.status_id === statusId);
      }
    } else if (statusId && assigneeId) {
      leads = (await closeListLeadsByAssigneeAndStatus(assigneeId, statusId, 200)) as LeadRow[];
    } else if (statusId) {
      leads = (await closeListLeadsByStatusId(statusId, 200)) as LeadRow[];
    } else if (assigneeId) {
      leads = (await closeListLeadsByAssignee(assigneeId, 200)) as LeadRow[];
    } else {
      leads = summaryRows;
    }

    if (seedFilter === "practice") {
      leads = leads.filter((l) => isPracticeSeedLead(l.description));
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const hrefCtx = { q: q || undefined, status_id: statusId || undefined };
  const statusChipLabel =
    statusId && statusCatalog.find((s) => s.id === statusId)?.label;

  const practiceFilterCount =
    ownerFilter === "jake"
      ? practiceJakeCount
      : ownerFilter === "andre"
        ? practiceAndreCount
        : practiceAllCount;

  const emptyMessage = (() => {
    if (totalAll === 0) return "No leads in this org.";
    if (seedFilter === "practice") {
      return "No practice-seeded leads in this view. They must live in the same Close org as CLOSE_API_KEY (see npm run seed:practice-leads).";
    }
    if (q || statusId) return "No leads match the current search and filters.";
    return "No leads to show.";
  })();

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="leads" />

      <main className="leads-main">
        <div className="leads-toolbar">
          <div>
            <span className="cme-eyebrow">leads</span>
            <h1 className="leads-title">Lead Box index</h1>
          </div>
          <div className="leads-toolbar-r">
            <div className="leads-filter">
              <Link
                href={leadsListHref("andre", seedFilter, hrefCtx)}
                className={`leads-filter-pill${ownerFilter === "andre" ? " active" : ""}`}
              >
                Andre <span className="leads-filter-count">{andreCount}</span>
              </Link>
              {env.CLOSE_USER_ID_JAKE ? (
                <Link
                  href={leadsListHref("jake", seedFilter, hrefCtx)}
                  className={`leads-filter-pill${ownerFilter === "jake" ? " active" : ""}`}
                >
                  Jake <span className="leads-filter-count">{jakeCount}</span>
                </Link>
              ) : null}
              <Link
                href={leadsListHref("all", seedFilter, hrefCtx)}
                className={`leads-filter-pill${ownerFilter === "all" ? " active" : ""}`}
              >
                All <span className="leads-filter-count">{totalAll}</span>
              </Link>
              <Link
                href={leadsListHref(
                  ownerFilter,
                  seedFilter === "practice" ? "all" : "practice",
                  hrefCtx
                )}
                className={`leads-filter-pill${seedFilter === "practice" ? " active" : ""}`}
                title="Show only leads created by scripts/seed-practice-leads.ts (description marker)"
              >
                Practice{" "}
                <span className="leads-filter-count">
                  {practiceFilterCount}
                </span>
              </Link>
            </div>
            <span className="leads-count">{`${leads.length} shown`}</span>
          </div>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sky cmk-stack-panel--tight-top cmk-leads-filter-panel">
          <form method="get" className="leads-search-form" action="/leads">
            {ownerFilter === "all" ? <input type="hidden" name="owner" value="all" /> : null}
            {ownerFilter === "jake" ? <input type="hidden" name="owner" value="jake" /> : null}
            {seedFilter === "practice" ? <input type="hidden" name="seed" value="practice" /> : null}
            <input
              type="search"
              name="q"
              defaultValue={qRaw}
              placeholder="Search leads…"
              className="leads-search-input"
              aria-label="Search leads"
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
              <Link href={leadsListHref(ownerFilter, seedFilter)} className="leads-search-clear">
                Clear filters
              </Link>
            )}
          </form>

          {(q || statusId) && (
            <div className="leads-filter-chips">
              {q ? (
                <Link
                  href={leadsListHref(ownerFilter, seedFilter, { status_id: statusId || undefined })}
                  className="leads-chip"
                >
                  Search: {q} <span className="leads-chip-x">×</span>
                </Link>
              ) : null}
              {statusId ? (
                <Link
                  href={leadsListHref(ownerFilter, seedFilter, { q: q || undefined })}
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
            <div className="leads-table widget">
              <div className="leads-row leads-row-head">
                <div className="leads-col-name">Lead</div>
                <div className="leads-col-status">Status</div>
                <div className="leads-col-owner">Owner</div>
                <div className="leads-col-meta">Updated</div>
              </div>
              {leads.map((l) => {
                const o = ownerBadge(l);
                const updated = l.date_updated
                  ? new Date(l.date_updated).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—";
                const practice = isPracticeSeedLead(l.description);
                return (
                  <Link key={l.id} href={`/lead/${l.id}`} className="leads-row leads-row-link">
                    <div className="leads-col-name">
                      <span className="leads-name">{l.display_name || l.name || "(unnamed)"}</span>
                      {practice && <span className="leads-practice-badge">practice</span>}
                    </div>
                    <div className="leads-col-status">
                      <span className="leads-status">{l.status_label || "—"}</span>
                    </div>
                    <div className="leads-col-owner">
                      <span className={`leads-owner leads-owner-${o.tone}`}>{o.label}</span>
                    </div>
                    <div className="leads-col-meta">{updated}</div>
                  </Link>
                );
              })}
            </div>
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
        <span>boxes · index</span>
        <span>direct Close REST</span>
      </footer>
    </div>
  );
}
