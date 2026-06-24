/* =============================================================================
 * Investment Ledger — YOUR DATA
 * -----------------------------------------------------------------------------
 * This is the single source of truth for the whole app. Fill in your own
 * records below. Each array starts EMPTY. A commented-out example sits above
 * each one showing the exact shape — copy it, remove the //, and edit.
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

/* Cash ledger — deposits & withdrawals (original currency preserved).
 * Example:
 *   { date: "2025-01-06", brokerId: "rkt", type: "Deposit",    amount: 20000, currency: "MYR" },
 *   { date: "2025-08-02", brokerId: "rkt", type: "Withdrawal", amount: 5000,  currency: "MYR" },
 */
const CASH_LEDGER = [
];

/* Current holdings. avgCost & price are in the asset's OWN currency.
 * netDividends is the net dividend you've received for this holding, in BASE currency.
 * Example:
 *   {
 *     ticker: "AAPL", company: "Apple Inc.", brokerId: "ibkr", market: "NASDAQ",
 *     currency: "USD", shares: 15, avgCost: 180.00, price: 215.40,
 *     netDividends: 95.00,
 *   },
 */
const HOLDINGS = [
];

/* Closed positions feed Realized P/L (figures in the asset's own currency).
 * Example:
 *   { ticker: "NVDA", brokerId: "ibkr", proceeds: 4100, costBasis: 3300, fees: 18, currency: "USD" },
 */
const REALIZED = [
];

/* Standalone fees not attached to a buy/sell (platform / FX fees), in BASE currency. */
const STANDALONE_FEES_BASE = 0;

/* Portfolio value over time (base currency) for the line chart.
 * Example:
 *   { month: "Jan 26", value: 44800 },
 *   { month: "Feb 26", value: 43900 },
 */
const PORTFOLIO_SERIES = [
];

/* Upcoming dividends. status: Confirmed | Estimated | Paid | Cancelled | Unknown.
 * Never mark an estimate as "Confirmed".
 * Example:
 *   { ticker: "O", company: "Realty Income", brokerId: "ibkr", exDate: "2026-06-30", payDate: "2026-07-15", expectedNet: 49.6, currency: "USD", status: "Confirmed" },
 */
const UPCOMING_DIVIDENDS = [
];

/* Recent transactions feed shown on the dashboard.
 * Example:
 *   { date: "2026-06-12", brokerId: "ibkr", type: "Dividend", ticker: "O", amount: 49.6, currency: "USD" },
 */
const RECENT_TX = [
];

/* Reconciliation: your calculated vs actual broker cash balance (base currency).
 * A mismatch shows a warning. Example:
 *   { brokerId: "rkt", calculated: 6240.0, actual: 6240.0 },
 */
const RECONCILIATION = [
];

/* Extra dashboard warnings. level: "warn" | "crit". Example:
 *   { level: "warn", text: "AAPL dividend on 9 Aug 2026 is estimated — not confirmed." },
 */
const EXTRA_WARNINGS = [
];

/* Your profile (Settings / Profile). */
const USER = {
  name: "",
  email: "",
  baseCurrency: "MYR",
  joined: "",
};

/* Full transactions ledger. type can be:
 * Deposit | Withdrawal | Buy | Sell | Dividend | Dividend Tax | Fee |
 * Currency Exchange | Stock Split | DRIP / Reinvested | Adjustment
 * net = gross - tax - fee. Example:
 *   { id: "t01", date: "2025-01-06", brokerId: "rkt", type: "Deposit", ticker: "—", qty: null, price: null, gross: 20000, fee: 0, tax: 0, net: 20000, currency: "MYR" },
 *   { id: "t02", date: "2025-01-10", brokerId: "rkt", type: "Buy", ticker: "1155.KL", qty: 1000, price: 9.20, gross: 9200, fee: 9.2, tax: 0, net: 9209.2, currency: "MYR" },
 */
const ALL_TRANSACTIONS = [
];

/* Dividend history (paid). Net = gross − withholding tax − other fees. Example:
 *   { ticker: "O", brokerId: "ibkr", exDate: "2025-04-01", payDate: "2025-04-15", gross: 12.4, tax: 1.86, fees: 0, currency: "USD", status: "Paid" },
 */
const DIVIDEND_HISTORY = [
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
};

/* Daily portfolio-value history (base currency), built automatically: one
 * { date, value } point per day as you use the app. Powers the real
 * "Portfolio Value Over Time" chart (market value, not cost). */
const PV_HISTORY = [];

/* When the data was last saved on this device (ISO string). */
let LAST_SAVED = "";