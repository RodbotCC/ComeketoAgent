import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { listPlansNeedingReview } from "@/lib/plans-db";
import { closeGetLeadFull } from "@/lib/close";
import { snapshotIdForBox } from "@/lib/plan";
import { rejectApprovalQueueAction } from "@/app/lead/[id]/actions";
import { getLatestExecutionSkipForPlan } from "@/lib/execution-audit";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  let rows: Awaited<ReturnType<typeof listPlansNeedingReview>> = [];
  let err: string | null = null;
  try {
    rows = await listPlansNeedingReview(50);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  type Enriched = {
    row: (typeof rows)[number];
    currentSnap: string;
    diffSummary: string;
    skipHit: { skip_code: string; at: string } | null;
  };

  let enriched: Enriched[] = [];
  if (!err && rows.length > 0) {
    enriched = await Promise.all(
      rows.map(async (r) => {
        let currentSnap = "";
        try {
          const box = await closeGetLeadFull(r.close_lead_id);
          currentSnap = snapshotIdForBox(box);
        } catch {
          currentSnap = "";
        }
        const based = r.based_on_snapshot_id || "";
        const inSync = !!currentSnap && currentSnap === based;
        const diffSummary = !currentSnap
          ? "Could not load current Box — check Close API"
          : inSync
            ? "Fingerprint in sync — no new inbound/outbound vs plan snapshot"
            : "Stale — new activity or threads since plan (§I3). Regenerate before sends.";
        let skipHit: Enriched["skipHit"] = null;
        try {
          skipHit = await getLatestExecutionSkipForPlan(r.id);
        } catch {
          skipHit = null;
        }
        return { row: r, currentSnap, diffSummary, skipHit };
      })
    );
  }

  return (
    <div className="cme-shell">
      <AppHeader />
      <main className="hb-page-main scroll-hide">
        <div className="hb-page-toolbar">
          <div>
            <Link href="/heartbeat" className="lead-back">
              ← heartbeat
            </Link>
            <h1 className="hb-page-title">Approval queue</h1>
            <p className="ag-lede muted" style={{ marginTop: 8 }}>
              Plans with days in <strong>needs review</strong>. Snapshot diff is live vs{" "}
              <code>based_on_snapshot_id</code>. Reject sends rows back to draft and clears review flags.
            </p>
          </div>
        </div>

        {err && (
          <div className="lead-error" style={{ marginBottom: 16 }}>
            <strong>Load failed:</strong> {err}
          </div>
        )}

        {!err && rows.length === 0 && (
          <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top cmk-approvals-panel">
            <div className="leads-empty">
              No plans waiting on day review — mark days “needs review” from the plan card.
            </div>
          </div>
        )}

        {!err && enriched.length > 0 && (
          <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top cmk-approvals-panel">
          <div className="hb-runs-table widget">
            <div className="hb-runs-row hb-runs-head">
              <div>Actions</div>
              <div>Plan</div>
              <div>Days</div>
              <div>Snapshot diff</div>
              <div>Skip</div>
            </div>
            {enriched.map(({ row: r, currentSnap, diffSummary, skipHit }) => {
              const days = r.days || [];
              const need = days
                .map((d, i) => (d.approval_status === "needs_review" ? i : -1))
                .filter((i) => i >= 0);
              return (
                <div key={r.id} className="hb-runs-row" style={{ alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 120 }}>
                    <Link href={`/lead/${r.close_lead_id}`} className="plan-btn">
                      Open Box
                    </Link>
                    <Link href={`/lead/${r.close_lead_id}#cycle-plan`} className="plan-btn">
                      Edit plan
                    </Link>
                    <form action={rejectApprovalQueueAction}>
                      <input type="hidden" name="plan_id" value={r.id} />
                      <input type="hidden" name="lead_id" value={r.close_lead_id} />
                      <input type="hidden" name="reason" value="operator_reject_from_queue" />
                      <button type="submit" className="plan-btn plan-btn-danger" style={{ width: "100%" }}>
                        Reject queue
                      </button>
                    </form>
                  </div>
                  <div>
                    <code className="ag-seq-mono" style={{ fontSize: 10 }}>
                      {r.id.slice(0, 12)}…
                    </code>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                      {r.goal_summary?.slice(0, 100)}
                      {(r.goal_summary?.length ?? 0) > 100 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 6, color: "var(--ink-soft)" }}>
                      <strong>based:</strong>{" "}
                      <span className="ag-seq-mono">{(r.based_on_snapshot_id || "—").slice(0, 20)}…</span>
                    </div>
                    {currentSnap && (
                      <div style={{ fontSize: 10, marginTop: 2, color: "var(--ink-soft)" }}>
                        <strong>current:</strong>{" "}
                        <span className="ag-seq-mono">{currentSnap.slice(0, 20)}…</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Day index: {need.join(", ") || "—"}
                  </div>
                  <div style={{ fontSize: 11, maxWidth: 280, lineHeight: 1.45 }}>
                    {diffSummary}
                  </div>
                  <div style={{ fontSize: 11 }}>
                    {skipHit ? (
                      <>
                        <span className="hb-skip-code">{skipHit.skip_code}</span>
                        <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                          {new Date(skipHit.at).toLocaleString()}
                        </div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </main>
    </div>
  );
}
