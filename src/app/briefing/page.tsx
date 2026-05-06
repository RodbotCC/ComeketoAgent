import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { closeListLeads, type CloseLead } from "@/lib/close";
import { listRecentExecutionGlobal } from "@/lib/execution-audit";
import { aggregateOperatorTruth } from "@/lib/heartbeat-truth";
import { pipelineStateForOwner } from "@/lib/pipeline-state";
import { listPlansForProposalReview } from "@/lib/plans-db";

export const dynamic = "force-dynamic";

function leadName(lead: CloseLead) {
  return lead.display_name || lead.name || lead.id;
}

function shortDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isNewLead(lead: CloseLead) {
  if (!lead.date_created) return false;
  return Date.now() - new Date(lead.date_created).getTime() < 72 * 60 * 60 * 1000;
}

export default async function BriefingPage() {
  const generatedAt = new Date();
  let err: string | null = null;
  let leads: CloseLead[] = [];
  let pipeline: Awaited<ReturnType<typeof pipelineStateForOwner>> | null = null;
  let truth: Awaited<ReturnType<typeof aggregateOperatorTruth>> | null = null;
  let execution: Awaited<ReturnType<typeof listRecentExecutionGlobal>> = [];
  let plans: Awaited<ReturnType<typeof listPlansForProposalReview>> = [];

  try {
    [leads, pipeline, truth, execution, plans] = await Promise.all([
      closeListLeads({ limit: 80 }),
      pipelineStateForOwner("andre"),
      aggregateOperatorTruth(),
      listRecentExecutionGlobal(18),
      listPlansForProposalReview(80),
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  const newLeads = leads.filter(isNewLead).slice(0, 8);
  const movingLeads = leads
    .filter((lead) => !isNewLead(lead))
    .sort((a, b) => new Date(b.date_updated || 0).getTime() - new Date(a.date_updated || 0).getTime())
    .slice(0, 10);
  const proposalCounts = plans.reduce(
    (acc, plan) => {
      for (const day of plan.days) {
        acc.days += 1;
        acc.touches += day.required_actions.length;
        acc[day.approval_status] = (acc[day.approval_status] ?? 0) + 1;
      }
      return acc;
    },
    {
      days: 0,
      touches: 0,
      needs_review: 0,
      approved: 0,
      not_ready: 0,
      sent: 0,
      skipped: 0,
    } as Record<string, number>
  );
  const recentMeaningful = execution
    .filter((row) => row.action_kind !== "heartbeat_run" || row.result === "error")
    .slice(0, 8);

  return (
    <div className="cme-shell">
      <AppHeader />
      <main className="briefing-page scroll-hide">
        {err ? (
          <div className="lead-error">
            <strong>Briefing failed to load:</strong> {err}
          </div>
        ) : (
          <>
            <section className="briefing-hero">
              <div>
                <span className="cme-eyebrow">briefing · refreshed {shortDate(generatedAt.toISOString())}</span>
                <h1>What changed, what matters, what needs a look.</h1>
                <p>
                  New leads, movement inside current leads, proposal pressure, and heartbeat activity in one place.
                  Use this as the first read before touching the rest of the app.
                </p>
              </div>
              <Link href={`/briefing?refresh=${Date.now()}`} className="plan-btn plan-btn-primary">
                Refresh
              </Link>
            </section>

            <section className="briefing-kpi-grid">
              <div className="briefing-kpi briefing-kpi-sage">
                <span>new leads</span>
                <strong>{newLeads.length}</strong>
                <p>created in the last 72 hours</p>
              </div>
              <div className="briefing-kpi briefing-kpi-lavender">
                <span>today eligible</span>
                <strong>{truth?.today_eligible ?? pipeline?.today_eligible ?? 0}</strong>
                <p>{truth?.waiting_count ?? pipeline?.waiting_count ?? 0} waiting on operator</p>
              </div>
              <div className="briefing-kpi briefing-kpi-peach">
                <span>proposal review</span>
                <strong>{proposalCounts.needs_review}</strong>
                <p>{proposalCounts.approved} approved · {proposalCounts.touches} touches</p>
              </div>
              <div className="briefing-kpi briefing-kpi-sky">
                <span>fired today</span>
                <strong>{truth?.fired_count ?? pipeline?.fired_count ?? 0}</strong>
                <p>{truth?.gated_today?.[0]?.code?.toLowerCase().replace(/_/g, " ") ?? "no top gate"}</p>
              </div>
            </section>

            <section className="briefing-grid">
              <div className="briefing-panel briefing-panel-wide">
                <div className="briefing-panel-head">
                  <span className="cme-eyebrow">new leads</span>
                  <Link href="/leads" className="briefing-link">all leads</Link>
                </div>
                <div className="briefing-lead-list">
                  {newLeads.length === 0 ? (
                    <div className="briefing-empty">No new leads in the last 72 hours.</div>
                  ) : (
                    newLeads.map((lead) => (
                      <Link key={lead.id} href={`/lead/${lead.id}`} className="briefing-lead-row">
                        <span>
                          <strong>{leadName(lead)}</strong>
                          <em>{lead.status_label || "no status"}</em>
                        </span>
                        <small>{shortDate(lead.date_created)}</small>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="briefing-panel">
                <div className="briefing-panel-head">
                  <span className="cme-eyebrow">movement</span>
                  <span>{movingLeads.length}</span>
                </div>
                <div className="briefing-lead-list">
                  {movingLeads.map((lead) => (
                    <Link key={lead.id} href={`/lead/${lead.id}`} className="briefing-lead-row compact">
                      <span>
                        <strong>{leadName(lead)}</strong>
                        <em>{lead.status_label || "updated lead"}</em>
                      </span>
                      <small>{shortDate(lead.date_updated)}</small>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="briefing-panel">
                <div className="briefing-panel-head">
                  <span className="cme-eyebrow">waiting on you</span>
                  <Link href="/proposals" className="briefing-link">review</Link>
                </div>
                <div className="briefing-action-list">
                  {(pipeline?.waiting_top ?? []).length === 0 ? (
                    <div className="briefing-empty">No waiting examples from the current pipeline summary.</div>
                  ) : (
                    pipeline!.waiting_top.map((item, idx) => (
                      <Link key={`${item.lead_id}-${idx}`} href={`/lead/${item.lead_id}`} className="briefing-action-row">
                        <span className={`plan-action-chip plan-action-chip-${item.channel}`}>{item.channel}</span>
                        <strong>{item.name}</strong>
                        <em>{item.intent}</em>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="briefing-panel">
                <div className="briefing-panel-head">
                  <span className="cme-eyebrow">recent system moves</span>
                  <Link href="/console" className="briefing-link">console</Link>
                </div>
                <div className="briefing-log-list">
                  {recentMeaningful.map((row) => (
                    <Link
                      key={row.id}
                      href={row.trace_id ? `/console?trace=${row.trace_id}` : "/console"}
                      className="briefing-log-row"
                    >
                      <span>{row.action_kind.replace(/_/g, " ")}</span>
                      <small>{shortDate(row.at)}</small>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
