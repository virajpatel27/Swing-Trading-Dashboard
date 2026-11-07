# Swing Trading Dashboard

**Live: https://virajpatel27.github.io/Swing-Trading-Dashboard/**

A free, fast, mobile-friendly dashboard for swing traders in Indian markets: all NSE main-board stocks (~2,600; Nifty 500
members marked), all NSE and BSE indices, daily prices since 1 January 2007 **adjusted for splits, bonus issues, rights and
demergers**, 230+ indicator / pattern / fundamental fields per stock, 33 scanners with an editable formula, sector / industry /
theme ranks, market breadth and company financials from NSE's official filings. Updated automatically every trading day.

> **Educational purpose only, not investment advice.** End-of-day data; it may contain errors.
> This repository and its website are **public** (free GitHub Pages). Only public market data is stored here - never passwords,
> API keys or tokens.

---

## Gujarati quick-start (tunku)

**Website kholo:** https://virajpatel27.github.io/Swing-Trading-Dashboard/

**Phone par app ni jem mukvu (ek j vaar):**
- **Android (Chrome):** link kholo -> upar jamni baju **⋮** -> **Add to Home screen** (ke **Install app**) -> **Add**.
- **iPhone (Safari):** link kholo -> niche **Share** button (upar teer vadu chokhun ⬆️) -> niche scroll -> **Add to Home Screen** -> **Add**.
- Have home screen par icon thi sidhu khulshe. Net na hoy to chhello joyelo data dekhay chhe.

**Dabi baju nu menu** (phone par niche): icon par mouse rakho to naam dekhay. Upar **search** box (ke `/` key):
stock / index nu naam lakho -> Enter = sidho chart.

**Menu na pages:**
- **Home** - Warm-up: bajaar ni tabiyat (market read, participation, Stage 2/4, FII/DII, 20D highs-lows), mukhya indices,
  aaj na setups (pivot ni najik), kaya theme ma paisa jay chhe, aavta results ane expiry, tamari watchlist na signals.
- **Market** (`#/market`) - badha NSE + BSE indices ane stocks ni ek moti list (search, sector, CSV).
- **Stocks** - badha ~2,600 stocks: **⚙ Columns** thi 230+ columns pasand karo (price, returns, moving averages, pivot,
  volume, RS rating, stage, fundamentals, growth, holding, group rank ...). Row par click = baju ma chart; ↑ / ↓ thi aagal-paachhal.
  **Copy** = TradingView watchlist mate `NSE:SYMBOL` list. List ni jamni kinar kheñcho = list pahodi, vadhu columns.
  Upar jamni baju ▥ / ▦ = list + chart ke 2 / 3 / 4 chart ni grid.
- **Scanners** - 33 taiyar scanner, folder ma: My Scans, Classic, Patterns, Earnings, Fundamentals. **+ New scan** (ke sliders button) = Custom scan window: 5 tab ma filter tick karo, niche tarat ketla stock pass
  thay e dekhay; **Run scan** = result, **Save scan** = My Scans ma naam saathe. **ƒ Formula** thi niyam
  joi / badli shako (tamara browser ma save thay; Export / Import thi bija PC par).
- **Earnings** - athvadiya nu results calendar: kone results aapya (aapdo grade Excellent / Good / Mixed / Weak) ane kone
  baki chhe; jamni baju chhella 14 divas na results card; Filters (growth, grade, signals). ‹ › thi aagal-paachhal athvadiyu.
- **Groups** - Sector / Industry / Theme: rank, Leading / Weakening / Lagging / Improving tag, 1D thi YTD median, 20 divas na
  high/low, % 50 SMA upar. Click = enaa industries ane stocks.
- **Breadth** - bajaar ni tabiyat: 6 line nu saransh (Momentum, Short-term, Big trend, Breakouts, Overdone?, Leadership),
  stage mix ane 6 chart; **Major Indices** tab.
- **Watchlist** - ★ dabavo; aa browser ma save rahe chhe.
- **Stock panel** (chart ni jamni baju, ▯ button thi chalu / bandh): bhav, Overview (key ratios, pros & cons), Financials
  (12 quarter na nana bar), Peers (e j industry), Shareholding. ⤢ = aakhu Financials page.
- **Stock page** - **Chart | Financials**: chart (ƒx Indicators popup ma preview + rang, ⚙ = settings drawer, legend par 👁 / ⚙ / ×,
  ✏️ = drawing patti, cup curve / VCP lehar, niche Earnings table, panes vachche ni line kheñchi ne uchai badlo) ane company na results,
  P&L, balance sheet, cash flow, shareholding, ratios, Pros & Cons.
- Menu ma niche: 📖 formulas, 🌙 dark / light, ⓘ About (disclaimer, sources). Niche status bar ma data ni tarikh.

**Data kyare update thay:** Somvar-Shukravar sanje ~16:40 IST thi (GitHub kyarek kalako modu chalave chhe; cron-job.org thi
samaysar chalu karvanu [docs/MANUAL_CHECKLIST.md](docs/MANUAL_CHECKLIST.md) ma chhe). Raate ~23:50 NSE ni official index file.
Company results ane shareholding roj jate umeray chhe. BSE indices athvadiye ek vaar PC thi (Claude ne kaho "BSE update karo").

**Kai bagde to:** GitHub tamne email karshe (Issue "Daily update failed"). Website par chhello saro data j rahe chhe.
Data pachho lavvo hoy to: [restore.md](restore.md) (Actions -> Restore data -> ek click).

**Tamare karvani vastu (ek j vaar ni):** [docs/MANUAL_CHECKLIST.md](docs/MANUAL_CHECKLIST.md)

---

## How it works

| Part | What | Where |
|---|---|---|
| Raw prices | NSE daily bhavcopy (as traded), 2007 -> today, all NSE main-board stocks | `data/stocks/raw/<ID>/` |
| Delivery % | NSE MTO files, every trading day from 2007 | `data/stocks/delivery/<ID>/` |
| Corporate actions | NSE corporate actions (main board + SME), parsed + audited | `data/corporate_actions/<SYMBOL>.csv` |
| Adjusted prices | back-adjusted: last adjusted close = last real close | `data/stocks/adjusted/<ID>/` |
| NSE / BSE indices | NSE all-indices file + historical API (2007 ->); BSE index CSV (PC only, weekly) | `data/indices/` |
| Stock master | listing, IPO, F&O, circuit band, shares, free float, market cap, liquid flag | `data/meta/stocks.csv` |
| Classification + groups | NSE sector / basic industry + our themes (`config/theme_rules.yaml`); equal-weight group indices | `data/meta/classification.csv`, `data/groups/` |
| Fundamentals | NSE XBRL results, balance sheet, cash flow, shareholding (2017 ->), results calendar | `data/fundamentals/<SYMBOL>.json` |
| Indicator engine | every field per stock and day (`swingdash/engine.py`, patterns, earnings reaction); registry `config/fields.yaml` -> [docs/formulas.md](docs/formulas.md) | `data/snapshot/screen.json` (built by the website workflow) |
| Groups / breadth | group rank + tag (open RRG approximation), market breadth series | `group_ranks.json`, `breadth.json` (built with the screen) |
| Scanners | JSON rules `config/scanners.json`, same evaluator in Python and in the browser | website |
| Website | static HTML/CSS/JS, TradingView Lightweight Charts, PWA | `site/` -> GitHub Pages |

Storage: one folder per instrument, closed years in Parquet (never rewritten), the current year in `current.csv`. Details
and decisions: [docs/PLAN.md](docs/PLAN.md), sources: [docs/SOURCES.md](docs/SOURCES.md), calibration against the reference
app: [docs/calibration.md](docs/calibration.md), history of the work: [docs/WORK_LOG.md](docs/WORK_LOG.md).

### Automatic jobs (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| Daily update | Mon-Fri 16:40 IST (+ 17:20, 18:30; official index file 23:50; safety 08:00), manual | new days (+ re-check of the last 5), delivery, corporate actions, adjusted prices, classification, stock master, groups, new results / shareholding / results calendar, data check, commit, website. Failure -> GitHub issue |
| Fundamentals nightly | every day 23:40 IST | reads stocks whose fundamentals were never read (~450 per night) until all are done, then a 1-minute no-op |
| Deploy website | after a data change, on site changes, manual | screen + groups + breadth snapshot, one chart and one financials file per stock, publish (~7 min) |
| Weekly backup | Saturday 10:00 IST | `data/` zip as Release `data-YYYY-MM-DD` (last 12 kept), Google Drive copy (once set up), `backup` branch moved forward |
| Monthly integrity check | 1st of the month 11:00 IST | data check (incl. fundamentals files), corporate-action consistency, NSE spot check, freshness, fundamentals coverage |
| Backfill history | manual | resumable downloads: stocks, NSE indices, classification, delivery, fundamentals |
| Restore data | manual | data back from a release, a commit or the backup branch (see [restore.md](restore.md)) |
| Tests | every push | 170+ Python tests, JS tests (indicators, scanners, financials equal Python), secret check |

GitHub starts scheduled runs late at busy times (seen: 5-7 hours on 05-Nov-2026). The fix is an outside trigger
(cron-job.org, [docs/MANUAL_CHECKLIST.md](docs/MANUAL_CHECKLIST.md) part 2).

### Safety

- Data is committed only when the data check passes (no empty files, schema, no big row drops, no duplicates, adjusted vs raw
  consistent, snapshot readable, fundamentals files readable). Good data is never replaced by empty or failed data.
- Secrets live only in GitHub Secrets or a local `.env` (git-ignored, see `.env.example`). `scripts/check_secrets.py` runs in CI
  and as a git pre-commit hook (`scripts/install_hooks.py`). The daily jobs use no Angel One login.
- Backups: git history (daily), weekly Release zips (restore tested 06-Nov-2026: checksum OK, 0 data-check errors), `backup`
  branch, Google Drive copy (optional), monthly integrity check. `main` and `backup` are protected against force-push and deletion.
- Not used: screener.in (its terms forbid copying), equitytimer.com (its terms forbid scraping). Third-party reference material
  stays out of the repository.

## For developers (local)

```
py -3.11 -m venv C:\Users\hello\venvs\swing-trading
C:\Users\hello\venvs\swing-trading\Scripts\python -m pip install -r requirements-dev.txt
C:\Users\hello\venvs\swing-trading\Scripts\python -m pytest -q
node --test tests/js/*.test.js
C:\Users\hello\venvs\swing-trading\Scripts\python scripts/build_screen.py
C:\Users\hello\venvs\swing-trading\Scripts\python scripts/build_site.py
C:\Users\hello\venvs\swing-trading\Scripts\python -m http.server 8000 --directory _site
```

Data © NSE / BSE. Charts by [TradingView](https://www.tradingview.com/) Lightweight Charts™ (Apache-2.0).
