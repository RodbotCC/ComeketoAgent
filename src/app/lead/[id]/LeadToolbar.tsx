import Link from "next/link";
import type { LeadBoxPageData } from "./load-lead-box";
import { AutoRefresh } from "./AutoRefresh";
import { BoxActivityWatch } from "./BoxActivityWatch";

function fmtDateOnly(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function LeadToolbar({ data }: { data: LeadBoxPageData }) {
  const { box, gate, ownerName, leadId, whLatestAt } = data;
  const { lead } = box;

  return (
    <div className="lead-toolbar">
      <div className="lead-toolbar-l">
        <div className="cme-eyebrow">
          <Link href="/leads" className="lead-back">
            ← leads
          </Link>
        </div>
        <h1 className="lead-title">{lead.display_name || lead.name || "(unnamed)"}</h1>
        <div className="lead-sub">
          <span className="lead-status">{lead.status_label || "—"}</span>
          <span className="lead-sep">·</span>
          <span>
            owner: <strong>{ownerName}</strong>
          </span>
          <span className="lead-sep">·</span>
          <span>created {fmtDateOnly(lead.date_created)}</span>
          {lead.date_updated && (
            <>
              <span className="lead-sep">·</span>
              <span>updated {fmtDateOnly(lead.date_updated)}</span>
            </>
          )}
        </div>
      </div>
      <div className="lead-toolbar-r-stack">
        <div className={`lead-gate lead-gate-${gate.tone}`}>{gate.label}</div>
        <AutoRefresh intervalMs={30000} />
        <BoxActivityWatch leadId={leadId} initialLatestReceivedAt={whLatestAt} />
      </div>
    </div>
  );
}
