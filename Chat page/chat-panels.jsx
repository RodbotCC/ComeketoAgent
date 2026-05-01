/* global React */
const { useState, useEffect, useRef } = React;

/* ============================================
   THINKING PANEL VARIANTS
   ============================================ */

// 1) Editorial Timeline — checkmarks + ring, italic accent on current
function ThinkingTimeline({ steps, active }) {
  return (
    <div className="tp tp-timeline">
      <div className="tp-head">
        <span className="tp-eyebrow">Thinking</span>
        <span className="tp-dim mono">gpt-5.4 → claude</span>
      </div>
      <ul className="tp-steps">
        {steps.map((s, i) => (
          <li key={i} className={'tp-step' + (i < active ? ' done' : i === active ? ' active' : '')}>
            <span className="tp-step-mark">
              {i < active ? '✓' : i === active ? <span className="ring"/> : '○'}
            </span>
            <span className="tp-step-text">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 2) Terminal — monospaced log feed
function ThinkingTerminal({ steps, active }) {
  const lines = steps.map((s, i) => ({ s, i }));
  return (
    <div className="tp tp-terminal">
      <div className="tp-term-head">
        <span className="tp-term-dot"/><span className="tp-term-dot d2"/><span className="tp-term-dot d3"/>
        <span className="tp-term-title">comeketo · thinking.log</span>
      </div>
      <div className="tp-term-body">
        {lines.map(({s, i}) => (
          <div key={i} className={'tp-term-line ' + (i < active ? 'done' : i === active ? 'cur' : 'pend')}>
            <span className="ts">{String(i+1).padStart(2,'0')}:{String((i*7)%60).padStart(2,'0')}</span>
            <span className="lvl">{i < active ? 'OK ' : i === active ? '…  ' : '·  '}</span>
            <span className="msg">{s}</span>
            {i === active && <span className="cursor"/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3) Log Stream — vertical rule, hairline rows
function ThinkingLog({ steps, active }) {
  return (
    <div className="tp tp-log">
      <div className="tp-head"><span className="tp-eyebrow">Reasoning trace</span></div>
      <div className="tp-log-rail">
        {steps.map((s, i) => (
          <div key={i} className={'tp-log-row ' + (i < active ? 'done' : i === active ? 'cur' : '')}>
            <span className="tp-log-tick"/>
            <span className="tp-log-time mono">+{(i*0.4).toFixed(1)}s</span>
            <span className="tp-log-msg">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4) Accordion — folded steps that reveal sub-detail
function ThinkingAccordion({ steps, active }) {
  const [open, setOpen] = useState(active);
  const detail = [
    'Pulled context from briefing · 12 files · 3.4k tokens',
    'Compared against last 7 successful runs',
    'Selected route: Close → ClickUp → Slack',
    'Drafted 3 candidate triggers · picked cron',
    'Wrote handler against people.brenda',
    'Verified no cycles in graph',
  ];
  return (
    <div className="tp tp-acc">
      <div className="tp-head"><span className="tp-eyebrow">Plan</span><span className="tp-dim">{steps.length} steps</span></div>
      {steps.map((s, i) => {
        const isOpen = open === i;
        const state = i < active ? 'done' : i === active ? 'cur' : 'pend';
        return (
          <div key={i} className={'tp-acc-item ' + state}>
            <button className="tp-acc-row" onClick={() => setOpen(isOpen ? -1 : i)}>
              <span className="tp-acc-num mono">{String(i+1).padStart(2,'0')}</span>
              <span className="tp-acc-text">{s}</span>
              <span className="tp-acc-state">{state === 'done' ? '✓' : state === 'cur' ? <span className="ring"/> : '○'}</span>
            </button>
            {isOpen && <div className="tp-acc-detail mono">— {detail[i % detail.length]}</div>}
          </div>
        );
      })}
    </div>
  );
}

// 5) Ribbon — horizontal pill chain
function ThinkingRibbon({ steps, active }) {
  return (
    <div className="tp tp-ribbon">
      <div className="tp-head"><span className="tp-eyebrow">Planning ribbon</span></div>
      <div className="tp-ribbon-track">
        {steps.map((s, i) => (
          <div key={i} className={'tp-ribbon-node ' + (i < active ? 'done' : i === active ? 'cur' : '')}>
            <div className="tp-ribbon-dot"/>
            <div className="tp-ribbon-label">{s}</div>
            {i < steps.length - 1 && <div className="tp-ribbon-line"/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 6) Editorial Sidenote — looks like a margin note in a book
function ThinkingMargin({ steps, active }) {
  return (
    <div className="tp tp-margin">
      <div className="tp-margin-rail">
        <span className="tp-margin-label">thinking</span>
      </div>
      <div className="tp-margin-body">
        <p className="tp-margin-quote">
          <em>“Setting up a 7-day pre-tasting cadence for Brenda &amp; Steve. Need a Cron trigger, three Slack pings, and a recap doc. Let me check the existing graph for collisions.”</em>
        </p>
        <ol className="tp-margin-list">
          {steps.map((s, i) => (
            <li key={i} className={i < active ? 'done' : i === active ? 'cur' : ''}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ============================================
   TOOL-USE PANEL VARIANTS
   ============================================ */

// 1) File card — looks like a doc reference
function ToolFileCard() {
  return (
    <div className="tu tu-file">
      <div className="tu-head">
        <span className="tu-eyebrow">Read · briefing/cadences/brenda-steve.md</span>
        <span className="cme-pill tone-running">live</span>
      </div>
      <div className="tu-file-body">
        <div className="tu-file-meta mono">
          <span>14 KB</span><span>·</span><span>updated 2h ago</span><span>·</span><span>v3</span>
        </div>
        <div className="tu-file-excerpt">
          <p><span className="ed-marker">¶</span> Tasting on <em>May 18</em>. Drop two Slack pings to <span className="ed-tag">#crew-brenda</span> at <span className="mono">T-7</span> and <span className="mono">T-3</span>; gmail recap to family at <span className="mono">T+1</span>.</p>
          <p>Skip if proposal status is <span className="ed-tag">BLOCKED</span> or <em>postponed</em>.</p>
        </div>
      </div>
    </div>
  );
}

// 2) Code block — small, tasteful
function ToolCodeBlock() {
  const lines = [
    { n: 1, t: <><span className="kw">trigger</span> <span className="ty">cron</span> {'{'}</> },
    { n: 2, t: <>  <span className="at">when</span>: <span className="str">"0 9 * * 1-5"</span></> },
    { n: 3, t: <>  <span className="at">tz</span>: <span className="str">"America/New_York"</span></> },
    { n: 4, t: <>  <span className="at">skip_if</span>: <span className="fn">status</span>(<span className="str">"BLOCKED"</span>)</> },
    { n: 5, t: <>{'}'}</> },
    { n: 6, t: <></> },
    { n: 7, t: <><span className="kw">handler</span> <span className="fn">brenda_steve_cadence</span>() {'{'}</> },
    { n: 8, t: <>  slack.<span className="fn">post</span>(<span className="str">"#crew-brenda"</span>, brief)</> },
    { n: 9, t: <>{'}'}</> },
  ];
  return (
    <div className="tu tu-code">
      <div className="tu-head">
        <span className="tu-eyebrow">Compose · automation/triggers/brenda_steve.cme</span>
        <span className="cme-pill tone-queued">draft</span>
      </div>
      <pre className="tu-code-body">
        {lines.map(l => (
          <div key={l.n} className="tu-code-line">
            <span className="tu-code-n">{l.n}</span>
            <span className="tu-code-t">{l.t}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

// 3) Diff view
function ToolDiff() {
  return (
    <div className="tu tu-diff">
      <div className="tu-head">
        <span className="tu-eyebrow">Diff · automation/triggers/brenda_steve.cme</span>
        <span className="tu-diff-stats mono"><span className="add">+4</span> <span className="rem">−1</span></span>
      </div>
      <pre className="tu-diff-body">
        <div className="d-line ctx"><span>4</span><span> </span><span>{'  tz: "America/New_York"'}</span></div>
        <div className="d-line rem"><span>5</span><span>−</span><span>{'  skip_if: status("BLOCKED")'}</span></div>
        <div className="d-line add"><span>5</span><span>+</span><span>{'  skip_if: status("BLOCKED") || postponed'}</span></div>
        <div className="d-line add"><span>6</span><span>+</span><span>{'  retry: { max: 2, backoff: "1h" }'}</span></div>
        <div className="d-line add"><span>7</span><span>+</span><span>{'  notify_on_fail: "#ops-rodbot"'}</span></div>
        <div className="d-line add"><span>8</span><span>+</span><span>{'  owner: people.brenda'}</span></div>
        <div className="d-line ctx"><span>9</span><span> </span><span>{'}'}</span></div>
      </pre>
    </div>
  );
}

// 4) Table preview
function ToolTable() {
  const rows = [
    ['08:00', 'AUTO.06', 'Andre morning brief', 'cron', 'lemon'],
    ['09:00', 'Hugo', 'Comms heartbeat', 'cron', 'sage'],
    ['10:30', 'Hugo', 'Plan executor', 'cron', 'sage'],
    ['13:00', 'Brenda & Steve', 'Plan executor', 'cron', 'lavender'],
    ['18:00', 'Brenda & Steve', 'Pre-tasting brief', 'cron', 'lavender'],
  ];
  return (
    <div className="tu tu-table">
      <div className="tu-head">
        <span className="tu-eyebrow">Query · automation.crons (5 of 13)</span>
        <span className="cme-pill tone-done">200 ms</span>
      </div>
      <table className="tu-table-body">
        <thead>
          <tr><th>time</th><th>owner</th><th>job</th><th>type</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono"><span className={'cme-dot ' + r[4]}/> {r[0]}</td>
              <td>{r[1]}</td>
              <td>{r[2]}</td>
              <td className="mono dim">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 5) Citations — inline, editorial
function ToolCitations() {
  return (
    <div className="tu tu-cite">
      <div className="tu-head"><span className="tu-eyebrow">Sources · 4 read</span></div>
      <ol className="tu-cite-list">
        <li><span className="n mono">¹</span><span className="src">briefing/cadences/brenda-steve.md</span><span className="hint">— defines T-7 / T-3 / T+1 cadence</span></li>
        <li><span className="n mono">²</span><span className="src">people/brenda.yml</span><span className="hint">— owner, channels, timezone</span></li>
        <li><span className="n mono">³</span><span className="src">automation/triggers/_index.cme</span><span className="hint">— collision check</span></li>
        <li><span className="n mono">⁴</span><span className="src">close://opp/op_812aF</span><span className="hint">— current proposal status</span></li>
      </ol>
    </div>
  );
}

// 6) Send-automation card — bespoke for "Sending Automation" tool
function ToolSendAutomation({ confirmed = false }) {
  return (
    <div className="tu tu-send">
      <div className="tu-head">
        <span className="tu-eyebrow">Sending automation</span>
        <span className={'cme-pill ' + (confirmed ? 'tone-running' : 'tone-queued')}>{confirmed ? 'queued' : 'awaiting approval'}</span>
      </div>
      <div className="tu-send-body">
        <div className="tu-send-row">
          <span className="k">name</span>
          <span className="v serif italic">Brenda &amp; Steve · 7-day pre-tasting cadence</span>
        </div>
        <div className="tu-send-row">
          <span className="k">trigger</span>
          <span className="v"><span className="cme-pill tone-ink">cron</span> <span className="mono">0 9 * * 1-5</span> · America/New_York</span>
        </div>
        <div className="tu-send-row">
          <span className="k">writes</span>
          <span className="v">
            <span className="cme-chip" style={{cursor:'default'}}>slack #crew-brenda</span>
            <span className="cme-chip" style={{cursor:'default'}}>clickup task</span>
            <span className="cme-chip" style={{cursor:'default'}}>gmail recap</span>
          </span>
        </div>
        <div className="tu-send-row">
          <span className="k">guards</span>
          <span className="v mono dim">skip if status BLOCKED · debounce 1h · retry ×2</span>
        </div>
      </div>
      <div className="tu-send-foot">
        <button className="cme-btn">reject</button>
        <button className="cme-btn">request review</button>
        <button className="cme-btn is-primary">{confirmed ? '✓ sent · 2s ago' : 'approve + send'}</button>
      </div>
    </div>
  );
}

Object.assign(window, {
  ThinkingTimeline, ThinkingTerminal, ThinkingLog, ThinkingAccordion, ThinkingRibbon, ThinkingMargin,
  ToolFileCard, ToolCodeBlock, ToolDiff, ToolTable, ToolCitations, ToolSendAutomation,
});
