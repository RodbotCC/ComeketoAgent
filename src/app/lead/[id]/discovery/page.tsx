import Link from "next/link";
import { LeadSubNav } from "../LeadSubNav";
import { LeadToolbar } from "../LeadToolbar";
import { loadLeadBoxPageData } from "../load-lead-box";
import { journeyScoreForLead } from "@/lib/journey-score";
import { synthesizeQuest } from "@/lib/quest";
import { PIPELINE_STAGES, type PipelineStageId } from "@/lib/discovery-map";
import { DiscoverySlotEditor } from "./DiscoverySlotEditor";
import { RunScanButton } from "./RunScanButton";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function fmtSlotValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" · ");
  return String(v);
}

const STAGE_ORDER: PipelineStageId[] = [
  "lead",
  "discovery_started",
  "tasting_booked",
  "tasting_done",
  "beo_sent",
  "agreement_signed",
  "deposit_in",
  "event_won",
];

export default async function LeadDiscoveryPage({ params }: Props) {
  const loaded = await loadLeadBoxPageData(params.id);
  if ("error" in loaded) {
    return (
      <main className="lead-main">
        <LeadSubNav leadId={params.id} />
        <div className="cme-eyebrow">lead</div>
        <h1 className="lead-title">Discovery failed to load</h1>
        <pre className="lead-error">{loaded.error}</pre>
        <p style={{ marginTop: 16 }}>
          <Link href="/leads" className="lead-back">← back to leads</Link>
        </p>
      </main>
    );
  }

  const data = loaded;
  const result = await journeyScoreForLead(params.id);
  if ("error" in result) {
    return (
      <main className="lead-main">
        <LeadSubNav leadId={params.id} />
        <LeadToolbar data={data} />
        <div className="lead-tab-body">
          <div className="cmk-stack-panel cmk-stack-panel--rose">
            <h2 className="cmk-stack-panel-title">Journey score unavailable</h2>
            <pre className="lead-error">{result.error}</pre>
          </div>
        </div>
      </main>
    );
  }

  const { score, map } = result;
  const quest = synthesizeQuest(map, score.stage, data.plan as Parameters<typeof synthesizeQuest>[2]);

  // Determine completeness tone for the Discovery Map panel.
  const mapTone =
    map.completeness >= 0.7 ? "sage" : map.completeness >= 0.4 ? "peach" : "rose";

  // Pipeline strip — current index for the active stage marker.
  const isLost = score.stage.current === "lost";
  const reachedSet = new Set(score.stage.reached.map((r) => r.id));
  const currentIdx = STAGE_ORDER.indexOf(score.stage.current);
  const reachedAtById = new Map(score.stage.reached.map((r) => [r.id, r.reached_at]));

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <LeadSubNav leadId={params.id} />
      <LeadToolbar data={data} />

      <div className="lead-tab-body cmk-discovery-tab">
        {/* ─── Score header ─────────────────────────────────────────── */}
        <header className="cmk-discovery-head">
          <div className="cme-eyebrow">journey score</div>
          <div className="cmk-discovery-scores">
            <div className="cmk-discovery-score">
              <span className="cmk-discovery-score-num">{fmtPct(score.clarity)}</span>
              <span className="cmk-discovery-score-lbl">Clarity</span>
            </div>
            <div className="cmk-discovery-score">
              <span className="cmk-discovery-score-num">{fmtPct(score.readiness)}</span>
              <span className="cmk-discovery-score-lbl">Readiness</span>
            </div>
            <div className="cmk-discovery-score">
              <span className="cmk-discovery-score-num">{score.restraint == null ? "—" : `${score.restraint}%`}</span>
              <span className="cmk-discovery-score-lbl">Restraint</span>
            </div>
            <div className="cmk-discovery-score">
              <span className="cmk-discovery-score-num">{score.discovery_xp}</span>
              <span className="cmk-discovery-score-lbl">XP</span>
            </div>
          </div>
          {score.hot_tags.length > 0 && (
            <div className="cmk-discovery-hot">
              <span className="cme-eyebrow">🟢 score</span>
              <span className="cmk-discovery-hot-tags">
                {score.hot_tags.map((t) => (
                  <span key={t} className="cmk-discovery-hot-tag">{t}</span>
                ))}
              </span>
            </div>
          )}
        </header>

        {/* ─── Pipeline stage strip ────────────────────────────────── */}
        <section className="cmk-discovery-pipeline" aria-label="Pipeline stage">
          {isLost ? (
            <div className="cmk-discovery-pipeline-lost">
              <span className="cme-eyebrow">stage</span>
              <strong>Lost</strong>
            </div>
          ) : (
            <ol className="cmk-discovery-pipeline-list">
              {STAGE_ORDER.map((stageId, idx) => {
                const def = PIPELINE_STAGES.find((s) => s.id === stageId)!;
                const reached = reachedSet.has(stageId);
                const current = stageId === score.stage.current;
                const at = reachedAtById.get(stageId);
                return (
                  <li
                    key={stageId}
                    className={`cmk-discovery-pipeline-step${reached ? " is-reached" : ""}${current ? " is-current" : ""}`}
                  >
                    <span className="cmk-discovery-pipeline-dot" aria-hidden />
                    <span className="cmk-discovery-pipeline-label">{def.label}</span>
                    {at && (
                      <span className="cmk-discovery-pipeline-at">
                        {new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ─── Discovery Map slot grid ─────────────────────────────── */}
        <section className={`cmk-stack-panel cmk-stack-panel--${mapTone}`}>
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Discovery Map</h2>
            <div className="cmk-stack-panel-meta">
              {Math.round(map.completeness * 100)}% known · quest {map.by_category.quest.known}/{map.by_category.quest.total} · clarity {map.by_category.clarity.known}/{map.by_category.clarity.total} · consequence {map.by_category.consequence.known}/{map.by_category.consequence.total}
            </div>
          </div>
          <div className="cmk-discovery-grid">
            {map.slots.map((s) => (
              <DiscoverySlotEditor
                key={s.slot.id}
                leadId={params.id}
                slotId={s.slot.id}
                slotLabel={s.slot.label}
                whyItMatters={s.slot.why_it_matters}
                currentValue={fmtSlotValue(s.value)}
                source={s.source}
                evidenceExcerpt={s.evidence?.excerpt ?? null}
                status={s.status}
                readonly={s.source === "close_custom"}
              />
            ))}
          </div>
        </section>

        {/* ─── Current Quest ───────────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--lemon">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Current Quest</h2>
            <RunScanButton leadId={params.id} />
          </div>
          <div className="cmk-quest">
            <div className="cmk-quest-row">
              <span className="cme-eyebrow">current</span>
              <h3 className="cmk-quest-title">{quest.current.title}</h3>
              <p className="cmk-quest-body">{quest.current.body}</p>
            </div>
            {quest.bonus && (
              <div className="cmk-quest-row">
                <span className="cme-eyebrow">bonus</span>
                <h3 className="cmk-quest-title">{quest.bonus.title}</h3>
                <p className="cmk-quest-body">{quest.bonus.body}</p>
              </div>
            )}
            {quest.risk && (
              <div className="cmk-quest-row cmk-quest-row--risk">
                <span className="cme-eyebrow">risk</span>
                <h3 className="cmk-quest-title">{quest.risk.title}</h3>
                <p className="cmk-quest-body">{quest.risk.body}</p>
              </div>
            )}
            <div className="cmk-quest-row cmk-quest-row--move">
              <span className="cme-eyebrow">recommended move</span>
              <p className="cmk-quest-body">{quest.recommended_move.headline}</p>
              {quest.recommended_move.question && (
                <blockquote className="cmk-quest-question">
                  "{quest.recommended_move.question}"
                </blockquote>
              )}
            </div>
          </div>
        </section>

        {/* ─── Restraint panel ─────────────────────────────────────── */}
        <section className="cmk-stack-panel cmk-stack-panel--lavender">
          <div className="cmk-stack-panel-head">
            <h2 className="cmk-stack-panel-title">Restraint</h2>
            <div className="cmk-stack-panel-meta">
              last 10 heartbeats · {score.restraint_breakdown.fires} fired · {score.restraint_breakdown.good_skips} held back · {score.restraint_breakdown.bad_skips} failed
            </div>
          </div>
          {score.restraint == null ? (
            <p className="cmk-discovery-empty">No heartbeat data for this lead yet.</p>
          ) : (
            <>
              <p className="cmk-discovery-restraint-caption">
                {score.restraint_breakdown.good_skips > 0
                  ? `Held back ${score.restraint_breakdown.good_skips} times — guardrails working.`
                  : `${score.restraint_breakdown.fires} clean fires, no held-back actions.`}
              </p>
              <div className="cmk-discovery-restraint-chips">
                {Object.entries(score.restraint_breakdown.by_code)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
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
      </div>
    </main>
  );
}
