"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";

type Mode = "openai" | "supabase" | "github" | "close";

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
  {
    key: "close",
    title: "Close",
    description: "Lists active workflows + email templates from your Close org via direct REST. Confirms CLOSE_API_KEY and surfaces real workflow names so you can see the agent's playing field.",
  },
];

export default function TestPage() {
  const [results, setResults] = useState<Partial<Record<Mode, TestResult | null>>>({});
  const [loading, setLoading] = useState<Partial<Record<Mode, boolean>>>({});
  const toast = useToast();

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
      if (data.ok) {
        toast.push(`${MODES.find((m) => m.key === mode)?.title ?? mode} reachable${data.durationMs ? ` · ${data.durationMs}ms` : ""}`, { tone: "success" });
      } else {
        toast.push(`${mode} failed${data.error ? ` — ${data.error.slice(0, 80)}` : ""}`, { tone: "error", ttl: 4500 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResults((r) => ({ ...r, [mode]: { ok: false, mode, error: msg } }));
      toast.push(`${mode} failed — ${msg.slice(0, 80)}`, { tone: "error", ttl: 4500 });
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
          const resultText = result ? JSON.stringify(result.error ?? result.output, null, 2) : "";
          return (
            <section key={key} style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
              <h2>{title}</h2>
              <p className="muted">{description}</p>
              <button onClick={() => fire(key)} disabled={busy} className={busy ? "test-btn-busy" : ""}>
                {busy ? (
                  <>
                    <span className="test-spinner" aria-hidden /> testing…
                  </>
                ) : (
                  `Test ${title}`
                )}
              </button>
              {result && (
                <div className={`test-result test-result-${result.ok ? "ok" : "fail"}`}>
                  <div className="test-result-head">
                    <span className="test-result-status">
                      {result.ok ? "✓ ok" : "✗ failed"}
                    </span>
                    {typeof result.durationMs === "number" && (
                      <span className="test-result-ms">{result.durationMs}ms</span>
                    )}
                    <button
                      type="button"
                      className="test-result-copy"
                      onClick={() => {
                        if (navigator.clipboard) {
                          void navigator.clipboard.writeText(resultText).then(() => {
                            toast.push("Result copied", { tone: "success" });
                          });
                        }
                      }}
                      title="Copy result"
                      aria-label="Copy result"
                    >
                      ⎘
                    </button>
                  </div>
                  <pre className="test-result-pre">{resultText}</pre>
                </div>
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
