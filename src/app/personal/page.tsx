import Link from "next/link";
import { buildPersonalScoreboard } from "@/lib/personal-scoreboard";
import { TabNav } from "@/components/TabNav";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function PersonalPage() {
  const data = await buildPersonalScoreboard();

  if ("error" in data) {
    return (
      <>
        <AppHeader />
        <TabNav />
        <main className="lead-main">
          <div className="cme-eyebrow">personal</div>
          <h1 className="lead-title">Scoreboard unavailable</h1>
          <pre className="lead-error">{data.error}</pre>
        </main>
      </>
    );
  }

  const totalQuestSlots = data.slot_fill_rates.filter((s) => s.category === "quest");
  const totalClaritySlots = data.slot_fill_rates.filter((s) => s.category === "clarity");
  const totalConsequenceSlots = data.slot_fill_rates.filter((s) => s.category === "consequence");
  const sumKnown = (arr: typeof data.slot_fill_rates) => arr.reduce((s, x) => s + x.known, 0);
  const sumTotal = (arr: typeof data.slot_fill_rates) => arr.reduce((s, x) => s + x.total, 0);

  return (
    <>
      <AppHeader />
      <TabNav />
      <main className="cmk-personal">
        <header className="cmk-personal-head">
          <div className="cme-eyebrow">player profile</div>
          <h1 className="cmk-personal-title">Andre · pipeline scoreboard</h1>
          <p className="cmk-personal-sub">
            {data.total_leads} active lead{data.total_leads === 1 ? "" : "s"} ·
            generated {fmtRelative(data.generated_at)}
          </p>
        </header>

        {/* ─── Top KPI strip ──────────────────────────────────────── */}
        <section className="cmk-personal-kpis">
          <div className="cmk-personal-kpi cmk-personal-kpi-peach">
            <div className="cmk-personal-kpi-num">{data.total_xp}</div>
            <div className="cmk-personal-kpi-lbl">Total Discovery XP</div>
          </div>
          <div className="cmk-personal-kpi cmk-personal-kpi-sky">
            <div className="cmk-personal-kpi-num">{data.avg_clarity}%</div>
            <div className="cmk-personal-kpi-lbl">Avg Clarity</div>
          </div>
          <div className="cmk-personal-kpi cmk-personal-kpi-lavender">
            <div className="cmk-personal-kpi-num">
              {data.restraint_30d == null ? "—" : `${data.restraint_30d}%`}
            </div>
            <div className="cmk-personal-kpi-lbl">Restraint · 30d</div>
          </div>
          <div className="cmk-personal-kpi cmk-personal-kpi-sage">
            <div className="cmk-personal-kpi-num">{data.total_leads}</div>
            <div className="cmk-personal-kpi-lbl">Active leads</div>
          </div>
        </section>

        {/* ─── Pipeline funnel ────────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--sage">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Pipeline funnel</h2>
            <div className="cmk-stack-panel-meta">leads at each catering stage</div>
          </div>
          <div className="cmk-personal-funnel">
            {data.pipeline_funnel.map((s) => {
              const max = Math.max(1, ...data.pipeline_funnel.map((x) => x.count));
              const pct = (s.count / max) * 100;
              return (
                <div key={s.id} className="cmk-personal-funnel-row">
                  <span className="cmk-personal-funnel-lbl">{s.label}</span>
                  <div className="cmk-personal-funnel-bar">
                    <div
                      className="cmk-personal-funnel-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="cmk-personal-funnel-n">{s.count}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Slot-fill rates ────────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--sky">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Discovery coverage</h2>
            <div className="cmk-stack-panel-meta">
              quest {sumKnown(totalQuestSlots)}/{sumTotal(totalQuestSlots)} ·
              clarity {sumKnown(totalClaritySlots)}/{sumTotal(totalClaritySlots)} ·
              consequence {sumKnown(totalConsequenceSlots)}/{sumTotal(totalConsequenceSlots)}
            </div>
          </div>
          <div className="cmk-personal-fillrates">
            {data.slot_fill_rates.map((s) => (
              <div key={s.slot_id} className="cmk-personal-fill-row">
                <span className="cmk-personal-fill-lbl">{s.label}</span>
                <span className={`cmk-personal-fill-cat cmk-personal-fill-cat-${s.category}`}>
                  {s.category}
                </span>
                <div className="cmk-personal-fill-bar">
                  <div className="cmk-personal-fill-fill" style={{ width: `${s.pct}%` }} />
                </div>
                <span className="cmk-personal-fill-n">
                  {s.known}/{s.total}
                </span>
                <span className="cmk-personal-fill-pct">{s.pct}%</span>
              </div>
            ))}
          </div>
        </section>

        <div className="cmk-personal-2col">
          {/* ─── Top quest themes ─────────────────────────────────── */}
          <section className="cmk-stack-panel cmk-stack-panel--lemon">
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">Top quests</h2>
              <div className="cmk-stack-panel-meta">most common gaps</div>
            </div>
            {data.top_quests.length === 0 ? (
              <p className="cmk-discovery-empty">No active gaps — every slot is filled across the board.</p>
            ) : (
              <ol className="cmk-personal-quests">
                {data.top_quests.map((q) => (
                  <li key={q.slot_id} className="cmk-personal-quest-row">
                    <span className="cmk-personal-quest-num">{q.unknown_count}</span>
                    <span className="cmk-personal-quest-lbl">
                      lead{q.unknown_count === 1 ? "" : "s"} need <strong>{q.label.toLowerCase()}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ─── Hot tags ─────────────────────────────────────────── */}
          <section className="cmk-stack-panel cmk-stack-panel--peach">
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">🟢 SCORE tags</h2>
              <div className="cmk-stack-panel-meta">your hot-tag distribution</div>
            </div>
            {data.hot_tag_counts.length === 0 ? (
              <p className="cmk-discovery-empty">No 🟢 SCORE tags set across active leads.</p>
            ) : (
              <ul className="cmk-personal-hottags">
                {data.hot_tag_counts.slice(0, 12).map((t) => (
                  <li key={t.tag} className="cmk-personal-hottag-row">
                    <span className="cmk-personal-hottag-lbl">{t.tag}</span>
                    <span className="cmk-personal-hottag-n">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ─── Top leads ──────────────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--lavender">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Top leads</h2>
            <div className="cmk-stack-panel-meta">
              ranked by hot-tags · clarity · recency
            </div>
          </div>
          {data.top_leads.length === 0 ? (
            <p className="cmk-discovery-empty">No active leads.</p>
          ) : (
            <div className="cmk-personal-toplist">
              {data.top_leads.map((l, i) => (
                <Link
                  key={l.lead_id}
                  href={`/lead/${l.lead_id}/discovery`}
                  className="cmk-personal-topitem"
                >
                  <span className="cmk-personal-topitem-rank">{i + 1}</span>
                  <span className="cmk-personal-topitem-name">{l.display_name}</span>
                  <span className="cmk-personal-topitem-stage">{l.stage}</span>
                  <span className="cmk-personal-topitem-clarity">
                    <span className="cmk-personal-topitem-clarity-bar">
                      <span
                        className="cmk-personal-topitem-clarity-fill"
                        style={{ width: `${l.clarity}%` }}
                      />
                    </span>
                    <span className="cmk-personal-topitem-clarity-n">{l.clarity}%</span>
                  </span>
                  <span className="cmk-personal-topitem-when">
                    {fmtRelative(l.date_updated)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ─── Restraint footer ───────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--lavender">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Restraint · last 30 days</h2>
            <div className="cmk-stack-panel-meta">
              {data.restraint_breakdown.fires} fired ·
              {" "}
              {data.restraint_breakdown.good_skips} held back ·
              {" "}
              {data.restraint_breakdown.bad_skips} failed
            </div>
          </div>
          {data.restraint_30d == null ? (
            <p className="cmk-discovery-empty">No heartbeat activity yet in the 30-day window.</p>
          ) : (
            <>
              <p className="cmk-discovery-restraint-caption">
                {data.restraint_breakdown.good_skips > 0
                  ? `Held back ${data.restraint_breakdown.good_skips} times — guardrails earning their keep.`
                  : `${data.restraint_breakdown.fires} clean fires, no held-back actions.`}
              </p>
              <div className="cmk-discovery-restraint-chips">
                {Object.entries(data.restraint_breakdown.by_code)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 14)
                  .map(([code, n]) => (
                    <span key={code} className="cmk-discovery-restraint-chip">
                      <span className="cmk-discovery-restraint-chip-code">{code}</span>
                      <span className="cmk-discovery-restraint-chip-n">{n}</span>
                    </span>
                  ))}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
