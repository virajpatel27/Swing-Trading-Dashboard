# Formulas - every field of the dashboard

Made from `config/fields.yaml` by `scripts/make_formulas_doc.py` (do not edit by hand). All prices are ADJUSTED for splits, bonus, rights and demergers unless a field says "as traded". Settings: `config/indicators.yaml`, `config/stage.yaml`, `config/settings.yaml`. Calibration against the reference app: `docs/calibration.md`.

Current phase: **S5**. Fields: **145**.

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
- **theme_rules**: config/theme_rules.yaml - our theme lists (NSE thematic indices, NSE industries, hand-picked)
- **mto**: NSE MTO_ddmmyyyy.DAT - security-wise delivery position, every trading day from 2007
- **settings**: config/settings.yaml (parameters such as the liquid rule)
- **indicator_settings**: config/indicators.yaml and config/stage.yaml (engine parameters)

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
| `rs_rating` | RS rating | integer | Percentile 1-99 of 0.4 x 3M + 0.2 x 6M + 0.2 x 9M + 0.2 x 12M return among stocks | close | data/snapshot/screen.json, data/snapshot/latest.json |
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
| `turnover_avg20_cr` | Avg turnover 20D (Rs Cr) | crore | Average turnover_cr of the last 20 sessions incl. today | turnover_cr | data/snapshot/screen.json |
| `turnover_avg50_cr` | Avg turnover 50D (Rs Cr) | crore | Average turnover_cr of the last 50 sessions incl. today | turnover_cr | data/snapshot/screen.json |
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
| `beta_1y` | Beta 1Y vs Nifty 50 | number | Covariance / variance of daily returns vs Nifty 50 over 252 sessions | close, index_history | data/snapshot/screen.json |
| `stage` | Stage | text | 1 Basing, 2A Early uptrend, 2 Uptrend, 3 Topping, 4 Downtrend, 4A Improving: close vs SMA200 and SMA50, slope of SMA200 (config/stage.yaml) | close, indicator_settings | data/snapshot/screen.json |
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
| `days_listed` | Days Since Listing | integer | Calendar days from the NSE listing date to the data date | listed | site |
