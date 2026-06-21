/* =============================================================================
 * Investment Ledger — App (router + all pages)
 * Every figure is COMPUTED from the data module so numbers stay auditable.
 * ========================================================================== */
"use strict";

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const brokerName = (id) => (BROKERS.find((b) => b.id === id) || {}).name || id;
const toBase = (amount, ccy) => amount * (FX.rates[ccy] ?? 1);
const countryForTicker = (t) => (/\.KL$/.test(t) ? "Malaysia" : "United States");

const fmt = (n, opts = {}) => {
  const o = { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts };
  // Guard: Intl throws if min > max (e.g. share counts pass maximumFractionDigits: 0).
  if (o.maximumFractionDigits < o.minimumFractionDigits) o.minimumFractionDigits = o.maximumFractionDigits;
  return new Intl.NumberFormat("en-MY", o).format(n);
};
const money = (n, ccy = FX.base) => `${ccy} ${fmt(n)}`;
const signed = (n) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
const pctTxt = (n) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n), { maximumFractionDigits: 2 })}%`;
const cls = (n) => (n >= 0 ? "pos" : "neg");

/* =============================================================================
 * i18n — English / 中文
 * Dictionary maps the English source string -> Chinese. Most UI text is
 * translated by walking the rendered DOM and swapping any text node / option /
 * placeholder whose trimmed text exactly matches a dictionary key, so we don't
 * have to hand-wrap every string. Dynamic data (tickers, names, numbers) never
 * matches a key, so it is left untouched.
 * ========================================================================== */
let LANG = (function () { try { return localStorage.getItem("il-lang") || "en"; } catch (e) { return "en"; } })();

const ZH = {
  // Nav / chrome
  "Dashboard": "仪表盘", "Portfolio": "投资组合", "Transactions": "交易记录",
  "Cash Ledger": "现金账本", "Dividends": "股息", "Reports": "报表",
  "Brokers": "券商", "Settings": "设置", "Help": "帮助",
  "Base currency": "基准货币", "Add": "添加", "More": "更多",
  "Export CSV": "导出 CSV", "Add Transaction": "添加交易",
  // Page subtitles (static)
  "Welcome back — here is your portfolio at a glance.": "欢迎回来 — 这是您的投资组合概览。",
  "Record deposits, trades, dividends, fees and exchanges.": "记录存款、交易、股息、费用和货币兑换。",
  "How much cash you actually put into each investment app.": "您实际投入每个投资平台的现金。",
  "Calendar, history and withholding-tax summary.": "日历、历史记录和预扣税汇总。",
  "Returns, dividends, fees and currency impact.": "收益、股息、费用和汇率影响。",
  "Profile, currency, appearance and data.": "个人资料、货币、外观和数据。",
  "How calculations work, transaction types and FAQ.": "计算方式、交易类型与常见问题。",
  // Summary cards
  "Total Deposits": "总存款", "Total Withdrawals": "总取款", "Net Capital Invested": "净投入资本",
  "Current Portfolio Value": "当前组合价值", "Net Dividends Received": "净股息收入",
  "Total Return": "总回报", "Unrealized / Realized P/L": "未实现 / 已实现盈亏",
  "Cash put into brokers": "投入券商的现金", "Cash taken out": "取出的现金",
  "Deposits − Withdrawals": "存款 − 取款", "Market value of holdings": "持仓市值",
  "After withholding tax": "扣除预扣税后", "ⓘ how": "ⓘ 明细",
  // Panel titles
  "Portfolio Value Over Time": "组合价值走势", "Asset Allocation": "资产配置",
  "Top Holdings": "主要持仓", "Upcoming Dividends": "即将到来的股息",
  "Recent Transactions": "近期交易", "Holdings by Broker": "按券商分布",
  "Holdings by Currency": "按货币分布", "All Holdings": "全部持仓",
  "All Transactions": "全部交易", "Cash Ledger — Deposits & Withdrawals": "现金账本 — 存款与取款",
  "Broker Cash Reconciliation": "券商现金对账", "Dividend History": "股息历史",
  "Dividend Tax Paid by Country": "按国家/地区缴纳的股息税",
  "Profit / Loss by Holding": "按持仓盈亏", "Profit / Loss by Broker": "按券商盈亏",
  "Dividend Income by Year": "按年度股息收入", "Fees Paid by Broker": "按券商支付的费用",
  "Currency Gain / Loss": "汇率盈亏", "Export": "导出", "Add Broker": "添加券商",
  "Profile": "个人资料", "Appearance": "外观", "Base Currency": "基准货币",
  "Exchange Rates": "汇率", "Data Import / Export": "数据导入 / 导出", "Danger Zone": "危险操作",
  // Table headers
  "Holding": "持仓", "Broker": "券商", "Market": "市场", "Shares": "股数",
  "Avg Cost": "平均成本", "Price": "价格", "Cost Basis": "成本", "Market Value": "市值",
  "Unrealized P/L": "未实现盈亏", "Net Div": "净股息", "Ticker": "代码",
  "Ex-Date": "除息日", "Payment": "派息日", "Expected Net": "预计净额", "Status": "状态",
  "Date": "日期", "Type": "类型", "Qty": "数量", "Gross": "总额", "Fee": "费用",
  "Tax": "税", "Net (MYR)": "净额 (MYR)", "Net": "净额", "Amount": "金额",
  "Currency": "货币", "FX Rate": "汇率", "Amount in MYR": "金额 (MYR)", "In MYR": "折合 MYR",
  "Calculated Balance": "计算余额", "Actual Balance": "实际余额", "Difference": "差额",
  "Fees": "费用", "Country": "国家/地区", "Withholding Tax (MYR)": "预扣税 (MYR)",
  "Year": "年份", "Net Dividends": "净股息", "Rate to MYR": "对 MYR 汇率",
  // Links
  "View all →": "查看全部 →", "Calendar →": "日历 →", "All →": "全部 →",
  // Badges
  "Base: MYR": "基准: MYR", "By market value": "按市值", "By broker": "按券商", "By currency": "按货币",
  // Statuses
  "Confirmed": "已确认", "Estimated": "预估", "Paid": "已派发", "Cancelled": "已取消",
  "Unknown": "未知", "Reconciled": "已对账", "Unreconciled": "未对账",
  // Transaction types
  "Deposit": "存款", "Withdrawal": "取款", "Buy": "买入", "Sell": "卖出", "Dividend": "股息",
  "Dividend Tax": "股息税", "Currency Exchange": "货币兑换", "Stock Split": "拆股",
  "DRIP / Reinvested": "股息再投资", "Adjustment": "调整",
  // Forms
  "Transaction Type": "交易类型", "Amount (gross)": "金额（总额）", "Quantity": "数量",
  "Price / Share": "每股价格", "Ex-dividend Date": "除息日", "Payment Date": "派息日",
  "Withholding Tax": "预扣税", "Save Transaction": "保存交易", "Clear": "清空",
  "Hide": "隐藏", "Show": "显示", "Reset": "重置",
  "All brokers": "全部券商", "All markets": "全部市场", "All currencies": "全部货币",
  "All P/L": "全部盈亏", "Profit": "盈利", "Loss": "亏损",
  // Mini cards / dividend summary
  "Net Cash Added": "净增现金", "Gross Dividends (YTD)": "总股息（年初至今）",
  // Settings
  "Name": "姓名", "Email": "邮箱", "Member since": "注册于",
  "Light": "浅色", "Dark": "深色", "Default design": "默认设计", "True black": "纯黑",
  "Export Cash CSV": "导出现金 CSV", "Export Transactions CSV": "导出交易 CSV",
  "Import CSV": "导入 CSV", "Delete Account": "删除账户",
  "⭳ Export Cash CSV": "⭳ 导出现金 CSV", "⭳ Export Transactions CSV": "⭳ 导出交易 CSV",
  "⭱ Import CSV": "⭱ 导入 CSV", "⭳ Cash Ledger CSV": "⭳ 现金账本 CSV",
  "⭳ Transactions CSV": "⭳ 交易 CSV", "⭳ Dividends CSV": "⭳ 股息 CSV",
  // Empty states
  "No records yet — add them in data.js.": "暂无记录 — 请在 data.js 中添加。",
  "No holdings yet — add them to HOLDINGS in data.js.": "暂无持仓 — 请在 data.js 的 HOLDINGS 中添加。",
  "No holdings match these filters.": "没有符合筛选条件的持仓。",
  "No portfolio history yet — add entries to PORTFOLIO_SERIES in data.js.": "暂无组合历史 — 请在 data.js 的 PORTFOLIO_SERIES 中添加。",
  "No allocation data yet — add holdings in data.js.": "暂无配置数据 — 请在 data.js 中添加持仓。",
  "No brokers yet — add them to BROKERS in data.js.": "暂无券商 — 请在 data.js 的 BROKERS 中添加。",
  // Calc modal
  "Result": "结果",
  "Profit / Loss": "盈亏",
  "Net Dividends Received (after tax)": "净股息收入（税后）",
  "All values converted to base currency using stored exchange rates. Original amounts are preserved.":
    "所有数值均按存储的汇率换算为基准货币，原始金额保持不变。",
  // Add-broker note
  "Each broker keeps its own default currency and cash reconciliation.": "每个券商保留自己的默认货币与现金对账。",
  // Misc
  "Portfolio": "投资组合",
};

const I18N = { zh: ZH };
function t(s) { if (s == null) return s; return (LANG === "zh" && I18N.zh[s]) ? I18N.zh[s] : s; }

function setLang(l) {
  LANG = l;
  try { localStorage.setItem("il-lang", l); } catch (e) {}
  document.documentElement.setAttribute("lang", l === "zh" ? "zh-CN" : "en");
}

/* Translate any static element carrying a data-i18n attribute (nav, topbar…). */
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
}

/* Walk a freshly-rendered subtree and swap matching text nodes / placeholders. */
function translateDOM(root) {
  if (!root || LANG === "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach((nd) => {
    const key = nd.nodeValue.trim();
    if (key && I18N.zh[key]) nd.nodeValue = nd.nodeValue.replace(key, I18N.zh[key]);
  });
  root.querySelectorAll("[placeholder]").forEach((el) => {
    const key = (el.getAttribute("placeholder") || "").trim();
    if (I18N.zh[key]) el.setAttribute("placeholder", I18N.zh[key]);
  });
}

function fmtDate(iso) {
  if (!iso || iso === "—") return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

/* =============================================================================
 * DERIVED TOTALS
 * ========================================================================== */
function computeTotals() {
  const totalDeposits = CASH_LEDGER.filter((c) => c.type === "Deposit")
    .reduce((s, c) => s + toBase(c.amount, c.currency), 0);
  const totalWithdrawals = CASH_LEDGER.filter((c) => c.type === "Withdrawal")
    .reduce((s, c) => s + toBase(c.amount, c.currency), 0);
  const netCapitalInvested = totalDeposits - totalWithdrawals;

  const holdings = HOLDINGS.map((h) => {
    const costBasis = toBase(h.shares * h.avgCost, h.currency);
    const marketValue = toBase(h.shares * h.price, h.currency);
    const unrealized = marketValue - costBasis;
    const unrealizedPct = costBasis ? (unrealized / costBasis) * 100 : 0;
    const totalReturn = unrealized + h.netDividends;
    return { ...h, costBasis, marketValue, unrealized, unrealizedPct, totalReturn };
  });

  const portfolioValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const netDividends = holdings.reduce((s, h) => s + h.netDividends, 0);
  const unrealizedPL = holdings.reduce((s, h) => s + h.unrealized, 0);
  const realizedPL = REALIZED.reduce((s, r) => s + toBase(r.proceeds - r.costBasis - r.fees, r.currency), 0);
  const realizedFees = REALIZED.reduce((s, r) => s + toBase(r.fees, r.currency), 0);
  const totalFees = realizedFees + STANDALONE_FEES_BASE;

  const totalReturn = portfolioValue + totalWithdrawals + netDividends - totalDeposits - totalFees;
  const totalReturnPct = netCapitalInvested ? (totalReturn / netCapitalInvested) * 100 : 0;

  return { totalDeposits, totalWithdrawals, netCapitalInvested, portfolioValue,
    netDividends, unrealizedPL, realizedPL, totalFees, totalReturn, totalReturnPct, holdings };
}
const T = computeTotals();

/* =============================================================================
 * SHARED UI BUILDERS (return HTML strings)
 * ========================================================================== */
function panel(title, body, extra = "") {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
}

function emptyState(msg) {
  return `<div class="empty" style="padding:40px 12px">${msg}</div>`;
}

function table(headers, rows) {
  const thead = `<thead><tr>${headers.map((h) =>
    `<th class="${h.num ? "num" : ""}">${h.label}</th>`).join("")}</tr></thead>`;
  // Show a friendly placeholder row when there are no records yet.
  const body = (rows && rows.trim())
    ? rows
    : `<tr><td colspan="${headers.length}" class="empty" style="padding:28px 12px">No records yet — add them in data.js.</td></tr>`;
  return `<div class="table-wrap"><table class="data-table">${thead}<tbody>${body}</tbody></table></div>`;
}

function statusBadge(s) {
  const map = { Confirmed: "confirmed", Estimated: "warn", Paid: "pos", Cancelled: "neg", Unknown: "subtle" };
  return `<span class="badge ${map[s] || "subtle"}">${s}</span>`;
}
function typeChip(t) {
  const c = { Buy: "pos", Sell: "neg", Dividend: "confirmed", Deposit: "subtle",
    Withdrawal: "warn", Fee: "neg", "DRIP / Reinvested": "confirmed", "Currency Exchange": "subtle",
    "Stock Split": "subtle", Adjustment: "subtle" }[t] || "subtle";
  return `<span class="badge ${c}">${t}</span>`;
}

function lineChartSVG(series) {
  if (!series || series.length < 2) return emptyState("No portfolio history yet — add entries to PORTFOLIO_SERIES in data.js.");
  const W = 640, H = 240, padL = 52, padR = 16, padT = 16, padB = 28;
  const vals = series.map((d) => d.value);
  const min = Math.min(...vals) * 0.97, max = Math.max(...vals) * 1.03;
  const x = (i) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`;
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4, yy = y(v);
    grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="grid"/>
             <text x="${padL - 8}" y="${yy + 4}" class="ylab">${Math.round(v / 1000)}k</text>`;
  }
  const xlabs = series.map((d, i) => (i % 2 === 0) ? `<text x="${x(i)}" y="${H - 8}" class="xlab">${d.month}</text>` : "").join("");
  const dots = series.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="${i === series.length - 1 ? 4 : 2.5}" class="dot"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Portfolio value over time">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--brand)" stop-opacity=".28"/>
      <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
    <style>.grid{stroke:var(--border);stroke-width:1}.ylab,.xlab{fill:var(--muted);font-size:11px;font-family:var(--font)}
      .ylab{text-anchor:end}.xlab{text-anchor:middle}.ln{fill:none;stroke:var(--brand);stroke-width:2.5;stroke-linejoin:round}.dot{fill:var(--brand)}</style>
    ${grid}<path d="${area}" fill="url(#lg)"/><path d="${line}" class="ln"/>${dots}${xlabs}</svg>`;
}

// Monochrome indigo ramp (+ one neutral) so the allocation chart stays on-brand.
const PALETTE = ["#4a3ed9", "#6d5efc", "#8b80ff", "#a99dff", "#352c9e", "#c4bcff", "#8089a0"];
function donutHTML(slices, centerLabel, centerValue) {
  slices = (slices || []).filter((s) => s.value > 0);
  if (!slices.length) return emptyState("No allocation data yet — add holdings in data.js.");
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70, r = 44, C = 88;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
    a0 = a1;
    return `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z" fill="${PALETTE[i % PALETTE.length]}"/>`;
  }).join("");
  const legend = slices.map((s, i) => `<div class="legend-row">
    <span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
    <span>${s.label}</span><span class="lr-pct">${fmt((s.value / total) * 100, { maximumFractionDigits: 1 })}%</span></div>`).join("");
  return `<div class="chart alloc"><svg viewBox="0 0 176 176" width="176" height="176" role="img" aria-label="Allocation">
    ${arcs}<text x="88" y="84" text-anchor="middle" style="fill:var(--muted);font-size:10px;font-family:var(--font)">${centerLabel}</text>
    <text x="88" y="100" text-anchor="middle" style="fill:var(--text);font-size:12px;font-weight:700;font-family:var(--font)">${centerValue}</text></svg>
    <div class="alloc-legend">${legend}</div></div>`;
}

/* aggregation helpers */
function groupSum(items, keyFn, valFn) {
  const m = new Map();
  items.forEach((it) => { const k = keyFn(it); m.set(k, (m.get(k) || 0) + valFn(it)); });
  return [...m.entries()].map(([label, value]) => ({ label, value }));
}

/* =============================================================================
 * PAGE: DASHBOARD
 * ========================================================================== */
function pageDashboard() {
  const cards = dashboardCards();
  const cardsHtml = cards.map((c, i) => `
    <article class="card ${c.feature ? "feature" : ""}" data-card="${i}" tabindex="0" role="button" aria-label="${c.label}, show calculation">
      <div class="c-label">${c.label}
        ${c.badge ? `<span class="badge ${c.badge.cls}" style="margin-left:6px">${c.badge.text}</span>` : ""}
        <span class="calc-hint">ⓘ how</span></div>
      <div class="c-value ${c.valCls || ""}">${c.value}</div>
      <div class="c-sub">${c.sub}</div></article>`).join("");

  const holdingsRows = [...T.holdings].sort((a, b) => b.marketValue - a.marketValue).map((h) => `
    <tr><td><div class="ticker">${h.ticker}</div><div class="sub">${h.company}</div></td>
      <td><span class="chip">${brokerName(h.brokerId)}</span></td><td class="sub">${h.market}</td>
      <td class="num">${fmt(h.shares, { maximumFractionDigits: 0 })}</td>
      <td class="num">${h.currency} ${fmt(h.avgCost)}</td><td class="num">${h.currency} ${fmt(h.price)}</td>
      <td class="num">${money(h.marketValue)}<div class="fx-note">${h.currency !== FX.base ? `@ ${FX.rates[h.currency]}` : "&nbsp;"}</div></td>
      <td class="num ${cls(h.unrealized)}">${signed(h.unrealized)}<div class="fx-note ${cls(h.unrealized)}">${pctTxt(h.unrealizedPct)}</div></td>
      <td class="num">${fmt(h.netDividends)}</td><td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td></tr>`).join("");

  const divRows = UPCOMING_DIVIDENDS.map((d) => `<tr>
    <td><div class="ticker">${d.ticker}</div><div class="sub">${d.company}</div></td>
    <td>${fmtDate(d.exDate)}<div class="sub">ex-date</div></td>
    <td>${fmtDate(d.payDate)}<div class="sub">pay-date</div></td>
    <td class="num">${d.currency} ${fmt(d.expectedNet)}</td><td>${statusBadge(d.status)}</td></tr>`).join("");

  const recentRows = RECENT_TX.map((tx) => `<tr><td>${fmtDate(tx.date)}</td><td>${typeChip(tx.type)}</td>
    <td class="ticker">${tx.ticker}</td><td class="sub">${brokerName(tx.brokerId)}</td>
    <td class="num">${tx.currency} ${fmt(tx.amount)}</td></tr>`).join("");

  const html = `
    <section class="cards">${cardsHtml}</section>
    <section class="grid-2">
      ${panel("Portfolio Value Over Time", `<div class="chart">${lineChartSVG(PORTFOLIO_SERIES)}</div>`, `<span class="badge subtle">Base: MYR</span>`)}
      ${panel("Asset Allocation", donutHTML(T.holdings.map((h) => ({ label: h.ticker, value: h.marketValue })), "Portfolio", money(T.portfolioValue).replace(".00","")), `<span class="badge subtle">By market value</span>`)}
    </section>
    <section class="warn-wrap">${warningsHTML()}</section>
    ${panel("Top Holdings", table(
      [{label:"Holding"},{label:"Broker"},{label:"Market"},{label:"Shares",num:1},{label:"Avg Cost",num:1},{label:"Price",num:1},{label:"Market Value",num:1},{label:"Unrealized P/L",num:1},{label:"Net Div",num:1},{label:"Total Return",num:1}],
      holdingsRows), `<a class="link" href="#/portfolio">View all →</a>`)}
    <section class="grid-2">
      ${panel("Upcoming Dividends", table([{label:"Ticker"},{label:"Ex-Date"},{label:"Payment"},{label:"Expected Net",num:1},{label:"Status"}], divRows), `<a class="link" href="#/dividends">Calendar →</a>`)}
      ${panel("Recent Transactions", table([{label:"Date"},{label:"Type"},{label:"Ticker"},{label:"Broker"},{label:"Amount",num:1}], recentRows), `<a class="link" href="#/transactions">All →</a>`)}
    </section>
    <footer class="page-foot muted">Sample data · figures derived from original currency × exchange rate · click any summary card to see how it was calculated.</footer>`;

  return { title: "Dashboard", subtitle: "Welcome back — here is your portfolio at a glance.", html,
    mount() {
      $$(".card[data-card]").forEach((el) => {
        const i = +el.dataset.card;
        const open = () => showCalc(cards[i].calc);
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
    } };
}

function dashboardCards() {
  return [
    { label: "Total Deposits", value: money(T.totalDeposits), sub: "Cash put into brokers",
      calc: { title: "Total Deposits", rows: CASH_LEDGER.filter((c) => c.type === "Deposit").map((c) => ({
        op: "+", label: `${brokerName(c.brokerId)} · ${c.currency} ${fmt(c.amount)}${c.currency !== FX.base ? ` × ${FX.rates[c.currency]}` : ""}`, val: fmt(toBase(c.amount, c.currency)) })), total: T.totalDeposits } },
    { label: "Total Withdrawals", value: money(T.totalWithdrawals), sub: "Cash taken out",
      calc: { title: "Total Withdrawals", rows: CASH_LEDGER.filter((c) => c.type === "Withdrawal").map((c) => ({
        op: "+", label: `${brokerName(c.brokerId)} · ${c.currency} ${fmt(c.amount)}`, val: fmt(toBase(c.amount, c.currency)) })), total: T.totalWithdrawals } },
    { label: "Net Capital Invested", value: money(T.netCapitalInvested), sub: "Deposits − Withdrawals",
      calc: { title: "Net Capital Invested", rows: [{ op: "+", label: "Total Deposits", val: fmt(T.totalDeposits) }, { op: "−", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) }], total: T.netCapitalInvested } },
    { label: "Current Portfolio Value", value: money(T.portfolioValue), sub: "Market value of holdings",
      calc: { title: "Current Portfolio Value", rows: T.holdings.map((h) => ({ op: "+",
        label: `${h.ticker} · ${h.shares} × ${h.currency} ${fmt(h.price)}${h.currency !== FX.base ? ` × ${FX.rates[h.currency]}` : ""}`, val: fmt(h.marketValue) })), total: T.portfolioValue } },
    { label: "Net Dividends Received", value: money(T.netDividends), sub: "After withholding tax",
      calc: { title: "Net Dividends Received (after tax)", rows: T.holdings.filter((h) => h.netDividends).map((h) => ({ op: "+", label: h.ticker, val: fmt(h.netDividends) })), total: T.netDividends } },
    { label: "Total Return", value: money(T.totalReturn), feature: true, sub: `${pctTxt(T.totalReturnPct)} on net capital invested`,
      badge: { text: pctTxt(T.totalReturnPct), cls: T.totalReturn >= 0 ? "pos" : "neg" }, valCls: cls(T.totalReturn),
      calc: { title: "Total Return", rows: [
        { op: "+", label: "Current Portfolio Value", val: fmt(T.portfolioValue) },
        { op: "+", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) },
        { op: "+", label: "Net Dividends Received", val: fmt(T.netDividends) },
        { op: "−", label: "Total Deposits", val: fmt(T.totalDeposits) },
        { op: "−", label: "Total Fees", val: fmt(T.totalFees) }], total: T.totalReturn } },
    { label: "Unrealized / Realized P/L", value: `${signed(T.unrealizedPL)}`, valCls: cls(T.unrealizedPL), sub: `Realized: ${money(T.realizedPL)}`,
      calc: { title: "Profit / Loss", rows: [
        { op: "+", label: "Unrealized P/L (market value − cost basis)", val: signed(T.unrealizedPL) },
        { op: "+", label: "Realized P/L (closed positions, net of fees)", val: signed(T.realizedPL) }], total: T.unrealizedPL + T.realizedPL } },
  ];
}

function warningsHTML() {
  const items = [];
  RECONCILIATION.forEach((r) => {
    const diff = r.calculated - r.actual;
    if (Math.abs(diff) > 0.005) items.push({ level: "crit", html:
      `<strong>Unreconciled balance — ${brokerName(r.brokerId)}.</strong> Calculated cash ${money(r.calculated)} vs actual ${money(r.actual)} (difference ${money(Math.abs(diff))}). Review for a missing fee or dividend entry.` });
  });
  EXTRA_WARNINGS.forEach((w) => items.push({ level: w.level, html: w.text }));
  return items.map((it) => `<div class="warn-card ${it.level === "crit" ? "crit" : ""}">
    <span class="w-ico">${it.level === "crit" ? "⚠️" : "ⓘ"}</span><div class="w-body">${it.html}</div></div>`).join("");
}

/* =============================================================================
 * PAGE: PORTFOLIO  (with working filters + grouped allocations)
 * ========================================================================== */
const portfolioFilters = { broker: "", market: "", currency: "", pl: "" };

function pagePortfolio() {
  const markets = [...new Set(T.holdings.map((h) => h.market))];
  const currencies = [...new Set(T.holdings.map((h) => h.currency))];
  const opt = (v) => `<option value="${v}">${v}</option>`;

  const filterBar = `<div class="filters">
    <select id="fBroker"><option value="">All brokers</option>${BROKERS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("")}</select>
    <select id="fMarket"><option value="">All markets</option>${markets.map(opt).join("")}</select>
    <select id="fCurrency"><option value="">All currencies</option>${currencies.map(opt).join("")}</select>
    <select id="fPL"><option value="">All P/L</option><option value="pos">Profit</option><option value="neg">Loss</option></select>
    <button class="btn ghost" id="fReset">Reset</button></div>`;

  const byBroker = donutHTML(groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.marketValue), "By broker", "");
  const byCcy = donutHTML(groupSum(T.holdings, (h) => h.currency, (h) => h.marketValue), "By currency", "");

  const html = `
    <section class="grid-2">
      ${panel("Holdings by Broker", byBroker)}
      ${panel("Holdings by Currency", byCcy)}
    </section>
    ${panel("All Holdings", filterBar + `<div id="holdingsBody">${portfolioTable()}</div>`)}
    <footer class="page-foot muted">Toggle "Total Return" to include dividends. Click any holding number to see its breakdown in the next build.</footer>`;

  return { title: "Portfolio", subtitle: LANG === "zh"
      ? `${T.holdings.length} 个持仓，${BROKERS.length} 个券商 · ${money(T.portfolioValue)}`
      : `${T.holdings.length} holdings across ${BROKERS.length} brokers · ${money(T.portfolioValue)}`, html,
    mount() {
      const apply = () => { $("#holdingsBody").innerHTML = portfolioTable(); };
      $("#fBroker").value = portfolioFilters.broker;
      $("#fMarket").value = portfolioFilters.market;
      $("#fCurrency").value = portfolioFilters.currency;
      $("#fPL").value = portfolioFilters.pl;
      $("#fBroker").addEventListener("change", (e) => { portfolioFilters.broker = e.target.value; apply(); });
      $("#fMarket").addEventListener("change", (e) => { portfolioFilters.market = e.target.value; apply(); });
      $("#fCurrency").addEventListener("change", (e) => { portfolioFilters.currency = e.target.value; apply(); });
      $("#fPL").addEventListener("change", (e) => { portfolioFilters.pl = e.target.value; apply(); });
      $("#fReset").addEventListener("click", () => {
        Object.keys(portfolioFilters).forEach((k) => (portfolioFilters[k] = ""));
        ["#fBroker","#fMarket","#fCurrency","#fPL"].forEach((s) => ($(s).value = ""));
        apply();
      });
    } };
}

function portfolioTable() {
  const f = portfolioFilters;
  let rows = T.holdings.filter((h) =>
    (!f.broker || h.brokerId === f.broker) &&
    (!f.market || h.market === f.market) &&
    (!f.currency || h.currency === f.currency) &&
    (!f.pl || (f.pl === "pos" ? h.unrealized >= 0 : h.unrealized < 0)));
  rows = rows.sort((a, b) => b.marketValue - a.marketValue);
  if (!rows.length) return emptyState(T.holdings.length
    ? "No holdings match these filters."
    : "No holdings yet — add them to HOLDINGS in data.js.");
  const body = rows.map((h) => `<tr>
    <td><div class="ticker">${h.ticker}</div><div class="sub">${h.company}</div></td>
    <td><span class="chip">${brokerName(h.brokerId)}</span></td><td class="sub">${h.market}</td>
    <td class="num">${fmt(h.shares, { maximumFractionDigits: 0 })}</td>
    <td class="num">${h.currency} ${fmt(h.avgCost)}</td><td class="num">${h.currency} ${fmt(h.price)}</td>
    <td class="num">${money(h.costBasis)}</td><td class="num">${money(h.marketValue)}</td>
    <td class="num ${cls(h.unrealized)}">${signed(h.unrealized)}<div class="fx-note ${cls(h.unrealized)}">${pctTxt(h.unrealizedPct)}</div></td>
    <td class="num">${fmt(h.netDividends)}</td><td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td></tr>`).join("");
  return table([{label:"Holding"},{label:"Broker"},{label:"Market"},{label:"Shares",num:1},{label:"Avg Cost",num:1},{label:"Price",num:1},{label:"Cost Basis",num:1},{label:"Market Value",num:1},{label:"Unrealized P/L",num:1},{label:"Net Div",num:1},{label:"Total Return",num:1}], body);
}

/* =============================================================================
 * PAGE: TRANSACTIONS  (list + working Add Transaction form)
 * ========================================================================== */
function pageTransactions() {
  const html = `
    <section class="panel" id="addTxPanel">
      <div class="panel-head"><h2>Add Transaction</h2><button class="btn ghost" id="toggleForm">Hide</button></div>
      ${addTxForm()}
    </section>
    ${panel("All Transactions", `<div id="txBody">${txTable()}</div>`, `<span class="badge subtle" id="txCount">${ALL_TRANSACTIONS.length} records</span>`)}`;

  return { title: "Transactions", subtitle: "Record deposits, trades, dividends, fees and exchanges.", html,
    mount() {
      const form = $("#txForm");
      const typeSel = $("#txType");
      const syncFields = () => {
        const t = typeSel.value;
        const trade = (t === "Buy" || t === "Sell" || t === "DRIP / Reinvested");
        const div = (t === "Dividend" || t === "DRIP / Reinvested");
        $("#tradeFields").style.display = trade ? "" : "none";
        $("#divFields").style.display = div ? "" : "none";
        $("#dripNote").style.display = (t === "DRIP / Reinvested") ? "" : "none";
      };
      typeSel.addEventListener("change", syncFields);
      syncFields();

      $("#toggleForm").addEventListener("click", () => {
        const f = $("#txForm");
        const hidden = f.style.display === "none";
        f.style.display = hidden ? "" : "none";
        $("#toggleForm").textContent = hidden ? t("Hide") : t("Show");
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const gross = parseFloat(data.amount) || 0;
        const tax = parseFloat(data.tax) || 0;
        const fee = parseFloat(data.fee) || 0;
        const net = gross - tax - fee;
        const rec = { id: "t" + (ALL_TRANSACTIONS.length + 1), date: data.date, brokerId: data.broker,
          type: data.type, ticker: data.ticker || "—", qty: data.qty ? parseFloat(data.qty) : null,
          price: data.price ? parseFloat(data.price) : null, gross, fee, tax, net, currency: data.currency,
          exDate: data.exDate || undefined, payDate: data.payDate || undefined };
        ALL_TRANSACTIONS.unshift(rec);

        // DRIP must create two linked records (dividend + buy).
        if (data.type === "DRIP / Reinvested" && data.qty && data.price) {
          const buy = { id: "t" + (ALL_TRANSACTIONS.length + 1), date: data.date, brokerId: data.broker,
            type: "Buy", ticker: data.ticker || "—", qty: parseFloat(data.qty), price: parseFloat(data.price),
            gross: parseFloat(data.qty) * parseFloat(data.price), fee: 0, tax: 0,
            net: parseFloat(data.qty) * parseFloat(data.price), currency: data.currency, linkedId: rec.id };
          ALL_TRANSACTIONS.unshift(buy);
          toast("DRIP recorded as 2 linked records: dividend + buy");
        } else {
          toast(`${data.type} transaction added`);
        }
        $("#txBody").innerHTML = txTable();
        $("#txCount").textContent = `${ALL_TRANSACTIONS.length} records`;
        form.reset();
        syncFields();
      });
    } };
}

function addTxForm() {
  const brokerOpts = BROKERS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  const typeOpts = ["Deposit","Withdrawal","Buy","Sell","Dividend","Dividend Tax","Fee","Currency Exchange","Stock Split","DRIP / Reinvested","Adjustment"]
    .map((t) => `<option value="${t}">${t}</option>`).join("");
  const ccyOpts = Object.keys(FX.rates).map((c) => `<option value="${c}">${c}</option>`).join("");
  return `<form id="txForm" class="form" autocomplete="off">
    <div class="form-grid">
      <label>Date<input type="date" name="date" value="2026-06-21" required></label>
      <label>Broker<select name="broker" required>${brokerOpts}</select></label>
      <label>Transaction Type<select name="type" id="txType" required>${typeOpts}</select></label>
      <label>Currency<select name="currency" required>${ccyOpts}</select></label>
      <label>Ticker<input type="text" name="ticker" placeholder="e.g. AAPL (optional)"></label>
      <label>Amount (gross)<input type="number" step="any" name="amount" placeholder="0.00" required></label>
      <label>Fee<input type="number" step="any" name="fee" placeholder="0.00"></label>
    </div>
    <div class="form-grid" id="tradeFields">
      <label>Quantity<input type="number" step="any" name="qty" placeholder="0"></label>
      <label>Price / Share<input type="number" step="any" name="price" placeholder="0.00"></label>
    </div>
    <div class="form-grid" id="divFields">
      <label>Ex-dividend Date<input type="date" name="exDate"></label>
      <label>Payment Date<input type="date" name="payDate"></label>
      <label>Withholding Tax<input type="number" step="any" name="tax" placeholder="0.00"></label>
    </div>
    <p class="form-note" id="dripNote">${LANG === "zh"
      ? "ℹ️ 股息再投资会生成<strong>两条关联记录</strong>：收到的股息，以及用该股息金额买入（请在上方填写数量和价格）。"
      : "ℹ️ A reinvested dividend creates <strong>two linked records</strong>: the dividend received, and a buy using the dividend amount (enter quantity &amp; price above)."}</p>
    <div class="form-actions">
      <button type="submit" class="btn primary">Save Transaction</button>
      <button type="reset" class="btn ghost">Clear</button>
    </div>
  </form>`;
}

function txTable() {
  const rows = ALL_TRANSACTIONS.map((tx) => `<tr>
    <td>${fmtDate(tx.date)}</td><td>${typeChip(tx.type)}</td><td class="ticker">${tx.ticker}</td>
    <td class="sub">${brokerName(tx.brokerId)}</td>
    <td class="num">${tx.qty != null ? fmt(tx.qty, { maximumFractionDigits: 4 }) : "—"}</td>
    <td class="num">${tx.gross != null ? tx.currency + " " + fmt(tx.gross) : "—"}</td>
    <td class="num">${tx.fee ? tx.currency + " " + fmt(tx.fee) : "—"}</td>
    <td class="num">${tx.tax ? tx.currency + " " + fmt(tx.tax) : "—"}</td>
    <td class="num">${money(toBase(tx.net, tx.currency))}</td></tr>`).join("");
  return table([{label:"Date"},{label:"Type"},{label:"Ticker"},{label:"Broker"},{label:"Qty",num:1},{label:"Gross",num:1},{label:"Fee",num:1},{label:"Tax",num:1},{label:"Net (MYR)",num:1}], rows);
}

/* =============================================================================
 * PAGE: CASH LEDGER  (+ reconciliation)
 * ========================================================================== */
function pageCash() {
  const rows = CASH_LEDGER.map((c) => `<tr>
    <td>${fmtDate(c.date)}</td><td class="sub">${brokerName(c.brokerId)}</td><td>${typeChip(c.type)}</td>
    <td class="num">${fmt(c.amount)}</td><td>${c.currency}</td>
    <td class="num">${c.currency !== FX.base ? FX.rates[c.currency] : "1.00"}</td>
    <td class="num">${money(toBase(c.amount, c.currency))}</td></tr>`).join("");

  const summary = `<div class="mini-cards">
    ${miniCard("Total Deposits", money(T.totalDeposits))}
    ${miniCard("Total Withdrawals", money(T.totalWithdrawals))}
    ${miniCard("Net Cash Added", money(T.netCapitalInvested), cls(T.netCapitalInvested))}</div>`;

  const recRows = RECONCILIATION.map((r) => {
    const diff = r.calculated - r.actual;
    const ok = Math.abs(diff) < 0.005;
    return `<tr><td>${brokerName(r.brokerId)}</td>
      <td class="num">${money(r.calculated)}</td><td class="num">${money(r.actual)}</td>
      <td class="num ${ok ? "" : "neg"}">${signed(diff)}</td>
      <td>${ok ? `<span class="badge pos">Reconciled</span>` : `<span class="badge neg">Unreconciled</span>`}</td></tr>`;
  }).join("");

  const html = `
    ${summary}
    ${panel("Cash Ledger — Deposits & Withdrawals", table(
      [{label:"Date"},{label:"Broker"},{label:"Type"},{label:"Amount",num:1},{label:"Currency"},{label:"FX Rate",num:1},{label:"Amount in MYR",num:1}], rows))}
    ${panel("Broker Cash Reconciliation", table(
      [{label:"Broker"},{label:"Calculated Balance",num:1},{label:"Actual Balance",num:1},{label:"Difference",num:1},{label:"Status"}], recRows),
      `<span class="badge subtle">Deposits − Buys − Fees + Sells + Net Div − Withdrawals</span>`)}
    <section class="warn-wrap">${warningsHTML()}</section>`;
  return { title: "Cash Ledger", subtitle: "How much cash you actually put into each investment app.", html };
}

function miniCard(label, value, valCls = "") {
  return `<div class="mini-card"><div class="mc-label">${label}</div><div class="mc-value ${valCls}">${value}</div></div>`;
}

/* =============================================================================
 * PAGE: DIVIDENDS
 * ========================================================================== */
function pageDividends() {
  const upcomingRows = UPCOMING_DIVIDENDS.map((d) => `<tr>
    <td><div class="ticker">${d.ticker}</div><div class="sub">${d.company}</div></td>
    <td class="sub">${brokerName(d.brokerId)}</td><td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td>
    <td class="num">${d.currency} ${fmt(d.expectedNet)}</td><td>${statusBadge(d.status)}</td></tr>`).join("");

  const histRows = DIVIDEND_HISTORY.map((d) => {
    const net = d.gross - d.tax - d.fees;
    return `<tr><td class="ticker">${d.ticker}</td><td class="sub">${brokerName(d.brokerId)}</td>
      <td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td>
      <td class="num">${d.currency} ${fmt(d.gross)}</td><td class="num neg">${d.tax ? "−" + fmt(d.tax) : "0.00"}</td>
      <td class="num">${fmt(d.fees)}</td><td class="num pos">${d.currency} ${fmt(net)}</td>
      <td class="num">${money(toBase(net, d.currency))}</td><td>${statusBadge(d.status)}</td></tr>`;
  }).join("");

  const grossBase = DIVIDEND_HISTORY.reduce((s, d) => s + toBase(d.gross, d.currency), 0);
  const taxBase = DIVIDEND_HISTORY.reduce((s, d) => s + toBase(d.tax, d.currency), 0);
  const netBase = grossBase - taxBase;
  const taxByCountry = groupSum(DIVIDEND_HISTORY, (d) => countryForTicker(d.ticker), (d) => toBase(d.tax, d.currency));

  const taxRows = taxByCountry.map((c) => `<tr><td>${c.label}</td><td class="num neg">${money(c.value)}</td></tr>`).join("");

  const html = `
    <div class="mini-cards">
      ${miniCard("Gross Dividends (YTD)", money(grossBase))}
      ${miniCard("Withholding Tax", money(taxBase), "neg")}
      ${miniCard("Net Dividends", money(netBase), "pos")}</div>
    <div class="info-card"><span class="w-ico">ⓘ</span><div class="w-body">${LANG === "zh"
      ? `<strong>已确认与预估：</strong>标记为 <span class="badge warn">预估</span> 的条目是根据历史规律推算的，<strong>并未确认</strong> — 切勿将其视为确定的日期或金额。`
      : `<strong>Confirmed vs estimated:</strong> rows marked <span class="badge warn">Estimated</span> are projected from historical patterns and are <strong>not confirmed</strong> — never treat them as guaranteed dates or amounts.`}</div></div>
    ${panel("Upcoming Dividends", table([{label:"Ticker"},{label:"Broker"},{label:"Ex-Date"},{label:"Payment"},{label:"Expected Net",num:1},{label:"Status"}], upcomingRows))}
    ${panel("Dividend History", table([{label:"Ticker"},{label:"Broker"},{label:"Ex-Date"},{label:"Payment"},{label:"Gross",num:1},{label:"Tax",num:1},{label:"Fees",num:1},{label:"Net",num:1},{label:"In MYR",num:1},{label:"Status"}], histRows))}
    ${panel("Dividend Tax Paid by Country", table([{label:"Country"},{label:"Withholding Tax (MYR)",num:1}], taxRows))}`;
  return { title: "Dividends", subtitle: "Calendar, history and withholding-tax summary.", html };
}

/* =============================================================================
 * PAGE: REPORTS
 * ========================================================================== */
function pageReports() {
  const plByHolding = [...T.holdings].sort((a, b) => b.totalReturn - a.totalReturn).map((h) => `<tr>
    <td class="ticker">${h.ticker}</td><td class="num ${cls(h.unrealized)}">${signed(h.unrealized)}</td>
    <td class="num">${fmt(h.netDividends)}</td><td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td></tr>`).join("");

  const plByBroker = groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.totalReturn)
    .map((b) => `<tr><td>${b.label}</td><td class="num ${cls(b.value)}">${signed(b.value)}</td></tr>`).join("");

  const divByYear = groupSum(DIVIDEND_HISTORY, (d) => d.payDate.slice(0, 4), (d) => toBase(d.gross - d.tax - d.fees, d.currency))
    .map((y) => `<tr><td>${y.label}</td><td class="num pos">${money(y.value)}</td></tr>`).join("");

  const feesByBroker = groupSum(ALL_TRANSACTIONS.filter((t) => t.fee), (t) => brokerName(t.brokerId), (t) => toBase(t.fee, t.currency))
    .map((b) => `<tr><td>${b.label}</td><td class="num neg">${money(b.value)}</td></tr>`).join("");

  // Currency gain/loss estimate: USD cost basis × (current rate − assumed acquisition rate 4.55)
  const acqRate = 4.55;
  const usdCost = T.holdings.filter((h) => h.currency === "USD").reduce((s, h) => s + h.shares * h.avgCost, 0);
  const fxGain = usdCost * (FX.rates.USD - acqRate);

  const html = `
    <div class="report-grid">
      ${panel("Profit / Loss by Holding", table([{label:"Ticker"},{label:"Unrealized",num:1},{label:"Net Div",num:1},{label:"Total Return",num:1}], plByHolding))}
      ${panel("Profit / Loss by Broker", table([{label:"Broker"},{label:"Total Return",num:1}], plByBroker))}
      ${panel("Dividend Income by Year", table([{label:"Year"},{label:"Net Dividends",num:1}], divByYear))}
      ${panel("Fees Paid by Broker", table([{label:"Broker"},{label:"Fees",num:1}], feesByBroker))}
      ${panel("Currency Gain / Loss", `<div class="report-stat">
        <div class="rs-value ${cls(fxGain)}">${signed(fxGain)} MYR</div>
        <p class="muted">Estimated FX impact on USD holdings: cost ${money(usdCost,"USD")} × (current ${FX.rates.USD} − acquisition ${acqRate}). <span class="badge warn">Estimated</span></p></div>`)}
      ${panel("Total Return", `<div class="report-stat">
        <div class="rs-value ${cls(T.totalReturn)}">${money(T.totalReturn)}</div>
        <p class="muted">Unrealized ${signed(T.unrealizedPL)} + Realized ${signed(T.realizedPL)} + Net Dividends ${fmt(T.netDividends)} − Fees ${fmt(T.totalFees)}</p></div>`)}
    </div>
    <section class="panel"><div class="panel-head"><h2>Export</h2></div>
      <div class="form-actions">
        <button class="btn primary" id="expCash">⭳ Cash Ledger CSV</button>
        <button class="btn" id="expTx">⭳ Transactions CSV</button>
        <button class="btn" id="expDiv">⭳ Dividends CSV</button>
      </div></section>`;
  return { title: "Reports", subtitle: "Returns, dividends, fees and currency impact.", html,
    mount() {
      $("#expCash").addEventListener("click", exportCashCSV);
      $("#expTx").addEventListener("click", exportTxCSV);
      $("#expDiv").addEventListener("click", exportDivCSV);
    } };
}

/* =============================================================================
 * PAGE: BROKERS
 * ========================================================================== */
function pageBrokers() {
  const cards = BROKERS.map((b) => {
    const holdings = T.holdings.filter((h) => h.brokerId === b.id);
    const value = holdings.reduce((s, h) => s + h.marketValue, 0);
    const rec = RECONCILIATION.find((r) => r.brokerId === b.id);
    const diff = rec ? rec.calculated - rec.actual : 0;
    const ok = Math.abs(diff) < 0.005;
    return `<article class="broker-card">
      <div class="bc-head"><span class="brand-mark sm">${b.name.slice(0,2).toUpperCase()}</span>
        <div><div class="bc-name">${b.name}</div><div class="sub">${b.country} · ${b.currency}</div></div>
        ${ok ? `<span class="badge pos">Reconciled</span>` : `<span class="badge neg">Unreconciled</span>`}</div>
      <div class="bc-stats">
        <div><span class="sub">Holdings</span><strong>${holdings.length}</strong></div>
        <div><span class="sub">Market Value</span><strong>${money(value)}</strong></div>
        <div><span class="sub">Cash (calc)</span><strong>${rec ? money(rec.calculated) : "—"}</strong></div>
        <div><span class="sub">Difference</span><strong class="${ok ? "" : "neg"}">${rec ? signed(diff) : "—"}</strong></div>
      </div></article>`;
  }).join("");
  const html = `${cards ? `<div class="broker-grid">${cards}</div>` : emptyState("No brokers yet — add them to BROKERS in data.js.")}
    <section class="panel"><div class="panel-head"><h2>Add Broker</h2></div>
      <p class="muted">Broker management form is wired in the Transactions/Settings flow for this build. Each broker keeps its own default currency and cash reconciliation.</p></section>`;
  return { title: "Brokers", subtitle: LANG === "zh"
      ? `已连接 ${BROKERS.length} 个投资平台。`
      : `${BROKERS.length} investment apps connected.`, html };
}

/* =============================================================================
 * PAGE: SETTINGS  (incl. theme switcher)
 * ========================================================================== */
function pageSettings() {
  const html = `
    ${panel("Profile", `<div class="setting-rows">
      ${settingRow("Name", USER.name)}
      ${settingRow("Email", USER.email)}
      ${settingRow("Member since", fmtDate(USER.joined))}</div>`)}

    ${panel("Appearance", `
      <p class="muted" style="margin:-4px 0 14px">Choose your theme. Dark mode uses a true-black background; light mode is the default design.</p>
      <div class="theme-options" id="themeOptions">
        <button class="theme-card" data-theme-choice="light">
          <span class="tc-swatch light"><span></span><span></span><span></span></span>
          <span class="tc-label">Light <span class="tc-check">✓</span></span>
          <span class="sub">Default design</span></button>
        <button class="theme-card" data-theme-choice="dark">
          <span class="tc-swatch dark"><span></span><span></span><span></span></span>
          <span class="tc-label">Dark <span class="tc-check">✓</span></span>
          <span class="sub">True black</span></button>
      </div>`)}

    ${panel("Base Currency", `<div class="setting-rows">
      ${settingRow("Base currency", `<select id="baseCcy">${Object.keys(FX.rates).map((c) => `<option ${c === FX.base ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
      <p class="muted" style="margin:6px 0 0">All transactions keep their original currency; base-currency values are derived using stored exchange rates and never overwrite the original.</p></div>`)}

    ${panel("Exchange Rates", table([{label:"Currency"},{label:"Rate to MYR",num:1}],
      Object.entries(FX.rates).map(([c, r]) => `<tr><td>${c}</td><td class="num">${fmt(r)}</td></tr>`).join("")))}

    ${panel("Data Import / Export", `<div class="form-actions">
      <button class="btn primary" id="setExpCash">⭳ Export Cash CSV</button>
      <button class="btn" id="setExpTx">⭳ Export Transactions CSV</button>
      <button class="btn ghost">⭱ Import CSV</button></div>`)}

    ${panel("Danger Zone", `<div class="form-actions">
      <button class="btn danger" id="deleteAcct">Delete Account</button></div>`)}`;

  return { title: "Settings", subtitle: "Profile, currency, appearance and data.", html,
    mount() {
      reflectThemeChoice();
      $$("#themeOptions .theme-card").forEach((btn) => {
        btn.addEventListener("click", () => { setTheme(btn.dataset.themeChoice); reflectThemeChoice(); toast(`${btn.dataset.themeChoice === "dark" ? "Dark" : "Light"} theme applied`); });
      });
      $("#baseCcy").addEventListener("change", (e) => toast(`Base currency change to ${e.target.value} — recalculation arrives in the next build`));
      $("#setExpCash").addEventListener("click", exportCashCSV);
      $("#setExpTx").addEventListener("click", exportTxCSV);
      $("#deleteAcct").addEventListener("click", () => toast("Account deletion is disabled in the sample app"));
    } };
}
function settingRow(label, value) {
  return `<div class="setting-row"><span class="sr-label">${label}</span><span class="sr-value">${value}</span></div>`;
}
function reflectThemeChoice() {
  const cur = document.documentElement.getAttribute("data-theme");
  $$("#themeOptions .theme-card").forEach((b) => b.classList.toggle("selected", b.dataset.themeChoice === cur));
}

/* =============================================================================
 * PAGE: HELP
 * ========================================================================== */
function pageHelp() {
  const itemsEN = [
    { q: "How is Total Return calculated?", a: "Total Return = Current Portfolio Value + Total Withdrawals + Net Dividends − Total Deposits − Total Fees. It captures price movement, dividends and cash flows in one figure." },
    { q: "What's the difference between realized and unrealized P/L?", a: "Unrealized P/L = current market value − cost basis of shares you still hold. Realized P/L = sale proceeds − cost basis of sold shares − fees. Total Return combines both plus dividends and currency effects." },
    { q: "How is dividend tax handled?", a: "Net Dividend = Gross Dividend − Withholding Tax − Other Fees. Withholding tax is tracked per dividend and summarised by country in Reports." },
    { q: "What do the transaction types mean?", a: "Deposit/Withdrawal move cash in/out. Buy/Sell trade shares. Dividend records income. DRIP creates two linked records (dividend + buy). Fee, Currency Exchange, Stock Split and Adjustment cover the rest." },
    { q: "Why are some dividends marked 'Estimated'?", a: "Estimated dividends are projected from historical patterns and are not confirmed. They are clearly badged and never shown as confirmed dates or amounts." },
    { q: "Why does a broker show 'Unreconciled'?", a: "Your calculated cash balance (deposits − buys − fees + sells + net dividends − withdrawals) differs from the actual balance in the app. Usually a missing fee or dividend entry." },
  ];
  const itemsZH = [
    { q: "总回报是如何计算的？", a: "总回报 = 当前组合价值 + 总取款 + 净股息 − 总存款 − 总费用。它用一个数字涵盖了价格变动、股息和现金流。" },
    { q: "已实现与未实现盈亏有什么区别？", a: "未实现盈亏 = 当前市值 − 仍持有股票的成本。已实现盈亏 = 卖出所得 − 已卖出股票的成本 − 费用。总回报将两者再加上股息和汇率影响。" },
    { q: "股息税是如何处理的？", a: "净股息 = 总股息 − 预扣税 − 其他费用。预扣税按每笔股息记录，并在报表中按国家/地区汇总。" },
    { q: "各交易类型是什么意思？", a: "存款/取款用于现金进出。买入/卖出用于交易股票。股息记录收入。股息再投资会生成两条关联记录（股息 + 买入）。费用、货币兑换、拆股和调整涵盖其余情况。" },
    { q: "为什么有些股息被标记为“预估”？", a: "预估股息是根据历史规律推算的，尚未确认。它们都有清晰标记，绝不会显示为已确认的日期或金额。" },
    { q: "为什么某个券商显示“未对账”？", a: "您的计算现金余额（存款 − 买入 − 费用 + 卖出 + 净股息 − 取款）与平台中的实际余额不一致，通常是漏记了某笔费用或股息。" },
  ];
  const items = LANG === "zh" ? itemsZH : itemsEN;
  const html = `<div class="help-list">${items.map((it) => `
    <details class="help-item"><summary>${it.q}</summary><p>${it.a}</p></details>`).join("")}</div>`;
  return { title: "Help", subtitle: "How calculations work, transaction types and FAQ.", html };
}

/* =============================================================================
 * CALC MODAL
 * ========================================================================== */
function showCalc(calc) {
  $("#modalTitle").textContent = t(calc.title);
  const rows = calc.rows.map((r) => `<div class="calc-row"><span><span class="cr-op">${r.op}</span>${t(r.label)}</span><span class="cr-val">${r.val}</span></div>`).join("");
  $("#modalBody").innerHTML = `${rows}
    <div class="calc-row total"><span>= ${t("Result")}</span><span class="cr-val">${money(calc.total)}</span></div>
    <p class="muted" style="margin:14px 0 0;font-size:12px">${t("All values converted to base currency using stored exchange rates. Original amounts are preserved.")}</p>`;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

/* =============================================================================
 * CSV EXPORT
 * ========================================================================== */
function downloadCSV(filename, header, lines) {
  const csv = [header, ...lines].map((r) => r.map((x) => `"${x}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(filename + " exported");
}
function exportCashCSV() {
  downloadCSV("investment-ledger-cash.csv",
    ["Date","Broker","Type","Amount","Currency","Exchange Rate","Amount in " + FX.base],
    CASH_LEDGER.map((c) => [c.date, brokerName(c.brokerId), c.type, c.amount, c.currency, FX.rates[c.currency], toBase(c.amount, c.currency).toFixed(2)]));
}
function exportTxCSV() {
  downloadCSV("investment-ledger-transactions.csv",
    ["Date","Broker","Type","Ticker","Quantity","Gross","Fee","Tax","Net","Currency","Net in " + FX.base],
    ALL_TRANSACTIONS.map((t) => [t.date, brokerName(t.brokerId), t.type, t.ticker, t.qty ?? "", t.gross, t.fee, t.tax, t.net, t.currency, toBase(t.net, t.currency).toFixed(2)]));
}
function exportDivCSV() {
  downloadCSV("investment-ledger-dividends.csv",
    ["Ticker","Broker","Ex-Date","Payment","Gross","Tax","Fees","Net","Currency","Net in " + FX.base,"Status"],
    DIVIDEND_HISTORY.map((d) => [d.ticker, brokerName(d.brokerId), d.exDate, d.payDate, d.gross, d.tax, d.fees, (d.gross - d.tax - d.fees).toFixed(2), d.currency, toBase(d.gross - d.tax - d.fees, d.currency).toFixed(2), d.status]));
}

/* =============================================================================
 * THEME + TOAST
 * ========================================================================== */
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("il-theme", theme); } catch (e) {}
}
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

/* =============================================================================
 * ROUTER
 * ========================================================================== */
const PAGES = {
  dashboard: pageDashboard, portfolio: pagePortfolio, transactions: pageTransactions,
  cash: pageCash, dividends: pageDividends, reports: pageReports,
  brokers: pageBrokers, settings: pageSettings, help: pageHelp,
};

function currentPageKey() {
  let key = (location.hash || "#/dashboard").replace(/^#\/?/, "").split("/")[0] || "dashboard";
  if (key === "add") key = "transactions";  // bottom-nav "Add" → transactions form
  if (key === "more") key = "dashboard";
  return PAGES[key] ? key : "dashboard";
}

function render() {
  const key = currentPageKey();
  const root = $("#page");
  try {
    const page = PAGES[key]();
    $("#pageTitle").textContent = t(page.title);
    $("#pageSubtitle").textContent = t(page.subtitle);
    root.innerHTML = page.html;
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    if (page.mount) page.mount();
    translateDOM(root);  // swap any matching text to the current language
  } catch (err) {
    // Never leave the page blank — surface the problem instead.
    console.error("Render error on page:", key, err);
    root.innerHTML = `<div class="warn-card crit"><span class="w-ico">⚠️</span>
      <div class="w-body"><strong>Couldn't render the "${key}" page.</strong><br>
      ${(err && err.message) || err}<br>
      <span class="muted">If you just updated the files, do a hard refresh (Ctrl+Shift+R) to clear the cache.</span></div></div>`;
  }

  // active nav state
  $$("[data-page]").forEach((el) => el.classList.toggle("active", el.dataset.page === key
    || (el.dataset.page === "add" && key === "transactions" && (location.hash || "").includes("add"))));
  // close mobile sidebar after navigation
  $("#sidebar").classList.remove("open");
}

/* =============================================================================
 * INIT / WIRING
 * ========================================================================== */
function updateLangBtn() {
  // Button shows the language you'll switch TO.
  $("#langBtn").textContent = LANG === "en" ? "CN" : "EN";
}

function init() {
  try { const saved = localStorage.getItem("il-theme"); if (saved) setTheme(saved); } catch (e) {}
  $("#baseCurrency").textContent = FX.base;

  setLang(LANG);            // sets <html lang> from the persisted choice
  applyStaticI18n();        // translate nav / topbar / bottom-nav labels
  updateLangBtn();

  $("#langBtn").addEventListener("click", () => {
    setLang(LANG === "en" ? "zh" : "en");
    applyStaticI18n();
    updateLangBtn();
    render();               // re-render page content in the new language
  });

  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "light" : "dark");
    if (currentPageKey() === "settings") reflectThemeChoice();
  });
  $("#exportBtn").addEventListener("click", exportCashCSV);
  $("#addTxBtn").addEventListener("click", () => { location.hash = "#/transactions"; });
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#moreBtn").addEventListener("click", (e) => { e.preventDefault(); $("#sidebar").classList.toggle("open"); });

  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/dashboard";
  render();
}
document.addEventListener("DOMContentLoaded", init);
