/* =============================================================================
 * Table title descriptions
 * -----------------------------------------------------------------------------
 * Every column title in every table gets a short, plain-language description. With a mouse you hover
 * the title itself and a small tooltip shows it (the info icon is hidden by CSS); on a touch screen,
 * which can't hover, the icon stays and a tap shows the same tooltip. The tooltip box itself is
 * mountColInfoTaps() in app.js.
 *
 * How it works: this file only holds the TEXT (TH_TIPS) and a decorator that adds the icon to any
 * <th> it knows a description for. Titles are matched by their label, optionally narrowed by the
 * heading of the panel they sit in ("Panel|Label") when the same word means different things in
 * different tables (e.g. "Amount" on Recent Activity vs. the Dividend Calendar). To describe a new
 * column, add one line to TH_TIPS (and its Chinese to TH_ZH) — no table code needs touching.
 *
 * Classic <script> loaded after app.js (shares its top-level scope, like sync.js).
 * ========================================================================== */

const TH_TIPS = {
  /* ---- positions */
  "Holding": "Stock code and name. Click it to open the stock page.",
  "Broker": "The broker you hold it with.",
  "Shares": "How many shares you own.",
  "Avg Cost (incl. fees)": "What you paid per share, buying fees included.",
  "Avg Cost (excl. fees)": "What you paid per share, without fees. Most broker apps show this.",
  "Buying fees": "Fees you paid when buying these shares.",
  "Cost Basis": "Total you paid for the shares you still hold, fees included.",
  "Price": "Latest share price.",
  "Today": "How much the price moved today.",
  "≈ base": "Share price in {base}, at today's exchange rate.",
  "Market Value": "Shares × latest price.",
  "Unrealized P/L": "Profit or loss if you sold now. Not locked in yet.",
  "P/L %": "Unrealized profit or loss as a % of what you paid.",
  "Realized P/L": "Profit or loss locked in by shares you sold.",
  "Total Return": "Unrealized and realized profit, plus dividends received.",
  "Return %": "Total return as a % of what you paid.",
  "% of Portfolio": "This stock's share of your total market value.",
  "Net Dividends": "Dividends received, after tax.",
  /* ---- records */
  "Date": "The day it happened.",
  "Type": "Buy, Sell, Dividend, Deposit and so on.",
  "Amount": "The value of the record.",
  "Recent Activity|Amount": "Money in or out for that record.",
  "Transactions|Amount": "Value of the record in {base}.",
  "Transactions|Price": "Price per share on that trade.",
  "Qty": "Number of shares.",
  "Gross": "Amount before fees and tax.",
  "Fee": "Commission or fees on the trade.",
  "Ticker": "The stock's code.",
  "Ccy": "Currency of the amount.",
  "#": "Row number in your file.",
  "Status": "Where this record stands.",
  "Import from CSV|Status": "Whether the row can be imported.",
  "Import from CSV|Amount": "Amount in the row's own currency.",
  /* ---- dividends */
  "Ex-Date": "Buy before this date to get the dividend.",
  "Payment": "When the dividend is expected to be paid.",
  "Est. Payment": "Estimated pay date, about 14 days after the ex-date.",
  "Expected Net": "Dividend you expect to receive, after tax.",
  "Per Share": "Dividend paid for each share.",
  "Total": "Dividend for all your shares, after tax.",
  "Yield": "This payment as a % of today's share price.",
  "Dividend Calendar|Amount": "Dividend for your shares, after tax.",
  "Dividends Found From Market History|Amount": "Dividend for your shares, after tax.",
  "Upcoming Dividends|Status": "Confirmed or estimated payment.",
  "Dividend Calendar|Status": "Received, next payment or estimated.",
  "Net": "Dividends received after tax in that period.",
  "Month": "The month the dividends were paid.",
  "Quarter": "The quarter the dividends were paid.",
  "Year": "The year the dividends were paid.",
  /* ---- brokers */
  "Balance": "Cash held with this broker in that currency.",
  "Calculated Balance": "Cash worked out from your records.",
  "Actual Balance": "Cash your broker says you have.",
  "Difference": "Calculated minus actual. Zero means they match.",
  "Broker Cash Reconciliation|Status": "Whether it matches your broker's balance.",
  /* ---- realized profit */
  "Sales": "How many times you sold it.",
  "Cost": "What you paid for the shares you sold.",
  "Proceeds": "Money you received from selling.",
  "Sold": "Shares sold and the price per share.",
  "Realized P/L|Date": "The day you sold.",
  "Realized P/L|Return %": "Profit or loss as a % of what you paid.",
  "Realized P/L|Realized P/L": "Profit or loss on the sale, after fees.",
  "Share of total": "How much of your total money (stocks plus cash) is with this broker.",
  "Position": "Shares you own, with your average cost per share underneath.",
  "Dividends that year": "What you could collect in that year.",
  "Total so far": "Everything you could have collected up to the end of that year.",
  "If you keep what you own|Year": "How many years from now.",
  "Cash": "Cash held with this broker.",
};

const _thNorm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
/* "Amount (RM)" → "amount", "Per Share (USD)" → "per share", "≈ RM" → "≈ base"; "(incl. fees)" is left alone. */
function _thKey(text) {
  const k = _thNorm(text);
  if (k.startsWith("≈")) return "≈ base";
  return k.replace(/\s*\([a-z]{2,4}\)\s*$/, "");
}
/* The heading of the panel (or collapsible block) a title sits in — lets one word mean different things per table. */
function _thCtx(th) {
  const p = th.closest(".panel");
  if (!p) return "";
  const h = p.querySelector(".panel-head h2");
  const sm = !h && p.querySelector("summary");
  return _thNorm(h ? h.textContent : sm ? sm.textContent : "").replace(/\s*\(\d+\)\s*$/, "");
}

let _thLookup = null, _thLookupLang = null;
function _thBuildLookup() {
  const m = new Map();
  Object.keys(TH_TIPS).forEach((key) => {
    const parts = key.split("|"), label = parts.pop(), ctx = parts.join("|");
    const lk = label === "≈ base" ? "≈ base" : _thKey(t(label));
    m.set((ctx ? _thNorm(t(ctx)) : "") + "|" + lk, TH_TIPS[key]);
  });
  _thLookup = m; _thLookupLang = LANG;
}

/* Adds the info icon (carrying the description) to every table title we have words for. */
function decorateTableTitles(scope) {
  if (!_thLookup || _thLookupLang !== LANG) _thBuildLookup();
  (scope || document).querySelectorAll("table th").forEach((th) => {
    if (th.dataset.tipDone) return;
    if (th.querySelector(".col-info")) { th.dataset.tipDone = "1"; return; }
    const label = _thKey(th.textContent);
    if (!label) return;
    const en = _thLookup.get(_thCtx(th) + "|" + label) || _thLookup.get("|" + label);
    if (!en) return;
    const text = t(en).replace(/\{base\}/g, ccyLabel(FX.base));
    th.insertAdjacentHTML("beforeend", `<span class="col-info tip-down" data-tip="${esc(text)}">${COL_INFO_ICON_SVG}</span>`);
    th.dataset.tipDone = "1";
  });
}

/* ------------------------------------------------------------------ Descriptions for labels that are NOT table titles
 * (rows of a detail panel, summary-card titles, the totals strip). Same behaviour as the table titles: with a mouse you hover
 * the label itself, on a touch screen the little icon stays and a tap shows it. Looked up by label (optionally "context|label"),
 * then falls back to TH_TIPS so a word like "Date" or "Unrealized P/L" is described once. */
const LBL_TIPS = {
  "Market Value": "What your holdings here are worth at today's prices.",
  "Available Cash": "Cash ready to invest or withdraw.",
  "Total value": "Holdings plus cash across your brokers.",
  "Price Return": "Profit or loss from the share price moving, not counting dividends.",
  "Dividends received": "Everything this stock has paid you in dividends, after tax.",
  "Bought": "Total you have spent buying shares.",
  "Money in": "Total you have deposited.",
  "Money out": "Total you have withdrawn.",
  "Money Left In This Broker": "Money in minus money out. Click to see the sum.",
  "Dividends paid to": "Whether dividends stay in this broker's cash or go to your bank.",
  "Default dividend tax rate": "Used for new dividends from this broker unless you change it on one.",
  "Reconciliation": "Whether your calculated cash matches what the broker shows.",
  "Fees": "Commission and fees on the trade.",
  "Price per share": "Price for one share on that trade.",
  "Original amount": "Amount in the record's own currency.",
  "Exchange rate": "Rate used to convert it into {base}.",
  "strip|Bought": "Total spent buying shares.",
  "strip|Sold": "Total received from selling shares.",
  "strip|Dividends": "Dividends received, after tax.",
  "Net dividends received": "All dividends you have received, after tax.",
  "This year": "Dividends received so far this year.",
  "Average per month": "Average dividends per month over the last 12 months.",
  "Next payment": "Your next expected dividend payment.",
  "Total return · current holdings": "Return on shares you still hold. The Dashboard also counts shares you sold.",
};
let _lblLookup = null, _lblLookupLang = null;
function _lblKey(text) { return _thKey(text).replace(/\s*\(\d{4}\)\s*$/, ""); }
function _lblBuildLookup() {
  const m = new Map();
  [TH_TIPS, LBL_TIPS].forEach((src) => Object.keys(src).forEach((key) => {
    const parts = key.split("|"), label = parts.pop(), ctx = parts.join("|");
    m.set(ctx + "|" + _lblKey(t(label)), src[key]);   // LBL_TIPS is read second, so it wins over a TH_TIPS entry of the same label
  }));
  _lblLookup = m; _lblLookupLang = LANG;
}
function decorateLabels(scope) {
  if (!_lblLookup || _lblLookupLang !== LANG) _lblBuildLookup();
  (scope || document).querySelectorAll(".rc-sr > span:first-child, .rc-strip i, .pfx-lbl").forEach((el) => {
    if (el.dataset.tipDone) return;
    if (el.querySelector(".col-info")) { el.dataset.tipDone = "1"; return; }
    const label = _lblKey(el.textContent);
    if (!label) return;
    const ctx = el.closest(".rc-strip, .pfx-rec .pfx-sum") ? "strip" : "";
    const en = _lblLookup.get(ctx + "|" + label) || _lblLookup.get("|" + label);
    if (!en) return;
    const text = t(en).replace(/\{base\}/g, ccyLabel(FX.base));
    el.dataset.tiphost = "1";
    el.insertAdjacentHTML("beforeend", `<span class="col-info tip-down" data-tip="${esc(text)}">${COL_INFO_ICON_SVG}</span>`);
    el.dataset.tipDone = "1";
  });
}

/* Tables are drawn and redrawn all over the app (page renders, filters, tabs, import previews), so rather
 * than touching every one, watch for new <th> elements and decorate them once per frame. */
(function watchTableTitles() {
  let queued = false;
  const run = () => { queued = false; decorateTableTitles(document); decorateLabels(document); };
  const hasTable = (n) => n.nodeType === 1 && (n.tagName === "TH" || n.tagName === "TABLE" || n.tagName === "THEAD" || n.tagName === "TR" || n.querySelector("th, .rc-sr, .pfx-lbl, .rc-strip") || n.matches(".rc-sr, .pfx-lbl, .rc-strip"));
  const start = () => {
    new MutationObserver((records) => {
      if (queued) return;
      if (records.some((r) => [...r.addedNodes].some(hasTable))) { queued = true; requestAnimationFrame(run); }
    }).observe(document.body, { childList: true, subtree: true });
    run();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

/* ------------------------------------------------------------------ Chinese (zh) — only adds keys the app doesn't already have */
const TH_ZH = {
  "Stock code and name. Click it to open the stock page.": "股票代码和名称。点击可打开该股票页面。",
  "The broker you hold it with.": "您持有这只股票的券商。",
  "How many shares you own.": "您持有的股数。",
  "What you paid per share, buying fees included.": "您每股的买入价，含买入手续费。",
  "What you paid per share, without fees. Most broker apps show this.": "您每股的买入价，不含手续费。大多数券商 App 显示的是这个数字。",
  "Fees you paid when buying these shares.": "买入这些股份时支付的费用。",
  "Total you paid for the shares you still hold, fees included.": "您为仍持有的股份支付的总额，含手续费。",
  "Latest share price.": "最新股价。",
  "How much the price moved today.": "今天股价的涨跌幅度。",
  "Share price in {base}, at today's exchange rate.": "按今天汇率换算成 {base} 的股价。",
  "Shares × latest price.": "股数 × 最新价格。",
  "Profit or loss if you sold now. Not locked in yet.": "如果现在卖出的盈亏，尚未锁定。",
  "Unrealized profit or loss as a % of what you paid.": "未实现盈亏占买入成本的百分比。",
  "Profit or loss locked in by shares you sold.": "已卖出股份锁定的盈亏。",
  "Unrealized and realized profit, plus dividends received.": "未实现和已实现盈亏，加上已收股息。",
  "Total return as a % of what you paid.": "总收益占买入成本的百分比。",
  "This stock's share of your total market value.": "这只股票占您总市值的比例。",
  "Dividends received, after tax.": "已收股息（税后）。",
  "The day it happened.": "发生的日期。",
  "Buy, Sell, Dividend, Deposit and so on.": "买入、卖出、股息、存入等类型。",
  "The value of the record.": "这条记录的金额。",
  "Money in or out for that record.": "这条记录进出的金额。",
  "Value of the record in {base}.": "这条记录的价值（{base}）。",
  "Price per share on that trade.": "该笔交易的每股价格。",
  "Number of shares.": "股数。",
  "Amount before fees and tax.": "扣除费用和税项之前的金额。",
  "Commission or fees on the trade.": "这笔交易的佣金或费用。",
  "The stock's code.": "股票代码。",
  "Currency of the amount.": "金额的货币。",
  "Row number in your file.": "文件中的行号。",
  "Where this record stands.": "这条记录目前的状态。",
  "Whether the row can be imported.": "这一行是否可以导入。",
  "Amount in the row's own currency.": "该行自己货币的金额。",
  "Buy before this date to get the dividend.": "在这个日期之前买入才能拿到股息。",
  "When the dividend is expected to be paid.": "预计派发股息的日期。",
  "Estimated pay date, about 14 days after the ex-date.": "预计派息日，约在除息日后 14 天。",
  "Dividend you expect to receive, after tax.": "预计收到的股息（税后）。",
  "Dividend paid for each share.": "每股派发的股息。",
  "Dividend for all your shares, after tax.": "您所有股份的股息（税后）。",
  "This payment as a % of today's share price.": "这笔股息占今天股价的百分比。",
  "Dividend for your shares, after tax.": "您的股份可得的股息（税后）。",
  "Confirmed or estimated payment.": "已确认或估算的派息。",
  "Received, next payment or estimated.": "已收到、下一笔或估算。",
  "Dividends received after tax in that period.": "该期间收到的股息（税后）。",
  "The month the dividends were paid.": "股息发放的月份。",
  "The quarter the dividends were paid.": "股息发放的季度。",
  "The year the dividends were paid.": "股息发放的年份。",
  "Cash held with this broker in that currency.": "您在这个券商以该货币持有的现金。",
  "Cash worked out from your records.": "根据您的记录算出的现金。",
  "Cash your broker says you have.": "券商显示您拥有的现金。",
  "Calculated minus actual. Zero means they match.": "计算值减去实际值。为零表示一致。",
  "Whether it matches your broker's balance.": "是否与券商的余额一致。",
  "How many times you sold it.": "您卖出它的次数。",
  "What you paid for the shares you sold.": "您为卖出的股份支付的成本。",
  "Money you received from selling.": "卖出所得的金额。",
  "Shares sold and the price per share.": "卖出的股数和每股价格。",
  "The day you sold.": "您卖出的日期。",
  "Profit or loss as a % of what you paid.": "盈亏占买入成本的百分比。",
  "Profit or loss on the sale, after fees.": "这笔卖出的盈亏（扣除手续费）。",
  "How much of your total money (stocks plus cash) is with this broker.": "您总资金（股票加现金）中放在这个券商的比例。",
  "Cash held with this broker.": "存放在这个券商的现金。",
  "Cash ready to invest or withdraw.": "可随时投资或提取的现金。",
  "Total you have deposited.": "您累计存入的金额。",
  "Total you have withdrawn.": "您累计提取的金额。",
  "Money in minus money out. Click to see the sum.": "存入减去提取。点击查看计算。",
  "Whether your calculated cash matches what the broker shows.": "根据记录算出的现金是否与券商显示的一致。",
  "Holdings plus cash across your brokers.": "您所有券商的持仓加现金。",
  "Commission and fees on the trade.": "这笔交易的佣金和费用。",
  "Price for one share on that trade.": "该笔交易中一股的价格。",
  "Amount in the record's own currency.": "这条记录自己货币的金额。",
  "Rate used to convert it into {base}.": "换算成 {base} 所用的汇率。",
  "Total spent buying shares.": "买入股票累计花费的金额。",
  "Total received from selling shares.": "卖出股票累计收到的金额。",
  "All dividends you have received, after tax.": "您已收到的全部股息（税后）。",
  "Dividends received so far this year.": "今年迄今收到的股息。",
  "Average dividends per month over the last 12 months.": "过去 12 个月平均每月的股息。",
  "Your next expected dividend payment.": "您下一笔预计收到的股息。",
  "Return on shares you still hold. The Dashboard also counts shares you sold.": "仍持有股份的收益。仪表盘还会计入已卖出的股份。",
  "Shares you own, with your average cost per share underneath.": "您持有的股数，下方是每股平均成本。",
  "What you could collect in that year.": "当年您可以收到的股息。",
  "Everything you could have collected up to the end of that year.": "到当年年底为止累计可收到的股息。",
  "How many years from now.": "从现在起第几年。",
  "Profit or loss from the share price moving, not counting dividends.": "股价涨跌带来的盈亏，不含股息。",
  "Everything this stock has paid you in dividends, after tax.": "这只股票派给您的全部股息（税后）。",
  "Total you have spent buying shares.": "买入股票累计花费的金额。",
  /* the other info icons whose wording was shortened */
  "Time zone decides which day counts as \"today\". Gains and losses use the Average Cost method.": "时区决定哪一天算“今天”。盈亏按平均成本法计算。",
  "Add many records at once from a spreadsheet. You can preview before anything is saved.": "用表格一次添加多条记录。保存之前可以先预览。",
  "What your holdings here are worth at today's prices.": "您在这里持有的股票按今天价格的价值。",
  "Each record keeps its own currency. Base-currency amounts come from exchange rates.": "每条记录保留自己的货币，基准货币金额由汇率换算得出。",
  "Worked out from your deposits, withdrawals, trades, dividends, fees and transfers.": "根据您的存入、提取、交易、股息、费用和转账算出。",
  "Whether dividends stay in this broker's cash or go to your bank.": "股息是留在这个券商的现金里，还是转到您的银行。",
  "Market value versus what you paid. The gap is your unrealized profit or loss.": "市值与买入成本的对比，差额就是未实现盈亏。",
  "Used for new dividends from this broker unless you change it on one.": "这个券商新增的股息默认使用，单笔记录可以另外修改。",
  "Profit or loss on shares you still hold. Not locked in until you sell.": "仍持有股份的盈亏，卖出之前尚未锁定。",
  "Cash in this broker, ready to invest or withdraw.": "这个券商里的现金，可随时投资或提取。",
  "Dividends received from this broker, after tax.": "从这个券商收到的股息（税后）。",
  "Dividend dates and amounts from market data. They feed the forecast above.": "来自市场数据的股息日期和金额，会用于上方的预测。",
  "Dividend dates and amounts for this stock from market data. They feed the forecast above.": "这只股票来自市场数据的股息日期和金额，会用于上方的预测。",
  "Dividends as a % of what you originally paid, not today's price.": "股息占您原始买入成本的百分比，而不是今天的价格。",
};
Object.keys(TH_ZH).forEach((k) => { if (!I18N.zh[k]) I18N.zh[k] = TH_ZH[k]; });
