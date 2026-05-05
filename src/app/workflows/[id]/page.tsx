import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { getAutomationDraft } from "@/lib/automation-drafts";
import { WorkflowAuthor } from "../WorkflowAuthor";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function WorkflowDraftPage({ params }: Props) {
  const draft = await getAutomationDraft(params.id);

  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="workflows" />
      <main className="cmk-wfa-page scroll-hide">
        {!draft ? (
          <div className="lead-error" style={{ margin: 24 }}>
            <strong>Workflow draft not found.</strong>{" "}
            <Link href="/workflows" className="lead-back" style={{ marginLeft: 8 }}>
              ← back to workflows
            </Link>
          </div>
        ) : (
          <WorkflowAuthor draft={draft} />
        )}
      </main>
    </div>
  );
}
