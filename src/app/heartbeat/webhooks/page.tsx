import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { listRecentCloseWebhookEvents, type CloseWebhookEventRow } from "@/lib/webhook-events";
import { envStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function WebhookEventsPage({
  searchParams,
}: {
  searchParams: { lead_id?: string };
}) {
  const leadFilter = typeof searchParams.lead_id === "string" ? searchParams.lead_id.trim() : "";
  let rows: CloseWebhookEventRow[] = [];
  let err: string | null = null;
  try {
    rows = await listRecentCloseWebhookEvents({ leadId: leadFilter || undefined, limit: 80 });
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const status = envStatus();

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="heartbeat" />

      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <Link href="/heartbeat" className="lead-back">
              ← heartbeat
            </Link>
            <h1 className="hb-page-title">Close webhook ingest</h1>
            <p className="ag-lede muted" style={{ marginTop: 8 }}>
              Last rows from <code>close_webhook_events</code> (same org as <code>CLOSE_API_KEY</code>). Production
              URL: <code>/api/webhooks/close</code>. Signature key:{" "}
              {status.CLOSE_WEBHOOK_SIGNATURE_KEY.set ? "set" : "missing (503 in prod)"}.
            </p>
          </div>
        </div>

        <form className="leads-search-form cmk-stack-panel cmk-stack-panel--sky" method="get" action="/heartbeat/webhooks" style={{ marginTop: 18, padding: "12px 14px 14px" }}>
          <input
            type="search"
            name="lead_id"
            defaultValue={leadFilter}
            placeholder="Filter by lead_id (e.g. lead_abc…)"
            className="leads-search-input"
            aria-label="Lead id filter"
          />
          <button type="submit" className="leads-search-submit">
            Filter
          </button>
          {leadFilter && (
            <Link href="/heartbeat/webhooks" className="leads-search-clear">
              Clear
            </Link>
          )}
        </form>

        {err && (
          <div className="lead-error" style={{ marginBottom: 16 }}>
            <strong>Read failed:</strong> {err}
          </div>
        )}

        {!err && rows.length === 0 && (
          <div className="leads-empty">No webhook rows yet — configure Close → POST to your deployed URL.</div>
        )}

        {!err && rows.length > 0 && (
          <div className="ag-step-table widget" style={{ padding: "12px 14px" }}>
            <div className="ag-step-row ag-step-row-head">
              <div className="ag-step-col-ord">When</div>
              <div>Object</div>
              <div>Action</div>
              <div>Lead</div>
              <div>Sig</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="ag-step-row">
                <div className="ag-step-col-delay" style={{ fontSize: 11 }}>
                  {fmtTime(r.received_at)}
                </div>
                <div>
                  <code className="ag-seq-mono" style={{ fontSize: 10 }}>
                    {r.object_type || "—"}
                  </code>
                </div>
                <div style={{ fontSize: 11 }}>{r.action || "—"}</div>
                <div>
                  {r.lead_id ? (
                    <Link href={`/lead/${r.lead_id}`} className="ag-back-link">
                      <code className="ag-seq-mono" style={{ fontSize: 10 }}>
                        {r.lead_id.length > 20 ? r.lead_id.slice(0, 18) + "…" : r.lead_id}
                      </code>
                    </Link>
                  ) : (
                    "—"
                  )}
                </div>
                <div>{r.signature_verified ? "✓" : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
