import Link from "next/link";
import { HeartbeatPanel } from "../HeartbeatPanel";
import { LeadSubNav } from "../LeadSubNav";
import { LeadToolbar } from "../LeadToolbar";
import { loadLeadBoxPageData, heartbeatLatestFromRow } from "../load-lead-box";
import { BoxAnalyticsStrip, BoxTimeline, RecentExecutionStrip } from "../BoxTimeline";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

/**
 * /lead/[id]/heartbeat — cadence strip, manual heartbeat, merged timeline, execution audit.
 */
export default async function LeadHeartbeatTabPage({ params }: Props) {
  const loaded = await loadLeadBoxPageData(params.id);

  if ("error" in loaded) {
    return (
      <main className="lead-main">
        <LeadSubNav leadId={params.id} />
        <div className="cme-eyebrow">lead</div>
        <h1 className="lead-title">Box failed to load</h1>
        <pre className="lead-error">{loaded.error}</pre>
        <p style={{ marginTop: 16 }}>
          <Link href="/leads" className="lead-back">
            ← back to leads
          </Link>
        </p>
      </main>
    );
  }

  const data = loaded;
  const { plan, settings, planFresh, replyGate, cycleDayDisplay, lastInbound, lastOutbound, timelineItems, execRows } = data;

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <LeadSubNav leadId={params.id} />
      <LeadToolbar data={data} />
      <BoxAnalyticsStrip
        planFresh={planFresh}
        replyGate={replyGate}
        cycleDayDisplay={cycleDayDisplay}
        lastInboundAt={lastInbound ? lastInbound.date_created : null}
        lastOutboundAt={lastOutbound ? lastOutbound.date_created : null}
      />
      <div className="lead-tab-body">
        <div className="lead-tab-scroll scroll-hide">
          {plan && (
            <HeartbeatPanel
              planId={plan.plan_id}
              leadId={params.id}
              executionMode={settings.execution_mode}
              latest={heartbeatLatestFromRow(data.latestHeartbeat)}
            />
          )}
          <div className="lead-card widget" style={{ marginTop: 12 }}>
            <h3 className="lead-card-h">Timeline</h3>
            <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
              Activities, email threads, and plan days (newest first). Open Activity on Box for the full feed.
            </p>
            <div className="cmk-scroll scroll-hide" style={{ maxHeight: 340, overflowY: "auto", marginTop: 10 }}>
              <BoxTimeline items={timelineItems} />
            </div>
          </div>
          <RecentExecutionStrip leadId={params.id} rows={execRows} />
        </div>
      </div>
    </main>
  );
}
