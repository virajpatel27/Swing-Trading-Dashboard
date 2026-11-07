# CLAUDE.md - Swing Trading Dashboard (read this first, every session)

## The person you work for
Viraj. **Not a programmer.** Answer in Gujarati-English mix (Latin letters), short, step by step, exact click paths.
**One question at a time.** Work in phases: after each phase summarize, run tests, wait for his "continue".

## Hard rules
1. **Git:** Viraj commits and pushes with **GitHub Desktop** (terminal push fails on his PC). Never `git push` / `gh` CLI. Repo is created with GitHub Desktop too.
   Always ask before a commit/push. (The bot commits of the daily Action are part of the design.)
2. **Secrets:** never ask for a secret (API key, PIN, TOTP) in chat. Only say which GitHub Secret name to fill; he types the value himself.
   Never in code, logs, reports. `.env` locally (git-ignored), `.env.example` in the repo.
3. **Repo is PUBLIC** (free Pages + free Actions minutes): only public market data in it.
4. **Old project** `C:\Users\hello\OneDrive\Documents\GitHub\Stock-Live-Dashboard`: read it to learn (Angel One login, rate limits, NSE/BSE fetch),
   **never change anything in that folder**.
5. **Same Angel One account** as the old project. Its jobs: weekdays 17:00 IST (can start 30-90 min late, run up to 2.5 h), 23:00 and 04:00 IST daily,
   09:00 IST instrument master, Sunday 02:00 IST backup. Our daily job (Viraj 03-Nov: data by ~16:30): **16:40, 17:20, 18:30,
   23:50 IST** Mon-Fri + **08:00 IST** next morning; on-time starts come from cron-job.org (Viraj's account, jobs 16:45 and
   17:10 IST Mon-Fri -> workflow_dispatch; token `cron-job-daily` expires 02-Nov-2027, see docs/MANUAL_CHECKLIST.md). It uses NO Angel One, so running near 17:00 is fine; never add Angel calls
   to the daily job. Stocks: bhavcopy ~16:33 IST; NSE indices same day from the allIndices API (after 15:30), replaced by the
   official ind_close_all file (~23:20). Data workflows must check out `ref: main` (a queued run otherwise gets an old commit).
   BSE indices: weekly from the PC only (Viraj's choice 2026-11-01). When he says "BSE update karo": run
   `<python> scripts/backfill.py --job bse-update`, then `build_snapshot.py` and `validate_data.py`; he pulls first, then commits.
6. **equitytimer.com is not used**: its Terms (sections 7 + 8) forbid scraping and redistribution. Sectors come from NSE's official classification.
7. Never overwrite good data with empty/failed data. Validate before every data commit.
8. Indicators always on ADJUSTED prices. Raw data is never changed by adjustment.
9. Keep `docs/WORK_LOG.md` (dated entry after each finished task: what, why, next) and `docs/PLAN.md` current.

## Where things are
- Plan, decisions, folder structure, size estimate: `docs/PLAN.md`
- Work history: `docs/WORK_LOG.md`

## Facts learned from the old project (2026-10-31)
- Angel One: login client code + MPIN + TOTP (no browser). Daily candles: max ~2,000 days per call. Safe pace ~3/s and 70/min
  (it blocked a run at ~4,790 calls/hour). Gateway blocks at random mostly 09:15-15:30 IST; smooth at night.
- Angel One history IS adjusted (confirmed 2026-10-31: RELIANCE 25-Oct-2024 = 1327.85, raw 2655.70) -> never use it as raw.
  It goes back to 2007-01-02 for stocks, NSE and BSE indices.
- BSE `api.bseindia.com` refuses GitHub servers (HTTP 403: corporate actions, FillddlIndex, IndexArchDaily); answers the home PC.
  `www.bseindia.com/download/` bhavcopy works from GitHub.
- NSE archives (`nsearchives.nseindia.com`) answer GitHub without cookies. On a holiday NSE serves the previous day's bhavcopy
  under the holiday's name: the file's own date column decides. Day's bhavcopy appears ~18:30-19:05 IST.

## Commands (from the project folder)
- Python: `C:\Users\hello\venvs\swing-trading\Scripts\python` (3.11 venv, outside OneDrive).
- Tests (must be green before every push): `<python> -m pytest -q`. Secret check: `<python> scripts/check_secrets.py`.
- Source probe (read-only): `<python> scripts/probe_sources.py` -> `reports/probe_pc.md`.
- Data sources and their fallbacks: `docs/SOURCES.md`.
- Backfill (resumable, checkpoints in `data/meta/checkpoints/`): `<python> scripts/backfill.py --job stocks|nse-indices|bse-indices|all`
  (BSE only from the PC). GitHub: Actions -> Backfill history. Then `<python> scripts/validate_data.py` (exit 1 = do not commit).
- Adjusted prices: `<python> scripts/build_adjusted.py` (NSE corporate actions -> `data/corporate_actions/`, `data/stocks/adjusted/`;
  raw never changed). Fixes for incomplete NSE records: `config/corporate_action_overrides.csv` (always with a note).
  Validation only: `<python> scripts/crosscheck_yfinance.py` -> `data/meta/crosscheck_yfinance.csv`.
- Website: `site/` (logic.js = pure, tested with `node --test tests/js/*.test.js`; app.js = page). Build `<python> scripts/build_site.py`
  -> `_site/` (git-ignored). Preview: the "site" entry in `C:\Users\hello\OneDrive\Documents\Swing Trading\.claude\launch.json`
  (http.server on 8765). Published by `.github/workflows/deploy-site.yml` to GitHub Pages.
- Storage: `swingdash/store.py` - per instrument `hist_<y0>_<y1>.parquet` (closed years) + `current.csv` (this year).
  Meta: `data/meta/instruments.csv`, `data_issues.csv`, `health.json`, `trading_days.csv`, `universe_stocks.csv`, `indices_nse.csv`, `indices_bse.csv`.

## Status
Phase 1 plan approved 2026-10-31 (daily 20:15 IST OK). Phase 2: skeleton + PC probe done; repo published (public)
https://github.com/virajpatel27/Swing-Trading-Dashboard, Tests green, Secrets set, GitHub probe done. **Phase 2 done** (2026-10-31).
**Phase 3 done** (2026-11-01): storage, backfill (steps A files / B walk-back / C gaps / D lonely early rows), validation, 42 tests.
Data: 500 stocks 2007 -> 2026-10-30 (raw), 139 NSE + 139 BSE indices, 2.34 M rows, 92 MB, 0 errors.
**Phase 4 done** (2026-11-01): corporate actions + adjusted prices for 500 stocks, 76 tests, ~147 MB.
**Phase 5 done** (2026-11-01): NSE classification (`scripts/fetch_classification.py`), indicators, RS, `scripts/build_snapshot.py`
-> `data/snapshot/latest.json` + `sectors.json`. 90 tests.
**Phase 6 done** (2026-11-01): website LIVE at https://virajpatel27.github.io/Swing-Trading-Dashboard/ (94 Python + 10 JS tests).
**Phase 7 done** (2026-11-01): daily automation (`scripts/daily.py`, `.github/workflows/daily.yml`), first manual run on GitHub
succeeded; 102 tests.
**Phase 8** (2026-11-01): weekly backup (Release zip + `backup` branch), monthly integrity check, `restore.py` / `restore.md` /
Restore data workflow, pre-commit secret hook (`scripts/install_hooks.py`), README, Google Drive copy (his choice). 110 tests.
**All 8 phases done (2026-11-01):** pushed, ruleset active, Weekly backup #1 OK (Release data-2026-11-01, `backup` branch).
Optional and open: Google Drive setup, Telegram. First real daily data: Mon 02-Nov-2026.
**Universe change (2026-11-01, Viraj):** ALL NSE main-board stocks (EQUITY_L.csv, ~2,620, no SME) + Nifty 500 REITs;
`n500` marks Nifty 500 members. Backfill 2007 -> on GitHub (Backfill history, stocks, restart_from 2007-01-01).
- "Drive token banavo" = run `<python> scripts/gdrive_auth.py` (needs client_secret.json from him). NEVER open/read
  gdrive_token.txt or client_secret.json: he copies the values into GitHub Secrets himself.
- NSE bhavcopy PREVCLOSE is NOT adjusted on ex-dates; Yahoo's adjusted history has its own errors (see WORK_LOG 2026-11-01).
- NSE's API never answers some windows (seems to hang for ranges before an index existed): a window failing twice is skipped.
- Bot commits data on GitHub: Viraj must Pull origin before he commits. Don't poll api.github.com often (60 calls/hour without a token): read the run page HTML.
- NSE politeness: never run two jobs on the same NSE host at once; the NSE API stops answering after ~20-25 min of steady calls.
**Scanner edition (2026-11-03):** master prompt phases S0-S12 (`reference/MASTER_PROMPT.md`, git-ignored). Third-party
material (scanthecharts screenshots, all-stocks.csv export) stays in `reference/` (git-ignored, NEVER commit; calibration only,
descriptions in our own words). S0 done (`docs/reference-notes.md`, `docs/feature-dependency-map.md`). S1 done:
`swingdash/stock_master.py` -> `data/meta/stocks.csv` (built by the daily job), `scripts/audit_stocks.py` ->
`reports/stock_audit.md`, `scripts/find_renames.py` -> `config/symbol_changes_extra.csv` (renames NSE's file misses, found by
ISIN), `backfill.carry_over_renames` (older days of a renamed stock move to the new symbol), `config/fields.yaml` + test.
Free float = 100 - promoter % (NSE shareholding API), liquid = median 30-session turnover >= 1 Cr and close >= 5.
S2 done: delivery % from NSE MTO files (`backfill.py --job delivery`, daily step 1b once its checkpoint exists),
corporate actions from BOTH NSE lists (index=equities and index=sme: SME-era bonuses/splits of 84 stocks were missing),
`data/meta/share_factors.csv` (EPS factors, written by rebuild), `scripts/quality_report.py` -> `reports/data_quality.md`.
Workflows commit only data/: never write tracked files outside data/ in a workflow (git pull --rebase --autostash).
S3 done: `classification.load()` = NSE classification + `config/classification_overrides.csv` (BSE's identical 4 levels for
stocks NSE leaves empty or answers in its old CAPITALS taxonomy; 3 marked guesses). Groups = NSE sector (22) and NSE BASIC
industry (~190; = the reference's "industry") + themes from `config/theme_rules.yaml` (NSE thematic indices first).
`swingdash/groups.py`: equal-weight index of members LIQUID the day before (all members: IT 42x since 2007, nonsense;
liquid: 9x vs NIFTY IT 5.8x). Daily step 4c; `scripts/build_groups.py [--review]` on the PC. Membership = today's
(survivorship: the past is "today's members back then").
S4 done: `swingdash/engine.py` (all price/volume fields per day; settings config/indicators.yaml + stage.yaml),
`swingdash/screen.py` + `scripts/build_screen.py [--as-of DAY]` -> data/snapshot/screen.json (git-ignored; built in
deploy-site.yml, ~5-7 min, 4 processes). Calibrated on 03-Nov (docs/calibration.md): stage = SMA200/SMA50 rule (90.5 %),
RS rating ranked among ALL stocks, RS benchmark Smallcap 250, 1Y = 251 sessions, avg vol 50 incl. today, days since 52W
high in calendar days. Registry `config/fields.yaml` (current_phase 4, 144 fields) -> `scripts/make_formulas_doc.py` ->
docs/formulas.md (a test fails when it is stale). Golden tests vs TA-Lib (requirements-dev).
S5 (website): `site/ind.js` (SDI) = engine formulas in JS, tests/js/ind.test.js compares with tests/js/fixtures/expected_*.json
(made by `python tests/js/make_expected.py` - run it after changing a formula). `site/chart.js` (SDChart, Lightweight
Charts 5.0.8 from unpkg, panes) and the "Stocks" page in `site/app.js` (#/stocks; table columns = SD.COLUMN_GROUPS in
logic.js, each must be a registered screen field - test). Settings / drawings live in the browser (localStorage).
S6: scanners = JSON rules in `config/scanners.json` ({all|any:[...]}, conditions field op value | field2 x mult | between | in
| is). `swingdash/scanners.py` (evaluate, describe, check vs registry) = `site/scan.js` (SDS); tests/js/scan.test.js compares
both on tests/js/fixtures/scan_*.json (regenerate with `python tests/js/make_expected.py` after changing scanners.json).
Website: #/scanners/<id> (same table + chart as Stocks, Formula editor; user edits in localStorage "sd-scans"), #/fields.
site_build copies scanners.json and writes data/fields.json from the registry. IPOs: `stock_master.download_ipos` ->
data/meta/ipos.csv (NSE api/public-past-issues, main board, renames followed). Calibration: `--as-of 2026-10-30`.
S7: `swingdash/patterns.py` (called by engine.stock_fields with config/patterns.yaml; last 300 sessions per day, VCP / flag
latest day only). Pivot = most recent swing high >= 15 sessions old, highest since, >= 20 highs before, above the close
(stack of falling highs). `site/ind.js` pivots / contractions = same rule (tested against Python); chart overlays
(marks.pivot / vcp / tight). 23 scanners in config/scanners.json.
S8: `swingdash/fundamentals.py` (NSE XBRL results / balance sheet / cash flow / shareholding -> data/fundamentals/<SYMBOL>.json;
Backfill job `fundamentals`, daily step 4d after its checkpoint exists, `scripts/fundamentals_report.py`). screener.in is NOT used
(terms forbid copying). Ratios = fundamentals.metrics (screen fields, phase 8). Website: data/f/<id>.json (site_build adds EPS
factors), site/fin.js (SDF) Financials tab, E markers. Local sample docs in data/fundamentals must not be committed (the bot makes them).
Nightly (Viraj 05-Nov): `.github/workflows/fundamentals-nightly.yml` 23:40 IST every day = backfill fundamentals --new-only (stocks never read)
until all are done, then a 1-minute no-op. Shares the data-write lock: the 23:50 daily run waits for it. MCX, ABBOTINDIA etc. are BSE-listed
(only traded on NSE): NSE has no filings for them (BSE from the PC would be needed).
S9: `swingdash/earnings.py` (results-day reaction, needs fundamentals 'ann' days), `fundamentals.quarter_trends`, 6 Earnings
scanners; `swingdash/group_rank.py` + config/group_rank.yaml (group rank = strength vs equal-weight market / its 63-day average,
tag = RRG quadrant; group return = AVERAGE of members, as the reference) -> data/snapshot/group_ranks.json (git-ignored) and
per-stock group fields; website #/groups, Theme chip. Recount earnings scanners when all fundamentals exist.
S10: `swingdash/breadth.py` + config/breadth.yaml -> data/snapshot/breadth.json (git-ignored, with screen.json); per-stock day
flags live in screen.one_stock's hist (last HIST_KEEP=420 sessions); website #/breadth (+ /indices), charts via SDChart.loadLib.
S11 skipped (Viraj). S12 done 06-Nov: validation + integrity check fundamentals JSON, restore tested, history warning only for real
gaps. Scanner plan complete. Open: cron-job.org part 2 (GitHub ran 16:40 jobs 5-7 h late), recount earnings scanners ~10-Nov.
Repo folder on the PC: `C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading` (nested). Manual steps: `docs/MANUAL_CHECKLIST.md`.
Read GitHub run results without a token via the public API (`api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/runs`,
then `.../actions/runs/<id>/jobs` and `.../check-runs/<job id>/annotations`). Logs, Summary page and artifacts need a signed-in user,
so scripts print results as `::notice` / `::error` annotations.

Logo (06-Nov, Viraj's choice): green bull-horn V, site/icons/logo.svg, no background on the site; PNG icons from scripts/make_icons.py.
UI redesign phases N0-N12: docs/PLAN.md. N0 (app frame: rail, top-bar search, card, status bar, skeletons) built 06-Nov.
N1 (scanner workspace: picker with pins/counts, resizable list, column drawer, grid of mini charts) built 06-Nov.
N2 (chart: legend controls, indicator popup with preview, settings drawer, drawing bar, cup/VCP SVG, earnings table) built 06-Nov.
N3 (custom scan window: CS filter list in app.js, csRule -> scanner rule, builder state saved with My Scans) built 07-Nov.
N4 (stockPanel accordion beside the chart, peers by basic_industry, financials cards) built 07-Nov.
