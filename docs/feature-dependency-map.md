# Feature dependency map + Feasibility Matrix (Phase 0, 2026-11-03)

Status: **READY** = source tested for real and works (or already in the project) / **PARTIAL** = works with a limit
(shown) / **MISSING** = no free, allowed source. Every source below was called for real on 03-Nov-2026 from the PC
(scratch probe, read-only, ~45 polite calls). GitHub servers reach NSE archives + www.nseindia.com APIs (used daily
already); BSE's api host refuses GitHub (known) -> BSE-only items run from the PC.

## A. Data sources

| # | Data | Source (tested) | Result of the test | Status | Fallback / note |
|---|---|---|---|---|---|
| 1 | NSE equity list, ISIN, name, series, listing date | `EQUITY_L.csv` (in use) | 2,620 stocks EQ/BE/BZ, listing dates | READY | Nifty 500 list for REITs (in use) |
| 2 | Symbol changes | `symbolchange.csv` (in use) | works | READY | - |
| 3 | Shares outstanding, free float, market cap | NSE GetQuoteApi (already called monthly for sectors) | TITAN issuedSize 887,786,160, total mcap, **ffmc** (free-float mcap) | READY | today's values only; history of share count: from bhavcopy turnover? no -> past mcap = today's shares x past adjusted price (standard approximation) |
| 4 | Daily OHLCV 2007 ->, all stocks + 139 NSE + 139 BSE indices | bhavcopy + index files (in use) | 2007-01-01 -> 03-Nov-2026 | READY | - |
| 5 | Turnover | bhavcopy TOTTRDVAL / TURNOVER (in use) | works | READY | - |
| 6 | Delivery % | 2007-2019: `archives/equities/mto/MTO_ddmmyyyy.DAT`; 2020+: `sec_bhavdata_full_ddmmyyyy.csv` | MTO files exist for 03-Jan-2007, 2010, 2015; full bhavcopy has DELIV_QTY / DELIV_PER | READY | one-time backfill ~4,900 small files (~2 h); then 1 file/day |
| 7 | Corporate actions (split, bonus, rights, demerger) | NSE corporate actions API (in use) + overrides file | works, back-adjustment live | READY | EPS split/bonus factor = same factor table (new, Phase 2) |
| 8 | Benchmarks Nifty 50 / 500 / Midcap 150 / Smallcap 250 / Microcap 250 | NSE index history (in use) | works | READY | - |
| 9 | Index members (for Heatmap, Leadership) | niftyindices.com `IndexConstituent/*.csv` | Nifty 500 (501), Midcap 150, Smallcap 250, Microcap 250 all OK | READY | today's members only (history of membership: MISSING, not needed) |
| 10 | Sector / Industry (NSE official) | GetQuoteApi (in use) | 2,587 of 2,623 classified | READY | 36 without answer are asked again daily |
| 11 | Sector / industry / theme indices | none from NSE for most groups | - | READY (we build) | own equal-weight + median indices from member stocks |
| 12 | Themes (~96) | none (the reference's themes are its own editorial lists: cannot copy) | - | PARTIAL | our own `config/themes.csv`, seeded by rules from NSE basic industry + keywords, Viraj reviews |
| 13 | Quarterly results (12 quarters) | `api/corporates-financial-results` (XBRL 2017-03 -> 2024-12) + `api/integrated-filing-results` (XBRL 2025 ->) | TITAN: XBRL for every quarter from Mar-2017; integrated filing has Mar-2026, Jun-2026 for MARSONS; XBRL has RevenueFromOperations, Expenses, OtherIncome, FinanceCosts, Depreciation, PBT, ProfitLoss, EPS, face value | READY | consolidated + standalone both present |
| 14 | Annual P&L (10 years) | same feeds, period=Annual | XBRL only from FY2018 -> **~8-9 years**; older years are PDF only | PARTIAL | show what exists (FY2018 ->), label "since FY18" |
| 15 | Balance sheet, Cash flow (10 years) | half-yearly statements inside the results XBRL (rule since ~2019) | to verify tag coverage in Phase 8 | PARTIAL | ~7 years; older = MISSING |
| 16 | Shareholding (12 quarters; promoter / FII / DII / public, holders) | `api/corporate-share-holdings-master` + SHP XBRL per quarter | TITAN 21 quarters (Sep-2021 -> Sep-2026); summary gives promoter / public; FII / DII split + holder count come from the SHP XBRL | READY | 1 XBRL per stock-quarter |
| 17 | Result dates (last + next) | `api/event-calendar` (808 upcoming), `api/corporate-board-meetings` | works | READY | - |
| 18 | Stocks that moved from BSE to NSE (e.g. MARSONS) | NSE has no old results for them | MARSONS: 0 rows on the old feed, 4 on the new one | PARTIAL | BSE results from the PC (BSE blocks GitHub) or accept shorter history |
| 19 | F&O flag | `content/fo/fo_mktlots.csv` | 225 underlyings | READY | daily refresh |
| 20 | Circuit / price band | `content/equities/sec_list.csv` (band 2/5/10/20 %) + GetQuoteApi priceBand | works, today only | PARTIAL | past bands: MISSING (chart "Circuit limits" line only for today) |
| 21 | IPO price, listing date, upcoming IPOs | `api/public-past-issues` (1,489 issues), `api/ipo-current-issue` | works (issue price, listing date) | READY | listing-day high from our bhavcopy |
| 22 | Company announcements -> markers E / O / C / R / M | `api/corporate-announcements` (TITAN 1,481 rows, subject + text + PDF link) | works | READY | category by our own keyword rules on NSE's subject line; "S Sector & market" = MISSING (wire news) |
| 23 | Bulk / block deals | `content/equities/bulk.csv`, `block.csv` (today) | works; history API returned 503 | PARTIAL | collect daily from now -> 30-day view after 30 days |
| 24 | FII / DII cash | `api/fiidiiTradeReact` | 03-Nov: FII +6,836.81 Cr, DII -3,678.85 Cr | PARTIAL | today only -> store daily from now (22-session chart full after ~1 month) |
| 25 | Delisted / merged stocks (survivorship) | `content/equities/delisted.csv` (329 rows) + old bhavcopies have their prices | works | PARTIAL | universe = listed today. Breadth history before today is slightly biased (dead stocks missing). Option later: add delisted symbols from bhavcopy |
| 26 | Company description | no free official source | - | MISSING | NSE industry text only; or Viraj writes short notes; skip the reference's text |
| 27 | Catalyst / Recent Order columns | announcements (#22) | - | PARTIAL | latest "order" announcement subject + date |
| 28 | Global news, media reports, AI summaries | paid wires | - | MISSING | not planned |
| 29 | Intraday (5m-75m) data | Angel One only (old project's account; rate limits) | - | MISSING for now | Phase 11, ask first |
| 30 | USD/INR, Crude oil (Warm-up strip) | not tested (RBI reference rate CSV exists) | - | PARTIAL | optional; skip at first |
| 31 | Analyst estimates | none | - | not needed | earnings grade uses own record only |
| 32 | Concall transcripts / presentations | announcements with that subject | - | PARTIAL | "filed or not" flag only |

**No MISSING item blocks a major feature.** The missing ones only remove small extras: company description, wire news,
global news, intraday, past circuit bands, 10-year (vs ~8-year) annual history.

## B. Features -> data -> status

| Feature (reference page) | Needs | Status | Phase |
|---|---|---|---|
| Stock master, liquid flag (median 30-day turnover >= 1 Cr, price >= 5) | 1-5 | **BUILT (S1)**: `data/meta/stocks.csv`; share counts fill in over the next runs | 1 |
| Adjusted prices, delivery %, EPS factor table | 4-7 | **BUILT (S2)**: delivery % store + job (backfill to run), SME corporate actions, share_factors.csv, quality report | 2 |
| Sector / Industry pages, group indices, themes | 10-12 | READY / themes PARTIAL | 3 |
| ~60 price indicators (MA presets, RSI, MACD, MFI, ATR, ADR%, BB, Supertrend, Swing bands, RS line, Mansfield, Relative extension, Trend intensity, volume labels, returns, highs/lows, RS rating, Stage, Beta) | 4, 8 | READY (formulas known; 4 already checked vs the reference export) | 4 |
| Results table + column settings (7 groups price-side) + chart + indicator menu | Phase 4 | READY | 5 |
| Scanner engine + formula editor + price scanners | Phase 4-5 | READY | 6 |
| Pattern scanners (bases, pivot, VCP, tight range, flag, IPO base, big reversal, shakeout, recent breakout) | Phase 4 | READY (rules ours, calibrated) | 7 |
| Fundamentals tab, ratios, Pros & Cons, Fundamentals columns (21) | 3, 13-18 | READY / PARTIAL (history depth) | 8 |
| Earnings scanners (6), Earnings calendar page + grade | 13, 17 | READY | 9 |
| Groups page ranks, theme status, Heatmap, RRG | 9-12 | READY | 9 |
| Market breadth, Warm-up page (market read, stages, highs-lows, FII/DII, indices, today's setups, events) | Phases 4-7, 21, 24 | READY / FII-DII PARTIAL | 10 |
| News page + chart markers E/O/C/R/M, bulk/block deals, IPO events | 21-23 | PARTIAL | 11 |
| Intraday timeframes + Intraday scanners | 29 | MISSING | 11 (ask) |

## C. Size and runtime estimate (all ~2,620 NSE stocks, 2007 ->)

- Today (measured on the PC 03-Nov): data 541 MB (raw + adjusted + indices, 2,625 adjusted files), local `.git` 414 MB,
  website ~420 MB (one chart file per stock), daily run ~5-15 min.
- Added by the new phases:
  - delivery % column: +~30 MB.
  - fundamentals: one JSON per stock (~25 KB) = ~65 MB in data + the same on the site. XBRL files are read and thrown away.
  - per-date history (needed for rank change, stage change, breadth, calibration): NOT stored for all ~100 fields.
    The daily job recomputes all fields for all dates from adjusted prices (vectorised; ~3-5 min) and stores only
    (a) `screen.json.gz` (latest row per stock, ~1-2 MB), (b) a compact history of ~20 key fields for the last 3 years
    (parquet, ~20-30 MB), (c) breadth / group time series (< 5 MB).
  - Total data after Phase 10: ~700 MB. GitHub's soft limit is 1 GB per repo and 1 GB per Pages site.
- Storage plan to stay under the limits:
  1. Raw (unadjusted) closed years move to a GitHub Release asset ("raw archive"), kept out of the repo; adjusted
     + current year stay. Saves ~250 MB. (Restore script fetches it when a rebuild is needed.)
  2. Site chart files: daily bars for the last 5 years + weekly bars since 2007 in the main file; older daily bars in a
     second file loaded only when you scroll back. Site ~250-300 MB.
  3. Snapshot loads first (fast on mobile); history and fundamentals load only when a stock is opened.
- Runtime: daily job after Phase 10 ~20-30 min (indicators 5, patterns 5, breadth 1, fundamentals in result season
  ~10). Public repo -> Actions minutes are free; 6 h job limit is far away.
- One-time backfills: delivery % ~2 h; fundamentals ~80,000 XBRL files (12 quarters + annual + shareholding per stock)
  ~10-12 h in total -> 2-3 "Backfill history" runs with checkpoints (Nifty 500 first, then the rest).

## D. Phase plan (master prompt phases, adjusted to what already exists)

| Phase | What | Already done | New work | Viraj decides |
|---|---|---|---|---|
| 1 | Stock master + audit + liquid flag | list, ISIN, listing, symbol changes | stocks.parquet, shares / float / F&O flag, audit report vs NSE (missing / extra / delisted), liquid flag (expect ~1,500) | approve audit |
| 2 | Price foundation | 2007 history, adjustment, daily update, checks | delivery % backfill, EPS adjustment factor table, quality report for all 2,620 | - |
| 3 | Groups | NSE sector / industry | group indices (equal-weight + median), themes.csv seed | **review themes list** |
| 4 | Indicator engine + field registry | RSI, MACD, EMA, ATR, RS rating (basic) | all ~60 fields per date, `config/fields.yaml`, `docs/formulas.md`, golden tests (pandas-ta + reference export) | - |
| 5 | Results table + chart | simple table + chart site | column settings, sort / search / CSV, lightweight-charts with indicator menu and settings | look and feel |
| 6 | Scanner engine + formula editor + price scanners | - | scanners.json, editor (AND/OR, Test, Save in browser), 12 price scanners, `docs/calibration.md` | approve calibration |
| 7 | Patterns | - | swing points, bases, pivots, VCP, tight range, flag, IPO base, big reversal, shakeout, recent breakout + overlays | approve calibration |
| 8 | Fundamentals | - | XBRL parser, backfill (Nifty 500 then all), ratios, Financials tab, Pros & Cons | check 3-4 companies by hand |
| 9 | Earnings scanners + Groups + theme status (+ Earnings calendar, Heatmap, RRG pages) | - | 6 earnings scanners, group ranks, RRG, heatmap, calendar with grade | - |
| 10 | Market breadth (+ Warm-up page) | - | breadth series, market read rules, FII/DII store (from now), today's setups, events | ask before start |
| 11 | Optional | - | news markers + News page, bulk/block deals, IPO events; intraday only if you want | ask |
| 12 | Hardening | backups, integrity, restore | raw archive to Releases, runtime check, README, add-to-home-screen | - |

## E. UNKNOWN items (the reference does not publish these rules)

I will calibrate each one against the reference counts / export (30-Oct and 03-Nov) and write the result in
`docs/calibration.md`. Viraj does not need to answer these:
RS rating exact formula, Stage rules, scanner thresholds (Doublers, Gainers, bases, VCP, flag, shakeout, big reversal,
breakout held / failed), group rank formula (it is NOT the median return; matches the RRG quadrant tags), RS-Ratio /
RS-Momentum exact maths (JdK method is proprietary -> open approximation), market-read thresholds, earnings grade, theme
status, volume colour thresholds, "tight area" band width, liquid universe for breadth (1,507), VCP pre-filter ("183 scanned").
Pages never captured: Intraday, Leaders, Major Indices tab, + New scan builder, watchlists.
