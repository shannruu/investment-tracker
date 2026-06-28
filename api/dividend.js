/* =============================================================================
 * Vercel Serverless Function — Finnhub dividend schedule proxy
 * -----------------------------------------------------------------------------
 * Returns upcoming ex-dividend events for a US-listed ticker.
 * Requires FINNHUB_TOKEN environment variable (free tier is sufficient).
 * Set it in your Vercel project: Settings → Environment Variables.
 *
 * Usage:
 *   /api/dividend?symbol=AAPL&from=2026-06-28&to=2027-06-28
 *
 * Finnhub response shape (array):
 *   [{ symbol, date (exDate), amount, adjustedAmount, payDate,
 *      recordDate, declarationDate, currency, freq }, ...]
 * ========================================================================== */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const token = process.env.FINNHUB_TOKEN;
  if (!token) {
    res.status(503).json({ error: "FINNHUB_TOKEN not configured — add it in Vercel → Settings → Environment Variables" });
    return;
  }

  const symbol = String((req.query && req.query.symbol) || "").trim();
  if (!symbol) { res.status(400).json({ error: "Missing ?symbol" }); return; }
  if (!/^[A-Za-z0-9.\-]{1,20}$/.test(symbol)) { res.status(400).json({ error: "Invalid symbol" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const from = String((req.query && req.query.from) || "").trim() || today;
  const futureDate = new Date(today);
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const to = String((req.query && req.query.to) || "").trim() || futureDate.toISOString().slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/stock/dividend?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${token}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      res.status(r.status).json({ error: `Finnhub ${r.status}`, detail: body });
      return;
    }
    const data = await r.json();
    // Cache at the edge for 1 hour — dividend schedules rarely change intra-day.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
