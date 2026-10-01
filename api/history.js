/* =============================================================================
 * Vercel Serverless Function — daily price history proxy (Yahoo Finance, keyless)
 * -----------------------------------------------------------------------------
 * Feeds the Dashboard's "Net worth over time" chart: the browser replays the user's
 * own transactions against these daily closes to rebuild what the portfolio was
 * worth on every past day.
 *   /api/history?symbol=1155.KL&from=2024-04-05
 *   /api/history?symbol=AAPL&from=2024-04-05
 *   /api/history?symbol=USDMYR=X&from=2024-04-05      (FX pairs work too)
 *
 * Prices come back AS TRADED. Yahoo's "close" is adjusted backwards for stock splits
 * (a 4:1 split divides every earlier close by 4), but the ledger records a split as its
 * own transaction — the share count changes ON the split date — so a day before the
 * split has to be valued at the price people actually paid then, otherwise every value
 * before a split would be off by the split ratio. This undoes that adjustment.
 * ========================================================================== */
const { fetchTimeout, isValidIsoDate } = require("./_lib");

const DAY = 86400;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const symbol = String((req.query && req.query.symbol) || "").trim();
  if (!symbol) { res.status(400).json({ error: "Missing ?symbol" }); return; }
  if (!/^[A-Za-z0-9.\-=^]{1,20}$/.test(symbol)) { res.status(400).json({ error: "Invalid symbol" }); return; }

  const nowSec = Math.floor(Date.now() / 1000);
  const from = String((req.query && req.query.from) || "").trim();
  let startSec = nowSec - 3 * 365 * DAY;
  if (from) {
    if (!isValidIsoDate(from)) { res.status(400).json({ error: "Invalid ?from (use YYYY-MM-DD)" }); return; }
    startSec = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
    if (startSec > nowSec) { res.status(400).json({ error: "?from is in the future" }); return; }
  }
  // A week of lead-in, so the first requested day can carry the previous close forward
  // across a weekend or holiday; nothing before 1990 (Yahoo has little, and it bloats the reply).
  const period1 = Math.max(startSec - 7 * DAY, Math.floor(Date.UTC(1990, 0, 1) / 1000));
  const period2 = nowSec + DAY;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  async function getChart() {
    const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
    for (const h of hosts) {
      try {
        const r = await fetchTimeout(`${h}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=split`, { headers });
        if (r.ok) return await r.json();
      } catch (e) { /* try next host */ }
    }
    return null;
  }

  try {
    const data = await getChart();
    if (!data) { res.status(502).json({ error: "Upstream unavailable" }); return; }
    const r = data.chart && data.chart.result && data.chart.result[0];
    const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
    if (!r || !Array.isArray(r.timestamp) || !q || !Array.isArray(q.close)) { res.status(404).json({ error: `No history for ${symbol}` }); return; }

    // Splits, newest first, so one backwards pass accumulates the factor each earlier day needs.
    const splits = Object.values((r.events && r.events.splits) || {})
      .filter((s) => s && s.date && +s.numerator > 0 && +s.denominator > 0)
      .map((s) => ({ date: +s.date, ratio: +s.numerator / +s.denominator }))
      .sort((a, b) => b.date - a.date);
    const gmtoffset = (r.meta && +r.meta.gmtoffset) || 0;   // seconds — turns Yahoo's UTC stamp into the exchange's calendar day

    const points = [];
    let factor = 1, si = 0;
    for (let i = r.timestamp.length - 1; i >= 0; i--) {
      const ts = r.timestamp[i];
      while (si < splits.length && splits[si].date > ts) { factor *= splits[si].ratio; si++; }
      const c = q.close[i];
      if (c == null || !isFinite(c)) continue;
      const day = new Date((ts + gmtoffset) * 1000).toISOString().slice(0, 10);
      points.push([day, +(c * factor).toFixed(6)]);
    }
    points.reverse();
    if (!points.length) { res.status(404).json({ error: `No history for ${symbol}` }); return; }

    // The past never changes, so let the edge keep it for an hour (and serve it stale for a day while it refreshes).
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({
      symbol: (r.meta && r.meta.symbol) || symbol,
      currency: (r.meta && r.meta.currency) || null,
      points,
      splits: splits.map((s) => ({ date: new Date((s.date + gmtoffset) * 1000).toISOString().slice(0, 10), ratio: s.ratio })).reverse(),
      source: "Yahoo Finance",
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
