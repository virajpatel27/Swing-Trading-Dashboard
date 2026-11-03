# Stock universe audit - 2026-11-03

Our stock list and stored history checked against NSE's official lists (EQUITY_L.csv, delisted.csv, symbolchange.csv, the newest bhavcopy). Made by `scripts/audit_stocks.py`.

## Summary

| | count |
|---|---|
| stocks in our list | 2,626 |
| series EQ | 2,391 |
| series BE | 199 |
| series BZ | 33 |
| series RR | 3 |
| active (traded in the last 10 days) | 2,622 |
| young (fewer than 30 sessions stored: new listings) | 42 |
| liquid (median 30-day turnover >= Rs 1 Cr, close >= Rs 5) | 1,545 |
| F&O stocks | 218 |
| Nifty 500 members | 500 |
| with NSE sector | 2,588 |
| with share count (market cap) | 0 |
| history from 2007 (or from listing) | 2,592 |

## Findings

### missing: 0

In NSE's list but not in ours. The daily job takes NSE's list every day, so this is normally empty.

### extra: 3

In our list but not in NSE's equity list. REITs (series RR) come from the Nifty 500 list on purpose.

- BAGMANE: series RR (REIT / InvIT, from the Nifty 500 list)
- BIRET: series RR (REIT / InvIT, from the Nifty 500 list)
- EMBASSY: series RR (REIT / InvIT, from the Nifty 500 list)

### orphan: 1

Old history folders of symbols that left the list (kept, not shown). Delisted ones are the 'survivorship bias' of breadth history: past days miss companies that died later.

- ABCOTS: renamed to ABCIND on 2026-11-02

### new_listing: 12

Shares that traded on the newest day but are not in NSE's equity list (EQUITY_L.csv). New listings join automatically within a day or two; older names that stay here are not in NSE's list (for example companies under insolvency) and are left out on purpose.

- BGLOBAL: traded on 2026-11-02, not in our list yet
- CEREBRAINT: traded on 2026-11-02, not in our list yet
- CLCIND: traded on 2026-11-02, not in our list yet
- CMICABLES: traded on 2026-11-02, not in our list yet
- EDUCOMP: traded on 2026-11-02, not in our list yet
- IMPEXFERRO: traded on 2026-11-02, not in our list yet
- LASA: traded on 2026-11-02, not in our list yet
- NAGAFERT: traded on 2026-11-02, not in our list yet
- SELMC: traded on 2026-11-02, not in our list yet
- SKIL: traded on 2026-11-02, not in our list yet
- SPELS: traded on 2026-11-02, not in our list yet
- UNIVAFOODS: traded on 2026-11-02, not in our list yet

### no_history: 2

In the list, no stored day yet: listed in the last day or two, or not traded yet. The daily job brings them; if one stays here for a week, run Actions -> Backfill history (job stocks, that symbol).

- BLSPOLY: no day stored yet
- SFCTECH: no day stored yet

### inactive: 2

No trade for more than 10 days (suspended or not traded). Left out of liquid, scanners and breadth.

- KALYANI: last trade 2026-08-28
- SAB: last trade 2026-10-15

### late_start: 34

History starts more than 30 days after the listing date (or after 2007). Usually a long suspension, a move from NSE's SME board or from BSE, or a rename NSE's symbolchange.csv does not list. Renames are searched by ISIN with scripts/find_renames.py and added to config/symbol_changes_extra.csv.

- 21STCENMGM: listed 1995-05-03, history from 2018-01-11 (4028 days later)
- ABCIND: listed 2025-09-24, history from 2026-10-26 (397 days later)
- ARENTERP: listed 1995-10-18, history from 2017-11-07 (3963 days later)
- BANARBEADS: listed 1995-07-07, history from 2011-12-29 (1823 days later)
- BIOFILCHEM: listed 1996-06-12, history from 2017-07-27 (3860 days later)
- CORALFINAC: listed 1996-03-25, history from 2017-03-29 (3740 days later)
- CUBEXTUB: listed 1996-04-24, history from 2008-01-25 (389 days later)
- ESSENTIA: listed 2013-08-20, history from 2022-03-07 (3121 days later)
- GUJRAFFIA: listed 1996-10-09, history from 2017-12-13 (3999 days later)
- HAVISHA: listed 2000-02-16, history from 2018-04-12 (4119 days later)
- ICDSLTD: listed 1999-11-17, history from 2021-07-06 (5300 days later)
- JUBLCPL: listed 2025-02-14, history from 2025-07-03 (139 days later)
- KALYANI: listed 2017-02-13, history from 2022-03-02 (1843 days later)
- KEEPLEARN: listed 1995-03-01, history from 2022-04-11 (5579 days later)
- KREBSBIO: listed 1996-01-03, history from 2016-10-27 (3587 days later)
- MAHAPEXLTD: listed 1998-01-21, history from 2018-04-05 (4112 days later)
- MODIRUBBER: listed 1996-02-07, history from 2018-06-20 (4188 days later)
- MODTHREAD: listed 1995-11-22, history from 2024-02-14 (6253 days later)
- NIRAJISPAT: listed 2016-10-27, history from 2024-03-11 (2692 days later)
- NKIND: listed 1995-07-07, history from 2016-03-31 (3377 days later)
- OSWALAGRO: listed 1995-03-29, history from 2018-02-01 (4049 days later)
- PARASPETRO: listed 1996-02-14, history from 2010-08-30 (1337 days later)
- PATANJALI: listed 2020-01-24, history from 2022-07-13 (901 days later)
- PCBL: listed 1995-03-29, history from 2022-01-13 (5491 days later)
- PDSL: listed 2014-10-21, history from 2022-02-17 (2676 days later)
- PKTEA: listed 2015-08-19, history from 2015-10-06 (48 days later)
- PREMIERPOL: listed 1995-12-13, history from 2012-08-16 (2054 days later)
- PRUDMOULI: listed 1995-05-10, history from 2023-12-22 (6199 days later)
- RBA: listed 2020-12-14, history from 2022-02-17 (430 days later)
- S&SPOWER: listed 1995-09-27, history from 2020-03-30 (4837 days later)
- SEPC: listed 2008-02-20, history from 2022-03-09 (5131 days later)
- TECILCHEM: listed 1995-12-06, history from 2023-04-20 (5953 days later)
- VASWANI: listed 2011-09-20, history from 2011-10-24 (34 days later)
- ZFCVINDIA: listed 2008-10-01, history from 2022-04-01 (4930 days later)

### no_sector: 38

NSE gave no sector / industry; asked again every day.

- ABMINTLLTD: NSE gave no classification
- BAFNAPH: NSE gave no classification
- BLSPOLY: NSE gave no classification
- CAPTRUST: NSE gave no classification
- CUBEXTUB: NSE gave no classification
- DCMFINSERV: NSE gave no classification
- ELCIDIN: NSE gave no classification
- GFLLIMITED: NSE gave no classification
- ICDSLTD: NSE gave no classification
- KICL: NSE gave no classification
- LYKALABS: NSE gave no classification
- NSIL: NSE gave no classification
- PALREDTEC: NSE gave no classification
- PANACEABIO: NSE gave no classification
- PANACHE: NSE gave no classification
- PANAMAPET: NSE gave no classification
- PANCHMAHQ: NSE gave no classification
- PANORAMA: NSE gave no classification
- PANSARI: NSE gave no classification
- PAR: NSE gave no classification
- PARACABLES: NSE gave no classification
- PILANIINVS: NSE gave no classification
- QUINTEGRA: NSE gave no classification
- RAJSREESUG: NSE gave no classification
- RAJTV: NSE gave no classification
- RALLIS: NSE gave no classification
- RAMANEWS: NSE gave no classification
- RAMAPHO: NSE gave no classification
- RAMASTEEL: NSE gave no classification
- RAMBHAJO: NSE gave no classification
- SFCTECH: NSE gave no classification
- SILINV: NSE gave no classification
- SUPREMEENG: NSE gave no classification
- TIKONA: NSE gave no classification
- VALIANTLAB: NSE gave no classification
- VELJAN: NSE gave no classification
- VIJIFIN: NSE gave no classification
- WILLAMAGOR: NSE gave no classification

### no_shares: 2626

No share count yet (market cap and free float unknown). Filled by the daily job (a few hundred per run) or at once by Actions -> Backfill history -> job classification.

- 20MICRONS: share count not fetched yet
- 21STCENMGM: share count not fetched yet
- 360ONE: share count not fetched yet
- 3BBLACKBIO: share count not fetched yet
- 3IINFOLTD: share count not fetched yet
- 3MINDIA: share count not fetched yet
- 3PLAND: share count not fetched yet
- 5PAISA: share count not fetched yet
- 63MOONS: share count not fetched yet
- A2ZINFRA: share count not fetched yet
- AAATECH: share count not fetched yet
- AADHARHFC: share count not fetched yet
- AAKASH: share count not fetched yet
- AAREYDRUGS: share count not fetched yet
- AARNAV: share count not fetched yet
- AARON: share count not fetched yet
- AARTECH: share count not fetched yet
- AARTIDRUGS: share count not fetched yet
- AARTIIND: share count not fetched yet
- AARTIPHARM: share count not fetched yet
- AARTISURF: share count not fetched yet
- AARVI: share count not fetched yet
- AASTHA: share count not fetched yet
- AAVAS: share count not fetched yet
- ABAN: share count not fetched yet
- ABANSENT: share count not fetched yet
- ABB: share count not fetched yet
- ABBOTINDIA: share count not fetched yet
- ABCAPITAL: share count not fetched yet
- ABCIND: share count not fetched yet
- ABDL: share count not fetched yet
- ABFRL: share count not fetched yet
- ABINFRA: share count not fetched yet
- ABLBL: share count not fetched yet
- ABMINTLLTD: share count not fetched yet
- ABMKNO: share count not fetched yet
- ABREL: share count not fetched yet
- ABSLAMC: share count not fetched yet
- ACC: share count not fetched yet
- ACCELYA: share count not fetched yet
- ... and 2586 more (see stock_audit.csv)

