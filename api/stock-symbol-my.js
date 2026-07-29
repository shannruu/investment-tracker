/* =============================================================================
 * Vercel Serverless Function — Bursa Malaysia trading symbol lookup (keyless)
 * -----------------------------------------------------------------------------
 * Given this app's own ticker (e.g. "6718.KL"), resolves the stock's short
 * TradingView trading symbol (e.g. "CRESNDO") — the reverse of what
 * ex-dividend-calendar-my.js already does (TradingView symbol -> numeric
 * code via Yahoo search). Used to show the symbol under a Malaysia holding's
 * ticker (matching how DivTracker displays it), the same way the Dividend
 * Calendar already shows a broker name under a ticker.
 *
 * No numeric-code field exists in TradingView's Malaysia data (confirmed
 * during the ex-dividend screener work), so this chains two keyless lookups:
 *   1. Yahoo search for the ticker -> company name (e.g. "Crescendo
 *      Corporation Berhad").
 *   2. TradingView's scanner, searched by the company name's first word
 *      (a broad net — narrower searches miss real matches because Yahoo and
 *      TradingView use different legal-suffix abbreviations, "Corporation"
 *      vs "Corp.", "Berhad" vs "Bhd." — normalizing both names before
 *      comparing and picking the exact match among the candidates resolved
 *      all 10 real tickers tried during testing).
 *
 * Usage: /api/stock-symbol-my?ticker=6718.KL  ->  { symbol: "CRESNDO" }
 * Response is { symbol: null } if nothing resolves — never an error, since
 * this is a "nice to have" enrichment, not a required field.
 * ========================================================================== */
function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\bcorporation\b/g, "corp")
    .replace(/\bberhad\b/g, "bhd")
    .replace(/\bincorporated\b/g, "inc")
    .replace(/\blimited\b/g, "ltd")
    .replace(/\bholding\b/g, "holdings")
    .replace(/[.,()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const raw = String((req.query && req.query.ticker) || "").trim();
  if (!raw) { res.status(400).json({ error: "Missing ?ticker" }); return; }
  const bare = raw.replace(/\.KL$/i, "");
  if (!/^[A-Za-z0-9]{1,10}$/.test(bare)) { res.status(400).json({ error: "Invalid ticker" }); return; }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };

  try {
    const yr = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(bare + ".KL")}&quotesCount=5&newsCount=0&listsCount=0`, { headers });
    if (!yr.ok) { res.status(200).json({ symbol: null }); return; }
    const yd = await yr.json();
    const quotes = (yd.quotes || []).filter((q) => q.symbol);
    const match = quotes.find((q) => q.symbol.toUpperCase() === `${bare.toUpperCase()}.KL`) || quotes[0];
    const name = match && (match.longname || match.shortname);
    if (!name) { res.status(200).json({ symbol: null }); return; }

    const firstWord = name.replace(/[.,]/g, "").split(/\s+/)[0];
    const tvBody = {
      filter: [{ left: "description", operation: "match", right: firstWord }],
      columns: ["name", "description"],
      range: [0, 10],
    };
    const tr = await fetch("https://scanner.tradingview.com/malaysia/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tvBody),
    });
    if (!tr.ok) { res.status(200).json({ symbol: null }); return; }
    const td = await tr.json();
    const candidates = (td.data || []).map((row) => ({ symbol: row.d[0], desc: row.d[1] }));
    const targetNorm = normalize(name);
    const exact = candidates.find((c) => normalize(c.desc) === targetNorm);

    // Symbol/name mappings are effectively static — cache for a week.
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=1209600");
    res.status(200).json({ symbol: exact ? exact.symbol : null });
  } catch (e) {
    res.status(200).json({ symbol: null });
  }
};
