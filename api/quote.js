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
  // quoteSummary (unlike the chart endpoint above) requires a session cookie + crumb —
  // Yahoo tightened this a while back. Best-effort only: if either leg fails or Yahoo
  // blocks the request outright, callers just don't get trailingEps, same as the
  // existing sector/country lookup below already silently degrades.
  function extractCookie(r) {
    if (typeof r.headers.getSetCookie === "function") {
      return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    }
    const single = r.headers.get("set-cookie");
    return single ? single.split(";")[0] : "";
  }
  async function getYahooCrumb() {
    const r1 = await fetch("https://fc.yahoo.com", { headers, redirect: "manual" });
    const cookie = extractCookie(r1);
    if (!cookie) return null;
    const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { ...headers, Cookie: cookie } });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    return crumb ? { crumb, cookie } : null;
  }

  try {
    const data = await getChart(symbol);
    if (!data) { res.status(502).json({ error: "Upstream unavailable" }); return; }
    const m = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
    if (!m || m.regularMarketPrice == null) { res.status(404).json({ error: `No data for ${symbol}` }); return; }

    const prev = m.chartPreviousClose != null ? m.chartPreviousClose : (m.previousClose != null ? m.previousClose : m.regularMarketPrice);
    const price = m.regularMarketPrice;

    // Best-effort company name + sector/industry/country via Yahoo search + profile.
    let name = m.shortName || m.longName || null;
    let sector = null, industry = null, country = null;
    try {
      const s = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=3&newsCount=0`, { headers });
      if (s.ok) {
        const sd = await s.json();
        const q = (sd.quotes || []).find((x) => x.symbol === (m.symbol || symbol)) || (sd.quotes || [])[0];
        if (q) { name = name || q.longname || q.shortname || null; sector = q.sector || null; industry = q.industry || null; }
      }
    } catch (e) { /* ignore */ }
    // quoteSummary (assetProfile, summaryDetail, defaultKeyStatistics) requires a
    // crumb since Yahoo tightened access — fetch it once, share across both calls
    // below. Either can fail outright (blocked, rate-limited, endpoint changed)
    // without affecting the core price response above, which never depends on this.
    let crumbInfo = null;
    if (!sector || !country) {
      try { crumbInfo = await getYahooCrumb(); } catch (e) { /* ignore */ }
    }
    let trailingEps = null;
    if (crumbInfo) {
      const qsHeaders = { ...headers, Cookie: crumbInfo.cookie };
      try {
        const p = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile&crumb=${encodeURIComponent(crumbInfo.crumb)}`, { headers: qsHeaders });
        if (p.ok) {
          const pd = await p.json();
          const ap = pd && pd.quoteSummary && pd.quoteSummary.result && pd.quoteSummary.result[0] && pd.quoteSummary.result[0].assetProfile;
          if (ap) { sector = sector || ap.sector || null; industry = industry || ap.industry || null; country = ap.country || null; }
        }
      } catch (e) { /* ignore */ }
      try {
        const k = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics&crumb=${encodeURIComponent(crumbInfo.crumb)}`, { headers: qsHeaders });
        if (k.ok) {
          const kd = await k.json();
          const res0 = kd && kd.quoteSummary && kd.quoteSummary.result && kd.quoteSummary.result[0];
          const dks = res0 && res0.defaultKeyStatistics;
          trailingEps = (dks && dks.trailingEps && dks.trailingEps.raw != null) ? dks.trailingEps.raw : null;
        }
      } catch (e) { /* ignore */ }
    }

    // Cache at the edge for a minute to be gentle on the upstream.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({
      symbol: m.symbol || symbol,
      name,
      sector,
      industry,
      country,
      price,
      currency: m.currency || null,
      previousClose: prev,
      change: price - prev,
      changePct: prev ? ((price - prev) / prev) * 100 : 0,
      fiftyTwoWeekHigh: m.fiftyTwoWeekHigh != null ? m.fiftyTwoWeekHigh : null,
      fiftyTwoWeekLow: m.fiftyTwoWeekLow != null ? m.fiftyTwoWeekLow : null,
      trailingEps,
      time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      exchange: m.exchangeName || null,
      source: "Yahoo Finance",
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
