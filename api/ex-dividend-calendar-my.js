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
 * both markets identically:
 *   { rows: [{ symbol, company, exDate, payDate, recordDate, rate,
 *              indicatedAnnual, announcementDate }, ...], truncated }
 * TradingView's scanner doesn't expose a separate payment/record/announcement
 * date or a trailing-annual-dividend figure for this field, so those come back
 * null — the frontend already renders "—" for any missing field.
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
    columns: ["name", "description", "exchange", "dividend_ex_date_upcoming", "dividend_amount_upcoming", "dividends_yield_current", "currency"],
    sort: { sortBy: "dividend_ex_date_upcoming", sortOrder: "asc" },
    range: [0, MAX_ROWS],
  };

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
      const [name, description, , exUnix, amount] = d;
      return {
        symbol: name || (row.s || "").replace(/^MYX:/, "") || null,
        company: description || null,
        exDate: exUnix ? isoDate(new Date(exUnix * 1000)) : null,
        payDate: null,
        recordDate: null,
        rate: typeof amount === "number" ? amount : null,
        indicatedAnnual: null,
        announcementDate: null,
      };
    }).filter((row) => row.symbol && row.exDate);
    rows.sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : (a.symbol < b.symbol ? -1 : 1)));
    const truncated = rows.length > MAX_ROWS;
    if (truncated) rows = rows.slice(0, MAX_ROWS);
    // Cache at the edge for a day — dividend declarations don't need faster-than-daily
    // refresh, and it keeps load off TradingView's undocumented endpoint light. Since the
    // ?from default is "today", the cache key itself rolls over daily regardless.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");
    res.status(200).json({ rows, truncated });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
