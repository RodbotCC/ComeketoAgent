/* global React */
const { useState } = React;

// Tiny icons, hand-tuned to match the screenshots
const Icons = {
  people: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="6" cy="6" r="2.4"/><circle cx="11.5" cy="7" r="1.8"/>
      <path d="M2 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6"/>
      <path d="M9.5 12.4c0-1.5 1.2-2.5 2.6-2.5s2.4 1 2.4 2.5"/>
    </svg>
  ),
  caret: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 6.5l4 3.5 4-3.5"/></svg>
  ),
  activity: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 9h2.5L6 5l3 6 1.5-3H14"/></svg>
  ),
  intake: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 9v3.5h12V9"/><path d="M5.5 6L8 3.5 10.5 6"/><path d="M8 3.5V10"/></svg>
  ),
  analytics: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 13V8.5"/><path d="M7 13V5"/><path d="M11 13V9.5"/></svg>
  ),
  boxes: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.5" y="2.5" width="5" height="5"/><rect x="8.5" y="2.5" width="5" height="5"/><rect x="2.5" y="8.5" width="5" height="5"/><rect x="8.5" y="8.5" width="5" height="5"/></svg>
  ),
  automation: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2.5 8h3l1.5-3 2 6 1.5-3h3"/></svg>
  ),
  delegations: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 5l3 3-3 3"/><path d="M8.5 11h5"/></svg>
  ),
  chat: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z"/></svg>
  ),
  gear: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="8" cy="8" r="2"/>
      <path d="M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4"/>
    </svg>
  ),
};

function Header({ active = 'delegations', onNav }) {
  const items = [
    { id: 'people', label: 'people', icon: <Icons.people/>, caret: true },
    { id: 'activity', label: 'activity', icon: <Icons.activity/> },
    { id: 'intake', label: 'intake', icon: <Icons.intake/> },
    { id: 'analytics', label: 'analytics', icon: <Icons.analytics/> },
    { id: 'boxes', label: 'boxes', icon: <Icons.boxes/> },
    { id: 'automation', label: 'automation', icon: <Icons.automation/> },
    { id: 'delegations', label: 'delegations', icon: <Icons.delegations/> },
    { id: 'chat', label: 'chat', icon: <Icons.chat/> },
  ];
  return (
    <header className="cme-header">
      <a href="index.html" className="cme-wordmark">
        Comeketo <em>Agent</em><span className="dot">.</span>
      </a>
      <div className="cme-header-right">
        <div className="cme-utility">
          <a>proposals</a>
          <a>personal</a>
          <a>briefing</a>
          <a className="gear" aria-label="Settings"><Icons.gear/></a>
        </div>
        <nav className="cme-nav">
          {items.map(it => (
            <a key={it.id}
               className={'cme-nav-item' + (active === it.id ? ' is-active' : '')}
               onClick={() => onNav && onNav(it.id)}>
              {it.icon}{it.label}{it.caret ? <Icons.caret/> : null}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Tabs({ tabs, active, onChange, pageLabel }) {
  return (
    <div className="cme-tabs">
      {tabs.map(t => (
        <a key={t}
           className={'cme-tab' + (active === t ? ' is-active' : '')}
           onClick={() => onChange && onChange(t)}>
          {t}
        </a>
      ))}
      {pageLabel && <span className="cme-tab-page-label">{pageLabel}</span>}
    </div>
  );
}

function Footer({ breadcrumb = ['grid · morning'] }) {
  return (
    <footer className="cme-footer">
      <div className="cme-breadcrumb">
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span>{b}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="cme-footer-right">
        <span className="cme-grip"/>
      </div>
      <div style={{display:'flex', gap:16, alignItems:'center', fontSize:11, color:'var(--ink-soft)'}}>
        <a style={{color:'inherit', textDecoration:'none'}}>proposals</a>
        <a style={{color:'inherit', textDecoration:'none'}}>personal</a>
        <span style={{color:'var(--ink-mid)'}}>Comeketo Agent</span>
      </div>
    </footer>
  );
}

Object.assign(window, { Header, Tabs, Footer, Icons });
