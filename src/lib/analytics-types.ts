/* ========================================================================
   Analytics snapshot types — strict shapes for the JSON files in
   `src/data/analytics/*.json`. Each snapshot was exported from the legacy
   Comeketo Close org by a Python builder; see
   `_reference/analytics-port-manifest.md` for the full pipeline.

   All cents fields are integers (already in cents). All `_fmt` fields are
   pre-rendered display strings (e.g. "$94.2k") computed Python-side; render
   them as-is when present, fall back to the raw cents value through
   `fmtCents` if a chart wants live-formatted output.
   ======================================================================== */

export type SnapMeta = {
  schema_version?: string;
  description?: string;
  generated_at?: string;
  window_days?: number;
};

/* ── source_channel_snapshot ─────────────────────────────────────────── */

export type SourceChannelRow = {
  source_channel: string;
  source_family: string;
  lead_count: number;
  active_count: number;
  won_count: number;
  lost_count: number;
  win_rate_pct: number;
};

export type SourceChannelSnapshot = {
  _meta: SnapMeta & {
    lead_count: number;
    opportunity_count: number;
    window_days: number;
  };
  source_channels: SourceChannelRow[];
  status_distribution: Record<string, number>;
  source_family_distribution: Record<string, number>;
  owner_distribution: Record<string, number>;
  summary_text?: string;
};

/* ── seller_performance_snapshot ─────────────────────────────────────── */

export type OwnerStageBreakdown = { stage: string; count: number };

export type OwnerProfile = {
  owner_name: string;
  lead_count: number;
  active_count: number;
  won_count: number;
  lost_count: number;
  win_rate_pct: number;
  pipeline_value_cents: number;
  pipeline_value_fmt?: string;
  total_won_value_cents: number;
  total_won_value_fmt?: string;
  avg_won_value_cents: number;
  avg_won_value_fmt?: string;
  median_days_to_close: number;
  top_active_stages: OwnerStageBreakdown[];
  new_opps_this_period: number;
};

export type PipelineStageRow = {
  status_label: string;
  status_type: "active" | "won" | "lost" | string;
  count: number;
  active_count: number;
  won_count: number;
  lost_count: number;
  total_value_cents: number;
  total_value_fmt?: string;
};

export type SellerPerformanceSnapshot = {
  _meta: SnapMeta & {
    opportunity_count: number;
    owner_count: number;
  };
  owner_profiles: OwnerProfile[];
  pipeline: {
    stages: PipelineStageRow[];
    total_active_count: number;
    total_won_count: number;
    total_active_value_cents: number;
    total_active_value_fmt?: string;
    total_won_value_cents: number;
    total_won_value_fmt?: string;
    new_opps_this_period: number;
  };
  global_metrics: {
    total_opportunities: number;
    won_count: number;
    lost_count: number;
    active_count: number;
    win_rate_pct: number;
    global_median_days_to_close: number;
    total_active_value_cents: number;
    total_active_value_fmt?: string;
    total_won_value_cents: number;
    total_won_value_fmt?: string;
    new_opps_this_period: number;
  };
  summary_text?: string;
};

/* ── win_loss_snapshot ───────────────────────────────────────────────── */

export type WinLossCut = {
  key: string;
  lead_count: number;
  won_count: number;
  lost_count: number;
  active_count: number;
  win_rate_pct: number;
  avg_won_value_cents: number;
  avg_won_value_fmt?: string;
  total_won_value_cents: number;
  total_won_value_fmt?: string;
};

export type WinLossSnapshot = {
  _meta: SnapMeta & {
    opportunity_count: number;
    won_count: number;
    lost_count: number;
    active_count: number;
    overall_win_rate_pct: number;
  };
  funnel: {
    total: number;
    won: number;
    lost: number;
    active: number;
    win_rate_pct: number;
    total_won_value_cents: number;
    total_won_value_fmt?: string;
    total_lost_value_cents: number;
    total_lost_value_fmt?: string;
  };
  by_event_type: WinLossCut[];
  by_guest_bucket: WinLossCut[];
  by_value_bucket: WinLossCut[];
  by_source_family: WinLossCut[];
  by_source_channel: WinLossCut[];
  by_customer_type: WinLossCut[];
  by_owner: WinLossCut[];
  stage_of_death: Array<{ stage: string; count: number; pct_of_lost: number }>;
  owner_x_source: Array<{
    dim_a: string;
    dim_b: string;
    lead_count: number;
    won_count: number;
    lost_count: number;
    win_rate_pct: number;
  }>;
  etype_x_source: Array<{
    dim_a: string;
    dim_b: string;
    lead_count: number;
    won_count: number;
    lost_count: number;
    win_rate_pct: number;
  }>;
  time_patterns: {
    event_by_month: Array<{ month: string; month_num: number; event_count: number }>;
    close_time_buckets: Array<{ bucket: string; count: number }>;
    median_days_to_close: number;
    mean_days_to_close: number;
    fastest_close_days: number;
  };
  top_win_profiles: WinLossCut[];
  summary_text?: string;
};

/* ── revenue_trends_snapshot ─────────────────────────────────────────── */

export type MonthlyTrendRow = {
  month: string;
  month_label: string;
  new_leads: number;
  won_count: number;
  won_value_cents: number;
  won_value_fmt?: string;
  avg_deal_cents: number;
  avg_deal_fmt?: string;
  win_rate_pct: number;
};

export type RevenueConcentrationRow = {
  top_pct_of_deals: number;
  deal_count: number;
  revenue_cents: number;
  revenue_fmt?: string;
  pct_of_total_revenue: number;
};

export type RevenueTrendsSnapshot = {
  _meta: SnapMeta & {
    total_opps: number;
    won_count: number;
    lost_count: number;
    active_count: number;
    total_won_revenue_cents: number;
    total_won_revenue_fmt?: string;
    won_with_value_count: number;
  };
  yoy_comparison: {
    last_12mo_revenue_cents: number;
    last_12mo_revenue_fmt?: string;
    prior_12mo_revenue_cents: number;
    prior_12mo_revenue_fmt?: string;
    revenue_growth_pct: number;
    last_12mo_won_count: number;
    prior_12mo_won_count: number;
    won_count_growth_pct: number;
    last_12mo_lead_volume: number;
    prior_12mo_lead_volume: number;
    lead_volume_growth_pct: number;
    last_12mo_avg_deal_cents: number;
    last_12mo_avg_deal_fmt?: string;
    prior_12mo_avg_deal_cents: number;
    prior_12mo_avg_deal_fmt?: string;
    avg_deal_growth_pct: number;
  };
  deal_size_percentiles: {
    p25_cents: number;
    p25_fmt?: string;
    p50_cents: number;
    p50_fmt?: string;
    p75_cents: number;
    p75_fmt?: string;
    p90_cents: number;
    p90_fmt?: string;
    mean_cents: number;
    mean_fmt?: string;
    median_cents: number;
    median_fmt?: string;
    max_cents: number;
    max_fmt?: string;
  };
  deal_size_distribution: Array<{
    bucket: string;
    count: number;
    pct_of_deals: number;
    total_value_cents: number;
    total_value_fmt?: string;
    pct_of_revenue: number;
  }>;
  revenue_concentration: RevenueConcentrationRow[];
  monthly_trend: MonthlyTrendRow[];
  peak_booking_months: Array<{
    month_num: number;
    month_name: string;
    won_count: number;
    won_value_cents: number;
    won_value_fmt?: string;
  }>;
  source_revenue_share: Array<{
    source: string;
    total_leads: number;
    won_count: number;
    won_value_cents: number;
    won_value_fmt?: string;
    pct_of_total_revenue: number;
    avg_won_value_cents: number;
    avg_won_value_fmt?: string;
    win_rate_pct: number;
  }>;
  event_type_revenue_share: Array<{
    event_type: string;
    total_leads: number;
    won_count: number;
    won_value_cents: number;
    won_value_fmt?: string;
    pct_of_total_revenue: number;
    avg_won_value_cents: number;
    avg_won_value_fmt?: string;
  }>;
  summary_text?: string;
};

/* ── booking_lead_time_snapshot ──────────────────────────────────────── */

export type LeadTimeBucket = {
  bucket: string;
  label: string;
  count: number;
  pct_of_bookings: number;
  won_value_cents: number;
  won_value_fmt?: string;
  avg_value_cents: number;
  avg_value_fmt?: string;
};

export type UrgencySegment = {
  count: number;
  pct: number;
  avg_value_cents: number;
  avg_value_fmt?: string;
};

export type BookingLeadTimeSnapshot = {
  _meta: SnapMeta & {
    total_opps: number;
    won_with_event_date: number;
    won_with_future_event: number;
  };
  global_stats: {
    bookings_with_lead_time: number;
    bookings_total: number;
    median_days: number;
    mean_days: number;
    p25_days: number;
    p75_days: number;
    p90_days: number;
    min_days: number;
    max_days: number;
  };
  urgency_segments: {
    last_minute: UrgencySegment;
    planned: UrgencySegment;
    long_horizon: UrgencySegment;
  };
  histogram: LeadTimeBucket[];
  by_event_type: Array<{
    event_type: string;
    count: number;
    median_days: number;
    mean_days: number;
    min_days: number;
    max_days: number;
    won_value_cents: number;
    won_value_fmt?: string;
    pct_under_90d: number;
    pct_over_180d: number;
  }>;
  by_source_family: Array<{
    source: string;
    count: number;
    median_days: number;
    mean_days: number;
    pct_under_90d: number;
    pct_over_180d: number;
  }>;
  by_event_month: Array<{
    month_num: number;
    month_name: string;
    count: number;
    median_days: number;
    mean_days: number;
  }>;
  summary_text?: string;
};

/* ── cohort_snapshot ─────────────────────────────────────────────────── */

export type CohortWindowKey = "30d" | "60d" | "90d" | "6mo" | "1yr" | "2yr";
export type CohortWindowCell = { converted: number; rate_pct: number };

export type CohortRow = {
  cohort: string;
  total_leads: number;
  total_converted: number;
  total_value_cents: number;
  age_days: number;
  maturity: string;
  windows: Partial<Record<CohortWindowKey, CohortWindowCell>>;
  best_rate_pct: number;
  source?: string;
};

export type ConversionCurveRow = {
  window: string;
  window_days: number;
  avg_conversion_rate_pct: number;
  total_converted: number;
  total_eligible_leads: number;
  overall_rate_pct: number;
};

export type CohortSnapshot = {
  _meta: SnapMeta & {
    total_opps: number;
    total_cohorts: number;
    conversion_windows: string[];
  };
  conversion_curves: ConversionCurveRow[];
  cohort_grid: CohortRow[];
  best_cohorts: CohortRow[];
  worst_cohorts: CohortRow[];
  recent_cohort_health: CohortRow[];
  source_cohorts: CohortRow[];
  summary_text?: string;
};

/* ── upcoming_events_snapshot ────────────────────────────────────────── */

export type UpcomingEventsSnapshot = {
  _meta: SnapMeta & {
    event_count: number;
    total_guests: number;
    total_value_cents: number;
  };
  // The remainder of the snapshot (`upcoming_events`, `monthly_schedule`,
  // `event_type_distribution`, etc.) is read-only background and not used
  // by any chart this sprint. Kept loose so future charts can narrow it.
  [key: string]: unknown;
};
