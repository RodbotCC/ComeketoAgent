import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { listAutomationDrafts } from "@/lib/automation-drafts";
import { createAutomationDraftFormAction } from "../actions";
import { AutomationSubNav } from "../AutomationSubNav";

export const dynamic = "force-dynamic";

export default async function AutomationDraftsPage() {
  let drafts: Awaited<ReturnType<typeof listAutomationDrafts>> = [];
  let err: string | null = null;
  try {
    drafts = await listAutomationDrafts();
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="automation" />

      <main className="ag-main ag-main-stack">
        <AutomationSubNav active="drafts" />
        <div className="ag-toolbar">
          <div className="ag-toolbar-l">
            <span className="cme-eyebrow">automation · drafts</span>
            <h1 className="ag-title">Sequence drafts</h1>
            <p className="ag-lede muted">
              In-app design artifacts stored in Supabase. AI proposes Close-shaped steps; you review and approve
              before publish (Guardrails publish gate).
            </p>
          </div>
          <div className="ag-toolbar-r" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <form action={createAutomationDraftFormAction}>
              <button type="submit" className="plan-btn plan-btn-primary">
                New draft
              </button>
            </form>
          </div>
        </div>

        {err && (
          <div className="leads-error">
            <strong>Drafts:</strong> {err}{" "}
            <span className="muted">
              (If the table is missing, apply the latest Supabase migration for <code>automation_drafts</code>.)
            </span>
          </div>
        )}

        {!err && drafts.length === 0 && (
          <div className="widget ag-draft-empty">
            <p className="muted" style={{ margin: "0 0 12px", maxWidth: "42rem", lineHeight: 1.45 }}>
              No drafts yet. Use <strong>New draft</strong> above to start a sequence design, then refine in chat
              or publish to Close when the steps look right.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              <Link href="/automation">Live sequences</Link>
              {" · "}
              <Link href="/automation/workflows">Workflow canvas</Link>
            </p>
          </div>
        )}
        {!err && drafts.length > 0 && (
          <ul className="widget" style={{ listStyle: "none", padding: "12px 16px", margin: 0 }}>
            {drafts.map((d) => (
              <li
                key={d.id}
                style={{ padding: "10px 0", borderBottom: "0.5px solid var(--rule)" }}
              >
                <Link href={`/automation/drafts/${encodeURIComponent(d.id)}`} style={{ fontWeight: 600 }}>
                  {d.name}
                </Link>
                <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                  {d.status}
                </span>
                {d.close_sequence_id && (
                  <span className="muted" style={{ marginLeft: 8, fontSize: 10 }}>
                    Close: <code>{d.close_sequence_id.slice(0, 12)}…</code>
                  </span>
                )}
                <div className="muted" style={{ fontSize: 10 }}>
                  updated {new Date(d.updated_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
