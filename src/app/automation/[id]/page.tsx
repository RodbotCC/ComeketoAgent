import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { closeGetWorkflow, closeSequenceBrowserUrl, type CloseWorkflow } from "@/lib/close";
import { env } from "@/lib/env";
import { closeStepsToWorkflow } from "@/lib/close-workflow-graph";
import { AutomationDetailGraph } from "../AutomationDetailGraph";
import { AutomationSubNav } from "../AutomationSubNav";

export const dynamic = "force-dynamic";

function stepSummary(step: CloseWorkflow["steps"][number]): string {
  const skip = new Set(["id", "step_type", "delay"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(step)) {
    if (skip.has(k) || v === undefined || v === null) continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (s.length > 120) parts.push(`${k}: ${s.slice(0, 117)}…`);
    else parts.push(`${k}: ${s}`);
    if (parts.length >= 4) break;
  }
  return parts.join(" · ") || "—";
}

export default async function AutomationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  const id = params.id?.trim();
  if (!id) notFound();

  const statusBack =
    searchParams.status === "active" ||
    searchParams.status === "paused" ||
    searchParams.status === "draft"
      ? searchParams.status
      : "";
  const backHref = statusBack ? `/automation?status=${statusBack}` : "/automation";

  let workflow: CloseWorkflow | null = null;
  let fetchError: string | null = null;

  if (!env.CLOSE_API_KEY) {
    fetchError = "CLOSE_API_KEY is not set — add it to .env.local to load sequences.";
  } else {
    try {
      workflow = (await closeGetWorkflow(id)) as CloseWorkflow;
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  const browserUrl = workflow ? closeSequenceBrowserUrl(workflow) : null;
  const steps = workflow?.steps ?? [];

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="automation" />

      <main className="ag-main ag-main-stack">
        <AutomationSubNav active="sequences" />
        <div className="ag-toolbar">
          <div className="ag-toolbar-l">
            <span className="cme-eyebrow">automation · sequences</span>
            <h1 className="ag-title">{workflow?.name || "Sequence"}</h1>
            <p className="ag-lede muted">
              <Link href={backHref} className="ag-back-link">
                ← All sequences
              </Link>
              {workflow && (
                <>
                  {" "}
                  ·{" "}
                  <span className={`ag-seq-status ag-seq-status-${workflow.status}`}>
                    {workflow.status}
                  </span>
                  {workflow.id && (
                    <>
                      {" "}
                      · <code className="ag-seq-mono">{workflow.id}</code>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="ag-toolbar-r">
            {browserUrl && (
              <a href={browserUrl} target="_blank" rel="noreferrer" className="ag-seq-open">
                Open in Close →
              </a>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="leads-error ag-seq-error">
            <strong>Close API:</strong> {fetchError}
          </div>
        )}

        {!fetchError && workflow && steps.length > 0 && (
          <div className="widget ag-detail-graph-wrap" style={{ marginBottom: 16 }}>
            <h2 className="ag-detail-steps-title">Steps (graph from Close API)</h2>
            <AutomationDetailGraph
              workflow={closeStepsToWorkflow(workflow.id, workflow.name ?? "Sequence", steps)}
            />
          </div>
        )}

        {!fetchError && workflow && (
          <div className="ag-detail-steps widget">
            <h2 className="ag-detail-steps-title">Steps</h2>
            {steps.length === 0 ? (
              <p className="muted ag-detail-empty">No steps on this workflow.</p>
            ) : (
              <div className="ag-step-table">
                <div className="ag-step-row ag-step-row-head">
                  <div className="ag-step-col-ord">#</div>
                  <div className="ag-step-col-type">Type</div>
                  <div className="ag-step-col-delay">Delay</div>
                  <div className="ag-step-col-sum">Summary</div>
                </div>
                {steps.map((step, i) => {
                  const summary = stepSummary(step);
                  return (
                    <div key={step.id || `${i}`} className="ag-step-row">
                      <div className="ag-step-col-ord">{i + 1}</div>
                      <div className="ag-step-col-type">
                        <code className="ag-seq-mono">{step.step_type || "—"}</code>
                      </div>
                      <div className="ag-step-col-delay">{step.delay ?? "—"}</div>
                      <div className="ag-step-col-sum ag-step-summary" title={summary}>
                        {summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
        <span>sequence detail · GET /sequence/{"{id}/"}</span>
        <span>
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>Comeketo Agent</span>
        </span>
      </footer>
    </div>
  );
}
