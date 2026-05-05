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

type DiscoveryTab = "profile" | "map" | "quest" | "pipeline" | "restraint";
const VALID_TABS: DiscoveryTab[] = ["profile", "map", "quest", "pipeline", "restraint"];

type Props = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function fmtSlotValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" · ");
  return String(v);
}

function fmtGoal(goal?: string): string {
  if (!goal) return "—";
  return goal.replace(/_/g, " ");
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

export default async function LeadDiscoveryPage({ params, searchParams = {} }: Props) {
  const rawTab = searchParams["tab"];
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const activeTab: DiscoveryTab = (VALID_TABS as string[]).includes(tabParam || "")
    ? (tabParam as DiscoveryTab)
    : "profile";

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
  const plan = data.plan;
  const quest = synthesizeQuest(map, score.stage, plan as Parameters<typeof synthesizeQuest>[2]);

  const mapTone =
    map.completeness >= 0.7 ? "sage" : map.completeness >= 0.4 ? "peach" : "rose";

  const isLost = score.stage.current === "lost";
  const reachedSet = new Set(score.stage.reached.map((r) => r.id));
  const reachedAtById = new Map(score.stage.reached.map((r) => [r.id, r.reached_at]));

  const baseHref = `/lead/${params.id}/discovery`;

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <LeadSubNav leadId={params.id} />
      <LeadToolbar data={data} />

      <div className="lead-tab-body cmk-discovery-tab cmk-discovery-tab--full">
        {/* ─── Persistent score header ──────────────────────────────── */}
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
              <span className="cmk-discovery-score-num">
                {score.restraint == null ? "—" : `${score.restraint}%`}
              </span>
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

        {/* ─── Sub-tab nav ──────────────────────────────────────────── */}
        <nav className="proposal-tabs cmk-personal-tabs" aria-label="Discovery sections">
          <Link
            href={baseHref}
            data-tab="profile"
            className={`proposal-tab${activeTab === "profile" ? " proposal-tab-active" : ""}`}
          >
            Profile
          </Link>
          <Link
            href={`${baseHref}?tab=map`}
            data-tab="map"
            className={`proposal-tab${activeTab === "map" ? " proposal-tab-active" : ""}`}
          >
            Map
          </Link>
          <Link
            href={`${baseHref}?tab=quest`}
            data-tab="quest"
            className={`proposal-tab${activeTab === "quest" ? " proposal-tab-active" : ""}`}
          >
            Quest
          </Link>
          <Link
            href={`${baseHref}?tab=pipeline`}
            data-tab="pipeline"
            className={`proposal-tab${activeTab === "pipeline" ? " proposal-tab-active" : ""}`}
          >
            Pipeline
          </Link>
          <Link
            href={`${baseHref}?tab=restraint`}
            data-tab="restraint"
            className={`proposal-tab${activeTab === "restraint" ? " proposal-tab-active" : ""}`}
          >
            Restraint
          </Link>
        </nav>

        {/* ─── PROFILE ──────────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <section className="cmk-stack-panel cmk-stack-panel--sky cmk-discovery-profile">
            <div className="cmk-stack-panel-head">
              <div>
                <h2 className="cmk-stack-panel-title">Lead profile</h2>
                <div className="cmk-stack-panel-meta">
                  {plan ? `from latest ${plan.days.length}-day plan · goal ${fmtGoal(plan.primary_goal)}` : "no generated plan yet"}
                </div>
              </div>
              <div className="cmk-discovery-profile-actions">
                <RunScanButton leadId={params.id} />
                <Link href={`/lead/${params.id}`} className="plan-btn">
                  Open plan
                </Link>
              </div>
            </div>

            {plan ? (
              <div className="cmk-discovery-profile-grid">
                <article className="cmk-discovery-brief cmk-discovery-brief--wide">
                  <span className="cme-eyebrow">strategy</span>
                  <h3>{plan.goal_summary || "No strategy summary yet."}</h3>
                  {plan.lead_state_summary && <p>{plan.lead_state_summary}</p>}
                </article>

                {plan.best_next_question && (
                  <article className="cmk-discovery-brief cmk-discovery-brief--question">
                    <span className="cme-eyebrow">best next question</span>
                    <blockquote>{plan.best_next_question}</blockquote>
                  </article>
                )}

                <article className="cmk-discovery-brief">
                  <span className="cme-eyebrow">known</span>
                  {plan.known_facts.length > 0 ? (
                    <ul className="cmk-discovery-brief-list">
                      {plan.known_facts.map((fact, index) => (
                        <li key={`known-${index}`}>{fact}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cmk-discovery-empty">No plan-derived known facts yet.</p>
                  )}
                </article>

                <article className="cmk-discovery-brief">
                  <span className="cme-eyebrow">unknowns</span>
                  {plan.unknowns.length > 0 ? (
                    <ul className="cmk-discovery-brief-list">
                      {plan.unknowns.map((unknown, index) => (
                        <li key={`unknown-${index}`}>{unknown}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cmk-discovery-empty">No open unknowns recorded on the plan.</p>
                  )}
                </article>

                <article className="cmk-discovery-brief cmk-discovery-brief--wide">
                  <span className="cme-eyebrow">operating note</span>
                  <p>
                    Same-day multi-touch is allowed: several touches can sit in one calendar day, and the heartbeat runs them in order.
                    Rolling caps still apply, so a second outbound may hold on <code>FREQUENCY_CAP_24H</code> or <code>FREQUENCY_CAP_7D</code> until the window passes.
                  </p>
                </article>

                {plan.stop_conditions.length > 0 && (
                  <article className="cmk-discovery-brief cmk-discovery-brief--wide cmk-discovery-brief--stops">
                    <span className="cme-eyebrow">stop conditions</span>
                    <ul className="cmk-discovery-brief-list cmk-discovery-stop-list">
                      {plan.stop_conditions.map((stop, index) => (
                        <li key={`stop-${index}`}>
                          <strong>{stop.trigger}</strong>
                          <span>→ {stop.action}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                )}
              </div>
            ) : (
              <div className="cmk-discovery-empty cmk-discovery-profile-empty">
                Generate a plan first. Discovery will use its plan-derived strategy, knowns, unknowns, next question, and stop conditions here.
              </div>
            )}
          </section>
        )}

        {/* ─── MAP ──────────────────────────────────────────────────── */}
        {activeTab === "map" && (
          <section className={`cmk-stack-panel cmk-stack-panel--${mapTone}`}>
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">Discovery Map</h2>
              <div className="cmk-stack-panel-meta">
                {Math.round(map.completeness * 100)}% known · quest {map.by_category.quest.known}/{map.by_category.quest.total} · clarity {map.by_category.clarity.known}/{map.by_category.clarity.total} · consequence {map.by_category.consequence.known}/{map.by_category.consequence.total}
              </div>
            </div>
            <div className="cmk-discovery-grid cmk-discovery-grid--roomy">
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
        )}

        {/* ─── QUEST ────────────────────────────────────────────────── */}
        {activeTab === "quest" && (
          <section className="cmk-stack-panel cmk-stack-panel--lemon">
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">Current Quest</h2>
              <RunScanButton leadId={params.id} />
            </div>
            <div className="cmk-quest cmk-quest--roomy">
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
                    &ldquo;{quest.recommended_move.question}&rdquo;
                  </blockquote>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ─── PIPELINE ─────────────────────────────────────────────── */}
        {activeTab === "pipeline" && (
          <section className="cmk-stack-panel cmk-stack-panel--sage">
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">Pipeline stage</h2>
              <div className="cmk-stack-panel-meta">
                catering progression for this lead
              </div>
            </div>
            {isLost ? (
              <div className="cmk-discovery-pipeline-lost">
                <span className="cme-eyebrow">stage</span>
                <strong>Lost</strong>
              </div>
            ) : (
              <ol className="cmk-discovery-pipeline-list cmk-discovery-pipeline-list--roomy">
                {STAGE_ORDER.map((stageId) => {
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
        )}

        {/* ─── RESTRAINT ────────────────────────────────────────────── */}
        {activeTab === "restraint" && (
          <section className="cmk-stack-panel cmk-stack-panel--lavender">
            <div className="cmk-stack-panel-head">
              <h2 className="cmk-stack-panel-title">Restraint · last 10 heartbeats</h2>
              <div className="cmk-stack-panel-meta">
                {score.restraint_breakdown.fires} fired · {score.restraint_breakdown.good_skips} held back · {score.restraint_breakdown.bad_skips} failed
              </div>
            </div>
            {score.restraint == null ? (
              <p className="cmk-discovery-empty">No heartbeat data for this lead yet.</p>
            ) : (
              <>
                <div className="cmk-personal-restraint-headline">
                  <div className="cmk-personal-restraint-num">{score.restraint}%</div>
                  <div className="cmk-personal-restraint-caption">
                    {score.restraint_breakdown.good_skips > 0
                      ? `Held back ${score.restraint_breakdown.good_skips} times — guardrails working.`
                      : `${score.restraint_breakdown.fires} clean fires, no held-back actions.`}
                  </div>
                </div>
                <div className="cmk-discovery-restraint-chips">
                  {Object.entries(score.restraint_breakdown.by_code)
                    .sort((a, b) => b[1] - a[1])
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
        )}
      </div>
    </main>
  );
}
