import Link from "next/link";
import { envStatus } from "@/lib/env";
import { operatorLockEnabled } from "@/lib/operator-guard";
import { AVAILABLE_MODELS, EXECUTION_MODES, clampPlanHorizonDays, getSettings, PLAN_HORIZON_MIN, PLAN_HORIZON_MAX } from "@/lib/settings";
import { closeMcpStatus } from "@/lib/close-mcp";
import { updateModelAction, updateExecutionModeAction, updateDefaultPlanHorizonAction, updateMcpFallbackAction } from "./actions";
import { SettingsForm } from "./SettingsForm";

type EnvTableCell = { set: boolean; fingerprint: string | null; statusLabel?: string };

const EXEC_MODE_LABEL: Record<(typeof EXECUTION_MODES)[number], { name: string; blurb: string; tone: "ok" | "warn" | "live" }> = {
  draft_only: {
    name: "Draft only",
    blurb: "Heartbeat audits + reports. Never writes to Close. Safe default.",
    tone: "ok",
  },
  approval_required: {
    name: "Approval required",
    blurb: "Reports would-fire verdicts for approved days. Still doesn't touch Close.",
    tone: "ok",
  },
  approved_plan_execution: {
    name: "Approved plan execution",
    blurb: "Heartbeat WRITES to Close: tasks created, email/SMS logged as drafts in the lead's activity feed. Use on the practice org.",
    tone: "live",
  },
  manual_send_only: {
    name: "Manual send only",
    blurb: "Heartbeat does nothing. Operator triggers all sends explicitly.",
    tone: "warn",
  },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = envStatus();
  const settings = await getSettings();
  const operatorLockOn = operatorLockEnabled();

  const primary: Array<[string, { set: boolean; fingerprint: string | null }]> = [
    ["OPENAI_API_KEY", status.OPENAI_API_KEY],
    ["SUPABASE_URL", status.SUPABASE_URL],
    ["SUPABASE_PUBLISHABLE_KEY", status.SUPABASE_PUBLISHABLE_KEY],
    ["SUPABASE_SECRET_KEY", status.SUPABASE_SECRET_KEY],
    ["GITHUB_PAT", status.GITHUB_PAT],
  ];

  const reserved: Array<[string, { set: boolean; fingerprint: string | null }]> = [
    ["CLOSE_API_KEY", status.CLOSE_API_KEY],
    ["CLOSE_WEBHOOK_SIGNATURE_KEY", status.CLOSE_WEBHOOK_SIGNATURE_KEY],
    ["OPERATOR_PASSWORD", status.OPERATOR_PASSWORD],
    ["OPERATOR_COOKIE_SECRET", status.OPERATOR_COOKIE_SECRET],
    ["CLICKUP_API_TOKEN", status.CLICKUP_API_TOKEN],
  ];

  // MCP fallback config — separate group with a derived status pill below.
  // CLOSE_MCP_AUTH_HEADER is optional: `close-mcp.ts` sends Bearer ${CLOSE_API_KEY} when blank.
  // The table must reflect that, not show "missing" when the key comes from CLOSE_API_KEY.
  const mcpAuthRow: EnvTableCell = status.CLOSE_MCP_AUTH_HEADER.set
    ? { ...status.CLOSE_MCP_AUTH_HEADER }
    : status.CLOSE_API_KEY.set
    ? {
        set: true,
        fingerprint:
          status.CLOSE_API_KEY.fingerprint != null
            ? `Bearer ${status.CLOSE_API_KEY.fingerprint}`
            : "Bearer (CLOSE_API_KEY)",
        statusLabel: "optional · uses CLOSE_API_KEY",
      }
    : { set: false, fingerprint: null };
  const mcpEnvRows: Array<[string, EnvTableCell]> = [
    ["CLOSE_MCP_URL", status.CLOSE_MCP_URL],
    ["CLOSE_MCP_AUTH_HEADER", mcpAuthRow],
  ];
  const mcp = closeMcpStatus();
  // Three states: ready (URL + auth resolved), partial (URL set, auth missing), off (URL blank).
  const mcpState: "ready" | "partial" | "off" = !mcp.url_set
    ? "off"
    : !mcp.auth_resolved
    ? "partial"
    : "ready";
  const mcpLabel =
    mcpState === "ready"
      ? "MCP fallback ready"
      : mcpState === "partial"
      ? "URL set · auth missing"
      : "MCP fallback off";
  const mcpBlurb =
    mcpState === "ready"
      ? "Chat agent's `close_mcp_list_tools` and `close_mcp_call` will reach Close's MCP server when the model decides a direct tool doesn't cover the operation."
      : mcpState === "partial"
      ? "URL is set but neither CLOSE_MCP_AUTH_HEADER nor CLOSE_API_KEY resolves to a usable header value. Set one and reload."
      : "Set CLOSE_MCP_URL in .env.local to enable. Auth defaults to Bearer ${CLOSE_API_KEY} if CLOSE_MCP_AUTH_HEADER is blank.";

  function table(rows: Array<[string, EnvTableCell | { set: boolean; fingerprint: string | null }]>) {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 500 }}>
            <th style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)", fontWeight: 500 }}>Variable</th>
            <th style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)", fontWeight: 500 }}>Status</th>
            <th style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)", fontWeight: 500 }}>Fingerprint</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, info]) => {
            const cell = info as EnvTableCell;
            const statusText = cell.statusLabel ?? (cell.set ? "set" : "missing");
            return (
              <tr key={name}>
                <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 12 }}>
                  {name}
                </td>
                <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)", fontSize: 12 }}>
                  <span className={`dot ${cell.set ? "on" : "off"}`} />
                  {statusText}
                </td>
                <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)" }}>
                  {cell.fingerprint ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="cme-shell">
      <header className="cme-header">
        <span className="cme-wordmark-row">
          <span className="cme-identity-dots" aria-hidden>
            <span className="cme-dot brown" />
            <span className="cme-dot gold" />
            <span className="cme-dot sage" />
            <span className="cme-dot lavender" />
          </span>
          <Link href="/" className="cme-wordmark">
            Comeketo <em>Agent</em>
            <span className="dot">.</span>
          </Link>
        </span>
        <div className="cme-utility">
          <Link href="/chat">chat</Link>
          <Link href="/settings">settings</Link>
          <Link href="/test">test</Link>
        </div>
      </header>

      <main className="admin-main">
        <div className="cme-section-label">admin · 02</div>
        <h1>Settings</h1>
        <p>
          Credentials live in <code>.env.local</code>. Model selection lives in <code>.cmk-settings.json</code> (gitignored, written by this page).
        </p>

        <div className="cmk-stack-panel cmk-stack-panel--rose">
          <h2>Operator lock</h2>
          <p className="muted">
            With <code>OPERATOR_PASSWORD</code> and <code>OPERATOR_COOKIE_SECRET</code> set, sensitive Box actions (generate, refine, approve, enroll, heartbeat run, etc.) require a browser session from{" "}
            <Link href="/operator-login">/operator-login</Link>. The Next.js server uses the Supabase service role and bypasses RLS; do not expose that key in client bundles.
          </p>
          <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            Operator lock is <strong>{operatorLockOn ? "on" : "off"}</strong>.
          </p>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--lavender">
          <h2>Model</h2>
          <p className="muted">
            Which OpenAI Responses model the chat, plan generation, and test ping use — including the GPT‑5.5 line. Saved on submit; takes effect on the next request.
          </p>
          <SettingsForm action={updateModelAction} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <select name="model" defaultValue={settings.model} className="cmk-field-panel" style={{ fontFamily: "var(--mono)", minWidth: 280 }}>
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              type="submit"
              className="plan-btn plan-btn-primary"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 14px",
              }}
            >
              Save
            </button>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
              currently using <span style={{ fontFamily: "var(--mono)", color: "var(--ink-mid)" }}>{settings.model}</span>
            </span>
          </SettingsForm>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sage">
          <h2>Cycle plan default</h2>
          <p className="muted">
            Number of calendar-day buckets when you click Generate on a Box without changing the field (1–{PLAN_HORIZON_MAX}). Seven stays the NEPQ-style default; use 1–3 for same-day or short pushes.
          </p>
          <SettingsForm action={updateDefaultPlanHorizonAction} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ color: "var(--ink-mid)" }}>Days</span>
              <input
                type="number"
                name="default_plan_horizon_days"
                min={PLAN_HORIZON_MIN}
                max={PLAN_HORIZON_MAX}
                defaultValue={clampPlanHorizonDays(settings.default_plan_horizon_days)}
                className="cmk-field-panel"
                style={{ fontFamily: "var(--mono)", width: 88 }}
              />
            </label>
            <button
              type="submit"
              className="plan-btn plan-btn-primary"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 14px",
              }}
            >
              Save
            </button>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
              current default <span style={{ fontFamily: "var(--mono)", color: "var(--ink-mid)" }}>{settings.default_plan_horizon_days}</span> days
            </span>
          </SettingsForm>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--peach">
          <h2>Heartbeat execution</h2>
          <p className="muted">
            Controls what the heartbeat does with fire-eligible verdicts. Default <code>draft_only</code> never touches Close. Flip to <code>approved_plan_execution</code> to write tasks + log activity drafts during sweeps. Email/SMS activities are always logged as <code>status:&quot;draft&quot;</code> for now — they appear in the lead&apos;s activity feed but don&apos;t actually send via SMTP/Twilio.
          </p>
        <SettingsForm action={updateExecutionModeAction} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
          {EXECUTION_MODES.map((m) => {
            const info = EXEC_MODE_LABEL[m];
            const checked = settings.execution_mode === m;
            return (
              <label
                key={m}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${checked ? "var(--ink)" : "var(--rule)"}`,
                  background: checked
                    ? "color-mix(in oklab, var(--paper-2) 75%, var(--peach-deep) 12%)"
                    : "color-mix(in oklab, var(--card) 92%, var(--peach-deep) 5%)",
                  cursor: "pointer",
                  boxShadow: checked ? "inset 0 1px 2px rgba(26,24,21,0.04)" : "none",
                }}
              >
                <input
                  type="radio"
                  name="execution_mode"
                  value={m}
                  defaultChecked={checked}
                  style={{ marginTop: 4 }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 500 }}>{info.name}</strong>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 999,
                        background:
                          info.tone === "live"
                            ? "color-mix(in oklab, var(--rose-deep) 18%, var(--card))"
                            : info.tone === "warn"
                            ? "color-mix(in oklab, var(--lemon-deep) 22%, var(--card))"
                            : "color-mix(in oklab, var(--sage-deep) 18%, var(--card))",
                        color:
                          info.tone === "live"
                            ? "color-mix(in oklab, var(--rose-deep) 95%, var(--ink))"
                            : info.tone === "warn"
                            ? "color-mix(in oklab, var(--lemon-deep) 92%, var(--ink))"
                            : "color-mix(in oklab, var(--sage-deep) 90%, var(--ink))",
                      }}
                    >
                      {info.tone === "live" ? "writes to close" : info.tone === "warn" ? "manual" : "safe"}
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-mid)" }}>{info.blurb}</span>
                </span>
              </label>
            );
          })}
          <div>
            <button
              type="submit"
              className="plan-btn plan-btn-primary"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 14px",
              }}
            >
              Save
            </button>
            <span style={{ marginLeft: 12, fontSize: 11, color: "var(--ink-faint)" }}>
              currently <span style={{ color: "var(--ink-mid)", fontWeight: 500 }}>{EXEC_MODE_LABEL[settings.execution_mode].name}</span>
            </span>
          </div>
        </SettingsForm>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sky">
          <h2>Primary credentials</h2>
          <p className="muted">Used by the app&apos;s direct API paths — OpenAI, Supabase, and GitHub.</p>
          {table(primary)}
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--lavender">
          <h2>Auxiliary fleet</h2>
          <p className="muted">
            The four-dot identity. Main agent runs the chat; three auxiliary slots
            ride alongside, each with its own role + capabilities + OpenAI key.
            Configure on the dedicated page.
          </p>
          <p style={{ marginTop: 6 }}>
            <Link
              href="/settings/auxiliaries"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 14px",
                border: "0.5px solid var(--rule)",
                borderRadius: 6,
                display: "inline-block",
                textDecoration: "none",
                color: "var(--ink)",
                background: "var(--card-2)",
              }}
            >
              Configure auxiliaries →
            </Link>
          </p>
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--lavender">
          <h2>Reserved for later</h2>
          <p className="muted">Close CRM keys, webhook signing, and ClickUp — read from <code>.env.local</code>.</p>
          {table(reserved)}
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sky">
          <h2>Close MCP fallback</h2>
          <p className="muted">
            Escape hatch for Close operations the chat agent doesn&apos;t have a direct gated tool for. Audited as{" "}
            <code className="ag-seq-mono">mcp_fallback</code> in{" "}
            <Link href="/console?kind=mcp_fallback">/console?kind=mcp_fallback</Link>. Use{" "}
            <Link href="/test">/test</Link> &rarr; <strong>Test Close MCP fallback</strong> to verify the catalog after setting{" "}
            <code>CLOSE_MCP_URL</code>. Leave <code>CLOSE_MCP_AUTH_HEADER</code> blank to use{" "}
            <code>{'Bearer ${CLOSE_API_KEY}'}</code> automatically (same key as the direct Close tools).
          </p>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "3px 9px",
                borderRadius: 999,
                background:
                  mcpState === "ready"
                    ? "color-mix(in oklab, var(--sage-deep) 18%, var(--card))"
                    : mcpState === "partial"
                    ? "color-mix(in oklab, var(--lemon-deep) 22%, var(--card))"
                    : "color-mix(in oklab, var(--card) 90%, var(--ink) 6%)",
                color:
                  mcpState === "ready"
                    ? "color-mix(in oklab, var(--sage-deep) 90%, var(--ink))"
                    : mcpState === "partial"
                    ? "color-mix(in oklab, var(--lemon-deep) 92%, var(--ink))"
                    : "var(--ink-faint)",
              }}
            >
              {mcpLabel}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-mid)" }}>{mcpBlurb}</span>
          </div>

          <SettingsForm
            action={updateMcpFallbackAction}
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: "var(--card-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: mcpState === "off" ? "not-allowed" : "pointer", flex: 1, minWidth: 240, opacity: mcpState === "off" ? 0.55 : 1 }}>
              <input
                type="checkbox"
                name="enable_mcp_fallback"
                defaultChecked={settings.enable_mcp_fallback}
                disabled={mcpState === "off"}
                style={{ marginTop: 0 }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500 }}>
                  Expose MCP fallback to the chat agent
                </strong>
                <span style={{ fontSize: 11.5, color: "var(--ink-mid)" }}>
                  {mcpState === "off" ? (
                    <>
                      <strong>Inert until MCP is configured.</strong>{" "}Set <code className="ag-seq-mono">CLOSE_MCP_URL</code> in <code className="ag-seq-mono">.env.local</code> to enable. While off, the chat agent has no MCP escape hatch — all Close work flows through the regular API tools. (Note: chat-panel &ldquo;ok after retry&rdquo; chains are usually the LLM switching between API tools, NOT an MCP recovery.)
                    </>
                  ) : (
                    <>
                      Kill switch. When off, <code className="ag-seq-mono">close_mcp_list_tools</code> and <code className="ag-seq-mono">close_mcp_call</code> are filtered from the model&apos;s tool array and the dispatcher refuses any stale invocations. Use to clamp down if the model overuses fallback.
                    </>
                  )}
                </span>
              </span>
            </label>
            <button
              type="submit"
              className="plan-btn plan-btn-primary"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 14px",
              }}
            >
              Save
            </button>
          </SettingsForm>

          {table(mcpEnvRows)}
        </div>

        <div className="cmk-stack-panel cmk-stack-panel--sage">
          <h2>Where these are used</h2>
          <ul className="muted" style={{ marginBottom: 0 }}>
          <li><strong>OPENAI_API_KEY</strong> — Responses + audio + images: <code>/api/chat</code>, <code>/api/test</code>, <code>/api/openai/tts</code>, <code>/api/openai/transcribe</code>, <code>/api/openai/image</code>, plus plan/sequence generation helpers in <code>lib/</code>.</li>
          <li><strong>SUPABASE_URL</strong> + <strong>SUPABASE_SECRET_KEY</strong> — direct PostgREST access from the API route (server-side only).</li>
          <li><strong>SUPABASE_PUBLISHABLE_KEY</strong> — client-safe key for any browser-side Supabase access we add later.</li>
          <li><strong>GITHUB_PAT</strong> — Octokit auth for direct GitHub API calls.</li>
          <li><strong>CLOSE_API_KEY</strong> — Lead Box, heartbeat, chat Close tools, <code>/api/test</code> Close mode.</li>
          <li>
            <strong>CLOSE_WEBHOOK_SIGNATURE_KEY</strong> — hex <code>signature_key</code> from your Close webhook subscription response;
            verifies HMAC on <code>/api/webhooks/close</code> (required in production; dev accepts unsigned POSTs if unset).
          </li>
          <li>
            <strong>CLOSE_MCP_URL</strong> + <strong>CLOSE_MCP_AUTH_HEADER</strong> — JSON-RPC 2.0/HTTP endpoint for Close&apos;s
            official MCP server, used by the chat agent&apos;s <code>close_mcp_list_tools</code> + <code>close_mcp_call</code> escape
            hatch. Auth defaults to <code>Bearer ${`{CLOSE_API_KEY}`}</code> when <code>CLOSE_MCP_AUTH_HEADER</code> is blank.
          </li>
          <li><strong>CLICKUP_*</strong> — reserved.</li>
        </ul>
        </div>
      </main>

      <footer className="cme-footer">
        <div className="cme-breadcrumb">
          <span>admin</span>
          <span className="sep">/</span>
          <span>settings</span>
        </div>
        <span>Comeketo Agent · v0.1.0</span>
      </footer>
    </div>
  );
}
