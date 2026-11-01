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
   09:00 IST instrument master, Sunday 02:00 IST backup. Our daily job: **20:15 IST** (`45 14 * * 1-5` UTC). Never schedule at 17:00 IST.
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
Next: Phase 7 (daily automation).
- NSE bhavcopy PREVCLOSE is NOT adjusted on ex-dates; Yahoo's adjusted history has its own errors (see WORK_LOG 2026-11-01).
- NSE's API never answers some windows (seems to hang for ranges before an index existed): a window failing twice is skipped.
- Bot commits data on GitHub: Viraj must Pull origin before he commits. Don't poll api.github.com often (60 calls/hour without a token): read the run page HTML.
- NSE politeness: never run two jobs on the same NSE host at once; the NSE API stops answering after ~20-25 min of steady calls.
Repo folder on the PC: `C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading` (nested). Manual steps: `docs/MANUAL_CHECKLIST.md`.
Read GitHub run results without a token via the public API (`api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/runs`,
then `.../actions/runs/<id>/jobs` and `.../check-runs/<job id>/annotations`). Logs, Summary page and artifacts need a signed-in user,
so scripts print results as `::notice` / `::error` annotations.
