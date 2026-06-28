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
  "Unrealized P/L": "未实现盈亏", "Net Div": "净股息", "Ticker": "代码", "Stock code": "股票代号",
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
  "No portfolio history yet.": "暂无组合历史。",
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
  "avg, MYR": "均价, MYR", "Current price per share for": "每股当前价格：", "manual, not live": "手动，非实时",
  "Enter a valid price.": "请输入有效价格。", "Price updated": "价格已更新",
  "Remove this opening holding?": "移除此期初持仓？", "Holding removed": "已移除持仓",
  "This holding comes from your transactions — delete the related transactions to remove it.": "此持仓来自您的交易 — 请删除相关交易以移除它。",
  "Delete this transaction? Holdings and balances will be recalculated.": "删除此交易？持仓和余额将重新计算。",
  "Transaction removed": "已移除交易", "records": "条记录",
  "holdings without a current price": "个持仓没有当前价格", "no price": "无价格",
  "holdings have no current price set": "个持仓未设当前价格",
  // Cash / reconciliation
  "Holdings": "持仓", "Market Value": "市值", "Cash (calc)": "计算现金", "Difference": "差额",
  "Not checked": "未核对", "Matched": "已匹配", "Small difference": "小幅差异", "Needs review": "需复核",
  "Update": "更新", "Actual cash balance for": "实际现金余额：", "Note (optional)": "备注（可选）",
  "Reconciliation saved": "对账已保存", "Enter a valid number.": "请输入有效数字。",
  "Calculated = Deposits − Buys − Fees + Sells + Net Dividends − Withdrawals": "计算余额 = 存款 − 买入 − 费用 + 卖出 + 净股息 − 取款",
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
  "Broker archived": "券商已归档", "Broker unarchived": "已取消归档", "Enter a broker name.": "请输入券商名称。",
  "No brokers yet. Add your first one below.": "暂无券商。在下方添加第一个。",
  "This broker still has records. Remove it anyway? (Consider Archive instead.)": "该券商仍有记录。仍要删除吗？（建议改为归档。）",
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
  "Upcoming confirmed dividends in window": "窗口内已确认的即将派息",
  "Add upcoming dividend for": "添加即将派息：", "Per share": "每股金额",
  "Fetching US schedules…": "正在获取美股派息日程…",
  "next month": "下月", "next quarter": "下季", "next year": "下年",
  "How is the forecast calculated?": "预测是如何计算的？",
  "Net Dividends (Lifetime)": "净股息（累计）", "Net (MYR)": "净额 (MYR)", "Month": "月份", "Quarter": "季度",
  "Dividend Forecast": "股息预测", "Monthly Dividend Income": "每月股息收入",
  "Quarterly Dividend Income": "每季股息收入", "Annual Dividend Income": "每年股息收入",
  "MoM Δ": "环比", "QoQ Δ": "季度环比", "YoY": "同比",
  "Year-over-year growth": "同比增长", "vs": "对比",
  // Holding detail
  "Back to Portfolio": "返回投资组合", "Holding detail": "持仓明细",
  "Shares Held": "持有股数", "Average Cost": "平均成本", "share": "股",
  "Set price": "设置价格", "Realized P/L": "已实现盈亏", "Net Dividends": "净股息",
  "price": "价格", "FX": "汇率", "Manual": "手动",
  "Transactions": "交易记录",
  "No transactions for this holding.": "此持仓暂无交易。",
  "No dividends recorded for this holding.": "此持仓暂无股息记录。",
  "This holding no longer exists (fully sold or deleted). Its realized P/L still counts in your totals.": "此持仓已不存在（已全部卖出或删除）。其已实现盈亏仍计入您的总额。",
  // Multi-currency cash + FX split fixes
  "To amount (received)": "兑入金额（收到）", "Implied rate": "隐含汇率",
  "Enter the amount you received.": "请输入您收到的金额。",
  "Cash Balances by Currency": "按货币的现金余额", "Balance": "余额", "In MYR": "折合 MYR",
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
  "Month": "月份", "Quarter": "季度", "Year": "年份", "Net (MYR)": "净额（MYR）",
  "Shares": "股数", "Avg Cost": "平均成本", "Market Value": "市值", "Unrealized": "未实现",
  "Date": "日期", "Type": "类型", "Ticker": "代码", "Broker": "券商",
  "on net capital": "占净投入资本", "money-weighted": "资金加权", "on cost": "占成本",
  "Portfolio Value Over Time": "投资组合市值随时间变化",
  "Captured once per day when you use the app.": "每次使用应用时每日记录一次。",
  "Record your first deposit or Buy to start tracking.": "记录第一笔存款或买入以开始追踪。",
  // Refactor — 5-item nav, More sheet, Records, Add flow, dashboard hero
  "Records": "记录", "More": "更多",
  "All transactions, cash & dividends": "所有交易、现金与股息",
  "Portfolio, dividend, cash-flow, performance": "投资组合、股息、现金流、业绩",
  "Accounts & reconciliation": "账户与对账",
  "Currency, preferences, import & backup": "货币、偏好、导入与备份",
  "Guides & FAQ": "指南与常见问题",
  "All": "全部", "Buy / Sell": "买入 / 卖出", "Cash": "现金", "FX": "外汇",
  "records": "条记录", "Account": "账户", "Ticker / Detail": "代码 / 明细", "Amount (MYR)": "金额（MYR）",
  "No records in this view yet.": "此视图暂无记录。",
  "No transactions yet. Tap ＋ Add to record your first deposit or investment.": "暂无交易。点击 ＋ 添加，记录您的第一笔存款或投资。",
  "fee": "费用", "Available Cash": "可用现金",
  "What do you want to record?": "您想记录什么？", "Other record types": "其他记录类型",
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
  return `${fmtDate(dt.toISOString().slice(0, 10))}, ${dt.toTimeString().slice(0, 5)}`;
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

  let totalDeposits = 0, totalWithdrawals = 0, netDividends = 0, totalFees = 0, realizedPL = 0;
  const oversells = [];

  // Process chronologically so average cost is correct.
  const txns = [...ALL_TRANSACTIONS].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  txns.forEach((tx) => {
    const fx = histFx(tx);
    const ccy = tx.currency || FX.base;
    const gross = +tx.gross || 0, fee = +tx.fee || 0, taxv = +tx.tax || 0;
    const grossMYR = gross * fx, feeMYR = fee * fx, taxMYR = taxv * fx;
    const q = +tx.qty || 0, price = +tx.price || 0;
    switch (tx.type) {
      case "Deposit": totalDeposits += grossMYR; addCash(tx.brokerId, ccy, gross); break;
      case "Withdrawal": totalWithdrawals += grossMYR; addCash(tx.brokerId, ccy, -gross); break;
      case "Interest / cash yield": case "Interest": addCash(tx.brokerId, ccy, gross); break;
      case "Fee": totalFees += grossMYR; addCash(tx.brokerId, ccy, -gross); break;
      case "Tax withholding": totalFees += grossMYR; addCash(tx.brokerId, ccy, -gross); break;
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
        l.shares -= q; l.costMYR -= avgMYR * q; l.costLocal -= avgLocal * q;
        if (l.shares < 1e-9) { l.shares = 0; l.costMYR = Math.max(0, l.costMYR); l.costLocal = Math.max(0, l.costLocal); }
        addCash(tx.brokerId, ccy, gross - fee - taxv); break;
      }
      case "Dividend": {
        if (tx.status !== "Expected") {
          const net = gross - taxv;
          netDividends += net * fx; addCash(tx.brokerId, ccy, net);
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
        totalFees += fee * (FX.rates[fromCcy] || 1);
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
    const totalReturn = unrealized + l.netDivMYR;
    const meta = STOCK_META[l.ticker] || {};
    return { ...l, costBasis, marketValue, avgCost, avgCostLocal, unrealized, unrealizedPct, priceUnrealized, fxUnrealized,
      realized: l.realizedMYR || 0, netDividends: l.netDivMYR, totalReturn,
      country: meta.country || marketInfo(l.ticker).country, sector: meta.sector || null, industry: meta.industry || null,
      hasPrice, currentPrice: hasPrice ? +cp.price : null, currentPriceCcy: priceCcy,
      currentPriceDate: hasPrice ? cp.date : null,
      priceSource: hasPrice ? (cp.source || "manual") : null,
      priceFetchedAt: hasPrice ? cp.fetchedAt : null,
      changePct: hasPrice ? cp.changePct : null };
  });

  const portfolioValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const unrealizedPL = holdings.reduce((s, h) => s + h.unrealized, 0);
  const priceUnrealizedPL = holdings.reduce((s, h) => s + h.priceUnrealized, 0);
  const fxUnrealizedPL = holdings.reduce((s, h) => s + h.fxUnrealized, 0);
  const netCapitalInvested = totalDeposits - totalWithdrawals;
  const priceReturn = unrealizedPL + realizedPL - totalFees;
  const totalReturn = unrealizedPL + realizedPL + netDividends - totalFees;
  const totalReturnPct = netCapitalInvested ? (totalReturn / netCapitalInvested) * 100 : 0;
  const missingPrices = holdings.filter((h) => !h.hasPrice).length;
  // Negative cash detection per (broker, currency) — allowed, but flagged.
  const negativeCash = [];
  Object.keys(cash).forEach((id) => Object.keys(cash[id]).forEach((c) => {
    if (cash[id][c] < -0.005) negativeCash.push({ brokerId: id, currency: c, amount: cash[id][c], amountMYR: cash[id][c] * curFx(c) });
  }));
  const totalCash = Object.values(brokerCash).reduce((s, c) => s + c, 0);
  const xirrValue = xirrPercent(txns, portfolioValue + totalCash);

  return { totalDeposits, totalWithdrawals, netCapitalInvested, portfolioValue,
    netDividends, unrealizedPL, realizedPL, totalFees, priceUnrealizedPL, fxUnrealizedPL, priceReturn, totalReturn, totalReturnPct,
    holdings, brokerCash, brokerCashByCcy, oversells, missingPrices, negativeCash, xirr: xirrValue, totalCash };
}
/* =============================================================================
 * PERSISTENCE — saves everything to the browser (localStorage) so your data
 * survives reloads. Defaults come from data.js the first time.
 * ========================================================================== */
const STORE_KEY = "il-data-v2";
function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 8); }

function snapshot() {
  return { version: 4, lastSaved: LAST_SAVED,
    BROKERS, HOLDINGS, ALL_TRANSACTIONS, UPCOMING_DIVIDENDS,
    CURRENT_PRICES, STOCK_META, RECON_CHECKS, SETTINGS, USER, FX, PV_HISTORY };
}
function assignObj(target, next) {
  if (!next || typeof next !== "object") return;
  Object.keys(target).forEach((k) => delete target[k]);
  Object.assign(target, next);
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
function saveStore() {
  AUTO_DIV_CACHE_FETCHED = false;  // holdings may have changed — force re-fetch on next mount
  try {
    pruneOrphans();
    recompute();             // T reflects the latest data before we snapshot value
    recordPvSnapshot();
    seedPvHistory();
    LAST_SAVED = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
  } catch (e) {}
}
function replaceArr(arr, next) { arr.length = 0; if (Array.isArray(next)) next.forEach((x) => arr.push(x)); }
function applySnapshot(s) {
  replaceArr(BROKERS, s.BROKERS); replaceArr(HOLDINGS, s.HOLDINGS);
  replaceArr(ALL_TRANSACTIONS, s.ALL_TRANSACTIONS); replaceArr(UPCOMING_DIVIDENDS, s.UPCOMING_DIVIDENDS);
  if (s.PV_HISTORY) replaceArr(PV_HISTORY, s.PV_HISTORY.filter((p) => p.value > 0));
  assignObj(CURRENT_PRICES, s.CURRENT_PRICES); assignObj(RECON_CHECKS, s.RECON_CHECKS);
  assignObj(STOCK_META, s.STOCK_META);
  if (s.SETTINGS) Object.assign(SETTINGS, s.SETTINGS);
  if (s.USER) Object.assign(USER, s.USER);
  if (s.lastSaved) LAST_SAVED = s.lastSaved;
  if (s.FX) {
    if (s.FX.base) FX.base = s.FX.base;
    if (s.FX.rates) { Object.keys(FX.rates).forEach((k) => delete FX.rates[k]); Object.assign(FX.rates, s.FX.rates); }
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

/* ─── Dividend schedule (Finnhub) ──────────────────────────────────────────── */
// In-memory cache of auto-fetched upcoming dividends, keyed by ticker.
// Shape: { [ticker]: [{date (exDate), payDate, amount, currency}] }
// NOT persisted — refreshed on first visit after each saveStore().
let AUTO_DIV_CACHE = {};
let AUTO_DIV_CACHE_FETCHED = false;  // prevent the fetch→render→mount→fetch infinite loop

/* Fetch upcoming dividends for one US ticker from Finnhub via our proxy.
 * Returns array or null. Only runs for plain tickers (no ".KL", ".SI", etc.). */
async function fetchFinnhubDivs(ticker) {
  if (!LIVE_ENABLED || ticker.includes(".")) return null;
  const today = todayISO();
  const futureDate = new Date(today.replace(/-/g, "/"));
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const to = futureDate.toISOString().slice(0, 10);
  try {
    const r = await fetch(`/api/dividend?symbol=${encodeURIComponent(ticker)}&from=${today}&to=${to}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data)) return null;
    return data.filter((d) => (d.payDate || d.date) >= today);
  } catch (e) { return null; }
}

/* Populate AUTO_DIV_CACHE for all held US tickers concurrently. */
async function fetchAllDivSchedules() {
  if (AUTO_DIV_CACHE_FETCHED) return false;  // already fresh — skip to avoid render loop
  AUTO_DIV_CACHE_FETCHED = true;              // set before await so concurrent calls short-circuit
  const tickers = [...new Set(T.holdings.filter((h) => !h.ticker.includes(".")).map((h) => h.ticker))];
  await Promise.all(tickers.map(async (ticker) => {
    const divs = await fetchFinnhubDivs(ticker);
    if (divs && divs.length) AUTO_DIV_CACHE[ticker] = divs;
    else delete AUTO_DIV_CACHE[ticker];
  }));
  return true;
}

/* Merge all upcoming dividend sources into one sorted list.
 * Sources: UPCOMING_DIVIDENDS (manual MY), AUTO_DIV_CACHE (Finnhub US), and
 * any legacy ALL_TRANSACTIONS rows still carrying status="Expected". */
function allUpcomingDivs() {
  const today = todayISO();
  const toMYR = (net, ccy) => net * (FX.rates[ccy] || 1);

  const manual = UPCOMING_DIVIDENDS.map((d) => {
    const h = T.holdings.find((x) => x.ticker === d.ticker);
    const expectedNet = (d.amtPerShare || 0) * (h ? h.shares : 0);
    return { ticker: d.ticker, brokerId: d.brokerId, exDate: d.exDate, payDate: d.payDate,
      currency: d.currency, expectedNet, expectedNetMYR: toMYR(expectedNet, d.currency),
      status: "Estimated", _id: d.id };
  });

  const auto = Object.entries(AUTO_DIV_CACHE).flatMap(([ticker, divs]) =>
    divs.filter((d) => (d.payDate || d.date) >= today).map((div) => {
      const h = T.holdings.find((x) => x.ticker === ticker);
      const ccy = div.currency || "USD";
      const expectedNet = (div.amount || 0) * (h ? h.shares : 0);
      return { ticker, brokerId: h ? h.brokerId : "—", exDate: div.date,
        payDate: div.payDate || div.date, currency: ccy,
        expectedNet, expectedNetMYR: toMYR(expectedNet, ccy), status: "Confirmed" };
    })
  );

  const legacy = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status === "Expected")
    .map((x) => ({ ticker: x.ticker, brokerId: x.brokerId, exDate: x.exDate, payDate: x.payDate,
      currency: x.currency, expectedNet: (+x.gross || 0) - (+x.tax || 0),
      expectedNetMYR: divNetMYR(x), status: "Expected" }));

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
          <span class="ac-sym">${r.symbol}</span>
          <span class="ac-name">${r.name || ""}</span>
          <span class="ac-exch">${r.exchange || ""}</span></button>`).join("");
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
  if (!q) { if (statusEl) { statusEl.innerHTML = `⚠️ ${t("Couldn't fetch")} ${symbol} — ${t("check the code, or that /api is deployed on Vercel.")}`; statusEl.className = "lookup-status warn"; } return; }

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
  if (q.currency) CURRENT_PRICES[q.symbol || symbol] = { price: +q.price, currency: q.currency, date: new Date().toISOString().slice(0, 10), source: "live", fetchedAt: new Date().toISOString(), changePct: q.changePct };
  if (statusEl) {
    statusEl.innerHTML = opts.showPrice === false
      ? `✓ ${q.name || q.symbol}`                                                  // dividend: company only, price is irrelevant
      : `✓ ${q.name || q.symbol} · ${q.currency || ""} ${fmt(q.price)} <span class="live-price">${t("Live")}</span>`;
    statusEl.className = "lookup-status ok";
  }
}

/* Update a single holding's price from the market. Returns true on success. */
async function refreshLivePrice(ticker) {
  const q = await fetchQuote(ticker);
  if (!q) return false;
  CURRENT_PRICES[ticker] = {
    price: +q.price, currency: q.currency || (CURRENT_PRICES[ticker] && CURRENT_PRICES[ticker].currency) || FX.base,
    date: new Date().toISOString().slice(0, 10), source: "live",
    fetchedAt: new Date().toISOString(), changePct: q.changePct,
  };
  return true;
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
    `<th class="${h.num ? "num" : ""}">${h.label}</th>`).join("")}</tr></thead>`;
  // Show a friendly placeholder row when there are no records yet.
  const body = (rows && rows.trim())
    ? rows
    : `<tr><td colspan="${headers.length}" class="empty" style="padding:28px 12px">${t("Nothing to show yet.")}</td></tr>`;
  return `<div class="table-wrap"><table class="data-table">${thead}<tbody>${body}</tbody></table></div>`;
}

function statusBadge(s) {
  const map = { Confirmed: "confirmed", Estimated: "warn", Paid: "pos", Cancelled: "neg", Unknown: "subtle", Received: "pos", Expected: "warn" };
  return `<span class="badge ${map[s] || "subtle"}">${s}</span>`;
}
function typeChip(t) {
  const c = { Buy: "pos", Sell: "neg", Dividend: "confirmed", Deposit: "subtle",
    Withdrawal: "warn", Fee: "neg", "DRIP / Reinvested": "confirmed", "Currency Exchange": "subtle",
    "Stock Split": "subtle", Adjustment: "subtle" }[t] || "subtle";
  return `<span class="badge ${c}">${t}</span>`;
}

function lineChartSVG(series) {
  if (!series || series.length === 0) return emptyState(t("No portfolio history yet."));
  if (series.length === 1) series = [series[0], { ...series[0], month: "", date: "" }];

  const W = 640, H = 240, padL = 52, padR = 16, padT = 16, padB = 28;
  const nwVals = series.map((d) => d.value);
  const pVals = series.map((d) => d.principal || 0);
  const allVals = [...nwVals, ...pVals];

  let lo = Math.min(...allVals), hi = Math.max(...allVals);
  if (hi - lo < 1e-9) { const pad = Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad; }
  else { const m = (hi - lo) * 0.06; lo -= m; hi += m; }
  if (lo < 0 && Math.min(...allVals) >= 0) lo = 0;

  const min = lo, max = hi;
  const xFn = (i) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const yFn = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const nwLine = series.map((d, i) => `${i ? "L" : "M"}${xFn(i).toFixed(1)},${yFn(d.value).toFixed(1)}`).join(" ");
  const pLine = series.map((d, i) => `${i ? "L" : "M"}${xFn(i).toFixed(1)},${yFn(d.principal || 0).toFixed(1)}`).join(" ");
  const xEnd = xFn(series.length - 1).toFixed(1);
  const yBot = (H - padB).toFixed(1);

  // Clip paths: region below each line (for fill-between)
  const clipNWPath = `${nwLine} L${xEnd},${yBot} L${padL},${yBot} Z`;
  const clipPPath = `${pLine} L${xEnd},${yBot} L${padL},${yBot} Z`;

  // "above-principal" area, clipped to "below-NW" → green zone (NW > principal)
  const pRev = series.slice().reverse().map((d, ri) =>
    `L${xFn(series.length - 1 - ri).toFixed(1)},${yFn(d.principal || 0).toFixed(1)}`).join(" ");
  const pTopArea = `M${padL},${padT} L${xEnd},${padT} ${pRev} Z`;

  // "above-NW" area, clipped to "below-principal" → red zone (principal > NW)
  const nwRev = series.slice().reverse().map((d, ri) =>
    `L${xFn(series.length - 1 - ri).toFixed(1)},${yFn(d.value).toFixed(1)}`).join(" ");
  const nwTopArea = `M${padL},${padT} L${xEnd},${padT} ${nwRev} Z`;

  const ylab = (v) => max >= 10000 ? Math.round(v / 1000) + "k" : (max >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v));
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
    return `<circle cx="${cx}" cy="${cy}" r="${i === series.length - 1 ? 4 : 2.5}" class="dot"/>
<circle cx="${cx}" cy="${cy}" r="12" class="dot-hit" data-date="${d.date}" data-val="${d.value}" fill="transparent" stroke="none"/>`;
  }).join("");

  const lx = W - padR, lx1 = lx - 28;
  const legend = `
    <line x1="${lx1}" y1="${padT + 5}" x2="${lx}" y2="${padT + 5}" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round"/>
    <text x="${lx1 - 4}" y="${padT + 9}" class="lglab">${t("Net Worth")}</text>
    <line x1="${lx1}" y1="${padT + 17}" x2="${lx}" y2="${padT + 17}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text x="${lx1 - 4}" y="${padT + 21}" class="lglab">${t("Principal Invested")}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Portfolio value over time")}">
    <defs>
      <clipPath id="clip-nw"><path d="${clipNWPath}"/></clipPath>
      <clipPath id="clip-p"><path d="${clipPPath}"/></clipPath>
    </defs>
    <style>
      .grid{stroke:var(--border);stroke-width:1}
      .ylab,.xlab{fill:var(--muted);font-size:11px;font-family:var(--font)}
      .ylab{text-anchor:end}.xlab{text-anchor:middle}
      .lglab{fill:var(--muted);font-size:10px;font-family:var(--font);text-anchor:end}
      .ln-nw{fill:none;stroke:var(--brand);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
      .ln-p{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5,4;stroke-linejoin:round;stroke-linecap:round}
      .dot{fill:var(--brand)}.dot-hit{cursor:pointer}
    </style>
    ${grid}
    <path d="${pTopArea}" fill="rgba(34,197,94,.18)" clip-path="url(#clip-nw)"/>
    <path d="${nwTopArea}" fill="rgba(220,38,38,.18)" clip-path="url(#clip-p)"/>
    <path d="${pLine}" class="ln-p"/>
    <path d="${nwLine}" class="ln-nw"/>
    ${dots}${xlabs}${legend}
  </svg>`;
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
    const d = el.dataset.date, v = +el.dataset.val;
    tip.innerHTML = d
      ? `<div class="ct-date">${fmtDate(d)}</div><div class="ct-val">${money(v)}</div>`
      : `<div class="ct-val">${money(v)}</div>`;
    const r = el.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + "px";
    tip.style.top = (r.top) + "px";
    tip.hidden = false;
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
function donutHTML(slices, centerLabel, centerValue) {
  slices = (slices || []).filter((s) => s.value > 0);
  if (!slices.length) return emptyState(t("No holdings yet. Add a buy transaction to create your first holding."));
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
  const tableRows = sorted.map((r) => `<tr><td>${r.label}</td><td class="num">${money(r.value)}</td>
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

/* Portfolio Health panel — objective analytics only. */
function insightsHTML() {
  const hp = portfolioHealth();
  const howHint = `<span class="calc-hint">ⓘ ${t("how")}</span>`;
  const card = (id, label, val, sub) => `<div class="mini-card ph-card" id="${id}"><div class="mc-label">${label}${howHint}</div><div class="mc-value">${val}</div>${sub ? `<div class="mc-sub muted">${sub}</div>` : ""}</div>`;
  return panel("Portfolio Health", `<div class="mini-cards">
    ${card("phDivYield", t("Dividend Yield (TTM)"), hp.yieldEst != null ? fmt(hp.yieldEst, { maximumFractionDigits: 2 }) + "%" : "—")}
    ${card("phCashAlloc", t("Cash Allocation"), hp.cashAlloc != null ? fmt(hp.cashAlloc, { maximumFractionDigits: 1 }) + "%" : "—", t("of total net value"))}
    ${card("phDivScore", t("Diversification Score"), T.holdings.length >= 2 ? `${hp.divScore}/100` : "—", T.holdings.length >= 2 ? `${fmt(hp.effectiveN, { maximumFractionDigits: 1 })} ${t("effective holdings")}` : t("Add more holdings to score"))}
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

  // Latest "prices as of" date across priced holdings (market-data freshness, NOT the save time).
  const priceDates = T.holdings.filter((h) => h.hasPrice && h.currentPriceDate).map((h) => h.currentPriceDate).sort();
  const pricesAsOf = priceDates.length ? priceDates[priceDates.length - 1] : null;

  const holdingsRows = [...T.holdings].sort((a, b) => b.marketValue - a.marketValue).slice(0, 8).map((h) => `
    <tr><td><a class="ticker ticker-link" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">${h.ticker}</a><div class="sub">${h.company || ""}</div></td>
      <td><span class="chip">${brokerName(h.brokerId)}</span></td><td class="sub">${h.market || "—"}</td>
      <td class="num">${fmt(h.shares, { maximumFractionDigits: 4 })}</td>
      <td class="num">${money(h.avgCost)}</td>
      <td class="num">${h.hasPrice ? `${h.currentPriceCcy} ${fmt(h.currentPrice)}<div class="fx-note ${h.priceSource === "live" ? "live-price" : "manual-price"}">${h.priceSource === "live" ? t("Live") : t("Manual price")}</div>` : `<span class="muted">—</span>`}</td>
      <td class="num">${money(h.marketValue)}</td>
      <td class="num ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? signed(h.unrealized) : `<span class="muted">—</span>`}${h.hasPrice ? `<div class="fx-note ${cls(h.unrealized)}">${pctTxt(h.unrealizedPct)}</div>` : ""}</td>
      <td class="num">${fmt(h.netDividends)}</td><td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td></tr>`).join("");

  // Upcoming dividends — manual (UPCOMING_DIVIDENDS), auto-fetched (AUTO_DIV_CACHE), and legacy Expected.
  const upcoming = allUpcomingDivs();
  const divRows = upcoming.map((d) => {
    const du = daysUntil(d.payDate);
    const dlabel = d.payDate ? (du >= 0 ? `${du} ${t("days")}` : t("overdue")) : "—";
    return `<tr><td class="ticker">${d.ticker}</td><td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td>
      <td class="num">${dlabel}</td>
      <td class="num">${d.currency} ${fmt(d.expectedNet)}</td><td>${statusBadge(d.status)}</td></tr>`;
  }).join("");

  const recentRows = ALL_TRANSACTIONS.slice(0, 6).map((tx) => `<tr><td>${fmtDate(tx.date)}</td><td>${typeChip(tx.type)}</td>
    <td class="ticker">${tx.ticker || "—"}</td><td class="sub">${brokerName(tx.brokerId)}</td>
    <td class="num">${tx.currency} ${fmt(tx.gross != null ? tx.gross : 0)}</td></tr>`).join("");

  // In-card return-mode toggle (controls the Total P/L figure).
  const toggle = `<div class="seg seg-sm" role="group" aria-label="${t("Return mode")}">
    <button class="seg-btn ${SETTINGS.returnMode !== "price" ? "on" : ""}" data-return="total">${t("Total")}</button>
    <button class="seg-btn ${SETTINGS.returnMode === "price" ? "on" : ""}" data-return="price">${t("Price")}</button></div>`;

  // Calc breakdowns (click a stat to see "how").
  const calcs = {
    nw: { title: "Net Worth", rows: [
      { op: "+", label: "Current Portfolio Value", val: fmt(T.portfolioValue) },
      { op: "+", label: "Available cash (all brokers)", val: fmt(T.totalCash || 0) }], total: netWorth },
    pl: { title: returnIsTotal ? "Total Return" : "Price Return", rows: [
      { op: "+", label: "Unrealized P/L", val: signed(T.unrealizedPL) },
      { op: "+", label: "Realized P/L", val: signed(T.realizedPL) },
      ...(returnIsTotal ? [{ op: "+", label: "Net Dividends", val: signed(T.netDividends) }] : []),
      { op: "−", label: "Total Fees", val: fmt(T.totalFees) }], total: shownReturn },
    cash: (() => {
      const cf = cashFlow;
      const flow = cf.deposits - cf.withdrawals - cf.buys + cf.sells + cf.divs + cf.interest - cf.fees - cf.taxes;
      const fxAdj = (T.totalCash || 0) - flow;
      let rows = [
        { on: cf.deposits, op: "+", label: "Deposits", val: fmt(cf.deposits) },
        { on: cf.withdrawals, op: "−", label: "Withdrawals", val: fmt(cf.withdrawals) },
        { on: cf.buys, op: "−", label: "Buys (incl. fees & tax)", val: fmt(cf.buys) },
        { on: cf.sells, op: "+", label: "Sells (net of fees)", val: fmt(cf.sells) },
        { on: cf.divs, op: "+", label: "Net dividends received", val: fmt(cf.divs) },
        { on: cf.interest, op: "+", label: "Interest / cash yield", val: fmt(cf.interest) },
        { on: cf.fees, op: "−", label: "Standalone fees", val: fmt(cf.fees) },
        { on: cf.taxes, op: "−", label: "Tax withholding", val: fmt(cf.taxes) },
        { on: Math.abs(fxAdj) > 0.005, op: fxAdj >= 0 ? "+" : "−", label: "FX revaluation of foreign cash", val: fmt(Math.abs(fxAdj)) },
      ].filter((r) => r.on).map(({ op, label, val }) => ({ op, label, val }));
      // Fallback so the breakdown is never blank: only brokers that actually hold cash, else a plain note.
      if (!rows.length) rows = BROKERS
        .filter((b) => Math.abs(T.brokerCash[b.id] || 0) > 0.005)
        .map((b) => ({ op: "+", label: b.name, val: fmt(T.brokerCash[b.id] || 0) }));
      if (!rows.length) rows = [{ op: "+", label: "No cash movements recorded yet", val: fmt(0) }];
      return { title: "Available Cash", rows, total: T.totalCash || 0 };
    })(),
    principal: { title: "Net Capital Invested", rows: [
      { op: "+", label: "Total Deposits", val: fmt(T.totalDeposits) },
      { op: "−", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) }], total: T.netCapitalInvested },
  };

  const statHead = (label, right) => `<div class="stat-head"><span class="stat-label">${label}</span>${right || ""}</div>`;
  const howHint = `<span class="calc-hint">ⓘ ${t("how")}</span>`;
  const metrics = `<section class="metrics">
    <article class="stat net" data-card="nw" tabindex="0" role="button" aria-label="${t("Net Worth")}, show calculation">
      ${statHead(t("Net Worth"), howHint)}
      <div class="stat-value">${money(netWorth)}</div>
      <div class="stat-sub muted">${t("Holdings")} ${money(T.portfolioValue)} · ${t("Cash")} ${money(T.totalCash || 0)}</div>
    </article>
    <article class="stat pl ${up ? "is-up" : dn ? "is-down" : ""}" data-card="pl" tabindex="0" role="button" aria-label="${returnIsTotal ? t("Total P/L") : t("Price P/L")}, show calculation">
      ${statHead(returnIsTotal ? t("Total P/L") : t("Price P/L"), toggle)}
      <div class="stat-value ${up ? "pos" : dn ? "neg" : ""}">${up ? "▲ " : dn ? "▼ " : ""}${signed(shownReturn)}</div>
      <div class="stat-sub ${up ? "pos" : dn ? "neg" : "muted"}">${up || dn ? pctTxt(shownPct) : fmt(Math.abs(shownPct), {maximumFractionDigits:2}) + "%"} · ${t("on net capital")}</div>
    </article>
    <article class="stat" data-card="cash" tabindex="0" role="button" aria-label="${t("Available Cash")}, show calculation">
      ${statHead(t("Available Cash"), howHint)}
      <div class="stat-value">${money(T.totalCash || 0)}</div>
      <div class="stat-sub muted">${t("Across all brokers")}</div>
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
    ${T.holdings.length ? `<div class="dash-asof">
      ${pricesAsOf
        ? `<span class="muted">${t("Prices as of")} ${fmtDate(pricesAsOf)}</span><button class="btn ghost small" id="dashUpdatePrices">↻ ${t("Update prices")}</button>`
        : `<span class="muted">${t("No prices set yet")}</span><button class="btn ghost small" id="dashUpdatePrices">↻ ${t("Update prices")}</button>`}
    </div>` : ""}
    <section class="warn-wrap">${warningsHTML()}</section>
    <section class="grid-2 dash-charts">
      ${panel("Portfolio Value Over Time", (() => {
        const series = PV_HISTORY
          .map((p) => ({ month: p.date.slice(5), date: p.date, value: p.value, principal: p.principal != null ? p.principal : p.value }))
          .filter((p) => p.value > 0 || p.principal > 0);
        return series.length >= 1
          ? `<div class="chart">${lineChartSVG(series)}</div><p class="muted" style="font-size:11px;margin:6px 0 0">${t("Captured once per day when you use the app.")}</p>`
          : emptyState(t("Record your first deposit or Buy to start tracking."));
      })())}
      ${panel("Asset Allocation", donutHTML(T.holdings.map((h) => ({ label: h.ticker, value: h.marketValue })), "Portfolio", money(T.portfolioValue).replace(".00","")), `<span class="badge subtle">${t("By market value")}</span>`)}
    </section>
    <div id="dashDivSection">${listPanel("Upcoming Dividends", upcoming.length,
      table([{label:"Ticker"},{label:"Ex-Date"},{label:"Payment"},{label:"Days"},{label:"Expected Net",num:1},{label:"Status"}], divRows),
      t("No upcoming dividends."), `<a class="link" href="#/dividends">${t("Calendar")} →</a>`)}</div>
    ${listPanel("Top Holdings", T.holdings.length,
      table([{label:"Holding"},{label:"Broker"},{label:"Market"},{label:"Shares",num:1},{label:"Avg Cost",num:1},{label:"Current Price",num:1},{label:"Market Value",num:1},{label:"Unrealized P/L",num:1},{label:"Net Div",num:1},{label:"Total Return",num:1}], holdingsRows),
      t("No holdings yet — add a Buy to get started."), `<a class="link" href="#/portfolio">${t("View all")} →</a>`)}
    ${listPanel("Recent Activity", ALL_TRANSACTIONS.length,
      table([{label:"Date"},{label:"Type"},{label:"Ticker"},{label:"Broker"},{label:"Amount",num:1}], recentRows),
      t("No activity yet."), `<a class="link" href="#/records">${t("All")} →</a>`)}
    ${insightsHTML()}
    <p class="dash-footnote muted">${LAST_SAVED ? `${t("Last saved on this device")}: ${fmtDateTime(LAST_SAVED)}` : t("Nothing saved yet")}</p>`;

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
      // Update market prices for all holdings (separate from the data save time)
      const upBtn = $("#dashUpdatePrices");
      if (upBtn) upBtn.addEventListener("click", async () => {
        if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
        upBtn.disabled = true; upBtn.textContent = "… " + t("Fetching prices");
        const tickers = [...new Set(T.holdings.map((h) => h.ticker))];
        let ok = 0;
        for (const tk of tickers) { if (await refreshLivePrice(tk)) ok++; }
        saveStore(); render();
        toast(ok ? `${ok}/${tickers.length} ${t("prices updated")}` : t("Couldn't fetch prices — check the ticker symbols (Yahoo format)."));
      });
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
      const st = $("#startTour");
      if (st) st.addEventListener("click", () => startTour());
      // Auto-launch the tour once for brand-new users
      let tourDone = false;
      try { tourDone = localStorage.getItem("il-tour-done") === "1"; } catch (e) {}
      if (isEmpty && !tourDone && tourIdx < 0 && !TOUR_SEEN) {
        TOUR_SEEN = true; setTimeout(startTour, 500);
      }
      // Auto-fetch Finnhub dividend schedules for US holdings; re-render if still here
      if (LIVE_ENABLED) {
        fetchAllDivSchedules().then((fetched) => {
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
    <div class="form-actions">
      <button class="btn primary" id="startTour">▶ ${t("Start the guided tour")}</button>
      <span class="muted" style="align-self:center">${done} / ${steps.length} ${t("steps done")}</span>
    </div>`);
}

function dashboardCards() {
  const depRows = ALL_TRANSACTIONS.filter((x) => x.type === "Deposit");
  const wdrRows = ALL_TRANSACTIONS.filter((x) => x.type === "Withdrawal");
  const txFx = (x) => (x.fxRate != null && x.fxRate !== "" ? +x.fxRate : (FX.rates[x.currency] || 1));
  const returnIsTotal = SETTINGS.returnMode !== "price";
  const shownReturn = returnIsTotal ? T.totalReturn : T.priceReturn;
  const shownPct = T.netCapitalInvested ? (shownReturn / T.netCapitalInvested) * 100 : 0;

  return [
    { label: "Total Deposits", value: money(T.totalDeposits), sub: tip("Cash put into brokers", "Net Capital Invested = Deposits − Withdrawals"),
      calc: { title: "Total Deposits", rows: depRows.map((c) => ({
        op: "+", label: `${brokerName(c.brokerId)} · ${c.currency} ${fmt(c.gross)}${c.currency !== FX.base ? ` × ${txFx(c)}` : ""}`, val: fmt((+c.gross || 0) * txFx(c)) })), total: T.totalDeposits } },
    { label: "Total Withdrawals", value: money(T.totalWithdrawals), sub: "Cash taken out",
      calc: { title: "Total Withdrawals", rows: wdrRows.map((c) => ({
        op: "+", label: `${brokerName(c.brokerId)} · ${c.currency} ${fmt(c.gross)}`, val: fmt((+c.gross || 0) * txFx(c)) })), total: T.totalWithdrawals } },
    { label: "Net Capital Invested", value: money(T.netCapitalInvested), sub: tip("Deposits − Withdrawals", "Money you have actually committed, net of cash taken back out."),
      calc: { title: "Net Capital Invested", rows: [{ op: "+", label: "Total Deposits", val: fmt(T.totalDeposits) }, { op: "−", label: "Total Withdrawals", val: fmt(T.totalWithdrawals) }], total: T.netCapitalInvested } },
    { label: "Current Portfolio Value", value: money(T.portfolioValue), sub: T.missingPrices ? `${T.missingPrices} ${t("holdings without a current price")}` : "Market value of holdings",
      calc: { title: "Current Portfolio Value", rows: T.holdings.map((h) => ({ op: "+",
        label: `${h.ticker} · ${fmt(h.shares, { maximumFractionDigits: 4 })}${h.hasPrice ? ` × ${h.currentPriceCcy} ${fmt(h.currentPrice)}` : ` (${t("no price")})`}`, val: fmt(h.marketValue) })), total: T.portfolioValue } },
    { label: "Net Dividends Received", value: money(T.netDividends), sub: tip("After withholding tax", "Net Dividends = Gross dividends − withholding tax"),
      calc: { title: "Net Dividends Received (after tax)", rows: T.holdings.filter((h) => h.netDividends).map((h) => ({ op: "+", label: h.ticker, val: fmt(h.netDividends) })), total: T.netDividends } },
    { label: returnIsTotal ? "Total Return" : "Price Return", value: money(shownReturn), feature: true,
      sub: tip(`${pctTxt(shownPct)} on net capital invested`, returnIsTotal ? "Total Return = Unrealized P/L + Realized P/L + Net Dividends − fees" : "Price Return = Unrealized P/L + Realized P/L − fees (excludes dividends)"),
      badge: { text: pctTxt(shownPct), cls: shownReturn >= 0 ? "pos" : "neg" }, valCls: cls(shownReturn),
      calc: { title: returnIsTotal ? "Total Return" : "Price Return", rows: [
        { op: "+", label: "Unrealized P/L", val: signed(T.unrealizedPL) },
        { op: "+", label: "Realized P/L", val: signed(T.realizedPL) },
        ...(returnIsTotal ? [{ op: "+", label: "Net Dividends", val: signed(T.netDividends) }] : []),
        { op: "−", label: "Total Fees", val: fmt(T.totalFees) }], total: shownReturn } },
    { label: "Unrealized / Realized P/L", value: `${signed(T.unrealizedPL)}`, valCls: cls(T.unrealizedPL), sub: `Realized: ${money(T.realizedPL)}`,
      calc: { title: "Profit / Loss", rows: [
        { op: "+", label: "Unrealized P/L (current value − remaining cost basis)", val: signed(T.unrealizedPL) },
        { op: "+", label: "Realized P/L (proceeds − cost basis of sold − fees)", val: signed(T.realizedPL) }], total: T.unrealizedPL + T.realizedPL } },
    { label: "XIRR", value: T.xirr == null ? "—" : pctTxt(T.xirr), valCls: T.xirr == null ? "" : cls(T.xirr),
      sub: tip("Money-weighted annual return", "XIRR = the annual rate that makes the net present value of your dated deposits, withdrawals and today's account value equal zero."),
      calc: { title: "XIRR (money-weighted return)", rows: [
        { op: "•", label: "Deposits = cash in (−), Withdrawals = cash out (+)", val: "" },
        { op: "•", label: "Terminal value today = holdings + cash", val: fmt(T.portfolioValue + (T.totalCash || 0)) },
        { op: "•", label: "Solved so discounted flows net to 0", val: "" }],
        total: T.xirr == null ? 0 : T.xirr, totalFmt: T.xirr == null ? t("Not enough cash-flow history") : pctTxt(T.xirr) } },
  ];
}

// Inline tooltip wrapper (uses native title for accessibility + an ⓘ marker).
function tip(text, explain) {
  return `${text} <span class="tip" tabindex="0" role="note" title="${explain.replace(/"/g, "&quot;")}" aria-label="${explain.replace(/"/g, "&quot;")}">ⓘ</span>`;
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
      items.push({ level: "crit", html: `<strong>${t("Cash difference")} — ${brokerName(bid)}.</strong> ${t("Calculated")} ${money(calc)} ${t("vs actual")} ${money(+chk.actual)} (${t("difference")} ${money(Math.abs(diff))}). ${t("Check for a missing fee, dividend or transfer.")}` });
    }
  });
  // Negative cash balance per (broker, currency)
  (T.negativeCash || []).forEach((n) => items.push({ level: "crit", html:
    `<strong>${t("Negative cash balance")} — ${brokerName(n.brokerId)}: ${n.currency} ${fmt(n.amount)} (${money(n.amountMYR)}).</strong> ${t("A buy, fee or withdrawal exceeds the cash recorded for this broker. Add a deposit or check the entries.")}` }));
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
    <span class="w-ico">${it.level === "crit" ? "⚠️" : "ⓘ"}</span><div class="w-body">${it.html}</div></div>`).join("");
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
  return order.map((c) => ({ value: c, label: c }));
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
    `<button type="button" class="sel-opt sel-search-opt" data-val="${code}"><span class="sel-sym">${code}</span><span class="sel-name">${name}</span></button>`).join("");
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
            <label id="ohFxField">${t("FX rate to")} ${FX.base}<input type="number" step="any" name="openingFxRate" placeholder="1.0"></label>
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
const portfolioFilters = { broker: "", market: "", currency: "", pl: "" };

function pagePortfolio() {
  const has = T.holdings.length > 0;
  const markets = [...new Set(T.holdings.map((h) => h.market))].filter(Boolean);
  const currencies = [...new Set(T.holdings.map((h) => h.currency))].filter(Boolean);

  const filterBar = `<div class="filters">
    ${styledSelect("fBroker", [{ value: "", label: t("All brokers") }, ...BROKERS.map((b) => ({ value: b.id, label: b.name }))], portfolioFilters.broker, { id: "fBroker" })}
    ${styledSelect("fMarket", [{ value: "", label: t("All markets") }, ...markets.map((m) => ({ value: m, label: m }))], portfolioFilters.market, { id: "fMarket" })}
    ${styledSelect("fCurrency", [{ value: "", label: t("All currencies") }, ...currencies.map((c) => ({ value: c, label: c }))], portfolioFilters.currency, { id: "fCurrency" })}
    ${styledSelect("fPL", [{ value: "", label: t("All P/L") }, { value: "pos", label: t("Profit") }, { value: "neg", label: t("Loss") }], portfolioFilters.pl, { id: "fPL" })}
    <button class="btn ghost" id="fReset">${t("Reset")}</button></div>`;

  // Breakdowns are supporting context — only worth showing when there are 2+ slices to compare.
  const distinctBrokers = new Set(T.holdings.map((h) => h.brokerId)).size;
  const distinctCcy = new Set(T.holdings.map((h) => h.currency)).size;
  const breakdowns =
    (distinctBrokers >= 2 ? panel("Holdings by Broker", donutHTML(groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.marketValue), "", "")) : "")
    + (distinctCcy >= 2 ? panel("Holdings by Currency", donutHTML(groupSum(T.holdings, (h) => h.currency, (h) => h.marketValue), "", "")) : "");

  const emptyContent = BROKERS.length
    ? `<div class="portfolio-empty">
         <p class="pe-msg">${t("No holdings yet — record a Buy on the Add page and it appears here automatically.")}</p>
         <a class="btn primary" href="#/add"><svg class="icon" aria-hidden="true" style="width:14px;height:14px;flex:none"><use href="#i-add"/></svg>${t("Record your first Buy")}</a>
       </div>`
    : `<div class="portfolio-empty">
         <p class="pe-msg">${t("Add a broker first (More → Brokers), then record a Buy and it appears here.")}</p>
         <a class="btn ghost" href="#/brokers">${t("Go to Brokers")}</a>
       </div>`;

  const html = has
    ? `${panel("All Holdings", filterBar + `<div id="holdingsBody">${portfolioTable()}</div>`,
          `<button class="btn" id="refreshPrices">⟳ ${t("Refresh live prices")}</button>`)}
       ${breakdowns ? `<section class="portfolio-breakdowns">${breakdowns}</section>` : ""}`
    : panel("Holdings", emptyContent);

  return { title: "Portfolio", subtitle: LANG === "zh"
      ? `${T.holdings.length} 个持仓，${BROKERS.length} 个券商 · ${money(T.portfolioValue)}`
      : `${plural(T.holdings.length, "holding", "holdings")} across ${plural(BROKERS.length, "broker", "brokers")} · ${money(T.portfolioValue)}`, html,
    mount() {
      const apply = () => { const hb = $("#holdingsBody"); if (hb) hb.innerHTML = portfolioTable(); };
      const onFilter = (id, key) => { const el = $(id); if (el) el.addEventListener("change", (e) => { portfolioFilters[key] = e.target.value; apply(); }); };
      onFilter("#fBroker", "broker"); onFilter("#fMarket", "market"); onFilter("#fCurrency", "currency"); onFilter("#fPL", "pl");
      const fr = $("#fReset");
      if (fr) fr.addEventListener("click", () => { Object.keys(portfolioFilters).forEach((k) => (portfolioFilters[k] = "")); render(); });
      // Refresh ALL holdings from the market
      const rp = $("#refreshPrices");
      if (rp) rp.addEventListener("click", async () => {
        if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
        rp.disabled = true; rp.textContent = "… " + t("Fetching prices");
        const tickers = [...new Set(T.holdings.map((h) => h.ticker))];
        let ok = 0;
        for (const tk of tickers) { if (await refreshLivePrice(tk)) ok++; }
        saveStore(); render();
        toast(ok ? `${ok}/${tickers.length} ${t("prices updated")}` : t("Couldn't fetch prices — check the ticker symbols (Yahoo format)."));
      });
      // Delegated actions (survive table re-renders): live fetch, set price, delete
      const holdBody = $("#holdingsBody");
      if (holdBody) holdBody.addEventListener("click", async (e) => {
        const lbtn = e.target.closest("[data-live-holding]");
        if (lbtn) {
          if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
          const tk = lbtn.dataset.liveHolding;
          lbtn.classList.add("spin");
          const ok = await refreshLivePrice(tk);
          if (ok) { saveStore(); toast(`${tk} ${t("updated")}`); render(); }
          else { lbtn.classList.remove("spin"); toast(`${t("Couldn't fetch")} ${tk} — ${t("check the symbol (e.g. AAPL, 1155.KL).")}`); }
          return;
        }
        const pbtn = e.target.closest("[data-price-holding]");
        if (pbtn) {
          const [ticker, ccy] = pbtn.dataset.priceHolding.split("|");
          const cur = CURRENT_PRICES[ticker];
          const input = prompt(`${t("Current price per share for")} ${ticker} (${ccy}) — ${t("manual, not live")}`, cur ? cur.price : "");
          if (input == null) return;
          const price = parseFloat(input);
          if (!(price > 0)) { toast(t("Enter a valid price.")); return; }
          CURRENT_PRICES[ticker] = { price, currency: ccy, date: new Date().toISOString().slice(0, 10), source: "manual" };
          saveStore(); toast(t("Price updated")); render();
          return;
        }
        const dbtn = e.target.closest("[data-del-holding]");
        if (!dbtn) return;
        const [ticker, brokerId] = dbtn.dataset.delHolding.split("|");
        const i = HOLDINGS.findIndex((h) => h.ticker === ticker && h.brokerId === brokerId);
        if (i >= 0) {
          if (!confirm(t("Remove this opening holding?"))) return;
          HOLDINGS.splice(i, 1);
          saveStore(); toast(t("Holding removed")); render();
        } else {
          toast(t("This holding comes from your transactions — delete the related transactions to remove it."));
        }
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
    ? t("No holdings match these filters.")
    : t("No holdings yet. Add a buy transaction to create your first holding."));
  const pv = T.portfolioValue || 0;
  const body = rows.map((h) => {
    const alloc = pv ? (h.marketValue / pv) * 100 : 0;
    const isLive = h.priceSource === "live";
    const priceTag = isLive
      ? `<div class="fx-note live-price">${t("Live")} · ${h.priceFetchedAt ? fmtDateTime(h.priceFetchedAt) : fmtDate(h.currentPriceDate)}</div>`
      : `<div class="fx-note manual-price">${t("Manual price")} · ${fmtDate(h.currentPriceDate)}</div>`;
    const priceCell = h.hasPrice
      ? `${h.currentPriceCcy} ${fmt(h.currentPrice)}${priceTag}`
      : `<span class="muted">—</span><div class="fx-note">${t("No price set")}</div>`;
    return `<tr>
      <td><a class="ticker ticker-link" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">${h.ticker}</a><div class="sub">${h.company || ""}</div></td>
      <td><span class="chip">${brokerName(h.brokerId)}</span>${h.market ? `<div class="sub">${h.market}</div>` : ""}</td>
      <td class="num">${fmt(h.shares, { maximumFractionDigits: 4 })}</td>
      <td class="num">${money(h.avgCost)}<div class="fx-note">${t("avg, MYR")}</div></td>
      <td class="num">${priceCell}</td>
      <td class="num">${money(h.marketValue)}</td>
      <td class="num">${fmt(alloc, { maximumFractionDigits: 1 })}%</td>
      <td class="num ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? signed(h.unrealized) : `<span class="muted">—</span>`}${h.hasPrice ? `<div class="fx-note ${cls(h.unrealized)}">${pctTxt(h.unrealizedPct)}</div>` : ""}</td>
      <td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}${h.netDividends ? `<div class="fx-note">${t("div.")} ${money(h.netDividends)}</div>` : ""}</td>
      <td class="num">
        <button class="icon-btn row-live" data-live-holding="${h.ticker}" title="${t("Fetch live price")}" aria-label="${t("Fetch live price")}">⟳</button>
        <button class="icon-btn row-price" data-price-holding="${h.ticker}|${h.currentPriceCcy}" title="${t("Set current price")}" aria-label="${t("Set current price")}">＄</button>
        <button class="icon-btn row-del" data-del-holding="${h.ticker}|${h.brokerId}" title="${t("Remove")}" aria-label="${t("Remove")}">✕</button></td></tr>`;
  }).join("");
  return table([{label:"Holding"},{label:"Broker"},{label:"Shares",num:1},{label:"Avg Cost",num:1},{label:"Current Price",num:1},{label:"Market Value",num:1},{label:"Alloc",num:1},{label:"Unrealized P/L",num:1},{label:"Total Return",num:1},{label:"",num:1}], body);
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
  const nav = `<div class="seg records-tabs" role="tablist">${tabs.map(([k, lbl]) =>
    `<button class="seg-btn ${recordsTab === k ? "on" : ""}" data-rectab="${k}">${t(lbl)}</button>`).join("")}</div>`;
  const list = ALL_TRANSACTIONS.filter((x) => recordMatchesTab(x, recordsTab));
  const addBtn = BROKERS.length ? `<a class="btn primary" href="#/add">＋ ${t("Add")}</a>` : "";
  const html = `${nav}
    ${panel("Records", `<div id="recBody">${recordsTable(list)}</div>`, `<span class="badge subtle">${list.length} ${t("records")}</span> ${addBtn}`)}
    ${recordsTab === "cash" ? cashExtrasHTML() : ""}`;

  return { title: "Records", subtitle: "All your transactions, cash and dividends in one ledger.", html,
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
      if (recordsTab === "cash") mountCashExtras();
    } };
}

/* One unified ledger table: base-currency (MYR) primary, original currency noted. */
function recordsTable(list) {
  if (!ALL_TRANSACTIONS.length) return emptyState(t("No transactions yet. Tap ＋ Add to record your first deposit or investment."));
  if (!list.length) return emptyState(t("No records in this view yet."));
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const rows = sorted.map((tx) => {
    const fxr = tx.fxRate || FX.rates[tx.currency] || 1;
    const myr = tx.myrEquivalent != null ? tx.myrEquivalent : (+tx.gross || 0) * fxr;
    const isTrade = tx.type === "Buy" || tx.type === "Sell";
    const detail = isTrade && tx.qty != null
      ? `<div class="sub">${fmt(tx.qty, { maximumFractionDigits: 4 })} @ ${tx.currency} ${fmt(tx.price)}</div>` : "";
    const orig = tx.type === "Currency Exchange"
      ? `${tx.currency} ${fmt(tx.gross || 0)} → ${tx.toCurrency || ""} ${fmt(tx.toAmount || 0)}`
      : `${tx.currency} ${fmt(tx.gross || 0)}${tx.fee ? ` · ${t("fee")} ${fmt(tx.fee)}` : ""}`;
    return `<tr>
      <td>${fmtDate(tx.date)}</td>
      <td>${typeChip(tx.type)}</td>
      <td class="ticker">${tx.ticker && tx.ticker !== "—" ? tx.ticker : "—"}${detail}</td>
      <td class="num">${money(myr)}<div class="fx-note">${orig}</div></td>
      <td class="sub">${brokerName(tx.brokerId)}</td>
      <td class="num"><div class="rec-actions">
        <button class="icon-btn rec-edit" data-edit-tx="${tx.id}" title="${t("Edit")}" aria-label="${t("Edit")}"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn rec-del" data-del-tx="${tx.id}" title="${t("Remove")}" aria-label="${t("Remove")}"><svg class="icon"><use href="#i-trash"/></svg></button></div></td></tr>`;
  }).join("");
  return table([{label:"Date"},{label:"Type"},{label:"Ticker / Detail"},{label:"Amount (MYR)",num:1},{label:"Account"},{label:"",num:1}], rows);
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
  const pill = ([slug, lbl, ico]) => {
    const on = ADD_SLUGS[slug] === activeType;
    const icon = ico ? `<span class="tp-tab-ico"><svg class="icon"><use href="#${ico}"/></svg></span>` : "";
    return `<a class="tp-tab${on ? " on" : ""}" href="#/add/${slug}">${icon}<span>${t(lbl)}</span></a>`;
  };
  const isOther = ADD_OTHER.some(([s]) => ADD_SLUGS[s] === activeType);
  return `<div class="type-selector">
    <div class="type-tabs">${ADD_PRIMARY.map(pill).join("")}</div>
    <details class="type-more"${isOther ? " open" : ""}><summary>${t("Other record types")}</summary>
      <div class="type-tabs sm">${ADD_OTHER.map(pill).join("")}</div></details>
  </div>`;
}

function pageAdd() {
  const editing = editingTxId ? ALL_TRANSACTIONS.find((x) => x.id === editingTxId) : null;
  if (editingTxId && !editing) editingTxId = null;
  const slug = decodeURIComponent((location.hash.split("/")[2] || ""));
  const type = editing ? editing.type : (ADD_SLUGS[slug] || "Buy");   // default to Buy; selector stays visible

  if (editing) {   // focused edit of one record — no type selector
    const html = panel(t("Edit") + " · " + t(type), addForm2(type, editing));
    return { title: "Edit Record", subtitle: t(type), html, mount() { mountAddForm(type, editing); } };
  }

  // New record needs at least one ACTIVE broker — otherwise the Broker dropdown is empty.
  const hasActiveBroker = BROKERS.some((b) => !b.archived);
  const formContent = hasActiveBroker
    ? addForm2(type, null)
    : `<p class="form-note">${BROKERS.length
        ? t("Your only broker is archived. Add (or restore) an active broker to record transactions.")
        : t("You need a broker before you can record transactions — every transaction belongs to a broker.")}</p>
        <div class="form-actions" style="margin-top:14px"><a class="btn primary" href="#/brokers">${t("Add a broker")} →</a></div>`;

  const html = `<section class="panel add-panel">
    ${typeSelectorHTML(type)}
    <div class="add-sep"></div>
    <div class="panel-head"><h2>${t(type)}</h2></div>
    ${formContent}
  </section>`;
  return { title: "Add", subtitle: "Pick a type and fill in the details.", html,
    mount() { mountAddForm(type, null); } };
}

/* The focused per-type form. Field NAMES match wireTxSubmit so one submit path serves all. */
function addForm2(type, editing) {
  const e = editing || {};
  const sel = (val, cur) => (val === cur ? " selected" : "");
  const v = (x) => (x == null ? "" : x);
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
  const fxRow = `<label id="afFxField">${t("FX rate to")} ${FX.base}<input type="number" step="any" name="fxRate" id="afFx" value="${v(e.fxRate)}" placeholder="1.0"></label>`;
  // Amount input with the currency selector attached on its right: [ 0.00 ][ MYR ▾ ]
  const amtCombo = (name, val, ph) => `<div class="amt-combo">
      <input type="number" step="any" name="${name}" value="${val}" placeholder="${ph}">
      ${styledSelect("currency", ccyList, defCcy, { id: "afCcy", more: "currency", combo: true })}
    </div>`;

  const head = type === "Dividend"
    ? `<input type="hidden" name="broker" id="afBroker" value="${defBroker}">
       <label>${t("Date")}<input type="date" name="date" value="${dateVal}" required></label>`
    : `<label>${type === "Transfer between brokers" ? t("From broker") : t("Broker")}${styledSelect("broker", brokerList, defBroker, { id: "afBroker" })}</label>
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
    core = `
      <label>${t("Stock code")}<input type="text" name="ticker" value="${tickerVal}" placeholder="AAPL, 1155.KL" autocomplete="off"></label>
      <label class="amt-label">${t("Gross dividend")}${amtCombo("divGross", type === "Dividend" ? v(e.gross) : "", "0.00")}</label>
      <label>${t("Withholding Tax")}<input type="number" step="any" name="tax" value="${v(e.tax)}" placeholder="0.00"></label>
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
      <button type="button" class="btn secondary" id="addCancel">${editing ? t("Cancel") : t("Clear")}</button>
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
  // Cancel → editing: back to Records; new: clear the form (selector stays).
  const cancelBtn = $("#addCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    if (editing) { editingTxId = null; location.hash = "#/records"; }
    else { addDraft = {}; render(); }
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
        const orig = ccy !== FX.base ? ` <span class="muted">(${ccy} ${fmt(q * p)})</span>` : "";
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

function availableShares(brokerId, ticker) {
  const h = T.holdings.find((x) => x.brokerId === brokerId && x.ticker === ticker);
  return h ? h.shares : 0;
}

/* Shares held for (broker, ticker), DERIVED from transactions but EXCLUDING one id.
 * Used by the oversell check so editing a Sell doesn't count its own old version (F1). */
function sharesHeldExcluding(brokerId, ticker, excludeId) {
  const tk = (ticker || "").toUpperCase();
  let shares = 0;
  HOLDINGS.forEach((h) => { if (h.brokerId === brokerId && (h.ticker || "").toUpperCase() === tk) shares += +h.shares || 0; });
  [...ALL_TRANSACTIONS].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((x) => {
    if (x.id === excludeId || x.brokerId !== brokerId || (x.ticker || "").toUpperCase() !== tk) return;
    if (x.type === "Buy") shares += +x.qty || 0;
    else if (x.type === "Sell") shares -= +x.qty || 0;
    else if (x.type === "Stock split") shares *= (+x.qty || 1);
  });
  return shares;
}

/* Cash-tab extras on Records: balances summary, per-currency balances, reconciliation. */
function cashExtrasHTML() {
  const summary = `<div class="mini-cards">
    ${miniCard(t("Total Deposits"), money(T.totalDeposits))}
    ${miniCard(t("Total Withdrawals"), money(T.totalWithdrawals))}
    ${miniCard(t("Net Cash Added"), money(T.netCapitalInvested), cls(T.netCapitalInvested))}
    ${miniCard(t("Available Cash"), money(T.totalCash || 0))}</div>`;

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
    return `<tr><td>${b.name}</td><td class="num">${money(calc)}</td>
      <td class="num">${hasActual ? money(+chk.actual) : "—"}${hasActual && chk.date ? `<div class="fx-note">${fmtDate(chk.date)}</div>` : ""}</td>
      <td class="num ${hasActual && Math.abs(diff) > (SETTINGS.reconTolerance || 0) ? "neg" : ""}">${hasActual ? signed(diff) : "—"}</td>
      <td><span class="badge ${scls}">${status}</span></td>
      <td class="num"><button class="btn ghost" data-recon-broker="${b.id}">${t("Update")}</button></td></tr>`;
  }).join("");

  const ccyRows = BROKERS.map((b) => {
    const byc = T.brokerCashByCcy[b.id] || {};
    return Object.keys(byc).filter((c) => Math.abs(byc[c]) > 0.005).map((c) =>
      `<tr><td>${b.name}</td><td>${c}</td><td class="num ${byc[c] < 0 ? "neg" : ""}">${fmt(byc[c])}</td><td class="num">${money(byc[c] * (FX.rates[c] || 1))}</td></tr>`).join("");
  }).join("");

  return `${summary}
    ${panel("Cash Balances by Currency", table(
      [{label:"Broker"},{label:"Currency"},{label:"Balance",num:1},{label:"In MYR",num:1}], ccyRows))}
    ${panel("Broker Cash Reconciliation", table(
      [{label:"Broker"},{label:"Calculated Balance",num:1},{label:"Actual Balance",num:1},{label:"Difference",num:1},{label:"Status"},{label:"",num:1}], recRows),
      `<span class="badge subtle">${t("Calculated = Deposits − Buys − Fees + Sells + Net Dividends − Withdrawals")}</span>`)}`;
}

function mountCashExtras() {
  $$("[data-recon-broker]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.reconBroker;
    const chk = RECON_CHECKS[id] || {};
    const a = prompt(`${t("Actual cash balance for")} ${brokerName(id)} (${FX.base})`, chk.actual != null ? chk.actual : "");
    if (a == null) return;
    const actual = parseFloat(a);
    if (isNaN(actual)) { toast(t("Enter a valid number.")); return; }
    const note = prompt(t("Note (optional)"), chk.note || "") || "";
    RECON_CHECKS[id] = { actual, date: new Date().toISOString().slice(0, 10), note };
    saveStore(); toast(t("Reconciliation saved")); render();
  }));
}

function miniCard(label, value, valCls = "") {
  return `<div class="mini-card"><div class="mc-label">${label}</div><div class="mc-value ${valCls}">${value}</div></div>`;
}

/* Net dividend of one record, in base currency (gross − tax, at historical FX). */
function divNetMYR(d) { return ((+d.gross || 0) - (+d.tax || 0)) * (d.fxRate || FX.rates[d.currency] || 1); }

/* Aggregate received dividends by month / quarter / year (base currency). */
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

/* Dividend forecast.
 * METHOD (documented): a run-rate from your trailing-12-month (TTM) RECEIVED dividends —
 *   Next Year ≈ TTM, Next Quarter ≈ TTM ÷ 4, Next Month ≈ TTM ÷ 12.
 * Separately, we also sum any dividends you explicitly marked "Expected" whose payment
 * date falls inside the window (confirmed pipeline). The two are shown side by side so a
 * run-rate estimate is never confused with confirmed amounts. */
function dividendForecast(received, expected) {
  const now = todayDate();
  const cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1);
  const ttm = received.reduce((s, d) => {
    const dt = new Date((d.payDate || d.date) + "T00:00:00");
    return (!isNaN(dt) && dt >= cutoff && dt <= now) ? s + divNetMYR(d) : s;
  }, 0);
  const expWindow = (days) => {
    const end = new Date(now); end.setDate(now.getDate() + days);
    return expected.reduce((s, d) => {
      if (!d.payDate) return s;
      const dt = new Date(d.payDate + "T00:00:00");
      const net = d.expectedNetMYR != null ? d.expectedNetMYR : divNetMYR(d);
      return (!isNaN(dt) && dt >= now && dt <= end) ? s + net : s;
    }, 0);
  };
  return { ttm, nextMonth: ttm / 12, nextQuarter: ttm / 4, nextYear: ttm,
    expMonth: expWindow(31), expQuarter: expWindow(92), expYear: expWindow(365) };
}

/* =============================================================================
 * PAGE: DIVIDENDS
 * ========================================================================== */
function pageDividends() {
  const divs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend");
  const received = divs.filter((d) => d.status !== "Expected");
  const upcoming = allUpcomingDivs();

  const upcomingRows = upcoming.map((d) => {
    const du = daysUntil(d.payDate);
    const daysLabel = d.payDate ? (du >= 0 ? `${du}d` : `<span class="neg">${t("overdue")}</span>`) : "";
    return `<tr>
      <td><span class="ticker">${d.ticker}</span><div class="sub">${brokerName(d.brokerId)}</div></td>
      <td>${fmtDate(d.exDate)}</td>
      <td>${fmtDate(d.payDate)}${daysLabel ? `<div class="fx-note">${daysLabel}</div>` : ""}</td>
      <td class="num">${d.currency} ${fmt(d.expectedNet)}</td>
      <td>${statusBadge(d.status)}</td>
      <td>${d._id ? `<button type="button" class="icon-btn" data-del-ud="${escAttr(d._id)}" title="${t("Remove")}" style="color:var(--muted);font-size:14px">✕</button>` : ""}</td></tr>`;
  }).join("");

  // Prompt to add upcoming dividends for .KL holdings that don't have a manual entry yet
  const klHoldings = T.holdings.filter((h) => h.ticker.endsWith(".KL"));
  const coveredTickers = new Set([...UPCOMING_DIVIDENDS.map((d) => d.ticker), ...Object.keys(AUTO_DIV_CACHE)]);
  const klPrompts = klHoldings.filter((h) => !coveredTickers.has(h.ticker)).map((h) => `
    <div class="kl-prompt" data-ticker="${escAttr(h.ticker)}" data-broker="${escAttr(h.brokerId)}" data-ccy="${escAttr(h.currency || FX.base)}">
      <div class="kl-prompt-hd">
        <span class="kl-prompt-label">${t("Add upcoming dividend for")} <strong>${h.ticker}</strong></span>
        <button type="button" class="kl-add-btn btn ghost small">+ ${t("Add")} →</button>
      </div>
      <form class="kl-div-form" hidden>
        <label class="kl-field">${t("Ex-dividend Date")}<input type="date" name="exDate" required></label>
        <label class="kl-field">${t("Payment Date")}<input type="date" name="payDate" required></label>
        <label class="kl-field" style="grid-column:1/-1">${t("Per share")} (${h.currency || FX.base})<input type="number" step="any" name="amtPerShare" placeholder="0.00" required></label>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="submit" class="btn primary small">${t("Save")}</button>
          <button type="button" class="kl-cancel-btn btn ghost small">${t("Cancel")}</button>
        </div>
      </form>
    </div>`).join("");

  const histRows = received.sort((a, b) => ((a.payDate || a.date) < (b.payDate || b.date) ? 1 : -1)).map((d) => {
    const net = (+d.gross || 0) - (+d.tax || 0);
    const fx = d.fxRate || FX.rates[d.currency] || 1;
    return `<tr><td class="ticker">${d.ticker}</td><td class="sub">${brokerName(d.brokerId)}</td>
      <td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate || d.date)}</td>
      <td class="num">${d.currency} ${fmt(d.gross)}</td><td class="num neg">${d.tax ? "−" + fmt(d.tax) : "0.00"}</td>
      <td class="num pos">${d.currency} ${fmt(net)}</td>
      <td class="num">${money(net * fx)}</td><td>${statusBadge("Received")}</td></tr>`;
  }).join("");

  const grossBase = received.reduce((s, d) => s + (+d.gross || 0) * (d.fxRate || FX.rates[d.currency] || 1), 0);
  const taxBase = received.reduce((s, d) => s + (+d.tax || 0) * (d.fxRate || FX.rates[d.currency] || 1), 0);
  const taxByCountry = groupSum(received, (d) => countryForTicker(d.ticker, (STOCK_META[d.ticker] || {}).country), (d) => (+d.tax || 0) * (d.fxRate || FX.rates[d.currency] || 1));
  const taxRows = taxByCountry.filter((c) => c.value > 0).map((c) => `<tr><td>${c.label}</td><td class="num neg">${money(c.value)}</td></tr>`).join("");

  const periods = dividendByPeriod(received);

  const monthsAsc = Object.keys(periods.byMonth).sort();
  const monthRows = monthsAsc.map((k, i) => ({ k, val: periods.byMonth[k], delta: i > 0 ? periods.byMonth[k] - periods.byMonth[monthsAsc[i - 1]] : null }))
    .reverse().slice(0, 12).map((r) => `<tr><td>${r.k}</td><td class="num pos">${money(r.val)}</td>
      <td class="num ${r.delta == null ? "" : cls(r.delta)}">${r.delta == null ? "—" : signed(r.delta)}</td></tr>`).join("");

  const qAsc = Object.keys(periods.byQuarter).sort();
  const quarterRows = qAsc.map((k, i) => { const prev = i > 0 ? periods.byQuarter[qAsc[i - 1]] : null; const val = periods.byQuarter[k];
      return { k, val, delta: prev != null ? val - prev : null, pct: prev ? ((val - prev) / prev) * 100 : null }; })
    .reverse().slice(0, 8).map((r) => `<tr><td>${r.k}</td><td class="num pos">${money(r.val)}</td>
      <td class="num ${r.delta == null ? "" : cls(r.delta)}">${r.delta == null ? "—" : signed(r.delta)}${r.pct != null ? ` <span class="fx-note ${cls(r.pct)}">${pctTxt(r.pct)}</span>` : ""}</td></tr>`).join("");

  const yearsAsc = Object.keys(periods.byYear).sort();
  const yearRows = yearsAsc.map((k, i) => { const prev = i > 0 ? periods.byYear[yearsAsc[i - 1]] : null; const val = periods.byYear[k];
      return { k, val, yoy: prev ? ((val - prev) / prev) * 100 : null }; })
    .reverse().map((r) => `<tr><td>${r.k}</td><td class="num pos">${money(r.val)}</td>
      <td class="num ${r.yoy == null ? "" : cls(r.yoy)}">${r.yoy == null ? "—" : pctTxt(r.yoy)}</td></tr>`).join("");

  const thisY = yearsAsc[yearsAsc.length - 1], lastY = yearsAsc[yearsAsc.length - 2];
  const yoyGrowth = (lastY && periods.byYear[lastY]) ? ((periods.byYear[thisY] - periods.byYear[lastY]) / periods.byYear[lastY]) * 100 : null;

  const fc = dividendForecast(received, upcoming);
  const hasExp = fc.expMonth || fc.expQuarter || fc.expYear;

  const html = `
    <div class="mini-cards">
      ${miniCard("Gross Dividends", money(grossBase))}
      ${miniCard("Withholding Tax", money(taxBase), "neg")}
      ${miniCard("Net Dividends (Lifetime)", money(grossBase - taxBase), "pos")}</div>

    ${panel("Dividend Forecast", `
      <p class="muted" style="margin:-4px 0 12px">${t("Run-rate estimate from your trailing-12-month dividends")} (${money(fc.ttm)}). ${t("Estimate only — not a guarantee.")}</p>
      <div class="mini-cards">
        ${miniCard(t("Next Month (est.)"), money(fc.nextMonth))}
        ${miniCard(t("Next Quarter (est.)"), money(fc.nextQuarter))}
        ${miniCard(t("Next Year (est.)"), money(fc.nextYear))}</div>
      ${hasExp ? `<p class="muted" style="margin:12px 0 0">${t("Upcoming confirmed dividends in window")}: ${t("next month")} ${money(fc.expMonth)} · ${t("next quarter")} ${money(fc.expQuarter)} · ${t("next year")} ${money(fc.expYear)}</p>` : ""}
      <p class="muted" style="margin:8px 0 0;font-size:12px"><a class="link" href="#/help">${t("How is the forecast calculated?")}</a></p>`)}

    <div id="divUpcomingSection">
      ${panel("Upcoming Dividends",
        table([{label:"Ticker"},{label:"Ex-Date"},{label:"Pay-Date"},{label:"Expected Net",num:1},{label:"Status"},{label:""}], upcomingRows) +
        (klPrompts ? `<div class="kl-prompts">${klPrompts}</div>` : ""),
        `<small class="muted" id="divFetchStatus"></small>`
      )}
    </div>

    <section class="grid-2">
      ${panel("Monthly Dividend Income", table([{label:"Month"},{label:"Net (MYR)",num:1},{label:"MoM Δ",num:1}], monthRows))}
      ${panel("Quarterly Dividend Income", table([{label:"Quarter"},{label:"Net (MYR)",num:1},{label:"QoQ Δ",num:1}], quarterRows))}
    </section>
    ${panel("Annual Dividend Income", `${yoyGrowth != null ? `<p class="muted" style="margin:-4px 0 12px">${t("Year-over-year growth")}: <strong class="${cls(yoyGrowth)}">${pctTxt(yoyGrowth)}</strong> (${thisY} ${t("vs")} ${lastY})</p>` : ""}
      ${table([{label:"Year"},{label:"Net (MYR)",num:1},{label:"YoY",num:1}], yearRows)}`)}

    ${panel("Dividend History", table([{label:"Ticker"},{label:"Broker"},{label:"Ex-Date"},{label:"Payment"},{label:"Gross",num:1},{label:"Tax",num:1},{label:"Net",num:1},{label:"In MYR",num:1},{label:"Status"}], histRows))}
    ${panel("Dividend Tax Paid by Country", table([{label:"Country"},{label:"Withholding Tax (MYR)",num:1}], taxRows))}`;

  return {
    title: "Dividends", subtitle: "Calendar, history and withholding-tax summary.", html,
    mount() {
      // Delete a manual UPCOMING_DIVIDENDS entry
      document.querySelectorAll("[data-del-ud]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.delUd;
          const idx = UPCOMING_DIVIDENDS.findIndex((d) => d.id === id);
          if (idx >= 0) { UPCOMING_DIVIDENDS.splice(idx, 1); saveStore(); render(); }
        });
      });
      // Expand / collapse the .KL mini-form
      document.querySelectorAll(".kl-add-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const prompt = btn.closest(".kl-prompt");
          btn.style.display = "none";
          prompt.querySelector(".kl-div-form").hidden = false;
        });
      });
      document.querySelectorAll(".kl-cancel-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const prompt = btn.closest(".kl-prompt");
          prompt.querySelector(".kl-div-form").hidden = true;
          prompt.querySelector(".kl-add-btn").style.display = "";
        });
      });
      // Submit a manual .KL upcoming dividend
      document.querySelectorAll(".kl-div-form").forEach((form) => {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const prompt = form.closest(".kl-prompt");
          const fd = new FormData(form);
          UPCOMING_DIVIDENDS.push({
            id: uid("ud"), ticker: prompt.dataset.ticker, brokerId: prompt.dataset.broker,
            currency: prompt.dataset.ccy,
            exDate: fd.get("exDate") || "", payDate: fd.get("payDate") || "",
            amtPerShare: parseFloat(fd.get("amtPerShare")) || 0,
          });
          saveStore(); render();
        });
      });
      // Auto-fetch Finnhub schedule for US holdings; re-render upcoming section when done
      if (LIVE_ENABLED) {
        const statusEl = document.getElementById("divFetchStatus");
        if (statusEl) statusEl.textContent = t("Fetching US schedules…");
        fetchAllDivSchedules().then((fetched) => {
          if (fetched && document.getElementById("divUpcomingSection")) render();
          const s = document.getElementById("divFetchStatus");
          if (s) s.textContent = "";
        });
      }
    },
  };
}

/* =============================================================================
 * PAGE: REPORTS
 * ========================================================================== */
let reportTab = "portfolio";   // F3: portfolio | dividend | cashflow | performance

function reportPortfolio() {
  const a = allocationData();
  const holdRows = [...T.holdings].sort((x, y) => y.marketValue - x.marketValue).map((h) => `<tr>
    <td><a class="ticker ticker-link" href="#/holding/${encodeURIComponent(h.brokerId + "|" + h.ticker)}">${h.ticker}</a></td>
    <td class="num">${fmt(h.shares, { maximumFractionDigits: 4 })}</td><td class="num">${money(h.avgCost)}</td>
    <td class="num">${money(h.marketValue)}</td><td class="num">${a.total ? fmt(h.marketValue / a.total * 100, { maximumFractionDigits: 1 }) : "0"}%</td>
    <td class="num ${h.hasPrice ? cls(h.unrealized) : ""}">${h.hasPrice ? signed(h.unrealized) : "—"}</td>
    <td class="num ${cls(h.totalReturn)}">${signed(h.totalReturn)}</td></tr>`).join("");
  return `
    ${panel("Holdings", table([{label:"Holding"},{label:"Shares",num:1},{label:"Avg Cost",num:1},{label:"Market Value",num:1},{label:"Allocation",num:1},{label:"Unrealized",num:1},{label:"Total Return",num:1}], holdRows))}
    <h3 class="report-h">${t("Allocation")}</h3>
    <section class="grid-2">
      ${allocationPanel(t("By Country"), a.byCountry, a.total)}
      ${allocationPanel(t("By Sector"), a.bySector, a.total)}
    </section>
    <section class="grid-2">
      ${allocationPanel(t("By Currency"), a.byCurrency, a.total)}
      ${allocationPanel(t("By Brokerage"), a.byBroker, a.total)}
    </section>`;
}

function reportDividend() {
  const received = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && x.status !== "Expected");
  const periods = dividendByPeriod(received);
  const lifetime = Object.values(periods.byYear).reduce((s, v) => s + v, 0);
  const rows = (obj) => Object.keys(obj).sort().reverse().map((k) => `<tr><td>${k}</td><td class="num pos">${money(obj[k])}</td></tr>`).join("");
  return `
    <div class="mini-cards">${miniCard(t("Lifetime Net Dividends"), money(lifetime), "pos")}${miniCard(t("Dividend Yield (TTM)"), (T.portfolioValue ? fmt(ttmDividends() / T.portfolioValue * 100, { maximumFractionDigits: 2 }) + "%" : "—"))}</div>
    <section class="grid-2">
      ${panel("Monthly", table([{label:"Month"},{label:"Net (MYR)",num:1}], rows(periods.byMonth)))}
      ${panel("Quarterly", table([{label:"Quarter"},{label:"Net (MYR)",num:1}], rows(periods.byQuarter)))}
    </section>
    ${panel("Annual", table([{label:"Year"},{label:"Net (MYR)",num:1}], rows(periods.byYear)))}`;
}

function reportCashflow() {
  const types = { Deposit: [], Withdrawal: [], "Currency Exchange": [] };
  ALL_TRANSACTIONS.forEach((x) => { if (types[x.type]) types[x.type].push(x); });
  const sum = (arr) => arr.reduce((s, x) => s + (+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1), 0);
  const rows = (arr) => arr.sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => `<tr><td>${fmtDate(x.date)}</td><td class="sub">${brokerName(x.brokerId)}</td>
    <td class="num">${x.currency} ${fmt(x.gross)}</td><td class="num">${money((+x.gross || 0) * (x.fxRate || FX.rates[x.currency] || 1))}</td>
    ${x.type === "Currency Exchange" ? `<td class="sub">→ ${x.toCurrency} ${fmt(x.toAmount)}</td>` : "<td></td>"}</tr>`).join("");
  const hdr = [{label:"Date"},{label:"Broker"},{label:"Amount",num:1},{label:"In MYR",num:1},{label:""}];
  return `
    <div class="mini-cards">${miniCard(t("Total Deposits"), money(sum(types.Deposit)))}${miniCard(t("Total Withdrawals"), money(sum(types.Withdrawal)))}${miniCard(t("Net Cash Added"), money(sum(types.Deposit) - sum(types.Withdrawal)), cls(sum(types.Deposit) - sum(types.Withdrawal)))}</div>
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
      groupSum(T.holdings, (h) => brokerName(h.brokerId), (h) => h.totalReturn).map((b) => `<tr><td>${b.label}</td><td class="num ${cls(b.value)}">${signed(b.value)}</td></tr>`).join("")))}
    ${panel("Fees Paid by Broker", table([{label:"Broker"},{label:"Fees",num:1}],
      groupSum(ALL_TRANSACTIONS.filter((x) => x.fee), (x) => brokerName(x.brokerId), (x) => (+x.fee || 0) * (x.fxRate || FX.rates[x.currency] || 1)).map((b) => `<tr><td>${b.label}</td><td class="num neg">${money(b.value)}</td></tr>`).join("")))}`;
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
  return `<article class="broker-card ${b.archived ? "archived" : ""}">
      <div class="bc-head"><span class="brand-mark sm">${b.name.slice(0,2).toUpperCase()}</span>
        <div><div class="bc-name">${b.name} ${b.archived ? `<span class="badge subtle">${t("Archived")}</span>` : ""}</div>
          <div class="sub">${b.country || "—"} · ${b.currency}</div></div>
        <div class="bc-actions">
          <button class="icon-btn row-edit" data-edit-broker="${b.id}" title="${t("Edit")}" aria-label="${t("Edit")}">✎</button>
          <button class="icon-btn" data-archive-broker="${b.id}" title="${b.archived ? t("Unarchive") : t("Archive")}" aria-label="${b.archived ? t("Unarchive") : t("Archive")}">${b.archived ? "↩" : "🗄"}</button>
          <button class="icon-btn bc-del" data-del-broker="${b.id}" title="${t("Remove")}" aria-label="${t("Remove")}">✕</button>
        </div></div>
      <div class="bc-stats">
        <div><span class="sub">${t("Holdings")}</span><strong>${holdings.length}</strong></div>
        <div><span class="sub">${t("Market Value")}</span><strong>${money(value)}</strong></div>
        <div><span class="sub">${t("Cash (calc)")}</span><strong>${money(calc)}</strong></div>
        <div><span class="sub">${t("Difference")}</span><strong class="${off ? "neg" : ""}">${hasActual ? signed(diff) : "—"}</strong></div>
      </div>
      ${b.notes ? `<p class="bc-notes muted">${b.notes}</p>` : ""}</article>`;
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
      <label>${t("Broker name")}<input name="name" value="${e.name || ""}" placeholder="e.g. Rakuten Trade" required></label>
      <label>${t("Country")}<input name="country" value="${e.country || ""}" placeholder="e.g. Malaysia"></label>
      <label>${t("Default currency")}${styledSelect("currency", currencyItems(), e.currency || FX.base, { more: "currency" })}</label>
    </div>
    <label class="block">${t("Notes")}<input name="notes" value="${e.notes || ""}" placeholder="${t("optional")}"></label>
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
    ${panel(editing ? "Edit Broker" : "Add Broker", brokerForm)}`;

  return { title: "Brokers", subtitle: LANG === "zh"
      ? `已连接 ${active.length} 个投资平台。`
      : `${active.length} investment apps connected.`, html,
    mount() {
      $("#brokerForm").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target).entries());
        if (!d.name.trim()) { toast(t("Enter a broker name.")); return; }
        if (editingBrokerId) {
          const b = BROKERS.find((x) => x.id === editingBrokerId);
          if (b) { b.name = d.name.trim(); b.country = (d.country || "").trim(); b.currency = d.currency; b.notes = (d.notes || "").trim(); }
          editingBrokerId = null;
          saveStore(); toast(t("Broker updated")); render();
        } else {
          BROKERS.push({ id: uid("b"), name: d.name.trim(), country: (d.country || "").trim(), currency: d.currency, notes: (d.notes || "").trim(), archived: false });
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
    } };
}

/* =============================================================================
 * PAGE: SETTINGS  (incl. theme switcher)
 * ========================================================================== */
function pageSettings() {
  const html = `
    ${panel("Profile", `<form id="profileForm" class="form" autocomplete="off">
      <div class="form-grid">
        <label>${t("Name")}<input name="name" value="${USER.name || ""}" placeholder="${t("Your name")}"></label>
        <label>${t("Email")}<input name="email" type="email" value="${USER.email || ""}" placeholder="you@example.com"></label>
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
      ${settingRow("Base currency", `<select id="baseCcy">${Object.keys(FX.rates).map((c) => `<option ${c === FX.base ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
      <p class="muted" style="margin:6px 0 0">All transactions keep their original currency; base-currency values are derived using stored exchange rates and never overwrite the original.</p></div>`)}

    ${panel("Exchange Rates", `
      <p class="muted" style="margin:-4px 0 12px">${t("Rates convert each currency to your base.")} ${t("Pull today's market rate or type your own.")}</p>
      <div id="fxRows">${fxRows()}</div>
      <div class="fx-add">
        <input list="ccyList" id="newCcy" class="fx-input" placeholder="${t("Currency code")} (e.g. JPY)" maxlength="3" autocomplete="off" />
        <datalist id="ccyList">${[...new Set(COMMON_CCY)].map((c) => `<option value="${c}"></option>`).join("")}</datalist>
        <input type="number" step="any" id="newRate" class="fx-input" placeholder="${t("Rate to")} ${FX.base}" />
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
  a.href = url; a.download = `investment-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    applySnapshot(s); saveStore(); toast(t("Backup restored")); render();
  };
  reader.readAsText(file);
}
/* Demo data (only loaded on demand from Settings). Shows the core flows:
 * deposit → buy → manual price, dividend with withholding tax, multi-currency FX. */
function loadDemoData() {
  const today = new Date().toISOString().slice(0, 10);
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
    $("#newRate").placeholder = `${t("Rate to")} ${FX.base}`;
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
    { q: "How is the dividend forecast calculated?", a: "Methodology: a run-rate from your trailing-12-month (TTM) RECEIVED dividends, converted to your base currency at each dividend's historical FX rate. Next Year ≈ TTM, Next Quarter ≈ TTM ÷ 4, Next Month ≈ TTM ÷ 12. Separately, any dividends you mark 'Expected' with a payment date inside the window are summed as a 'confirmed pipeline'. Assumptions: your holdings and their payout rate stay roughly the same as the last 12 months." },
    { q: "How accurate is the dividend forecast?", a: "It is a directional estimate, not a prediction. Accuracy is best for a stable, diversified dividend portfolio held for a full year (so the TTM base is complete). It is least accurate for new portfolios (incomplete TTM), recently changed holdings, or stocks with irregular/special dividends." },
    { q: "What are the forecast's limitations?", a: "It does NOT model: future buys or sells, dividend cuts or raises, special/one-off dividends, changes in withholding tax, or FX movement on future payments. Equal monthly/quarterly splitting (TTM ÷ 12 / ÷ 4) ignores real payout calendars (many stocks pay semi-annually or annually). Treat it as a planning aid only — never as guaranteed income." },
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
    { q: "股息预测是如何计算的？", a: "方法：基于您过去 12 个月（TTM）已收到股息的运行率，按每笔股息的历史汇率换算为基准货币。下一年 ≈ TTM，下一季 ≈ TTM ÷ 4，下一月 ≈ TTM ÷ 12。此外，凡是您标记为“预期”且派息日落在窗口内的股息，会单独汇总为“已确认管道”。假设：您的持仓及其派息率与过去 12 个月大致相同。" },
    { q: "股息预测有多准确？", a: "这是方向性估算，并非预测。对于持有满一年的稳定、分散的股息组合（TTM 基数完整）最准确；对于新组合（TTM 不完整）、近期变动的持仓或不规则/特别股息的股票最不准确。" },
    { q: "股息预测有哪些局限？", a: "它不建模：未来的买卖、股息上调或下调、特别/一次性股息、预扣税变动，或未来派息的汇率波动。按月/季均分（TTM ÷ 12 / ÷ 4）忽略了真实派息日历（许多股票按半年或一年派息）。请仅作为规划参考，切勿视为有保证的收入。" },
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
function detailCard(label, value, valCls = "") {
  return `<article class="card"><div class="c-label">${label}</div><div class="c-value ${valCls}">${value}</div></article>`;
}
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
  const txRows = txs.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${typeChip(x.type)}</td>
    <td class="num">${x.qty != null ? fmt(x.qty, { maximumFractionDigits: 4 }) : "—"}</td>
    <td class="num">${x.price != null ? x.currency + " " + fmt(x.price) : "—"}</td>
    <td class="num">${x.gross != null ? x.currency + " " + fmt(x.gross) : "—"}</td>
    <td class="num">${x.fee ? x.currency + " " + fmt(x.fee) : "—"}</td></tr>`).join("");
  const divs = ALL_TRANSACTIONS.filter((x) => x.type === "Dividend" && (x.ticker || "").toUpperCase() === tk)
    .sort((a, b) => ((a.payDate || a.date) < (b.payDate || b.date) ? 1 : -1));
  const divRows = divs.map((d) => { const net = (+d.gross || 0) - (+d.tax || 0); const fx = d.fxRate || FX.rates[d.currency] || 1;
    return `<tr><td>${fmtDate(d.payDate || d.date)}</td><td class="num">${d.currency} ${fmt(d.gross)}</td>
      <td class="num neg">${d.tax ? "−" + fmt(d.tax) : "0.00"}</td><td class="num pos">${d.currency} ${fmt(net)}</td>
      <td class="num">${money(net * fx)}</td><td>${statusBadge(d.status || "Received")}</td></tr>`; }).join("");

  // Per-ticker dividend analytics + forecast + charts (F1)
  const tReceived = divs.filter((d) => d.status !== "Expected");
  const tExpected = divs.filter((d) => d.status === "Expected").sort((a, b) => ((a.payDate || "") < (b.payDate || "") ? -1 : 1));
  const totalDivReceived = tReceived.reduce((s, d) => s + divNetMYR(d), 0);
  const tFc = dividendForecast(tReceived, tExpected);
  const upcomingRows = tExpected.map((d) => { const net = (+d.gross || 0) - (+d.tax || 0); const du = daysUntil(d.payDate);
    return `<tr><td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td>
      <td class="num">${d.payDate ? (du >= 0 ? du + " " + t("days") : t("overdue")) : "—"}</td>
      <td class="num">${d.currency} ${fmt(net)}</td></tr>`; }).join("");
  // Dividend income over time (monthly, base ccy)
  const dPer = dividendByPeriod(tReceived).byMonth;
  const divSeries = Object.keys(dPer).sort().map((k) => ({ month: k.slice(2), value: dPer[k] }));
  // Cumulative cost basis over time (proxy for position size — historical market prices aren't stored)
  let cum = 0; const costSeries = [];
  [...txs].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
    const xfx = x.fxRate || FX.rates[x.currency] || 1;
    if (x.type === "Buy") cum += ((+x.qty || 0) * (+x.price || 0) + (+x.fee || 0) + (+x.tax || 0)) * xfx;
    else if (x.type === "Sell") cum = Math.max(0, cum - (+x.qty || 0) * (+x.price || 0) * xfx);
    if (x.type === "Buy" || x.type === "Sell") costSeries.push({ month: x.date.slice(2), value: cum });
  });

  const priceLbl = h.hasPrice
    ? `${h.currentPriceCcy} ${fmt(h.currentPrice)} <span class="fx-note ${h.priceSource === "live" ? "live-price" : "manual-price"}">${h.priceSource === "live" ? t("Live") : t("Manual price")}</span>`
    : `<span class="muted">${t("No price set")}</span>`;

  const cards = `<div class="cards">
    ${detailCard(t("Shares Held"), fmt(h.shares, { maximumFractionDigits: 4 }))}
    ${detailCard(t("Average Cost"), `${money(h.avgCost)}<div class="c-sub">${h.currency} ${fmt(h.avgCostLocal)} / ${t("share")}</div>`)}
    ${detailCard(t("Current Price"), priceLbl)}
    ${detailCard(t("Market Value"), money(h.marketValue))}
    ${detailCard(t("Cost Basis"), money(h.costBasis))}
    ${detailCard(t("Unrealized P/L"), h.hasPrice ? `${signed(h.unrealized)}<div class="c-sub">${t("price")} ${signed(h.priceUnrealized)} · ${t("FX")} ${signed(h.fxUnrealized)}</div>` : "—", h.hasPrice ? cls(h.unrealized) : "")}
    ${detailCard(t("Realized P/L"), signed(h.realized), cls(h.realized))}
    ${detailCard(t("Net Dividends"), money(h.netDividends))}
    ${detailCard(t("Total Return"), signed(h.totalReturn), cls(h.totalReturn))}
  </div>`;

  const html = `
    <p style="margin:-4px 0 12px"><a class="link" href="#/portfolio">← ${t("Back to Portfolio")}</a></p>
    <div class="holding-head">
      <div><div class="ticker" style="font-size:20px">${h.ticker}</div><div class="sub">${h.company || ""}</div></div>
      <div class="holding-meta">
        <span class="chip">${brokerName(h.brokerId)}</span>
        ${h.market ? `<span class="chip">${h.market}</span>` : ""}
        <span class="chip">${meta.country || h.country || "—"}</span>
        ${meta.sector ? `<span class="chip">${meta.sector}</span>` : ""}
        <button class="btn" id="dtlPrice">＄ ${t("Set price")}</button>
        ${LIVE_ENABLED ? `<button class="btn" id="dtlLive">⟳ ${t("Live")}</button>` : ""}
      </div>
    </div>
    ${cards}

    <section class="grid-2">
      ${panel("Cost Basis Over Time", costSeries.length >= 2 ? `<div class="chart">${lineChartSVG(costSeries)}</div><p class="muted" style="font-size:11px;margin:6px 0 0">${t("Cumulative cost — historical market prices are not stored.")}</p>` : emptyState(t("Add at least two trades to see a trend.")))}
      ${panel("Dividend Income Over Time", divSeries.length >= 2 ? `<div class="chart">${lineChartSVG(divSeries)}</div>` : emptyState(t("Not enough dividend history yet.")))}
    </section>

    ${panel("Dividend Summary", `<div class="mini-cards">
      ${miniCard(t("Total Dividends Received"), money(totalDivReceived), "pos")}
      ${miniCard(t("Next Year (est.)"), money(tFc.nextYear))}
      ${miniCard(t("Dividend Yield (TTM)"), h.marketValue ? fmt(tFc.ttm / h.marketValue * 100, { maximumFractionDigits: 2 }) + "%" : "—")}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${t("Forecast is a run-rate estimate from this holding's trailing-12-month dividends.")}</p>`)}

    ${tExpected.length ? panel("Upcoming Dividends", table([{label:"Ex-Date"},{label:"Payment"},{label:"Days"},{label:"Expected Net",num:1}], upcomingRows)) : ""}

    ${panel("Transactions", txRows ? table([{label:"Date"},{label:"Type"},{label:"Qty",num:1},{label:"Price",num:1},{label:"Gross",num:1},{label:"Fee",num:1}], txRows) : emptyState(t("No transactions for this holding.")))}
    ${panel("Dividend History", divRows ? table([{label:"Payment"},{label:"Gross",num:1},{label:"Tax",num:1},{label:"Net",num:1},{label:"In MYR",num:1},{label:"Status"}], divRows) : emptyState(t("No dividends recorded for this holding.")))}`;

  return { title: h.ticker, subtitle: h.company || t("Holding detail"), html,
    mount() {
      const p = $("#dtlPrice");
      if (p) p.addEventListener("click", () => {
        const cur = CURRENT_PRICES[h.ticker];
        const input = prompt(`${t("Current price per share for")} ${h.ticker} (${h.currentPriceCcy}) — ${t("manual, not live")}`, cur ? cur.price : "");
        if (input == null) return;
        const price = parseFloat(input);
        if (!(price > 0)) { toast(t("Enter a valid price.")); return; }
        CURRENT_PRICES[h.ticker] = { price, currency: h.currentPriceCcy, date: new Date().toISOString().slice(0, 10), source: "manual" };
        saveStore(); toast(t("Price updated")); render();
      });
      const lv = $("#dtlLive");
      if (lv) lv.addEventListener("click", async () => {
        if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
        lv.classList.add("spin");
        const ok = await refreshLivePrice(h.ticker);
        if (ok) { saveStore(); toast(`${h.ticker} ${t("updated")}`); render(); }
        else { lv.classList.remove("spin"); toast(`${t("Couldn't fetch")} ${h.ticker}`); }
      });
    } };
}

/* =============================================================================
 * CALC MODAL
 * ========================================================================== */
function showCalc(calc) {
  $("#modalTitle").textContent = t(calc.title);
  const rows = calc.rows.map((r) => `<div class="calc-row"><span><span class="cr-op">${r.op}</span>${t(r.label)}</span><span class="cr-val">${r.val}</span></div>`).join("");
  $("#modalBody").innerHTML = `${rows}
    <div class="calc-row total"><span>= ${t("Result")}</span><span class="cr-val">${calc.totalFmt != null ? calc.totalFmt : money(calc.total)}</span></div>
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
  const cashTypes = ["Deposit", "Withdrawal", "Interest / cash yield", "Interest", "Fee", "Tax withholding", "Transfer between brokers", "Currency Exchange"];
  const rows = ALL_TRANSACTIONS.filter((x) => cashTypes.includes(x.type) || (x.type === "Dividend" && x.status !== "Expected"));
  downloadCSV("investment-ledger-cash.csv",
    ["Date","Broker","Type","Amount","Currency","FX Rate","Amount in " + FX.base],
    rows.map((c) => [c.date, brokerName(c.brokerId), c.type, c.gross, c.currency, c.fxRate || FX.rates[c.currency] || 1, (c.myrEquivalent != null ? c.myrEquivalent : (+c.gross || 0) * (c.fxRate || 1)).toFixed(2)]));
}
function exportTxCSV() {
  downloadCSV("investment-ledger-transactions.csv",
    ["Date","Broker","Type","Ticker","Quantity","Price","Gross","Fee","Tax","Currency","FX Rate","MYR Equivalent","Notes"],
    ALL_TRANSACTIONS.map((x) => [x.date, brokerName(x.brokerId), x.type, x.ticker, x.qty ?? "", x.price ?? "", x.gross ?? "", x.fee ?? 0, x.tax ?? 0, x.currency, x.fxRate ?? "", (x.myrEquivalent != null ? x.myrEquivalent : "").toString(), (x.notes || "").replace(/"/g, "'")]));
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
    if (r.errors.length) return `<span class="badge neg" title="${r.errors.join("; ")}">${r.errors.join("; ")}</span>`;
    if (r.needsBroker) return `<span class="badge warn">${t("Create broker first")}</span>`;
    if (r.dup) return `<span class="badge subtle">${t("Duplicate — skipped")}</span>`;
    return `<span class="badge pos">${t("Ready")}</span>`;
  };
  const body = rows.map((r) => {
    const amt = r.type === "Buy" || r.type === "Sell" ? `${r.qty} @ ${fmt(r.price)}`
      : r.type === "Currency Exchange" ? `${fmt(r.gross)} → ${r.toCurrency} ${fmt(r.toAmount)}`
      : fmt(r.gross);
    return `<tr class="${rowReady(r) ? "" : (r.dup ? "row-dup" : "row-bad")}">
      <td class="num">${r.line}</td><td>${fmtDate(r.date)}</td><td>${r.brokerName || "—"}</td>
      <td>${r.type || "—"}</td><td>${r.ticker || "—"}</td><td class="num">${amt}</td><td>${r.currency}</td>
      <td>${statusCell(r)}</td></tr>`;
  }).join("");
  const chip = (n, cls, lbl) => n ? ` · <span class="${cls}">${n} ${lbl}</span>` : "";
  return `<div class="import-preview">
    <div class="import-summary"><strong>${rows.length}</strong> ${t("rows")} · <span class="pos">${okCount} ${t("ready")}</span>${chip(dupCount, "muted", t("duplicate"))}${chip(brokerCount, "warn-txt", t("need broker"))}${chip(errCount, "neg", t("with errors"))}</div>
    ${unknown.length ? `<p class="muted" style="font-size:12.5px;margin:0 0 10px">${t("Missing brokers")}: ${unknown.map((u) => `<strong>${u.name}</strong>`).join(", ")}.
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
function openMoreSheet() { const s = $("#moreSheet"); if (s) s.hidden = false; }
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
  if (key !== "add") { editingTxId = null; addDraft = {}; }  // drop edit mode + draft when leaving Add
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

  // active nav state — sidebar items highlight directly; mobile "More" highlights on secondary pages
  const secondary = ["records", "reports", "brokers", "settings", "help"];
  $$("[data-page]").forEach((el) => el.classList.toggle("active", el.dataset.page === key));
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
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeMoreSheet(); } });
  // "More" overlay — mobile bottom-nav only (desktop shows the items in the sidebar)
  $("#moreBtn").addEventListener("click", (e) => { e.preventDefault(); toggleMoreSheet(); });
  $("#moreClose").addEventListener("click", closeMoreSheet);
  $("#moreSheet").addEventListener("click", (e) => { if (e.target.id === "moreSheet") closeMoreSheet(); });
  $$("#moreSheet .more-item").forEach((a) => a.addEventListener("click", closeMoreSheet));
  initStyledSelects();   // delegated wiring for the custom dropdowns

  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/dashboard";
  render();
}
document.addEventListener("DOMContentLoaded", init);
