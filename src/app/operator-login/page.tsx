"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** Root was gated by middleware; skip marketing hero and land on command center. */
function postLoginDestination(next: string): string {
  const raw = next.startsWith("/") ? next : "/settings";
  const pathOnly = raw.split("?")[0] ?? "";
  if (pathOnly === "/" || pathOnly === "") {
    const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    return `/console${q}`;
  }
  return raw;
}

function OperatorLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/settings";

  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    try {
      const r = await fetch("/api/auth/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        window.location.assign(postLoginDestination(next));
        return;
      } else if (r.status === 400) {
        const j = await r.json().catch(() => ({}));
        setMsg(String((j as { error?: string }).error || "Lock not configured"));
      } else {
        setMsg("Bad password");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="cme-shell">
      <header className="cme-header">
        <Link href="/" className="cme-wordmark">
          Comeketo <em>Agent</em>
        </Link>
      </header>
      <main style={{ padding: 28, maxWidth: 460 }}>
        <div className="widget cmk-stack-panel cmk-stack-panel--lavender" style={{ padding: "18px 20px 20px" }}>
          <h1 className="hb-page-title" style={{ fontSize: 20, marginTop: 0 }}>
            Operator login
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 0 }}>
            Only when <code>OPERATOR_PASSWORD</code> and <code>OPERATOR_COOKIE_SECRET</code> are set in{" "}
            <code>.env.local</code>.
          </p>
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-soft)" }}>
              PASSWORD
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cmk-field-panel"
                style={{ display: "block", marginTop: 8, width: "100%" }}
              />
            </label>
            <button type="submit" className="plan-btn plan-btn-primary" style={{ marginTop: 14 }} disabled={pending}>
              {pending ? "…" : "Sign in"}
            </button>
          </form>
          {msg && <p style={{ marginTop: 16, fontSize: 13 }}>{msg}</p>}
          <p style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/settings">← Settings</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function OperatorLoginPage() {
  return (
    <Suspense fallback={<div className="cme-shell" style={{ padding: 28 }}>Loading…</div>}>
      <OperatorLoginForm />
    </Suspense>
  );
}
