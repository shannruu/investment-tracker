/* =============================================================================
 * Vercel Serverless Function — symbol search (Yahoo Finance, keyless)
 * Powers the "type a code or name → pick a stock" autocomplete.
 *   /api/search?q=5555     → 5555.KL SUNMED (Sunway Medical) ...
 *   /api/search?q=maybank  → 1155.KL MAYBANK ...
 * ========================================================================== */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const q = String((req.query && req.query.q) || "").trim();
  if (q.length < 1) { res.status(200).json({ results: [] }); return; }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  try {
    let data = null;
    for (const h of hosts) {
      try {
        const r = await fetch(`${h}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`, { headers });
        if (r.ok) { data = await r.json(); break; }
      } catch (e) { /* try next host */ }
    }
    if (!data) { res.status(502).json({ results: [], error: "upstream" }); return; }

    let quotes = (data.quotes || []).filter((x) => x.symbol);
    quotes = quotes.filter((x) => !x.quoteType || ["EQUITY", "ETF", "INDEX", "MUTUALFUND"].includes(x.quoteType));
    // For a numeric code (Bursa style), float .KL matches to the top.
    if (/^\d+$/.test(q)) {
      quotes.sort((a, b) => (b.symbol.endsWith(".KL") ? 1 : 0) - (a.symbol.endsWith(".KL") ? 1 : 0));
    }
    const results = quotes.slice(0, 10).map((x) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || "",
      exchange: x.exchDisp || x.exchange || "",
      type: x.quoteType || "",
    }));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ results: [], error: String((e && e.message) || e) });
  }
};
