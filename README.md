# Investment Ledger — Dashboard (first screen)

A responsive personal investment tracker. This is the **first screen** from the build
brief: the Dashboard, rendered with realistic sample data (base currency **MYR**,
holdings in both **MYR** and **USD**).

It is built as a **zero-dependency static app** so it runs instantly by opening a file —
no Node, npm, or build step required (Node isn't installed in this environment). The
structure maps 1:1 onto the suggested Next.js + Tailwind + Recharts stack for later.

## Run it

Just open `index.html` in any browser. From PowerShell:

```powershell
Start-Process .\index.html
```

(Optionally serve it: `python -m http.server 8000` then visit `http://localhost:8000`.)

## What's included

- **Sidebar navigation** (Dashboard active; other pages stubbed with a toast)
- **Mobile bottom nav** + slide-in sidebar (responsive ≤ 760px)
- **Summary cards**: Total Deposits, Total Withdrawals, Net Capital Invested,
  Current Portfolio Value, Net Dividends Received, Total Return, Total Return %,
  Unrealized / Realized P/L
- **Portfolio Value Over Time** line chart (hand-drawn SVG)
- **Asset Allocation** donut chart with legend
- **Top Holdings** table — shares, avg cost, price, market value, unrealized P/L %,
  net dividends, total return, with original-currency + base-currency values
- **Upcoming Dividends** table — distinguishes `Confirmed` vs `Estimated` (never shows
  estimated as confirmed)
- **Recent Transactions** table
- **Reconciliation warnings** — flags a broker whose calculated cash ≠ actual cash,
  plus estimated/missing-data notices
- **Dark / light mode** toggle (persisted)
- **CSV export** of the cash ledger
- **Click any summary card** → modal showing exactly how the number was calculated
  (honors the brief's "do not hide calculations" principle)

## How the numbers are computed

Everything is derived in [`app.js`](app.js) from the data in
[`data.js`](data.js) — nothing is hard-coded as a final figure.

```
Net Capital Invested = Total Deposits − Total Withdrawals
Net Dividend         = Gross Dividend − Withholding Tax − Other Fees
Total Return         = Current Portfolio Value + Total Withdrawals + Net Dividends
                       − Total Deposits − Total Fees
```

Every transaction keeps its original currency, original amount, and exchange rate;
base-currency values are computed (`amount × rate`) and never overwrite the original.

## Files

| File | Purpose |
|------|---------|
| `index.html`        | Page structure & layout |
| `styles.css` | Theme tokens, light/dark, cards, tables, charts |
| `data.js`    | Sample brokers, holdings, cash ledger, dividends |
| `app.js`     | Calculations, chart rendering, tables, interactions |

## Porting to Next.js

- `data.js` → API routes / Prisma seed (the data model matches the brief's schema)
- Each `render*()` function → a React component (`<SummaryCards/>`, `<HoldingsTable/>`…)
- SVG charts → Recharts; tables → TanStack Table
- `computeTotals()` → a shared selector / server util
