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

### 2026-11-06: Scanner Phase S10 - market breadth (built, waiting for Viraj's look)
- `swingdash/breadth.py` + config/breadth.yaml: per stock and day flags (above 20/50/200 SMA, advance / decline, new
  52-week and 20-day highs / lows, 4 % movers, breakout = close above the 50-session high), per universe (all / liquid
  that day) and day counts for 260 sessions, stage mix (64+ sessions), breakouts held / failed after 5 sessions, and the
  six-line market read (our own rules, each shown). Written to data/snapshot/breadth.json with screen.json.
- screen.py keeps only the last 420 sessions per stock in memory (cross fields, groups and breadth need no more):
  30-Oct build 745 s instead of 958 s.
- Website: "Breadth" tab (#/breadth): universe Liquid / All, range 1M / 3M / 1Y, market read, stage bar with day change,
  six charts with the grey Nifty 500 line (participation with 20 / 80 bands, A/D ratio, large-mid-small, net highs-lows
  52W / 20D, 4 % movers, breakouts held vs failed); "Major Indices" tab (broad market + sectoral NSE indices + Sensex).
- Calibration 30-Oct (docs/calibration.md S10): participation, A/D, highs-lows, 4 % movers within a few stocks of the
  reference; 4 of 6 read words equal. tests/test_scan_phase10.py (found: the breakout verdict must use the last 5 days
  that can already be judged).
- NEXT: Viraj commits + pushes; S11 (optional: intraday, news markers, company descriptions) only if he wants; S12
  hardening. Reminder after the last phase: cron-job.org Part 2.

### 2026-11-06: Scanner Phase S12 - hardening (S11 skipped by Viraj)
- Runtimes on GitHub: daily update ~27 min (update 19, data check 2.5, website 5.5); website deploy ~7 min; fundamentals
  nightly ~5.5 h until all stocks are read. GitHub started scheduled runs 5-7 hours late on 05-Nov (16:40 IST runs began
  after midnight) -> cron-job.org part 2 is the fix (docs/MANUAL_CHECKLIST.md).
- Data check (scripts/validate_data.py) and monthly integrity (swingdash/integrity.py) now also check every
  data/fundamentals/*.json (readable, right symbol, no NaN; integrity shows fundamentals coverage). fundamentals.save
  writes null instead of NaN (browsers cannot read NaN).
- Daily warning "new stocks need history" fired every day for ~20 fresh IPOs: now only stocks whose saved history starts
  > 30 days after their listing, listed > 60 days ago and not inactive (today: MELSTAR only - resumed trading after a long
  suspension).
- Restore tested from Release data-2026-11-01 into a temp folder: download 19 s, checksum OK, 3,004 files, data check
  0 errors. Next automatic backup Saturday 07-Nov (all stocks: much bigger zip, well below GitHub's 2 GB limit).
- Final README: every page, automatic jobs incl. fundamentals nightly, Gujarati quick-start with Add-to-Home-screen steps.
  tests/test_phase12.py.
- ALL scanner-plan phases done. NEXT: Viraj commits + pushes; then cron-job.org part 2 (reminder); recount the earnings
  scanners once every stock has fundamentals (~10-Nov).
### 2026-11-06: UI redesign N0 start - the "V" logo
- Viraj chose the green bull-horn V (from 6 original designs; an exact copy of another channel's logo was declined:
  trademark risk on a public site). Colours #4ade80 (left half) / #16a34a (right half), NO background: only the V
  sits on the dashboard theme (light and dark checked).
- site/icons/logo.svg (header + browser tab), scripts/make_icons.py redraws the PNGs from the same shapes
  (favicon transparent; phone home-screen icons need a filled square -> dark theme colour #0f172a).
- NEXT: rest of phase N0 (name, colours, font, left rail, top bar, cards, status bar, animations).

### 2026-11-06: UI redesign N0 - app frame
- Viraj keeps the name "Swing Trading Dashboard" for now (change later).
- New look (our own, not the reference app's): emerald accent #059669 (dark theme #34d399), soft grey-green page, dark
  rail #0c1a16 with the green V logo, Inter font (Google Fonts, falls back to the system font offline), own line icons.
- Frame: left rail with the 6 pages + Formulas / Theme / About at the bottom (tooltips on hover); on phones it becomes a
  bottom bar. Top bar: "Find a stock or index" search (`/` focuses, arrows + Enter, best match = exact symbol, then
  symbol start, name start, contains; ties by traded value) and a data-date pill. Pages sit in one rounded card.
  Fixed status bar at the bottom (data date, update time, data check; disclaimer + About dialog). Old footer -> About.
- Loading skeletons (shimmer) instead of "Loading..." text; small animations (page rise, menus, dialogs, rail hover);
  everything off with the system "reduce motion" setting. SDChart now exports its modal() helper.
- Checked in the preview: light + dark, phone 375 px (no sideways scroll, 7 bottom items), search, About, scanners split.
  Tests 172 Python + 24 JS green.
- NEXT: N1 scanner workspace.

### 2026-11-06: UI redesign N1 - scanner workspace (Stocks + Scanners pages)
- Top row: + New scan (name -> empty My Scan -> formula editor), scanner picker (search box, folders that open / close,
  pin icon, i = description on hover, live count of each scan, computed once per data day), ƒ formula, pinned scanners as
  chips ("Pin a scanner from the menu to show it here"), list / grid switch.
- Wide screens (>= 1100 px): results list on the left + chart on the right, both fill the screen down to the status bar.
  Drag the divider: a wider list shows more of your columns (about 86 px each); double-click = back to 300 px. Saved in
  this browser (sd-ws). Results header: search + universe / sector filters (toggle), sort menu, columns.
- Columns: the old dialog is now a drawer from the right; changes show at once.
- Grid: 2 / 3 / 4 cards per row (phones 1, tablets max 2); card = symbol, 1D %, price, M / F market cap, RS, mini chart
  (last ~180 days, candles + 20 / 50-day averages, drawn when scrolled into view), Vol / Avg 20D / RVol. Order: scan order,
  A-Z, market cap, price, 1D %, RS, traded value. Click = list view with that stock's chart.
- Status bar on these pages: Copy (NSE:SYMBOL list), CSV, "n of N selected", "N stocks · M scanned".
- Phones: list only (all columns, scroll sideways), tap = stock page, as before.
- Checked in the preview at 1440 px, 746 px and 375 px. Tests 172 Python + 24 JS green.
- NEXT: N2 chart.

### 2026-11-06: UI redesign N2 - chart
- Toolbar: D / W, candle / bar icons, MA, "ƒx Indicators", header chips on the right (float, RS, stage, theme, from high),
  ⚙. Header: symbol, O H L C, change (₹ and %), 1M / 3M on the right, company line, "Results due <date>" (next_result).
- Legend row: each indicator with 👁 hide (stays in the legend, faded), ⚙ settings (opens the popup on it), × remove.
- Indicator popup: list by group on the left (✓ = on), right side name + description + live preview (same stock, only that
  indicator, last 120 bars) + settings; colours from a 21-colour grid (+ any colour); Add to chart / Update, Remove, Reset.
  Oscillators got a colour setting.
- Settings: drawer from the right, tabs Markers (setups, events, price levels with small samples) and Display (chart style
  cards, grid lines, earnings table, company line, results date, chip pills); every change shows at once; Reset / Done.
- Panes can be resized by dragging the line between them (Lightweight Charts 5 enableResize). Volume pane shows
  "Vol · Avg 20D · RVol" of the bar under the mouse.
- Drawing bar: round ✏️ button at the chart's top-left opens a vertical bar (cursor, trend line, horizontal line - new,
  text, measure, colour, delete; double-click delete = clear all).
- Patterns (SVG layer, clipped to the price pane): blue cup curve under the current base; when the base has 2+
  contractions a smooth wave under the base with a blue pill per pullback depth (replaces the old orange arrows).
  C = corporate action and E = results now sit as round badges under the bars.
- Earnings table under the chart (stocks with fundamentals): last 5 quarters "Q2 FY27" style, EPS ₹ and Sales Cr with
  YoY / QoQ %, latest quarter highlighted; opens / closes with a slide.
- "»" button brings the chart back to the latest bar after scrolling into the past.
- Checked in the preview at 1440 px (light + dark) and 375 px. Tests 172 Python + 24 JS green.
- NEXT: N3 custom scan window.

### 2026-11-07: UI redesign N3 - custom scan window
- "+ New scan" opens an empty window, the sliders button next to the scanner picker opens the current custom scan
  (or the last draft). Header: name, Load saved, Save scan, close; tabs Stock universe / Technicals / Strength & volume /
  Earnings / Fundamentals with a badge of active filters; "Find a filter" search across all tabs (`/` key).
- 80 filters, all on existing screen fields (config/fields.yaml): universe (liquid, Nifty 500, F&O, stage, circuit
  bands, listing age, sector / basic industry / theme multi-select, market cap, price, free float, float mcap), technicals
  (MA order presets, price above / below chosen MAs, 200 SMA rising, distances, 52W / ATH, pivot, RSI, return by period,
  daily change, gap, Supertrend, day range, ADR, tight closes, base depth, VCP, inside day), strength & volume (RS rating
  and change, RS line highs, Mansfield, sector / industry rank and status, theme status, rupee volume, RVol, delivery %,
  HVE / HVY / HVQ, pocket pivot, dry-up), earnings (YoY / QoQ growth, streaks, acceleration, results in last / next
  N days, results gap-up, big results move, move held), fundamentals (sales / profit CAGR, TTM growth, ROE, ROCE, OPM,
  D/E, P/E, PEG, P/B, dividend yield, promoter / FII holding and change). Filters whose field is not in fields.json are hidden.
- Changing a value ticks the filter; the footer counts at once ("N stocks pass this scan · K filters active").
- Run scan = scan "Custom scan (last run)" in My Scans; Save scan = a named My Scan. Both keep the filter state
  ("builder") so they open again in the window; the rule is the normal scanner rule (works with pins, grid, CSV, formula).
- Checked in the preview (1440 px + 375 px): count 168 = results 168 for stage 2 + liquid + above 50/200 SMA + RSI 55-70.
  Tests 172 Python + 24 JS green.
- NEXT: N4 stock side panel + Financials page + Peers.

### 2026-11-07: UI redesign N4 - stock panel, peers, financials page
- New stockPanel() in site/app.js, shown to the right of the chart on Stocks / Scanners (wide screens, ▯ button in the
  top row turns it on / off, saved in sd-ws) and on the stock page (beside the chart; under it on phones). The old
  stats grid and earnings line on the stock page are replaced by the panel.
- Head: name, NSE:SYMBOL, ⤢ (full Financials page), ★ watchlist, price, 1D %, 1M / 3M.
- Accordion (open state saved): Overview (sector / industry / theme tags, next results date, 12 key ratios, pros & cons
  from SDF.prosCons), Financials (Quarterly / Annual / Balance / Cash flow; each line = mini bars of 12 periods + latest
  + YoY / QoQ; CAGR table; "x % of the profit came in as cash" over 5 years), Peers (same basic industry by market cap:
  "#n of N by size · P/E vs median", top 7 with this stock highlighted, click = open it, "Compare all N peers" = Stocks page
  filtered by the industry, sorted by market cap), Shareholding (colour bar + 12-quarter mini bars, QoQ and 1Y change in
  points). data/f/<id>.json is fetched once per stock (cache).
- Financials page: each table in a card with "Consolidated figures in ₹ crore · View standalone" (switches the basis),
  light-green header row, negative numbers red, pros / cons boxes tinted.
- Checked in the preview at 1500 px and 375 px (the local snapshot is from 04-Nov, so some ratios show –; live data has
  them). Tests 172 Python + 24 JS green.
- NEXT: N5 Warm-up home page.

### 2026-11-07: UI redesign N5 - warm-up home page + FII / DII data
- New home page `#/` (rail: Home first; the all-instruments table moved to `#/market`). Sections:
  Market condition (market read from breadth.json - 3 lines + "show more"; participation % above 20 / 50 / 200-day
  average with the label from config/breadth.yaml, grey Nifty 500 scaled, pink zone > 80 %; stage 2 vs stage 4 lines;
  FII / DII net bars + latest + period net; net 20-day highs - lows bars), Indices (Nifty 50 / 500, Midcap 150,
  Smallcap 250, Microcap 250, Bank, India VIX: price, 1D, 3-month sparkline, % from 52W high, above / below 50 EMA and
  200 SMA), Today's setups (Near Pivot, VCP, Flag, Tight Range scanners, liquid, RS 70+, nearest the pivot first, 15;
  Copy to TradingView, Open in Scanner), Where the money is (themes by 1-week average return, top 5 / bottom 3),
  Coming up (results in the next 10 days by day, biggest first; weekly / monthly Nifty expiry = Tuesday / last Tuesday),
  Your watchlist plan (good / weak / quiet day with signal chips: pocket pivot, big volume, RS line high, breakout,
  near pivot, dry-up, new 20-day low). Charts are light SVG (no chart library on the home page).
- FII / DII: NSE's API gives only the latest session -> swingdash/market_flows.py (parse, merge, update, site_payload),
  daily step 4e, site_build writes data/fii_dii.json; tests/test_n5_flows.py. History starts with the next daily run.
- Not possible: USD/INR and crude (no free official source in our pipeline), CPI dates, news, IPO listings on the home page.
- Checked in the preview at 1500 px and 375 px. Tests 176 Python + 24 JS green.
- NEXT: N6 earnings calendar page.

### 2026-11-08: UI redesign N6 - earnings calendar
- New page `#/earnings` (rail item "Earnings"; `#/earnings/<yyyy-mm-dd>` = that week). Columns Mon-Sat (Saturday also
  shows Sunday): stocks whose latest results (last_result, quarter = the season's quarter) came that day with our grade,
  then stocks due that day (next_result). Header: "<n> results · EPS YoY ▲up ▼down" and "<n> due"; today's column tinted;
  "Q2 FY27 season n / N stocks announced" (stocks whose latest quarter is the newest quarter end).
- Hover card: name, grade, sales / profit / EPS YoY, results-day move (when within 10 sessions), RS, market cap, industry.
- Recent earnings (right): last 14 days, newest first, grouped by day; card = price, market cap, Sales / Op. profit /
  Net profit / EPS for the latest, previous and year-ago quarter with YoY (data/f via the panel's cache), 12 at a time.
- Filters (saved): market cap / EPS / sales / profit growth ranges, grade, signals - they apply to the calendar and the
  cards. Rule text in docs/site_rules.md; SD.earnGrade tested in tests/js/earn.test.js.
- NEXT: N7 heatmap.

### 2026-11-08: UI redesign N7 - heatmap
- Index members: swingdash/index_members.py (9 NSE index CSVs), daily step 4f, site_build -> data/index_members.json;
  tests/test_n7_members.py. First file comes with the next daily run (Monday).
- Page `#/heatmap` (rail "Heatmap"): Index / Area / Colour selects (saved), treemap by sector with a header per sector
  (click = that sector's basic industries, "‹ All sectors" back), tiles show symbol + value when big enough, hover card
  (price, 1D / 1W / 1M, RS, market cap, turnover, industry), colour scale under the map, redraws on resize.
- Phone: the bottom bar now scrolls sideways (10 pages); the open page's icon scrolls into view.
- Checked in the preview at 1500 px and 375 px with the 06-Nov data. Tests 179 Python + 29 JS green.
- NEXT: N8 groups in 3 columns.

### 2026-11-08: UI redesign N8 - groups in columns
- renderGroups rewritten: `#/groups/<level>[/<group>[/<industry>]]`. Wide screens: one bordered strip of columns -
  Sector level: Sectors | Industries of the chosen sector (+ "All <sector> stocks") | Stocks | Chart; Industry / Theme
  level: list | Stocks | Chart. The top-ranked group is chosen when none is given. Clicking a stock opens its chart in a
  last column and folds the group columns to thin vertical labels (‹ / › or a click on the label opens them again).
- Group rows: name + tag dot, rank with the rank change as a small superscript, median return of the chosen period,
  20D highs / lows (sector, industry, theme) or "> 50 SMA" + stock count (industries of a sector); hover = strength,
  momentum, % above 50 SMA, members, tag. Stock list sortable (symbol, LTP, period %, from 52W high, RS), 20H / 20L badges.
- Period 1D / 1W / 1M / 3M / 1Y / YTD (saved), search, "Show small groups". Phones: one level at a time with a back link.
- Fixed a class clash (`.grow` of the Financials page) by naming the column classes gc-grow / gc-grow2.
- Checked in the preview at 1500 px and 375 px. Tests 179 Python + 29 JS green.
- NEXT: N9 RRG.

### 2026-11-08: UI redesign N9 - RRG
- group_rank.py: `tails` per ranked group = {mkt | NIFTY_50 | NIFTY_500: {s: {d, w}, m: {d, w}}} (20 daily points, 10
  weekly points 5 sessions apart, 1 decimal); rrg() takes an index as benchmark; screen.py reads config `rrg_benchmarks`
  from data/indices/nse and adds `tail_days` (dates) to group_ranks.json. tests/test_n9_rrg.py.
- Page `#/rrg` (rail "RRG"): quadrant counts, Tail 5 / 10 / 20, Sectors / Industries / Themes (+ Top 20 / All), Daily /
  Weekly, benchmark select; SVG chart with tinted quadrants, fading smoothed tails, head dot + label; hover = only that
  path + start date + card; click = pin (saved per level); side list by quadrant with heading arrows (hover / click too).
  Works with old group_ranks.json too (10 daily points, market only).
- Checked in the preview (1500 px) with the rebuilt 06-Nov snapshot. Tests 181 Python + 29 JS green.
- NEXT: N10 breadth restyle + major indices grid.

### 2026-11-08: UI redesign N10 - breadth restyle + major indices grid
- renderBreadth rewritten with light SVG charts (no chart library): left panel = market read + stage analysis (bar, %,
  1D change); right = "Market internals" with universe (liquid / all) and range (1M / 3M / 1Y), six charts each with its
  own toggle, value, word, better / worse and date; moving the mouse over any chart moves a crosshair and the values in
  all six. Grey line = Nifty 500 in every chart. Breakouts header shows the latest judged day (the last 5 are not judged yet).
- renderMajorIndices: grid of Lightweight Charts cards (lazy, IntersectionObserver): Broad (13 NSE broad indices + VIX)
  or Sector (21), candles / bars, daily / weekly, EMA 20 / 50, sort by usual order / 1D / 1W / name, 1-3 per row; click
  = index page. NSE index files carry no volume, so no volume pane.
- Note: SD.ema returns a trimmed array; charts use SDI.ema (aligned with nulls).
- Checked in the preview at 1500 px and 375 px. Tests 181 Python + 29 JS green.
- NEXT: N11 leaders.

### 2026-11-08: UI redesign N11 - leaders
- SD.leaderScore (logic.js, rule in docs/site_rules.md, tests/js/leaders.test.js). Page `#/leaders` (rail "Leaders"):
  top N by score from the liquid pool, sections by theme (or basic industry when a stock has no theme) / industry /
  sector with count and average score, click a section to fold it, Fold all / Open all, tags (Stage 2, near pivot, VCP,
  RS high, pocket pivot), score badge tinted by score, chart of the clicked stock beside the list (wide screens), Copy
  to TradingView, status "N of M stocks · top N by leader score · Rs X Cr+ turnover · excl. 2% / 5% bands".
- No "catalyst" (news) column: we have no news data.
- Checked in the preview at 1500 px and 375 px (06-Nov data: 160 of 1,149 stocks, DIVISLAB 95 on top). Tests 181 Python + 32 JS green.
- NEXT: N12 polish.

### 2026-11-08: UI redesign N12 - polish (redesign N0-N12 complete)
- Live site checked page by page after the N11 deploy (home, market, stocks, scanners, earnings, heatmap, leaders, groups,
  RRG, breadth, major indices, watchlist, stock page, formulas): no script errors. The only 404s were
  data/fii_dii.json and data/index_members.json (made by the daily run from Monday) -> site_build now always writes
  them (empty until the first run); the heatmap falls back to "Liquid stocks" when no index list exists yet.
- Dark mode checked (home, earnings, heatmap, RRG); phones: all 14 pages at 375 px without sideways scroll; short
  laptop screens: the rail scrolls / shrinks so its items never cover Formulas / Theme / About.
- Tests 181 Python + 32 JS green.
- Next ideas (not started): news / catalysts and intraday need new data sources; maybe a "Pages" tab bar like the
  reference; Google Drive backup (manual checklist).
### 2026-11-07: missing data, part 1 (backend only - website part not built yet)
- BUG fixed: NSE now labels main-board issues "Equity" (was EQ), so data/meta/ipos.csv became EMPTY on 05-Nov (New Listing /
  IPO Base scanners lost their IPO dates). nse.parse_past_issues accepts "Equity"; stock_master.download_ipos MERGES with the
  saved list (never shrinks) and writes data/meta/ipo_upcoming.csv (main-board issues not listed yet). The next daily run
  refills ipos.csv (~560 listings).
- swingdash/announcements.py: NSE company announcements (exchange filings), our category letters (E results, K con-call,
  O orders, D deals, C corporate action, F fund raising, M management, R regulatory, A rating, P press), routine filings left
  out; data/announcements/YYYY-MM/DD.csv (13 months); daily step 4g (last 3 days); backfill job "announcements" (365 days);
  site_build writes data/news.json (10 days) + data/a/<SYMBOL>.json (400 days). tests/test_news_ipos.py.
- Website part done the same day (next entry).

### 2026-11-07: missing data, part 2 - company filings and IPOs on the website
- site_build: data/ipos.json (listings of the last 45 days + main-board issues not listed yet), news files (part 1).
- News page `#/news` (rail "News"): filings of the last 10 days by day, category chips with counts (our letters E K O D C F M
  R A P), "My watchlist", symbol search, 150 at a time, link to each filing's PDF on nsearchives.nseindia.com.
- Chart: one round marker per bar with filings (most telling category letter + count; results and plain updates left
  out because E markers already exist), hover = card "FILINGS · date" with up to 5 items; settings drawer -> Events ->
  "Company filings" on / off.
- Stock panel: "Filings & con-calls" (n in 30 days) - con-call / presentation / transcript links first, then the latest
  12 filings, "All recent filings" opens the News page filtered to the stock.
- Home: "Orders, deals & expansion" (O / D filings of liquid stocks, last 5 days) and IPOs in "Coming up" (open / waiting
  to list, plus listings of the last 45 days with issue price and today's gain).
- First data: the daily run adds the last 3 days; Actions -> Backfill history -> job announcements fills the last year.
- Checked in the preview with filings of 01-Oct..07-Nov read into a temp folder (never into data/): 8,262 filings in
  10 days, BEL panel 7, home 8 deals, 33 recent listings; phone 375 px fine. Tests 187 Python + 32 JS green.

### 2026-11-07: accuracy step 1 - sector, industry and themes exactly as the reference list (Viraj: "Exact copy j")
- Why: Viraj wants the same sector / industry / theme groups as the reference app, so group ranks, RRG and theme scans
  match what he compares with.
- `scripts/import_reference_classes.py "<all-stocks export csv>"` -> `config/reference_classes.csv` (symbol, sector,
  industry, themes "A|B", as_of). Only these 4 columns are copied into the repo; the export stays in git-ignored reference/.
  First import: 2,614 stocks, 23 sectors, 192 industries, 96 themes (as of 2026-11-06).
- `classification.load`: NSE classification -> overrides -> reference list on top (sector when not empty, basic_industry =
  reference industry, class_source "reference list <as_of>"). Vectorized (the row loop made the tests very slow).
- `themes.run`: themes = reference memberships for listed stocks; our rule themes only for stocks NOT in the list (new
  listings) and only for theme names the list has. So the site shows exactly the reference's 96 themes.
- Check against the exports: sector, industry and theme sets 100 % equal on 02, 05 and 06 Nov (3,784 memberships, 1 from rules).
- Takes effect on GitHub after the push + the next Daily update (or Backfill history) rebuilds stocks / themes / groups.
- Refresh: run the import script with a newer export, then commit config/reference_classes.csv.
- Tests 190 Python + 32 JS green.
- Next: step 2 stage + RS rating tuning against the 4 exports (02/04/05/06 Nov).

### 2026-11-07: accuracy step 2 - stage and RS rating re-tuned on 4 days of reference exports
- Why: Viraj wants to trust every stage / RS number before an entry. Rules fitted on 02+04-Nov, checked on 05+06-Nov.
- Stage (`engine.stage`, `site/ind.js` stage, `config/stage.yaml`): 87.4 % -> **96.4 %** equal. Above SMA200 a dip below
  SMA50 stays Uptrend unless the run was extended (then Topping); Basing = below SMA200, back above SMA50 and SMA150.
  Stocks with 64-199 sessions: own rule on SMA50 / SMA10 / SMA30 (67 % -> 92 %). JS = Python (fixtures regenerated).
- RS rating (`engine.rs_score`, `screen.rank99`, indicators.yaml min_sessions 10): young stocks rated from the 11th session
  (return since the first session under 3 months), percentile rounded down: 70.9 % -> **80.4 %** within 3 points
  (88 % on stocks with full history).
- Found: **~204 stocks came to NSE from BSE in 2026** (first NSE session 20-Apr-2026: 81, 17-Aug-2026: 123; HAWKINCOOK,
  ELANTAS, NIRLON, TIMEX ...). We only have their NSE days, the reference has their BSE history -> their stage, RS, 52W
  high, ATH, returns are short. Next: fetch their BSE history (www.bseindia.com bhavcopy works from GitHub) and join it.
- docs/calibration.md has the table. Tests 190 Python + 32 JS green.
### 2026-11-07: BSE history for BSE->NSE stocks - code ready, PAUSED (Viraj: "bse na stocks pachi karisu")
- Code: `swingdash/sources/bse.py` (scrip_list, stock_history = one call 2007 -> day, corp_actions), `swingdash/bse_history.py`
  (data/stocks/bse/<ID>/ = BSE days before the first NSE session, data/meta/bse_history.csv + bse_actions.csv),
  rebuild.py / integrity.py use `bse_history.joined_raw` (NSE raw unchanged; no BSE folder = same as before),
  backfill job `bse-stocks` (PC only). Tests 190 green; NO BSE data fetched into data/ yet.
- Tried in a temp folder: HAWKINCOOK / ELANTAS / TIMEX / DECNGOLD / KAMAHOLD / KPL get BSE history from 2007 (KPL 2016),
  joins fit (BSE last close vs NSE first close within ~1-12 %), BSE bonuses 4:1 / 1:1 applied.
- 1,954 active stocks start on NSE after 2007 (1,831 found on BSE by ISIN); most will get no extra days.
- To resume: `<python> scripts/backfill.py --job bse-stocks` (~1-2 h, resumable), check, then Viraj commits only
  data/stocks/bse + data/meta/bse_*.csv; the next GitHub daily run rebuilds adjusted prices and the screen.

### 2026-11-07: accuracy step 3, part A - scanners re-tuned on 4 days of reference lists
- Real pipeline (build_screen --as-of 02/04/05/06-Nov) compared with the reference scan lists (docs/calibration.md).
- Rules changed in config/scanners.json: 1M / 3M Gainers, Doublers (1 year, not 6 months), New Listing (28-365 days),
  20-SMA and 50-EMA Pullback (now 100 % / 100 %), High Volume and Big Reversal as 5-session EVENT scans.
- New engine.events (+ event_age): hv_age, hv_rvol, hv_move, br_age (settings config/indicators.yaml -> events; registry
  fields; test). JS scan fixtures regenerated. Tests 191 Python + 32 JS green.
- Result (4-day average recall / precision): gainers 0.99-1.00 / 0.92-0.96, doublers 0.99 / 0.93, pullbacks 1.00 / 1.00,
  high volume 0.99 / 0.83 (was 0.06), big reversal 1.00 / 0.53 (was 0).
- Next (part B): Stage 2 / Recent Breakout, RS before Price, Shakeout, bases, Near Pivot, VCP, Tight, IPO Base.

### 2026-11-07: accuracy step 3, part B - breakout and shakeout scans
- engine.events: s2b_age (Stage 2 breakout), so_age (shakeout), rb_age + rb_level (recent breakout; engine.recent_breakout,
  only the last 30 rows are computed - the screen uses the latest day). Settings config/indicators.yaml -> events.
- config/scanners.json: stage2-breakout, recent-breakout, shakeout use them. Registry fields + tests (192 Python, 32 JS green).
- 4-day average recall / precision: Stage 2 Breakout 0.96 / 0.88 (was 0.30 / 0.43), Recent Breakout 0.93 / 0.93 (was
  0.21 / 0.21), Shakeout 0.93 / 0.57 (was 0 / 0). Part A scans unchanged.
- Next (part C): RS before Price, Daily / Weekly Base, Near Pivot, VCP, Tight Setups, IPO Base.

### 2026-11-07: accuracy step 3, part C - base and pivot scans
- engine.base_levels (latest day only): lvl_* (daily level), wlvl_* (weekly candles), ipo_* (new listings), adr100_pct.
  Settings config/indicators.yaml -> events (base_swing 16, 22-168 sessions; weekly +-4, 17-71 weeks; ipo_max_bars 30).
- config/scanners.json: daily-base, near-pivot, weekly-base, ipo-base use them. Registry fields + test (193 Python, 32 JS green).
- 4-day average recall / precision: Daily Base 0.96 / 0.97 (was 0.41 / 0.46), Near Pivot 0.92 / 0.91 (0.44 / 0.31),
  Weekly Base 0.96 / 0.79 (0.28 / 0.24), IPO Base 0.93 / 0.70 (0 / 0). Parts A and B unchanged.
- Next (part D): RS before Price, VCP, Tight Setups. Earnings scans after ~10-Nov.

### 2026-11-07: accuracy step 3, part D - RS before Price (VCP / Tight left as they were)
- engine.stock_fields: rsb_today, rsb_px_below (RS line vs NIFTY_MIDSMALLCAP_400, config events.rsb_*); the index is loaded
  by screen._benchmarks; rs_line_* columns only for config rs_lines + beta benchmark. Scanner new-rs-before-price uses it.
- 4 days: recall / precision 0.68 / 0.93 (was 0.08 / 0.06). The reference's RS index could not be found exactly.
- VCP and Tight Setups not changed (see docs/calibration.md). Tests 194 Python + 32 JS green.
- Step 3 done for the price scanners. Open: earnings scanners after ~10-Nov; New Listing after the BSE step.

### 2026-11-07: accuracy step 4 - turnover, beta, market cap, free float
- engine: turnover_avg20/50_cr = mean(volume x close) incl. today (99.6 % / 99.1 % equal, was 89 %); beta_1y = 252 sessions
  up to the previous day (83.8 % within 0.05, was 74.5 %).
- stock_master: stale_split_factor (NSE's share count lags a split: GNRL / KMEW market cap now right); share_count_changed
  asks again for 10 days after a share action. Takes effect when the daily job rebuilds stocks.csv.
- Free float left as 100 - promoter % (their definition takes out more holders, not available from NSE's summary).
- Tests 194 Python + 32 JS green. Next: step 5 (safety: shrink guard + daily price cross-check).

### 2026-11-07: accuracy step 5 - safety checks
- swingdash/shrink_guard.py: the data check (validate_data.py) reports an ERROR when a guarded file (stocks.csv,
  classification.csv, trading_days.csv, ipos.csv, themes / groups, index members, fii_dii ...) has > 20 % fewer lines
  than in the last commit, or a guarded folder (fundamentals, corporate_actions, stocks raw / adjusted, announcements)
  > 20 % fewer files -> the workflow does not commit. Skipped with --no-baseline (restore). Setting validation.max_shrink_pct.
- swingdash/crosscheck_bse.py, daily step 4h: liquid stocks' NSE closes vs BSE's bhavcopy of the same day (by ISIN, BSE
  volume >= 1,000). > 3 % apart -> data/meta/crosscheck_bse.csv + warning; > 10 % of the compared stocks apart -> ERROR
  (wrong day / file). 06-Nov: 1,457 compared, 1 apart (INDOTECH +3.6 %). BSE's download site answers GitHub.
- Tests 196 Python + 32 JS green.

### 2026-11-07: VCP rebuilt from Viraj's VCP screenshots (VCP 06-11-2026.zip, kept outside the repo)
- Found: their VCP only scans Trend Template stocks ("233 scanned"), it is a 2-session event with frozen values, and the
  pullbacks are pivot->lowest low, then the last two swing legs. engine.vcp_setup + _vcp_at + _zigzag_lows (latest day
  only), fields vcp_age / vcp_depth1-3 / vcp_pivot / vcp_base_bars, scanner vcp = Trend Template rule + vcp_age <= 2.
- 4 days: recall 0.875 / precision 0.36 (was 0 / 0); 21 of 22 rows exactly equal (age, depths, pivot). Tests 197 + 32 JS.
- The chart's VCP drawing (site/ind.js contractions) is unchanged; the old patterns.py vcp_* fields stay for it.

### 2026-11-07: navigation - 4 rail buttons + page tabs on top (Viraj's screenshots)
- Rail keeps Home, Scanners, Groups, Breadth (+ theme / about at the bottom). Every other page (Market, Stocks, Earnings,
  Heatmap, Leaders, RRG, News, Watchlist, Formulas) is a tab in a "Pages" strip in the top bar: active tab = white pill
  with a drag handle and a remove button, "+ Add page" menu brings removed pages back (and "Reset to the default tabs"),
  tabs can be dragged to a new order. The visitor's list lives in the browser (localStorage "sd-pages").
- The top bar's search box is gone (Viraj); press "/" anywhere for a small "Find a stock or index" dialog instead.
- Checked in the preview: desktop + phone 375 px, remove / add / order saved, "/" find (INFY). JS tests 32 green.

### 2026-11-09: accuracy step 6 - fundamentals formulas and earnings scanners
- Fundamentals backfill finished (all 2,633 stocks, 08/09-Nov runs).
- fundamentals.metrics: PAT incl. minority, ROE on year-end net worth (85 %), PEG = PE / EPS growth YoY (90 %), OPM =
  EBITDA without other income (69 %), ROCE on year-end capital (45 %); quarter_trends: sales_g_q1..3, eps_g_q1..3,
  npm_q1..3, eps_year_ago_q. Registry + formulas doc; ROE / ROCE test updated.
- Scanners: Code 33 0.77 / 0.78, EPS Accelerators 0.81 / 0.82, Turnarounds 0.80 / 0.85, Earnings Explosion (renamed
  eps-doublers) 0.71 / 0.75. Details docs/calibration.md. Tests 197 Python + 32 JS green.
- Not matched: PB and debt / equity (their balance-sheet numbers differ), next result date (their calendar).
