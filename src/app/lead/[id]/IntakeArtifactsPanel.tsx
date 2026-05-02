import Link from "next/link";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";
import { redirectIntakeArtifactDownload } from "@/app/intake/actions";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function IntakeArtifactsPanel({
  leadId,
  artifacts,
  downloadError,
}: {
  leadId: string;
  artifacts: IntakeArtifactRow[];
  downloadError?: string | null;
}) {
  if (artifacts.length === 0) {
    return (
      <div className="lead-card widget" style={{ marginTop: 12 }}>
        <h3 className="lead-card-h">Intake artifacts</h3>
        {downloadError && (
          <div className="leads-error" style={{ marginTop: 10, fontSize: 12 }}>
            {downloadError}{" "}
            <Link href={`/lead/${encodeURIComponent(leadId)}/box`} className="lead-back" style={{ marginLeft: 8 }}>
              Dismiss
            </Link>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          No files linked to this lead. Upload on <a href="/intake">/intake</a> with lead id.
        </p>
      </div>
    );
  }

  return (
    <div className="lead-card widget" style={{ marginTop: 12 }}>
      <h3 className="lead-card-h">Intake artifacts</h3>
      {downloadError && (
        <div className="leads-error" style={{ marginTop: 10, fontSize: 12 }}>
          {downloadError}{" "}
          <Link href={`/lead/${encodeURIComponent(leadId)}/box`} className="lead-back" style={{ marginLeft: 8 }}>
            Dismiss
          </Link>
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
        Linked uploads — download via signed URL (operator session).
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {artifacts.map((a) => (
          <li
            key={a.id}
            style={{
              padding: "10px 0",
              borderBottom: "0.5px solid var(--rule)",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{a.filename}</div>
            <div style={{ marginTop: 4, color: "var(--ink-soft)" }}>
              {fmt(a.created_at)}
              {a.byte_size != null && (
                <>
                  <span className="lead-sep">·</span>
                  {(a.byte_size / 1024).toFixed(1)} KB
                </>
              )}
            </div>
            {a.summary && (
              <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.4, color: "var(--ink)" }}>
                {a.summary}
              </div>
            )}
            <form action={redirectIntakeArtifactDownload} style={{ marginTop: 8 }}>
              <input type="hidden" name="artifact_id" value={a.id} />
              <input type="hidden" name="lead_id" value={leadId} />
              <button type="submit" className="plan-btn">
                Download
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
