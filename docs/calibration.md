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
| Stage | re-tuned 14-Nov (Basing / Topping), see below | 96.9 % (4 days, 4,053 stock-days; 200+ sessions 97.6 %) |
| RS rating | re-tuned 07-Nov, see below | 80.4 % within 3 (88 % on stocks with full history) |
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

## S9 - earnings scanners and group ranks (2026-11-05)

Reference: sector table of 03-Nov (rank, rank change, tag) and the stock export (sector / industry rank 1M, vs sector /
industry 1M). Earnings scanner counts of 30-Oct.

| Finding | Result |
|---|---|
| Group return in the stock export (sector_ret, vs_sector_1m) | = plain AVERAGE of all member stocks' returns (median error 0.002 pt); median, liquid-only and market-cap weighted are all wrong |
| Per-stock "sector rank 1M" / "industry rank 1M" | = rank of that average 1-month return (perfectly monotone for all 23 sectors) |
| Sector table rank + tag | NOT a return rank. Best open fit: strength = 100 x RS / SMA(RS, 63), RS = group index / equal-weight market; momentum = 100 + strength change over 10 sessions; rank by strength. Rank correlation 0.88 (Spearman), tags 13 of 20 equal, rank change vs 5 sessions correlation 0.70. Tried: z-score JdK variants, 10-30 session windows, relative performance over N sessions (all <= 0.77) |

Earnings scanners on 30-Oct (fundamentals for 570 of 2,621 stocks at that time: Nifty 500 + 70; the reference counts
cover all stocks, so ours must be lower until the nightly fundamentals run finishes, ~10-Nov):

| Scanner | Ours (Nifty 500) | Reference | Rule |
|---|---|---|---|
| Earnings Gap | 7 (4) | 14 | gap >= 4 %, closed >= open that day, gap not filled, <= 30 sessions |
| Episodic Pivot | 8 (8) | 23 | day change >= 8 % after opening higher, volume >= 3x avg 50, close in top 25 %, <= 30 sessions (gap >= 8 % alone found 0) |
| EPS Doublers | 21 (19) | 41 | EPS YoY >= 100, sales YoY >= 25, profit YoY >= 100, results <= 42 days ago |
| Code 33 | 21 (20) | 21 | sales growth and EPS growth accelerating 2 quarters running (3 quarters in a row) + net margin rising 2 quarters; sales a year ago >= Rs 10 Cr; profit now > 0 |
| EPS Accelerators | 70 (68) | 96 | EPS growth accelerating 2 quarters running + sales up YoY 3 quarters + profit now > 0 |
| Turnarounds | 7 (6) | 26 | loss a year ago, profit now, profit and sales up on the quarter before |

TODO when every stock has fundamentals: re-count; Code 33 and EPS Accelerators will likely be too many (raise to 3
accelerating quarters if so).

## S10 - market breadth (2026-11-06)

30-Oct, liquid stocks (ours 1,533 / reference 1,507):

| Item | Ours | Reference |
|---|---|---|
| % above 20 / 50 / 200-day SMA | 20.4 / 17.7 / 38.7 | 20 / 18 / ~40 |
| A/D ratio 20 sessions (avg up / down) | 0.72 (645 / 892) | 0.72 (636 / 881) |
| Advancers / decliners that day | 263 / 1,267 | 252 / 1,252 |
| 52-week highs / lows | 28 / 114 | 24 / 105 |
| 20-day highs / lows | 68 / 307 | 76 / 309 |
| 4 % movers up / down | 41 / 344 | 40 / 338 |
| Stage mix Base / Up / Top / Down (64+ sessions) | 0.4 / 14.8 / 23.7 / 61.1 | 0.9 / 17.6 / 18.9 / 62.7 |
| All stocks: 50-day / 20D H-L / 4 % movers | 16.7 % / 112-430 / 101-467 | 17 % / 123-450 / 97-458 |
| Read: Momentum, Short-term, Big trend, Breakouts, Overdone, Leadership | Building, Down, Down, Mixed, Washed out, Large caps lead | Building, Down, Down, Failing, Normal, Large caps lead |

Breakouts: the reference judged 14 (6 held, 8 failed) on 30-Oct, "27 % held this week". Close above the previous 10 / 20 /
50 / 100-session high (or close high) gives 2-8 breakouts on 23-Oct and 33-53 % held, so its rule is unknown (maybe
"held / failed" = breakouts vs breakdowns). Ours: close above the 50-session high, held = still above 5 sessions later
(config/breadth.yaml). Verdict thresholds are our own and shown on the page.

## Re-tuning 07-Nov-2026 (exports of 02, 04, 05 and 06-Nov; rules fitted on 02+04, checked on 05+06)

| field | change | before | after |
|---|---|---|---|
| Stage (64+ sessions) | above SMA200 stays 2 below SMA50 unless the run was extended (SMA20 > SMA200 x 1.06 and close > SMA200 x 1.03 -> 3); Basing = below SMA200, above SMA50 and within 0.8 % of SMA150 (the SMA200 slope rule is gone) | 87.4 % | 96.4 % (96.3 / 96.5 / 95.9 / 97.1 per day) |
| Stage, 200+ sessions (14-Nov) | Topping: SMA10 > SMA200 x 1.08 and close > SMA200 x 1.02, and a Topping STAYS while the close is below SMA50 (above SMA200); Basing: above SMA50, 0.5 % above SMA100, at most 10 % below SMA200. Basing 32 -> 44 / 50, Topping 389 -> 420 / 440, Uptrend 936 -> 973 / 1001, Downtrend 2033 -> 2038 / 2071. Young stocks unchanged (a search gave +1 of 486). The pasted 'Weinstein Stage Analysis' script (weekly 30 SMA, 5 % band) matched only 52.8 % | 95.2 % | 97.6 % |
| Stage, stocks with 64-199 sessions | own rule on SMA50 / SMA10 / SMA30 (the reference shows no SMA200 for them) | 67 % | 92 % |
| RS rating | stocks rated from the 11th session (return since the first session when younger than 3 months); percentile rounded down | 70.9 % within 3 | 80.4 % (88.1 % on stocks whose full history we have) |

Weights 0.4 / 0.2 / 0.2 / 0.2 were checked again: rank correlation 0.996 with the reference on mature stocks, no other
weights do better. What is left for the RS rating is mostly the **~204 stocks that came to NSE from BSE** in 2026 (first
NSE session 20-Apr or 17-Aug-2026, e.g. HAWKINCOOK, ELANTAS, NIRLON): the reference has their BSE history, we start at
their NSE listing. Their young scores move everybody's percentile by a few points. Fix = their BSE history (next step).

## Scanners re-tuned 07-Nov-2026 (part A; average over 02, 04, 05 and 06-Nov)

Recall = share of the reference list we also find; precision = share of our list that is on the reference list.
Rules are in config/scanners.json (each scanner's description says them in words).

| scanner | change | before (06-Nov) recall / precision | after (4 days) recall / precision |
|---|---|---|---|
| 1M Gainers | up >= 20 % in 21 sessions, today's turnover >= Rs 5 Cr, price >= Rs 20 | 0.59 / 0.68 | 1.00 / 0.96 |
| 3M Gainers | up >= 30 % in 63 sessions, Stage 2 / 3, turnover >= 5 Cr, price >= 20, mcap < 1 lakh Cr | 0.59 / 0.65 | 0.99 / 0.92 |
| Doublers | up >= 100 % in 1 YEAR (251 sessions), turnover >= 5 Cr | 0.37 / 0.37 | 0.99 / 0.93 |
| New Listing | IPO 28-365 days ago | 0.83 / 0.90 | 0.83 / 1.00 (rest: demergers / SME moves, needs the BSE step) |
| 20-SMA Pullback | 1M >= 15 %, close -2..+3 % of SMA20, SMA20 >= EMA50 x 1.025, turnover >= 10 Cr | 0 / 0 | 1.00 / 1.00 |
| 50-EMA Pullback | 6M >= 40 %, 3M > 0, 1M <= 5 %, close within 3 % of EMA50, EMA50 >= SMA200 x 1.2, turnover >= 10 Cr | 0 / 0 | 1.00 / 1.00 |
| High Volume | EVENT in the last 5 sessions (engine.events): up >= 2 x previous ADR, close in top 25 %, biggest volume of 63 sessions, no bigger volume since | 0.06 / 0.07 | 0.99 / 0.83 |
| Big Reversal | EVENT: high >= 13 % and close >= 12 % over the previous close, >= 3 x 20D volume, previous close >= 6 % under SMA200 | 0 / 0 | 1.00 / 0.53 |
| unchanged, already close | Trend Template 0.99 / 0.97, 4% Breakout 0.97 / 0.73, Outperformers 0.86 / 0.96 | | |

Part B (same day):

| scanner | change | before (06-Nov) | after (4 days) |
|---|---|---|---|
| Stage 2 Breakout | EVENT (6 sessions): close above the previous 50-day high on >= 2 x 20-day volume, close in top 25 %, Stage 2 | 0.30 / 0.43 | 0.96 / 0.88 |
| Recent Breakout | EVENT (4 sessions): close above an old resistance (swing high, +-8 bars, >= 26 sessions old, after a 20 % rise, no close above it since) on >= 2 x volume; now >= 5 % above it, Stage 2 | 0.21 / 0.21 | 0.93 / 0.93 |
| Shakeout | EVENT (5 sessions): intraday drop >= usual daily range ((high-low)/close, 20 days), low within 3 % of SMA50, recovered to the close before the drop within 2 sessions, uptrend | 0 / 0 | 0.93 / 0.57 |

Part C (same day; base levels are computed for the latest day only, engine.base_levels):

| scanner | rule | before (06-Nov) | after (4 days) |
|---|---|---|---|
| Daily Base | level = latest swing high (+-16 sessions), 22-84 sessions old, after a 20 % rise, no close above it since; depth 10-35 % and <= 8.5 x ADR(100); within 3 ADR(20) under it | 0.41 / 0.46 | 0.96 / 0.97 |
| Near Pivot | same level, up to 168 sessions old, depth 10-45 % (<= 8.5 x ADR100), within 1 ADR under it | 0.44 / 0.31 | 0.92 / 0.91 |
| Weekly Base | same on weekly candles (+-4 weeks, 17-71 weeks old), depth 10-45 % (<= 8.5 x ADR100), within 3 ADR | 0.28 / 0.24 | 0.96 / 0.79 |
| IPO Base | <= 30 sessions listed; level = listing-day high, moved to a later high when a close gets above it; >= 3 sessions since, <= 25 % deep, 0-8 % under it | 0 / 0 | 0.93 / 0.70 |

Part D (same day):

| scanner | rule | before | after (4 days) |
|---|---|---|---|
| RS before Price | today the RS line vs Nifty MidSmallcap 400 tops its previous 50-session high, close 0-10 % under its 50-session closing high (their RS index is not published; this one fits best of all NSE indices) | 0.08 / 0.06 | 0.68 / 0.93 |
| VCP, Tight Setups | NOT changed: the reference's swing rules could not be matched (its VCP joins or splits small swings case by case; lists of 2-11 stocks). Their pullback depths ARE reproduced for some stocks (AARTIPHARM 22.0 / 10.8 / 4.9 %) | 0 / 0, 0.25 / 0.11 | unchanged |

Earlier note - still to do: RS before Price (benchmark of their RS line not found yet; best
Nifty MidSmallcap 400, 68 / 93 %), Shakeout, Daily / Weekly Base, Near Pivot, VCP, Tight Setups, IPO Base. Earnings
scanners after the fundamentals are complete (~10-Nov). The reference's event scans keep an event 5 sessions ("age").

## Step 4 (07-Nov-2026): market cap, free float, beta, turnover (06-Nov export)

| field | change | before | after |
|---|---|---|---|
| Avg turnover 20D / 50D | volume x close averaged incl. today (was NSE traded value = volume x average price); tolerance 1 % or Rs 0.006 Cr (their values are rounded to 0.01 Cr) | 88.6 % / 89.5 % | 99.6 % / 99.1 % |
| Beta 1Y | 252 sessions up to the PREVIOUS day (was incl. today) | 74.5 % within 0.05 | 83.8 % (correlation 0.996) |
| Market cap | NSE answers the old share count for a few days after a split: when the stored face value is still the old one of a split / consolidation of the last 30 days, the count is scaled (GNRL, KMEW); and the count is asked again for 10 days after any share action | 90.2 % within 1 % | 90.3 % (the rest: 1-10 % apart, share-count dates differ) |
| Free float | unchanged = 100 - promoter %. Their promoter % equals ours for 95 %, but their free float is 100 - promoter only for 87 % (they also take out other holders, e.g. SUNPHARMA 45.5 vs NSE public 47.3 %) | 85.0 % within 0.5 pt | unchanged |

## VCP rebuilt (07-Nov-2026, with Viraj's VCP screenshots of 06-Nov)

The screenshots say "233 scanned" = the Trend Template list of that day: the reference looks for VCPs only among Trend
Template stocks (true on all 4 days). Rule found (engine.vcp_setup, config/indicators.yaml events.vcp_*):
pivot = highest high 15-34 sessions back with no close above it; L1 = lowest low after it; the last confirmed swing low
after L1 (3 % bounce) and the highest high before it give the 2nd pullback; the highest high after that low and the
lowest low since give the 3rd. Pullbacks must shrink, 1st <= 25 %, last <= 8 %, close <= 10 % under the pivot. It is an
EVENT: shown for 2 sessions from the day the VCP first appears, with that day's values (their "age"). Extra filters that
fit their lists: pivot within 7 % of the 52-week high, 2nd pullback <= 0.6 x the 1st.

Result (4 days, real pipeline): recall 0.875, precision 0.36 (was 0 / 0). For 21 of their 22 rows our age, three
pullback depths and pivot are EXACTLY theirs (SURAKSHA's middle pullback differs: 5.62 vs 3.96 %); GLOBAL is missed.
The extra stocks are valid VCPs by this rule that the reference does not list - its remaining filter is unknown.

## Step 6 (09-Nov-2026): fundamentals and earnings scanners (all 2,633 stocks read; 06-Nov export / 4 days)

| field | change | before | after |
|---|---|---|---|
| PAT used everywhere | net profit INCL. minority (their PAT = ours 92 %; owners' share 68 %) | | |
| ROE | year's net profit / net worth at the YEAR END (was the two-year average) | 59 % within 1 pt | 85 % |
| PEG | PE / latest quarter's EPS growth YoY (was 3-year EPS CAGR) | 2 % | 90 % |
| OPM (TTM) | (PBT + interest + depreciation - other income) / sales (was reported operating profit) | 60 % | 69 % |
| NP growth YoY / QoQ | PAT incl. minority | 69 % / 73 % | 85 % / 85 % |
| ROCE | EBIT / capital employed at the year end | 38 % | 45 % (their capital employed differs) |
| PB, debt / equity | unchanged: their net worth / debt come from another source (PB within 2 %: 21 %, median ratio 0.99) | 21 % / 34 % | unchanged |
| PE, EPS TTM, sales growth, holdings | unchanged | 86-95 % | |

Quarterly numbers of their earnings scans equal ours on the consolidated basis: EPS 91 %, sales 92 %, PAT 92 %.
New fields sales_g_q1..3, eps_g_q1..3, npm_q1..3 (q3 = latest quarter), eps_year_ago_q.

| scanner | rule | before | after (4 days) |
|---|---|---|---|
| Code 33 | sales growth, EPS growth (YoY, > 0) and net margin up in each of the last 3 quarters; results <= 100 days | 0.47 / 0.23 | 0.77 / 0.78 |
| EPS Accelerators | EPS growth up in each of the last 3 quarters (> 0, latest >= 20 %), sales up YoY in all 3; <= 100 days | 0.58 / 0.43 | 0.81 / 0.82 |
| Turnarounds | loss a year ago, profit now, profit up 2+ quarters in a row, sales +10 % YoY; <= 100 days | 0.21 / 0.21 | 0.80 / 0.85 |
| Earnings Explosion (id eps-doublers) | EPS +100 %, sales +50 %, PAT +75 % YoY; results <= 30 days | (not compared) | 0.71 / 0.75 |
| Earnings Gap | unchanged | 0.89 / 0.65 | 0.89 / 0.65 |

## BSE history (10-Nov-2026)

Joining BSE prices before a stock's first NSE day (706 clean joins) made RS within 3 points fall from 80 % to 74 % and,
for the 2026 BSE->NSE stocks, the 52-week high match fall to 39 %: the reference uses NSE days only. BSE prices are
therefore not used. The BSE list gives New Listing its filter: days_listed 28-365, not 60+ sessions on BSE before, not on
NSE's SME board before -> 0.95 / 0.985 (was 0.83 / 1.00).

## Tight Setups + RS before Price (10-Nov-2026, the 4 export days 02 / 04 / 05 / 06-Nov)

| scanner | rule | before | after (4 days) |
|---|---|---|---|
| Tight Setups | ANY of two modes. **rti**: RTI = (today's high-low - min) / (max - min) of the last 5 sessions' high-low x 100 (their `rti` column reproduced 14 / 14 exactly); 3-4 sessions in a row with RTI <= 18 (their lowest excluded 19, highest included 17.3), range of that run <= 5.5 % (their `max_range_pct`), SMA20 > EMA50 > SMA200, close > SMA200, close within +-5 % of SMA20, turnover today >= Rs 1 Cr (their `turnover_cr` = today's value). **box**: the longest window up to today with high-low range <= 0.8 x ADR20 (4+ sessions, 'tight') or <= 1 x ADR20 (5+, 'long') and net close change <= 25 % of the range (their `drift_pct`; bars / range / drift reproduced 6 / 6), 3-month return >= 20 %, SMA20 > EMA50, RS rating >= 80, listed 63+ sessions | 0.25 / 0.11 | 0.82 / 0.90 (every miss is CLCIND: frozen in their data, no prices here; without it recall 1.0) |
| RS before Price | unchanged rule (RS line vs Nifty MidSmallcap 400 above its previous 50-session high, close 0-10 % under its 50-session closing high). Their `rs_above_high` / `px_below_high` reproduced: benchmark confirmed; on 3 of 4 days their TODAY point used the PREVIOUS session's index close (a constant per-day ratio = yesterday / today index). Viraj chose "Reference jevu": config events.rsb_index_lag: 1 | 0.68 / 0.93 | 0.98 / 0.87 (11-02, when they used the fresh index, gives the extra stocks) |

Not matched: the reference's "spread" sub-mode (columns contraction / days_tight) - it only appears together with tight+long.
SME migrants (VTMLTD): the reference counts only main-board days (no 3-month return, RS 46-48 vs our 96) - a wider topic.

## Classic scans re-checked 14-Nov-2026 (video "Classic Scan 12-11-2026" + full exports 02 / 04 / 05 / 06-Nov)
The video was recorded during market hours on 12-Nov; its scan lists equal OUR 11-Nov results (the reference runs the
scans on the previous close and shows live prices): 151 / 156 visible sample stocks found, 20-SMA Pullback exact.
Precision / recall over the 4 export days (before -> after):

| Scan | Change | Before | After |
|---|---|---|---|
| 4% Breakout | RVol >= 2 (the reference never lists RVol < 2.0) | 0.71 / 0.97 | 0.94 / 0.96 |
| Outperformers | RS 1W >= 90, 1M >= 85, 3M >= 78 (at least; our 3M RS sits ~2 points apart) | 0.96 / 0.84 | 0.93 / 0.98 |
| Doublers | gain vs the close 252 sessions back (new field ret_252; the export's ref_date is 252 sessions back) | 0.89 / 0.95 | 0.93 / 0.99 |
| unchanged | Trend Template 0.97 / 0.99, 20-SMA Pullback 1.00 / 1.00, 1M Gainers 0.95 / 1.00, 3M Gainers 0.92 / 0.99, New Listing 0.98 / 0.95, Recent Breakout 0.93 / 0.91 | | |
| open | Stage 2 Breakout 0.88 / 0.98 and High Volume 0.83 / 0.99 (engine events: need a rebuild per day to tune) | | |

11-Nov video after the change: 4% Breakout 75 vs 77 (16 / 16 samples), Outperformers 31 vs 31.


## Stage 2 Breakout / High Volume re-checked 14-Nov-2026 (exports 02 / 04 / 05 / 06-Nov)
- Stage 2 Breakout: the reference pivot = our 50-day high and its RVol = ours. Our extra stocks sat deep inside long
  Stage 2 runs that came from Stage 4. New rule: Stage 2 entered at most 6 sessions before (s2b_entered) OR the
  Stage 2 run started from Basing / Topping (s2b_from). Real engine: precision 0.88 -> 0.95, recall 0.98 -> 0.95.
- High Volume: unchanged (0.83 / 0.99). Reference ADR = ours; move, close position and volume of matched and extra
  stocks overlap; no extra condition beat the current F1 (best 0.903 vs 0.902).

## Market breadth re-checked 15-Nov-2026 (Viraj's screenshots of the reference, liquid stocks)
Reference points: 52W highs / lows 16-Sep 12 / 89, 23-Oct 5 / 280, 30-Oct 24 / 105, 11-Nov 40 / 2; 20D highs / lows 30-Oct
76 / 309, 13-Nov 213 / 33; 4 % movers 13-Nov 52 / 53, 5-day ratio to 06-Nov 2.73 (avg 197 up / 72 down); breakouts judged
13-Nov 24 held / 16 failed, follow-through >= 5 % 12, "68 % held this week"; 30-Oct 6 / 8, "27 %"; liquid stocks 1,508.

| Item | Change | Before | After (real build, 15-Nov) |
|---|---|---|---|
| 52W highs / lows | the day's high (low) AT the highest (lowest) of 252 sessions incl. today, only stocks with 200+ sessions (young listings counted every new high / low before) | 15/108, 8/321, 28/114, 54/3 | 13/87, 6/277, 29/104, 46/2 |
| 20D highs / lows | same over 20 sessions incl. today (was: beyond the previous 20) | 68/307, 200/28 | 76/311, 214/31 |
| Liquid universe | also 30+ sessions of history (a full 30-session turnover median) | 1,534 | 30-Oct 1,512 (ref 1,507), 13-Nov 1,514 (ref 1,508) |
| Breakouts | "4 % breakout": up 4 %+ on volume above the day before and >= 100,000 shares; judged 5 sessions later: held = close above the breakout day's close, else failed; follow-through = >= 5 % above it (was: close above the 50-session high, held = above that level) | 13-Nov 16 / 2 | 13-Nov 24 / 19, FT 13, 68 % this week; 30-Oct 6 / 9, 22 % |
| 4 % movers | unchanged rule (the universe change moves it) | 13-Nov 62 / 54 | 13-Nov 55 / 52, 30-Oct 40 / 340 (ref 40 / 338) |
| 5-day ratio | unchanged (06-Nov 2.75, avg 197 / 72) | | |

Tried and rejected: close-based highs / lows (half the count), 4 % breakout with RVol >= 1.5 / 2 (too few: 19-21 held),
failed = below the close before the breakout (13-Nov only 1 failed). Labels (our words where the reference shows none):
4 % ratio >= 2 Strong buying, >= 1.25 More buying, > 0.8 Balanced, > 0.5 More selling, else Heavy selling; A-D line
"Line rising / falling" vs 5 sessions before.

## Groups table re-checked 15-Nov-2026 (Viraj's video "Check Sector Rotation the Easy Way", data through Thu 12-Nov)
Reference points read from the video: 21 sector ranks with MED 1Y, 28 industry and 14 theme ranks with rank changes,
group counts (Sectors 21 of 23, Industries 84 of 173, Themes 76 of 96), Healthcare's industries (stocks, MED 1Y, > 50 SMA).

| Finding | Before | After (rebuilt 12-Nov) |
|---|---|---|
| MED (median member return) = LIQUID members only (sector MED 1Y error) | 9.0 points (all members) | 1.6 points |
| Rank on returns of members liquid the day before (market = liquid stocks too), strength 63 sessions as before | sector 0.79, theme 0.79, industry 0.79 (Spearman) | sector 0.91, theme 0.93, industry 0.76 |
| Small group = fewer than 6 liquid members (shown groups) | 23 / 87 / 83 | 22 / 73 / 77 (reference 21 / 84 / 76) |
| Healthcare stocks counted / 20D highs-lows | 182 / 38-2 | 139 / 29-1 (reference 129 / 26-0) |

Rank change: 5 sessions kept (10 / 15 / 21 tried; themes fit best at 5, e.g. Banking +36 vs ours +31, NBFC +16 / +13,
GCC +9 / +8), correlation over the shown movers only 0.15-0.26 (the reference's top movers are not all ours).
Industries: the reference uses its own 173-industry list (e.g. "Jewellery & Watches", "Cars & UVs", "Commercial
Services"); ours is NSE's basic industry (195), so 6 of its names have no match and industry ranks stay ~0.76.
avg_* (all members) and rank_1m are unchanged: the stock export's group fields were matched on all members (S9).

## Phase 2 - price and day columns vs the 9 reference exports (17-Nov-2026)
23,363 stock-days compared (02, 04, 05, 06, 09, 11, 12, 13, 16-Nov) with our raw NSE bhavcopy rows, adjusted series and
delivery files. The 8 end-of-day exports (all but 02-Nov):

| Column | Match | Note |
|---|---|---|
| price (close), open, high, low | 100 % | |
| volume, pxv (volume x price) | 100 % | adjusted volume differs only after a later split / bonus (7 stocks) |
| day_change_abs | 100 % | our chg_1d_rs |
| day_change, gap_up | 99.99 % | 2 ex-dates: the reference uses the ADJUSTED previous close (as our engine) |
| prev_close | 99.97 % | 6 ex-dates: NSE's bhavcopy PREVCLOSE is not adjusted, the reference's (and ours) is |
| circuit | 99.27 % | 7 band changes: the reference shows the band in force on the data day (NSE sec_list of the session before), we show NSE's newest (next session); 12 = stocks not traded on NSE |
| deliv_pct_1d | 100 % vs OUR PREVIOUS session | the reference shows the previous session's delivery %; we show the same session's |

Viraj's choice (17-Nov): keep NSE's newest for delivery % and circuit. The 02-Nov export is not end of day: its price
column does not even agree with its own day_change (RELIANCE price 1287.80, prev 1164.90, day_change -0.94). 160
stock-days have no NSE row (not traded on NSE: WILLAMAGOR, ELCIDIN, NAGAFERT ...); the export repeats an old price.

## Phase 3 - returns, highs / lows, listing vs the 9 reference exports (17-Nov-2026)
New engine computed for every stock on all 9 days (one pass, adjusted prices of 16-Nov); match within 0.05 pt (returns),
half a paisa (prices), exact (days). Weighted over the 8 end-of-day exports:

| Column | Before | After | Change |
|---|---|---|---|
| ret_1y | 3.5 % | 98.4 % | 252 sessions (was 251, fitted before the special sessions were in the data) |
| ret_1w / 10d / 1m / 3m / 6m / ytd | 99.9 / 99.8 / 99.7 / 99.4 / 99.1 / 98.8 % | same | - |
| high_20d / low_20d | 99.5 % | 99.7 % | empty before 20 sessions (min_periods 20) |
| high_52w / low_52w | 98.0 / 98.3 % | 98.3 / 98.9 % | 252 sessions but none older than 400 calendar days (stocks back on NSE after years: GOODYEAR, KSE, LAKSHMIMIL reached years back) |
| days_from_52w_high | 98.7 % | 99.0 % | same window |
| ret_since_ipo / from_listing_high (new) | - | 95.5 % | close / listing day's open (high) - 1, listings since 2023-01-01; listing days shared by 20+ stocks (bulk admissions of old BSE stocks, 20-Apr / 17-Aug-2026) left out: 554 of the reference's 558 stocks found |
| ath / from_ath | 73 % | 73 % | kept: the reference's "ATH" is the high since 1-Jan-2023 (99 % equal to that); ours is the true all-time high (Viraj 17-Nov) |

The remaining 1-2 % are mostly rights issues: we adjust old prices (TERP), the reference does not (undoing rights would
give 52W high 99.0 %); Viraj 17-Nov: keep adjusting. A few are its data errors (e.g. VIVIANA's 3:5 bonus not adjusted).
ipo_days = our days_listed (the reference uses the listing date for every stock).

## Phase 4 - averages, RSI, ADR, volume, beta vs the 9 reference exports (17-Nov-2026)
Same method as Phase 3 (new engine, all 9 days; prices / volumes within 0.1 %, percents 0.05 pt, RSI 0.06, ratios 0.01).
Weighted over the 8 end-of-day exports, after the changes below:

| Column | Match | Note |
|---|---|---|
| sma10 / sma20 / sma200 / ema50 | 99.7 / 99.6 / 98.9 / 99.2 % | ema50 was 98.4 % |
| from_sma10 / 20 / 50 / 200 / from_ema50 | 99.8 / 99.7 / 99.5 / 98.9 / 99.3 % | |
| rsi | 99.2 % | was 98.7 % |
| adr_20, rvol, vol_chg_1d, vol_vs_avg50 | 99.8, 99.5, 100, 99.0 % | |
| avg_vol_20 / avg_vol_50 | 99.5 / 98.8 % | the reference rounds them to whole shares (97.8 % unrounded) |
| rupee_vol_20 / 50 | 99.6 / 99.1 % | |
| beta | 92.8 % (96.7 % on 13-Nov) | formula confirmed (Nifty 50, daily, 252 sessions up to the previous day: best of 16 variants); the rest are mostly illiquid stocks |

Changes (swingdash/engine.py): a stock back on NSE after more than 365 days without trading (the bulk re-admissions of
20-Apr / 17-Aug-2026: LAKSHMIMIL, KOVAI, ARIHANT, GOODYEAR ...) starts afresh - averages, RSI, returns, 52W from its
return, exactly like the reference; its all-time high still counts the old sessions (config/indicators.yaml
restart_gap_days). Beta leaves out the move across a 30+ day gap and, after a long gap, uses only the last 400 days.
The remaining 1 % are split / bonus / rights days and stocks with short trading gaps.

## Phase 5 - size, float, F&O, holders vs the reference exports (17-Nov-2026)
16-Nov export vs our 16-Nov snapshot (the older snapshots carried an older stock master):

| Column | Match | Cause of the rest |
|---|---|---|
| is_fno | 100 % | |
| market_cap_cr | 83.7 % | prices equal; the SHARE COUNT differs for 425 stocks (median 1 %): ours is NSE's issued size, the reference often an old count (EVONILE before its 5:12 rights issue of 11-Nov, PIIND 18.7 cr vs the real 15.2 cr) |
| free_float_pct | 89.4 -> 89.7 % | = 100 - promoter % in both; 284 stocks have no NSE shareholding pattern (old BSE stocks admitted to NSE in 2026, BSE filers such as ABBOTINDIA): now the results filing's promoter share before NSE's free-float estimate; the rest need BSE's shareholding |
| float_shares_cr (new) | 82.8 % within 1 % | shares x free float; follows the two above |
| promoter_pct | 96.1 % | NSE pattern vs filing timing |
| fii_pct / dii_pct, fii_chg_q / dii_chg_q | 92.2 / 93.5 %, 89.5 / 91.3 % | 2,157 of 2,356 equal our NEWEST quarter; 133 show the reference's previous quarter (it has not taken Sep-2026 yet), 64 differ otherwise |

Phase 5, part 2 (same day): BSE shareholding for the stocks NSE has none for (scripts/fetch_bse_shareholding.py, PC): 263
stocks, 1,281 quarters (12 have no BSE code: REITs, ...). fundamentals.metrics now gives the holder fields from the
shareholding patterns even when the stock has no results filed with NSE (shp_fields). Against the 16-Nov export: free
float 89.4 -> 96.1 %; promoter / FII / DII now for 2,595 stocks (was 2,360) at 95.4 / 91.5 / 92.8 % - the newly covered
stocks often show the reference's previous quarter. All 9 days: holders match better each day as the reference adds
the Sep-2026 quarter (FII 65 % on 02-Nov -> 92 % on 16-Nov); market cap 91.7 % on 04-Nov but 83.8 % on 16-Nov because the
reference changed 222 share counts in between - NSE (asked again 17-Nov: ABFRL 122.05 cr, AMBER 3.527 cr, AFCONS 36.78 cr,
PIIND 15.17 cr) confirms ours.

