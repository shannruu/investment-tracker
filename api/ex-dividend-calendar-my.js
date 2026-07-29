/* =============================================================================
 * Vercel Serverless Function — upcoming ex-dividend calendar for Bursa Malaysia
 * (TradingView scanner, keyless)
 * -----------------------------------------------------------------------------
 * Malaysia sibling of /api/ex-dividend-calendar (Nasdaq/US). Bursa Malaysia has
 * no free calendar-style API of its own: the exchange's own "Entitlement by
 * Ex-Date" page exists but sits behind inconsistent Cloudflare bot protection
 * (confirmed by repeated testing — some requests 200, some 403, even on
 * /robots.txt), and the popular third-party screeners (i3investor,
 * klsescreener) explicitly prohibit automated scraping in their Terms of Use.
 * TradingView's own public screener endpoint (what their website's scanner UI
 * calls) supports a direct exchange + date-range filter, is keyless, and was
 * the most reliable option found — same "undocumented but works, no SLA"
 * category as the Nasdaq endpoint this file mirrors.
 *
 * Usage:
 *   /api/ex-dividend-calendar-my                          (today .. +13 days)
 *   /api/ex-dividend-calendar-my?from=2026-08-01&to=2026-08-07
 *
 * Response shape matches /api/ex-dividend-calendar so the frontend can treat
 * both markets identically, plus two Malaysia-only extra fields:
 *   { rows: [{ symbol, company, exDate, payDate, recordDate, rate,
 *              indicatedAnnual, announcementDate, payoutStreak, stockCode }, ...],
 *     truncated }
 * TradingView's scanner doesn't expose a record/announcement date or a
 * trailing-annual-dividend figure for this field, so those still come back
 * null — the frontend already renders "—" for any missing field. payDate DOES
 * come from TradingView now (dividend_payment_date_upcoming — found after the
 * first shipped version guessed wrong field names; this one is real and the
 * gap to ex-date varies genuinely per company, 14-30+ days, not a fixed
 * offset).
 *
 * payoutStreak comes from TradingView's `continuous_dividend_payout` field —
 * inferred (this is an undocumented endpoint, no official field reference)
 * from its name and empirically checking it against ~48 real upcoming
 * dividends: known long-standing steady payers (Nestlé Malaysia, Panasonic
 * Manufacturing, QL Resources) score 26-38, while newer/inconsistent payers
 * score 0-1. Used by the frontend to flag a dividend as "irregular" when a
 * company has no established payout streak, at essentially zero extra cost —
 * it rides along on the same request, no additional API calls.
 *
 * stockCode is the numeric Bursa code (e.g. "6718" for Crescendo, matching
 * what this app already uses as the Yahoo ticker suffix, e.g. "6718.KL") —
 * TradingView's Malaysia data has no such field itself (confirmed: ~20
 * candidate field names tried, none exist), so it's resolved via a parallel
 * best-effort lookup against Yahoo's existing keyless search endpoint (the
 * same one /api/search already uses for ticker autocomplete), matching each
 * TradingView ticker to its ".KL"-suffixed Yahoo result. ~9/10 tickers
 * resolve correctly in testing; a genuinely ambiguous name (e.g. "NESTLE"
 * matching the global Nestlé brand before the Malaysian subsidiary) comes
 * back null rather than risk showing a wrong code — the frontend simply
 * omits the code line when null, same as any other missing field.
 * ========================================================================== */
const MAX_WINDOW_DAYS = 21;
const MAX_ROWS = 1500;

function isoDate(d) { return d.toISOString().slice(0, 10); }
function parseIsoUTC(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const today = isoDate(new Date());
  const fromStr = String((req.query && req.query.from) || "").trim() || today;
  const from = parseIsoUTC(fromStr);
  if (!from) { res.status(400).json({ error: "Invalid ?from (expected YYYY-MM-DD)" }); return; }

  let to = parseIsoUTC(String((req.query && req.query.to) || "").trim() || "");
  if (!to) to = new Date(from.getTime() + 13 * 86400000);
  if (to < from) { res.status(400).json({ error: "?to must not be before ?from" }); return; }
  if ((to - from) / 86400000 > MAX_WINDOW_DAYS - 1) to = new Date(from.getTime() + (MAX_WINDOW_DAYS - 1) * 86400000);

  const fromUnix = Math.floor(from.getTime() / 1000);
  const toUnix = Math.floor(to.getTime() / 1000) + 86399; // include the whole "to" day

  const body = {
    filter: [{ left: "dividend_ex_date_upcoming", operation: "in_range", right: [fromUnix, toUnix] }],
    columns: ["name", "description", "exchange", "dividend_ex_date_upcoming", "dividend_amount_upcoming", "dividends_yield_current", "currency", "continuous_dividend_payout", "dividend_payment_date_upcoming"],
    sort: { sortBy: "dividend_ex_date_upcoming", sortOrder: "asc" },
    range: [0, MAX_ROWS],
  };

  const searchHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  async function lookupStockCode(symbol) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=15&newsCount=0&listsCount=0`, { headers: searchHeaders });
      if (!r.ok) return null;
      const d = await r.json();
      const klMatch = (d.quotes || []).find((q) => q.symbol && q.symbol.endsWith(".KL"));
      return klMatch ? klMatch.symbol.replace(/\.KL$/, "") : null;
    } catch (e) { return null; }
  }

  try {
    const r = await fetch("https://scanner.tradingview.com/malaysia/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { res.status(502).json({ error: "Upstream unavailable" }); return; }
    const data = await r.json();
    const rawRows = Array.isArray(data.data) ? data.data : [];
    let rows = rawRows.map((row) => {
      const d = row.d || [];
      const [name, description, , exUnix, amount, , , payoutStreak, payUnix] = d;
      return {
        symbol: name || (row.s || "").replace(/^MYX:/, "") || null,
        company: description || null,
        exDate: exUnix ? isoDate(new Date(exUnix * 1000)) : null,
        payDate: payUnix ? isoDate(new Date(payUnix * 1000)) : null,
        recordDate: null,
        rate: typeof amount === "number" ? amount : null,
        indicatedAnnual: null,
        announcementDate: null,
        payoutStreak: typeof payoutStreak === "number" ? payoutStreak : null,
        stockCode: null,
      };
    }).filter((row) => row.symbol && row.exDate);
    rows.sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : (a.symbol < b.symbol ? -1 : 1)));
    const truncated = rows.length > MAX_ROWS;
    if (truncated) rows = rows.slice(0, MAX_ROWS);

    // Best-effort, parallel — a Yahoo search failure just leaves stockCode null for that
    // row (frontend already handles that), never blocks the response.
    await Promise.all(rows.map(async (row) => { row.stockCode = await lookupStockCode(row.symbol); }));

    // Cache at the edge for a day — dividend declarations don't need faster-than-daily
    // refresh, and it keeps load off TradingView's undocumented endpoint light. Since the
    // ?from default is "today", the cache key itself rolls over daily regardless. This also
    // means the per-row Yahoo lookups above only run once per day per window, not per visit.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    res.status(200).json({ rows, truncated });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
