import Link from "next/link";
import { ActivityFeed } from "../ActivityFeed";
import { BoxPanel } from "../BoxPanel";
import { WorkflowEnrollSection } from "../WorkflowEnrollSection";
import { WorkflowSubscriptionControls } from "../WorkflowSubscriptionControls";
import { IntakeArtifactsPanel } from "../IntakeArtifactsPanel";
import { LeadAssetsPanel } from "../LeadAssetsPanel";
import { LeadToolbar } from "../LeadToolbar";
import { loadLeadBoxPageData } from "../load-lead-box";
import { listLeadFolderFiles } from "@/lib/lead-folder";
import { ClientBoxActions } from "./ClientBoxActions";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function intakeDownloadUserMessage(code: string | undefined): string | null {
  switch (code) {
    case "bad_request":
      return "Download request was incomplete. Try again.";
    case "not_found":
      return "That file is not linked to this lead, or it was removed.";
    case "signed_url":
      return "Could not create a download link. Check that the intake storage bucket exists, the file is still stored, and server credentials allow signed URLs.";
    default:
      return null;
  }
}

function assetDownloadUserMessage(code: string | undefined): string | null {
  switch (code) {
    case "bad_request":
      return "Asset download request was incomplete. Try again.";
    case "not_found":
      return "That asset is not linked to this lead, or it was removed.";
    case "signed_url":
      return "Could not create a private asset download link. Check the assets storage bucket and server credentials.";
    default:
      return null;
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDateOnly(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * /lead/[id]/box — profile, threads, workflow, intake, activity feed.
 */
export default async function LeadBoxTabPage({ params, searchParams = {} }: Props) {
  const rawDl = searchParams["intake_dl"];
  const intakeDlCode = Array.isArray(rawDl) ? rawDl[0] : rawDl;
  const intakeDownloadError = intakeDownloadUserMessage(intakeDlCode);
  const rawAssetDl = searchParams["asset_dl"];
  const assetDlCode = Array.isArray(rawAssetDl) ? rawAssetDl[0] : rawAssetDl;
  const assetDownloadError = assetDownloadUserMessage(assetDlCode);

  const loaded = await loadLeadBoxPageData(params.id);
  const folderFiles = await listLeadFolderFiles(params.id).catch(() => null);

  if ("error" in loaded) {
    return (
      <main className="lead-main">
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
  const { box, counts, lastInbound, lastOutbound, intakeArtifacts, assets, planEligible, customFields } = data;
  const { lead, activities, subscriptions, email_threads, fetched_at } = box;
  const commJsonCount = folderFiles
    ? [...folderFiles.keys()].filter((k) => k.startsWith("comms/") && k.endsWith(".json")).length
    : 0;
  const presentDocs = new Set(folderFiles ? [...folderFiles.keys()] : []);
  if (data.plan) presentDocs.add("05_seven_day_plan.md");

  return (
    <main className="lead-main lead-main--tab scroll-hide">
      <LeadToolbar data={data} />
      <div className="lead-tab-body">
        <section className="lead-card widget" style={{ marginBottom: 16 }}>
          <ClientBoxActions
            leadId={params.id}
            presentDocs={[...presentDocs]}
            commJsonCount={commJsonCount}
          />
        </section>

        <div className="lead-grid lead-grid--in-tab">
          <section className="lead-col-l lead-col-scroll scroll-hide">
            <BoxPanel
              index={0}
              title="Contacts"
              eyebrow="contacts"
              summary={
                (lead.contacts ?? []).length === 0 ? (
                  <div className="lead-empty">no contacts</div>
                ) : (
                  <>
                    {(lead.contacts ?? []).slice(0, 2).map((c) => (
                      <div key={c.id} className="lead-contact">
                        <div className="lead-contact-name">{c.name || "(unnamed contact)"}</div>
                        <div className="lead-contact-routes">
                          {(c.emails ?? []).slice(0, 1).map((e, i) => (
                            <span key={`e${i}`} className="lead-route">
                              ✉ {e.email}
                            </span>
                          ))}
                          {(c.phones ?? []).slice(0, 1).map((p, i) => (
                            <span key={`p${i}`} className="lead-route">
                              ⌨ {p.phone}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(lead.contacts ?? []).length > 2 && (
                      <div className="lead-empty">+ {(lead.contacts ?? []).length - 2} more</div>
                    )}
                  </>
                )
              }
              expanded={
                (lead.contacts ?? []).length === 0 ? (
                  <div className="lead-empty">no contacts</div>
                ) : (
                  <>
                    {(lead.contacts ?? []).map((c) => (
                      <div key={c.id} className="lead-contact" style={{ paddingBottom: 12 }}>
                        <div className="lead-contact-name" style={{ fontSize: 15 }}>
                          {c.name || "(unnamed contact)"}
                        </div>
                        <div className="lead-contact-routes" style={{ marginTop: 6, gap: 14 }}>
                          {(c.emails ?? []).map((e, i) => (
                            <span key={`e${i}`} className="lead-route">
                              ✉ {e.email}
                            </span>
                          ))}
                          {(c.phones ?? []).map((p, i) => (
                            <span key={`p${i}`} className="lead-route">
                              ⌨ {p.phone}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )
              }
              menu={
                lead.html_url
                  ? [
                      { kind: "label", text: "Contacts" },
                      { kind: "item", label: "Open expanded view", action: { type: "open_expanded" } },
                      { kind: "item", label: "Open in Close", action: { type: "open_url", url: lead.html_url } },
                    ]
                  : undefined
              }
            />

            <BoxPanel
              index={1}
              title="Email threads"
              eyebrow="email threads"
              summary={
                email_threads.length === 0 ? (
                  <div className="lead-empty">no email thread rows</div>
                ) : (
                  <>
                    {email_threads.slice(0, 3).map((t) => (
                      <div key={t.id} className="lead-sub-row">
                        <div className="lead-sub-name">
                          {(t.subject as string)?.slice(0, 72) || "(no subject)"}
                        </div>
                        <div className="lead-sub-meta">
                          <span>{fmtDateOnly(t.date_updated || t.date_created)}</span>
                        </div>
                      </div>
                    ))}
                    {email_threads.length > 3 && (
                      <div className="lead-empty">+ {email_threads.length - 3} more</div>
                    )}
                  </>
                )
              }
              expanded={
                email_threads.length === 0 ? (
                  <div className="lead-empty">no email thread rows</div>
                ) : (
                  email_threads.map((t) => (
                    <div key={t.id} className="lead-sub-row" style={{ padding: "10px 0" }}>
                      <div className="lead-sub-name" style={{ fontSize: 14 }}>
                        {(t.subject as string) || "(no subject)"}
                      </div>
                      <div className="lead-sub-meta" style={{ marginTop: 4 }}>
                        <span>id {t.id.slice(0, 18)}…</span>
                        <span className="lead-sep">·</span>
                        <span>updated {fmtDate(t.date_updated || t.date_created)}</span>
                      </div>
                    </div>
                  ))
                )
              }
              menu={
                lead.html_url
                  ? [
                      { kind: "label", text: "Email threads" },
                      { kind: "item", label: "Open expanded view", action: { type: "open_expanded" } },
                      { kind: "item", label: "Open lead in Close", action: { type: "open_url", url: lead.html_url } },
                    ]
                  : undefined
              }
            />

            <BoxPanel
              index={2}
              title="Workflow enrollments"
              eyebrow="workflow enrollments"
              summary={
                subscriptions.length === 0 ? (
                  <div className="lead-empty">not enrolled in any workflow</div>
                ) : (
                  <>
                    {subscriptions.slice(0, 3).map((s) => (
                      <div key={s.id} className="lead-sub-row">
                        <div className="lead-sub-name">{s.sequence_name || s.sequence_id}</div>
                        <div className="lead-sub-meta">
                          <span className={`lead-sub-status lead-sub-status-${s.status}`}>{s.status}</span>
                          <span className="lead-sep">·</span>
                          <span>{fmtDateOnly(s.date_created)}</span>
                        </div>
                      </div>
                    ))}
                    {subscriptions.length > 3 && (
                      <div className="lead-empty">+ {subscriptions.length - 3} more</div>
                    )}
                  </>
                )
              }
              expanded={
                subscriptions.length === 0 ? (
                  <div className="lead-empty">not enrolled in any workflow</div>
                ) : (
                  subscriptions.map((s) => (
                    <div key={s.id} className="lead-sub-row" style={{ padding: "10px 0" }}>
                      <div className="lead-sub-name" style={{ fontSize: 14 }}>
                        {s.sequence_name || s.sequence_id}
                      </div>
                      <div className="lead-sub-meta" style={{ marginTop: 4 }}>
                        <span className={`lead-sub-status lead-sub-status-${s.status}`}>{s.status}</span>
                        <span className="lead-sep">·</span>
                        <span>created {fmtDate(s.date_created)}</span>
                        {s.date_updated && (
                          <>
                            <span className="lead-sep">·</span>
                            <span>updated {fmtDate(s.date_updated)}</span>
                          </>
                        )}
                        {s.pause_reason && (
                          <>
                            <span className="lead-sep">·</span>
                            <span style={{ fontStyle: "italic" }}>paused: {s.pause_reason}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )
              }
              menu={
                lead.html_url
                  ? [
                      { kind: "label", text: "Workflow enrollments" },
                      { kind: "item", label: "Open expanded view", action: { type: "open_expanded" } },
                      { kind: "item", label: "Open lead in Close", action: { type: "open_url", url: lead.html_url } },
                      { kind: "item", label: "Copy lead ID", action: { type: "copy", text: lead.id } },
                    ]
                  : undefined
              }
            />

            {(lead.contacts ?? []).length > 0 && planEligible && (
              <WorkflowEnrollSection leadId={params.id} contacts={lead.contacts ?? []} />
            )}

            {subscriptions.length > 0 && (
              <WorkflowSubscriptionControls leadId={params.id} subscriptions={subscriptions} />
            )}

            <IntakeArtifactsPanel
              leadId={params.id}
              artifacts={intakeArtifacts}
              downloadError={intakeDownloadError}
            />

            <LeadAssetsPanel
              leadId={params.id}
              assets={assets}
              downloadError={assetDownloadError}
            />

            {(lead.opportunities ?? []).length > 0 && (
              <BoxPanel
                index={3}
                title="Opportunities"
                eyebrow="opportunities"
                summary={
                  <>
                    {(lead.opportunities as Array<Record<string, unknown>>).slice(0, 2).map((o, i) => (
                      <div key={String(o.id) || i} className="lead-opp">
                        <div className="lead-opp-name">{(o.note as string) || "(no note)"}</div>
                        <div className="lead-opp-meta">
                          <span>{(o.status_label as string) || "—"}</span>
                          {o.value != null && <span className="lead-sep">·</span>}
                          {o.value != null && <span>${(o.value as number).toLocaleString()}</span>}
                        </div>
                      </div>
                    ))}
                  </>
                }
                expanded={
                  <>
                    {(lead.opportunities as Array<Record<string, unknown>>).map((o, i) => (
                      <div
                        key={String(o.id) || i}
                        className="lead-opp"
                        style={{ padding: "10px 0", borderBottom: "0.5px solid var(--rule)" }}
                      >
                        <div className="lead-opp-name" style={{ fontSize: 14 }}>
                          {(o.note as string) || "(no note)"}
                        </div>
                        <div className="lead-opp-meta" style={{ marginTop: 4 }}>
                          <span>{(o.status_label as string) || "—"}</span>
                          {o.value != null && (
                            <>
                              <span className="lead-sep">·</span>
                              <span>${(o.value as number).toLocaleString()}</span>
                            </>
                          )}
                          {(o.value_period as string) && (
                            <>
                              <span className="lead-sep">·</span>
                              <span>{o.value_period as string}</span>
                            </>
                          )}
                          {(o.confidence as number) != null && (
                            <>
                              <span className="lead-sep">·</span>
                              <span>{o.confidence as number}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                }
                menu={[
                  { kind: "label", text: "Opportunities" },
                  { kind: "item", label: "Open expanded view", action: { type: "open_expanded" } },
                  ...(lead.html_url
                    ? [
                        {
                          kind: "item" as const,
                          label: "Open lead in Close",
                          action: { type: "open_url" as const, url: lead.html_url },
                        },
                      ]
                    : []),
                  {
                    kind: "item",
                    label: "Copy as JSON",
                    action: {
                      type: "copy",
                      text: JSON.stringify(lead.opportunities ?? [], null, 2),
                    },
                  },
                ]}
              />
            )}

            {customFields.length > 0 && (
              <BoxPanel
                index={4}
                title="Custom fields"
                eyebrow="custom fields"
                summary={
                  <dl className="lead-cf">
                    {customFields.slice(0, 4).map(({ key, value }) => (
                      <div key={key} className="lead-cf-row">
                        <dt className="lead-cf-key">{key.replace(/^cf_[A-Za-z0-9]+/, "field")}</dt>
                        <dd className="lead-cf-val">
                          {value === null || value === undefined || value === "" ? (
                            <span className="lead-empty">—</span>
                          ) : typeof value === "object" ? (
                            JSON.stringify(value)
                          ) : (
                            String(value)
                          )}
                        </dd>
                      </div>
                    ))}
                    {customFields.length > 4 && (
                      <div className="lead-empty">+ {customFields.length - 4} more</div>
                    )}
                  </dl>
                }
                expanded={
                  <dl className="lead-cf">
                    {customFields.map(({ key, value }) => (
                      <div key={key} className="lead-cf-row" style={{ padding: "8px 0" }}>
                        <dt className="lead-cf-key">{key}</dt>
                        <dd className="lead-cf-val">
                          {value === null || value === undefined || value === "" ? (
                            <span className="lead-empty">—</span>
                          ) : typeof value === "object" ? (
                            JSON.stringify(value)
                          ) : (
                            String(value)
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                }
                menu={[
                  { kind: "label", text: "Custom fields" },
                  { kind: "item", label: "Open expanded view", action: { type: "open_expanded" } },
                  {
                    kind: "item",
                    label: "Copy all as JSON",
                    action: {
                      type: "copy",
                      text: JSON.stringify(
                        customFields.reduce<Record<string, unknown>>((acc, { key, value }) => {
                          acc[key] = value;
                          return acc;
                        }, {}),
                        null,
                        2
                      ),
                    },
                  },
                  {
                    kind: "item",
                    label: "Copy field IDs",
                    action: {
                      type: "copy",
                      text: customFields.map((f) => f.key).join("\n"),
                    },
                  },
                ]}
              />
            )}
          </section>

          <section className="lead-col-r lead-col-r-feed">
            <div className="lead-card widget lead-activity-card">
              <div className="lead-feed-head">
                <h3 className="lead-card-h" style={{ marginBottom: 0 }}>
                  Activity
                </h3>
                <span className="lead-feed-counts">
                  {Object.entries(counts).map(([k, v]) => (
                    <span key={k} className="lead-feed-count">
                      {k.toLowerCase()} {v}
                    </span>
                  ))}
                </span>
              </div>
              <div className="lead-feed-strip">
                <span>
                  <strong>last in:</strong> {lastInbound ? fmtDate(lastInbound.date_created) : "—"}
                </span>
                <span>
                  <strong>last out:</strong> {lastOutbound ? fmtDate(lastOutbound.date_created) : "—"}
                </span>
              </div>
              <div className="lead-feed-scroll scroll-hide">
                <ActivityFeed activities={activities} />
              </div>
            </div>
          </section>
        </div>

        <div className="lead-footer-meta" title={lead.id}>
          <span>fetched {fmtDate(fetched_at)}</span>
          <span className="lead-sep">·</span>
          <span>{activities.length} activities</span>
          <span className="lead-sep">·</span>
          <span>{email_threads.length} email threads</span>
          <span className="lead-sep">·</span>
          <span>{subscriptions.length} workflow subs</span>
          {lead.html_url && (
            <>
              <span className="lead-sep">·</span>
              <a href={lead.html_url} target="_blank" rel="noreferrer" className="lead-back">
                open in Close ↗
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
