/* =============================================================================
 * Vercel Serverless Function — live quote proxy (Yahoo Finance, keyless)
 * -----------------------------------------------------------------------------
 * The browser can't call Yahoo directly (CORS). This runs server-side on Vercel
 * and returns a small, CORS-enabled JSON quote. Works for stocks AND FX pairs:
 *   /api/quote?symbol=AAPL        (US)
 *   /api/quote?symbol=1155.KL     (Bursa Malaysia)
 *   /api/quote?symbol=D05.SI      (Singapore)
 *   /api/quote?symbol=0700.HK     (Hong Kong)
 *   /api/quote?symbol=USDMYR=X    (FX rate)
 * Prices here ARE live/delayed market data — the app labels them "Live" so they
 * are never confused with manually entered prices.
 * ========================================================================== */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const symbol = String((req.query && req.query.symbol) || "").trim();
  if (!symbol) { res.status(400).json({ error: "Missing ?symbol" }); return; }
  if (!/^[A-Za-z0-9.\-=^]{1,20}$/.test(symbol)) { res.status(400).json({ error: "Invalid symbol" }); return; }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  async function getChart(sym) {
    const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
    for (const h of hosts) {
      try {
        const r = await fetch(`${h}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, { headers });
        if (r.ok) return await r.json();
      } catch (e) { /* try next host */ }
    }
    return null;
  }

  try {
    const data = await getChart(symbol);
    if (!data) { res.status(502).json({ error: "Upstream unavailable" }); return; }
    const m = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
    if (!m || m.regularMarketPrice == null) { res.status(404).json({ error: `No data for ${symbol}` }); return; }

    const prev = m.chartPreviousClose != null ? m.chartPreviousClose : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    const price = m.regularMarketPrice;

    // Best-effort company name via Yahoo search (chart meta doesn't carry it).
    let name = m.shortName || m.longName || null;
    if (!name) {
      try {
        const s = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=3&newsCount=0`,
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; InvestmentLedger/1.0)" } });
        if (s.ok) {
          const sd = await s.json();
          const q = (sd.quotes || []).find((x) => x.symbol === (m.symbol || symbol)) || (sd.quotes || [])[0];
          if (q) name = q.longname || q.shortname || null;
        }
      } catch (e) { /* name stays null */ }
    }

    // Cache at the edge for a minute to be gentle on the upstream.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({
      symbol: m.symbol || symbol,
      name,
      price,
      currency: m.currency || null,
      previousClose: prev,
      change: price - prev,
      changePct: prev ? ((price - prev) / prev) * 100 : 0,
      time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      exchange: m.exchangeName || null,
      source: "Yahoo Finance",
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
