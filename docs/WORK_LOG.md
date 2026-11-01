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
