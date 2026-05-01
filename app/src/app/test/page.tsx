"use client";

import Link from "next/link";
import { useState } from "react";

type Mode = "openai" | "supabase" | "github";

type TestResult = {
  ok: boolean;
  mode: Mode;
  durationMs?: number;
  output?: unknown;
  error?: string;
};

const MODES: Array<{ key: Mode; title: string; description: string }> = [
  {
    key: "openai",
    title: "OpenAI",
    description: "Fires a tiny Responses API call (model: gpt-4.1, no tools attached). Confirms the SDK path and key.",
  },
  {
    key: "supabase",
    title: "Supabase",
    description: "Hits the project's PostgREST root with the secret key. Returns the OpenAPI spec — the table count is a quick health signal.",
  },
  {
    key: "github",
    title: "GitHub",
    description: "Calls /user via Octokit using the GITHUB_PAT. Confirms the token works and prints account basics.",
  },
];

export default function TestPage() {
  const [results, setResults] = useState<Partial<Record<Mode, TestResult | null>>>({});
  const [loading, setLoading] = useState<Partial<Record<Mode, boolean>>>({});

  async function fire(mode: Mode) {
    setLoading((s) => ({ ...s, [mode]: true }));
    setResults((r) => ({ ...r, [mode]: null }));
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json()) as TestResult;
      setResults((r) => ({ ...r, [mode]: data }));
    } catch (err) {
      setResults((r) => ({ ...r, [mode]: { ok: false, mode, error: String(err) } }));
    } finally {
      setLoading((s) => ({ ...s, [mode]: false }));
    }
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
        <div className="cme-section-label">admin · 03</div>
        <h1>Test</h1>
        <p>Three independent connection checks. Direct APIs — no MCP tools attached on this side.</p>

        {MODES.map(({ key, title, description }) => {
          const result = results[key];
          const busy = !!loading[key];
          return (
            <section key={key} style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
              <h2>{title}</h2>
              <p className="muted">{description}</p>
              <button onClick={() => fire(key)} disabled={busy}>
                {busy ? "Firing…" : `Test ${title}`}
              </button>
              {result && (
                <>
                  <h3 style={{ marginTop: 16 }}>
                    {result.ok ? "✓ ok" : "✗ failed"}
                    {typeof result.durationMs === "number" ? (
                      <span className="muted" style={{ marginLeft: 12, fontSize: 11, fontFamily: "var(--mono)" }}>
                        {result.durationMs}ms
                      </span>
                    ) : null}
                  </h3>
                  <pre>{JSON.stringify(result.error ?? result.output, null, 2)}</pre>
                </>
              )}
            </section>
          );
        })}
      </main>

      <footer className="cme-footer">
        <div className="cme-breadcrumb">
          <span className="mono">admin</span>
          <span className="sep">/</span>
          <span>test</span>
        </div>
        <span>Comeketo Agent · v0.1.0</span>
      </footer>
    </div>
  );
}
