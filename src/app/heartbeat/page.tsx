import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { listRecentHeartbeats, aggregateLast24h, type HeartbeatRunRow } from "@/lib/heartbeat";
import { aggregateOperatorTruth, type HeartbeatTruthSummary } from "@/lib/heartbeat-truth";
import { resolveLeadNames, displayName } from "@/lib/lead-names";
import { getSettings } from "@/lib/settings";
import { HeartbeatAutoRefresh } from "./HeartbeatAutoRefresh";

export const dynamic = "force-dynamic";

/**
 * /heartbeat — operator dashboard for the heartbeat sweep audit trail.
 *
 * Reframed (Lane D, 2026-05-02): leads with operator-truth — Today eligible,
 * Waiting on you, Fired today — with inline lead lists. The original
 * eligible/fired/skipped math is preserved inside the "Skip breakdown —
 * forensics" `<details>` block for forensic work.
 *
 * Source for the truth strip is `aggregateOperatorTruth()` which walks
 * `heartbeat_runs.report` (DayVerdict[]). Source for the forensics is the
 * historical `aggregateLast24h()` aggregator. Recent-runs table is unchanged.
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

const CHANNEL_CHIP: Record<string, string> = {
  call: "plan-action-chip plan-action-chip-call",
  email: "plan-action-chip plan-action-chip-email",
  sms: "plan-action-chip plan-action-chip-sms",
  task: "plan-action-chip plan-action-chip-task",
};

const WAITING_DISPLAY_CAP = 6;
const FIRED_DISPLAY_CAP = 6;

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  if (ms < 0) return fmtTime(iso);
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric" });
}

function shortIntent(s: string, max = 56): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function HeartbeatDashboardPage() {
  let truth: HeartbeatTruthSummary;
  let agg: Awaited<ReturnType<typeof aggregateLast24h>>;
  let runs: HeartbeatRunRow[] = [];
  let leadNames: Map<string, string> = new Map();
  let fetchError: string | null = null;
  try {
    [truth, agg, runs, leadNames] = await Promise.all([
      aggregateOperatorTruth(),
      aggregateLast24h(),
      listRecentHeartbeats({ limit: 80 }),
      resolveLeadNames(),
    ]);
  } catch (err) {
    truth = {
      today_eligible: 0,
      waiting_count: 0,
      fired_count: 0,
      waiting_on_approval: [],
      fired_today: [],
      not_today_count: 0,
      gated_today: [],
      total_actions_eligible: 0,
      total_actions_skipped: 0,
      total_actions_fired: 0,
      total_skip_breakdown: {},
      earliest_ran_at: null,
      latest_ran_at: null,
      lead_run_count: 0,
      sweep_summary_count: 0,
    };
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
  const isLiveMode = settings.execution_mode === "approved_plan_execution";

  // Sub-copy for "Waiting on you" — context-aware about what the operator
  // actually has to do (approve days vs flip execution mode).
  const onlyExecutionDisabled =
    truth.waiting_count > 0 &&
    truth.waiting_on_approval.every((w) => w.skip_code === "EXECUTION_DISABLED");
  const waitingSub =
    truth.waiting_count === 0
      ? "nothing queued for you"
      : onlyExecutionDisabled
      ? "flip execution mode to fire"
      : "approve to fire";

  // Sub-copy for "Fired today" — distinguish real Close writes from would-fire.
  const firedSub =
    truth.fired_count === 0
      ? isLiveMode
        ? "no Close writes yet today"
        : "no fires (mode is " + modeInfo.label + ")"
      : `wrote to Close${isLiveMode ? "" : " · would-fire (mode-gated)"}`;

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="heartbeat" />
      <HeartbeatAutoRefresh />

      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <span className="cme-eyebrow">heartbeat</span>
            <h1 className="hb-page-title">Today</h1>
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

        {/* TRUTH STRIP — three cards leading with operator-meaningful numbers. */}
        <div className="hb-truth-strip">
          {/* Today eligible — neutral overview */}
          <article className="hb-truth-card hb-truth-eligible">
            <span className="hb-truth-label">Today eligible</span>
            <span className="hb-truth-num">{truth.today_eligible}</span>
            <span className="hb-truth-sub">
              {truth.lead_run_count} lead{truth.lead_run_count === 1 ? "" : "s"} swept · {truth.not_today_count} scheduled for other days
            </span>
          </article>

          {/* Waiting on you — peach (action) */}
          <article className="hb-truth-card hb-truth-waiting" data-empty={truth.waiting_count === 0}>
            <span className="hb-truth-label">Waiting on you</span>
            <span className="hb-truth-num">{truth.waiting_count}</span>
            <span className="hb-truth-sub">{waitingSub}</span>
            {truth.waiting_count > 0 && (
              <ul className="hb-truth-list">
                {truth.waiting_on_approval.slice(0, WAITING_DISPLAY_CAP).map((w, i) => (
                  <li key={`${w.lead_id}:${w.day_index}:${i}`} className="hb-truth-row">
                    <span className={CHANNEL_CHIP[w.channel] ?? "plan-action-chip"}>{w.channel}</span>
                    <Link href={`/lead/${w.lead_id}`} className="hb-truth-row-lead" title={w.lead_id}>
                      {displayName(w.lead_id, leadNames)}
                    </Link>
                    <span className="hb-truth-row-intent" title={w.intent}>
                      {shortIntent(w.intent)}
                    </span>
                    {w.skip_code === "EXECUTION_DISABLED" && (
                      <span className="hb-truth-row-tag">flip mode</span>
                    )}
                  </li>
                ))}
                {truth.waiting_count > WAITING_DISPLAY_CAP && (
                  <li className="hb-truth-more">
                    <Link href="/approvals">
                      + {truth.waiting_count - WAITING_DISPLAY_CAP} more · go to approvals →
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </article>

          {/* Fired today — sage (win) */}
          <article className="hb-truth-card hb-truth-fired" data-empty={truth.fired_count === 0}>
            <span className="hb-truth-label">Fired today</span>
            <span className="hb-truth-num">{truth.fired_count}</span>
            <span className="hb-truth-sub">{firedSub}</span>
            {truth.fired_count > 0 && (
              <ul className="hb-truth-list">
                {truth.fired_today.slice(0, FIRED_DISPLAY_CAP).map((f, i) => (
                  <li key={`${f.lead_id}:${f.day_index}:${f.fired_at}:${i}`} className="hb-truth-row">
                    <span className={CHANNEL_CHIP[f.channel] ?? "plan-action-chip"}>{f.channel}</span>
                    <Link href={`/lead/${f.lead_id}`} className="hb-truth-row-lead" title={f.lead_id}>
                      {displayName(f.lead_id, leadNames)}
                    </Link>
                    <span className="hb-truth-row-intent" title={f.intent}>
                      {shortIntent(f.intent)}
                    </span>
                    <span className="hb-truth-row-when" title={f.fired_at}>
                      {fmtRelative(f.fired_at)}
                    </span>
                  </li>
                ))}
                {truth.fired_count > FIRED_DISPLAY_CAP && (
                  <li className="hb-truth-more">+ {truth.fired_count - FIRED_DISPLAY_CAP} more earlier</li>
                )}
              </ul>
            )}
          </article>
        </div>

        {/* Inline gated-today line — small forensic context above the collapse. */}
        {truth.gated_today.length > 0 && (
          <div className="hb-truth-gated-line">
            <span className="cme-eyebrow">also today:</span>
            {truth.gated_today.map((g) => (
              <span key={g.code} className="hb-truth-gated-pill" title={g.code}>
                {SKIP_LABEL[g.code] || g.code} · {g.count}
              </span>
            ))}
          </div>
        )}

        {/* FORENSICS — collapsed by default, contains the original eligible/fired/skipped strip + skip-code bars. */}
        <details className="hb-forensics">
          <summary className="hb-forensics-summary">
            <span className="hb-forensics-chevron" aria-hidden="true">›</span>
            <span>Skip breakdown — forensics</span>
            <span className="hb-forensics-meta">
              {agg.lead_run_count} lead runs · {agg.total_actions_eligible} actions
              {agg.latest_ran_at ? ` · last ${fmtRelative(agg.latest_ran_at)}` : ""}
            </span>
          </summary>
          <div className="hb-forensics-body">
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
                <span className="hb-kpi-label">Fired (raw)</span>
                <span className="hb-kpi-num">{agg.total_actions_fired}</span>
                <span className="hb-kpi-sub">
                  {isLiveMode ? "wrote to Close" : "would-fire (gate-eligible)"}
                </span>
              </div>
              <div className="hb-kpi-card">
                <span className="hb-kpi-label">Skipped</span>
                <span className="hb-kpi-num">{agg.total_actions_skipped}</span>
                <span className="hb-kpi-sub">gated by rules</span>
              </div>
            </div>

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
          </div>
        </details>

        {/* RECENT RUNS TABLE */}
        <div className="hb-section">
          <h2 className="hb-section-h">Recent runs</h2>
          {runs.length === 0 ? (
            <div className="lead-empty">no runs yet — generate a plan and click &ldquo;Run heartbeat now&rdquo; on a lead</div>
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
                    <div title={r.close_lead_id ?? undefined}>{displayName(r.close_lead_id, leadNames)}</div>
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
