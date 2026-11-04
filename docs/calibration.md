# Calibration against the reference app

The reference scanner app does not publish its formulas. Its export of the 03-Nov-2026 session (kept privately in the
git-ignored `reference/` folder, never published) was compared with our engine's values for the same day
(`python scripts/build_screen.py --as-of 2026-11-03`). Only agreement rates are listed here, no data of the app.
Where a definition was chosen because it matched, the setting is in `config/indicators.yaml` / `config/stage.yaml`.

## Phase S1 - stock master (2026-11-03)

| field | our definition | agreement |
|---|---|---|
| F&O stock | NSE fo_mktlots.csv | 218 of 218 |
| Free float % | 100 - promoter & group % (NSE shareholding) | 90 % within 0.1 pt (rest: newer filings) |
| Market cap | NSE shares issued x close | exact on the checked stocks |
| Liquid stocks | median 30-session turnover >= Rs 1 Cr, close >= Rs 5 | 1,545 (02-Nov) vs their 1,507 (30-Oct) |
| Delivery % | NSE MTO file of the day | their column = the PREVIOUS day's file, 100 % equal |

## Phase S4 - indicator engine (as of 2026-11-03, ~2,500 stocks)

| field | our definition | agreement |
|---|---|---|
| RSI 14 | Wilder | 99.0 % within 0.5 |
| ADR % (20) | 100 x (SMA20(high/low) - 1) | 99.8 % within 0.05 |
| Relative volume | volume / average of the PREVIOUS 20 sessions | 99.5 % within 0.02 |
| Avg volume 50D, volume / 50D avg | 50 sessions INCLUDING today (chosen: 51 % with the previous 50) | 99.0 % / 99.2 % |
| SMA 10 / 200, EMA 50, distances | standard | 98.5-99.8 % |
| Returns 10D / 6M / YTD | 10 / 126 sessions, last close of the previous year | 98.9-99.8 % |
| Return 1Y | 251 sessions back (chosen: 252 gives 14 %, calendar year 7 %) | 98.3 % within 0.2 pt |
| 20D high / low, gap up, 1D volume change | standard | 99.7-100 % |
| Days since 52W high | CALENDAR days to the day of the highest high of 252 sessions (sessions: 2 %) | 96.0 % within 1 |
| From 52W high / low | standard | 93.8 % / 97.3 % within 0.2 pt |
| RS line at 52W high | benchmark Nifty Smallcap 250 (their default; Nifty 500: 98.5 %) | 99.2 % |
| RS new high before price | as above, price below its 52W high | 98.8 % |
| Stage | above SMA200 and SMA50 = 2, above SMA200 below SMA50 = 3, below SMA200 = 4 (Basing: ours) | 90.5 % (single-average 30-week rules: 47-80 %) |
| RS rating | IBD-style weighted return, percentile rank among ALL stocks (liquid only: 57 %) | 76.8 % within 3, correlation 0.98 |
| RS change 1W / rating 1M ago | as above, 5 / 21 sessions back | 69 % / 66 % within 3 |
| Beta 1Y | daily returns vs Nifty 50, 252 sessions | 78.5 % within 0.05 (median gap 0.025) |
| Avg turnover 20D / 50D | NSE traded value, incl. today | 82 % / 85 % within 3 % (they seem to use volume x price) |
| All-time high | our history from 2007 | 73 % - their "all-time" uses only ~5 years (84 % with 5 years): ours is kept |

Standard indicators are also checked against TA-Lib on 3 real stocks (tests/test_scan_phase4.py): SMA, EMA, WMA, RSI,
MACD, ATR, MFI, Bollinger, T3 equal to 6 decimals; Supertrend equal to TradingView's published logic.
