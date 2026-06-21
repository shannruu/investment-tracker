/* =============================================================================
 * Investment Ledger — Sample Data
 * -----------------------------------------------------------------------------
 * Base currency: MYR. Holdings in both MYR and USD.
 * All base-currency figures are derived from original currency + exchange rate,
 * never overwritten (mirrors the data-model rule in the brief).
 * This object is the single source of truth the dashboard renders from.
 * ========================================================================== */

const FX = {
  base: "MYR",
  // Original currency -> base. Kept explicit so every conversion is auditable.
  rates: { MYR: 1, USD: 4.70, SGD: 3.48 },
};

const BROKERS = [
  { id: "rkt", name: "Rakuten Trade", country: "Malaysia", currency: "MYR" },
  { id: "ibkr", name: "Interactive Brokers", country: "United States", currency: "USD" },
  { id: "moo", name: "Moomoo MY", country: "Malaysia", currency: "MYR" },
];

/* Cash ledger — deposits & withdrawals (original currency preserved). */
const CASH_LEDGER = [
  { date: "2025-01-06", brokerId: "rkt",  type: "Deposit",    amount: 20000, currency: "MYR" },
  { date: "2025-02-03", brokerId: "ibkr", type: "Deposit",    amount: 4000,  currency: "USD" },
  { date: "2025-03-11", brokerId: "moo",  type: "Deposit",    amount: 8000,  currency: "MYR" },
  { date: "2025-05-19", brokerId: "ibkr", type: "Deposit",    amount: 600,   currency: "USD" },
  { date: "2025-08-02", brokerId: "rkt",  type: "Withdrawal", amount: 5000,  currency: "MYR" },
  { date: "2026-01-15", brokerId: "moo",  type: "Withdrawal", amount: 3000,  currency: "MYR" },
];

/* Current holdings. Cost & price are in the asset's own currency. */
const HOLDINGS = [
  {
    ticker: "AAPL", company: "Apple Inc.", brokerId: "ibkr", market: "NASDAQ",
    currency: "USD", shares: 15, avgCost: 180.00, price: 215.40,
    netDividends: 95.00,   // already in base (MYR)
  },
  {
    ticker: "MSFT", company: "Microsoft Corp.", brokerId: "ibkr", market: "NASDAQ",
    currency: "USD", shares: 8, avgCost: 390.00, price: 430.10,
    netDividends: 60.00,
  },
  {
    ticker: "O", company: "Realty Income Corp.", brokerId: "ibkr", market: "NYSE",
    currency: "USD", shares: 20, avgCost: 58.00, price: 55.10,
    netDividends: 480.00,
  },
  {
    ticker: "1155.KL", company: "Malayan Banking Bhd", brokerId: "rkt", market: "Bursa Malaysia",
    currency: "MYR", shares: 1000, avgCost: 9.20, price: 10.10,
    netDividends: 850.00,
  },
  {
    ticker: "5347.KL", company: "Tenaga Nasional Bhd", brokerId: "moo", market: "Bursa Malaysia",
    currency: "MYR", shares: 200, avgCost: 11.50, price: 14.20,
    netDividends: 365.00,
  },
];

/* Closed positions feed Realized P/L. */
const REALIZED = [
  { ticker: "NVDA", brokerId: "ibkr", proceeds: 4100, costBasis: 3300, fees: 18, currency: "USD" },
];
// Realized P/L (base) = (4100 - 3300 - 18) * 4.70 = 3,673.40 MYR

/* Standalone fees not attached to a buy/sell (e.g. platform / FX fees). */
const STANDALONE_FEES_BASE = 95.0;

/* 12-month portfolio value series (base currency) for the line chart. */
const PORTFOLIO_SERIES = [
  { month: "Jul 25", value: 38200 },
  { month: "Aug 25", value: 36900 },
  { month: "Sep 25", value: 39400 },
  { month: "Oct 25", value: 41100 },
  { month: "Nov 25", value: 40200 },
  { month: "Dec 25", value: 43600 },
  { month: "Jan 26", value: 44800 },
  { month: "Feb 26", value: 43900 },
  { month: "Mar 26", value: 46500 },
  { month: "Apr 26", value: 47700 },
  { month: "May 26", value: 48300 },
  { month: "Jun 26", value: 49435.5 },
];

/* Upcoming dividends. "Estimated" must never be shown as confirmed. */
const UPCOMING_DIVIDENDS = [
  { ticker: "O", company: "Realty Income", brokerId: "ibkr", exDate: "2026-06-30", payDate: "2026-07-15", expectedNet: 49.6, currency: "USD", status: "Confirmed" },
  { ticker: "1155.KL", company: "Malayan Banking", brokerId: "rkt", exDate: "2026-07-08", payDate: "2026-07-29", expectedNet: 290.0, currency: "MYR", status: "Confirmed" },
  { ticker: "AAPL", company: "Apple Inc.", brokerId: "ibkr", exDate: "2026-08-09", payDate: "2026-08-15", expectedNet: 11.7, currency: "USD", status: "Estimated" },
  { ticker: "5347.KL", company: "Tenaga Nasional", brokerId: "moo", exDate: "2026-09-22", payDate: "2026-10-10", expectedNet: 180.0, currency: "MYR", status: "Estimated" },
];

/* Recent transactions feed. */
const RECENT_TX = [
  { date: "2026-06-12", brokerId: "ibkr", type: "Dividend", ticker: "O",       amount: 49.6,  currency: "USD" },
  { date: "2026-06-05", brokerId: "rkt",  type: "Buy",      ticker: "1155.KL", amount: 2020.0, currency: "MYR" },
  { date: "2026-05-28", brokerId: "moo",  type: "Sell",     ticker: "5347.KL", amount: 1420.0, currency: "MYR" },
  { date: "2026-05-19", brokerId: "ibkr", type: "Deposit",  ticker: "—",       amount: 600.0,  currency: "USD" },
  { date: "2026-05-02", brokerId: "ibkr", type: "Fee",      ticker: "—",       amount: 12.0,   currency: "USD" },
];

/* Reconciliation snapshots: calculated vs actual broker cash balance (base). */
const RECONCILIATION = [
  { brokerId: "rkt",  calculated: 6240.0, actual: 6240.0 },
  { brokerId: "ibkr", calculated: 1180.0, actual: 1180.0 },
  { brokerId: "moo",  calculated: 4985.0, actual: 4910.0 }, // mismatch -> warning
];

/* Extra warnings to surface on the dashboard. */
const EXTRA_WARNINGS = [
  { level: "warn", text: "AAPL dividend on 9 Aug 2026 is estimated from historical pattern — not confirmed." },
  { level: "warn", text: "Missing exchange rate for an SGD transaction on 14 Jun 2026." },
];

/* User profile (Settings / Profile). */
const USER = {
  name: "Aiman Rahman",
  email: "aimodel@krobox.com",
  baseCurrency: "MYR",
  joined: "2025-01-06",
};

/* Full transactions ledger — every transaction type from the brief. */
const ALL_TRANSACTIONS = [
  { id: "t01", date: "2025-01-06", brokerId: "rkt",  type: "Deposit",          ticker: "—",       qty: null, price: null, gross: 20000, fee: 0,   tax: 0,    net: 20000, currency: "MYR" },
  { id: "t02", date: "2025-01-10", brokerId: "rkt",  type: "Buy",              ticker: "1155.KL", qty: 1000, price: 9.20,  gross: 9200,  fee: 9.2, tax: 0,    net: 9209.2, currency: "MYR" },
  { id: "t03", date: "2025-02-03", brokerId: "ibkr", type: "Deposit",          ticker: "—",       qty: null, price: null, gross: 4000,  fee: 0,   tax: 0,    net: 4000,  currency: "USD" },
  { id: "t04", date: "2025-02-05", brokerId: "ibkr", type: "Buy",              ticker: "AAPL",    qty: 15,   price: 180.0, gross: 2700,  fee: 1.0, tax: 0,    net: 2701,  currency: "USD" },
  { id: "t05", date: "2025-02-18", brokerId: "ibkr", type: "Buy",              ticker: "MSFT",    qty: 8,    price: 390.0, gross: 3120,  fee: 1.0, tax: 0,    net: 3121,  currency: "USD" },
  { id: "t06", date: "2025-03-11", brokerId: "moo",  type: "Deposit",          ticker: "—",       qty: null, price: null, gross: 8000,  fee: 0,   tax: 0,    net: 8000,  currency: "MYR" },
  { id: "t07", date: "2025-03-14", brokerId: "moo",  type: "Buy",              ticker: "5347.KL", qty: 200,  price: 11.50, gross: 2300,  fee: 4.6, tax: 0,    net: 2304.6, currency: "MYR" },
  { id: "t08", date: "2025-04-02", brokerId: "ibkr", type: "Buy",              ticker: "O",       qty: 20,   price: 58.0,  gross: 1160,  fee: 1.0, tax: 0,    net: 1161,  currency: "USD" },
  { id: "t09", date: "2025-04-21", brokerId: "ibkr", type: "Dividend",         ticker: "O",       qty: null, price: null, gross: 12.4,  fee: 0,   tax: 1.86, net: 10.54, currency: "USD", exDate: "2025-04-01", payDate: "2025-04-15" },
  { id: "t10", date: "2025-05-19", brokerId: "ibkr", type: "Deposit",          ticker: "—",       qty: null, price: null, gross: 600,   fee: 0,   tax: 0,    net: 600,   currency: "USD" },
  { id: "t11", date: "2025-06-12", brokerId: "rkt",  type: "Dividend",         ticker: "1155.KL", qty: null, price: null, gross: 600,   fee: 0,   tax: 0,    net: 600,   currency: "MYR", exDate: "2025-06-01", payDate: "2025-06-12" },
  { id: "t12", date: "2025-07-03", brokerId: "ibkr", type: "Dividend",         ticker: "MSFT",    qty: null, price: null, gross: 6.0,   fee: 0,   tax: 0.90, net: 5.10,  currency: "USD", exDate: "2025-06-18", payDate: "2025-07-03" },
  { id: "t13", date: "2025-07-30", brokerId: "ibkr", type: "Sell",             ticker: "NVDA",    qty: 6,    price: 683.3, gross: 4100,  fee: 18,  tax: 0,    net: 4082,  currency: "USD" },
  { id: "t14", date: "2025-08-02", brokerId: "rkt",  type: "Withdrawal",       ticker: "—",       qty: null, price: null, gross: 5000,  fee: 0,   tax: 0,    net: 5000,  currency: "MYR" },
  { id: "t15", date: "2025-09-15", brokerId: "ibkr", type: "DRIP / Reinvested",ticker: "O",       qty: 0.9,  price: 55.4,  gross: 49.6,  fee: 0,   tax: 7.44, net: 42.16, currency: "USD", linkedId: "t09" },
  { id: "t16", date: "2025-11-20", brokerId: "ibkr", type: "Fee",              ticker: "—",       qty: null, price: null, gross: 12,    fee: 12,  tax: 0,    net: 12,    currency: "USD" },
  { id: "t17", date: "2026-01-15", brokerId: "moo",  type: "Withdrawal",       ticker: "—",       qty: null, price: null, gross: 3000,  fee: 0,   tax: 0,    net: 3000,  currency: "MYR" },
  { id: "t18", date: "2026-03-19", brokerId: "moo",  type: "Dividend",         ticker: "5347.KL", qty: null, price: null, gross: 365,   fee: 0,   tax: 0,    net: 365,   currency: "MYR", exDate: "2026-03-05", payDate: "2026-03-19" },
  { id: "t19", date: "2026-05-28", brokerId: "moo",  type: "Currency Exchange",ticker: "—",       qty: null, price: null, gross: 1000,  fee: 3,   tax: 0,    net: 997,   currency: "MYR" },
  { id: "t20", date: "2026-06-12", brokerId: "ibkr", type: "Dividend",         ticker: "O",       qty: null, price: null, gross: 12.4,  fee: 0,   tax: 1.86, net: 10.54, currency: "USD", exDate: "2026-06-01", payDate: "2026-06-12" },
];

/* Dividend history (paid). Net = gross − withholding tax − other fees. */
const DIVIDEND_HISTORY = [
  { ticker: "O",       brokerId: "ibkr", exDate: "2025-04-01", payDate: "2025-04-15", gross: 12.4, tax: 1.86, fees: 0, currency: "USD", status: "Paid" },
  { ticker: "1155.KL", brokerId: "rkt",  exDate: "2025-06-01", payDate: "2025-06-12", gross: 600,  tax: 0,    fees: 0, currency: "MYR", status: "Paid" },
  { ticker: "MSFT",    brokerId: "ibkr", exDate: "2025-06-18", payDate: "2025-07-03", gross: 6.0,  tax: 0.90, fees: 0, currency: "USD", status: "Paid" },
  { ticker: "O",       brokerId: "ibkr", exDate: "2025-09-01", payDate: "2025-09-15", gross: 12.4, tax: 1.86, fees: 0, currency: "USD", status: "Paid" },
  { ticker: "5347.KL", brokerId: "moo",  exDate: "2026-03-05", payDate: "2026-03-19", gross: 365,  tax: 0,    fees: 0, currency: "MYR", status: "Paid" },
  { ticker: "O",       brokerId: "ibkr", exDate: "2026-06-01", payDate: "2026-06-12", gross: 12.4, tax: 1.86, fees: 0, currency: "USD", status: "Paid" },
];
