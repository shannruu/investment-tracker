/* =============================================================================
 * Vercel Serverless Function — upcoming ex-dividend calendar (Nasdaq, keyless)
 * -----------------------------------------------------------------------------
 * Powers the Dividends page "Discover" screener: ex-dividend dates for EVERY
 * US-listed stock in a date window, not just the user's own holdings. Yahoo's
 * screener endpoint has no ex-date filter and needs a crumb+cookie auth dance
 * (checked — not worth it here), so this proxies Nasdaq's public calendar
 * endpoint instead: https://api.nasdaq.com/api/calendar/dividends?date=...
 * It's undocumented and per-DATE only (no range param), so this loops over
 * every day in the window server-side and merges the results. A browser-like
 * User-Agent is required — without one the request hangs instead of failing
 * cleanly, so every call sends one.
 *
 * Usage:
 *   /api/ex-dividend-calendar                          (today .. +13 days)
 *   /api/ex-dividend-calendar?from=2026-08-01&to=2026-08-07
 *
 * Response shape:
 *   { rows: [{ symbol, company, exDate, payDate, recordDate, rate,
 *              indicatedAnnual, announcementDate }, ...], truncated }
 * rows sorted by exDate then symbol. US-market only (Nasdaq's own coverage).
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
function mdyToIso(s) {
  if (!s || typeof s !== "string") return null;
  const parts = s.trim().split("/");
  if (parts.length !== 3) return null;
  const [mo, da, yr] = parts;
  if (!mo || !da || !yr) return null;
  return `${yr.padStart(4, "0")}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
}
function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
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

  const days = [];
  for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) days.push(isoDate(d));

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "application/json",
  };
  async function getDay(date) {
    try {
      const r = await fetch(`https://api.nasdaq.com/api/calendar/dividends?date=${date}`, { headers });
      if (!r.ok) return [];
      const data = await r.json();
      const rawRows = data && data.data && data.data.calendar && data.data.calendar.rows;
      if (!Array.isArray(rawRows)) return [];
      return rawRows.map((r) => ({
        symbol: r.symbol || null,
        company: r.companyName || null,
        exDate: mdyToIso(r.dividend_Ex_Date) || date,
        payDate: mdyToIso(r.payment_Date),
        recordDate: mdyToIso(r.record_Date),
        rate: num(r.dividend_Rate),
        indicatedAnnual: num(r.indicated_Annual_Dividend),
        announcementDate: mdyToIso(r.announcement_Date),
      })).filter((row) => row.symbol);
    } catch (e) {
      return [];
    }
  }

  try {
    const perDay = await Promise.all(days.map(getDay));
    let rows = perDay.flat().sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : (a.symbol < b.symbol ? -1 : 1)));
    const truncated = rows.length > MAX_ROWS;
    if (truncated) rows = rows.slice(0, MAX_ROWS);
    // Cache at the edge for 15 min — Nasdaq's calendar can gain same-day announcements intraday.
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
    res.status(200).json({ rows, truncated });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
