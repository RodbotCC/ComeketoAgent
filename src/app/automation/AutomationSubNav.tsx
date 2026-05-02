import Link from "next/link";

export type AutomationSubNavKey = "sequences" | "drafts" | "workflows";

/**
 * Local IA under the Automation tab: live Close sequences, drafts, workflow studio demo.
 */
export function AutomationSubNav({ active }: { active: AutomationSubNavKey }) {
  return (
    <nav className="ag-subnav" aria-label="Automation sections">
      <Link
        href="/automation"
        className={`ag-subnav-link${active === "sequences" ? " ag-subnav-link-active" : ""}`}
      >
        Sequences
      </Link>
      <Link
        href="/automation/workflows"
        className={`ag-subnav-link${active === "workflows" ? " ag-subnav-link-active" : ""}`}
      >
        Workflows
      </Link>
      <Link
        href="/automation/drafts"
        className={`ag-subnav-link${active === "drafts" ? " ag-subnav-link-active" : ""}`}
      >
        Drafts
      </Link>
    </nav>
  );
}
