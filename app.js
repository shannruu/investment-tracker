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
  "Cash Ledger": "现金账本", "Dividends": "股息", "Reports": "报表",
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
  "Dividend Income by Year": "按年度股息收入", "Fees Paid by Broker": "按券商支付的费用",
  "Currency Gain / Loss": "汇率盈亏", "Export": "导出", "Add Broker": "添加券商",
  "Profile": "个人资料", "Appearance": "外观", "Base Currency": "基准货币",
  "Exchange Rates": "汇率", "Data Import / Export": "数据导入 / 导出", "Danger Zone": "危险操作",
  // Table headers
  "Holding": "持仓", "Broker": "券商", "Bank": "银行", "Market": "市场", "Shares": "股数",
  "Avg Cost": "平均成本", "Price": "价格", "Cost Basis": "成本", "Market Value": "市值",
  "Unrealized P/L": "未实现盈亏", "Net Div": "净股息", "Ticker": "代码", "Stock code": "股票代号",
  "Ex-Date": "除息日", "Payment": "派息日", "Expected Net": "预计净额", "Status": "状态",
  "The ex-dividend date — buy before it to qualify for the payment. This is what market data sources report; they don't give a separate payment date.": "除息日——须在此日期之前买入才符合领取资格。这是市场数据来源提供的日期；它们并未另外提供派息日期。",
  "A rough estimate of Ex-Date + 14 days (when the money would actually land), since market data reports only the ex-date, not a real payment date. A manually entered payment date is shown exactly as you typed it.": "除息日 + 14 天的粗略估算（资金大约到账的日期），因为市场数据只提供除息日，而非真实的派息日期。手动输入的派息日期则完全按您输入的显示。",
  "Date": "日期", "Type": "类型", "Qty": "数量", "Gross": "总额", "Fee": "费用",
  "Tax": "税", "Net (RM)": "净额 (RM)", "Net": "净额", "Amount": "金额",
  "Currency": "货币", "FX Rate": "汇率", "In RM": "折合 RM",
  "Calculated Balance": "计算余额", "Actual Balance": "实际余额", "Difference": "差额",
  "Fees": "费用", "Country": "国家/地区", "Withholding Tax (RM)": "预扣税 (RM)",
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
  "Live rates as of": "实时汇率截至", "updated": "项已更新", "added": "已添加",
  "Couldn't reach the rate service — check your connection.": "无法连接汇率服务 — 请检查网络连接。",
  "Enter a 3-letter currency code.": "请输入 3 位货币代码。", "Enter a valid rate.": "请输入有效的汇率。",
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
  "Update": "更新", "Actual cash balance for": "实际现金余额：", "Note (optional)": "备注（可选）",
  "Reconciliation saved": "对账已保存", "Enter a valid number.": "请输入有效数字。",
  "Calculated from every recorded cash movement: deposits, withdrawals, buys, sells, dividends, fees, transfers and currency exchanges.": "计算值来自所有已记录的现金变动：存款、取款、买入、卖出、股息、费用、转账与货币兑换。",
  "Cash difference": "现金差异", "Calculated": "计算值", "vs actual": "对比实际", "difference": "差额",
  "Check for a missing fee, dividend or transfer.": "请检查是否漏记费用、股息或转账。",
  "A sell exceeds shares held for": "卖出超过持有股数：", "Use the oversell override if intentional.": "如有意为之，请使用超卖覆盖。",
  "holding(s) have no current price set — portfolio value uses cost as a placeholder.": "个持仓未设当前价格 — 组合价值暂用成本代替。",
  "Exchange rates were last updated": "汇率最后更新于", "days ago — refresh them in Settings.": "天前 — 请在设置中刷新。",
  "days": "天", "overdue": "已过期",
  // Settings — data safety
  "Tolerance": "容差", "Differences within this amount are treated as a small difference rather than needing review.": "此金额内的差异视为小幅差异，而非需复核。",
  "Tolerance saved": "容差已保存",
  "Your investment data is stored only in this browser on this device. Clearing browser data may remove it. Export a JSON backup regularly.": "您的投资数据仅保存在本设备的此浏览器中。清除浏览器数据可能会将其删除。请定期导出 JSON 备份。",
  "Export full backup (JSON)": "导出完整备份 (JSON)", "Import backup (JSON)": "导入备份 (JSON)",
  "Export Transactions CSV": "导出交易 CSV", "Export Cash CSV": "导出现金 CSV",
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
  // Guided tour
  "Welcome to Investment Ledger": "欢迎使用 Investment Ledger",
  "Take a 1-minute guided tour — we'll point to exactly where to click.": "用 1 分钟跟随引导教程 — 我们会指向您需要点击的确切位置。",
  "Start the guided tour": "开始引导教程", "steps done": "步已完成",
  "Skip": "跳过", "Back": "上一步", "Next": "下一步", "Done": "完成",
  "Tour complete — you're ready to go.": "教程完成 — 一切就绪。",
  "Step 1 · Add a broker": "第 1 步 · 添加券商",
  "Start here. Click Brokers to add your investment app — every transaction belongs to a broker.": "从这里开始。点击「券商」添加您的投资平台 — 每笔交易都归属于某个券商。",
  "Add your broker": "添加券商", "Enter the broker name and currency, then click Add Broker.": "输入券商名称和货币，然后点击「添加券商」。",
  "Step 2 · Record a deposit": "第 2 步 · 记录存款",
  "Use Add Transaction to record cash you put into a broker. Pick type Deposit.": "用「添加交易」记录您投入券商的现金，类型选择「存款」。",
  "Pick the transaction type": "选择交易类型",
  "Choose the type here. Buy and Sell create and update your holdings automatically.": "在此选择类型。买入和卖出会自动创建并更新您的持仓。",
  "Step 3 · Set a current price": "第 3 步 · 设置当前价格",
  "After a Buy your holding appears here. Use the ＄ button to type a current price (manual, not live).": "买入后，您的持仓会显示在这里。用 ＄ 按钮输入当前价格（手动，非实时）。",
  "Back up your data": "备份您的数据",
  "Your data lives only in this browser. Export a JSON backup from Settings regularly.": "您的数据仅存于此浏览器中。请定期在「设置」中导出 JSON 备份。",
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
  "Edit Transaction": "编辑交易", "Cancel edit": "取消编辑", "Edit": "编辑",
  "Update Transaction": "更新交易", "Transaction updated": "交易已更新",
  "From amount": "兑出金额", "Exchange rate (To ÷ From)": "汇率（兑入 ÷ 兑出）",
  "To currency": "兑入货币", "To amount": "兑入金额",
  "Enter a ticker.": "请输入股票代码。", "Enter a quantity greater than 0.": "请输入大于 0 的数量。",
  "Enter a price greater than 0.": "请输入大于 0 的价格。", "Enter a gross dividend greater than 0.": "请输入大于 0 的总股息。",
  "Enter a split ratio greater than 0.": "请输入大于 0 的拆股比例。", "Enter an amount greater than 0.": "请输入大于 0 的金额。",
  "Choose a different destination broker.": "请选择不同的目标券商。", "Enter an amount to convert.": "请输入要兑换的金额。",
  "Enter an exchange rate.": "请输入汇率。", "Choose a different destination currency.": "请选择不同的目标货币。",
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
  "No brokers yet. Add your first one below.": "暂无券商。在下方添加第一个。",
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
  // Phase 2 — Reports (F3)
  "Holdings": "持仓", "Cash Flow": "现金流", "Performance": "业绩表现",
  "Lifetime Net Dividends": "累计净股息", "Realized Return": "已实现收益",
  "Unrealized Return": "未实现收益", "Total Return": "总收益",
  "Total Deposits": "存款总额", "Total Withdrawals": "取款总额", "Net Cash Added": "净投入现金",
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
  "Average Cost": "平均成本法", "FIFO — not yet implemented": "先进先出 — 尚未实现",
  "FIFO is not implemented yet.": "先进先出法尚未实现。",
  "Time zone is used as a display reference for dates; stored dates are never altered.": "时区仅用作日期的显示参考；存储的日期不会被更改。",
  "Average Cost is the active method for all gain/loss figures. FIFO is planned and currently disabled.": "所有盈亏数字均采用平均成本法。先进先出法在计划中，目前已禁用。",
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
  "Profit / Loss by Broker": "按券商盈亏", "Fees Paid by Broker": "按券商已付费用",
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
  "Portfolio, dividend, cash-flow, performance": "投资组合、股息、现金流、业绩",
  "Accounts & reconciliation": "账户与对账",
  "Currency, preferences, import & backup": "货币、偏好、导入与备份",
  "Guides & FAQ": "指南与常见问题",
  "All": "全部", "Buy / Sell": "买入 / 卖出", "Cash": "现金", "FX": "外汇",
  "records": "条记录", "Amount (RM)": "金额（RM）",
  "No records in this view yet.": "此视图暂无记录。",
  "No transactions yet. Tap ＋ Add to record your first deposit or investment.": "暂无交易。点击 ＋ 添加，记录您的第一笔存款或投资。",
  "fee": "费用", "Available Cash": "可用现金", "Can invest or withdraw": "可用于投资或提取",
  "What do you want to record?": "您想记录什么？", "Other": "其他",
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
  "added at the live rate": "已按实时汇率添加", "added — set its rate in Settings": "已添加 — 请在设置中设定其汇率",
  "Buys (incl. fees & tax)": "买入（含费用与税）", "Sells (net of fees)": "卖出（扣除费用）",
  "Net dividends received": "已收净股息", "Standalone fees": "独立费用",
  "FX revaluation of foreign cash": "外币现金的汇率重估",
  "Holdings": "持仓", "Principal Invested": "已投入本金", "Dividends YTD": "今年至今股息",
  "By market value": "按市值", "Calendar": "日历", "View all": "查看全部", "Recent Activity": "近期活动",
  "View the full holdings table": "查看完整持仓表",
  "Top Holdings": "主要持仓", "Asset Allocation": "资产配置", "Upcoming Dividends": "即将派发股息",
  // Tour (updated steps)
  "Open More to reach Brokers — add your investment app first. Every transaction belongs to a broker.": "打开「更多」进入券商 — 请先添加您的投资平台。每笔交易都属于某个券商。",
  "Tap Add to record cash you put into a broker. Pick type Deposit.": "点击「添加」记录您投入券商的现金，类型选择「存款」。",
  "Choose a type first — then only the fields that type needs appear. Buy and Sell create and update your holdings automatically.": "先选择类型 — 然后只显示该类型所需的字段。买入和卖出会自动创建并更新您的持仓。",
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

function daysUntil(iso) {
  if (!iso) return NaN;
  const today = todayDate(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
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
        addCash(tx.brokerId, ccy, -(gross + fee + taxv)); break;
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
          if (tx.paidTo !== "bank") addCash(tx.brokerId, ccy, net);
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
    CURRENT_PRICES, STOCK_META, RECON_CHECKS, SETTINGS, USER, FX, PV_HISTORY };
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
  replaceArr(BROKERS, s.BROKERS); replaceArr(HOLDINGS, s.HOLDINGS);
  replaceArr(ALL_TRANSACTIONS, s.ALL_TRANSACTIONS); replaceArr(UPCOMING_DIVIDENDS, s.UPCOMING_DIVIDENDS);
  if (s.PV_HISTORY) replaceArr(PV_HISTORY, s.PV_HISTORY.filter((p) => p.value > 0));
  assignObj(CURRENT_PRICES, s.CURRENT_PRICES); assignObj(RECON_CHECKS, s.RECON_CHECKS);
  assignObj(STOCK_META, s.STOCK_META);
  if (s.SETTINGS) safeAssign(SETTINGS, s.SETTINGS);
  if (s.USER) safeAssign(USER, s.USER);
  if (s.lastSaved) LAST_SAVED = s.lastSaved;
  if (s.FX) {
    if (s.FX.base) FX.base = s.FX.base;
    if (s.FX.rates) { Object.keys(FX.rates).forEach((k) => delete FX.rates[k]); safeAssign(FX.rates, s.FX.rates); }
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
    const broker = BROKERS.find((x) => x.id === h.brokerId);
    const mostRecentAtBroker = brokerDivs.slice().sort((a, b) => ((b.payDate || b.date || "") < (a.payDate || a.date || "") ? -1 : 1))[0];
    const inferredPaidTo = (broker && broker.divPaidTo) || (mostRecentAtBroker ? (mostRecentAtBroker.paidTo || "broker") : "broker");
    marketHist.forEach((d) => {
      if (d.date < earliestTxDate || d.date > today) return;   // before you held it, or hasn't happened yet
      const dTime = new Date(d.date + "T00:00:00").getTime();
      if (loggedDates.some((t) => Math.abs(t - dTime) <= 10 * 86400000)) return;   // already logged
      const fxRate = FX.rates[d.currency] || 1;
      const gross = (d.amount || 0) * h.shares;
      const tax = gross * ((broker && broker.divTaxRate ? broker.divTaxRate : 0) / 100);
      ALL_TRANSACTIONS.unshift({
        id: uid("t"), date: d.date, brokerId: h.brokerId, type: "Dividend",
        ticker: h.ticker, company: h.company || "", market: h.market || "",
        currency: d.currency, gross, tax, fxRate, myrEquivalent: gross * fxRate,
        status: "Received", paidTo: inferredPaidTo, exDate: d.date, payDate: d.date,
        notes: t("Auto-logged from market dividend history — review the tax withheld and \"Paid to\"."),
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

function table(headers, rows) {
  const thead = `<thead><tr>${headers.map((h) =>
    `<th class="${h.num ? "num" : ""}"${h.style ? ` style="${h.style}"` : ""}>${h.label}</th>`).join("")}</tr></thead>`;
  // Show a friendly placeholder row when there are no records yet.
  const body = (rows && rows.trim())
    ? rows
    : `<tr><td colspan="${headers.length}" class="empty" style="padding:28px 12px">${t("Nothing to show yet.")}</td></tr>`;
  return `<div class="table-wrap"><table class="data-table">${thead}<tbody>${body}</tbody></table></div>`;
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
  if (!slices.length) return emptyState(t("No holdings yet. Add a buy transaction to create your first holding."));
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
 * SHARED ANALYTICS — allocation, portfolio health (reused by Reports & Dashboard)
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
/* Donut + percentage table for one allocation breakdown. */
function allocationPanel(title, rows, total) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (!sorted.length) return panel(title, emptyState(t("No priced holdings yet.")));
  const tableRows = sorted.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${money(r.value)}</td>
    <td class="num">${total ? fmt((r.value / total) * 100, { maximumFractionDigits: 1 }) : "0"}%</td></tr>`).join("");
  return panel(title, `${donutHTML(sorted.map((r) => ({ label: r.label, value: r.value })), title.replace(/^.* /, ""), "")}
    ${table([{label:"Group"},{label:"Value",num:1},{label:"%",num:1}], tableRows)}`);
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
  return panel("Portfolio Health", `<div class="ph-row">
    ${stat("phDivYield", t("Dividend Yield (TTM)"), hp.yieldEst != null ? fmt(hp.yieldEst, { maximumFractionDigits: 2 }) + "%" : "—")}
    ${stat("phCashAlloc", t("Cash Allocation"), hp.cashAlloc != null ? fmt(hp.cashAlloc, { maximumFractionDigits: 1 }) + "%" : "—", t("of total net value"))}
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
let dashAllocMode = "currency"; // "currency" | "stock"
let dashChartMode = (() => { try { return localStorage.getItem("il-chart-mode") || "mv"; } catch(e) { return "mv"; } })(); // "mv" | "div"

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
  const shownReturn = returnIsTotal ? T.totalReturn : T.priceReturn;
  const shownPct = T.netCapitalInvested ? (shownReturn / T.netCapitalInvested) * 100 : 0;
  const up = shownReturn > 0;
  const dn = shownReturn < 0;
  const yr = todayISO().slice(0, 4);
  const divYTD = ALL_TRANSACTIONS
    .filter((x) => x.type === "Dividend" && x.status !== "Expected" && (x.payDate || x.date || "").slice(0, 4) === yr)
    .reduce((s, d) => s + divNetMYR(d), 0);

  // Cash flow components in MYR (at each transaction's FX) — for the "Available Cash" breakdown.
  const txFx = (x) => (x.fxRate || FX.rates[x.currency] || 1);
  const flowSum = (pred, amt) => ALL_TRANSACTIONS.filter(pred).reduce((s, x) => s + amt(x) * txFx(x), 0);
  const cashFlow = {
    deposits: flowSum((x) => x.type === "Deposit", (x) => +x.gross || 0),
    withdrawals: flowSum((x) => x.type === "Withdrawal", (x) => +x.gross || 0),
    buys: flowSum((x) => x.type === "Buy", (x) => (+x.gross || 0) + (+x.fee || 0) + (+x.tax || 0)),
    sells: flowSum((x) => x.type === "Sell", (x) => (+x.gross || 0) - (+x.fee || 0) - (+x.tax || 0)),
    divs: flowSum((x) => x.type === "Dividend" && x.status !== "Expected", (x) => (+x.gross || 0) - (+x.tax || 0)),
    interest: flowSum((x) => x.type === "Interest / cash yield" || x.type === "Interest", (x) => +x.gross || 0),
    fees: flowSum((x) => x.type === "Fee", (x) => +x.gross || 0),
    taxes: flowSum((x) => x.type === "Tax withholding", (x) => +x.gross || 0),
  };

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
      <td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? signed(h.unrealized) : `<span class="muted">—</span>`}${h.hasPrice ? `<div class="fx-note ${cls(h.unrealized)}">${pctTxt(h.unrealizedPct)}</div>` : ""}</td>
      <td class="dcc-c ${cls(h.totalReturn)}">${signed(h.totalReturn)}${h.costBasis > 0 ? `<div class="fx-note ${cls(h.totalReturn)}">${pctTxt((h.totalReturn / h.costBasis) * 100)}</div>` : ""}</td></tr>`).join("");

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
  const divRows = dashUpcoming.map((d) => {
    const du = daysUntil(d.payDate);
    const dlabel = d.payDate ? (du >= 0 ? `${du} ${t("days")}` : t("overdue")) : "—";
    return `<tr><td class="ticker">${esc(d.ticker)}</td><td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td>
      <td class="num">${dlabel}</td>
      <td class="num">${money(d.amtMYR)}</td><td>${dashSourceBadge(d.source || "manual")}</td></tr>`;
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
    pl: { title: returnIsTotal ? "Total Return" : "Unrealized P/L", rows: [
      { op: "+", label: "Unrealized P/L", val: signed(T.unrealizedPL) },
      { op: "+", label: "Realized P/L", val: signed(T.realizedPL) },
      ...(returnIsTotal ? [{ op: "+", label: "Net Dividends", val: signed(T.netDividends) }] : []),
      ...(returnIsTotal && T.totalInterest ? [{ op: "+", label: "Interest Received", val: signed(T.totalInterest) }] : []),
      { op: "−", label: "Total Fees", val: fmt(T.totalFees) }], total: shownReturn },
    cash: (() => {
      const cf = cashFlow;
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
    })(),
    principal: { title: "Principal Invested", rows: [
      { op: "+", label: "Total Deposits", val: fmt(T.totalDeposits) },
      { op: "−", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) }], total: T.netCapitalInvested },
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
      <div class="stat-value ${up ? "pos" : dn ? "neg" : ""}">${up ? "▲ " : dn ? "▼ " : ""}${signed(shownReturn)}</div>
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
    has ? panel(title, body, extra) : panel(title, `<p class="empty-line muted">${emptyMsg}</p>`);

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
          : emptyState(t("Record your first deposit or Buy to start tracking."));
        return panel("Investment Return Over Time", chartBody, chartHeadExtra);
      })()}
      ${(() => {
        const allocToggle = `<div class="seg seg-sm" id="dashAllocSeg"><button class="seg-btn ${dashAllocMode === "currency" ? "on" : ""}" data-alloc="currency">${t("By currency")}</button><button class="seg-btn ${dashAllocMode === "stock" ? "on" : ""}" data-alloc="stock">${t("By stock")}</button></div>`;
        const totalStr = money(T.portfolioValue).replace(".00","");
        const ccySlices = groupSum(T.holdings, (h) => h.currency || "Other", (h) => h.marketValue).filter((s) => s.value > 0);
        const donut = dashAllocMode === "stock"
          ? donutHTML(T.holdings.map((h) => ({ label: h.ticker, value: h.marketValue })), t("Portfolio"), totalStr, T.holdings.map((h) => ccyColor(h.currency || "Other")))
          : donutHTML(ccySlices, t("Portfolio"), totalStr, ccySlices.map((s) => ccyColor(s.label)));
        return panel("Asset Allocation", `<div id="dashAllocBody" class="panel-body">${donut}</div>`, allocToggle);
      })()}
    </section>
    <div id="dashDivSection">${listPanel("Upcoming Dividends", dashUpcoming.length,
      table([{label:"Ticker"},{label:"Ex-Date"},{label:"Payment"},{label:"Days"},{label:"Expected Net (RM)",num:1},{label:"Status"}], divRows),
      t("No upcoming dividends."), `<a class="link" href="#/dividends">${t("Calendar")} →</a>`)}</div>
    ${listPanel("Holdings", T.holdings.length,
      table([{label:"Holding",style:"width:28%"},{label:"Shares",style:"width:15%"},{label:"Market Value",style:"width:19%"},{label:"Unrealized P/L",style:"width:19%"},{label:"Total Return",style:"width:19%"}], holdingsRows),
      t("No holdings yet — add a Buy to get started."), `<div style="margin-left:auto;display:flex;align-items:center;gap:12px">${pricesAsOf ? metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${pricesAsOfFmt}`) : ""}<a class="link" style="margin-left:0" href="#/portfolio">${t("View all")} →</a></div>`)}
    ${insightsHTML()}
    ${listPanel("Recent Activity", ALL_TRANSACTIONS.length,
      table([{label:"Date",style:"width:20%"},{label:"Type",style:"width:20%"},{label:"Ticker",style:"width:20%"},{label:"Broker",style:"width:20%"},{label:"Amount",style:"width:20%"}], recentRows),
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
          const totalStr = money(T.portfolioValue).replace(".00","");
          const ccySlices = groupSum(T.holdings, (h) => h.currency || "Other", (h) => h.marketValue).filter((s) => s.value > 0);
          const newDonut = dashAllocMode === "stock"
            ? donutHTML(T.holdings.map((h) => ({ label: h.ticker, value: h.marketValue })), t("Portfolio"), totalStr, T.holdings.map((h) => ccyColor(h.currency || "Other")))
            : donutHTML(ccySlices, t("Portfolio"), totalStr, ccySlices.map((s) => ccyColor(s.label)));
          allocBody.innerHTML = newDonut;
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
      const st = $("#startTour");
      if (st) st.addEventListener("click", () => startTour());
      // Auto-launch the tour once for brand-new users
      let tourDone = false;
      try { tourDone = localStorage.getItem("il-tour-done") === "1"; } catch (e) {}
      if (isEmpty && !tourDone && tourIdx < 0 && !TOUR_SEEN) {
        TOUR_SEEN = true; setTimeout(startTour, 500);
      }
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
    BROKERS.length > 0,
    ALL_TRANSACTIONS.some((x) => x.type === "Deposit"),
    ALL_TRANSACTIONS.some((x) => x.type === "Buy") || HOLDINGS.length > 0,
    Object.keys(CURRENT_PRICES).length > 0,
    ALL_TRANSACTIONS.some((x) => x.type === "Dividend"),
  ];
  const done = steps.filter(Boolean).length;
  return panel("Welcome to Investment Ledger", `
    <p class="muted" style="margin:-2px 0 14px">${t("Take a 1-minute guided tour — we'll point to exactly where to click.")}</p>
    <p class="info-card" style="margin:0 0 14px"><span class="w-ico">💻</span><span class="w-body">${t("Your data stays on this device and this browser only — nothing is shared or synced. If you're trying this out from a shared link, your entries are private to you and won't affect anyone else's. Opening the app on a different device starts a separate, empty ledger there too.")}</span></p>
    <div class="form-actions">
      <button class="btn primary" id="startTour">▶ ${t("Start the guided tour")}</button>
      <span class="muted" style="align-self:center">${done} / ${steps.length} ${t("steps done")}</span>
    </div>`);
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
  if (!BROKERS.length) return `<p class="muted">${t("Add a broker first (More → Brokers), then you can import holdings.")}</p>`;
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
    HOLDINGS.push({
      ticker, company: (d.company || "").trim(),
      brokerId: d.brokerId, market: (d.market || "").trim(), currency: d.currency,
      shares: parseFloat(d.shares) || 0, avgCost: parseFloat(d.avgCost) || 0,
      openingFxRate: d.openingFxRate ? parseFloat(d.openingFxRate) : null,
      asOfDate: d.asOfDate || todayISO(), netDividends: 0,
    });
    const cp = parseFloat(d.currentPrice);
    if (cp > 0) CURRENT_PRICES[ticker] = { price: cp, currency: d.currency, date: todayISO(), source: "manual" };
    saveStore(); toast(t("Opening holding added")); render();
  });
}

/* =============================================================================
 * PAGE: PORTFOLIO  (with working filters + grouped allocations)
 * ========================================================================== */
const portfolioFilters = { broker: "", market: "", currency: "", sort: "" };
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

  const distinctBrokers = new Set(T.holdings.map((h) => h.brokerId)).size;
  const breakdowns = distinctBrokers >= 2
    ? panel("Holdings by Broker", donutHTML(groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.marketValue), "", ""))
    : "";

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
  const html = has
    ? `<div id="pfSummary">${portfolioSummaryHTML()}</div>
       ${panel("All Holdings", filterBar + `<div id="holdingsBody">${portfolioTable()}</div>`,
          `<div class="panel-head-actions">${priceStampHtml}${refreshBtn}</div>`)}
       ${breakdowns ? `<section class="portfolio-breakdowns">${breakdowns}</section>` : ""}`
    : panel("Holdings", emptyContent);

  return { title: "Portfolio", subtitle: LANG === "zh"
      ? `${T.holdings.length} 个持仓，${BROKERS.length} 个券商 · ${money(T.portfolioValue)}`
      : `${plural(T.holdings.length, "holding", "holdings")} across ${plural(BROKERS.length, "broker", "brokers")} · ${money(T.portfolioValue)}`, html,
    mount() {
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
    <div class="mini-card"><div class="mc-label">${t("Unrealized P/L")}</div><div class="mc-value ${cls(unrealized)}">${signed(unrealized)}</div><div class="mc-sub ${cls(unrealizedPct)}">${pctTxt(unrealizedPct)}</div></div>
    <div class="mini-card"><div class="mc-label">${t("Total Return")}</div><div class="mc-value ${cls(totalReturn)}">${signed(totalReturn)}</div><div class="mc-sub ${cls(totalReturnPct)}">${pctTxt(totalReturnPct)}</div></div>
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
    unrealizedAmt: t("Unrealized P/L"), unrealizedPct: "P/L %",
    totalReturnAmt: t("Total Return"), totalReturnPct: "Return %",
    marketValue: t("Market Value"), netDiv: t("Net Dividends"),
  };

  // Equal-width, left-aligned columns (same convention as the Dashboard/Holding Detail
  // tables) — computed dynamically since the column set here is user-configurable via
  // "Edit columns", so a fixed percentage split wouldn't fit every combination.
  const colPct = (100 / (orderedColIds.length + 1)).toFixed(2);
  const body = rows.map((h) => {
    const totalReturnPct = h.costBasis > 0 ? (h.totalReturn / h.costBasis) * 100 : 0;
    const cellMap = {
      broker:         `<td class="dcc-c"><div class="broker-pills">${(h._brokerNames || [brokerName(h.brokerId)]).map((n) => `<span class="chip chip-pill">${esc(n)}</span>`).join("")}</div></td>`,
      shares:         `<td class="dcc-c">${fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>`,
      avgCost:        `<td class="dcc-c">${money(h.avgCost)}</td>`,
      price:          `<td class="dcc-c">${h.hasPrice ? `${ccyLabel(h.currentPriceCcy)} ${fmt(h.currentPrice)}` : `<span class="muted">—</span>`}</td>`,
      priceMyr:       `<td class="dcc-c">${(h.hasPrice && h.currency !== FX.base) ? `${ccyLabel(FX.base)} ${fmt(h.currentPrice * (FX.rates[h.currency] || 1))}` : `<span class="muted">—</span>`}</td>`,
      unrealizedAmt:  `<td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? signed(h.unrealized) : `<span class="muted">—</span>`}</td>`,
      unrealizedPct:  `<td class="dcc-c ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? pctTxt(h.unrealizedPct) : `<span class="muted">—</span>`}</td>`,
      totalReturnAmt: `<td class="dcc-c ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td>`,
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
    return `<th style="width:${colPct}%;text-align:left" data-col-id="${id}">${colLabels[id] || id}${tip}</th>`;
  }).join("");
  const thead = `<thead><tr><th style="width:${colPct}%">${t("Holding")}</th>${thCols}</tr></thead>`;

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

function pageRecords() {
  const tabs = [["all", "All"], ["buysell", "Buy / Sell"], ["cash", "Cash"], ["dividends", "Dividends"], ["fx", "FX"]];
  // Same pill-tab-inside-the-panel layout as the Add page (type-selector + add-sep),
  // rather than a separate segmented control floating above its own panel.
  const nav = `<div class="type-selector"><div class="type-tabs" role="tablist">${tabs.map(([k, lbl]) =>
    `<button class="tp-tab ${recordsTab === k ? "on" : ""}" data-rectab="${k}">${t(lbl)}</button>`).join("")}</div></div>`;
  const list = ALL_TRANSACTIONS.filter((x) => recordMatchesTab(x, recordsTab));
  const addBtn = BROKERS.length ? `<a class="btn primary" href="#/add">＋ ${t("Add")}</a>` : "";
  const html = `<section class="panel add-panel">
      ${nav}
      <div class="add-sep"></div>
      <div class="panel-head"><h2>${t("Transactions")}</h2><div class="panel-head-actions"><span class="badge subtle">${list.length} ${t("records")}</span>${addBtn}</div></div>
      <div id="recBody">${recordsTable(list)}</div>
    </section>
    ${recordsTab === "cash" ? cashExtrasHTML() : ""}`;

  return { title: "Transactions", subtitle: "All your transactions, cash and dividends in one ledger.", html,
    mount() {
      $$("[data-rectab]").forEach((b) => b.addEventListener("click", () => { recordsTab = b.dataset.rectab; render(); }));
      $("#recBody").addEventListener("click", (e) => {
        const ed = e.target.closest("[data-edit-tx]");
        if (ed) { editingTxId = ed.dataset.editTx; location.hash = "#/add"; return; }
        const b = e.target.closest("[data-del-tx]");
        if (!b) return;
        const tx = ALL_TRANSACTIONS.find((x) => x.id === b.dataset.delTx);
        // Deleting a Buy that has later Sells of the same stock distorts realized P/L.
        const buyWithSells = tx && tx.type === "Buy" && ALL_TRANSACTIONS.some((x) =>
          x.type === "Sell" && x.brokerId === tx.brokerId && (x.ticker || "").toUpperCase() === (tx.ticker || "").toUpperCase());
        const msg = buyWithSells
          ? t("This Buy has later Sell transactions for the same stock. Deleting it will make those sells exceed shares held and distort realized P/L. Delete anyway?")
          : t("Delete this transaction? Holdings and balances will be recalculated.");
        if (!confirm(msg)) return;
        const i = ALL_TRANSACTIONS.findIndex((x) => x.id === b.dataset.delTx);
        if (i >= 0) ALL_TRANSACTIONS.splice(i, 1);
        if (editingTxId === b.dataset.delTx) editingTxId = null;
        pruneOrphans();
        saveStore(); toast(t("Transaction removed")); render();
      });
    } };
}

/* One unified ledger table: base-currency (MYR) amount, equal-width dcc-c columns
 * (same style as the Portfolio / Dividends tables). */
function recordsTable(list) {
  if (!ALL_TRANSACTIONS.length) return emptyState(t("No transactions yet. Tap ＋ Add to record your first deposit or investment."));
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
  ], rows);
}

/* =============================================================================
 * PAGE: ADD — pick a type first, then a focused form (only relevant fields)
 * ========================================================================== */
const ADD_SLUGS = { buy: "Buy", sell: "Sell", deposit: "Deposit", withdraw: "Withdrawal",
  dividend: "Dividend", fx: "Currency Exchange", fee: "Fee",
  interest: "Interest", split: "Stock split", transfer: "Transfer between brokers" };
const ADD_PRIMARY = [["buy", "Buy", "i-buy"], ["sell", "Sell", "i-sell"], ["deposit", "Deposit", "i-deposit"],
  ["withdraw", "Withdraw", "i-withdraw"], ["dividend", "Dividend", "i-dividends"], ["fx", "FX", "i-fx"]];
const ADD_OTHER = [["fee", "Fee"], ["interest", "Interest"],
  ["split", "Stock split"], ["transfer", "Transfer between brokers"]];

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

function closeAddDrawer() {
  const dr = $("#addDrawer");
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
    core = `
      <label style="grid-column:1/-1">${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label>${t("Quantity / Shares")}<input type="number" step="any" name="qty" value="${v(e.qty)}" placeholder="0"></label>
      <label class="amt-label">${t("Price / Share")}${amtCombo("price", v(e.price), "0.00")}</label>
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
      </select></label>
      <input type="hidden" name="company" value="${v(e.company)}">`;
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
  const needsTicker = isTrade || type === "Dividend" || type === "Stock split";
  const hasNote = !!(e.notes || draft.notes);

  return `<form id="txForm" class="form add-form" autocomplete="off">
    <input type="hidden" name="type" value="${type}">
    <div class="form-grid">${head}${core}</div>
    ${needsTicker ? `<div class="lookup-status muted" id="lookupStatus"></div>` : ""}
    ${extra ? `<details class="more-fields"><summary>${type === "Dividend" ? t("Dividend schedule") : t("Fees, taxes & details")}</summary><div class="form-grid">${extra}</div></details>` : ""}
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
    const lookOpts = { fillPrice: type === "Buy" || type === "Sell", showPrice: type !== "Dividend" };
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
    if (type === "Dividend") gross = parseFloat(d.divGross) || 0;
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

    if (type === "Buy" || type === "Sell") {
      if (!ticker) return void fieldErr("ticker", t("Enter a ticker."));
      if (!(qty > 0)) return void fieldErr("qty", t("Enter a quantity greater than 0."));
      if (!(price > 0)) return void fieldErr("price", t("Enter a price greater than 0."));
    } else if (type === "Dividend") {
      if (!ticker) return void fieldErr("ticker", t("Enter a ticker."));
      if (!(gross > 0)) return void fieldErr("divGross", t("Enter a gross dividend greater than 0."));
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

    const record = { id: editingTxId || uid("t"), date: d.date, brokerId: d.broker, type,
      ticker: ticker || "—", company: (d.company || "").trim(), market: (d.market || "").trim(),
      currency, qty, price, gross, fee, tax, fxRate, myrEquivalent: gross * fxRate,
      status: type === "Dividend" ? "Received" : undefined,
      paidTo: type === "Dividend" ? (d.paidTo || "broker") : undefined,
      exDate: d.exDate || undefined, payDate: d.payDate || undefined,
      toBrokerId: type === "Transfer between brokers" ? d.toBroker : undefined,
      override: !!d.override, notes: (d.notes || "").trim() || undefined, ...extra };

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

/* Cash-tab summary on Records: deposits/withdrawals/net/available mini-cards. */
function cashExtrasHTML() {
  return `<div class="mini-cards">
    ${miniCard(t("Total Deposits"), money(T.totalDeposits))}
    ${miniCard(t("Total Withdrawals"), money(T.totalWithdrawals))}
    ${miniCard(t("Net Cash Added"), money(T.netCapitalInvested), cls(T.netCapitalInvested))}
    ${miniCard(t("Available Cash"), money(T.totalCash || 0))}</div>`;
}

/* Broker-page extras: per-currency cash balances, reconciliation against actual balances. */
function brokerCashPanelsHTML() {
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
    return `<tr><td>${esc(b.name)}</td><td class="num">${money(calc)}</td>
      <td class="num">${hasActual ? money(+chk.actual) : "—"}${hasActual && chk.date ? `<div class="fx-note">${fmtDate(chk.date)}</div>` : ""}</td>
      <td class="num ${hasActual && Math.abs(diff) > (SETTINGS.reconTolerance || 0) ? "neg" : ""}">${hasActual ? signed(diff) : "—"}</td>
      <td><span class="badge ${scls}">${status}</span></td>
      <td class="num"><button class="btn ghost" data-recon-broker="${b.id}">${t("Update")}</button></td></tr>`;
  }).join("");

  const ccyRows = BROKERS.map((b) => {
    const byc = T.brokerCashByCcy[b.id] || {};
    return Object.keys(byc).filter((c) => Math.abs(byc[c]) > 0.005).map((c) =>
      `<tr><td>${esc(b.name)}</td><td>${esc(c)}</td><td class="num ${byc[c] < 0 ? "neg" : ""}">${fmt(byc[c])}</td><td class="num">${money(byc[c] * (FX.rates[c] || 1))}</td></tr>`).join("");
  }).join("");

  return `${panel("Cash Balances by Currency", table(
      [{label:"Broker"},{label:"Currency"},{label:"Balance",num:1},{label:"In RM",num:1}], ccyRows))}
    ${panel("Broker Cash Reconciliation", table(
      [{label:"Broker"},{label:"Calculated Balance",num:1},{label:"Actual Balance",num:1},{label:"Difference",num:1},{label:"Status"},{label:"",num:1}], recRows),
      `<span class="badge subtle">${t("Calculated from every recorded cash movement: deposits, withdrawals, buys, sells, dividends, fees, transfers and currency exchanges.")}</span>`)}`;
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
    : `<div class="div-fc-empty"><span>📅</span><div><strong>${t("Forecast needs more data")}</strong><p class="muted" style="margin:6px 0 0;font-size:13px">${t("Record at least 2 dividends for any holding to enable pattern-based estimates.")}</p>${fc.ttm > 0 ? `<p class="muted" style="margin:4px 0 0;font-size:13px">${t("TTM received")}: <strong>${money(fc.ttm)}</strong></p>` : ""}</div></div>
      <p class="muted" style="margin:10px 0 0;font-size:12px"><a class="link" href="#/help">${t("How is the forecast calculated?")}</a></p>`;

  const html = `
    <div class="mini-cards">
      ${miniCard("Gross Dividends", money(grossBase))}
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
              { label: "Per Share (RM)", style: "width:14%;text-align:left" },
              { label: "Amount (RM)", style: "width:14%;text-align:left" },
              { label: "Yield", style: "width:14%;text-align:left" },
              { label: "Status", style: "width:14%;text-align:left" },
              { label: "" },
            ], calendarRows)
          // Genuinely empty now only when there's no logged history AND no declared date
          // AND no detectable pattern anywhere in the portfolio.
          : `<p class="muted" style="margin:0;font-size:13px">${
              !LIVE_ENABLED
                ? t("No dividends yet. Record one, or they'll appear automatically once market data is connected.")
                : t("No dividends yet. Record one to get started.")
            }</p>`,
        `<div class="panel-head-actions"><div style="width:150px">${calendarFilterSel}</div><small class="muted" id="divFetchStatus"></small></div>`
      )}
    </div>

    ${panel("Dividend Income", table([
        { label: incomeLabels[divIncomePeriod] || t("Month"), style: "width:50%;text-align:left" },
        { label: "Net (RM)", style: "width:50%;text-align:left" },
      ], incomeRowsByPeriod[divIncomePeriod] || monthRows),
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
 * PAGE: REPORTS
 * ========================================================================== */
let reportTab = "portfolio";   // F3: portfolio | dividend | cashflow | performance

/* The full sortable/filterable/customizable holdings table already lives on
 * the Portfolio page (pagePortfolio → portfolioTable) — this report only adds
 * the allocation breakdowns that aren't shown anywhere else, rather than a
 * second, strictly weaker copy of the same holdings list. */
function reportPortfolio() {
  const a = allocationData();
  return `
    <h3 class="report-h">${t("Allocation")}</h3>
    <section class="grid-2">
      ${allocationPanel(t("By Country"), a.byCountry, a.total)}
      ${allocationPanel(t("By Sector"), a.bySector, a.total)}
    </section>
    <section class="grid-2">
      ${allocationPanel(t("By Currency"), a.byCurrency, a.total)}
      ${allocationPanel(t("By Brokerage"), a.byBroker, a.total)}
    </section>
    <p class="muted" style="font-size:12px;margin:10px 2px 0"><a class="link" href="#/portfolio">${t("View the full holdings table")} →</a></p>`;
}

function reportDividend() {
  const received = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status !== "Expected");
  const periods = dividendByPeriod(received);
  const lifetime = Object.values(periods.byYear).reduce((s, v) => s + v, 0);
  const rows = (obj) => Object.keys(obj).sort().reverse().map((k) => `<tr><td>${k}</td><td class="num pos">${money(obj[k])}</td></tr>`).join("");
  return `
    <div class="mini-cards">${miniCard(t("Lifetime Net Dividends"), money(lifetime), "pos")}${miniCard(t("Dividend Yield (TTM)"), (T.portfolioValue ? fmt(ttmDividends() / T.portfolioValue * 100, { maximumFractionDigits: 2 }) + "%" : "—"))}</div>
    <section class="grid-2">
      ${panel("Monthly", table([{label:"Month"},{label:"Net (RM)",num:1}], rows(periods.byMonth)))}
      ${panel("Quarterly", table([{label:"Quarter"},{label:"Net (RM)",num:1}], rows(periods.byQuarter)))}
    </section>
    ${panel("Annual", table([{label:"Year"},{label:"Net (RM)",num:1}], rows(periods.byYear)))}`;
}

function reportCashflow() {
  const types = { Deposit: [], Withdrawal: [], "Currency Exchange": [] };
  ALL_TRANSACTIONS.forEach((x) => { if (types[x.type]) types[x.type].push(x); });
  const sum = (arr) => arr.reduce((s, x) => s + (+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1), 0);
  const rows = (arr) => arr.sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="sub">${esc(brokerName(x.brokerId))}</td>
    <td class="num">${esc(ccyLabel(x.currency))} ${fmt(x.gross)}</td><td class="num">${money((+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1))}</td>
    ${x.type === "Currency Exchange" ? `<td class="sub">→ ${esc(ccyLabel(x.toCurrency))} ${fmt(x.toAmount)}${x.fee ? ` · ${t("fee")} ${esc(ccyLabel(x.currency))} ${fmt(x.fee)}` : ""}</td>` : "<td></td>"}</tr>`).join("");
  const hdr = [{label:"Date"},{label:"Broker"},{label:"Amount",num:1},{label:"In RM",num:1},{label:""}];

  // How much has gone INTO vs OUT OF each broker specifically — the global
  // Total Deposits/Withdrawals mini-cards above don't answer "how much have
  // I put into Broker A vs Broker B" on their own.
  const depByBroker = groupSum(types.Deposit, (x) => brokerName(x.brokerId), (x) => (+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1));
  const wdrByBroker = groupSum(types.Withdrawal, (x) => brokerName(x.brokerId), (x) => (+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1));
  const brokerNames = [...new Set([...depByBroker.map((d) => d.label), ...wdrByBroker.map((d) => d.label)])];
  const byBrokerRows = brokerNames
    .map((name) => {
      const dep = (depByBroker.find((d) => d.label === name) || { value: 0 }).value;
      const wdr = (wdrByBroker.find((d) => d.label === name) || { value: 0 }).value;
      return { name, dep, wdr, net: dep - wdr };
    })
    .sort((a, b) => b.dep - a.dep)
    .map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${money(r.dep)}</td><td class="num">${money(r.wdr)}</td><td class="num ${cls(r.net)}">${signed(r.net)}</td></tr>`)
    .join("");

  return `
    <div class="mini-cards">${miniCard(t("Total Deposits"), money(sum(types.Deposit)))}${miniCard(t("Total Withdrawals"), money(sum(types.Withdrawal)))}${miniCard(t("Net Cash Added"), money(sum(types.Deposit) - sum(types.Withdrawal)), cls(sum(types.Deposit) - sum(types.Withdrawal)))}</div>
    ${panel("Deposits & Withdrawals by Broker", table([{label:"Broker"},{label:"Deposits",num:1},{label:"Withdrawals",num:1},{label:"Net",num:1}], byBrokerRows))}
    ${panel("Deposits", table(hdr, rows(types.Deposit)))}
    ${panel("Withdrawals", table(hdr, rows(types.Withdrawal)))}
    ${panel("Currency Exchanges", table(hdr, rows(types["Currency Exchange"])))}`;
}

function reportPerformance() {
  const fxGain = T.fxUnrealizedPL || 0, priceOnly = T.priceUnrealizedPL || 0;
  const stat = (label, val, cl, note) => `<div class="mini-card"><div class="mc-label">${label}</div><div class="mc-value ${cl}">${val}</div>${note ? `<div class="mc-sub muted">${note}</div>` : ""}</div>`;
  return `
    <div class="mini-cards">
      ${stat(t("Realized Return"), signed(T.realizedPL), cls(T.realizedPL))}
      ${stat(t("Unrealized Return"), signed(T.unrealizedPL), cls(T.unrealizedPL), `${t("price")} ${signed(priceOnly)} · ${t("FX")} ${signed(fxGain)}`)}
      ${stat(t("Net Dividends"), money(T.netDividends), "pos")}
      ${stat(t("Total Return"), money(T.totalReturn), cls(T.totalReturn), pctTxt(T.totalReturnPct) + " " + t("on net capital"))}
      ${stat("XIRR", T.xirr == null ? "—" : pctTxt(T.xirr), T.xirr == null ? "" : cls(T.xirr), t("money-weighted"))}
    </div>
    ${panel("Profit / Loss by Broker", table([{label:"Broker"},{label:"Total Return",num:1}],
      groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.totalReturn).map((b) => `<tr><td>${esc(b.label)}</td><td class="num ${cls(b.value)}">${signed(b.value)}</td></tr>`).join("")))}
    ${panel("Fees Paid by Broker", table([{label:"Broker"},{label:"Fees",num:1}],
      groupSum(ALL_TRANSACTIONS.filter((x) => x.fee), (x) => brokerName(x.brokerId), (x) => (+x.fee || 0) * (x.fxRate || FX.rates[x.currency] || 1)).map((b) => `<tr><td>${esc(b.label)}</td><td class="num neg">${money(b.value)}</td></tr>`).join("")))}`;
}

function pageReports() {
  const tabs = [["portfolio", "Portfolio"], ["dividend", "Dividend"], ["cashflow", "Cash Flow"], ["performance", "Performance"]];
  const nav = `<div class="seg report-tabs" role="tablist">${tabs.map(([k, lbl]) =>
    `<button class="seg-btn ${reportTab === k ? "on" : ""}" data-rtab="${k}">${t(lbl)}</button>`).join("")}</div>`;
  const body = reportTab === "dividend" ? reportDividend()
    : reportTab === "cashflow" ? reportCashflow()
    : reportTab === "performance" ? reportPerformance() : reportPortfolio();
  const html = `${nav}${body}
    <section class="panel"><div class="panel-head"><h2>Export</h2></div>
      <div class="form-actions">
        <button class="btn" id="expCash">⭳ Cash Ledger CSV</button>
        <button class="btn" id="expTx">⭳ Transactions CSV</button>
        <button class="btn" id="expDiv">⭳ Dividends CSV</button>
      </div></section>`;
  return { title: "Reports", subtitle: "Portfolio, dividend, cash-flow and performance reports.", html,
    mount() {
      $$("[data-rtab]").forEach((b) => b.addEventListener("click", () => { reportTab = b.dataset.rtab; render(); }));
      $("#expCash").addEventListener("click", exportCashCSV);
      $("#expTx").addEventListener("click", exportTxCSV);
      $("#expDiv").addEventListener("click", exportDivCSV);
    } };
}

/* =============================================================================
 * PAGE: BROKERS
 * ========================================================================== */
let editingBrokerId = null;          // P1.5
let showArchivedBrokers = false;     // P1.6

function brokerCard(b) {
  const holdings = T.holdings.filter((h) => h.brokerId === b.id);
  const value = holdings.reduce((s, h) => s + h.marketValue, 0);
  const calc = T.brokerCash[b.id] || 0;
  const chk = RECON_CHECKS[b.id];
  const hasActual = chk && chk.actual != null;
  const diff = hasActual ? calc - (+chk.actual) : null;
  const off = hasActual && Math.abs(diff) > (SETTINGS.reconTolerance || 0);
  const negBalances = (T.negativeCash || []).filter((n) => n.brokerId === b.id);
  const negWarnings = negBalances.map((n) =>
    `<div class="warn-card crit bc-neg"><span class="w-ico">⚠</span><div class="w-body"><strong>${esc(ccyLabel(n.currency))} ${t("balance is negative")} (${esc(ccyLabel(n.currency))}&nbsp;${fmt(Math.abs(n.amount))})</strong> — ${t("a buy, fee, or withdrawal has no matching")} ${esc(ccyLabel(n.currency))} ${t("deposit. Record one to balance this.")}</div></div>`
  ).join("");

  // How this broker has performed, not just where it stands right now:
  // money in/out, current value, gain/loss, income — the full story per broker.
  const deposits = T.depositsByBroker[b.id] || 0;
  const withdrawals = T.withdrawalsByBroker[b.id] || 0;
  const unrealized = T.unrealizedByBroker[b.id] || 0;
  const totalReturn = T.totalReturnByBroker[b.id] || 0;
  const dividends = T.dividendsByBroker[b.id] || 0;
  const stat = (label, val, cls2 = "", tip = "") => `<div><span class="sub">${label}${tip ? ` <span class="col-info" data-tip="${tip}">${COL_INFO_ICON_SVG}</span>` : ""}</span><strong class="${cls2}">${val}</strong></div>`;

  return `<article class="broker-card ${b.archived ? "archived" : ""}">
      <div class="bc-head"><span class="brand-mark sm">${esc(b.name.slice(0,2).toUpperCase())}</span>
        <div><div class="bc-name">${esc(b.name)} ${b.archived ? `<span class="badge subtle">${t("Archived")}</span>` : ""}</div>
          <div class="sub">${esc(b.country) || "—"} · ${esc(ccyLabel(b.currency))}</div></div>
        <div class="bc-actions">
          <button class="icon-btn row-edit" data-edit-broker="${b.id}" title="${t("Edit")}" aria-label="${t("Edit")}">✎</button>
          <button class="icon-btn" data-archive-broker="${b.id}" title="${b.archived ? t("Unarchive") : t("Archive")}" aria-label="${b.archived ? t("Unarchive") : t("Archive")}">${b.archived ? "↩" : "🗄"}</button>
          <button class="icon-btn bc-del" data-del-broker="${b.id}" title="${t("Remove")}" aria-label="${t("Remove")}">✕</button>
        </div></div>
      <div class="bc-stats">
        ${stat(t("Holdings"), holdings.length)}
        ${stat(t("Market Value"), money(value))}
        ${stat(t("Available Cash"), money(calc), "", t("Can invest or withdraw"))}
        ${stat(t("Unrealized P/L"), signed(unrealized), cls(unrealized))}
        ${stat(t("Total Return"), signed(totalReturn), cls(totalReturn))}
        ${stat(t("Net Dividends"), money(dividends), dividends > 0 ? "pos" : "")}
        ${stat(t("Total Deposits"), money(deposits))}
        ${stat(t("Total Withdrawals"), money(withdrawals))}
        ${stat(t("Difference"), hasActual ? signed(diff) : "—", off ? "neg" : "")}
        ${stat(t("Dividends paid to"), b.divPaidTo === "bank" ? t("Bank") : t("Broker"), "", t("Where this broker's dividends land by default — used when auto-logging market dividends."))}
        ${stat(t("Default dividend tax rate"), `${fmt(b.divTaxRate || 0, { maximumFractionDigits: 2 })}%`, "", t("Applied to dividends auto-logged from market history at this broker."))}
      </div>
      ${b.notes ? `<p class="bc-notes muted">${esc(b.notes)}</p>` : ""}
      ${negWarnings}</article>`;
}

function pageBrokers() {
  const editing = editingBrokerId ? BROKERS.find((b) => b.id === editingBrokerId) : null;
  if (editingBrokerId && !editing) editingBrokerId = null;
  const active = BROKERS.filter((b) => !b.archived);
  const archived = BROKERS.filter((b) => b.archived);
  const cards = active.map(brokerCard).join("");
  const archivedCards = (showArchivedBrokers ? archived : []).map(brokerCard).join("");

  const e = editing || {};
  const sel = (val, cur) => (val === cur ? " selected" : "");
  const brokerForm = `<form id="brokerForm" class="form" autocomplete="off">
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
      ${editing ? `<button class="btn ghost" type="button" id="cancelBrokerEdit">${t("Cancel edit")}</button>` : ""}
    </div>
  </form>`;

  const archToggle = archived.length
    ? `<button class="btn ghost" id="toggleArchived">${showArchivedBrokers ? t("Hide archived") : `${t("Show archived")} (${archived.length})`}</button>` : "";

  const html = `${cards ? `<div class="broker-grid">${cards}</div>` : emptyState(t("No brokers yet. Add your first one below."))}
    ${archToggle}
    ${showArchivedBrokers && archivedCards ? `<div class="broker-grid" style="margin-top:14px">${archivedCards}</div>` : ""}
    ${BROKERS.length ? brokerCashPanelsHTML() : ""}
    ${panel(editing ? "Edit Broker" : "Add Broker", brokerForm)}`;

  return { title: "Brokers", subtitle: LANG === "zh"
      ? `已连接 ${active.length} 个投资平台。`
      : `${active.length} investment apps connected.`, html,
    mount() {
      $("#brokerForm").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target).entries());
        if (!d.name.trim()) { toast(t("Enter a broker name.")); return; }
        const divTaxRate = Math.max(0, Math.min(100, parseFloat(d.divTaxRate) || 0));
        if (editingBrokerId) {
          const b = BROKERS.find((x) => x.id === editingBrokerId);
          if (b) { b.name = d.name.trim(); b.country = (d.country || "").trim(); b.currency = d.currency; b.notes = (d.notes || "").trim(); b.divPaidTo = d.divPaidTo || "broker"; b.divTaxRate = divTaxRate; }
          editingBrokerId = null;
          saveStore(); toast(t("Broker updated")); render();
        } else {
          BROKERS.push({ id: uid("b"), name: d.name.trim(), country: (d.country || "").trim(), currency: d.currency, notes: (d.notes || "").trim(), divPaidTo: d.divPaidTo || "broker", divTaxRate, archived: false });
          saveStore(); toast(t("Broker added")); render();
        }
      });
      const cancelB = $("#cancelBrokerEdit");
      if (cancelB) cancelB.addEventListener("click", () => { editingBrokerId = null; render(); });
      const tog = $("#toggleArchived");
      if (tog) tog.addEventListener("click", () => { showArchivedBrokers = !showArchivedBrokers; render(); });

      $$("[data-edit-broker]").forEach((btn) => btn.addEventListener("click", () => {
        editingBrokerId = btn.dataset.editBroker; render();
        const p = $("#brokerForm"); if (p) p.scrollIntoView({ behavior: "smooth", block: "center" });
      }));
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

/* =============================================================================
 * PAGE: SETTINGS  (incl. theme switcher)
 * ========================================================================== */
function pageSettings() {
  const html = `
    ${panel("Profile", `<form id="profileForm" class="form" autocomplete="off">
      <div class="form-grid">
        <label>${t("Name")}<input name="name" value="${esc(USER.name)}" placeholder="${t("Your name")}"></label>
        <label>${t("Email")}<input name="email" type="email" value="${esc(USER.email)}" placeholder="you@example.com"></label>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${t("Save profile")}</button></div>
    </form>`)}

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
      ${settingRow("Base currency", `<select id="baseCcy">${Object.keys(FX.rates).map((c) => `<option value="${c}" ${c === FX.base ? "selected" : ""}>${ccyLabel(c)}</option>`).join("")}</select>`)}
      <p class="muted" style="margin:6px 0 0">All transactions keep their original currency; base-currency values are derived using stored exchange rates and never overwrite the original.</p></div>`)}

    ${panel("Exchange Rates", `
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

    ${panel("Preferences", `<div class="setting-rows">
      ${settingRow(t("Date format"), `<select id="dateFmt">${DATE_FORMATS.map((f) => `<option value="${f.k}" ${SETTINGS.dateFormat === f.k ? "selected" : ""}>${f.label}</option>`).join("")}</select>`)}
      ${settingRow(t("Time zone"), `<select id="tzSel"><option value="">${t("Device local")}</option>${TIME_ZONES.map((z) => `<option value="${z}" ${SETTINGS.timeZone === z ? "selected" : ""}>${z}</option>`).join("")}</select>`)}
      <p class="muted" style="margin:6px 0 0">${t("Time zone sets which day counts as \"today\" for day counts and dividend forecasts; stored dates are never altered.")}</p></div>`)}

    ${panel("Cost Basis Method", `<div class="setting-rows">
      ${settingRow(t("Method"), `<select id="costBasis">
        <option value="average" ${SETTINGS.costBasis === "average" ? "selected" : ""}>${t("Average Cost")}</option>
        <option value="fifo" disabled>${t("FIFO — not yet implemented")}</option>
      </select>`)}
      <p class="muted" style="margin:6px 0 0">${t("Average Cost is the active method for all gain/loss figures. FIFO is planned and currently disabled.")}</p></div>`)}

    ${panel("Reconciliation", `<div class="setting-rows">
      ${settingRow(t("Tolerance") + " (" + FX.base + ")", `<input type="number" step="any" id="reconTol" value="${SETTINGS.reconTolerance}" style="width:120px">`)}
      <p class="muted" style="margin:6px 0 0">${t("Differences within this amount are treated as a small difference rather than needing review.")}</p></div>`)}

    ${panel("Data Safety & Backup", `
      <p class="muted info-card" style="display:flex;gap:10px;margin:-2px 0 14px"><span class="w-ico">🔒</span><span>${t("Your investment data is stored only in this browser on this device. Clearing browser data may remove it. Export a JSON backup regularly.")}</span></p>
      <div class="form-actions">
        <button class="btn primary" id="expJson">⭳ ${t("Export full backup (JSON)")}</button>
        <button class="btn" id="impJsonBtn">⭱ ${t("Import backup (JSON)")}</button>
        <input type="file" id="impJsonFile" accept="application/json,.json" hidden>
        <button class="btn" id="setExpTx">⭳ ${t("Export Transactions CSV")}</button>
        <button class="btn" id="setExpCash">⭳ ${t("Export Cash CSV")}</button>
        <button class="btn ghost" id="loadDemo">${t("Load demo data")}</button>
        <button class="btn ghost" id="clearPvHistory">${t("Clear chart history")}</button>
      </div>`)}

    ${panel("Import from CSV", `
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

    ${panel("Danger Zone", `
      <p class="muted" style="margin:-2px 0 12px">${t("Clearing removes all brokers, holdings and transactions saved in this browser. This cannot be undone — export a backup first.")}</p>
      <div class="fx-add">
        <input type="text" id="clearConfirm" class="fx-input" placeholder="${t("Type DELETE to confirm")}" autocomplete="off" style="width:220px">
        <button class="btn danger" id="clearData">${t("Clear all data")}</button>
      </div>`)}`;

  return { title: "Settings", subtitle: "Profile, currency, appearance and data.", html,
    mount() {
      reflectThemeChoice();
      $$("#themeOptions .theme-card").forEach((btn) => {
        btn.addEventListener("click", () => { setTheme(btn.dataset.themeChoice); reflectThemeChoice(); toast(`${btn.dataset.themeChoice === "dark" ? "Dark" : "Light"} theme applied`); });
      });
      mountOpeningHoldingForm();   // "Import existing holdings" form
      // Deep-linked from the Portfolio empty state → reveal + scroll to the import section.
      if (decodeURIComponent((location.hash.split("/")[2] || "")) === "holdings") {
        const ih = $("#importHoldings");
        if (ih) setTimeout(() => ih.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      }
      // Editable profile
      $("#profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target).entries());
        USER.name = d.name; USER.email = d.email;
        saveStore(); toast(t("Profile saved"));
      });
      // Change base currency — re-base every stored rate so values stay correct
      $("#baseCcy").addEventListener("change", (e) => {
        const nb = e.target.value;
        const div = FX.rates[nb];
        if (!div) { toast(t("Add a rate for that currency first.")); e.target.value = FX.base; return; }
        Object.keys(FX.rates).forEach((c) => { FX.rates[c] = +(FX.rates[c] / div).toFixed(6); });
        FX.base = nb; saveStore(); toast(`${t("Base currency set to")} ${nb}`); render();
      });
      // Reconciliation tolerance
      $("#reconTol").addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        SETTINGS.reconTolerance = isNaN(v) ? 0 : Math.abs(v);
        saveStore(); toast(t("Tolerance saved"));
      });
      // Preferences (date format / time zone / cost basis)
      $("#dateFmt").addEventListener("change", (e) => { SETTINGS.dateFormat = e.target.value; saveStore(); toast(t("Preferences saved")); render(); });
      $("#tzSel").addEventListener("change", (e) => { SETTINGS.timeZone = e.target.value; saveStore(); toast(t("Preferences saved")); });
      $("#costBasis").addEventListener("change", (e) => {
        if (e.target.value !== "average") { e.target.value = "average"; toast(t("FIFO is not implemented yet.")); return; }
        SETTINGS.costBasis = "average"; saveStore();
      });
      // CSV import
      $("#dlTemplate").addEventListener("click", downloadImportTemplate);
      $("#impCsvBtn").addEventListener("click", () => $("#impCsvFile").click());
      $("#impCsvFile").addEventListener("change", (e) => { if (e.target.files[0]) handleCsvFile(e.target.files[0]); e.target.value = ""; });
      mountImportPreview();
      // CSV + JSON backup
      $("#setExpCash").addEventListener("click", exportCashCSV);
      $("#setExpTx").addEventListener("click", exportTxCSV);
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
    } };
}

/* --- Data safety helpers --- */
function clearAllData() {
  [BROKERS, HOLDINGS, ALL_TRANSACTIONS, UPCOMING_DIVIDENDS, PV_HISTORY].forEach((a) => (a.length = 0));
  assignObj(CURRENT_PRICES, {}); assignObj(RECON_CHECKS, {});
  resetStore(); recompute();
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

/* =============================================================================
 * GUIDED TOUR — spotlight + pulsing highlight pointing at the exact element.
 * ========================================================================== */
let tourIdx = -1;
let TOUR_SEEN = false;
function tourSteps() {
  return [
    { route: "dashboard", selector: '.sidebar [data-page="brokers"]', fallback: "#moreBtn",
      title: t("Step 1 · Add a broker"), text: t("Open Brokers and add your investment app first — every transaction belongs to a broker.") },
    { route: "brokers", selector: "#brokerForm",
      title: t("Add your broker"), text: t("Enter the broker name and currency, then click Add Broker.") },
    { route: "dashboard", selector: '[data-page="add"]', fallback: ".bn-item.add",
      title: t("Step 2 · Record a deposit"), text: t("Tap Add to record cash you put into a broker. Pick type Deposit.") },
    { route: "add", selector: ".type-picker", fallback: "#txForm",
      title: t("Pick what to record"), text: t("Choose a type first — then only the fields that type needs appear. Buy and Sell create and update your holdings automatically.") },
    { route: "portfolio", selector: "#holdingsBody",
      title: t("Step 3 · Set a current price"), text: t("After a Buy your holding appears here. Use the ＄ button to type a current price (manual, not live).") },
    { route: "settings", selector: "#expJson",
      title: t("Back up your data"), text: t("Your data lives only in this browser. Export a JSON backup from Settings regularly.") },
  ];
}
const TOUR = { steps: [] };

function startTour() {
  TOUR.steps = tourSteps();
  tourIdx = 0;
  runTourStep();
}
function endTour(complete) {
  document.querySelectorAll(".tour-backdrop,.tour-spot,.tour-ring,.tour-pop").forEach((e) => e.remove());
  window.removeEventListener("resize", repositionTour);
  window.removeEventListener("scroll", repositionTour, true);
  document.removeEventListener("keydown", tourKey);
  tourIdx = -1;
  if (complete) { try { localStorage.setItem("il-tour-done", "1"); } catch (e) {} }
}
function tourKey(e) { if (e.key === "Escape") endTour(true); }
function runTourStep() {
  const step = TOUR.steps[tourIdx];
  if (!step) { endTour(true); toast(t("Tour complete — you're ready to go.")); return; }
  if (step.route && currentPageKey() !== step.route) {
    location.hash = "#/" + step.route;
    setTimeout(() => renderTourStep(step), 110);
  } else {
    renderTourStep(step);
  }
}
function tourEl(cls) {
  let el = document.querySelector("." + cls);
  if (!el) { el = document.createElement("div"); el.className = cls; document.body.appendChild(el); }
  return el;
}
function renderTourStep(step) {
  tourEl("tour-backdrop");
  tourEl("tour-spot");
  tourEl("tour-ring");
  const pop = tourEl("tour-pop");
  positionTour(step);
  const last = tourIdx === TOUR.steps.length - 1;
  pop.innerHTML = `<h4>${step.title}</h4><p>${step.text}</p>
    <div class="tour-actions">
      <span class="tour-step-n">${tourIdx + 1} / ${TOUR.steps.length}</span>
      <button class="btn ghost" id="tourSkip">${t("Skip")}</button>
      ${tourIdx > 0 ? `<button class="btn" id="tourPrev">${t("Back")}</button>` : ""}
      <button class="btn primary" id="tourNext">${last ? t("Done") : t("Next")}</button>
    </div>`;
  $("#tourSkip").onclick = () => endTour(true);
  $("#tourNext").onclick = () => { tourIdx++; runTourStep(); };
  const prev = $("#tourPrev");
  if (prev) prev.onclick = () => { tourIdx = Math.max(0, tourIdx - 1); runTourStep(); };
  window.addEventListener("resize", repositionTour);
  window.addEventListener("scroll", repositionTour, true);
  document.addEventListener("keydown", tourKey);
}
function positionTour(step) {
  const target = document.querySelector(step.selector) || (step.fallback && document.querySelector(step.fallback));
  const spot = document.querySelector(".tour-spot");
  const ring = document.querySelector(".tour-ring");
  const pop = document.querySelector(".tour-pop");
  if (!spot || !pop) return;
  const r = target ? target.getBoundingClientRect() : null;
  if (!target || r.width === 0 || r.height === 0) {
    spot.style.display = "none"; ring.style.display = "none";
    pop.style.left = "50%"; pop.style.top = "90px"; pop.style.transform = "translateX(-50%)";
    return;
  }
  if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
  const pad = 6;
  const box = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  [spot, ring].forEach((el) => {
    el.style.display = "";
    el.style.left = box.left + "px"; el.style.top = box.top + "px";
    el.style.width = box.width + "px"; el.style.height = box.height + "px";
  });
  pop.style.transform = "";
  pop.style.left = Math.min(Math.max(8, r.left), window.innerWidth - 320) + "px";
  const below = r.bottom + 12;
  pop.style.top = (below + 150 < window.innerHeight ? below : Math.max(8, r.top - 158)) + "px";
}
function repositionTour() { if (tourIdx >= 0 && TOUR.steps[tourIdx]) positionTour(TOUR.steps[tourIdx]); }

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
  const itemsEN = [
    { q: "How is Total Return calculated?", a: "Total Return = Unrealized P/L + Realized P/L + Net Dividends − standalone Fees. Trade commissions and taxes are already inside cost basis (buys) and realized P/L (sells), so they are not deducted twice." },
    { q: "What's the difference between realized and unrealized P/L?", a: "Unrealized P/L = current market value − remaining cost basis of shares you still hold. Realized P/L = sale proceeds − average cost of sold shares − commission − taxes. Average-cost method is used." },
    { q: "What is XIRR?", a: "XIRR (Extended Internal Rate of Return) is your money-weighted annual return. Unlike a simple return, it accounts for WHEN money entered and left your portfolio, so large contributions near the end don't unfairly flatter (or hurt) the percentage. It answers: 'what constant annual rate, compounded, turns my dated cash flows into my current account value?'" },
    { q: "How is XIRR calculated?", a: "Methodology: the account boundary is your whole portfolio (holdings + cash). External flows are dated: each Deposit is negative (cash in), each Withdrawal is positive (cash out). Today's terminal value = current holdings market value + cash balance, as a final positive flow. Buys, Sells and Dividends are INTERNAL to the account (they move value between cash and securities, or generate cash that stays in the account), so they are already captured in the terminal value — adding them as separate flows would double-count. XIRR is then the rate r solving Σ flow_i / (1+r)^(years_i) = 0, found by Newton-Raphson with a bisection fallback. Requires at least one deposit and ≥7 days of history." },
    { q: "Why is XIRR different from simple return?", a: "Simple return = (gain) ÷ (money invested), ignoring timing. XIRR is time-weighted by date and annualised. Example: depositing RM10,000 a year ago vs last week gives the same simple return but very different XIRR, because the recent money had almost no time to compound. XIRR is the fairer measure of the rate your money actually earned." },
    { q: "How is the dividend forecast calculated?", a: "Methodology: not a flat TTM ÷ 12 run-rate. For each holding, past payment dates are used to detect a real frequency (monthly/quarterly/semi-annual/annual), and future pay dates are projected at that cadence up to 3 years out. History comes from your own logged dividends where you have at least 2; otherwise it falls back to the stock's real public dividend history (fetched automatically for any market), scaled to your current share count and today's FX rate. With at least 6 historical payments, a per-payment growth rate is also estimated (comparing your 3 most recent payments to the 3 before that, capped at ±25% per payment) and compounded forward, so a stock with a track record of raising its dividend projects growing future payments instead of a flat repeat. Any dividend already confirmed — one you marked 'Expected', or a near-term one already declared — is summed separately as a 'confirmed pipeline' so it's never mixed up with the pattern-based estimate." },
    { q: "How accurate is the dividend forecast?", a: "It is a directional estimate, not a prediction. Accuracy is best for a holding with a long, regular payment history (own-logged or from public market data). It is least accurate for a brand-new holding with fewer than 2 payments on record anywhere, or a stock with irregular/special dividends that don't fit a monthly/quarterly/semi-annual/annual cadence." },
    { q: "What are the forecast's limitations?", a: "It does NOT model: future buys or sells, special/one-off dividends, changes in withholding tax, or FX movement on future payments (today's FX rate is used throughout). Growth detection needs at least 6 historical payments per holding — with fewer, the projection is flat (no growth applied). Treat it as a planning aid only — never as guaranteed income." },
    { q: "How is dividend tax handled?", a: "Net Dividend = Gross Dividend − Withholding Tax. Withholding tax is tracked per dividend and summarised by country (using the stock's real country from the lookup) in the Dividends page." },
    { q: "What do the transaction types mean?", a: "Deposit/Withdrawal move cash in/out. Buy/Sell trade shares (and capture commission + taxes). Dividend records income (Received or Expected). Currency Exchange converts between currencies. Fee, Tax withholding, Interest, and Transfer-between-brokers cover the rest." },
    { q: "Why does a broker show a cash difference?", a: "Your calculated cash balance (deposits − buys − fees + sells + net dividends − withdrawals) differs from the actual balance you entered. Usually a missing fee, dividend or transfer entry. A negative balance means spending exceeded recorded cash." },
  ];
  const itemsZH = [
    { q: "总回报是如何计算的？", a: "总回报 = 未实现盈亏 + 已实现盈亏 + 净股息 − 独立费用。买入的佣金和税费已计入成本，卖出的已计入已实现盈亏，因此不会重复扣除。" },
    { q: "已实现与未实现盈亏有什么区别？", a: "未实现盈亏 = 当前市值 − 仍持有股票的剩余成本。已实现盈亏 = 卖出所得 − 已卖出股票的平均成本 − 佣金 − 税费。采用平均成本法。" },
    { q: "什么是 XIRR？", a: "XIRR（扩展内部收益率）是按资金加权的年化回报率。与简单回报不同，它考虑了资金进出投资组合的时间，因此临近期末的大额投入不会不公平地美化（或拖累）百分比。它回答：‘哪一个固定的年化复利率，能把我带日期的现金流变成当前的账户价值？’" },
    { q: "XIRR 是如何计算的？", a: "方法：账户边界为整个投资组合（持仓 + 现金）。外部现金流按日期计入：每笔存款为负（现金流入），每笔取款为正（现金流出）。今天的终值 = 当前持仓市值 + 现金余额，作为最后一笔正现金流。买入、卖出和股息属于账户内部（在现金与证券间转移价值，或产生留在账户内的现金），已包含在终值中——若再作为单独现金流会重复计算。XIRR 即求解 Σ 现金流 / (1+r)^(年数) = 0 的利率 r，采用牛顿法并以二分法兜底。至少需一笔存款且 ≥7 天历史。" },
    { q: "为什么 XIRR 与简单回报不同？", a: "简单回报 = 收益 ÷ 投入金额，忽略时间。XIRR 按日期加权并年化。例如：一年前投入 RM10,000 与上周投入，简单回报相同，但 XIRR 差别很大，因为近期资金几乎没有时间复利。XIRR 更公平地衡量您资金实际赚取的回报率。" },
    { q: "股息预测是如何计算的？", a: "方法：并非简单的 TTM ÷ 12 运行率。系统会为每个持仓从过去的派息日期侦测真实的派息频率（每月/每季/每半年/每年），并按该周期向未来预测最多 3 年的派息日期。历史数据优先使用您自己记录的股息（至少 2 笔）；不足时改用该股票的真实公开股息历史（自动获取，涵盖各市场），并按您当前持股数与当前汇率换算。若历史派息达 6 笔以上，还会估算每次派息的增长率（比较最近 3 笔与之前 3 笔的均值，增长率上限为每次派息 ±25%）并向前复利，因此有加息记录的股票会预测出增长的未来派息，而非简单重复。任何已确认的股息——您标记为“预期”的，或近期已宣布的——会单独汇总为“已确认管道”，绝不与规律预测混淆。" },
    { q: "股息预测有多准确？", a: "这是方向性估算，并非预测。对于拥有长期、规律派息记录（无论是您自己记录的还是来自公开市场数据）的持仓最准确；对于任何来源派息记录都不足 2 笔的全新持仓，或不符合每月/每季/每半年/每年周期的不规则/特别股息股票最不准确。" },
    { q: "股息预测有哪些局限？", a: "它不建模：未来的买卖、特别/一次性股息、预扣税变动，或未来派息的汇率波动（全程使用当前汇率）。增长侦测需要每个持仓至少 6 笔历史派息记录——不足时预测为持平（不套用增长）。请仅作为规划参考，切勿视为有保证的收入。" },
    { q: "股息税是如何处理的？", a: "净股息 = 总股息 − 预扣税。预扣税按每笔股息记录，并在股息页面按国家/地区（使用查询得到的真实国家）汇总。" },
    { q: "各交易类型是什么意思？", a: "存款/取款用于现金进出。买入/卖出用于交易股票（并记录佣金和税费）。股息记录收入（已收到或预期）。货币兑换在货币间转换。费用、预扣税、利息和券商间转账涵盖其余情况。" },
    { q: "为什么券商会显示现金差异？", a: "您的计算现金余额（存款 − 买入 − 费用 + 卖出 + 净股息 − 取款）与您输入的实际余额不一致，通常是漏记了费用、股息或转账。余额为负表示支出超过了已记录的现金。" },
  ];
  const items = LANG === "zh" ? itemsZH : itemsEN;
  const html = `<div class="help-list">${items.map((it) => `
    <details class="help-item"><summary>${it.q}</summary><p>${it.a}</p></details>`).join("")}</div>`;
  return { title: "Help", subtitle: "How calculations work, transaction types and FAQ.", html };
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
  // Cumulative cost basis over time (proxy for position size — historical market prices aren't stored)
  let cum = 0; const costSeries = [];
  [...txs].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
    const xfx = x.fxRate || FX.rates[x.currency] || 1;
    if (x.type === "Buy") cum += ((+x.qty || 0) * (+x.price || 0) + (+x.fee || 0) + (+x.tax || 0)) * xfx;
    else if (x.type === "Sell") cum = Math.max(0, cum - (+x.qty || 0) * (+x.price || 0) * xfx);
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
  const positionPanel = panel("Position", `
    <div class="metrics pos-metrics">
      ${posStat(t("Market Value"), money(h.marketValue), "", "net")}
      ${posStat(t("Total Return"), moneySigned(h.totalReturn), cls(h.totalReturn))}
      ${posStat(t("Price Return"), moneySigned(h.priceUnrealized), cls(h.priceUnrealized), "", `${signed(priceReturnPct)}%`)}
      ${posStat(t("Current Price"), priceLbl)}
    </div>
    <p style="font-size:14px;margin:14px 0 0">${fmt(h.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} ${t("shares")} · ${t("Average Cost")} ${money(h.avgCost)} · ${t("Cost Basis")} ${money(h.costBasis)}</p>
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
      return panel(`${t("Dividend Calendar")}${titleTip}`, `<div class="${scrollCls}">${table(heads, rows)}</div>`, `<div class="panel-head-actions">${filterSel}</div>`);
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
      const costPanel = panel("Cost Basis Over Time", `<div class="chart">${lineChartSVG(costSeries)}</div><p class="muted" style="font-size:11px;margin:6px 0 0">${t("Cumulative cost — historical market prices are not stored.")}</p>`);
      const divPanel = panel("Dividend Income Over Time", `<div class="chart">${lineChartSVG(divSeries)}</div>`);
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
      // AUTO_DIV_CACHE is in-memory only (not persisted) and was previously only ever
      // populated by the Dashboard's or Reports page's mount() — landing here directly
      // (bookmark, back-button, or a hard refresh while already on this page) left it
      // empty with nothing to re-fetch it, hiding the Dividend Calendar even though the
      // underlying holding data was fine. Fetch it here too, same pattern as those pages.
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
  toast(filename + " exported");
}
function exportCashCSV() {
  const cashTypes = ["Deposit", "Withdrawal", "Interest / cash yield", "Interest", "Fee", "Tax withholding", "Transfer between brokers", "Currency Exchange"];
  const rows = ALL_TRANSACTIONS.filter((x) => cashTypes.includes(x.type) || (x.type === "Dividend" && x.status !== "Expected"));
  downloadCSV("investment-ledger-cash.csv",
    ["Date","Broker","Type","Amount","Currency","FX Rate","Amount in " + FX.base],
    rows.map((c) => [c.date, brokerName(c.brokerId), c.type, c.gross, c.currency, c.fxRate || FX.rates[c.currency] || 1, (c.myrEquivalent != null ? c.myrEquivalent : (+c.gross || 0) * (c.fxRate || 1)).toFixed(2)]));
}
function exportTxCSV() {
  downloadCSV("investment-ledger-transactions.csv",
    ["Date","Broker","Type","Ticker","Quantity","Price","Gross","Fee","Tax","Currency","FX Rate","MYR Equivalent","Notes"],
    ALL_TRANSACTIONS.map((x) => [x.date, brokerName(x.brokerId), x.type, x.ticker, x.qty ?? "", x.price ?? "", x.gross ?? "", x.fee ?? 0, x.tax ?? 0, x.currency, x.fxRate ?? "", (x.myrEquivalent != null ? x.myrEquivalent : "").toString(), x.notes || ""]));
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
  "Interest / cash yield","Interest","Currency Exchange","Transfer between brokers"];

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
    if (type === "Buy" || type === "Sell") {
      if (!(qty > 0)) errors.push(t("Quantity required"));
      if (!(price > 0)) errors.push(t("Price required"));
      if (!ticker) errors.push(t("Ticker required"));
      gross = (qty || 0) * (price || 0);
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

    // Duplicate check (only meaningful once broker + amount resolve).
    let dup = false;
    if (!needsBroker && !errors.length) {
      const sig = txSignature(brokerId, date, type, ticker, gross, currency);
      if (existing.has(sig) || batchSeen.has(sig)) dup = true;
      else batchSeen.add(sig);
    }
    return { line: n + 2, date, brokerId, brokerName: brokerRaw, type, ticker, currency, qty, price,
      gross: gross || 0, fee, tax, fxRate: fxRate || 1, toCurrency, toAmount, toBrokerId,
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
 * "MORE" SHEET — secondary navigation (Records, Reports, Brokers, Settings, Help)
 * ========================================================================== */
function closeMoreSheet() { const s = $("#moreSheet"); if (s) s.hidden = true; }
function toggleMoreSheet() { const s = $("#moreSheet"); if (s) s.hidden = !s.hidden; }

/* =============================================================================
 * ROUTER
 * ========================================================================== */
const PAGES = {
  dashboard: pageDashboard, portfolio: pagePortfolio, records: pageRecords, add: pageAdd,
  dividends: pageDividends, reports: pageReports,
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
  const secondary = ["records", "reports", "brokers", "settings", "help"];
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
}
document.addEventListener("DOMContentLoaded", init);
