import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import {
  closeGetLeadFull,
  checkOwnershipAndStatus,
  type CloseActivity,
  type CloseLeadFull,
  type SkipCode,
} from "@/lib/close";
import { env } from "@/lib/env";
import { snapshotIdForBox } from "@/lib/plan";
import { getLatestPlanForLead } from "@/lib/plans-db";
import { getLatestHeartbeatForLead } from "@/lib/heartbeat";
import { getSettings } from "@/lib/settings";
import { PlanSection } from "./PlanSection";
import { ActivityFeed } from "./ActivityFeed";
import { BoxPanel } from "./BoxPanel";
import { HeartbeatPanel } from "./HeartbeatPanel";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

/**
 * /lead/[id] — the Lead Box. Per Guardrails §B, this is the central operator
 * surface: profile, comms feed, workflow enrollments, gates, traceability.
 *
 * First cut: read-only. Plan generation, drafts, approvals, and heartbeat
 * snapshot wiring come in subsequent rounds.
 */

type Props = { params: { id: string } };

// ─── Server-side fetch ───────────────────────────────────────────────────

async function loadBox(leadId: string): Promise<{ box: CloseLeadFull | null; error: string | null }> {
  try {
    const box = await closeGetLeadFull(leadId);
    return { box, error: null };
  } catch (err) {
    return { box: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDateOnly(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function activityLine(a: CloseActivity): { kind: string; line: string; direction: string } {
  const t = a._type;
  const dir = a.direction === "inbound" ? "←" : a.direction === "outbound" ? "→" : "·";
  if (t === "Email") {
    const subj = a.subject || "(no subject)";
    return { kind: "email", direction: dir, line: subj };
  }
  if (t === "SMS") {
    const text = (a.text || "").trim();
    return { kind: "sms", direction: dir, line: text.length > 120 ? text.slice(0, 119) + "…" : text };
  }
  if (t === "Call") {
    const dur = typeof a.duration === "number" ? `${Math.round(a.duration / 60)}m` : "—";
    return { kind: "call", direction: dir, line: `${dur} · ${a.note ? a.note.slice(0, 80) : "(no notes)"}` };
  }
  if (t === "Note") {
    const txt = (a.note as string | undefined) || "";
    return { kind: "note", direction: "·", line: txt.length > 120 ? txt.slice(0, 119) + "…" : txt };
  }
  if (t === "Task") {
    return { kind: "task", direction: "·", line: (a.text as string | undefined) || (a.note as string | undefined) || "(task)" };
  }
  if (t === "Meeting") {
    return { kind: "meeting", direction: "·", line: (a.title as string | undefined) || "(meeting)" };
  }
  return { kind: t.toLowerCase(), direction: dir, line: `(${t})` };
}

function gateBadgeLabel(skip: SkipCode | null): { label: string; tone: "ok" | "warn" | "block" } {
  if (!skip) return { label: "OK to act", tone: "ok" };
  if (skip === "OWNERSHIP") return { label: "[OWNERSHIP] not Andre's lead", tone: "block" };
  if (skip === "STATUS_WON") return { label: "[STATUS_WON] no-touch", tone: "block" };
  if (skip === "STATUS_LOST") return { label: "[STATUS_LOST] no-touch", tone: "block" };
  return { label: `[${skip}]`, tone: "warn" };
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function LeadBoxPage({ params }: Props) {
  const { box, error } = await loadBox(params.id);
  const plan = box ? await getLatestPlanForLead(params.id).catch(() => null) : null;
  const latestHeartbeat = plan
    ? await getLatestHeartbeatForLead(params.id).catch(() => null)
    : null;
  const settings = await getSettings();

  if (error || !box) {
    return (
      <div className="cme-shell">
        <AppHeader wordmarkHref="/" />
        <TabNav active="leads" />
        <main className="lead-main">
          <div className="cme-eyebrow">lead</div>
          <h1 className="lead-title">Box failed to load</h1>
          <pre className="lead-error">{error || "(unknown)"}</pre>
          <p style={{ marginTop: 16 }}>
            <Link href="/leads" className="lead-back">← back to leads</Link>
          </p>
        </main>
      </div>
    );
  }

  const { lead, activities, subscriptions, fetched_at } = box;
  const leadAny = lead as typeof lead & { user_id?: string; user_name?: string };
  const skip = checkOwnershipAndStatus(leadAny, env.CLOSE_USER_ID_ANDRE);
  const gate = gateBadgeLabel(skip);
  const currentSnapshotId = snapshotIdForBox(box);
  const planEligible = !skip; // Per Guardrails, only Andre+non-Won/Lost get plans.

  const isAndre = env.CLOSE_USER_ID_ANDRE && leadAny.user_id === env.CLOSE_USER_ID_ANDRE;
  const isJake = env.CLOSE_USER_ID_JAKE && leadAny.user_id === env.CLOSE_USER_ID_JAKE;
  const ownerName = isAndre ? "Andre" : isJake ? "Jake" : leadAny.user_name || "—";

  // Sort activities newest-first.
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
  );

  // Last inbound / last outbound for the Box header strip.
  const lastInbound = sortedActivities.find((a) => a.direction === "inbound");
  const lastOutbound = sortedActivities.find((a) => a.direction === "outbound");

  // Activity counts by type.
  const counts: Record<string, number> = {};
  for (const a of activities) counts[a._type] = (counts[a._type] || 0) + 1;

  // Custom fields (cf_* keys live at lead["custom.cf_..."])
  const customFields = Object.entries(lead as unknown as Record<string, unknown>)
    .filter(([k]) => k.startsWith("custom."))
    .map(([k, v]) => ({ key: k.replace("custom.", ""), value: v }));

  return (
    <div className="cme-shell">
      <AppHeader wordmarkHref="/" />
      <TabNav active="leads" />

      <main className="lead-main scroll-hide">
        {/* Top strip — title + gate badge */}
        <div className="lead-toolbar">
          <div className="lead-toolbar-l">
            <div className="cme-eyebrow">
              <Link href="/leads" className="lead-back">← leads</Link>
            </div>
            <h1 className="lead-title">{lead.display_name || lead.name || "(unnamed)"}</h1>
            <div className="lead-sub">
              <span className="lead-status">{lead.status_label || "—"}</span>
              <span className="lead-sep">·</span>
              <span>owner: <strong>{ownerName}</strong></span>
              <span className="lead-sep">·</span>
              <span>created {fmtDateOnly(lead.date_created)}</span>
              {lead.date_updated && (
                <>
                  <span className="lead-sep">·</span>
                  <span>updated {fmtDateOnly(lead.date_updated)}</span>
                </>
              )}
            </div>
          </div>
          <div className="lead-toolbar-r-stack">
            <div className={`lead-gate lead-gate-${gate.tone}`}>{gate.label}</div>
            <AutoRefresh intervalMs={30000} />
          </div>
        </div>

        {/* Plan section — full width, between toolbar and the two-col body */}
        {planEligible && (
          <div className="lead-plan-wrap">
            <PlanSection
              leadId={params.id}
              plan={plan}
              currentSnapshotId={currentSnapshotId}
            />
            {plan && (
              <HeartbeatPanel
                planId={plan.plan_id}
                leadId={params.id}
                executionMode={settings.execution_mode}
                latest={
                  latestHeartbeat
                    ? {
                        ran_at: String(latestHeartbeat.ran_at),
                        actions_eligible: Number(latestHeartbeat.actions_eligible || 0),
                        actions_fired: Number(latestHeartbeat.actions_fired || 0),
                        actions_skipped: Number(latestHeartbeat.actions_skipped || 0),
                        skip_breakdown:
                          (latestHeartbeat.skip_breakdown as Record<string, number>) || {},
                        snapshot_match: Boolean(latestHeartbeat.snapshot_match),
                        plan_was_stale: Boolean(latestHeartbeat.plan_was_stale),
                      }
                    : null
                }
              />
            )}
          </div>
        )}

        {/* Two-column body */}
        <div className="lead-grid">
          {/* LEFT: profile + custom fields + opportunities + workflow status */}
          <section className="lead-col-l">
            <BoxPanel
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
                            <span key={`e${i}`} className="lead-route">✉ {e.email}</span>
                          ))}
                          {(c.phones ?? []).slice(0, 1).map((p, i) => (
                            <span key={`p${i}`} className="lead-route">⌨ {p.phone}</span>
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
                            <span key={`e${i}`} className="lead-route">✉ {e.email}</span>
                          ))}
                          {(c.phones ?? []).map((p, i) => (
                            <span key={`p${i}`} className="lead-route">⌨ {p.phone}</span>
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
            />

            {(lead.opportunities ?? []).length > 0 && (
              <BoxPanel
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
                      <div key={String(o.id) || i} className="lead-opp" style={{ padding: "10px 0", borderBottom: "0.5px solid var(--rule)" }}>
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
              />
            )}

            {customFields.length > 0 && (
              <BoxPanel
                title="Custom fields"
                eyebrow="custom fields"
                summary={
                  <dl className="lead-cf">
                    {customFields.slice(0, 4).map(({ key, value }) => (
                      <div key={key} className="lead-cf-row">
                        <dt className="lead-cf-key">{key.replace(/^cf_[A-Za-z0-9]+/, "field")}</dt>
                        <dd className="lead-cf-val">
                          {value === null || value === undefined || value === ""
                            ? <span className="lead-empty">—</span>
                            : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
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
                          {value === null || value === undefined || value === ""
                            ? <span className="lead-empty">—</span>
                            : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                }
              />
            )}
          </section>

          {/* RIGHT: activity feed */}
          <section className="lead-col-r">
            <div className="lead-card widget">
              <div className="lead-feed-head">
                <h3 className="lead-card-h" style={{ marginBottom: 0 }}>Activity</h3>
                <span className="lead-feed-counts">
                  {Object.entries(counts).map(([k, v]) => (
                    <span key={k} className="lead-feed-count">{k.toLowerCase()} {v}</span>
                  ))}
                </span>
              </div>
              <div className="lead-feed-strip">
                <span><strong>last in:</strong> {lastInbound ? fmtDate(lastInbound.date_created) : "—"}</span>
                <span><strong>last out:</strong> {lastOutbound ? fmtDate(lastOutbound.date_created) : "—"}</span>
              </div>
              <ActivityFeed activities={activities} />
            </div>
          </section>
        </div>

        <div className="lead-footer-meta" title={lead.id}>
          <span>fetched {fmtDate(fetched_at)}</span>
          <span className="lead-sep">·</span>
          <span>{activities.length} activities</span>
          <span className="lead-sep">·</span>
          <span>{subscriptions.length} workflow subs</span>
          {lead.html_url && (
            <>
              <span className="lead-sep">·</span>
              <a href={lead.html_url} target="_blank" rel="noreferrer" className="lead-back">open in Close ↗</a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
