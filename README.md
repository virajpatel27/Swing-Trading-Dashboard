# Swing Trading Dashboard

**Live: https://virajpatel27.github.io/Swing-Trading-Dashboard/**

A free, fast, mobile-friendly dashboard for swing traders in Indian markets: all NSE indices, all BSE indices and the Nifty 500
stocks, with daily prices since 1 January 2007 **adjusted for splits, bonus issues, rights and demergers**, technical indicators,
relative strength, a sector/industry view and a swing screener. Updated automatically every trading day.

> **Educational purpose only, not investment advice.** End-of-day data; it may contain errors.
> This repository and its website are **public** (free GitHub Pages). Only public market data is stored here - never passwords,
> API keys or tokens.

---

## Gujarati quick-start (tunku)

**Website kholo:** https://virajpatel27.github.io/Swing-Trading-Dashboard/

**Mobile par app ni jem mukvu:**
- Android (Chrome): link kholo -> upar ⋮ -> **Add to Home screen** / **Install app**
- iPhone (Safari): link kholo -> niche Share ⬆️ -> **Add to Home Screen**

**Website ma shu chhe:**
- **Market**: badha NSE + BSE indices ane 500 stocks - LTP, 1D thi 5Y %, 52W high/low thi antar, volume, RSI, trend, RS.
  Column par tap = sort, row par tap = chart. Search, sector filter, CSV download.
- **Screener**: conditions tick karo (50 & 200 EMA upar, RSI 50-70, 52W high pase, volume spike, strong RS, breakout ...).
- **Sectors**: heatmap ane momentum ranking; sector -> industry -> stocks.
- **Watchlist**: ★ dabavo; aa browser ma save rahe chhe.
- **Chart**: 2007 thi candles, EMA 20/50/200, volume, split/bonus na nishan, 1M...MAX, **Adjusted / Raw** toggle.
- ◐ button = dark / light.

**Data kyare update thay:** Somvar-Shukravar **20:15 IST** (stocks) ane **23:50 IST** (NSE indices). Holiday hoy to kai nahi.
BSE indices athvadiye ek vaar (Claude ne kaho "BSE update karo").

**Kai bagde to:** GitHub tamne email karshe (Issue "Daily update failed"). Website par chhello saro data j rahe chhe.
Data pachho lavvo hoy to: [restore.md](restore.md) (Actions -> Restore data -> ek click).

**Tamare karvani vastu (ek j vaar ni):** [docs/MANUAL_CHECKLIST.md](docs/MANUAL_CHECKLIST.md)

---

## How it works

| Part | What | Where |
|---|---|---|
| Raw prices | NSE daily bhavcopy (as traded), 2007 -> today, Nifty 500 | `data/stocks/raw/<SYMBOL>/` |
| Corporate actions | NSE corporate actions (split, bonus, rights, demerger, scheme), parsed + audited | `data/corporate_actions/<SYMBOL>.csv` |
| Adjusted prices | back-adjusted: last adjusted close = last real close; volume / factor | `data/stocks/adjusted/<SYMBOL>/` |
| NSE indices | NSE daily all-indices file (2012 ->) + NSE historical API (2007 ->), 139 indices | `data/indices/nse/` |
| BSE indices | BSE index CSV (PC only, BSE refuses GitHub), 139 indices, weekly | `data/indices/bse/` |
| Sectors | NSE official classification: macro -> sector -> industry -> basic industry | `data/meta/classification.csv` |
| Indicators | EMA 10/20/50/200, RSI14, MACD, ATR14, 52W, trend, breakouts, RS vs Nifty 50 / Sensex, RS rating 1-99 | `data/snapshot/latest.json` |
| Website | static HTML/CSS/JS, TradingView Lightweight Charts, PWA, built by Actions | `site/` -> GitHub Pages |

Storage: one folder per instrument, closed years in Parquet (never rewritten), the current year in `current.csv` (one line
per day) - the repo grows only ~50 MB a year. Details and decisions: [docs/PLAN.md](docs/PLAN.md), sources:
[docs/SOURCES.md](docs/SOURCES.md), history of the work: [docs/WORK_LOG.md](docs/WORK_LOG.md).

### Automatic jobs (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| Daily update | Mon-Fri 20:15 + 23:50 IST, manual | new days (+ re-check of the last 5), corporate actions, adjusted, indicators, data check, commit, website. Failure -> GitHub issue (+ optional Telegram) |
| Deploy website | after a data change, on site changes, manual | builds `_site/` (one chart file per instrument) and publishes it |
| Weekly backup | Saturday 10:00 IST | `data/` zip (~120 MB) as Release `data-YYYY-MM-DD` (last 12 kept), a copy in Google Drive (once set up), `backup` branch moved forward |
| Monthly integrity check | 1st of the month 11:00 IST | data check, corporate-action consistency, NSE spot check, freshness |
| Backfill history | manual | resumable history download; also for stocks that join the Nifty 500 |
| Restore data | manual | data back from a release, a commit or the backup branch (see [restore.md](restore.md)) |
| Tests | every push | 107 Python tests + JS tests + secret check |

### Safety

- Data is committed only when the data check passes (no empty files, schema, no big row drops, no duplicates, adjusted vs raw
  consistent, snapshot readable). Good data is never replaced by empty or failed data.
- Secrets live only in GitHub Secrets (`ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET`) or a local `.env`
  (git-ignored, see `.env.example`). `scripts/check_secrets.py` runs in CI and as a git pre-commit hook (`scripts/install_hooks.py`).
- Backups: git history (daily), weekly Release zips, `backup` branch, weekly Google Drive copy (off-GitHub), monthly integrity check. `main` and `backup` are protected
  against force-push and deletion (repository ruleset).

## For developers (local)

```
py -3.11 -m venv C:\Users\hello\venvs\swing-trading
C:\Users\hello\venvs\swing-trading\Scripts\python -m pip install -r requirements-dev.txt
C:\Users\hello\venvs\swing-trading\Scripts\python -m pytest -q
node --test tests/js/*.test.js
C:\Users\hello\venvs\swing-trading\Scripts\python scripts/build_site.py
C:\Users\hello\venvs\swing-trading\Scripts\python -m http.server 8000 --directory _site
```

Data © NSE / BSE. Charts by [TradingView](https://www.tradingview.com/) Lightweight Charts™ (Apache-2.0).
