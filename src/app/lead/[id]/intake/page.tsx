import Link from "next/link";
import { loadLeadBoxPageData } from "../load-lead-box";
import { LeadIntakeBoard } from "./LeadIntakeBoard";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
  searchParams?: { intake_dl?: string };
};

const DOWNLOAD_ERROR_COPY: Record<string, string> = {
  bad_request: "Download request was missing required fields.",
  not_found: "That artifact isn't linked to this lead anymore.",
  signed_url: "Couldn't sign the download URL — try again in a moment.",
};

/**
 * /lead/[id]/intake — lead-scoped file uploads + extracted-text preview.
 * AppHeader (with global subnav) comes from the `/lead/[id]/layout.tsx` shell.
 */
export default async function LeadIntakePage({ params, searchParams }: Props) {
  const loaded = await loadLeadBoxPageData(params.id);

  if ("error" in loaded) {
    return (
      <main className="lead-main">
        <div className="cme-eyebrow">lead</div>
        <h1 className="lead-title">Box failed to load</h1>
        <pre className="lead-error">{loaded.error || "(unknown)"}</pre>
        <p style={{ marginTop: 16 }}>
          <Link href="/leads" className="lead-back">← back to leads</Link>
        </p>
      </main>
    );
  }

  const { intakeArtifacts, box } = loaded;
  const dlCode = searchParams?.intake_dl;
  const downloadError = dlCode ? DOWNLOAD_ERROR_COPY[dlCode] ?? null : null;
  const leadName = box.lead.display_name || box.lead.name || params.id;

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <div className="cme-eyebrow">intake · {leadName}</div>
      <h1 className="lead-title">Materials for this lead</h1>
      <p className="muted" style={{ fontSize: 12, marginTop: 4, maxWidth: "44rem" }}>
        Files uploaded here are scoped to this lead and surfaced to the chat agent in Lead mode —
        operator and agent share the same notes, contracts, spec sheets, and screenshots.
      </p>

      <LeadIntakeBoard
        leadId={params.id}
        artifacts={intakeArtifacts}
        downloadError={downloadError}
      />
    </main>
  );
}
