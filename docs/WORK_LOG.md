# Work log

Newest at the bottom. Each entry: what was done, why, what is next.

## 2026-10-31
- Viraj gave his rules (GitHub Desktop only, ask before commit/push, no secrets in chat, public repo, old project read-only,
  avoid the old 17:00 IST job, keep CLAUDE.md + this log) and the full spec for a Swing Trading Dashboard.
- Read the old Stock-Live-Dashboard (read-only) for Angel One login, rate limits, NSE/BSE behaviour and its job times.
- Checked equitytimer.com: robots.txt allows all, but Terms forbid scraping + redistribution -> not used; NSE official classification instead.
- Wrote `docs/PLAN.md` (phases, decisions, folder structure, size estimate ~160 MB start / ~50 MB per year, manual list) and `CLAUDE.md`.
- NEXT: Viraj's OK on the plan (especially daily time 20:15 IST). Then Phase 2: create the repo with GitHub Desktop, then the source probe.
- Viraj: "Ha, continue" (plan + 20:15 IST OK). Phase 2 started.
- Python 3.11 venv at `C:\Users\hello\venvs\swing-trading` (outside OneDrive so OneDrive does not sync thousands of package files).
- Skeleton: .gitignore, .env.example, requirements, README, `swingdash/http.py` (polite session: pause per site, retry + exponential
  backoff), `scripts/check_secrets.py`, `scripts/probe_sources.py`, workflows `tests.yml` + `probe.yml` (manual), 11 tests green.
- PC probe: 18 of 21 checks OK. Found working NSE index history (`historicalOR/indicesHistory`), BSE index list (`FillddlIndex`) and
  BSE history (`IndexArchDaily?index=SENSEX`). niftyindices old address dead. Summary in `docs/SOURCES.md`.
- NEXT: Viraj creates + publishes the repo with GitHub Desktop (public), adds the 4 Secrets, runs "Source probe" on GitHub.
- GitHub Desktop "Add local repository -> create a repository" made a NESTED folder `Swing Trading\Swing Trading` (only .gitattributes,
  commit "Initial commit"). Fixed by moving all project files into it. **Repo folder = `C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading`.**
  Lesson: for an existing folder, use File -> New repository with Local path = the PARENT folder and Name = the folder's name.
- Viraj committed ("phase 2") and published: https://github.com/virajpatel27/Swing-Trading-Dashboard (public). Tests run on GitHub: green.
- Added `docs/MANUAL_CHECKLIST.md` (secret names, where they come from; old project uses a SmartAPI app of type "Historical Data").
- NEXT: Viraj adds the 4 Secrets, runs Actions -> Source probe; then I read its Summary and finish Phase 2.
- SmartAPI site now shows ONE API key per account ("Add app" gives no new key) -> same key as the old project. Checklist updated.
- Viraj added the Secrets and ran Source probe (run 41192953532): failed before writing a report. Cause: `smartapi-python` imports
  `logzero` and `websocket` but does not install them. Fixed: both in requirements.txt, a test that imports the SDK, and the SDK import +
  login moved inside the check (a broken install is now a "NO" row, not a crash). Actions bumped to checkout@v5 / setup-python@v6 /
  upload-artifact@v5 (Node 20 deprecation warning). Job logs need admin rights; annotations + step results are readable without a token.
- NEXT: Viraj commits + pushes, runs Source probe again.
- Pushed "Fix probe: Angel SDK libraries" (15b1d1b); Tests green; Source probe run 41193655907 = success. But its Summary page and the
  artifact are visible only to a signed-in user. -> probe now also prints its whole table as ONE `::notice` annotation, readable via
  `api.github.com/repos/.../check-runs/<job id>/annotations` without a token. upload-artifact -> v6 (v5 still Node 20). 13 tests green.
- NEXT: Viraj commits + pushes this, runs Source probe again; I read the annotation and close Phase 2.
- Pushed "Probe result as annotation" (e1377e2). My polling of the public API used up its 60 calls/hour -> read the run page in the
  browser instead (annotations are visible there signed-out). Lesson: poll the run page HTML, not api.github.com, and not every 15 s.
- GitHub Source probe (run 41194805588): NSE all OK from GitHub; BSE API 403 from GitHub (bhavcopy downloads OK); Angel One login OK,
  history from 2007-01-02 for stock / NSE index / BSE index; Angel history is ADJUSTED (RELIANCE 25-Oct-2024 = 1327.85 = yfinance).
  `docs/SOURCES.md` updated. **Phase 2 done.** Mark checklist: Secrets added, probe run.
- NEXT: Viraj commits the docs; "continue" -> Phase 3 (storage + raw backfill + validation).
- Viraj: "Ha, continue" -> **Phase 3** started.
- Source details found: old bhavcopy format until 05-Jul-2024 (SYMBOL..TIMESTAMP, ISIN only from ~2011+), UDiFF from 08-Jul-2024;
  symbol changes in `nsearchives .../content/equities/symbolchange.csv`. NSE historicalOR: max 365 days AND only ~70 rows per call
  -> 90-day windows. NSE `ind_close_all` archive starts 21-Feb-2012 with old names ("S&P CNX Nifty", "CNX Bank" ...) -> used only for
  daily updates. BSE `ProduceCSVForDate` returns 2007 -> today in ONE call (IndexArchDaily caps at 26 rows); some BSE rows have
  only a close (open/high/low filled with the close). NSE allIndices: 139 = 18 broad, 21 sectoral, 41 thematic, 42 strategy,
  11 fixed income, 6 derivative-eligible.
- Built: `config/universe.yaml`, `config/settings.yaml`, `swingdash/store.py`, `validate.py`, `meta.py`, `backfill.py`,
  `sources/nse.py`, `sources/bse.py`, `scripts/backfill.py`, `scripts/validate_data.py`, workflow `backfill.yml` (manual, saves data
  only after the data check passes). 33 tests green; 3 mutations caught (holiday-date check, unchanged-file skip, 2-empty-window stop).
- Backfill started locally 2026-10-31 ~16:40 IST: stocks, NSE indices, BSE indices in parallel (logs in the session scratchpad).
- BSE indices done in ~5 min: 139 of 151 with data (12 bond indices have none), 8.6 MB.
- NSE historicalOR answers in ~5 s per call -> walking every index back to 2007 would take 6-8 h. Stopped after NIFTY 50 (complete)
  and changed the NSE index job: step A = daily all-indices files from 21-Feb-2012 (all indices per file, matched by current
  name, case/space-insensitive; old names skipped and listed in the checkpoint), step B = walk back from each index's oldest stored
  day with historicalOR. Checkpoint layout now {"files_last_day", "unmatched_names", "walk": {name: state}}. 34 tests green.
- ~17:50 both NSE jobs stopped with ConnectionError on nsearchives at the same moment (two parallel jobs on the same host ->
  NSE dropped us for a few minutes). Added `--attempts/--pause` (restart from checkpoint after a pause). Rule: never run two jobs
  on nsearchives at once.
- Stocks DONE 18:3x: 2007-01-02 -> 2026-10-30, 4,893 trading days, 497 of 501 stocks. Missing: 3 REITs (series RR was not in
  series_priority) + DUMMYHEG (an NSE placeholder). Added RR/IV to series_priority and `--symbols ... --from` for a small extra run
  (own checkpoint `nse_stocks_extra.json`); REIT run started (2019 ->). Index files DONE up to 2026-10-30.
- NSE walk-back hit ReadTimeouts on www.nseindia.com (and the app killed the background task); a single test call then worked in
  ~2 s -> restarted with `--attempts 10 --pause 180`.
- Many hist_*.parquet per instrument after a backfill (one per flush): added `store.compact` + `--job compact`. 36 tests green.
- Sizes before compaction: stocks raw 91 MB, NSE indices 9.4 MB, BSE indices 8.6 MB, 5,240 files.
- REITs done (EMBASSY 2019-04, BIRET 2021-02, BAGMANE 2026-05): 500 stocks. Walk-back crashed once: a ReadTimeout while
  downloading the index LIST was not caught -> list now falls back to the last saved `indices_nse.csv`, and the CLI treats any
  exception as a stop (retry from checkpoint). NSE API pace 2 s -> 3 s (it stops answering after ~20-25 min of steady calls).
- First full data check (19:0x): 0 errors, 1,175 warnings = 953 "unexplained" jumps (splits/bonus, Phase 4), 199 missing-date
  notes (e.g. 18-May-2009 circuit-halt day), 18 bad candles (INDIA VIX, DOLLEX, a few index days), 5 zero closes
  (NIFTY50 DIVIDEND POINTS restarts at 0 each April: real).
- Found: many NSE index rows close-only (old daily files) and holes inside some index histories (e.g. NIFTY500 EQUAL WEIGHT:
  2 rows in 2016 then 2024 ->, giving a fake +70.9% "jump"). Added `store.fill_ohl` (parsers + stored data) and step C
  `nse_index_gaps` (missing trading days inside a history asked from historicalOR in <=90-day windows; empty windows remembered
  in the checkpoint). 40 tests green.
- 20:15-21:24 the NSE API (www.nseindia.com) kept refusing this PC (ConnectionError on almost every try): walk-back went only
  53 -> 57 of 139 in an hour. Stopped the local job (checkpoint kept). Plan: finish the NSE walk-back + step C from GitHub
  Actions (other IP; the probe showed NSE answers GitHub): Actions -> Backfill history -> nse-indices.
- Compacted (5,240 -> 1,519 files), filled close-only rows in 117 NSE indices. Data check: 778 instruments (500 stocks,
  139 NSE + 139 BSE indices), 2,259,299 rows, newest 2026-10-30, **0 errors**, 1,181 warnings. Size: stocks 71 MB,
  indices 19 MB, meta 0.3 MB = ~90 MB (plan estimate was ~160 MB).
- NEXT: Viraj commits code + data (GitHub Desktop), runs Backfill history (nse-indices) on GitHub until it says nothing is left,
  then pulls the bot's commits. Open question for Phase 7: daily values for the ~100 BSE indices Angel One does not list.

## 2026-11-01
- Viraj pushed Phase 3 (1a61268), Tests green. Backfill history #1 (run 41218210541, nse-indices) = "Success" in 30 min but no
  progress: stuck on the SAME window as the PC (NIFTY100 LOW VOLATILITY 30, window ending 16-Nov-2008, ReadTimeout). So NSE had
  not blocked the PC: this one request never answers, and the script kept asking it. Bot commit da1d1b0 changed only meta files.
- Fix: a window that fails twice is skipped and listed (`walk[name].skipped`, gaps: listed as empty with `fails`), the walk goes on.
  Test + mutation check. 41 tests green.
- NEXT: Viraj Pull origin (bot commit), commit + push the fix, run Backfill history (nse-indices) again.
- Pushed (925c52e + merge 2fa51f2). Backfill history #2 (run 41257286029, ~1.5 h): walk 57 -> 117 of 139, data check 0 errors,
  2,297,373 rows, bot commit fb5ccf3. Skipped windows (failed twice): NIFTY RURAL 2015-10..2016-04, NIFTY100 ESG 2013-04..2013-10
  - probably before those indices existed: NSE's API seems to hang instead of answering "empty" for some such ranges.
- NEXT: run Backfill history (nse-indices) once more for the last 22 indices + step C (gaps).
- Backfill history #3 (run 41265003200): walk 139/139, gaps 139/139 (597 windows filled, 1,105 empty, 0 failed), bot commit
  c54cf66. Data check: 2,335,940 rows, 0 errors, 1,151 warnings. 48 of 139 NSE indices start in Jan-2007 (others launched later).
- Left: 4 Equal Weight indices (NIFTY500 EW, TOP 10/15/20 EW) have 1-2 lonely rows (2016-07-07, 2023-04-12) years before their
  real start (2024) -> fake 70-160% "jumps". Added step D `nse_index_islands` (<= 20 rows followed by >= 60 trading days with no
  row are dropped at the start, listed in checkpoint "trimmed"). Test + mutation check, 42 tests green.
- NEXT: Viraj Pull origin; I run the nse-indices job locally (only step D has work), validate; Viraj commits + pushes.
- Pulled (ff8dfec). Step D locally: 47 indices, 66 lonely early rows dropped (dates 2016-07-07 / 2023-04-12: NSE's daily file
  carried early values of later-launched indices). Data check: 778 instruments, 2,335,874 rows, **0 errors**, 1,055 warnings
  (880 jumps = mostly stock splits/bonus for Phase 4; index jumps left are real: 18-May-2009, Dividend Points resets, leverage).
  Data 92 MB, 1,556 files. **Phase 3 done.**
- NEXT: Viraj commits + pushes; "continue" -> Phase 4 (corporate actions + adjusted prices).
- Viraj pushed (292d16d), "Ha, continue" -> **Phase 4**.
- NSE corporate actions: one call per year (2007-2026, ~1.5-2.7k records/year, ~3 s each), cached in `cache/` (not in git).
- **NSE bhavcopy PREVCLOSE is NOT adjusted on ex-dates** (RELIANCE bonus day shows 2655.70) -> factors come from the action text;
  demerger/scheme from the ex-day price (special pre-open session open, or the close when open/close differ > 30 %).
- Parser (`swingdash/corporate_actions.py`) reads the many NSE spellings incl. old abbreviations ("Fv Splt Frm Rs 10 To Re 1",
  "Fv Spl-Rs10tore1/Bon-1:1", "Bon 5:1", "Rs 5/ To 2/", "... Each To Rs 2/- Each"); "SPL" alone = special dividend; "Sub-Division"
  is not a dividend (bug caught by a test). DVR/debenture/NCRPS "bonus" is not an equity bonus.
- `swingdash/adjust.py` back-adjustment (factor per type, cumulative backwards, volume / factor, last adjusted close = last raw
  close); ex-date moved up to 5 trading days when the price changed on another day; action not seen in prices -> not applied +
  issue. `config/corporate_action_overrides.csv` for incomplete NSE records (1: SUNTV 2007, Yahoo agrees 0 mismatches).
- `swingdash/rebuild.py` + `scripts/build_adjusted.py`: 500 stocks -> data/corporate_actions/<ID>.csv (452 files) and
  data/stocks/adjusted/<ID>/. Applied: 244 bonus, 195 split, 20 demerger, 56 rights, 14 scheme. Issues: 2 rights without issue
  price (TATASTEEL 2007, TMPV 2008). Big drops left in adjusted series: 4, all real (YESBANK, IDEA Mar-2020, SUZLON Oct-2008,
  POLICYBZR Sep-2026); no rise > 60 %. Unexplained jumps 944 -> ~460 (real market moves: 2009 election day, PSU bank
  recap 25-Oct-2017, circuits ...).
- Data check now also: adjusted group, adjusted-vs-raw consistency (same days, same last close, factor range) as ERRORS,
  adjust issues merged into data_issues.csv; raw stocks no longer judged for jumps (adjusted are). 0 errors, 1,278 instruments.
- `scripts/crosscheck_yfinance.py` (validation only) -> data/meta/crosscheck_yfinance.csv: 499 compared, median 0.03 % of days
  differ (> 2 %), 24 stocks > 5 %: Yahoo-side errors (unadjusted history before 1-Jan-2024/2025/2026 for TRENT, GPIL, CGCL,
  MOTILALOFS; a stale 18-Mar-2025 value in 10 stocks; missed rights/demerger jumps J&KBANK 2017, TMPV 2025) or a different
  demerger factor (SIEMENS 2025). Our adjusted series have no one-day move > 40 % except ZEEL 14-Sep-2021 (real).
- Tests: 76 green (22 Phase 4 incl. real RELIANCE bonus / IRCTC split / RELIANCE demerger), mutations caught.
  Size now: raw 71 MB, adjusted 53 MB, indices 21 MB, CA 2 MB = ~147 MB, 3,001 files.
- NEXT: Viraj commits + pushes; "continue" -> Phase 5 (sector/industry, indicators, relative strength, snapshot).
- Viraj pushed (688b762), "Ha, continue" -> **Phase 5**.
- NSE GetQuoteApi gives macro / sector / industryInfo / basicIndustry + indexList (index memberships). `swingdash/classification.py`
  + `scripts/fetch_classification.py` -> data/meta/classification.csv (asks only missing or > 30-day-old entries, keeps the last
  good entry when NSE fails, Nifty 500 list industry as fallback). Fetch for 500 stocks started 11:2x in background (NSE ~3-5 s/call).
- `swingdash/indicators.py`: EMA 10/20/50/200, RSI14 + ATR14 (Wilder), MACD 12/26/9, 52W high/low (252 days), returns
  1D..5Y, trend rule, breakout/breakdown 52W and 20D, volume spike, RS vs benchmark (3M/6M) and RS rating 1-99
  (0.4*3M + 0.2*6M + 0.2*9M + 0.2*12M, percentile; stocks among stocks, indices among indices, stale ones not ranked).
- `swingdash/snapshot.py` + `scripts/build_snapshot.py` -> data/snapshot/latest.json (column-wise, one instrument per line,
  271 KB, 778 rows, ~1.5 min) and sectors.json (sector -> industry -> constituents, medians, % above EMA50/200, momentum
  rank = avg percentile of median 1M and 3M). First real run: 3 stale (BSE CARBONEX, GREENEX, Liquid Rate - discontinued),
  trend of 500 stocks on 30-Oct-2026: 232 strong downtrend, 158 sideways, 45 strong uptrend.
- Data check: snapshot must cover >= 95 % of instruments (error) and carry the newest date (warn).
- Tests: 90 green (indicators by hand calculations, snapshot on a small fake market, classification fallbacks); mutations
  caught (raw instead of adjusted, stale ranked).
- Classification done: 500 of 501 from NSE (13 macro, 20 sectors, 52 industries, 126 basic industries); DUMMYHEG = fallback.
  Snapshot rebuilt with sectors: latest.json 298 KB, sectors.json 34 KB; data check 0 errors. On 30-Oct-2026 Media and IT rank
  top by momentum, Construction / Diversified bottom. **Phase 5 done.**
- NEXT: Viraj commits + pushes; "continue" -> Phase 6 (website).
- Viraj pushed (1534a73), "Ha, continue" -> **Phase 6**.
- `site/`: index.html, styles.css (tokens, light/dark incl. toggle saved in localStorage), logic.js (pure: filters, sort, CSV,
  Indian number format, raw = adjusted / factor, weekly candles, EMA, ranges, heat levels; 10 node tests in tests/js),
  app.js (hash routes: Market table, Screener with 8 conditions, Sectors heatmap -> industries -> stocks, Watchlist in
  localStorage, detail page with lightweight-charts@4.2.0 from unpkg loaded only when a chart opens: candles, EMA 20/50/200,
  volume, corporate-action markers, 1M..MAX with weekly candles for 3Y/5Y/MAX, Adjusted/Raw toggle - EMAs hidden in Raw),
  sw.js (app files cache-first, data network-first, offline copy), manifest + icons (scripts/make_icons.py, pure-Python PNG).
- `swingdash/site_build.py` + `scripts/build_site.py` -> _site/ (git-ignored): 778 chart files, 107 MB (RELIANCE 265 KB).
- Bug found in the browser: sectors.json had NaN (browsers reject it). Fixed (null), JSON now written with allow_nan=False,
  data check rejects NaN/Infinity in snapshot files. Test added.
- Browser checks (local http.server on 8765): all routes work, no console errors, no page-wide horizontal scroll at 375 px
  on market / detail / sectors / screener, dark mode + chart colours switch.
- `.github/workflows/deploy-site.yml` (push to site/snapshot, manual, workflow_call): build + upload-pages-artifact@v4 +
  deploy-pages@v4. Needs Settings -> Pages -> Source = GitHub Actions BEFORE the first run. Tests workflow runs the JS tests too.
- Tests: 94 Python + 10 JS green.
- Viraj pushed (f06ca74): Tests green; Deploy website #1 built (34 MB artifact) but deploy failed 404 = Pages not enabled yet.
  He enabled Pages (Source = GitHub Actions) and re-ran: #2 success. **LIVE: https://virajpatel27.github.io/Swing-Trading-Dashboard/**
  Checked live: 775 rows, RELIANCE chart, service worker registered. **Phase 6 done.**
- NEXT: "continue" -> Phase 7 (daily automation at 20:15 IST, holidays, catch-up, re-check last 5 days, failure issue/Telegram).
- Viraj: "Ha, continue" -> **Phase 7**.
- File times (Last-Modified): NSE UDiFF bhavcopy ~16:33 IST, `ind_close_all` ~23:20 IST. -> two daily runs: 20:15 IST (stocks)
  and 23:50 IST (NSE indices).
- Asked Viraj about the ~100 BSE indices that Angel One lacks. **His choice: ALL BSE indices weekly from the PC** (none daily).
  So the daily job does not use Angel One at all (no clash with the old project). Weekly: he says "BSE update karo" ->
  `scripts/backfill.py --job bse-update` (10 days back per index, whole history for new ones) + build_snapshot + validate,
  he commits.
- `swingdash/daily.py` + `scripts/daily.py`: stocks from the checkpoint with the last 5 trading days re-read
  (`restart_from`), NSE index files re-read the same way, new indices walked back, corporate actions + adjusted (NSE down ->
  saved CA files), classification (8 min max), snapshot written only when content changed, warning for new Nifty 500 stocks
  without history. Checkpoint/health files no longer carry a run timestamp, so a holiday run changes nothing.
  Placeholder symbols (DUMMY*) left out of the universe (config `exclude_prefixes`).
- `.github/workflows/daily.yml`: cron 45 14 and 20 18 UTC Mon-Fri + manual; CA cache via actions/cache; data check with the
  pre-run baseline; commit only when changed; then calls deploy-site.yml; on failure a GitHub issue (label daily-failure,
  one open issue, later failures comment) + optional Telegram (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
  `backfill.yml` got `symbols` / `from_date` inputs (new Nifty 500 stocks) and deploys after such a run.
- Local dry run (Sunday 01-Nov): 5 min, re-read 5 bhavcopies + index files, 0 adjusted files changed, snapshot not rewritten,
  only `nse_stocks.json` changed once (old "updated" field removed). Tests: 101 Python + 10 JS green, mutation caught.
- Viraj pushed (2a1f829) and ran Daily update #1 by hand (run 41285843577): **Success**, 4.5 min incl. deploy; summary "new
  trading days: none" (Sunday). The bot commit (ec8a88c) only re-ordered instruments.csv / data_issues.csv: Windows sorts
  paths case-insensitively, Linux not (J_KBANK). Fixed: sort by plain name; test added (102 green).
  Remaining warnings: Node 20 deprecation for actions/cache@v4, upload-pages-artifact, deploy-pages@v4 (harmless for now).
- **Phase 7 done.** First real daily data: Monday 02-Nov-2026 20:15 IST (stocks) and 23:50 IST (indices).
- NEXT: Viraj pulls the bot commit, commits the sort fix; "continue" -> Phase 8 (backup, restore, integrity, branch rules, README).
- Viraj: "Ha, continue" -> **Phase 8** (his sort-fix commit was not pushed yet; goes with the Phase 8 push).
- `.github/workflows/weekly-backup.yml`: Saturday 10:00 IST, data/ zip (+ SHA-256) as Release data-YYYY-MM-DD, keeps 12,
  moves `backup` branch forward without force; failure -> issue.
- `swingdash/integrity.py` + `scripts/integrity.py` + `monthly-integrity.yml` (1st, 11:00 IST): data check, corporate-action
  consistency (rebuild adjusted from raw + saved CA files and compare; tolerance 0.01 % because current.csv keeps 4 decimals -
  OLAELEC differed 0.0002 % at 1e-6), NSE spot check of random past days, freshness. Local run: OK, 0 CA differences,
  3 spot days 0 mismatches, 2.5 min.
- `restore.py` (--list / --from-release with SHA-256 / --from-commit / --from-backup-branch; current data moved to
  data_before_restore_*/, git-ignored; then data check with new `validate_data.py --no-baseline`), `restore.md` (Gujarati-English
  steps), `restore-data.yml` (one click on GitHub, commits only after the data check, then deploys).
- `scripts/install_hooks.py`: git pre-commit hook running check_secrets on staged files (GitHub Desktop runs it); installed on
  this PC and tested (fake `ANGEL_PIN=...` file blocked, clean file passed).
- README rewritten (English + Gujarati quick-start, jobs table, safety), MANUAL_CHECKLIST with exact ruleset clicks.
- Tests: 107 Python + 10 JS green; mutation caught (spot check tolerance).
- Asked about an off-GitHub backup: **Viraj chose Google Drive.** Service accounts cannot store files in a personal Gmail
  Drive, so: his own account via OAuth, scope `drive.file` only (app sees only its own files), consent screen published
  ("In production", else refresh tokens die after 7 days). `scripts/gdrive_auth.py` (one-time on the PC: loopback + PKCE, writes
  gdrive_token.txt, never prints it), `scripts/gdrive_backup.py` (refresh -> access token, folder "Swing Trading Dashboard
  backups", resumable upload, keep 12; skips quietly without secrets), step in weekly-backup.yml. Secrets GDRIVE_CLIENT_ID /
  GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN; check_secrets knows Google patterns + refuses client_secret.json /
  gdrive_token.txt. Zip size measured: 119 MB. 110 tests green.
- NEXT: Viraj pushes Phase 8, creates the ruleset, runs Weekly backup once; Google Drive setup (8 steps in the checklist)
  when he wants - then "Drive token banavo" -> run scripts/gdrive_auth.py (do NOT read gdrive_token.txt).
- Viraj pushed Phase 8 (ca64d6e, Tests green), created ruleset "protect main and backup" (Active; targets main + backup;
  Restrict deletions + Block force pushes only), ran Weekly backup #1 (run 41289129804): Success - Release data-2026-11-01
  with zip (downloadable), branch `backup` = main. `restore.py --list` sees the release. Google Drive step skipped (not set up).
- **All 8 phases done (2026-11-01).** Open, optional: Google Drive setup (checklist), Telegram. Watch the first real daily
  runs Monday 02-Nov 20:15 / 23:50 IST.

### 2026-11-01 (later): ALL NSE main-board stocks
- Viraj: "mare NSE na badha listed stock dashboard ma joiye chhe, 01-01-2007 thi". Asked SME or not -> **main board only**.
- NSE `content/equities/EQUITY_L.csv`: 2,620 stocks (EQ 2,357, BE 230, BZ 33), 690 listed before 2007. REITs (EMBASSY,
  BIRET, BAGMANE) are not in it -> Nifty 500 members missing from EQUITY_L are added. Universe = 2,623.
- config `stocks.source: all_nse_eq`; `stock_universe` keeps the saved list when NSE fails or the new list is < 90 % of it;
  column `n500` (Nifty 500 member) -> snapshot column -> website views "All stocks" / "Nifty 500" (Market + Screener).
- `scripts/backfill.py --restart-from 2007-01-01` (all stocks, read again from that day; retries continue from the checkpoint).
  backfill.yml: inputs restart_from, job classification; after any job: adjusted / classification (15 min) / snapshot, deploy.
- Size estimate: data ~540 MB, site ~420 MB, weekly zip ~430 MB (Google Drive keep 12 -> 6).
- Tests: 113 Python + 11 JS green.
- NEXT: Viraj pushes; runs Backfill history (stocks, restart_from 2007-01-01; ~2-3 h on GitHub; run again if it stops on
  time), then Backfill history (classification, 240 min) until all stocks have NSE sectors.
- Backfill #4 (run 41290076592): restart_from was left empty -> only the new list, ~300 classifications, snapshot (30 min).
  Backfill #5 (run 41292927474, restart_from 2007-01-01): Success ~2.5 h: 2,623 stocks, 13.67 M rows, 0 errors,
  688 stocks from Jan-2007.

## 2026-11-03
- First scheduled daily data: only ONE of Monday's two runs happened, and late (snapshot generated 23:07 UTC = 04:37 IST
  Tue). Data date 2026-11-02 for stocks and NSE indices, 0 errors, 2,625 stocks (2 new listings). Watch whether GitHub keeps
  delaying/skipping scheduled runs.
- RELIANCE +11.6 % on 02-Nov (close 1,300.00 at the high, volume 88 M vs 15 M) - matches NSE's bhavcopy: real.
- Sector data: 1,240 of 2,623 stocks have NSE classification -> run Backfill history (job classification, 240 min).
- BSE indices still at 30-Oct (weekly from the PC, Viraj says "BSE update karo").
- Backfill #6 (classification, run 41556719281): Success - 2,587 of 2,623 stocks have NSE classification (36 without answer;
  the daily run asks again).
- **Daily update #3 failed** (run 41557321163, issue opened): it was Monday's 23:50 IST schedule started ~14 h late, then
  queued 2 h behind the classification backfill (same `data-write` group). actions/checkout gave it the commit of the moment
  it was QUEUED (094f631), so `git pull --rebase` in "Save data" (step 9) conflicted with the classification commit.
  Nothing lost (no new trading day yet at that time). Fix: data workflows check out `ref: main` (daily, backfill, restore,
  weekly backup - its release/tag now point at that HEAD). Daily got two safety schedules: 02:30 IST (0 21 * * 1-5) and
  08:00 IST (30 2 * * 2-6); nothing new -> nothing committed.
- Note: index files_last_day may show today before NSE's file exists (a missing file still advances the loop); harmless
  because every run re-reads the last 5 trading days.
- NEXT: Viraj pulls, commits + pushes the workflow fix, closes the "Daily update failed" issue after the next green run.
- Pushed (903188d + merge 9bde3f7), Tests green.
- Viraj: wants the dashboard updated at ~16:30 IST ("NSE ni website ma 4:30 data aavi jai chhe"). Checked: UDiFF bhavcopy
  Last-Modified 11:03 UTC = 16:33 IST on 02 and 03-Nov. NSE `api/allIndices` gives open/high/low/last of all 139 indices
  with "timestamp": "03-Nov-2026 15:30" -> `nse.index_closes_today` (None while the market is open; 0 = no value) and
  `daily.add_index_closes_today` (adds the day only where missing; the official file replaces it later via the 5-day re-read).
  Live check: 139/139 matched. Schedule now 16:40 / 17:20 / 18:30 / 23:50 IST + 08:00 next morning (no Angel One, so no
  clash with the old project's 17:00 Angel job). 115 tests green.
- Pushed (bffacc2). Manual Daily update #4 (run 41637751171): Success ~18:26 IST. Live: data date 2026-11-03 for stocks AND
  NSE indices (same-day values from allIndices: NIFTY 50 23,810.85 +1.58 %), 0 errors. BSE still 30-Oct (weekly PC job).
- NEXT: Viraj closes the "Daily update failed" issue; tomorrow check that the 16:40 IST schedule delivers by ~17:00.

### 2026-11-03 (evening): new master prompt (scanner edition) - not started
- Viraj shared Downloads/MASTER_PROMPT.md (phases 0-12: stock master, groups/themes, ~60 indicators + field registry,
  column settings, scanner engine + formula editor, patterns, fundamentals, earnings scanners, groups, breadth),
  SN.zip (287 screenshots of scanthecharts; also Warm-up, Heatmap, RRG, News, Earnings pages), all-stocks.csv (their
  export: 2,609 stocks x 105 columns) and sector-ranks.csv. Third-party material: keep in a git-ignored reference/ folder,
  never commit (public repo); use only to calibrate.
- all-stocks.csv is the **03-Nov-2026** session (RELIANCE 1,307.90), not 30-Oct (the screenshots are 30-Oct). Its "themes"
  column is an unquoted list -> fix with a regex before pandas. 2,596 of its symbols are in our list; their industry = NSE
  basic industry for 84 %, sector 90 %; RS rating correlation 0.986 with ours.
- Formula check on 03-Nov (ours on adjusted data vs theirs, ~2,226 stocks): price 100 %, RSI(14) Wilder 99.3 % within 0.5,
  ADR%(20) = 100*(SMA(H/L,20)-1) 100 %, RVol = volume / average of the previous 20 days (a ratio, not %) 99.7 % within 0.05,
  % from SMA50 99.7 % within 0.1, % from SMA200 94.3 %, 1M return (21 sessions) 99.9 %. -> they use standard formulas on
  adjusted prices; calibrating against their export works.
- NEXT: Viraj's go for Phase 0.

### 2026-11-03 (night): Phase 0 (study + feasibility) - done, waiting for "continue"
- Viewed all 287 screenshots -> `docs/reference-notes.md` (own words: scanner tree + counts, chart header / markers /
  overlays, 96 columns in 8 groups, 16 indicators with defaults, chart settings, fundamentals tab, Groups, Market breadth,
  Warm-up, Earnings, Heatmap, RRG, News). Numbers read off the screenshots (RRG values, breadth values) are kept private in
  `reference/calibration.md` (git-ignored with the rest of reference/).
- Real source tests (read-only, ~45 calls): delivery % exists from 2007 (MTO files) and 2020+ (full bhavcopy); F&O list,
  price bands, bulk/block (today), index members (niftyindices), delisted list, IPO list, event calendar, board meetings,
  announcements, FII/DII (today only), shareholding (21 quarters), results XBRL from Mar-2017 (old feed, ends Dec-2024) +
  `api/integrated-filing-results` (2025 ->). GetQuoteApi gives issuedSize + ffmc (shares, float). `api/quote-equity`
  answers 403 (not needed). BSE->NSE movers (MARSONS) have no old NSE results.
- Matrix, size / runtime estimate, storage plan, phase plan, UNKNOWN list -> `docs/feature-dependency-map.md`.
  No MISSING item blocks a major feature. Measured: data 541 MB, .git 414 MB.
- NEXT: Viraj reviews the matrix and says "continue" (Phase 1). Ask before commit (new docs + .gitignore reference/).

### 2026-11-03 (night): Scanner Phase S1 - stock master + audit (done, waiting for Viraj's OK)
- `swingdash/stock_master.py` -> `data/meta/stocks.csv` (one row per stock: ISIN, series, listing, first / last day,
  status, n500, F&O, price band, face value, shares, promoter %, free float %, raw close, market cap, float market cap,
  median + average 30-session turnover, liquid, sector levels). Built by the daily job (step 4b) and after every backfill.
- Share count + promoter holding come with the monthly classification call (GetQuoteApi + shareholding API = 2 calls per
  stock). classification.csv got columns shares, float_pct_nse, face_value, promoter_pct, shp_date. Entries without a share
  count are asked again -> the first fill takes ~4.5 h of NSE calls (daily runs do ~8 min each, or Backfill history ->
  job classification). After a split / bonus / rights / consolidation the count is asked again (`share_count_changed`).
- Checked against the reference export (03-Nov): F&O 218 = 218 identical; free float = 100 - promoter % (their definition,
  90 % within 0.1 pt; NSE's own ffmc free float differs, kept only as fallback); TITAN shares x price = their market cap;
  their "30-day rupee volume" is an AVERAGE (ours within ~1 %), but the liquid rule uses the MEDIAN (tooltip): 1,545 liquid
  on 02-Nov vs their 1,507 on 30-Oct (with the average it would be ~1,600).
- Audit (`scripts/audit_stocks.py` -> `reports/stock_audit.md` / .csv): 2,626 stocks (EQ 2,391, BE 199, BZ 33, REIT 3),
  missing 0, extra 3 (REITs, on purpose), 12 shares traded but not in NSE's equity list (old / insolvency names), 34 late
  starts, 38 without NSE sector, 0 share counts yet.
- **Renames NSE's symbolchange.csv misses**: found by the same ISIN in the bhavcopy before/after the first stored day
  (`scripts/find_renames.py` -> `config/symbol_changes_extra.csv`): RUCHI->PATANJALI, PHILIPCARB->PCBL, PDSMFL->PDSL,
  BURGERKING->RBA, SHRIRAMEPC->SEPC, WABCOINDIA->ZFCVINDIA. Their history before 2022 must be re-read: Backfill history,
  job stocks, symbols PATANJALI,PCBL,PDSL,RBA,SEPC,ZFCVINDIA, from 2007-01-01.
- ABCOTS -> ABCIND (NSE file, 02-Nov): the older days sit in the ABCOTS folder -> new `backfill.carry_over_renames` copies
  them into the new symbol's folder on the next run (daily or backfill), automatically for future renames too.
- Bhavcopy parser keeps the ISIN now (audit: ETFs with INF... ISINs are not "new listings").
- Field registry `config/fields.yaml` (current_phase 1; 64 fields incl. all snapshot and stocks.csv columns) +
  `swingdash/registry.py` + tests/test_scan_phase1.py (test_registry_dependencies). 126 Python + 11 JS tests green.
- NEXT: Viraj reviews the audit, commits + pushes (GitHub Desktop), runs Backfill history (classification) once or twice and
  Backfill history (stocks, the 6 renamed symbols, from 2007-01-01); then "continue" for S2.
- Backfill #7 (run 41653289107, stocks, 6 renamed symbols): download + data check OK, but "Save data" failed (exit 128):
  the new audit step rewrote reports/stock_audit.md (outside data/, not committed by the bot) and `git pull --rebase`
  refuses to run with unstaged changes -> nothing saved. Fix: workflows run `audit_stocks.py --master-only` (stocks.csv
  only) and all data workflows use `git pull --rebase --autostash`. Re-run Backfill after the push.

### 2026-11-04: Scanner Phase S2 - price foundation (done, waiting for Viraj's OK)
- Backfill #8 (stocks, 6 renamed symbols) OK: PCBL 2007 ->, ZFCVINDIA / SEPC 2008, PDSL 2014, RBA 2020, PATANJALI 2020
  (Ruchi Soya relisted Jan-2020: genuine). ABCIND got ABCOTS's days via carry_over_renames. Backfill #9 (classification)
  started 05:35 IST.
- **Delivery %**: NSE MTO file exists for every trading day 2007 -> today (checked 2007, 2010, 2015, 2019-2022, 2026;
  out ~16:50 IST). Traded qty = bhavcopy volume; TITAN 03-Nov 47.79 % = NSE quote. The reference export's delivery column
  is the PREVIOUS day's file (02-Nov: 100 % equal). New store `data/stocks/delivery/<ID>/` (date, deliv_qty raw,
  deliv_pct), job `backfill.py --job delivery` (known trading days only, checkpoint nse_delivery, a day not published yet
  stops without moving the checkpoint), daily step 1b (only when the checkpoint exists; 17:20 run brings the day),
  validation `check_delivery`, workflow option "delivery". Local 4-day trial: 2,415 stocks (BE/BZ have no MTO rows).
- **Corporate actions of the SME board were missing**: NSE's API was asked with index=equities only; stocks that started
  on NSE's SME board (series SM/ST in our history) lost their bonuses/splits of that time (THEJO 2:1 bonus 12-Oct-2021
  showed as a -66 % crash). load_raw now asks index=sme too (cache ca_nse_sme_YYYY.json). 84 stocks gain actions; THEJO
  adjusted 1225 -> 1233 on that day. Applied by the next daily rebuild after the push.
- `data/meta/share_factors.csv` (rebuild writes it): applied splits / bonuses / consolidations / rights with the day the
  price changed; `share_factors.eps_factor()` (RELIANCE Sep-2024 EPS x 0.5 for the 28-Oct-2024 bonus). 1,523 lines.
- `scripts/quality_report.py` -> `reports/data_quality.md` / .csv: 2,626 stocks, 6.5 M rows, 0 errors; data-check
  warnings by type; one-day moves 20-30 % = 2,809 (circuit-size, normal); > 30 % without action = 491, sorted into
  long gap 47, re-based 3 (NSE changed the base price: KAUSHALYA 1:100 consolidation, SHEKHAWATI, CCAVENUE),
  split-like 95 (many are the SME actions above -> fixed by the push), reverted 93 (bad ticks), unexplained 253.
  Report made from local data BEFORE the SME fix: run it again after the next daily run.
- Field registry: current_phase 2, fields deliv_qty / deliv_pct (file delivery). 132 Python + 11 JS tests green.
- NEXT: Viraj commits + pushes; after Backfill #9 ends: Backfill history -> job delivery (~1.5-2 h); then quality report
  again on the PC, and "continue" for S3 (groups: sector / industry / theme indices, themes.csv).
- 04-Nov 17:50 IST: data still 03-Nov although NSE published 04-Nov at 16:38 (bhavcopy) / 16:48 (MTO): GitHub had not
  started the 16:40 / 17:20 schedules yet (Daily #7 was a schedule started ~7 h late, at 15:13). Fix agreed: cron-job.org
  triggers workflow_dispatch at 16:45 + 17:05 IST. Part 1 done (Viraj's fine-grained token, Actions read+write, this repo
  only). Part 2 (cron-job.org jobs) AFTER all scanner phases, Viraj's wish: steps in docs/MANUAL_CHECKLIST.md; remind him.

### 2026-11-04 (evening): Scanner Phase S3 - groups (done, waiting for Viraj's theme review)
- Daily update #8 (manual) brought 04-Nov (scheduled 16:40 / 17:20 runs had not started). Backfill #10 (delivery)
  started 18:17 IST.
- Coverage: NSE gives sector + industry for 2,601 stocks. 18 had nothing (mostly BE series) and 9 got NSE's OLD taxonomy
  in capitals ("AUTOMOBILE", "TEXTILES"). BSE's ComHeadernew API (PC only) has the same 4 levels (Sector = macro,
  IndustryNew = sector, IGroup = industry, ISubGroup = basic industry): 24 filled from BSE, 3 not on BSE (ABMINTLLTD,
  PANACHE, SUPREMEENG) are marked guesses -> `config/classification_overrides.csv`; `classification.load()` applies them
  only where NSE has no proper answer (used by stock master, snapshot, groups, themes). Left: EVONILE, MKJEWELS (listed
  this week, NSE asked again daily).
- Group levels: sector (NSE, 22) and industry = NSE BASIC industry (189 incl. 69 small < 5 stocks); the reference's
  "industry" is NSE's basic industry. Names grouped by a slug (BSE writes "Aluminium, Copper & Zinc", NSE without comma).
- `swingdash/groups.py` -> `data/groups/<level>/<id>/` (date, group_index, group_ret_mean, group_ret_median,
  group_members) + `data/meta/groups.csv`. Members count on a day only if liquid the day before (median 30-session
  turnover >= 1 Cr, close >= 5, from raw data): with all stocks the IT sector rose 42x since 2007 (bid-ask bounce of
  illiquid stocks + survivorship), with liquid ones 9.2x (NIFTY IT, cap-weighted: 5.8x). Moves beyond +-50 % left out;
  < 3 counted members = no value. Local build 2m50s, 16 MB. 51 small industries never reach 3 liquid members (no series).
- Themes: `config/theme_rules.yaml` (31 themes; sources: NSE thematic index membership from each stock's quote, NSE basic
  industries, hand lists marked "manual - check") -> daily `data/meta/themes.csv` (1,317 memberships) and
  `reports/themes_review.md` for Viraj (only 23 hand-picked). Theme lists of the reference are NOT copied.
- Daily step 4c (themes + groups), backfill workflow runs `scripts/build_groups.py`. Registry current_phase 3 (group_*).
  138 Python tests green.
- NEXT: Viraj reviews reports/themes_review.md (edit config/theme_rules.yaml), commits + pushes; check Backfill #10
  (delivery); quality report again; then S4 (indicator engine + field registry for all price fields).
- Viraj approved the theme list (reports/themes_review.md) as it is ("Themes OK chhe").

### 2026-11-04 (night): Scanner Phase S4 - indicator engine (done, waiting for Viraj's OK)
- `swingdash/engine.py`: every field for every trading day of a stock (adjusted prices): price/day, returns 1W-1Y + YTD,
  SMA 10/20/50/150/200, EMA 10/20/21/50/200 + distances, 20D / 52W / all-time highs-lows, days since 52W high, volume
  (avg 20/50, RVol, HVE/HVY/HVQ, lowest of year/quarter, pocket pivot, dry-up, high-volume day), turnover, delivery %,
  RSI, MACD, MFI, ATR, ADR %, Bollinger, Supertrend, Swing bands (T3), Relative extension, Trend intensity, RS lines vs
  4 NSE indices, RS at 52W high, RS new high before price, Mansfield RS, beta, stage. 0.2 s per stock (TITAN 4,896 days).
- `swingdash/screen.py`: all stocks in 4 processes + per-day cross-stock fields (RS rating, RS rating 1W/1M/3M, changes)
  -> `data/snapshot/screen.json` (2,623 stocks x 112 fields, 2.3 MB). NOT in git (changes completely daily, ~100 MB a
  year): deploy-site.yml builds it before the site and copies it to _site/data/. PC: ~5-7 min (OneDrive disk).
- Calibration vs the reference export of 03-Nov (`--as-of 2026-11-03`), details in docs/calibration.md: 98-100 % for
  RSI, ADR, RVol, SMAs/EMAs, returns, gap, 20D high/low. Definitions changed after the check: 1Y = 251 sessions,
  avg vol 50 incl. today, days since 52W high = calendar days, RS line benchmark = Nifty Smallcap 250 (their default),
  RS rating ranked among ALL stocks (77 % within 3 points, corr 0.98). Stage: their Weinstein-like chip follows
  SMA200 + SMA50 (above both = Uptrend, above 200 below 50 = Topping, below 200 = Downtrend): 90.5 % equal; our Basing
  (flat SMA200, back above SMA50), 2A and 4A are our own refinements (config/stage.yaml). Their ATH uses ~5 years of
  history; ours (2007 ->) is kept.
- Registry: 74 new fields (144 total, current_phase 4); `scripts/make_formulas_doc.py` -> docs/formulas.md (a test fails
  when it is stale). Golden tests on RELIANCE / TITAN / TRENT (tests/fixtures/golden_*.csv, last 800 adjusted days):
  SMA, EMA, WMA, RSI, MACD, ATR, MFI, Bollinger, T3 equal to TA-Lib to 6 decimals; Supertrend = TradingView's logic.
  TA-Lib 0.6.8 in requirements-dev.txt (tests only). 150 Python tests green.
- NEXT: Viraj commits + pushes; check Backfill #10 (delivery) and the first website build with screen.json; then S5
  (results table with column settings + chart with the indicator menu).

### 2026-11-04 (night): Scanner Phase S5 - results table + chart (built, waiting for Viraj's look)
- Deploy website #4 (after the S4 push) published screen.json: 2,625 stocks x 113 fields, data 04-Nov.
- New "Stocks" page (#/stocks, site/app.js): every stock with the screen fields; column settings (7 groups, ~70 columns
  from SD.COLUMN_GROUPS; default = 1D %, Volume, Turnover, 1W %, RVol, Market cap, RS rating; saved in localStorage),
  sort menu (A-Z, Price, Price x Volume, Market cap, RS rating, From 52W high, 1D %) + column titles, universe All /
  Liquid / Nifty 500 / F&O, sector, search, multi-select, Copy (NSE:SYMBOL list), CSV; >= 1100 px: table + chart side by
  side, arrow keys move. Phones: a tap opens the stock page (#/i/s/ID) with the same chart + key stats.
- New chart (site/chart.js, Lightweight Charts 5.0.8 with panes): D / W, candles / bars, 4 styles, header (OHLC, change,
  1M / 3M, volume, Avg 20D, RVol; chips Float mcap, RS, Stage, From 52W high), indicator menu with settings dialogs:
  moving averages (presets Minervini / Weinstein / Qullamaggie / O'Neil / mine, custom lines), Supertrend, Bollinger,
  Swing bands, Watermark, Volume (high-volume colours, pocket pivots, dry-ups, HVE/HVY/HVQ/Y/Q labels), RS line (4
  benchmarks, above / below, new-high dots), Mansfield RS, Stage pane, RSI, MACD, MFI, Relative extension, ATR, ADR %,
  Trend intensity; markers: corporate actions, 52W high/low, swing % moves, circuit band, inside bars; drawings (trend
  line, text, measure, colour, delete; saved per stock + timeframe in localStorage).
- site/ind.js = the engine's formulas in JS; tests/js/ind.test.js checks 27 series on RELIANCE / TITAN / TRENT against
  the Python engine (tests/js/fixtures/expected_*.json from tests/js/make_expected.py): equal. Table columns must be
  registered screen fields (test). days_listed registered (phase 5, computed in the browser); deliv_pct also a screen
  field. 151 Python + 18 JS tests green.
- Browser check (local build, 1440x900 + phone 375x812): table, sort menu, search, split chart, indicator menu, 6 panes,
  weekly, drawings OK. Fixed while checking: sort menu always open (CSS [hidden]), pane sizes (stretch factors instead of
  setHeight), drawings offset (pane position from its element, wait until painted), chart height on phones with many
  panes, volume axis in L / Cr.
- NEXT: Viraj commits + pushes and looks at the live Stocks page; then S6 (scanner engine + formula editor + price
  scanners, calibrated to the reference counts).

### 2026-11-05: Scanner Phase S6 - scanner engine, formula editor, price scanners (built, waiting for Viraj's look)
- Engine fields for scanners: SMA 20 change 1W, SMA 50 / 150 / 200 and EMA 50 change 1M, high_50d_prev, close_pos,
  range_20d_pct, rs_high_days, days_listed and days_since_ipo in the screen.
- NSE IPO list (api/public-past-issues, main board only, symbols renamed to today's) -> data/meta/ipos.csv -> stock master
  ipo_date / ipo_price (daily step 4b + audit script). EQUITY_L's listing date counts SME migrations (437 "new" stocks).
- `config/scanners.json`: All Stocks + 12 scanners (Trend Template, Stage 2 Breakout, 4% Breakout, 20-SMA Pullback, High
  Volume, 1M / 3M Gainers, Outperformers, Doublers, New Listing, 50-EMA Pullback, New RS before Price). Calibrated with
  a screen built as of 30-Oct against the reference's counts: 4 exact (4%, 20-SMA, 1M, Outperformers), the rest within
  2-8 % (docs/calibration.md). Doublers' rule is our choice (the app states none).
- `swingdash/scanners.py` (evaluate / describe / check: unknown field, later phase, not in screen, bad operator, folder) and
  `site/scan.js` give identical stocks and identical plain-English text on 400 random rows (tests/js/scan.test.js).
- Website: "Scanners" tab replaces the old Screener tab (#/screener still works). #/scanners/<id>: scanner list with live
  counts, description + rule in plain English, same table / chart as Stocks; Formula editor: ALL / ANY, OR groups,
  field vs number or field x multiple, between, is, one of; Test (live count), Save, Reset to default, Duplicate as My
  Scan, Delete, Export / Import (localStorage "sd-scans"). #/fields lists all 157 fields with formulas (data/fields.json
  built from config/fields.yaml). Browser-checked on desktop + phone; fixed: add / remove in the editor.
- 152 Python + 20 JS tests green. Live counts on 04-Nov: Trend Template 251, Stage 2 Breakout 39, 4% Breakout 117, ...
- NEXT: Viraj commits + pushes and looks at Scanners; then S7 (patterns: bases, pivots, VCP, tight range, flag, IPO base,
  big reversal, shakeout, recent breakout + chart overlays).

### 2026-11-05: Scanner Phase S7 - patterns (built, waiting for Viraj's look)
- Reference's resistance level (export 03-Nov, 231 stocks): always a past day's high, median 39 sessions back; 74 % are the
  highest high since. Our pivot rule (`swingdash/patterns.py`, config/patterns.yaml): most recent swing high >= 15
  sessions old, >= the 20 highs before it, still the highest since, above the close -> exact match for 52 %.
- Per day (last 300 sessions): pivot / age / distance / base depth / base low / gain before; long-base pivot (85-390
  sessions); breakouts (days since, level, run, RVol, base length); tight closes, inside day, range %, new 20-day low,
  lowest from SMA 50 over 5 days, pivot vs 52W high. Latest day: VCP contractions (zigzag of closes, 5 % turns inside the
  base) and flag (pole, depth, days). 28 new registry fields (current_phase 7).
- 10 pattern scanners calibrated on 30-Oct (docs/calibration.md): exact or within 1-2 for Recent Breakout 7/7, Near Pivot
  23/22, VCP 2/2, Tight Range 8/8, Flag 1/0, IPO Base 2/1, Big Reversal 15/16, Shakeout 40/41; Daily Base 143/153,
  Weekly Base 75/70.
- Chart: settings "Setups" -> Pivot / breakout line (blue, + dotted base low), Base pullbacks (orange -x% arrows),
  Tight areas (green band); site/ind.js pivots + contractions equal Python on the golden stocks (tests/js/ind.test.js).
  Table: Pivot Price, Distance from Pivot %, Base length, Base depth, Days since breakout, Run since breakout, IPO
  date / days / price. tests/test_scan_phase7.py.
- NEXT: Viraj commits + pushes; then S8 (fundamentals: NSE XBRL results, shareholding, ratios, Financials tab).
- Browser check (local build): VCP scanner -> HAL chart shows Pivot 5,149.90 (-1.37 %), base low, two pullback arrows.
  Found while checking: a browser can keep an old ind.js next to a new chart.js. Fix: index.html loads every file with
  ?v=<build> (site_build replaces __BUILD__) and the service worker matches files exactly (no ignoreSearch).
- GitHub's daily run already wrote data/meta/ipos.csv and the ipo columns of stocks.csv (S6 code), so New Listing works.

### 2026-11-05: Scanner Phase S8 - fundamentals (built, waiting for Viraj's look)
- Source: only NSE's official XBRL filings (files on nsearchives, fast). screener.in NOT used: its terms forbid copying /
  mirroring, no public API. Lists: corporates-financial-results Quarterly + Annual (2017-2024), integrated-filing-results
  (2025 ->: results + balance sheet + cash flow), corporate-share-holdings-master (shareholding XBRL), event-calendar.
- `swingdash/fundamentals.py`: XBRL reader (company totals only; old files with undefined OneD/FourD contexts or only an
  end date handled), 4 formats (company, bank, NBFC, insurance), one JSON per stock data/fundamentals/<SYMBOL>.json
  (C / S = consolidated / standalone: q, y, bs, cf; shp; files read). Values Rs crore. NSE list labels can be wrong
  (TITAN "31-Mar-2017" file = FY2018): periods come from inside the file. Bank files 2018-2023 repeat the quarter's EPS
  in the year column -> fix_eps (only that exact case). EPS adjusted for splits / bonuses AFTER the results day
  (Ind AS 33: a bonus before approval is already in the reported EPS).
- Jobs: Backfill history -> job fundamentals (~40 s per stock, Nifty 500 first, checkpoint data/meta/checkpoints/
  fundamentals.json, refresh after 120 days) + scripts/fundamentals_report.py (coverage notice + data/meta/
  fundamentals_coverage.json). Daily step 4d (after the first backfill): new filings of all companies since the last
  run, new shareholding patterns, data/meta/results_calendar.csv.
- 56 registry fields (current_phase 8): P/E, P/B, PEG, EPS TTM, ROE (last FY, 3/5/10Y avg), ROCE, D/E, dividend yield,
  margins, YoY / QoQ / TTM growth, 3/5/10Y CAGR, EPS-up quarters, holdings + 1Q / 1Y changes, shareholders, last / next
  results. screen.py adds them (as_of: only what was announced by that day).
- Website: stock page "Chart | Financials" toggle (key ratios, rule-based Pros & Cons, quarterly results 12, P&L + TTM,
  compounded growth incl. price CAGR, balance sheet, cash flows, shareholding; Consolidated / Standalone), earnings strip
  under the chart, purple E markers on results days (chart settings), 3 column groups (Fundamentals, Earnings Growth,
  Ownership & Results), 4 scanners in a "Fundamentals" folder. site/fin.js + tests/js/fin.test.js.
- Known: history starts ~FY2017 (10Y CAGR / ROE 10Y mostly empty until more years exist); ICICI Bank's ADR holder moved
  category in Mar-2026 (its 1Y FII change looks big); insurers: P&L lines only.
- NEXT: Viraj commits + pushes, runs Backfill history -> fundamentals (2 runs for Nifty 500, then ~6 more for all),
  checks 3-4 companies by hand; then S9.

### 2026-11-05: S8 follow-up - first fundamentals run, nightly schedule
- Backfill history -> fundamentals (07:43-13:14 IST): Nifty 500 500/500, 570 of 2,633 stocks; 493 with 8+ quarters,
  423 with 5+ years, 548 balance sheet, 556 shareholding. No results: REITs (other format) and BSE-listed companies that
  only trade on NSE (MCX, ABBOTINDIA ...): NSE has no filings for them.
- Daily step 4d checked on a copy of GitHub's data: 9 new files in 70 s. Fix: a filing whose XBRL file NSE has not put
  online yet no longer blocks the "since" marker; the marker waits at the oldest missing file (test added).
- Viraj: run the rest every night at 23:40 IST until done -> .github/workflows/fundamentals-nightly.yml
  (backfill.py --job fundamentals --new-only, 300 min, ~450 stocks per night, ~5 nights). fundamentals_report.py
  rewrites the coverage file only when a number changes (no empty nightly commits). Backfill no longer needs an n500
  column (test).
- NEXT: Viraj commits + pushes (the schedule starts with the push); then S9.

### 2026-11-05: Scanner Phase S9 - earnings scanners, groups page, theme status (built, waiting for Viraj's look)
- `swingdash/earnings.py`: results-day reaction per stock (reaction session = results day or the next, the bigger gap;
  gap, change, volume x, close position, held, gap filled, run since). `fundamentals.quarter_trends`: accelerating
  sales / EPS growth, rising net margin, QoQ profit / sales streaks, year-ago numbers.
- 6 Earnings scanners (folder "Earnings"); counts and rules in docs/calibration.md S9 (partial: fundamentals for 570
  stocks until the nightly run finishes).
- `swingdash/group_rank.py` + config/group_rank.yaml: per sector / industry / theme median + average returns 1D-YTD,
  20-day highs / lows, % above 50 SMA, rank (strength vs equal-weight market, open RRG approximation calibrated on the
  reference: rank correlation 0.88), rank change, tag Leading / Weakening / Lagging / Improving, tail for a later RRG chart.
  Written to data/snapshot/group_ranks.json with screen.json (git-ignored, deploy builds it).
- Stock fields: sector / industry rank, tag, rank 1M (= rank of the group's AVERAGE 1M return, exact match with the
  reference), 1W group return, vs sector / industry 1M, themes, top theme, theme status (= tag of the best-ranked theme).
- Website: "Groups" tab replaces "Sectors" (#/groups/<level>/<name>; tabs, periods, search, small groups, sort; sector
  -> industries + all stocks with 20H / 20L badges), Theme chip "T <tag>" on the chart (settings), column group
  "Groups & Results Day". 33 fields registered (phase 9). tests/test_scan_phase9.py.
- NEXT: Viraj commits + pushes; recount the earnings scanners after the nightly fundamentals run (~10-Nov); S10 = market
  breadth (ask him first).