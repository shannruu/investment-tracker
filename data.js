/* =============================================================================
 * Investment Ledger — YOUR DATA
 * -----------------------------------------------------------------------------
 * This is the seed data loaded the very first time the app runs on a device —
 * after that, everything lives in the browser's localStorage and this file is
 * no longer read (edit records through the app's UI instead: Add, Brokers,
 * Settings). ALL_TRANSACTIONS is the single source of truth for every deposit,
 * withdrawal, buy, sell, dividend, and fee — everything else (cash balances,
 * holdings, gain/loss, dividend totals) is derived from it.
 *
 * Rules:
 *  - Keep each record's ORIGINAL currency and amount. Base-currency values are
 *    calculated automatically using the exchange rates in FX below.
 *  - brokerId in every record must match an `id` you defined in BROKERS.
 *  - Dates are "YYYY-MM-DD".
 * ========================================================================== */

const FX = {
  base: "MYR",                                   // your base currency
  // Exchange rate from each currency -> base. Add any you use.
  rates: { MYR: 1, USD: 4.70, SGD: 3.48 },
};

/* Your brokers / investment apps.
 * Example:
 *   { id: "rkt", name: "Rakuten Trade", country: "Malaysia", currency: "MYR" },
 */
const BROKERS = [
];

/* Opening positions you owned BEFORE you started tracking here (skip this if
 * you're recording everything from day one — a Buy transaction is enough).
 * avgCost & price are in the asset's OWN currency; netDividends is in BASE currency.
 * Example:
 *   {
 *     ticker: "AAPL", company: "Apple Inc.", brokerId: "ibkr", market: "NASDAQ",
 *     currency: "USD", shares: 15, avgCost: 180.00, price: 215.40,
 *     netDividends: 95.00,
 *   },
 */
const HOLDINGS = [
];

/* Upcoming dividends. status: Confirmed | Estimated | Paid | Cancelled | Unknown.
 * Never mark an estimate as "Confirmed".
 * Example:
 *   { ticker: "O", company: "Realty Income", brokerId: "ibkr", exDate: "2026-06-30", payDate: "2026-07-15", expectedNet: 49.6, currency: "USD", status: "Confirmed" },
 */
const UPCOMING_DIVIDENDS = [
];

/* Your profile (Settings / Profile). */
const USER = {
  name: "",
  email: "",
  baseCurrency: "MYR",
  joined: "",
};

/* Full transactions ledger — deposits, withdrawals, buys, sells, dividends
 * (paid and expected), fees, currency exchanges, splits, all in one place.
 * type can be:
 * Deposit | Withdrawal | Buy | Sell | Dividend | Fee |
 * Currency Exchange | Stock split | Transfer between brokers | Interest
 * gross = the amount before fee/tax. Example:
 *   { id: "t01", date: "2025-01-06", brokerId: "rkt", type: "Deposit", ticker: "—", qty: null, price: null, gross: 20000, fee: 0, tax: 0, currency: "MYR" },
 *   { id: "t02", date: "2025-01-10", brokerId: "rkt", type: "Buy", ticker: "1155.KL", qty: 1000, price: 9.20, gross: 9200, fee: 9.2, tax: 0, currency: "MYR" },
 *   { id: "t03", date: "2025-04-15", brokerId: "ibkr", type: "Dividend", ticker: "O", gross: 12.4, tax: 1.86, currency: "USD", status: "Received" },
 */
const ALL_TRANSACTIONS = [
];

/* Manually entered CURRENT prices (NOT live). Keyed by ticker.
 * { price, currency, date } — used only for valuation; clearly labelled "Manual price". */
const CURRENT_PRICES = {};

/* Stock metadata cache keyed by Yahoo symbol: { name, exchange, currency, country, sector, industry }.
 * Populated by the stock lookup; used for country/sector grouping. */
const STOCK_META = {};

/* Reconciliation checks the user records, keyed by brokerId:
 * { actual, date, note } — actual broker cash balance the user typed in. */
const RECON_CHECKS = {};

/* App settings persisted with the data. */
const SETTINGS = {
  returnMode: "total",       // "total" (incl. dividends) | "price"
  reconTolerance: 1,         // MYR tolerance for "Matched" vs "Needs review"
  dateFormat: "D MMM YYYY",  // D MMM YYYY | YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY
  timeZone: "",              // display reference (blank = device local)
  costBasis: "average",      // "average" (implemented) | "fifo" (future)
  pvMode: "mv",              // "mv" (market value only) | "total" (incl. cash)
  showReconciliation: false, // Broker Cash Reconciliation panel — opt-in, off by default
};

/* Daily portfolio-value history (base currency), built automatically: one
 * { date, value } point per day as you use the app. Powers the real
 * "Portfolio Value Over Time" chart (market value, not cost). */
const PV_HISTORY = [];

/* When the data was last saved on this device (ISO string). */
let LAST_SAVED = "";