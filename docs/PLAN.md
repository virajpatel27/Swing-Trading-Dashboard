# Swing Trading Dashboard - Plan (Phase 1, 2026-10-31)

Status: **draft, waiting for Viraj's OK** ("continue"). Nothing is built yet.

## 1. Phases (each ends with: summary + tests + wait for "continue")

| Phase | What | Result |
|---|---|---|
| 1 | Plan, folder structure, size estimate, manual list | this file |
| 2 | Repo skeleton (GitHub Desktop), secrets, **source probe** | a report: which source answers, from PC and from GitHub, how far back |
| 3 | Storage + raw backfill 2007 -> today (resumable) + validation | `data/indices`, `data/stocks/raw`, checks, tests |
| 4 | Corporate actions + adjusted prices + data-issue report + yfinance cross-check | `data/corporate_actions`, `data/stocks/adjusted`, tests (1:1 bonus, 1:5 split, demerger) |
| 5 | Sector/industry + indicators + relative strength + snapshot | `data/snapshot/latest.json`, tests |
| 6 | Website (static, PWA, charts, screener, watchlist, dark/light) | `site/` |
| 7 | Daily automation: holidays, catch-up, last-5-day re-check, Pages deploy, failure issue / Telegram | `.github/workflows/daily.yml` ... |
| 8 | Backup (weekly Release zip, `backup` branch), monthly integrity, branch rules, restore, README, checklist | live URL |

**Scanner edition (master prompt of 2026-11-03, phases "S0".."S12"):** plan, matrix and storage plan in
`docs/feature-dependency-map.md`; screenshot study in `docs/reference-notes.md`; every field in `config/fields.yaml`.

| Phase | What | Status |
|---|---|---|
| S0 | Study + feasibility | done 2026-11-03 |
| S1 | Stock master `data/meta/stocks.csv` (shares, float, F&O, band, market cap, liquid), audit `reports/stock_audit.md`, renames by ISIN, field registry | done 2026-11-03 (waiting for Viraj's OK) |
| S2 | Price foundation: delivery % 2007 -> (`data/stocks/delivery/`), SME-board corporate actions, EPS factor table `data/meta/share_factors.csv`, data-quality report `reports/data_quality.md` | done 2026-11-04 (waiting for Viraj's OK) |
| S3 | Groups: classification gaps filled (BSE / marked guesses, `config/classification_overrides.csv`), themes (`config/theme_rules.yaml` -> `data/meta/themes.csv`, review `reports/themes_review.md`), equal-weight + median indices for 22 sectors, ~190 industries, 31 themes (`data/groups/`) | done 2026-11-04, themes approved by Viraj |
| S4 | Indicator engine (`swingdash/engine.py`, every field for every day), screen snapshot (`swingdash/screen.py` -> `data/snapshot/screen.json`, built by the website workflow, not in git), registry 144 fields, `docs/formulas.md`, golden tests vs TA-Lib, `docs/calibration.md` | done 2026-11-04 (waiting for Viraj's OK) |
| S5 | Website: "Stocks" page (all screen fields, column settings, sort menu, select / copy / CSV, split chart on wide screens), new chart (Lightweight Charts 5 panes, D/W, candle/bar, 4 styles, header chips, indicator menu with settings, MA presets, markers, drawings) - `site/ind.js` = the pipeline's formulas, tested equal | built 2026-11-04 (waiting for Viraj's look) |
| S6 | Scanner engine (`swingdash/scanners.py` + `site/scan.js`, same results - test), 12 price scanners in `config/scanners.json` calibrated to the reference's 30-Oct counts (docs/calibration.md), Scanners page (#/scanners/<id>) with Formula editor (edit / test / save / reset / duplicate / export / import in the browser), Fields page (#/fields), NSE IPO list (ipo_date, ipo_price) | built 2026-11-05 (waiting for Viraj's look) |
| S7 | Pattern detector `swingdash/patterns.py` (pivot, bases, breakouts, VCP, tight, flag, reversal, shakeout; `config/patterns.yaml`), 10 pattern scanners calibrated (docs/calibration.md), chart overlays (pivot line, base low, VCP pullbacks, tight areas), table columns pivot / base / breakout / IPO | built 2026-11-05 (waiting for Viraj's look) |
| S8 | Fundamentals from NSE XBRL filings (`swingdash/fundamentals.py`): results 12 quarters + up to 10 years, balance sheet, cash flow, shareholding -> data/fundamentals/<SYMBOL>.json (backfill job `fundamentals`, daily step 4d, results calendar); 56 ratio / growth / holding fields; Financials tab, E markers, 3 column groups, 4 scanners | built 2026-11-05 (waiting for Viraj's look) |
| S9 | Earnings scanners (Earnings Gap, Episodic Pivot, EPS Doublers, Code 33, EPS Accelerators, Turnarounds; `swingdash/earnings.py` results-day reaction + quarter trends), Groups page (Sector / Industry / Theme, rank + tag = open RRG approximation `swingdash/group_rank.py`, config/group_rank.yaml), per-stock group fields, Theme chip | built 2026-11-05 (waiting for Viraj's look) |
| S10 | Market breadth (`swingdash/breadth.py`, config/breadth.yaml -> data/snapshot/breadth.json): participation, A/D, large-mid-small, net highs-lows, 4 % movers, breakouts held / failed, stage mix, six-line market read; Breadth page + Major Indices tab | built 2026-11-06 (waiting for Viraj's look) |
| S11 | optional (intraday, news markers, descriptions) | skipped (Viraj, 06-Nov) |
| S12 | Hardening: runtimes checked, data check + monthly integrity cover fundamentals, NaN-safe JSON, restore tested from the backup release, history warning only for real gaps, final README (English + Gujarati, home-screen steps) | built 2026-11-06 |

## 2. Decisions that differ from the original spec (and why)

1. **Repo is created with GitHub Desktop, not `gh` CLI** - Viraj's rule (terminal push fails on his PC).
2. **Daily job at 20:15 IST (cron `45 14 * * 1-5`) + 23:50 IST (`20 18 * * 1-5`, for NSE's index file out ~23:20), not 17:30-18:30.**
   (Update 2026-11-01: BSE indices weekly from the PC by Viraj's choice; the daily job uses no Angel One.) The old Stock-Live-Dashboard uses the same Angel One account:
   its Data update starts 17:00 IST (GitHub often starts it 30-90 min late, a run may last up to 2.5 h) and again at 23:00 and 04:00 IST,
   plus Build instrument master 09:00 IST. 20:15 sits between them. NSE's daily file is out by ~19:05 IST.
   One-time backfill runs on **Saturday daytime** (no old-project job then). Weekly backup Saturday, monthly integrity 1st Saturday.
3. **equitytimer.com is NOT used.** robots.txt allows everything, but its Terms & Conditions (sections 7 and 8, read 2026-10-31)
   forbid scraping with automated tools and forbid redistributing its data. Our repo and site are public. -> Fallback: NSE's own
   official 4-level classification (Macro sector -> Sector -> Industry -> Basic industry) + niftyindices constituent CSVs.
4. **Raw "as traded" prices come from NSE's daily bhavcopy archives** (one file per day = all NSE stocks, since 2007).
   Reason: the old project learned that Angel One's history changes after a split/bonus (so it is already adjusted, not "as traded").
   Angel One = secondary source + cross-check, and the source for BSE indices. To be proven in Phase 2.
5. **BSE refuses GitHub's servers** for several endpoints (old project, HTTP 403, 2026-10-25). BSE history may have to be fetched once from
   the PC (no secrets needed); daily BSE index values come from Angel One.
6. Secret names follow this spec: `ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET` (old project calls two of them
   `ANGEL_CLIENT_CODE` / `ANGEL_MPIN` - same values).
7. Generated website files (per-instrument chart JSON) are built inside the Action and deployed to Pages, **not committed** - keeps git small.

## 3. Folder structure

```
swing-trading-dashboard/
  CLAUDE.md  README.md  restore.md  restore.py  requirements.txt  requirements-dev.txt  .env.example  .gitignore
  config/      universe.yaml (default Nifty 500 + all indices)  settings.yaml (ADJUST_DIVIDENDS=false, thresholds)  holidays/
  swingdash/   python package
    sources/   nse.py  niftyindices.py  bse.py  angel.py  yfinance_check.py
    store.py  calendar.py  corporate_actions.py  adjust.py  indicators.py  classification.py  validate.py  snapshot.py  cli.py
  scripts/     backfill.py  daily.py  check_secrets.py  probe_sources.py
  site/        index.html  app.js  styles.css  manifest.webmanifest  sw.js  icons/
  data/
    indices/nse/<INDEX>/   indices/bse/<INDEX>/
    stocks/raw/<SYMBOL>/   stocks/adjusted/<SYMBOL>/
    corporate_actions/<SYMBOL>.csv          (ex-date, type, ratio, source)
    meta/      instruments.csv  sources.csv  checkpoints/  data_issues.csv  health.json
    snapshot/latest.json
  docs/        PLAN.md  WORK_LOG.md  SOURCES.md  MANUAL_CHECKLIST.md
  tests/
  .github/workflows/  daily.yml  backfill.yml  tests.yml  weekly-backup.yml  monthly-integrity.yml
```

Per instrument folder: `history.parquet` (closed years, never rewritten) + `current.csv` (this year, one line appended per day).
Why: if one big file were rewritten every day, git would keep a new full copy daily (~150 MB/day). A line appended to a text file
costs git only a few bytes. In January the finished year becomes its own small Parquet file. Adjusted files of a stock are rewritten
only when that stock gets a new corporate action.

## 4. Size estimate

Trading days 2007-01-01 -> 2026-10-30: ~4,900. Nifty 500 stocks (many listed later: average ~4,000 days) + ~250 indices (NSE ~150, BSE ~100).

| Part | Rows | Size (Parquet, zstd, ~30 bytes/row) |
|---|---|---|
| Stocks raw | ~2.0 M | ~60 MB |
| Stocks adjusted | ~2.0 M | ~70 MB |
| Indices (raw only, no adjustment) | ~0.9 M | ~27 MB |
| Corporate actions, meta, snapshot | - | ~5 MB |
| **Repo at start** | | **~160 MB** |

**Measured after the backfill (2026-10-31):** 2,259,299 rows, 1,519 files, ~90 MB (stocks 71 MB, indices 19 MB).

Growth per year: daily lines + snapshot (~30 MB) + year-end Parquet (~10 MB) + adjusted rewrites after splits/bonus (~10 MB) = **~50 MB/year**.
-> under 1 GB for 15+ years. Option "ALL NSE EQ stocks" (~2,200) ~= x4 -> ~600 MB at start: then older history moves to GitHub Releases assets.
Website (Pages, not in git): one chart file per instrument ~220 KB (~70 KB gzip when opened), ~170 MB total (Pages limit 1 GB).
Weekly backup zip ~150 MB as a Release asset (does not count in repo size), keep 12.

## 5. Manual things Viraj prepares (one at a time, when the phase needs it)

1. GitHub Desktop signed in (already OK). Python 3.11 is installed on the PC (checked: 3.11, 3.13, 3.14).
2. Angel One SmartAPI: a **new API key (new app) for this project** is recommended, so its usage is separate from the old project.
   Client ID, MPIN and TOTP secret are the same as the old project.
3. GitHub Secrets (repo -> Settings -> Secrets and variables -> Actions): `ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET`.
   Optional later: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
4. GitHub Pages: Settings -> Pages -> Source = GitHub Actions.
5. Branch rule on `main`: block force push + block deletion (allowed on public free repos).
6. Optional: off-GitHub backup (Google Drive or second repo mirror) - ask in Phase 8.

## 6. Risks to know

- Free GitHub Pages and the repo are **public**: only public market data goes in. Never secrets.
- NSE / BSE / Angel One terms are for personal use; publishing end-of-day prices on a public site is common but not legally guaranteed.
- NSE/BSE can block GitHub's servers at any time -> fallback chain + "keep last good data", and some fetches can run from the PC.
- Dashboard shows: "Educational purpose only, not investment advice."

## UI redesign (phases N0-N12, started 2026-11-06)
Same layout, features and way of working as the reference scanner app (from Viraj's screen recordings), but our own name,
logo, colours, font, icons and wording (the site is public: no copied branding).

| Phase | Content | Status |
|---|---|---|
| N0 | Brand + app frame: green bull-horn V logo, colours (emerald accent, dark rail), Inter font, own line icons, left rail (bottom bar on phones), top bar with stock/index search (`/` key), card, status bar, About dialog, loading skeletons, small animations | built 2026-11-06 |
| N1 | Scanner workspace: results list, scanner menu, column drawer, grid view 2/3/4 | open |
| N2 | Chart: header, legend, indicator popup, settings drawer, pane resize, drawing bar, volume colours, pattern drawings, earnings table | open |
| N3 | Custom scan window (5 tabs, ~50 filters, live count, save / load) | open |
| N4 | Stock side panel + Financials page + Peers | open |
| N5 | Warm-up home (incl. FII / DII cash - new data) | open |
| N6 | Earnings calendar page with our rating rule | open |
| N7 | Heatmap (index constituent lists) | open |
| N8 | Groups 3-column | open |
| N9 | RRG | open |
| N10 | Market breadth restyle + Major Indices grid | open |
| N11 | Leaders (our leader score) | open |
| N12 | Polish | open |

Not possible for now: live / intraday prices, news / concalls, company descriptions.
