/* global React, useTweaks, TweaksPanel, TweakSection, TweakSelect, TweakToggle, TweakRadio, TweakSlider */
const { useState: uS, useRef: uR, useEffect: uE, useMemo: uM } = React;

/* ====================================================================
   Workflow graph — n8n/Langgraph aesthetic, cream paper, edge labels
   sit OUTSIDE the nodes. Six node shapes, orthogonal routing.
   ==================================================================== */

/* ---- Node primitives ----
   shape: 'diamond' (trigger), 'hex' (transform), 'circle' (action),
          'square' (output), 'pill' (sub-agent), 'doc' (artifact)
   tone: 'lilac' | 'sage' | 'sand' | 'rose' | 'ink' | 'paper'
*/

function Node({ x, y, w = 132, h = 56, shape, tone = 'paper', label, sub, status, dim, selected, onClick }) {
  const cx = x + w/2;
  const cy = y + h/2;
  const fill = {
    lilac: 'var(--lilac)', sage: 'var(--sage)', sand: 'var(--sand)',
    rose: 'var(--rose)', ink: 'var(--ink)', paper: 'var(--card)'
  }[tone];
  const stroke = tone === 'ink' ? 'var(--ink)' : 'var(--ink)';
  const strokeOpacity = dim ? 0.25 : 1;
  const fillOp = dim ? 0.4 : 1;
  const textColor = tone === 'ink' ? 'var(--paper)' : 'var(--ink)';

  let shapeEl;
  if (shape === 'diamond') {
    const d = `M ${cx} ${y} L ${x+w} ${cy} L ${cx} ${y+h} L ${x} ${cy} Z`;
    shapeEl = <path d={d}/>;
  } else if (shape === 'hex') {
    const inset = 14;
    const d = `M ${x+inset} ${y} L ${x+w-inset} ${y} L ${x+w} ${cy} L ${x+w-inset} ${y+h} L ${x+inset} ${y+h} L ${x} ${cy} Z`;
    shapeEl = <path d={d}/>;
  } else if (shape === 'circle') {
    shapeEl = <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2}/>;
  } else if (shape === 'square') {
    shapeEl = <rect x={x} y={y} width={w} height={h} rx="3"/>;
  } else if (shape === 'pill') {
    shapeEl = <rect x={x} y={y} width={w} height={h} rx={h/2}/>;
  } else if (shape === 'doc') {
    shapeEl = <rect x={x} y={y} width={w} height={h} rx="2"/>;
  }

  return (
    <g className={'gn' + (selected ? ' is-sel' : '') + (dim ? ' is-dim' : '')} onClick={onClick} style={{cursor:'pointer'}}>
      <g fill={fill} fillOpacity={fillOp} stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth="1.25">
        {shapeEl}
      </g>
      {status && (
        <circle cx={x + 10} cy={y + 10} r="3"
          fill={status === 'active' ? 'var(--sage-deep)' : status === 'queued' ? '#9F95C4' : 'var(--ink-faint)'}/>
      )}
      <text x={cx} y={cy + (sub ? -2 : 4)} textAnchor="middle"
            fill={textColor} fillOpacity={dim ? 0.4 : 1}
            style={{font: "italic 12.5px var(--serif)", letterSpacing: '0.005em'}}>
        {label}
      </text>
      {sub && (
        <text x={cx} y={cy + 11} textAnchor="middle"
              fill={textColor} fillOpacity={dim ? 0.3 : 0.55}
              style={{font: "9.5px var(--mono)", letterSpacing: '0.06em', textTransform:'uppercase'}}>
          {sub}
        </text>
      )}
    </g>
  );
}

/* Edge — orthogonal path with label floating along it */
function Edge({ from, to, label, kind = 'solid', dim, labelPos = 0.5, labelOffset = -10, labelAnchor = 'middle', bend = 'h-first' }) {
  // from/to: { x, y } in graph coords (edge anchor on node)
  let d;
  let mid;
  if (Math.abs(from.y - to.y) < 1) {
    d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    mid = { x: from.x + (to.x - from.x) * labelPos, y: from.y };
  } else if (Math.abs(from.x - to.x) < 1) {
    d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    mid = { x: from.x, y: from.y + (to.y - from.y) * labelPos };
  } else if (bend === 'h-first') {
    const midX = from.x + (to.x - from.x) * 0.5;
    d = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    mid = { x: midX, y: (from.y + to.y) / 2 - 4 };
  } else {
    const midY = from.y + (to.y - from.y) * 0.5;
    d = `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
    mid = { x: (from.x + to.x) / 2, y: midY - 4 };
  }

  const dasharray = kind === 'dashed' ? '4,3' : kind === 'dotted' ? '1.5,3' : null;
  const op = dim ? 0.2 : 0.65;

  return (
    <g className="ge">
      <path d={d} fill="none" stroke="var(--ink)" strokeOpacity={op} strokeWidth="1"
            strokeDasharray={dasharray} strokeLinecap="round" strokeLinejoin="round"/>
      {label && (
        <g>
          <rect x={mid.x - (label.length * 3.2)} y={mid.y + labelOffset - 6} width={label.length * 6.4} height={11}
                fill="var(--paper)" fillOpacity={dim ? 0.4 : 0.95}/>
          <text x={mid.x} y={mid.y + labelOffset + 2.5} textAnchor={labelAnchor}
                fill="var(--ink-mid)" fillOpacity={dim ? 0.4 : 1}
                style={{font: "italic 10.5px var(--serif)"}}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/* ====================== GRAPH DATA — Brenda & Steve cadence ====================== */

const NODES = [
  // col 0 — triggers (diamonds, lilac)
  { id:'kickoff',   x:60,  y:60,  w:120, h:50, shape:'diamond', tone:'lilac', label:'kickoff', sub:'rule' },
  { id:'tasting',   x:60,  y:170, w:120, h:50, shape:'diamond', tone:'lilac', label:'t-9 cron', sub:'cron' },
  { id:'minus2',    x:60,  y:280, w:120, h:50, shape:'diamond', tone:'lilac', label:'May 2 hrs', sub:'time' },
  { id:'on_block',  x:60,  y:390, w:120, h:50, shape:'diamond', tone:'lilac', label:'on BLOCK', sub:'rule' },

  // col 1 — readers (circles)
  { id:'read_state',x:240, y:65,  w:120, h:40, shape:'circle', tone:'paper', label:'state.read', sub:null },
  { id:'pull_prev', x:240, y:175, w:120, h:40, shape:'circle', tone:'paper', label:'history.pull', sub:null },
  { id:'tx_prev',   x:240, y:285, w:120, h:40, shape:'circle', tone:'paper', label:'tx.prev', sub:null, dim:true },

  // col 2 — transforms (hex, sage)
  { id:'plan_day',  x:420, y:50,  w:130, h:50, shape:'hex', tone:'sage', label:'compose.plan', sub:'llm' },
  { id:'classify',  x:420, y:170, w:130, h:50, shape:'hex', tone:'sage', label:'classify.req', sub:'llm' },

  // col 3 — guards (hex, sand)
  { id:'pause',     x:600, y:50,  w:120, h:50, shape:'hex', tone:'sand', label:'guard.pause', sub:null },
  { id:'localize',  x:600, y:170, w:120, h:50, shape:'hex', tone:'sand', label:'localize', sub:null },

  // col 4 — fan-out (hex, sand)
  { id:'inbound',   x:760, y:50,  w:130, h:50, shape:'hex', tone:'sand', label:'inbound.fmt', sub:null },
  { id:'draft',     x:760, y:170, w:130, h:50, shape:'hex', tone:'sage', label:'draft.compose', sub:'llm' },

  // col 5 — day cohort (circles, sage)
  { id:'d1am', x:940, y:30,  w:110, h:40, shape:'circle', tone:'sage', label:'day 1 — am', sub:null },
  { id:'d1pm', x:940, y:90,  w:110, h:40, shape:'circle', tone:'sage', label:'day 1 — pm', sub:null },
  { id:'d4am', x:940, y:170, w:110, h:40, shape:'circle', tone:'sage', label:'day 4 — am', sub:null },
  { id:'d4pm', x:940, y:230, w:110, h:40, shape:'circle', tone:'sage', label:'day 4 — pm', sub:null },

  // col 6 — receipts
  { id:'r1', x:1110, y:30,  w:110, h:40, shape:'circle', tone:'paper', label:'receipt 1', sub:null },
  { id:'r2', x:1110, y:90,  w:110, h:40, shape:'circle', tone:'paper', label:'receipt 2', sub:null },
  { id:'r3', x:1110, y:170, w:110, h:40, shape:'circle', tone:'paper', label:'receipt 3', sub:null },
  { id:'race',x:1110, y:230, w:110, h:40, shape:'circle', tone:'sand', label:'black race', sub:null },

  // col 7 — outputs
  { id:'ledger', x:1290, y:80,  w:140, h:46, shape:'doc',  tone:'paper', label:'ledger.txt', sub:'append' },
  { id:'status', x:1290, y:175, w:140, h:46, shape:'doc',  tone:'rose',  label:'status/today', sub:'render' },
  { id:'mc',     x:1290, y:240, w:140, h:46, shape:'doc',  tone:'rose',  label:'mission-control', sub:'render' },

  // sub-agents (pills, ink)
  { id:'rodbot', x:520, y:330, w:120, h:36, shape:'pill', tone:'ink', label:'rodbot', sub:null, status:'active' },
  { id:'black',  x:760, y:330, w:120, h:36, shape:'pill', tone:'ink', label:'black-DM', sub:null },

  // doc inputs
  { id:'people_b', x:340, y:430, w:120, h:36, shape:'doc', tone:'paper', label:'people/brenda', sub:null },
  { id:'people_s', x:475, y:430, w:120, h:36, shape:'doc', tone:'paper', label:'people/steve', sub:null },
];

const EDGES = [
  { from:'kickoff',   to:'read_state', label:'read state' },
  { from:'tasting',   to:'pull_prev',  label:'pull prev' },
  { from:'minus2',    to:'tx_prev',    label:'fast path', kind:'dashed', dim:true },
  { from:'on_block',  to:'classify',   label:'on block', kind:'dashed', bend:'v-first' },

  { from:'read_state',to:'plan_day',   label:'plan day' },
  { from:'pull_prev', to:'classify',   label:'classify req' },
  { from:'tx_prev',   to:'classify',   label:'localize?', kind:'dashed', dim:true },

  { from:'plan_day',  to:'pause',      label:'+ pause check' },
  { from:'classify',  to:'localize',   label:'localize' },

  { from:'pause',     to:'inbound',    label:'no block' },
  { from:'localize',  to:'draft',      label:'draft compose' },

  { from:'inbound',   to:'d1am',       label:'+5 min email' },
  { from:'inbound',   to:'d1pm',       label:'day 1 — pm' },
  { from:'draft',     to:'d4am',       label:'day 4 — am' },
  { from:'draft',     to:'d4pm',       label:'day 4 — pm' },

  { from:'d1am', to:'r1', label:'receipt 1' },
  { from:'d1pm', to:'r2', label:'receipt 2' },
  { from:'d4am', to:'r3', label:'receipt 3' },
  { from:'d4pm', to:'race', label:'black race' },

  { from:'r1',   to:'ledger', label:'append' },
  { from:'r3',   to:'status', label:'append', kind:'dashed' },
  { from:'race', to:'mc',     label:'mission' },

  { from:'plan_day', to:'rodbot',  label:'voice', kind:'dashed', bend:'v-first', dim:true },
  { from:'rodbot',   to:'black',   label:'consult', kind:'dashed' },
  { from:'black',    to:'draft',   label:'context', kind:'dashed', bend:'v-first' },

  { from:'people_b', to:'classify', label:'context', kind:'dotted', bend:'v-first', dim:true },
  { from:'people_s', to:'classify', label:'', kind:'dotted', bend:'v-first', dim:true },
];

/* helper: pick edge anchor point on node side */
function nodeById(id) { return NODES.find(n => n.id === id); }
function edgePoint(node, side) {
  if (side === 'r') return { x: node.x + node.w, y: node.y + node.h/2 };
  if (side === 'l') return { x: node.x,           y: node.y + node.h/2 };
  if (side === 't') return { x: node.x + node.w/2, y: node.y };
  if (side === 'b') return { x: node.x + node.w/2, y: node.y + node.h };
  return { x: node.x + node.w/2, y: node.y + node.h/2 };
}

function autoSide(from, to) {
  // pick output side of from based on relative position of to
  if (to.x >= from.x + from.w) return ['r','l'];
  if (to.x + to.w <= from.x)   return ['l','r'];
  if (to.y >= from.y + from.h) return ['b','t'];
  return ['t','b'];
}

/* ====================== APP ====================== */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tab": "workflows",
  "showInspector": true,
  "showLibrary": true,
  "zoom": 73,
  "edgeLabels": true,
  "nodeStyle": "soft",
  "showMinimap": true,
  "background": "dots"
}/*EDITMODE-END*/;

const TABS = ['Workflows','Sub-agents','State','Hooks','Triggers'];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [sel, setSel] = uS('plan_day');

  // edges resolved with anchor sides
  const resolvedEdges = uM(() => EDGES.map(e => {
    const f = nodeById(e.from); const t = nodeById(e.to);
    const [sf, st] = autoSide(f, t);
    return { ...e, fromPt: edgePoint(f, sf), toPt: edgePoint(t, st) };
  }), []);

  // graph bounds
  const W = 1480, H = 510;
  const scale = tweaks.zoom / 100;

  return (
    <div className={'auto-shell ns-' + tweaks.nodeStyle + ' bg-' + tweaks.background}>
      {/* Top header */}
      <header className="auto-top">
        <a className="cme-wordmark">Comeketo <em>Agent</em><span className="dot">.</span></a>
        <nav className="auto-nav">
          <a>proposals</a><a>personal</a><a>briefing</a>
          <span className="auto-sep">·</span>
          <a>people <span className="caret">⌄</span></a>
          <a>activity</a>
          <a>intake</a>
          <a>analytics</a>
          <a>boxes</a>
          <a className="active">automation</a>
          <a>delegations</a>
        </nav>
      </header>

      {/* Tab strip */}
      <div className="auto-tabs">
        {TABS.map(t => (
          <button key={t}
            className={'auto-tab ' + (tweaks.tab === t.toLowerCase() ? 'active' : '')}
            onClick={() => setTweak('tab', t.toLowerCase())}>{t}</button>
        ))}
        <span className="auto-tabs-spacer"/>
        <span className="auto-breadcrumb mono">automation</span>
      </div>

      {/* Workflow titlebar */}
      <div className="auto-wf-bar">
        <div className="auto-wf-title">
          <span>Brenda &amp; Steve Catalaro <span className="auto-em">— 7-day pre-tasting cadence</span></span>
          <span className="auto-ver mono">v1</span>
        </div>
        <div className="auto-wf-right">
          <span className="auto-runner mono"><span className="dot-active"/> Rodbot</span>
        </div>
      </div>

      {/* Canvas + side strips */}
      <div className="auto-canvas-wrap">
        {tweaks.showLibrary && (
          <div className="auto-strip auto-library">
            <div className="auto-strip-label">LIBRARY</div>
          </div>
        )}

        <div className="auto-canvas">
          <svg className="auto-svg"
               viewBox={`0 0 ${W} ${H}`}
               preserveAspectRatio="xMidYMid meet"
               style={{transform: `scale(${scale})`, transformOrigin: 'top left'}}>
            {/* Edges first */}
            {resolvedEdges.map((e, i) => (
              <Edge key={i} from={e.fromPt} to={e.toPt}
                    label={tweaks.edgeLabels ? e.label : ''}
                    kind={e.kind || 'solid'}
                    bend={e.bend || 'h-first'}
                    dim={e.dim}/>
            ))}
            {/* Nodes */}
            {NODES.map(n => (
              <Node key={n.id} {...n}
                    selected={sel === n.id}
                    onClick={() => setSel(n.id)}/>
            ))}
          </svg>
        </div>

        {tweaks.showInspector && (
          <div className="auto-strip auto-inspector">
            <div className="auto-strip-label">INSPECTOR</div>
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div className="auto-controls">
        <div className="auto-controls-l">
          <button className="auto-ctl-btn">▶</button>
          <span className="mono auto-ctl-tag">1×</span>
          <button className="auto-ctl-icon">↻</button>
          <span className="mono auto-ctl-tag">AUTO</span>
        </div>
        <div className="auto-controls-r">
          <button className="auto-ctl-icon" onClick={() => setTweak('zoom', Math.max(25, tweaks.zoom - 10))}>−</button>
          <span className="mono auto-ctl-zoom">{tweaks.zoom}%</span>
          <button className="auto-ctl-icon" onClick={() => setTweak('zoom', Math.min(150, tweaks.zoom + 10))}>+</button>
          <span className="auto-ctl-sep"/>
          <button className="auto-ctl-icon">1:1</button>
          <button className="auto-ctl-icon">⌖</button>
        </div>
      </div>

      {/* Footer */}
      <footer className="auto-footer">
        <div className="auto-bc">
          <span>grid · morning</span><span className="sep">/</span>
          <span>boxes</span><span className="sep">/...</span>
          <span className="sep">/</span>
          <span>briefing</span><span className="sep">/</span>
          <span>delegations</span><span className="sep">/</span>
          <span className="active">automation</span>
        </div>
        <div className="auto-bc-r mono"><span>proposals</span><span>personal</span><span>Comeketo Agent</span></div>
      </footer>

      <TweaksPanel title="Tweaks · automation">
        <TweakSection title="View">
          <TweakRadio label="Tab" value={tweaks.tab} onChange={v => setTweak('tab', v)}
            options={TABS.map(t => ({value:t.toLowerCase(), label:t}))}/>
          <TweakSlider label="Zoom" min={40} max={120} step={1} value={tweaks.zoom} onChange={v => setTweak('zoom', v)}/>
        </TweakSection>
        <TweakSection title="Strips">
          <TweakToggle label="Library (left)" value={tweaks.showLibrary} onChange={v => setTweak('showLibrary', v)}/>
          <TweakToggle label="Inspector (right)" value={tweaks.showInspector} onChange={v => setTweak('showInspector', v)}/>
        </TweakSection>
        <TweakSection title="Graph">
          <TweakToggle label="Edge labels" value={tweaks.edgeLabels} onChange={v => setTweak('edgeLabels', v)}/>
          <TweakRadio label="Node style" value={tweaks.nodeStyle} onChange={v => setTweak('nodeStyle', v)}
            options={[{value:'soft', label:'Soft'},{value:'sharp', label:'Sharp'},{value:'paper', label:'Mono'}]}/>
          <TweakRadio label="Background" value={tweaks.background} onChange={v => setTweak('background', v)}
            options={[{value:'dots', label:'Dots'},{value:'grid', label:'Grid'},{value:'plain', label:'Plain'}]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
