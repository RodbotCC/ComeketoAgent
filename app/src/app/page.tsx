import Link from "next/link";

/* ============ DAILY CLOCK MOTIF ============ */

function MotifClock() {
  const dots: Array<{ h: number; c: string }> = [
    { h: 6.75, c: "#C9B850" },
    { h: 8, c: "#C9B850" },
    { h: 9, c: "#8FA078" },
    { h: 10.5, c: "#8FA078" },
    { h: 12, c: "#8C82A8" },
    { h: 13, c: "#8C82A8" },
    { h: 16.8, c: "#C99668" },
    { h: 18, c: "#C99668" },
    { h: 21, c: "#B07866" },
  ];

  return (
    <svg viewBox="0 0 360 360" className="motif" xmlns="http://www.w3.org/2000/svg">
      <circle cx="180" cy="180" r="150" fill="none" stroke="var(--rule)" strokeWidth="1" />
      <circle cx="180" cy="180" r="110" fill="none" stroke="var(--rule-soft)" strokeWidth="1" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const x1 = 180 + Math.cos(a) * 150;
        const y1 = 180 + Math.sin(a) * 150;
        const x2 = 180 + Math.cos(a) * (i % 6 === 0 ? 138 : 144);
        const y2 = 180 + Math.sin(a) * (i % 6 === 0 ? 138 : 144);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-faint)" strokeWidth="0.8" />;
      })}
      {dots.map((p, i) => {
        const a = (p.h / 24) * Math.PI * 2 - Math.PI / 2;
        const x = 180 + Math.cos(a) * 110;
        const y = 180 + Math.sin(a) * 110;
        return <circle key={i} cx={x} cy={y} r="6" fill={p.c} />;
      })}
      <text
        x="180"
        y="180"
        textAnchor="middle"
        fontFamily="var(--serif)"
        fontStyle="italic"
        fontSize="22"
        fill="var(--ink)"
      >
        Comeketo
      </text>
      <text
        x="180"
        y="206"
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--ink-soft)"
        letterSpacing="2"
      >
        DAILY · 24H
      </text>
    </svg>
  );
}

/* ============ GOOGLE BUTTON (visual stub — does nothing) ============ */

function GoogleBtn() {
  // Visual-only stub. No onClick — Server Components can't ship event handlers.
  // When auth is wired, extract this to a "use client" component (or wrap the
  // sign-in card in a <form action={serverAction}>).
  return (
    <button className="gbtn" type="button" aria-label="Continue with Google">
      <svg viewBox="0 0 18 18" width="16" height="16">
        <path
          fill="#4285F4"
          d="M16.51 8.18c0-.55-.05-1.08-.14-1.6H9v3.02h4.21c-.18.97-.74 1.79-1.58 2.34v1.95h2.55c1.49-1.37 2.35-3.4 2.35-5.71z"
        />
        <path
          fill="#34A853"
          d="M9 17c2.13 0 3.92-.71 5.22-1.92l-2.55-1.95c-.7.47-1.6.75-2.67.75-2.05 0-3.79-1.39-4.41-3.25H1.96v2.04C3.25 15.42 5.91 17 9 17z"
        />
        <path
          fill="#FBBC05"
          d="M4.59 10.63A4.83 4.83 0 0 1 4.36 9c0-.57.1-1.12.23-1.63V5.33H1.96A8 8 0 0 0 1 9c0 1.31.31 2.55.96 3.67l2.63-2.04z"
        />
        <path
          fill="#EA4335"
          d="M9 4.75c1.16 0 2.2.4 3.02 1.18l2.26-2.26C13.92 2.42 12.13 1.5 9 1.5 5.91 1.5 3.25 3.08 1.96 5.33l2.63 2.04C5.21 6.14 6.95 4.75 9 4.75z"
        />
      </svg>
      <span>Continue with Google</span>
    </button>
  );
}

/* ============ SIGN-IN CARD ============ */

function SignInCard() {
  return (
    <div className="auth-card">
      <div className="cme-section-label">01 · sign in</div>
      <h2 className="auth-h">
        Welcome back. <em>Let&apos;s compose the week.</em>
      </h2>
      <GoogleBtn />
      <div className="auth-fine">
        Workspace SSO is on for <span>@comeketocatering.com</span>. Other domains, ask Andre.
      </div>
      <hr className="cme-rule-soft" style={{ margin: "14px 0" }} />
      <div className="auth-quick">
        <a>Forgot your domain?</a>
        <a>I&apos;m a delegated user →</a>
      </div>
    </div>
  );
}

/* ============ COUNTER STRIP ============ */

function CounterStrip() {
  const items: Array<{ n: string; l: string }> = [
    { n: "218", l: "events delivered" },
    { n: "14k", l: "tasks composed" },
    { n: "99.7%", l: "on-time" },
    { n: "12", l: "agent kinds" },
  ];
  return (
    <div className="hero-strip">
      {items.map((it, i) => (
        <div key={i} className="hero-strip-item">
          <span className="hero-strip-n serif">{it.n}</span>
          <span className="hero-strip-l">{it.l}</span>
        </div>
      ))}
    </div>
  );
}

/* ============ PAGE ============ */

export default function HeroPage() {
  return (
    <div className="cme-shell hero-shell">
      <header className="cme-header hero-header">
        <span className="cme-wordmark-row">
          <span className="cme-identity-dots" aria-hidden>
            <span className="cme-dot brown" />
            <span className="cme-dot gold" />
            <span className="cme-dot sage" />
            <span className="cme-dot lavender" />
          </span>
          <Link href="/chat" className="cme-wordmark">
            Comeketo <em>Agent</em>
            <span className="dot">.</span>
          </Link>
        </span>
        <div className="cme-utility">
          <a>about</a>
          <a>changelog</a>
          <a>request invite</a>
        </div>
      </header>

      <main className="hero-main">
        <div className="hero-split">
          <div className="hero-split-l">
            <div className="cme-section-label">00 · comeketo agent</div>
            <h1 className="hero-title">
              Compose the week. <em>Then approve it.</em>
            </h1>
            <p className="hero-lede">
              An agent for catering operators. Cron, watch, webhook, rule, ribbon — wired into a quiet day.
            </p>
            <SignInCard />
          </div>
          <div className="hero-split-r">
            <MotifClock />
          </div>
        </div>

        <CounterStrip />
      </main>

      <footer className="cme-footer">
        <div className="cme-breadcrumb">
          <span>comeketocatering.com</span>
          <span className="sep">/</span>
          <span>agent</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 10.5, color: "var(--ink-faint)" }}>
          <a style={{ color: "inherit" }}>privacy</a>
          <a style={{ color: "inherit" }}>terms</a>
          <span>Comeketo Agent · v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}
