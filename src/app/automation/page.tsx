import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { AutomationSubNav } from "./AutomationSubNav";
import { SequencesWorkflowPreview } from "./SequencesWorkflowPreview";
import { closeListWorkflows, closeSequenceBrowserUrl, type CloseWorkflow } from "@/lib/close";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type SearchParams = { status?: string };

type StatusFilter = "all" | "active" | "paused" | "draft";

function automationHref(status: StatusFilter): string {
  if (status === "all") return "/automation";
  return `/automation?status=${status}`;
}

function automationDetailHref(id: string, status: StatusFilter): string {
  const base = `/automation/${encodeURIComponent(id)}`;
  if (status === "all") return base;
  return `${base}?status=${status}`;
}

function stepTypeSummary(w: CloseWorkflow): string {
  const types = [...new Set((w.steps ?? []).map((s) => s.step_type).filter(Boolean))];
  const t = types.slice(0, 8).join(", ");
  return types.length > 8 ? `${t}, …` : t || "—";
}

function normalizeStatus(s: string | undefined): StatusFilter {
  if (s === "active" || s === "paused" || s === "draft") return s;
  return "all";
}

function statusFilterDisplay(s: StatusFilter): string {
  if (s === "all") return "all";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AutomationPage({ searchParams }: { searchParams: SearchParams }) {
  const statusFilter = normalizeStatus(searchParams.status);

  let workflows: CloseWorkflow[] = [];
  let fetchError: string | null = null;

  if (!env.CLOSE_API_KEY) {
    fetchError = "CLOSE_API_KEY is not set — add it to .env.local to load sequences.";
  } else {
    try {
      workflows = await closeListWorkflows({ limit: 100 });
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  const filtered =
    statusFilter === "all" ? workflows : workflows.filter((w) => w.status === statusFilter);

  const countActive = workflows.filter((w) => w.status === "active").length;
  const countPaused = workflows.filter((w) => w.status === "paused").length;
  const countDraft = workflows.filter((w) => w.status === "draft").length;

  const pills: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: workflows.length },
    { key: "active", label: "Active", count: countActive },
    { key: "paused", label: "Paused", count: countPaused },
    { key: "draft", label: "Draft", count: countDraft },
  ];

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="automation" />

      <main className="ag-main ag-main-stack">
        <AutomationSubNav active="sequences" />
        <div className="ag-toolbar">
          <div className="ag-toolbar-l">
            <span className="cme-eyebrow">automation · sequences</span>
            <h1 className="ag-title">Close sequences</h1>
            <p className="ag-lede muted">
              Live from your org API. Open the{" "}
              <Link href="/automation/workflows">workflow canvas</Link> for the Morning Sweep demo graph. Build new flows in{" "}
              <Link href="/automation/drafts">Drafts</Link>, review AI-proposed steps, then publish to Close (operator-confirmed).
            </p>
          </div>
          <div className="ag-toolbar-r" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="ag-toolbar-meta">
              {fetchError ? "—" : `${filtered.length} shown · ${workflows.length} total`}
            </span>
          </div>
        </div>

        <div className="ag-seq-filter">
          {pills.map((p) => (
            <Link
              key={p.key}
              href={automationHref(p.key)}
              className={`leads-filter-pill${statusFilter === p.key ? " active" : ""}`}
            >
              {p.label} <span className="leads-filter-count">{p.count}</span>
            </Link>
          ))}
        </div>

        {fetchError && (
          <div className="leads-error ag-seq-error">
            <strong>Close API:</strong> {fetchError}
          </div>
        )}

        {!fetchError && filtered.length === 0 && workflows.length > 0 ? (
          <div className="widget ag-seq-filter-empty">
            <p className="muted" style={{ margin: 0 }}>
              No sequences with status <strong>{statusFilterDisplay(statusFilter)}</strong>.{" "}
              <Link href={automationHref("all")}>Show all</Link>
              {" · "}
              <Link href="/automation/drafts">Drafts</Link>
            </p>
          </div>
        ) : !fetchError && filtered.length === 0 ? (
          <SequencesWorkflowPreview />
        ) : !fetchError ? (
          <div className="ag-seq-table widget">
            <div className="ag-seq-row ag-seq-row-head">
              <div className="ag-seq-col-name">Sequence</div>
              <div className="ag-seq-col-status">Status</div>
              <div className="ag-seq-col-steps">Steps</div>
              <div className="ag-seq-col-types">Step types</div>
              <div className="ag-seq-col-id">Id</div>
              <div className="ag-seq-col-link">Close</div>
            </div>
            {filtered.map((w) => {
              const browserUrl = closeSequenceBrowserUrl(w);
              const stepCount = w.steps?.length ?? 0;
              const detailHref = automationDetailHref(w.id, statusFilter);
              return (
                <div key={w.id} className="ag-seq-row">
                  <div className="ag-seq-col-name">
                    <Link href={detailHref} className="ag-seq-name-link">
                      <span className="ag-seq-name">{w.name || "(unnamed)"}</span>
                    </Link>
                  </div>
                  <div className="ag-seq-col-status">
                    <span className={`ag-seq-status ag-seq-status-${w.status}`}>{w.status}</span>
                  </div>
                  <div className="ag-seq-col-steps">{stepCount}</div>
                  <div className="ag-seq-col-types ag-seq-types" title={stepTypeSummary(w)}>
                    {stepTypeSummary(w)}
                  </div>
                  <div className="ag-seq-col-id">
                    <Link href={detailHref} className="ag-seq-id-link">
                      <code className="ag-seq-mono">{w.id}</code>
                    </Link>
                  </div>
                  <div className="ag-seq-col-link">
                    <a href={browserUrl} target="_blank" rel="noreferrer" className="ag-seq-open">
                      Open →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

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
        <span>Close · GET /sequence/</span>
        <span>
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>Comeketo Agent</span>
        </span>
      </footer>
    </div>
  );
}
