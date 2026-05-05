import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { listAutomationDrafts, type AutomationDraftRow } from "@/lib/automation-drafts";
import { closeListWorkflows, type CloseWorkflow, closeSequenceBrowserUrl } from "@/lib/close";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stepCount(d: AutomationDraftRow): number {
  return d.workflow_json?.nodes?.filter((n) => n.kind !== "wait").length ?? 0;
}

export default async function WorkflowsListPage() {
  let drafts: AutomationDraftRow[] = [];
  let published: CloseWorkflow[] = [];
  let err: string | null = null;

  try {
    [drafts, published] = await Promise.all([
      listAutomationDrafts(50),
      closeListWorkflows({ limit: 50 }).catch(() => [] as CloseWorkflow[]),
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  // Drafts that have already been published get the "Published in Close" mirror;
  // hide them from the local Drafts column so we don't show the same workflow twice.
  const liveDrafts = drafts.filter((d) => !d.close_sequence_id);

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="workflows" />
      <main className="cmk-workflows-page scroll-hide">
        <header className="cmk-workflows-hero">
          <div>
            <span className="cme-eyebrow">workflows</span>
            <h1>Tell the AI. See the graph. Publish to Close.</h1>
            <p>
              Andre describes the workflow in plain English; the agent builds the cadence, the
              graph renders live, you tweak via chat, you click publish.
            </p>
          </div>
          <Link href="/workflows/new" className="plan-btn plan-btn-primary cmk-workflows-new-btn">
            + New workflow
          </Link>
        </header>

        {err && (
          <div className="lead-error" style={{ margin: "16px 0" }}>
            <strong>Failed to load:</strong> {err}
          </div>
        )}

        <section className="cmk-workflows-section">
          <div className="cmk-workflows-section-h">
            <span>Drafts</span>
            <strong>{liveDrafts.length}</strong>
          </div>
          {liveDrafts.length === 0 ? (
            <div className="cmk-workflows-empty">
              <p>No drafts yet.</p>
              <Link href="/workflows/new" className="plan-btn">
                Start one →
              </Link>
            </div>
          ) : (
            <div className="cmk-workflows-grid">
              {liveDrafts.map((d) => (
                <Link key={d.id} href={`/workflows/${d.id}`} className="cmk-workflows-card">
                  <div className="cmk-workflows-card-head">
                    <span className={`cmk-workflows-status cmk-workflows-status-${d.status}`}>
                      {d.status}
                    </span>
                    <span className="cmk-workflows-card-meta">
                      {stepCount(d)} {stepCount(d) === 1 ? "step" : "steps"}
                    </span>
                  </div>
                  <strong className="cmk-workflows-card-title">{d.name || "Untitled"}</strong>
                  {d.operator_goal && (
                    <p className="cmk-workflows-card-goal">{d.operator_goal.slice(0, 160)}</p>
                  )}
                  <div className="cmk-workflows-card-foot">Updated {fmtDate(d.updated_at)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="cmk-workflows-section">
          <div className="cmk-workflows-section-h">
            <span>Published in Close</span>
            <strong>{published.length}</strong>
          </div>
          {published.length === 0 ? (
            <div className="cmk-workflows-empty">
              <p>None yet — published workflows show up here once you click Publish.</p>
            </div>
          ) : (
            <div className="cmk-workflows-grid">
              {published.map((w) => {
                const url = closeSequenceBrowserUrl(w);
                return (
                  <a
                    key={w.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cmk-workflows-card cmk-workflows-card-published"
                  >
                    <div className="cmk-workflows-card-head">
                      <span className={`cmk-workflows-status cmk-workflows-status-${w.status}`}>
                        {w.status}
                      </span>
                      <span className="cmk-workflows-card-meta">
                        {w.steps?.length ?? 0} {(w.steps?.length ?? 0) === 1 ? "step" : "steps"}
                      </span>
                    </div>
                    <strong className="cmk-workflows-card-title">{w.name || "Untitled"}</strong>
                    <div className="cmk-workflows-card-foot">
                      {w.date_updated ? `Updated ${fmtDate(w.date_updated)}` : ""}
                      <span className="cmk-workflows-card-link">Open in Close ↗</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
