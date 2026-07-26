/* =============================================================================
 * Investment Ledger — App (router + all pages)
 * Every figure is COMPUTED from the data module so numbers stay auditable.
 * ========================================================================== */
"use strict";

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
/* HTML-escapes user-entered text before it's interpolated into an innerHTML
 * template. This app has no framework auto-escaping, so every ticker, company
 * name, broker name, or note that came from a form field or CSV import MUST be
 * routed through this at render time — never trust it as already-safe markup. */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/* Plain text — matches the stored broker record exactly. CSV export needs the
 * raw value; anything rendering this into innerHTML must wrap it in esc().
 * Falls back to a clear label (not the raw internal id) for transactions or
 * holdings left behind after their broker was force-deleted with records
 * still attached — those rows are kept, not silently reassigned or dropped. */
const brokerName = (id) => (BROKERS.find((b) => b.id === id) || {}).name || t("Deleted broker");

/* Yahoo ticker suffix → [country, currency]. No suffix = United States. */
const MARKET_MAP = {
  KL: ["Malaysia", "MYR"], SI: ["Singapore", "SGD"], HK: ["Hong Kong", "HKD"], T: ["Japan", "JPY"],
  L: ["United Kingdom", "GBP"], AX: ["Australia", "AUD"], TO: ["Canada", "CAD"], V: ["Canada", "CAD"],
  SS: ["China", "CNY"], SZ: ["China", "CNY"], TW: ["Taiwan", "TWD"], TWO: ["Taiwan", "TWD"],
  KS: ["South Korea", "KRW"], KQ: ["South Korea", "KRW"], BK: ["Thailand", "THB"], JK: ["Indonesia", "IDR"],
  NS: ["India", "INR"], BO: ["India", "INR"], SW: ["Switzerland", "CHF"], PA: ["France", "EUR"],
  DE: ["Germany", "EUR"], F: ["Germany", "EUR"], MI: ["Italy", "EUR"], AS: ["Netherlands", "EUR"],
  MC: ["Spain", "EUR"], HE: ["Finland", "EUR"], ST: ["Sweden", "SEK"], OL: ["Norway", "NOK"], CO: ["Denmark", "DKK"],
};
function marketInfo(ticker) {
  const m = String(ticker || "").toUpperCase().match(/\.([A-Z]+)$/);
  if (m && MARKET_MAP[m[1]]) return { country: MARKET_MAP[m[1]][0], currency: MARKET_MAP[m[1]][1] };
  return { country: "United States", currency: "USD" };
}
// Prefer a stored country (from the stock lookup); fall back to the suffix map.
const countryForTicker = (ticker, stored) => stored || marketInfo(ticker).country;

/* Info icon for "how was this calculated" affordances — an SVG, not the ⓘ
 * Unicode glyph, so its size is pixel-exact everywhere instead of drifting
 * with whatever font a browser/OS substitutes for that character. */
// Solely a decorative marker in the insights/warning list (not a tooltip trigger) —
// every actual tooltip icon in the app, clickable or hover-only, uses COL_INFO_ICON_SVG
// now, so they render identically everywhere instead of two differently-weighted icons.
const HOW_ICON_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
/* The one info icon used everywhere: column header hints, calc-row hints, and the
 * clickable "how was this calculated" triggers alike — an SVG (not a text glyph) so
 * sizing is consistent across every font/OS. */
const COL_INFO_ICON_SVG = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
/* Shared small-status-line pattern ("Prices as of…", "Last saved…") — one
 * template (icon + muted text via .meta-note) instead of each spot inventing
 * its own inline style and placement. */
const CLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const SAVED_ICON_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 10.5 15 16 9"/></svg>`;
const metaNote = (svg, text) => `<span class="meta-note">${svg}<span>${text}</span></span>`;

const fmt = (n, opts = {}) => {
  const o = { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts };
  // Guard: Intl throws if min > max (e.g. share counts pass maximumFractionDigits: 0).
  if (o.maximumFractionDigits < o.minimumFractionDigits) o.minimumFractionDigits = o.maximumFractionDigits;
  return new Intl.NumberFormat("en-MY", o).format(n);
};
/* Display-only currency label — "MYR" reads as "RM" everywhere in the UI (the common
 * Malaysian convention), while the underlying data (FX.rates keys, transaction .currency
 * fields, CSV import/export, form values) all keep the standard ISO code "MYR" unchanged,
 * so FX lookups, re-imports and exported files stay correct and portable. */
const CCY_DISPLAY = { MYR: "RM" };
const ccyLabel = (ccy) => CCY_DISPLAY[ccy] || ccy;
const money = (n, ccy = FX.base) => `${ccyLabel(ccy)} ${fmt(n)}`;
const signed = (n) => n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : fmt(n);
const moneySigned = (n, ccy = FX.base) => n > 0 ? `+${ccyLabel(ccy)} ${fmt(n)}` : n < 0 ? `−${ccyLabel(ccy)} ${fmt(Math.abs(n))}` : `${ccyLabel(ccy)} ${fmt(n)}`;
const pctTxt = (n) => n > 0 ? `+${fmt(n, { maximumFractionDigits: 2 })}%` : n < 0 ? `−${fmt(Math.abs(n), { maximumFractionDigits: 2 })}%` : `${fmt(n, { maximumFractionDigits: 2 })}%`;
const cls = (n) => n > 0 ? "pos" : n < 0 ? "neg" : "";

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
  "Cash Ledger": "现金账本", "Dividends": "股息",
  "Brokers": "券商", "Settings": "设置", "Help": "帮助",
  "Base currency": "基准货币", "Add": "添加", "Add record": "添加记录", "More": "更多",
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
  "After withholding tax": "扣除预扣税后", "How this was calculated": "查看计算方式",
  // Panel titles
  "Portfolio Value Over Time": "组合价值走势", "Asset Allocation": "资产配置",
  "Top Holdings": "主要持仓", "Upcoming Dividends": "即将到来的股息",
  "Recent Transactions": "近期交易", "Holdings by Broker": "按券商分布",
  "Holdings by Currency": "按货币分布", "All Holdings": "全部持仓",
  "All Transactions": "全部交易", "Cash Ledger — Deposits & Withdrawals": "现金账本 — 存款与取款",
  "Broker Cash Reconciliation": "券商现金对账", "Dividend History": "股息历史",
  "Dividend History by Year": "年度股息历史", "Projected (this year)": "预计（今年）",
  "Dividend history by year": "年度股息历史图",
  "Profit / Loss by Holding": "按持仓盈亏", "Profit / Loss by Broker": "按券商盈亏",
  "Dividend Income by Year": "按年度股息收入",
  "Currency Gain / Loss": "汇率盈亏", "Export": "导出", "Add Broker": "添加券商", "Your Brokers": "您的券商",
  "Profile": "个人资料", "Appearance": "外观", "Base Currency": "基准货币",
  "Exchange Rates": "汇率", "Data Import / Export": "数据导入 / 导出", "Danger Zone": "危险操作",
  "Data Safety & Backup": "数据安全与备份",
  "Choose your theme. Dark mode uses a true-black background; light mode is the default design.": "选择您的主题。深色模式使用纯黑背景；浅色模式为默认设计。",
  "All transactions keep their original currency; base-currency values are derived using stored exchange rates and never overwrite the original.": "所有交易均保留其原始货币；基准货币金额由已存储的汇率换算得出，绝不会覆盖原始数值。",
  "Language": "语言",
  "Investing since": "投资起始日", "Default return view": "默认回报视图",
  // Table headers
  "Holding": "持仓", "Broker": "券商", "Bank": "银行", "Market": "市场", "Shares": "股数",
  "Avg Cost": "平均成本", "Price": "价格", "Cost Basis": "成本", "Market Value": "市值",
  "Unrealized P/L": "未实现盈亏", "Net Div": "净股息", "Ticker": "代码", "Stock code": "股票代号",
  "P/L %": "盈亏 %", "Return %": "回报 %",
  "Ex-Date": "除息日", "Payment": "派息日", "Expected Net": "预计净额", "Status": "状态",
  "The ex-dividend date — buy before it to qualify for the payment. This is what market data sources report; they don't give a separate payment date.": "除息日——须在此日期之前买入才符合领取资格。这是市场数据来源提供的日期；它们并未另外提供派息日期。",
  "A rough estimate of Ex-Date + 14 days (when the money would actually land), since market data reports only the ex-date, not a real payment date. A manually entered payment date is shown exactly as you typed it.": "除息日 + 14 天的粗略估算（资金大约到账的日期），因为市场数据只提供除息日，而非真实的派息日期。手动输入的派息日期则完全按您输入的显示。",
  "Date": "日期", "Type": "类型", "Qty": "数量", "Gross": "总额", "Fee": "费用",
  "Tax": "税", "Net (RM)": "净额 (RM)", "Net": "净额", "Amount": "金额",
  "Currency": "货币", "FX Rate": "汇率",
  "Calculated Balance": "计算余额", "Actual Balance": "实际余额", "Difference": "差额",
  "Country": "国家/地区", "Withholding Tax (RM)": "预扣税 (RM)",
  "Year": "年份", "Net Dividends": "净股息",
  // Links
  "View all →": "查看全部 →", "Calendar →": "日历 →", "All →": "全部 →",
  // Badges
  "By market value": "按市值", "By broker": "按券商", "By currency": "按货币",
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
  "Withholding Tax": "预扣税", "Save Transaction": "保存交易",
  "Hide": "隐藏", "Show": "显示", "Reset": "重置",
  "All brokers": "全部券商", "All markets": "全部市场", "All currencies": "全部货币",
  "All P/L": "全部盈亏", "Profit": "盈利", "Loss": "亏损",
  // Mini cards / dividend summary
  "Net Cash Added": "净增现金", "Gross Dividends (YTD)": "总股息（年初至今）",
  "Gross Dividends": "总股息",
  "Your data stays on this device and this browser only — nothing is shared or synced. If you're trying this out from a shared link, your entries are private to you and won't affect anyone else's. Opening the app on a different device starts a separate, empty ledger there too.": "您的数据仅保存在此设备和此浏览器中 — 不会被分享或同步。如果您是通过共享链接体验本应用，您输入的内容仅您可见，不会影响他人。在其他设备上打开本应用会是一个全新的空白账本。",
  "Forecast needs more data": "预测数据不足",
  "Investment Return Over Time": "投资回报随时间变化",
  "Incl. Dividends": "含股息",
  "All stocks": "所有股票", "Default order": "默认顺序", "Edit columns": "编辑列",
  "Dividend Income": "股息收入",
  // Settings
  "Name": "姓名", "Email": "邮箱", "Member since": "注册于",
  "Light": "浅色", "Dark": "深色", "Default design": "默认设计", "True black": "纯黑",
  "Export Cash CSV": "导出现金 CSV", "Export Transactions CSV": "导出交易 CSV",
  "Import CSV": "导入 CSV", "Delete Account": "删除账户",
  "⭳ Export Cash CSV": "⭳ 导出现金 CSV", "⭳ Export Transactions CSV": "⭳ 导出交易 CSV",
  "⭱ Import CSV": "⭱ 导入 CSV", "⭳ Cash Ledger CSV": "⭳ 现金账本 CSV",
  "⭳ Transactions CSV": "⭳ 交易 CSV", "⭳ Dividends CSV": "⭳ 股息 CSV",
  // Empty states
  "No holdings match these filters.": "没有符合筛选条件的持仓。",
  // Calc modal
  "Result": "结果",
  "Profit / Loss": "盈亏",
  "Net Dividends Received (after tax)": "净股息收入（税后）",
  "All values converted to base currency using stored exchange rates. Original amounts are preserved.":
    "所有数值均按存储的汇率换算为基准货币，原始金额保持不变。",
  // Add-broker note
  "Each broker keeps its own default currency and cash reconciliation.": "每个券商保留自己的默认货币与现金对账。",
  // Exchange-rate controls
  "Rates convert each currency to your base.": "汇率将每种货币换算为您的基准货币。",
  "Pull today's market rate or type your own.": "可拉取今日市场汇率，或自行输入。",
  "Currency code": "货币代码", "Rate to": "汇率对", "Add currency": "添加货币",
  "Refresh live rates": "刷新实时汇率", "base": "基准", "Remove": "移除",
  "Fetching…": "获取中…", "Fetching live rates…": "正在获取实时汇率…",
  "Live rates as of": "实时汇率截至", "updated": "项已更新", "added": "已添加", "exported": "已导出",
  "Dark theme applied": "已应用深色主题", "Light theme applied": "已应用浅色主题",
  "Couldn't reach the rate service — check your connection.": "无法连接汇率服务 — 请检查网络连接。",
  "Enter a 3-letter currency code.": "请输入 3 位货币代码。", "Enter a valid rate.": "请输入有效的汇率。",
  "Enter a rate greater than 0.": "请输入大于 0 的汇率。",
  "already has a rate — edit it in the list above instead.": "已有汇率 — 请在上方列表中编辑。",
  // Data entry — brokers / holdings / transactions
  "Broker name": "券商名称", "Default currency": "默认货币", "Broker added": "已添加券商",
  "Broker removed": "已移除券商", "This broker still has records. Remove it anyway?": "该券商仍有记录，仍要移除吗？",
  "Add a broker first (Brokers page), then you can add holdings.": "请先在「券商」页面添加券商，然后才能添加持仓。",
  "Add a broker first (Brokers page), then you can record transactions.": "请先在「券商」页面添加券商，然后才能记录交易。",
  "Company Name": "公司名称", "Current Price": "当前价格", "Add Holding": "添加持仓",
  "Holding added": "已添加持仓", "Holding removed": "已移除持仓",
  "records": "条记录", "Transaction added": "已添加交易",
  "DRIP recorded as 2 linked records: dividend + buy": "股息再投资已记录为两条关联记录：股息 + 买入",
  // Settings
  "Your name": "您的姓名", "Save profile": "保存资料", "Profile saved": "资料已保存",
  "Add a rate for that currency first.": "请先为该货币添加汇率。", "Base currency set to": "基准货币已设为",
  "CSV import is coming soon.": "CSV 导入即将推出。",
  "Clear all data": "清除所有数据",
  "Clearing removes all brokers, holdings and transactions saved in this browser. This cannot be undone.": "清除将删除本浏览器中保存的所有券商、持仓和交易，且无法撤销。",
  "Delete ALL your data from this browser? This cannot be undone.": "确定要删除本浏览器中的所有数据吗？此操作无法撤销。",
  "All data cleared": "已清除所有数据",
  // Stage 1 — empty states / onboarding
  "Nothing to show yet.": "暂无数据。",
  "No transactions yet. Add your first deposit or investment to begin.": "暂无交易。添加第一笔存款或投资即可开始。",
  "No holdings yet. Add a buy transaction to create your first holding.": "暂无持仓。添加一笔买入交易即可创建首个持仓。",
  "No portfolio history yet.": "暂无组合历史。", "Not enough history yet.": "暂无足够的历史数据。",
  "No holdings match these filters.": "没有符合筛选条件的持仓。",
  "Getting started": "开始使用", "Add a broker": "添加券商", "Record your first deposit": "记录第一笔存款",
  "Add your first buy transaction": "添加第一笔买入交易", "Add a current price": "添加当前价格", "Record a dividend": "记录一笔股息",
  "Record a Buy (or import an existing holding)": "记录一笔买入（或导入现有持仓）",
  "A few things to set up — click any step below to get started.": "还有几项设置待完成 — 点击下方任一步骤即可开始。",
  "Last saved on this device": "本设备最后保存", "Nothing saved yet": "尚未保存",
  // Return modes
  "Return mode": "回报模式", "Price return only": "仅价格回报", "Total return": "总回报",
  "Total Return = Unrealized P/L + Realized P/L + Net Dividends − fees": "总回报 = 未实现盈亏 + 已实现盈亏 + 净股息 − 费用",
  "Price Return = Unrealized P/L + Realized P/L − fees (excludes dividends)": "价格回报 = 未实现盈亏 + 已实现盈亏 − 费用（不含股息）",
  "Net Capital Invested = Deposits − Withdrawals": "净投入资本 = 存款 − 取款",
  "Net Dividends = Gross dividends − withholding tax": "净股息 = 总股息 − 预扣税",
  // Transaction types
  "Deposit": "存款", "Withdrawal": "取款", "Buy": "买入", "Sell": "卖出", "Dividend": "股息",
  "Fee": "费用", "Tax withholding": "预扣税", "Stock split": "拆股",
  "Transfer between brokers": "券商间转账", "Interest / cash yield": "利息 / 现金收益", "Interest": "利息", "FX conversion": "外汇兑换",
  // Form labels
  "optional": "可选", "Quantity / Shares": "数量 / 股数", "Gross dividend": "总股息",
  "From broker": "来源券商", "Dividend schedule": "股息时间表", "Exchange rate": "兑换汇率", "Auto-calculated": "自动计算", "Add note": "添加备注",
  "Reinvest Price / Share": "再投资单价", "Shares reinvested": "再投资股数", "Reinvested (DRIP)": "已再投资（DRIP）",
  "Withholding tax can't exceed the gross dividend.": "预扣税不能超过总股息。",
  "This is one half of a DRIP reinvestment. Its paired record won't be deleted automatically. Delete anyway?": "这是一笔股息再投资（DRIP）的其中一半记录，其配对记录不会自动删除。仍要删除吗？",
  "DRIP rows must be Received — a dividend can't be reinvested before it's paid.": "股息再投资（DRIP）行必须为「已收到」状态——股息在派发前无法进行再投资。",
  "This Buy has later Sell transactions for the same stock, and is also one half of a DRIP reinvestment whose paired record won't be deleted automatically. Deleting it will make those sells exceed shares held and distort realized P/L. Delete anyway?": "该买入交易有该股票的后续卖出交易，同时也是一笔股息再投资（DRIP）的其中一半记录，其配对记录不会自动删除。删除它会导致这些卖出超过持有股数并扭曲已实现盈亏。仍要删除吗？",
  "Enter an amount or stock code for the transfer.": "请输入金额或股票代号。",
  "Received": "已收到", "Expected": "预期", "Split ratio (new ÷ old)": "拆股比例（新 ÷ 旧）",
  "To broker": "转入券商", "Notes": "备注", "FX rate to": "汇率对",
  "Allow selling more shares than currently held (override)": "允许卖出超过当前持有的股数（覆盖）",
  "You only hold": "您仅持有", "shares — tick the override to sell more.": "股 — 勾选覆盖以卖出更多。",
  "Avg Cost per share": "每股平均成本", "blank = use current": "留空 = 使用当前汇率",
  "Use this only for investments you owned before you started tracking in Investment Ledger. New purchases should be entered as Buy transactions.": "仅用于您在开始使用 Investment Ledger 之前已持有的投资。新买入请记为买入交易。",
  "Add Opening Holding": "添加期初持仓", "Opening holding added": "已添加期初持仓",
  "Set current price": "设置当前价格", "Manual price": "手动价格", "No price set": "未设价格",
  "Current price per share for": "每股当前价格：", "manual, not live": "手动，非实时",
  "Enter a valid price.": "请输入有效价格。", "Price updated": "价格已更新",
  "Delete this transaction? Holdings and balances will be recalculated.": "删除此交易？持仓和余额将重新计算。",
  "Transaction removed": "已移除交易", "records": "条记录",
  "holdings without a current price": "个持仓没有当前价格", "no price": "无价格",
  "holdings have no current price set": "个持仓未设当前价格",
  // Cash / reconciliation
  "Holdings": "持仓", "Market Value": "市值", "Cash (calc)": "计算现金", "Difference": "差额",
  "Not checked": "未核对", "Matched": "已匹配", "Small difference": "小幅差异", "Needs review": "需复核",
  "Reconciliation": "现金核对", "More actions": "更多操作", "More details": "更多详情",
  "Show on Brokers page": "在券商页面显示",
  "Update": "更新", "Actual cash balance for": "实际现金余额：", "Note (optional)": "备注（可选）",
  "Reconciliation saved": "对账已保存", "Enter a valid number.": "请输入有效数字。",
  "Calculated from every recorded cash movement: deposits, withdrawals, buys, sells, dividends, fees, transfers and currency exchanges.": "计算值来自所有已记录的现金变动：存款、取款、买入、卖出、股息、费用、转账与货币兑换。",
  "Cash difference": "现金差异", "Calculated": "计算值", "vs actual": "对比实际", "difference": "差额",
  "Check for a missing fee, dividend or transfer.": "请检查是否漏记费用、股息或转账。",
  "A sell exceeds shares held for": "卖出超过持有股数：", "Use the oversell override if intentional.": "如有意为之，请使用超卖覆盖。",
  "holding(s) have no current price set — portfolio value uses cost as a placeholder.": "个持仓未设当前价格 — 组合价值暂用成本代替。",
  "Exchange rates were last updated": "汇率最后更新于", "days ago — refresh them in Settings.": "天前 — 请在设置中刷新。",
  // Settings — data safety
  "Tolerance": "容差", "Differences within this amount are treated as a small difference rather than needing review.": "此金额内的差异视为小幅差异，而非需复核。",
  "Tolerance saved": "容差已保存",
  "Your investment data is stored only in this browser on this device. Clearing browser data may remove it. Export a JSON backup regularly.": "您的投资数据仅保存在本设备的此浏览器中。清除浏览器数据可能会将其删除。请定期导出 JSON 备份。",
  "Export full backup (JSON)": "导出完整备份 (JSON)", "Import backup (JSON)": "导入备份 (JSON)",
  "Export Transactions CSV": "导出交易 CSV", "Export Cash CSV": "导出现金 CSV", "Export Dividends CSV": "导出股息 CSV",
  "Load demo data": "加载演示数据", "Demo data loaded": "已加载演示数据",
  "This will replace your current data with demo data. Continue?": "这将用演示数据替换您当前的数据。是否继续？",
  "This replaces your current data with this backup file. Export your current data first if you want to keep it. Continue?": "此操作将用该备份文件替换您当前的数据。如需保留当前数据，请先导出备份。是否继续？",
  "That file isn't valid JSON.": "该文件不是有效的 JSON。", "That doesn't look like an Investment Ledger backup.": "该文件看起来不是 Investment Ledger 的备份文件。", "Backup restored": "备份已恢复",
  "Type DELETE to confirm": "输入 DELETE 确认", "Type DELETE to confirm.": "请输入 DELETE 确认。",
  "Clearing removes all brokers, holdings and transactions saved in this browser. This cannot be undone — export a backup first.": "清除会删除本浏览器中保存的所有券商、持仓和交易，且无法撤销 — 请先导出备份。",
  "Backup downloaded": "备份已下载", "Backup restored": "备份已恢复",
  "That file isn't valid JSON.": "该文件不是有效的 JSON。",
  "That doesn't look like an Investment Ledger backup.": "这看起来不是 Investment Ledger 的备份。",
  "For personal record-keeping only. Not financial, tax, or investment advice.": "仅供个人记录之用。并非财务、税务或投资建议。",
  "Welcome to Investment Ledger": "欢迎使用 Investment Ledger",
  "steps done": "步已完成",
  // Live prices
  "Refresh live prices": "刷新实时价格", "Fetch live price": "获取实时价格", "Live": "实时",
  "Fetching prices": "正在获取价格", "prices updated": "个价格已更新", "updated": "已更新",
  "Couldn't fetch prices — check the ticker symbols (Yahoo format).": "无法获取价格 — 请检查股票代码（Yahoo 格式）。",
  "Couldn't fetch": "无法获取", "check the symbol (e.g. AAPL, 1155.KL).": "请检查代码（例如 AAPL、1155.KL）。",
  "Live prices only work on the deployed site (or with vercel dev).": "实时价格仅在已部署的网站上可用（或使用 vercel dev）。",
  "Live prices are over 2 days old for": "以下实时价格已超过 2 天：",
  "refresh them on the Portfolio page.": "请在「投资组合」页面刷新。",
  // Ticker auto-lookup
  "Looking up…": "查询中…", "No match — you can enter the details manually.": "未找到匹配 — 您可手动输入信息。",
  "Auto-lookup works on the deployed site.": "自动查询在已部署的网站上可用。",
  "Live lookup only works on your deployed website, not when you open the file locally. Commit, push, and try it on your Vercel URL.": "实时查询仅在您已部署的网站上可用，本地打开文件时无法使用。请提交、推送后在您的 Vercel 网址上尝试。",
  "check the code, or that /api is deployed on Vercel.": "请检查代码，或确认 /api 已部署到 Vercel。",
  // P0 — edit / validation / currency exchange / negative cash
  "Edit Transaction": "编辑交易", "Edit": "编辑",
  "Update Transaction": "更新交易", "Transaction updated": "交易已更新",
  "From amount": "兑出金额", "Exchange rate (To ÷ From)": "汇率（兑入 ÷ 兑出）",
  "To currency": "兑入货币", "To amount": "兑入金额",
  "Enter a ticker.": "请输入股票代码。", "Enter a quantity greater than 0.": "请输入大于 0 的数量。",
  "Enter a price greater than 0.": "请输入大于 0 的价格。", "Enter a gross dividend greater than 0.": "请输入大于 0 的总股息。",
  "Enter a split ratio greater than 0.": "请输入大于 0 的拆股比例。", "Enter an amount greater than 0.": "请输入大于 0 的金额。",
  "Choose a different destination broker.": "请选择不同的目标券商。", "Enter an amount to convert.": "请输入要兑换的金额。",
  "Enter an exchange rate.": "请输入汇率。", "Choose a different destination currency.": "请选择不同的目标货币。",
  "Enter an exchange rate greater than 0.": "请输入大于 0 的汇率。",
  "Fee can't be negative.": "费用不能为负数。", "Tax can't be negative.": "税费不能为负数。",
  "Enter a number of shares greater than 0.": "请输入大于 0 的股数。",
  "Enter an average cost of 0 or more.": "请输入不小于 0 的平均成本。",
  "Negative cash balance": "现金余额为负",
  "A buy, fee or withdrawal exceeds the cash recorded for this broker. Add a deposit or check the entries.": "买入、费用或取款超过了该券商记录的现金。请添加存款或检查记录。",
  "Realized gain/loss from": "已实现盈亏，来自", "currency-exchange transaction(s), valued at current rates.": "笔货币兑换交易，按当前汇率估值。",
  // Phase 0/1 — brokers, taxes, XIRR, forecast, analytics
  "Taxes": "税费", "Accounts": "账户",
  "Archive": "归档", "Unarchive": "取消归档", "Archived": "已归档",
  "Show archived": "显示已归档", "Hide archived": "隐藏已归档",
  "Update Broker": "更新券商", "Edit Broker": "编辑券商", "Broker updated": "已更新券商",
  "Dividends paid to": "股息派发至", "Paid to": "派发至",
  "Broker account (adds to cash)": "券商账户（计入现金）", "Bank account (income only)": "银行账户（仅计入收入）",
  "Where this broker's dividends land by default — used when auto-logging market dividends.": "此券商股息默认派发的去向——用于自动登记市场股息记录时的判断依据。",
  "Default dividend tax rate": "默认股息预扣税率",
  "Applied to dividends auto-logged from market history at this broker — e.g. 30 for US stocks held without a tax treaty, 0 for Malaysian stocks. You can always edit the tax on an individual dividend afterward.": "适用于此券商自动登记的市场股息记录——例如无税务协定的美股填 30，马来西亚股票填 0。之后仍可在个别股息记录上自行修改税额。",
  "Applied to dividends auto-logged from market history at this broker.": "适用于此券商自动登记的市场股息记录。",
  "Broker archived": "券商已归档", "Broker unarchived": "已取消归档", "Enter a broker name.": "请输入券商名称。",
  "No brokers yet — every transaction and holding needs one.": "暂无券商 — 每笔交易和每笔持仓都需要归属于一个券商。",
  "This broker still has records. Remove it anyway? (Consider Archive instead.)": "该券商仍有记录。仍要删除吗？（建议改为归档。）",
  "Deleted broker": "已删除的券商",
  "Money-weighted annual return": "资金加权年化回报",
  "XIRR = the annual rate that makes the net present value of your dated deposits, withdrawals and today's account value equal zero.": "XIRR = 使您的带日期存款、取款与今日账户总值的净现值为零的年化利率。",
  "XIRR (money-weighted return)": "XIRR（资金加权回报）",
  "Deposits = cash in (−), Withdrawals = cash out (+)": "存款 = 现金流入（−），取款 = 现金流出（+）",
  "Terminal value today = holdings + cash": "今日终值 = 持仓 + 现金",
  "Solved so discounted flows net to 0": "求解使折现现金流之和为 0",
  "Not enough cash-flow history": "现金流历史不足",
  "Run-rate estimate from your trailing-12-month dividends": "基于过去 12 个月股息的运行率估算",
  "Estimate only — not a guarantee.": "仅为估算 — 并非保证。",
  "Next Month (est.)": "下月（估）", "Next Quarter (est.)": "下季（估）", "Next Year (est.)": "下年（估）",
  "Next Month": "下月", "Next Quarter": "下季", "Next Year": "下年",
  "Year 2": "第 2 年", "Year 3": "第 3 年",
  "Based on payment patterns and upcoming dividends.": "基于股息历史规律及即将派息数据。",
  "Record at least 2 dividends for any holding to enable pattern-based estimates.": "请为任一持仓至少录入 2 次股息，以启用规律预测。",
  "Received TTM": "过去 12 个月已收",
  "monthly": "每月", "quarterly": "每季", "semi-annual": "每半年", "annual": "每年",
  "Pattern detected for": "已侦测到规律", "payment": "次派息",
  "Pattern detected": "已侦测到规律", "from market dividend history": "来自市场股息历史",
  "from your logged dividends": "来自您记录的股息", "Record at least 2 dividends for this holding to enable pattern-based estimates.": "请为此持仓至少录入 2 次股息，以启用规律预测。",
  "div.": "股息",
  "No upcoming dividends yet. Add them manually when recording a dividend, or they'll appear automatically once market data is connected.": "暂无即将派发的股息。记录股息时可手动添加，或在连接市场数据后自动显示。",
  "No upcoming dividends yet. Add one manually when recording a dividend.": "暂无即将派发的股息。记录股息时可手动添加一笔。",
  "Upcoming confirmed dividends in window": "窗口内已确认的即将派息",
  "Add upcoming dividend for": "添加即将派息：", "Per share": "每股金额",
  "Upcoming dividends will appear here once connected.": "连接后，即将派息将显示于此。",
  "Checking dividend schedules…": "正在查询股息日程…",
  "next month": "下月", "next quarter": "下季", "next year": "下年",
  "How is the forecast calculated?": "预测是如何计算的？",
  "Net Dividends (Lifetime)": "净股息（累计）", "Month": "月份", "Quarter": "季度",
  "Dividend Forecast": "股息预测",
  // Holding detail
  "Back to Portfolio": "返回投资组合", "Holding detail": "持仓明细",
  "Shares Held": "持有股数", "Average Cost": "平均成本", "share": "股",
  "Set price": "设置价格", "Realized P/L": "已实现盈亏", "Net Dividends": "净股息",
  "Set Price": "设置价格", "Price per share": "每股价格", "Save": "保存",
  "Manually entered prices are always labelled \"Manual price\" and are never mistaken for live market data.": "手动输入的价格始终标记为「手动价格」，绝不会与实时市场数据混淆。",
  "price": "价格", "FX": "汇率", "Manual": "手动",
  "Transactions": "交易记录",
  "No transactions for this holding.": "此持仓暂无交易。",
  "No dividends recorded for this holding.": "此持仓暂无股息记录。",
  "This holding no longer exists (fully sold or deleted). Its realized P/L still counts in your totals.": "此持仓已不存在（已全部卖出或删除）。其已实现盈亏仍计入您的总额。",
  "Next Dividend": "下一次派息", "est.": "预估", "for your": "适用于您的", "shares": "股", "estimated": "预估值",
  "Last paid": "上次派发", "Per Share": "每股", "Est. for your shares": "您持股的预估金额",
  "Your Recorded Dividends": "您记录的股息", "Dividend Calendar": "股息日历", "Amount (your shares)": "金额（您的持股）",
  "Market record": "市场记录",
  "Past": "过去", "Upcoming": "即将到来", "Yield": "收益率", "Next payment": "下一次派息",
  "No dividends yet. Record one, or they'll appear automatically once market data is connected.": "暂无股息记录。可手动添加，或在连接市场数据后自动显示。",
  "No dividends yet. Record one to get started.": "暂无股息记录。添加一笔即可开始。",
  "Buy before this date to qualify for this dividend — buy on or after it and you'll miss this specific payment. This is the ex-dividend date; market data sources don't report a separate payment date.": "您必须在此日期之前买入才能符合领取此次股息的资格——若在此日期当天或之后才买入，将无法领取这次派息。这是除息日；市场数据来源并未提供另外的派息（入账）日期。",
  "A rough estimate (Ex-Date + 14 days) of when the money would actually land in your account — not real data, since market sources don't report an actual payment date.": "这是款项实际入账时间的粗略估计（除息日 + 14 天）——并非真实数据，因为市场数据来源并未提供实际派息（入账）日期。",
  "Est. Payment": "预估派息日",
  "Not logged": "尚未记录",
  "Auto-logged from market dividend history — review the tax withheld and \"Paid to\".": "已根据市场股息记录自动登记——请自行核对预扣税金额及「派发至」设定。",
  "Auto-logged from market dividend history — review the tax withheld, \"Paid to\", and FX rate (this uses today's rate, not the rate on the payment date).": "已根据市场股息记录自动登记——请自行核对预扣税金额、「派发至」设定及汇率（此处使用今日汇率，而非派发当日汇率）。",
  "dividends auto-logged from market history": "笔股息已根据市场记录自动登记",
  "Position": "持仓概况", "Position opened": "持仓建立于",
  "unrealized P/L, realized P/L and dividends will build up over time.": "未实现盈亏、已实现盈亏和股息将随时间累积。",
  "Full trade history for this holding": "此持仓的完整交易记录",
  "Dividends you've manually logged for this holding": "您为此持仓手动记录的股息",
  "Real dividend payments for this stock (fetched automatically from market data) flowing into the confirmed/estimated payments used for the forecast above.": "此股票的真实派息记录（自动从市场数据获取）延续至以上预测所用的已确认／预估派息款项。",
  "Real dividend payments across your whole portfolio (fetched automatically from market data) flowing into the confirmed/estimated payments used for the forecast above.": "您整个投资组合的真实派息记录（自动从市场数据获取）延续至以上预测所用的已确认／预估派息款项。",
  "This payment as a % of the current share price — a per-payment figure, not the annualized TTM yield shown above. Identical values across rows reflect a flat, no-growth projection, not an error.": "此次派息占目前股价的百分比——为单次派息数值，并非以上显示的年化 TTM 收益率。多行数值相同，是因为预测採用无增长的平稳预估，并非错误。",
  "The date by which you must already own the stock to receive this dividend. Buy on or after this date and you won't get this particular payment.": "您必须在此日期之前已持有该股票才能获得此次股息。若在此日期当天或之后才买入，将无法获得这次派息。",
  // Multi-currency cash + FX split fixes
  "To amount (received)": "兑入金额（收到）", "Implied rate": "隐含汇率",
  "Enter the amount you received.": "请输入您收到的金额。",
  "Cash Balances by Currency": "按货币的现金余额", "Balance": "余额",
  "Unrealized FX translation on foreign holdings.": "外币持仓的未实现汇率折算。",
  "Price-only unrealized": "仅价格未实现", "Total unrealized = price + FX.": "未实现合计 = 价格 + 汇率。",
  "This Buy has later Sell transactions for the same stock. Deleting it will make those sells exceed shares held and distort realized P/L. Delete anyway?":
    "此买入之后还有同一股票的卖出交易。删除它会使那些卖出超过持有股数并扭曲已实现盈亏。仍要删除吗？",
  // Phase 2 — Allocation (F2)
  "Allocation": "配置", "By Country": "按国家", "By Sector": "按行业",
  "By Currency": "按货币", "By Brokerage": "按券商", "No priced holdings yet.": "暂无已定价持仓。",
  "Group": "分组", "Value": "市值", "%": "%",
  // Phase 2 — Portfolio Health (F6)
  "Portfolio Health": "投资组合健康度", "Best / Worst": "最优 / 最差",
  "Dividend Yield (TTM)": "股息率（近12个月）", "Cash Allocation": "现金占比",
  "Yield on Cost": "成本股息率",
  "Based on what you originally paid (your average cost), not today's market value — shows the effective income dividend growth has earned you over time on your original investment.": "以您原始买入成本（平均成本）计算，而非目前市值——反映股息增长为您原始投资带来的实际收益率。",
  "Diversification Score": "分散度评分", "effective holdings": "有效持仓数",
  "none": "无", "of total net value": "占净资产总额",
  "Trailing 12-month net dividends ÷ current portfolio market value.": "近12个月净股息 ÷ 当前持仓市值。",
  "Cash as a percentage of total net value (market value + available cash).": "现金占总净值百分比（市值 + 可用现金）。",
  "Effective N score based on portfolio weights. Higher = more diversified.": "基于投资组合权重的有效N值。越高，越分散。",
  "Holdings": "持仓",
  "Lifetime Net Dividends": "累计净股息", "Realized Return": "已实现收益",
  "Unrealized Return": "未实现收益", "Total Return": "总收益",
  "Total Deposits": "存款总额", "Total Withdrawals": "取款总额", "Net Cash Added": "净投入现金",
  "Total Fees": "费用总额", "Total Interest": "利息总额", "Total Transferred": "转账总额", "Transfer": "转账",
  "Deposits & Withdrawals by Broker": "各券商存取款", "Deposits": "存款", "Withdrawals": "取款", "Net": "净额",
  "Monthly": "按月", "Quarterly": "按季", "Annual": "按年",
  // Phase 2 — Holding Detail extras (F1)
  "Cost Basis Over Time": "成本随时间变化", "Dividend Income Over Time": "股息收入随时间变化",
  "Cumulative cost — historical market prices are not stored.": "累计成本 — 不存储历史市场价格。",
  "Add at least two trades to see a trend.": "至少需要两笔交易才能显示趋势。",
  "Not enough dividend history yet.": "股息历史不足。",
  "Dividend Summary": "股息汇总", "Total Dividends Received": "已收股息合计",
  "Next Year (est.)": "明年（预估）",
  "Forecast is a run-rate estimate from this holding's trailing-12-month dividends.": "预测基于此持仓近12个月股息的年化估算。",
  "Upcoming Dividends": "即将派发股息", "Expected Net": "预期净额", "Cost Basis": "成本基础",
  // Phase 2 — Settings (F4)
  "Preferences": "偏好设置", "Date format": "日期格式", "Time zone": "时区",
  "Device local": "设备本地", "Cost Basis Method": "成本计算方法", "Method": "方法",
  "Average Cost": "平均成本法",
  "Time zone is used as a display reference for dates; stored dates are never altered.": "时区仅用作日期的显示参考；存储的日期不会被更改。",
  "Average Cost is the active method for all gain/loss figures. More methods, including FIFO, are planned for a future update.": "所有盈亏数字均采用平均成本法。更多方法（包括先进先出法）将在未来版本中推出。",
  "Preferences saved": "偏好已保存",
  // Phase 2 — CSV Import (F5)
  "Import from CSV": "从 CSV 导入", "Download CSV template": "下载 CSV 模板", "Upload CSV": "上传 CSV",
  "Bulk-add transactions (deposits, withdrawals, buys, sells, dividends) from a spreadsheet. Download the template, fill it in, then upload to preview before anything is saved.": "从电子表格批量添加交易（存款、取款、买入、卖出、股息）。下载模板填写后上传，保存前可先预览。",
  "The file has no data rows.": "文件没有数据行。",
  "Missing required columns: Date, Broker and Type.": "缺少必填列：日期、券商和类型。",
  "Date must be YYYY-MM-DD": "日期必须为 YYYY-MM-DD", "Unknown broker": "未知券商",
  "Unsupported type": "不支持的类型", "No FX rate for": "没有汇率：",
  "Quantity required": "需要数量", "Price required": "需要价格", "Ticker required": "需要代码",
  "Amount required": "需要金额", "Could not read that file.": "无法读取该文件。",
  "rows ready to import": "行可导入", "rows": "行", "ready": "就绪", "with errors": "有错误",
  "Ready": "就绪", "Ccy": "货币", "Status": "状态", "Amount": "金额",
  "Import valid rows": "导入有效行", "Cancel": "取消",
  "Rows with errors are skipped. Fix them in your spreadsheet and re-upload.": "有错误的行将被跳过。请在电子表格中修正后重新上传。",
  "No valid rows to import.": "没有可导入的有效行。", "transactions imported": "笔交易已导入",
  // F5 round 2 — exchange/transfer/dups/broker-create
  "To Currency must differ": "兑入货币必须不同", "To Amount required": "需要兑入金额",
  "To Broker must differ": "目标券商必须不同", "Unknown To Broker": "未知目标券商",
  "Create broker first": "请先创建券商", "Duplicate — skipped": "重复 — 已跳过",
  "duplicate": "重复", "need broker": "缺券商", "Duplicate": "重复",
  "Missing brokers": "缺少券商", "Create": "创建", "broker(s)": "个券商",
  "broker(s) created": "个券商已创建", "brokers created": "个券商已创建",
  "Duplicates already in your ledger are skipped automatically.": "账本中已存在的重复项将被自动跳过。",
  // Report panel titles + table headers (translateDOM text-node matches)
  "Export": "导出", "Cash Ledger CSV": "现金账本 CSV", "Transactions CSV": "交易 CSV", "Dividends CSV": "股息 CSV",
  "Deposits": "存款", "Withdrawals": "取款", "Currency Exchanges": "货币兑换",
  "Profit / Loss by Broker": "按券商盈亏",
  "Month": "月份", "Quarter": "季度", "Year": "年份",
  "Shares": "股数", "Avg Cost": "平均成本", "Market Value": "市值", "Unrealized": "未实现",
  "Date": "日期", "Type": "类型", "Ticker": "代码", "Broker": "券商",
  "on net capital": "占净投入资本", "money-weighted": "资金加权", "on cost": "占成本",
  "Portfolio Value Over Time": "投资组合市值随时间变化",
  "Captured once per day when you use the app.": "每次使用应用时每日记录一次。",
  "Record your first deposit or Buy to start tracking.": "记录第一笔存款或买入以开始追踪。",
  // Refactor — 5-item nav, More sheet, Records, Add flow, dashboard hero
  "More": "更多",
  "All transactions, cash & dividends": "所有交易、现金与股息",
  "Accounts & reconciliation": "账户与对账",
  "Currency, preferences, import & backup": "货币、偏好、导入与备份",
  "Guides & FAQ": "指南与常见问题",
  "All": "全部", "Buy / Sell": "买入 / 卖出", "Cash": "现金", "FX": "外汇",
  "records": "条记录", "Amount (RM)": "金额（RM）",
  "No records in this view yet.": "此视图暂无记录。",
  "No transactions yet. Tap ＋ Add to record your first deposit or investment.": "暂无交易。点击 ＋ 添加，记录您的第一笔存款或投资。",
  "fee": "费用", "Available Cash": "可用现金", "Can invest or withdraw": "可用于投资或提取",
  "What do you want to record?": "您想记录什么？", "Other": "其他",
  "Asset type": "资产类型", "Stock": "股票", "ETF": "ETF", "REIT": "房地产投资信托（REIT）",
  "Bond": "债券", "Unit Trust": "单位信托基金", "By type": "按类型",
  "Asset type saved": "资产类型已保存",
  "Pick a type, then fill only what's needed.": "先选择类型，然后只填写所需字段。",
  "Pick what to record": "选择要记录的内容", "Change type": "更改类型", "Withdraw": "取款",
  "Fees, taxes & details": "费用、税费与明细", "Go to Brokers": "前往券商",
  "Add a broker first (More → Brokers), then you can record transactions.": "请先添加券商（更多 → 券商），然后才能记录交易。",
  "Add a transaction": "添加交易", "Edit": "编辑", "Record a transaction": "记录一笔交易",
  "All your transactions, cash and dividends in one ledger.": "所有交易、现金和股息集中在一个账本中。",
  "Pick a type, then fill only what's needed.": "先选择类型，然后只填写所需字段。",
  // Dashboard hero
  "Net Worth": "净资产", "Total P/L": "总盈亏", "Price P/L": "价格盈亏", "how": "如何计算",
  "Total": "总计", "Price": "价格", "Across all brokers": "所有券商合计", "Deposits − Withdrawals": "存款 − 取款",
  "Open Brokers and add your investment app first — every transaction belongs to a broker.": "先打开「券商」添加您的投资平台 — 每笔交易都属于某个券商。",
  // Dashboard table headers + empty states (full EN/中文 coverage)
  "Days": "距今天数", "Ex-Date": "除息日", "Payment": "付款日", "Expected Net": "预期净额",
  "Holding": "持仓", "Market": "市场", "Net Div": "净股息", "Current Price": "现价",
  "Avg Cost": "平均成本", "Market Value": "市值", "Unrealized P/L": "未实现盈亏",
  "Price Return": "价格回报", "52-Week Range": "52周区间",
  "Current": "当前", "Low": "最低", "High": "最高",
  "No upcoming dividends.": "暂无即将派发的股息。",
  "No activity yet.": "暂无记录。",
  "No holdings yet — add a Buy to get started.": "暂无持仓 — 添加一笔买入即可开始。",
  // Prices freshness + cash breakdown
  "Prices as of": "价格截至", "Update prices": "更新价格", "No prices set yet": "尚未设置价格",
  "Set prices": "设置价格", "No cash movements recorded yet": "暂无现金流水记录",
  // Portfolio page
  "All brokers": "所有券商", "All markets": "所有市场", "All currencies": "所有货币", "All P/L": "所有盈亏",
  "Profit": "盈利", "Loss": "亏损", "Reset": "重置",
  "Add opening holding": "添加期初持仓", "Add Opening Holding": "添加期初持仓",
  "What you own": "持有内容", "Where & how much": "账户与数量", "Cost basis": "成本基础",
  "As-of date": "截至日期", "Current price": "现价", "optional — for instant P/L": "可选 — 用于即时盈亏",
  "No holdings yet. Record a Buy in Records, or add an opening holding below.": "暂无持仓。在「记录」中记一笔买入，或在下方添加期初持仓。",
  "Add a broker first (More → Brokers), then record a Buy or add an opening holding.": "请先添加券商（更多 → 券商），然后记录买入或添加期初持仓。",
  "Import existing holdings": "导入现有持仓",
  "Positions you held before tracking — click to open": "开始记录前已持有的仓位 — 点击展开",
  "No holdings yet — record a Buy on the Add page and it appears here automatically.": "暂无持仓 — 在「添加」页记录一笔买入，它会自动出现在此。",
  "Record your first Buy": "记录首笔买入",
  "Add a broker first (More → Brokers), then record a Buy and it appears here.": "请先添加券商（更多 → 券商），然后记录买入，它会出现在此。",
  "Add a broker first (More → Brokers), then you can import holdings.": "请先添加券商（更多 → 券商），然后即可导入持仓。",
  "Add a broker": "添加券商",
  "You need a broker before you can record transactions — every transaction belongs to a broker.": "记录交易前需要先添加券商 — 每笔交易都属于某个券商。",
  "Your only broker is archived. Add (or restore) an active broker to record transactions.": "您唯一的券商已归档。请添加（或恢复）一个有效券商以记录交易。",
  "More currencies…": "更多货币…", "Search currency…": "搜索货币…", "No matching currency": "无匹配货币",
  "Pick a different currency for the exchange.": "请为兑换选择不同的货币。",
  "Saved ✓": "已保存 ✓", "Add more holdings to score": "添加更多持仓以评分",
  "No dividends recorded yet": "尚未记录股息", "Nothing to allocate yet": "暂无可分配项目",
  "No dividend income yet. Record one to start tracking it over time.": "尚无股息收入记录。记录一笔即可开始追踪其变化趋势。",
  "No cash recorded yet.": "尚未记录现金。",
  "added at the live rate": "已按实时汇率添加", "added — set its rate in Settings": "已添加 — 请在设置中设定其汇率",
  "Buys (incl. fees & tax)": "买入（含费用与税）", "Sells (net of fees)": "卖出（扣除费用）",
  "Net dividends received": "已收净股息", "Standalone fees": "独立费用",
  "FX revaluation of foreign cash": "外币现金的汇率重估",
  "Holdings": "持仓", "Principal Invested": "已投入本金", "Dividends YTD": "今年至今股息",
  "By market value": "按市值", "Calendar": "日历", "View all": "查看全部", "Recent Activity": "近期活动",
  "View the full holdings table": "查看完整持仓表",
  "Top Holdings": "主要持仓", "Asset Allocation": "资产配置", "Upcoming Dividends": "即将派发股息",
  // Misc
  "Portfolio": "投资组合",
  // Cloud Sync
  "Account & Cloud Sync": "账户与云同步",
  "Cloud sync isn't set up for this deployment yet.": "此部署尚未配置云同步。",
  "Signed in as": "登录身份",
  "Last synced to cloud": "上次同步到云端",
  "Not yet synced": "尚未同步",
  "Sync now": "立即同步",
  "Sign out": "退出登录",
  "Send magic link": "发送登录链接",
  "Check": "请查收", "for a sign-in link.": "邮箱中的登录链接。",
  "Couldn't send the link — try again.": "链接发送失败 — 请重试。",
  "Synced.": "已同步。",
  "Signed out.": "已退出登录。",
  "Synced from your account.": "已从您的账户同步。",
  "Your data was uploaded to your account.": "您的数据已上传到账户。",
  "Finish choosing which data to keep": "请完成数据保留选择",
  "Choose which data to keep": "选择要保留的数据",
  "Both this device and your account already have data. Pick one to continue — the other side will be replaced.": "此设备和您的账户都已有数据。请选择其中一方继续 — 另一方的数据将被替换。",
  "This device": "此设备", "Your account": "您的账户",
  "Keep this device, upload it": "保留此设备的数据并上传",
  "Use my account's data": "使用账户中的数据",
  "Your data was updated from another device. Pull the latest before making more changes here, or you'll overwrite it.": "您的数据已在其他设备上更新。请先拉取最新数据，否则继续编辑将覆盖它。",
  "Cloud Sync is on — your data syncs to your account and is available on any device you sign into.": "云同步已开启 — 您的数据会同步到账户，并可在您登录的任何设备上使用。",
  "Your data also syncs to your account while you're signed in, so clearing browser data won't lose it — but a JSON backup is still recommended.": "登录状态下您的数据也会同步到账户，因此清除浏览器数据不会丢失它 — 但仍建议定期导出 JSON 备份。",
  "Local data from a previous account was cleared before syncing this account.": "同步此账户前，已清除上一账户遗留在本设备的数据。",
  "You have a change on this device that hasn't finished syncing yet. Pulling now will discard it. Continue?": "此设备上有一项更改尚未同步完成。现在拉取将丢弃该更改，是否继续？",
  "Couldn't upload to your account — check your connection and try again.": "上传到您的账户失败 — 请检查网络连接后重试。",
  "Couldn't sync — check your connection and try again.": "同步失败 — 请检查网络连接后重试。",
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
  if (!y || !m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  switch ((typeof SETTINGS !== "undefined" && SETTINGS.dateFormat) || "D MMM YYYY") {
    case "YYYY-MM-DD": return `${y}-${pad(m)}-${pad(d)}`;
    case "DD/MM/YYYY": return `${pad(d)}/${pad(m)}/${y}`;
    case "MM/DD/YYYY": return `${pad(m)}/${pad(d)}/${y}`;
    default:           return `${d} ${months[m - 1]} ${y}`;
  }
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt)) return iso;
  // Date and time must come from the same clock — extracting the date via toISOString()
  // (UTC) while reading the time via toTimeString() (local) could show a date/time pair
  // that don't actually belong together (e.g. a UTC date paired with a local time from a
  // different calendar day) for any timezone ahead of UTC.
  return `${fmtDate(dateToISO(dt))}, ${dt.toTimeString().slice(0, 5)}`;
}
/* "Today" honouring SETTINGS.timeZone (blank = device local). Used for every
 * day-count / forecast window so the Time Zone preference actually takes effect. */
function todayParts() {
  const tz = (typeof SETTINGS !== "undefined" && SETTINGS.timeZone) || "";
  const d = new Date();
  if (tz) {
    try {
      const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const [y, m, day] = s.split("-").map(Number);
      if (y && m && day) return { y, m, day };
    } catch (e) { /* invalid tz → fall back to local */ }
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}
function todayDate() { const p = todayParts(); return new Date(p.y, p.m - 1, p.day); }
function todayISO() { const p = todayParts(); const z = (n) => String(n).padStart(2, "0"); return `${p.y}-${z(p.m)}-${z(p.day)}`; }
/* Format a Date object as its LOCAL calendar-date string (YYYY-MM-DD) — the safe way to turn
 * a Date back into a string after arithmetic like setDate()/setFullYear(). Never use
 * toISOString() for this: it converts to UTC, which silently shifts the date back a day for
 * any timezone ahead of UTC (e.g. Malaysia/UTC+8) — local midnight becomes the previous UTC
 * day, so toISOString() reports that previous day instead of the intended one. */
function dateToISO(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function daysSince(iso) {
  if (!iso) return Infinity;
  const dt = new Date(iso);
  if (isNaN(dt)) return Infinity;
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

/* =============================================================================
 * XIRR — money-weighted return on dated EXTERNAL cash flows.
 * Convention: money you put IN = negative; money you take OUT = positive; the
 * current account value (holdings MV + cash) is a positive terminal flow today.
 * Dividends/fees/trades are INTERNAL (already inside the terminal value) so they
 * are NOT separate flows. Solved with Newton-Raphson, bisection fallback.
 * ========================================================================== */
function xirr(flows) {
  const amts = flows.map((f) => f.amount);
  if (!amts.some((a) => a > 0) || !amts.some((a) => a < 0)) return null;  // need both signs
  const t0 = flows[0].date.getTime();
  const yrs = flows.map((f) => (f.date.getTime() - t0) / (365 * 86400000));
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  const dnpv = (r) => flows.reduce((s, f, i) => s - yrs[i] * f.amount / Math.pow(1 + r, yrs[i] + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 80; i++) {
    const f = npv(r), d = dnpv(r);
    if (Math.abs(f) < 1e-7) return r;
    if (!d) break;
    let nx = r - f / d;
    if (nx <= -0.9999) nx = -0.9999 + 1e-6;
    if (!isFinite(nx)) break;
    if (Math.abs(nx - r) < 1e-10) return nx;
    r = nx;
  }
  // Bisection fallback over [-0.9999, 10]
  let lo = -0.9999, hi = 10, flo = npv(lo);
  if (!isFinite(flo)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}
function xirrPercent(txns, terminalValue) {
  const flows = [];
  txns.forEach((tx) => {
    const fx = (tx.fxRate != null && tx.fxRate !== "") ? +tx.fxRate : (FX.rates[tx.currency] || 1);
    const myr = (+tx.gross || 0) * fx;
    if (tx.type === "Deposit") flows.push({ date: new Date(tx.date), amount: -myr });
    else if (tx.type === "Withdrawal") flows.push({ date: new Date(tx.date), amount: myr });
  });
  if (!flows.length) return null;
  flows.push({ date: new Date(), amount: terminalValue });
  flows.sort((a, b) => a.date - b.date);
  // Need a meaningful time span — annualising < 1 week of history is misleading.
  const spanDays = (flows[flows.length - 1].date - flows[0].date) / 86400000;
  if (spanDays < 7) return null;
  const r = xirr(flows);
  return (r == null || !isFinite(r)) ? null : r * 100;
}

/* =============================================================================
 * DERIVED TOTALS
 * ========================================================================== */
/* Transactions have no time-of-day field, so same-day entries sort by date alone
 * have no defined order — a same-day Sell could process before its own Buy purely
 * because of array position, corrupting that lot's cost basis. To make same-day
 * processing deterministic and safe, share-increasing types always settle before
 * share-decreasing types on the same date; everything else stays date-order-neutral. */
const TX_ORDER_PRIORITY = {
  "Deposit": 0, "Interest / cash yield": 0, "Interest": 0,
  "Buy": 1, "Stock split": 1, "DRIP / Reinvested": 1,
  "Sell": 3, "Withdrawal": 3, "Fee": 3, "Tax withholding": 3,
};
const txOrderPriority = (tx) => TX_ORDER_PRIORITY[tx.type] ?? 2;
const txDateSort = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : txOrderPriority(a) - txOrderPriority(b));

/* Transactions are the SINGLE SOURCE OF TRUTH. Holdings, cash, realized/unrealized
 * P/L, dividends and fees are all DERIVED here using a simple average-cost method.
 * Cost basis is tracked in MYR using each transaction's historical FX rate; current
 * market value uses the (current) FX.rates and manually-entered current prices. */
function computeTotals() {
  // FX helpers: historical rate stored on the transaction; current from FX.rates.
  const histFx = (tx) => (tx.fxRate != null && tx.fxRate !== "" ? +tx.fxRate : (FX.rates[tx.currency] || 1));
  const curFx = (ccy) => (FX.rates[ccy] || 1);

  const keyOf = (brokerId, ticker) => brokerId + "|" + ticker;
  const lots = {};
  const ensureLot = (brokerId, ticker, meta = {}) => {
    const k = keyOf(brokerId, ticker);
    if (!lots[k]) lots[k] = { ticker, brokerId, company: "", market: "", currency: FX.base, shares: 0, costMYR: 0, costLocal: 0, netDivMYR: 0, realizedMYR: 0 };
    const l = lots[k];
    if (meta.company && !l.company) l.company = meta.company;
    if (meta.market && !l.market) l.market = meta.market;
    if (meta.currency) l.currency = meta.currency;
    return l;
  };

  // Seed opening positions (HOLDINGS = positions owned before tracking began).
  HOLDINGS.forEach((h) => {
    const fx = h.openingFxRate || curFx(h.currency);
    const l = ensureLot(h.brokerId, h.ticker, h);
    const localCost = (+h.shares || 0) * (+h.avgCost || 0);
    l.shares += +h.shares || 0;
    l.costLocal += localCost;          // cost in the holding's own currency
    l.costMYR += localCost * fx;        // cost in base currency at historical FX
    if (h.netDividends) l.netDivMYR += +h.netDividends;
  });

  // PER-CURRENCY cash ledger: cash[brokerId][currency] = amount in that currency.
  const cash = {};
  BROKERS.forEach((b) => (cash[b.id] = {}));
  const addCash = (id, ccy, amt) => { if (!cash[id]) cash[id] = {}; cash[id][ccy] = (cash[id][ccy] || 0) + amt; };

  let totalDeposits = 0, totalWithdrawals = 0, netDividends = 0, totalFees = 0, realizedPL = 0, totalInterest = 0;
  const oversells = [];
  // Same figures, broken out per broker — every transaction has exactly one
  // brokerId, so each map's values sum back to the portfolio-wide total above
  // (kept auditable: the Broker page shows these, and they must actually add up).
  const depositsByBroker = {}, withdrawalsByBroker = {}, dividendsByBroker = {}, realizedByBroker = {}, feesByBroker = {}, interestByBroker = {};
  const addTo = (map, id, amt) => { map[id] = (map[id] || 0) + amt; };

  // Process chronologically so average cost is correct.
  const txns = [...ALL_TRANSACTIONS].sort(txDateSort);
  txns.forEach((tx) => {
    const fx = histFx(tx);
    const ccy = tx.currency || FX.base;
    const gross = +tx.gross || 0, fee = +tx.fee || 0, taxv = +tx.tax || 0;
    const grossMYR = gross * fx, feeMYR = fee * fx, taxMYR = taxv * fx;
    const q = +tx.qty || 0, price = +tx.price || 0;
    switch (tx.type) {
      case "Deposit": totalDeposits += grossMYR; addTo(depositsByBroker, tx.brokerId, grossMYR); addCash(tx.brokerId, ccy, gross); break;
      case "Withdrawal": totalWithdrawals += grossMYR; addTo(withdrawalsByBroker, tx.brokerId, grossMYR); addCash(tx.brokerId, ccy, -gross); break;
      case "Interest / cash yield": case "Interest": totalInterest += grossMYR; addTo(interestByBroker, tx.brokerId, grossMYR); addCash(tx.brokerId, ccy, gross); break;
      case "Fee": totalFees += grossMYR; addTo(feesByBroker, tx.brokerId, grossMYR); addCash(tx.brokerId, ccy, -gross); break;
      case "Tax withholding": totalFees += grossMYR; addTo(feesByBroker, tx.brokerId, grossMYR); addCash(tx.brokerId, ccy, -gross); break;
      case "Buy": {
        // Commission + taxes are CAPITALISED into cost basis (not double-counted as fees).
        const l = ensureLot(tx.brokerId, tx.ticker, tx);
        const localCost = q * price + fee + taxv;
        l.shares += q; l.costLocal += localCost; l.costMYR += localCost * fx;
        // A DRIP-funded Buy never touched cash — the money it "spent" is the same dividend
        // whose own cash was already suppressed (paidTo: "reinvested") on its Dividend leg.
        if (!tx.drip) addCash(tx.brokerId, ccy, -(gross + fee + taxv));
        break;
      }
      case "Sell": {
        const l = ensureLot(tx.brokerId, tx.ticker, tx);
        if (q > l.shares + 1e-9 && !tx.override) oversells.push({ ticker: tx.ticker, brokerId: tx.brokerId });
        const avgMYR = l.shares > 0 ? l.costMYR / l.shares : 0;
        const avgLocal = l.shares > 0 ? l.costLocal / l.shares : 0;
        const proceedsMYR = q * price * fx;
        const realizedThis = proceedsMYR - avgMYR * q - feeMYR - taxMYR;   // nets commission + taxes
        realizedPL += realizedThis; l.realizedMYR += realizedThis;
        addTo(realizedByBroker, tx.brokerId, realizedThis);
        l.shares -= q; l.costMYR -= avgMYR * q; l.costLocal -= avgLocal * q;
        if (l.shares < 1e-9) { l.shares = 0; l.costMYR = Math.max(0, l.costMYR); l.costLocal = Math.max(0, l.costLocal); }
        addCash(tx.brokerId, ccy, gross - fee - taxv); break;
      }
      case "Dividend": {
        if (tx.status !== "Expected") {
          const net = gross - taxv;
          netDividends += net * fx;
          addTo(dividendsByBroker, tx.brokerId, net * fx);
          if (tx.paidTo !== "bank" && tx.paidTo !== "reinvested") addCash(tx.brokerId, ccy, net);
          ensureLot(tx.brokerId, tx.ticker, tx).netDivMYR += net * fx;
        }
        break;
      }
      case "Stock split": { ensureLot(tx.brokerId, tx.ticker, tx).shares *= (q || 1); break; }
      case "Transfer between brokers": {
        addCash(tx.brokerId, ccy, -gross); if (tx.toBrokerId) addCash(tx.toBrokerId, ccy, gross); break;
      }
      case "FX conversion":
      case "Currency Exchange": {
        // Move money between currency buckets at the ENTERED amounts (value-faithful, no phantom gain).
        const fromCcy = tx.fromCurrency || ccy, toCcy = tx.toCurrency;
        const fromAmt = +tx.fromAmount || gross || 0, toAmt = +tx.toAmount || 0;
        addCash(tx.brokerId, fromCcy, -(fromAmt + fee));
        if (toCcy) addCash(tx.brokerId, toCcy, toAmt);
        // Use this transaction's own historical rate (fx), same as every other flow
        // here — pricing the fee at today's live FX.rates would make an old, already-
        // settled transaction's cost silently drift every time rates are updated.
        totalFees += fee * fx;
        addTo(feesByBroker, tx.brokerId, fee * fx);
        break;
      }
      default: break;
    }
  });

  // MYR-equivalent cash per broker (at CURRENT FX) + the raw per-currency breakdown.
  const brokerCash = {}, brokerCashByCcy = {};
  Object.keys(cash).forEach((id) => {
    brokerCashByCcy[id] = cash[id];
    brokerCash[id] = Object.keys(cash[id]).reduce((s, c) => s + cash[id][c] * curFx(c), 0);
  });

  const holdings = Object.values(lots).filter((l) => Math.abs(l.shares) > 1e-9).map((l) => {
    const cp = CURRENT_PRICES[l.ticker];
    const hasPrice = !!cp && cp.price != null;
    const priceCcy = hasPrice ? cp.currency : l.currency;
    const costBasis = l.costMYR;
    const avgCost = l.shares > 0 ? l.costMYR / l.shares : 0;          // MYR/share (historical)
    const avgCostLocal = l.shares > 0 ? l.costLocal / l.shares : 0;   // original ccy/share
    let marketValue, unrealized, priceUnrealized, fxUnrealized;
    if (hasPrice) {
      marketValue = l.shares * (+cp.price) * curFx(priceCcy);
      priceUnrealized = (+cp.price - avgCostLocal) * l.shares * curFx(priceCcy);  // price effect @ current FX
      unrealized = marketValue - costBasis;
      fxUnrealized = unrealized - priceUnrealized;                                // FX translation on cost
    } else {
      marketValue = costBasis; unrealized = 0; priceUnrealized = 0; fxUnrealized = 0;
    }
    const unrealizedPct = costBasis ? (unrealized / costBasis) * 100 : 0;
    const totalReturn = unrealized + (l.realizedMYR || 0) + l.netDivMYR;
    const meta = STOCK_META[l.ticker] || {};
    return { ...l, costBasis, marketValue, avgCost, avgCostLocal, unrealized, unrealizedPct, priceUnrealized, fxUnrealized,
      realized: l.realizedMYR || 0, netDividends: l.netDivMYR, totalReturn,
      country: meta.country || marketInfo(l.ticker).country, sector: meta.sector || null, industry: meta.industry || null,
      hasPrice, currentPrice: hasPrice ? +cp.price : null, currentPriceCcy: priceCcy,
      currentPriceDate: hasPrice ? cp.date : null,
      priceSource: hasPrice ? (cp.source || "manual") : null,
      priceFetchedAt: hasPrice ? cp.fetchedAt : null,
      changePct: hasPrice ? cp.changePct : null,
      high52: (cp && cp.high52 != null) ? cp.high52 : null, low52: (cp && cp.low52 != null) ? cp.low52 : null };
  });

  const portfolioValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const unrealizedPL = holdings.reduce((s, h) => s + h.unrealized, 0);
  const priceUnrealizedPL = holdings.reduce((s, h) => s + h.priceUnrealized, 0);
  const fxUnrealizedPL = holdings.reduce((s, h) => s + h.fxUnrealized, 0);
  const netCapitalInvested = totalDeposits - totalWithdrawals;
  const priceReturn = unrealizedPL + realizedPL - totalFees;
  const totalReturn = unrealizedPL + realizedPL + netDividends + totalInterest - totalFees;
  const totalReturnPct = netCapitalInvested ? (totalReturn / netCapitalInvested) * 100 : 0;
  const missingPrices = holdings.filter((h) => !h.hasPrice).length;
  // Negative cash detection per (broker, currency) — allowed, but flagged.
  const negativeCash = [];
  Object.keys(cash).forEach((id) => Object.keys(cash[id]).forEach((c) => {
    if (cash[id][c] < -0.005) negativeCash.push({ brokerId: id, currency: c, amount: cash[id][c], amountMYR: cash[id][c] * curFx(c) });
  }));
  const totalCash = Object.values(brokerCash).reduce((s, c) => s + c, 0);
  const xirrValue = xirrPercent(txns, portfolioValue + totalCash);

  // Unrealized P/L per broker — holdings are already keyed by brokerId|ticker,
  // so this partitions exactly (sums back to unrealizedPL above).
  const unrealizedByBroker = {};
  holdings.forEach((h) => addTo(unrealizedByBroker, h.brokerId, h.unrealized));
  const totalReturnByBroker = {};
  BROKERS.forEach((b) => {
    totalReturnByBroker[b.id] = (unrealizedByBroker[b.id] || 0) + (realizedByBroker[b.id] || 0)
      + (dividendsByBroker[b.id] || 0) + (interestByBroker[b.id] || 0) - (feesByBroker[b.id] || 0);
  });

  return { totalDeposits, totalWithdrawals, netCapitalInvested, portfolioValue,
    netDividends, totalInterest, unrealizedPL, realizedPL, totalFees, priceUnrealizedPL, fxUnrealizedPL, priceReturn, totalReturn, totalReturnPct,
    holdings, brokerCash, brokerCashByCcy, oversells, missingPrices, negativeCash, xirr: xirrValue, totalCash,
    depositsByBroker, withdrawalsByBroker, dividendsByBroker, realizedByBroker, unrealizedByBroker, totalReturnByBroker };
}
/* =============================================================================
 * PERSISTENCE — saves everything to the browser (localStorage) so your data
 * survives reloads. Defaults come from data.js the first time.
 * ========================================================================== */
const STORE_KEY = "il-data-v2";
/* Collision-checked against every id-bearing array — matters most for bulk CSV
 * import, which can call this hundreds of times in one pass; a collision there
 * would make edit/delete silently target the wrong record. */
function uid(prefix) {
  let id;
  do { id = prefix + Math.random().toString(36).slice(2, 8); }
  while (BROKERS.some((b) => b.id === id) || ALL_TRANSACTIONS.some((x) => x.id === id) || UPCOMING_DIVIDENDS.some((d) => d.id === id));
  return id;
}

/* Bumped only if a future change reshapes the snapshot in a way old code
 * couldn't read safely. Checked on import (see importBackupJSON) — there's no
 * migration table because every version so far has shared this shape; the
 * check exists so a backup from a NEWER app version says so instead of
 * silently restoring only what this version recognizes. */
const SCHEMA_VERSION = 4;
function snapshot() {
  return { version: SCHEMA_VERSION, lastSaved: LAST_SAVED,
    BROKERS, HOLDINGS, ALL_TRANSACTIONS, UPCOMING_DIVIDENDS,
    CURRENT_PRICES, STOCK_META, HOLDING_TYPES, RECON_CHECKS, SETTINGS, USER, FX, PV_HISTORY };
}
/* A restored backup is untrusted JSON — Object.assign(target, parsedJson)
 * would let a crafted "__proto__"/"constructor"/"prototype" key in the file
 * reach past the target object. Every merge of imported data goes through
 * this instead of a bare Object.assign. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function safeAssign(target, next) {
  if (!next || typeof next !== "object") return target;
  Object.keys(next).forEach((k) => { if (!UNSAFE_KEYS.has(k)) target[k] = next[k]; });
  return target;
}
function assignObj(target, next) {
  if (!next || typeof next !== "object") return;
  Object.keys(target).forEach((k) => delete target[k]);
  safeAssign(target, next);
}
const ASSET_TYPES = ["Stock", "ETF", "REIT", "Bond", "Unit Trust", "Other"];
function holdingType(ticker) { return HOLDING_TYPES[(ticker || "").toUpperCase()] || "Stock"; }
function setHoldingType(ticker, type) {
  if (!ticker) return;
  const tk = ticker.toUpperCase();
  if (!type || type === "Stock") delete HOLDING_TYPES[tk];   // "Stock" is the default — no need to store it
  else HOLDING_TYPES[tk] = type;
}
/* Maps a live quote's Yahoo quoteType (+ sector/industry, for the Stock-vs-REIT
 * split Yahoo doesn't give directly) to one of our ASSET_TYPES. Returns null when
 * the signal isn't confident enough to override the field — Bond and most non-US/
 * non-major-exchange securities aren't reliably classified by Yahoo, so those stay
 * whatever the user already has (or the "Stock" default) rather than guessing. */
function detectAssetType(quoteType, sector, industry) {
  const qt = (quoteType || "").toUpperCase();
  if (qt === "ETF") return "ETF";
  if (qt === "MUTUALFUND") return "Unit Trust";
  if (qt === "EQUITY") {
    const sec = (sector || "").toLowerCase(), ind = (industry || "").toLowerCase();
    return (sec === "real estate" || ind.includes("reit")) ? "REIT" : "Stock";
  }
  return null;
}
/* F3: drop manual/live prices for tickers no longer referenced by any transaction
 * or opening holding (keeps STOCK_META metadata cache, which is harmless). */
function pruneOrphans() {
  const used = new Set();
  ALL_TRANSACTIONS.forEach((x) => { if (x.ticker && x.ticker !== "—") used.add(x.ticker.toUpperCase()); });
  HOLDINGS.forEach((h) => { if (h.ticker) used.add(h.ticker.toUpperCase()); });
  Object.keys(CURRENT_PRICES).forEach((tk) => { if (!used.has(tk.toUpperCase())) delete CURRENT_PRICES[tk]; });
}
/* Upsert today's portfolio market value (incl. cash) into PV_HISTORY. One point
 * per day: updates today's point if it already exists, else appends. Capped. */
function recordPvSnapshot() {
  if (typeof T === "undefined" || !T) return;
  const mv = +(T.portfolioValue || 0).toFixed(2);
  const value = +(mv + (T.totalCash || 0)).toFixed(2);
  const principal = +((T.netCapitalInvested) || 0).toFixed(2);
  if (!(value > 0) && !(principal > 0)) return;
  const today = todayISO();
  const last = PV_HISTORY[PV_HISTORY.length - 1];
  if (last && last.date === today) { last.value = value; last.mv = mv; last.principal = principal; }
  else PV_HISTORY.push({ date: today, value, mv, principal });
  if (PV_HISTORY.length > 1000) PV_HISTORY.splice(0, PV_HISTORY.length - 1000);
}
/* Anchor opening holdings on the value chart: seed one historical point at the
 * earliest holding "as-of" date, valued at their acquisition cost basis (MYR). */
function seedPvHistory() {
  const dates = HOLDINGS.map((h) => h.asOfDate).filter(Boolean).sort();
  if (!dates.length) return;
  const earliest = dates[0];
  if (PV_HISTORY.some((p) => p.date === earliest)) return;   // don't duplicate / override a real point
  const seedVal = +HOLDINGS.reduce((s, h) =>
    s + (+h.shares || 0) * (+h.avgCost || 0) * (h.openingFxRate || FX.rates[h.currency] || 1), 0).toFixed(2);
  if (!(seedVal > 0)) return;
  PV_HISTORY.push({ date: earliest, value: seedVal, seed: true });
  PV_HISTORY.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
function prunePvHistory() {
  if (!PV_HISTORY.length) return;
  const today = todayISO();
  for (let i = PV_HISTORY.length - 1; i >= 0; i--) {
    if (PV_HISTORY[i].date > today) PV_HISTORY.splice(i, 1);
  }
  const allDates = [
    ...ALL_TRANSACTIONS.map((x) => x.date),
    ...HOLDINGS.map((h) => h.asOfDate).filter(Boolean),
  ].filter(Boolean);
  if (!allDates.length) { PV_HISTORY.splice(0); return; }
  const earliest = allDates.reduce((a, b) => (a < b ? a : b));
  for (let i = PV_HISTORY.length - 1; i >= 0; i--) {
    if (PV_HISTORY[i].date < earliest && !PV_HISTORY[i].seed) PV_HISTORY.splice(i, 1);
  }
}
/* Returns true if the write actually reached localStorage. LAST_SAVED is only
 * stamped on real success — callers' "Saved ✓" toasts must not be trusted
 * blindly, since a full/blocked store fails setItem() silently otherwise. */
function saveStore() {
  AUTO_DIV_CACHE_FETCHED = false;  // holdings may have changed — force re-fetch on next mount
  try {
    pruneOrphans();
    recompute();             // T reflects the latest data before we snapshot value
    prunePvHistory();
    recordPvSnapshot();
    seedPvHistory();
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
    LAST_SAVED = new Date().toISOString();
    hideSaveError();
    if (typeof onDataSaved === "function") onDataSaved();
    return true;
  } catch (e) {
    showSaveError();
    return false;
  }
}
function showSaveError() {
  const el = document.getElementById("saveErrorBanner");
  if (!el) return;
  const msgEl = document.getElementById("saveErrorMsg");
  if (msgEl) msgEl.textContent = t("Couldn't save your last change — this browser's storage may be full or blocked. Export a backup from Settings so nothing is lost, then free up space and try again.");
  el.hidden = false;
}
function hideSaveError() {
  const el = document.getElementById("saveErrorBanner");
  if (el) el.hidden = true;
}
/* Cross-tab staleness: the browser's "storage" event fires in every OTHER tab
 * sharing this origin when one tab writes STORE_KEY — never in the tab that
 * wrote it. With no conflict detection, whichever tab saves last would
 * silently overwrite the other's edits with no warning in either tab. */
function showStaleDataWarning() {
  const el = document.getElementById("staleDataBanner");
  if (!el) return;
  const msgEl = document.getElementById("staleDataMsg");
  if (msgEl) msgEl.textContent = t("Your data was updated in another tab or window. Reload to see the latest — saving here first would overwrite those changes.");
  el.hidden = false;
}
function hideStaleDataWarning() {
  const el = document.getElementById("staleDataBanner");
  if (el) el.hidden = true;
}
/* A malformed/partial import (e.g. a hand-edited or older-version backup
 * missing a field entirely) must never wipe that field's existing data —
 * only replace it once we actually have a valid replacement array. */
function replaceArr(arr, next) {
  if (!Array.isArray(next)) return;
  arr.length = 0;
  next.forEach((x) => arr.push(x));
}
function applySnapshot(s) {
  // Cloud-pulled data isn't validated before this runs the way a local backup
  // restore is (see validBackup()) — guard every optional field's shape here so a
  // malformed row can't throw partway through and leave a half-old/half-new state.
  replaceArr(BROKERS, s.BROKERS); replaceArr(HOLDINGS, s.HOLDINGS);
  replaceArr(ALL_TRANSACTIONS, s.ALL_TRANSACTIONS); replaceArr(UPCOMING_DIVIDENDS, s.UPCOMING_DIVIDENDS);
  if (Array.isArray(s.PV_HISTORY)) replaceArr(PV_HISTORY, s.PV_HISTORY.filter((p) => p && p.value > 0));
  assignObj(CURRENT_PRICES, s.CURRENT_PRICES); assignObj(RECON_CHECKS, s.RECON_CHECKS);
  assignObj(STOCK_META, s.STOCK_META); assignObj(HOLDING_TYPES, s.HOLDING_TYPES);
  if (s.SETTINGS) safeAssign(SETTINGS, s.SETTINGS);
  if (s.USER) safeAssign(USER, s.USER);
  if (s.lastSaved) LAST_SAVED = s.lastSaved;
  if (s.FX) {
    if (s.FX.base) FX.base = s.FX.base;
    // A present-but-empty rates object (a corrupted/truncated backup or cloud row)
    // must never wipe out the real, working rates — only replace when there's an
    // actual non-empty replacement.
    if (s.FX.rates && typeof s.FX.rates === "object" && Object.keys(s.FX.rates).length) {
      Object.keys(FX.rates).forEach((k) => delete FX.rates[k]); safeAssign(FX.rates, s.FX.rates);
    }
    if (s.FX.updated) FX.updated = s.FX.updated;
  }
}
function loadStore() {
  let s;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
  if (s) applySnapshot(s);
}
function resetStore() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
}
loadStore();  // hydrate from the browser before the first calculation

let T = computeTotals();
function recompute() { T = computeTotals(); }  // call after data/rates change

// Capture one portfolio-value point on first open each day (persist only if a new day).
(function captureDailyOnLoad() {
  if (!ALL_TRANSACTIONS.length && !HOLDINGS.length) return;   // nothing to chart yet
  const before = PV_HISTORY.length;
  seedPvHistory();                                            // anchor opening holdings at their as-of date
  const today = todayISO();
  const last = PV_HISTORY[PV_HISTORY.length - 1];
  if (!last || last.date !== today) recordPvSnapshot();
  if (PV_HISTORY.length !== before) {
    try { LAST_SAVED = new Date().toISOString(); localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); } catch (e) {}
  }
})();

/* =============================================================================
 * LIVE EXCHANGE RATES (free, no API key)
 * Returns how many BASE units 1 unit of `from` is worth (i.e. from -> base).
 * Tries open.er-api.com first, then frankfurter.app as a fallback.
 * ========================================================================== */
let FX_STATUS = "";  // shown under the Exchange Rates panel; survives re-render
const COMMON_CCY = ["USD","EUR","GBP","SGD","HKD","CNY","JPY","AUD","CAD","CHF",
  "INR","IDR","THB","KRW","TWD","PHP","VND","NZD","AED","SAR","MYR","SGD"];

const DATE_FORMATS = [
  { k: "D MMM YYYY", label: "24 Jun 2026" },
  { k: "YYYY-MM-DD", label: "2026-06-24" },
  { k: "DD/MM/YYYY", label: "24/06/2026" },
  { k: "MM/DD/YYYY", label: "06/24/2026" },
];
const TIME_ZONES = ["Asia/Kuala_Lumpur","Asia/Singapore","Asia/Hong_Kong","Asia/Shanghai","Asia/Tokyo",
  "Australia/Sydney","Europe/London","Europe/Paris","America/New_York","America/Los_Angeles","UTC"];

async function fetchRatesAgainstBase(base) {
  // open.er-api.com: data.rates[X] = how many X per 1 base
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    const d = await r.json();
    if (d && d.result === "success" && d.rates) {
      return { rates: d.rates, date: (d.time_last_update_utc || "").slice(0, 16), source: "open.er-api.com" };
    }
  } catch (e) { /* fall through */ }
  // frankfurter.app fallback (ECB data, ~31 currencies)
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);
    const d = await r.json();
    if (d && d.rates) return { rates: d.rates, date: d.date || "", source: "frankfurter.app" };
  } catch (e) { /* fall through */ }
  return null;
}
// Convert "X per base" map into "base per X" (the rate we store).
const perBaseToRate = (perBase) => (perBase ? +(1 / perBase).toFixed(4) : null);

/* =============================================================================
 * LIVE STOCK QUOTES (via our /api/quote Vercel function → Yahoo Finance)
 * Returns { price, currency, time, source } or null. Throws-safe.
 * Note: only works on the deployed site (or `vercel dev`) — a static file:// page
 * has no /api backend, so we surface a clear message in that case.
 * ========================================================================== */
const LIVE_ENABLED = location.protocol === "http:" || location.protocol === "https:";
async function fetchQuote(symbol) {
  try {
    const r = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d && d.price != null) return d;
  } catch (e) { /* network / no backend */ }
  return null;
}
/* Search the market for matching stocks (code or name) → [{symbol,name,exchange}]. */
async function searchSymbols(q) {
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
  } catch (e) { return []; }
}

/* ─── Dividend history & schedule (Yahoo Finance, keyless) ─────────────────── */
// In-memory cache of auto-fetched dividend events — past history AND any
// near-future declared payment — keyed by ticker, covering every market Yahoo
// serves (not just US). Shape: { [ticker]: [{date (exDate), amount, currency}] }
// NOT persisted — refreshed on first visit after each saveStore(). Past events
// feed pattern-based forecasting (dividendForecast); future-dated events become
// a confirmed upcoming payment (allUpcomingDivs).
let AUTO_DIV_CACHE = {};
let AUTO_DIV_CACHE_FETCHED = false;  // prevent the fetch→render→mount→fetch infinite loop

/* Returns { ok, divs } — ok distinguishes "fetched cleanly, ticker just has no
 * dividend history" from "the request itself failed", so callers can surface a
 * real error state instead of the two cases silently looking identical. */
async function fetchDivHistory(ticker) {
  if (!LIVE_ENABLED) return { ok: true, divs: null };
  try {
    const r = await fetch(`/api/dividend?symbol=${encodeURIComponent(ticker)}`);
    if (!r.ok) return { ok: false, divs: null };
    const data = await r.json();
    if (!Array.isArray(data)) return { ok: false, divs: null };
    return { ok: true, divs: data };
  } catch (e) { return { ok: false, divs: null }; }
}

/* Auto-log dividends you're eligible for (held the stock on/after its ex-date) but haven't
 * recorded yet — same eligibility check the Holding Detail calendar's "Not logged" badge
 * uses. Creates real "Dividend" transactions (0 tax withheld — edit afterward if it differs)
 * so Total Dividends Received and the rest of the ledger reflect them without manual entry.
 * Idempotent: re-running skips anything already logged (by itself or by hand), matched by
 * ticker/broker and a ±10-day date window. Returns how many were newly logged. */
function autoSyncDividends() {
  const today = todayISO();
  let added = 0;
  T.holdings.forEach((h) => {
    const marketHist = AUTO_DIV_CACHE[h.ticker];
    if (!marketHist || !marketHist.length) return;
    const holdingTxs = ALL_TRANSACTIONS.filter((x) => x.brokerId === h.brokerId && (x.ticker || "").toUpperCase() === h.ticker.toUpperCase());
    if (!holdingTxs.length) return;
    const earliestTxDate = holdingTxs.reduce((min, x) => (x.date < min ? x.date : min), holdingTxs[0].date);
    const brokerDivs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.brokerId === h.brokerId);
    const loggedDates = brokerDivs
      .filter((x) => (x.ticker || "").toUpperCase() === h.ticker.toUpperCase())
      .map((dv) => dv.payDate || dv.date).filter(Boolean).map((ds) => new Date(ds + "T00:00:00").getTime());
    // Not every broker routes dividends into the trading-account cash balance — some pay
    // straight to a linked bank account instead. An explicit per-broker setting (Brokers page)
    // is the primary source now — the user has directly told us how this broker works. Fall
    // back to inferring from your own most recent dividend at this broker (any ticker, since
    // it's a broker-level routing behavior) only if that setting was never configured.
    // A DRIP leg's paidTo:"reinvested" is a one-off per-transaction choice, not broker-level
    // routing — excluded here so it never gets inferred onto an unrelated auto-logged dividend
    // that has no paired Buy to net it against.
    const broker = BROKERS.find((x) => x.id === h.brokerId);
    const mostRecentAtBroker = brokerDivs.filter((x) => x.paidTo !== "reinvested")
      .slice().sort((a, b) => ((b.payDate || b.date || "") < (a.payDate || a.date || "") ? -1 : 1))[0];
    const inferredPaidTo = (broker && broker.divPaidTo) || (mostRecentAtBroker ? (mostRecentAtBroker.paidTo || "broker") : "broker");
    marketHist.forEach((d) => {
      if (d.date < earliestTxDate || d.date > today) return;   // before you held it, or hasn't happened yet
      const dTime = new Date(d.date + "T00:00:00").getTime();
      if (loggedDates.some((t) => Math.abs(t - dTime) <= 10 * 86400000)) return;   // already logged
      // The app has no historical FX rate history — today's rate is the best available
      // approximation for a dividend paid on a past date. Flagged clearly in the note
      // below so the user knows to correct it manually if the FX drift since then matters.
      const fxRate = FX.rates[d.currency] || 1;
      const gross = (d.amount || 0) * h.shares;
      const tax = gross * ((broker && broker.divTaxRate ? broker.divTaxRate : 0) / 100);
      ALL_TRANSACTIONS.unshift({
        id: uid("t"), date: d.date, brokerId: h.brokerId, type: "Dividend",
        ticker: h.ticker, company: h.company || "", market: h.market || "",
        currency: d.currency, gross, tax, fxRate, myrEquivalent: gross * fxRate,
        status: "Received", paidTo: inferredPaidTo, exDate: d.date, payDate: d.date,
        notes: t("Auto-logged from market dividend history — review the tax withheld, \"Paid to\", and FX rate (this uses today's rate, not the rate on the payment date)."),
      });
      loggedDates.push(dTime);   // don't double-log within the same pass
      added++;
    });
  });
  return added;
}

/* Populate AUTO_DIV_CACHE for every held ticker concurrently, any market.
 * Returns { fetched, hadError } — hadError lets the dividends page tell the
 * user a schedule check actually failed instead of quietly showing "nothing
 * upcoming" either way. */
async function fetchAllDivSchedules() {
  if (AUTO_DIV_CACHE_FETCHED) return { fetched: false, hadError: false };  // already fresh — skip to avoid render loop
  AUTO_DIV_CACHE_FETCHED = true;              // set before await so concurrent calls short-circuit
  const tickers = [...new Set(T.holdings.map((h) => h.ticker))];
  let hadError = false;
  await Promise.all(tickers.map(async (ticker) => {
    const res = await fetchDivHistory(ticker);
    if (!res.ok) hadError = true;
    if (res.divs && res.divs.length) AUTO_DIV_CACHE[ticker] = res.divs;
    else delete AUTO_DIV_CACHE[ticker];
  }));
  const autoLogged = autoSyncDividends();
  if (autoLogged) {
    saveStore();
    toast(`${autoLogged} ${t("dividends auto-logged from market history")}`);
  }
  return { fetched: true, hadError };
}

/* Merge all upcoming dividend sources into one sorted list.
 * Sources: UPCOMING_DIVIDENDS (manual), AUTO_DIV_CACHE (Yahoo, any market), and
 * any legacy ALL_TRANSACTIONS rows still carrying status="Expected". */
/* upcomingDividends schema: { id, ticker, brokerId?, exDate, payDate, estimatedAmount (per share),
 * currency, source: 'manual'|'api', status: 'upcoming'|'confirmed'|'missed',
 * confirmedTransactionId? }
 * Legacy entries may use amtPerShare instead of estimatedAmount. */
function allUpcomingDivs() {
  const today = todayISO();
  const toMYR = (net, ccy) => net * (FX.rates[ccy] || 1);

  const manual = UPCOMING_DIVIDENDS
    .filter((d) => (d.status || "upcoming") === "upcoming")
    .map((d) => {
      const h = T.holdings.find((x) => x.ticker === d.ticker);
      const perShare = d.estimatedAmount || d.amtPerShare || 0;
      const expectedNet = perShare * (h ? h.shares : 0);
      return { ticker: d.ticker, brokerId: d.brokerId, exDate: d.exDate, payDate: d.payDate,
        currency: d.currency, expectedNet, expectedNetMYR: toMYR(expectedNet, d.currency),
        source: d.source || "manual", _id: d.id };
    });

  const auto = Object.entries(AUTO_DIV_CACHE).flatMap(([ticker, divs]) =>
    divs.filter((d) => (d.payDate || d.date) >= today).map((div) => {
      const h = T.holdings.find((x) => x.ticker === ticker);
      const ccy = div.currency || "USD";
      const expectedNet = (div.amount || 0) * (h ? h.shares : 0);
      return { ticker, brokerId: h ? h.brokerId : "—", exDate: div.date,
        payDate: div.payDate || div.date, currency: ccy,
        expectedNet, expectedNetMYR: toMYR(expectedNet, ccy), source: "api" };
    })
  );

  const legacy = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status === "Expected")
    .map((x) => ({ ticker: x.ticker, brokerId: x.brokerId, exDate: x.exDate, payDate: x.payDate,
      currency: x.currency, expectedNet: (+x.gross || 0) - (+x.tax || 0),
      expectedNetMYR: divNetMYR(x), source: "manual" }));

  return [...manual, ...auto, ...legacy]
    .filter((d) => d.payDate || d.exDate)
    .sort((a, b) => ((a.payDate || a.exDate || "") < (b.payDate || b.exDate || "") ? -1 : 1));
}

/* Attach a "type a code or name → pick a stock" dropdown to a ticker input. */
function attachAutocomplete(form, statusEl, opts = {}) {
  const input = form.querySelector('[name="ticker"]');
  if (!input || !LIVE_ENABLED) return;
  const host = input.closest("label") || input.parentElement;
  host.classList.add("ac-host");
  let menu = host.querySelector(".ac-menu");
  if (!menu) { menu = document.createElement("div"); menu.className = "ac-menu"; menu.hidden = true; host.appendChild(menu); }
  let timer = null;
  const close = () => { menu.hidden = true; menu.innerHTML = ""; };

  input.setAttribute("autocomplete", "off");
  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 1) { close(); return; }
    timer = setTimeout(async () => {
      const results = await searchSymbols(q);
      if (!results.length) { close(); return; }
      menu._results = results;
      menu.innerHTML = results.map((r, i) =>
        `<button type="button" class="ac-item" data-i="${i}">
          <span class="ac-sym">${esc(r.symbol)}</span>
          <span class="ac-name">${esc(r.name) || ""}</span>
          <span class="ac-exch">${esc(r.exchange) || ""}</span></button>`).join("");
      menu.hidden = false;
    }, 260);
  });
  // mousedown fires before the input's blur, so the pick isn't lost
  menu.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".ac-item");
    if (!item) return;
    e.preventDefault();
    const r = menu._results[+item.dataset.i];
    input.value = r.symbol;
    close();
    autofillFromTicker(form, statusEl, opts);
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

/* Turn a user-typed code into a Yahoo symbol.
 * Bursa Malaysia codes are 4–5 digit numbers (e.g. 5555 → 5555.KL). */
function normalizeSymbol(input) {
  let s = (input || "").trim().toUpperCase();
  if (!s) return "";
  if (/^\d{3,5}$/.test(s)) s += ".KL";
  return s;
}

/* Look up a typed ticker and auto-fill a form's stock fields. Fields stay editable. */
async function autofillFromTicker(form, statusEl, opts = {}) {
  const tEl = form.querySelector('[name="ticker"]');
  if (!tEl) return;
  const raw = tEl.value.trim();
  if (!raw) { if (statusEl) statusEl.textContent = ""; return; }
  if (!LIVE_ENABLED) { if (statusEl) { statusEl.innerHTML = `⚠️ ${t("Live lookup only works on your deployed website, not when you open the file locally. Commit, push, and try it on your Vercel URL.")}`; statusEl.className = "lookup-status warn"; } return; }
  const symbol = normalizeSymbol(raw);
  if (statusEl) { statusEl.textContent = `${t("Looking up…")} (${symbol})`; statusEl.className = "lookup-status muted"; }
  const q = await fetchQuote(symbol);
  if (!q) { if (statusEl) { statusEl.innerHTML = `⚠️ ${t("Couldn't fetch")} ${esc(symbol)} — ${t("check the code, or that /api is deployed on Vercel.")}`; statusEl.className = "lookup-status warn"; } return; }

  tEl.value = q.symbol || symbol;                       // normalise to the resolved symbol
  const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el && val != null && val !== "") el.value = val; };
  set("company", q.name);
  set("market", q.exchange);
  if (q.currency) {
    setSelectValue(form, "currency", q.currency);   // works for native <select> AND the styled dropdown
    const fxEl = form.querySelector('[name="fxRate"]');
    if (fxEl) fxEl.value = FX.rates[q.currency] || (q.currency === FX.base ? 1 : "");
  }
  // Fill price only if empty (don't clobber a price the user already typed)
  if (opts.fillPrice) { const pe = form.querySelector('[name="price"]'); if (pe && !pe.value) pe.value = q.price; }
  // Cache stock metadata (name, exchange, country, sector, industry) for grouping/detail
  STOCK_META[q.symbol || symbol] = { name: q.name || null, exchange: q.exchange || null,
    currency: q.currency || null, country: q.country || marketInfo(symbol).country,
    sector: q.sector || null, industry: q.industry || null };
  // Auto-fill Asset Type from the live quote when the form has that field (Buy, DRIP,
  // Opening Holding) — only overrides when Yahoo's classification is confident (see
  // detectAssetType); the field stays a normal editable dropdown either way, so a wrong
  // or missing detection is just the same manual pick the form already required before.
  const detectedType = detectAssetType(q.quoteType, q.sector, q.industry);
  if (detectedType && form.querySelector('[name="assetType"]')) setSelectValue(form, "assetType", detectedType);
  // Remember the current market price for valuation (clearly labelled "Live")
  if (q.currency) CURRENT_PRICES[q.symbol || symbol] = { price: +q.price, currency: q.currency, date: todayISO(), source: "live", fetchedAt: new Date().toISOString(), changePct: q.changePct };
  if (statusEl) {
    statusEl.innerHTML = opts.showPrice === false
      ? `✓ ${esc(q.name || q.symbol)}`                                                  // dividend: company only, price is irrelevant
      : `✓ ${esc(q.name || q.symbol)} · ${esc(q.currency) || ""} ${fmt(q.price)} <span class="live-price">${t("Live")}</span>`;
    statusEl.className = "lookup-status ok";
  }
}

/* Update a single holding's price from the market. Returns true on success. */
async function refreshLivePrice(ticker) {
  const q = await fetchQuote(ticker);
  if (!q) return false;
  CURRENT_PRICES[ticker] = {
    price: +q.price, currency: q.currency || (CURRENT_PRICES[ticker] && CURRENT_PRICES[ticker].currency) || FX.base,
    date: todayISO(), source: "live",
    fetchedAt: new Date().toISOString(), changePct: q.changePct,
    high52: q.fiftyTwoWeekHigh != null ? +q.fiftyTwoWeekHigh : null,
    low52: q.fiftyTwoWeekLow != null ? +q.fiftyTwoWeekLow : null,
  };
  return true;
}

/* Tickers already auto-refreshed this session — NOT a single all-or-nothing flag like
 * AUTO_DIV_CACHE_FETCHED, because that pattern relies on saveStore() resetting it, and
 * refreshing prices always has new data to persist (unlike dividends, which only save
 * when something new was auto-logged) — an unconditional save-then-reset here would
 * refetch on every single render, forever. A per-ticker set sidesteps that entirely:
 * once a ticker's been attempted this session it's never retried automatically again
 * (the user's own "Live" button still works anytime), and a newly added holding's
 * ticker naturally isn't in the set yet, so it still gets picked up next mount. */
const LIVE_PRICE_ATTEMPTED = new Set();

/* Auto-refresh prices without the user needing to click "Live" — only for holdings that
 * are either unpriced yet or already live-sourced; a holding you deliberately set to
 * "Manual" stays exactly as you left it unless you click Live yourself. Returns
 * { fetched } so callers know whether to re-render. */
async function fetchAllLivePrices() {
  if (!LIVE_ENABLED) return { fetched: false };
  const tickers = [...new Set(T.holdings
    .filter((h) => (!h.hasPrice || h.priceSource === "live") && !LIVE_PRICE_ATTEMPTED.has(h.ticker))
    .map((h) => h.ticker))];
  if (!tickers.length) return { fetched: false };
  tickers.forEach((tk) => LIVE_PRICE_ATTEMPTED.add(tk));  // mark before awaiting — guards concurrent calls
  const results = await Promise.all(tickers.map((ticker) => refreshLivePrice(ticker)));
  const anyOk = results.some(Boolean);
  if (anyOk) saveStore();
  return { fetched: anyOk };
}

/* =============================================================================
 * SHARED UI BUILDERS (return HTML strings)
 * ========================================================================== */
function panel(title, body, extra = "") {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
}

function emptyState(msg) {
  return `<div class="empty" style="padding:40px 12px">${msg}</div>`;
}

function table(headers, rows, opts = {}) {
  const thead = `<thead><tr>${headers.map((h) =>
    `<th class="${h.num ? "num" : ""}"${h.style ? ` style="${h.style}"` : ""}>${h.label}</th>`).join("")}</tr></thead>`;
  // Show a friendly placeholder row when there are no records yet.
  const body = (rows && rows.trim())
    ? rows
    : `<tr><td colspan="${headers.length}" class="empty" style="padding:28px 12px">${t("Nothing to show yet.")}</td></tr>`;
  // opts.fixed: force each column to its declared width instead of shrinking to fit
  // content — table-layout:auto (the default) lets a table with few/short rows sit
  // narrower than its 100% container, leaving a visible gap on the right. Opt-in only,
  // since it requires every column to have a sane width already declared.
  return `<div class="table-wrap"><table class="data-table${opts.fixed ? " data-table-fixed" : ""}">${thead}<tbody>${body}</tbody></table></div>`;
}

function statusBadge(s) {
  const map = { Confirmed: "confirmed", Estimated: "warn", Paid: "pos", Cancelled: "neg", Unknown: "subtle", Received: "pos", Expected: "warn", "Market record": "subtle", "Not logged": "warn" };
  return `<span class="badge ${map[s] || "subtle"}">${t(s)}</span>`;
}
function typeChip(type) {
  const c = { Buy: "info", Sell: "neg", Dividend: "pos", Deposit: "subtle",
    Withdrawal: "warn", Fee: "subtle", "DRIP / Reinvested": "pos", "Currency Exchange": "subtle",
    "Stock Split": "subtle", Adjustment: "subtle" }[type] || "subtle";
  return `<span class="badge ${c}">${t(type)}</span>`;
}

function lineChartSVG(series, opts) {
  if (!series || series.length === 0) return emptyState(t("No portfolio history yet."));
  if (series.length === 1) series = [series[0], { ...series[0], month: "", date: "" }];

  const gainMode = opts && opts.gainMode;
  const noFill = opts && opts.noFill;
  const W = 640, H = 240, padL = 52, padR = 16, padT = 16, padB = 28;
  const nwVals = series.map((d) => d.value);
  const pVals = series.map((d) => d.principal || 0);
  const allVals = [...nwVals, ...pVals];

  let lo = Math.min(...allVals), hi = Math.max(...allVals);
  if (hi - lo < 1e-9) { const pad = Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad; }
  else { const m = (hi - lo) * 0.06; lo -= m; hi += m; }
  if (gainMode) {
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
  } else {
    if (lo < 0 && Math.min(...allVals) >= 0) lo = 0;
  }

  const min = lo, max = hi;
  const xFn = (i) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const yFn = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const nwLine = series.map((d, i) => `${i ? "L" : "M"}${xFn(i).toFixed(1)},${yFn(d.value).toFixed(1)}`).join(" ");
  const pLine = series.map((d, i) => `${i ? "L" : "M"}${xFn(i).toFixed(1)},${yFn(d.principal || 0).toFixed(1)}`).join(" ");
  const xEnd = xFn(series.length - 1).toFixed(1);
  const yBot = (H - padB).toFixed(1);

  let clipDefs = "", fills = "", zeroLine = "";
  if (gainMode) {
    const y0 = yFn(0), y0s = y0.toFixed(1);
    const aboveH = Math.max(0, y0 - padT).toFixed(1);
    const belowH = Math.max(0, H - padB - y0).toFixed(1);
    clipDefs = `<clipPath id="clip-above-z"><rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${aboveH}"/></clipPath>
      <clipPath id="clip-below-z"><rect x="${padL}" y="${y0s}" width="${W - padL - padR}" height="${belowH}"/></clipPath>`;
    const gainArea = `${nwLine} L${xEnd},${y0s} L${padL},${y0s} Z`;
    fills = `<path d="${gainArea}" fill="rgba(34,197,94,.09)" clip-path="url(#clip-above-z)"/>
      <path d="${gainArea}" fill="rgba(220,38,38,.11)" clip-path="url(#clip-below-z)"/>`;
    zeroLine = `<line x1="${padL}" y1="${y0s}" x2="${W - padR}" y2="${y0s}" class="zero-ln"/>`;
  } else if (!noFill) {
    const clipNWPath = `${nwLine} L${xEnd},${yBot} L${padL},${yBot} Z`;
    const clipPPath = `${pLine} L${xEnd},${yBot} L${padL},${yBot} Z`;
    const pRev = series.slice().reverse().map((d, ri) =>
      `L${xFn(series.length - 1 - ri).toFixed(1)},${yFn(d.principal || 0).toFixed(1)}`).join(" ");
    const pTopArea = `M${padL},${padT} L${xEnd},${padT} ${pRev} Z`;
    const nwRev = series.slice().reverse().map((d, ri) =>
      `L${xFn(series.length - 1 - ri).toFixed(1)},${yFn(d.value).toFixed(1)}`).join(" ");
    const nwTopArea = `M${padL},${padT} L${xEnd},${padT} ${nwRev} Z`;
    clipDefs = `<clipPath id="clip-nw"><path d="${clipNWPath}"/></clipPath>
      <clipPath id="clip-p"><path d="${clipPPath}"/></clipPath>`;
    fills = `<path d="${pTopArea}" fill="rgba(91,84,232,.08)" clip-path="url(#clip-nw)"/>
      <path d="${nwTopArea}" fill="rgba(220,38,38,.13)" clip-path="url(#clip-p)"/>`;
  }

  // Below 20, whole-number rounding is too coarse — a chart whose entire range is a
  // few percentage points (e.g. dividend yield) would show several gridlines rounding
  // to the same integer. One decimal place fixes that without affecting money charts,
  // which are always well above 20 in this app.
  const ylab = (v) => max >= 10000 ? Math.round(v / 1000) + "k" : (max >= 1000 ? (v / 1000).toFixed(1) + "k" : max >= 20 ? Math.round(v) : v.toFixed(1));
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4, yy = yFn(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="grid"/>
             <text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" class="ylab">${ylab(v)}</text>`;
  }

  const step = Math.max(1, Math.ceil(series.length / 6));
  const xlabs = series.map((d, i) =>
    (d.month && i % step === 0) ? `<text x="${xFn(i).toFixed(1)}" y="${H - 8}" class="xlab">${d.month}</text>` : ""
  ).join("");

  const dots = series.map((d, i) => {
    if (!d.date) return "";
    const cx = xFn(i).toFixed(1), cy = yFn(d.value).toFixed(1);
    const cbAttr = d.principal != null ? ` data-cb="${d.principal}"` : "";
    return `<circle cx="${cx}" cy="${cy}" r="${i === series.length - 1 ? 4 : 2.5}" class="dot"/>
<circle cx="${cx}" cy="${cy}" r="12" class="dot-hit" data-date="${d.date}" data-val="${d.value}"${cbAttr} fill="transparent" stroke="none"/>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Portfolio value over time")}">
    <defs>${clipDefs}</defs>
    <style>
      .grid{stroke:var(--border);stroke-width:1}
      .ylab,.xlab{fill:var(--muted);font-size:11px;font-family:var(--font)}
      .ylab{text-anchor:end}.xlab{text-anchor:middle}
      .ln-nw{fill:none;stroke:var(--brand);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
      .ln-p{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5,4;stroke-linejoin:round;stroke-linecap:round}
      .dot{fill:var(--brand)}.dot-hit{cursor:pointer}
      .zero-ln{stroke:var(--border);stroke-width:1.5;stroke-dasharray:3,3}
    </style>
    ${grid}${zeroLine}${fills}
    <path d="${pLine}" class="ln-p"/>
    <path d="${nwLine}" class="ln-nw"/>
    ${dots}${xlabs}
  </svg>`;
}

/* Simple stacked vertical bar chart — series: [{label, value, projected}].
 * `value` (received/confirmed, solid --pos) stacks below `projected` (estimated
 * remainder, hatched --warn) on the same bar, so a partial current year still
 * reads as "on track" rather than a misleadingly short bar. */
function barChartSVG(series, opts) {
  if (!series || series.length === 0) return emptyState(t("Not enough history yet."));
  const label = (opts && opts.ariaLabel) || t("Bar chart");
  const W = 640, H = 240, padL = 52, padR = 16, padT = 16, padB = 28;
  const totals = series.map((d) => (d.value || 0) + (d.projected || 0));
  const max = Math.max(...totals, 1e-9) * 1.12;
  const n = series.length;
  const slot = (W - padL - padR) / n;
  const barW = Math.min(56, slot * 0.55);
  const yFn = (v) => padT + (1 - v / max) * (H - padT - padB);
  const yBot = H - padB;

  // Below 20, whole-number rounding is too coarse — a chart whose entire range is a
  // few percentage points (e.g. dividend yield) would show several gridlines rounding
  // to the same integer. One decimal place fixes that without affecting money charts,
  // which are always well above 20 in this app.
  const ylab = (v) => max >= 10000 ? Math.round(v / 1000) + "k" : (max >= 1000 ? (v / 1000).toFixed(1) + "k" : max >= 20 ? Math.round(v) : v.toFixed(1));
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = (max * g) / 4, yy = yFn(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="grid"/>
             <text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" class="ylab">${ylab(v)}</text>`;
  }

  const bars = series.map((d, i) => {
    const cx = padL + slot * (i + 0.5);
    const x = (cx - barW / 2).toFixed(1);
    const received = Math.max(0, d.value || 0), projected = Math.max(0, d.projected || 0);
    const yRecTop = yFn(received).toFixed(1);
    const yTotalTop = yFn(received + projected).toFixed(1);
    const recRect = received > 0 ? `<rect x="${x}" y="${yRecTop}" width="${barW.toFixed(1)}" height="${(yBot - yRecTop).toFixed(1)}" rx="3" class="bar-rec"/>` : "";
    const projRect = projected > 0 ? `<rect x="${x}" y="${yTotalTop}" width="${barW.toFixed(1)}" height="${(yRecTop - yTotalTop).toFixed(1)}" rx="3" class="bar-proj"/>` : "";
    const xlab = `<text x="${cx.toFixed(1)}" y="${H - 8}" class="xlab">${esc(d.label)}</text>`;
    return `${recRect}${projRect}${xlab}`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <style>
      .grid{stroke:var(--border);stroke-width:1}
      .ylab,.xlab{fill:var(--muted);font-size:11px;font-family:var(--font)}
      .ylab{text-anchor:end}.xlab{text-anchor:middle}
      .bar-rec{fill:var(--pos)}
      .bar-proj{fill:var(--warn);opacity:.55}
    </style>
    ${grid}${bars}
  </svg>`;
}

/* .col-info tooltips, delegated on document once at bootstrap so it keeps working
 * after every render() rebuilds the page. Renders into a single position:fixed div
 * appended to <body> — NOT a ::after pseudo-element anchored inside the icon — so it
 * can never be counted as part of a scrollable ancestor's content box. A tooltip that
 * lives inside a table wrapped in overflow:auto (e.g. the Dividend Calendar) would
 * otherwise make that container detect new overflow the instant the tooltip pops out
 * past its edge, growing/shifting the scrollbar right as you hover. position:fixed
 * escapes that entirely, the same way mountChartTooltips() already does for charts.
 * Touch devices have no :hover state, so the click toggle is what makes this reachable
 * there — not just a hover nicety. */
function mountColInfoTaps() {
  const tip = document.createElement("div");
  tip.className = "col-info-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  let shownFor = null;

  const show = (el) => {
    const text = el.getAttribute("data-tip");
    if (!text) return;
    tip.textContent = text;
    tip.hidden = false;
    shownFor = el;
    const r = el.getBoundingClientRect();
    // Default: centered above the icon. Measure the actual rendered box afterward and
    // nudge it back on-screen (or flip below) if that pushes it past a viewport edge —
    // same two-pass measure-then-clamp approach as mountChartTooltips().
    tip.style.left = (r.left + r.width / 2) + "px";
    tip.style.top = (r.top - 6) + "px";
    tip.style.transform = "translate(-50%, -100%)";
    const margin = 8;
    const tr = tip.getBoundingClientRect();
    let dx = 0;
    if (tr.left < margin) dx = margin - tr.left;
    else if (tr.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - tr.right;
    if (tr.top < margin) {
      tip.style.top = (r.bottom + 6) + "px";
      tip.style.transform = `translate(calc(-50% + ${dx}px), 0)`;
    } else if (dx) {
      tip.style.transform = `translate(calc(-50% + ${dx}px), -100%)`;
    }
  };
  const hide = () => { tip.hidden = true; shownFor = null; };

  document.addEventListener("mouseover", (e) => {
    const hit = e.target.closest(".col-info");
    if (hit) show(hit);
  });
  document.addEventListener("mouseout", (e) => {
    const hit = e.target.closest(".col-info");
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".col-info");
    if (hit && hit !== to) hide();
  });
  document.addEventListener("click", (e) => {
    const hit = e.target.closest(".col-info");
    if (hit) { e.stopPropagation(); if (shownFor === hit && !tip.hidden) hide(); else show(hit); }
    else hide();
  });
  window.addEventListener("scroll", hide, true);   // capture phase: catches scroll on any nested container too
}

/* Wire hover/tap tooltips for all .dot-hit elements on the current page. */
function mountChartTooltips() {
  const prev = document.getElementById("chart-tip");
  if (prev) prev.remove();
  const hits = document.querySelectorAll(".dot-hit");
  if (!hits.length) return;
  const tip = document.createElement("div");
  tip.id = "chart-tip";
  tip.className = "chart-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  const show = (el) => {
    const d = el.dataset.date, v = +el.dataset.val, cb = el.dataset.cb;
    const hasCb = cb != null && cb !== "";
    // Scoped to the specific chart this dot belongs to (closest ancestor), not a
    // page-wide first-match query — a page can host more than one [data-chart-mode]
    // line chart at once (e.g. Holding Detail's yield chart alongside its plain
    // cost/dividend charts), and a global query would mislabel/misformat whichever
    // chart happened to render first in the DOM.
    const chartDiv = el.closest(".chart[data-chart-mode]");
    const valLabel = (chartDiv && chartDiv.dataset.chartMode === "div") ? t("Total Return") : t("Market Value");
    const valHtml = hasCb
      ? `<div class="ct-row"><span class="ct-lbl">${valLabel}</span><span class="ct-val">${money(v)}</span></div><div class="ct-row"><span class="ct-lbl">${t("Cost Basis")}</span><span class="ct-val">${money(+cb)}</span></div>`
      : `<div class="ct-val">${money(v)}</div>`;
    tip.innerHTML = d ? `<div class="ct-date">${fmtDate(d)}</div>${valHtml}` : valHtml;
    const r = el.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + "px";
    tip.style.top = (r.top) + "px";
    tip.hidden = false;
    // The tooltip is centered horizontally and sits above the point — on a narrow
    // phone that can push it past the screen edge for the first/last/topmost point.
    // Measure the actual rendered box and nudge it back on-screen if needed.
    const margin = 8;
    const tr = tip.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (tr.left < margin) dx = margin - tr.left;
    else if (tr.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - tr.right;
    if (tr.top < margin) dy = margin - tr.top;
    if (dx || dy) {
      tip.style.left = (r.left + r.width / 2 + dx) + "px";
      tip.style.top = (r.top + dy) + "px";
    }
  };
  const hide = () => { tip.hidden = true; };
  hits.forEach((el) => {
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("mouseleave", hide);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); show(el); }, { passive: false });
    el.addEventListener("touchend", () => setTimeout(hide, 2500));
  });
}

// Monochrome indigo ramp (+ one neutral) so the allocation chart stays on-brand.
const PALETTE = ["#4a3ed9", "#6d5efc", "#8b80ff", "#a99dff", "#352c9e", "#c4bcff", "#8089a0"];

/* Currency colors for the dashboard's by-currency allocation donut. MYR/USD
 * get fixed, memorable colors; any 3rd+ currency gets a stable PALETTE color
 * assigned once and cached — module-level so it stays the same currency-to-
 * color mapping across re-renders instead of shifting on every render(). */
const CCY_COLORS = { MYR: "var(--brand)", USD: "#3b82f6" };
const _ccyColorCache = {};
let _ccyColorIdx = 0;
function ccyColor(ccy) {
  if (CCY_COLORS[ccy]) return CCY_COLORS[ccy];
  if (!_ccyColorCache[ccy]) { _ccyColorCache[ccy] = PALETTE[_ccyColorIdx % PALETTE.length]; _ccyColorIdx++; }
  return _ccyColorCache[ccy];
}
function donutHTML(slices, centerLabel, centerValue, colors) {
  slices = (slices || []).filter((s) => s.value > 0);
  if (!slices.length) return emptyState(`${t("No holdings yet. Add a buy transaction to create your first holding.")}<div style="margin-top:14px"><a class="btn primary" href="#/add">${t("Add a transaction")} →</a></div>`);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70, r = 44, C = 88;
  const clr = (i) => (colors && colors[i]) || PALETTE[i % PALETTE.length];
  // A single 100% slice can't be drawn with one SVG arc — its start and end
  // points land on the exact same coordinate, which SVG renders as nothing at
  // all (a zero-length path). Draw a plain ring instead in that one case.
  let arcs;
  if (slices.length === 1) {
    arcs = `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${clr(0)}" stroke-width="${R - r}"/>`;
  } else {
    let a0 = -Math.PI / 2;
    arcs = slices.map((s, i) => {
      const a1 = a0 + (s.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (ang, rad) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
      a0 = a1;
      return `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z" fill="${clr(i)}"/>`;
    }).join("");
  }
  const legend = slices.map((s, i) => `<div class="legend-row">
    <span class="legend-dot" style="background:${clr(i)}"></span>
    <span>${esc(s.label)}</span><span class="lr-pct">${fmt((s.value / total) * 100, { maximumFractionDigits: 1 })}%</span></div>`).join("");
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
 * SHARED ANALYTICS — allocation, portfolio health (reused by Portfolio & Dashboard)
 * ========================================================================== */
function allocationData() {
  const hs = T.holdings;
  return {
    total: T.portfolioValue || 0,
    byCountry: groupSum(hs, (h) => h.country || "Others", (h) => h.marketValue),
    bySector: groupSum(hs, (h) => h.sector || "Others", (h) => h.marketValue),
    byCurrency: groupSum(hs, (h) => h.currency || "—", (h) => h.marketValue),
    byBroker: groupSum(hs, (h) => brokerName(h.brokerId), (h) => h.marketValue),
  };
}
/* Ranked bar list for one allocation breakdown — replaced the donut+legend+table
 * combo (three representations of the same numbers, and a pie stops being readable
 * past 4-5 slices) with rows that scale cleanly to any category count. */
function allocationPanel(title, rows, total) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (!sorted.length) return panel(title, emptyState(t("No priced holdings yet.")));
  return panel(title, donutHTML(sorted, t("Total"), money(total)));
}

/* Trailing-12-month NET dividends in base currency (reused for yield + forecast). */
function ttmDividends() {
  const now = todayDate(); const cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1);
  return ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status !== "Expected").reduce((s, d) => {
    const dt = new Date((d.payDate || d.date) + "T00:00:00");
    return (!isNaN(dt) && dt >= cutoff && dt <= now) ? s + ((+d.gross || 0) - (+d.tax || 0)) * (d.fxRate || FX.rates[d.currency] || 1) : s;
  }, 0);
}

/* Portfolio Health — objective analytics only, one panel (so it has a clear
 * home on the page, unlike the headingless version) with three plain stat
 * columns instead of individually bordered/shadowed mini-cards (so it doesn't
 * read as boxes nested inside a box). Separation comes from gap and a hover
 * tint alone, no competing borders. */
function insightsHTML() {
  const hp = portfolioHealth();
  const howHint = `<span class="col-info" data-tip="${t("How this was calculated")}" aria-label="${t("How this was calculated")}">${COL_INFO_ICON_SVG}</span>`;
  const stat = (id, label, val, sub) => `<div class="ph-stat" id="${id}">
    <div class="ph-stat-head"><span class="stat-label">${label}</span>${howHint}</div>
    <div class="ph-stat-value">${val}</div>
    ${sub ? `<div class="mc-sub muted">${sub}</div>` : ""}
  </div>`;
  return panel(t("Portfolio Health"), `<div class="ph-row">
    ${stat("phDivYield", t("Dividend Yield (TTM)"), hp.yieldEst != null ? fmt(hp.yieldEst, { maximumFractionDigits: 2 }) + "%" : "—", hp.yieldEst != null ? "" : t("No dividends recorded yet"))}
    ${stat("phCashAlloc", t("Cash Allocation"), hp.cashAlloc != null ? fmt(hp.cashAlloc, { maximumFractionDigits: 1 }) + "%" : "—", hp.cashAlloc != null ? t("of total net value") : t("Nothing to allocate yet"))}
    ${stat("phDivScore", t("Diversification Score"), T.holdings.length >= 2 ? `${hp.divScore}/100` : "—", T.holdings.length >= 2 ? `${fmt(hp.effectiveN, { maximumFractionDigits: 1 })} ${t("effective holdings")}` : t("Add more holdings to score"))}
  </div>`);
}

/* Objective portfolio-health metrics (no advice). */
function portfolioHealth() {
  const hs = T.holdings, pv = T.portfolioValue || 0;
  const totalNav = pv + (T.totalCash || 0);
  const priced = hs.filter((h) => h.hasPrice);
  const maxBy = (arr, f) => arr.reduce((m, h) => (m == null || f(h) > f(m) ? h : m), null);
  const minBy = (arr, f) => arr.reduce((m, h) => (m == null || f(h) < f(m) ? h : m), null);
  const largest = maxBy(hs, (h) => h.marketValue);
  const winner = maxBy(priced, (h) => h.unrealized);
  const loser = minBy(priced, (h) => h.unrealized);
  const ttm = ttmDividends();
  const yieldEst = pv ? (ttm / pv) * 100 : null;
  const cashAlloc = totalNav ? (T.totalCash / totalNav) * 100 : null;
  // Diversification via Herfindahl-Hirschman index of position weights.
  const hhi = pv ? hs.reduce((s, h) => s + Math.pow(h.marketValue / pv, 2), 0) : 0;
  const effectiveN = hhi ? 1 / hhi : 0;
  const divScore = hs.length ? Math.round(Math.max(0, Math.min(100, (1 - hhi) * 100))) : 0;
  return { largest, winner, loser, ttm, yieldEst, cashAlloc, totalNav, hhi, effectiveN, divScore, pv };
}

/* =============================================================================
 * PAGE: DASHBOARD
 * ========================================================================== */
let dashAllocMode = "currency"; // "currency" | "type"
let dashChartMode = (() => { try { return localStorage.getItem("il-chart-mode") || "mv"; } catch(e) { return "mv"; } })(); // "mv" | "div"

/* Builds the Asset Allocation donut for the current dashAllocMode — shared by the
 * initial Dashboard render and the toggle's click handler so the branch only lives
 * in one place. No "by individual holding" mode — unlike currency or asset type,
 * the number of distinct holdings isn't bounded, and a pie stops being readable
 * past 4-5 slices (same reasoning Portfolio's own breakdown panels use a ranked
 * bar list instead of a donut for exactly this kind of unbounded category count). */
function dashAllocDonutHTML() {
  const totalStr = money(T.portfolioValue).replace(".00", "");
  if (dashAllocMode === "type") {
    const typeSlices = groupSum(T.holdings, (h) => t(holdingType(h.ticker)), (h) => h.marketValue).filter((s) => s.value > 0);
    return donutHTML(typeSlices, t("Portfolio"), totalStr, typeSlices.map((s) => ccyColor(s.label)));
  }
  const ccySlices = groupSum(T.holdings, (h) => h.currency || "Other", (h) => h.marketValue).filter((s) => s.value > 0);
  return donutHTML(ccySlices, t("Portfolio"), totalStr, ccySlices.map((s) => ccyColor(s.label)));
}

/* Builds the chart body HTML for the Investment Return panel.
 * Called on initial render and again in-place when the mode toggle fires. */
function buildDashChartContent() {
  const currentMV = T.portfolioValue || 0;
  const pvPrincipal = T.netCapitalInvested || 0;
  const todayStr = todayISO();

  // Cumulative net dividends received up to each date (for "Incl. Dividends" mode)
  const cumDivByDate = (() => {
    const byDate = {};
    ALL_TRANSACTIONS
      .filter((x) => x.type === "Dividend" && x.status !== "Expected")
      .forEach((d) => { const dt = d.payDate || d.date; if (dt) byDate[dt] = (byDate[dt] || 0) + divNetMYR(d); });
    let acc = 0;
    const result = {};
    Object.keys(byDate).sort().forEach((dt) => { acc += byDate[dt]; result[dt] = acc; });
    return result;
  })();
  const getCumDiv = (date) => {
    let val = 0;
    for (const k of Object.keys(cumDivByDate).sort()) { if (k <= date) val = cumDivByDate[k]; else break; }
    return val;
  };

  // Build historical series: filter stale snapshots, always replace today with live data
  const filtered = PV_HISTORY
    .filter((p) => {
      const mv = p.mv != null ? p.mv : p.value;
      if (mv < 0) return false;
      // Discard if snapshot MV is implausibly higher than 3× current live portfolio value
      if (currentMV > 0 && mv > currentMV * 3) return false;
      const pVal = p.principal != null ? p.principal : 0;
      return mv > 0 || pVal > 0;
    })
    .filter((p) => p.date !== todayStr)  // always replace today with live recalculation
    .map((p) => {
      const mv = p.mv != null ? p.mv : p.value;
      const principal = p.principal != null ? p.principal : 0;
      const cumDiv = dashChartMode === "div" ? getCumDiv(p.date) : 0;
      return { month: p.date.slice(5), date: p.date, value: mv + cumDiv, principal };
    });

  // Today's point always uses live T.portfolioValue (never a cached snapshot)
  const todayCumDiv = dashChartMode === "div" ? getCumDiv(todayStr) : 0;
  const todayPoint = { month: todayStr.slice(5), date: todayStr, value: currentMV + todayCumDiv, principal: pvPrincipal };

  const series = filtered.length
    ? [...filtered, todayPoint].sort((a, b) => (a.date < b.date ? -1 : 1))
    : [todayPoint];

  const mvLabel = dashChartMode === "div" ? `${t("Total Return")} (${ccyLabel(FX.base)})` : t("Market Value");
  const clockNote = !filtered.length
    ? `<div class="pv-clock-note">${metaNote(CLOCK_ICON_SVG, t("Prices as of today will appear here tomorrow — check back after your next visit."))}</div>`
    : "";

  return `<div class="chart" data-chart-mode="${dashChartMode}">${lineChartSVG(series, { noFill: true })}</div>
    <div class="chart-legend"><span class="cl-item"><span class="cl-nw"></span>${mvLabel}</span><span class="cl-item"><span class="cl-p"></span>${t("Cost Basis")}</span></div>
    <p class="muted" style="font-size:11px;margin:5px 0 0;text-align:center">${t("Market value vs. what you paid — the gap is your gain or loss.")}</p>${clockNote}`;
}

function pageDashboard() {
  const isEmpty = ALL_TRANSACTIONS.length === 0 && HOLDINGS.length === 0;

  const netWorth = (T.portfolioValue || 0) + (T.totalCash || 0);
  const returnIsTotal = SETTINGS.returnMode !== "price";
  // "Unrealized" must show pure unrealized P/L, not T.priceReturn (which also mixes
  // in realized P/L and fees) — otherwise a fully-sold position with no current
  // holdings can still show a large nonzero "Unrealized P/L" from past realized gains.
  const shownReturn = returnIsTotal ? T.totalReturn : T.unrealizedPL;
  const shownPct = T.netCapitalInvested ? (shownReturn / T.netCapitalInvested) * 100 : 0;
  const up = shownReturn > 0;
  const dn = shownReturn < 0;
  const yr = todayISO().slice(0, 4);
  const divYTD = ALL_TRANSACTIONS
    .filter((x) => x.type === "Dividend" && x.status !== "Expected" && (x.payDate || x.date || "").slice(0, 4) === yr)
    .reduce((s, d) => s + divNetMYR(d), 0);

  // Latest "prices as of" — ISO datetime from live fetch if available, else manual date.
  const priceDates = T.holdings.filter((h) => h.hasPrice && h.currentPriceDate).map((h) => h.currentPriceDate).sort();
  const latestLiveFetch = T.holdings.filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  const pricesAsOf = latestLiveFetch || (priceDates.length ? priceDates[priceDates.length - 1] : null);
  const pricesAsOfFmt = latestLiveFetch ? fmtDateTime(latestLiveFetch) : (priceDates.length ? fmtDate(priceDates[priceDates.length - 1]) : null);

  const holdingsRows = aggregateHoldingsByTicker(T.holdings).sort((a, b) => b.marketValue - a.marketValue).slice(0, 8).map((h) => `
    <tr><td class="dcc-c td-holding">
        <a class="ticker ticker-link" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">${esc(h.ticker)}</a>
        ${h.company ? `<div class="sub">${esc(h.company)}</div>` : ""}
      </td>
      <td class="dcc-c">${fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
      <td class="dcc-c">${money(h.marketValue)}</td>
      <td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? moneySigned(h.unrealized) : `<span class="muted">—</span>`}</td>
      <td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? pctTxt(h.unrealizedPct) : `<span class="muted">—</span>`}</td>
      <td class="dcc-c ${cls(h.totalReturn)}">${moneySigned(h.totalReturn)}</td>
      <td class="dcc-c ${cls(h.totalReturn)}">${h.costBasis > 0 ? pctTxt((h.totalReturn / h.costBasis) * 100) : `<span class="muted">—</span>`}</td></tr>`).join("");

  // Upcoming dividends — manual (UPCOMING_DIVIDENDS), auto-fetched (AUTO_DIV_CACHE), legacy
  // Expected, AND pattern-based estimates (fc.nextPayments) for tickers with a detected
  // frequency but no officially declared date — same merge as the Dividends page, so this
  // widget isn't empty for every holding that only has an estimate, not a confirmed date.
  const upcoming = allUpcomingDivs();
  const dashFc = dividendForecast(ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status !== "Expected"), upcoming);
  const dashOneYearOut = new Date(todayDate()); dashOneYearOut.setFullYear(dashOneYearOut.getFullYear() + 1);
  const dashOneYearOutStr = dateToISO(dashOneYearOut);
  const dashEstimated = (dashFc.nextPayments || [])
    .filter((p) => !p.confirmed && p.payDate <= dashOneYearOutStr)
    .map((p) => ({ ticker: p.ticker, exDate: null, payDate: p.payDate, amtMYR: p.amtMYR, source: "estimated" }));
  const dashSourceBadge = (src) => src === "api" ? `<span class="badge info">API</span>`
    : src === "estimated" ? `<span class="badge warn">${t("Estimated")}</span>` : `<span class="badge subtle">${t("Manual")}</span>`;
  const dashUpcoming = [...upcoming.map((d) => ({ ...d, amtMYR: d.expectedNetMYR })), ...dashEstimated]
    .sort((a, b) => ((a.payDate || "") < (b.payDate || "") ? -1 : 1));
  // Pattern-projected rows (source: "estimated") only ever get a payDate from the detected
  // frequency, never a real declared ex-date — mirror the app's own ex-date+14d payment
  // estimate in reverse so the column isn't blank on every single projected row. The row's
  // own "Estimated" status badge already flags the whole row as a projection.
  const estExDate = (payDs) => { const dd = new Date(payDs + "T00:00:00"); dd.setDate(dd.getDate() - 14); return dateToISO(dd); };
  const divRows = dashUpcoming.map((d) => {
    const exDate = d.exDate || (d.payDate ? estExDate(d.payDate) : null);
    return `<tr><td class="dcc-c ticker">${esc(d.ticker)}</td><td class="dcc-c">${fmtDate(exDate)}</td><td class="dcc-c">${fmtDate(d.payDate)}</td>
      <td class="dcc-c">${money(d.amtMYR)}</td><td class="dcc-c">${dashSourceBadge(d.source || "manual")}</td></tr>`;
  }).join("");

  const recentRows = ALL_TRANSACTIONS.slice(0, 6).map((tx) => {
    const txAmt = tx.gross != null ? tx.gross : 0;
    const fxR = tx.fxRate || FX.rates[tx.currency] || 1;
    const myrEq = tx.currency !== FX.base && txAmt > 0 ? txAmt * fxR : 0;
    return `<tr><td class="dcc-c">${fmtDate(tx.date)}</td><td class="dcc-c">${typeChip(tx.type)}</td>
      <td class="dcc-c ticker">${esc(tx.ticker) || "—"}</td><td class="dcc-c sub">${esc(brokerName(tx.brokerId))}</td>
      <td class="dcc-c">${esc(ccyLabel(tx.currency))} ${fmt(txAmt)}${myrEq > 0 ? `<div class="fx-note">${ccyLabel(FX.base)} ${fmt(myrEq)}</div>` : ""}</td></tr>`;
  }).join("");

  // In-card return-mode toggle (controls the Total P/L figure).
  const toggle = `<div class="seg seg-sm" role="group" aria-label="${t("Return mode")}">
    <button class="seg-btn ${SETTINGS.returnMode !== "price" ? "on" : ""}" data-return="total">${t("Total Return")}</button>
    <button class="seg-btn ${SETTINGS.returnMode === "price" ? "on" : ""}" data-return="price">${t("Unrealized")}</button></div>`;
  const cashLow = (T.totalCash || 0) < 50;

  // Calc breakdowns (click a stat to see "how").
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

  const statHead = (label, right) => `<div class="stat-head"><span class="stat-label">${label}</span>${right || ""}</div>`;
  const howHint = `<span class="col-info" data-tip="${t("How this was calculated")}" aria-label="${t("How this was calculated")}">${COL_INFO_ICON_SVG}</span>`;
  const metrics = `<section class="metrics">
    <article class="stat net" data-card="nw" tabindex="0" role="button" aria-label="${t("Net Worth")}, show calculation">
      ${statHead(t("Net Worth"), howHint)}
      <div class="stat-value">${money(netWorth)}</div>
      <div class="stat-sub muted">${t("Holdings")} ${money(T.portfolioValue)} · ${t("Cash")} ${money(T.totalCash || 0)}</div>
    </article>
    <article class="stat pl ${up ? "is-up" : dn ? "is-down" : ""}" data-card="pl" tabindex="0" role="button" aria-label="${returnIsTotal ? t("Total Return") : t("Unrealized P/L")}, show calculation">
      ${statHead(returnIsTotal ? t("Total Return") : t("Unrealized P/L"), `<div class="stat-head-group">${toggle}${howHint}</div>`)}
      <div class="stat-value ${up ? "pos" : dn ? "neg" : ""}">${up ? "▲ " : dn ? "▼ " : ""}${moneySigned(shownReturn)}</div>
      <div class="stat-sub" style="display:flex;align-items:baseline;gap:6px">
        <span class="${up ? "pos" : dn ? "neg" : "muted"}">${up || dn ? pctTxt(shownPct) : fmt(Math.abs(shownPct), {maximumFractionDigits:2}) + "%"}</span>
        <span class="muted" style="font-size:11px">${t("on net capital")}</span>
      </div>
    </article>
    <article class="stat" data-card="cash" tabindex="0" role="button" aria-label="${t("Available Cash")}, show calculation">
      ${statHead(`${t("Available Cash")}${cashLow ? ' <svg class="warn-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--warn);vertical-align:middle;margin-left:3px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : ""}`, howHint)}
      <div class="stat-value${cashLow ? " warn-val" : ""}">${money(T.totalCash || 0)}</div>
      <div class="stat-sub${cashLow ? " warn-val" : " muted"}">${t("Across all brokers")}</div>
    </article>
    <article class="stat wide" data-card="principal" tabindex="0" role="button" aria-label="${t("Principal Invested")}, show calculation">
      ${statHead(t("Principal Invested"), howHint)}
      <div class="stat-value">${money(T.netCapitalInvested)}</div>
      <div class="stat-sub muted">${t("Deposits − Withdrawals")}</div>
    </article>
    <article class="stat wide">
      ${statHead(t("Dividends YTD"))}
      <div class="stat-value ${divYTD ? "pos" : ""}">${money(divYTD)}</div>
      <div class="stat-sub muted">${yr}</div>
    </article>
  </section>`;

  // Collapse list panels to a one-line empty state until they have data.
  const listPanel = (title, has, body, emptyMsg, extra) =>
    panel(title, has ? body : `<p class="empty-line muted">${emptyMsg}</p>`, extra);

  const html = `
    ${isEmpty ? onboardingHTML() : ""}
    ${metrics}
    <section class="warn-wrap">${warningsHTML()}</section>
    <section class="grid-2 dash-charts">
      ${(() => {
        const hasTxn = ALL_TRANSACTIONS.some((x) => x.type === "Buy" || x.type === "Deposit") || HOLDINGS.length > 0;
        const chartToggle = `<div class="seg seg-sm" id="dashChartSeg" style="margin-left:0"><button class="seg-btn ${dashChartMode === "mv" ? "on" : ""}" data-chart="mv">${t("Market Value")}</button><button class="seg-btn ${dashChartMode === "div" ? "on" : ""}" data-chart="div">${t("Incl. Dividends")}</button></div>`;
        // Toggle + explainer icon grouped together and right-aligned in the panel
        // head, same position as the Asset Allocation toggle right next to it —
        // not left-aligned inside the body like a second, competing header.
        const chartHeadExtra = hasTxn
          ? `<div style="display:flex;align-items:center;gap:8px;margin-left:auto">${chartToggle}<span class="col-info tip-down" data-tip="${t("Shows your portfolio market value versus what you paid — the gap between the two lines is your unrealized gain or loss.")}">${COL_INFO_ICON_SVG}</span></div>`
          : "";
        const chartBody = hasTxn
          ? `<div id="dashChartBody">${buildDashChartContent()}</div>`
          : emptyState(`${t("Record your first deposit or Buy to start tracking.")}<div style="margin-top:14px"><a class="btn primary" href="#/add">${t("Add a transaction")} →</a></div>`);
        return panel(t("Investment Return Over Time"), chartBody, chartHeadExtra);
      })()}
      ${(() => {
        const allocToggle = `<div class="seg seg-sm" id="dashAllocSeg">
          <button class="seg-btn ${dashAllocMode === "currency" ? "on" : ""}" data-alloc="currency">${t("By currency")}</button>
          <button class="seg-btn ${dashAllocMode === "type" ? "on" : ""}" data-alloc="type">${t("By type")}</button>
        </div>`;
        return panel("Asset Allocation", `<div id="dashAllocBody" class="panel-body">${dashAllocDonutHTML()}</div>`, allocToggle);
      })()}
    </section>
    <div id="dashDivSection">${listPanel("Upcoming Dividends", dashUpcoming.length,
      table([{label:"Ticker",style:"width:15%"},{label:"Ex-Date",style:"width:20%"},{label:"Payment",style:"width:20%"},{label:"Expected Net (RM)",style:"width:25%"},{label:"Status",style:"width:20%"}], divRows, { fixed: true }),
      t("No upcoming dividends."), `<a class="link" href="#/dividends">${t("Calendar")} →</a>`)}</div>
    ${listPanel("Holdings", T.holdings.length,
      table([{label:"Holding",style:"width:25%"},{label:"Shares",style:"width:10%"},{label:"Market Value",style:"width:15%"},{label:"Unrealized P/L",style:"width:15%"},{label:"P/L %",style:"width:10%"},{label:"Total Return",style:"width:15%"},{label:"Return %",style:"width:10%"}], holdingsRows, { fixed: true }),
      t("No holdings yet — record a Buy on the Add page and it appears here automatically."), `<div style="margin-left:auto;display:flex;align-items:center;gap:12px">${pricesAsOf ? metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${pricesAsOfFmt}`) : ""}<a class="link" style="margin-left:0" href="#/portfolio">${t("View all")} →</a></div>`)}
    ${insightsHTML()}
    ${listPanel("Recent Activity", ALL_TRANSACTIONS.length,
      table([{label:"Date",style:"width:20%"},{label:"Type",style:"width:20%"},{label:"Ticker",style:"width:20%"},{label:"Broker",style:"width:20%"},{label:"Amount",style:"width:20%"}], recentRows, { fixed: true }),
      t("No activity yet."), `<a class="link" href="#/records">${t("All")} →</a>`)}
    <p class="dash-footnote">${metaNote(SAVED_ICON_SVG, LAST_SAVED ? `${t("Last saved on this device")}: ${fmtDateTime(LAST_SAVED)}` : t("Nothing saved yet"))}</p>`;

  return { title: "Dashboard", subtitle: "Welcome back — here is your portfolio at a glance.", html,
    mount() {
      $$("[data-card]").forEach((el) => {
        const open = () => showCalc(calcs[el.dataset.card]);
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
      $$("[data-return]").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();   // don't trigger the P/L card's calc modal
        SETTINGS.returnMode = b.dataset.return; saveStore(); render();
      }));
      $$("[data-alloc]").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        dashAllocMode = b.dataset.alloc;
        $$("[data-alloc]").forEach((btn) => btn.classList.toggle("on", btn.dataset.alloc === dashAllocMode));
        const allocBody = $("#dashAllocBody");
        if (allocBody) {
          allocBody.innerHTML = dashAllocDonutHTML();
        }
      }));
      [
        ["phDivYield", t("Dividend Yield (TTM)"), t("Trailing 12-month net dividends ÷ current portfolio market value.")],
        ["phCashAlloc", t("Cash Allocation"), t("Cash as a percentage of total net value (market value + available cash).")],
        ["phDivScore", t("Diversification Score"), t("Effective N score based on portfolio weights. Higher = more diversified.")],
      ].forEach(([id, title, body]) => {
        const el = $("#" + id);
        if (el) el.addEventListener("click", () => {
          $("#modalTitle").textContent = title;
          $("#modalBody").innerHTML = `<p style="margin:0;font-size:13.5px;line-height:1.7">${body}</p>`;
          $("#modal").hidden = false;
        });
      });
      mountChartTooltips();
      $$("[data-chart]").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        dashChartMode = b.dataset.chart;
        try { localStorage.setItem("il-chart-mode", dashChartMode); } catch(e) {}
        $$("[data-chart]").forEach((btn) => btn.classList.toggle("on", btn.dataset.chart === dashChartMode));
        const chartBody = $("#dashChartBody");
        if (chartBody) { chartBody.innerHTML = buildDashChartContent(); mountChartTooltips(); }
      }));
      // Auto-fetch dividend schedules for all holdings; re-render if still here
      if (LIVE_ENABLED) {
        fetchAllDivSchedules().then(({ fetched }) => {
          if (fetched && document.getElementById("dashDivSection")) render();
        });
        fetchAllLivePrices().then(({ fetched }) => {
          if (fetched && document.getElementById("dashDivSection")) render();
        });
      }
    } };
}

function onboardingHTML() {
  const steps = [
    { done: BROKERS.length > 0, label: t("Add a broker"), href: "#/brokers" },
    { done: ALL_TRANSACTIONS.some((x) => x.type === "Deposit"), label: t("Record your first deposit"), href: "#/add/deposit" },
    { done: ALL_TRANSACTIONS.some((x) => x.type === "Buy") || HOLDINGS.length > 0, label: t("Record a Buy (or import an existing holding)"), href: "#/add/buy" },
    { done: Object.keys(CURRENT_PRICES).length > 0, label: t("Add a current price"), href: "#/portfolio" },
    { done: ALL_TRANSACTIONS.some((x) => x.type === "Dividend"), label: t("Record a dividend"), href: "#/add/dividend" },
  ];
  const done = steps.filter((s) => s.done).length;
  const cloudOn = typeof syncAvailable === "function" && syncAvailable() && typeof SYNC_USER !== "undefined" && SYNC_USER;
  const privacyNote = cloudOn
    ? `<span class="w-ico">☁</span><span class="w-body">${t("Cloud Sync is on — your data syncs to your account and is available on any device you sign into.")}</span>`
    : `<span class="w-ico">💻</span><span class="w-body">${t("Your data stays on this device and this browser only — nothing is shared or synced. If you're trying this out from a shared link, your entries are private to you and won't affect anyone else's. Opening the app on a different device starts a separate, empty ledger there too.")}</span>`;
  // Each step is a real, clickable destination — the panel is a self-sufficient
  // onboarding surface on its own, not a summary that points somewhere else.
  const stepList = `<div class="onboard-list">${steps.map((s) => s.done
    ? `<span class="onboard-step done"><span class="os-check">✓</span><span class="os-label">${s.label}</span></span>`
    : `<a class="onboard-step" href="${s.href}"><span class="os-check"></span><span class="os-label">${s.label}</span></a>`
  ).join("")}</div>`;
  return panel("Welcome to Investment Ledger", `
    <p class="muted" style="margin:-2px 0 10px">${t("A few things to set up — click any step below to get started.")}</p>
    <p class="info-card" style="margin:0 0 14px">${privacyNote}</p>
    ${stepList}
    <p class="muted" style="margin:8px 0 0;font-size:12.5px">${done} / ${steps.length} ${t("steps done")}</p>`);
}

function warningsHTML() {
  const items = [];
  // Reconciliation differences beyond tolerance
  Object.keys(RECON_CHECKS).forEach((bid) => {
    const chk = RECON_CHECKS[bid];
    if (chk == null || chk.actual == null) return;
    const calc = T.brokerCash[bid] || 0;
    const diff = calc - (+chk.actual);
    if (Math.abs(diff) > (SETTINGS.reconTolerance || 0)) {
      items.push({ level: "crit", html: `<strong>${t("Cash difference")} — ${esc(brokerName(bid))}.</strong> ${t("Calculated")} ${money(calc)} ${t("vs actual")} ${money(+chk.actual)} (${t("difference")} ${money(Math.abs(diff))}). ${t("Check for a missing fee, dividend or transfer.")}` });
    }
  });
  // Missing current prices
  if (T.missingPrices > 0) items.push({ level: "warn", html: `${T.missingPrices} ${t("holding(s) have no current price set — portfolio value uses cost as a placeholder.")}` });
  // Stale live prices (fetched > 2 days ago)
  const staleLive = T.holdings.filter((h) => h.priceSource === "live" && daysSince(h.priceFetchedAt) > 2);
  if (staleLive.length) items.push({ level: "warn", html: `${t("Live prices are over 2 days old for")} ${staleLive.map((h) => h.ticker).join(", ")} — ${t("refresh them on the Portfolio page.")}` });
  // Oversell flags
  if (T.oversells && T.oversells.length) items.push({ level: "crit", html: `${t("A sell exceeds shares held for")}: ${[...new Set(T.oversells.map((o) => o.ticker))].join(", ")}. ${t("Use the oversell override if intentional.")}` });
  // Stale FX
  if (FX.updated && daysSince(FX.updated) > 30) items.push({ level: "warn", html: `${t("Exchange rates were last updated")} ${daysSince(FX.updated)} ${t("days ago — refresh them in Settings.")}` });
  return items.map((it) => `<div class="warn-card ${it.level === "crit" ? "crit" : ""}">
    <span class="w-ico">${it.level === "crit" ? "⚠️" : HOW_ICON_SVG}</span><div class="w-body">${it.html}</div></div>`).join("");
}

/* =============================================================================
 * STYLED DROPDOWN — replaces native <select>, whose open menu the OS renders
 * un-themed (the bright-blue popup). Carries its value in a hidden <input>
 * so FormData and `change` listeners keep working unchanged. Currency variants
 * (data-more="currency") add a searchable "More currencies…" world list.
 * ========================================================================== */
function escAttr(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;"); }

/* Full world currency list for the "More currencies…" picker. */
const WORLD_CCY = [
  ["MYR","Malaysian Ringgit"],["USD","US Dollar"],["EUR","Euro"],["GBP","British Pound"],["SGD","Singapore Dollar"],
  ["HKD","Hong Kong Dollar"],["CNY","Chinese Yuan"],["JPY","Japanese Yen"],["AUD","Australian Dollar"],["CAD","Canadian Dollar"],
  ["CHF","Swiss Franc"],["NZD","New Zealand Dollar"],["INR","Indian Rupee"],["IDR","Indonesian Rupiah"],["THB","Thai Baht"],
  ["PHP","Philippine Peso"],["VND","Vietnamese Dong"],["KRW","South Korean Won"],["TWD","Taiwan Dollar"],["AED","UAE Dirham"],
  ["SAR","Saudi Riyal"],["QAR","Qatari Riyal"],["KWD","Kuwaiti Dinar"],["BHD","Bahraini Dinar"],["OMR","Omani Rial"],
  ["ZAR","South African Rand"],["BRL","Brazilian Real"],["MXN","Mexican Peso"],["ARS","Argentine Peso"],["CLP","Chilean Peso"],
  ["COP","Colombian Peso"],["SEK","Swedish Krona"],["NOK","Norwegian Krone"],["DKK","Danish Krone"],["PLN","Polish Zloty"],
  ["CZK","Czech Koruna"],["HUF","Hungarian Forint"],["RON","Romanian Leu"],["TRY","Turkish Lira"],["RUB","Russian Ruble"],
  ["ILS","Israeli Shekel"],["EGP","Egyptian Pound"],["NGN","Nigerian Naira"],["KES","Kenyan Shilling"],["PKR","Pakistani Rupee"],
  ["BDT","Bangladeshi Taka"],["LKR","Sri Lankan Rupee"],["MMK","Myanmar Kyat"],["KHR","Cambodian Riel"],["BND","Brunei Dollar"],
  ["MOP","Macanese Pataca"],["ISK","Icelandic Krona"],["UAH","Ukrainian Hryvnia"],["MAD","Moroccan Dirham"],["PEN","Peruvian Sol"],
];

/* Currency options for a picker: base first, (future) recently-used, then all known rates. */
function currencyItems() {
  const base = FX.base;
  const recent = [];   // FUTURE: derive from ALL_TRANSACTIONS once history exists (smart "recently used")
  const order = [...new Set([base, ...recent, ...Object.keys(FX.rates)])];
  return order.map((c) => ({ value: c, label: ccyLabel(c) }));
}

function styledSelect(name, items, value, o = {}) {
  const cur = items.find((i) => i.value === value) || items[0] || { value: "", label: o.placeholder || "" };
  const opts = items.map((i) =>
    `<button type="button" class="sel-opt${i.value === cur.value ? " on" : ""}" role="option" data-val="${escAttr(i.value)}">${i.label}</button>`).join("");
  const more = o.more === "currency" ? `<button type="button" class="sel-more">${t("More currencies…")}</button>` : "";
  const comboClass = o.combo === "left" ? " sel-combo-l" : (o.combo ? " sel-combo" : "");
  return `<div class="sel${comboClass}"${o.more ? ` data-more="${o.more}"` : ""}>
    <input type="hidden"${o.id ? ` id="${o.id}"` : ""} name="${name}" value="${escAttr(cur.value)}">
    <button type="button" class="sel-trigger"><span class="sel-val">${cur.label}</span><span class="sel-caret" aria-hidden="true">▾</span></button>
    <div class="sel-pop" role="listbox" hidden><div class="sel-list">${opts}</div>${more}</div>
  </div>`;
}
function openSel(s) { s.classList.add("open"); const p = s.querySelector(".sel-pop"); if (p) p.hidden = false; }
function closeSel(s) { s.classList.remove("open"); const p = s.querySelector(".sel-pop"); if (p) p.hidden = true; }

/* Rebuild a currency dropdown's normal list (reflects current FX.rates + value, base first). */
function rebuildCurrencyPop(sel, value) {
  const pop = sel.querySelector(".sel-pop");
  const opts = currencyItems().map((i) =>
    `<button type="button" class="sel-opt${i.value === value ? " on" : ""}" role="option" data-val="${escAttr(i.value)}">${i.label}</button>`).join("");
  pop.innerHTML = `<div class="sel-list">${opts}</div><button type="button" class="sel-more">${t("More currencies…")}</button>`;
}
function worldCurrencyOptions(q) {
  q = (q || "").trim().toUpperCase();
  const list = WORLD_CCY.filter(([code, name]) => !q || code.includes(q) || name.toUpperCase().includes(q));
  if (!list.length) return `<div class="sel-empty">${t("No matching currency")}</div>`;
  return list.slice(0, 60).map(([code, name]) =>
    `<button type="button" class="sel-opt sel-search-opt" data-val="${code}"><span class="sel-sym">${ccyLabel(code)}</span><span class="sel-name">${name}</span></button>`).join("");
}
function openCurrencySearch(sel) {
  const pop = sel.querySelector(".sel-pop");
  pop.innerHTML = `<div class="sel-search"><input type="text" class="sel-search-input" placeholder="${t("Search currency…")}" autocomplete="off"></div>
    <div class="sel-search-list">${worldCurrencyOptions("")}</div>`;
  openSel(sel);
  const inp = pop.querySelector(".sel-search-input"); if (inp) setTimeout(() => inp.focus(), 0);
}
async function pickWorldCurrency(sel, code) {
  if (!FX.rates[code]) {
    const d = await fetchRatesAgainstBase(FX.base);
    const live = d && d.rates && d.rates[code] != null;
    FX.rates[code] = live ? perBaseToRate(d.rates[code]) : 1;
    saveStore();
    toast(live ? `${code} ${t("added at the live rate")}` : `${code} ${t("added — set its rate in Settings")}`);
  }
  const input = sel.querySelector('input[type="hidden"]');
  input.value = code;
  const valEl = sel.querySelector(".sel-val"); if (valEl) valEl.textContent = code;
  rebuildCurrencyPop(sel, code);
  closeSel(sel);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function initStyledSelects() {
  document.addEventListener("click", async (e) => {
    const trig = e.target.closest(".sel-trigger");
    const more = e.target.closest(".sel-more");
    const sopt = e.target.closest(".sel-search-opt");
    const opt = !sopt && e.target.closest(".sel-opt");
    $$(".sel.open").forEach((s) => { if (!s.contains(e.target)) closeSel(s); });
    if (trig) {
      const s = trig.closest(".sel");
      if (s.classList.contains("open")) { closeSel(s); return; }
      if (s.dataset.more === "currency") rebuildCurrencyPop(s, s.querySelector('input[type="hidden"]').value);
      openSel(s); return;
    }
    if (more) { e.preventDefault(); openCurrencySearch(more.closest(".sel")); return; }
    if (sopt) { e.preventDefault(); await pickWorldCurrency(sopt.closest(".sel"), sopt.dataset.val); return; }
    if (opt) {
      const s = opt.closest(".sel");
      const input = s.querySelector('input[type="hidden"]');
      input.value = opt.dataset.val;
      s.querySelector(".sel-val").textContent = opt.textContent;
      s.querySelectorAll(".sel-opt").forEach((o) => o.classList.toggle("on", o === opt));
      closeSel(s);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  document.addEventListener("input", (e) => {
    const inp = e.target.closest(".sel-search-input");
    if (!inp) return;
    const list = inp.closest(".sel-pop").querySelector(".sel-search-list");
    if (list) list.innerHTML = worldCurrencyOptions(inp.value);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".sel.open").forEach(closeSel); });
}

/* Set a field's value whether it's a native <select> or our styled dropdown. */
function setSelectValue(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return;
  if (el.tagName === "SELECT") {
    if (![...el.options].some((o) => o.value === value)) {
      const o = document.createElement("option"); o.value = value; o.textContent = value; el.appendChild(o);
    }
    el.value = value;
    return;
  }
  el.value = value;   // hidden input inside .sel
  const sel = el.closest(".sel");
  if (!sel) return;
  const pop = sel.querySelector(".sel-pop");
  let opt = sel.querySelector(`.sel-opt[data-val="${escAttr(value)}"]`);
  if (!opt && pop) {
    opt = document.createElement("button");
    opt.type = "button"; opt.className = "sel-opt"; opt.setAttribute("role", "option");
    opt.dataset.val = value; opt.textContent = value; pop.appendChild(opt);
  }
  const valEl = sel.querySelector(".sel-val"); if (valEl) valEl.textContent = value;
  sel.querySelectorAll(".sel-opt").forEach((o) => o.classList.toggle("on", o.dataset.val === value));
  el.dispatchEvent(new Event("change", { bubbles: true }));   // let listeners (e.g. FX sync) react
}

/* Market name → currency, for auto-setting currency on the opening-holding form. */
const MARKET_CCY = {
  NASDAQ: "USD", NYSE: "USD", NYSEARCA: "USD", ARCA: "USD", AMEX: "USD", BATS: "USD",
  "BURSA": "MYR", "BURSA MALAYSIA": "MYR", KLSE: "MYR", MYX: "MYR",
  SGX: "SGD", SES: "SGD", HKEX: "HKD", HKSE: "HKD", SEHK: "HKD",
  LSE: "GBP", TSX: "CAD", ASX: "AUD", TYO: "JPY", TSE: "JPY", JPX: "JPY",
};

/* "1 broker" vs "3 brokers" — singular when count is 1 (EN). */
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

/* =============================================================================
 * OPENING-HOLDING FORM — one-time import of positions owned before tracking.
 * Lives in Settings (not Portfolio) so it isn't mistaken for the normal
 * "add a stock" flow, which is a Buy transaction on the Add page.
 * ========================================================================== */
function openingHoldingFormHTML() {
  if (!BROKERS.length) return `<p class="muted">${t("Add a broker first (More → Brokers), then you can import holdings.")}</p><div class="form-actions" style="margin-top:14px"><a class="btn primary" href="#/brokers">${t("Add a broker")} →</a></div>`;
  const ccyItems = currencyItems();
  const brokerItems = BROKERS.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.name }));
  return `<form id="holdingForm" class="form opening-form" autocomplete="off">
        <p class="muted form-intro">${t("Use this only for investments you owned before you started tracking in Investment Ledger. New purchases should be entered as Buy transactions.")}</p>

        <div class="form-group">
          <h4 class="form-sub">${t("What you own")}</h4>
          <div class="form-grid og-own">
            <label>${t("Ticker")}<input name="ticker" placeholder="AAPL" required></label>
            <label>${t("Company Name")}<input name="company" placeholder="Apple Inc."></label>
            <label>${t("Market")}<input name="market" placeholder="NASDAQ"></label>
            <label>${t("Asset type")}${styledSelect("assetType", ASSET_TYPES.map((x) => ({ value: x, label: t(x) })), "Stock", { id: "ohAssetType" })}</label>
          </div>
          <div class="lookup-status muted" id="holdingLookup"></div>
        </div>

        <div class="form-group">
          <h4 class="form-sub">${t("Where & how much")}</h4>
          <div class="form-grid og-where">
            <label>${t("Broker")}${styledSelect("brokerId", brokerItems, brokerItems[0] && brokerItems[0].value)}</label>
            <label>${t("Currency")}${styledSelect("currency", ccyItems, FX.base, { id: "ohCurrency", more: "currency" })}</label>
            <label>${t("Shares")}<input type="number" step="any" name="shares" placeholder="0" required></label>
          </div>
        </div>

        <div class="form-group">
          <h4 class="form-sub">${t("Cost basis")}</h4>
          <div class="form-grid og-cost">
            <label>${t("Avg Cost per share")}<input type="number" step="any" name="avgCost" placeholder="0.00" required></label>
            <label id="ohFxField">${t("FX rate to")} ${ccyLabel(FX.base)}<input type="number" step="any" name="openingFxRate" placeholder="1.0"></label>
            <label>${t("As-of date")}<input type="date" name="asOfDate" value="${todayISO()}"></label>
            <label>${t("Current price")}<input type="number" step="any" name="currentPrice" placeholder="${t("optional — for instant P/L")}"></label>
          </div>
        </div>

        <div class="form-actions"><button class="btn primary" type="submit">${t("Add Opening Holding")}</button></div>
      </form>`;
}

function mountOpeningHoldingForm() {
  const hf = $("#holdingForm");
  if (!hf) return;
  mountDatePickers(hf);
  const ht = hf.querySelector('[name="ticker"]');
  if (ht) ht.addEventListener("change", () => autofillFromTicker(hf, $("#holdingLookup"), { fillPrice: false }));
  attachAutocomplete(hf, $("#holdingLookup"), { fillPrice: false });

  // Currency-dependent FX rate: hide for base currency, prefill the real rate otherwise.
  const ccyInput = $("#ohCurrency");
  const fxField = $("#ohFxField");
  const fxInput = hf.querySelector('[name="openingFxRate"]');
  const syncFx = () => {
    const ccy = (ccyInput && ccyInput.value) || FX.base;
    const isBase = ccy === FX.base;
    if (fxField) fxField.style.display = isBase ? "none" : "";
    if (fxInput) fxInput.value = isBase ? "" : (FX.rates[ccy] || "");
  };
  if (ccyInput) ccyInput.addEventListener("change", syncFx);
  const mEl = hf.querySelector('[name="market"]');
  if (mEl) mEl.addEventListener("change", () => {
    const k = mEl.value.trim().toUpperCase();
    if (!k) return;
    let ccy = MARKET_CCY[k];
    if (!ccy) { const m = Object.keys(MARKET_CCY).find((x) => k.includes(x)); if (m) ccy = MARKET_CCY[m]; }
    if (ccy && FX.rates[ccy]) setSelectValue(hf, "currency", ccy);   // dispatches change → syncFx
  });
  syncFx();

  hf.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const ticker = d.ticker.trim().toUpperCase();
    if (!ticker) { toast(t("Enter a ticker.")); return; }
    const shares = parseFloat(d.shares);
    if (!(shares > 0)) { toast(t("Enter a number of shares greater than 0.")); return; }
    const avgCost = parseFloat(d.avgCost);
    if (!(avgCost >= 0)) { toast(t("Enter an average cost of 0 or more.")); return; }
    let openingFxRate = null;
    if (d.openingFxRate) {
      openingFxRate = parseFloat(d.openingFxRate);
      if (!(openingFxRate > 0)) { toast(t("Enter an exchange rate greater than 0.")); return; }
    }
    HOLDINGS.push({
      ticker, company: (d.company || "").trim(),
      brokerId: d.brokerId, market: (d.market || "").trim(), currency: d.currency,
      shares, avgCost, openingFxRate,
      asOfDate: d.asOfDate || todayISO(), netDividends: 0,
    });
    setHoldingType(ticker, d.assetType);
    const cp = parseFloat(d.currentPrice);
    if (cp > 0) CURRENT_PRICES[ticker] = { price: cp, currency: d.currency, date: todayISO(), source: "manual" };
    saveStore(); toast(t("Opening holding added")); render();
  });
}

/* =============================================================================
 * PAGE: PORTFOLIO  (with working filters + grouped allocations)
 * ========================================================================== */
const portfolioFilters = { broker: "", market: "", currency: "", sort: "" };
let portfolioTab = "holdings";   // holdings | allocation
const EXCHANGE_NAMES = { NMS:"NASDAQ", NGM:"NASDAQ", NCM:"NASDAQ", NYQ:"NYSE", PCX:"NYSE Arca", KLS:"Bursa Malaysia", KLSE:"Bursa Malaysia", LSE:"London SE", HKG:"Hong Kong SE", ASX:"ASX", TSX:"TSX" };
function exchangeName(code) { return code ? (EXCHANGE_NAMES[code] || code) : ""; }
function marketRegion(m) { return (m === "KLS" || m === "KLSE") ? "malaysia" : (m ? "global" : ""); }

const PORTFOLIO_PREFS_KEY = "il-portfolio-v2";
const COL_DEFS = [
  { id: "broker",         label: "Broker" },
  { id: "shares",         label: "Shares" },
  { id: "avgCost",        label: "Avg Cost" },
  { id: "price",          label: "Price" },
  { id: "priceMyr",       label: "≈ Base currency" },
  { id: "unrealizedAmt",  label: "Unrealized P/L" },
  { id: "unrealizedPct",  label: "Unrealized %" },
  { id: "totalReturnAmt", label: "Total Return" },
  { id: "totalReturnPct", label: "Total Return %" },
  { id: "marketValue",    label: "Market Value" },
  { id: "netDiv",         label: "Net Dividends" },
];
const COL_DEFAULTS = {
  broker: true, shares: true, avgCost: true, price: true, priceMyr: false,
  unrealizedAmt: false, unrealizedPct: true, totalReturnAmt: true, totalReturnPct: false,
  marketValue: true, netDiv: false,
};
function loadPortfolioPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(PORTFOLIO_PREFS_KEY) || "{}");
    const cols = Object.assign({}, COL_DEFAULTS, s.cols || {});
    const allIds = COL_DEFS.map((d) => d.id);
    const saved = Array.isArray(s.colOrder) ? s.colOrder.filter((id) => allIds.includes(id)) : [];
    const colOrder = [...saved, ...allIds.filter((id) => !saved.includes(id))];
    return { cols, colOrder };
  } catch { return { cols: Object.assign({}, COL_DEFAULTS), colOrder: COL_DEFS.map((d) => d.id) }; }
}
function savePortfolioPrefs() {
  try { localStorage.setItem(PORTFOLIO_PREFS_KEY, JSON.stringify(portfolioPrefs)); } catch {}
}
let portfolioPrefs = loadPortfolioPrefs();
let _colPanelCloseHandler = null;

function aggregateHoldingsByTicker(holdings) {
  const map = {};
  holdings.forEach((h) => {
    if (!map[h.ticker]) {
      map[h.ticker] = { ...h, _brokerIds: [h.brokerId], _brokerNames: [brokerName(h.brokerId)] };
    } else {
      const g = map[h.ticker];
      const newShares = g.shares + h.shares;
      const newCost = (g.costBasis || 0) + (h.costBasis || 0);
      g.shares = newShares; g.costBasis = newCost;
      g.avgCost = newShares > 0 ? newCost / newShares : 0;
      g.marketValue = (g.marketValue || 0) + (h.marketValue || 0);
      g.unrealized = (g.unrealized || 0) + (h.unrealized || 0);
      g.unrealizedPct = newCost > 0 ? (g.unrealized / newCost) * 100 : 0;
      g.totalReturn = (g.totalReturn || 0) + (h.totalReturn || 0);
      g.netDividends = (g.netDividends || 0) + (h.netDividends || 0);
      g.hasPrice = g.hasPrice && h.hasPrice;
      g._brokerIds.push(h.brokerId); g._brokerNames.push(brokerName(h.brokerId));
      if (h.priceFetchedAt && (!g.priceFetchedAt || h.priceFetchedAt > g.priceFetchedAt)) {
        g.currentPrice = h.currentPrice; g.currentPriceCcy = h.currentPriceCcy;
        g.currentPriceDate = h.currentPriceDate; g.priceFetchedAt = h.priceFetchedAt;
        g.priceSource = h.priceSource; g.currency = h.currency;
      }
    }
  });
  return Object.values(map);
}

function pagePortfolio() {
  const has = T.holdings.length > 0;
  const regions = [...new Set(T.holdings.map((h) => marketRegion(h.market)).filter(Boolean))];
  const regionLabels = { malaysia: t("Malaysia stocks"), global: t("Global stocks") };
  const currencies = [...new Set(T.holdings.map((h) => h.currency))].filter(Boolean);

  const filtersActive = !!(portfolioFilters.broker || portfolioFilters.market || portfolioFilters.currency || portfolioFilters.sort);
  const gripSvg = `<svg class="grip-ico" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="1.5"/><circle cx="15" cy="8" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="15" cy="16" r="1.5"/></svg>`;
  const closeSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const colPanelHtml = `<div class="col-panel-wrap filters-col-panel" id="colPanelWrap">
    <button class="btn ghost" id="colBtn">${t("Edit columns")}</button>
    <div class="col-panel" id="colPanel" hidden>
      <div class="col-panel-header">
        <span class="col-panel-title">${t("Columns")}</span>
        <button class="col-panel-close" id="colPanelClose" aria-label="${t("Close")}">${closeSvg}</button>
      </div>
      <p class="col-panel-hint">${gripSvg} ${t("Drag to reorder (or use the arrows on touch) · toggle to show/hide")}</p>
      <div class="col-panel-list" id="colPanelList">
        ${(() => {
          const byId = Object.fromEntries(COL_DEFS.map((d) => [d.id, d]));
          const orderedDefs = portfolioPrefs.colOrder.map((id) => byId[id]).filter(Boolean);
          return orderedDefs.map((d, i) => `<div class="col-toggle-row" data-col-id="${d.id}">
            <span class="col-grip" draggable="true" aria-hidden="true">${gripSvg}</span>
            <label class="col-toggle"><input type="checkbox" data-col="${d.id}"${portfolioPrefs.cols[d.id] ? " checked" : ""}><span>${t(d.label)}</span></label>
            <span class="col-move-btns">
              <button type="button" class="col-move-up" data-col-id="${d.id}" aria-label="${t("Move up")}" ${i === 0 ? "disabled" : ""}>▲</button>
              <button type="button" class="col-move-down" data-col-id="${d.id}" aria-label="${t("Move down")}" ${i === orderedDefs.length - 1 ? "disabled" : ""}>▼</button>
            </span>
          </div>`).join("");
        })()}
      </div>
    </div>
  </div>`;
  const filterBar = `<div class="filters">
    ${styledSelect("fBroker", [{ value: "", label: t("All brokers") }, ...BROKERS.map((b) => ({ value: b.id, label: b.name }))], portfolioFilters.broker, { id: "fBroker" })}
    ${styledSelect("fMarket", [{ value: "", label: t("All stocks") }, ...regions.map((r) => ({ value: r, label: regionLabels[r] }))], portfolioFilters.market, { id: "fMarket" })}
    ${styledSelect("fCurrency", [{ value: "", label: t("All currencies") }, ...currencies.map((c) => ({ value: c, label: c }))], portfolioFilters.currency, { id: "fCurrency" })}
    ${styledSelect("fSort", [
      { value: "",            label: t("Default order") },
      { value: "name",        label: t("Name (A → Z)") },
      { value: "gainPct",     label: t("Gain %") },
      { value: "totalReturn", label: t("Total Return") },
      { value: "shares",      label: t("Shares") },
      { value: "marketValue", label: t("Market Value") },
    ], portfolioFilters.sort, { id: "fSort" })}
    <button class="btn ghost btn-reset${filtersActive ? " active" : ""}" id="fReset">${t("Reset")}</button>
    ${colPanelHtml}</div>`;

  // Allocation breakdowns — moved here from the old Reports page (which was mostly a
  // mirror of other pages); this is genuinely-not-shown-elsewhere info, so it belongs
  // on the page it's actually about. See allocationPanel.
  const distinctBrokers = new Set(T.holdings.map((h) => h.brokerId)).size;
  const allocA = allocationData();
  const breakdowns = has ? `<div class="pf-breakdowns">
      ${allocationPanel(t("By Country"), allocA.byCountry, allocA.total)}
      ${allocationPanel(t("By Sector"), allocA.bySector, allocA.total)}
      ${allocationPanel(t("By Currency"), allocA.byCurrency, allocA.total)}
      ${distinctBrokers >= 2 ? allocationPanel(t("By Brokerage"), allocA.byBroker, allocA.total) : ""}</div>` : "";

  const emptyContent = BROKERS.length
    ? `<div class="portfolio-empty">
         <p class="pe-msg">${t("No holdings yet — record a Buy on the Add page and it appears here automatically.")}</p>
         <a class="btn primary" href="#/add"><svg class="icon" aria-hidden="true" style="width:14px;height:14px;flex:none"><use href="#i-add"/></svg>${t("Record your first Buy")}</a>
       </div>`
    : `<div class="portfolio-empty">
         <p class="pe-msg">${t("Add a broker first (More → Brokers), then record a Buy and it appears here.")}</p>
         <a class="btn ghost" href="#/brokers">${t("Go to Brokers")}</a>
       </div>`;

  const latestFetch = T.holdings.filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  const priceStampHtml = `<span id="pfPriceStamp">${latestFetch ? metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${fmtDateTime(latestFetch)}`) : ""}</span>`;
  const refreshBtn = `<button class="icon-btn pf-refresh" id="pfRefreshBtn" title="${t("Refresh live prices")}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>`;
  // Holdings table vs. allocation breakdowns — same tp-tab pills as the Records page,
  // so switching doesn't feel like a different component elsewhere in the app.
  const pfTabs = [["holdings", "Holdings"], ["allocation", "Allocation"]];
  const pfNav = `<div class="type-tabs" role="tablist" style="margin-bottom:16px">${pfTabs.map(([k, lbl]) =>
    `<button class="tp-tab ${portfolioTab === k ? "on" : ""}" data-pftab="${k}">${t(lbl)}</button>`).join("")}</div>`;
  const html = has
    ? `<div id="pfSummary">${portfolioSummaryHTML()}</div>
       ${pfNav}
       ${portfolioTab === "allocation" ? breakdowns
          : panel(t("All Holdings"), filterBar + `<div id="holdingsBody">${portfolioTable()}</div>`,
              `<div class="panel-head-actions">${priceStampHtml}${refreshBtn}</div>`)}`
    : panel(t("Holdings"), emptyContent);

  return { title: "Portfolio", subtitle: LANG === "zh"
      ? `${T.holdings.length} 个持仓，${BROKERS.length} 个券商 · ${money(T.portfolioValue)}`
      : `${plural(T.holdings.length, "holding", "holdings")} across ${plural(BROKERS.length, "broker", "brokers")} · ${money(T.portfolioValue)}`, html,
    mount() {
      $$("[data-pftab]").forEach((b) => b.addEventListener("click", () => { portfolioTab = b.dataset.pftab; render(); }));
      const apply = () => {
        const hb = $("#holdingsBody"); if (hb) hb.innerHTML = portfolioTable();
        const sm = $("#pfSummary"); if (sm) sm.innerHTML = portfolioSummaryHTML();
      };
      const onFilter = (id, key) => { const el = $(id); if (el) el.addEventListener("change", (e) => { portfolioFilters[key] = e.target.value; apply(); }); };
      onFilter("#fBroker", "broker"); onFilter("#fMarket", "market"); onFilter("#fCurrency", "currency"); onFilter("#fSort", "sort");
      const fr = $("#fReset");
      if (fr) fr.addEventListener("click", () => { Object.keys(portfolioFilters).forEach((k) => (portfolioFilters[k] = "")); render(); });
      // Column visibility panel
      const colBtn = $("#colBtn"), colPanel = $("#colPanel");
      if (colBtn && colPanel) {
        colBtn.addEventListener("click", (e) => { e.stopPropagation(); colPanel.hidden = !colPanel.hidden; });
        const colPanelClose = $("#colPanelClose");
        if (colPanelClose) colPanelClose.addEventListener("click", (e) => { e.stopPropagation(); colPanel.hidden = true; });
        colPanel.addEventListener("change", (e) => {
          const cb = e.target.closest("[data-col]");
          if (!cb) return;
          portfolioPrefs.cols[cb.dataset.col] = cb.checked;
          savePortfolioPrefs(); apply();
        });
        if (_colPanelCloseHandler) document.removeEventListener("click", _colPanelCloseHandler);
        _colPanelCloseHandler = (ev) => {
          const wrap = document.getElementById("colPanelWrap");
          if (!colPanel.hidden && wrap && !wrap.contains(ev.target)) colPanel.hidden = true;
        };
        document.addEventListener("click", _colPanelCloseHandler);
      }
      // Refresh button (panel head)
      const pfRefreshBtn = $("#pfRefreshBtn");
      if (pfRefreshBtn) pfRefreshBtn.addEventListener("click", async () => {
        if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
        pfRefreshBtn.disabled = true;
        pfRefreshBtn.querySelector("svg").classList.add("spinning");
        const pfPriceStamp = $("#pfPriceStamp");
        if (pfPriceStamp) pfPriceStamp.textContent = t("Updating prices…");
        const tickers = [...new Set(T.holdings.map((h) => h.ticker))];
        let ok = 0;
        for (const tk of tickers) { if (await refreshLivePrice(tk)) ok++; }
        const nonBase = Object.keys(FX.rates).filter((c) => c !== FX.base);
        for (const ccy of nonBase) {
          const q = await fetchQuote(`${ccy}${FX.base}=X`);
          if (q && q.price > 0) FX.rates[ccy] = +q.price;
        }
        saveStore(); render();
        toast(ok ? `${ok}/${tickers.length} ${t("prices updated")}` : t("Couldn't fetch prices — check the ticker symbols (Yahoo format)."));
      });
      // Auto-refresh prices without waiting for the manual button — same pattern as the
      // dividend auto-fetch elsewhere; re-render if still on this page once it lands.
      if (LIVE_ENABLED) {
        fetchAllLivePrices().then(({ fetched }) => {
          if (fetched && document.getElementById("pfRefreshBtn")) render();
        });
      }
      // Panel drag-to-reorder
      if (colPanel) {
        let _panelDragId = null;
        colPanel.addEventListener("dragstart", (e) => {
          const grip = e.target.closest(".col-grip");
          if (!grip) return;
          const row = grip.closest(".col-toggle-row");
          if (!row) return;
          _panelDragId = row.dataset.colId;
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("col-row-dragging");
        });
        colPanel.addEventListener("dragend", () => {
          colPanel.querySelectorAll(".col-row-dragging, .col-row-drag-over").forEach((el) =>
            el.classList.remove("col-row-dragging", "col-row-drag-over"));
          _panelDragId = null;
        });
        colPanel.addEventListener("dragover", (e) => {
          const row = e.target.closest(".col-toggle-row");
          if (row && _panelDragId && row.dataset.colId !== _panelDragId) {
            e.preventDefault();
            colPanel.querySelectorAll(".col-row-drag-over").forEach((el) => el.classList.remove("col-row-drag-over"));
            row.classList.add("col-row-drag-over");
          }
        });
        colPanel.addEventListener("dragleave", (e) => {
          const row = e.target.closest(".col-toggle-row");
          if (row && !row.contains(e.relatedTarget)) row.classList.remove("col-row-drag-over");
        });
        // Shared by drag-drop and the touch-friendly move-up/down buttons: persist the
        // new order, re-append rows to match it, fix which move buttons are disabled
        // at the new top/bottom, then refresh the actual table.
        const applyColOrder = (order) => {
          portfolioPrefs.colOrder = order;
          savePortfolioPrefs();
          const allRows = [...colPanel.querySelectorAll(".col-toggle-row")];
          const sorted = order.map((id) => allRows.find((r) => r.dataset.colId === id)).filter(Boolean);
          const colPanelList = colPanel.querySelector(".col-panel-list") || colPanel;
          sorted.forEach((r, i) => {
            colPanelList.appendChild(r);
            const up = r.querySelector(".col-move-up"), down = r.querySelector(".col-move-down");
            if (up) up.disabled = i === 0;
            if (down) down.disabled = i === sorted.length - 1;
          });
          apply();
        };
        colPanel.addEventListener("drop", (e) => {
          const row = e.target.closest(".col-toggle-row");
          if (!row || !_panelDragId || row.dataset.colId === _panelDragId) return;
          e.preventDefault();
          colPanel.querySelectorAll(".col-row-drag-over").forEach((el) => el.classList.remove("col-row-drag-over"));
          const order = [...portfolioPrefs.colOrder];
          const fromIdx = order.indexOf(_panelDragId);
          const toIdx = order.indexOf(row.dataset.colId);
          if (fromIdx >= 0 && toIdx >= 0) {
            order.splice(fromIdx, 1);
            order.splice(toIdx, 0, _panelDragId);
            applyColOrder(order);
          }
          _panelDragId = null;
        });
        // Touch-friendly alternative to drag: HTML5 drag-and-drop never fires on
        // touch browsers, so without these buttons the reorder feature is dead
        // weight on a phone. Visible only on coarse-pointer devices (see CSS).
        colPanel.addEventListener("click", (e) => {
          const btn = e.target.closest(".col-move-up, .col-move-down");
          if (!btn || btn.disabled) return;
          const id = btn.dataset.colId;
          const order = [...portfolioPrefs.colOrder];
          const idx = order.indexOf(id);
          const swapWith = btn.classList.contains("col-move-up") ? idx - 1 : idx + 1;
          if (idx < 0 || swapWith < 0 || swapWith >= order.length) return;
          [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
          applyColOrder(order);
        });
      }
    } };
}

/* Holdings matching the current Portfolio-page filters (broker/market/currency)
 * — shared by the table and the summary strip above it, so "respect filters"
 * means the same thing in both places instead of two separate filter copies
 * silently drifting apart. */
function filteredHoldings() {
  const f = portfolioFilters;
  return T.holdings.filter((h) =>
    (!f.broker || h.brokerId === f.broker) &&
    (!f.market || marketRegion(h.market) === f.market) &&
    (!f.currency || h.currency === f.currency));
}

/* Summary strip above the holdings table — respects the same filters as the
 * table below it, so it's a running total of whatever's currently shown, not
 * always the whole portfolio. % figures are weighted by cost basis (sum of
 * gain ÷ sum of cost), not an average of each row's own percentage — those
 * aren't the same thing once holdings have different position sizes. */
function portfolioSummaryHTML() {
  const rows = filteredHoldings();
  const mv = rows.reduce((s, h) => s + h.marketValue, 0);
  const costBasis = rows.reduce((s, h) => s + h.costBasis, 0);
  const unrealized = rows.reduce((s, h) => s + h.unrealized, 0);
  const totalReturn = rows.reduce((s, h) => s + h.totalReturn, 0);
  const unrealizedPct = costBasis ? (unrealized / costBasis) * 100 : 0;
  const totalReturnPct = costBasis ? (totalReturn / costBasis) * 100 : 0;
  return `<div class="mini-cards" style="margin-bottom:16px">
    <div class="mini-card"><div class="mc-label">${t("Market Value")}</div><div class="mc-value">${money(mv)}</div></div>
    <div class="mini-card"><div class="mc-label">${t("Unrealized P/L")}</div><div class="mc-value ${cls(unrealized)}">${moneySigned(unrealized)}</div><div class="mc-sub ${cls(unrealizedPct)}">${pctTxt(unrealizedPct)}</div></div>
    <div class="mini-card"><div class="mc-label">${t("Total Return")}</div><div class="mc-value ${cls(totalReturn)}">${moneySigned(totalReturn)}</div><div class="mc-sub ${cls(totalReturnPct)}">${pctTxt(totalReturnPct)}</div></div>
  </div>`;
}

function portfolioTable() {
  const f = portfolioFilters;
  const { cols, colOrder } = portfolioPrefs;
  let rows = aggregateHoldingsByTicker(filteredHoldings());
  if (f.sort === "name")             rows.sort((a, b) => (a.ticker || "").localeCompare(b.ticker || ""));
  else if (f.sort === "gainPct")     rows.sort((a, b) => (b.unrealizedPct || 0) - (a.unrealizedPct || 0));
  else if (f.sort === "totalReturn") rows.sort((a, b) => (b.totalReturn || 0) - (a.totalReturn || 0));
  else if (f.sort === "shares")      rows.sort((a, b) => (b.shares || 0) - (a.shares || 0));
  else if (f.sort === "marketValue") rows.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
  if (!rows.length) return emptyState(T.holdings.length
    ? t("No holdings match these filters.")
    : t("No holdings yet. Add a buy transaction to create your first holding."));

  // Visible columns in user-defined order
  const orderedColIds = colOrder.filter((id) => cols[id]);
  const colLabels = {
    broker: t("Broker"), shares: t("Shares"), avgCost: t("Avg Cost"),
    price: t("Price"), priceMyr: `≈ ${ccyLabel(FX.base)}`,
    unrealizedAmt: t("Unrealized P/L"), unrealizedPct: t("P/L %"),
    totalReturnAmt: t("Total Return"), totalReturnPct: t("Return %"),
    marketValue: t("Market Value"), netDiv: t("Net Dividends"),
  };

  // Equal-width, left-aligned columns (same convention as the Dashboard/Holding Detail
  // tables) — computed dynamically since the column set here is user-configurable via
  // "Edit columns", so a fixed percentage split wouldn't fit every combination. Percentage
  // widths alone are only a hint under table-layout:auto, so narrow-content columns (e.g.
  // Broker, Price) render narrower than intended — but switching to table-layout:fixed
  // instead makes columns overflow into each other once many columns are enabled (each
  // one's share of 100% gets too small for its own content). A per-column min-width fixes
  // the narrow-column case while staying on auto layout, so a too-many-columns table grows
  // past 100% and scrolls horizontally (via .table-wrap) instead of overlapping.
  const colPct = (100 / (orderedColIds.length + 1)).toFixed(2);
  const colMinWidths = {
    broker: 130, shares: 90, avgCost: 100, price: 110, priceMyr: 100,
    unrealizedAmt: 110, unrealizedPct: 90, totalReturnAmt: 110, totalReturnPct: 90,
    marketValue: 110, netDiv: 110,
  };
  const body = rows.map((h) => {
    const totalReturnPct = h.costBasis > 0 ? (h.totalReturn / h.costBasis) * 100 : 0;
    const cellMap = {
      broker:         `<td class="dcc-c"><div class="broker-pills">${(h._brokerNames || [brokerName(h.brokerId)]).map((n) => `<span class="chip chip-pill">${esc(n)}</span>`).join("")}</div></td>`,
      shares:         `<td class="dcc-c">${fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>`,
      avgCost:        `<td class="dcc-c">${money(h.avgCost)}</td>`,
      price:          `<td class="dcc-c">${h.hasPrice ? `${ccyLabel(h.currentPriceCcy)} ${fmt(h.currentPrice)}` : `<span class="muted">—</span>`}</td>`,
      priceMyr:       `<td class="dcc-c">${(h.hasPrice && h.currency !== FX.base) ? `${ccyLabel(FX.base)} ${fmt(h.currentPrice * (FX.rates[h.currency] || 1))}` : `<span class="muted">—</span>`}</td>`,
      unrealizedAmt:  `<td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? moneySigned(h.unrealized) : `<span class="muted">—</span>`}</td>`,
      unrealizedPct:  `<td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? pctTxt(h.unrealizedPct) : `<span class="muted">—</span>`}</td>`,
      totalReturnAmt: `<td class="dcc-c ${cls(h.totalReturn)}">${moneySigned(h.totalReturn)}</td>`,
      totalReturnPct: `<td class="dcc-c ${cls(h.totalReturn)}">${pctTxt(totalReturnPct)}</td>`,
      marketValue:    `<td class="dcc-c">${h.hasPrice ? money(h.marketValue) : `<span class="muted">—</span>`}</td>`,
      netDiv:         `<td class="dcc-c">${h.netDividends ? money(h.netDividends) : `<span class="muted">—</span>`}</td>`,
    };
    return `<tr>
      <td class="dcc-c td-holding">
        <a class="ticker ticker-link" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">${esc(h.ticker)}</a>
        ${h.company ? `<div class="sub">${esc(h.company)}</div>` : ""}
      </td>
      ${orderedColIds.map((id) => cellMap[id] || "").join("")}</tr>`;
  }).join("");

  const colTooltips = {
    unrealizedPct: t("Unrealized gain/loss as a percentage of your cost basis"),
    totalReturnPct: t("Total return including dividends, as a percentage of cost basis"),
    priceMyr: t("Live price converted to base currency at today's exchange rate"),
  };
  const thCols = orderedColIds.map((id) => {
    const tip = colTooltips[id] ? ` <span class="col-info tip-down" data-tip="${colTooltips[id]}">${COL_INFO_ICON_SVG}</span>` : "";
    return `<th style="width:${colPct}%;min-width:${colMinWidths[id] || 100}px;text-align:left" data-col-id="${id}">${colLabels[id] || id}${tip}</th>`;
  }).join("");
  const thead = `<thead><tr><th style="width:${colPct}%;min-width:140px">${t("Holding")}</th>${thCols}</tr></thead>`;

  return `<div class="table-wrap"><table class="data-table">${thead}<tbody>${body}</tbody></table></div>`;
}

/* =============================================================================
 * PAGE: TRANSACTIONS  (list + working Add Transaction form)
 * ========================================================================== */
let editingTxId = null;  // P0.1: id of the transaction currently being edited

/* =============================================================================
 * PAGE: RECORDS — unified ledger (Transactions + Cash + Dividend history)
 * ========================================================================== */
let recordsTab = "all";   // all | buysell | cash | dividends | fx
const RECORD_GROUPS = {
  buysell: ["Buy", "Sell", "Stock split", "DRIP / Reinvested"],
  cash: ["Deposit", "Withdrawal", "Fee", "Tax withholding", "Interest / cash yield", "Interest", "Transfer between brokers"],
  dividends: ["Dividend"],
  fx: ["Currency Exchange"],
};
function recordMatchesTab(x, tab) {
  if (tab === "all") return true;
  return (RECORD_GROUPS[tab] || []).includes(x.type);
}

// Cash tab only: narrow further to one cash movement type, so the summary below
// can total up just that type instead of the fixed Deposits/Withdrawals/Net/Available set.
let cashSubFilter = "all";   // all | deposit | withdrawal | fee | interest | transfer
const CASH_SUBFILTERS = [
  ["all", "All", null],
  ["deposit", "Deposit", ["Deposit"]],
  ["withdrawal", "Withdrawal", ["Withdrawal"]],
  ["fee", "Fee", ["Fee", "Tax withholding"]],
  ["interest", "Interest", ["Interest", "Interest / cash yield"]],
  ["transfer", "Transfer", ["Transfer between brokers"]],
];
function matchesCashSubFilter(x) {
  if (recordsTab !== "cash" || cashSubFilter === "all") return true;
  const sf = CASH_SUBFILTERS.find(([k]) => k === cashSubFilter);
  return !!sf && sf[2].includes(x.type);
}

function pageRecords() {
  const tabs = [["all", "All"], ["buysell", "Buy / Sell"], ["cash", "Cash"], ["dividends", "Dividends"], ["fx", "FX"]];
  // Same pill-tab-inside-the-panel layout as the Add page (type-selector + add-sep),
  // rather than a separate segmented control floating above its own panel.
  const nav = `<div class="type-selector"><div class="type-tabs" role="tablist">${tabs.map(([k, lbl]) =>
    `<button class="tp-tab ${recordsTab === k ? "on" : ""}" data-rectab="${k}">${t(lbl)}</button>`).join("")}</div></div>`;
  // Cash-tab type filter: same corner dropdown used by the Dividend Calendar / Dividend
  // Income filters (styledSelect inside panel-head-actions), not a second pill row.
  const cashFilterSel = recordsTab === "cash" ? `<div style="width:150px">${styledSelect("cashSubFilter",
    CASH_SUBFILTERS.map(([k, lbl]) => ({ value: k, label: t(lbl) })), cashSubFilter, { id: "cashSubFilterSel" })}</div>` : "";
  const list = ALL_TRANSACTIONS.filter((x) => recordMatchesTab(x, recordsTab) && matchesCashSubFilter(x));
  const addBtn = BROKERS.length ? `<a class="btn primary" href="#/add">＋ ${t("Add")}</a>` : "";
  const html = `<section class="panel add-panel">
      ${nav}
      <div class="add-sep"></div>
      <div class="panel-head"><h2>${t("Transactions")}</h2><div class="panel-head-actions">${cashFilterSel}<span class="badge subtle">${list.length} ${t("records")}</span>${addBtn}</div></div>
      ${recordsTab === "cash" ? cashExtrasHTML(list) : ""}
      <div id="recBody">${recordsTable(list)}</div>
    </section>`;

  return { title: "Transactions", subtitle: "All your transactions, cash and dividends in one ledger.", html,
    mount() {
      $$("[data-rectab]").forEach((b) => b.addEventListener("click", () => { recordsTab = b.dataset.rectab; cashSubFilter = "all"; render(); }));
      const cashFilterEl = $("#cashSubFilterSel");
      if (cashFilterEl) cashFilterEl.addEventListener("change", () => { cashSubFilter = cashFilterEl.value; render(); });
      $("#recBody").addEventListener("click", (e) => {
        const ed = e.target.closest("[data-edit-tx]");
        if (ed) { editingTxId = ed.dataset.editTx; location.hash = "#/add"; return; }
        const b = e.target.closest("[data-del-tx]");
        if (!b) return;
        const tx = ALL_TRANSACTIONS.find((x) => x.id === b.dataset.delTx);
        // Deleting a Buy that has later Sells of the same stock distorts realized P/L.
        const buyWithSells = tx && tx.type === "Buy" && ALL_TRANSACTIONS.some((x) =>
          x.type === "Sell" && x.brokerId === tx.brokerId && (x.ticker || "").toUpperCase() === (tx.ticker || "").toUpperCase());
        const msg = buyWithSells && tx.dripPairId
          ? t("This Buy has later Sell transactions for the same stock, and is also one half of a DRIP reinvestment whose paired record won't be deleted automatically. Deleting it will make those sells exceed shares held and distort realized P/L. Delete anyway?")
          : buyWithSells
          ? t("This Buy has later Sell transactions for the same stock. Deleting it will make those sells exceed shares held and distort realized P/L. Delete anyway?")
          : (tx && tx.dripPairId
            ? t("This is one half of a DRIP reinvestment. Its paired record won't be deleted automatically. Delete anyway?")
            : t("Delete this transaction? Holdings and balances will be recalculated."));
        if (!confirm(msg)) return;
        const i = ALL_TRANSACTIONS.findIndex((x) => x.id === b.dataset.delTx);
        if (i >= 0) ALL_TRANSACTIONS.splice(i, 1);
        if (editingTxId === b.dataset.delTx) editingTxId = null;
        pruneOrphans();
        saveStore(); toast(t("Transaction removed")); render();
      });
      $$("[data-cashcard]").forEach((el) => {
        const open = () => showCalc(cashCardCalc(el.dataset.cashcard, list));
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      });
    } };
}

/* One unified ledger table: base-currency (MYR) amount, equal-width dcc-c columns
 * (same style as the Portfolio / Dividends tables). */
function recordsTable(list) {
  if (!ALL_TRANSACTIONS.length) {
    // The panel's "＋ Add" button only renders when a broker exists (see addBtn a few
    // lines up) — telling the user to tap it when there's nothing to tap is a dead end.
    if (!BROKERS.length) return emptyState(`${t("You need a broker before you can record transactions — every transaction belongs to a broker.")}<div class="form-actions" style="margin-top:14px;justify-content:center"><a class="btn primary" href="#/brokers">${t("Add a broker")} →</a></div>`);
    return emptyState(t("No transactions yet. Tap ＋ Add to record your first deposit or investment."));
  }
  if (!list.length) return emptyState(t("No records in this view yet."));
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const rows = sorted.map((tx) => {
    const fxr = tx.fxRate || FX.rates[tx.currency] || 1;
    const myr = tx.myrEquivalent != null ? tx.myrEquivalent : (+tx.gross || 0) * fxr;
    return `<tr>
      <td class="dcc-c">${fmtDate(tx.date)}</td>
      <td class="dcc-c">${typeChip(tx.type)}</td>
      <td class="dcc-c ticker">${tx.ticker && tx.ticker !== "—" ? esc(tx.ticker) : "—"}</td>
      <td class="dcc-c">${money(myr)}</td>
      <td class="dcc-c">${esc(brokerName(tx.brokerId))}${tx.type === "Transfer between brokers" && tx.toBrokerId ? `<div class="fx-note">→ ${esc(brokerName(tx.toBrokerId))}</div>` : ""}</td>
      <td class="dcc-c"><div class="rec-actions">
        <button class="icon-btn rec-edit" data-edit-tx="${tx.id}" title="${t("Edit")}" aria-label="${t("Edit")}"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn rec-del" data-del-tx="${tx.id}" title="${t("Remove")}" aria-label="${t("Remove")}"><svg class="icon"><use href="#i-trash"/></svg></button></div></td></tr>`;
  }).join("");
  return table([
    { label: "Date", style: "width:18%;text-align:left" },
    { label: "Type", style: "width:16%;text-align:left" },
    { label: "Ticker", style: "width:20%;text-align:left" },
    { label: "Amount (RM)", style: "width:18%;text-align:left" },
    { label: "Broker", style: "width:18%;text-align:left" },
    { label: "", style: "width:10%" },
  ], rows, { fixed: true });
}

/* =============================================================================
 * PAGE: ADD — pick a type first, then a focused form (only relevant fields)
 * ========================================================================== */
const ADD_SLUGS = { buy: "Buy", sell: "Sell", deposit: "Deposit", withdraw: "Withdrawal",
  dividend: "Dividend", fx: "Currency Exchange", fee: "Fee",
  interest: "Interest", split: "Stock split", transfer: "Transfer between brokers", drip: "DRIP / Reinvested" };
const ADD_PRIMARY = [["buy", "Buy", "i-buy"], ["sell", "Sell", "i-sell"], ["deposit", "Deposit", "i-deposit"],
  ["withdraw", "Withdraw", "i-withdraw"], ["dividend", "Dividend", "i-dividends"], ["fx", "FX", "i-fx"]];
const ADD_OTHER = [["fee", "Fee"], ["interest", "Interest"],
  ["split", "Stock split"], ["transfer", "Transfer between brokers"], ["drip", "DRIP / Reinvested"]];

// Shared fields kept across type switches on the Add page (broker/date/currency/notes).
let addDraft = {};

function typeSelectorHTML(activeType) {
  // Switching type re-renders the drawer body in place (no page navigation) — each pill
  // is a <button data-drawer-type>, wired in renderAddDrawerBody.
  const pill = ([slug, lbl, ico]) => {
    const on = ADD_SLUGS[slug] === activeType;
    const icon = ico ? `<span class="tp-tab-ico"><svg class="icon"><use href="#${ico}"/></svg></span>` : "";
    return `<button type="button" class="tp-tab${on ? " on" : ""}" data-drawer-type="${slug}">${icon}<span>${t(lbl)}</span></button>`;
  };
  // Rare types (Fee / Interest / Split / Transfer) live behind an "Other" dropdown rather
  // than a second pill row — compact, doesn't shift the form, matches the app's other
  // dropdowns. The trigger shows the selected rare type's name when one is active.
  const activeOther = ADD_OTHER.find(([s]) => ADD_SLUGS[s] === activeType);
  const otherMenu = ADD_OTHER.map(([slug, lbl]) =>
    `<button type="button" class="type-other-item${ADD_SLUGS[slug] === activeType ? " on" : ""}" data-drawer-type="${slug}">${t(lbl)}</button>`).join("");
  const otherDropdown = `<div class="type-other">
    <button type="button" class="tp-tab${activeOther ? " on" : ""}" data-drawer-other-toggle>
      <span>${activeOther ? t(activeOther[1]) : t("Other")}</span><span class="tp-caret" aria-hidden="true">▾</span>
    </button>
    <div class="type-other-menu" hidden>${otherMenu}</div>
  </div>`;
  return `<div class="type-selector">
    <div class="type-tabs">${ADD_PRIMARY.map(pill).join("")}${otherDropdown}</div>
  </div>`;
}

/* The #/add route no longer has its own page — it renders the Records list and
 * opens the add/edit drawer OVER it, so recording a transaction happens in-context
 * (you see the ledger the moment you save) instead of a separate full-page form.
 * Every entry point (nav "Add", the Records "Add" button, a row's Edit button)
 * still just navigates to #/add, so the router stays untouched — only what #/add
 * shows changed. */
function pageAdd() {
  const rec = pageRecords();
  return { title: rec.title, subtitle: rec.subtitle, html: rec.html,
    mount() { rec.mount(); openAddDrawer(); } };
}

/* Open (or refresh) the add/edit drawer. Reads edit target from editingTxId and the
 * type from the hash slug — both set by whatever navigated to #/add. */
function openAddDrawer() {
  const editing = editingTxId ? ALL_TRANSACTIONS.find((x) => x.id === editingTxId) : null;
  if (editingTxId && !editing) editingTxId = null;
  const slug = decodeURIComponent((location.hash.split("/")[2] || ""));
  const type = editing ? editing.type : (ADD_SLUGS[slug] || "Buy");
  renderAddDrawerBody(type, editing);
  const dr = $("#addDrawer");
  if (dr) { dr.classList.remove("closing"); dr.hidden = false; }
}

function renderAddDrawerBody(type, editing) {
  const titleEl = $("#addDrawerTitle");
  if (titleEl) titleEl.textContent = editing ? `${t("Edit")} · ${t(type)}` : t("Add record");
  const hasActiveBroker = BROKERS.some((b) => !b.archived);
  // Editing one record hides the type selector (you can't change a record's type); a
  // new record shows it so you can pick Buy / Sell / Dividend / … before filling in.
  const selector = editing ? "" : `${typeSelectorHTML(type)}<div class="add-sep"></div>`;
  const formContent = hasActiveBroker
    ? addForm2(type, editing)
    : `<p class="form-note">${BROKERS.length
        ? t("Your only broker is archived. Add (or restore) an active broker to record transactions.")
        : t("You need a broker before you can record transactions — every transaction belongs to a broker.")}</p>
        <div class="form-actions" style="margin-top:14px"><a class="btn primary" href="#/brokers">${t("Add a broker")} →</a></div>`;
  const body = $("#addDrawerBody");
  if (!body) return;
  body.innerHTML = `${selector}${formContent}`;
  if (hasActiveBroker) mountAddForm(type, editing);
  // Type switch is drawer-local: re-render the body and reflect the type in the URL via
  // replaceState (NOT a hash change — that would re-run the router). Keeping the slug in
  // the URL means a post-save render() reopens the drawer on the same type for rapid entry.
  body.querySelectorAll("[data-drawer-type]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.preventDefault();
    const s = b.dataset.drawerType;
    try { history.replaceState(null, "", `#/add/${s}`); } catch (e) { /* ignore */ }
    renderAddDrawerBody(ADD_SLUGS[s], null);
  }));
  // "Other" trigger opens/closes its dropdown menu (click-outside-to-close is wired once
  // in init()). Selecting a menu item is a data-drawer-type button, handled above.
  const otherToggle = body.querySelector("[data-drawer-other-toggle]");
  if (otherToggle) otherToggle.addEventListener("click", (ev) => {
    ev.preventDefault();
    const menu = body.querySelector(".type-other-menu");
    if (menu) menu.hidden = !menu.hidden;
  });
  translateDOM(body);
}

/* Shared close animation for any .drawer-backdrop: adds .closing (which swaps the
 * open keyframes for the reverse ones via CSS), then waits for that animation to
 * finish — via animationend, with a timeout fallback — before actually hiding it. */
function closeDrawer(dr) {
  if (!dr || dr.hidden || dr.classList.contains("closing")) return;
  dr.classList.add("closing");
  const finish = () => {
    if (!dr.classList.contains("closing")) return; // reopened before the close animation finished
    dr.hidden = true;
    dr.classList.remove("closing");
  };
  const panel = dr.querySelector(".drawer-panel");
  if (panel) panel.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 260); // fallback in case animationend doesn't fire
}

function closeAddDrawer() { closeDrawer($("#addDrawer")); }

/* The focused per-type form. Field NAMES match wireTxSubmit so one submit path serves all. */
function addForm2(type, editing) {
  const e = editing || {};
  const sel = (val, cur) => (val === cur ? " selected" : "");
  const v = (x) => esc(x);
  const draft = editing ? {} : addDraft;   // preserve shared fields across type switches (new records only)
  const selectable = BROKERS.filter((b) => !b.archived || b.id === e.brokerId || b.id === e.toBrokerId);
  const defBroker = e.brokerId || draft.broker || (selectable[0] && selectable[0].id) || "";
  const brokerCcy = (id) => { const b = BROKERS.find((x) => x.id === id); return b ? b.currency : FX.base; };
  const defCcy = e.currency || draft.currency || brokerCcy(defBroker) || FX.base;
  const brokerList = selectable.map((b) => ({ value: b.id, label: b.name }));
  const ccyList = currencyItems();
  const dateVal = e.date || draft.date || todayISO();
  const tickerVal = e.ticker && e.ticker !== "—" ? e.ticker : "";
  const isTrade = type === "Buy" || type === "Sell";
  const fxRow = `<label id="afFxField">${t("FX rate to")} ${ccyLabel(FX.base)}<input type="number" step="any" name="fxRate" id="afFx" value="${v(e.fxRate)}" placeholder="1.0"></label>`;
  // Amount input with the currency selector attached on its right: [ 0.00 ][ MYR ▾ ]
  const amtCombo = (name, val, ph) => `<div class="amt-combo">
      <input type="number" step="any" name="${name}" value="${val}" placeholder="${ph}">
      ${styledSelect("currency", ccyList, defCcy, { id: "afCcy", more: "currency", combo: true })}
    </div>`;

  const head = `<label>${type === "Transfer between brokers" ? t("From broker") : t("Broker")}${styledSelect("broker", brokerList, defBroker, { id: "afBroker" })}</label>
       <label>${t("Date")}<input type="date" name="date" value="${dateVal}" required></label>`;

  let core = "", extra = "";
  if (isTrade) {
    // Company/Market are auto-filled from the ticker lookup → kept as hidden fields.
    // Asset type is only offered on Buy — a Sell operates on an existing position, so
    // there's nothing new to classify (the ticker's type, if already set, still applies).
    const assetTypeField = type === "Buy"
      ? `<label>${t("Asset type")}${styledSelect("assetType", ASSET_TYPES.map((x) => ({ value: x, label: t(x) })), tickerVal ? holdingType(tickerVal) : "Stock", { id: "afAssetType" })}</label>`
      : "";
    core = `
      <label style="grid-column:1/-1">${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label>${t("Quantity / Shares")}<input type="number" step="any" name="qty" value="${v(e.qty)}" placeholder="0"></label>
      <label class="amt-label">${t("Price / Share")}${amtCombo("price", v(e.price), "0.00")}</label>
      ${assetTypeField}
      <input type="hidden" name="company" value="${v(e.company)}">
      <input type="hidden" name="market" value="${v(e.market)}">`;
    extra = `
      <label>${t("Fee")}<input type="number" step="any" name="fee" value="${v(e.fee)}" placeholder="0.00"></label>
      <label>${t("Taxes")}<input type="number" step="any" name="tradeTax" value="${v(e.tax)}" placeholder="0.00"></label>
      ${fxRow}`;
  } else if (type === "Dividend") {
    // Defaults to this broker's own "Dividends paid to" setting (Brokers page) for a brand
    // new record — an explicit edit always wins once one exists.
    const defPaidTo = e.paidTo || (BROKERS.find((b) => b.id === defBroker) || {}).divPaidTo || "broker";
    core = `
      <label>${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label class="amt-label">${t("Gross dividend")}${amtCombo("divGross", type === "Dividend" ? v(e.gross) : "", "0.00")}</label>
      <label>${t("Withholding Tax")}<input type="number" step="any" name="tax" value="${v(e.tax)}" placeholder="0.00"></label>
      <label>${t("Paid to")}<select name="paidTo">
        <option value="broker"${defPaidTo === "broker" ? " selected" : ""}>${t("Broker account (adds to cash)")}</option>
        <option value="bank"${defPaidTo === "bank" ? " selected" : ""}>${t("Bank account (income only)")}</option>
        ${defPaidTo === "reinvested" ? `<option value="reinvested" selected>${t("Reinvested (DRIP)")}</option>` : ""}
      </select></label>
      <input type="hidden" name="company" value="${v(e.company)}">`;
    extra = `
      <label>${t("Ex-dividend Date")}<input type="date" name="exDate" value="${v(e.exDate)}"></label>
      <label>${t("Payment Date")}<input type="date" name="payDate" value="${v(e.payDate)}"></label>
      ${fxRow}`;
  } else if (type === "DRIP / Reinvested") {
    // One DRIP submission records two ordinary, independently-editable transactions (a
    // Dividend with cash suppressed + a Buy it funds) — see wireTxSubmit. Share count is
    // derived, not entered, so there's no Quantity field here.
    const assetTypeField = `<label>${t("Asset type")}${styledSelect("assetType", ASSET_TYPES.map((x) => ({ value: x, label: t(x) })), tickerVal ? holdingType(tickerVal) : "Stock", { id: "afAssetType" })}</label>`;
    core = `
      <label>${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label class="amt-label">${t("Gross dividend")}${amtCombo("divGross", v(e.gross), "0.00")}</label>
      <label>${t("Withholding Tax")}<input type="number" step="any" name="tax" value="${v(e.tax)}" placeholder="0.00"></label>
      <label>${t("Reinvest Price / Share")}<input type="number" step="any" name="price" value="${v(e.price)}" placeholder="0.00"></label>
      ${assetTypeField}
      <input type="hidden" name="company" value="${v(e.company)}">
      <input type="hidden" name="market" value="${v(e.market)}">`;
    extra = `
      <label>${t("Ex-dividend Date")}<input type="date" name="exDate" value="${v(e.exDate)}"></label>
      <label>${t("Payment Date")}<input type="date" name="payDate" value="${v(e.payDate)}"></label>
      ${fxRow}`;
  } else if (type === "Currency Exchange") {
    const otherCcy = (ccyList.find((i) => i.value !== defCcy) || ccyList[0] || {}).value || "";
    core = `
      <label class="ccy-pair" style="grid-column:1/-1">${t("From currency")}
        <div class="ccy-combo">
          ${styledSelect("currency", ccyList, defCcy, { id: "afCcy", more: "currency", combo: "left" })}
          <input type="number" step="any" name="fromAmount" value="${v(e.fromAmount)}" placeholder="0.00">
        </div>
      </label>
      <label class="ccy-pair" style="grid-column:1/-1">${t("To currency")}
        <div class="ccy-combo">
          ${styledSelect("toCurrency", ccyList, e.toCurrency || otherCcy, { id: "afToCcy", more: "currency", combo: "left" })}
          <input type="number" step="any" name="toAmount" value="${v(e.toAmount)}" placeholder="0.00">
        </div>
      </label>
      <div style="grid-column:1/-1">
        <p class="fx-rate-info" id="fxRateDisplay">${t("Exchange rate")}: <span class="muted">${t("Auto-calculated")}</span></p>
        <small class="fx-hint" id="fxHint"></small>
      </div>`;
    extra = `<label>${t("Fee")}<input type="number" step="any" name="fee" value="${v(e.fee)}" placeholder="0.00"></label>${fxRow}`;
  } else if (type === "Stock split") {
    core = `
      <label style="grid-column:1/-1">${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label>${t("Split ratio (new ÷ old)")}<input type="number" step="any" name="splitRatio" value="${type === "Stock split" ? v(e.qty) : ""}" placeholder="2"></label>
      <input type="hidden" name="currency" value="${defCcy}">`;
  } else if (type === "Transfer between brokers") {
    core = `
      <label>${t("To broker")}${styledSelect("toBroker", brokerList, e.toBrokerId || "")}</label>
      <label><span>${t("Stock code")} <span class="form-optional">(${t("optional")})</span></span><input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label class="amt-label" style="grid-column:1/-1"><span>${t("Amount")} <span class="form-optional">(${t("optional")})</span></span>${amtCombo("amount", v(e.gross), "0.00")}</label>
      ${fxRow}`;
  } else { // Deposit, Withdrawal, Fee, Interest — pure cash moves, no fees/taxes
    core = `
      <label class="amt-label" style="grid-column:1/-1">${t("Amount")}${amtCombo("amount", v(e.gross), "0.00")}</label>
      ${fxRow}`;
  }

  const oversell = type === "Sell"
    ? `<label class="check" id="oversellWrap"><input type="checkbox" name="override" ${e.override ? "checked" : ""}> ${t("Allow selling more shares than currently held (override)")}</label>` : "";
  const needsTicker = isTrade || type === "Dividend" || type === "Stock split" || type === "DRIP / Reinvested";
  const hasNote = !!(e.notes || draft.notes);

  return `<form id="txForm" class="form add-form" autocomplete="off">
    <input type="hidden" name="type" value="${type}">
    <div class="form-grid">${head}${core}</div>
    ${needsTicker ? `<div class="lookup-status muted" id="lookupStatus"></div>` : ""}
    ${extra ? `<details class="more-fields"><summary>${(type === "Dividend" || type === "DRIP / Reinvested") ? t("Dividend schedule") : t("Fees, taxes & details")}</summary><div class="form-grid">${extra}</div></details>` : ""}
    ${oversell}
    <div class="note-wrap">
      <button type="button" class="note-add-btn" id="noteToggle"${hasNote ? ' style="display:none"' : ''}>+ ${t("Add note")}</button>
      <label class="note-field" id="noteField"${!hasNote ? ' style="display:none"' : ''}>
        <input type="text" name="notes" value="${v(e.notes != null ? e.notes : draft.notes)}" placeholder="${t("optional")}">
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn primary">${editing ? t("Update Transaction") : t("Save Transaction")}</button>
      <button type="button" class="btn secondary" id="addCancel">${t("Cancel")}</button>
      ${isTrade ? `<span class="add-total" id="addTotal"></span>` : ""}
      ${type === "DRIP / Reinvested" ? `<span class="add-total" id="dripSharesPreview"></span>` : ""}
    </div>
  </form>`;
}

function mountDatePickers(form) {
  form.querySelectorAll('input[type="date"]').forEach((el) => {
    el.addEventListener("click", () => { try { el.showPicker(); } catch (_) {} });
  });
}

function mountAddForm(type, editing) {
  const form = $("#txForm"); if (!form) return;
  mountDatePickers(form);
  wireTxSubmit(form);
  // Preserve shared fields (broker/date/currency/notes) as the user switches type tabs.
  if (!editing) {
    const syncDraft = () => ["broker", "date", "currency", "notes"].forEach((n) => {
      const el = form.querySelector(`[name="${n}"]`); if (el) addDraft[n] = el.value;
    });
    form.addEventListener("input", syncDraft);
    form.addEventListener("change", syncDraft);
    syncDraft();
  }
  // Cancel closes the drawer (navigating to Records re-renders without it).
  const cancelBtn = $("#addCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    editingTxId = null; addDraft = {};
    location.hash = "#/records";
  });
  // Notes toggle: collapsed by default, expands on click, collapses on blur-when-empty
  const noteToggle = form.querySelector("#noteToggle"), noteField = form.querySelector("#noteField"),
        noteInput = form.querySelector('[name="notes"]');
  if (noteToggle && noteField && noteInput) {
    noteToggle.addEventListener("click", () => {
      noteToggle.style.display = "none";
      noteField.style.display = "";
      noteInput.focus();
    });
    noteInput.addEventListener("blur", () => {
      if (!noteInput.value.trim()) {
        noteInput.value = "";
        noteField.style.display = "none";
        noteToggle.style.display = "";
      }
    });
  }
  const brokerSel = $("#afBroker"), ccySel = $("#afCcy"), fxEl = $("#afFx"), fxField = $("#afFxField");
  // FX rate only matters when the currency differs from base — hide it for MYR, prefill it otherwise.
  const syncFx = (prefill) => {
    const ccy = (ccySel && ccySel.value) || FX.base;
    const isBase = ccy === FX.base;
    if (fxField) fxField.style.display = isBase ? "none" : "";
    if (fxEl) {
      if (isBase) fxEl.value = "";
      else if (prefill || !fxEl.value) fxEl.value = FX.rates[ccy] || "";
    }
  };
  if (brokerSel && ccySel) brokerSel.addEventListener("change", () => {
    const b = BROKERS.find((x) => x.id === brokerSel.value);
    if (b && FX.rates[b.currency]) setSelectValue(form, "currency", b.currency);  // updates styled display + fires change → FX/total
  });
  if (ccySel) ccySel.addEventListener("change", () => syncFx(true));   // currency changed → prefill the new rate
  syncFx(false);   // initial: set visibility, keep an existing (edited) rate

  // Currency Exchange: live exchange rate display + same-currency guard hint
  const fromAmt = form.querySelector('[name="fromAmount"]'), toAmt = form.querySelector('[name="toAmount"]'),
        toCcy = form.querySelector('[name="toCurrency"]'), rateDisplay = $("#fxRateDisplay"), fxHint = $("#fxHint");
  if (fromAmt && toAmt && rateDisplay) {
    const upd = () => {
      const f = parseFloat(fromAmt.value) || 0, tt = parseFloat(toAmt.value) || 0;
      const from = (ccySel && ccySel.value) || FX.base, to = (toCcy && toCcy.value) || "";
      const same = from && to && from === to;
      if (fxHint) { fxHint.textContent = same ? t("Pick a different currency for the exchange.") : ""; fxHint.style.display = same ? "" : "none"; }
      const calc = (!same && f > 0 && tt > 0) ? `1 ${from} = ${+(tt / f).toFixed(6)} ${to}` : null;
      rateDisplay.innerHTML = calc
        ? `${t("Exchange rate")}: <strong class="fx-rate-val">${calc}</strong>`
        : `${t("Exchange rate")}: <span class="muted">${t("Auto-calculated")}</span>`;
    };
    [fromAmt, toAmt].forEach((el) => el.addEventListener("input", upd));
    if (toCcy) toCcy.addEventListener("change", upd);
    if (ccySel) ccySel.addEventListener("change", upd);
    upd();
  }
  // Ticker autocomplete + auto-fill (dividend: company only, no live-price line)
  const tickerEl = form.querySelector('[name="ticker"]');
  if (tickerEl && type !== "Transfer between brokers") {
    const lookOpts = { fillPrice: type === "Buy" || type === "Sell" || type === "DRIP / Reinvested", showPrice: type !== "Dividend" };
    const doLookup = () => autofillFromTicker(form, $("#lookupStatus"), lookOpts);
    tickerEl.addEventListener("change", doLookup);
    tickerEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } });
    attachAutocomplete(form, $("#lookupStatus"), lookOpts);
  }
  // Live "Total: MYR X" for Buy/Sell (Quantity × Price, converted to base).
  const totalEl = $("#addTotal");
  if (totalEl) {
    const qtyEl = form.querySelector('[name="qty"]'), priceEl = form.querySelector('[name="price"]');
    const updTotal = () => {
      const q = parseFloat(qtyEl && qtyEl.value) || 0, p = parseFloat(priceEl && priceEl.value) || 0;
      const ccy = (ccySel && ccySel.value) || FX.base;
      const fx = parseFloat(fxEl && fxEl.value) || FX.rates[ccy] || 1;
      if (q > 0 && p > 0) {
        const orig = ccy !== FX.base ? ` <span class="muted">(${ccyLabel(ccy)} ${fmt(q * p)})</span>` : "";
        totalEl.innerHTML = `${t("Total")}: <strong>${money(q * p * fx)}</strong>${orig}`;
      } else totalEl.innerHTML = "";
    };
    [qtyEl, priceEl, fxEl].forEach((el) => el && el.addEventListener("input", updTotal));
    if (ccySel) ccySel.addEventListener("change", updTotal);
    if (brokerSel) brokerSel.addEventListener("change", updTotal);
    updTotal();
  }
  // Live "Shares reinvested: X" for DRIP — (Gross − Tax) ÷ Reinvest price, so the derived
  // share count is visible before submit even though it isn't a directly editable field.
  const dripPreviewEl = $("#dripSharesPreview");
  if (dripPreviewEl) {
    const grossEl = form.querySelector('[name="divGross"]'), taxEl = form.querySelector('[name="tax"]'),
          dripPriceEl = form.querySelector('[name="price"]');
    const updDripPreview = () => {
      const g = parseFloat(grossEl && grossEl.value) || 0, tx = parseFloat(taxEl && taxEl.value) || 0,
            p = parseFloat(dripPriceEl && dripPriceEl.value) || 0;
      const net = g - tx;
      dripPreviewEl.innerHTML = (p > 0 && net > 0)
        ? `${t("Shares reinvested")}: <strong>${fmt(net / p, { maximumFractionDigits: 4 })}</strong>`
        : "";
    };
    [grossEl, taxEl, dripPriceEl].forEach((el) => el && el.addEventListener("input", updDripPreview));
    updDripPreview();
  }
}

/* Extracted submit path — validation, oversell guard, FX, build record, save. */
function wireTxSubmit(form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelectorAll(".field-err").forEach((el) => el.remove());
    form.querySelectorAll(".field-invalid").forEach((el) => el.classList.remove("field-invalid"));

    const d = Object.fromEntries(new FormData(form).entries());
    const type = d.type, currency = d.currency;
    const fxRate = d.fxRate ? parseFloat(d.fxRate) : (FX.rates[currency] || 1);
    const fee = parseFloat(d.fee) || 0;
    let tax = parseFloat(d.tax) || 0;
    if (type === "Buy" || type === "Sell") tax = parseFloat(d.tradeTax) || 0;
    let qty = d.qty ? parseFloat(d.qty) : null;
    let price = d.price ? parseFloat(d.price) : null;
    let gross = parseFloat(d.amount) || 0;
    if (type === "Dividend" || type === "DRIP / Reinvested") gross = parseFloat(d.divGross) || 0;
    const ticker = (d.ticker || "").trim().toUpperCase();
    if (type === "Buy" || type === "Sell") gross = (qty || 0) * (price || 0);
    if (type === "Stock split") qty = parseFloat(d.splitRatio) || 1;

    // fieldErr: highlight a field and show an error message directly below it
    const fieldErr = (fieldName, msg) => {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (input) {
        const selEl = input.closest(".sel");
        const hilite = selEl ? selEl.querySelector(".sel-trigger") : input;
        if (hilite) hilite.classList.add("field-invalid");
        const label = input.closest("label");
        if (label) {
          const errEl = document.createElement("p");
          errEl.className = "field-err";
          errEl.textContent = msg;
          label.insertAdjacentElement("afterend", errEl);
          const clear = () => { errEl.remove(); if (hilite) hilite.classList.remove("field-invalid"); };
          input.addEventListener("input", clear, { once: true });
          input.addEventListener("change", clear, { once: true });
        }
      }
      return true;
    };
    // formErr: for compound conditions where no single field is the culprit
    const formErr = (msg) => {
      const errEl = document.createElement("p");
      errEl.className = "field-err";
      errEl.textContent = msg;
      (form.querySelector(".form-actions") || form).insertAdjacentElement("beforebegin", errEl);
      return true;
    };

    if (d.fxRate && !(parseFloat(d.fxRate) > 0)) return void fieldErr("fxRate", t("Enter an exchange rate greater than 0."));
    if (fee < 0) return void fieldErr("fee", t("Fee can't be negative."));
    if (tax < 0) return void fieldErr(type === "Buy" || type === "Sell" ? "tradeTax" : "tax", t("Tax can't be negative."));

    if (type === "Buy" || type === "Sell") {
      if (!ticker) return void fieldErr("ticker", t("Enter a ticker."));
      if (!(qty > 0)) return void fieldErr("qty", t("Enter a quantity greater than 0."));
      if (!(price > 0)) return void fieldErr("price", t("Enter a price greater than 0."));
    } else if (type === "Dividend") {
      if (!ticker) return void fieldErr("ticker", t("Enter a ticker."));
      if (!(gross > 0)) return void fieldErr("divGross", t("Enter a gross dividend greater than 0."));
    } else if (type === "DRIP / Reinvested") {
      if (!ticker) return void fieldErr("ticker", t("Enter a ticker."));
      if (!(gross > 0)) return void fieldErr("divGross", t("Enter a gross dividend greater than 0."));
      if (!(price > 0)) return void fieldErr("price", t("Enter a price greater than 0."));
      if (!(gross - tax > 0)) return void fieldErr("tax", t("Withholding tax can't exceed the gross dividend."));
    } else if (type === "Currency Exchange") {
      /* validated below */
    } else if (type === "Stock split") {
      if (!(qty > 0)) return void fieldErr("splitRatio", t("Enter a split ratio greater than 0."));
    } else {
      if (type === "Transfer between brokers") {
        if (!(gross > 0) && !ticker) return void formErr(t("Enter an amount or stock code for the transfer."));
        if (d.toBroker === d.broker) return void fieldErr("toBroker", t("Choose a different destination broker."));
      } else {
        if (!(gross > 0)) return void fieldErr("amount", t("Enter an amount greater than 0."));
      }
    }

    if (type === "Sell" && !d.override) {
      const held = sharesHeldExcluding(d.broker, ticker, editingTxId);
      if ((qty || 0) > held + 1e-9) return void fieldErr("qty", `${t("You only hold")} ${fmt(held, { maximumFractionDigits: 4 })} ${t("shares — tick the override to sell more.")}`);
    }

    // A DRIP submission is always a CREATE of two ordinary, independently-editable records
    // (a Dividend with cash suppressed + the Buy it funds) — never a single "DRIP"-typed
    // row, so it takes its own build+push path and returns early instead of falling into
    // the generic single-record path below. Reuses the already-correct Buy/Dividend math
    // in computeTotals() untouched, rather than inventing a bespoke third case.
    if (type === "DRIP / Reinvested") {
      const net = gross - tax;
      const dripQty = price > 0 ? net / price : 0;
      const pairId = uid("drip");
      const companyVal = (d.company || "").trim(), marketVal = (d.market || "").trim(), notesVal = (d.notes || "").trim() || undefined;
      const divRecord = { id: uid("t"), date: d.date, brokerId: d.broker, type: "Dividend",
        ticker, company: companyVal, market: marketVal, currency, qty: null, price: null,
        gross, fee: 0, tax, fxRate, myrEquivalent: gross * fxRate, status: "Received", paidTo: "reinvested",
        exDate: d.exDate || undefined, payDate: d.payDate || undefined, notes: notesVal, dripPairId: pairId };
      const buyRecord = { id: uid("t"), date: d.date, brokerId: d.broker, type: "Buy",
        ticker, company: companyVal, market: marketVal, currency, qty: dripQty, price,
        gross: dripQty * price, fee: 0, tax: 0, fxRate, myrEquivalent: dripQty * price * fxRate,
        notes: notesVal, dripPairId: pairId, drip: true };
      ALL_TRANSACTIONS.unshift(divRecord, buyRecord);
      if (ticker) setHoldingType(ticker, d.assetType);
      if (divRecord.exDate) {
        const udIdx = UPCOMING_DIVIDENDS.findIndex((u) =>
          u.ticker === divRecord.ticker && u.exDate === divRecord.exDate &&
          (u.status || "upcoming") === "upcoming");
        if (udIdx >= 0) {
          UPCOMING_DIVIDENDS[udIdx].status = "confirmed";
          UPCOMING_DIVIDENDS[udIdx].confirmedTransactionId = divRecord.id;
        } else {
          UPCOMING_DIVIDENDS.push({ id: uid("ud"), ticker: divRecord.ticker,
            exDate: divRecord.exDate, payDate: divRecord.payDate || undefined,
            estimatedAmount: null, currency: divRecord.currency,
            source: "manual", status: "confirmed", confirmedTransactionId: divRecord.id });
        }
      }
      editingTxId = null;
      saveStore();
      toast(t("Saved ✓"));
      if (addDraft) delete addDraft.notes;
      render();
      return;
    }

    let extra = {};
    if (type === "Currency Exchange") {
      const fromCurrency = currency;
      const toCurrency = d.toCurrency;
      const fromAmount = parseFloat(d.fromAmount) || 0;
      const toAmount = parseFloat(d.toAmount) || 0;
      if (!(fromAmount > 0)) return void fieldErr("fromAmount", t("Enter an amount to convert."));
      if (!(toAmount > 0)) return void fieldErr("toAmount", t("Enter the amount you received."));
      if (!toCurrency || toCurrency === fromCurrency) return void fieldErr("toCurrency", t("Choose a different destination currency."));
      const exchangeRate = toAmount / fromAmount;
      gross = fromAmount;
      extra = { fromCurrency, toCurrency, fromAmount, toAmount, exchangeRate };
    }

    // Spread the pre-edit record first so fields the form doesn't expose (e.g. a DRIP
    // pair's `drip`/`dripPairId` bookkeeping) survive an edit instead of being silently
    // dropped by this whitelist — every field the form DOES control is set explicitly
    // below and overrides the spread.
    const origRecord = editingTxId ? ALL_TRANSACTIONS.find((x) => x.id === editingTxId) : null;
    const record = { ...(origRecord || {}), id: editingTxId || uid("t"), date: d.date, brokerId: d.broker, type,
      ticker: ticker || "—", company: (d.company || "").trim(), market: (d.market || "").trim(),
      currency, qty, price, gross, fee, tax, fxRate, myrEquivalent: gross * fxRate,
      status: type === "Dividend" ? "Received" : undefined,
      paidTo: type === "Dividend" ? (d.paidTo || "broker") : undefined,
      exDate: d.exDate || undefined, payDate: d.payDate || undefined,
      toBrokerId: type === "Transfer between brokers" ? d.toBroker : undefined,
      override: !!d.override, notes: (d.notes || "").trim() || undefined, ...extra };

    if (type === "Buy" && ticker) setHoldingType(ticker, d.assetType);

    const wasEditing = !!editingTxId;
    if (wasEditing) {
      const i = ALL_TRANSACTIONS.findIndex((x) => x.id === editingTxId);
      if (i >= 0) ALL_TRANSACTIONS[i] = record; else ALL_TRANSACTIONS.unshift(record);
    } else {
      ALL_TRANSACTIONS.unshift(record);
    }
    // When a dividend is recorded with an ex-date, auto-confirm any matching upcoming entry
    // (or create a confirmed entry if none exists), linking it to this transaction.
    if (record.type === "Dividend" && record.exDate) {
      const udIdx = UPCOMING_DIVIDENDS.findIndex((u) =>
        u.ticker === record.ticker && u.exDate === record.exDate &&
        (u.status || "upcoming") === "upcoming");
      if (udIdx >= 0) {
        UPCOMING_DIVIDENDS[udIdx].status = "confirmed";
        UPCOMING_DIVIDENDS[udIdx].confirmedTransactionId = record.id;
      } else {
        UPCOMING_DIVIDENDS.push({ id: uid("ud"), ticker: record.ticker,
          exDate: record.exDate, payDate: record.payDate || undefined,
          estimatedAmount: null, currency: record.currency,
          source: "manual", status: "confirmed", confirmedTransactionId: record.id });
      }
    }
    editingTxId = null;
    saveStore();
    if (wasEditing) {
      toast(t("Transaction updated"));
      location.hash = "#/records";
    } else {
      toast(t("Saved ✓"));
      // Stay on Add for rapid entry: keep broker/date/currency (addDraft), clear the type-specific fields.
      if (addDraft) delete addDraft.notes;
      render();
    }
  });
}

/* Shares held for (broker, ticker), DERIVED from transactions but EXCLUDING one id.
 * Used by the oversell check so editing a Sell doesn't count its own old version (F1). */
function sharesHeldExcluding(brokerId, ticker, excludeId) {
  const tk = (ticker || "").toUpperCase();
  let shares = 0;
  HOLDINGS.forEach((h) => { if (h.brokerId === brokerId && (h.ticker || "").toUpperCase() === tk) shares += +h.shares || 0; });
  [...ALL_TRANSACTIONS].sort(txDateSort).forEach((x) => {
    if (x.id === excludeId || x.brokerId !== brokerId || (x.ticker || "").toUpperCase() !== tk) return;
    if (x.type === "Buy") shares += +x.qty || 0;
    else if (x.type === "Sell") shares -= +x.qty || 0;
    else if (x.type === "Stock split") shares *= (+x.qty || 1);
  });
  return shares;
}

/* Cash-tab summary on Records: one inline ledger strip (.cash-strip/.cash-item)
 * instead of a grid of cards — chosen over three boxed alternatives. Each item is
 * still clickable to see "how" (data-cashcard → the same calc modal the Dashboard
 * stats use), just without a border/shadow around every number. */
function cashExtrasHTML(list) {
  const item = (label, value, card, valCls = "") => `<div class="cash-item" data-cashcard="${card}" tabindex="0" role="button" aria-label="${label}, show calculation">
    <span class="cash-k">${label}</span><span class="cash-v${valCls ? ` ${valCls}` : ""}">${value}</span>
  </div>`;
  if (cashSubFilter === "all") {
    return `<div class="cash-strip">
      ${item(t("Total Deposits"), money(T.totalDeposits), "deposits")}
      ${item(t("Total Withdrawals"), money(T.totalWithdrawals), "withdrawals")}
      ${item(t("Net Cash Added"), money(T.netCapitalInvested), "netcash", cls(T.netCapitalInvested))}
      ${item(t("Available Cash"), money(T.totalCash || 0), "available")}
    </div>`;
  }
  const sum = list.reduce((s, tx) => {
    const fxr = tx.fxRate || FX.rates[tx.currency] || 1;
    return s + (tx.myrEquivalent != null ? tx.myrEquivalent : (+tx.gross || 0) * fxr);
  }, 0);
  const labels = { deposit: "Total Deposits", withdrawal: "Total Withdrawals", fee: "Total Fees", interest: "Total Interest", transfer: "Total Transferred" };
  return `<div class="cash-strip">${item(t(labels[cashSubFilter] || "Total"), money(sum), "focused")}</div>`;
}

/* Cash tab: build the calc breakdown for whichever stat card was clicked. */
function cashCardCalc(card, list) {
  if (card === "deposits") return brokerBreakdownCalc(t("Total Deposits"), ALL_TRANSACTIONS.filter((x) => x.type === "Deposit"));
  if (card === "withdrawals") return brokerBreakdownCalc(t("Total Withdrawals"), ALL_TRANSACTIONS.filter((x) => x.type === "Withdrawal"));
  if (card === "netcash") return netCashAddedCalc();
  if (card === "available") return availableCashCalc();
  const labels = { deposit: "Total Deposits", withdrawal: "Total Withdrawals", fee: "Total Fees", interest: "Total Interest", transfer: "Total Transferred" };
  return brokerBreakdownCalc(t(labels[cashSubFilter] || "Total"), list);
}

/* Broker-page extras: per-currency cash balances, reconciliation against actual
 * balances, fees paid — moved here from the old Reports page since it's genuinely
 * broker-specific info that isn't shown anywhere else, unlike the rest of what used
 * to be there. */
function brokerCashPanelsHTML() {
  // dcc-c left-alignment + fixed, evenly-spaced columns to match every other table in the
  // app (Holdings, Recent Activity, ...) instead of the old right-aligned .num convention.
  const recRows = BROKERS.map((b) => {
    const calc = T.brokerCash[b.id] || 0;
    const chk = RECON_CHECKS[b.id];
    const hasActual = chk && chk.actual != null;
    const diff = hasActual ? calc - (+chk.actual) : null;
    let status = t("Not checked"), scls = "subtle";
    if (hasActual) {
      if (Math.abs(diff) < 0.005) { status = t("Matched"); scls = "pos"; }
      else if (Math.abs(diff) <= (SETTINGS.reconTolerance || 0)) { status = t("Small difference"); scls = "warn"; }
      else { status = t("Needs review"); scls = "neg"; }
    }
    return `<tr><td class="dcc-c">${esc(b.name)}</td><td class="dcc-c">${money(calc)}</td>
      <td class="dcc-c">${hasActual ? money(+chk.actual) : "—"}${hasActual && chk.date ? `<div class="fx-note">${fmtDate(chk.date)}</div>` : ""}</td>
      <td class="dcc-c ${hasActual && Math.abs(diff) > (SETTINGS.reconTolerance || 0) ? "neg" : ""}">${hasActual ? moneySigned(diff) : "—"}</td>
      <td class="dcc-c"><span class="badge ${scls}">${status}</span></td>
      <td class="dcc-c"><button class="btn ghost" data-recon-broker="${b.id}">${t("Update")}</button></td></tr>`;
  }).join("");

  // One combined "Balance" column (currency + amount together, same convention as the
  // Dashboard's Recent Activity amounts) instead of splitting Currency/Balance across two
  // columns, and dcc-c left-alignment to match every other table in the app. A Total row
  // (in base currency, the only unit that can be summed across different currencies) so
  // the panel isn't just 1-2 sparse rows with nothing to add up to.
  const ccyRows = BROKERS.map((b) => {
    const byc = T.brokerCashByCcy[b.id] || {};
    return Object.keys(byc).filter((c) => Math.abs(byc[c]) > 0.005).map((c) =>
      `<tr><td class="dcc-c">${esc(b.name)}</td><td class="dcc-c ${byc[c] < 0 ? "neg" : ""}">${esc(ccyLabel(c))} ${fmt(byc[c])}</td><td class="dcc-c">${money(byc[c] * (FX.rates[c] || 1))}</td></tr>`).join("");
  }).join("");
  const ccyTotal = BROKERS.reduce((s, b) => {
    const byc = T.brokerCashByCcy[b.id] || {};
    return s + Object.keys(byc).reduce((s2, c) => s2 + byc[c] * (FX.rates[c] || 1), 0);
  }, 0);
  const ccyTotalRow = ccyRows
    ? `<tr><td class="dcc-c"><strong>${t("Total")}</strong></td><td class="dcc-c">—</td><td class="dcc-c ${cls(ccyTotal)}"><strong>${money(ccyTotal)}</strong></td></tr>` : "";

  // Long explanatory sentences belong in a hover/tap tooltip (the app's standard col-info
  // "i" icon), not a big badge sitting in the panel header competing with the title.
  const reconTip = `<span class="col-info tip-down" style="margin-left:10px" data-tip="${esc(t("Calculated from every recorded cash movement: deposits, withdrawals, buys, sells, dividends, fees, transfers and currency exchanges."))}">${COL_INFO_ICON_SVG}</span>`;

  // Reconciliation is an advanced/occasional check, not something every user wants to see
  // by default — opt in from Settings (SETTINGS.showReconciliation).
  const reconPanel = SETTINGS.showReconciliation
    ? panel(`${t("Broker Cash Reconciliation")}${reconTip}`, table(
        [{label:"Broker",style:"width:20%"},{label:"Calculated Balance",style:"width:19%"},{label:"Actual Balance",style:"width:19%"},
         {label:"Difference",style:"width:15%"},{label:"Status",style:"width:14%"},{label:"",style:"width:13%"}], recRows, { fixed: true }))
    : "";

  const cashBody = ccyRows
    ? table([{label:"Broker"},{label:"Balance"},{label:`≈ ${ccyLabel(FX.base)}`}], ccyRows + ccyTotalRow)
    : `<p class="muted" style="margin:0 0 12px;font-size:13px">${t("No cash recorded yet.")}</p><a class="btn ghost" href="#/add/deposit">${t("Record a deposit")} →</a>`;
  return `${panel(`${t("Cash Balances by Currency")}`, cashBody)}
    ${reconPanel}`;
}

function mountBrokerCashPanels() {
  $$("[data-recon-broker]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.reconBroker;
    const chk = RECON_CHECKS[id] || {};
    const a = prompt(`${t("Actual cash balance for")} ${brokerName(id)} (${ccyLabel(FX.base)})`, chk.actual != null ? chk.actual : "");
    if (a == null) return;
    const actual = parseFloat(a);
    if (isNaN(actual)) { toast(t("Enter a valid number.")); return; }
    const note = prompt(t("Note (optional)"), chk.note || "") || "";
    RECON_CHECKS[id] = { actual, date: todayISO(), note };
    saveStore(); toast(t("Reconciliation saved")); render();
  }));
}

function miniCard(label, value, valCls = "") {
  return `<div class="mini-card"><div class="mc-label">${label}</div><div class="mc-value ${valCls}">${value}</div></div>`;
}

/* Net dividend of one record, in base currency (gross − tax, at historical FX). */
function divNetMYR(d) { return ((+d.gross || 0) - (+d.tax || 0)) * (d.fxRate || FX.rates[d.currency] || 1); }

/* Aggregate received dividends by month / quarter / year (base currency). */
/* Groups received dividends into byMonth/byQuarter/byYear buckets (base currency net).
 * Keys: YYYY-MM | YYYY Qn | YYYY. Used for MoM/QoQ/YoY delta calculations. */
function dividendByPeriod(received) {
  const byMonth = {}, byQuarter = {}, byYear = {};
  received.forEach((d) => {
    const date = d.payDate || d.date || "";
    if (date.length < 7) return;
    const y = date.slice(0, 4), m = date.slice(5, 7);
    const q = "Q" + (Math.floor((+m - 1) / 3) + 1);
    const net = divNetMYR(d);
    byMonth[`${y}-${m}`] = (byMonth[`${y}-${m}`] || 0) + net;
    byQuarter[`${y} ${q}`] = (byQuarter[`${y} ${q}`] || 0) + net;
    byYear[y] = (byYear[y] || 0) + net;
  });
  return { byMonth, byQuarter, byYear };
}

/* Dividend forecast — pattern-based, never a flat TTM ÷ 12 run-rate.
 * METHOD (documented):
 *  1. Confirmed pipeline: any dividend you (or the market-data auto-fetch)
 *     marked as an upcoming payment with a real pay date inside the window.
 *  2. Pattern projection, per ticker not already covered by #1: detect payment
 *     FREQUENCY from the gaps between past payments (snapped to monthly /
 *     quarterly / semi-annual / annual to avoid drifting), then project future
 *     pay dates at that cadence up to 3 years out. History comes from your own
 *     logged dividends where you have ≥2; otherwise falls back to the ticker's
 *     real market dividend history (Yahoo, via AUTO_DIV_CACHE), scaled to your
 *     current share count and today's FX rate.
 *  3. Growth: with ≥6 historical payments, the average of the most recent 3 is
 *     compared to the 3 before that to estimate a per-payment growth rate
 *     (clamped to ±25%/payment against outliers), compounded forward — so a
 *     stock with a raising history projects growing payments, not a flat repeat.
 * Confirmed and projected amounts are summed separately (expMonth/Quarter/Year
 * vs nextMonth/Quarter/Year) so a run-rate estimate is never confused with a
 * confirmed one. */
function dividendForecast(received, upcoming) {
  const now = todayDate();
  const today = todayISO();
  const cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1);

  // TTM = dividends actually received in trailing 12 months (factual, not a projection)
  const ttm = received.reduce((s, d) => {
    const dt = new Date((d.payDate || d.date) + "T00:00:00");
    return (!isNaN(dt) && dt >= cutoff && dt <= now) ? s + divNetMYR(d) : s;
  }, 0);

  // Confirmed/estimated upcoming payments from the market-data auto-fetch and manual entries
  const knownUpcoming = upcoming
    .filter((d) => d.payDate && d.payDate >= today)
    .map((d) => ({ payDate: d.payDate, amtMYR: d.expectedNetMYR || 0, ticker: d.ticker, confirmed: true }));
  const coveredTickers = new Set(knownUpcoming.map((p) => p.ticker));

  // Pattern detection: group history by ticker, detect payment frequency and
  // growth, project future dates up to 3 years out. Only for tickers NOT
  // already covered by confirmed upcoming data.
  const projected = [];
  const tickerInfo = {};
  const byTicker = {};
  received.forEach((d) => { if (!byTicker[d.ticker]) byTicker[d.ticker] = []; byTicker[d.ticker].push(d); });
  const allTickers = new Set([...Object.keys(byTicker), ...Object.keys(AUTO_DIV_CACHE)]);

  allTickers.forEach((ticker) => {
    if (coveredTickers.has(ticker)) return;
    let sorted = (byTicker[ticker] || [])
      .map((d) => ({ net: divNetMYR(d), ds: d.payDate || d.date }))
      .filter((d) => d.ds)
      .sort((a, b) => (a.ds < b.ds ? -1 : 1));
    let source = "logged";
    // Fall back to real market dividend history when you haven't logged ≥2
    // payments yourself — per-share amounts scaled to your current shares.
    if (sorted.length < 2 && AUTO_DIV_CACHE[ticker] && AUTO_DIV_CACHE[ticker].length >= 2) {
      const h = T.holdings.find((x) => x.ticker === ticker);
      const shares = h ? h.shares : 0;
      sorted = AUTO_DIV_CACHE[ticker]
        .map((d) => ({ net: (d.amount || 0) * shares * (FX.rates[d.currency] || 1), ds: d.date }))
        .filter((d) => d.ds && d.ds < today)
        .sort((a, b) => (a.ds < b.ds ? -1 : 1));
      source = "market history";
    }
    if (sorted.length < 2) return; // still not enough to detect a reliable pattern

    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((new Date(sorted[i].ds + "T00:00:00") - new Date(sorted[i - 1].ds + "T00:00:00")) / 86400000);
      if (days > 20) intervals.push(days);
    }
    if (!intervals.length) return;
    const avgInterval = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
    // Snap to nearest standard frequency to prevent compounding date drift
    const freqDays = avgInterval < 50 ? 30 : avgInterval < 110 ? 91 : avgInterval < 220 ? 182 : 365;
    const freqLabel = freqDays === 30 ? t("monthly") : freqDays === 91 ? t("quarterly") : freqDays === 182 ? t("semi-annual") : t("annual");

    // Growth rate per payment. For anything paying more than once a year, compare each
    // payment to the same position in the cycle one year back (this March vs last March,
    // this September vs last September) rather than a blunt last-3-vs-prior-3 average —
    // that avoids conflating e.g. a smaller interim with a larger final dividend as if it
    // were a trend, and can detect a real pattern from just 2 cycles (4 payments) instead
    // of needing 6. Falls back to the last-3-vs-prior-3 method for annual payers or when
    // there isn't enough same-season history yet.
    let growthPerPayment = 0;
    const paymentsPerYear = freqDays <= 31 ? 12 : freqDays <= 100 ? 4 : freqDays <= 200 ? 2 : 1;
    if (paymentsPerYear >= 2 && sorted.length >= paymentsPerYear * 2) {
      const seasonGrowths = [];
      for (let i = sorted.length - 1; i >= paymentsPerYear; i--) {
        const cur = sorted[i].net, prev = sorted[i - paymentsPerYear].net;
        if (prev > 0) seasonGrowths.push(cur / prev - 1);
      }
      if (seasonGrowths.length) {
        const avgSeasonGrowth = seasonGrowths.reduce((s, v) => s + v, 0) / seasonGrowths.length;
        growthPerPayment = Math.max(-0.25, Math.min(0.25, Math.pow(1 + avgSeasonGrowth, 1 / paymentsPerYear) - 1));
      }
    } else if (sorted.length >= 6) {
      const recent3 = sorted.slice(-3), prior3 = sorted.slice(-6, -3);
      const recentAvg = recent3.reduce((s, d) => s + d.net, 0) / 3;
      const priorAvg = prior3.reduce((s, d) => s + d.net, 0) / 3;
      if (priorAvg > 0) growthPerPayment = Math.max(-0.25, Math.min(0.25, Math.pow(recentAvg / priorAvg, 1 / 3) - 1));
    }

    let amt = sorted.slice(-3).reduce((s, d) => s + d.net, 0) / Math.min(sorted.length, 3);
    let next = new Date(sorted[sorted.length - 1].ds + "T00:00:00");
    next.setDate(next.getDate() + freqDays);
    const limit = new Date(now); limit.setFullYear(limit.getFullYear() + 3);
    tickerInfo[ticker] = { count: sorted.length, freq: freqLabel, source, growthPct: growthPerPayment * 100 };
    while (next <= limit) {
      const ds = dateToISO(next);
      if (ds >= today) { projected.push({ payDate: ds, amtMYR: amt, ticker, confirmed: false }); amt *= (1 + growthPerPayment); }
      next = new Date(next); next.setDate(next.getDate() + freqDays);
    }
  });

  const all = [...knownUpcoming, ...projected];
  const winSum = (list, startDays, endDays) => {
    const start = new Date(now); start.setDate(now.getDate() + startDays);
    const startStr = startDays === 0 ? today : dateToISO(start);
    const end = new Date(now); end.setDate(now.getDate() + endDays);
    const endStr = dateToISO(end);
    return list.filter((p) => p.payDate >= startStr && p.payDate <= endStr).reduce((s, p) => s + p.amtMYR, 0);
  };
  // The actual upcoming payment calendar (dates + amounts), not just summed
  // windows — lets a caller show "next payment: DATE, MYR X" instead of only
  // a lump total. Most useful for a single-ticker call (a portfolio-wide call
  // mixes many tickers' dates together, less meaningful as one list).
  const nextPayments = all.filter((p) => p.payDate >= today).sort((a, b) => (a.payDate < b.payDate ? -1 : 1)).slice(0, 12);
  return {
    ttm,
    nextMonth:      winSum(all, 0, 31),
    nextQuarter:    winSum(all, 0, 92),
    nextYear:       winSum(all, 0, 365),
    year2:          winSum(all, 366, 730),
    year3:          winSum(all, 731, 1095),
    expMonth:       winSum(knownUpcoming, 0, 31),
    expQuarter:     winSum(knownUpcoming, 0, 92),
    expYear:        winSum(knownUpcoming, 0, 365),
    hasProjections: all.length > 0,
    tickerInfo,
    nextPayments,
  };
}

/* =============================================================================
 * PAGE: DIVIDENDS
 * ========================================================================== */
let divCalendarFilter = "all";   // all | past | upcoming — filters the combined dividend calendar
let divIncomePeriod = "monthly"; // monthly | quarterly | annual — which Dividend Income view is shown
function pageDividends() {
  /* Calculation reference:
   * grossBase        = Σ (d.gross × fxRate) for all received dividends
   * taxBase          = Σ (d.tax  × fxRate) for all received dividends  (zero for MY stocks — normal)
   * netBase          = grossBase − taxBase  (= Σ divNetMYR(d))
   * byMonth[YYYY-MM] = Σ divNetMYR(d) where payDate falls in that month
   * byQuarter[YYYY Q]= Σ divNetMYR(d) where payDate falls in that quarter
   * byYear[YYYY]     = Σ divNetMYR(d) where payDate falls in that year
   * MoM Δ            = byMonth[this] − byMonth[prev]  (show — if no prev month)
   * QoQ Δ%           = (byQuarter[this] − byQuarter[prev]) / byQuarter[prev] × 100 (— if prev=0)
   * YoY Δ%           = (byYear[this] − byYear[prev]) / byYear[prev] × 100 (— if prev=0)
   * Dividend Yield (TTM) = ttmDividends() / portfolioMarketValue × 100%
   */
  const divs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend");
  const received = divs.filter((d) => d.status !== "Expected");
  const upcoming = allUpcomingDivs();
  const fc = dividendForecast(received, upcoming);

  // One continuous history-to-forecast timeline across the whole portfolio — same
  // treatment as the Holding Detail page's own Dividend Calendar (past "Received"
  // rows flowing straight into future "Confirmed"/"Estimated" ones) instead of two
  // separate tables the user has to mentally stitch together, filterable by
  // All/Past/Upcoming. Past events feed off `received` (your logged dividends);
  // future ones off `combinedUpcoming`, which already merges real declared dates
  // with pattern-based estimates (capped to a year out — see below).
  const oneYearOut = new Date(todayDate()); oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const oneYearOutStr = dateToISO(oneYearOut);
  const estimatedUpcoming = (fc.nextPayments || [])
    .filter((p) => !p.confirmed && p.payDate <= oneYearOutStr)
    .map((p) => {
      const h = T.holdings.find((x) => x.ticker === p.ticker);
      // No separate ex-date exists for a pattern-projected payment — the projected date
      // itself is the only date we have, so it's used for both rather than leaving
      // Ex-Date blank (which read as broken/missing data, not "not applicable").
      return { ticker: p.ticker, brokerId: h ? h.brokerId : null, exDate: p.payDate, payDate: p.payDate,
        amtMYR: p.amtMYR, source: "estimated" };
    });
  const combinedUpcoming = [
    ...upcoming.map((d) => ({ ...d, amtMYR: d.expectedNetMYR })),
    ...estimatedUpcoming,
  ].sort((a, b) => ((a.payDate || "") < (b.payDate || "") ? -1 : 1));

  // Per-share amount and per-payment yield use each ticker's CURRENT share count/price —
  // the real historical share count at the time of a past dividend isn't stored anywhere,
  // so this is the same approximation the Holding Detail page's own calendar already makes
  // for its projected rows, just applied uniformly here across past and future alike.
  const perShareFor = (ticker, amtMYR) => {
    const h = T.holdings.find((x) => x.ticker === ticker);
    return (h && h.shares) ? amtMYR / h.shares : null;
  };
  const yieldFor = (ticker, perShareAmt) => {
    const h = T.holdings.find((x) => x.ticker === ticker);
    return (h && h.hasPrice && h.currentPrice > 0 && perShareAmt != null) ? (perShareAmt / h.currentPrice) * 100 : null;
  };
  // Market data (Yahoo) only reports the EX-dividend date, never the actual payment date —
  // so for any auto-fetched/projected dividend the two are stored identical, making the
  // "Payment Date" column just repeat the Ex-Date (misleading — a real dividend pays out
  // ~2-4 weeks AFTER its ex-date). Same honest handling as the Holding Detail calendar:
  // when we have a genuinely distinct real payment date (manually entered), show it; when
  // we only have the ex-date, show a clearly-flagged estimate of ex-date + 14 days.
  const estPayDate = (ds) => { const dd = new Date(ds + "T00:00:00"); dd.setDate(dd.getDate() + 14); return dateToISO(dd); };
  const resolvePay = (exDate, payDate) => {
    const realDistinct = payDate && exDate && payDate !== exDate;   // user typed a real, different payment date
    if (realDistinct) return { display: payDate, estimated: false };
    if (exDate) return { display: estPayDate(exDate), estimated: true };
    return { display: payDate || null, estimated: false };
  };
  const today = todayISO();
  const historyEntries = received.map((d) => {
    const amtMYR = ((+d.gross || 0) - (+d.tax || 0)) * (d.fxRate || FX.rates[d.currency] || 1);
    const perShareAmt = perShareFor(d.ticker, amtMYR);
    const exDate = d.exDate || d.payDate || d.date, payDate = d.payDate || d.date;
    const pay = resolvePay(exDate, payDate);
    return { ticker: d.ticker, brokerId: d.brokerId, exDate, payDate, payDisplay: pay.display, payEstimated: pay.estimated,
      amtMYR, perShareAmt, yieldPct: yieldFor(d.ticker, perShareAmt), status: "Received" };
  });
  const upcomingEntries = combinedUpcoming.map((d) => {
    const perShareAmt = perShareFor(d.ticker, d.amtMYR);
    const exDate = d.exDate || d.payDate, payDate = d.payDate;
    const pay = resolvePay(exDate, payDate);
    return { ticker: d.ticker, brokerId: d.brokerId, exDate, payDate, payDisplay: pay.display, payEstimated: pay.estimated,
      amtMYR: d.amtMYR, perShareAmt, yieldPct: yieldFor(d.ticker, perShareAmt),
      status: d.source === "estimated" ? "Estimated" : "Confirmed", _id: d._id };
  });
  const allDivEntries = [...historyEntries, ...upcomingEntries]
    .filter((d) => d.payDate)
    .sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
  const nextIdx = allDivEntries.findIndex((d) => d.payDate >= today);
  const calendarFiltered = divCalendarFilter === "past" ? allDivEntries.filter((d) => d.payDate < today)
    : divCalendarFilter === "upcoming" ? allDivEntries.filter((d) => d.payDate >= today)
    : allDivEntries;
  const calendarFilterSel = styledSelect("divCalendarFilter", [
    { value: "all", label: t("All") },
    { value: "past", label: t("Past") },
    { value: "upcoming", label: t("Upcoming") },
  ], divCalendarFilter, { id: "divCalendarFilterSel" });
  const calendarTitleTip = `<span class="col-info tip-down" style="margin-left:10px" data-tip="${esc(t("Real dividend payments across your whole portfolio (fetched automatically from market data) flowing into the confirmed/estimated payments used for the forecast above."))}">${COL_INFO_ICON_SVG}</span>`;
  const exDateTip = ` <span class="col-info tip-down" data-tip="${esc(t("The ex-dividend date — buy before it to qualify for the payment. This is what market data sources report; they don't give a separate payment date."))}">${COL_INFO_ICON_SVG}</span>`;
  const payDateTip = ` <span class="col-info tip-down" data-tip="${esc(t("A rough estimate of Ex-Date + 14 days (when the money would actually land), since market data reports only the ex-date, not a real payment date. A manually entered payment date is shown exactly as you typed it."))}">${COL_INFO_ICON_SVG}</span>`;

  const calendarRows = calendarFiltered.map((d) => {
    const isNext = nextIdx >= 0 && d === allDivEntries[nextIdx];
    const statusCell = isNext ? `<span class="badge confirmed">${t("Next payment")}</span>` : statusBadge(d.status);
    return `<tr${isNext ? ` class="next-div-row"` : ""}>
      <td class="dcc-c"><span class="ticker">${esc(d.ticker)}</span><div class="sub">${d.brokerId ? esc(brokerName(d.brokerId)) : ""}</div></td>
      <td class="dcc-c">${fmtDate(d.exDate)}</td>
      <td class="dcc-c">${d.payDisplay ? fmtDate(d.payDisplay) : "—"}</td>
      <td class="dcc-c">${d.perShareAmt != null ? fmt(d.perShareAmt, { maximumFractionDigits: 2 }) : "—"}</td>
      <td class="dcc-c">${money(d.amtMYR)}</td>
      <td class="dcc-c">${d.yieldPct != null ? fmt(d.yieldPct, { maximumFractionDigits: 2 }) + "%" : "—"}</td>
      <td class="dcc-c">${statusCell}</td>
      <td class="dcc-c">${d._id ? `<button type="button" class="icon-btn" data-del-ud="${escAttr(d._id)}" title="${t("Remove")}" aria-label="${t("Remove")}" style="color:var(--muted);font-size:14px">✕</button>` : ""}</td></tr>`;
  }).join("");

  const grossBase = received.reduce((s, d) => s + (+d.gross || 0) * (d.fxRate || FX.rates[d.currency] || 1), 0);
  const taxBase = received.reduce((s, d) => s + (+d.tax || 0) * (d.fxRate || FX.rates[d.currency] || 1), 0);

  const periods = dividendByPeriod(received);
  const monthsAsc = Object.keys(periods.byMonth).sort();
  const monthRows = monthsAsc.slice(-12).reverse()
    .map((k) => `<tr><td class="dcc-c">${k}</td><td class="dcc-c pos">${money(periods.byMonth[k])}</td></tr>`).join("");
  const qAsc = Object.keys(periods.byQuarter).sort();
  const quarterRows = qAsc.slice(-8).reverse()
    .map((k) => `<tr><td class="dcc-c">${k}</td><td class="dcc-c pos">${money(periods.byQuarter[k])}</td></tr>`).join("");
  const yearsAsc = Object.keys(periods.byYear).sort();
  const yearRows = yearsAsc.slice().reverse()
    .map((k) => `<tr><td class="dcc-c">${k}</td><td class="dcc-c pos">${money(periods.byYear[k])}</td></tr>`).join("");
  // One table with a period filter instead of three separate Monthly/Quarterly/Annual
  // panels — MoM/QoQ/YoY delta columns dropped too (always "—" until there's more than
  // one period of history anyway, and the trend is already visible across the rows).
  const incomeLabels = { monthly: t("Month"), quarterly: t("Quarter"), annual: t("Year") };
  const incomeRowsByPeriod = { monthly: monthRows, quarterly: quarterRows, annual: yearRows };
  const incomeFilterSel = styledSelect("divIncomePeriod", [
    { value: "monthly", label: t("Monthly") },
    { value: "quarterly", label: t("Quarterly") },
    { value: "annual", label: t("Annual") },
  ], divIncomePeriod, { id: "divIncomePeriodSel" });

  const dash = `<span class="muted" style="font-size:22px;line-height:1">—</span>`;
  const tickerEntries = Object.entries(fc.tickerInfo || {});
  const tickerSummary = tickerEntries.length
    ? tickerEntries.map(([tk, info]) => {
        const growth = info.growthPct ? `, ${info.growthPct > 0 ? "+" : ""}${fmt(info.growthPct, { maximumFractionDigits: 1 })}%/${t("payment")}` : "";
        return `${esc(tk)} (${info.freq}${growth})`;
      }).join(", ")
    : "";
  const patternLine = tickerSummary ? `<p class="muted" style="margin:6px 0 0;font-size:12px">${t("Pattern detected for")}: ${tickerSummary}</p>` : "";
  const multiYearCards = (fc.year2 > 0 || fc.year3 > 0)
    ? `${miniCard(t("Year 2"), fc.year2 > 0 ? money(fc.year2) : dash)}${miniCard(t("Year 3"), fc.year3 > 0 ? money(fc.year3) : dash)}`
    : "";
  const forecastBody = fc.hasProjections
    ? `<p class="muted" style="margin:-4px 0 12px">${t("Based on payment patterns and upcoming dividends.")} ${t("Estimate only — not a guarantee.")}${fc.ttm > 0 ? ` ${t("Received TTM")}: <strong>${money(fc.ttm)}</strong>.` : ""}</p>
      <div class="mini-cards">
        ${miniCard(t("Next Month"), fc.nextMonth > 0 ? money(fc.nextMonth) : dash)}
        ${miniCard(t("Next Year"), fc.nextYear > 0 ? money(fc.nextYear) : dash)}${multiYearCards}</div>
      ${patternLine}
      <p class="muted" style="margin:8px 0 0;font-size:12px"><a class="link" href="#/help">${t("How is the forecast calculated?")}</a></p>`
    : `<div class="div-fc-empty"><div><strong>${t("Forecast needs more data")}</strong><p class="muted" style="margin:6px 0 0;font-size:13px">${t("Record at least 2 dividends for any holding to enable pattern-based estimates.")}</p>${fc.ttm > 0 ? `<p class="muted" style="margin:4px 0 0;font-size:13px">${t("TTM received")}: <strong>${money(fc.ttm)}</strong></p>` : ""}<div class="form-actions" style="margin-top:10px"><a class="btn primary small" href="#/add/dividend">${t("Record a dividend")} →</a></div></div></div>
      <p class="muted" style="margin:10px 0 0;font-size:12px"><a class="link" href="#/help">${t("How is the forecast calculated?")}</a></p>`;

  const html = `
    <div class="mini-cards">
      ${miniCard(t("Gross Dividends"), money(grossBase))}
      ${miniCard("Withholding Tax", money(taxBase), taxBase > 0 ? "neg" : "")}
      ${miniCard("Net Dividends (Lifetime)", money(grossBase - taxBase), "pos")}</div>

    ${panel("Dividend Forecast", forecastBody)}

    <div id="divUpcomingSection">
      ${panel(`${t("Dividend Calendar")}${calendarTitleTip}`,
        allDivEntries.length
          ? table([
              { label: "Ticker", style: "width:14%;text-align:left" },
              { label: `${t("Ex-Date")}${exDateTip}`, style: "width:14%;text-align:left" },
              { label: `${t("Est. Payment")}${payDateTip}`, style: "width:14%;text-align:left" },
              { label: `${t("Per Share")} (${ccyLabel(FX.base)})`, style: "width:14%;text-align:left" },
              { label: "Amount (RM)", style: "width:14%;text-align:left" },
              { label: "Yield", style: "width:14%;text-align:left" },
              { label: "Status", style: "width:14%;text-align:left" },
              { label: "" },
            ], calendarRows)
          // Genuinely empty now only when there's no logged history AND no declared date
          // AND no detectable pattern anywhere in the portfolio.
          : `<p class="muted" style="margin:0 0 12px;font-size:13px">${
              !LIVE_ENABLED
                ? t("No dividends yet. Record one, or they'll appear automatically once market data is connected.")
                : t("No dividends yet. Record one to get started.")
            }</p><a class="btn primary small" href="#/add/dividend">${t("Record a dividend")} →</a>`,
        `<div class="panel-head-actions"><div style="width:150px">${calendarFilterSel}</div><small class="muted" id="divFetchStatus"></small></div>`
      )}
    </div>

    ${panel(t("Dividend Income"), received.length
        ? table([
            { label: incomeLabels[divIncomePeriod] || t("Month"), style: "width:50%;text-align:left" },
            { label: "Net (RM)", style: "width:50%;text-align:left" },
          ], incomeRowsByPeriod[divIncomePeriod] || monthRows, { fixed: true })
        : `<p class="muted" style="margin:0 0 12px;font-size:13px">${t("No dividend income yet. Record one to start tracking it over time.")}</p><a class="btn primary small" href="#/add/dividend">${t("Record a dividend")} →</a>`,
      `<div class="panel-head-actions"><div style="width:150px">${incomeFilterSel}</div></div>`)}`;

  return {
    title: "Dividends", subtitle: "Calendar, history and withholding-tax summary.", html,
    mount() {
      document.querySelectorAll("[data-del-ud]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.delUd;
          const idx = UPCOMING_DIVIDENDS.findIndex((d) => d.id === id);
          if (idx >= 0) { UPCOMING_DIVIDENDS.splice(idx, 1); saveStore(); render(); }
        });
      });
      const calendarFilterEl = $("#divCalendarFilterSel");
      if (calendarFilterEl) calendarFilterEl.addEventListener("change", () => { divCalendarFilter = calendarFilterEl.value; render(); });
      const incomePeriodEl = $("#divIncomePeriodSel");
      if (incomePeriodEl) incomePeriodEl.addEventListener("change", () => { divIncomePeriod = incomePeriodEl.value; render(); });
      if (LIVE_ENABLED) {
        const statusEl = document.getElementById("divFetchStatus");
        if (statusEl) statusEl.textContent = t("Checking dividend schedules…");
        fetchAllDivSchedules().then(({ fetched, hadError }) => {
          if (fetched && document.getElementById("divUpcomingSection")) render();
          const s = document.getElementById("divFetchStatus");
          if (s) s.textContent = hadError ? t("Couldn't check some dividend schedules — try again later.") : "";
        });
      }
    },
  };
}

/* =============================================================================
 * PAGE: BROKERS
 * ========================================================================== */
let editingBrokerId = null;          // P1.5
let showArchivedBrokers = false;     // P1.6

let _brokerMenuCloseHandler = null;

function brokerCard(b) {
  const holdings = T.holdings.filter((h) => h.brokerId === b.id);
  const value = holdings.reduce((s, h) => s + h.marketValue, 0);
  const costBasis = holdings.reduce((s, h) => s + h.costBasis, 0);
  const calc = T.brokerCash[b.id] || 0;
  const chk = RECON_CHECKS[b.id];
  const hasActual = chk && chk.actual != null;
  const diff = hasActual ? calc - (+chk.actual) : null;
  let reconStatus = t("Not checked"), reconCls = "subtle";
  if (hasActual) {
    if (Math.abs(diff) < 0.005) { reconStatus = t("Matched"); reconCls = "pos"; }
    else if (Math.abs(diff) <= (SETTINGS.reconTolerance || 0)) { reconStatus = t("Small difference"); reconCls = "warn"; }
    else { reconStatus = t("Needs review"); reconCls = "neg"; }
  }

  // Negative currency balances: a small tappable pill next to Available Cash (reusing the
  // app's .col-info tooltip mechanism) instead of a full-width banner per currency —
  // the detail is still one tap/hover away, it just doesn't dominate the card at rest.
  const negBalances = (T.negativeCash || []).filter((n) => n.brokerId === b.id);
  const negTip = negBalances.map((n) =>
    `${ccyLabel(n.currency)} ${t("balance is negative")} (${ccyLabel(n.currency)} ${fmt(Math.abs(n.amount))}) — ${t("a buy, fee, or withdrawal has no matching")} ${ccyLabel(n.currency)} ${t("deposit. Record one to balance this.")}`
  ).join(" ");
  const negLabel = LANG === "zh" ? `⚠ ${negBalances.length}个问题` : `⚠ ${negBalances.length} ${negBalances.length === 1 ? "issue" : "issues"}`;
  const negPill = negBalances.length ? ` <span class="col-info warn-pill" data-tip="${esc(negTip)}">${negLabel}</span>` : "";

  // How this broker has performed, not just where it stands right now:
  // money in/out, current value, gain/loss, income — the full story per broker.
  const deposits = T.depositsByBroker[b.id] || 0;
  const withdrawals = T.withdrawalsByBroker[b.id] || 0;
  const unrealized = T.unrealizedByBroker[b.id] || 0;
  const totalReturn = T.totalReturnByBroker[b.id] || 0;
  const totalReturnPct = costBasis ? (totalReturn / costBasis) * 100 : 0;
  const dividends = T.dividendsByBroker[b.id] || 0;
  const holdingsLabel = LANG === "zh" ? `${holdings.length} 个持仓` : plural(holdings.length, "holding", "holdings");

  return `<article class="broker-card ${b.archived ? "archived" : ""}">
      <div class="bc-head"><span class="brand-mark sm">${esc(b.name.slice(0,2).toUpperCase())}</span>
        <div><div class="bc-name">${esc(b.name)} ${b.archived ? `<span class="badge subtle">${t("Archived")}</span>` : ""}</div>
          <div class="sub">${esc(b.country) || "—"} · ${esc(ccyLabel(b.currency))} · ${holdingsLabel}</div></div>
        <div class="bc-menu">
          <button type="button" class="icon-btn" data-broker-menu aria-haspopup="true" aria-expanded="false" title="${t("More actions")}" aria-label="${t("More actions")}">⋯</button>
          <div class="bc-menu-pop" hidden>
            <button type="button" data-edit-broker="${b.id}">${t("Edit")}</button>
            <button type="button" data-archive-broker="${b.id}">${b.archived ? t("Unarchive") : t("Archive")}</button>
            <button type="button" class="danger" data-del-broker="${b.id}">${t("Remove")}</button>
          </div>
        </div></div>

      <div class="bc-hero">
        <div><span class="bc-hero-label">${t("Market Value")}</span><span class="bc-hero-value">${money(value)}</span></div>
        <div class="bc-hero-return ${cls(totalReturn)}">
          <span class="bc-hero-return-amt">${moneySigned(totalReturn)}</span>
          <span class="bc-hero-return-pct">${costBasis ? `${pctTxt(totalReturnPct)} ` : ""}${t("Total Return")}</span>
        </div>
      </div>

      <dl class="bc-list bc-list-2col">
        <div><dt>${t("Available Cash")}${negPill}</dt><dd>${money(calc)}</dd></div>
        <div><dt>${t("Net Dividends")}</dt><dd class="${dividends > 0 ? "pos" : ""}">${money(dividends)}</dd></div>
      </dl>

      <details class="bc-more">
        <summary>${t("More details")}</summary>
        <dl class="bc-list">
          <div><dt>${t("Unrealized P/L")}</dt><dd class="${cls(unrealized)}">${moneySigned(unrealized)}</dd></div>
          <div><dt>${t("Total Deposits")}</dt><dd>${money(deposits)}</dd></div>
          <div><dt>${t("Total Withdrawals")}</dt><dd>${money(withdrawals)}</dd></div>
          ${SETTINGS.showReconciliation ? `<div><dt>${t("Reconciliation")}</dt><dd><span class="badge ${reconCls}">${reconStatus}</span></dd></div>` : ""}
          <div><dt>${t("Dividends paid to")}</dt><dd>${b.divPaidTo === "bank" ? t("Bank") : t("Broker")}</dd></div>
          <div><dt>${t("Default dividend tax rate")}</dt><dd>${fmt(b.divTaxRate || 0, { maximumFractionDigits: 2 })}%</dd></div>
        </dl>
      </details>
      ${b.notes ? `<p class="bc-notes muted">${esc(b.notes)}</p>` : ""}</article>`;
}

function pageBrokers() {
  const active = BROKERS.filter((b) => !b.archived);
  const archived = BROKERS.filter((b) => b.archived);
  const cards = active.map(brokerCard).join("");
  const archivedCards = (showArchivedBrokers ? archived : []).map(brokerCard).join("");

  // Page-level total across active brokers — each card shows its own numbers, but nothing
  // previously summed Market Value + Cash + Return across all of them in one place here
  // (same mini-cards pattern as the Portfolio page's own summary strip).
  const activeIds = new Set(active.map((b) => b.id));
  const activeHoldings = T.holdings.filter((h) => activeIds.has(h.brokerId));
  const totalValue = activeHoldings.reduce((s, h) => s + h.marketValue, 0);
  const totalCostBasis = activeHoldings.reduce((s, h) => s + h.costBasis, 0);
  const totalCash = active.reduce((s, b) => s + (T.brokerCash[b.id] || 0), 0);
  const totalReturn = active.reduce((s, b) => s + (T.totalReturnByBroker[b.id] || 0), 0);
  const totalReturnPct = totalCostBasis ? (totalReturn / totalCostBasis) * 100 : 0;
  const summary = active.length ? `<div class="mini-cards" style="margin-bottom:16px">
      <div class="mini-card"><div class="mc-label">${t("Market Value")}</div><div class="mc-value">${money(totalValue)}</div></div>
      <div class="mini-card"><div class="mc-label">${t("Available Cash")}</div><div class="mc-value">${money(totalCash)}</div></div>
      <div class="mini-card"><div class="mc-label">${t("Total Return")}</div><div class="mc-value ${cls(totalReturn)}">${moneySigned(totalReturn)}</div><div class="mc-sub ${cls(totalReturnPct)}">${pctTxt(totalReturnPct)}</div></div>
    </div>` : "";

  const archToggle = archived.length
    ? `<button class="btn ghost" id="toggleArchived">${showArchivedBrokers ? t("Hide archived") : `${t("Show archived")} (${archived.length})`}</button>` : "";
  const addBtn = `<button type="button" class="btn primary" id="openBrokerDrawer">＋ ${t("Add Broker")}</button>`;

  const html = `${summary}<div class="panel-head" style="margin-bottom:14px"><h2>${t("Your Brokers")}</h2><div class="panel-head-actions">${archToggle}${addBtn}</div></div>
    ${cards ? `<div class="broker-grid">${cards}</div>` : emptyState(`${t("No brokers yet — every transaction and holding needs one.")}<div class="form-actions" style="margin-top:14px;justify-content:center"><button type="button" class="btn primary" id="emptyAddBroker">＋ ${t("Add Broker")}</button></div>`)}
    ${showArchivedBrokers && archivedCards ? `<div class="broker-grid" style="margin-top:14px">${archivedCards}</div>` : ""}
    ${BROKERS.length ? brokerCashPanelsHTML() : ""}`;

  return { title: "Brokers", subtitle: LANG === "zh"
      ? `已连接 ${active.length} 个投资平台。`
      : `${active.length} investment apps connected.`, html,
    mount() {
      const openBtn = $("#openBrokerDrawer");
      if (openBtn) openBtn.addEventListener("click", () => openBrokerDrawer());
      const emptyAddBtn = $("#emptyAddBroker");
      if (emptyAddBtn) emptyAddBtn.addEventListener("click", () => openBrokerDrawer());
      const tog = $("#toggleArchived");
      if (tog) tog.addEventListener("click", () => { showArchivedBrokers = !showArchivedBrokers; render(); });

      // Per-card "⋯" menu (Edit/Archive/Remove) — same open/toggle + outside-click-close
      // pattern as the Portfolio page's Edit Columns panel, just generalized to N cards.
      $$("[data-broker-menu]").forEach((btn) => btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pop = btn.nextElementSibling;
        $$(".bc-menu-pop").forEach((p) => { if (p !== pop) p.hidden = true; });
        pop.hidden = !pop.hidden;
      }));
      if (_brokerMenuCloseHandler) document.removeEventListener("click", _brokerMenuCloseHandler);
      _brokerMenuCloseHandler = () => { $$(".bc-menu-pop").forEach((p) => (p.hidden = true)); };
      document.addEventListener("click", _brokerMenuCloseHandler);

      $$("[data-edit-broker]").forEach((btn) => btn.addEventListener("click", () => openBrokerDrawer(btn.dataset.editBroker)));
      $$("[data-archive-broker]").forEach((btn) => btn.addEventListener("click", () => {
        const b = BROKERS.find((x) => x.id === btn.dataset.archiveBroker);
        if (b) { b.archived = !b.archived; saveStore(); toast(b.archived ? t("Broker archived") : t("Broker unarchived")); render(); }
      }));
      $$("[data-del-broker]").forEach((btn) => btn.addEventListener("click", () => {
        const id = btn.dataset.delBroker;
        const used = HOLDINGS.some((h) => h.brokerId === id) || ALL_TRANSACTIONS.some((x) => x.brokerId === id);
        if (used && !confirm(t("This broker still has records. Remove it anyway? (Consider Archive instead.)"))) return;
        const i = BROKERS.findIndex((b) => b.id === id);
        if (i >= 0) BROKERS.splice(i, 1);
        if (editingBrokerId === id) editingBrokerId = null;
        saveStore(); toast(t("Broker removed")); render();
      }));
      mountBrokerCashPanels();
    } };
}

/* Add/edit broker drawer — same overlay pattern as the transaction drawer (openAddDrawer). */
function brokerFormHTML(editing) {
  const e = editing || {};
  return `<form id="brokerForm" class="form" autocomplete="off">
    <div class="form-grid">
      <label>${t("Broker name")}<input name="name" value="${esc(e.name)}" placeholder="e.g. Rakuten Trade" required></label>
      <label>${t("Country")}<input name="country" value="${esc(e.country)}" placeholder="e.g. Malaysia"></label>
      <label>${t("Default currency")}${styledSelect("currency", currencyItems(), e.currency || FX.base, { more: "currency" })}</label>
      <label>${t("Dividends paid to")}${styledSelect("divPaidTo", [
        { value: "broker", label: t("Broker account (adds to cash)") },
        { value: "bank", label: t("Bank account (income only)") },
      ], e.divPaidTo || "broker")}</label>
      <label>${t("Default dividend tax rate")} (%)<input type="number" step="any" min="0" max="100" name="divTaxRate" value="${e.divTaxRate != null ? esc(e.divTaxRate) : ""}" placeholder="0"></label>
    </div>
    <p class="muted" style="margin:-8px 0 12px;font-size:12px">${t("Applied to dividends auto-logged from market history at this broker — e.g. 30 for US stocks held without a tax treaty, 0 for Malaysian stocks. You can always edit the tax on an individual dividend afterward.")}</p>
    <label class="block">${t("Notes")}<input name="notes" value="${esc(e.notes)}" placeholder="${t("optional")}"></label>
    <div class="form-actions">
      <button class="btn primary" type="submit">${editing ? t("Update Broker") : t("Add Broker")}</button>
      <button type="button" class="btn secondary" id="brokerCancel">${t("Cancel")}</button>
    </div>
  </form>`;
}

function openBrokerDrawer(id) {
  editingBrokerId = id || null;
  renderBrokerDrawerBody();
  const dr = $("#brokerDrawer");
  if (dr) { dr.classList.remove("closing"); dr.hidden = false; }
}

function renderBrokerDrawerBody() {
  const editing = editingBrokerId ? BROKERS.find((b) => b.id === editingBrokerId) : null;
  if (editingBrokerId && !editing) editingBrokerId = null;
  const titleEl = $("#brokerDrawerTitle");
  if (titleEl) titleEl.textContent = editing ? t("Edit Broker") : t("Add Broker");
  const body = $("#brokerDrawerBody");
  if (!body) return;
  body.innerHTML = brokerFormHTML(editing);
  body.querySelector("#brokerForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target).entries());
    if (!d.name.trim()) { toast(t("Enter a broker name.")); return; }
    const divTaxRate = Math.max(0, Math.min(100, parseFloat(d.divTaxRate) || 0));
    if (editingBrokerId) {
      const b = BROKERS.find((x) => x.id === editingBrokerId);
      if (b) { b.name = d.name.trim(); b.country = (d.country || "").trim(); b.currency = d.currency; b.notes = (d.notes || "").trim(); b.divPaidTo = d.divPaidTo || "broker"; b.divTaxRate = divTaxRate; }
      editingBrokerId = null;
      saveStore(); toast(t("Broker updated")); closeBrokerDrawer(); render();
    } else {
      BROKERS.push({ id: uid("b"), name: d.name.trim(), country: (d.country || "").trim(), currency: d.currency, notes: (d.notes || "").trim(), divPaidTo: d.divPaidTo || "broker", divTaxRate, archived: false });
      saveStore(); toast(t("Broker added")); render();
      renderBrokerDrawerBody(); // stay open on a blank form for rapid entry, same as Add Transaction
    }
  });
  body.querySelector("#brokerCancel").addEventListener("click", () => closeBrokerDrawer());
  translateDOM(body);
}

function closeBrokerDrawer() {
  closeDrawer($("#brokerDrawer"));
  editingBrokerId = null;
}

/* =============================================================================
 * PAGE: SETTINGS  (incl. theme switcher)
 * ========================================================================== */
function pageSettings() {
  const html = `
    <div class="mini-cards" style="margin-bottom:16px">
      <div class="mini-card"><div class="mc-label">${t("Brokers")}</div><div class="mc-value">${BROKERS.length}</div></div>
      <div class="mini-card"><div class="mc-label">${t("Holdings")}</div><div class="mc-value">${T.holdings.length}</div></div>
      <div class="mini-card"><div class="mc-label">${t("Transactions")}</div><div class="mc-value">${ALL_TRANSACTIONS.length}</div></div>
    </div>

    ${panel(t("Profile"), `<form id="profileForm" class="form" autocomplete="off">
      <div class="form-grid">
        <label>${t("Name")}<input name="name" value="${esc(USER.name)}" placeholder="${t("Your name")}"></label>
        <label>${t("Email")}<input name="email" type="email" value="${esc(USER.email)}" placeholder="you@example.com"></label>
        <label>${t("Investing since")}<input name="joined" type="date" value="${esc(USER.joined)}"></label>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${t("Save profile")}</button></div>
    </form>`)}

    ${panel(t("Appearance"), `
      <p class="muted" style="margin:-4px 0 14px">${t("Choose your theme. Dark mode uses a true-black background; light mode is the default design.")}</p>
      <div class="theme-options" id="themeOptions">
        <button class="theme-card" data-theme-choice="light">
          <span class="tc-swatch light"><span></span><span></span><span></span></span>
          <span class="tc-label">${t("Light")} <span class="tc-check">✓</span></span>
          <span class="sub">${t("Default design")}</span></button>
        <button class="theme-card" data-theme-choice="dark">
          <span class="tc-swatch dark"><span></span><span></span><span></span></span>
          <span class="tc-label">${t("Dark")} <span class="tc-check">✓</span></span>
          <span class="sub">${t("True black")}</span></button>
      </div>`)}

    ${panel(t("Language"), `<div class="setting-rows">
      ${settingRow(t("Language"), `<div style="width:200px">${styledSelect("lang", [{ value: "en", label: "English" }, { value: "zh", label: "中文" }], LANG, { id: "langSel" })}</div>`)}</div>`)}

    ${panel(t("Base Currency"), `<div class="setting-rows">
      ${settingRow(t("Base currency"), `<div style="width:200px">${styledSelect("baseCcy", Object.keys(FX.rates).map((c) => ({ value: c, label: ccyLabel(c) })), FX.base, { id: "baseCcy" })}</div>`)}
      <p class="muted" style="margin:6px 0 0">${t("All transactions keep their original currency; base-currency values are derived using stored exchange rates and never overwrite the original.")}</p></div>`)}

    ${panel(t("Exchange Rates"), `
      <p class="muted" style="margin:-4px 0 12px">${t("Rates convert each currency to your base.")} ${t("Pull today's market rate or type your own.")}</p>
      <div id="fxRows">${fxRows()}</div>
      <div class="fx-add">
        <input list="ccyList" id="newCcy" class="fx-input" placeholder="${t("Currency code")} (e.g. JPY)" maxlength="3" autocomplete="off" />
        <datalist id="ccyList">${[...new Set(COMMON_CCY)].map((c) => `<option value="${c}"></option>`).join("")}</datalist>
        <input type="number" step="any" id="newRate" class="fx-input" placeholder="${t("Rate to")} ${ccyLabel(FX.base)}" />
        <button class="btn" id="addCcyBtn">${t("Add currency")}</button>
      </div>
      <div class="fx-foot">
        <button class="btn" id="refreshFx">↻ ${t("Refresh live rates")}</button>
        <span class="muted fx-status" id="fxStatus">${FX_STATUS}</span>
      </div>`)}

    ${panel(t("Preferences"), `<div class="setting-rows">
      ${settingRow(t("Date format"), `<div style="width:200px">${styledSelect("dateFmt", DATE_FORMATS.map((f) => ({ value: f.k, label: f.label })), SETTINGS.dateFormat, { id: "dateFmt" })}</div>`)}
      ${settingRow(t("Time zone"), `<div style="width:200px">${styledSelect("tzSel", [{ value: "", label: t("Device local") }, ...TIME_ZONES.map((z) => ({ value: z, label: z }))], SETTINGS.timeZone || "", { id: "tzSel" })}</div>`)}
      ${settingRow(t("Default return view"), `<div style="width:200px">${styledSelect("returnMode", [
        { value: "total", label: t("Total Return") },
        { value: "price", label: t("Unrealized") },
      ], SETTINGS.returnMode === "price" ? "price" : "total", { id: "returnModeSel" })}</div>`)}
      <p class="muted" style="margin:6px 0 0">${t("Time zone sets which day counts as \"today\" for day counts and dividend forecasts; stored dates are never altered.")}</p></div>`)}

    ${panel(t("Cost Basis Method"), `<div class="setting-rows">
      ${settingRow(t("Method"), `<div style="width:200px">${styledSelect("costBasis", [{ value: "average", label: t("Average Cost") }], "average", { id: "costBasis" })}</div>`)}
      <p class="muted" style="margin:6px 0 0">${t("Average Cost is the active method for all gain/loss figures. More methods, including FIFO, are planned for a future update.")}</p></div>`)}

    ${panel(t("Reconciliation"), `<div class="setting-rows">
      ${settingRow(t("Show on Brokers page"), `<label class="switch"><input type="checkbox" id="showRecon" ${SETTINGS.showReconciliation ? "checked" : ""}><span class="switch-track"></span></label>`)}
      ${settingRow(t("Tolerance"), `<div class="input-prefix"><span class="input-prefix-tag">${esc(FX.base)}</span><input type="number" step="any" id="reconTol" value="${SETTINGS.reconTolerance}"></div>`)}
      <p class="muted" style="margin:6px 0 0">${t("Differences within this amount are treated as a small difference rather than needing review.")}</p></div>`)}

    ${typeof accountSyncPanelHTML === "function" ? accountSyncPanelHTML() : ""}

    ${panel(t("Data Safety & Backup"), `
      <p class="muted info-card" style="display:flex;gap:10px;margin:-2px 0 14px"><span class="w-ico">🔒</span><span>${
        (typeof syncAvailable === "function" && syncAvailable() && typeof SYNC_USER !== "undefined" && SYNC_USER)
          ? t("Your data also syncs to your account while you're signed in, so clearing browser data won't lose it — but a JSON backup is still recommended.")
          : t("Your investment data is stored only in this browser on this device. Clearing browser data may remove it. Export a JSON backup regularly.")
      }</span></p>
      <div class="form-actions">
        <button class="btn primary" id="expJson">⭳ ${t("Export full backup (JSON)")}</button>
        <button class="btn" id="impJsonBtn">⭱ ${t("Import backup (JSON)")}</button>
        <input type="file" id="impJsonFile" accept="application/json,.json" hidden>
        <button class="btn" id="setExpTx">⭳ ${t("Export Transactions CSV")}</button>
        <button class="btn" id="setExpCash">⭳ ${t("Export Cash CSV")}</button>
        <button class="btn" id="setExpDiv">⭳ ${t("Export Dividends CSV")}</button>
        <button class="btn ghost" id="loadDemo">${t("Load demo data")}</button>
        <button class="btn ghost" id="clearPvHistory">${t("Clear chart history")}</button>
      </div>`)}

    ${panel(t("Import from CSV"), `
      <p class="muted" style="margin:-2px 0 12px">${t("Bulk-add transactions (deposits, withdrawals, buys, sells, dividends) from a spreadsheet. Download the template, fill it in, then upload to preview before anything is saved.")}</p>
      <div class="form-actions">
        <button class="btn" id="dlTemplate">⭳ ${t("Download CSV template")}</button>
        <button class="btn primary" id="impCsvBtn">⭱ ${t("Upload CSV")}</button>
        <input type="file" id="impCsvFile" accept=".csv,text/csv" hidden>
      </div>
      <div id="csvPreview">${importPreviewHTML()}</div>`)}

    <details class="panel addhold" id="importHoldings"${decodeURIComponent((location.hash.split("/")[2] || "")) === "holdings" ? " open" : ""}>
      <summary><span class="addhold-head"><span class="addhold-title">${t("Import existing holdings")}</span><span class="addhold-sub">${t("Positions you held before tracking — click to open")}</span></span></summary>
      <div class="addhold-body">${openingHoldingFormHTML()}</div></details>

    ${panel(t("Danger Zone"), `
      <p class="muted" style="margin:-2px 0 12px">${t("Clearing removes all brokers, holdings and transactions saved in this browser. This cannot be undone — export a backup first.")}</p>
      <div class="fx-add">
        <input type="text" id="clearConfirm" class="fx-input" placeholder="${t("Type DELETE to confirm")}" autocomplete="off" style="width:220px">
        <button class="btn danger" id="clearData">${t("Clear all data")}</button>
      </div>`)}`;

  return { title: "Settings", subtitle: "Profile, currency, appearance and data.", html,
    mount() {
      reflectThemeChoice();
      $$("#themeOptions .theme-card").forEach((btn) => {
        btn.addEventListener("click", () => { setTheme(btn.dataset.themeChoice); reflectThemeChoice(); toast(btn.dataset.themeChoice === "dark" ? t("Dark theme applied") : t("Light theme applied")); });
      });
      mountOpeningHoldingForm();   // "Import existing holdings" form
      // Deep-linked from the Portfolio empty state → reveal + scroll to the import section.
      if (decodeURIComponent((location.hash.split("/")[2] || "")) === "holdings") {
        const ih = $("#importHoldings");
        if (ih) setTimeout(() => ih.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      }
      // Editable profile
      mountDatePickers($("#profileForm"));
      $("#profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target).entries());
        USER.name = d.name; USER.email = d.email; USER.joined = d.joined;
        saveStore(); toast(t("Profile saved"));
      });
      // Language — same setLang + applyStaticI18n + updateLangBtn + render sequence as the
      // topbar's quick-toggle button, just as an explicit dropdown here (same duplication
      // pattern as Appearance/theme, which also has both a topbar toggle and a Settings panel).
      $("#langSel").addEventListener("change", (e) => {
        setLang(e.target.value); applyStaticI18n(); updateLangBtn(); render();
      });
      // Change base currency — re-base every stored rate so values stay correct
      $("#baseCcy").addEventListener("change", (e) => {
        const nb = e.target.value;
        const div = FX.rates[nb];
        if (!div) { toast(t("Add a rate for that currency first.")); setSelectValue(document, "baseCcy", FX.base); return; }
        Object.keys(FX.rates).forEach((c) => { FX.rates[c] = +(FX.rates[c] / div).toFixed(6); });
        FX.base = nb; saveStore(); toast(`${t("Base currency set to")} ${nb}`); render();
      });
      // Reconciliation: visibility toggle + tolerance
      $("#showRecon").addEventListener("change", (e) => {
        SETTINGS.showReconciliation = e.target.checked;
        saveStore(); toast(t("Preferences saved"));
      });
      $("#reconTol").addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        SETTINGS.reconTolerance = isNaN(v) ? 0 : Math.abs(v);
        saveStore(); toast(t("Tolerance saved"));
      });
      // Preferences (date format / time zone / return view / cost basis)
      $("#dateFmt").addEventListener("change", (e) => { SETTINGS.dateFormat = e.target.value; saveStore(); toast(t("Preferences saved")); render(); });
      $("#tzSel").addEventListener("change", (e) => { SETTINGS.timeZone = e.target.value; saveStore(); toast(t("Preferences saved")); });
      $("#returnModeSel").addEventListener("change", (e) => { SETTINGS.returnMode = e.target.value; saveStore(); toast(t("Preferences saved")); });
      $("#costBasis").addEventListener("change", () => { SETTINGS.costBasis = "average"; saveStore(); });
      // CSV import
      $("#dlTemplate").addEventListener("click", downloadImportTemplate);
      $("#impCsvBtn").addEventListener("click", () => $("#impCsvFile").click());
      $("#impCsvFile").addEventListener("change", (e) => { if (e.target.files[0]) handleCsvFile(e.target.files[0]); e.target.value = ""; });
      mountImportPreview();
      // CSV + JSON backup
      $("#setExpCash").addEventListener("click", exportCashCSV);
      $("#setExpTx").addEventListener("click", exportTxCSV);
      $("#setExpDiv").addEventListener("click", exportDivCSV);
      $("#expJson").addEventListener("click", exportBackupJSON);
      $("#impJsonBtn").addEventListener("click", () => $("#impJsonFile").click());
      $("#impJsonFile").addEventListener("change", (e) => importBackupJSON(e.target.files[0]));
      $("#loadDemo").addEventListener("click", () => {
        if (ALL_TRANSACTIONS.length || BROKERS.length) {
          if (!confirm(t("This will replace your current data with demo data. Continue?"))) return;
        }
        loadDemoData(); saveStore(); toast(t("Demo data loaded")); render();
      });
      const cpvhBtn = $("#clearPvHistory");
      if (cpvhBtn) cpvhBtn.addEventListener("click", () => {
        if (!confirm(t("Clear the Portfolio Value Over Time chart? All chart data points will be permanently deleted."))) return;
        PV_HISTORY.splice(0);
        saveStore(); toast(t("Chart history cleared.")); render();
      });
      // Clear all — requires typing DELETE
      $("#clearData").addEventListener("click", () => {
        const typed = ($("#clearConfirm").value || "").trim().toUpperCase();
        if (typed !== "DELETE") { toast(t("Type DELETE to confirm.")); return; }
        clearAllData(); toast(t("All data cleared")); render();
      });
      mountFxControls();
      if (typeof mountAccountSyncPanel === "function") mountAccountSyncPanel();
    } };
}

/* --- Data safety helpers --- */
function clearAllData() {
  [BROKERS, HOLDINGS, ALL_TRANSACTIONS, UPCOMING_DIVIDENDS, PV_HISTORY].forEach((a) => (a.length = 0));
  assignObj(CURRENT_PRICES, {}); assignObj(RECON_CHECKS, {});
  resetStore(); recompute();
  saveStore();   // also push the now-empty state to the cloud for signed-in users
}
function exportBackupJSON() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `investment-ledger-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast(t("Backup downloaded"));
}
function validBackup(s) {
  return s && typeof s === "object" && Array.isArray(s.BROKERS) && Array.isArray(s.ALL_TRANSACTIONS)
    && s.FX && typeof s.FX === "object";
}
function importBackupJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let s;
    try { s = JSON.parse(reader.result); } catch (e) { toast(t("That file isn't valid JSON.")); return; }
    if (!validBackup(s)) { toast(t("That doesn't look like an Investment Ledger backup.")); return; }
    const versionNote = (typeof s.version === "number" && s.version > SCHEMA_VERSION)
      ? " " + t("This backup was made by a newer version of the app — some newer fields may not be restored.")
      : "";
    if (!confirm(t("This replaces your current data with this backup file. Export your current data first if you want to keep it. Continue?") + versionNote)) return;
    applySnapshot(s); saveStore(); toast(t("Backup restored")); render();
  };
  reader.readAsText(file);
}
/* Demo data (only loaded on demand from Settings). Shows the core flows:
 * deposit → buy → manual price, dividend with withholding tax, multi-currency FX. */
function loadDemoData() {
  const today = todayISO();
  applySnapshot({
    BROKERS: [
      { id: "rkt", name: "Rakuten Trade", country: "Malaysia", currency: "MYR" },
      { id: "ibkr", name: "Interactive Brokers", country: "United States", currency: "USD" },
    ],
    HOLDINGS: [],
    ALL_TRANSACTIONS: [
      { id: uid("t"), date: "2025-01-06", brokerId: "rkt", type: "Deposit", ticker: "—", currency: "MYR", gross: 20000, fee: 0, fxRate: 1, myrEquivalent: 20000 },
      { id: uid("t"), date: "2025-02-03", brokerId: "ibkr", type: "Deposit", ticker: "—", currency: "USD", gross: 4000, fee: 0, fxRate: 4.70, myrEquivalent: 18800 },
      { id: uid("t"), date: "2025-01-10", brokerId: "rkt", type: "Buy", ticker: "1155.KL", company: "Malayan Banking", market: "Bursa Malaysia", currency: "MYR", qty: 1000, price: 9.20, gross: 9200, fee: 9, fxRate: 1, myrEquivalent: 9200 },
      { id: uid("t"), date: "2025-02-05", brokerId: "ibkr", type: "Buy", ticker: "AAPL", company: "Apple Inc.", market: "NASDAQ", currency: "USD", qty: 15, price: 180, gross: 2700, fee: 1, fxRate: 4.70, myrEquivalent: 12690 },
      { id: uid("t"), date: "2025-05-15", brokerId: "ibkr", type: "Dividend", ticker: "AAPL", currency: "USD", gross: 12, tax: 1.8, fxRate: 4.70, myrEquivalent: 56.4, status: "Received", payDate: "2025-05-15" },
      { id: uid("t"), date: "2025-06-12", brokerId: "rkt", type: "Dividend", ticker: "1155.KL", currency: "MYR", gross: 600, tax: 0, fxRate: 1, myrEquivalent: 600, status: "Received", payDate: "2025-06-12" },
    ],
    UPCOMING_DIVIDENDS: [],
    CURRENT_PRICES: {
      "1155.KL": { price: 10.10, currency: "MYR", date: today },
      "AAPL": { price: 215.40, currency: "USD", date: today },
    },
    RECON_CHECKS: {},
    PV_HISTORY: [],
    SETTINGS: { returnMode: "total", reconTolerance: 1 },
    USER: { name: "Demo User", email: "", baseCurrency: "MYR", joined: "2025-01-06" },
    FX: { base: "MYR", rates: { MYR: 1, USD: 4.70, SGD: 3.48 }, updated: today },
  });
}


/* Build the editable exchange-rate rows. */
function fxRows() {
  return Object.entries(FX.rates).map(([c, r]) => `
    <div class="fx-row">
      <span class="fx-code">${c}</span>
      ${c === FX.base
        ? `<span class="fx-base-tag">1.00 · ${t("base")}</span>`
        : `<input class="fx-input fx-rate" type="number" step="any" data-ccy="${c}" value="${r}" />
           <button class="icon-btn fx-del" data-del="${c}" title="${t("Remove")}" aria-label="${t("Remove")}">✕</button>`}
    </div>`).join("");
}

/* Wire the exchange-rate controls: edit, delete, add (with live auto-fill), refresh. */
function mountFxControls() {
  // Edit an existing rate
  $$(".fx-rate").forEach((inp) => inp.addEventListener("change", (e) => {
    const v = parseFloat(e.target.value);
    if (v > 0) { FX.rates[e.target.dataset.ccy] = v; saveStore(); }
    else { toast(t("Enter a rate greater than 0.")); e.target.value = FX.rates[e.target.dataset.ccy] || ""; }
  }));
  // Delete a currency
  $$(".fx-del").forEach((btn) => btn.addEventListener("click", () => {
    const c = btn.dataset.del;
    delete FX.rates[c]; saveStore(); render();
  }));
  // Auto-fill today's rate when a currency code is chosen
  $("#newCcy").addEventListener("change", async () => {
    const code = $("#newCcy").value.trim().toUpperCase();
    if (code.length !== 3 || code === FX.base || FX.rates[code]) return;
    $("#newRate").placeholder = t("Fetching…");
    const d = await fetchRatesAgainstBase(FX.base);
    if (d && d.rates[code]) $("#newRate").value = perBaseToRate(d.rates[code]);
    $("#newRate").placeholder = `${t("Rate to")} ${ccyLabel(FX.base)}`;
  });
  // Add the currency
  $("#addCcyBtn").addEventListener("click", () => {
    const code = $("#newCcy").value.trim().toUpperCase();
    const rate = parseFloat($("#newRate").value);
    if (code.length !== 3) { toast(t("Enter a 3-letter currency code.")); return; }
    if (!(rate > 0)) { toast(t("Enter a valid rate.")); return; }
    if (code === FX.base || FX.rates[code]) { toast(`${code} ${t("already has a rate — edit it in the list above instead.")}`); return; }
    FX.rates[code] = rate; saveStore(); render();
    toast(`${code} ${t("added")}`);
  });
  // Refresh all rates from the market
  $("#refreshFx").addEventListener("click", async () => {
    const btn = $("#refreshFx");
    btn.disabled = true; FX_STATUS = t("Fetching live rates…"); $("#fxStatus").textContent = FX_STATUS;
    const d = await fetchRatesAgainstBase(FX.base);
    if (!d) { FX_STATUS = t("Couldn't reach the rate service — check your connection."); $("#fxStatus").textContent = FX_STATUS; btn.disabled = false; return; }
    let updated = 0;
    Object.keys(FX.rates).forEach((c) => {
      if (c === FX.base) return;
      const rate = perBaseToRate(d.rates[c]);
      if (rate) { FX.rates[c] = rate; updated++; }
    });
    FX.updated = new Date().toISOString();
    saveStore();
    FX_STATUS = `${t("Live rates as of")} ${d.date} · ${d.source} · ${updated} ${t("updated")}`;
    render();
  });
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
  const sectionsEN = [
    { title: "Getting Started", items: [
      { q: "What order should I set things up in?", a: "Add a broker first — every transaction and every holding belongs to one, so nothing else can be recorded until it exists. Next, get your positions into the ledger: record real Buy transactions for anything you buy from now on, or use \"Import existing holdings\" (Settings → Import existing holdings) for positions you already owned before you started tracking. Log deposits and withdrawals as they happen so each broker's calculated cash balance stays meaningful. Once a holding exists, set its current price (the Set Price control on Portfolio) — until then, market value falls back to cost and unrealized P/L reads as zero even if you're actually up or down. The Dashboard's setup checklist counts these off in that order (broker → deposit → buy/holding → price → dividend) but doesn't enforce it — you can complete them out of sequence." },
      { q: "What's the practical difference between recording a Buy and using \"Import existing holdings\"?", a: "A Buy (Add → Buy) is a real dated transaction: it deducts cash from the broker's calculated balance, sets or updates the position's average cost, and later feeds realized P/L when you sell part of it. \"Import existing holdings\" (Settings → Import existing holdings, requires a broker to already exist) instead writes a holding directly — ticker, shares, average cost, an as-of date, and an optional starting current price — with no transaction behind it, so it never touches cash, deposits, or realized P/L. It exists only to seed a starting position for something you owned before you started tracking here. Anything you buy from this point on should go in as a real Buy, otherwise the broker's cash reconciliation will flag a difference for money that, as far as the ledger's concerned, never left." },
      { q: "Do I need to complete all 5 onboarding checklist steps before the app is useful?", a: "No. The Dashboard's welcome panel just counts, out of 5, whether you have: a broker, a Deposit transaction, a Buy transaction or an opening holding, a current price set on any holding, and a Dividend transaction — it's a progress indicator, not a gate, and every page works with a partial setup. The one step worth prioritizing is the current price: without it, market value uses cost as a placeholder, so unrealized P/L and Total Return will understate or misstate your position even though the numbers are technically calculating." },
      { q: "I only have positions I already owned — do I need to re-enter every historical Buy?", a: "Not necessarily. Backfilling the real historical Buys preserves exact per-lot cost and commission/tax history, but for most people \"Import existing holdings\" (Settings → Import existing holdings) is the intended shortcut: enter the ticker, shares, and a single average cost as of a chosen date, and the app treats that as your starting position going forward. Because it creates no transaction, it has no effect on cash balances, XIRR's dated cash-flow list, or realized P/L — only Buy and Sell transactions touch those. Net dividends on an imported holding start at zero and only accumulate from Dividend transactions you record after the as-of date; anything paid before that isn't retroactively counted." },
    ] },
    { title: "Core Calculations", items: [
      { q: "How is Total Return calculated?", a: "Total Return = Unrealized P/L + Realized P/L + Net Dividends − standalone Fees. Trade commissions and taxes are already inside cost basis (buys) and realized P/L (sells), so they are not deducted twice." },
      { q: "What's the difference between realized and unrealized P/L?", a: "Unrealized P/L = current market value − remaining cost basis of shares you still hold. Realized P/L = sale proceeds − average cost of sold shares − commission − taxes. Average-cost method is used." },
      { q: "What is XIRR?", a: "XIRR (Extended Internal Rate of Return) is your money-weighted annual return. Unlike a simple return, it accounts for WHEN money entered and left your portfolio, so large contributions near the end don't unfairly flatter (or hurt) the percentage. It answers: 'what constant annual rate, compounded, turns my dated cash flows into my current account value?'" },
      { q: "How is XIRR calculated?", a: "Methodology: the account boundary is your whole portfolio (holdings + cash). External flows are dated: each Deposit is negative (cash in), each Withdrawal is positive (cash out). Today's terminal value = current holdings market value + cash balance, as a final positive flow. Buys, Sells and Dividends are INTERNAL to the account (they move value between cash and securities, or generate cash that stays in the account), so they are already captured in the terminal value — adding them as separate flows would double-count. XIRR is then the rate r solving Σ flow_i / (1+r)^(years_i) = 0, found by Newton-Raphson with a bisection fallback. Requires at least one deposit and ≥7 days of history." },
      { q: "Why is XIRR different from simple return?", a: "Simple return = (gain) ÷ (money invested), ignoring timing. XIRR is time-weighted by date and annualised. Example: depositing RM10,000 a year ago vs last week gives the same simple return but very different XIRR, because the recent money had almost no time to compound. XIRR is the fairer measure of the rate your money actually earned." },
      { q: "How is the dividend forecast calculated?", a: "Methodology: not a flat TTM ÷ 12 run-rate. For each holding, past payment dates are used to detect a real frequency (monthly/quarterly/semi-annual/annual), and future pay dates are projected at that cadence up to 3 years out. History comes from your own logged dividends where you have at least 2; otherwise it falls back to the stock's real public dividend history (fetched automatically for any market), scaled to your current share count and today's FX rate. With at least 6 historical payments, a per-payment growth rate is also estimated (comparing your 3 most recent payments to the 3 before that, capped at ±25% per payment) and compounded forward, so a stock with a track record of raising its dividend projects growing future payments instead of a flat repeat. Any dividend already confirmed — one you marked 'Expected', or a near-term one already declared — is summed separately as a 'confirmed pipeline' so it's never mixed up with the pattern-based estimate." },
      { q: "How accurate is the dividend forecast?", a: "It is a directional estimate, not a prediction. Accuracy is best for a holding with a long, regular payment history (own-logged or from public market data). It is least accurate for a brand-new holding with fewer than 2 payments on record anywhere, or a stock with irregular/special dividends that don't fit a monthly/quarterly/semi-annual/annual cadence." },
      { q: "What are the forecast's limitations?", a: "It does NOT model: future buys or sells, special/one-off dividends, changes in withholding tax, or FX movement on future payments (today's FX rate is used throughout). Growth detection needs at least 6 historical payments per holding — with fewer, the projection is flat (no growth applied). Treat it as a planning aid only — never as guaranteed income." },
      { q: "How is dividend tax handled?", a: "Net Dividend = Gross Dividend − Withholding Tax. Withholding tax is tracked per dividend and summarised by country (using the stock's real country from the lookup) in the Dividends page." },
    ] },
    { title: "Transaction Types & Reconciliation", items: [
      { q: "What do the transaction types mean?", a: "Deposit/Withdrawal move cash in/out. Buy/Sell trade shares (and capture commission + taxes). Dividend records income (Received or Expected). Currency Exchange converts between currencies. Fee, Tax withholding, Interest, and Transfer-between-brokers cover the rest. DRIP / Reinvested is a shortcut, not a separate ledger type — see the next question." },
      { q: "How does DRIP (dividend reinvestment) work?", a: "Add → DRIP / Reinvested records two ordinary, independently-editable transactions in one step: a Dividend (its cash is marked \"Reinvested\" so it never hits the broker's cash balance) and a Buy funded by that net dividend, at the reinvest price/share you enter — share count is derived automatically as (gross dividend − withholding tax) ÷ reinvest price. Because both legs are just a normal Dividend and a normal Buy, everything downstream — average cost, dividend income, dividend yield, yield on cost, forecasts — already accounts for them correctly with no special-casing. The two records aren't hard-linked after saving: each shows up and can be edited or deleted independently, like any other transaction." },
      { q: "Why does a broker show a cash difference?", a: "Your calculated cash balance (deposits − buys − fees + sells + net dividends − withdrawals) differs from the actual balance you entered. Usually a missing fee, dividend or transfer entry. A negative balance means spending exceeded recorded cash." },
    ] },
    { title: "Multi-Currency & Exchange Rates", items: [
      { q: "How does the app handle multiple currencies?", a: "Every transaction stores its original currency and amount permanently — a USD dividend stays USD, exactly as entered, forever. Base-currency figures (the ones shown in totals, charts, and cash reconciliation) are a derived display only: original amount × the FX rate saved on that specific transaction. That derived value is also cached on the transaction for exports and reporting, but it's a convenience snapshot, not the source of truth — the original currency and amount are what everything else recalculates from." },
      { q: "Where do exchange rates come from?", a: "Either you type them in yourself, in Settings → Exchange Rates or directly into the FX-rate field while logging a transaction, or you click \"Refresh live rates,\" which queries a live rate service (open.er-api.com, falling back to frankfurter.app/ECB data if that's unreachable) and overwrites every non-base currency's stored rate with the current market rate. A refresh only updates the rates list used for new entries and current valuations — it never rewrites a rate already saved on a past transaction." },
      { q: "If I update a rate or refresh live rates, do my old transactions change?", a: "No. Each transaction keeps the FX rate that was in effect (or that you typed) at the moment you saved it, and that stored rate — not the live one — is what its base-currency value is computed from from then on. Changing a rate in Settings, or refreshing live rates, only affects things going forward: new transactions and current holding/cash valuations pick it up, past transactions don't. The one way an old transaction's rate does change is if you open it, clear the FX field, and re-save it — then it falls back to whatever rate is currently stored for that currency." },
      { q: "How do I change my base currency, and does it affect data I've already entered?", a: "Settings → Base Currency → pick a currency you already have a stored rate for (you're prompted to add one first if you don't). The app then rebases every stored rate against the new base — each rate is divided by the new base's old rate — so if you switch from MYR to USD, a JPY rate that was \"JPY→MYR\" becomes \"JPY→USD\", preserving its real-world value. This is a conversion, not a reset: no rate is deleted, and no transaction is touched — original currencies/amounts and each transaction's already-stored rate stay exactly as recorded. Only future transactions, live totals, and what \"Refresh live rates\" targets change." },
      { q: "Why doesn't a transaction's base-currency amount match today's exchange rate?", a: "Because it isn't using today's rate. It's calculated once, at save time, from the original amount × the rate stored on that transaction, and it stays fixed even as the live rate moves afterward. If you multiply an old transaction's original amount by the rate currently shown in Settings, you'll usually get a different number — that's expected, not a bug; it reflects real currency movement between when the transaction happened and today." },
    ] },
    { title: "Data Import, Export & Backup", items: [
      { q: "What's the difference between a JSON backup and a CSV export?", a: "A JSON backup is a complete snapshot of app state — every broker, holding, transaction (including pending 'Expected' dividends), manual/cached prices, reconciliation checks, settings, user profile, FX rates and portfolio-value history — in one versioned file. It exists for restore or migration: importing checks the file has the expected shape, warns you if it was made by a newer app version, then on confirm wholesale REPLACES your current data with the file's contents — there's no merge. CSV export is the opposite: three separate, spreadsheet-readable files (cash, transactions, dividends), each a flat table of one slice of your data, with no settings, prices or FX table included. Use the JSON backup to move to a new device or recover from a wipe; use CSV to inspect, share, or re-import transaction data." },
      { q: "How does CSV import actually work?", a: "Start from the import template (Settings → Download CSV template) — a CSV pre-filled with one example row per transaction type, so the column layout is unambiguous. Fill in your rows and upload the file; nothing touches your ledger yet. Columns are matched by header name, not position (case-insensitive, so \"Amount\" works as well as \"Gross\"), and every row is validated, producing a preview table with a per-row status: Ready, Duplicate — skipped, Create broker first, or a specific error message. Only when you review the preview and click \"Import valid rows\" do the ready rows get pushed into the ledger and saved — rows with errors or an unresolved broker are excluded entirely, so you fix them in the spreadsheet and re-upload rather than getting partial garbage committed." },
      { q: "Why do some rows show \"Duplicate — skipped\" when I import?", a: "Each row is reduced to a signature — broker + date + type + ticker (or \"—\") + amount + currency — checked against every existing transaction and the other rows in the same file. If that signature already exists, the row is marked duplicate and silently excluded from the import, even if it's otherwise valid. This is what makes re-uploading the same file safe — nothing gets double-entered. It's not a perfect fingerprint though: quantity and price aren't part of the signature, so two genuinely different Buy orders for the same ticker, broker, date, currency and gross amount would also be flagged as duplicates of each other." },
      { q: "What columns do I need beyond Date, Broker and Type?", a: "Date, Broker and Type are required for every row — import fails outright if any column is missing. Buy/Sell need Quantity and Price (Gross is recalculated as Quantity × Price, so any Gross value in the file is ignored for these two types). Currency Exchange needs Gross (the amount sent, in Currency) plus To Currency and To Amount — To Currency must differ from Currency and To Amount must be a positive number, or the row errors. Transfer between brokers needs Gross plus To Broker, naming a different broker that already exists in your ledger; an unrecognized To Broker fails with \"Unknown To Broker\" and, unlike an unrecognized main Broker, does not get a \"Create broker first\" quick-fix — you have to add that broker yourself first. Dividend and everything else (Deposit, Withdrawal, Fee, Tax withholding, Interest) just need a positive Gross; Dividend rows can additionally carry Status, Ex-Date and Pay Date." },
      { q: "Is it safe to re-upload the same CSV import file twice?", a: "Yes. Every row's signature (broker + date + type + ticker + amount + currency) is checked against your existing transactions before anything is committed, so a second upload of an already-imported file shows every row as \"Duplicate — skipped\" and the ledger stays unchanged. This also means partial re-imports are safe: if you fix errors and re-upload the whole file, the rows that already made it in the first time are skipped and only the newly-valid ones get added." },
      { q: "If I export my own transactions to CSV, can I re-import that file?", a: "Yes — the Transactions CSV header is a superset of the import template's columns, and columns are matched by name rather than position, so any extra column is simply ignored. Round-tripping export → re-import is a supported path. Because every row's signature matches what's already in the ledger, a straight re-import shows everything as duplicates and skips it — the round trip is really for verifying your export or seeding a fresh copy of the app, not for adding transactions back." },
      { q: "What's in each of the three CSV exports, and how are they different?", a: "Transactions CSV is the full ledger — one row per transaction, every field, and the one that matches the import template column-for-column. Cash CSV is filtered to cash-moving types only — Deposit, Withdrawal, Interest, Fee, Tax withholding, Transfer between brokers, Currency Exchange, and Dividends that aren't still 'Expected' — with columns built around cash flow rather than security detail like quantity or price. Dividends CSV lists Dividend transactions only, showing Gross, Tax, and a computed Net (Gross − Tax) in both the original currency and your base currency. None of the three includes brokers, holdings, cached prices, settings or the FX table — for that, use the JSON backup." },
    ] },
    { title: "Cloud Sync", items: [
      { q: "What is Cloud Sync?", a: "Cloud Sync copies your whole local ledger — every broker, transaction and setting — up to a Supabase-hosted account and back down again, so the same data appears when you open the app in a different browser or on a different device. It solves one problem: using the app on more than one device with the same data. It is not real-time collaboration — there's no live shared editing session, just a push of the entire local snapshot after each edit and a pull of the whole thing on sign-in." },
      { q: "Do I have to set up Cloud Sync?", a: "No. It's entirely opt-in and off by default — until you sign in with an email, the app behaves exactly as it always has, saving only to localStorage on that device, with zero code path touched. If the deployment itself has no Cloud Sync configured, the Account & Cloud Sync panel in Settings just shows \"not configured\" and nothing else about the app changes." },
      { q: "How does signing in work?", a: "Enter your email in Settings → Account & Cloud Sync and you'll be emailed a one-time magic link — there's no password to set, remember, or reset. Clicking the link signs you in and returns you to the app already authenticated. The same email always maps to the same cloud account, so using it on a second device or browser links that device to the same data rather than creating a separate account." },
      { q: "I signed in on a second device that already has its own data — what happens?", a: "If that device already has local transactions and your account already has cloud data from elsewhere, the app can't guess which one you want, so it opens a \"Choose which data to keep\" prompt showing both sides' transaction counts and last-changed times. \"Keep this device\" uploads the local copy and overwrites the cloud copy; \"Use my account's data\" downloads the cloud copy and overwrites what's local — whichever you don't pick is fully replaced, not merged. If only one side actually has data (a genuinely fresh device, or your first-ever sign-in), it resolves automatically in that direction with no prompt." },
      { q: "What does \"last write wins\" actually mean?", a: "Each edit debounces a push of the full local snapshot to your account a few seconds later, and sign-in pulls that row down if it's newer than your last local edit. There is no field-level merge: if you edit on device A and device B before either has synced, whichever push reaches the server last simply overwrites the other device's row in its entirety, silently discarding the earlier device's changes — even edits to unrelated transactions. In practice, treat Cloud Sync as one edit session at a time, not a way to work on two devices concurrently." },
      { q: "Does signing out delete my data?", a: "No. Signing out only ends the session; everything already saved to localStorage on that device stays exactly as it was. The app separately remembers which account's data currently occupies that device's storage, independent of whether you're signed in, so that if a different account signs in later it won't upload or merge in the leftover data — it clears it first instead, treating the device as fresh for that new account." },
    ] },
    { title: "Settings & Preferences", items: [
      { q: "What does \"Default return view\" control?", a: "The Dashboard's main P/L stat card can show either Total Return or pure Unrealized P/L — this setting picks which one it opens with (there's also an in-card toggle right on the Dashboard that flips the view for your session without changing this default). Total Return = Unrealized P/L + Realized P/L + Net Dividends − standalone Fees, so it keeps moving even for positions you've fully sold or haven't touched today. Unrealized P/L here is strictly the paper gain/loss on current holdings (market value − cost basis) — it deliberately excludes realized gains, dividends and fees. These are genuinely different numbers: a fully-sold position can show zero Unrealized P/L while still carrying a large nonzero Total Return from the realized gain." },
      { q: "What is \"Cost Basis Method\" and can I change it?", a: "It determines how cost basis — and therefore every realized and unrealized gain figure — is calculated when you sell part of a holding bought at different prices over time. Average Cost is the only method implemented right now: the dropdown has a single selectable option, and every gain/loss number in the app already uses it. FIFO is planned but not built, so there's no lot-selection choice to make yet — this panel currently just confirms which method is active rather than letting you switch." },
      { q: "What does \"Time zone\" actually change?", a: "Only which calendar day counts as \"today\" — used for day-count math (e.g. days held since purchase) and for deciding whether an upcoming dividend has been paid yet or is still a forecast. It never rewrites or shifts a stored transaction date; those stay exactly as entered no matter what this is set to. \"Device local\" (the default) uses your browser's local date; picking an explicit zone matters mainly if the market/broker you're tracking runs on a different calendar day than the device you're viewing the app on." },
      { q: "What does the Reconciliation \"Tolerance\" setting do?", a: "On the Brokers page, your calculated cash balance (deposits − buys − fees + sells + net dividends − withdrawals) is compared against the actual balance you entered. If the gap is within the Tolerance amount, expressed in your base currency, it's displayed as a small/minor difference rather than being flagged for review; above it, it's treated as a discrepancy worth investigating. It's purely a display threshold — it doesn't change the underlying calculation or hide the difference, just how urgently it's presented. Set it to 0 if you want any nonzero gap surfaced." },
    ] },
    { title: "Glossary", items: [
      { q: "What does TTM mean?", a: "TTM stands for Trailing Twelve Months — a rolling 12-month window ending today, not a calendar year. Dividend Yield (TTM) is trailing 12-month net dividends ÷ current portfolio market value, and the same rolling window backs every other TTM figure you see, like \"Received TTM\" on the forecast panel." },
      { q: "What is Yield on Cost?", a: "Based on what you originally paid (your average cost), not today's market value — it shows the effective income dividend growth has earned you over time on your original investment. Because the denominator stays fixed at cost while dividends can grow, Yield on Cost rises for a holding that keeps raising its payout even when the market-value-based Dividend Yield doesn't." },
      { q: "What is the Diversification Score?", a: "An effective-N score based on portfolio weights — higher means more diversified. It's derived from the Herfindahl-Hirschman Index (HHI) of each holding's share of total market value: score = (1 − HHI) × 100, clamped to 0–100. The \"effective holdings\" number shown alongside it is 1 ÷ HHI — the count of equal-sized positions that would produce the same concentration — so it reads lower than your actual number of holdings whenever your position sizes are uneven." },
      { q: "What is Cash Allocation?", a: "Cash as a percentage of total net value (market value + available cash), using cash aggregated across all brokers. A high number means more of your net worth is sitting uninvested; a number near 0% means you're close to fully invested." },
      { q: "What is Cost Basis?", a: "The total amount you paid, in base currency, for the shares you currently hold — not their market value. Trade commissions and taxes on buys are capitalised into cost basis rather than tracked as separate fees, and a sell reduces it by the average cost of the shares sold (not by the sale proceeds), so a profitable sale doesn't distort the cost basis of what remains." },
      { q: "What is Average Cost?", a: "Cost Basis ÷ Shares held — your weighted-average price paid per share. It's the only costing method the app currently applies to gain/loss figures (FIFO and others are planned but not yet available), so every sell draws from the blended average, never a specific lot." },
      { q: "What's the difference between Net Capital Invested, Principal Invested, and Net Cash Added?", a: "They're the same number — Deposits − Withdrawals — shown under different labels depending on context: \"Principal Invested\" on the Dashboard, \"Net Cash Added\" on the Cash tab, and \"Net Capital Invested\" in the app's own formula reference. It measures money moved in and out, not investment performance, so it doesn't move when prices change." },
      { q: "What are Net Dividends?", a: "Net Dividends = Gross Dividends − Withholding Tax. Withholding tax is tracked per dividend transaction and summarised by country (using the stock's real country from the lookup) on the Dividends page." },
    ] },
  ];
  const sectionsZH = [
    { title: "入门指南", items: [
      { q: "应该按什么顺序设置？", a: "先添加券商——每笔交易和每笔持仓都必须归属于某个券商，因此在此之前无法记录任何其他内容。接下来把您的持仓录入账本：为今后买入的任何股票记录真实的买入交易，或者对于您在开始使用本应用前就已持有的仓位，使用「导入现有持仓」（设置 → 导入现有持仓）。存款和取款请随时记录，这样每个券商的计算现金余额才有意义。持仓建立后，请设置其当前价格（投资组合页的设价功能）——在此之前，市值会以成本作为占位值，即使实际有盈亏，未实现盈亏也会显示为零。仪表盘的设置清单按此顺序（券商 → 存款 → 买入/持仓 → 价格 → 股息）计数，但并不强制要求——您可以不按顺序完成。" },
      { q: "记录买入交易和使用「导入现有持仓」有什么实际区别？", a: "买入（添加 → 买入）是一笔真实的带日期交易：它会从券商的计算现金余额中扣除现金，设定或更新该仓位的平均成本，并在您日后卖出部分持仓时计入已实现盈亏。「导入现有持仓」（设置 → 导入现有持仓，需已存在券商）则直接写入一笔持仓——股票代码、股数、平均成本、截止日期，以及可选的起始当前价格——背后没有交易记录，因此不会影响现金、存款或已实现盈亏。它的作用仅是为您在开始使用本应用前已持有的仓位设定起始状态。此后任何买入都应作为真实买入交易录入，否则券商的现金对账会为这笔账本上从未离开过的资金标记差异。" },
      { q: "使用本应用前，是否需要完成全部 5 项入门清单才有用？", a: "不需要。仪表盘欢迎面板只是统计以下 5 项中完成了几项：一个券商、一笔存款交易、一笔买入交易或期初持仓、任一持仓设置了当前价格、一笔股息交易——这只是进度提示，并非门槛，即使设置不完整，各页面也都能正常使用。最值得优先完成的是设置当前价格：在此之前，市值会以成本作为占位值，因此即使数字看似在正常计算，未实现盈亏和总回报也会被低估或误判。" },
      { q: "我只有已持有的仓位——需要重新录入每一笔历史买入吗？", a: "不一定。补录真实的历史买入交易能保留精确的逐笔成本与佣金/税费记录，但对大多数人来说，「导入现有持仓」（设置 → 导入现有持仓）才是本应用设计的捷径：只需输入股票代码、股数，以及截至某日期的单一平均成本，应用便会将其视为您此后的起始仓位。由于它不产生交易记录，因此对现金余额、XIRR 的带日期现金流列表或已实现盈亏都没有影响——只有买入和卖出交易才会影响这些。导入持仓的净股息从零开始，只会从截止日期之后记录的股息交易开始累积；截止日期之前派发的股息不会被追溯计入。" },
    ] },
    { title: "核心计算方式", items: [
      { q: "总回报是如何计算的？", a: "总回报 = 未实现盈亏 + 已实现盈亏 + 净股息 − 独立费用。买入的佣金和税费已计入成本，卖出的已计入已实现盈亏，因此不会重复扣除。" },
      { q: "已实现与未实现盈亏有什么区别？", a: "未实现盈亏 = 当前市值 − 仍持有股票的剩余成本。已实现盈亏 = 卖出所得 − 已卖出股票的平均成本 − 佣金 − 税费。采用平均成本法。" },
      { q: "什么是 XIRR？", a: "XIRR（扩展内部收益率）是按资金加权的年化回报率。与简单回报不同，它考虑了资金进出投资组合的时间，因此临近期末的大额投入不会不公平地美化（或拖累）百分比。它回答：'哪一个固定的年化复利率，能把我带日期的现金流变成当前的账户价值？'" },
      { q: "XIRR 是如何计算的？", a: "方法：账户边界为整个投资组合（持仓 + 现金）。外部现金流按日期计入：每笔存款为负（现金流入），每笔取款为正（现金流出）。今天的终值 = 当前持仓市值 + 现金余额，作为最后一笔正现金流。买入、卖出和股息属于账户内部（在现金与证券间转移价值，或产生留在账户内的现金），已包含在终值中——若再作为单独现金流会重复计算。XIRR 即求解 Σ 现金流 / (1+r)^(年数) = 0 的利率 r，采用牛顿法并以二分法兜底。至少需一笔存款且 ≥7 天历史。" },
      { q: "为什么 XIRR 与简单回报不同？", a: "简单回报 = 收益 ÷ 投入金额，忽略时间。XIRR 按日期加权并年化。例如：一年前投入 RM10,000 与上周投入，简单回报相同，但 XIRR 差别很大，因为近期资金几乎没有时间复利。XIRR 更公平地衡量您资金实际赚取的回报率。" },
      { q: "股息预测是如何计算的？", a: "方法：并非简单的 TTM ÷ 12 运行率。系统会为每个持仓从过去的派息日期侦测真实的派息频率（每月/每季/每半年/每年），并按该周期向未来预测最多 3 年的派息日期。历史数据优先使用您自己记录的股息（至少 2 笔）；不足时改用该股票的真实公开股息历史（自动获取，涵盖各市场），并按您当前持股数与当前汇率换算。若历史派息达 6 笔以上，还会估算每次派息的增长率（比较最近 3 笔与之前 3 笔的均值，增长率上限为每次派息 ±25%）并向前复利，因此有加息记录的股票会预测出增长的未来派息，而非简单重复。任何已确认的股息——您标记为「预期」的，或近期已宣布的——会单独汇总为「已确认管道」，绝不与规律预测混淆。" },
      { q: "股息预测有多准确？", a: "这是方向性估算，并非预测。对于拥有长期、规律派息记录（无论是您自己记录的还是来自公开市场数据）的持仓最准确；对于任何来源派息记录都不足 2 笔的全新持仓，或不符合每月/每季/每半年/每年周期的不规则/特别股息股票最不准确。" },
      { q: "股息预测有哪些局限？", a: "它不建模：未来的买卖、特别/一次性股息、预扣税变动，或未来派息的汇率波动（全程使用当前汇率）。增长侦测需要每个持仓至少 6 笔历史派息记录——不足时预测为持平（不套用增长）。请仅作为规划参考，切勿视为有保证的收入。" },
      { q: "股息税是如何处理的？", a: "净股息 = 总股息 − 预扣税。预扣税按每笔股息记录，并在股息页面按国家/地区（使用查询得到的真实国家）汇总。" },
    ] },
    { title: "交易类型与对账", items: [
      { q: "各交易类型是什么意思？", a: "存款/取款用于现金进出。买入/卖出用于交易股票（并记录佣金和税费）。股息记录收入（已收到或预期）。货币兑换在货币间转换。费用、预扣税、利息和券商间转账涵盖其余情况。股息再投资（DRIP）是一种快捷方式，而非独立的账本类型——详见下一个问题。" },
      { q: "股息再投资（DRIP）是如何运作的？", a: "添加 → 股息再投资（DRIP）会一次性记录两笔普通且可独立编辑的交易：一笔股息记录（其现金标记为「已再投资」，因此不会计入券商现金余额）和一笔由该笔净股息资助的买入交易，按您输入的再投资单价计算——股数会自动计算为（股息总额 − 预扣税）÷ 再投资单价。由于这两笔记录本质上就是普通的股息和买入交易，后续所有计算——平均成本、股息收入、股息收益率、成本收益率、预测——无需任何特殊处理即可正确计入。保存后这两笔记录并非强制关联：每笔都会像其他任何交易一样单独显示，并可独立编辑或删除。" },
      { q: "为什么券商会显示现金差异？", a: "您的计算现金余额（存款 − 买入 − 费用 + 卖出 + 净股息 − 取款）与您输入的实际余额不一致，通常是漏记了费用、股息或转账。余额为负表示支出超过了已记录的现金。" },
    ] },
    { title: "多币种与汇率", items: [
      { q: "应用如何处理多种货币？", a: "每笔交易都会永久保存其原始货币和金额——一笔美元股息将始终以美元记录，完全按输入保存。基础货币金额（在总计、图表和现金对账中显示的数值）只是一种衍生显示：原始金额 × 该笔交易所保存的汇率。这个衍生值也会缓存在交易记录中用于导出和报表，但它只是便利性快照，并非数据的真实来源——原始货币和金额才是其他一切重新计算的依据。" },
      { q: "汇率从何而来？", a: "您可以自行在设置 → 汇率中输入，或在记录交易时直接在汇率字段中输入；也可以点击「刷新实时汇率」，从实时汇率服务（open.er-api.com，若无法访问则回退至 frankfurter.app / 欧洲央行数据）查询并用当前市场汇率覆盖每种非基础货币的已存汇率。刷新只会更新用于新记录和当前估值的汇率列表——绝不会改写已保存在某笔历史交易上的汇率。" },
      { q: "更新汇率或刷新实时汇率后，我的旧交易会改变吗？", a: "不会。每笔交易都保留其保存那一刻生效（或您手动输入）的汇率，此后其基础货币金额始终以该保存的汇率——而非实时汇率——计算。在设置中修改汇率，或刷新实时汇率，只会影响此后的情况：新交易和当前持仓/现金估值会采用新汇率，历史交易不受影响。唯一会改变某笔旧交易汇率的方式，是打开该交易、清空汇率字段并重新保存——此时它会回退为该货币当前保存的汇率。" },
      { q: "如何更改基础货币？这会影响我已录入的数据吗？", a: "设置 → 基础货币 → 选择一个您已有保存汇率的货币（若没有，会提示您先添加）。应用随后会以新基础货币重新计算每个已存汇率——每个汇率都会除以新基础货币的旧汇率——因此若您从 MYR 切换到 USD，原本「JPY→MYR」的汇率会变为「JPY→USD」，保持其真实价值不变。这是一次换算，而非重置：不会删除任何汇率，也不会触碰任何交易——原始货币/金额，以及每笔交易已保存的汇率均保持记录不变。只有未来的交易、实时总计，以及「刷新实时汇率」的作用对象会改变。" },
      { q: "为什么某笔交易的基础货币金额与今天的汇率对不上？", a: "因为它使用的本来就不是今天的汇率。该金额只在保存那一刻计算一次，即原始金额 × 该交易保存的汇率，此后即使实时汇率变动，它也保持固定。如果您用某笔旧交易的原始金额乘以设置中当前显示的汇率，通常会得到不同的数字——这是正常现象，并非错误；它反映的是交易发生时至今真实的汇率变动。" },
    ] },
    { title: "数据导入、导出与备份", items: [
      { q: "JSON 备份和 CSV 导出有什么区别？", a: "JSON 备份是应用状态的完整快照——每个券商、持仓、交易（包括待定的「预期」股息）、手动/缓存价格、对账记录、设置、用户资料、汇率及投资组合价值历史——全部保存在一个带版本号的文件中。它的用途是恢复或迁移：导入时会检查文件是否具有预期的结构，若文件由更新版本的应用生成会提示您，确认后会将当前数据整体替换为文件内容——不进行合并。CSV 导出则相反：三个独立、可用电子表格阅读的文件（现金、交易、股息），每个都是数据某一切面的平铺表格，不包含设置、价格或汇率表。需要迁移到新设备或从数据丢失中恢复时使用 JSON 备份；需要查看、分享或重新导入交易数据时使用 CSV。" },
      { q: "CSV 导入具体是如何运作的？", a: "从导入模板开始（设置 → 下载 CSV 模板）——一份为每种交易类型预填一行示例的 CSV，使列结构一目了然。填好您的数据行后上传文件，此时尚不会改动您的账本。系统按列标题（而非列位置）匹配列，不区分大小写（因此「Amount」和「Gross」都能识别），并校验每一行，生成带每行状态的预览表：就绪、重复——已跳过、需先创建券商，或具体错误信息。只有当您检查预览并点击「导入有效行」后，就绪的行才会被写入账本并保存——存在错误或券商未解析的行会被完全排除，因此您需要在表格中修正后重新上传，而不会导致部分脏数据被提交。" },
      { q: "导入时为什么有些行显示「重复——已跳过」？", a: "每一行都会被归纳为一个签名——券商 + 日期 + 类型 + 股票代码（或「—」）+ 金额 + 货币——并与所有已有交易及同一文件中的其他行进行比对。若该签名已存在，该行会被标记为重复并被静默排除在导入之外，即使它本身是有效的。这正是重复上传同一文件也是安全的原因——不会造成重复录入。但这并非完美的指纹匹配：数量和价格都不在签名范围内，因此两笔针对同一股票代码、券商、日期、货币和总金额、但实际不同的买入订单，也会被互相标记为重复。" },
      { q: "除了日期、券商和类型之外，还需要哪些列？", a: "日期、券商和类型是每一行都必需的——缺少任一列会导致导入直接失败。买入/卖出需要数量和价格（总额会重新计算为数量 × 价格，因此文件中的任何总额值对这两种类型都会被忽略）。货币兑换需要总额（以该货币发送的金额）以及兑入货币和兑入金额——兑入货币必须与原货币不同，兑入金额必须为正数，否则该行报错。券商间转账需要总额以及兑入券商，指明一个已存在于您账本中的不同券商；无法识别的兑入券商会报「未知的兑入券商」错误，且与无法识别的主券商不同，不会获得「请先创建券商」的快捷修复——您需要自行先添加该券商。股息及其余类型（存款、取款、费用、预扣税、利息）只需总额为正数即可；股息行还可额外携带状态、除息日和派息日。" },
      { q: "同一份 CSV 导入文件重复上传安全吗？", a: "安全。每一行的签名（券商 + 日期 + 类型 + 股票代码 + 金额 + 货币）都会在提交前与您已有的交易比对，因此重复上传已导入过的文件时，每一行都会显示「重复——已跳过」，账本不会发生变化。这也意味着部分重新导入是安全的：如果您修正了错误并重新上传整份文件，第一次已成功导入的行会被跳过，只有新变为有效的行会被添加。" },
      { q: "如果我把自己的交易导出为 CSV，可以重新导入这个文件吗？", a: "可以——交易 CSV 的表头是导入模板列的超集，且导入时按列名（而非位置）匹配，因此多出的列会被直接忽略。导出后重新导入是受支持的操作路径。由于每一行的签名都与账本中已有的记录相符，直接重新导入会将所有行显示为重复并跳过——这个往返操作主要用于核对您的导出内容或为应用另建一份副本，而非用于把交易重新加回账本。" },
      { q: "三种 CSV 导出内容分别是什么？有何区别？", a: "交易 CSV 是完整账本——每笔交易一行，包含所有字段，且与导入模板列一一对应。现金 CSV 只筛选影响现金的类型——存款、取款、利息、费用、预扣税、券商间转账、货币兑换，以及非「预期」状态的股息——列围绕现金流设计，而非数量或价格等证券细节。股息 CSV 仅列出股息交易，显示总额、税费，以及以原始货币和基础货币计算的净额（总额 − 税费）。三者均不包含券商、持仓、缓存价格、设置或汇率表——如需这些，请使用 JSON 备份。" },
    ] },
    { title: "云同步", items: [
      { q: "云同步是什么？", a: "云同步会将您的整个本地账本——每个券商、交易和设置——上传到由 Supabase 托管的账户，并可再下载回来，因此在不同浏览器或不同设备打开应用时会显示相同的数据。它只解决一个问题：在多台设备上使用相同数据。它不是实时协作——没有实时共享编辑会话，只是每次编辑后推送整个本地快照，并在登录时拉取整个远程数据。" },
      { q: "我必须设置云同步吗？", a: "不需要。它完全是可选功能，默认关闭——在您用邮箱登录之前，应用行为与以往完全一致，仅保存到该设备的 localStorage，不会触及任何相关代码路径。如果该部署本身未配置云同步，设置中的「账户与云同步」面板只会显示「未配置」，应用的其他部分不会有任何变化。" },
      { q: "登录是如何运作的？", a: "在设置 → 账户与云同步中输入您的邮箱，系统会向您发送一封一次性登录链接邮件——无需设置、记住或重置密码。点击链接即可登录，并返回已认证状态的应用。同一邮箱始终对应同一云端账户，因此在第二台设备或浏览器上使用它会关联到相同数据，而不会创建新账户。" },
      { q: "我在已有自己数据的第二台设备上登录了——会发生什么？", a: "如果该设备本地已有交易数据，而您的账户在别处也已有云端数据，应用无法自行判断您想保留哪一份，因此会弹出「选择要保留的数据」提示，显示两侧的交易数量和最后更改时间。「保留此设备」会上传本地数据并覆盖云端数据；「使用我账户的数据」会下载云端数据并覆盖本地数据——无论选择哪一方，未选中的一方都会被完全替换，而非合并。如果只有一方真正有数据（真正的全新设备，或您的首次登录），系统会自动朝该方向解析，不会弹出提示。" },
      { q: "「最后写入者获胜」具体是什么意思？", a: "每次编辑都会在几秒后自动触发一次整份本地快照的推送，而登录会在云端数据比您最后一次本地编辑更新时将其拉取下来。这里没有字段级合并：如果您在设备 A 和设备 B 上分别编辑、且两者都尚未同步，无论哪一次推送最后到达服务器，都会整体覆盖另一台设备的数据行，悄悄丢弃较早那台设备的更改——即使是与本次编辑无关的其他交易。实际使用时，请将云同步视为「同一时间只在一台设备上编辑」，而非可在多台设备同时工作的方式。" },
      { q: "退出登录会删除我的数据吗？", a: "不会。退出登录只会结束登录会话；已保存在该设备 localStorage 中的一切都会原样保留。应用会单独记录该设备存储中当前所属的账户，与是否已登录无关，因此如果之后有不同账户登录，不会将遗留数据上传或合并进去——而是会先将其清除，把该设备视为该新账户的全新设备。" },
    ] },
    { title: "设置与偏好", items: [
      { q: "「默认回报视图」控制什么？", a: "仪表盘的主要盈亏统计卡可以显示总回报或纯未实现盈亏——此设置决定它默认打开时显示哪一种（仪表盘上也有一个卡片内切换按钮，可在当次访问中临时切换视图，不会改变此默认值）。总回报 = 未实现盈亏 + 已实现盈亏 + 净股息 − 独立费用，因此即使是已全部卖出或今天未操作的仓位，它也会持续变化。这里的未实现盈亏则严格指当前持仓的账面盈亏（市值 − 成本），刻意排除已实现盈亏、股息和费用。这两个数字确实不同：一个已全部卖出的仓位可能显示未实现盈亏为零，但仍因已实现收益而保有较大的非零总回报。" },
      { q: "「成本计算方法」是什么？可以更改吗？", a: "它决定了在您分批以不同价格买入后卖出部分持仓时，如何计算成本（以及由此得出的每一个已实现和未实现盈亏数字）。目前只实现了平均成本法：下拉菜单中只有一个可选项，应用中的每一个盈亏数字都已采用该方法。先进先出法（FIFO）已在计划中但尚未实现，因此目前还没有可供选择的批次选取方式——此面板目前只是确认当前生效的方法，而非提供切换选项。" },
      { q: "「时区」实际会改变什么？", a: "只会改变哪一个日历日被视为「今天」——用于天数计算（例如自购买以来的持有天数）以及判断某笔即将到来的股息是已派发还是仍属预测。它绝不会改写或移动已保存的交易日期；无论此设置为何，这些日期都保持原样。「设备本地」（默认值）使用您浏览器的本地日期；只有当您追踪的市场/券商所在的日历日与您查看应用所用设备不同时，选择明确的时区才有意义。" },
      { q: "对账「容差」设置的作用是什么？", a: "在券商页面，您的计算现金余额（存款 − 买入 − 费用 + 卖出 + 净股息 − 取款）会与您输入的实际余额进行比较。若差额在容差范围内（以您的基础货币计），会显示为小幅差异而非需要复核；超出该范围则视为需要留意的差异。这只是一个显示阈值——不会改变底层计算，也不会隐藏差异，只是改变了呈现的紧迫程度。若希望任何非零差额都被标出，可将其设为 0。" },
    ] },
    { title: "术语表", items: [
      { q: "TTM 是什么意思？", a: "TTM 代表「过去十二个月」（Trailing Twelve Months）——以今天为终点滚动的 12 个月区间，而非某个日历年度。「股息收益率（TTM）」的定义为：过去十二个月净股息 ÷ 当前投资组合市值，您看到的其他 TTM 数字（如预测面板上的「TTM 已收」）也采用同一滚动区间。" },
      { q: "「成本收益率」是什么？", a: "以您最初支付的金额（即平均成本）为基准，而非当前市值——它反映的是股息增长为您原始投资带来的实际收益效果。由于分母始终固定为成本，而股息可能增长，因此对于持续加息的持仓，即使基于市值的股息收益率没有变化，成本收益率也会上升。" },
      { q: "「分散度评分」是什么？", a: "基于投资组合权重的有效持仓数评分——数值越高代表越分散。它源自各持仓占总市值比例的赫芬达尔-赫希曼指数（HHI）：评分 = (1 − HHI) × 100，限定在 0–100 之间。旁边显示的「有效持仓数」为 1 ÷ HHI——即若各仓位大小相等、能产生相同集中度所需的持仓数量——因此当您的仓位大小不均时，该数字会低于您实际的持仓数量。" },
      { q: "「现金占比」是什么？", a: "现金占总净值（市值 + 可用现金）的百分比，现金按所有券商汇总计算。数值越高，代表越多净资产处于未投资状态；接近 0% 则代表您已接近满仓投资。" },
      { q: "「成本」是什么？", a: "以基础货币计，您为当前持有的股份实际支付的总金额——而非其市值。买入的佣金和税费会计入成本，而非作为独立费用记录；卖出时会按已卖出股份的平均成本（而非卖出所得）减少成本，因此一笔盈利的卖出不会扭曲剩余持仓的成本。" },
      { q: "「平均成本」是什么？", a: "成本 ÷ 持有股数——您每股的加权平均支付价格。这是应用目前唯一应用于盈亏数字的计价方法（FIFO 等方法已在计划中但尚未推出），因此每次卖出都从这个混合平均值中扣减，而非某一特定批次。" },
      { q: "「已投入净资本」「本金投入」和「净增现金」有什么区别？", a: "它们其实是同一个数字——存款 − 取款——只是在不同场景下使用不同的标签：仪表盘上称「本金投入」，现金标签页称「净增现金」，应用自身的公式说明中称「已投入净资本」。它衡量的是资金的进出，而非投资表现，因此不会随价格变动而改变。" },
      { q: "「净股息」是什么？", a: "净股息 = 总股息 − 预扣税。预扣税按每笔股息交易记录，并在股息页面按国家/地区（使用查询得到的真实国家）汇总。" },
    ] },
  ];
  const sections = LANG === "zh" ? sectionsZH : sectionsEN;
  const html = sections.map((sec) => panel(sec.title, `<div class="help-list">${sec.items.map((it) => `
    <details class="help-item"><summary>${it.q}</summary><p>${it.a}</p></details>`).join("")}</div>`)).join("");
  return { title: "Help", subtitle: "Getting started, how calculations work, and answers to common questions.", html };
}

/* =============================================================================
 * PAGE: HOLDING DETAIL  (#/holding/<encoded brokerId|ticker>)
 * ========================================================================== */
let holdingDivFilter = "upcoming";   // all | past | upcoming
function pageHolding() {
  const key = decodeURIComponent((location.hash.split("/")[2] || ""));
  const [brokerId, ticker] = key.split("|");
  const h = T.holdings.find((x) => x.brokerId === brokerId && x.ticker === ticker);
  if (!h) {
    return { title: "Holding", subtitle: "", html:
      `<p style="margin:-4px 0 12px"><a class="link" href="#/portfolio">← ${t("Back to Portfolio")}</a></p>
       ${panel("Holding", emptyState(t("This holding no longer exists (fully sold or deleted). Its realized P/L still counts in your totals.")))}` };
  }
  const meta = STOCK_META[h.ticker] || {};
  const tk = ticker.toUpperCase();
  const txs = ALL_TRANSACTIONS.filter((x) => x.brokerId === brokerId && (x.ticker || "").toUpperCase() === tk)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  // A past market payment only counts as something you were actually paid if you already
  // held the position by then — otherwise it's just the stock's history, not your money.
  // Also used to flag a freshly-opened position so its zero P/L figures don't read as broken.
  const earliestTxDate = txs.length ? txs.reduce((min, x) => (x.date < min ? x.date : min), txs[0].date) : null;
  // Left-aligned, equal-width columns — same convention as the Dividend Calendar table,
  // rather than the app-wide right-aligned ".num" numeric style, so the two tables on this
  // page read consistently instead of one being right-aligned and the other left-aligned.
  const txRows = txs.map((x) => `<tr><td class="dcc-c">${fmtDate(x.date)}</td><td class="dcc-c">${typeChip(x.type)}</td>
    <td class="dcc-c">${x.qty != null ? fmt(x.qty, { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : "—"}</td>
    <td class="dcc-c">${x.price != null ? ccyLabel(x.currency) + " " + fmt(x.price) : "—"}</td>
    <td class="dcc-c">${x.gross != null ? ccyLabel(x.currency) + " " + fmt(x.gross) : "—"}</td>
    <td class="dcc-c">${x.fee ? ccyLabel(x.currency) + " " + fmt(x.fee) : "—"}</td></tr>`).join("");
  const divs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && (x.ticker || "").toUpperCase() === tk)
    .sort((a, b) => ((a.payDate || a.date) < (b.payDate || b.date) ? 1 : -1));
  // Per-ticker dividend analytics + forecast + charts (F1)
  const tReceived = divs.filter((d) => d.status !== "Expected");
  const tExpected = divs.filter((d) => d.status === "Expected").sort((a, b) => ((a.payDate || "") < (b.payDate || "") ? -1 : 1));
  const totalDivReceived = tReceived.reduce((s, d) => s + divNetMYR(d), 0);
  // dividendForecast() expects allUpcomingDivs()-shaped rows (expectedNetMYR), not raw
  // transaction rows (gross/tax/fxRate) — map before passing, same as allUpcomingDivs()'s
  // own "legacy Expected" branch does, so the forecast can actually see this ticker's payment.
  const tExpectedForForecast = tExpected.map((d) => ({ ticker: d.ticker, payDate: d.payDate, expectedNetMYR: divNetMYR(d) }));
  const tFc = dividendForecast(tReceived, tExpectedForForecast);
  // Raw market dividend history (Yahoo-fetched, per-share, native currency) — the actual data behind the estimates above.
  const marketHist = (AUTO_DIV_CACHE[h.ticker] || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  // Dividend income over time (monthly, base ccy)
  const dPer = dividendByPeriod(tReceived).byMonth;
  const divSeries = Object.keys(dPer).sort().map((k) => ({ month: k.slice(2), value: dPer[k] }));
  // Dividend history bar chart — one bar per calendar year, received amount stacked
  // with the current year's still-projected remainder (so a partial in-progress year
  // reads as "on track", not as a drop-off vs prior full years).
  const divByYear = {};
  tReceived.forEach((d) => { const yr = (d.payDate || d.date || "").slice(0, 4); if (yr) divByYear[yr] = (divByYear[yr] || 0) + divNetMYR(d); });
  const curYear = todayISO().slice(0, 4);
  const projThisYear = (tFc.nextPayments || []).filter((p) => p.payDate.slice(0, 4) === curYear).reduce((s, p) => s + p.amtMYR, 0);
  if (projThisYear > 0 && !divByYear[curYear]) divByYear[curYear] = 0;
  const divYearSeries = Object.keys(divByYear).sort().map((yr) => ({
    label: yr, value: divByYear[yr], projected: yr === curYear ? projThisYear : 0,
  }));
  // Cumulative cost basis over time (proxy for position size — historical market prices aren't stored).
  // A Sell must reduce cost basis by the AVERAGE COST of the shares sold, not by the sale
  // proceeds (qty × sell price) — otherwise a profitable sale (price above avg cost) makes
  // cost basis drop too far, and a loss sale makes it drop too little, same accounting
  // computeTotals() already uses correctly elsewhere.
  let cum = 0, cumShares = 0; const costSeries = [];
  [...txs].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
    const xfx = x.fxRate || FX.rates[x.currency] || 1;
    const qty = +x.qty || 0;
    if (x.type === "Buy") {
      cum += (qty * (+x.price || 0) + (+x.fee || 0) + (+x.tax || 0)) * xfx;
      cumShares += qty;
    } else if (x.type === "Sell") {
      const avgCostPerShare = cumShares > 0 ? cum / cumShares : 0;
      const sellQty = Math.min(qty, cumShares);
      cum = Math.max(0, cum - avgCostPerShare * sellQty);
      cumShares = Math.max(0, cumShares - sellQty);
    }
    if (x.type === "Buy" || x.type === "Sell") costSeries.push({ month: x.date.slice(2), value: cum });
  });

  const priceLbl = h.hasPrice
    ? `${ccyLabel(h.currentPriceCcy)} ${fmt(h.currentPrice)} <span class="fx-note ${h.priceSource === "live" ? "live-price" : "manual-price"}">${h.priceSource === "live" ? t("Live") : t("Manual price")}</span>`
    : `<span class="muted">${t("No price set")}</span>`;

  // Position snapshot: only 3 things here are independent facts (Shares Held, Average Cost,
  // Current Price) — Market Value and Cost Basis are pure arithmetic on those (Shares x Price,
  // Shares x Avg Cost), not new information. Showing all 6 as equal-weight cards was really
  // just 3 numbers said 6 ways. Cards now: Market Value (the headline), Total Return (the
  // bottom line), Current Price (the live data point) — same Dashboard card system, 3-per-row
  // via its default span. The static/derived facts move to one plain descriptive line below.
  const openedRecently = earliestTxDate && (todayDate() - new Date(earliestTxDate + "T00:00:00")) < 7 * 86400000;
  const posStat = (label, val, valCls = "", wrapCls = "", sub = "") => `<div class="stat ${wrapCls}">
      <div class="stat-head"><span class="stat-label">${label}</span></div>
      <div class="stat-value ${valCls}">${val}</div>
      ${sub ? `<div class="stat-sub ${valCls}">${sub}</div>` : ""}
    </div>`;
  const priceReturnPct = h.costBasis ? (h.priceUnrealized / h.costBasis) * 100 : 0;
  // 52-week range — only meaningful once we have both bounds and a live current price
  // in the same currency (fetched together from the same quote call, so they always
  // agree). Manually-priced holdings never populate high52/low52 — the bar is simply
  // omitted rather than showing a stale or mismatched range.
  const range52Html = (h.hasPrice && h.high52 != null && h.low52 != null && h.high52 > h.low52) ? (() => {
    const pct = Math.max(0, Math.min(100, ((h.currentPrice - h.low52) / (h.high52 - h.low52)) * 100));
    // Low/High are labelled directly under each end of the track (not just implied by
    // left/right position), and the current price is shown as plain text next to the
    // marker's own position rather than hidden behind a hover-only title — a value that
    // only reveals itself on hover isn't self-explanatory, especially on touch devices
    // where hover doesn't really exist.
    return `<div class="range52">
      <div class="range52-labels"><span class="muted">${t("52-Week Range")}</span><span>${t("Current")}: <strong>${money(h.currentPrice, h.currentPriceCcy)}</strong></span></div>
      <div class="range52-track"><div class="range52-marker" style="left:${pct.toFixed(1)}%"></div></div>
      <div class="range52-labels" style="margin-top:5px">
        <span class="muted">${t("Low")} ${money(h.low52, h.currentPriceCcy)}</span>
        <span class="muted">${t("High")} ${money(h.high52, h.currentPriceCcy)}</span>
      </div>
    </div>`;
  })() : "";
  const positionPanel = panel(t("Position"), `
    <div class="metrics pos-metrics">
      ${posStat(t("Market Value"), money(h.marketValue), "", "net")}
      ${posStat(t("Total Return"), moneySigned(h.totalReturn), cls(h.totalReturn))}
      ${posStat(t("Price Return"), moneySigned(h.priceUnrealized), cls(h.priceUnrealized), "", `${signed(priceReturnPct)}%`)}
      ${posStat(t("Current Price"), priceLbl)}
    </div>
    <p style="font-size:14px;margin:14px 0 0">${fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} ${t("shares")} · ${t("Average Cost")} ${money(h.avgCost)} · ${t("Cost Basis")} ${money(h.costBasis)}</p>
    <div class="setting-row" style="padding:11px 0 0;border-bottom:0">
      <span class="sr-label">${t("Asset type")}</span>
      <span class="sr-value"><div style="width:160px">${styledSelect("holdingAssetType", ASSET_TYPES.map((x) => ({ value: x, label: t(x) })), holdingType(h.ticker), { id: "holdingAssetType" })}</div></span>
    </div>
    ${range52Html}
    ${openedRecently ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${t("Position opened")} ${fmtDate(earliestTxDate)} — ${t("unrealized P/L, realized P/L and dividends will build up over time.")}</p>` : ""}
  `);

  const html = `
    <p style="margin:-4px 0 12px"><a class="link" href="#/portfolio">← ${t("Back to Portfolio")}</a></p>
    <div class="holding-head">
      <div>
        <div class="ticker" style="font-size:20px">${esc(h.ticker)}</div>
        <div class="sub">${esc(h.company) || ""}</div>
        <div class="holding-chips">
          <span class="chip">${esc(brokerName(h.brokerId))}</span>
          <span class="chip">${esc(meta.country || h.country) || "—"}</span>
          ${meta.sector ? `<span class="chip">${esc(meta.sector)}</span>` : ""}
        </div>
      </div>
      <div class="holding-actions">
        <button class="btn" id="dtlPrice">＄ ${t("Set price")}</button>
        ${LIVE_ENABLED ? `<button class="btn" id="dtlLive">⟳ ${t("Live")}</button>` : ""}
      </div>
    </div>
    ${positionPanel}

    ${(() => {
      const tInfo = (tFc.tickerInfo || {})[h.ticker];
      const patternNote = tInfo
        ? `${t("Pattern detected")}: ${tInfo.freq}${tInfo.growthPct ? `, ${tInfo.growthPct > 0 ? "+" : ""}${fmt(tInfo.growthPct, { maximumFractionDigits: 1 })}%/${t("payment")}` : ""} (${tInfo.source === "market history" ? t("from market dividend history") : t("from your logged dividends")}).`
        : t("Record at least 2 dividends for this holding to enable pattern-based estimates.");
      // Year 2 / Year 3 only earn their own stats when the forecast actually diverges from
      // Next Year (i.e. growth was detected) — otherwise they just repeat the same number
      // and add nothing "Next Year" hasn't already said.
      const yearsDiffer = Math.abs(tFc.year2 - tFc.nextYear) > 0.5 || Math.abs(tFc.year3 - tFc.nextYear) > 0.5;
      // Plain stat row instead of individually bordered cards — same "no boxes inside a box"
      // treatment as the Position panel and Portfolio Health.
      const stat = (label, val, valCls = "") => `<div class="plain-stat"><div class="mc-label">${label}</div><div class="mc-value ${valCls}">${val}</div></div>`;
      const multiYear = (tFc.year2 > 0 && yearsDiffer)
        ? `${stat(t("Year 2"), money(tFc.year2))}${stat(t("Year 3"), tFc.year3 > 0 ? money(tFc.year3) : "—")}` : "";
      const yieldOnCostTip = ` <span class="col-info" data-tip="${esc(t("Based on what you originally paid (your average cost), not today's market value — shows the effective income dividend growth has earned you over time on your original investment."))}">${COL_INFO_ICON_SVG}</span>`;
      const divYieldTtmPct = h.marketValue ? (tFc.ttm / h.marketValue) * 100 : 0;
      return panel("Dividend Summary", `<div class="plain-stat-row">
        ${stat(t("Total Dividends Received"), money(totalDivReceived), "pos")}
        ${stat(t("Dividend Yield (TTM)"), h.marketValue ? fmt(divYieldTtmPct, { maximumFractionDigits: 2 }) + "%" : "—")}
        ${stat(`${t("Yield on Cost")}${yieldOnCostTip}`, h.costBasis ? fmt(tFc.ttm / h.costBasis * 100, { maximumFractionDigits: 2 }) + "%" : "—")}
        ${stat(t("Next Month"), tFc.nextMonth > 0 ? money(tFc.nextMonth) : "—")}
        ${stat(t("Next Quarter"), tFc.nextQuarter > 0 ? money(tFc.nextQuarter) : "—")}
        ${stat(t("Next Year"), tFc.nextYear > 0 ? money(tFc.nextYear) : "—")}${multiYear}</div>
        <p class="muted" style="font-size:12px;margin:20px 0 0">${patternNote}</p>`);
    })()}

    ${(() => {
      if (!marketHist.length && !(tFc.nextPayments && tFc.nextPayments.length)) return "";
      // One continuous timeline: real past payments (market data) flow straight into
      // future confirmed/estimated ones, so the calendar reads as a single history-to-forecast line
      // instead of two disconnected tables the user has to mentally stitch together.
      const perShareCcy = marketHist.length ? marketHist[0].currency : h.currency;
      const fxRate = FX.rates[perShareCcy] || 1;
      const today = todayISO();
      // A market-history row from while you held the position doesn't mean you've actually
      // logged receiving it — "Total Dividends Received" only counts what's in "Your Recorded
      // Dividends" below. Cross-check against your own logged dividends (within a loose ±10
      // day window, since ex-date here vs. your logged pay date won't line up exactly) so the
      // badge honestly distinguishes "you recorded this" from "you were eligible but haven't."
      const loggedDivDates = divs.map((dv) => dv.payDate || dv.date).filter(Boolean).map((ds) => new Date(ds + "T00:00:00").getTime());
      const pastRows = marketHist.map((d) => {
        const heldAtTime = earliestTxDate && d.date >= earliestTxDate;
        const dTime = new Date(d.date + "T00:00:00").getTime();
        const logged = heldAtTime && loggedDivDates.some((t) => Math.abs(t - dTime) <= 10 * 86400000);
        return {
          date: d.date,
          perShareAmt: d.amount || 0,
          amtMYR: (d.amount || 0) * h.shares * (FX.rates[d.currency] || 1),
          status: !heldAtTime ? "Market record" : logged ? "Received" : "Not logged",
        };
      });
      // Confirmed payments (real declared dividends) show regardless of how far out they are —
      // that's real, decided data. But algorithmically "Estimated" rows are a guess, and the
      // company hasn't actually declared them yet — showing years of them reads as far more
      // certain than it is, so those are capped to the next 12 months (matching the "Next
      // Year" window already shown above) rather than the full 3-year projection horizon.
      const oneYearOut = new Date(todayDate()); oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      const oneYearOutStr = dateToISO(oneYearOut);
      const futureRows = (tFc.nextPayments || [])
        .filter((p) => p.confirmed || p.payDate <= oneYearOutStr)
        .map((p) => ({
          date: p.payDate,
          perShareAmt: h.shares ? p.amtMYR / h.shares / fxRate : null,
          amtMYR: p.amtMYR,
          status: p.confirmed ? "Confirmed" : "Estimated",
        }));
      const allRows = [...pastRows, ...futureRows].sort((a, b) => (a.date < b.date ? -1 : 1));
      const nextIdx = allRows.findIndex((r) => r.date >= today);
      const filtered = holdingDivFilter === "past" ? allRows.filter((r) => r.date < today)
        : holdingDivFilter === "upcoming" ? allRows.filter((r) => r.date >= today)
        : allRows;
      // Rough universal estimate — real payment date isn't in the market data (only the
      // ex-date is), but issuers typically settle 2-4 weeks after ex-date. Shown clearly
      // labeled "(est.)" alongside the real ex-date so a user deciding "do I need to buy
      // before or after this date" has both: the hard cutoff (Ex-Date) and a rough sense
      // of when the money would actually show up (Est. Payment).
      const estPayDate = (ds) => { const dd = new Date(ds + "T00:00:00"); dd.setDate(dd.getDate() + 14); return dateToISO(dd); };
      const rows = filtered.map((r) => {
        const yieldPct = (h.hasPrice && h.currentPrice > 0 && r.perShareAmt != null) ? (r.perShareAmt / h.currentPrice * 100) : null;
        const isNext = nextIdx >= 0 && r === allRows[nextIdx];
        // Exactly one badge per row — the "next payment" row shows that instead of its
        // Confirmed/Estimated badge, rather than stacking two pills in the same cell.
        const statusCell = isNext ? `<span class="badge confirmed">${t("Next payment")}</span>` : statusBadge(r.status);
        return `<tr${isNext ? ` class="next-div-row"` : ""}><td class="dcc-c">${fmtDate(r.date)}</td><td class="dcc-c">${fmtDate(estPayDate(r.date))}</td><td class="dcc-c">${r.perShareAmt != null ? fmt(r.perShareAmt, { maximumFractionDigits: 2 }) : "—"}</td><td class="dcc-c">${fmt(r.amtMYR, { maximumFractionDigits: 2 })}</td><td class="dcc-c">${yieldPct != null ? fmt(yieldPct, { maximumFractionDigits: 2 }) + "%" : "—"}</td><td class="dcc-c">${statusCell}</td></tr>`;
      }).join("");
      const filterSel = `<div style="width:150px">${styledSelect("divCalFilter", [
        { value: "all", label: t("All") },
        { value: "past", label: t("Past") },
        { value: "upcoming", label: t("Upcoming") },
      ], holdingDivFilter, { id: "divCalFilterSel" })}</div>`;
      const yieldTip = ` <span class="col-info tip-down" data-tip="${esc(t("This payment as a % of the current share price — a per-payment figure, not the annualized TTM yield shown above. Identical values across rows reflect a flat, no-growth projection, not an error."))}">${COL_INFO_ICON_SVG}</span>`;
      // Equal-width, center-aligned columns: every previous attempt at uneven widths (fixed
      // px, one flexible column) still left content visually clustered to one side, because
      // left/right-aligned text in an unevenly-sized column doesn't actually spread out — only
      // the invisible column boundary does. Centering in five equal columns means the leftover
      // space on each side of every value is symmetric, so the row reads as evenly filled.
      const dateTip = ` <span class="col-info tip-down" data-tip="${esc(t("Buy before this date to qualify for this dividend — buy on or after it and you'll miss this specific payment. This is the ex-dividend date; market data sources don't report a separate payment date."))}">${COL_INFO_ICON_SVG}</span>`;
      const estPayTip = ` <span class="col-info tip-down" data-tip="${esc(t("A rough estimate (Ex-Date + 14 days) of when the money would actually land in your account — not real data, since market sources don't report an actual payment date."))}">${COL_INFO_ICON_SVG}</span>`;
      const heads = [
        { label: `${t("Ex-Date")}${dateTip}`, style: "width:16.6%;text-align:left" },
        { label: `${t("Est. Payment")}${estPayTip}`, style: "width:16.6%;text-align:left" },
        { label: `${t("Per Share")} (${esc(ccyLabel(perShareCcy))})`, style: "width:16.6%;text-align:left" },
        { label: `${t("Total")} (${esc(ccyLabel(FX.base))})`, style: "width:16.6%;text-align:left" },
        { label: `${t("Yield")}${yieldTip}`, style: "width:16.6%;text-align:left" },
        { label: "Status", style: "width:16.6%;text-align:left" },
      ];
      const titleTip = `<span class="col-info tip-down" style="margin-left:10px" data-tip="${esc(t("Real dividend payments for this stock (fetched automatically from market data) flowing into the confirmed/estimated payments used for the forecast above."))}">${COL_INFO_ICON_SVG}</span>`;
      // Only scroll once there's more than 5 rows to show — a short list shouldn't sit
      // inside a scroll container it doesn't need.
      const scrollCls = filtered.length > 5 ? "dcc-table-scroll" : "";
      return panel(`${t("Dividend Calendar")}${titleTip}`, `<div class="${scrollCls}">${table(heads, rows, { fixed: true })}</div>`, `<div class="panel-head-actions">${filterSel}</div>`);
    })()}

    ${(() => {
      // Yearly dividend growth — the headline "is this actually growing" view. Needs 2+
      // distinct years to read as a trend at all; a single bar isn't history yet.
      if (divYearSeries.length < 2) return "";
      const legend = `<div class="chart-legend">
        <span class="cl-item"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--pos)"></span>${t("Received")}</span>
        ${projThisYear > 0 ? `<span class="cl-item"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--warn);opacity:.55"></span>${t("Projected (this year)")}</span>` : ""}
      </div>`;
      return panel(t("Dividend History by Year"), `<div class="chart">${barChartSVG(divYearSeries, { ariaLabel: t("Dividend history by year") })}</div>${legend}`);
    })()}

    ${(() => {
      // Each chart is omitted entirely (no box at all) when there isn't enough data to draw
      // it, instead of a full-height panel that just says "not enough data" — a freshly-opened
      // position hits this on every visit until a second trade / first dividend exists.
      const showCost = costSeries.length >= 2;
      const showDiv = divSeries.length >= 2;
      if (!showCost && !showDiv) return "";
      const costPanel = panel(t("Cost Basis Over Time"), `<div class="chart">${lineChartSVG(costSeries)}</div><p class="muted" style="font-size:11px;margin:6px 0 0">${t("Cumulative cost — historical market prices are not stored.")}</p>`);
      const divPanel = panel(t("Dividend Income Over Time"), `<div class="chart">${lineChartSVG(divSeries)}</div>`);
      if (showCost && showDiv) return `<section class="grid-2">${costPanel}${divPanel}</section>`;
      return showCost ? costPanel : divPanel;
    })()}

    <details class="panel addhold">
      <summary><span class="addhold-head"><span class="addhold-title">${t("Transactions")} (${txs.length})</span><span class="addhold-sub">${t("Full trade history for this holding")}</span></span></summary>
      <div class="addhold-body">${txRows ? table([
        {label:"Date", style:"width:16.6%"},{label:"Type", style:"width:16.6%"},{label:"Qty", style:"width:16.6%"},
        {label:"Price", style:"width:16.6%"},{label:"Gross", style:"width:16.6%"},{label:"Fee", style:"width:16.6%"},
      ], txRows) : emptyState(t("No transactions for this holding."))}</div>
    </details>`;

  return { title: h.ticker, subtitle: h.company || t("Holding detail"), html,
    mount() {
      const p = $("#dtlPrice");
      if (p) p.addEventListener("click", () => showSetPriceModal(h));
      const lv = $("#dtlLive");
      if (lv) lv.addEventListener("click", async () => {
        if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
        lv.classList.add("spin");
        const ok = await refreshLivePrice(h.ticker);
        if (ok) { saveStore(); toast(`${h.ticker} ${t("updated")}`); render(); }
        else { lv.classList.remove("spin"); toast(`${t("Couldn't fetch")} ${h.ticker}`); }
      });
      const dcf = $("#divCalFilterSel");
      if (dcf) dcf.addEventListener("change", () => { holdingDivFilter = dcf.value; render(); });
      const atSel = $("#holdingAssetType");
      if (atSel) atSel.addEventListener("change", (e) => {
        setHoldingType(h.ticker, e.target.value); saveStore(); toast(t("Asset type saved"));
      });
      // AUTO_DIV_CACHE is in-memory only (not persisted) and was previously only ever
      // populated by the Dashboard's mount() — landing here directly (bookmark,
      // back-button, or a hard refresh while already on this page) left it empty with
      // nothing to re-fetch it, hiding the Dividend Calendar even though the underlying
      // holding data was fine. Fetch it here too, same pattern as that page.
      if (LIVE_ENABLED) {
        fetchAllDivSchedules().then(({ fetched }) => {
          if (fetched && document.getElementById("dtlPrice")) render();
        });
        fetchAllLivePrices().then(({ fetched }) => {
          if (fetched && document.getElementById("dtlPrice")) render();
        });
      }
    } };
}

/* =============================================================================
 * CALC MODAL
 * ========================================================================== */
/* Available Cash breakdown — shared by the Dashboard's Available Cash stat and
 * the Transactions page's Cash tab, so "how was this calculated" is one function. */
function availableCashCalc() {
  const txFx = (x) => (x.fxRate || FX.rates[x.currency] || 1);
  const flowSum = (pred, amt) => ALL_TRANSACTIONS.filter(pred).reduce((s, x) => s + amt(x) * txFx(x), 0);
  const cf = {
    deposits: flowSum((x) => x.type === "Deposit", (x) => +x.gross || 0),
    withdrawals: flowSum((x) => x.type === "Withdrawal", (x) => +x.gross || 0),
    buys: flowSum((x) => x.type === "Buy", (x) => (+x.gross || 0) + (+x.fee || 0) + (+x.tax || 0)),
    sells: flowSum((x) => x.type === "Sell", (x) => (+x.gross || 0) - (+x.fee || 0) - (+x.tax || 0)),
    divs: flowSum((x) => x.type === "Dividend" && x.status !== "Expected", (x) => (+x.gross || 0) - (+x.tax || 0)),
    interest: flowSum((x) => x.type === "Interest / cash yield" || x.type === "Interest", (x) => +x.gross || 0),
    fees: flowSum((x) => x.type === "Fee", (x) => +x.gross || 0),
    taxes: flowSum((x) => x.type === "Tax withholding", (x) => +x.gross || 0),
  };
  const flow = cf.deposits - cf.withdrawals - cf.buys + cf.sells + cf.divs + cf.interest - cf.fees - cf.taxes;
  const fxAdj = (T.totalCash || 0) - flow;
  const mfmt = (n) => `${ccyLabel(FX.base)} ${fmt(n)}`;
  let rows = [
    { on: cf.deposits, op: "+", label: "Deposits", val: mfmt(cf.deposits) },
    { on: cf.withdrawals, op: "−", label: "Withdrawals", val: mfmt(cf.withdrawals) },
    { on: cf.buys, op: "−", label: "Buys (incl. fees & tax)", val: mfmt(cf.buys) },
    { on: cf.sells, op: "+", label: "Sells (net of fees)", val: mfmt(cf.sells) },
    { on: cf.divs, op: "+", label: "Net dividends received", val: mfmt(cf.divs) },
    { on: cf.interest, op: "+", label: "Interest / cash yield", val: mfmt(cf.interest) },
    { on: cf.fees, op: "−", label: "Standalone fees", val: mfmt(cf.fees) },
    { on: cf.taxes, op: "−", label: "Tax withholding", val: mfmt(cf.taxes) },
    { on: Math.abs(fxAdj) > 0.005, op: fxAdj >= 0 ? "+" : "−", label: "FX gain/loss on cash", hint: "Your foreign cash balance is worth more or less in RM depending on the exchange rate stored when you deposited vs. today's rate.", val: mfmt(Math.abs(fxAdj)) },
  ].filter((r) => r.on).map(({ op, label, val }) => ({ op, label, val }));
  // Fallback so the breakdown is never blank: only brokers that actually hold cash, else a plain note.
  if (!rows.length) rows = BROKERS
    .filter((b) => Math.abs(T.brokerCash[b.id] || 0) > 0.005)
    .map((b) => ({ op: "+", label: b.name, val: mfmt(T.brokerCash[b.id] || 0) }));
  if (!rows.length) rows = [{ op: "+", label: "No cash movements recorded yet", val: mfmt(0) }];
  return { title: "Available Cash", rows, total: T.totalCash || 0 };
}

/* Deposits − Withdrawals breakdown — shared by Dashboard's "Principal Invested" and
 * the Cash tab's "Net Cash Added" (same number, different label per context). */
function netCashAddedCalc(title = "Net Cash Added") {
  return { title, rows: [
    { op: "+", label: "Total Deposits", val: fmt(T.totalDeposits) },
    { op: "−", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) }], total: T.netCapitalInvested };
}

/* Per-broker breakdown of a set of transactions — Total Deposits/Withdrawals and the
 * Cash tab's single-type filter sums (Fee/Interest/Transfer/etc). */
function brokerBreakdownCalc(title, txList) {
  const byBroker = {};
  txList.forEach((tx) => {
    const fxr = tx.fxRate || FX.rates[tx.currency] || 1;
    const myr = tx.myrEquivalent != null ? tx.myrEquivalent : (+tx.gross || 0) * fxr;
    byBroker[tx.brokerId] = (byBroker[tx.brokerId] || 0) + myr;
  });
  const rows = Object.keys(byBroker).map((id) => ({ op: "+", label: brokerName(id), val: money(byBroker[id]) }));
  const total = Object.values(byBroker).reduce((s, v) => s + v, 0);
  return { title, rows: rows.length ? rows : [{ op: "+", label: "No transactions", val: money(0) }], total };
}

function showCalc(calc) {
  $("#modalTitle").textContent = t(calc.title);
  const rows = calc.rows.map((r) => `<div class="calc-row"><span><span class="cr-op">${r.op}</span> ${t(r.label)}${r.hint ? ` <span class="col-info tip-down" data-tip="${r.hint}">${COL_INFO_ICON_SVG}</span>` : ""}</span><span class="cr-val">${r.val}</span></div>`).join("");
  $("#modalBody").innerHTML = `${rows}
    <div class="calc-row total"><span>= ${t("Result")}</span><span class="cr-val">${calc.totalFmt != null ? calc.totalFmt : money(calc.total)}</span></div>
    <p class="muted" style="margin:14px 0 0;font-size:12px">${t("All values converted to base currency using stored exchange rates. Original amounts are preserved.")}</p>`;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

/* Manual price entry — reuses the same modal shell as showCalc() (title +
 * body + the existing Escape/backdrop-click/× close wiring) instead of the
 * browser's native prompt(), which can't be styled and looks like it belongs
 * to a different app entirely. */
function showSetPriceModal(h) {
  const cur = CURRENT_PRICES[h.ticker];
  $("#modalTitle").textContent = `${t("Set Price")} — ${h.ticker}`;
  $("#modalBody").innerHTML = `
    <form id="setPriceForm" class="form">
      <label>${t("Price per share")} (${esc(h.currentPriceCcy)})
        <input type="number" step="any" name="price" value="${cur ? esc(cur.price) : ""}" placeholder="0.00" required>
      </label>
      <p class="muted" style="font-size:12px;margin:10px 0 0">${t("Manually entered prices are always labelled \"Manual price\" and are never mistaken for live market data.")}</p>
      <div class="form-actions" style="margin-top:14px">
        <button class="btn primary" type="submit">${t("Save")}</button>
        <button class="btn ghost" type="button" id="setPriceCancel">${t("Cancel")}</button>
      </div>
    </form>`;
  $("#modal").hidden = false;
  const form = $("#setPriceForm");
  const priceInput = form.querySelector('[name="price"]');
  priceInput.focus();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const price = parseFloat(priceInput.value);
    if (!(price > 0)) { toast(t("Enter a valid price.")); return; }
    CURRENT_PRICES[h.ticker] = { price, currency: h.currentPriceCcy, date: todayISO(), source: "manual" };
    saveStore(); closeModal(); toast(t("Price updated")); render();
  });
  $("#setPriceCancel").addEventListener("click", closeModal);
}

/* =============================================================================
 * CSV EXPORT
 * ========================================================================== */
/* Quote-escapes embedded " chars (proper CSV, not the old blind ' swap) and
 * neutralizes formula injection — a cell that opens with =, +, - or @ runs as
 * a formula the instant this file is opened in Excel/Sheets. A leading '
 * disables that while leaving genuine negative numbers untouched. */
function csvSafe(x) {
  const s = String(x == null ? "" : x);
  const escaped = s.replace(/"/g, '""');
  const looksLikeFormula = /^[=+\-@]/.test(escaped) && isNaN(Number(s));
  return looksLikeFormula ? "'" + escaped : escaped;
}
function downloadCSV(filename, header, lines) {
  const csv = [header, ...lines].map((r) => r.map((x) => `"${csvSafe(x)}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(filename + " " + t("exported"));
}
function exportCashCSV() {
  const cashTypes = ["Deposit", "Withdrawal", "Interest / cash yield", "Interest", "Fee", "Tax withholding", "Transfer between brokers", "Currency Exchange"];
  const rows = ALL_TRANSACTIONS.filter((x) => cashTypes.includes(x.type) || (x.type === "Dividend" && x.status !== "Expected"));
  downloadCSV("investment-ledger-cash.csv",
    ["Date","Broker","Type","Amount","Currency","FX Rate","Amount in " + FX.base,"To Broker","To Currency","To Amount"],
    rows.map((c) => [c.date, brokerName(c.brokerId), c.type, c.gross, c.currency, c.fxRate || FX.rates[c.currency] || 1, (c.myrEquivalent != null ? c.myrEquivalent : (+c.gross || 0) * (c.fxRate || 1)).toFixed(2),
      c.toBrokerId ? brokerName(c.toBrokerId) : "", c.toCurrency || "", c.toAmount ?? ""]));
}
function exportTxCSV() {
  downloadCSV("investment-ledger-transactions.csv",
    ["Date","Broker","Type","Ticker","Quantity","Price","Gross","Fee","Tax","Currency","FX Rate",
      "To Broker","To Currency","To Amount","Status","Ex-Date","Pay Date","MYR Equivalent","Notes"],
    ALL_TRANSACTIONS.map((x) => [x.date, brokerName(x.brokerId), x.type, x.ticker, x.qty ?? "", x.price ?? "", x.gross ?? "", x.fee ?? 0, x.tax ?? 0, x.currency, x.fxRate ?? "",
      x.toBrokerId ? brokerName(x.toBrokerId) : "", x.toCurrency || "", x.toAmount ?? "",
      x.status || "", x.exDate || "", x.payDate || "",
      (x.myrEquivalent != null ? x.myrEquivalent : "").toString(), x.notes || ""]));
}
function exportDivCSV() {
  const divs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend");
  downloadCSV("investment-ledger-dividends.csv",
    ["Ticker","Broker","Ex-Date","Payment","Gross","Tax","Net","Currency","FX Rate","Net in " + FX.base,"Status"],
    divs.map((d) => { const net = (+d.gross || 0) - (+d.tax || 0); const fx = d.fxRate || FX.rates[d.currency] || 1;
      return [d.ticker, brokerName(d.brokerId), d.exDate || "", d.payDate || d.date, d.gross, d.tax || 0, net.toFixed(2), d.currency, fx, (net * fx).toFixed(2), d.status || "Received"]; }));
}

/* =============================================================================
 * CSV IMPORT (F5) — template, parse, validate, preview-before-commit
 * -----------------------------------------------------------------------------
 * Nothing is written to the ledger until the user reviews the preview and
 * presses "Import valid rows". Invalid rows are listed with the exact reason.
 * ========================================================================== */
let pendingImport = null;   // { rows:[{...parsed, errors, dup, needsBroker}], text, unknownBrokers:[] }

const IMPORT_TYPES = ["Deposit","Withdrawal","Buy","Sell","Dividend","Fee","Tax withholding",
  "Interest / cash yield","Interest","Currency Exchange","Transfer between brokers","DRIP / Reinvested"];

const IMPORT_HEADER = ["Date","Broker","Type","Ticker","Quantity","Price","Gross","Fee","Tax","Currency","FX Rate",
  "To Broker","To Currency","To Amount","Status","Ex-Date","Pay Date","Notes"];

function downloadImportTemplate() {
  const b1 = BROKERS[0] ? BROKERS[0].name : "Rakuten Trade";
  const b2 = BROKERS[1] ? BROKERS[1].name : "Interactive Brokers";
  const blank = (cells) => IMPORT_HEADER.map((_, i) => cells[i] != null ? cells[i] : "");
  downloadCSV("investment-ledger-import-template.csv", IMPORT_HEADER, [
    // Date, Broker, Type, Ticker, Qty, Price, Gross, Fee, Tax, Ccy, FX, ToBroker, ToCcy, ToAmt, Status, ExDate, PayDate, Notes
    blank(["2026-01-06", b1, "Deposit", "", "", "", "10000", "0", "0", "MYR", "1"]),
    blank(["2026-01-10", b1, "Buy", "1155.KL", "1000", "9.20", "", "9.20", "0", "MYR", "1"]),
    blank(["2026-03-15", b1, "Dividend", "1155.KL", "", "", "600", "0", "0", "MYR", "1", "", "", "", "Received", "2026-03-01", "2026-03-15"]),
    blank(["2026-07-30", b2, "Dividend", "AAPL", "", "", "12", "1.8", "0", "USD", "4.70", "", "", "", "Expected", "2026-07-25", "2026-08-10"]),
    blank(["2026-02-01", b2, "Currency Exchange", "", "", "", "4000", "0", "0", "MYR", "1", "", "USD", "850"]),
    blank(["2026-04-01", b1, "Transfer between brokers", "", "", "", "5000", "0", "0", "MYR", "1", b2]),
    // DRIP: Price = reinvest price/share, Gross = gross dividend (share count is derived).
    blank(["2026-05-20", b1, "DRIP / Reinvested", "1155.KL", "", "9.35", "180", "0", "0", "MYR", "1"]),
  ]);
}

/* RFC-4180-ish parser: handles quoted fields, embedded commas, "" escapes. */
function parseCSV(text) {
  const rows = []; let field = "", row = [], inQ = false;
  text = text.replace(/^﻿/, "");   // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => (c || "").trim() !== ""));
}

/* Signature used for duplicate detection: same broker + date + type + ticker + amount + ccy. */
function txSignature(brokerId, date, type, ticker, gross, currency) {
  return [brokerId, date, type, (ticker || "—").toUpperCase(), (+gross || 0).toFixed(2), currency].join("|");
}

function importTxFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { error: t("The file has no data rows.") };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const col = {
    date: find("date"), broker: find("broker"), type: find("type"), ticker: find("ticker"),
    qty: find("quantity", "qty", "shares"), price: find("price"), gross: find("gross", "amount"),
    fee: find("fee"), tax: find("tax"), currency: find("currency", "ccy"), fx: find("fx rate", "fxrate", "rate"),
    toBroker: find("to broker", "tobroker", "destination broker"),
    toCcy: find("to currency", "tocurrency", "to ccy"),
    toAmt: find("to amount", "toamount", "received"),
    status: find("status"), exDate: find("ex-date", "ex date", "exdate"), payDate: find("pay date", "payment", "paydate"),
    notes: find("notes", "note"),
  };
  if (col.date < 0 || col.broker < 0 || col.type < 0) return { error: t("Missing required columns: Date, Broker and Type.") };

  const brokerByName = {}; BROKERS.forEach((b) => (brokerByName[b.name.trim().toLowerCase()] = b.id));
  // Existing-ledger signatures + a per-batch set, so dupes inside the file are caught too.
  const existing = new Set(ALL_TRANSACTIONS.map((x) => txSignature(x.brokerId, x.date, x.type, x.ticker, x.gross, x.currency)));
  const batchSeen = new Set();
  const unknownBrokers = [];

  const out = rows.slice(1).map((r, n) => {
    const g = (c) => (c >= 0 && c < r.length ? String(r[c]).trim() : "");
    const errors = [];
    const date = g(col.date);
    const brokerRaw = g(col.broker);
    const type = IMPORT_TYPES.find((tp) => tp.toLowerCase() === g(col.type).toLowerCase()) || g(col.type);
    const currency = (g(col.currency) || FX.base).toUpperCase();
    const ticker = g(col.ticker).toUpperCase();
    const num = (c) => { const v = parseFloat(g(c).replace(/,/g, "")); return isNaN(v) ? null : v; };
    let qty = num(col.qty), price = num(col.price), gross = num(col.gross);
    const fee = num(col.fee) || 0, tax = num(col.tax) || 0;
    const fxRate = num(col.fx) || FX.rates[currency] || (currency === FX.base ? 1 : null);
    const toCurrency = g(col.toCcy).toUpperCase(), toAmount = num(col.toAmt);
    const toBrokerRaw = g(col.toBroker);
    const status = g(col.status), exDate = g(col.exDate), payDate = g(col.payDate);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(t("Date must be YYYY-MM-DD"));
    const brokerId = brokerByName[brokerRaw.toLowerCase()];
    let needsBroker = false;
    if (!brokerId) {
      needsBroker = true;
      if (brokerRaw && !unknownBrokers.some((u) => u.name.toLowerCase() === brokerRaw.toLowerCase()))
        unknownBrokers.push({ name: brokerRaw, currency });
    }
    if (!IMPORT_TYPES.includes(type)) errors.push(t("Unsupported type"));
    if (!fxRate) errors.push(t("No FX rate for") + " " + currency);

    let toBrokerId;
    let dripQty;
    if (type === "Buy" || type === "Sell") {
      if (!(qty > 0)) errors.push(t("Quantity required"));
      if (!(price > 0)) errors.push(t("Price required"));
      if (!ticker) errors.push(t("Ticker required"));
      gross = (qty || 0) * (price || 0);
    } else if (type === "DRIP / Reinvested") {
      // Price = reinvest price/share, Gross = gross dividend; share count is derived.
      if (!ticker) errors.push(t("Ticker required"));
      if (!(gross > 0)) errors.push(t("Amount required"));
      if (!(price > 0)) errors.push(t("Price required"));
      if (tax < 0) errors.push(t("Tax can't be negative."));
      if (!(gross - tax > 0)) errors.push(t("Withholding tax can't exceed the gross dividend."));
      if (/expected/i.test(status)) errors.push(t("DRIP rows must be Received — a dividend can't be reinvested before it's paid."));
      dripQty = price > 0 ? (gross - tax) / price : 0;
    } else if (type === "Currency Exchange") {
      qty = null; price = null;
      if (!(gross > 0)) errors.push(t("Amount required"));
      if (!toCurrency || toCurrency === currency) errors.push(t("To Currency must differ"));
      if (!(toAmount > 0)) errors.push(t("To Amount required"));
    } else if (type === "Transfer between brokers") {
      qty = null; price = null;
      if (!(gross > 0)) errors.push(t("Amount required"));
      toBrokerId = brokerByName[toBrokerRaw.toLowerCase()];
      if (!toBrokerRaw || toBrokerRaw.toLowerCase() === brokerRaw.toLowerCase()) errors.push(t("To Broker must differ"));
      else if (!toBrokerId) errors.push(t("Unknown To Broker"));
    } else {
      qty = null; price = null;
      if (!(gross > 0)) errors.push(t("Amount required"));
    }

    // Duplicate check (only meaningful once broker + amount resolve). A DRIP row lands in
    // the ledger as a plain "Dividend" record (see commitImport), so it's checked and
    // marked against that same signature shape — not a "DRIP / Reinvested"-typed one that
    // would never match anything post-import.
    let dup = false;
    if (!needsBroker && !errors.length) {
      const sigType = type === "DRIP / Reinvested" ? "Dividend" : type;
      const sig = txSignature(brokerId, date, sigType, ticker, gross, currency);
      if (existing.has(sig) || batchSeen.has(sig)) dup = true;
      else batchSeen.add(sig);
    }
    return { line: n + 2, date, brokerId, brokerName: brokerRaw, type, ticker, currency, qty, price,
      gross: gross || 0, fee, tax, fxRate: fxRate || 1, toCurrency, toAmount, toBrokerId, dripQty,
      status, exDate, payDate, notes: g(col.notes), errors, dup, needsBroker };
  });
  return { rows: out, unknownBrokers };
}

function rowReady(r) { return !r.errors.length && !r.dup && !r.needsBroker; }

function handleCsvFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const res = importTxFromCSV(text);
    if (res.error) { pendingImport = null; toast(res.error); refreshImportPreview(); return; }
    pendingImport = { rows: res.rows, text, unknownBrokers: res.unknownBrokers };
    refreshImportPreview();
    const ok = res.rows.filter(rowReady).length;
    toast(`${ok}/${res.rows.length} ${t("rows ready to import")}`);
  };
  reader.onerror = () => toast(t("Could not read that file."));
  reader.readAsText(file);
}

function importPreviewHTML() {
  if (!pendingImport) return "";
  const rows = pendingImport.rows;
  const okCount = rows.filter(rowReady).length;
  const dupCount = rows.filter((r) => r.dup).length;
  const brokerCount = rows.filter((r) => r.needsBroker).length;
  const errCount = rows.filter((r) => r.errors.length).length;
  const unknown = pendingImport.unknownBrokers || [];
  const statusCell = (r) => {
    if (r.errors.length) return `<span class="badge neg" title="${escAttr(r.errors.join("; "))}">${esc(r.errors.join("; "))}</span>`;
    if (r.needsBroker) return `<span class="badge warn">${t("Create broker first")}</span>`;
    if (r.dup) return `<span class="badge subtle">${t("Duplicate — skipped")}</span>`;
    return `<span class="badge pos">${t("Ready")}</span>`;
  };
  const body = rows.map((r) => {
    const amt = r.type === "Buy" || r.type === "Sell" ? `${esc(r.qty)} @ ${fmt(r.price)}`
      : r.type === "Currency Exchange" ? `${fmt(r.gross)} → ${esc(ccyLabel(r.toCurrency))} ${fmt(r.toAmount)}`
      : r.type === "DRIP / Reinvested" ? `${fmt(r.gross)} → ${fmt(r.dripQty, { maximumFractionDigits: 4 })} @ ${fmt(r.price)}`
      : fmt(r.gross);
    return `<tr class="${rowReady(r) ? "" : (r.dup ? "row-dup" : "row-bad")}">
      <td class="num">${r.line}</td><td>${fmtDate(r.date)}</td><td>${esc(r.brokerName) || "—"}</td>
      <td>${esc(r.type) || "—"}</td><td>${esc(r.ticker) || "—"}</td><td class="num">${amt}</td><td>${esc(ccyLabel(r.currency))}</td>
      <td>${statusCell(r)}</td></tr>`;
  }).join("");
  const chip = (n, cls, lbl) => n ? ` · <span class="${cls}">${n} ${lbl}</span>` : "";
  return `<div class="import-preview">
    <div class="import-summary"><strong>${rows.length}</strong> ${t("rows")} · <span class="pos">${okCount} ${t("ready")}</span>${chip(dupCount, "muted", t("duplicate"))}${chip(brokerCount, "warn-txt", t("need broker"))}${chip(errCount, "neg", t("with errors"))}</div>
    ${unknown.length ? `<p class="muted" style="font-size:12.5px;margin:0 0 10px">${t("Missing brokers")}: ${unknown.map((u) => `<strong>${esc(u.name)}</strong>`).join(", ")}.
      <button class="btn small" id="createBrokers" style="margin-left:6px">${t("Create")} ${unknown.length} ${t("broker(s)")}</button></p>` : ""}
    <div class="table-wrap"><table class="data-table"><thead><tr>
      <th>#</th><th>${t("Date")}</th><th>${t("Broker")}</th><th>${t("Type")}</th><th>${t("Ticker")}</th><th class="num">${t("Amount")}</th><th>${t("Ccy")}</th><th>${t("Status")}</th>
    </tr></thead><tbody>${body}</tbody></table></div>
    <div class="form-actions" style="margin-top:12px">
      <button class="btn primary" id="commitImport" ${okCount ? "" : "disabled"}>${t("Import valid rows")} (${okCount})</button>
      <button class="btn ghost" id="cancelImport">${t("Cancel")}</button>
    </div>
    ${dupCount ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${t("Duplicates already in your ledger are skipped automatically.")}</p>` : ""}
    ${errCount ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${t("Rows with errors are skipped. Fix them in your spreadsheet and re-upload.")}</p>` : ""}
  </div>`;
}

function refreshImportPreview() {
  const host = $("#csvPreview");
  if (!host) return;
  host.innerHTML = importPreviewHTML();
  mountImportPreview();
}

function mountImportPreview() {
  const commit = $("#commitImport"); const cancel = $("#cancelImport"); const mk = $("#createBrokers");
  if (commit) commit.addEventListener("click", commitImport);
  if (cancel) cancel.addEventListener("click", () => { pendingImport = null; refreshImportPreview(); });
  if (mk) mk.addEventListener("click", createMissingBrokers);
}

/* Create the brokers a CSV references but that don't exist yet, then re-validate. */
function createMissingBrokers() {
  if (!pendingImport || !pendingImport.unknownBrokers.length) return;
  const made = pendingImport.unknownBrokers.length;
  pendingImport.unknownBrokers.forEach((u) => {
    BROKERS.push({ id: uid("b"), name: u.name, country: "", currency: u.currency || FX.base });
  });
  saveStore();
  const res = importTxFromCSV(pendingImport.text);
  pendingImport = { rows: res.rows, text: pendingImport.text, unknownBrokers: res.unknownBrokers };
  refreshImportPreview();
  toast(`${made} ${t("broker(s) created")}`);
}

function commitImport() {
  if (!pendingImport) return;
  const good = pendingImport.rows.filter(rowReady);
  if (!good.length) { toast(t("No valid rows to import.")); return; }
  good.forEach((r) => {
    if (r.type === "DRIP / Reinvested") {
      // Same two-record model as the Add form: a Dividend (cash suppressed) + the Buy it funds.
      const net = (r.gross || 0) - (r.tax || 0);
      const dripQty = r.price > 0 ? net / r.price : 0;
      const pairId = uid("drip");
      ALL_TRANSACTIONS.unshift(
        { id: uid("t"), date: r.date, brokerId: r.brokerId, type: "Dividend",
          ticker: r.ticker || "—", currency: r.currency, qty: null, price: null,
          gross: r.gross, fee: 0, tax: r.tax, fxRate: r.fxRate, myrEquivalent: r.gross * r.fxRate,
          status: "Received", paidTo: "reinvested", exDate: r.exDate || undefined, payDate: r.payDate || r.date,
          notes: r.notes || undefined, imported: true, dripPairId: pairId },
        { id: uid("t"), date: r.date, brokerId: r.brokerId, type: "Buy",
          ticker: r.ticker || "—", currency: r.currency, qty: dripQty, price: r.price,
          gross: dripQty * r.price, fee: 0, tax: 0, fxRate: r.fxRate, myrEquivalent: dripQty * r.price * r.fxRate,
          notes: r.notes || undefined, imported: true, dripPairId: pairId, drip: true }
      );
      return;
    }
    const rec = {
      id: uid("t"), date: r.date, brokerId: r.brokerId, type: r.type,
      ticker: r.ticker || "—", currency: r.currency, qty: r.qty, price: r.price,
      gross: r.gross, fee: r.fee, tax: r.tax, fxRate: r.fxRate, myrEquivalent: r.gross * r.fxRate,
      notes: r.notes || undefined, imported: true,
    };
    if (r.type === "Dividend") {
      rec.status = /expected/i.test(r.status) ? "Expected" : "Received";
      rec.payDate = r.payDate || r.date;
      rec.exDate = r.exDate || undefined;
    } else if (r.type === "Currency Exchange") {
      rec.fromCurrency = r.currency; rec.toCurrency = r.toCurrency;
      rec.fromAmount = r.gross; rec.toAmount = r.toAmount;
      rec.exchangeRate = r.gross ? r.toAmount / r.gross : 0;
    } else if (r.type === "Transfer between brokers") {
      rec.toBrokerId = r.toBrokerId;
    }
    ALL_TRANSACTIONS.unshift(rec);
  });
  const n = good.length;
  pendingImport = null;
  saveStore(); toast(`${n} ${t("transactions imported")}`); render();
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
 * "MORE" SHEET — secondary navigation (Records, Brokers, Settings, Help)
 * ========================================================================== */
function closeMoreSheet() { const s = $("#moreSheet"); if (s) s.hidden = true; }
function toggleMoreSheet() { const s = $("#moreSheet"); if (s) s.hidden = !s.hidden; }

/* =============================================================================
 * ROUTER
 * ========================================================================== */
const PAGES = {
  dashboard: pageDashboard, portfolio: pagePortfolio, records: pageRecords, add: pageAdd,
  dividends: pageDividends,
  brokers: pageBrokers, settings: pageSettings, help: pageHelp, holding: pageHolding,
};

function currentPageKey() {
  let key = (location.hash || "#/dashboard").replace(/^#\/?/, "").split("/")[0] || "dashboard";
  if (key === "transactions" || key === "cash") key = "records";  // merged ledger
  if (key === "more") key = "dashboard";
  return PAGES[key] ? key : "dashboard";
}

function render() {
  const key = currentPageKey();
  if (key !== "add") { editingTxId = null; addDraft = {}; closeAddDrawer(); }  // drop edit mode + draft + drawer when leaving Add
  if (key !== "brokers") closeBrokerDrawer();  // drop the broker drawer when leaving Brokers
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

  // active nav state — sidebar items highlight directly; mobile "More" highlights on secondary pages.
  // The add drawer renders over Transactions (key "add" → route #/records), so with it open
  // both the Transactions item and the mobile quick-add "+" read as active.
  const secondary = ["records", "brokers", "settings", "help"];
  $$("[data-page]").forEach((el) => {
    const p = el.dataset.page;
    el.classList.toggle("active", p === key || (key === "add" && (p === "records" || p === "add")));
  });
  const mb = $("#moreBtn"); if (mb) mb.classList.toggle("active", secondary.includes(key));
  closeMoreSheet();
}

/* =============================================================================
 * INIT / WIRING
 * ========================================================================== */
function updateLangBtn() {
  // Clearly labelled language selector: active language emphasised.
  const el = $("#langBtn");
  el.innerHTML = LANG === "en" ? `<b>EN</b> / 中文` : `EN / <b>中文</b>`;
  el.setAttribute("aria-label", LANG === "en" ? "Language: English. Switch to Chinese" : "语言：中文。切换为英文");
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
  $("#modalClose").addEventListener("click", closeModal);
  const saveErrDismiss = $("#saveErrorDismiss");
  if (saveErrDismiss) saveErrDismiss.addEventListener("click", hideSaveError);
  const staleReload = $("#staleDataReload");
  if (staleReload) staleReload.addEventListener("click", () => location.reload());
  const staleDismiss = $("#staleDataDismiss");
  if (staleDismiss) staleDismiss.addEventListener("click", hideStaleDataWarning);
  window.addEventListener("storage", (e) => { if (e.key === STORE_KEY) showStaleDataWarning(); });
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  // Add/edit drawer: close button + backdrop click navigate to Records (which re-renders
  // without the drawer), so the URL always reflects whether the drawer is open.
  const addDrawerClose = $("#addDrawerClose");
  if (addDrawerClose) addDrawerClose.addEventListener("click", () => { location.hash = "#/records"; });
  const addDrawerEl = $("#addDrawer");
  if (addDrawerEl) addDrawerEl.addEventListener("click", (e) => { if (e.target.id === "addDrawer") location.hash = "#/records"; });
  // Broker drawer: no route change involved (Add/Edit Broker always lived on #/brokers),
  // so close/backdrop just hide it directly instead of navigating.
  const brokerDrawerClose = $("#brokerDrawerClose");
  if (brokerDrawerClose) brokerDrawerClose.addEventListener("click", () => closeBrokerDrawer());
  const brokerDrawerEl = $("#brokerDrawer");
  if (brokerDrawerEl) brokerDrawerEl.addEventListener("click", (e) => { if (e.target.id === "brokerDrawer") closeBrokerDrawer(); });
  // Close the "Other" type dropdown when clicking anywhere outside it (bound once; queries
  // live so it works across drawer re-renders).
  document.addEventListener("click", (e) => {
    const menu = document.querySelector(".type-other-menu");
    if (!menu || menu.hidden) return;
    if (e.target.closest(".type-other")) return;   // click on the trigger or inside the menu
    menu.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // An open broker/currency dropdown inside the drawer takes priority — let its own
    // Escape handler (initStyledSelects) close just the dropdown, don't nuke the whole
    // in-progress form. Only close the drawer when nothing smaller is open.
    if (document.querySelector(".sel.open")) return;
    const dr = $("#addDrawer");
    if (dr && !dr.hidden) { location.hash = "#/records"; return; }
    const bdr = $("#brokerDrawer");
    if (bdr && !bdr.hidden) { closeBrokerDrawer(); return; }
    closeModal(); closeMoreSheet();
  });
  // "More" overlay — mobile bottom-nav only (desktop shows the items in the sidebar)
  $("#moreBtn").addEventListener("click", (e) => { e.preventDefault(); toggleMoreSheet(); });
  $("#moreClose").addEventListener("click", closeMoreSheet);
  $("#moreSheet").addEventListener("click", (e) => { if (e.target.id === "moreSheet") closeMoreSheet(); });
  $$("#moreSheet .more-item").forEach((a) => a.addEventListener("click", closeMoreSheet));
  initStyledSelects();   // delegated wiring for the custom dropdowns
  mountColInfoTaps();     // tap-to-reveal fallback for hover-only .col-info tooltips (touch has no :hover)

  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/dashboard";
  render();

  if (typeof initSync === "function") initSync();   // fire-and-forget, never blocks first paint
}
document.addEventListener("DOMContentLoaded", init);
