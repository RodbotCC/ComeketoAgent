import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { getSettings } from "@/lib/settings";
import { countPlansNeedingReview, countPlansWithStatus } from "@/lib/plans-db";
import { listRecentExecutionGlobal, listExecutionByTraceId, type ExecutionLogRow } from "@/lib/execution-audit";

export const dynamic = "force-dynamic";

const TRACE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function traceQueryParam(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return "";
}

const MODE_LABEL: Record<string, { label: string; tone: "ok" | "live" | "warn" }> = {
  draft_only: { label: "draft only", tone: "ok" },
  approval_required: { label: "approval required", tone: "ok" },
  approved_plan_execution: { label: "live → close", tone: "live" },
  manual_send_only: { label: "manual only", tone: "warn" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortId(id: string | null | undefined, len = 12): string {
  if (!id) return "—";
  return id.length > len ? `${id.slice(0, len - 1)}…` : id;
}

export default async function ConsolePage({
  searchParams,
}: {
  searchParams: { trace?: string | string[] };
}) {
  const settings = await getSettings();
  const modeInfo =
    MODE_LABEL[settings.execution_mode] ?? { label: settings.execution_mode, tone: "ok" as const };

  const traceParam = traceQueryParam(searchParams.trace);
  const traceFiltered = traceParam.length > 0 && TRACE_UUID_RE.test(traceParam);
  const traceInvalid = traceParam.length > 0 && !traceFiltered;

  let pendingReview = 0;
  let activePlans = 0;
  let draftPlans = 0;
  let logRows: ExecutionLogRow[] = [];
  let fetchError: string | null = null;

  try {
    if (traceFiltered) {
      [pendingReview, activePlans, draftPlans, logRows] = await Promise.all([
        countPlansNeedingReview(),
        countPlansWithStatus("active"),
        countPlansWithStatus("draft"),
        listExecutionByTraceId(traceParam, 80),
      ]);
    } else {
      [pendingReview, activePlans, draftPlans, logRows] = await Promise.all([
        countPlansNeedingReview(),
        countPlansWithStatus("active"),
        countPlansWithStatus("draft"),
        listRecentExecutionGlobal(48),
      ]);
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  const logHeading = traceFiltered ? "Execution log · this run" : "Recent execution log";
  const logEmptyMsg = traceFiltered
    ? "No audited rows for this trace yet — only writes and plan generation log here (read-only tools do not)."
    : "No rows yet — heartbeats, writes, and approvals land here.";
  const showTraceColumn = !traceFiltered;

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="console" />

      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <span className="cme-eyebrow">operator</span>
            <h1 className="hb-page-title">Console</h1>
            <p className="ag-lede muted" style={{ marginTop: 8 }}>
              Live posture: execution mode, approval pressure, plan inventory, and the tail of{" "}
              <code className="ag-seq-mono" style={{ fontSize: 10 }}>
                execution_log
              </code>
              .
            </p>
          </div>
          <div className="hb-page-toolbar-r">
            <span className={`hb-mode hb-mode-${modeInfo.tone}`}>{modeInfo.label}</span>
            <span className="hb-page-window cmk-console-model">
              {settings.model.length > 28 ? `${settings.model.slice(0, 26)}…` : settings.model}
            </span>
          </div>
        </div>

        {fetchError && (
          <div className="lead-error" style={{ marginBottom: 16 }}>
            <strong>Console read failed:</strong> {fetchError}
          </div>
        )}

        <div className="cmk-stack-panel cmk-stack-panel--lavender cmk-stack-panel--tight-top cmk-console-kpi">
          <div className="hb-kpi-strip">
          <Link
            href="/approvals"
            className={`hb-kpi-card ${pendingReview > 0 ? "hb-kpi-fire" : ""}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Approval queue</span>
            <span className="hb-kpi-num">{pendingReview}</span>
            <span className="hb-kpi-sub">days in needs_review →</span>
          </Link>
          <Link
            href="/chat"
            className="hb-kpi-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Delegations</span>
            <span className="hb-kpi-num" style={{ fontSize: 22 }}>
              Chat
            </span>
            <span className="hb-kpi-sub">Close tools + agent →</span>
          </Link>
          <Link
            href="/leads"
            className="hb-kpi-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Leads</span>
            <span className="hb-kpi-num" style={{ fontSize: 22 }}>
              Box book
            </span>
            <span className="hb-kpi-sub">browse & open →</span>
          </Link>
          <Link
            href="/heartbeat"
            className="hb-kpi-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Heartbeat</span>
            <span className="hb-kpi-num" style={{ fontSize: 22 }}>
              Sweeps
            </span>
            <span className="hb-kpi-sub">runs & skips →</span>
          </Link>
          <Link
            href="/automation"
            className="hb-kpi-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Automation</span>
            <span className="hb-kpi-num" style={{ fontSize: 22 }}>
              Studio
            </span>
            <span className="hb-kpi-sub">sequences & drafts →</span>
          </Link>
          <Link
            href="/settings"
            className="hb-kpi-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <span className="hb-kpi-label">Settings</span>
            <span className="hb-kpi-num" style={{ fontSize: 22 }}>
              Model
            </span>
            <span className="hb-kpi-sub">horizon {settings.default_plan_horizon_days}d →</span>
          </Link>
          </div>

          <div className="hb-kpi-strip">
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Active plans</span>
            <span className="hb-kpi-num">{activePlans}</span>
            <span className="hb-kpi-sub">status = active (DB)</span>
          </div>
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Draft plans</span>
            <span className="hb-kpi-num">{draftPlans}</span>
            <span className="hb-kpi-sub">status = draft (DB)</span>
          </div>
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Approvals (scan)</span>
            <span className="hb-kpi-num">{pendingReview}</span>
            <span className="hb-kpi-sub">matches approval queue page</span>
          </div>
          </div>
        </div>

        {traceInvalid && (
          <div className="lead-error" style={{ marginBottom: 12 }}>
            Invalid <code className="ag-seq-mono">trace</code> query param — not a UUID. Showing the full tail.
          </div>
        )}

        {traceFiltered && (
          <div className="cmk-stack-panel cmk-stack-panel--sky cmk-stack-panel--tight-top">
            <div className="cmk-console-trace-banner">
              <span>
                Filtering run{" "}
                <code className="ag-seq-mono" title={traceParam}>
                  {traceParam.slice(0, 8)}…{traceParam.slice(-4)}
                </code>
              </span>
              <Link href="/console" className="cmk-console-trace-clear">
                Clear filter
              </Link>
            </div>
          </div>
        )}

        <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top cmk-console-log">
          <div className="hb-section">
          <h2 className="hb-section-h">{logHeading}</h2>
          {logRows.length === 0 && !fetchError ? (
            <div className="leads-empty">{logEmptyMsg}</div>
          ) : (
            <div
              className={`hb-runs-table widget console-ex-table${showTraceColumn ? " console-ex-table--with-trace" : ""}`}
            >
              <div className="hb-runs-row hb-runs-head console-ex-row">
                <div>Time</div>
                <div>Action</div>
                {showTraceColumn ? <div>Trace</div> : null}
                <div>Result</div>
                <div>Skip</div>
                <div>Lead</div>
                <div>Plan</div>
              </div>
              {logRows.map((r) => (
                <div key={r.id} className="hb-runs-row console-ex-row">
                  <div>{fmtTime(r.at)}</div>
                  <div>
                    <code className="ag-seq-mono" style={{ fontSize: 10 }}>
                      {r.action_kind}
                    </code>
                  </div>
                  {showTraceColumn ? (
                    <div>
                      {r.trace_id ? (
                        <Link
                          href={`/console?trace=${encodeURIComponent(r.trace_id)}`}
                          className="cmk-console-ex-trace-link"
                          title={r.trace_id}
                        >
                          {r.trace_id.slice(0, 8)}…{r.trace_id.slice(-4)}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  ) : null}
                  <div>
                    <span className={r.result === "error" ? "hb-snap-stale" : "hb-snap-ok"}>
                      {r.result}
                    </span>
                  </div>
                  <div>
                    {r.skip_code ? (
                      <span className="hb-skip-code" style={{ fontSize: 10 }}>
                        {r.skip_code}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                  <div>
                    {r.close_lead_id ? (
                      <Link href={`/lead/${r.close_lead_id}`} className="plan-btn" style={{ fontSize: 10 }}>
                        {shortId(r.close_lead_id, 14)}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                  <div>
                    {r.plan_id ? (
                      <span className="ag-seq-mono" style={{ fontSize: 10 }}>
                        {shortId(r.plan_id, 10)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
