/* =============================================================================
 * Divz — Dashboard page
 * -----------------------------------------------------------------------------
 * Loaded as a classic <script> AFTER app.js, so (the same way sync.js / alerts.js do) it
 * shares app.js's top-level scope: T, ALL_TRANSACTIONS, HOLDINGS, FX, SETTINGS, t(), esc(),
 * fmt(), money(), render(), toast() ... app.js's router calls pageDashboard() lazily, so
 * defining it here is all the registration it needs. Every top-level name here starts with
 * "dz"/"DZ_" so it can never collide with a name in app.js.
 *
 * Two jobs:
 *  1. The page itself — greeting, net-worth card, "at a glance", the chart, allocation,
 *     holdings, upcoming dividends, portfolio health, recent activity.
 *  2. "Net worth over time". The old chart only had one point per visit to the app, so it
 *     was a flat line for weeks. This one REBUILDS the past: it replays the user's own
 *     transactions through the app's own computeTotals() (the same maths that produces
 *     today's numbers, so the two can never disagree) against real daily closing prices from
 *     /api/history, one sample per trading day lately and every third day further back.
 *     The finished series is cached in localStorage (it is derived data — never part of a
 *     backup or the cloud copy) and rebuilt at most once a day, or whenever a transaction
 *     changes. Today's point is always the live number, never a cached one.
 * ========================================================================== */
"use strict";

/* ---------- Chinese strings for this page ----------
 * Only keys the main dictionary doesn't already have are added, so nothing existing is overridden. */
const DZ_ZH = {
  "Good morning": "早上好", "Good afternoon": "下午好", "Good evening": "晚上好",
  "Here is how your investments are doing today.": "这是您今天的投资概况。",
  "Live prices": "实时价格", "Prices from": "价格来自", "Prices set manually": "价格为手动设置",
  "Refresh prices": "刷新价格", "Updating prices…": "正在更新价格…",
  "Net worth": "净资产",
  "Holdings plus cash across all your brokers. Tap the card to see how it's added up.": "所有券商的持仓加现金。点按卡片查看计算方式。",
  "Total return since {date}": "自 {date} 起的总收益",
  "Unrealized profit or loss": "未实现盈亏",
  "on money invested": "占已投入本金",
  "Money invested": "已投入本金",
  "Deposits minus withdrawals": "存款减去取款",
  "Dividends this year": "今年的股息",
  "{n} expected in 12 months": "未来12个月预计 {n}",
  "Cash available": "可用现金",
  "{pct} of your net worth": "占净资产的 {pct}",
  "Net worth over time": "净资产变化",
  "Time range": "时间范围", "Gain": "收益",
  "Building your history…": "正在生成历史走势…",
  "Price history wasn't available for {list}. Their cost is used for earlier dates.": "{list} 暂无历史价格，较早日期按成本计算。",
  "Showing the values saved each time you opened Divz. Go online once to build the full history.": "显示的是每次打开 Divz 时保存的数值。联网一次即可生成完整历史。",
  "Not enough history yet — the chart appears once you have records on two different days.": "历史记录不足 — 有两天以上的记录后将显示图表。",
  "Currency": "货币", "Type": "类型", "Other ({n})": "其他（{n}）",
  "{n} positions": "{n} 个持仓", "{n} position": "{n} 个持仓",
  "Price": "价格", "Value": "价值", "Return": "收益", "per share": "每股",
  "unrealized": "未实现", "total": "合计", "shares": "股", "no price": "无价格",
  "next 12 months": "未来12个月", "Estimated total": "预估合计", "Expected total": "预期合计", "EST.": "预估",
  "Ex-date ≈ {ex} · pays {pay}": "除息日约 {ex} · 派息 {pay}",
  "Ex-date {ex} · pays {pay}": "除息日 {ex} · 派息 {pay}",
  "+{n} more": "还有 {n} 笔",
  "{amt} paid to you in the last 12 months, as a share of your holdings.": "过去12个月向您派发 {amt}，占持仓市值的比例。",
  "Part of your net worth sitting as cash instead of invested.": "净资产中以现金形式闲置、未投资的部分。",
  "About {n} equal-sized stocks, so your portfolio rests on very few.": "相当于约 {n} 只等权重的股票，投资组合只依赖很少的几只。",
  "About {n} equal-sized stocks — fairly concentrated.": "相当于约 {n} 只等权重的股票 — 较为集中。",
  "About {n} equal-sized stocks — reasonably spread.": "相当于约 {n} 只等权重的股票 — 分布较均衡。",
  "About {n} equal-sized stocks — well spread.": "相当于约 {n} 只等权重的股票 — 分布广泛。",
  "Yearly return that accounts for when you added or withdrew money.": "考虑了您存入或取出资金时间的年化回报。",
  "Annual return (XIRR)": "年化回报（XIRR）",
  "latest first": "最新在前", "All transactions": "全部交易",
  "Bought": "买入", "Sold": "卖出", "Dividend reinvested": "股息再投资",
  "Net worth, holdings and cash": "净资产、持仓与现金",
  "Money invested includes the {n} you already held when you started recording.": "已投入本金包含您开始记录前已持有的 {n}。",
  "Gain here is net worth minus money invested. Total return is worked out from your trades, dividends and fees, so the two can differ slightly (by {n} now).": "此处的收益 = 净资产 − 已投入本金。总收益由交易、股息和费用计算得出，两者可能略有差异（目前相差 {n}）。",
};
Object.keys(DZ_ZH).forEach((k) => { if (!(k in I18N.zh)) I18N.zh[k] = DZ_ZH[k]; });
/* Label that follows the main dictionary's Title-Case wording in Chinese (so the new page speaks the same
 * words as the rest of the app) and the friendlier sentence case in English. */
const dzL = (en, titleKey) => (LANG === "zh" && titleKey ? t(titleKey) : t(en));
/* t() for a sentence with {placeholders}. */
const dzF = (key, vars) => { let s = t(key); Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); }); return s; };

/* ---------- icons ---------- */
const DZ_ICONS = {
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};
const dzIcon = (name, size = 18) => `<svg class="icon dz-ic" style="width:${size}px;height:${size}px" viewBox="0 0 24 24" aria-hidden="true">${DZ_ICONS[name]}</svg>`;
/* An icon from the sprite in index.html (i-buy, i-deposit, ...). */
const dzSprite = (id, size = 20) => `<svg class="icon dz-ic" style="width:${size}px;height:${size}px" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/* =============================================================================
 * 1. HISTORY ENGINE — rebuild "what was it worth on each past day"
 * ========================================================================== */
const DZ_HIST_KEY = "il-hist-v1";
const DZ_HIST_VERSION = 1;
const DZ_HIST = { cache: undefined, sig: null, series: null, missing: [], state: "idle", promise: null, failedSig: null, failedAt: 0 };

const dzDays = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };   // whole days since 1970
const dzIso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/* Fingerprint of everything the past depends on. Prices are left out on purpose: the series is
 * rebuilt daily anyway, and today's point is always live. */
function dzSignature() {
  const parts = [DZ_HIST_VERSION, FX.base];
  HOLDINGS.forEach((h) => parts.push("H", h.brokerId, h.ticker, h.shares, h.avgCost, h.openingFxRate, h.currency));
  ALL_TRANSACTIONS.forEach((x) => parts.push(x.id, x.date, x.type, x.brokerId, x.toBrokerId, x.ticker, x.qty, x.price, x.gross, x.fee, x.tax, x.fxRate,
    x.currency, x.fromCurrency, x.toCurrency, x.fromAmount, x.toAmount, x.status, x.paidTo, x.drip, x.override));
  const str = parts.join("|");
  let h = 0x811c9dc5;   // FNV-1a
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + "." + ALL_TRANSACTIONS.length;
}
function dzLoadCache() { try { const c = JSON.parse(localStorage.getItem(DZ_HIST_KEY)); return c && c.v === DZ_HIST_VERSION && Array.isArray(c.points) ? c : null; } catch (e) { return null; } }
function dzSaveCache(c) { try { localStorage.setItem(DZ_HIST_KEY, JSON.stringify(c)); } catch (e) { /* storage full — the chart simply rebuilds next time */ } }

async function dzFetchHistory(symbol, from) {
  try {
    const r = await fetch(`${API_BASE}/api/history?symbol=${encodeURIComponent(symbol)}&from=${from}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !Array.isArray(d.points) || !d.points.length) return null;
    return { currency: d.currency || null, dates: d.points.map((p) => p[0]), closes: d.points.map((p) => p[1]) };
  } catch (e) { return null; }
}
/* Last close on or before a date (carries a price across weekends and holidays). */
function dzLookup(h, d) {
  let lo = 0, hi = h.dates.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (h.dates[m] <= d) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : h.closes[r];
}
async function dzPool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/* Positions held BEFORE the first record (Portfolio > opening holdings) are money that was already invested: without them the grey
 * "money invested" block would start at zero and their whole value would be drawn as gain. Cost in base currency, as computeTotals() books it. */
function dzOpeningCost() {
  return HOLDINGS.reduce((s, h) => s + (+h.shares || 0) * (+h.avgCost || 0) * (h.openingFxRate || FX.rates[h.currency] || 1), 0);
}

/* Returns { points: [[date, netWorth, moneyInvested], ...], missing: [tickers without price history] }
 * or null when nothing could be built. Today is deliberately left out — it is always drawn live. */
async function dzBuildHistory() {
  const txs = ALL_TRANSACTIONS.filter((x) => x.date).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!txs.length) return null;
  const today = todayISO();
  const openDates = HOLDINGS.map((h) => h.asOfDate).filter(Boolean).sort();
  const first = openDates.length && openDates[0] < txs[0].date ? openDates[0] : txs[0].date;
  const openCost = dzOpeningCost();

  // What needs a price history: every ticker that was ever held, from the day it first mattered.
  const since = {};
  const note = (tk, date) => { if (tk && tk !== "—" && (!since[tk] || date < since[tk])) since[tk] = date; };
  HOLDINGS.forEach((h) => note(h.ticker, first));
  txs.forEach((x) => { if (x.type === "Buy" || x.type === "Sell" || x.type === "Stock split" || x.type === "DRIP / Reinvested") note(x.ticker, x.date); });
  const tickers = Object.keys(since);
  const ccys = new Set();
  const addCcy = (c) => { if (c && c !== FX.base) ccys.add(c); };
  HOLDINGS.forEach((h) => addCcy(h.currency));
  txs.forEach((x) => { addCcy(x.currency); addCcy(x.fromCurrency); addCcy(x.toCurrency); });

  const hists = {}, missing = [], fxHists = {};
  const priceJobs = tickers.map((tk) => ({ sym: tk, from: since[tk], tk }));
  const results = await dzPool(priceJobs, 4, (j) => dzFetchHistory(j.sym, j.from));
  results.forEach((h, i) => { if (h) { hists[priceJobs[i].tk] = h; addCcy(h.currency); } else missing.push(priceJobs[i].tk); });
  if (tickers.length && !Object.keys(hists).length) return null;   // offline / provider down: nothing trustworthy to draw
  const fxJobs = [...ccys];
  const fxRes = await dzPool(fxJobs, 4, (c) => dzFetchHistory(`${c}${FX.base}=X`, first));
  fxRes.forEach((h, i) => { if (h) fxHists[fxJobs[i]] = h; });

  // Which days to value: every trading day lately, every third day further back (about 300 points for 3 years).
  const days = new Set();
  Object.keys(hists).forEach((tk) => hists[tk].dates.forEach((d) => { if (d >= first && d < today) days.add(d); }));
  let all = [...days].sort();
  if (!all.length) { all = []; for (let n = dzDays(first); n < dzDays(today); n += 7) all.push(dzIso(n)); }   // nothing priced: one point a week
  const recentFrom = dzIso(dzDays(today) - 120);
  const dates = []; let older = 0;
  all.forEach((d) => { if (d >= recentFrom) dates.push(d); else if (older++ % 3 === 0) dates.push(d); });
  if (!dates.length || dates[0] > first) dates.unshift(first);

  const points = []; let k = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    while (k < txs.length && txs[k].date <= d) k++;
    const X = computeTotals({
      txns: txs.slice(0, k),
      priceOf: (tk) => { const h = hists[tk]; if (!h) return null; const c = dzLookup(h, d); return c == null ? null : { price: c, currency: h.currency || FX.base }; },
      fxOf: (c) => { if (c === FX.base) return 1; const h = fxHists[c]; const r = h ? dzLookup(h, d) : null; return r || FX.rates[c] || 1; },
      skipXirr: true,
    });
    points.push([d, +(X.portfolioValue + X.totalCash).toFixed(2), +(X.netCapitalInvested + openCost).toFixed(2)]);
    if (i % 12 === 11) await new Promise((res) => setTimeout(res, 0));   // let the page breathe between batches
  }
  return { points, missing };
}

/* Makes sure the series is (being) built for the data as it is now. Cheap to call on every render. */
function dzEnsureHistory() {
  if (!ALL_TRANSACTIONS.length) { DZ_HIST.state = "empty"; DZ_HIST.series = null; DZ_HIST.sig = null; DZ_HIST.cache = undefined; return; }
  const sig = dzSignature();
  if (DZ_HIST.cache === undefined) DZ_HIST.cache = dzLoadCache();
  const c = DZ_HIST.cache;
  const same = !!c && c.sig === sig;
  if (same) { DZ_HIST.sig = sig; DZ_HIST.series = c.points; DZ_HIST.missing = c.missing || []; DZ_HIST.state = "ready"; }
  else if (DZ_HIST.sig !== sig) { DZ_HIST.series = null; DZ_HIST.state = DZ_HIST.promise ? "loading" : "idle"; }
  const stale = !same || c.builtDate !== todayISO();
  if (!stale || DZ_HIST.promise) return;
  // a build that just failed for this very data waits a few minutes instead of hammering the price provider
  if (DZ_HIST.failedSig === sig && Date.now() - DZ_HIST.failedAt < 10 * 60000) { if (!same) DZ_HIST.state = "error"; return; }
  if (!LIVE_ENABLED) { if (!same) DZ_HIST.state = "offline"; return; }
  if (!same) DZ_HIST.state = "loading";
  DZ_HIST.promise = dzBuildHistory().then((res) => {
    DZ_HIST.promise = null;
    if (res) {
      const fresh = { v: DZ_HIST_VERSION, sig, builtDate: todayISO(), points: res.points, missing: res.missing };
      DZ_HIST.cache = fresh; dzSaveCache(fresh);
      if (dzSignature() === sig) { DZ_HIST.sig = sig; DZ_HIST.series = res.points; DZ_HIST.missing = res.missing; DZ_HIST.state = "ready"; }
    } else { DZ_HIST.failedSig = sig; DZ_HIST.failedAt = Date.now(); if (!same) DZ_HIST.state = "error"; }
    dzOnHistoryChanged();
  }).catch(() => { DZ_HIST.promise = null; DZ_HIST.failedSig = sig; DZ_HIST.failedAt = Date.now(); if (!same) DZ_HIST.state = "error"; dzOnHistoryChanged(); });
}
function dzOnHistoryChanged() {
  if (!document.getElementById("dzChartBox")) return;
  dzEnsureHistory();   // cheap; starts one more build if the data changed while this one was running
  dzRenderChart();
}

/* The series to draw: the rebuilt history if there is one, else the values saved on each visit (old behaviour,
 * still better than nothing offline), always ending with today's live number. */
function dzSeries() {
  const today = todayISO();
  let pts = DZ_HIST.series, fallback = false;
  if (!pts) {
    fallback = true;
    const open = dzOpeningCost();
    pts = PV_HISTORY.filter((p) => p.date && p.date < today && (p.value > 0 || p.principal > 0)).map((p) => [p.date, p.value != null ? p.value : p.mv, (p.principal || 0) + open]);
  }
  pts = pts.filter((p) => p[0] < today);
  pts.push([today, (T.portfolioValue || 0) + (T.totalCash || 0), (T.netCapitalInvested || 0) + dzOpeningCost()]);
  return { fallback, pts: pts.map((p) => ({ d: p[0], t: dzDays(p[0]), nw: p[1], p: p[2] })) };
}

/* =============================================================================
 * 2. THE CHART — net worth (line) over money invested (grey) with the gain as a coloured band
 * ========================================================================== */
const DZ_RANGES = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "All": Infinity };
let dzRange = (() => { try { const v = localStorage.getItem("il-dash-range"); return DZ_RANGES[v] ? v : "All"; } catch (e) { return "All"; } })();

function dzRangeSlice(pts, key) {
  const days = DZ_RANGES[key];
  if (!isFinite(days)) return pts;
  const cut = pts[pts.length - 1].t - days;
  let i = pts.findIndex((p) => p.t >= cut);
  if (i > 0) i--;                       // start the line exactly at the edge of the range
  return pts.slice(Math.max(0, Math.min(i, pts.length - 2)));
}
/* The smallest "nice" step (1, 2, 2.5 or 5 x a power of ten) that keeps the axis to maxTicks lines, with a little headroom above the data. */
function dzNiceScale(hi, lo, maxTicks) {
  const need = Math.max(hi * 1.02, 1e-9);
  const mag0 = Math.pow(10, Math.floor(Math.log10(Math.max((hi - lo) / maxTicks, 1e-9))) - 1);
  for (let e = 0; e < 12; e++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * mag0 * Math.pow(10, e);
      const top = Math.ceil(need / step - 1e-9) * step || step;
      const bottom = lo < 0 ? Math.floor(lo / step) * step : 0;
      if (Math.round((top - bottom) / step) + 1 <= maxTicks) return { step, top, bottom };
    }
  }
  const step = Math.max(hi - lo, 1);
  return { step, top: hi, bottom: Math.min(lo, 0) };
}
function dzAxisNum(v) {
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a >= 1e6) return +(v / 1e6).toFixed(2) + "M";
  if (a >= 1000) return +(v / 1000).toFixed(1) + "k";
  return String(+v.toFixed(1));
}
const DZ_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* Calendar-aligned ticks for the x axis; the step (weekly, monthly ... yearly) is the smallest that keeps it uncrowded. */
function dzXTicks(t0, t1, maxN) {
  const span = t1 - t0;
  if (span <= 130) {
    for (const st of span <= 16 ? [3] : span <= 45 ? [7, 14] : [14, 28]) {
      const out = [];
      for (let tt = t0 + 1; tt <= t1 - 2; tt += st) { const d = new Date(tt * 86400000); out.push({ t: tt, label: `${d.getUTCDate()} ${DZ_MON[d.getUTCMonth()]}` }); }
      if (out.length <= maxN) return out;
    }
    return [];
  }
  const d0 = new Date(t0 * 86400000);
  for (const m of [1, 2, 3, 6, 12, 24, 60]) {
    const ticks = [];
    let y = d0.getUTCFullYear(), mo = 0;
    for (; y <= new Date(t1 * 86400000).getUTCFullYear(); y++) {
      for (mo = 0; mo < 12; mo++) {
        if (m >= 12 ? (mo !== 0 || y % (m / 12) !== 0) : mo % m !== 0) continue;
        const tt = Date.UTC(y, mo, 1) / 86400000;
        if (tt < t0 + span * 0.05 || tt > t1 - span * 0.02) continue;
        ticks.push({ t: tt, label: m >= 12 ? String(y) : (m >= 3 || mo === 0) ? `${DZ_MON[mo]} ${String(y).slice(2)}` : DZ_MON[mo] });
      }
    }
    if (ticks.length <= maxN) return ticks;
  }
  return [];
}

/* Returns { svg, geom }. W is the real pixel width of the box, so text keeps its true size at any screen width. */
function dzChartSVG(pts, W, H) {
  const compact = W < 520;
  const padL = compact ? 38 : 48, padR = compact ? 12 : 20, padT = 14, padB = 26;
  const n = pts.length, plotW = W - padL - padR;
  const t0 = pts[0].t, t1 = pts[n - 1].t, span = Math.max(1, t1 - t0);
  const vals = pts.flatMap((p) => [p.nw, p.p]);
  const hi = Math.max(...vals, 0), lo = Math.min(...vals, 0);
  const { step, top, bottom } = dzNiceScale(hi, lo, compact ? 5 : 6);
  const X = (tt) => padL + ((tt - t0) / span) * plotW;
  const Y = (v) => padT + (1 - (v - bottom) / (top - bottom)) * (H - padT - padB);
  const f = (v) => v.toFixed(1);
  const xs = pts.map((p) => X(p.t)), yN = pts.map((p) => Y(p.nw)), yP = pts.map((p) => Y(p.p)), y0 = Y(0);

  let grid = "";
  for (let v = bottom; v <= top + step * 1e-6; v += step) {
    const y = Y(v);
    grid += `<line class="dz-grid" x1="${padL}" x2="${W - padR}" y1="${f(y)}" y2="${f(y)}"/><text class="dz-ylab" x="${padL - 8}" y="${f(y + 4)}" text-anchor="end">${dzAxisNum(v)}</text>`;
  }
  const xl = dzXTicks(t0, t1, Math.max(2, Math.floor(plotW / (compact ? 56 : 84)))).map((k) => `<text class="dz-xlab" x="${f(X(k.t))}" y="${H - 7}" text-anchor="middle">${k.label}</text>`).join("");

  // money invested: a grey block that steps up/down on the day of each deposit or withdrawal
  let base = `M${f(xs[0])},${f(y0)} L${f(xs[0])},${f(yP[0])}`, edge = `M${f(xs[0])},${f(yP[0])}`;
  for (let i = 1; i < n; i++) { base += ` H${f(xs[i])} V${f(yP[i])}`; edge += ` H${f(xs[i])} V${f(yP[i])}`; }
  base += ` V${f(y0)} Z`;

  // the band between the two: gain (net worth above what was put in) and loss (below it) are separate shapes
  const bands = { gain: "", loss: "" };
  let a = 1;
  while (a < n) {
    const sign = (i) => ((pts[i - 1].nw + pts[i].nw) / 2 - pts[i - 1].p >= 0 ? "gain" : "loss");
    const kind = sign(a); let b = a;
    while (b + 1 < n && sign(b + 1) === kind) b++;
    let d = `M${f(xs[a - 1])},${f(yN[a - 1])}`;
    for (let i = a; i <= b; i++) d += ` L${f(xs[i])},${f(yN[i])}`;
    d += ` L${f(xs[b])},${f(yP[b - 1])}`;
    for (let i = b; i >= a; i--) { d += ` L${f(xs[i - 1])},${f(yP[i - 1])}`; if (i > a) d += ` L${f(xs[i - 1])},${f(yP[i - 2])}`; }
    bands[kind] += `<path d="${d} Z"/>`;
    a = b + 1;
  }
  const line = xs.map((x, i) => `${i ? "L" : "M"}${f(x)},${f(yN[i])}`).join(" ");
  const last = n - 1;
  const aria = `${t("Net worth over time")}: ${dzMoney0(pts[last].nw)}, ${dzL("Money invested", "Principal Invested")} ${dzMoney0(pts[last].p)}`;
  const svg = `<svg class="dz-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">
    <defs><linearGradient id="dzGs" gradientUnits="userSpaceOnUse" x1="${padL}" y1="0" x2="${W - padR}" y2="0"><stop offset="0" class="dz-s1"/><stop offset="1" class="dz-s2"/></linearGradient>
    <linearGradient id="dzGg" gradientUnits="userSpaceOnUse" x1="${padL}" y1="0" x2="${W - padR}" y2="0"><stop offset="0" class="dz-g1"/><stop offset="1" class="dz-g2"/></linearGradient></defs>
    ${grid}${xl}
    <path class="dz-base" d="${base}"/>
    <g class="dz-gain" fill="url(#dzGg)">${bands.gain}</g><g class="dz-loss">${bands.loss}</g>
    <path class="dz-edge" d="${edge}"/>
    <path class="dz-nw" d="${line}" stroke="url(#dzGs)"/>
    <circle class="dz-halo" cx="${f(xs[last])}" cy="${f(yN[last])}" r="9"/><circle class="dz-dot" cx="${f(xs[last])}" cy="${f(yN[last])}" r="4.2"/>
    <line class="dz-guide" y1="${padT}" y2="${H - padB}" x1="0" x2="0" style="display:none"/><circle class="dz-hdot" r="4.6" cx="0" cy="0" style="display:none"/>
    <rect class="dz-hit" x="${padL}" y="0" width="${plotW}" height="${H}"/>
  </svg>`;
  return { svg, geom: { xs, yN, pts, W, H } };
}

function dzTipHTML(p, isToday) {
  const gain = p.nw - p.p;
  return `<div class="dz-tip-d">${isToday ? t("Today") : fmtDate(p.d)}</div>
    <div class="dz-tip-r"><i class="sw-nw"></i><span>${dzL("Net worth", "Net Worth")}</span><b>${dzMoney0(p.nw)}</b></div>
    <div class="dz-tip-r"><i class="sw-inv"></i><span>${dzL("Money invested", "Principal Invested")}</span><b>${dzMoney0(p.p)}</b></div>
    <div class="dz-tip-r"><i class="sw-gain"></i><span>${t("Gain")}</span><b class="${gain > 0 ? "pos" : gain < 0 ? "neg" : ""}">${dzSigned0(gain)}</b></div>`;
}

let dzHideTip = null;   // hides the tooltip of the chart currently on screen
document.addEventListener("pointerdown", (e) => { if (dzHideTip && !(e.target.closest && e.target.closest(".dz-chartbox"))) dzHideTip(); });
function dzBindChartHover(box, geom) {
  const svg = box.querySelector("svg"), tip = box.querySelector(".dz-tip");
  if (!svg || !tip) return;
  const guide = svg.querySelector(".dz-guide"), dot = svg.querySelector(".dz-hdot");
  const { xs, yN, pts, W } = geom;
  let hideTimer = null;
  const hide = () => { tip.hidden = true; guide.style.display = "none"; dot.style.display = "none"; };
  dzHideTip = hide;
  const show = (e) => {
    clearTimeout(hideTimer);
    const r = svg.getBoundingClientRect(), sx = r.width / W;
    const x = (e.clientX - r.left) / sx;
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const i = Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
    guide.setAttribute("x1", xs[i]); guide.setAttribute("x2", xs[i]); guide.style.display = "";
    dot.setAttribute("cx", xs[i]); dot.setAttribute("cy", yN[i]); dot.style.display = "";
    tip.innerHTML = dzTipHTML(pts[i], i === pts.length - 1);
    tip.hidden = false;
    const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    const px = xs[i] * sx, py = yN[i] * sx;
    tip.style.left = Math.max(0, Math.min(bw - tw, px - tw / 2)) + "px";
    tip.style.top = (py - th - 14 >= 0 ? py - th - 14 : py + 16) + "px";
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  // a finger lifting off also fires "leave" at once, but the figures should stay readable for a moment (see pointerup below)
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(); });
  svg.addEventListener("pointercancel", hide);
  svg.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") hideTimer = setTimeout(hide, 2500); });
}

let dzChartObserver = null;
/* Draws (or redraws) the chart into #dzChartBox for the current data and range. */
function dzRenderChart() {
  const box = document.getElementById("dzChartBox");
  if (!box) return;
  const note = document.getElementById("dzChartNote");
  const W = Math.max(260, Math.round(box.clientWidth || 0)) || 600;
  const H = W < 520 ? Math.round(W * 0.54) : Math.max(240, Math.min(340, Math.round(W * 0.42)));
  const { fallback, pts: all } = dzSeries();
  const loading = DZ_HIST.state === "loading" && fallback;
  if (loading) {
    box.style.minHeight = H + "px";
    box.innerHTML = `<div class="dz-skel" style="height:${H}px"><div class="dz-skel-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span>${t("Building your history…")}</span></div>`;
    if (note) note.innerHTML = "";
    return;
  }
  if (all.length < 2) {
    box.style.minHeight = "";
    box.innerHTML = `<p class="dz-empty">${t("Not enough history yet — the chart appears once you have records on two different days.")}</p>`;
    if (note) note.innerHTML = "";
    return;
  }
  const pts = dzRangeSlice(all, dzRange);
  const { svg, geom } = dzChartSVG(pts, W, H);
  box.style.minHeight = "";
  box.innerHTML = `${svg}<div class="dz-tip" hidden></div>`;
  dzBindChartHover(box, geom);
  if (note) {
    const lines = [];
    if (fallback) lines.push(t("Showing the values saved each time you opened Divz. Go online once to build the full history."));
    else if (DZ_HIST.missing.length) lines.push(dzF("Price history wasn't available for {list}. Their cost is used for earlier dates.", { list: DZ_HIST.missing.join(", ") }));
    const open = dzOpeningCost();
    if (open > 0.005) lines.push(dzF("Money invested includes the {n} you already held when you started recording.", { n: dzMoney0(open) }));
    // The band is net worth minus money invested; Total return is built from trades, dividends and fees — say so if they visibly differ.
    const last = all[all.length - 1], gap = (last.nw - last.p) - (T.totalReturn || 0);
    if (Math.abs(gap) >= 1 && SETTINGS.returnMode !== "price") lines.push(dzF("Gain here is net worth minus money invested. Total return is worked out from your trades, dividends and fees, so the two can differ slightly (by {n} now).", { n: money(Math.abs(gap)) }));
    note.innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join("");
  }
  if (!dzChartObserver && typeof ResizeObserver === "function") {
    let lastW = box.clientWidth, raf = 0;
    dzChartObserver = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const b = document.getElementById("dzChartBox");
        if (b && Math.abs(b.clientWidth - lastW) > 2) { lastW = b.clientWidth; dzRenderChart(); }
      });
    });
    dzChartObserver.observe(box);
  } else if (dzChartObserver) { dzChartObserver.disconnect(); dzChartObserver.observe(box); }
}

/* =============================================================================
 * 3. PAGE PIECES
 * ========================================================================== */
const dzMoney0 = (n) => `${ccyLabel(FX.base)} ${fmt(n, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dzSigned0 = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + dzMoney0(Math.abs(n));
const dzTriangle = (up) => `<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="${up ? "M5 1.3 9 8.6H1z" : "M5 8.7 1 1.4h8z"}" fill="currentColor"/></svg>`;

/* What to call a holding: the Malaysian trading symbol (as the rest of the app does), else the company, else the code. */
function dzName(ticker, company) {
  const meta = STOCK_META[ticker] || {};
  const my = (ticker || "").toUpperCase().endsWith(".KL") ? MY_SYMBOL_CACHE[ticker] : null;
  return my || company || meta.name || ticker;
}
const dzInitials = (name) => esc(String(name || "?").replace(/[^A-Za-z0-9一-鿿]/g, "").slice(0, 2).toUpperCase() || "?");

/* "12 Mar" (or 12/03, 03/12, 03-12 to match the Date Format setting): a date without its year. */
function dzShortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  switch ((typeof SETTINGS !== "undefined" && SETTINGS.dateFormat) || "D MMM YYYY") {
    case "YYYY-MM-DD": return `${pad(m)}-${pad(d)}`;
    case "DD/MM/YYYY": return `${pad(d)}/${pad(m)}`;
    case "MM/DD/YYYY": return `${pad(m)}/${pad(d)}`;
    default: return `${d} ${DZ_MON[m - 1]}`;
  }
}
function dzGreeting() {
  const h = new Date().getHours();
  return h < 12 ? t("Good morning") : h < 18 ? t("Good afternoon") : t("Good evening");
}
function dzLiveInfo() {
  const latest = T.holdings.filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  if (!latest) return T.holdings.length ? { live: false, text: t("Prices set manually") } : null;
  const dt = new Date(latest);
  const sameDay = dateToISO(dt) === todayISO();
  return { live: hoursSince(latest) < 36, text: sameDay ? `${t("Live prices")} · ${dt.toTimeString().slice(0, 5)}` : `${t("Prices from")} ${fmtDate(dateToISO(dt))}` };
}

function dzTopHTML() {
  const live = dzLiveInfo();
  const refresh = `<button type="button" class="dz-ib" data-dz-refresh aria-label="${esc(t("Refresh prices"))}" title="${esc(t("Refresh prices"))}">${dzIcon("refresh", 17)}</button>`;
  return `<div class="dz-bar">
      <div class="dz-brand"><span class="dz-logo" aria-hidden="true">D</span><span class="dz-bn">Divz</span></div>
      <div class="dz-act"><button type="button" class="dz-ib" id="dzBell" aria-label="${esc(t("Notifications"))}">${dzSprite("bell", 19)}<span class="notif-badge notif-badge-target dz-badge" hidden>0</span></button>${refresh}</div>
    </div>
    <header class="dz-top"><div class="dz-greet"><div class="dz-eyebrow">${t("Dashboard")}</div><h1 class="dz-h1">${dzGreeting()}</h1><div class="dz-sub">${t("Here is how your investments are doing today.")}</div></div>
      <div class="dz-topr">${live ? `<span class="dz-live${live.live ? "" : " off"}"><i></i>${esc(live.text)}</span>` : ""}${refresh}</div></header>`;
}

function dzHeroHTML(c) {
  const [int, dec] = fmt(c.netWorth).split(".");
  const since = c.firstDate && c.returnIsTotal ? dzF("Total return since {date}", { date: fmtDate(c.firstDate) }) : c.returnIsTotal ? "" : t("Unrealized profit or loss");
  const mv = Math.max(0, T.portfolioValue || 0), cash = Math.max(0, T.totalCash || 0);
  const pills = c.shownPct == null && !c.up && !c.dn ? "" : `<div class="dz-pills"><span class="dz-pill">${c.up ? dzTriangle(true) : c.dn ? dzTriangle(false) : ""}${moneySigned(c.shownReturn)}</span>${c.shownPct == null ? "" : `<span class="dz-pill">${c.up || c.dn ? pctTxt(c.shownPct) : fmt(Math.abs(c.shownPct), { maximumFractionDigits: 2 }) + "%"}</span>`}</div>`;
  return `<section class="dz-card dz-hero" data-card="nw" tabindex="0" role="button" aria-label="${esc(t("Net Worth"))}">
    <div class="dz-lbl">${dzL("Net worth", "Net Worth")}<span class="col-info tip-down" data-tip="${esc(t("Holdings plus cash across all your brokers. Tap the card to see how it's added up."))}">${dzIcon("info", 14)}</span></div>
    <div class="dz-big dz-n"><span class="cur">${ccyLabel(FX.base)}</span>${int}<span class="dec">.${dec}</span></div>
    ${pills}
    ${since ? `<div class="dz-hnote">${esc(since)}</div>` : ""}
    <div class="dz-hsplit"><div class="dz-hbar"><i style="flex:${mv.toFixed(2)}"></i><b style="flex:${cash.toFixed(2)}"></b></div>
      <div class="dz-hleg"><span>${t("Holdings")}<b class="dz-n">${money(T.portfolioValue || 0)}</b></span><span style="text-align:right">${t("Cash")}<b class="dz-n">${money(T.totalCash || 0)}</b></span></div></div>
  </section>`;
}

function dzGlanceHTML(c) {
  const item = (cls, icon, label, val, sub, valCls, attrs) => `<div class="dz-gl"${attrs || ""}><div class="dz-gi ${cls}">${dzIcon(icon, 22)}</div><div class="dz-glb"><div class="dz-lbl">${label}</div><div class="dz-gv dz-n ${valCls || ""}">${val}</div><div class="dz-gs">${sub}</div></div></div>`;
  const clickable = (key, label) => ` data-card="${key}" tabindex="0" role="button" aria-label="${escAttr(label)}"`;
  const retSub = c.shownPct != null ? `${c.up || c.dn ? pctTxt(c.shownPct) : fmt(Math.abs(c.shownPct), { maximumFractionDigits: 2 }) + "%"} ${t("on money invested")}`
    : T.netCapitalInvested < 0 ? t("more withdrawn than invested") : t("no capital invested yet");
  const retLabel = c.returnIsTotal ? dzL("Total return", "Total Return") : t("Unrealized P/L");
  const divSub = c.upcomingTotal > 0 ? dzF("{n} expected in 12 months", { n: dzMoney0(c.upcomingTotal) }) : c.yr;
  const cashLabel = `${dzL("Cash available", "Available Cash")}${c.cashLow ? `<span class="dz-warn-ic" style="color:var(--warn)">${WARN_TRIANGLE_ICON_SVG}</span>` : ""}`;
  const cashPct = c.netWorth > 0 ? fmt(Math.max(0, (T.totalCash || 0)) / c.netWorth * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%" : "—";
  return `<section class="dz-card dz-glance">
    ${item("g", "trend", retLabel, moneySigned(c.shownReturn), retSub, c.up ? "pos" : c.dn ? "neg" : "", clickable("pl", retLabel))}
    ${item("b", "wallet", dzL("Money invested", "Principal Invested"), money(T.netCapitalInvested), t("Deposits minus withdrawals"), "", clickable("principal", t("Principal Invested")))}
    ${item("a", "coins", dzL("Dividends this year", "Dividends YTD"), money(c.divYTD), divSub, c.divYTD ? "pos" : "")}
    ${item("t", "layers", cashLabel, money(T.totalCash || 0), c.netWorth > 0 ? dzF("{pct} of your net worth", { pct: cashPct }) : t("Across all brokers"), c.cashLow ? "warn-val" : "", clickable("cash", t("Available Cash")))}
  </section>`;
}

function dzChartCardHTML() {
  const hasTxn = ALL_TRANSACTIONS.some((x) => x.type === "Buy" || x.type === "Deposit") || HOLDINGS.length > 0;
  if (!hasTxn) {
    return `<section class="dz-card dz-pad dz-chartcard"><div class="dz-ch"><div class="dz-ct">${t("Net worth over time")}</div></div>
      ${emptyState(`${t("Record your first deposit or Buy to start tracking.")}<div style="margin-top:14px"><a class="btn primary" href="#/add">${t("Add a transaction")} →</a></div>`)}</section>`;
  }
  const pills = Object.keys(DZ_RANGES).map((k) => `<button type="button" class="${k === dzRange ? "on" : ""}" data-dz-range="${k}" aria-pressed="${k === dzRange}">${k === "All" ? t("All") : k}</button>`).join("");
  return `<section class="dz-card dz-pad dz-chartcard">
    <div class="dz-ch"><div class="dz-ct">${t("Net worth over time")}</div><div class="dz-seg" role="group" aria-label="${esc(t("Time range"))}">${pills}</div></div>
    <div class="dz-legend"><span><i class="lg-nw"></i>${dzL("Net worth", "Net Worth")}</span><span><i class="lg-inv"></i>${dzL("Money invested", "Principal Invested")}</span><span><i class="lg-gain"></i>${t("Gain")}</span></div>
    <div class="dz-chartbox" id="dzChartBox"></div>
    <div class="dz-notes" id="dzChartNote"></div>
  </section>`;
}

/* ---- allocation ---- */
let dzAllocMode = (() => { try { const v = localStorage.getItem("il-dash-alloc"); return v === "currency" || v === "type" ? v : "holding"; } catch (e) { return "holding"; } })();
const DZ_PALETTE = ["var(--dz-c1)", "var(--dz-c2)", "var(--dz-c3)", "var(--dz-c4)", "var(--dz-c5)", "var(--dz-c6)"];
function dzAllocSlices(mode) {
  const cash = Math.max(0, T.totalCash || 0);
  let raw;
  if (mode === "currency") raw = groupSum(T.holdings, (h) => h.currency || "—", (h) => h.marketValue).sort((a, b) => b.value - a.value);
  else if (mode === "type") raw = groupSum(T.holdings, (h) => t(holdingType(h.ticker)), (h) => h.marketValue).sort((a, b) => b.value - a.value);
  else {
    const agg = aggregateHoldingsByTicker(T.holdings).filter((h) => h.marketValue > 0).sort((a, b) => b.marketValue - a.marketValue);
    raw = agg.slice(0, 5).map((h) => ({ label: dzName(h.ticker, h.company), value: h.marketValue }));
    const rest = agg.slice(5);
    if (rest.length) raw.push({ label: dzF("Other ({n})", { n: rest.length }), value: rest.reduce((s, h) => s + h.marketValue, 0), other: true });
  }
  const slices = raw.filter((s) => s.value > 0).map((s, i) => ({ ...s, color: s.other ? "var(--dz-other)" : DZ_PALETTE[i % DZ_PALETTE.length] }));
  if (cash > 0) slices.push({ label: t("Cash"), value: cash, color: "var(--dz-cash)" });
  return slices;
}
function dzDonutSVG(slices, size, thick, gapDeg) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thick) / 2, C = 2 * Math.PI * r, gap = slices.length > 1 ? C * gapDeg / 360 : 0, c = size / 2;
  let off = 0, out = `<svg class="dz-dn" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(t("Allocation"))}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" class="dz-dn-track" stroke-width="${thick}"/>`;
  slices.forEach((s) => {
    const L = C * s.value / total, len = Math.max(0.1, L - gap);
    out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:${s.color}" stroke-width="${thick}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
    off += L;
  });
  return out + "</svg>";
}
function dzAllocBodyHTML() {
  const slices = dzAllocSlices(dzAllocMode);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!(total > 0)) return emptyState(`${t("No holdings yet. Add a buy transaction to create your first holding.")}<div style="margin-top:14px"><a class="btn primary" href="#/add">${t("Add a transaction")} →</a></div>`);
  const rows = slices.map((s) => `<div class="dz-lr"><i style="background:${s.color}"></i><span class="dz-lrn">${esc(s.label)}</span><span class="dz-lrv"><b class="dz-n">${fmt(s.value / total * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%</b><span class="dz-lra mu dz-n">${dzMoney0(s.value)}</span></span></div>`).join("");
  return `<div class="dz-alloc"><div class="dz-dnw">${dzDonutSVG(slices, 176, 20, 2.6)}<div class="dz-dnc"><small>${dzL("Net worth", "Net Worth")}</small><b class="dz-n">${dzMoney0(total)}</b></div></div><div class="dz-lgd">${rows}</div></div>`;
}
function dzAllocCardHTML() {
  const seg = [["holding", t("Holdings")], ["currency", t("Currency")], ["type", t("Type")]].map(([k, l]) => `<button type="button" class="${dzAllocMode === k ? "on" : ""}" data-dz-alloc="${k}" aria-pressed="${dzAllocMode === k}">${l}</button>`).join("");
  return `<section class="dz-card dz-pad dz-alloccard"><div class="dz-ch"><div class="dz-ct">${t("Allocation")}</div><div class="dz-seg dz-seg-s" role="group" aria-label="${esc(t("Allocation"))}">${seg}</div></div><div id="dzAllocBody">${dzAllocBodyHTML()}</div></section>`;
}

/* ---- holdings ---- */
function dzHoldingsHTML(netWorth) {
  const all = aggregateHoldingsByTicker(T.holdings).sort((a, b) => b.marketValue - a.marketValue);
  const rows = all.slice(0, 8);
  const sharesFmt = (h) => fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  const body = rows.map((h, i) => {
    const name = dzName(h.ticker, h.company);
    const w = netWorth > 0 ? fmt(h.marketValue / netWorth * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%" : "";
    const priced = h.hasPrice && h.currentPrice != null;
    const price = priced ? (h.currentPriceCcy && h.currentPriceCcy !== FX.base ? `${ccyLabel(h.currentPriceCcy)} ${fmt(h.currentPrice)}` : fmt(h.currentPrice)) : "—";
    const retPct = h.costBasis > 0 ? (h.totalReturn / h.costBasis) * 100 : null;
    const pill = (pct, label) => pct == null ? `<span class="dz-pl2 mu">—</span>` : `<span class="dz-pl2 ${cls(pct)}">${pctTxt(pct)}<span class="dz-pl2l"> ${label}</span></span>`;
    return `<a class="dz-hrow" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">
      <div class="dz-hc"><span class="dz-chip${i % 2 ? " b" : ""}">${dzInitials(name)}</span>
        <div class="dz-hcn"><div class="dz-hn">${esc(name)}</div>
          <div class="dz-hs dz-only-d">${esc(h.ticker)} · ${sharesFmt(h)} ${t("shares")}${w ? " · " + w : ""}</div>
          <div class="dz-hs dz-only-m dz-n">${sharesFmt(h)} × ${priced ? fmt(h.currentPrice) : "—"}</div></div></div>
      <div class="dz-hcol dz-h-price"><div class="dz-hn2 dz-n">${price}</div><div class="dz-hs">${t("per share")}</div></div>
      <div class="dz-hcol dz-h-val"><div class="dz-mv dz-n">${fmt(h.marketValue)}</div>${priced ? pill(h.unrealizedPct, t("unrealized")) : `<span class="dz-pl2 mu">${t("no price")}</span>`}</div>
      <div class="dz-hcol dz-h-ret"><div class="dz-mv dz-n ${cls(h.totalReturn)}">${signed(h.totalReturn)}</div>${pill(retPct, t("total"))}</div>
    </a>`;
  }).join("");
  const count = all.length === 1 ? dzF("{n} position", { n: 1 }) : dzF("{n} positions", { n: all.length });
  const priceDates = T.holdings.filter((h) => h.hasPrice && h.currentPriceDate).map((h) => h.currentPriceDate).sort();
  const latestLive = T.holdings.filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  const asOf = latestLive ? fmtDateTime(latestLive) : (priceDates.length ? fmtDate(priceDates[priceDates.length - 1]) : null);
  const head = `<div class="dz-ch"><div class="dz-ct">${t("Holdings")}<small>${count}${all.length ? " · " + ccyLabel(FX.base) : ""}</small></div><a class="dz-lnk" href="#/portfolio">${t("View all")} ${dzIcon("arrow", 15)}</a></div>`;
  if (!all.length) return `<section class="dz-card dz-pad">${head}<p class="dz-empty">${t("No holdings yet — record a Buy on the Add page and it appears here automatically.")}</p></section>`;
  return `<section class="dz-card dz-pad">${head}
    <div class="dz-hl"><div class="dz-hhead"><span>${t("Holding")}</span><span>${t("Price")}</span><span>${t("Value")} (${ccyLabel(FX.base)})</span><span>${t("Return")} (${ccyLabel(FX.base)})</span></div>${body}</div>
    ${asOf ? `<div class="dz-cardfoot">${metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${asOf}`)}</div>` : ""}</section>`;
}

/* ---- upcoming dividends ---- */
function dzUpcomingList() {
  const upcoming = allUpcomingDivs();
  const fc = dividendForecast(ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status !== "Expected"), upcoming);
  const oneYearOut = new Date(todayDate()); oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const limit = dateToISO(oneYearOut);
  // Pattern-based estimates for holdings with a detected frequency but no declared date — the same merge the Dividends page uses.
  const estimated = (fc.nextPayments || []).filter((p) => !p.confirmed && p.payDate <= limit).map((p) => {
    const h = T.holdings.find((x) => x.ticker === p.ticker);
    return { ticker: p.ticker, brokerId: h ? h.brokerId : null, exDate: null, payDate: p.payDate, amtMYR: p.amtMYR, source: "estimated" };
  });
  return [...upcoming.map((d) => ({ ...d, amtMYR: d.expectedNetMYR })), ...estimated].sort((a, b) => ((a.payDate || "") < (b.payDate || "") ? -1 : 1));
}
function dzDividendsHTML(list) {
  const head = `<div class="dz-ch"><div class="dz-ct">${dzL("Upcoming dividends", "Upcoming Dividends")}<small>${t("next 12 months")}</small></div><a class="dz-lnk" href="#/dividends">${t("Calendar")} ${dzIcon("arrow", 15)}</a></div>`;
  if (!list.length) return `<section class="dz-card dz-pad" id="dashDivSection">${head}<p class="dz-empty">${t("No upcoming dividends.")}</p></section>`;
  const estEx = (payDs) => { const d = new Date(payDs + "T00:00:00"); d.setDate(d.getDate() - 14); return dateToISO(d); };
  const shown = list.slice(0, 6);
  const rows = shown.map((d) => {
    const est = d.source === "estimated";
    const ex = d.exDate || (d.payDate ? estEx(d.payDate) : null);
    const dt = d.payDate ? new Date(d.payDate + "T00:00:00") : null;
    const h = T.holdings.find((x) => x.ticker === d.ticker);
    const name = dzName(d.ticker, h ? h.company : "");
    const sub = dzF(est || !d.exDate ? "Ex-date ≈ {ex} · pays {pay}" : "Ex-date {ex} · pays {pay}", { ex: ex ? dzShortDate(ex) : "—", pay: fmtDate(d.payDate) });
    const tile = dt && !isNaN(dt) ? `<small>${DZ_MON[dt.getMonth()].toUpperCase()}</small><b class="dz-n">${dt.getDate()}</b>` : `<small>—</small><b>—</b>`;
    return `<div class="dz-dr"><div class="dz-dd">${tile}</div>
      <div class="dz-drn"><div class="dz-hn">${esc(name)}${est ? `<span class="dz-est">${t("EST.")}</span>` : ""}</div><div class="dz-hs">${esc(sub)}</div></div>
      <div class="dz-mv dz-n pos">${signed(d.amtMYR)}</div></div>`;
  }).join("");
  const total = Math.round(list.reduce((s, d) => s + Math.round((+d.amtMYR || 0) * 100) / 100, 0) * 100) / 100;   // sum of the rounded amounts, so what is shown always adds up
  const anyEst = list.some((d) => d.source === "estimated");
  const more = list.length > shown.length ? `<a class="dz-more" href="#/dividends">${dzF("+{n} more", { n: list.length - shown.length })}</a>` : "";
  return `<section class="dz-card dz-pad" id="dashDivSection">${head}${rows}${more}
    <div class="dz-total"><span class="mu">${t(anyEst ? "Estimated total" : "Expected total")}</span><span class="dz-mv dz-n pos">${signed(total)}</span></div></section>`;
}

/* ---- portfolio health ---- */
function dzHealthHTML() {
  const hp = portfolioHealth();
  const tile = (id, label, val, unit, text, meter) => `<div class="dz-ht" id="${id}" tabindex="0" role="button"><div class="dz-lbl">${label}</div><div class="dz-hv dz-n">${val}<small>${unit}</small></div><div class="dz-meter"><i style="width:${Math.max(0, Math.min(100, meter)).toFixed(0)}%"></i></div><div class="dz-hx">${text}</div></div>`;
  const enough = T.holdings.length >= 2;
  const divText = !enough ? t("Add more holdings to score")
    : dzF(hp.effectiveN < 3 ? "About {n} equal-sized stocks, so your portfolio rests on very few." : hp.effectiveN < 6 ? "About {n} equal-sized stocks — fairly concentrated." : hp.effectiveN < 12 ? "About {n} equal-sized stocks — reasonably spread." : "About {n} equal-sized stocks — well spread.", { n: fmt(hp.effectiveN, { maximumFractionDigits: 1 }) });
  const yieldText = hp.yieldEst != null && hp.ttm > 0 ? dzF("{amt} paid to you in the last 12 months, as a share of your holdings.", { amt: dzMoney0(hp.ttm) }) : t("No dividends recorded yet");
  return `<section class="dz-card dz-pad"><div class="dz-ch"><div class="dz-ct">${dzL("Portfolio health", "Portfolio Health")}</div></div><div class="dz-hg">
    ${tile("phDivYield", dzL("Dividend yield", "Dividend Yield (TTM)"), hp.yieldEst != null ? fmt(hp.yieldEst, { maximumFractionDigits: 2 }) : "—", hp.yieldEst != null ? "%" : "", yieldText, hp.yieldEst != null ? hp.yieldEst / 8 * 100 : 0)}
    ${tile("phCashAlloc", dzL("Cash share", "Cash Allocation"), hp.cashAlloc != null ? fmt(hp.cashAlloc, { maximumFractionDigits: 1 }) : "—", hp.cashAlloc != null ? "%" : "", hp.cashAlloc != null ? t("Part of your net worth sitting as cash instead of invested.") : t("Nothing to allocate yet"), hp.cashAlloc || 0)}
    ${tile("phDivScore", dzL("Diversification", "Diversification Score"), enough ? String(hp.divScore) : "—", enough ? "/ 100" : "", divText, enough ? hp.divScore : 0)}
    ${tile("phXirr", dzL("Annual return (XIRR)", "XIRR"), T.xirr != null ? fmt(T.xirr, { maximumFractionDigits: 2 }) : "—", T.xirr != null ? "%" : "", T.xirr != null ? t("Yearly return that accounts for when you added or withdrew money.") : t("Not enough cash-flow history"), T.xirr != null ? T.xirr / 20 * 100 : 0)}
  </div></section>`;
}

/* ---- recent activity ---- */
const DZ_KIND = { "Deposit": ["deposit", "in"], "Withdrawal": ["withdraw", "out"], "Sell": ["sell", "in"], "Buy": ["buy", "out"], "Dividend": ["dividends", "in"],
  "DRIP / Reinvested": ["dividends", "in"], "Interest / cash yield": ["dividends", "in"], "Interest": ["dividends", "in"], "Fee": ["records", "out"], "Tax withholding": ["records", "out"],
  "Currency Exchange": ["fx", ""], "FX conversion": ["fx", ""], "Transfer between brokers": ["fx", ""] };
/* The effect on cash, in the transaction's own currency (null = nothing to show, e.g. a split). */
function dzCashEffect(x) {
  const g = +x.gross || 0, fee = +x.fee || 0, tax = +x.tax || 0;
  switch (x.type) {
    case "Deposit": case "Interest / cash yield": case "Interest": return g;
    case "Withdrawal": case "Fee": case "Tax withholding": return -g;
    case "Buy": return -(g + fee + tax);
    case "Sell": return g - fee - tax;
    case "Dividend": return g - tax;
    default: return null;
  }
}
function dzActivityHTML() {
  const today = todayISO();
  const recent = ALL_TRANSACTIONS.map((x, i) => ({ x, i })).filter((r) => r.x.status !== "Expected" && r.x.date <= today)
    .sort((a, b) => (a.x.date < b.x.date ? 1 : a.x.date > b.x.date ? -1 : a.i - b.i)).slice(0, 6).map((r) => r.x);
  const head = `<div class="dz-ch"><div class="dz-ct">${dzL("Recent activity", "Recent Activity")}<small>${t("latest first")}</small></div><a class="dz-lnk" href="#/records">${t("All transactions")} ${dzIcon("arrow", 15)}</a></div>`;
  if (!recent.length) return `<section class="dz-card dz-pad">${head}<p class="dz-empty">${t("No activity yet.")}</p></section>`;
  const rows = recent.map((x) => {
    const [ic, tone0] = DZ_KIND[x.type] || ["records", ""];
    const eff = dzCashEffect(x);
    const ccy = x.currency || FX.base;
    const hasTicker = x.ticker && x.ticker !== "—";
    const h = hasTicker ? T.holdings.find((v) => v.ticker === x.ticker) : null;
    const nm = hasTicker ? dzName(x.ticker, x.company || (h && h.company)) : "";
    let what, sub = "";
    if (x.type === "Buy" || x.type === "Sell") {
      what = `${t(x.type === "Buy" ? "Bought" : "Sold")} ${fmt(+x.qty || 0, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} × ${esc(nm)}`;
      sub = x.price === 0 || x.price === "0" ? t("free shares") : `@ ${ccyLabel(ccy)} ${fmt(+x.price || 0)}`;
    } else if (x.type === "Dividend") { what = t("Dividend"); sub = esc(nm); }
    else if (x.type === "DRIP / Reinvested") { what = t("Dividend reinvested"); sub = esc(nm); }
    else { what = t(x.type); sub = esc(nm); }
    let amt, amtCls = "", fxNote = "";
    if (x.type === "Currency Exchange" || x.type === "FX conversion") {
      const toAmt = +x.toAmount || 0;
      amt = toAmt ? `+${ccyLabel(x.toCurrency || FX.base)} ${fmt(toAmt)}` : "—"; amtCls = toAmt ? "pos" : "";
    } else if (eff == null) { amt = x.type === "Transfer between brokers" ? `${ccyLabel(ccy)} ${fmt(+x.gross || 0)}` : "—"; }
    else {
      amt = `${eff > 0 ? "+" : eff < 0 ? "−" : ""}${ccyLabel(ccy)} ${fmt(Math.abs(eff))}`; amtCls = cls(eff);
      const fxR = x.fxRate || FX.rates[ccy] || 1;
      if (ccy !== FX.base && eff) fxNote = `<div class="dz-fxn">≈ ${ccyLabel(FX.base)} ${fmt(Math.abs(eff) * fxR)}</div>`;
    }
    const tone = tone0 || (eff > 0 ? "in" : eff < 0 ? "out" : "");
    return `<div class="dz-ar"><div class="dz-ti ${tone}">${dzSprite(ic, 20)}</div>
      <div class="dz-arn"><div class="dz-aw">${what}</div><div class="dz-as2">${sub}<span class="dz-only-m">${sub ? " · " : ""}${fmtDate(x.date)} · ${esc(brokerName(x.brokerId))}</span></div></div>
      <div class="dz-ad dz-only-d">${esc(brokerName(x.brokerId))}</div><div class="dz-ad dz-only-d">${fmtDate(x.date)}</div>
      <div class="dz-aa dz-n ${amtCls}">${amt}${fxNote}</div></div>`;
  }).join("");
  return `<section class="dz-card dz-pad">${head}${rows}</section>`;
}

/* =============================================================================
 * 4. THE PAGE
 * ========================================================================== */
function pageDashboard() {
  const netWorth = (T.portfolioValue || 0) + (T.totalCash || 0);
  const returnIsTotal = SETTINGS.returnMode !== "price";
  // "Unrealized" must show pure unrealized P/L, not T.priceReturn (which also mixes in realized P/L and fees) —
  // otherwise a fully-sold position with no current holdings can still show a large "Unrealized P/L".
  const shownReturn = returnIsTotal ? T.totalReturn : T.unrealizedPL;
  // null (not 0) whenever the ratio would be meaningless: no capital invested yet (a portfolio funded only through
  // DRIP), or net capital gone NEGATIVE (lifetime withdrawals above deposits) — a negative denominator flips the
  // percentage's sign independently of the amount's, which would read as a self-contradiction.
  const shownPct = T.netCapitalInvested > 0 ? (shownReturn / T.netCapitalInvested) * 100 : null;
  const yr = todayISO().slice(0, 4);
  const divYTD = ALL_TRANSACTIONS
    .filter((x) => x.type === "Dividend" && x.status !== "Expected" && (x.payDate || x.date || "").slice(0, 4) === yr)
    .reduce((s, d) => s + divNetMYR(d), 0);
  const upcomingList = dzUpcomingList();
  const upcomingTotal = Math.round(upcomingList.reduce((s, d) => s + Math.round((+d.amtMYR || 0) * 100) / 100, 0) * 100) / 100;
  const firstDate = ALL_TRANSACTIONS.reduce((m, x) => (x.date && x.date < m ? x.date : m), "9999-12-31");
  const c = {
    netWorth, returnIsTotal, shownReturn, shownPct, up: shownReturn > 0, dn: shownReturn < 0, yr, divYTD, upcomingTotal,
    firstDate: firstDate === "9999-12-31" ? null : firstDate, cashLow: (T.totalCash || 0) < 50,
  };

  // Calc breakdowns (click a card to see "how").
  const calcs = {
    nw: { title: "Net Worth", rows: [
      { op: "+", label: "Current Portfolio Value", val: fmt(T.portfolioValue) },
      { op: "+", label: "Available cash (all brokers)", val: fmt(T.totalCash || 0) }], total: netWorth },
    pl: { title: returnIsTotal ? "Total Return" : "Unrealized P/L", rows: returnIsTotal ? [
      { op: "+", label: "Unrealized P/L", val: moneySigned(T.unrealizedPL) },
      { op: "+", label: "Realized P/L", val: moneySigned(T.realizedPL) },
      { op: "+", label: "Net Dividends", val: moneySigned(T.netDividends) },
      ...(T.totalInterest ? [{ op: "+", label: "Interest Received", val: moneySigned(T.totalInterest) }] : []),
      { op: "−", label: "Total Fees", val: fmt(T.totalFees) }] : [
      { op: "+", label: "Unrealized P/L", val: moneySigned(T.unrealizedPL) },
    ], total: shownReturn },
    cash: availableCashCalc(),
    principal: netCashAddedCalc("Principal Invested"),
  };

  const html = `<div class="dz" id="dzRoot">
    ${dzTopHTML()}
    <div class="dz-top2">${dzHeroHTML(c)}${dzGlanceHTML(c)}</div>
    <div class="dz-row2">${dzChartCardHTML()}${dzAllocCardHTML()}</div>
    ${dzHoldingsHTML(netWorth)}
    <div class="dz-row3">${dzDividendsHTML(upcomingList)}${dzHealthHTML()}</div>
    ${dzActivityHTML()}
    <p class="dz-foot">${metaNote(SAVED_ICON_SVG, LAST_SAVED ? `${t("Last saved on this device")}: ${fmtDateTime(LAST_SAVED)}` : t("Nothing saved yet"))}</p>
  </div>`;

  return { title: "Dashboard", subtitle: "Welcome back — here is your portfolio at a glance.", html,
    mount() {
      $$("#dzRoot [data-card]").forEach((el) => {
        const open = () => showCalc(calcs[el.dataset.card]);
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
      [
        ["phDivYield", t("Dividend Yield (TTM)"), t("Trailing 12-month net dividends ÷ current portfolio market value.")],
        ["phCashAlloc", t("Cash Allocation"), t("Cash as a percentage of total net value (market value + available cash).")],
        ["phDivScore", t("Diversification Score"), t("Effective N score based on portfolio weights. Higher = more diversified.")],
      ].forEach(([id, title, body]) => {
        const el = $("#" + id);
        if (!el) return;
        const open = () => { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = `<p style="margin:0;font-size:13.5px;line-height:1.7">${body}</p>`; $("#modal").hidden = false; };
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
      const xirrEl = $("#phXirr");
      if (xirrEl) {
        const open = () => showCalc(xirrCalc());
        xirrEl.addEventListener("click", open);
        xirrEl.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      }
      $$("[data-dz-range]").forEach((b) => b.addEventListener("click", () => {
        dzRange = b.dataset.dzRange;
        try { localStorage.setItem("il-dash-range", dzRange); } catch (e) {}
        $$("[data-dz-range]").forEach((x) => { const on = x.dataset.dzRange === dzRange; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
        dzRenderChart();
      }));
      $$("[data-dz-alloc]").forEach((b) => b.addEventListener("click", () => {
        dzAllocMode = b.dataset.dzAlloc;
        try { localStorage.setItem("il-dash-alloc", dzAllocMode); } catch (e) {}
        $$("[data-dz-alloc]").forEach((x) => { const on = x.dataset.dzAlloc === dzAllocMode; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
        $("#dzAllocBody").innerHTML = dzAllocBodyHTML();
      }));
      const bell = $("#dzBell");
      if (bell) bell.addEventListener("click", () => toggleMoreSheet());
      $$("[data-dz-refresh]").forEach((b) => b.addEventListener("click", () => dzRefreshPrices()));

      dzEnsureHistory();
      dzRenderChart();

      // Auto-fetch dividend schedules, prices, Malaysian symbols and FX; re-render if still here.
      if (LIVE_ENABLED) {
        fetchAllDivSchedules().then(({ fetched, hadError, failed, fresh }) => {
          if (fetched && document.getElementById("dashDivSection")) render();
          // Only on a real attempt (fresh): a short-circuited "already fresh" call still reports the same old failure,
          // and toasting that on every mount is pure noise.
          if (fresh && hadError && document.getElementById("dashDivSection")) toast(divFetchWarning(failed));
        });
        fetchAllLivePrices().then(({ fetched }) => { if (fetched && document.getElementById("dzRoot")) render(); });
        fetchAllMySymbols().then((found) => { if (found && document.getElementById("dzRoot")) render(); });
        if (!FX_AUTO_REFRESH_IN_FLIGHT && hoursSince(FX.updated) >= LIVE_REFRESH_HOURS) {
          FX_AUTO_REFRESH_IN_FLIGHT = true;
          refreshFxRates().then((r) => {
            FX_AUTO_REFRESH_IN_FLIGHT = false;
            if (!r.ok) return;
            saveStore();
            if (document.getElementById("dzRoot")) render();
          });
        }
      }
    } };
}

/* The round button next to the live-prices pill (and in the phone's top bar): re-fetch every price and exchange rate now. */
let dzRefreshing = false;
async function dzRefreshPrices() {
  if (dzRefreshing) return;
  if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
  dzRefreshing = true;
  const btns = $$("[data-dz-refresh]");
  btns.forEach((b) => { b.disabled = true; b.classList.add("spin"); });
  try {
    const tickers = [...new Set(T.holdings.map((h) => h.ticker))];
    const results = await Promise.all(tickers.map((tk) => refreshLivePrice(tk)));
    const ok = results.filter(Boolean).length;
    for (const ccy of Object.keys(FX.rates).filter((c) => c !== FX.base)) {
      const q = await fetchQuote(`${ccy}${FX.base}=X`);
      if (q && q.price > 0) FX.rates[ccy] = +q.price;
    }
    saveStore();
    toast(ok ? `${ok}/${tickers.length} ${t("prices updated")}` : t("Couldn't fetch prices — check the ticker symbols (Yahoo format)."));
  } finally {
    dzRefreshing = false;
    render();
  }
}
