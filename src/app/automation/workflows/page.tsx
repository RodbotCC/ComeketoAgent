import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { AutomationSubNav } from "../AutomationSubNav";
import { DEMO_WORKFLOW } from "../demo-workflow";
import { WorkflowStudio } from "../WorkflowStudio";

export default function AutomationWorkflowsPage() {
  return (
    <div className="cme-shell">
      <AppHeader />
      <TabNav active="automation" />

      <main className="ag-main ag-studio-main">
        <AutomationSubNav active="workflows" />
        <WorkflowStudio workflow={DEMO_WORKFLOW} />
      </main>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 28px",
          fontSize: 10.5,
          color: "var(--ink-faint)",
          flexShrink: 0,
          borderTop: "0.5px solid rgba(0,0,0,0.05)",
        }}
      >
        <span>
          <Link href="/automation" className="ag-back-link">
            ← Sequences
          </Link>
        </span>
        <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>Comeketo Agent</span>
      </footer>
    </div>
  );
}
