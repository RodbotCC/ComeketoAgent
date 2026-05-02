import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { getAutomationDraft } from "@/lib/automation-drafts";
import { approveDraftReviewAction, publishDraftToCloseAction } from "../../actions";
import { closeSequenceBrowserUrl } from "@/lib/close";
import { AutomationSubNav } from "../../AutomationSubNav";

export const dynamic = "force-dynamic";

export default async function AutomationDraftDetailPage({ params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) notFound();

  let draft: Awaited<ReturnType<typeof getAutomationDraft>>;
  try {
    draft = await getAutomationDraft(id);
  } catch {
    notFound();
  }
  if (!draft) notFound();

  const stepsText = draft.close_steps_json ? JSON.stringify(draft.close_steps_json, null, 2) : "";

  const closeUrl = draft.close_sequence_id
    ? closeSequenceBrowserUrl({
        id: draft.close_sequence_id,
        name: draft.name,
        status: "draft",
        steps: [],
      })
    : null;

  const delegationsHref = `/chat?draft=${encodeURIComponent(draft.id)}&draftName=${encodeURIComponent(draft.name)}`;

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="automation" />

      <main className="ag-main ag-main-stack">
        <AutomationSubNav active="drafts" />
        <div className="ag-toolbar">
          <div className="ag-toolbar-l">
            <span className="cme-eyebrow">automation · drafts</span>
            <h1 className="ag-title">{draft.name}</h1>
            <p className="ag-lede muted">
              <Link href="/automation/drafts" className="ag-back-link">
                ← All drafts
              </Link>
              <span className="lead-sep"> · </span>
              <span className={`ag-seq-status ag-seq-status-${draft.status}`}>{draft.status}</span>
              {draft.close_sequence_id && closeUrl && (
                <>
                  <span className="lead-sep"> · </span>
                  <a href={closeUrl} target="_blank" rel="noreferrer" className="ag-seq-open">
                    Open in Close →
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="widget ag-draft-delegations" style={{ padding: "16px 18px" }}>
          <h2 className="ag-detail-steps-title" style={{ marginTop: 0 }}>
            Interpret in delegations
          </h2>
          <p className="muted ag-draft-delegations-copy">
            Work the sequence in <strong>Delegations</strong> (chat): describe the goal, iterate on steps, and paste
            any proposed Close JSON back into approvals when the assistant produces it. This page keeps publish and
            review only.
          </p>
          <Link href={delegationsHref} className="plan-btn plan-btn-primary">
            Open delegations for this draft
          </Link>
        </div>

        {draft.risk_notes && (
          <div className="widget" style={{ padding: "16px 18px" }}>
            <div className="cme-eyebrow">Risks</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 11,
                padding: 10,
                background: "var(--paper-2)",
                borderRadius: 6,
                border: "0.5px solid var(--rule)",
                margin: "8px 0 0",
              }}
            >
              {draft.risk_notes}
            </pre>
          </div>
        )}

        {stepsText ? (
          <div className="widget" style={{ padding: "16px 18px" }}>
            <div className="cme-eyebrow">Proposed Close steps JSON</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 10,
                maxHeight: 280,
                overflow: "auto",
                padding: 10,
                background: "var(--paper-2)",
                borderRadius: 6,
                border: "0.5px solid var(--rule)",
                margin: "8px 0 0",
              }}
            >
              {stepsText}
            </pre>
          </div>
        ) : null}

        {draft.status === "needs_review" && draft.close_steps_json && draft.close_steps_json.length > 0 && (
          <div className="widget" style={{ padding: "16px 18px" }}>
            <h2 className="ag-detail-steps-title" style={{ marginTop: 0 }}>
              Review
            </h2>
            <form action={approveDraftReviewAction} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <input type="hidden" name="draft_id" value={draft.id} />
              <label style={{ fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="confirm_review" value="yes" required />I reviewed steps and risks
              </label>
              <button type="submit" className="plan-btn plan-btn-primary">
                Mark approved
              </button>
            </form>
          </div>
        )}

        <div className="widget" style={{ padding: "16px 18px" }}>
          <h2 className="ag-detail-steps-title" style={{ marginTop: 0 }}>
            Publish to Close
          </h2>
          <p className="muted" style={{ fontSize: 11 }}>
            Creates or updates a Close sequence using the approved steps. If the API response omits an id, use{" "}
            <strong>Export</strong>: copy the proposed JSON into Close manually.
          </p>
          {draft.status === "approved" && (
            <form action={publishDraftToCloseAction} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <input type="hidden" name="draft_id" value={draft.id} />
              <label style={{ fontSize: 12 }}>
                Timezone{" "}
                <input name="timezone" className="plan-horizon-input" defaultValue="America/New_York" />
              </label>
              <label style={{ fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="confirm_publish" value="yes" required />
                Confirm publish to Close (operator-attested)
              </label>
              <button type="submit" className="plan-btn plan-btn-primary">
                {draft.close_sequence_id ? "Update sequence in Close" : "Create sequence in Close"}
              </button>
            </form>
          )}
          {stepsText && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontSize: 12 }}>Export proposed steps JSON</summary>
              <textarea readOnly className="plan-day-modal-textarea" rows={8} value={stepsText} style={{ marginTop: 8 }} />
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
