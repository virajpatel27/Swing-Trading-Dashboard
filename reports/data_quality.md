# Data quality report - 2026-11-04

All NSE stocks, adjusted prices 2007 -> today. Made by `scripts/quality_report.py` from the data check (`data/meta/data_issues.csv`) plus a fresh look at big one-day moves.

## Summary

| | count |
|---|---|
| stocks with prices | 2,626 |
| price rows (trading days x stocks) | 6,506,463 |
| errors (data that must not be saved) | 0 |
| warnings of the data check | 3,553 |
| one-day moves of 20-30 % (circuit-size, normal) | 2,809 |
| moves above 30 % without a corporate action | 491 |
| - of these: long gap | 47 |
| - of these: re-based | 3 |
| - of these: split-like | 95 |
| - of these: reverted | 93 |
| - of these: unexplained | 253 |

## Warnings of the data check by type

| level | check | count |
|---|---|---|
| warn | bad candle | 60 |
| warn | corporate action not seen in prices | 3 |
| warn | corporate action without factor | 11 |
| warn | missing dates | 1,019 |
| warn | unexplained jump | 2,455 |
| warn | zero/negative price | 5 |

What they mean:
- **missing dates**: trading days without a row. Normal for thinly traded and suspended stocks (no trade = no row).
- **bad candle**: high below low or close outside high-low in NSE's own file (old years). Kept as NSE gave it.
- **unexplained jump**: close moved more than 20 % in a day. Mostly circuit moves; the real suspects are below.
- **corporate action not seen in prices / without factor**: NSE listed an action, the price did not show it, or a rights issue had no price. Not applied; see `data/meta/adjust_issues.csv`.

## Corporate actions to look at: 14

- NSE ANDHRAPAP, 2010-02-23: corporate action without factor - rights: rights without issue price
- NSE DVL, 2021-08-05: corporate action not seen in prices - bonus 1:2: no matching price change near the ex-date
- NSE GTLINFRA, 2007-07-20: corporate action without factor - rights: rights without issue price
- NSE GULFPETRO, 2013-07-09: corporate action not seen in prices - bonus 23:19: no matching price change near the ex-date
- NSE KMSUGAR, 2010-03-26: corporate action not seen in prices - split FV 10->2: no matching price change near the ex-date
- NSE ORIENTPPR, 2007-06-08: corporate action without factor - rights: rights without issue price
- NSE PATINTLOG, 2021-02-17: corporate action without factor - rights: rights without issue price
- NSE PATINTLOG, 2021-10-28: corporate action without factor - rights: rights without issue price
- NSE RELTD, 2026-06-08: corporate action without factor - rights: rights without issue price
- NSE SIGMAADV, 2021-07-12: corporate action without factor - rights: rights without issue price
- NSE TATASTEEL, 2007-10-29: corporate action without factor - rights: rights without issue price
- NSE TFL, 2022-11-04: corporate action without factor - rights: rights without issue price
- NSE TMPV, 2008-09-09: corporate action without factor - rights: rights without issue price
- NSE VHLTD, 2024-11-29: corporate action without factor - rights: rights without issue price

## Moves above 30 % without a corporate action: 491

- **long gap**: more than 30 days without a trade before it (suspension, years traded only on BSE): a real re-start, nothing to fix.
- **re-based**: NSE's own 'previous close' of that day is far from our last close, so NSE changed the base price (consolidation / capital reduction, often after an insolvency plan) that its corporate action list does not show. Charts before that day are not comparable; candidates for `config/corporate_action_overrides.csv` (each needs a check of the company's filing).
- **split-like**: the price changed by a simple ratio (2x, 5x, 10x ...) and stayed there: probably a split / bonus / consolidation missing from NSE's list. Override candidates after checking the company's filing.
- **reverted**: the next day undid most of it, most likely a bad price in NSE's file.
- **unexplained**: none of these (big news, or something to check).

### re-based: 3

| stock | date | move % | close before | close | NSE prev close | gap days |
|---|---|---|---|---|---|---|
| KAUSHALYA | 2024-02-06 | +9933.5 | 9.85 | 988.3 | 985 | 26 |
| SHEKHAWATI | 2024-09-10 | +879.9 | 8.82 | 86.43 | 2.1 | 14 |
| CCAVENUE | 2026-10-19 | +840.3 | 13.83 | 130.05 | 138.3 | 7 |

### split-like: 95

| stock | date | move % | close before | close | NSE prev close | gap days |
|---|---|---|---|---|---|---|
| BLUECHIP | 2020-09-17 | +100.0 | 0.05 | 0.1 | 0.05 | 1 |
| BLUECHIP | 2020-04-03 | +100.0 | 0.05 | 0.1 | 0.05 | 2 |
| PRAKASHSTL | 2018-06-25 | +100.0 | 0.05 | 0.1 | 0.05 | 7 |
| PARASPETRO | 2017-02-01 | +100.0 | 0.05 | 0.1 | 0.05 | 1 |
| BLUECHIP | 2018-04-13 | +100.0 | 0.05 | 0.1 | 0.05 | 1 |
| AIRAN | 2018-08-14 | -79.7 | 359.5 | 73 | 359.5 | 1 |
| VCL | 2022-03-28 | -79.4 | 56.8 | 11.7 | 113.6 | 3 |
| GLOBAL | 2020-12-07 | -74.4 | 39.2 | 10.03 | 196 | 27 |
| KSOLVES | 2021-06-04 | -74.2 | 801.77 | 206.5 | 1603.55 | 1 |
| THEJO | 2021-10-12 | -66.4 | 3675.15 | 1233.1 | 3675.15 | 1 |
| AVROIND | 2022-02-04 | -66.1 | 11.6 | 3.93 | 115.95 | 18 |
| ATALREAL | 2022-09-01 | -60.2 | 34.45 | 13.69 | 177.1 | 2 |
| LATTEYS | 2022-10-12 | -59.8 | 75.3 | 30.3 | 75.3 | 1 |
| GICL | 2022-10-12 | -50.3 | 71 | 35.3 | 71 | 2 |
| PANACHE | 2019-07-18 | -50.2 | 103 | 51.25 | 103 | 1 |
| BLUECHIP | 2018-10-16 | +50.0 | 0.1 | 0.15 | 0.1 | 4 |
| BLUECHIP | 2020-03-11 | +50.0 | 0.1 | 0.15 | 0.1 | 2 |
| ANTGRAPHIC | 2015-04-08 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-04-13 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| ANTGRAPHIC | 2015-05-18 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| ANTGRAPHIC | 2015-06-01 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| ANTGRAPHIC | 2015-05-06 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-07-17 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-09-29 | +50.0 | 0.1 | 0.15 | 0.1 | 5 |
| ANTGRAPHIC | 2015-10-13 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-11-02 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| BLUECHIP | 2018-10-10 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| BLUECHIP | 2020-04-07 | +50.0 | 0.1 | 0.15 | 0.1 | 4 |
| BLUECHIP | 2020-09-18 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| FCSSOFT | 2018-02-02 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| FCSSOFT | 2017-12-04 | -50.0 | 0.1 | 0.05 | 0.1 | 28 |
| PRAKASHSTL | 2018-08-06 | +50.0 | 0.1 | 0.15 | 0.1 | 7 |
| PRAKASHSTL | 2018-07-09 | +50.0 | 0.1 | 0.15 | 0.1 | 7 |
| BLUECHIP | 2018-10-03 | +50.0 | 0.1 | 0.15 | 0.1 | 2 |
| ANTGRAPHIC | 2015-11-09 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| BLUECHIP | 2018-03-22 | -50.0 | 0.1 | 0.05 | 0.1 | 1 |
| PARASPETRO | 2017-02-02 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| SPCENET | 2017-12-11 | +50.0 | 0.1 | 0.15 | 0.1 | 7 |
| THEJO | 2013-09-19 | -50.0 | 400 | 200 | 400 | 9 |
| BLUECHIP | 2018-04-17 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |

... and 55 more in data_quality.csv

### unexplained: 253

| stock | date | move % | close before | close | NSE prev close | gap days |
|---|---|---|---|---|---|---|
| UEL | 2024-05-27 | +267.5 | 6.95 | 25.55 | 43.8 | 6 |
| AURUM | 2020-12-23 | -98.8 | 717.2 | 8.88 | 985.65 | 1 |
| HECPROJECT | 2021-10-19 | -81.0 | 210 | 40 | 210 | 13 |
| JSLL | 2025-06-12 | -80.9 | 2250.95 | 429.9 | 2250.95 | 1 |
| CROWN | 2021-10-21 | -79.0 | 147.7 | 31 | 147.7 | 7 |
| LATTEYS | 2023-02-10 | -79.0 | 157.5 | 33.05 | 157.5 | 1 |
| BTML | 2022-09-23 | -79.0 | 28.73 | 6.03 | 297.55 | 1 |
| SHRENIK | 2018-07-09 | -78.2 | 157.07 | 34.28 | 942.4 | 3 |
| SITINET | 2009-02-04 | +76.8 | 9.7 | 17.15 | 9.7 | 1 |
| PRITI | 2021-10-20 | -73.8 | 269.85 | 70.8 | 269.85 | 1 |
| IRISDOREME | 2020-10-14 | -73.3 | 11.83 | 3.15 | 123.75 | 1 |
| GICL | 2025-10-15 | -73.2 | 173.7 | 46.5 | 173.7 | 1 |
| CCAVENUE | 2018-09-28 | -70.8 | 46.74 | 13.64 | 200.35 | 1 |
| GTECJAINX | 2020-07-20 | -69.4 | 81.6 | 25 | 81.6 | 20 |
| WEWIN | 2021-04-01 | -65.1 | 40.85 | 14.25 | 40.85 | 6 |
| MKPL | 2023-02-03 | -65.1 | 75.25 | 26.23 | 2257.5 | 1 |
| UNITEDPOLY | 2021-02-25 | -65.1 | 5.18 | 1.81 | 51.8 | 9 |
| FOCUS | 2019-07-31 | -65.1 | 28.81 | 10.06 | 144.05 | 12 |
| NPST | 2024-02-02 | -65.0 | 2789.05 | 976.15 | 2789.05 | 1 |
| MCL | 2018-09-05 | -65.0 | 450 | 157.35 | 450 | 1 |
| 63MOONS | 2013-08-01 | -64.5 | 539.85 | 191.65 | 539.85 | 1 |
| HITECHCORP | 2008-11-10 | +62.6 | 27.3 | 44.4 | 27.3 | 14 |
| GTL | 2011-06-20 | -62.2 | 338.3 | 127.95 | 338.3 | 3 |
| TOUCHWOOD | 2019-08-26 | -58.2 | 110.05 | 46.05 | 110.05 | 7 |
| BANKA | 2020-09-09 | -58.2 | 105 | 43.85 | 105 | 2 |
| JAIPURKURT | 2019-04-30 | -58.1 | 36.3 | 15.21 | 42 | 7 |
| YESBANK | 2020-03-17 | +58.1 | 37.1 | 58.65 | 37.1 | 1 |
| SIGMA | 2022-10-07 | -58.0 | 58.82 | 24.7 | 588.2 | 1 |
| INNOVANA | 2019-12-17 | -58.0 | 297.3 | 124.8 | 297.3 | 1 |
| STAR | 2013-12-19 | -57.6 | 386.21 | 163.6 | 882.3 | 1 |
| RCOM | 2018-05-17 | +56.2 | 10.5 | 16.4 | 10.5 | 1 |
| YESBANK | 2020-03-06 | -56.1 | 36.8 | 16.15 | 36.8 | 1 |
| SUMIT | 2019-07-17 | -55.2 | 46.5 | 20.85 | 46.5 | 5 |
| DCI | 2022-01-10 | -54.6 | 96 | 43.6 | 96 | 3 |
| NRL | 2022-12-23 | -53.5 | 186 | 86.5 | 279 | 1 |
| DEVIT | 2021-10-21 | -51.5 | 31.4 | 15.24 | 157 | 1 |
| CRESTO | 2020-02-19 | -48.2 | 85 | 44 | 85 | 9 |
| SWELECTES | 2012-07-17 | -48.0 | 188.37 | 98.03 | 282.55 | 1 |
| ARVEE | 2020-10-22 | -48.0 | 79.75 | 41.5 | 79.75 | 16 |
| BLUECOAST | 2008-12-16 | -47.7 | 130.4 | 68.25 | 130.4 | 29 |

... and 213 more in data_quality.csv

### reverted: 93

| stock | date | move % | close before | close | NSE prev close | gap days |
|---|---|---|---|---|---|---|
| BLUECHIP | 2020-09-14 | +100.0 | 0.05 | 0.1 | 0.05 | 7 |
| ANTGRAPHIC | 2015-07-28 | +50.0 | 0.1 | 0.15 | 0.1 | 4 |
| ANTGRAPHIC | 2015-06-08 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| ANTGRAPHIC | 2015-03-26 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-06-16 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-07-15 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-05-04 | +50.0 | 0.1 | 0.15 | 0.1 | 4 |
| ANTGRAPHIC | 2015-09-18 | +50.0 | 0.1 | 0.15 | 0.1 | 2 |
| ANTGRAPHIC | 2015-08-21 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-08-12 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| PRAKASHSTL | 2018-06-18 | -50.0 | 0.1 | 0.05 | 0.1 | 7 |
| PARASPETRO | 2017-01-31 | -50.0 | 0.1 | 0.05 | 0.1 | 1 |
| ANTGRAPHIC | 2015-04-01 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-08-27 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-11-05 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| BLUECHIP | 2020-04-01 | -50.0 | 0.1 | 0.05 | 0.1 | 1 |
| BLUECHIP | 2020-08-17 | +50.0 | 0.1 | 0.15 | 0.1 | 7 |
| BLUECHIP | 2020-09-07 | -50.0 | 0.1 | 0.05 | 0.1 | 7 |
| ANTGRAPHIC | 2015-10-08 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-10-20 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-10-29 | +50.0 | 0.1 | 0.15 | 0.1 | 2 |
| ANTGRAPHIC | 2015-08-19 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-09-15 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| ANTGRAPHIC | 2015-07-30 | +50.0 | 0.1 | 0.15 | 0.1 | 1 |
| BLUECHIP | 2020-09-16 | -50.0 | 0.1 | 0.05 | 0.1 | 2 |
| ANTGRAPHIC | 2015-08-17 | +50.0 | 0.1 | 0.15 | 0.1 | 3 |
| PCJEWELLER | 2018-05-07 | +37.6 | 17.46 | 24.03 | 174.65 | 3 |
| ANKITMETAL | 2019-02-07 | +37.5 | 0.4 | 0.55 | 0.4 | 1 |
| 63MOONS | 2013-08-05 | +34.3 | 147.5 | 198.1 | 147.5 | 3 |
| ANTGRAPHIC | 2015-07-16 | -33.3 | 0.15 | 0.1 | 0.15 | 1 |
| ANTGRAPHIC | 2015-05-19 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2015-05-05 | -33.3 | 0.15 | 0.1 | 0.15 | 1 |
| ANTGRAPHIC | 2015-02-03 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2015-02-25 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2015-02-19 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2015-04-10 | -33.3 | 0.15 | 0.1 | 0.15 | 1 |
| ANTGRAPHIC | 2015-04-22 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2015-01-29 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2014-02-14 | +33.3 | 0.15 | 0.2 | 0.15 | 1 |
| ANTGRAPHIC | 2014-03-03 | +33.3 | 0.15 | 0.2 | 0.15 | 3 |

... and 53 more in data_quality.csv

## Most missing days (top 20; usually suspended or rarely traded)

- NSE BATLIBOI: 3413 trading days without a row (first 2009-05-18, last 2026-04-17)
- NSE SAMBANDAM: 3183 trading days without a row (first 2010-08-20, last 2026-11-02)
- NSE GKB: 3181 trading days without a row (first 2010-06-25, last 2026-09-03)
- NSE SAYAJIHOTL: 3141 trading days without a row (first 2012-08-29, last 2026-10-09)
- NSE VTMLTD: 3110 trading days without a row (first 2012-01-03, last 2026-08-14)
- NSE IPRINGLTD: 3082 trading days without a row (first 2009-11-23, last 2026-08-14)
- NSE KSE: 3025 trading days without a row (first 2010-01-13, last 2026-08-14)
- NSE AMARJOTHI: 3011 trading days without a row (first 2011-06-07, last 2026-08-14)
- NSE LAKSHMIMIL: 2980 trading days without a row (first 2009-11-16, last 2026-09-10)
- NSE BIMETAL: 2884 trading days without a row (first 2009-12-01, last 2026-04-17)
- NSE BLUECOAST: 2818 trading days without a row (first 2007-01-11, last 2025-07-18)
- NSE RAJPALAYAM: 2801 trading days without a row (first 2010-02-03, last 2026-04-17)
- NSE MMWL: 2783 trading days without a row (first 2014-04-02, last 2026-04-17)
- NSE AMBICAAGAR: 2746 trading days without a row (first 2009-05-18, last 2024-06-04)
- NSE KOVAI: 2360 trading days without a row (first 2010-12-28, last 2026-04-17)
- NSE QUINTEGRA: 2315 trading days without a row (first 2012-02-07, last 2026-09-25)
- NSE DCMFINSERV: 2234 trading days without a row (first 2007-11-12, last 2022-06-17)
- NSE KEYFINSERV: 2082 trading days without a row (first 2007-01-10, last 2020-07-22)
- NSE DSKULKARNI: 2072 trading days without a row (first 2018-03-21, last 2026-10-30)
- NSE ADROITINFO: 2027 trading days without a row (first 2007-09-13, last 2020-09-14)
