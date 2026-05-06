import Link from "next/link";
import { PlanSection } from "./PlanSection";
import { LeadToolbar } from "./LeadToolbar";
import { loadLeadBoxPageData } from "./load-lead-box";
import { BoxAnalyticsStrip } from "./BoxTimeline";
import { PlanPageBeacon } from "./PlanPageBeacon";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

/**
 * /lead/[id] — Plan tab: seven-day cycle, approvals, regeneration (no heartbeat UI).
 */
export default async function LeadPlanPage({ params }: Props) {
  const loaded = await loadLeadBoxPageData(params.id);

  if ("error" in loaded) {
    return (
      <main className="lead-main">
        <div className="cme-eyebrow">lead</div>
        <h1 className="lead-title">Box failed to load</h1>
        <pre className="lead-error">{loaded.error || "(unknown)"}</pre>
        <p style={{ marginTop: 16 }}>
          <Link href="/leads" className="lead-back">
            ← back to leads
          </Link>
        </p>
      </main>
    );
  }

  const data = loaded;
  const { plan, planError, settings, planEligible, currentSnapshotId, replyGate, planFresh, cycleDayDisplay, lastInbound, lastOutbound, intakeArtifacts, box } = data;
  const leadName = box?.lead?.display_name || "(unnamed lead)";

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <PlanPageBeacon leadId={params.id} plan={plan} />
      <LeadToolbar data={data} />
      <BoxAnalyticsStrip
        planFresh={planFresh}
        replyGate={replyGate}
        cycleDayDisplay={cycleDayDisplay}
        lastInboundAt={lastInbound ? lastInbound.date_created : null}
        lastOutboundAt={lastOutbound ? lastOutbound.date_created : null}
      />
      <div className="lead-tab-body">
        {planEligible ? (
          <div className="lead-tab-scroll scroll-hide" id="cycle-plan">
            <div className="lead-plan-wrap">
              <PlanSection
                leadId={params.id}
                plan={plan}
                planError={planError}
                currentSnapshotId={currentSnapshotId}
                defaultHorizonDays={settings.default_plan_horizon_days}
                leadName={leadName}
                intakeArtifacts={intakeArtifacts}
              />
            </div>
          </div>
        ) : (
          <div className="lead-card widget plan-empty">
            <p className="plan-empty-msg">
              Cycle plan is gated for this lead (ownership or terminal status). Open{" "}
              <Link href={`/lead/${params.id}/box`} className="lead-back">
                Box
              </Link>{" "}
              for profile and activity.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
