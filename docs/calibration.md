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

## Phase S6 - price scanners (counts on 30-Oct-2026, `python scripts/build_screen.py --as-of 2026-10-30`)

Rules: `config/scanners.json` (every number is a parameter; the website's Formula editor can change them per browser).

| scanner | our rule (short) | ours | reference |
|---|---|---|---|
| Trend Template | Minervini's 8 points, RS rating >= 70 (75 would give 164; the textbook 70 is kept) | 172 | 165 |
| Stage 2 Breakout | day high above the 50-day high before, RVol >= 1.5, stage 1 / 2 / 2A | 27 | 30 |
| 4% Breakout | +4 %, volume above yesterday's, RVol >= 1.5, liquid | 31 | 31 |
| 20-SMA Pullback | RS >= 90, 3M up, within 1 % of a rising SMA 20, SMA 50 rising, liquid | 4 | 4 |
| High Volume | HVQ / HVY / HVE on an up day | 26 | 24 |
| 1M Gainers | liquid, 1M >= +23 % | 22 | 22 |
| 3M Gainers | liquid, 3M >= +38 % | 63 | 64 |
| Outperformers | RS 1W > 90, 1M > 85, 3M > 80, liquid (the app's own stated rule) | 31 | 31 |
| Doublers | 6M >= +100 % (the app gives no rule; 1Y >= +100 % would be 97) | 53 | 50 |
| New Listing | IPO on NSE's main board within 365 days (NSE's IPO list; EQUITY_L listing dates also count SME migrations: 437) | 125 | 130 |
| 50-EMA Pullback | RS >= 80, stage 2 / 2A / 3, -2 % .. +3 % from a rising EMA 50, 20-day range <= 20 %, liquid | 22 | 21 |
| New RS before Price | RS line (vs Smallcap 250) at a 52-week high within 7 sessions, price not at its 52-week high today | 111 | 105 |

Recent Breakout needs bases / pivots: Phase S7.

## Phase S7 - patterns (30-Oct-2026)

Pivot = the most recent swing high at least 15 sessions old that is still the highest high since and above the close
(`config/patterns.yaml`). On 03-Nov it equals the reference's resistance level exactly for 52 % of the stocks the app gives
one (ICICIBANK 1480, HAL 5149.9, TRENT 3244.5 ...); most others use a level that is not the highest since.

| scanner | our rule (short) | ours | reference |
|---|---|---|---|
| Recent Breakout | breakout within 10 sessions, base 40+ sessions, breakout RVol >= 2, still above the old pivot, liquid | 7 | 7 |
| Daily Base | base 15-90 sessions, depth <= 35 %, within 15 % of the pivot, 15 %+ rise before | 143 | 153 |
| Weekly Base | base 85-390 sessions, depth <= 55 %, within 16 % of its pivot | 75 | 70 |
| Near Pivot | within one ADR % below the pivot | 23 | 22 |
| VCP | 2+ shrinking pullbacks in the base, last <= 8 %, stage 2, within 5 % of the pivot | 2 | 2 |
| Tight Range | stage 2, last 5 closes within 1.5 % | 8 | 8 |
| Flag Pattern | pole 40 %+ in <= 15 sessions, flag 3-15 sessions, <= 15 % deep | 1 | 0 |
| IPO Base | IPO within a year, base 25+ sessions, pivot = high since listing, within 10 % | 2 | 1 |
| Big Reversal | new 20-day low, close in the top 30 % of a day 1.5 x ADR wide | 15 | 16 |
| Shakeout | 4 %+ below a rising SMA 50 in the last 5 sessions, back above it | 40 | 41 |
