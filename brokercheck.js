/* =============================================================================
 * Broker check — Portfolio → "Broker check" tab
 * -----------------------------------------------------------------------------
 * The user types what their broker's app shows for each holding (shares, average cost, price,
 * unrealized P/L, realized P/L). Divz compares that with its own records and explains the
 * difference in plain words, so nobody has to do the arithmetic by hand.
 *
 * Why numbers differ even when the data is right (all three showed up with a real Moomoo account):
 *   - Fees: Divz folds buying fees into your cost (profit is after fees); most broker apps show
 *     "cost" without them. computeTotals() therefore tracks the same lot twice — with fees
 *     (costLocal) and without (priceCostLocal).
 *   - Dividends: Divz counts every dividend; some brokers only count the most recent ones in the
 *     "realized" figure. bcMatchIncome() finds which of the user's own payments add up to it.
 *   - Prices: Divz's prices come from Yahoo (~15 min behind a broker's live price).
 *
 * Classic <script> loaded after app.js — shares its top-level scope (like sync.js), so it can
 * call t(), money(), panel(), saveStore(), render() directly. app.js calls brokerCheckHTML() and
 * mountBrokerCheck() (guarded by typeof) from pagePortfolio().
 * ========================================================================== */

let BC_UI = { brokerId: "" };
let BC_TIMER = null;

/* The five figures nearly every broker app shows per stock. All optional — fill in what's there. */
const BC_FIELDS = [
  { id: "shares",     label: "Shares",         sub: "",                                  mode: "decimal" },
  { id: "avgCost",    label: "Average cost",   sub: "cost per share",                    mode: "decimal" },
  { id: "price",      label: "Price",          sub: "current price",                     mode: "decimal" },
  { id: "unrealized", label: "Unrealized P/L", sub: "profit on shares you still hold",   mode: "text" },
  { id: "realized",   label: "Realized P/L",   sub: "sales + dividends",                 mode: "text" },
];

/* t() with {placeholders}: the whole sentence is one translation key, so word order can differ per language. */
const bcT = (s, vars) => t(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
const bcShares = (n) => fmt(n, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const bcRate = (n) => fmt(n, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const bcRateMoney = (n, cc) => `${ccyLabel(cc)} ${bcRate(n)}`;
const bcRateSigned = (n, cc) => (n > 0 ? "+" : n < 0 ? "−" : "") + bcRateMoney(Math.abs(n), cc);

/* "+1,536.00", "RM 6.0636", "−14.71" … → { v, dp }. dp (decimals typed) sets how tight the comparison is:
 * someone who types "6.06" is only claiming two decimals, so 6.0636 counts as the same. */
function bcParse(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[−–—]/g, "-").replace(/,/g, "").replace(/[^0-9.+\-]/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = parseFloat(s);
  return isFinite(v) ? { v, dp: (s.split(".")[1] || "").length } : null;
}
const bcTol = (p) => 0.5 * Math.pow(10, -p.dp) + 1e-9;

function bcToCcy(amount, from, to) {
  if (!from || from === to) return amount;
  return amount * (FX.rates[from] || 1) / (FX.rates[to] || 1);
}

/* Every dividend received and every sale for one holding, newest first, in the stock's own currency. */
function bcEvents(h) {
  const tk = (h.ticker || "").toUpperCase(), out = [];
  ALL_TRANSACTIONS.forEach((x) => {
    if (x.type !== "Dividend" || x.status === "Expected" || x.brokerId !== h.brokerId || (x.ticker || "").toUpperCase() !== tk) return;
    out.push({ kind: "dividend", date: x.payDate || x.date || "", amt: bcToCcy((+x.gross || 0) - (+x.tax || 0), x.currency, h.currency) });
  });
  (T.realizedSales || []).forEach((s) => {
    if (s.brokerId !== h.brokerId || (s.ticker || "").toUpperCase() !== tk) return;
    out.push({ kind: "sale", date: s.date || "", amt: bcToCcy(s.plLocal != null ? s.plLocal : s.pl, s.currency, h.currency) });
  });
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/* Which of the user's own payments add up to the number the broker shows? Brokers differ — some count every
 * dividend and sale, some only the most recent. Tries "the newest k payments" for k = 1..n over three lists
 * (everything / dividends only / sales only) and returns the first that lands on the broker's figure. */
function bcMatchIncome(events, p) {
  const tol = bcTol(p) + 0.005;   // a cent of slack for rounding on the broker's side
  const lists = [
    { key: "all", items: events },
    { key: "dividends", items: events.filter((e) => e.kind === "dividend") },
    { key: "sales", items: events.filter((e) => e.kind === "sale") },
  ];
  for (const L of lists) {
    let cum = 0;
    for (let i = 0; i < L.items.length; i++) {
      cum += L.items[i].amt;
      if (Math.abs(cum - p.v) <= tol) return { key: L.key, k: i + 1, n: L.items.length, items: L.items.slice(0, i + 1) };
    }
  }
  return null;
}

/* Everything the card shows, derived from Divz's own numbers plus whatever the user typed. */
function bcCompute(h, chk) {
  const cc = h.currency || FX.base;
  const S = h.shares;
  const costIn = h.costLocal, costEx = h.priceCostLocal;          // with / without buying fees
  const feesIn = Math.max(0, costIn - costEx);
  const avgIn = S > 0 ? costIn / S : 0, avgEx = S > 0 ? costEx / S : 0;
  const priceOk = h.hasPrice && h.currentPriceCcy === cc;
  const pDivz = priceOk ? h.currentPrice : null;
  const p = {};
  BC_FIELDS.forEach((f) => { p[f.id] = bcParse((chk || {})[f.id]); });
  const rows = {};
  let feeMode = "";                                                 // how the user's broker treats buying fees: "ex" | "in" | ""
  const muted = `<span class="muted">—</span>`;

  /* ---- Shares */
  {
    const r = { state: "idle", divz: bcShares(S), sub: "", note: "" };
    if (p.shares) {
      const diff = p.shares.v - S;
      if (Math.abs(diff) <= bcTol(p.shares) + 1e-6) { r.state = "ok"; r.note = t("Same"); }
      else {
        r.state = "warn";
        r.note = diff > 0
          ? bcT("Your broker has {n} more shares than Divz — a Buy may be missing.", { n: bcShares(diff) })
          : bcT("Your broker has {n} fewer shares than Divz — a Sell may be missing, or a Buy entered twice.", { n: bcShares(-diff) });
      }
    }
    rows.shares = r;
  }

  /* ---- Average cost (fee-free by default — what most broker apps call "cost") */
  {
    const r = { state: "idle", divz: bcRateMoney(avgEx, cc), sub: feesIn > 0.004 ? t("without fees") : "", note: "" };
    if (p.avgCost && S > 0) {
      const tol = bcTol(p.avgCost), v = p.avgCost.v;
      const eqEx = Math.abs(avgEx - v) <= tol, eqIn = Math.abs(avgIn - v) <= tol;
      if (eqEx && (eqIn || feesIn < 0.004)) { r.state = "ok"; r.note = t("Same"); }
      else if (eqEx) {
        feeMode = "ex"; r.state = "ok";
        r.note = bcT("Same. Your broker leaves buying fees out of cost; Divz includes them ({fees} in total), so Divz's own average cost is {avg}.", { fees: money(feesIn, cc), avg: bcRate(avgIn) });
      } else if (eqIn) {
        feeMode = "in"; r.state = "ok"; r.divz = bcRateMoney(avgIn, cc); r.sub = t("with fees");
        r.note = t("Same. Your broker counts buying fees as part of cost, like Divz.");
      } else {
        r.state = "warn";
        r.note = bcT("Differs by {d} per share — check the price and quantity of each Buy.", { d: bcRate(Math.min(Math.abs(avgEx - v), Math.abs(avgIn - v))) });
      }
    }
    rows.avgCost = r;
  }

  /* ---- Price */
  {
    const r = { state: "idle", divz: pDivz != null ? bcRateMoney(pDivz, cc) : muted, sub: "", note: "" };
    if (pDivz != null) {
      r.sub = h.priceSource === "live" ? (h.priceFetchedAt ? bcT("Yahoo · {when}", { when: fmtDateTime(h.priceFetchedAt) }) : t("Yahoo")) : t("set by you");
    }
    if (p.price) {
      if (pDivz == null) { r.state = "info"; r.note = t("Divz has no price for this stock yet — tap Refresh prices."); }
      else {
        const d = pDivz - p.price.v;
        if (Math.abs(d) <= bcTol(p.price)) { r.state = "ok"; r.note = t("Same"); }
        else if (Math.abs(d) / p.price.v > 0.02) { r.state = "warn"; r.note = t("Prices differ by more than 2%. Check the price Divz has (open the holding and use Set price) and the stock's currency."); }
        else {
          r.state = "info";
          const live = h.priceSource === "live";
          r.note = bcT(d > 0
            ? (live ? "Divz's price is {d} higher. Divz prices come from Yahoo and can run about 15 minutes behind your broker — not a data problem."
                    : "Divz's price is {d} higher. You set this price by hand — update it on the holding page.")
            : (live ? "Divz's price is {d} lower. Divz prices come from Yahoo and can run about 15 minutes behind your broker — not a data problem."
                    : "Divz's price is {d} lower. You set this price by hand — update it on the holding page."),
            { d: bcRateMoney(Math.abs(d), cc) });
        }
      }
    }
    rows.price = r;
  }

  /* ---- Unrealized P/L — recomputed at the BROKER's price (when typed), so price timing can't hide a real data gap */
  const pUsed = p.price ? p.price.v : pDivz;
  const unEx = pUsed != null ? S * pUsed - costEx : null;
  const unIn = pUsed != null ? S * pUsed - costIn : null;
  {
    const r = { state: "idle", divz: muted, sub: "", note: "" };
    if (p.unrealized) {
      if (unEx == null) { r.state = "info"; r.note = t("Type your broker's price too, or tap Refresh prices, so Divz can work this out."); }
      else {
        const tol = bcTol(p.unrealized) + 0.00006 * S, v = p.unrealized.v;
        const mEx = Math.abs(unEx - v) <= tol, mIn = Math.abs(unIn - v) <= tol;
        if (mIn && !mEx) { feeMode = feeMode || "in"; r.state = "ok"; r.note = t("Same. Your broker counts buying fees as part of cost, like Divz."); }
        else if (mEx) {
          if (!mIn && feesIn >= 0.004) feeMode = feeMode || "ex";
          r.state = "ok"; r.note = (!mIn && feesIn >= 0.004) ? t("Same once buying fees are left out — your broker doesn't count them.") : t("Same");
        } else {
          r.state = "warn";
          r.note = bcT("Differs by {d} even after fees and price are taken into account.", { d: money(Math.min(Math.abs(unEx - v), Math.abs(unIn - v)), cc) });
        }
      }
    }
    const shown = feeMode === "in" ? unIn : unEx;
    if (shown != null) {
      r.divz = `<span class="${cls(shown)}">${moneySigned(shown, cc)}</span>`;
      const atBroker = p.price && pDivz != null && Math.abs(p.price.v - pDivz) > 1e-9;
      r.sub = (feeMode === "in" ? t("with fees") : t("without fees")) + (atBroker ? " · " + bcT("at {p}", { p: bcRate(p.price.v) }) : "");
    }
    rows.unrealized = r;
  }

  /* ---- Realized P/L (sales + dividends) */
  const events = bcEvents(h);
  const incomeTotal = events.reduce((s, e) => s + e.amt, 0);
  let match = null;
  {
    const r = { state: "idle", divz: events.length ? `<span class="${cls(incomeTotal)}">${moneySigned(incomeTotal, cc)}</span>` : muted, sub: events.length ? bcT("{n} payments", { n: events.length }) : t("nothing recorded"), note: "" };
    if (p.realized) {
      if (!events.length) {
        if (Math.abs(p.realized.v) <= bcTol(p.realized)) { r.state = "ok"; r.note = t("Same"); }
        else { r.state = "warn"; r.note = t("Divz has no dividends or sales recorded for this stock."); }
      } else {
        match = bcMatchIncome(events, p.realized);
        if (match) {
          r.state = "ok";
          const counted = match.items.reduce((s, e) => s + e.amt, 0);
          const nDiv = events.filter((e) => e.kind === "dividend").length;
          if (match.key === "all" && match.k === events.length) r.note = bcT("Same — all {n} payments.", { n: events.length });
          else if (match.key === "all") r.note = bcT("Matches your latest {k} payments. Your broker doesn't count the {r} older ones ({amt}).", { k: match.k, r: events.length - match.k, amt: money(incomeTotal - counted, cc) });
          else if (match.key === "dividends") r.note = match.k === nDiv ? t("Matches your dividends only — your broker leaves sales out of this figure.") : bcT("Matches your latest {k} dividends — your broker leaves out older ones and sales.", { k: match.k });
          else r.note = t("Matches your sales only — your broker leaves dividends out of this figure.");
        } else {
          r.state = "warn";
          r.note = bcT("Doesn't match any recent set of your payments. Divz counts {n} payments totalling {amt} — compare them with your broker's dividend history (listed below).", { n: events.length, amt: money(incomeTotal, cc) });
        }
      }
    }
    rows.realized = r;
  }

  /* ---- Bridge: Divz's own Unrealized P/L → the way the broker counts it */
  let bridge = null;
  if (pDivz != null && S > 0) {
    const own = S * pDivz - costIn;
    const fees = feeMode === "in" ? 0 : feesIn;
    const priceAdj = p.price ? S * (p.price.v - pDivz) : 0;
    bridge = { own, fees, priceAdj, result: own + fees + priceAdj };
  }

  const entered = BC_FIELDS.filter((f) => p[f.id]).length;
  const warns = BC_FIELDS.filter((f) => rows[f.id].state === "warn").length;
  return { cc, S, costIn, costEx, feesIn, avgIn, avgEx, pDivz, p, rows, feeMode, events, incomeTotal, match, bridge, entered, warns };
}

/* ------------------------------------------------------------------ rendering */

const bcMark = (state) => state === "ok" ? `<span class="bc-mark ok" aria-hidden="true">✓</span>`
  : state === "warn" ? `<span class="bc-mark warn" aria-hidden="true">!</span>`
  : state === "info" ? `<span class="bc-mark info" aria-hidden="true">i</span>` : "";

function bcBridgeHTML(h, c, chk) {
  const cc = c.cc, blocks = [];
  const tr = (label, amount, extra = "") => `<tr class="${extra}"><td>${label}</td><td class="bc-amt">${amount}</td></tr>`;
  const verdict = (state, shownBroker) => `<td class="bc-amt">${shownBroker}${state ? " " + bcMark(state) : ""}</td>`;

  // 1. Unrealized P/L
  if (c.bridge) {
    const b = c.bridge;
    let body = tr(t("Unrealized P/L in Divz (Portfolio page)"), `<span class="${cls(b.own)}">${moneySigned(b.own, cc)}</span>`);
    if (b.fees > 0.004) body += tr(t("Add back buying fees — Divz counts them as part of your cost"), moneySigned(b.fees, cc));
    if (Math.abs(b.priceAdj) > 0.004) body += tr(bcT("Switch to your broker's price ({a} instead of {b})", { a: bcRate(c.p.price.v), b: bcRate(c.pDivz) }), moneySigned(b.priceAdj, cc));
    body += tr(t("Unrealized P/L the way your broker counts it"), `<span class="${cls(b.result)}">${moneySigned(b.result, cc)}</span>`, "bc-total");
    if (c.p.unrealized) body += `<tr><td>${t("Your broker shows")}</td>${verdict(c.rows.unrealized.state, moneySigned(c.p.unrealized.v, cc))}</tr>`;
    blocks.push(`<div class="bc-block"><h3>${t("Why Divz's Unrealized P/L can differ")}</h3><table class="bc-mini"><tbody>${body}</tbody></table></div>`);
  }

  // 2. Average cost
  if (c.feesIn >= 0.004 && c.S > 0) {
    let body = tr(t("Average cost in Divz (fees included)"), bcRateMoney(c.avgIn, cc));
    body += tr(bcT("Buying fees per share ({fees} ÷ {n} shares)", { fees: money(c.feesIn, cc), n: bcShares(c.S) }), bcRateSigned(-(c.feesIn / c.S), cc));
    body += tr(t("Average cost without fees"), bcRateMoney(c.avgEx, cc), "bc-total");
    if (c.p.avgCost) body += `<tr><td>${t("Your broker shows")}</td>${verdict(c.rows.avgCost.state, bcRateMoney(c.p.avgCost.v, cc))}</tr>`;
    blocks.push(`<div class="bc-block"><h3>${t("Why Divz's average cost can differ")}</h3><table class="bc-mini"><tbody>${body}</tbody></table></div>`);
  }

  // 3. Dividends & sales Divz counted
  if (c.events.length) {
    const countedSet = new Set(c.match ? c.match.items : []);
    const showCol = !!c.match;
    const rowsHTML = c.events.map((e) => `<tr class="${showCol && !countedSet.has(e) ? "bc-skipped" : ""}"><td>${fmtDate(e.date)}</td><td>${e.kind === "dividend" ? t("Dividend") : t("Sale")}</td><td class="bc-amt">${moneySigned(e.amt, cc)}</td>${showCol ? `<td class="bc-amt">${countedSet.has(e) ? bcMark("ok") : `<span class="muted">—</span>`}</td>` : ""}</tr>`).join("");
    let foot = `<tr class="bc-total"><td colspan="2">${t("Divz total")}</td><td class="bc-amt">${moneySigned(c.incomeTotal, cc)}</td>${showCol ? "<td></td>" : ""}</tr>`;
    if (c.p.realized) foot += `<tr><td colspan="2">${t("Your broker shows")}</td><td class="bc-amt">${moneySigned(c.p.realized.v, cc)}</td>${showCol ? "<td></td>" : ""}</tr>`;
    blocks.push(`<div class="bc-block bc-wide"><h3>${t("Dividends and sales Divz counted")}</h3>
      <div class="bc-scroll"><table class="bc-mini bc-events"><thead><tr><th>${t("Date")}</th><th>${t("Type")}</th><th class="bc-amt">${t("Amount")}</th>${showCol ? `<th class="bc-amt">${t("Counted by broker")}</th>` : ""}</tr></thead><tbody>${rowsHTML}</tbody><tfoot>${foot}</tfoot></table></div></div>`);
  }
  if (!blocks.length) return "";
  return `<details class="bc-bridge"${c.entered ? " open" : ""}><summary>${t("How Divz's numbers connect to your broker's")}</summary><div class="bc-bridge-grid">${blocks.join("")}</div></details>`;
}

function bcCardHTML(h) {
  const key = h.brokerId + "|" + h.ticker;
  const chk = HOLDING_CHECKS[key] || {};
  const c = bcCompute(h, chk);
  const badge = !c.entered ? `<span class="badge subtle">${t("Not checked yet")}</span>`
    : c.warns ? `<span class="badge neg">${c.warns === 1 ? t("1 difference to look at") : bcT("{n} differences to look at", { n: c.warns })}</span>`
    : `<span class="badge pos">${t("Matches your broker")}</span>`;
  const grid = BC_FIELDS.map((f) => {
    const r = c.rows[f.id];
    const unit = f.id === "shares" ? "" : ccyLabel(c.cc);
    return `<div class="bc-lab"><span>${t(f.label)}</span>${f.sub ? `<span class="bc-sub">${t(f.sub)}</span>` : ""}</div>
      <div class="bc-in" data-cap="${esc(t("Your broker shows"))}"><div class="bc-inw">${unit ? `<span class="bc-unit">${esc(unit)}</span>` : ""}<input type="text" inputmode="${f.mode}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(chk[f.id] != null ? chk[f.id] : "")}" data-bc-key="${esc(key)}" data-bc-field="${f.id}" aria-label="${esc(`${h.ticker} — ${t(f.label)} — ${t("Your broker shows")}`)}"></div></div>
      <div class="bc-dz" data-cap="Divz"><span class="bc-dzv">${r.divz}</span>${r.sub ? `<span class="bc-sub">${r.sub}</span>` : ""}</div>
      <div class="bc-rs ${r.state}">${bcMark(r.state)}<span>${r.note || ""}</span></div>`;
  }).join("");
  const sharesWarn = c.rows.shares.state === "warn"
    ? `<p class="bc-alert">${t("The share counts don't match, so the other comparisons below may be off too. Check this stock's Buy and Sell records first.")} <a class="link" href="#/holding/${encodeURIComponent(key)}">${t("Open the holding")} →</a></p>` : "";
  return `<section class="panel bc-card" data-bc-card="${esc(key)}">
    <div class="panel-head bc-head">
      <h2><a class="ticker ticker-link" href="#/holding/${encodeURIComponent(key)}">${esc(h.ticker)}</a>${holdingSubLabel(h) ? ` <span class="bc-co">${esc(holdingSubLabel(h))}</span>` : ""}</h2>
      <div class="panel-head-actions">${badge}${c.entered ? `<button type="button" class="btn ghost bc-clear" data-bc-clear="${esc(key)}">${t("Clear")}</button>` : ""}</div>
    </div>
    ${sharesWarn}
    <div class="bc-grid">
      <div class="bc-th"></div><div class="bc-th">${t("Your broker shows")}</div><div class="bc-th">Divz</div><div class="bc-th">${t("Result")}</div>
      ${grid}
    </div>
    ${bcBridgeHTML(h, c, chk)}
  </section>`;
}

function bcBrokers() { return BROKERS.filter((b) => T.holdings.some((h) => h.brokerId === b.id) || Math.abs(T.brokerCash[b.id] || 0) > 0.004); }
function bcHoldings() { return T.holdings.filter((h) => h.brokerId === BC_UI.brokerId).sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0)); }
/* ---- Cash. Shares RECON_CHECKS with the Brokers page's "Broker Cash Reconciliation" (same figure, same alert). */

/* Every cash movement of one broker grouped by kind, in the base currency — mirrors computeTotals()'s cash rules
 * line by line, so the lines add up to T.brokerCash[brokerId] (any difference is shown as "Other movements"). */
function bcCashBreakdown(brokerId) {
  const r = { deposit: 0, withdrawal: 0, buy: 0, sell: 0, dividend: 0, interest: 0, fees: 0, transferIn: 0, transferOut: 0, fx: 0 };
  const cur = (c) => FX.rates[c] || 1;
  ALL_TRANSACTIONS.forEach((x) => {
    const ccy = x.currency || FX.base, gross = +x.gross || 0, fee = +x.fee || 0, taxv = +x.tax || 0;
    const base = (amt, c) => amt * cur(c);
    if (x.brokerId === brokerId) {
      switch (x.type) {
        case "Deposit": r.deposit += base(gross, ccy); break;
        case "Withdrawal": r.withdrawal -= base(gross, ccy); break;
        case "Interest / cash yield": case "Interest": r.interest += base(gross, ccy); break;
        case "Fee": case "Tax withholding": r.fees -= base(gross, ccy); break;
        case "Buy": if (!x.drip) r.buy -= base(gross + fee + taxv, ccy); break;
        case "Sell": r.sell += base(gross - fee - taxv, ccy); break;
        case "Dividend": if (x.status !== "Expected" && x.paidTo !== "bank" && x.paidTo !== "reinvested") r.dividend += base(gross - taxv, ccy); break;
        case "Transfer between brokers": r.transferOut -= base(gross, ccy); break;
        case "FX conversion": case "Currency Exchange": {
          const fromCcy = x.fromCurrency || ccy, toCcy = x.toCurrency;
          r.fx -= base((+x.fromAmount || gross || 0) + fee, fromCcy);
          if (toCcy) r.fx += base(+x.toAmount || 0, toCcy);
          break;
        }
        default: break;
      }
    }
    if (x.type === "Transfer between brokers" && x.toBrokerId === brokerId) r.transferIn += base(gross, ccy);
  });
  return r;
}

function bcCashCardHTML() {
  const b = BROKERS.find((x) => x.id === BC_UI.brokerId);
  if (!b) return "";
  const calcRaw = T.brokerCash[b.id] || 0;
  const calc = Math.abs(calcRaw) < 0.005 ? 0 : calcRaw;   // a fraction of a cent must not print as "RM -0.00"
  const chk = RECON_CHECKS[b.id] || {};
  const raw = chk.actualText != null ? chk.actualText : (chk.actual != null ? String(chk.actual) : "");
  const p = bcParse(raw);
  const base = FX.base;
  let state = "idle", note = "";
  if (p) {
    const diff = calc - p.v;
    if (Math.abs(diff) <= bcTol(p) + 0.005) { state = "ok"; note = t("Same"); }
    else if (Math.abs(diff) <= (SETTINGS.reconTolerance || 0)) { state = "info"; note = bcT("A small difference of {d}, within your tolerance.", { d: money(Math.abs(diff)) }); }
    else {
      state = "warn";
      note = diff > 0
        ? bcT("Divz shows {d} more cash than your broker. Money that left the account may be missing — a withdrawal, a fee or a Buy.", { d: money(diff) })
        : bcT("Divz shows {d} less cash than your broker. Money that came in may be missing — a deposit, a dividend or interest.", { d: money(-diff) });
    }
  }
  const wallets = Object.entries(T.brokerCashByCcy[b.id] || {}).filter(([, v]) => Math.abs(v) > 0.004);
  const sub = wallets.length > 1 ? wallets.map(([c, v]) => `${ccyLabel(c)} ${fmt(v)}`).join(" + ") : "";
  const badge = !p ? `<span class="badge subtle">${t("Not checked yet")}</span>`
    : state === "warn" ? `<span class="badge neg">${t("1 difference to look at")}</span>`
    : `<span class="badge pos">${t("Matches your broker")}</span>`;

  const multiCcy = ALL_TRANSACTIONS.some((x) => (x.brokerId === b.id || x.toBrokerId === b.id) && x.currency && x.currency !== base);
  const br = bcCashBreakdown(b.id);
  const lines = [["deposit", "Deposits"], ["withdrawal", "Withdrawals"], ["buy", "Buys (including fees)"], ["sell", "Sells (after fees)"],
    ["dividend", "Dividends received in cash"], ["interest", "Interest"], ["fees", "Fees and taxes"], ["transferIn", "Transfers in"],
    ["transferOut", "Transfers out"], ["fx", "Currency exchange"]];
  const known = lines.reduce((s2, [k]) => s2 + br[k], 0);
  const other = calc - known;
  let rows = lines.filter(([k]) => Math.abs(br[k]) >= 0.005)
    .map(([k, lbl]) => `<tr><td>${t(lbl)}</td><td class="bc-amt"><span class="${cls(br[k])}">${moneySigned(br[k], base)}</span></td></tr>`).join("");
  if (Math.abs(other) >= 0.005) rows += `<tr><td>${t("Other movements")}</td><td class="bc-amt">${moneySigned(other, base)}</td></tr>`;
  rows += `<tr class="bc-total"><td>${t("Cash in Divz")}</td><td class="bc-amt">${money(calc, base)}</td></tr>`;
  if (p) rows += `<tr><td>${t("Your broker shows")}</td><td class="bc-amt">${money(p.v, base)} ${bcMark(state)}</td></tr>`;
  const bridge = `<details class="bc-bridge"${p ? " open" : ""}><summary>${t("How Divz works out your cash")}</summary>
    <div class="bc-bridge-grid"><div class="bc-block bc-narrow"><table class="bc-mini"><tbody>${rows}</tbody></table>
    <p class="muted bc-hint">${t("Compare these lines with the cash section of your broker's statement to find anything missing.")}${multiCcy ? " " + t("Amounts in other currencies are converted at today's exchange rate.") : ""}</p></div></div></details>`;

  return `<section class="panel bc-card" data-bc-card="cash">
    <div class="panel-head bc-head">
      <h2>${t("Cash")} <span class="bc-co">${esc(b.name)}</span></h2>
      <div class="panel-head-actions">${badge}${p ? `<button type="button" class="btn ghost bc-clear" data-bc-clear-cash="${esc(b.id)}">${t("Clear")}</button>` : ""}</div>
    </div>
    <div class="bc-grid">
      <div class="bc-th"></div><div class="bc-th">${t("Your broker shows")}</div><div class="bc-th">Divz</div><div class="bc-th">${t("Result")}</div>
      <div class="bc-lab"><span>${t("Cash balance")}</span><span class="bc-sub">${t("money in the account, not shares")}</span></div>
      <div class="bc-in" data-cap="${esc(t("Your broker shows"))}"><div class="bc-inw"><span class="bc-unit">${esc(ccyLabel(base))}</span><input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(raw)}" data-bc-cash="${esc(b.id)}" aria-label="${esc(`${b.name} — ${t("Cash balance")} — ${t("Your broker shows")}`)}"></div></div>
      <div class="bc-dz" data-cap="Divz"><span class="bc-dzv ${calc < -0.004 ? "neg" : ""}">${money(calc, base)}</span>${sub ? `<span class="bc-sub">${sub}</span>` : ""}</div>
      <div class="bc-rs ${state}">${bcMark(state)}<span>${note}</span></div>
    </div>
    ${bridge}
  </section>`;
}

function bcCardsHTML() {
  const hs = bcHoldings();
  return bcCashCardHTML() + (hs.length ? hs.map(bcCardHTML).join("") : `<p class="muted bc-none">${t("No stocks recorded for this broker yet.")}</p>`);
}

function brokerCheckHTML() {
  const list = bcBrokers();
  if (!list.length) return panel(t("Broker check"), emptyState(t("No holdings yet — record a Buy and it appears here automatically.")));
  if (!list.some((b) => b.id === BC_UI.brokerId)) BC_UI.brokerId = list[0].id;
  const latest = bcHoldings().filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  const brokerSel = list.length > 1
    ? `<div class="bc-broker">${styledSelect("bcBroker", list.map((b) => ({ value: b.id, label: b.name })), BC_UI.brokerId, { id: "bcBroker" })}</div>`
    : `<span class="chip">${esc(list[0].name)}</span>`;
  const refresh = `<button class="icon-btn pf-refresh" id="bcRefreshBtn" title="${esc(t("Refresh live prices"))}" aria-label="${esc(t("Refresh live prices"))}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>`;
  const stamp = `<span id="bcStamp">${latest ? metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${fmtDateTime(latest)}`) : ""}</span>`;
  return `<div id="bcRoot">
    <section class="panel bc-intro">
      <div class="panel-head"><h2>${t("Check against your broker")}</h2><div class="panel-head-actions">${brokerSel}${stamp}${refresh}</div></div>
      <p class="bc-lead">${t("Open your broker's app and type what it shows — your cash and each stock. Divz compares it with your records and explains any difference, so you don't have to work it out yourself. Fill in only what your broker shows.")}</p>
      <div class="bc-why"><strong>${t("Why Divz and your broker can show different numbers")}</strong>
        <ul>
          <li><b>${t("Fees")}</b> — ${t("Divz adds your buying fees to your cost, so your profit is after fees. Most brokers leave them out.")}</li>
          <li><b>${t("Dividends")}</b> — ${t("Divz counts every dividend you have received. Some brokers only count the recent ones in their profit figure.")}</li>
          <li><b>${t("Prices")}</b> — ${t("Divz gets prices from Yahoo, which can run about 15 minutes behind your broker's live price.")}</li>
        </ul>
      </div>
    </section>
    <div id="bcCards">${bcCardsHTML()}</div>
  </div>`;
}

/* ------------------------------------------------------------------ behaviour */

/* Re-render just the cards (inputs and all) without losing the field being typed in. */
function bcRefresh() {
  const box = document.getElementById("bcCards");
  if (!box) return;
  const a = document.activeElement;
  const focus = a && a.dataset && (a.dataset.bcField || a.dataset.bcCash) ? { key: a.dataset.bcKey, field: a.dataset.bcField, cash: a.dataset.bcCash, s: a.selectionStart, e: a.selectionEnd } : null;
  box.innerHTML = bcCardsHTML();
  translateDOM(box);
  if (focus) {
    const el = focus.cash
      ? box.querySelector("[data-bc-cash]")
      : [...box.querySelectorAll("[data-bc-field]")].find((x) => x.dataset.bcKey === focus.key && x.dataset.bcField === focus.field);
    if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.e); } catch (e) { /* not selectable */ } }
  }
  const latest = bcHoldings().filter((h) => h.priceFetchedAt).map((h) => h.priceFetchedAt).sort().pop();
  const st = document.getElementById("bcStamp");
  if (st) st.innerHTML = latest ? metaNote(CLOCK_ICON_SVG, `${t("Prices as of")} ${fmtDateTime(latest)}`) : "";
}

/* Keep what was typed (raw text) in HOLDING_CHECKS; an emptied card disappears. */
function bcStore(inp) {
  const key = inp.dataset.bcKey, field = inp.dataset.bcField, val = inp.value.trim();
  const rec = HOLDING_CHECKS[key] || (HOLDING_CHECKS[key] = {});
  if (val) rec[field] = val; else delete rec[field];
  if (BC_FIELDS.some((f) => rec[f.id])) rec.date = todayISO(); else delete HOLDING_CHECKS[key];
}

/* The cash figure lives in RECON_CHECKS (number in .actual for the Brokers page, raw text in .actualText for the box here). */
function bcStoreCash(inp) {
  const id = inp.dataset.bcCash, val = inp.value.trim(), p = bcParse(val);
  const rec = RECON_CHECKS[id] || (RECON_CHECKS[id] = {});
  rec.actual = p ? p.v : null;
  if (val) { rec.actualText = val; if (p) rec.date = todayISO(); } else delete rec.actualText;
  if (rec.actual == null && !val && !rec.note) delete RECON_CHECKS[id];
}

function mountBrokerCheck() {
  const root = document.getElementById("bcRoot");
  if (!root) return;
  const sel = document.getElementById("bcBroker");
  if (sel) sel.addEventListener("change", () => { BC_UI.brokerId = sel.value; render(); });

  const commit = () => { clearTimeout(BC_TIMER); if (!document.getElementById("bcRoot")) return; saveStore(); bcRefresh(); };
  root.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-bc-field], [data-bc-cash]");
    if (!inp) return;
    if (inp.dataset.bcCash) bcStoreCash(inp); else bcStore(inp);
    clearTimeout(BC_TIMER);
    BC_TIMER = setTimeout(commit, 700);   // live results once typing pauses
  });
  root.addEventListener("change", (e) => { if (e.target.closest("[data-bc-field], [data-bc-cash]")) commit(); });
  root.addEventListener("click", async (e) => {
    const clr = e.target.closest("[data-bc-clear]");
    if (clr) { delete HOLDING_CHECKS[clr.dataset.bcClear]; saveStore(); bcRefresh(); return; }
    const clrCash = e.target.closest("[data-bc-clear-cash]");
    if (clrCash) {
      const rec = RECON_CHECKS[clrCash.dataset.bcClearCash];
      if (rec) { rec.actual = null; delete rec.actualText; if (!rec.note) delete RECON_CHECKS[clrCash.dataset.bcClearCash]; }
      saveStore(); bcRefresh(); return;
    }
    const rb = e.target.closest("#bcRefreshBtn");
    if (rb) {
      if (!LIVE_ENABLED) { toast(t("Live prices only work on the deployed site (or with vercel dev).")); return; }
      rb.disabled = true; rb.querySelector("svg").classList.add("spinning");
      const tickers = [...new Set(bcHoldings().map((h) => h.ticker))];
      let ok = 0;
      for (const tk of tickers) { if (await refreshLivePrice(tk)) ok++; }
      saveStore(); bcRefresh();
      rb.disabled = false; rb.querySelector("svg").classList.remove("spinning");
      toast(ok ? `${ok}/${tickers.length} ${t("prices updated")}` : t("Couldn't fetch prices — check the ticker symbols (Yahoo format)."));
    }
  });
  // Prices fetched automatically when the page opens: refresh the comparison when they land.
  if (LIVE_ENABLED) fetchAllLivePrices().then((r) => { if (r && r.fetched) bcRefresh(); });
}

/* ------------------------------------------------------------------ Chinese (zh) — only adds keys the app doesn't already have */
const BC_ZH = {
  "Broker check": "券商核对", "Check against your broker": "与券商核对", "Compare with your broker": "与券商核对",
  "Open your broker's app and type what it shows — your cash and each stock. Divz compares it with your records and explains any difference, so you don't have to work it out yourself. Fill in only what your broker shows.": "打开券商 App，把每只股票显示的数字填进来。Divz 会与您的记录对比并解释差异——不用自己计算。只需填写券商有显示的项目。",
  "Why Divz and your broker can show different numbers": "Divz 与券商的数字为何会不同",
  "Fees": "手续费", "Dividends": "股息", "Prices": "价格",
  "Divz adds your buying fees to your cost, so your profit is after fees. Most brokers leave them out.": "Divz 把买入手续费计入成本，所以盈亏是扣除手续费后的结果。大多数券商不计手续费。",
  "Divz counts every dividend you have received. Some brokers only count the recent ones in their profit figure.": "Divz 会计入您收到的每一笔股息。有些券商的盈亏数字只计入最近的股息。",
  "Divz gets prices from Yahoo, which can run about 15 minutes behind your broker's live price.": "Divz 的价格来自 Yahoo，可能比券商的实时价格慢约 15 分钟。",
  "No holdings yet — record a Buy and it appears here automatically.": "暂无持仓——记录一笔买入后会自动显示在这里。",
  "Your broker shows": "券商显示", "Result": "结果", "Clear": "清除", "Not checked yet": "尚未核对", "Matches your broker": "与券商一致",
  "1 difference to look at": "有 1 处差异需要查看", "{n} differences to look at": "有 {n} 处差异需要查看",
  "Average cost": "平均成本", "cost per share": "每股成本", "current price": "当前价格",
  "profit on shares you still hold": "仍持有股份的盈亏", "sales + dividends": "卖出盈亏 + 股息",
  "Same": "一致", "without fees": "不含手续费", "with fees": "含手续费", "set by you": "由您手动设置", "nothing recorded": "暂无记录",
  "at {p}": "按 {p}", "{n} payments": "{n} 笔记录", "Yahoo · {when}": "Yahoo · {when}",
  "Your broker has {n} more shares than Divz — a Buy may be missing.": "券商显示的股数比 Divz 多 {n} 股——可能漏记了一笔买入。",
  "Your broker has {n} fewer shares than Divz — a Sell may be missing, or a Buy entered twice.": "券商显示的股数比 Divz 少 {n} 股——可能漏记了一笔卖出，或买入记录了两次。",
  "Same. Your broker leaves buying fees out of cost; Divz includes them ({fees} in total), so Divz's own average cost is {avg}.": "一致。券商的成本不含买入手续费；Divz 把手续费计入成本（共 {fees}），所以 Divz 自己的平均成本是 {avg}。",
  "Same. Your broker counts buying fees as part of cost, like Divz.": "一致。券商和 Divz 一样，把买入手续费计入成本。",
  "Differs by {d} per share — check the price and quantity of each Buy.": "每股相差 {d}——请检查每笔买入的价格和数量。",
  "Divz has no price for this stock yet — tap Refresh prices.": "Divz 暂时没有这只股票的价格——请点击刷新价格。",
  "Prices differ by more than 2%. Check the price Divz has (open the holding and use Set price) and the stock's currency.": "价格相差超过 2%。请检查 Divz 的价格（打开该持仓并使用“设置价格”）以及股票的货币。",
  "Divz's price is {d} higher. Divz prices come from Yahoo and can run about 15 minutes behind your broker — not a data problem.": "Divz 的价格高出 {d}。Divz 的价格来自 Yahoo，可能比券商慢约 15 分钟——不是数据问题。",
  "Divz's price is {d} higher. You set this price by hand — update it on the holding page.": "Divz 的价格高出 {d}。这个价格是您手动设置的——请在持仓页面更新。",
  "Divz's price is {d} lower. Divz prices come from Yahoo and can run about 15 minutes behind your broker — not a data problem.": "Divz 的价格低了 {d}。Divz 的价格来自 Yahoo，可能比券商慢约 15 分钟——不是数据问题。",
  "Divz's price is {d} lower. You set this price by hand — update it on the holding page.": "Divz 的价格低了 {d}。这个价格是您手动设置的——请在持仓页面更新。",
  "Type your broker's price too, or tap Refresh prices, so Divz can work this out.": "请同时填写券商显示的价格，或点击刷新价格，Divz 才能算出结果。",
  "Same once buying fees are left out — your broker doesn't count them.": "不计买入手续费后一致——您的券商不把手续费计入成本。",
  "Differs by {d} even after fees and price are taken into account.": "即使考虑了手续费和价格，仍相差 {d}。",
  "Divz has no dividends or sales recorded for this stock.": "Divz 没有这只股票的股息或卖出记录。",
  "Same — all {n} payments.": "一致——包含全部 {n} 笔记录。",
  "Matches your latest {k} payments. Your broker doesn't count the {r} older ones ({amt}).": "与您最近的 {k} 笔记录相符。券商没有计入更早的 {r} 笔（{amt}）。",
  "Matches your dividends only — your broker leaves sales out of this figure.": "仅与您的股息相符——券商的这个数字不含卖出盈亏。",
  "Matches your latest {k} dividends — your broker leaves out older ones and sales.": "与您最近的 {k} 笔股息相符——券商没有计入更早的股息和卖出盈亏。",
  "Matches your sales only — your broker leaves dividends out of this figure.": "仅与您的卖出盈亏相符——券商的这个数字不含股息。",
  "Doesn't match any recent set of your payments. Divz counts {n} payments totalling {amt} — compare them with your broker's dividend history (listed below).": "与您最近的任何一组记录都不相符。Divz 共计 {n} 笔，合计 {amt}——请对照券商的股息记录（见下方列表）。",
  "The share counts don't match, so the other comparisons below may be off too. Check this stock's Buy and Sell records first.": "股数不一致，下面的其他对比可能也会有偏差。请先检查这只股票的买入和卖出记录。",
  "Open the holding": "打开该持仓",
  "How Divz's numbers connect to your broker's": "Divz 的数字如何对应券商的数字",
  "Why Divz's Unrealized P/L can differ": "Divz 的未实现盈亏为何不同",
  "Unrealized P/L in Divz (Portfolio page)": "Divz 的未实现盈亏（投资组合页面）",
  "Add back buying fees — Divz counts them as part of your cost": "加回买入手续费——Divz 把它算作成本",
  "Switch to your broker's price ({a} instead of {b})": "改用券商的价格（{a}，而不是 {b}）",
  "Unrealized P/L the way your broker counts it": "按券商算法的未实现盈亏",
  "Why Divz's average cost can differ": "Divz 的平均成本为何不同",
  "Average cost in Divz (fees included)": "Divz 的平均成本（含手续费）",
  "Buying fees per share ({fees} ÷ {n} shares)": "每股买入手续费（{fees} ÷ {n} 股）",
  "Average cost without fees": "不含手续费的平均成本",
  "Dividends and sales Divz counted": "Divz 计入的股息和卖出", "Divz total": "Divz 合计", "Sale": "卖出", "Counted by broker": "券商是否计入",
  "Cash": "现金", "Cash balance": "现金余额", "money in the account, not shares": "账户里的现金，不含股票",
  "No stocks recorded for this broker yet.": "这个券商还没有记录任何股票。",
  "A small difference of {d}, within your tolerance.": "有 {d} 的小差异，在您设定的容差范围内。",
  "Divz shows {d} more cash than your broker. Money that left the account may be missing — a withdrawal, a fee or a Buy.": "Divz 显示的现金比券商多 {d}。可能漏记了流出账户的钱——提款、费用或买入。",
  "Divz shows {d} less cash than your broker. Money that came in may be missing — a deposit, a dividend or interest.": "Divz 显示的现金比券商少 {d}。可能漏记了流入账户的钱——存款、股息或利息。",
  "How Divz works out your cash": "Divz 如何算出您的现金", "Cash in Divz": "Divz 的现金",
  "Deposits": "存入", "Withdrawals": "提取", "Buys (including fees)": "买入（含手续费）", "Sells (after fees)": "卖出（扣除手续费）",
  "Dividends received in cash": "以现金收到的股息", "Interest": "利息", "Fees and taxes": "费用和税项", "Transfers in": "转入",
  "Transfers out": "转出", "Currency exchange": "货币兑换", "Other movements": "其他变动",
  "Compare these lines with the cash section of your broker's statement to find anything missing.": "把这些项目与券商结单的现金部分对照，找出漏记的项目。",
  "Amounts in other currencies are converted at today's exchange rate.": "其他货币的金额按今天的汇率换算。",
  /* Portfolio table (app.js) */
  "Avg Cost (incl. fees)": "平均成本（含手续费）", "Avg Cost (excl. fees)": "平均成本（不含手续费）", "Buying fees": "买入手续费",
  "Average price you paid per share, including your buying fees. Most broker apps show this without fees — see Broker check.": "您每股的平均买入价，含买入手续费。大多数券商 App 显示的是不含手续费的数字——见“券商核对”。",
  "Average price you paid per share, without buying fees — usually the number your broker's app shows as cost.": "您每股的平均买入价，不含买入手续费——通常就是券商 App 显示的成本价。",
  "Brokerage and other fees you paid when buying the shares you still hold.": "买入您仍持有的股份时支付的佣金和其他费用。",
  "Market value minus your cost (buying fees included) — the profit or loss on shares you still hold.": "市值减去成本（含买入手续费）——仍持有股份的盈亏。",
  "Unrealized P/L, plus profit from shares you sold, plus every dividend you have received.": "未实现盈亏，加上已卖出股份的盈亏，再加上您收到的每一笔股息。",
  "Every dividend you have received for this stock, after tax.": "您从这只股票收到的每一笔股息（税后）。",
  "Shares × current price.": "股数 × 当前价格。",
  "Divz counts your buying fees as part of your cost and adds up every dividend you have received, so some figures differ slightly from your broker's app.": "Divz 把买入手续费计入成本，并累计您收到的每一笔股息，所以部分数字会与券商 App 略有不同。",
};
Object.keys(BC_ZH).forEach((k) => { if (!I18N.zh[k]) I18N.zh[k] = BC_ZH[k]; });
