# Formulas - every field of the dashboard

Made from `config/fields.yaml` by `scripts/make_formulas_doc.py` (do not edit by hand). All prices are ADJUSTED for splits, bonus, rights and demergers unless a field says "as traded". Settings: `config/indicators.yaml`, `config/stage.yaml`, `config/settings.yaml`. Calibration against the reference app: `docs/calibration.md`.

Current phase: **S9**. Fields: **322**.

## Sources

- **equity_list**: NSE EQUITY_L.csv - every main-board equity (symbol, name, ISIN, series, listing date)
- **nifty500_list**: niftyindices.com ind_nifty500list.csv - Nifty 500 members (also REITs)
- **symbol_changes**: NSE symbolchange.csv + config/symbol_changes_extra.csv (renames NSE's file misses)
- **bhavcopy**: NSE daily bhavcopy - raw open, high, low, close, previous close, volume, turnover, series, ISIN
- **corporate_actions**: NSE corporate actions API + config/corporate_action_overrides.csv
- **index_history**: NSE index files / API, BSE index CSV (PC only)
- **nse_quote**: NSE GetQuoteApi - sector levels, index list, shares issued, face value, NSE free-float market cap
- **shareholding**: NSE shareholding pattern (promoter & promoter group %, quarter)
- **fno_list**: NSE fo_mktlots.csv - stocks with futures & options
- **price_bands**: NSE sec_list.csv - today's price band (circuit limit)
- **pattern_settings**: config/patterns.yaml (pattern detector parameters)
- **ipo_list**: NSE api/public-past-issues - main-board IPOs with listing date and issue price
- **theme_rules**: config/theme_rules.yaml - our theme lists (NSE thematic indices, NSE industries, hand-picked)
- **mto**: NSE MTO_ddmmyyyy.DAT - security-wise delivery position, every trading day from 2007
- **settings**: config/settings.yaml (parameters such as the liquid rule)
- **indicator_settings**: config/indicators.yaml and config/stage.yaml (engine parameters)
- **results_filings**: NSE XBRL results filings (corporates-financial-results Quarterly + Annual lists, integrated filings from 2025) -> data/fundamentals/<SYMBOL>.json
- **shareholding_xbrl**: NSE shareholding pattern XBRL (corporate-share-holdings-master) -> data/fundamentals/<SYMBOL>.json
- **results_calendar**: NSE api/event-calendar (board meetings for results) -> data/meta/results_calendar.csv

## Fields of existing dashboard (before the scanner plan)

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `id` | Folder id | text | Symbol made safe as a folder name | symbol | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `symbol` | Symbol | text | Current NSE symbol (older symbols followed through renames) | equity_list, symbol_changes | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `name` | Company | text | Company name as NSE lists it | equity_list | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `kind` | Kind | text | stock or index |  | data/snapshot/latest.json |
| `exchange` | Exchange | text | NSE or BSE |  | data/snapshot/latest.json |
| `category` | Index category | text | NSE / BSE index group (indices only) | index_history | data/snapshot/latest.json |
| `n500` | Nifty 500 | boolean | Member of the Nifty 500 today | nifty500_list | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `macro` | Macro sector | text | NSE classification level 1 | nse_quote | data/snapshot/latest.json |
| `sector` | Sector | text | NSE classification level 2 (Nifty 500 list industry when NSE gives none) | nse_quote, nifty500_list | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `industry` | Industry | text | NSE classification level 3 | nse_quote | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `basic_industry` | Basic industry | text | NSE classification level 4 | nse_quote | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `first_date` | History from | date | First stored trading day | bhavcopy, index_history | data/meta/stocks.csv, data/snapshot/latest.json |
| `date` | Date | date | Trading day of the row (snapshot: the latest row) | bhavcopy, index_history | data/snapshot/screen.json, data/snapshot/latest.json, data/stocks/delivery/<ID>/, data/groups/<level>/<id>/ |
| `stale` | Stale | boolean | Latest row more than 10 days older than the newest data date | date | data/snapshot/screen.json, data/snapshot/latest.json |
| `raw_close` | Close (as traded) | rupees | Last close as traded, not adjusted | bhavcopy | data/snapshot/screen.json, data/meta/stocks.csv, data/snapshot/latest.json |
| `close` | Close | rupees | Last close ADJUSTED for splits, bonus, rights, demergers | bhavcopy, corporate_actions | data/snapshot/screen.json, data/snapshot/latest.json |
| `chg_1d` | 1D % | percent | close / close 1 session ago - 1 | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `chg_1w` | 1W % | percent | close / close 5 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_1m` | 1M % | percent | close / close 21 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_3m` | 3M % | percent | close / close 63 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_6m` | 6M % | percent | close / close 126 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_1y` | 1Y % | percent | close / close 252 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_3y` | 3Y % | percent | close / close 756 sessions ago - 1 | close | data/snapshot/latest.json |
| `chg_5y` | 5Y % | percent | close / close 1260 sessions ago - 1 | close | data/snapshot/latest.json |
| `hi52` | 52W high | rupees | Highest adjusted high of the last 252 sessions | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `lo52` | 52W low | rupees | Lowest adjusted low of the last 252 sessions | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `from_hi52` | From 52W high % | percent | close / hi52 - 1 | close, hi52 | data/snapshot/screen.json, data/snapshot/latest.json |
| `from_lo52` | From 52W low % | percent | close / lo52 - 1 | close, lo52 | data/snapshot/screen.json, data/snapshot/latest.json |
| `volume` | Volume | integer | Shares traded today (adjusted for splits / bonus) | bhavcopy, corporate_actions | data/snapshot/screen.json, data/snapshot/latest.json |
| `avg_vol20` | Avg volume 20D | integer | Average volume of the last 20 sessions | volume | data/snapshot/screen.json, data/snapshot/latest.json |
| `vol_ratio` | Volume / 20D avg | number | volume / avg_vol20 | volume, avg_vol20 | data/snapshot/latest.json |
| `ema10` | EMA 10 | rupees | Exponential average of close, alpha = 2/(10+1) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `ema20` | EMA 20 | rupees | Exponential average of close, alpha = 2/(20+1) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `ema50` | EMA 50 | rupees | Exponential average of close, alpha = 2/(50+1) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `ema200` | EMA 200 | rupees | Exponential average of close, alpha = 2/(200+1) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `rsi14` | RSI 14 | number | Wilder RSI over 14 sessions | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `macd` | MACD | number | EMA12(close) - EMA26(close) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `macd_signal` | MACD signal | number | EMA9 of macd | macd | data/snapshot/screen.json, data/snapshot/latest.json |
| `macd_hist` | MACD histogram | number | macd - macd_signal | macd, macd_signal | data/snapshot/screen.json, data/snapshot/latest.json |
| `atr14` | ATR 14 | rupees | Wilder average of true range over 14 sessions | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `atr_pct` | ATR % | percent | atr14 / close | atr14, close | data/snapshot/screen.json, data/snapshot/latest.json |
| `trend` | Trend | text | From close vs EMA20 / EMA50 / EMA200 (up, down, sideways) | close, ema20, ema50, ema200 | data/snapshot/latest.json |
| `rs_3m` | RS vs index 3M % | percent | Stock 63-session return minus benchmark's (Nifty 50 / Sensex) | close, index_history | data/snapshot/latest.json |
| `rs_6m` | RS vs index 6M % | percent | Stock 126-session return minus benchmark's | close, index_history | data/snapshot/latest.json |
| `rs_rating` | RS rating | integer | Percentile 1-99 (rounded down) of 0.4 x 3M + 0.2 x 6M + 0.2 x 9M + 0.2 x 12M return among all stocks; younger stocks: the periods they have, under 3M the return since their first session (from the 11th session) | close | data/snapshot/screen.json, data/snapshot/latest.json |
| `flags` | Flags | list | Simple signals: 52W / 20D breakout or breakdown, above EMA50 & 200, RSI 50-70, near 52W high, volume spike, strong RS | close, hi52, ema50, ema200, rsi14, vol_ratio, rs_rating | data/snapshot/latest.json |

## Fields of phase S1

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `isin` | ISIN | text | ISIN of the share | equity_list | data/meta/stocks.csv |
| `series` | Series | text | NSE series: EQ normal, BE / BZ trade-for-trade, RR REIT | equity_list | data/snapshot/screen.json, data/meta/stocks.csv |
| `listed` | Listing date | date | Date of listing on NSE (from NSE's list) | equity_list | data/snapshot/screen.json, data/meta/stocks.csv |
| `fno` | F&O stock | boolean | Has futures & options on NSE today | fno_list | data/snapshot/screen.json, data/meta/stocks.csv |
| `price_band` | Price band % | text | Today's circuit limit: 2 / 5 / 10 / 20 % or No Band | price_bands | data/snapshot/screen.json, data/meta/stocks.csv |
| `last_date` | Last trade | date | Last stored trading day | bhavcopy | data/meta/stocks.csv |
| `sessions` | Sessions stored | integer | Number of stored trading days | bhavcopy | data/meta/stocks.csv |
| `status` | Status | text | active = traded within 10 days of the newest trading day; inactive = not since; no_history = nothing stored | last_date | data/meta/stocks.csv |
| `face_value` | Face value | rupees | Face value per share | nse_quote | data/meta/stocks.csv |
| `shares` | Shares issued | integer | Shares issued (NSE issuedSize); asked again after a split, bonus, rights or consolidation | nse_quote, corporate_actions | data/snapshot/screen.json, data/meta/stocks.csv |
| `promoter_pct` | Promoter holding % | percent | Promoter & promoter group % of the newest shareholding pattern | shareholding | data/meta/stocks.csv |
| `float_pct` | Free float % | percent | 100 - promoter_pct (NSE's own free-float % when no shareholding pattern) | promoter_pct, nse_quote | data/snapshot/screen.json, data/meta/stocks.csv |
| `mcap_cr` | Market cap (Rs Cr) | crore | shares x raw_close / 1e7 | shares, raw_close | data/snapshot/screen.json, data/meta/stocks.csv |
| `float_mcap_cr` | Float market cap (Rs Cr) | crore | mcap_cr x float_pct / 100 | mcap_cr, float_pct | data/snapshot/screen.json, data/meta/stocks.csv |
| `turnover_med30_cr` | Median turnover 30D (Rs Cr) | crore | Median of daily turnover over the last 30 sessions / 1e7 | bhavcopy | data/meta/stocks.csv |
| `turnover_avg30_cr` | Avg turnover 30D (Rs Cr) | crore | Average of daily turnover over the last 30 sessions / 1e7 | bhavcopy | data/meta/stocks.csv |
| `liquid` | Liquid | boolean | status = active AND turnover_med30_cr >= 1 AND raw_close >= 5 (numbers in settings.yaml -> liquid) | status, turnover_med30_cr, raw_close, settings | data/snapshot/screen.json, data/meta/stocks.csv |
| `shares_fetched` | Share count date | date | Day the share count was asked from NSE | nse_quote | data/meta/stocks.csv |

## Fields of phase S2

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `deliv_qty` | Delivery qty | integer | Deliverable quantity of the day as traded (not split-adjusted) | mto | data/stocks/delivery/<ID>/ |
| `deliv_pct` | Delivery % | percent | Deliverable quantity / traded quantity x 100 (NSE's figure) | mto | data/stocks/delivery/<ID>/, data/snapshot/screen.json |

## Fields of phase S3

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `group_ret_mean` | Group return (equal weight) | percent | Average one-day return of the group's members that were liquid the day before (moves beyond +-50 % left out) | close, liquid, sector, basic_industry, theme_rules | data/groups/<level>/<id>/ |
| `group_ret_median` | Group median return | percent | Median one-day return of the same members | close, liquid, sector, basic_industry, theme_rules | data/groups/<level>/<id>/ |
| `group_index` | Group index | number | 1000 x cumulative product of (1 + group_ret_mean) from the first day with >= 3 counted members | group_ret_mean | data/groups/<level>/<id>/ |
| `group_members` | Members counted | integer | Members that counted that day | liquid | data/groups/<level>/<id>/ |

## Fields of phase S4

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `open` | Open | rupees | Day's open, adjusted | bhavcopy, corporate_actions | data/snapshot/screen.json |
| `high` | Day high | rupees | Day's high, adjusted | bhavcopy, corporate_actions | data/snapshot/screen.json |
| `low` | Day low | rupees | Day's low, adjusted | bhavcopy, corporate_actions | data/snapshot/screen.json |
| `prev_close` | Previous close | rupees | Adjusted close of the previous session | close | data/snapshot/screen.json |
| `chg_1d_rs` | 1D change Rs | rupees | close - prev_close | close, prev_close | data/snapshot/screen.json |
| `gap_up` | Gap up % | percent | (open / prev_close - 1) x 100 | open, prev_close | data/snapshot/screen.json |
| `ret_1w` | 1W change % | percent | (close / close 5 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_10d` | 10D change % | percent | (close / close 10 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_1m` | 1M change % | percent | (close / close 21 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_3m` | 3M change % | percent | (close / close 63 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_6m` | 6M change % | percent | (close / close 126 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_1y` | 1Y change % | percent | (close / close 251 sessions ago - 1) x 100 | close | data/snapshot/screen.json |
| `ret_ytd` | YTD % | percent | (close / last close of the previous calendar year - 1) x 100 | close | data/snapshot/screen.json |
| `sma10` | SMA 10 | rupees | Average of the last 10 closes | close | data/snapshot/screen.json |
| `sma20` | SMA 20 | rupees | Average of the last 20 closes | close | data/snapshot/screen.json |
| `sma50` | SMA 50 | rupees | Average of the last 50 closes | close | data/snapshot/screen.json |
| `sma150` | SMA 150 | rupees | Average of the last 150 closes | close | data/snapshot/screen.json |
| `sma200` | SMA 200 | rupees | Average of the last 200 closes | close | data/snapshot/screen.json |
| `ema21` | EMA 21 | rupees | Exponential average of close, alpha = 2/(21+1) | close | data/snapshot/screen.json |
| `from_sma10` | From 10 SMA % | percent | (close / sma10 - 1) x 100 | close, sma10 | data/snapshot/screen.json |
| `from_sma20` | From 20 SMA % | percent | (close / sma20 - 1) x 100 | close, sma20 | data/snapshot/screen.json |
| `from_sma50` | From 50 SMA % | percent | (close / sma50 - 1) x 100 | close, sma50 | data/snapshot/screen.json |
| `from_sma200` | From 200 SMA % | percent | (close / sma200 - 1) x 100 | close, sma200 | data/snapshot/screen.json |
| `from_ema50` | From 50 EMA % | percent | (close / ema50 - 1) x 100 | close, ema50 | data/snapshot/screen.json |
| `high_20d` | 20D high | rupees | Highest high of the last 20 sessions (incl. today) | close | data/snapshot/screen.json |
| `low_20d` | 20D low | rupees | Lowest low of the last 20 sessions (incl. today) | close | data/snapshot/screen.json |
| `ath` | All-time high | rupees | Highest adjusted high since 2007 (or listing) | close | data/snapshot/screen.json |
| `from_ath` | From ATH % | percent | (close / ath - 1) x 100 | close, ath | data/snapshot/screen.json |
| `days_since_hi52` | Days since 52W high | integer | Calendar days since the day of the highest high of the last 252 sessions | hi52 | data/snapshot/screen.json |
| `avg_vol50` | Avg volume 50D | integer | Average volume of the last 50 sessions incl. today | volume | data/snapshot/screen.json |
| `rvol` | Relative volume | number | volume / avg_vol20 (avg_vol20 = previous 20 sessions) | volume, avg_vol20 | data/snapshot/screen.json |
| `vol_vs_avg50` | Volume / 50D avg | number | volume / avg_vol50 | volume, avg_vol50 | data/snapshot/screen.json |
| `vol_chg_1d` | Volume change vs prev day % | percent | (volume / previous volume - 1) x 100 | volume | data/snapshot/screen.json |
| `high_volume` | High-volume day | boolean | volume >= 1.5 x avg_vol20 (settings: volume.high_volume_x) | volume, avg_vol20, indicator_settings | data/snapshot/screen.json |
| `hve` | HVE | boolean | Highest volume ever (since 2007) | volume | data/snapshot/screen.json |
| `hvy` | HVY | boolean | Highest volume of the last 252 sessions | volume | data/snapshot/screen.json |
| `hvq` | HVQ | boolean | Highest volume of the last 63 sessions | volume | data/snapshot/screen.json |
| `lvy` | Lowest volume of the year | boolean | Lowest volume of the last 252 sessions | volume | data/snapshot/screen.json |
| `lvq` | Lowest volume of the quarter | boolean | Lowest volume of the last 63 sessions | volume | data/snapshot/screen.json |
| `pocket_pivot` | Pocket pivot | boolean | Up day whose volume beats the volume of every down day of the previous 10 sessions | close, volume, indicator_settings | data/snapshot/screen.json |
| `dry_up` | Volume dry-up | boolean | Lowest volume of the last 10 sessions and below 0.5 x avg_vol50 | volume, avg_vol50, indicator_settings | data/snapshot/screen.json |
| `turnover_cr` | Turnover (Rs Cr) | crore | NSE traded value of the day / 1e7 | bhavcopy | data/snapshot/screen.json |
| `turnover_avg20_cr` | Avg turnover 20D (Rs Cr) | crore | Average of volume x close (Rs Cr) over the last 20 sessions incl. today | close, volume | data/snapshot/screen.json |
| `turnover_avg50_cr` | Avg turnover 50D (Rs Cr) | crore | Average of volume x close (Rs Cr) over the last 50 sessions incl. today | close, volume | data/snapshot/screen.json |
| `mfi14` | MFI 14 | number | Money Flow Index: TP = (H+L+C)/3, flow = TP x volume; 100 - 100 / (1 + sum of up-flows / sum of down-flows over 14) | close, volume | data/snapshot/screen.json |
| `adr_pct` | ADR % (20) | percent | 100 x (average of high/low over 20 sessions - 1) | close | data/snapshot/screen.json |
| `bb_mid` | Bollinger middle | rupees | SMA 20 of close | close | data/snapshot/screen.json |
| `bb_upper` | Bollinger upper | rupees | bb_mid + 2 x population standard deviation of the last 20 closes | bb_mid | data/snapshot/screen.json |
| `bb_lower` | Bollinger lower | rupees | bb_mid - 2 x population standard deviation of the last 20 closes | bb_mid | data/snapshot/screen.json |
| `supertrend` | Supertrend | rupees | ATR(10, Wilder) trailing band 3 x ATR from (H+L)/2 that only tightens; flips on a close through it | close, indicator_settings | data/snapshot/screen.json |
| `supertrend_dir` | Supertrend direction | integer | +1 = band below price (up), -1 = above (down) | supertrend | data/snapshot/screen.json |
| `swing_fast` | Swing band fast (T3 8) | rupees | Tillson T3 of close, length 8, volume factor 0.65 (six EMAs combined) | close, indicator_settings | data/snapshot/screen.json |
| `swing_slow` | Swing band slow (T3 14) | rupees | Tillson T3 of close, length 14, volume factor 0.65 | close, indicator_settings | data/snapshot/screen.json |
| `swing_up` | Swing bands up | boolean | swing_fast > swing_slow (green band) | swing_fast, swing_slow | data/snapshot/screen.json |
| `rel_ext` | Relative extension | number | ext = (close / SMA50 - 1) x 100, scaled by the largest ext on the same side in the last 250 sessions: +100 = as stretched above as ever, -100 = as far below | close, indicator_settings | data/snapshot/screen.json |
| `trend_intensity` | Trend intensity | number | SMA7 / SMA65 x 100 (>105 strong up, <95 strong down) | close | data/snapshot/screen.json |
| `rs_line_nifty_50` | RS line vs Nifty 50 | number | close / Nifty 50 close (same day) | close, index_history | data/snapshot/screen.json |
| `rs_line_nifty_500` | RS line vs Nifty 500 | number | close / Nifty 500 close (same day) | close, index_history | data/snapshot/screen.json |
| `rs_line_nifty_midcap_150` | RS line vs Nifty Midcap 150 | number | close / Nifty Midcap 150 close (same day) | close, index_history | data/snapshot/screen.json |
| `rs_line_nifty_smallcap_250` | RS line vs Nifty Smallcap 250 | number | close / Nifty Smallcap 250 close (same day) | close, index_history | data/snapshot/screen.json |
| `rs_line` | RS line | number | close / benchmark close; benchmark = Nifty Smallcap 250 (settings: benchmark) | close, index_history, indicator_settings | data/snapshot/screen.json |
| `rs_line_52w_high` | RS line at 52W high | boolean | rs_line >= its highest value of the last 252 sessions | rs_line | data/snapshot/screen.json |
| `rs_new_high_before_price` | RS new high before price | boolean | rs_line_52w_high and today's high below hi52 (price not at a new high) | rs_line_52w_high, hi52 | data/snapshot/screen.json |
| `mansfield_rs` | Mansfield RS | number | (rs_line / its 52-week (260-session) average - 1) x 100 | rs_line | data/snapshot/screen.json |
| `beta_1y` | Beta 1Y vs Nifty 50 | number | Covariance / variance of daily returns vs Nifty 50 over the 252 sessions up to the previous day | close, index_history | data/snapshot/screen.json |
| `stage` | Stage | text | 1 Basing, 2A Early uptrend, 2 Uptrend, 3 Topping, 4 Downtrend, 4A Improving: above SMA200 = 2 (3 when below SMA50 after an extended run: SMA20 > SMA200 x 1.06, close > SMA200 x 1.03); below SMA200 = 1 when above SMA50 and SMA150, else 4 / 4A; under 200 sessions SMA50 / SMA10 / SMA30 (config/stage.yaml) | close, indicator_settings | data/snapshot/screen.json |
| `rs_score` | RS score | number | 0.4 x 3M + 0.2 x 6M + 0.2 x 9M + 0.2 x 12M return (63/126/189/252 sessions; younger stocks: the periods they have) | close | data/snapshot/screen.json |
| `liquid_day` | Liquid that day | boolean | Median turnover of the last 30 sessions >= Rs 1 Cr and raw close >= Rs 5 (same day) | turnover_cr, raw_close, settings | data/snapshot/screen.json |
| `rs_rating_1w` | RS rating 1 week | integer | Percentile rank 1-99 of ret_1w among all stocks that day | ret_1w | data/snapshot/screen.json |
| `rs_rating_1m` | RS rating 1 month | integer | Percentile rank 1-99 of ret_1m among all stocks that day | ret_1m | data/snapshot/screen.json |
| `rs_rating_3m` | RS rating 3 months | integer | Percentile rank 1-99 of ret_3m among all stocks that day | ret_3m | data/snapshot/screen.json |
| `rs_chg_1w` | RS rating change 1W | integer | rs_rating - rs_rating 5 sessions ago | rs_rating | data/snapshot/screen.json |
| `rs_chg_1m` | RS rating change 1M | integer | rs_rating - rs_rating 21 sessions ago | rs_rating | data/snapshot/screen.json |
| `rs_rating_1m_ago` | RS rating 1M ago | integer | rs_rating 21 sessions ago | rs_rating | data/snapshot/screen.json |

## Fields of phase S5

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `days_listed` | Days Since Listing | integer | Calendar days from the NSE listing date to the data date | listed | site, data/snapshot/screen.json |
| `bse_before` | Traded on BSE before NSE | boolean | The stock traded on BSE for 60+ sessions before its first NSE session (data/meta/bse_history.csv) | listed | data/snapshot/screen.json |
| `nse_before` | Traded on NSE before the listing date | boolean | First NSE trading day more than 5 days before the main-board listing date (e.g. on the SME board before) | listed | data/snapshot/screen.json |

## Fields of phase S6

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `ipo_date` | IPO Listing Date | date | Listing day of the stock's IPO on NSE's main board (NSE past issues; renames followed) | ipo_list | data/meta/stocks.csv, data/snapshot/screen.json |
| `ipo_price` | IPO Price | rupees | Issue price of the IPO (as issued, not adjusted) | ipo_list | data/meta/stocks.csv, data/snapshot/screen.json |
| `days_since_ipo` | Days Since IPO | integer | Calendar days from the IPO listing date to the data date | ipo_date | data/snapshot/screen.json |
| `rs_high_days` | Sessions since RS high | integer | Sessions since the RS line was last at its 52-week high (0 = today) | rs_line_52w_high | data/snapshot/screen.json |
| `sma20_chg_1w` | 20 SMA change 1W % | percent | (sma20 / sma20 5 sessions ago - 1) x 100 (> 0 = rising) | sma20 | data/snapshot/screen.json |
| `sma50_chg_1m` | 50 SMA change 1M % | percent | (sma50 / sma50 21 sessions ago - 1) x 100 | sma50 | data/snapshot/screen.json |
| `sma150_chg_1m` | 150 SMA change 1M % | percent | (sma150 / sma150 21 sessions ago - 1) x 100 | sma150 | data/snapshot/screen.json |
| `sma200_chg_1m` | 200 SMA change 1M % | percent | (sma200 / sma200 21 sessions ago - 1) x 100 | sma200 | data/snapshot/screen.json |
| `ema50_chg_1m` | 50 EMA change 1M % | percent | (ema50 / ema50 21 sessions ago - 1) x 100 | ema50 | data/snapshot/screen.json |
| `high_50d_prev` | 50D high (before today) | rupees | Highest high of the 50 sessions before today (breakout level) | high | data/snapshot/screen.json |
| `close_pos` | Close in day's range % | percent | (close - low) / (high - low) x 100; 100 = closed at the high (50 when high = low) | close, high, low | data/snapshot/screen.json |
| `range_20d_pct` | 20D range % | percent | (high_20d / low_20d - 1) x 100 | high_20d, low_20d | data/snapshot/screen.json |

## Fields of phase S7

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `pivot` | Pivot Price | rupees | Top of the current base: the most recent swing high at least 15 sessions old that is still the highest high since and above today's close (config/patterns.yaml) | high, close | data/snapshot/screen.json |
| `pivot_age` | Base length (sessions) | integer | Sessions since the pivot bar | pivot | data/snapshot/screen.json |
| `dist_pivot` | Distance from Pivot % | percent | (close / pivot - 1) x 100 (below the pivot = negative) | close, pivot | data/snapshot/screen.json |
| `base_depth` | Base depth % | percent | (1 - lowest low since the pivot bar / pivot) x 100 | pivot, low | data/snapshot/screen.json |
| `base_low` | Base low | rupees | Lowest low since the pivot bar | pivot, low | data/snapshot/screen.json |
| `base_prior_gain` | Gain before the base % | percent | (close on the pivot bar / close 63 sessions before it - 1) x 100 | pivot, close | data/snapshot/screen.json |
| `pivot_w` | Long-base pivot | rupees | Same as pivot for long bases: swing high at least 85 sessions old (~4 months), up to 390 (~18 months) | high, close | data/snapshot/screen.json |
| `pivot_w_age` | Long base length (sessions) | integer | Sessions since the long-base pivot bar | pivot_w | data/snapshot/screen.json |
| `dist_pivot_w` | Distance from long-base pivot % | percent | (close / pivot_w - 1) x 100 | close, pivot_w | data/snapshot/screen.json |
| `base_w_depth` | Long base depth % | percent | (1 - lowest low since the long-base pivot bar / pivot_w) x 100 | pivot_w, low | data/snapshot/screen.json |
| `breakout_days` | Sessions since breakout | integer | Sessions since the last close above the previous day's pivot on volume >= 1.5 x the 20-day average | pivot, rvol | data/snapshot/screen.json |
| `breakout_level` | Breakout level | rupees | The pivot that the last breakout closed above | pivot | data/snapshot/screen.json |
| `breakout_run` | Run since breakout % | percent | (close / close on the breakout day - 1) x 100 | breakout_days, close | data/snapshot/screen.json |
| `breakout_rvol` | Breakout day RVol | number | Relative volume on the last breakout day | breakout_days, rvol | data/snapshot/screen.json |
| `breakout_base_age` | Base length at breakout | integer | Sessions the base had lasted (pivot_age) the day before the last breakout | breakout_days, pivot_age | data/snapshot/screen.json |
| `tight_pct` | Tight closes 5D % | percent | (highest / lowest of the last 5 closes - 1) x 100 | close | data/snapshot/screen.json |
| `rti` | RTI (range tightness) | number | 100 x (today's high - low - smallest high - low of the last 5 sessions) / (biggest - smallest); 0 = quietest of the 5 | high, low | data/snapshot/screen.json |
| `rti_bars` | Quiet sessions (RTI <= 18) | integer | Sessions in a row up to today with RTI <= 18 (config/patterns.yaml tight_setup) | rti | data/snapshot/screen.json |
| `rti_range_pct` | Quiet run range % | percent | (highest high / lowest low of the rti_bars run - 1) x 100 | high, low, rti_bars | data/snapshot/screen.json |
| `box_bars` | Tight box sessions | integer | Longest window up to today with high-low range <= 0.8 x ADR20 (4+ sessions) or <= 1 x ADR20 (5+) and net close change <= 25 % of the range; latest day only | high, low, close, adr_pct | data/snapshot/screen.json |
| `box_range_pct` | Tight box range % | percent | (highest high / lowest low of the box - 1) x 100 | box_bars | data/snapshot/screen.json |
| `box_drift_pct` | Tight box drift % | percent | /last close - first close of the box/ / (box high - box low) x 100 | box_bars | data/snapshot/screen.json |
| `box_max_pct` | Tight box limit % | percent | The range limit used: 0.8 or 1 x ADR20 | adr_pct | data/snapshot/screen.json |
| `box_mode` | Tight box kind | text | tight (<= 0.8 x ADR), long (<= 1 x ADR) or tight+long | box_bars | data/snapshot/screen.json |
| `inside_day` | Inside day | boolean | Today's high and low inside yesterday's range | high, low | data/snapshot/screen.json |
| `range_pct` | Day range % | percent | (high / low - 1) x 100 | high, low | data/snapshot/screen.json |
| `new_low_20d` | New 20D low today | boolean | Today's low at or below the lowest low of the 20 sessions before | low | data/snapshot/screen.json |
| `hv_age` | High-volume event (sessions ago) | integer | Sessions since an up day of >= 2 x the previous ADR %, close in the top 25 % of the range, volume above every volume of the previous 63 sessions (ends when a bigger volume day follows); empty after 5 sessions | close, high, low, volume | data/snapshot/screen.json |
| `hv_rvol` | High-volume event: volume x 50D avg | number | Event day's volume / average volume of the 50 sessions before it | volume | data/snapshot/screen.json |
| `hv_move` | High-volume event: % change | percent | Event day's % change | close | data/snapshot/screen.json |
| `br_age` | Big reversal (sessions ago) | integer | Sessions since a day with high >= 13 % and close >= 12 % over the previous close on >= 3 x the 20-day volume, the previous close >= 6 % under SMA200; empty after 5 sessions | close, high, volume | data/snapshot/screen.json |
| `s2b_age` | Stage 2 breakout (sessions ago) | integer | Sessions since a close above the highest high of the previous 50 sessions on >= 2 x the 20-day volume, close in the top 25 % of the day, in Stage 2; empty after 6 sessions | close, high, volume, stage | data/snapshot/screen.json |
| `so_age` | Shakeout (sessions ago) | integer | Sessions since the recovery from an intraday drop >= the usual daily range that held within 3 % of SMA50, back to the close before the drop within 2 sessions, close above SMA50 and SMA200, SMA50 above SMA200; empty after 5 sessions | close, high, low | data/snapshot/screen.json |
| `rb_age` | Recent breakout (sessions ago) | integer | Sessions since a close above an old resistance (swing high >= 26 sessions old after a 20 % rise, no close above it since) on >= 2 x the 20-day volume; today >= 5 % above it, Stage 2; empty after 4 sessions | close, high, low, volume, stage | data/snapshot/screen.json |
| `rb_level` | Recent breakout level | rupees | The resistance level of the recent breakout | high | data/snapshot/screen.json |
| `rsb_today` | RS line new high before price | boolean | Today the RS line vs Nifty MidSmallcap 400 is above its highest of the previous 50 sessions while the close is 0-10 % under its highest close of those 50 sessions | close | data/snapshot/screen.json |
| `rsb_px_below` | Below 50-day closing high % | percent | % the close is under the highest close of the previous 50 sessions | close | data/snapshot/screen.json |
| `adr100_pct` | ADR % (100 days) | percent | 100 x (average of high / low over 100 sessions - 1) | high, low | data/snapshot/screen.json |
| `lvl_price` | Base level | rupees | Latest swing high (highest of +-16 sessions), 22-168 sessions old, reached after a 20 % rise, no close above it since (latest day only) | high, low, close | data/snapshot/screen.json |
| `lvl_age` | Base level age (sessions) | integer | Sessions since the base level | lvl_price | data/snapshot/screen.json |
| `lvl_depth` | Base depth % | percent | % from the base level down to the lowest low since | lvl_price, low | data/snapshot/screen.json |
| `lvl_dist_adr` | Below base level (ADRs) | number | % below the base level / ADR % (20 days) | lvl_price, close, adr_pct | data/snapshot/screen.json |
| `wlvl_price` | Weekly base level | rupees | As the base level, on weekly candles: swing high of +-4 weeks, 17-71 weeks old | high, low, close | data/snapshot/screen.json |
| `wlvl_age` | Weekly base age (weeks) | integer | Weeks since the weekly base level | wlvl_price | data/snapshot/screen.json |
| `wlvl_depth` | Weekly base depth % | percent | % from the weekly level down to the lowest weekly low since | wlvl_price, low | data/snapshot/screen.json |
| `wlvl_dist_adr` | Below weekly level (ADRs) | number | % below the weekly level / ADR % (20 days) | wlvl_price, close, adr_pct | data/snapshot/screen.json |
| `ipo_lvl` | IPO base level | rupees | Stocks with <= 30 sessions: the listing day's high, moved to a later day's high when a close gets above the level | high, close | data/snapshot/screen.json |
| `ipo_base_bars` | IPO base sessions | integer | Sessions since the IPO base level | ipo_lvl | data/snapshot/screen.json |
| `ipo_depth` | IPO base depth % | percent | % from the IPO level down to the lowest low since | ipo_lvl, low | data/snapshot/screen.json |
| `ipo_dist` | Below IPO level % | percent | % the close is below the IPO base level | ipo_lvl, close | data/snapshot/screen.json |
| `vcp_age` | VCP (sessions ago) | integer | Sessions since a VCP first appeared (base high 15-34 sessions back, no close above it, three shrinking pullbacks pivot->L1, H1->L2, H2->L3 with a 3 % swing rule, 1st <= 25 %, last <= 8 %, close <= 10 % under the pivot, pivot within 7 % of the 52-week high, 2nd <= 0.6 x 1st); empty after 2 sessions | high, low, close | data/snapshot/screen.json |
| `vcp_depth1` | VCP 1st pullback % | percent | Pivot down to the lowest low after it | vcp_age | data/snapshot/screen.json |
| `vcp_depth2` | VCP 2nd pullback % | percent | Highest high after L1 down to the last confirmed swing low | vcp_age | data/snapshot/screen.json |
| `vcp_depth3` | VCP 3rd pullback % | percent | Highest high after that low down to the lowest low since | vcp_age | data/snapshot/screen.json |
| `vcp_pivot` | VCP pivot | rupees | The base high of the VCP | vcp_age | data/snapshot/screen.json |
| `vcp_base_bars` | VCP base sessions | integer | Sessions from the pivot to the day the VCP appeared | vcp_age | data/snapshot/screen.json |
| `new_low_20d_3d` | New 20D low (3 days) | boolean | new_low_20d on any of the last 3 sessions | new_low_20d | data/snapshot/screen.json |
| `min_from_sma50_5d` | Lowest from 50 SMA % (5D) | percent | Lowest from_sma50 of the last 5 sessions | from_sma50 | data/snapshot/screen.json |
| `pivot_vs_hi52` | Pivot vs 52W high % | percent | (pivot / hi52 - 1) x 100 (0 = the pivot is the 52-week high) | pivot, hi52 | data/snapshot/screen.json |
| `vcp_contractions` | VCP contractions | integer | Latest day: number of pullbacks in a row, inside the base, each smaller than the one before (zigzag of closes, 5 % turns) | pivot, close | data/snapshot/screen.json |
| `vcp_last_pct` | Last contraction % | percent | Latest day: depth of the latest pullback inside the base | vcp_contractions | data/snapshot/screen.json |
| `vcp_first_pct` | First contraction % | percent | Latest day: depth of the first pullback of that run | vcp_contractions | data/snapshot/screen.json |
| `flag_pole_pct` | Flag pole % | percent | Latest day: biggest rise over at most 15 sessions ending within the last 20 | close | data/snapshot/screen.json |
| `flag_depth_pct` | Flag depth % | percent | Latest day: (1 - lowest low since the pole top / highest high since) x 100 | flag_pole_pct, low, high | data/snapshot/screen.json |
| `flag_days` | Flag length (sessions) | integer | Latest day: sessions since the pole top | flag_pole_pct | data/snapshot/screen.json |

## Fields of phase S8

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `fin_basis` | Results basis | text | Consolidated when the company files consolidated results as recent as standalone, else Standalone | results_filings | data/snapshot/screen.json |
| `fin_kind` | Results format | text | company / bank / nbfc / insurance (which XBRL format the company files) | results_filings | data/snapshot/screen.json |
| `fin_qtr` | Latest quarter | date | End of the latest quarter announced | results_filings | data/snapshot/screen.json |
| `last_result` | Last results day | date | Board meeting (or broadcast) day of the latest quarter's results | results_filings | data/snapshot/screen.json |
| `days_since_result` | Days since results | integer | Calendar days from last_result to the data day | last_result | data/snapshot/screen.json |
| `next_result` | Next results day | date | Next board meeting for results (NSE event calendar) | results_calendar | data/snapshot/screen.json |
| `days_to_result` | Days to results | integer | Calendar days from the data day to next_result | next_result | data/snapshot/screen.json |
| `sales_ttm` | Sales TTM (Cr) | crore | Sum of the last 4 quarters' revenue from operations (banks: interest earned; insurers: net premium) | results_filings | data/snapshot/screen.json |
| `np_ttm` | Net profit TTM (Cr) | crore | Sum of the last 4 quarters' profit attributable to the owners | results_filings | data/snapshot/screen.json |
| `eps_ttm` | EPS TTM | rupees | Sum of the last 4 quarters' basic EPS, each adjusted for splits / bonuses after its results day | results_filings, corporate_actions | data/snapshot/screen.json |
| `eps_last_q` | EPS latest quarter | rupees | Basic EPS of the latest quarter (adjusted like eps_ttm) | eps_ttm | data/snapshot/screen.json |
| `opm_ttm` | OPM TTM % | percent | EBITDA without other income (PBT + interest + depreciation - other income) / sales, last 4 quarters x 100 | sales_ttm | data/snapshot/screen.json |
| `npm_ttm` | Net margin TTM % | percent | np_ttm / sales_ttm x 100 | np_ttm, sales_ttm | data/snapshot/screen.json |
| `pe` | P/E | number | close / eps_ttm (empty when EPS <= 0) | close, eps_ttm | data/snapshot/screen.json |
| `pb` | P/B | number | Market cap / net worth (equity capital + reserves of the latest balance sheet) | mcap_cr, results_filings | data/snapshot/screen.json |
| `book_value` | Book value / share | rupees | close / pb | pb, close | data/snapshot/screen.json |
| `peg` | PEG | number | PE / EPS growth of the latest quarter vs the same quarter a year ago (only when growth > 0) | pe, eps_cagr_3y, np_cagr_3y | data/snapshot/screen.json |
| `div_yield` | Dividend yield % | percent | Dividends per share with ex-date in the last 365 days (split-adjusted) / close x 100 | corporate_actions, close | data/snapshot/screen.json |
| `debt_equity` | Debt / Equity | number | Borrowings / net worth, latest balance sheet (companies and NBFCs) | results_filings | data/snapshot/screen.json |
| `roe` | ROE % | percent | Latest year's net profit (incl. minority) / net worth at that year end x 100 (consolidated when filed) | results_filings | data/snapshot/screen.json |
| `roe_3y` | ROE 3Y avg % | percent | Average of the last 3 yearly ROEs | roe | data/snapshot/screen.json |
| `roe_5y` | ROE 5Y avg % | percent | Average of the last 5 yearly ROEs | roe | data/snapshot/screen.json |
| `roe_10y` | ROE 10Y avg % | percent | Average of the last 10 yearly ROEs | roe | data/snapshot/screen.json |
| `roce` | ROCE % | percent | Latest year's EBIT (PBT + interest) / (net worth + borrowings) at that year end x 100 (companies and NBFCs) | results_filings | data/snapshot/screen.json |
| `fin_year` | Latest financial year | date | End of the latest full financial year announced | results_filings | data/snapshot/screen.json |
| `sales_g_yoy` | Sales growth YoY % | percent | Latest quarter's sales vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `sales_g_qoq` | Sales growth QoQ % | percent | Latest quarter's sales vs the quarter before | results_filings | data/snapshot/screen.json |
| `np_g_yoy` | Profit growth YoY % | percent | Latest quarter's profit to owners vs the same quarter a year before (empty when that was <= 0) | results_filings | data/snapshot/screen.json |
| `np_g_qoq` | Profit growth QoQ % | percent | Latest quarter's profit to owners vs the quarter before | results_filings | data/snapshot/screen.json |
| `eps_g_yoy` | EPS growth YoY % | percent | Latest quarter's adjusted EPS vs the same quarter a year before | eps_last_q | data/snapshot/screen.json |
| `eps_g_qoq` | EPS growth QoQ % | percent | Latest quarter's adjusted EPS vs the quarter before | eps_last_q | data/snapshot/screen.json |
| `sales_g_ttm` | Sales growth TTM % | percent | Sales TTM vs the 4 quarters before | sales_ttm | data/snapshot/screen.json |
| `np_g_ttm` | Profit growth TTM % | percent | Profit TTM vs the 4 quarters before | np_ttm | data/snapshot/screen.json |
| `eps_up_qtrs` | EPS up quarters | integer | Latest quarters in a row whose EPS beat the same quarter a year before | eps_g_yoy | data/snapshot/screen.json |
| `sales_up_qtrs` | Sales up quarters | integer | Latest quarters in a row whose sales beat the same quarter a year before | sales_g_yoy | data/snapshot/screen.json |
| `sales_cagr_3y` | Sales CAGR 3Y % | percent | Compounded yearly sales growth over the last 3 financial years | results_filings | data/snapshot/screen.json |
| `sales_cagr_5y` | Sales CAGR 5Y % | percent | Compounded yearly sales growth over the last 5 financial years | results_filings | data/snapshot/screen.json |
| `sales_cagr_10y` | Sales CAGR 10Y % | percent | Compounded yearly sales growth over the last 10 financial years (NSE XBRL starts ~FY2017: often empty) | results_filings | data/snapshot/screen.json |
| `np_cagr_3y` | Profit CAGR 3Y % | percent | Compounded yearly growth of profit to owners over 3 financial years (empty when either end <= 0) | results_filings | data/snapshot/screen.json |
| `np_cagr_5y` | Profit CAGR 5Y % | percent | Same over 5 financial years | results_filings | data/snapshot/screen.json |
| `np_cagr_10y` | Profit CAGR 10Y % | percent | Same over 10 financial years | results_filings | data/snapshot/screen.json |
| `eps_cagr_3y` | EPS CAGR 3Y % | percent | Compounded yearly growth of adjusted annual EPS over 3 financial years | results_filings, corporate_actions | data/snapshot/screen.json |
| `shp_qtr` | Shareholding quarter | date | Quarter end of the latest shareholding pattern | shareholding_xbrl | data/snapshot/screen.json |
| `prom_hold` | Promoters % | percent | Promoter & promoter group shares / all shares x 100 | shareholding_xbrl | data/snapshot/screen.json |
| `fii_hold` | FII % | percent | Foreign institutions (FPIs etc.) / all shares x 100 | shareholding_xbrl | data/snapshot/screen.json |
| `dii_hold` | DII % | percent | Domestic institutions (mutual funds, insurers, banks, pension funds ...) / all shares x 100 | shareholding_xbrl | data/snapshot/screen.json |
| `public_hold` | Public % | percent | Non-institutions (individuals, companies, NRIs ...) / all shares x 100 | shareholding_xbrl | data/snapshot/screen.json |
| `govt_hold` | Government % | percent | Central / state governments / all shares x 100 | shareholding_xbrl | data/snapshot/screen.json |
| `prom_chg_1q` | Promoter change 1Q | number | prom_hold minus the quarter before (percentage points) | prom_hold | data/snapshot/screen.json |
| `prom_chg_1y` | Promoter change 1Y | number | prom_hold minus 4 quarters before (percentage points) | prom_hold | data/snapshot/screen.json |
| `fii_chg_1q` | FII change 1Q | number | fii_hold minus the quarter before (percentage points) | fii_hold | data/snapshot/screen.json |
| `fii_chg_1y` | FII change 1Y | number | fii_hold minus 4 quarters before | fii_hold | data/snapshot/screen.json |
| `dii_chg_1q` | DII change 1Q | number | dii_hold minus the quarter before | dii_hold | data/snapshot/screen.json |
| `dii_chg_1y` | DII change 1Y | number | dii_hold minus 4 quarters before | dii_hold | data/snapshot/screen.json |
| `shareholders` | No. of shareholders | integer | Total shareholders in the latest pattern | shareholding_xbrl | data/snapshot/screen.json |
| `shareholders_chg_1q` | Shareholders change 1Q % | percent | Change of the shareholder count vs the quarter before | shareholders | data/snapshot/screen.json |

## Fields of phase S9

| field | label | type | formula | inputs | files |
|---|---|---|---|---|---|
| `earn_date` | Results reaction day | date | The results day or the next session, whichever opened with the bigger gap (latest results on or before the data day) | results_filings, open, close | data/snapshot/screen.json |
| `earn_sessions` | Sessions since results reaction | integer | Sessions from earn_date to the data day (0 = today) | earn_date | data/snapshot/screen.json |
| `earn_gap_pct` | Results gap % | percent | Open of the reaction session vs the close before x 100 - 100 | earn_date, open, close | data/snapshot/screen.json |
| `earn_chg_pct` | Results day change % | percent | Close of the reaction session vs the close before | earn_date, close | data/snapshot/screen.json |
| `earn_vol_x` | Results day volume x | number | Volume of the reaction session / 50-day average volume the day before | earn_date, volume, avg_vol50 | data/snapshot/screen.json |
| `earn_close_pos` | Results day close position | percent | Where the reaction session closed in its range: 0 = low, 100 = high | earn_date, high, low, close | data/snapshot/screen.json |
| `earn_held` | Results gap held that day | boolean | Reaction session closed at or above its open | earn_date, open, close | data/snapshot/screen.json |
| `earn_gap_filled` | Results gap filled | boolean | Any low since the reaction session (incl.) at or below the close before the gap | earn_date, low | data/snapshot/screen.json |
| `earn_run_pct` | Run since results % | percent | Close now vs close of the reaction session | earn_date, close | data/snapshot/screen.json |
| `eps_g_accel_qtrs` | EPS growth accelerating quarters | integer | Latest quarters in a row whose EPS growth YoY beat the previous quarter's EPS growth YoY | results_filings | data/snapshot/screen.json |
| `sales_g_accel_qtrs` | Sales growth accelerating quarters | integer | Latest quarters in a row whose sales growth YoY beat the previous quarter's | results_filings | data/snapshot/screen.json |
| `npm_up_qtrs` | Net margin rising quarters | integer | Latest quarters in a row with a higher net margin (profit / sales) than the quarter before | results_filings | data/snapshot/screen.json |
| `sales_g_q1` | Sales growth YoY, Q1 | percent | Sales of two quarters before the latest vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `eps_g_q1` | EPS growth YoY, Q1 | percent | EPS of two quarters before the latest vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `npm_q1` | Net margin, Q1 | percent | Net profit / sales of two quarters before the latest | results_filings | data/snapshot/screen.json |
| `sales_g_q2` | Sales growth YoY, Q2 | percent | Sales of the quarter before the latest vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `eps_g_q2` | EPS growth YoY, Q2 | percent | EPS of the quarter before the latest vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `npm_q2` | Net margin, Q2 | percent | Net profit / sales of the quarter before the latest | results_filings | data/snapshot/screen.json |
| `sales_g_q3` | Sales growth YoY, Q3 | percent | Sales of the latest quarter vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `eps_g_q3` | EPS growth YoY, Q3 | percent | EPS of the latest quarter vs the same quarter a year before | results_filings | data/snapshot/screen.json |
| `npm_q3` | Net margin, Q3 | percent | Net profit / sales of the latest quarter | results_filings | data/snapshot/screen.json |
| `eps_year_ago_q` | EPS, same quarter last year | number | EPS of the quarter a year before the latest | results_filings | data/snapshot/screen.json |
| `np_qoq_up_qtrs` | Profit rising quarters (QoQ) | integer | Latest quarters in a row with higher profit than the quarter before | results_filings | data/snapshot/screen.json |
| `sales_qoq_up_qtrs` | Sales rising quarters (QoQ) | integer | Latest quarters in a row with higher sales than the quarter before | results_filings | data/snapshot/screen.json |
| `np_last_q` | Profit latest quarter (Cr) | crore | Profit to owners of the latest quarter | results_filings | data/snapshot/screen.json |
| `np_year_ago_q` | Profit same quarter last year (Cr) | crore | Profit to owners of the same quarter a year before | results_filings | data/snapshot/screen.json |
| `sales_last_q` | Sales latest quarter (Cr) | crore | Sales of the latest quarter | results_filings | data/snapshot/screen.json |
| `sales_year_ago_q` | Sales same quarter last year (Cr) | crore | Sales of the same quarter a year before | results_filings | data/snapshot/screen.json |
| `npm_last_q` | Net margin latest quarter % | percent | np_last_q / sales_last_q x 100 | np_last_q, sales_last_q | data/snapshot/screen.json |
| `sector_rank` | Sector rank | integer | Rank of the stock's sector by strength (config/group_rank.yaml: group vs equal-weight market, vs its 63-day average) | close, sector, basic_industry, theme_rules | data/snapshot/screen.json |
| `sector_tag` | Sector tag | text | Leading / Weakening / Lagging / Improving (strength >= 100?, momentum >= 100?) | sector_rank | data/snapshot/screen.json |
| `industry_rank` | Industry rank | integer | Same as sector_rank among industries with >= 5 stocks | close, sector, basic_industry, theme_rules | data/snapshot/screen.json |
| `industry_tag` | Industry tag | text | Leading / Weakening / Lagging / Improving of the stock's industry | industry_rank | data/snapshot/screen.json |
| `sector_rank_1m` | Sector rank 1M | integer | Rank of the sector's average 1-month member return among sectors | ret_1m, sector | data/snapshot/screen.json |
| `industry_rank_1m` | Industry rank 1M | integer | Rank of the industry's average 1-month member return among industries with >= 5 stocks | ret_1m, basic_industry | data/snapshot/screen.json |
| `sector_ret_1w` | Sector 1W % | percent | Average 1-week return of the sector's stocks | ret_1w, sector | data/snapshot/screen.json |
| `industry_ret_1w` | Industry 1W % | percent | Average 1-week return of the industry's stocks | ret_1w, basic_industry | data/snapshot/screen.json |
| `vs_sector_1m` | vs Sector 1M % | percent | Stock 1M return minus the sector's average 1M return (points) | ret_1m, sector | data/snapshot/screen.json |
| `vs_industry_1m` | vs Industry 1M % | percent | Stock 1M return minus the industry's average 1M return (points) | ret_1m, basic_industry | data/snapshot/screen.json |
| `themes` | Themes | text | Our themes the stock belongs to (config/theme_rules.yaml) | theme_rules | data/snapshot/screen.json |
| `theme` | Top theme | text | The stock's best-ranked theme | themes | data/snapshot/screen.json |
| `theme_status` | Theme status | text | Tag (Leading / Weakening / Lagging / Improving) of the stock's best-ranked theme - the chart's Theme chip | theme | data/snapshot/screen.json |
