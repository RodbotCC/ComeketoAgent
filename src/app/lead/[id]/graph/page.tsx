import Link from "next/link";
import { LeadSubNav } from "../LeadSubNav";
import { loadLeadBoxPageData } from "../load-lead-box";
import { PlanGraphView } from "../PlanGraphView";
import { PlanPageBeacon } from "../PlanPageBeacon";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

/**
 * /lead/[id]/graph — plan-as-graph view with simulate-driven node coloring.
 * Reuses the AutomationCanvas + the leadPlanToManifest adapter.
 *
 * AppHeader + TabNav come from src/app/lead/[id]/layout.tsx — don't duplicate.
 */
export default async function LeadGraphPage({ params }: Props) {
  const loaded = await loadLeadBoxPageData(params.id);

  if ("error" in loaded) {
    return (
      <main className="lead-main">
        <LeadSubNav leadId={params.id} />
        <div className="cme-eyebrow">lead</div>
        <h1 className="lead-title">Box failed to load</h1>
        <pre className="lead-error">{loaded.error || "(unknown)"}</pre>
        <p style={{ marginTop: 16 }}>
          <Link href="/leads" className="lead-back">← back to leads</Link>
        </p>
      </main>
    );
  }

  const { plan } = loaded;

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <PlanPageBeacon leadId={params.id} plan={plan} />
      <LeadSubNav leadId={params.id} />

      {!plan ? (
        <div className="lead-card widget plan-empty" style={{ marginTop: 16 }}>
          <h3 className="lead-card-h">No plan yet</h3>
          <p className="plan-empty-msg">
            Generate a plan from the Plan tab, then come back here to see it as a graph and simulate the heartbeat.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link href={`/lead/${params.id}`} className="plan-btn plan-btn-primary">
              Open Plan tab →
            </Link>
          </p>
        </div>
      ) : (
        <PlanGraphView plan={plan} leadId={params.id} />
      )}
    </main>
  );
}
