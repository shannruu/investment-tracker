/* =============================================================================
 * Shared helpers for the api/*.js serverless functions.
 * Prefixed with "_" so Vercel excludes this file from routing — it's a plain
 * module the others require(), not a function of its own.
 * ========================================================================== */

/* fetch() with a hard timeout. None of these endpoints bound how long an upstream,
 * undocumented, no-SLA API (Yahoo/Nasdaq/TradingView) can take to respond or hang —
 * without this, one slow/hung upstream request stalled the whole serverless function
 * until Vercel's own platform-level execution limit killed it: a raw gateway timeout,
 * not this endpoint's own JSON error shape. Worse for the endpoints that fan out into
 * several/many parallel upstream calls via Promise.all (ex-dividend-calendar.js's
 * per-day requests, ex-dividend-calendar-my.js's per-row symbol lookups) — one hung
 * request there blocks the whole batch, not just itself. An abort is just another
 * failed fetch to every call site, which already wraps this in try/catch. */
async function fetchTimeout(url, opts = {}, ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Shared ?from/?to validation. Without it, a malformed date param silently becomes
// NaN downstream (new Date("notadate").getTime() = NaN) instead of a clear 400 — e.g.
// api/dividend.js used to let that NaN flow straight into the outbound Yahoo URL, which
// would then just fail to find anything, coming back as a factually wrong 404
// "no data for AAPL" instead of "your date param was invalid."
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidIsoDate(s) {
  if (!ISO_DATE_RE.test(s)) return false;
  return !isNaN(new Date(s.replace(/-/g, "/")).getTime());
}

module.exports = { fetchTimeout, isValidIsoDate };
