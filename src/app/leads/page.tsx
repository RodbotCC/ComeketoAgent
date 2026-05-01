import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { closeListLeads, type CloseLead } from "@/lib/close";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * /leads — list of leads in the Close org. Click a row → /lead/{id} (Box).
 * Per Guardrails §A1, this is direct Close REST. No MCP path.
 *
 * Filter: ?owner=andre (default) | all. Per Guardrails §C1 the app
 * primarily works Andre's leads, so that's the default view.
 */

type SearchParams = { owner?: string };

function ownerBadge(lead: CloseLead & { user_id?: string; user_name?: string }) {
  const isAndre = env.CLOSE_USER_ID_ANDRE && lead.user_id === env.CLOSE_USER_ID_ANDRE;
  const isJake = env.CLOSE_USER_ID_JAKE && lead.user_id === env.CLOSE_USER_ID_JAKE;
  if (isAndre) return { label: "Andre", tone: "andre" as const };
  if (isJake) return { label: "Jake", tone: "jake" as const };
  if (lead.user_name) return { label: lead.user_name, tone: "other" as const };
  return { label: "—", tone: "other" as const };
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // Default to Andre's leads (the worked surface per Guardrails §C1).
  const ownerFilter = searchParams.owner === "all" ? "all" : "andre";

  let allLeads: Array<CloseLead & { user_id?: string; user_name?: string }> = [];
  let fetchError: string | null = null;
  try {
    // Pull a wider page so the local filter has room to work. Server-side
    // filter would need a `query=lead_owner_id:...` string; doing it
    // locally for now since the practice org is small.
    allLeads = (await closeListLeads({ limit: 100 })) as Array<
      CloseLead & { user_id?: string; user_name?: string }
    >;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const leads =
    ownerFilter === "andre" && env.CLOSE_USER_ID_ANDRE
      ? allLeads.filter((l) => l.user_id === env.CLOSE_USER_ID_ANDRE)
      : allLeads;
  const andreCount = env.CLOSE_USER_ID_ANDRE
    ? allLeads.filter((l) => l.user_id === env.CLOSE_USER_ID_ANDRE).length
    : 0;

  return (
    <div className="cme-shell">
      <AppHeader wordmarkHref="/" />
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
                href="/leads?owner=andre"
                className={`leads-filter-pill${ownerFilter === "andre" ? " active" : ""}`}
              >
                Andre <span className="leads-filter-count">{andreCount}</span>
              </Link>
              <Link
                href="/leads?owner=all"
                className={`leads-filter-pill${ownerFilter === "all" ? " active" : ""}`}
              >
                All <span className="leads-filter-count">{allLeads.length}</span>
              </Link>
            </div>
            <span className="leads-count">
              {fetchError ? "—" : `${leads.length} shown`}
            </span>
          </div>
        </div>

        {fetchError ? (
          <div className="leads-error">
            <strong>Close API error:</strong> {fetchError}
          </div>
        ) : leads.length === 0 ? (
          <div className="leads-empty">No leads in this org.</div>
        ) : (
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
              return (
                <Link key={l.id} href={`/lead/${l.id}`} className="leads-row leads-row-link">
                  <div className="leads-col-name">
                    <span className="leads-name">{l.display_name || l.name || "(unnamed)"}</span>
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
