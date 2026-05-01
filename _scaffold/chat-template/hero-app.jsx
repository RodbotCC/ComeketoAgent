/* global React, Header, Footer, useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakToggle, TweakRadio, TweakSlider */
const { useState: uS, useEffect: uE, useRef: uR } = React;

/* ============ DECORATIVE PIECES ============ */

// 1) Daily-clock motif (echoes automation page)
function MotifClock() {
  return (
    <svg viewBox="0 0 360 360" className="motif">
      <circle cx="180" cy="180" r="150" fill="none" stroke="var(--rule)" strokeWidth="1"/>
      <circle cx="180" cy="180" r="110" fill="none" stroke="var(--rule-soft)" strokeWidth="1"/>
      {Array.from({length: 24}).map((_, i) => {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const x1 = 180 + Math.cos(a) * 150;
        const y1 = 180 + Math.sin(a) * 150;
        const x2 = 180 + Math.cos(a) * (i % 6 === 0 ? 138 : 144);
        const y2 = 180 + Math.sin(a) * (i % 6 === 0 ? 138 : 144);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-faint)" strokeWidth="0.8"/>;
      })}
      {[
        {h: 6.75, c: '#C9B850'}, {h: 8, c: '#C9B850'}, {h: 9, c: '#8FA078'},
        {h: 10.5, c: '#8FA078'}, {h: 12, c: '#8C82A8'}, {h: 13, c: '#8C82A8'},
        {h: 16.8, c: '#C99668'}, {h: 18, c: '#C99668'}, {h: 21, c: '#B07866'}
      ].map((p, i) => {
        const a = (p.h / 24) * Math.PI * 2 - Math.PI / 2;
        const x = 180 + Math.cos(a) * 110;
        const y = 180 + Math.sin(a) * 110;
        return <circle key={i} cx={x} cy={y} r="6" fill={p.c}/>;
      })}
      <text x="180" y="180" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="22" fill="var(--ink)">Comeketo</text>
      <text x="180" y="206" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-soft)" letterSpacing="2">DAILY · 24H</text>
    </svg>
  );
}

// 2) Trigger-graph motif
function MotifGraph() {
  const nodes = [
    {x: 60,  y: 80,  k: 'd'}, {x: 60, y: 160, k: 'd'}, {x: 60, y: 240, k: 'd'},
    {x: 160, y: 100, k: 'h'}, {x: 160, y: 220, k: 'h'},
    {x: 250, y: 60, k: 'c'}, {x: 250, y: 130, k: 'c'}, {x: 250, y: 200, k: 'c'}, {x: 250, y: 270, k: 'c'},
    {x: 330, y: 130, k: 'r', acc: true}, {x: 330, y: 200, k: 'r'},
  ];
  const edges = [
    [0,3],[1,3],[1,4],[2,4],[3,5],[3,6],[4,7],[4,8],[6,9],[7,10]
  ];
  return (
    <svg viewBox="0 0 400 320" className="motif">
      <defs>
        <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="var(--ink-faint)" opacity="0.4"/>
        </pattern>
      </defs>
      <rect width="400" height="320" fill="url(#dots)"/>
      {edges.map(([a,b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="2 3"/>
      ))}
      {nodes.map((n, i) => {
        if (n.k === 'd') return <rect key={i} x={n.x-12} y={n.y-12} width="24" height="24" fill="var(--card)" stroke="var(--lavender-deep)" transform={`rotate(45 ${n.x} ${n.y})`}/>;
        if (n.k === 'h') return <polygon key={i} points={`${n.x-14},${n.y-8} ${n.x},${n.y-14} ${n.x+14},${n.y-8} ${n.x+14},${n.y+8} ${n.x},${n.y+14} ${n.x-14},${n.y+8}`} fill="var(--lavender)" stroke="var(--lavender-deep)"/>;
        if (n.k === 'c') return <circle key={i} cx={n.x} cy={n.y} r="11" fill="var(--sage)" stroke="var(--sage-deep)"/>;
        if (n.k === 'r') return <rect key={i} x={n.x-12} y={n.y-9} width="24" height="18" fill={n.acc ? 'var(--peach)' : 'var(--card)'} stroke={n.acc ? 'var(--peach-deep)' : 'var(--ink-faint)'}/>;
      })}
    </svg>
  );
}

// 3) Editorial type-stack
function MotifType() {
  return (
    <div className="motif motif-type">
      <div className="mtype-row" style={{fontSize: 14, color:'var(--ink-soft)', fontFamily:'var(--mono)'}}>00 · introducing</div>
      <div className="mtype-row serif" style={{fontSize: 56, lineHeight: 1.05, fontStyle: 'italic'}}>Comeketo<span style={{color:'var(--ink)'}}>.</span></div>
      <div className="mtype-row serif" style={{fontSize: 28, lineHeight: 1.15}}>An <em>agent</em> for catering operators.</div>
      <hr className="cme-rule" style={{margin: '18px 0'}}/>
      <div className="mtype-row" style={{fontSize: 13, color:'var(--ink-mid)', fontFamily:'var(--serif)', fontStyle:'italic'}}>
        — composed of cron, watch, webhook, rule, and the ribbon.
      </div>
    </div>
  );
}

// 4) Activity feed (live-ish)
function MotifActivity() {
  const rows = [
    {t:'08:00', m:'Andre · morning brief', s:'ok',     d:'lemon'},
    {t:'09:00', m:'Hugo · heartbeat',      s:'ok',     d:'sage'},
    {t:'09:00', m:'Brenda & Steve · cadence', s:'queued', d:'lavender'},
    {t:'10:30', m:'Hugo · plan executor',  s:'ok',     d:'sage'},
    {t:'12:00', m:'Memory consolidation',  s:'ok',     d:'lavender'},
    {t:'13:00', m:'Brenda & Steve · plan', s:'ok',     d:'lavender'},
    {t:'16:48', m:'Lead enrichment sweep', s:'running',d:'peach'},
    {t:'18:00', m:'Pre-tasting brief',     s:'queued', d:'peach'},
    {t:'21:00', m:'Friday recap',          s:'queued', d:'rose'},
  ];
  return (
    <div className="motif motif-act">
      <div className="cme-eyebrow" style={{marginBottom: 12}}>activity · today</div>
      {rows.map((r, i) => (
        <div key={i} className="mact-row">
          <span className={'cme-dot ' + r.d}/>
          <span className="mono mact-t">{r.t}</span>
          <span className="mact-m">{r.m}</span>
          <span className={'cme-pill ' + (r.s==='ok'?'tone-done':r.s==='running'?'tone-running':'tone-queued')}>{r.s}</span>
        </div>
      ))}
    </div>
  );
}

// 5) Quote
function MotifQuote() {
  return (
    <div className="motif motif-quote">
      <div className="mquote-mark serif">“</div>
      <p className="mquote-body serif">
        We were running fourteen weddings in a season. <em>Comeketo</em> doesn't just remind us — it composes the whole week, fires on the right beats, and asks for our blessing before it sends.
      </p>
      <div className="mquote-by">
        <div className="mquote-by-name">Andre Comeketo</div>
        <div className="mquote-by-role mono">founder · 218 events delivered</div>
      </div>
    </div>
  );
}

// 6) Composed dashboard preview
function MotifDashboard() {
  return (
    <div className="motif motif-dash">
      <div className="mdash-top">
        <span className="cme-eyebrow">briefing · friday, may 1</span>
        <span className="cme-pill tone-running">live</span>
      </div>
      <div className="mdash-h serif italic">Today, <span style={{fontStyle:'normal'}}>nine triggers fire.</span></div>
      <div className="mdash-grid">
        <div className="mdash-tile"><div className="mdash-tile-n serif">9</div><div className="mdash-tile-l">cron firing</div></div>
        <div className="mdash-tile"><div className="mdash-tile-n serif">3</div><div className="mdash-tile-l">drafted</div></div>
        <div className="mdash-tile"><div className="mdash-tile-n serif">14</div><div className="mdash-tile-l">leads warm</div></div>
        <div className="mdash-tile"><div className="mdash-tile-n serif">2</div><div className="mdash-tile-l">need review</div></div>
      </div>
      <div className="mdash-line">
        <div className="mdash-line-rail"/>
        {[6.75, 8, 9, 10.5, 12, 13, 16.8, 18, 21].map((h, i) => (
          <span key={i} className={'cme-dot ' + ['lemon','lemon','sage','sage','lavender','lavender','peach','peach','rose'][i]} style={{left: (h/24)*100 + '%'}}/>
        ))}
      </div>
    </div>
  );
}

const MOTIFS = {
  clock:     { label: 'Daily clock', C: MotifClock },
  graph:     { label: 'Trigger graph', C: MotifGraph },
  type:      { label: 'Editorial type', C: MotifType },
  activity:  { label: 'Activity feed', C: MotifActivity },
  quote:     { label: 'Founder quote', C: MotifQuote },
  dashboard: { label: 'Briefing preview', C: MotifDashboard },
};

/* ============ SIGN-IN CARDS ============ */

function GoogleBtn() {
  return (
    <button className="gbtn">
      <svg viewBox="0 0 18 18" width="16" height="16">
        <path fill="#4285F4" d="M16.51 8.18c0-.55-.05-1.08-.14-1.6H9v3.02h4.21c-.18.97-.74 1.79-1.58 2.34v1.95h2.55c1.49-1.37 2.35-3.4 2.35-5.71z"/>
        <path fill="#34A853" d="M9 17c2.13 0 3.92-.71 5.22-1.92l-2.55-1.95c-.7.47-1.6.75-2.67.75-2.05 0-3.79-1.39-4.41-3.25H1.96v2.04C3.25 15.42 5.91 17 9 17z"/>
        <path fill="#FBBC05" d="M4.59 10.63A4.83 4.83 0 0 1 4.36 9c0-.57.1-1.12.23-1.63V5.33H1.96A8 8 0 0 0 1 9c0 1.31.31 2.55.96 3.67l2.63-2.04z"/>
        <path fill="#EA4335" d="M9 4.75c1.16 0 2.2.4 3.02 1.18l2.26-2.26C13.92 2.42 12.13 1.5 9 1.5 5.91 1.5 3.25 3.08 1.96 5.33l2.63 2.04C5.21 6.14 6.95 4.75 9 4.75z"/>
      </svg>
      <span>Continue with Google</span>
    </button>
  );
}

function MetaBlock({ small }) {
  return (
    <div className={'auth-meta ' + (small ? 'sm' : '')}>
      <span className="mono">v 0.18.4</span>
      <span className="dim">·</span>
      <span className="mono">us-east</span>
      <span className="dim">·</span>
      <a className="mono">privacy</a>
      <span className="dim">·</span>
      <a className="mono">terms</a>
    </div>
  );
}

function SignInCard({ tagline, mood }) {
  return (
    <div className="auth-card">
      <div className="cme-section-label">01 · sign in</div>
      <h2 className="auth-h">Welcome back. <em>Let's compose the week.</em></h2>
      <p className="auth-lede">{tagline}</p>
      <GoogleBtn/>
      <div className="auth-fine mono">
        Workspace SSO is on for <span className="ed-tag">@comeketocatering.com</span>. Other domains, ask Andre.
      </div>
      <hr className="cme-rule-soft" style={{margin: '16px 0'}}/>
      <div className="auth-quick">
        <a>Forgot your domain?</a>
        <a>I'm a delegated user →</a>
      </div>
    </div>
  );
}

/* ============ APP ============ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "motif": "clock",
  "layout": "split",
  "tagline": "An agent for catering operators. Cron, watch, webhook, rule, ribbon \u2014 wired into a quiet day.",
  "showStrip": true,
  "showCounters": true,
  "wordmarkSize": "lg"
}/*EDITMODE-END*/;

const LAYOUTS = {
  split:     'Split — sign-in left, motif right',
  split_rev: 'Split — motif left, sign-in right',
  centered:  'Centered — motif above',
  hero_full: 'Full-bleed motif behind',
  editorial: 'Editorial — type stack hero',
  stacked:   'Stacked — motif top, sign-in below',
};

const TAGLINES = [
  'An agent for catering operators. Cron, watch, webhook, rule, ribbon — wired into a quiet day.',
  'A briefing system that fires on time, asks before it sends, and remembers the cadence.',
  'Run fourteen weddings without losing the thread.',
  'Compose the week, then approve it.',
  'A small, opinionated piece of software for the people who feed your guests.',
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const Motif = MOTIFS[tweaks.motif].C;

  return (
    <div className="cme-shell hero-shell">
      <header className="cme-header hero-header">
        <a href="index.html" className="cme-wordmark">Comeketo <em>Agent</em><span className="dot">.</span></a>
        <div className="cme-utility">
          <a>about</a>
          <a>changelog</a>
          <a>request invite</a>
        </div>
      </header>

      <main className={'hero-main hero-layout-' + tweaks.layout}>

        {tweaks.layout === 'editorial' ? (
          <div className="hero-editorial">
            <div className="cme-section-label">00 · introducing</div>
            <h1 className="hero-title">
              Comeketo<span className="dot">.</span><br/>
              An <em>agent</em> for catering<br/>
              operators.
            </h1>
            <p className="hero-lede">{tweaks.tagline}</p>
            <div className="hero-actions">
              <GoogleBtn/>
              <span className="auth-fine mono">workspace SSO · @comeketocatering.com</span>
            </div>
            {tweaks.showStrip && <CounterStrip/>}
          </div>
        ) : tweaks.layout === 'centered' ? (
          <div className="hero-centered">
            <div className="hero-motif-wrap"><Motif/></div>
            <div className="auth-card narrow">
              <div className="cme-section-label">01 · sign in</div>
              <h2 className="auth-h">Welcome back. <em>Let's compose the week.</em></h2>
              <p className="auth-lede">{tweaks.tagline}</p>
              <GoogleBtn/>
              <div className="auth-fine mono">workspace SSO · @comeketocatering.com</div>
            </div>
          </div>
        ) : tweaks.layout === 'hero_full' ? (
          <div className="hero-fullbleed">
            <div className="hero-bg"><Motif/></div>
            <div className="auth-card floating">
              <div className="cme-section-label">01 · sign in</div>
              <h2 className="auth-h">Welcome back. <em>Let's compose the week.</em></h2>
              <p className="auth-lede">{tweaks.tagline}</p>
              <GoogleBtn/>
              <div className="auth-fine mono">workspace SSO · @comeketocatering.com</div>
            </div>
          </div>
        ) : tweaks.layout === 'stacked' ? (
          <div className="hero-stacked">
            <div className="hero-motif-wrap"><Motif/></div>
            <SignInCard tagline={tweaks.tagline}/>
          </div>
        ) : (
          <div className={'hero-split ' + (tweaks.layout === 'split_rev' ? 'rev' : '')}>
            <div className="hero-split-l">
              <div className="cme-section-label">00 · comeketo agent</div>
              <h1 className="hero-title">Compose the week. <em>Then approve it.</em></h1>
              <p className="hero-lede">{tweaks.tagline}</p>
              <div style={{marginTop: 20}}><SignInCard tagline=""/></div>
            </div>
            <div className="hero-split-r">
              <Motif/>
            </div>
          </div>
        )}

        {tweaks.showStrip && tweaks.layout !== 'editorial' && <CounterStrip/>}
      </main>

      <footer className="cme-footer">
        <div className="cme-breadcrumb">
          <span className="mono">comeketocatering.com</span>
          <span className="sep">/</span>
          <span>agent</span>
        </div>
        <div style={{display:'flex', gap:16, alignItems:'center', fontSize:11, color:'var(--ink-soft)'}}>
          <a style={{color:'inherit'}}>privacy</a>
          <a style={{color:'inherit'}}>terms</a>
          <span>Comeketo Agent · v0.18.4</span>
        </div>
      </footer>

      <TweaksPanel title="Tweaks · hero">
        <TweakSection title="Layout">
          <TweakSelect label="Hero layout" value={tweaks.layout} onChange={v => setTweak('layout', v)}
            options={Object.entries(LAYOUTS).map(([k,l])=>({value:k, label:l}))}/>
          <TweakToggle label="Counter strip" value={tweaks.showStrip} onChange={v => setTweak('showStrip', v)}/>
        </TweakSection>
        <TweakSection title="Motif">
          <TweakSelect label="Decorative piece" value={tweaks.motif} onChange={v => setTweak('motif', v)}
            options={Object.entries(MOTIFS).map(([k,v])=>({value:k, label:v.label}))}/>
        </TweakSection>
        <TweakSection title="Copy">
          <TweakSelect label="Tagline" value={tweaks.tagline} onChange={v => setTweak('tagline', v)}
            options={TAGLINES.map((t, i) => ({value: t, label: `${i+1}. ${t.slice(0, 40)}…`}))}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function CounterStrip() {
  const items = [
    { n: '218', l: 'events delivered' },
    { n: '14k', l: 'tasks composed' },
    { n: '99.7%', l: 'on-time' },
    { n: '12', l: 'agent kinds' },
  ];
  return (
    <div className="hero-strip">
      {items.map((it, i) => (
        <div key={i} className="hero-strip-item">
          <span className="hero-strip-n serif">{it.n}</span>
          <span className="hero-strip-l mono">{it.l}</span>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
