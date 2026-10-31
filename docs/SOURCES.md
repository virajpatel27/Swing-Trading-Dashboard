# Data sources (probe 2026-10-31 from the PC; GitHub probe pending)

Raw results: `reports/probe_pc.md` (PC) and, after the Source probe workflow runs, its Summary page (GitHub).
Script: `scripts/probe_sources.py`.

## Chosen chain per data type

| Data | Primary | Secondary | Validation only |
|---|---|---|---|
| Stock OHLCV, raw "as traded", 2007 -> today | NSE equity bhavcopy archive (one file per day, all stocks; old format until 05-Jul-2024, UDiFF from 08-Jul-2024) | Angel One candles (after a check of whether they are adjusted) | yfinance `Close` (split/bonus-adjusted) |
| List of NSE indices | NSE `api/allIndices` (139 listed) + daily `ind_close_all` file (167 rows) | Angel One instrument master (57 NSE indices) | - |
| NSE index history 2007 -> | NSE `api/historicalOR/indicesHistory` (NIFTY 50 Jan-2007 OK) | `ind_close_all_DDMMYYYY.csv` archive (404 for 2007 and 2010, OK from 2013: starts somewhere 2010-2013) | - |
| NSE index daily | `ind_close_all_DDMMYYYY.csv` | historicalOR API / Angel One | - |
| List of BSE indices | BSE `FillddlIndex` (151 listed) | Angel One instrument master (40 BSE indices) | - |
| BSE index history 2007 -> | BSE `IndexArchDaily` with the index code, e.g. `index=SENSEX` (Jan-2007 OK) | Angel One candles | - |
| BSE stocks (later option) | BSE bhavcopy (2007 and today OK) | - | - |
| Corporate actions | NSE `api/corporates-corporateActions` (2007 OK: 263 in Jan-Mar; RELIANCE 28-Oct-2024 "Bonus 1:1" OK) | BSE `DefaultData` (89 in Jan-2024) | yfinance |
| Trading holidays | NSE `api/holiday-master?type=trading` (20 in 2026) | "no new file" detection | - |
| Universe | NSE `ind_nifty500list.csv` (501 stocks, has a broad Industry column) | - | - |
| Sector / industry | NSE `GetQuoteApi getSymbolData` (macro, sector, basicIndustry fields) | Nifty 500 list "Industry" column | - |

**Not used:** equitytimer.com (Terms forbid scraping + redistribution). niftyindices.com: its old history address
(`Backpage.aspx/getHistoricaldatatabletoString`) now returns a web page; the NSE API gives the same data, so niftyindices is dropped for now.

## Key facts found
- RELIANCE on 25-Oct-2024 (day before the 1:1 bonus): NSE bhavcopy close **2655.70** (as traded), yfinance Close **1327.85**
  (= 2655.70 / 2, split/bonus-adjusted), yfinance Adj Close 1316.48 (also dividend-adjusted). -> Our adjusted close must equal ~1327.85
  with `ADJUST_DIVIDENDS=false`. This becomes a unit test in Phase 4.
- NSE bhavcopy 02-Jan-2007: 1,000 symbols; 30-Oct-2026: 3,639 symbols.
- BSE answered from the PC. The old project found BSE refuses GitHub's servers -> checked by the GitHub probe.
- Angel One instrument master: 147,460 instruments, 2,745 NSE "-EQ" stocks.

## Still to check (GitHub probe, needs the 4 Secrets)
- Which of the above answer from GitHub's servers.
- Angel One login, history depth (2007?) for a stock, an NSE index, a BSE index, and whether its RELIANCE 25-Oct-2024 close is
  ~1327 (adjusted) or ~2655 (as traded).
