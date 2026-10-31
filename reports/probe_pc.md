# Source probe from pc (2026-10-31 15:35)

| Source | What | Result | Detail |
|---|---|---|---|
| NSE | all indices list (allIndices API) | OK | 139 indices listed (e.g. NIFTY 50, NIFTY NEXT 50, NIFTY BANK) |
| NSE | index closing file, newest | OK | 2026-10-30: 167 indices, columns Index Name, Index Date, Open Index Value, High Index Value ... |
| NSE | index closing file, Jan-2007 | NO | 2007-01-02: HTTP 404 |
| NSE | index history Jan-2007 (historicalOR API) | OK | NIFTY 50 Jan-2007: 20 days (e.g. 02-JAN-2007) |
| niftyindices | index history Jan-2007 (old address) | NO | JSONDecodeError: Expecting value: line 1 column 2 (char 1) |
| NSE | equity bhavcopy, newest | OK | 2026-10-30: 3641 rows, 3639 symbols, RELIANCE close 1164.9 |
| NSE | equity bhavcopy, 02-Jan-2007 | OK | 2007-01-02: 1003 rows, 1000 symbols, RELIANCE close 1280.9 |
| NSE | equity bhavcopy, 2024-10-25 | OK | 2024-10-25: 2902 rows, 2898 symbols, RELIANCE close 2655.7 |
| NSE | corporate actions 2007 | OK | Jan-Mar 2007: 263 actions (e.g. 1st Int Div-Rs.2/- P; 1st Int Div-Rs1.20 P; 2nd Int Div-100%    ; 2nd Int Div-30%     ) |
| NSE | corporate actions RELIANCE Oct-2024 | OK | RELIANCE Oct-2024: 28-Oct-2024 Bonus 1:1 |
| NSE | trading holidays | OK | 20 trading holidays this year (first 15-Jan-2026) |
| NSE | Nifty 500 member list | OK | 501 stocks, columns Company Name, Industry, Symbol, Series, ISIN Code |
| NSE | official sector/industry (GetQuoteApi) | OK | RELIANCE: fields found macro, sector, basicIndustry |
| BSE | corporate actions | OK | Jan-2024: 89 actions |
| BSE | all indices list (FillddlIndex) | OK | 151 indices listed (e.g. BSE SENSEX, BSE SENSEX 50, BSE SENSEX 50 TMC) |
| BSE | index history Jan-2007 | OK | SENSEX Jan-2007: 20 days, first 2007-01-02 close 13942.24 |
| BSE | equity bhavcopy, newest | OK | 2026-10-30: 835 KB |
| BSE | equity bhavcopy, 02-Jan-2007 | OK | 2007-01-02: 86 KB |
| yfinance | validation source | OK | RELIANCE 2024-10-25: Close 1327.85, Adj Close 1316.48 |
| Angel One | instrument master (no login) | OK | 147460 instruments: 2745 NSE -EQ stocks, indices NSE 57 / BSE 40 |
| Angel One | login + history | -- | skipped here (secrets not set) - runs on GitHub after the Secrets are added |
