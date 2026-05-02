import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { listRecentHeartbeats, aggregateLast24h, type HeartbeatRunRow } from "@/lib/heartbeat";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * /heartbeat — operator dashboard for the heartbeat sweep audit trail.
 *
 * Shows last-24h totals, top skip codes across the book, and a paginated
 * table of recent runs. Click a row to drill into /heartbeat/[run_id].
 */

const SKIP_LABEL: Record<string, string> = {
  OWNERSHIP: "Not Andre's lead",
  STATUS_WON: "Won — no-touch",
  STATUS_LOST: "Lost — no-touch",
  STOP_SIGNAL: "Stop signal",
  REPLY_GATE: "Reply gate",
  SEND_WINDOW: "Outside send window",
  FREQUENCY_CAP_24H: "1/24h cap",
  FREQUENCY_CAP_7D: "4/7d cap",
  STALE_BOX: "Box changed",
  NO_CONTACT: "No contact",
  DAY_NOT_APPROVED: "Day not approved",
  DAY_SKIPPED: "Day skipped",
  DAY_ALREADY_SENT: "Already sent",
  DAY_NOT_TODAY: "Not today",
  EXECUTION_DISABLED: "Draft-only mode",
  VOICE_FAIL: "NEPQ voice fail",
  CLOSE_API_ERROR: "Close API error",
};

const MODE_LABEL: Record<string, { label: string; tone: "ok" | "live" | "warn" }> = {
  draft_only: { label: "draft only", tone: "ok" },
  approval_required: { label: "approval required", tone: "ok" },
  approved_plan_execution: { label: "live → close", tone: "live" },
  manual_send_only: { label: "manual only", tone: "warn" },
};

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortLeadId(id: string | null): string {
  if (!id) return "—";
  // lead_xxxxxxx → lead_xxxx…
  return id.length > 16 ? id.slice(0, 14) + "…" : id;
}

export default async function HeartbeatDashboardPage() {
  let agg: Awaited<ReturnType<typeof aggregateLast24h>>;
  let runs: HeartbeatRunRow[] = [];
  let fetchError: string | null = null;
  try {
    [agg, runs] = await Promise.all([aggregateLast24h(), listRecentHeartbeats({ limit: 80 })]);
  } catch (err) {
    agg = {
      sweep_summary_count: 0,
      lead_run_count: 0,
      total_actions_eligible: 0,
      total_actions_fired: 0,
      total_actions_skipped: 0,
      top_skip_codes: [],
      earliest_ran_at: null,
      latest_ran_at: null,
    };
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const settings = await getSettings();
  const modeInfo = MODE_LABEL[settings.execution_mode] ?? { label: settings.execution_mode, tone: "ok" as const };

  const maxSkip = agg.top_skip_codes[0]?.count ?? 1;

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="heartbeat" />

      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <span className="cme-eyebrow">heartbeat</span>
            <h1 className="hb-page-title">Sweep audit</h1>
          </div>
          <div className="hb-page-toolbar-r">
            <span className={`hb-mode hb-mode-${modeInfo.tone}`}>{modeInfo.label}</span>
            <Link href="/heartbeat/webhooks" className="ag-seq-open" style={{ fontSize: 11 }}>
              Webhooks →
            </Link>
            <Link href="/approvals" className="ag-seq-open" style={{ fontSize: 11 }}>
              Approval queue →
            </Link>
            <span className="hb-page-window">last 24h</span>
          </div>
        </div>

        {fetchError && (
          <div className="lead-error" style={{ marginBottom: 16 }}>
            <strong>Heartbeat read failed:</strong> {fetchError}
          </div>
        )}

        {/* KPI STRIP */}
        <div className="hb-kpi-strip">
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Lead sweeps</span>
            <span className="hb-kpi-num">{agg.lead_run_count}</span>
            <span className="hb-kpi-sub">{agg.sweep_summary_count} cron summaries</span>
          </div>
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Actions eligible</span>
            <span className="hb-kpi-num">{agg.total_actions_eligible}</span>
            <span className="hb-kpi-sub">across all swept plans</span>
          </div>
          <div className="hb-kpi-card hb-kpi-fire">
            <span className="hb-kpi-label">Fired</span>
            <span className="hb-kpi-num">{agg.total_actions_fired}</span>
            <span className="hb-kpi-sub">{settings.execution_mode === "approved_plan_execution" ? "wrote to Close" : "would-fire (draft mode)"}</span>
          </div>
          <div className="hb-kpi-card">
            <span className="hb-kpi-label">Skipped</span>
            <span className="hb-kpi-num">{agg.total_actions_skipped}</span>
            <span className="hb-kpi-sub">gated by rules</span>
          </div>
        </div>

        {/* SKIP CODE BAR */}
        {agg.top_skip_codes.length > 0 && (
          <div className="hb-section">
            <h2 className="hb-section-h">Top skip reasons</h2>
            <div className="hb-skip-bar">
              {agg.top_skip_codes.map(({ code, count }) => {
                const pct = (count / maxSkip) * 100;
                return (
                  <div key={code} className="hb-skip-bar-row">
                    <span className="hb-skip-bar-label">{SKIP_LABEL[code] || code}</span>
                    <span className="hb-skip-bar-track">
                      <span className="hb-skip-bar-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="hb-skip-bar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RECENT RUNS TABLE */}
        <div className="hb-section">
          <h2 className="hb-section-h">Recent runs</h2>
          {runs.length === 0 ? (
            <div className="lead-empty">no runs yet — generate a plan and click "Run heartbeat now" on a lead</div>
          ) : (
            <div className="hb-runs-table widget">
              <div className="hb-runs-row hb-runs-head">
                <div>Time</div>
                <div>Scope</div>
                <div>Trigger</div>
                <div>Lead</div>
                <div className="hb-num">Fires</div>
                <div className="hb-num">Skips</div>
                <div>Snap</div>
              </div>
              {runs.map((r) => {
                const href = `/heartbeat/${r.id}`;
                const isStale = r.snapshot_match === false;
                return (
                  <Link key={r.id} href={href} className="hb-runs-row hb-runs-row-link">
                    <div>{fmtTime(r.ran_at)}</div>
                    <div>
                      <span className={`hb-scope-pill hb-scope-${r.scope}`}>{r.scope}</span>
                    </div>
                    <div>
                      <span className={`hb-trigger-pill hb-trigger-${r.trigger}`}>{r.trigger}</span>
                    </div>
                    <div>{shortLeadId(r.close_lead_id)}</div>
                    <div className="hb-num hb-num-fire">{r.actions_fired}</div>
                    <div className="hb-num hb-num-skip">{r.actions_skipped}</div>
                    <div>
                      {r.snapshot_match == null ? (
                        <span className="hb-snap-na">—</span>
                      ) : isStale ? (
                        <span className="hb-snap-stale">stale</span>
                      ) : (
                        <span className="hb-snap-ok">in sync</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
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
        <span>heartbeat · audit trail</span>
        <span>
          mode: <strong>{settings.execution_mode}</strong> · last:{" "}
          {agg.latest_ran_at ? fmtTime(agg.latest_ran_at) : "never"}
        </span>
      </footer>
    </div>
  );
}
