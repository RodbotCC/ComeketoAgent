/* global React, Header, Tabs, Footer,
   useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakToggle, TweakRadio
*/
const { useState: uS, useEffect: uE, useRef: uR } = React;

/* ============ THINKING PANELS — calm, collapsible ============ */

function ThinkingBlock({ steps, active, variant }) {
  const [open, setOpen] = uS(true);
  return (
    <div className={'tk tk-' + variant + (open ? ' is-open' : ' is-closed')}>
      <button className="tk-head" onClick={() => setOpen(!open)}>
        <span className="tk-caret">{open ? '▾' : '▸'}</span>
        <span className="tk-label">Thought for 12 seconds</span>
        <span className="tk-meta mono">{active}/{steps.length}</span>
      </button>
      {open && (
        <div className="tk-body">
          {variant === 'list' && (
            <ul className="tk-list">
              {steps.map((s, i) => (
                <li key={i} className={i < active ? 'done' : i === active ? 'cur' : ''}>{s}</li>
              ))}
            </ul>
          )}
          {variant === 'log' && (
            <div className="tk-log">
              {steps.map((s, i) => (
                <div key={i} className={'tk-log-row ' + (i < active ? 'done' : i === active ? 'cur' : 'pend')}>
                  <span className="tk-log-bullet"/>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
          {variant === 'prose' && (
            <p className="tk-prose">
              Looking at the brief — Brenda &amp; Steve, tasting May 18. I'll set up a cron at 9:00 weekdays, three writes (Slack, ClickUp, Gmail), and a guard that skips if Close shows BLOCKED. Let me check the trigger graph for collisions before composing.
            </p>
          )}
          {variant === 'mono' && (
            <pre className="tk-mono">
{`✓ read briefing/cadences/brenda-steve.md
✓ checked trigger graph · no collisions
✓ drafted cron · 0 9 * * 1-5 (NY)
✓ wired writes · slack, clickup, gmail
… composing approval card`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ TOOL CALL — Send Automation ============ */

function SendAutomationCall({ status }) {
  const [open, setOpen] = uS(true);
  return (
    <div className="tc">
      <button className="tc-head" onClick={() => setOpen(!open)}>
        <span className="tc-caret">{open ? '▾' : '▸'}</span>
        <span className="tc-tool mono">send_automation</span>
        <span className="tc-arrow">→</span>
        <span className="tc-name">Brenda &amp; Steve · 7-day pre-tasting</span>
        <span className={'tc-status ' + status}>{status}</span>
      </button>
      {open && (
        <div className="tc-body">
          <div className="tc-row">
            <span className="tc-k">trigger</span>
            <span className="tc-v"><span className="tc-tag">cron</span> <span className="mono">0 9 * * 1-5</span> · America/New_York</span>
          </div>
          <div className="tc-row">
            <span className="tc-k">writes</span>
            <span className="tc-v">
              <span className="tc-chip">slack #crew-brenda</span>
              <span className="tc-chip">clickup task</span>
              <span className="tc-chip">gmail recap</span>
            </span>
          </div>
          <div className="tc-row">
            <span className="tc-k">guard</span>
            <span className="tc-v mono dim">skip if status BLOCKED · debounce 1h · retry ×2</span>
          </div>
          {status !== 'sent' && (
            <div className="tc-foot">
              <button className="tc-btn">reject</button>
              <button className="tc-btn primary">approve &amp; send</button>
            </div>
          )}
          {status === 'sent' && (
            <div className="tc-foot done">
              <span className="mono">✓ sent · automation/triggers/brenda_steve.cme · v1</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ COMPOSER ============ */

function Composer() {
  const [v, setV] = uS('');
  return (
    <div className="cp-wrap">
      <div className="cp">
        <textarea
          rows={1}
          placeholder="Message rodbot…"
          value={v}
          onChange={e => setV(e.target.value)}
          onInput={e => { e.target.style.height='auto'; e.target.style.height = Math.min(e.target.scrollHeight, 220) + 'px'; }}
        />
        <div className="cp-row">
          <div className="cp-tools">
            <button className="cp-icon" title="Attach">＋</button>
            <button className="cp-icon" title="Tools">⌘</button>
          </div>
          <button className="cp-send">↑</button>
        </div>
      </div>
      <div className="cp-fine">rodbot can compose automations. you approve every write.</div>
    </div>
  );
}

/* ============ APP ============ */

const STEPS = [
  'Reading briefing/cadences/brenda-steve.md',
  'Checking trigger graph for collisions',
  'Drafting cron · 9:00 weekdays · NY',
  'Wiring writes — Slack, ClickUp, Gmail',
  'Composing approval card',
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "thinkingStyle": "list",
  "showThinking": true,
  "fontSize": 15,
  "maxWidth": 760,
  "wordmarkInChat": false,
  "showSidebar": false,
  "msgStyle": "flat",
  "agentLabel": "rodbot"
}/*EDITMODE-END*/;

function Sidebar() {
  const items = [
    { t: 'Brenda & Steve · pre-tasting', when: 'now', active: true },
    { t: 'Andre morning brief',        when: '2h' },
    { t: 'Hugo plan executor',         when: '5h' },
    { t: 'Lead enrichment sweep',      when: 'yest' },
    { t: 'WeddingWire push handler',   when: '2d' },
    { t: 'Friday recap',               when: '3d' },
  ];
  return (
    <aside className="sb">
      <div className="sb-head">
        <a className="cme-wordmark" style={{fontSize:18}}>Comeketo <em>Agent</em><span className="dot">.</span></a>
        <button className="sb-new">+ New</button>
      </div>
      <div className="sb-section">Today</div>
      <ul className="sb-list">
        {items.slice(0,3).map((c, i) => (
          <li key={i} className={c.active ? 'active' : ''}>{c.t}</li>
        ))}
      </ul>
      <div className="sb-section">Earlier</div>
      <ul className="sb-list">
        {items.slice(3).map((c, i) => <li key={i}>{c.t}</li>)}
      </ul>
    </aside>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [sent, setSent] = uS(false);
  uE(() => { const t = setTimeout(() => setSent(true), 8000); return () => clearTimeout(t); }, []);

  return (
    <div className={'chat-shell ' + (tweaks.showSidebar ? 'with-sb' : '')}>
      {tweaks.showSidebar && <Sidebar/>}

      <div className="chat-col">
        <header className="chat-top">
          <a className="cme-wordmark">Comeketo <em>Agent</em><span className="dot">.</span></a>
          <div className="chat-top-right">
            <span className="chat-model mono">rodbot · gpt-5.4</span>
            <a className="chat-top-link">briefing</a>
            <a className="chat-top-link">⚙</a>
          </div>
        </header>

        <main className="chat-stream" style={{'--maxw': tweaks.maxWidth + 'px', '--fs': tweaks.fontSize + 'px'}}>
          <div className="chat-inner">

            <div className={'msg msg-user ' + tweaks.msgStyle}>
              <div className="msg-body">
                <p>Set up the 7-day pre-tasting cadence for Brenda &amp; Steve. Tasting is May 18.</p>
                <p>Same shape as the Catalaros — Slack pings to <code>#crew-brenda</code>, recap email the morning after. Skip if status flips to BLOCKED.</p>
              </div>
            </div>

            <div className={'msg msg-agent ' + tweaks.msgStyle}>
              <div className="msg-body">
                {tweaks.showThinking && <ThinkingBlock steps={STEPS} active={STEPS.length} variant={tweaks.thinkingStyle}/>}

                <p>Here's what I'd send. One cron, three writes, one guard — skips automatically if Close marks the proposal BLOCKED or postponed.</p>

                <SendAutomationCall status={sent ? 'sent' : 'pending'}/>

                <p>Want me to also wire the black-race reminder for the Saturday before? I have the Catalaro template if so.</p>
              </div>
            </div>

            <div className={'msg msg-user ' + tweaks.msgStyle}>
              <div className="msg-body"><p>yes — clone it and let me approve.</p></div>
            </div>

            <div className={'msg msg-agent ' + tweaks.msgStyle}>
              <div className="msg-body">
                <p className="dim">Drafting the black-race reminder now…</p>
              </div>
            </div>

          </div>
        </main>

        <Composer/>
      </div>

      <TweaksPanel title="Tweaks · chat">
        <TweakSection title="Layout">
          <TweakToggle label="Sidebar" value={tweaks.showSidebar} onChange={v => setTweak('showSidebar', v)}/>
          <TweakSelect label="Max width" value={String(tweaks.maxWidth)} onChange={v => setTweak('maxWidth', parseInt(v))}
            options={[{value:'640', label:'640 — narrow'},{value:'760', label:'760 — Claude'},{value:'860', label:'860 — wide'}]}/>
          <TweakSelect label="Font size" value={String(tweaks.fontSize)} onChange={v => setTweak('fontSize', parseInt(v))}
            options={[{value:'14', label:'14'},{value:'15', label:'15'},{value:'16', label:'16'},{value:'17', label:'17'}]}/>
        </TweakSection>
        <TweakSection title="Thinking">
          <TweakToggle label="Show thinking" value={tweaks.showThinking} onChange={v => setTweak('showThinking', v)}/>
          <TweakSelect label="Style" value={tweaks.thinkingStyle} onChange={v => setTweak('thinkingStyle', v)}
            options={[
              {value:'list', label:'Checklist'},
              {value:'log', label:'Log feed'},
              {value:'prose', label:'Prose paragraph'},
              {value:'mono', label:'Monospace block'},
            ]}/>
        </TweakSection>
        <TweakSection title="Messages">
          <TweakRadio label="Message style" value={tweaks.msgStyle} onChange={v => setTweak('msgStyle', v)}
            options={[{value:'flat', label:'Flat'},{value:'bubble', label:'Bubble'},{value:'rule', label:'Hairline'}]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
