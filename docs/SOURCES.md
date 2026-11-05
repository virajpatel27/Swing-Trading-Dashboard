# Data sources (probe 2026-10-31 from the PC and from GitHub)

## GitHub probe result (run 41194805588, 2026-10-31) - what differs from the PC
- **BSE API (`api.bseindia.com`) refuses GitHub: HTTP 403** for corporate actions, `FillddlIndex` and `IndexArchDaily`.
  BSE bhavcopy downloads from `www.bseindia.com/download/...` DO work from GitHub (2007 and today).
  -> BSE index history (151 indices) must be fetched once from the PC; daily BSE index values from GitHub come from Angel One
  (40 BSE indices in its instrument master). The other ~110 BSE indices: open question for Phase 3.
- Everything NSE works from GitHub exactly as from the PC (allIndices, historicalOR, bhavcopy 2007 + today, corporate actions,
  holidays, Nifty 500 list, GetQuoteApi).
- **Angel One: login OK; daily history from 2007-01-02 for RELIANCE, NIFTY 50 and SENSEX (249 days in 2007).**
- **Angel One history IS ADJUSTED:** RELIANCE 25-Oct-2024 Angel close **1327.85** = yfinance Close 1327.85 = NSE raw 2655.70 / 2.
  -> Angel cannot be the "raw" source. It is a second, independent check of our adjusted series (next to yfinance).


Raw results: `reports/probe_pc.md` (PC) and, after the Source probe workflow runs, its Summary page (GitHub).
Script: `scripts/probe_sources.py`.

## Chosen chain per data type

| Data | Primary | Secondary | Validation only |
|---|---|---|---|
| Stock OHLCV, raw "as traded", 2007 -> today | NSE equity bhavcopy archive (one file per day, all stocks; old format until 05-Jul-2024, UDiFF from 08-Jul-2024) | keep last good data (Angel One is adjusted, so not a raw source) | Angel One candles + yfinance `Close` (both split/bonus-adjusted) |
| List of NSE indices | NSE `api/allIndices` (139 listed) + daily `ind_close_all` file (167 rows) | Angel One instrument master (57 NSE indices) | - |
| NSE index history 2007 -> | `ind_close_all_DDMMYYYY.csv` archive from 21-Feb-2012 (all indices per day; names before the Nov-2015 rename are old, e.g. "CNX Bank") + NSE `api/historicalOR/indicesHistory` for the years before each index's first file day (max 365 days and ~70 rows per call, ~5 s per call; it knows old names) | - | - |
| NSE index daily | `ind_close_all_DDMMYYYY.csv` | historicalOR API / Angel One | - |
| List of BSE indices | BSE `FillddlIndex` (151 listed) | Angel One instrument master (40 BSE indices) | - |
| BSE index history 2007 -> | BSE `IndexArchDaily` with the index code, e.g. `index=SENSEX` (Jan-2007 OK, **PC only**: 403 from GitHub) | Angel One candles (40 BSE indices, from 2007) | - |
| BSE index daily | Angel One candles (40 indices) | BSE `IndexArchDaily` from the PC | - |
| BSE stocks (later option) | BSE bhavcopy (2007 and today OK) | - | - |
| Corporate actions | NSE `api/corporates-corporateActions` (2007 OK: 263 in Jan-Mar; RELIANCE 28-Oct-2024 "Bonus 1:1" OK) | BSE `DefaultData` (89 in Jan-2024; **PC only**) | Angel One + yfinance price ratios around ex-dates |
| Trading holidays | NSE `api/holiday-master?type=trading` (20 in 2026) | "no new file" detection | - |
| Universe | NSE `ind_nifty500list.csv` (501 stocks, has a broad Industry column) | - | - |
| Sector / industry | NSE `GetQuoteApi getSymbolData` (macro, sector, basicIndustry fields) | Nifty 500 list "Industry" column | - |
| Shares issued, face value (Phase 1 scanner plan) | same GetQuoteApi answer (`issuedSize`, `faceValue`; TITAN 887,786,160 = NSE's market cap / price) | keep last good | - |
| Free float % | 100 - promoter & group % from NSE `api/corporate-share-holdings-master` (newest quarter) | NSE `ffmc / totalMarketCap` (NSE's index free float, differs) | reference export: 90 % within 0.1 pt |
| F&O stocks | NSE `content/fo/fo_mktlots.csv` (218 stocks on 03-Nov) | keep saved flags | reference export: 218 / 218 identical |
| Price band (circuit %) | NSE `content/equities/sec_list.csv` (today only) | keep saved bands | - |
| Delisted companies | NSE `content/equities/delisted.csv` (latin-1, ~330 rows) | - | audit only |
| Delivery % (S2) | NSE `archives/equities/mto/MTO_ddmmyyyy.DAT` (every trading day 2007 ->, out ~16:50 IST; record type 20 = symbol, series, traded qty, deliverable qty, %) | `products/content/sec_bhavdata_full_ddmmyyyy.csv` (2020 ->, DELIV_PER) | traded qty = bhavcopy volume; reference export = previous day's MTO, 100 % equal |
| Corporate actions of the SME board | NSE `api/corporates-corporateActions?index=sme` (2012 ->) | - | THEJO bonus 2:1 12-Oct-2021, KSOLVES bonus 3:1 04-Jun-2021, AIRAN split 14-Aug-2018 |
| Fundamentals (S8): results | NSE XBRL on nsearchives: `api/corporates-financial-results?period=Quarterly` (to Dec-2024, XBRL ~2017 ->), `period=Annual` (balance sheet ~FY2020 ->), `api/integrated-filing-results` (2025 ->, results + balance sheet + cash flow; referer corporate-integrated-filing) | keep the last good document | hand check vs the company's published results (docs/calibration.md S8) |
| Fundamentals (S8): shareholding | NSE `api/corporate-share-holdings-master` (per stock ~21 quarters; without symbol = latest of all companies) + its SHP XBRL | - | promoter % = the master list's pr_and_prgrp |
| Results calendar (S8) | NSE `api/event-calendar` (upcoming board meetings, purpose 'Financial Results') | - | - |
| Not used: screener.in | its Terms of Service (guides/terms, Aug-2018) forbid copying or mirroring its material; no public API | - | - |
| Missing symbol renames | same ISIN in the bhavcopy of two neighbouring days (ISIN column from ~2011) -> `config/symbol_changes_extra.csv` | - | 6 found 03-Nov: RUCHI->PATANJALI, PHILIPCARB->PCBL, PDSMFL->PDSL, BURGERKING->RBA, SHRIRAMEPC->SEPC, WABCOINDIA->ZFCVINDIA |

**Not used:** equitytimer.com (Terms forbid scraping + redistribution). niftyindices.com: its old history address
(`Backpage.aspx/getHistoricaldatatabletoString`) now returns a web page; the NSE API gives the same data, so niftyindices is dropped for now.

## Key facts found
- RELIANCE on 25-Oct-2024 (day before the 1:1 bonus): NSE bhavcopy close **2655.70** (as traded), yfinance Close **1327.85**
  (= 2655.70 / 2, split/bonus-adjusted), yfinance Adj Close 1316.48 (also dividend-adjusted). -> Our adjusted close must equal ~1327.85
  with `ADJUST_DIVIDENDS=false`. This becomes a unit test in Phase 4.
- NSE bhavcopy 02-Jan-2007: 1,000 symbols; 30-Oct-2026: 3,639 symbols.
- BSE answered from the PC. The old project found BSE refuses GitHub's servers -> checked by the GitHub probe.
- Angel One instrument master: 147,460 instruments, 2,745 NSE "-EQ" stocks.

## Corporate actions (Phase 4)
- NSE `api/corporates-corporateActions?index=equities&from_date=01-01-YYYY&to_date=31-12-YYYY`: a whole year per call.
- NSE bhavcopy PREVCLOSE is the raw previous close even on ex-dates (not adjusted): it cannot give factors.
- Yahoo `Close` (auto_adjust=False) is adjusted for splits/bonus and often, not always, for demergers/rights; it has errors
  (history before some 1-January not adjusted, stale days). Used only as a cross-check.
- BSE corporate actions (secondary) answer only the PC; not needed so far (NSE covered every stock in the universe).

## Open questions for Phase 3
- Daily values for the ~110 BSE indices that Angel One does not list (BSE API refuses GitHub).
- (answered) NSE's `ind_close_all` archive starts 21-Feb-2012 (30 indices that day).
- BSE `ProduceCSVForDate` gives 2007 -> today in one call per index (PC only); 12 BSE bond indices return nothing.
