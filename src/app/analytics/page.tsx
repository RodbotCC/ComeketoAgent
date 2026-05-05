import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import type {
  SourceChannelSnapshot,
  SellerPerformanceSnapshot,
  WinLossSnapshot,
  RevenueTrendsSnapshot,
  UpcomingEventsSnapshot,
  BookingLeadTimeSnapshot,
  CohortSnapshot,
  WinLossCut,
  CohortWindowKey,
  UrgencySegment,
} from "@/lib/analytics-types";

import sourceChannel from "@/data/analytics/source_channel_snapshot.json";
import sellerPerf from "@/data/analytics/seller_performance_snapshot.json";
import winLoss from "@/data/analytics/win_loss_snapshot.json";
import revenue from "@/data/analytics/revenue_trends_snapshot.json";
import upcoming from "@/data/analytics/upcoming_events_snapshot.json";
import bookingLeadTime from "@/data/analytics/booking_lead_time_snapshot.json";
import cohort from "@/data/analytics/cohort_snapshot.json";

export const dynamic = "force-static";

type AnalyticsTab = "overview" | "sources" | "funnel" | "revenue" | "timing" | "snapshots";
const VALID_TABS: AnalyticsTab[] = ["overview", "sources", "funnel", "revenue", "timing", "snapshots"];

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/* ========================================================================
   /analytics — lead intelligence dashboard.

   Source channels, owner performance, pipeline funnel, win/loss, revenue,
   lead time, cohorts. Data lives in `src/data/analytics/*.json` — these
   are SNAPSHOTS exported from the previous Comeketo Close org. Each
   snapshot carries `_meta.generated_at`, surfaced as a "snapshot:
   YYYY-MM-DD" pill so stale data is never presented as live.

   The exporter scripts live outside this repo (legacy laptop) and have
   hardcoded custom-field IDs from the OLD Close org. The port manifest
   at `_reference/analytics-port-manifest.md` maps each script to its
   snapshot and tracks what each one needs to rerun against the new org.
   ======================================================================== */

type Snap = { _meta?: { generated_at?: string }; summary_text?: string };

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtCents(cents?: number): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  if (cents >= 1_000_000_00) return `$${(cents / 100_000_000).toFixed(1)}M`;
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`;
  return `$${(cents / 100).toFixed(0)}`;
}

function pct(n?: number, signed = false): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function safeMax(values: number[]): number {
  const max = Math.max(0, ...values);
  return max > 0 ? max : 1;
}

function familyClass(key: string): string {
  // Source-family keys we already have tokens for; anything else falls to
  // `cmk-an-fam-other`.
  const known = new Set([
    "digital_inbound",
    "phone_inbound",
    "marketplace",
    "expo_event",
    "relationship_partner",
    "other",
    "unknown",
  ]);
  return known.has(key) ? `cmk-an-fam-${key}` : "cmk-an-fam-other";
}

export default function AnalyticsPage({ searchParams = {} }: Props) {
  const rawTab = searchParams["tab"];
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const activeTab: AnalyticsTab = (VALID_TABS as string[]).includes(tabParam || "")
    ? (tabParam as AnalyticsTab)
    : "overview";

  // ── Typed snapshot handles ─────────────────────────────────────────────
  const sc = sourceChannel as unknown as SourceChannelSnapshot;
  const seller = sellerPerf as unknown as SellerPerformanceSnapshot;
  const wl = winLoss as unknown as WinLossSnapshot;
  const rv = revenue as unknown as RevenueTrendsSnapshot;
  const ue = upcoming as unknown as UpcomingEventsSnapshot;
  const blt = bookingLeadTime as unknown as BookingLeadTimeSnapshot;
  const coh = cohort as unknown as CohortSnapshot;

  // ── Metric strip (matches the layout from the legacy app) ──────────────
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
    { tone: "yoy",      label: "YoY revenue",         value: pct(rv.yoy_comparison.revenue_growth_pct, true), sub: rv.yoy_comparison.last_12mo_revenue_fmt ?? fmtCents(rv.yoy_comparison.last_12mo_revenue_cents) },
  ];

  // ── Auto-derived intel signals (operator-facing one-liners) ────────────
  const intelSignals = buildIntelSignals(sc, wl, rv, ue, blt, coh);

  // ── Source Channels table — primary view ───────────────────────────────
  const channels = sc.source_channels.slice(0, 12);
  const maxLeadCount = safeMax(channels.map((c) => c.lead_count));

  // ── Owner Performance — top 6 by lead_count ────────────────────────────
  const owners = [...seller.owner_profiles].sort((a, b) => b.lead_count - a.lead_count).slice(0, 6);
  const maxOwnerLeads = safeMax(owners.map((o) => o.lead_count));

  // ── Pipeline Funnel — derived from win_loss.funnel ─────────────────────
  const funnel = wl.funnel;
  const funnelStages: Array<{
    label: string;
    count: number;
    valueCents: number;
    valueFmt: string;
    tone: "total" | "active" | "won" | "lost";
    sub: string;
  }> = [
    {
      label: "Total opportunities",
      count: funnel.total,
      valueCents: funnel.total * rv.deal_size_percentiles.mean_cents,
      valueFmt: fmtCents(funnel.total * rv.deal_size_percentiles.mean_cents),
      tone: "total",
      sub: "all-time pipeline entries",
    },
    {
      label: "Active",
      count: funnel.active,
      valueCents: funnel.active * rv.deal_size_percentiles.mean_cents,
      valueFmt: fmtCents(funnel.active * rv.deal_size_percentiles.mean_cents),
      tone: "active",
      sub: "open opps · mean-deal proxy",
    },
    {
      label: "Won",
      count: funnel.won,
      valueCents: funnel.total_won_value_cents,
      valueFmt: funnel.total_won_value_fmt ?? fmtCents(funnel.total_won_value_cents),
      tone: "won",
      sub: `${pct(funnel.win_rate_pct)} of total`,
    },
    {
      label: "Lost",
      count: funnel.lost,
      valueCents: funnel.total_lost_value_cents,
      valueFmt: funnel.total_lost_value_fmt ?? fmtCents(funnel.total_lost_value_cents),
      tone: "lost",
      sub: `${pct(funnel.total > 0 ? (funnel.lost / funnel.total) * 100 : 0)} of total`,
    },
  ];
  const funnelMax = safeMax(funnelStages.map((s) => s.count));

  // ── Win / Loss breakdown — pick 4 cuts (event type / source family / owner / value bucket)
  const wlEvent = [...wl.by_event_type].sort((a, b) => b.lead_count - a.lead_count).slice(0, 6);
  const wlSourceFam = [...wl.by_source_family].sort((a, b) => b.lead_count - a.lead_count);
  const wlOwner = [...wl.by_owner].sort((a, b) => b.lead_count - a.lead_count).slice(0, 6);
  const wlValue = [...wl.by_value_bucket]; // value buckets keep snapshot order

  // ── Revenue & Growth ───────────────────────────────────────────────────
  const monthlyTrend = rv.monthly_trend.slice(-24); // last 24 months
  const monthlyMax = safeMax(monthlyTrend.map((m) => m.won_value_cents));
  const percentiles: Array<{ key: string; label: string; valueFmt: string }> = [
    { key: "p25",  label: "p25",  valueFmt: rv.deal_size_percentiles.p25_fmt  ?? fmtCents(rv.deal_size_percentiles.p25_cents) },
    { key: "p50",  label: "p50",  valueFmt: rv.deal_size_percentiles.p50_fmt  ?? fmtCents(rv.deal_size_percentiles.p50_cents) },
    { key: "p75",  label: "p75",  valueFmt: rv.deal_size_percentiles.p75_fmt  ?? fmtCents(rv.deal_size_percentiles.p75_cents) },
    { key: "p90",  label: "p90",  valueFmt: rv.deal_size_percentiles.p90_fmt  ?? fmtCents(rv.deal_size_percentiles.p90_cents) },
    { key: "mean", label: "mean", valueFmt: rv.deal_size_percentiles.mean_fmt ?? fmtCents(rv.deal_size_percentiles.mean_cents) },
  ];
  const concentration = rv.revenue_concentration.slice(0, 5);

  // ── Lead Time ──────────────────────────────────────────────────────────
  const histogram = blt.histogram;
  const histMax = safeMax(histogram.map((b) => b.pct_of_bookings));
  const urgency = blt.urgency_segments;
  const bltByEventType = [...blt.by_event_type].sort((a, b) => b.median_days - a.median_days).slice(0, 6);
  const bltMaxMedian = safeMax(bltByEventType.map((b) => b.median_days));

  // ── Cohort ─────────────────────────────────────────────────────────────
  const conversionCurves = coh.conversion_curves;
  const curvesMax = safeMax(conversionCurves.map((c) => c.avg_conversion_rate_pct));
  // `cohort_grid` is oldest-first; sort descending then slice so the table
  // shows the 12 most-recent cohorts (matches the section heading and the
  // server-side `best_cohorts[0]` / `worst_cohorts[0]` references).
  const cohortGrid = [...coh.cohort_grid]
    .sort((a, b) => b.cohort.localeCompare(a.cohort))
    .slice(0, 12);
  const cohortWindows: CohortWindowKey[] = ["30d", "60d", "90d", "6mo", "1yr", "2yr"];
  const allRates: number[] = [];
  for (const row of cohortGrid) {
    for (const w of cohortWindows) {
      const cell = row.windows[w];
      if (cell && typeof cell.rate_pct === "number") allRates.push(cell.rate_pct);
    }
  }
  const cohortMaxRate = safeMax(allRates);
  const bestCohort = coh.best_cohorts[0];
  const worstCohort = coh.worst_cohorts[0];

  // ── Snapshot health badges per dataset ─────────────────────────────────
  const datasets: Array<{
    key: string;
    label: string;
    snap: Snap;
    has_view: boolean;
  }> = [
    { key: "source_channel", label: "Source channels",   snap: sc,     has_view: true },
    { key: "seller_perf",    label: "Owner performance", snap: seller, has_view: true },
    { key: "win_loss",       label: "Win / loss",        snap: wl,     has_view: true },
    { key: "revenue",        label: "Revenue & growth",  snap: rv,     has_view: true },
    { key: "upcoming",       label: "Upcoming events",   snap: ue as unknown as Snap, has_view: false },
    { key: "lead_time",      label: "Lead time",         snap: blt,    has_view: true },
    { key: "cohort",         label: "Cohort analysis",   snap: coh,    has_view: true },
  ];

  // Conversation Intel is intentionally not in this list. No
  // `conversation_intel_snapshot.json` exists, and the closest fields in
  // `win_loss.time_patterns` / `win_loss.top_win_profiles` are deal-pattern
  // data, not conversation data — labeling them as conversation intel
  // would mislabel the source. If a real comms-style snapshot lands later,
  // add it here.
  const missingViews: string[] = [];

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

        {/* Sub-tab nav */}
        <nav className="proposal-tabs cmk-personal-tabs cmk-an-tabs" aria-label="Analytics sections">
          <Link href="/analytics" data-tab="overview"
            className={`proposal-tab${activeTab === "overview" ? " proposal-tab-active" : ""}`}>Overview</Link>
          <Link href="/analytics?tab=sources" data-tab="sources"
            className={`proposal-tab${activeTab === "sources" ? " proposal-tab-active" : ""}`}>Sources</Link>
          <Link href="/analytics?tab=funnel" data-tab="funnel"
            className={`proposal-tab${activeTab === "funnel" ? " proposal-tab-active" : ""}`}>Funnel</Link>
          <Link href="/analytics?tab=revenue" data-tab="revenue"
            className={`proposal-tab${activeTab === "revenue" ? " proposal-tab-active" : ""}`}>Revenue</Link>
          <Link href="/analytics?tab=timing" data-tab="timing"
            className={`proposal-tab${activeTab === "timing" ? " proposal-tab-active" : ""}`}>Timing</Link>
          <Link href="/analytics?tab=snapshots" data-tab="snapshots"
            className={`proposal-tab${activeTab === "snapshots" ? " proposal-tab-active" : ""}`}>Snapshots</Link>
        </nav>

        {/* ─── OVERVIEW ─────────────────────────────────────────────── */}
        {activeTab === "overview" && <>

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

        </>}

        {/* ─── SOURCES ──────────────────────────────────────────────── */}
        {activeTab === "sources" && <>

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
                      className={`cmk-an-channel-bar ${familyClass(c.source_family)}`}
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

        {/* Owner performance — top 6 */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Owner performance · top 6
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(seller._meta.generated_at)}
            </span>
          </h2>
          {owners.length === 0 ? (
            <div className="cmk-an-empty">No owner snapshot — run build_seller_performance_intelligence.py.</div>
          ) : (
            <div className="cmk-an-channels">
              {owners.map((o) => {
                const widthPct = (o.lead_count / maxOwnerLeads) * 100;
                return (
                  <div key={o.owner_name} className="cmk-an-channel-row">
                    <div className="cmk-an-channel-name">
                      {o.owner_name}
                      <span className="cmk-an-channel-family">
                        {o.new_opps_this_period} new · median close {o.median_days_to_close.toFixed(0)}d
                      </span>
                    </div>
                    <div className="cmk-an-channel-bar-wrap">
                      <div
                        className="cmk-an-channel-bar cmk-an-bar-sage"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="cmk-an-channel-stats">
                      <span title="leads">{o.lead_count}</span>
                      <span className="lead-sep">·</span>
                      <span title="active" style={{ color: "var(--ink-soft)" }}>{o.active_count}A</span>
                      <span className="lead-sep">·</span>
                      <span title="won" style={{ color: "color-mix(in oklab, var(--sage-deep) 90%, var(--ink))" }}>{o.won_count}W</span>
                      <span className="lead-sep">·</span>
                      <span title="win rate" className="cmk-an-channel-pct">{pct(o.win_rate_pct)}</span>
                      <span className="lead-sep">·</span>
                      <span title="pipeline value" style={{ color: "var(--ink-soft)" }}>{o.pipeline_value_fmt ?? fmtCents(o.pipeline_value_cents)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </>}

        {/* ─── FUNNEL ───────────────────────────────────────────────── */}
        {activeTab === "funnel" && <>

        {/* Pipeline funnel — derived from win_loss.funnel */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Pipeline funnel · all-time
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(wl._meta.generated_at)}
            </span>
          </h2>
          <div className="cmk-an-funnel">
            {funnelStages.map((stage, i) => {
              const widthPct = (stage.count / funnelMax) * 100;
              // Only Total → Active is a real subset transition. Won and Lost
              // are sibling disposition buckets (a lead is one of them, not
              // sequential through them), so a drop-% between them would be a
              // meaningless ratio. Won/Lost rows already carry "% of total"
              // in their own `sub` line.
              const stillActivePct =
                i === 1 && funnelStages[0].count > 0
                  ? (stage.count / funnelStages[0].count) * 100
                  : null;
              return (
                <div key={stage.label}>
                  {stillActivePct !== null && (
                    <div className="cmk-an-funnel-arrow">
                      ↓ {stillActivePct.toFixed(1)}% of total are still active
                    </div>
                  )}
                  <div className="cmk-an-funnel-row" style={{ animationDelay: `${i * 70}ms` }}>
                    <div className="cmk-an-funnel-label">
                      <div className="cmk-an-funnel-label-name">{stage.label}</div>
                      <div className="cmk-an-funnel-label-sub">{stage.sub}</div>
                    </div>
                    <div className="cmk-an-channel-bar-wrap">
                      <div
                        className={`cmk-an-channel-bar cmk-an-funnel-bar cmk-an-funnel-bar-${stage.tone}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="cmk-an-funnel-stats">
                      <span className="cmk-an-funnel-num">{stage.count.toLocaleString()}</span>
                      <span className="cmk-an-funnel-sub">{stage.valueFmt}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 10, marginTop: 10 }}>
            Counts from win_loss_snapshot (window: {wl._meta.window_days}d). Active value uses mean-deal proxy from revenue percentiles; won/lost values are exact.
          </p>
        </div>

        {/* Win / loss breakdown — 4 cuts in a 2-col grid */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Win / loss breakdown · {wl._meta.window_days}d
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(wl._meta.generated_at)}
            </span>
          </h2>
          <div className="cmk-an-wl-grid">
            <WinLossSubChart title="By event type" rows={wlEvent}    barClass={() => "cmk-an-bar-peach"}      />
            <WinLossSubChart title="By source family" rows={wlSourceFam} barClass={(r) => familyClass(r.key)} showFamilyEyebrow />
            <WinLossSubChart title="By owner"      rows={wlOwner}    barClass={() => "cmk-an-bar-sage"}       />
            <WinLossSubChart title="By value bucket" rows={wlValue}  barClass={() => "cmk-an-bar-lemon"}      />
          </div>
        </div>

        </>}

        {/* ─── REVENUE ──────────────────────────────────────────────── */}
        {activeTab === "revenue" && <>

        {/* Revenue & growth */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Revenue &amp; growth · last {rv._meta.window_days}d
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(rv._meta.generated_at)}
            </span>
          </h2>
          {/* YoY card + percentile strip */}
          <div className="cmk-an-rev-top">
            <div className="cmk-an-card cmk-an-card-yoy cmk-an-rev-yoy" style={{ animationDelay: "0ms" }}>
              <div className="cmk-an-label">YoY revenue</div>
              <div className="cmk-an-num">{pct(rv.yoy_comparison.revenue_growth_pct, true)}</div>
              <div className="cmk-an-sub">
                {rv.yoy_comparison.last_12mo_revenue_fmt ?? fmtCents(rv.yoy_comparison.last_12mo_revenue_cents)}
                {" vs "}
                {rv.yoy_comparison.prior_12mo_revenue_fmt ?? fmtCents(rv.yoy_comparison.prior_12mo_revenue_cents)} prior
              </div>
              <div className="cmk-an-rev-yoy-deltas">
                <span>leads {pct(rv.yoy_comparison.lead_volume_growth_pct, true)}</span>
                <span className="lead-sep">·</span>
                <span>avg deal {pct(rv.yoy_comparison.avg_deal_growth_pct, true)}</span>
                <span className="lead-sep">·</span>
                <span>wins {pct(rv.yoy_comparison.won_count_growth_pct, true)}</span>
              </div>
            </div>
            <div className="cmk-an-percentile-strip">
              {percentiles.map((p, i) => (
                <div key={p.key} className="cmk-an-card cmk-an-card-pipeline cmk-an-percentile-card" style={{ animationDelay: `${(i + 1) * 50}ms` }}>
                  <div className="cmk-an-label">{p.label}</div>
                  <div className="cmk-an-num cmk-an-percentile-num">{p.valueFmt}</div>
                  <div className="cmk-an-sub">deal size</div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly trend bars */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Monthly trend · last {monthlyTrend.length} months</h3>
            {monthlyTrend.length === 0 ? (
              <div className="cmk-an-empty">No monthly trend data.</div>
            ) : (
              <div className="cmk-an-trend-row">
                {monthlyTrend.map((m, i) => {
                  const heightPct = (m.won_value_cents / monthlyMax) * 100;
                  return (
                    <div key={m.month} className="cmk-an-trend-col" title={`${m.month_label} · ${m.won_value_fmt ?? fmtCents(m.won_value_cents)} · ${m.won_count} won`}>
                      <div className="cmk-an-trend-bar-wrap">
                        <div
                          className="cmk-an-trend-bar"
                          style={{ height: `${heightPct}%`, animationDelay: `${i * 18}ms` }}
                        />
                      </div>
                      <div className="cmk-an-trend-label">{m.month_label.split(" ")[0].slice(0, 3)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Revenue concentration */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Revenue concentration · top deals</h3>
            <div className="cmk-an-channels">
              {concentration.map((c) => {
                const widthPct = c.pct_of_total_revenue;
                return (
                  <div key={`conc-${c.top_pct_of_deals}`} className="cmk-an-channel-row">
                    <div className="cmk-an-channel-name">
                      Top {c.top_pct_of_deals.toFixed(0)}% of deals
                      <span className="cmk-an-channel-family">{c.deal_count} deals</span>
                    </div>
                    <div className="cmk-an-channel-bar-wrap">
                      <div className="cmk-an-channel-bar cmk-an-bar-peach" style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="cmk-an-channel-stats">
                      <span title="revenue">{c.revenue_fmt ?? fmtCents(c.revenue_cents)}</span>
                      <span className="lead-sep">·</span>
                      <span className="cmk-an-channel-pct">{c.pct_of_total_revenue.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        </>}

        {/* ─── TIMING ───────────────────────────────────────────────── */}
        {activeTab === "timing" && <>

        {/* Lead time */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Booking lead time · {blt.global_stats.median_days.toFixed(0)}d median
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(blt._meta.generated_at)}
            </span>
          </h2>

          {/* Histogram */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Histogram · {blt.global_stats.bookings_with_lead_time.toLocaleString()} bookings</h3>
            {histogram.length === 0 ? (
              <div className="cmk-an-empty">No lead-time histogram.</div>
            ) : (
              <div className="cmk-an-channels">
                {histogram.map((b) => {
                  const widthPct = histMax > 0 ? (b.pct_of_bookings / histMax) * 100 : 0;
                  return (
                    <div key={b.bucket} className="cmk-an-channel-row">
                      <div className="cmk-an-channel-name">
                        {b.label}
                        <span className="cmk-an-channel-family">{b.bucket}</span>
                      </div>
                      <div className="cmk-an-channel-bar-wrap">
                        <div className="cmk-an-channel-bar cmk-an-bar-lavender" style={{ width: `${widthPct}%` }} />
                      </div>
                      <div className="cmk-an-channel-stats">
                        <span title="bookings">{b.count}</span>
                        <span className="lead-sep">·</span>
                        <span title="share" className="cmk-an-channel-pct">{b.pct_of_bookings.toFixed(1)}%</span>
                        <span className="lead-sep">·</span>
                        <span title="avg deal" style={{ color: "var(--ink-soft)" }}>{b.avg_value_fmt ?? fmtCents(b.avg_value_cents)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Urgency triptych */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Urgency segments</h3>
            <div className="cmk-an-urgency-strip">
              <UrgencyCard label="Last minute"  tone="active"   seg={urgency.last_minute}  delay={0}   sub="< 30 days out" />
              <UrgencyCard label="Planned"      tone="winrate"  seg={urgency.planned}      delay={60}  sub="30–180 days" />
              <UrgencyCard label="Long horizon" tone="leads"    seg={urgency.long_horizon} delay={120} sub="> 180 days" />
            </div>
          </div>

          {/* By event type */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">By event type · top 6 by median lead time</h3>
            <div className="cmk-an-channels">
              {bltByEventType.map((row) => {
                const widthPct = (row.median_days / bltMaxMedian) * 100;
                return (
                  <div key={row.event_type} className="cmk-an-channel-row">
                    <div className="cmk-an-channel-name">
                      {row.event_type}
                      <span className="cmk-an-channel-family">{row.count} bookings</span>
                    </div>
                    <div className="cmk-an-channel-bar-wrap">
                      <div className="cmk-an-channel-bar cmk-an-bar-sky" style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="cmk-an-channel-stats">
                      <span title="median days">{row.median_days.toFixed(0)}d</span>
                      <span className="lead-sep">·</span>
                      <span title="<90d share" style={{ color: "var(--ink-soft)" }}>{row.pct_under_90d.toFixed(0)}% &lt;90d</span>
                      <span className="lead-sep">·</span>
                      <span className="cmk-an-channel-pct">{row.won_value_fmt ?? fmtCents(row.won_value_cents)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cohort */}
        <div className="hb-section" style={{ marginTop: 22 }}>
          <h2 className="hb-section-h">
            Acquisition cohorts · {coh._meta.total_cohorts}
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 10, color: "var(--ink-faint)" }}>
              snapshot {fmtDate(coh._meta.generated_at)}
            </span>
          </h2>

          {/* Conversion curves */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Conversion curves · by window</h3>
            <div className="cmk-an-channels">
              {conversionCurves.map((c) => {
                const widthPct = (c.avg_conversion_rate_pct / curvesMax) * 100;
                return (
                  <div key={c.window} className="cmk-an-channel-row">
                    <div className="cmk-an-channel-name">
                      {c.window}
                      <span className="cmk-an-channel-family">{c.window_days}d window</span>
                    </div>
                    <div className="cmk-an-channel-bar-wrap">
                      <div className="cmk-an-channel-bar cmk-an-bar-sage" style={{ width: `${widthPct}%` }} />
                    </div>
                    <div className="cmk-an-channel-stats">
                      <span title="avg cohort rate" className="cmk-an-channel-pct">{c.avg_conversion_rate_pct.toFixed(1)}%</span>
                      <span className="lead-sep">·</span>
                      <span title="overall rate" style={{ color: "var(--ink-soft)" }}>{c.overall_rate_pct.toFixed(1)}% overall</span>
                      <span className="lead-sep">·</span>
                      <span title="converted">{c.total_converted}/{c.total_eligible_leads}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cohort grid heatmap */}
          <div className="cmk-an-subsection">
            <h3 className="cmk-an-wl-h3">Cohort grid · most recent 12</h3>
            <div className="cmk-an-cohort-table-wrap">
              <table className="cmk-an-cohort-table">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Leads</th>
                    {cohortWindows.map((w) => (
                      <th key={w}>{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortGrid.map((row) => (
                    <tr key={row.cohort}>
                      <td className="cmk-an-cohort-cohort">{row.cohort}</td>
                      <td className="cmk-an-cohort-num">{row.total_leads}</td>
                      {cohortWindows.map((w) => {
                        const cell = row.windows[w];
                        if (!cell || typeof cell.rate_pct !== "number") {
                          return (
                            <td key={w} className="cmk-an-cohort-empty">—</td>
                          );
                        }
                        const intensity = cohortMaxRate > 0 ? Math.min(75, (cell.rate_pct / cohortMaxRate) * 75) : 0;
                        return (
                          <td
                            key={w}
                            className="cmk-an-cohort-cell"
                            style={{ background: `color-mix(in oklab, var(--sage-deep) ${intensity.toFixed(1)}%, transparent)` }}
                          >
                            {cell.rate_pct.toFixed(1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(bestCohort || worstCohort) && (
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                {bestCohort && (
                  <>
                    Best cohort <strong>{bestCohort.cohort}</strong> converted at {bestCohort.best_rate_pct.toFixed(1)}%
                    {worstCohort && bestCohort.cohort !== worstCohort.cohort ? "; " : "."}
                  </>
                )}
                {worstCohort && bestCohort?.cohort !== worstCohort.cohort && (
                  <>worst <strong>{worstCohort.cohort}</strong> at {worstCohort.best_rate_pct.toFixed(1)}%.</>
                )}
              </p>
            )}
          </div>
        </div>

        </>}

        {/* ─── SNAPSHOTS ────────────────────────────────────────────── */}
        {activeTab === "snapshots" && <>

        {/* Sweep panel — wire-up state + rerun guidance */}
        <div className="cmk-stack-panel cmk-stack-panel--lemon" style={{ marginTop: 8 }}>
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Sweep — refresh from new Close org</h2>
            <div className="cmk-stack-panel-meta">oldest snapshot {fmtDate(oldestGenerated)}</div>
          </div>
          <p style={{ margin: "6px 0 12px", fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>
            The 7 datasets below are <em>snapshots from the legacy Close org</em>. Refreshing
            against the current org has a documented run-order in{" "}
            <code className="ag-seq-mono" style={{ fontSize: 11 }}>_reference/analytics-port-manifest.md</code>:
          </p>
          <ol style={{ margin: "0 0 12px 18px", padding: 0, fontSize: 13, lineHeight: 1.7, color: "var(--ink)" }}>
            <li>Export normalized CSVs from the new org (5 path-only scripts).</li>
            <li>Map custom-field IDs (one-time per org) → write <code className="ag-seq-mono" style={{ fontSize: 11 }}>_reference/analytics-custom-fields.json</code>.</li>
            <li>Run path-only scripts against the new normalized export.</li>
            <li>Patch + run schema-port scripts (source_channel, operational).</li>
            <li>Drop new snapshots into <code className="ag-seq-mono" style={{ fontSize: 11 }}>src/data/analytics/</code>.</li>
          </ol>
          <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
            Until the exporter is wired in-repo (<code className="ag-seq-mono" style={{ fontSize: 11 }}>npm run analytics:sweep</code> — TODO), refreshing is a manual run on the legacy laptop. The page reads JSON at build time, so a rebuild ships the new snapshots.
          </p>
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
            Snapshots come from the legacy Close org. The Python exporter scripts live outside this repo
            (legacy laptop) and have custom-field IDs hardcoded for the old org — see the rerun checklist in{" "}
            <code className="ag-seq-mono" style={{ fontSize: 10 }}>_reference/analytics-port-manifest.md</code>.
            Conversation intel is intentionally omitted — no comms-style snapshot exists, and the deal-pattern data we have is not honestly that.
          </p>
        </div>

        </>}
      </main>
    </div>
  );
}

/* ============ Win/Loss sub-chart ============ */

function WinLossSubChart({
  title,
  rows,
  barClass,
  showFamilyEyebrow = false,
}: {
  title: string;
  rows: WinLossCut[];
  barClass: (row: WinLossCut) => string;
  showFamilyEyebrow?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="cmk-an-wl-sub">
        <h3 className="cmk-an-wl-h3">{title}</h3>
        <div className="cmk-an-empty">No data.</div>
      </div>
    );
  }
  const maxLead = safeMax(rows.map((r) => r.lead_count));
  return (
    <div className="cmk-an-wl-sub">
      <h3 className="cmk-an-wl-h3">{title}</h3>
      <div className="cmk-an-channels">
        {rows.map((r) => {
          const widthPct = (r.lead_count / maxLead) * 100;
          return (
            <div key={r.key} className="cmk-an-channel-row cmk-an-wl-row">
              <div className="cmk-an-channel-name">
                {r.key.replace(/_/g, " ")}
                {showFamilyEyebrow && (
                  <span className="cmk-an-channel-family">{r.lead_count} leads</span>
                )}
              </div>
              <div className="cmk-an-channel-bar-wrap">
                <div className={`cmk-an-channel-bar ${barClass(r)}`} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="cmk-an-channel-stats">
                <span title="leads">{r.lead_count}</span>
                <span className="lead-sep">·</span>
                <span title="won" style={{ color: "color-mix(in oklab, var(--sage-deep) 90%, var(--ink))" }}>{r.won_count}W</span>
                <span className="lead-sep">·</span>
                <span title="win rate" className="cmk-an-channel-pct">{r.win_rate_pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Urgency card ============ */

function UrgencyCard({
  label,
  tone,
  seg,
  delay,
  sub,
}: {
  label: string;
  tone: "leads" | "active" | "won" | "winrate" | "pipeline" | "events" | "yoy";
  seg: UrgencySegment;
  delay: number;
  sub: string;
}) {
  return (
    <div className={`cmk-an-card cmk-an-card-${tone}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="cmk-an-label">{label}</div>
      <div className="cmk-an-num">{seg.count.toLocaleString()}</div>
      <div className="cmk-an-sub">
        {pct(seg.pct)} · avg {seg.avg_value_fmt ?? fmtCents(seg.avg_value_cents)} · {sub}
      </div>
    </div>
  );
}

/* ============ Intel signals helper ============ */

type IntelSignal = { glyph: string; text: string; tone: "info" | "warn" | "good" };

function buildIntelSignals(
  sc: SourceChannelSnapshot,
  wl: WinLossSnapshot,
  rv: RevenueTrendsSnapshot,
  ue: UpcomingEventsSnapshot,
  blt: BookingLeadTimeSnapshot,
  coh: CohortSnapshot
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
  if (typeof blt._meta.won_with_event_date === "number" && blt._meta.won_with_event_date > 0) {
    out.push({
      glyph: "⏱",
      tone: "info",
      text: `${blt._meta.won_with_event_date.toLocaleString()} won deals carry an event date — booking-lead-time histogram below.`,
    });
  }

  // Cohort hint
  if (typeof coh._meta.total_cohorts === "number" && coh._meta.total_cohorts > 0) {
    out.push({
      glyph: "▤",
      tone: "info",
      text: `${coh._meta.total_cohorts} acquisition cohorts tracked — conversion curves and grid below.`,
    });
  }

  return out.slice(0, 7);
}
