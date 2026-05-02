import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { IntakeUploader } from "./IntakeUploader";
import { listRecentIntakeArtifacts } from "@/lib/intake-artifacts";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  let artifacts: Awaited<ReturnType<typeof listRecentIntakeArtifacts>> = [];
  let artErr: string | null = null;
  try {
    artifacts = await listRecentIntakeArtifacts(25);
  } catch (e) {
    artErr = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="cme-shell chat-shell">
      <AppHeader />
      <TabNav active="intake" />

      <div
        className="cmk-scroll scroll-hide"
        style={{ flex: 1, overflowY: "auto", padding: "22px 28px 80px" }}
      >
        <span className="cme-eyebrow">intake</span>
        <h1 className="ag-title" style={{ marginTop: 6 }}>
          File uploads
        </h1>
        <p className="ag-lede muted" style={{ marginTop: 4, maxWidth: "42rem" }}>
          Upload documents and link them to a lead so they surface on the Box tab. Downloads from the lead page use a
          short-lived signed URL (operator session).
        </p>

        <IntakeUploader />

        {artErr && (
          <div className="leads-error" style={{ marginBottom: 16 }}>
            <strong>Artifacts:</strong> {artErr}{" "}
            <span style={{ fontSize: 12 }}>
              (If the table or bucket is missing, apply the Supabase migration for <code>intake_artifacts</code> and
              create the <code>intake</code> storage bucket.)
            </span>
          </div>
        )}

        {!artErr && artifacts.length > 0 && (
          <div className="cmk-stack-panel cmk-stack-panel--lavender cmk-stack-panel--tight-top" style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, fontFamily: "var(--serif)" }}>Recent uploads</div>
            <ul style={{ fontSize: 12, color: "var(--ink-soft)", paddingLeft: 18, margin: 0 }}>
              {artifacts.map((a) => (
                <li key={a.id} style={{ marginBottom: 8 }}>
                  <span style={{ color: "var(--ink)" }}>{a.filename}</span>{" "}
                  <span style={{ opacity: 0.75 }}>
                    ({a.byte_size != null ? `${Math.round(a.byte_size / 1024)} KB` : "—"})
                    {a.lead_id ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/lead/${encodeURIComponent(a.lead_id)}/box`}>Open box</Link>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
