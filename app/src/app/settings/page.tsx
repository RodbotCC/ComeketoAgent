import Link from "next/link";
import { envStatus } from "@/lib/env";
import { AVAILABLE_MODELS, getSettings } from "@/lib/settings";
import { updateModelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = envStatus();
  const settings = await getSettings();

  const primary: Array<[string, { set: boolean; fingerprint: string | null }]> = [
    ["OPENAI_API_KEY", status.OPENAI_API_KEY],
    ["SUPABASE_URL", status.SUPABASE_URL],
    ["SUPABASE_PUBLISHABLE_KEY", status.SUPABASE_PUBLISHABLE_KEY],
    ["SUPABASE_SECRET_KEY", status.SUPABASE_SECRET_KEY],
    ["GITHUB_PAT", status.GITHUB_PAT],
  ];

  const reserved: Array<[string, { set: boolean; fingerprint: string | null }]> = [
    ["CLOSE_API_KEY", status.CLOSE_API_KEY],
    ["CLICKUP_API_TOKEN", status.CLICKUP_API_TOKEN],
  ];

  function table(rows: Array<[string, { set: boolean; fingerprint: string | null }]>) {
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
          {rows.map(([name, info]) => (
            <tr key={name}>
              <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 12 }}>
                {name}
              </td>
              <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)" }}>
                <span className={`dot ${info.set ? "on" : "off"}`} />
                {info.set ? "set" : "missing"}
              </td>
              <td style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)" }}>
                {info.fingerprint ?? "—"}
              </td>
            </tr>
          ))}
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
          <Link href="/intake">intake</Link>
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

        {/* MODEL PICKER */}
        <h2>Model</h2>
        <p className="muted">
          Which OpenAI Responses model the chat and test endpoints use. Saved on submit; takes effect on the next request.
        </p>
        <form action={updateModelAction} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <select
            name="model"
            defaultValue={settings.model}
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              padding: "8px 12px",
              borderRadius: 5,
              border: "1px solid var(--rule)",
              background: "var(--card)",
              color: "var(--ink)",
              minWidth: 280,
            }}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            type="submit"
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
        </form>

        <h2>Primary credentials</h2>
        <p className="muted">Used by the app&apos;s direct API paths — OpenAI, Supabase, and GitHub.</p>
        {table(primary)}

        <h2>Reserved for later</h2>
        <p className="muted">Configured in <code>.env.local</code> but not yet wired to any code path.</p>
        {table(reserved)}

        <h2>Where these are used</h2>
        <ul className="muted">
          <li><strong>OPENAI_API_KEY</strong> — Responses API call from <code>/api/chat</code> and <code>/api/test</code>.</li>
          <li><strong>SUPABASE_URL</strong> + <strong>SUPABASE_SECRET_KEY</strong> — direct PostgREST access from the API route (server-side only).</li>
          <li><strong>SUPABASE_PUBLISHABLE_KEY</strong> — client-safe key for any browser-side Supabase access we add later.</li>
          <li><strong>GITHUB_PAT</strong> — Octokit auth for direct GitHub API calls.</li>
          <li><strong>CLOSE / CLICKUP</strong> — reserved. Not wired yet.</li>
        </ul>
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
