/* =============================================================================
 * Vercel Serverless Function — dividend history/schedule proxy (Yahoo Finance, keyless)
 * -----------------------------------------------------------------------------
 * Returns dividend events for ANY ticker Yahoo covers — US and international
 * markets alike (e.g. 1155.KL, D05.SI, 0700.HK, ...) — using the same keyless
 * Yahoo chart endpoint already used by /api/quote. No signup, no API key, no
 * per-market restriction (the previous version of this file used Finnhub,
 * which required a free API key and only reliably covered US tickers).
 *
 * The window defaults to roughly 2 years back through 1 year ahead, so one
 * call serves two purposes: recent PAST events feed pattern-based dividend
 * forecasting (frequency + growth detection), while any FUTURE-dated event
 * (rare — most issuers don't declare that far ahead) becomes a confirmed
 * upcoming payment.
 *
 * Usage:
 *   /api/dividend?symbol=AAPL
 *   /api/dividend?symbol=1155.KL&from=2024-01-01&to=2027-01-01
 *
 * Response shape (array, ascending by date):
 *   [{ date, amount, currency }, ...]
 * date = ex-dividend date (Yahoo's chart API doesn't separately report a pay
 * date); amount = per share, in the security's own currency.
 * ========================================================================== */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const symbol = String((req.query && req.query.symbol) || "").trim();
  if (!symbol) { res.status(400).json({ error: "Missing ?symbol" }); return; }
  if (!/^[A-Za-z0-9.\-]{1,20}$/.test(symbol)) { res.status(400).json({ error: "Invalid symbol" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const from = String((req.query && req.query.from) || "").trim() || (() => {
    const d = new Date(today.replace(/-/g, "/")); d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10);
  })();
  const to = String((req.query && req.query.to) || "").trim() || (() => {
    const d = new Date(today.replace(/-/g, "/")); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
  })();
  const period1 = Math.floor(new Date(from.replace(/-/g, "/")).getTime() / 1000);
  const period2 = Math.floor(new Date(to.replace(/-/g, "/")).getTime() / 1000);

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  async function getChart() {
    const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
    for (const h of hosts) {
      try {
        const r = await fetch(`${h}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div`, { headers });
        if (r.ok) return await r.json();
      } catch (e) { /* try next host */ }
    }
    return null;
  }

  try {
    const data = await getChart();
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result) { res.status(404).json({ error: `No data for ${symbol}` }); return; }
    const currency = (result.meta && result.meta.currency) || null;
    const divEvents = (result.events && result.events.dividends) || {};
    const out = Object.values(divEvents)
      .map((d) => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount, currency }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    // Cache at the edge for 1 hour — dividend schedules rarely change intra-day.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
