/* ═══════════════════════════════════════════
   TradeRisk Dashboard — app.js
   by Shiva Botla
═══════════════════════════════════════════ */

// ─── STATE ───────────────────────────────
let trades  = JSON.parse(localStorage.getItem('tr_trades')  || '[]');
let events  = JSON.parse(localStorage.getItem('tr_events')  || '[]');
let charts  = {};

// ─── NAVIGATION ──────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'dashboard') refreshDashboard();
    if (page === 'risk')      simDD();
  });
});

// ─── TRADE JOURNAL ───────────────────────
function addTrade() {
  const pair  = document.getElementById('f-pair').value.trim().toUpperCase();
  const dir   = document.getElementById('f-dir').value;
  const entry = parseFloat(document.getElementById('f-entry').value);
  const exit  = parseFloat(document.getElementById('f-exit').value);
  const sl    = parseFloat(document.getElementById('f-sl').value);
  const size  = parseFloat(document.getElementById('f-size').value);
  const bal   = parseFloat(document.getElementById('f-bal').value);
  const tag   = document.getElementById('f-tag').value.trim();
  const notes = document.getElementById('f-notes').value.trim();

  if (!pair || isNaN(entry) || isNaN(exit) || isNaN(sl) || isNaN(size)) {
    alert('Please fill in Pair, Entry, Exit, Stop Loss, and Position Size.');
    return;
  }

  const priceDiff   = dir === 'LONG' ? exit - entry : entry - exit;
  const riskPts     = dir === 'LONG' ? entry - sl   : sl - entry;
  const pnl         = priceDiff * size;
  const rr          = riskPts > 0 ? (Math.abs(priceDiff) / riskPts) : 0;
  const riskPct     = bal > 0 ? ((riskPts * size) / bal * 100) : 0;

  const trade = {
    id:      Date.now(),
    date:    new Date().toLocaleDateString('en-IN'),
    pair, dir, entry, exit, sl, size, bal, tag, notes,
    pnl:     parseFloat(pnl.toFixed(2)),
    rr:      parseFloat(rr.toFixed(2)),
    riskPct: parseFloat(riskPct.toFixed(2))
  };

  trades.unshift(trade);
  saveTrades();
  renderTradeTable();
  clearTradeForm();
}

function clearTradeForm() {
  ['f-pair','f-entry','f-exit','f-sl','f-size','f-bal','f-tag','f-notes']
    .forEach(id => { document.getElementById(id).value = ''; });
}

function deleteTrade(id) {
  trades = trades.filter(t => t.id !== id);
  saveTrades();
  renderTradeTable();
}

function saveTrades() { localStorage.setItem('tr_trades', JSON.stringify(trades)); }

function renderTradeTable() {
  const tbody = document.getElementById('trade-tbody');
  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="10">
      <div class="empty-state">
        <div class="empty-icon">📓</div>
        <div>No trades logged yet. Add your first trade above.</div>
      </div></td></tr>`;
    return;
  }
  tbody.innerHTML = trades.map(t => `
    <tr>
      <td>${t.date}</td>
      <td><strong>${t.pair}</strong></td>
      <td class="${t.dir === 'LONG' ? 'dir-long' : 'dir-short'}">${t.dir}</td>
      <td>${t.entry}</td>
      <td>${t.exit}</td>
      <td class="${t.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</td>
      <td>${t.pnl >= 0 ? t.rr.toFixed(2) + 'R' : '-' + t.rr.toFixed(2) + 'R'}</td>
      <td>${t.riskPct.toFixed(2)}%</td>
      <td>${t.tag ? `<span class="tag-pill">${t.tag}</span>` : '<span style="color:var(--text2)">—</span>'}</td>
      <td><button class="btn-danger" onclick="deleteTrade(${t.id})">Del</button></td>
    </tr>
  `).join('');
}

// ─── DASHBOARD / STATS ───────────────────
function calcStats() {
  if (!trades.length) return null;

  const pnls    = trades.map(t => t.pnl).reverse();   // oldest first
  const wins    = trades.filter(t => t.pnl > 0);
  const losses  = trades.filter(t => t.pnl < 0);
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate  = (wins.length / trades.length * 100);
  const avgRR    = trades.reduce((s, t) => s + t.rr, 0) / trades.length;
  const grossW   = wins.reduce((s, t) => s + t.pnl, 0);
  const grossL   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf       = grossL > 0 ? grossW / grossL : grossW > 0 ? 999 : 0;

  // cumulative
  let cumulative = 0;
  const cumArr = pnls.map(p => { cumulative += p; return parseFloat(cumulative.toFixed(2)); });

  // max drawdown
  let peak = -Infinity, maxDD = 0;
  cumArr.forEach(v => {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak * 100) : 0;
    if (dd > maxDD) maxDD = dd;
  });

  // Sharpe estimate (daily pnl std)
  const mean = pnls.reduce((a,b)=>a+b,0)/pnls.length;
  const variance = pnls.reduce((s,p)=>s+Math.pow(p-mean,2),0)/pnls.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : '—';

  // by tag
  const tagMap = {};
  trades.forEach(t => {
    const k = t.tag || 'Untagged';
    tagMap[k] = (tagMap[k] || 0) + t.pnl;
  });

  // by day of week
  const dowMap = {Mon:0,Tue:0,Wed:0,Thu:0,Fri:0};
  trades.forEach(t => {
    const parts = t.date.split('/');
    if (parts.length >= 3) {
      const d = new Date(parts[2], parts[1]-1, parts[0]);
      const key = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      if (dowMap[key] !== undefined) dowMap[key] += t.pnl;
    }
  });

  return { totalPnL, winRate, avgRR, maxDD, pf, sharpe, cumArr, tagMap, dowMap,
           dates: trades.map(t=>t.date).reverse() };
}

function refreshDashboard() {
  const s = calcStats();
  if (!s) {
    document.getElementById('sv-pnl').textContent = '$0.00';
    document.getElementById('sv-wr').textContent  = '0%';
    document.getElementById('sv-rr').textContent  = '0.00';
    document.getElementById('sv-dd').textContent  = '0%';
    document.getElementById('sv-pf').textContent  = '0.00';
    document.getElementById('sv-sh').textContent  = '0.00';
    return;
  }

  const pnlEl = document.getElementById('sv-pnl');
  pnlEl.textContent = (s.totalPnL >= 0 ? '+' : '') + '$' + s.totalPnL.toFixed(2);
  pnlEl.style.color = s.totalPnL >= 0 ? 'var(--green)' : 'var(--red)';

  const wrEl = document.getElementById('sv-wr');
  wrEl.textContent = s.winRate.toFixed(1) + '%';
  wrEl.style.color = s.winRate >= 50 ? 'var(--green)' : 'var(--red)';

  document.getElementById('sv-rr').textContent = s.avgRR.toFixed(2);
  document.getElementById('sv-dd').textContent = s.maxDD.toFixed(1) + '%';
  document.getElementById('sv-pf').textContent = typeof s.pf === 'number' ? s.pf.toFixed(2) : s.pf;
  document.getElementById('sv-sh').textContent = s.sharpe;

  renderPnLChart(s);
  renderTagChart(s);
  renderDowChart(s);
}

const CHART_DEFAULTS = {
  plugins: { legend: { labels: { color: '#607080', font: { family: 'Space Mono', size: 11 } } } },
  scales:  {
    x: { ticks: { color: '#607080', font: { family: 'Space Mono', size: 10 } }, grid: { color: '#1e2a38' } },
    y: { ticks: { color: '#607080', font: { family: 'Space Mono', size: 10 } }, grid: { color: '#1e2a38' } }
  }
};

function renderPnLChart(s) {
  if (charts.pnl) charts.pnl.destroy();
  const ctx = document.getElementById('pnl-chart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(0,229,160,0.3)');
  grad.addColorStop(1, 'rgba(0,229,160,0)');
  charts.pnl = new Chart(ctx, {
    type: 'line',
    data: {
      labels: s.dates,
      datasets: [{
        label: 'Cumulative P&L ($)',
        data: s.cumArr,
        borderColor: '#00e5a0',
        borderWidth: 2,
        pointRadius: s.cumArr.length < 30 ? 4 : 0,
        pointBackgroundColor: '#00e5a0',
        fill: true,
        backgroundColor: grad,
        tension: 0.35
      }]
    },
    options: { ...CHART_DEFAULTS, responsive: true, plugins: { ...CHART_DEFAULTS.plugins } }
  });
}

function renderTagChart(s) {
  if (charts.tag) charts.tag.destroy();
  const ctx = document.getElementById('tag-chart').getContext('2d');
  const labels = Object.keys(s.tagMap);
  const data   = Object.values(s.tagMap);
  charts.tag = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'P&L by Setup',
        data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(0,229,160,0.7)' : 'rgba(255,69,96,0.7)'),
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: { ...CHART_DEFAULTS, responsive: true, indexAxis: 'y' }
  });
}

function renderDowChart(s) {
  if (charts.dow) charts.dow.destroy();
  const ctx = document.getElementById('dow-chart').getContext('2d');
  const labels = Object.keys(s.dowMap);
  const data   = Object.values(s.dowMap);
  charts.dow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'P&L by Day',
        data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(0,184,217,0.7)' : 'rgba(255,107,53,0.7)'),
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: { ...CHART_DEFAULTS, responsive: true }
  });
}

// ─── RISK CALCULATOR ─────────────────────
function calcRisk() {
  const bal     = parseFloat(document.getElementById('rc-bal').value);
  const riskPct = parseFloat(document.getElementById('rc-riskpct').value);
  const entry   = parseFloat(document.getElementById('rc-entry').value);
  const sl      = parseFloat(document.getElementById('rc-sl').value);
  const pv      = parseFloat(document.getElementById('rc-pv').value) || 1;

  if (isNaN(bal) || isNaN(riskPct) || isNaN(entry) || isNaN(sl)) return;

  const dollar   = bal * (riskPct / 100);
  const dist     = Math.abs(entry - sl);
  const units    = dist > 0 ? dollar / (dist * pv) : 0;

  document.getElementById('rr-dollar').textContent = '$' + dollar.toFixed(2);
  document.getElementById('rr-dist').textContent   = dist.toFixed(5);
  document.getElementById('rr-units').textContent  = units.toFixed(2);
  document.getElementById('rr-lots').textContent   = (units / 100000).toFixed(4);
}

function calcRR() {
  const entry = parseFloat(document.getElementById('rr-entry').value);
  const sl    = parseFloat(document.getElementById('rr-sl').value);
  const ratio = parseFloat(document.getElementById('rr-ratio').value) || 2;
  const dir   = document.getElementById('rr-dir').value;

  if (isNaN(entry) || isNaN(sl)) return;

  const riskPts = Math.abs(entry - sl);
  const rwdPts  = riskPts * ratio;
  const tp      = dir === 'LONG' ? entry + rwdPts : entry - rwdPts;
  const minWR   = (1 / (1 + ratio) * 100);

  document.getElementById('rr-riskpts').textContent = riskPts.toFixed(5);
  document.getElementById('rr-tp').textContent      = tp.toFixed(5);
  document.getElementById('rr-rwdpts').textContent  = rwdPts.toFixed(5);
  document.getElementById('rr-minwr').textContent   = minWR.toFixed(1) + '%';
}

function simDD() {
  const cap    = parseFloat(document.getElementById('dd-cap').value) || 10000;
  const risk   = parseFloat(document.getElementById('dd-risk').value) || 1;
  const streak = parseInt(document.getElementById('dd-streak').value) || 10;

  const container = document.getElementById('dd-bars');
  container.innerHTML = '';

  let current = cap;
  for (let i = 1; i <= streak; i++) {
    const lost   = current * (risk / 100);
    current     -= lost;
    const pct    = ((cap - current) / cap * 100);
    const fillW  = Math.min(pct, 100);
    const hue    = Math.max(0, 120 - pct * 1.2);  // green → red

    container.innerHTML += `
      <div class="dd-bar-row">
        <div class="dd-bar-label">L${i}</div>
        <div class="dd-bar-track">
          <div class="dd-bar-fill" style="width:${fillW}%;background:hsl(${hue},80%,50%)">
            ${fillW > 12 ? '$' + current.toFixed(0) : ''}
          </div>
        </div>
        <div style="width:70px;font-size:0.72rem;color:var(--red)">-${pct.toFixed(1)}%</div>
      </div>`;
  }

  const finalDD = ((cap - current) / cap * 100);
  const needed  = (1 / (1 - finalDD / 100) - 1) * 100;
  document.getElementById('dd-summary').innerHTML =
    `After <strong>${streak} consecutive losses</strong> at <strong>${risk}% risk each</strong>:<br>
     Account: <strong>$${cap.toFixed(0)}</strong> → <strong>$${current.toFixed(2)}</strong><br>
     Total Drawdown: <strong>${finalDD.toFixed(2)}%</strong><br>
     You need a <strong>${needed.toFixed(1)}% gain</strong> just to break even.<br>
     <br><em>This is why position sizing and risk discipline are everything.</em>`;
}

// ─── MACRO EVENTS ────────────────────────
const MACRO_EVENTS = [
  { name: 'CPI',    freq: 'Monthly',   impact: 'high',   markets: 'Forex, Gold, Bonds, Equities' },
  { name: 'NFP',    freq: 'Monthly',   impact: 'high',   markets: 'USD pairs, Gold, Indices' },
  { name: 'FOMC',   freq: '8x/year',   impact: 'high',   markets: 'All markets' },
  { name: 'PPI',    freq: 'Monthly',   impact: 'medium', markets: 'Forex, Bonds' },
  { name: 'GDP',    freq: 'Quarterly', impact: 'high',   markets: 'Equities, Forex' },
  { name: 'PCE',    freq: 'Monthly',   impact: 'medium', markets: 'USD, Bonds' },
  { name: 'JOLTS',  freq: 'Monthly',   impact: 'medium', markets: 'USD pairs' },
  { name: 'Jobless Claims', freq: 'Weekly', impact: 'medium', markets: 'USD, Indices' },
  { name: 'ISM Mfg', freq: 'Monthly',  impact: 'medium', markets: 'USD, Commodities' },
  { name: 'Retail Sales', freq: 'Monthly', impact: 'medium', markets: 'USD, Equities' },
  { name: 'BoE Decision', freq: '8x/year', impact: 'high', markets: 'GBP pairs, Gilts' },
  { name: 'ECB Decision', freq: '8x/year', impact: 'high', markets: 'EUR pairs, Euro bonds' },
];

function renderMacroGrid() {
  document.getElementById('macro-grid').innerHTML = MACRO_EVENTS.map(e => `
    <div class="macro-card">
      <div class="macro-card-name">${e.name}</div>
      <div class="macro-card-freq">${e.freq}</div>
      <span class="macro-impact impact-${e.impact}">${e.impact.toUpperCase()}</span>
      <div style="font-size:0.68rem;color:var(--text3);margin-top:0.5rem">${e.markets}</div>
    </div>
  `).join('');
}

function addEvent() {
  const name   = document.getElementById('ev-name').value.trim();
  const date   = document.getElementById('ev-date').value;
  const vol    = document.getElementById('ev-vol').value;
  const bias   = document.getElementById('ev-bias').value;
  const plan   = document.getElementById('ev-plan').value.trim();
  const review = document.getElementById('ev-review').value.trim();

  if (!name || !date) { alert('Please fill in Event and Date.'); return; }

  events.unshift({ id: Date.now(), name, date, vol, bias, plan, review });
  localStorage.setItem('tr_events', JSON.stringify(events));
  renderEvents();

  ['ev-name','ev-date','ev-plan','ev-review'].forEach(id => { document.getElementById(id).value = ''; });
}

function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  localStorage.setItem('tr_events', JSON.stringify(events));
  renderEvents();
}

function renderEvents() {
  const el = document.getElementById('events-list');
  if (!events.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div>No event plans yet.</div></div>';
    return;
  }
  el.innerHTML = events.map(e => `
    <div class="event-item">
      <div class="event-item-header">
        <span class="event-item-name">${e.name}</span>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <span class="event-item-date">${e.date}</span>
          <span class="tag-pill">${e.bias}</span>
          <span class="macro-impact impact-${e.vol === 'High' || e.vol === 'Extreme' ? 'high' : e.vol === 'Medium' ? 'medium' : 'low'}">${e.vol}</span>
          <button class="btn-danger" onclick="deleteEvent(${e.id})">Del</button>
        </div>
      </div>
      ${e.plan   ? `<div class="event-plan-label">PRE-EVENT PLAN</div><div class="event-plan-text">${e.plan}</div>` : ''}
      ${e.review ? `<div class="event-plan-label" style="margin-top:0.6rem;color:var(--accent)">POST-EVENT REVIEW</div><div class="event-plan-text">${e.review}</div>` : ''}
    </div>
  `).join('');
}

// ─── INIT ─────────────────────────────────
renderTradeTable();
renderMacroGrid();
renderEvents();
calcRisk();
calcRR();
simDD();
