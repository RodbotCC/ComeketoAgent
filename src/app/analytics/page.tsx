import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";

import sourceChannel from "@/data/analytics/source_channel_snapshot.json";
import sellerPerf from "@/data/analytics/seller_performance_snapshot.json";
import winLoss from "@/data/analytics/win_loss_snapshot.json";
import revenue from "@/data/analytics/revenue_trends_snapshot.json";
import upcoming from "@/data/analytics/upcoming_events_snapshot.json";
import bookingLeadTime from "@/data/analytics/booking_lead_time_snapshot.json";
import cohort from "@/data/analytics/cohort_snapshot.json";

export const dynamic = "force-static";

/* ========================================================================
   /analytics — lead intelligence dashboard.

   This is Rodrigo's surface — source channels, win/loss, cohorts, revenue.
   Data lives in `src/data/analytics/*.json` — these are SNAPSHOTS exported
   from the previous Comeketo Close org by the Python scripts in
   `_reference/CC Agent (legacy)/CCAgentindex/analytics_scripts/`. Each
   snapshot carries `_meta.generated_at`, which we surface as a "snapshot:
   YYYY-MM-DD" pill so we never present stale data as live.

   The Python scripts have hardcoded paths + custom-field IDs from the OLD
   Close org. Porting them to the new org is tracked in
   `_reference/analytics-port-manifest.md`.
   ======================================================================== */

type Snap = { _meta?: { generated_at?: string }; summary_text?: string };

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtCents(cents?: number): string {
  if (typeof cents !== "number") return "—";
  if (cents >= 1_000_000_00) return `$${(cents / 100_000_000).toFixed(1)}M`;
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`;
  return `$${(cents / 100).toFixed(0)}`;
}

function pct(n?: number, signed = false): string {
  if (typeof n !== "number") return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function AnalyticsPage() {
  // ── Metric strip (matches the layout from the legacy app) ──────────────
  const sc = sourceChannel as Snap & {
    _meta: { lead_count: number; opportunity_count: number; window_days: number };
    status_distribution: Record<string, number>;
    owner_distribution: Record<string, number>;
  };
  const wl = winLoss as Snap & {
    _meta: { won_count: number; lost_count: number; active_count: number; opportunity_count: number };
    funnel: { win_rate_pct: number; total_won_value_cents: number; total_won_value_fmt: string };
  };
  const rv = revenue as Snap & {
    _meta: { total_won_revenue_cents: number; total_won_revenue_fmt: string; window_days: number };
    yoy_comparison: { revenue_growth_pct: number; last_12mo_revenue_fmt: string; lead_volume_growth_pct: number };
    deal_size_percentiles: { mean_cents: number };
  };
  const ue = upcoming as Snap & {
    _meta: { event_count: number; total_guests: number; total_value_cents: number };
  };

  const winRate30d =
    sc._meta.lead_count > 0
      ? ((sc.status_distribution.won ?? 0) / sc._meta.lead_count) * 100
      : 0;
  // Active pipeline = mean deal size × active opps (rough but consistent with the legacy view).
  const activePipelineCents = wl._meta.active_count * rv.deal_size_percentiles.mean_cents;

  type StatTone = "leads" | "active" | "won" | "winrate" | "pipeline" | "events" | "yoy";
  const stats: Array<{ label: string; value: string; sub: string; tone: StatTone }> = [
    { tone: "leads",    label: "Leads (30d)",         value: sc._meta.lead_count.toLocaleString(), sub: `${sc._meta.opportunity_count} opps` },
    { tone: "active",   label: "Active",              value: (sc.status_distribution.active ?? 0).toLocaleString(), sub: "open opps" },
    { tone: "won",      label: "Won (30d)",           value: (sc.status_distribution.won ?? 0).toLocaleString(), sub: `${sc._meta.window_days}d window` },
    { tone: "winrate",  label: "Win rate (30d)",      value: pct(winRate30d), sub: "won / total leads" },
    { tone: "pipeline", label: "Active pipeline",     value: fmtCents(activePipelineCents), sub: `${wl._meta.active_count} × mean deal` },
    { tone: "events",   label: "Events booked",       value: ue._meta.event_count.toLocaleString(), sub: `${ue._meta.total_guests.toLocaleString()} guests` },
    { tone: "winrate",  label: "All-time win rate",   value: pct(wl.funnel.win_rate_pct), sub: `${wl._meta.opportunity_count.toLocaleString()} opps` },
    { tone: "yoy",      label: "YoY revenue",         value: pct(rv.yoy_comparison.revenue_growth_pct, true), sub: rv.yoy_comparison.last_12mo_revenue_fmt },
  ];

  // ── Auto-derived intel signals (operator-facing one-liners) ────────────
  const intelSignals = buildIntelSignals(
    sourceChannel as unknown as { source_channels: Array<{ source_channel: string; source_family: string; lead_count: number; win_rate_pct: number }> },
    wl,
    rv,
    ue,
    bookingLeadTime as Snap,
    cohort as Snap
  );

  // ── Source Channels table (the first tab — others rendered as "ready") ─
  const channels = (sourceChannel as unknown as { source_channels: Array<{
    source_channel: string;
    source_family: string;
    lead_count: number;
    active_count: number;
    won_count: number;
    lost_count: number;
    win_rate_pct: number;
  }> }).source_channels.slice(0, 12);
  const maxLeadCount = Math.max(...channels.map((c) => c.lead_count));

  // ── Snapshot health badges per dataset ─────────────────────────────────
  const datasets: Array<{
    key: string;
    label: string;
    snap: Snap;
    has_view: boolean;
  }> = [
    { key: "source_channel", label: "Source channels",   snap: sourceChannel as Snap, has_view: true },
    { key: "seller_perf",    label: "Owner performance", snap: sellerPerf as Snap,    has_view: false },
    { key: "win_loss",       label: "Win / loss",        snap: winLoss as Snap,       has_view: false },
    { key: "revenue",        label: "Revenue & growth",  snap: revenue as Snap,       has_view: false },
    { key: "upcoming",       label: "Upcoming events",   snap: upcoming as Snap,      has_view: false },
    { key: "lead_time",      label: "Lead time",         snap: bookingLeadTime as Snap, has_view: false },
    { key: "cohort",         label: "Cohort analysis",   snap: cohort as Snap,        has_view: false },
  ];

  // Pipeline funnel + Conversation intel = the two views from the legacy
  // app that have NO snapshot yet. These need scripts written from scratch
  // against the new Close org.
  const missingViews = ["Pipeline funnel", "Conversation intel"];

  const oldestGenerated = datasets
    .map((d) => d.snap._meta?.generated_at)
    .filter((s): s is string => typeof s === "string")
    .sort()[0];

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="analytics" />

      <main className="hb-page-main scroll-hide">
        {/* Toolbar */}
        <div className="hb-page-toolbar">
          <div>
            <span className="cme-eyebrow">analytics · source channel intelligence</span>
            <h1 className="hb-page-title" style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontWeight: 400 }}>
              Where leads come from.
            </h1>
            <div className="hb-page-meta">
              <span>{sc._meta.opportunity_count.toLocaleString()} opportunities</span>
              <span className="lead-sep">·</span>
              <span>oldest snapshot {fmtDate(oldestGenerated)}</span>
            </div>
          </div>
          <div className="hb-page-toolbar-r">
            <span className="hb-mode hb-mode-warn" title="These snapshots are exports from the previous Close org.">
              snapshot data
            </span>
          </div>
        </div>

        {/* Metric strip */}
        <div className="cmk-an-strip">
          {stats.map((s, i) => (
            <div key={i} className={`cmk-an-card cmk-an-card-${s.tone}`} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="cmk-an-label">{s.label}</div>
              <div className="cmk-an-num">{s.value}</div>
              <div className="cmk-an-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Intel signals */}
        <div className="cmk-an-intel">
          <div className="cmk-an-intel-head">
            <span className="cme-eyebrow">intel signals · auto-derived</span>
          </div>
          <div className="cmk-an-intel-grid">
            {intelSignals.map((sig, i) => (
              <div key={i} className={`cmk-an-intel-row cmk-an-intel-${sig.tone}`} style={{ animationDelay: `${i * 50}ms` }}>
                <span className="cmk-an-intel-glyph">{sig.glyph}</span>
                <span className="cmk-an-intel-text">{sig.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Source channels — primary view */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Leads by source · top 12
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(sc._meta.generated_at)}
            </span>
          </h2>
          <div className="cmk-an-channels">
            {channels.map((c) => {
              const widthPct = (c.lead_count / maxLeadCount) * 100;
              return (
                <div key={c.source_channel} className="cmk-an-channel-row">
                  <div className="cmk-an-channel-name">
                    {c.source_channel}
                    <span className="cmk-an-channel-family">{c.source_family.replace(/_/g, " ")}</span>
                  </div>
                  <div className="cmk-an-channel-bar-wrap">
                    <div
                      className={`cmk-an-channel-bar cmk-an-fam-${c.source_family}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="cmk-an-channel-stats">
                    <span title="leads">{c.lead_count}</span>
                    <span className="lead-sep">·</span>
                    <span title="active" style={{ color: "var(--ink-soft)" }}>{c.active_count}A</span>
                    <span className="lead-sep">·</span>
                    <span title="won" style={{ color: "color-mix(in oklab, var(--sage-deep) 90%, var(--ink))" }}>{c.won_count}W</span>
                    <span className="lead-sep">·</span>
                    <span title="win rate" className="cmk-an-channel-pct">{pct(c.win_rate_pct)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dataset health — what we have, when it's from, what view is wired */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">Datasets</h2>
          <div className="cmk-an-datasets">
            {datasets.map((d) => (
              <div key={d.key} className="cmk-an-dataset">
                <div className="cmk-an-dataset-l">
                  <div className="cmk-an-dataset-name">{d.label}</div>
                  <div className="cmk-an-dataset-meta">
                    snapshot {fmtDate(d.snap._meta?.generated_at)}
                    {d.snap.summary_text && ` · ${d.snap.summary_text.split(".")[0]}`}
                  </div>
                </div>
                <div className="cmk-an-dataset-r">
                  <span className={`cmk-an-pill ${d.has_view ? "cmk-an-pill-live" : "cmk-an-pill-ready"}`}>
                    {d.has_view ? "view live" : "data ready"}
                  </span>
                </div>
              </div>
            ))}
            {missingViews.map((label) => (
              <div key={label} className="cmk-an-dataset cmk-an-dataset-missing">
                <div className="cmk-an-dataset-l">
                  <div className="cmk-an-dataset-name">{label}</div>
                  <div className="cmk-an-dataset-meta">no snapshot — script needs porting</div>
                </div>
                <div className="cmk-an-dataset-r">
                  <span className="cmk-an-pill cmk-an-pill-missing">port script</span>
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
            Snapshots come from the legacy Close org. The Python scripts that built them live in{" "}
            <code className="ag-seq-mono" style={{ fontSize: 10 }}>
              _reference/CC Agent (legacy)/CCAgentindex/analytics_scripts/
            </code>
            . Custom-field IDs and CSV paths are hardcoded for the old org — see{" "}
            <Link href="/analytics" style={{ textDecoration: "underline" }}>
              port manifest
            </Link>{" "}
            in <code className="ag-seq-mono" style={{ fontSize: 10 }}>_reference/analytics-port-manifest.md</code> for the rerun checklist.
          </p>
        </div>
      </main>
    </div>
  );
}

/* ============ Intel signals helper ============ */

type IntelSignal = { glyph: string; text: string; tone: "info" | "warn" | "good" };

function buildIntelSignals(
  sc: { source_channels: Array<{ source_channel: string; source_family: string; lead_count: number; win_rate_pct: number }> },
  wl: { _meta: { won_count: number; lost_count: number; opportunity_count: number }; funnel: { win_rate_pct: number } } & Record<string, unknown>,
  rv: { yoy_comparison: { revenue_growth_pct: number; lead_volume_growth_pct: number } } & Record<string, unknown>,
  ue: { _meta: { event_count: number; total_guests: number; total_value_cents: number } } & Record<string, unknown>,
  blt: Snap,
  ch: Snap
): IntelSignal[] {
  const out: IntelSignal[] = [];

  // Revenue YoY
  if (typeof rv.yoy_comparison?.revenue_growth_pct === "number") {
    const g = rv.yoy_comparison.revenue_growth_pct;
    out.push({
      glyph: g >= 0 ? "↑" : "↓",
      tone: g >= 0 ? "good" : "warn",
      text: `Revenue ${g >= 0 ? "up" : "down"} ${Math.abs(g).toFixed(1)}% YoY · ${rv.yoy_comparison.lead_volume_growth_pct >= 0 ? "leads grew" : "but lead volume fell"} ${Math.abs(rv.yoy_comparison.lead_volume_growth_pct).toFixed(1)}%.`,
    });
  }

  // Top channel by win rate
  const winners = [...sc.source_channels].filter((c) => c.lead_count >= 8).sort((a, b) => b.win_rate_pct - a.win_rate_pct);
  if (winners.length > 0) {
    const top = winners[0];
    out.push({
      glyph: "★",
      tone: "good",
      text: `${top.source_channel} converts at ${top.win_rate_pct.toFixed(1)}% — highest of any channel.`,
    });
  }

  // Worst channel (sufficient volume, low win)
  const dragsBoot = [...sc.source_channels]
    .filter((c) => c.lead_count >= 30 && c.win_rate_pct < 4)
    .sort((a, b) => b.lead_count - a.lead_count);
  if (dragsBoot.length > 0) {
    const drag = dragsBoot[0];
    out.push({
      glyph: "⚠",
      tone: "warn",
      text: `${drag.lead_count} of ${drag.source_channel} leads converting at only ${drag.win_rate_pct.toFixed(1)}% — fix top-of-funnel drop-off first.`,
    });
  }

  // Upcoming events
  if (ue._meta.event_count > 0) {
    out.push({
      glyph: "🍽",
      tone: "info",
      text: `${ue._meta.event_count} upcoming events · ${(ue._meta.total_guests).toLocaleString()} guests · ${fmtCents(ue._meta.total_value_cents)} contracted.`,
    });
  }

  // All-time funnel
  const ratio = wl.funnel.win_rate_pct;
  out.push({
    glyph: "▦",
    tone: ratio >= 12 ? "good" : "info",
    text: `Long-window win rate ${ratio.toFixed(1)}% across ${wl._meta.opportunity_count.toLocaleString()} opps — ${wl._meta.won_count.toLocaleString()} won, ${wl._meta.lost_count.toLocaleString()} lost.`,
  });

  // Booking lead-time hint
  const bltMeta = (blt as { _meta?: { won_with_event_date?: number } })._meta;
  if (bltMeta?.won_with_event_date) {
    out.push({
      glyph: "⏱",
      tone: "info",
      text: `${bltMeta.won_with_event_date.toLocaleString()} won deals carry an event date — booking-lead-time histogram available below.`,
    });
  }

  // Cohort hint
  const chMeta = (ch as { _meta?: { total_cohorts?: number } })._meta;
  if (chMeta?.total_cohorts) {
    out.push({
      glyph: "▤",
      tone: "info",
      text: `${chMeta.total_cohorts} acquisition cohorts tracked — conversion curves ready for drill-in.`,
    });
  }

  return out.slice(0, 7);
}
