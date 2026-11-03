# Reference notes (Phase 0)

Study of the third-party scanner app in `reference/SN/` (287 screenshots, git-ignored, never published). Descriptions here are
written in my own words; names of features are kept only to map them. Data in the screenshots: "through Fri 30 Oct 2026".
`reference/all-stocks.csv` is the app's export of the **03-Nov-2026** session (RELIANCE 1,307.90), not 30-Oct.
UNKNOWN = not readable / not stated: to be asked or calibrated.

## 1. Scanner page (folder "2. Scanner")

Layout: left "Results" list (checkbox, logo, symbol, LTP; search, sort, column settings icons), top bar (stock search, "+ New
scan", scanner picker, filter icon, pinned scanners), right chart. Footer: "N stocks", "2,599 scanned", "N of M selected",
"Not investment advice - Data delayed". URL per scanner, e.g. `/scanners/stage2-breakout`.

Chart header (30-Oct, MARSONS): `F ₹1,186 Cr` (float market cap), `RS 81`, `2 Uptrend` (stage), `T Weak` (theme status),
`D -15.3%` (distance from 52W high); line 2: symbol, `1D`, O H L C, change (+19.81 %), `1M +26.0%`, `3M +35.9%`;
a one-line company description; MA legend (`SMA 20`, `SMA 200`); a **Pivot** line with price tag (144.28); markers under
candles: **E** (earnings), **C**, **M** (others - see News); volume pane `Vol 3.0Cr`, `Avg 20D 39.7L`, `RVol 747%`.
Under the chart an **Earnings** table: quarters (Q1 FY26 ... Q1 FY27) with EPS ₹ and Sales Cr, each with YoY and QoQ %.
Drawing toolbar: back, cursor, trend line, text, measure, colour dot, delete. Toggles: D / W, candle / bar, `MA`, `fx Indicators`.

### Scanner tree (counts on 30-Oct, out of 2,599 scanned)

| Folder | Scanner | Count | What it looks for (my words) |
|---|---|---|---|
| My Scans | All Stocks | 2,599 | every stock, no test; start of a custom filter |
| Classic | Trend Template | 165 | healthy uptrend: above rising MAs, well off lows, near highs, stronger than the market |
| Classic | Stage 2 Breakout | 30 | above the 50-day high on ~2x usual volume, closing near the day's high, entering Stage 2 from a base |
| Classic | Recent Breakout | 7 | broke out of a base on strong volume recently, still above the old level; shows days since + run |
| Classic | 4% Breakout | 31 | strong up day on heavy volume, liquid stocks; the one-day move is the signal |
| Classic | 20-SMA Pullback | 4 | recent leaders back at the 20-day average while the short-term trend is up |
| Classic | High Volume | 24 | highest volume of a quarter / year / ever, on a strong up day |
| Classic | 1M Gainers | 22 | biggest 1-month gainers, liquid only |
| Classic | 3M Gainers | 64 | biggest 3-month gainers, liquid only |
| Classic | Outperformers | 31 | **stated rule**: RS rating 1W > 90, 1M > 85, 3M > 80, liquid = 30-session median turnover >= ₹1 Cr and price >= ₹5 |
| Classic | Doublers | 50 | UNKNOWN tooltip (not captured yet) |
| Classic | New Listing (IPO) | 130 | listed in the last year, read against the high and low since listing |
| Earnings | Earnings Gap | 14 | gapped up on results, held the gap that day, not filled since |
| Earnings | Episodic Pivot | 23 | big up day on results closing near the high |
| Earnings | EPS Doublers | 41 | latest quarter EPS, sales and profit all up sharply YoY; listed ~6 weeks after results |
| Earnings | Code 33 | 21 | sales growth, EPS growth and net margin all rising 3 quarters in a row (each YoY); tiny / loss bases excluded |
| Earnings | EPS Accelerators | 96 | EPS growth rising 3 quarters in a row on growing sales (each YoY); wider than Code 33 |
| Earnings | Turnarounds | 26 | loss a year ago, profit now, sales growing and profit improving each quarter |
| SN Special | Daily Base | 153 | young daily base (weeks to a few months), price back near the top, no breakout yet |
| SN Special | Weekly Base | 70 | same on weekly bars, bases 4-18 months old |
| SN Special | Near Pivot | 22 | just under a key resistance; "close" scaled by the stock's usual daily move |
| SN Special | VCP | 2 | (tooltip not captured yet) |
| SN Special | Tight Range | 8 | very narrow range inside an uptrend; two tight-range scans combined |
| SN Special | Flag Pattern | 0 | (tooltip not captured yet) |
| SN Special | 50-EMA Pullback | 21 | strong uptrend resting on the 50-day average after a quiet month; deeper than the 20-SMA scan |
| SN Special | New RS before Price | 105 | RS line made a new high before the price did |
| SN Special | IPO Base | 1 | (tooltip not captured yet) |
| SN Special | Big Reversal | 16 | (tooltip not captured yet) |
| SN Special | Shakeout | 41 | (tooltip not captured yet) |
| Intraday | (contents) | - | not opened in the screenshots |

### Chart overlays and markers seen on scanner results

- VCP (CHENNPETRO): base-top line + contraction swings labelled with their depth (-21.0% / -15.4% / -5.3%).
- Daily / Weekly Base (NAVINFLUOR / MANOMAY): base-top line + a U-shaped curve under the base.
- Tight Range (PANACHE): two horizontal lines (band top / bottom).
- Shakeout (TRENT): U-curve showing the dip under support and the recovery.
- Big Reversal (ANNAPURNA): up-arrow under the reversal bar.
- Near Pivot (ETERNAL), others: Pivot line with price tag.
- Markers under candles: **E**, **C**, **M**, **R**, **O** (with a small count badge when several fall on one bar).
- Theme status values seen: Weak, Resting, Fading. Stage chips: "2 Uptrend", "3 Topping", "4 Downtrend".
- Weekly chart MA preset: SMA 10W + SMA 20W. Daily preset: SMA 20 + SMA 200 (others seen: 50 EMA).
- Volume bar colours: blue, red, green, grey, orange (meaning UNKNOWN - calibrate; likely up/down day + special volume).
- Timeframes: D, W, 5m, 15m, 30m, 1h, 75m (favourite hearts). Intraday is out of scope for a free daily-data site.

### Sort menu
A-Z, Price, Price x Volume, Market cap, RS rating, From 52W high, Performance (1D %).

### Column settings (8 groups, 96 columns)

Default "Your columns" (7): 1D Change %, Volume, Turnover (₹), 1W Change %, Relative Volume, Market Cap (₹ Cr), RS Rating.
Drag to reorder, x to remove, reset icon; "Changes saved automatically" (per user, so localStorage for us).

| Group | Count | Columns |
|---|---|---|
| General | 15 | Market Cap, Sector, Industry, Themes, Free Float (Cr shares), F&O Stock, Description, Catalyst, Recent Order, Listing Date, Days Since Listing, From Listing-Day High %, IPO Listing Date, Days Since IPO, Return Since IPO % |
| Price & Day | 7 | 1D Change %, 1D Change ₹, Open, Day High, Day Low, Previous Close, Gap Up % |
| Returns | 7 | 1W, 10D, 1M, 3M, 6M, 1Y, YTD % |
| Moving Averages | 8 | distance from 10 SMA / 20 SMA / 50 EMA / 200 SMA %, and their values |
| Highs, Lows & Pivot | 11 | 20D High, 20D Low, 52W High, 52W Low, All-Time High, From 52W High %, From 52W Low %, From ATH %, Days Since 52W High, Pivot Price, Distance from Pivot % |
| Volume | 10 | Volume, Turnover ₹, Relative Volume (Vol / 20D avg), Avg Vol 20D, Avg Vol 50D, Vol Change vs Prev Day %, Vol / 50D Avg, Avg Daily Turnover 20D ₹Cr, Avg Daily Turnover 50D ₹Cr, Delivery % |
| Strength | 17 | RS Rating, RS Rating Change (1W), RS Rating Change (1M), RS Rating 1M Ago, RS Line at 52W High, RS Line New High (Today), RSI (14), ADR % (20 Days), Stage, Beta (1Y vs Nifty 50), Sector Rank (1M), Industry Rank (1M), Sector Performance (1W) %, Industry Performance (1W) %, Stock vs Sector Return % (1M), Stock vs Industry Return % (1M), Industry RS Rating |
| Fundamentals | 21 | P/E, PEG, P/B, EPS (TTM ₹), ROE %, ROCE %, Dividend Yield %, Debt to Equity, EPS Growth YoY %, Sales Growth YoY %, PAT Growth YoY %, Operating Margin % (TTM), Last Earnings Date, Next Earnings Date, Sales Growth QoQ %, PAT Growth QoQ %, Promoter Holding %, FII Holding %, DII Holding %, FII Change vs Last Quarter (pts), DII Change vs Last Quarter (pts) |

### More scanner-page details

- **Scanner tooltip VCP**: each pullback smaller than the one before, tightening under a high; strong uptrend required.
- Counts on 03-Nov early morning (data = 02-Nov): Daily Base 171, Weekly Base 81, Near Pivot 27, VCP 2, New RS before Price 65,
  IPO Base 3, Big Reversal 20, Shakeout 35. VCP footer said "183 scanned" (not 2,599): looks like a pre-filter (UNKNOWN which).
- **Volume labels / colours**: confirmed by the Volume indicator legend (see section 2): grey normal, green / red = up / down
  day with volume above the 20-day average, blue = pocket pivot, orange = dry-up; labels HVE / HVY / HVQ (highest ever / year /
  quarter) and Y / Q (lowest of year / quarter).
- **Marker hover**: News card "NEWS - date - n" with category + time + headline. Categories seen: **E** Earnings, **C** Corporate
  action, **R** Regulatory & legal; M and O UNKNOWN (likely Management / Order win). An E marker hover shows a results card:
  Sales / Profit / EPS with YoY % and the two quarters' values, plus the day's price move.
- **Price-axis tags**: last price, MA values, pivot, and the base low (dotted line) are tagged on the right axis.
- **Stock side panel** (right toggle): name, NSE + BSE codes, price, 1M / 3M; Overview text; chips Sector, Industry, next
  "Earnings <date>"; Key ratios: Market cap, P/E, Book value, Div yield, ROCE, ROE, Float mcap, Float %, RS rating, ADR %, RVol,
  Avg vol 30d (₹ Cr); "Pros & Cons - auto-generated from financials" (e.g. 3-yr ROE, ROCE vs peer median, 5-yr sales / profit CAGR).
- **Grid view** (icon top right): 2x2 or 3x2 charts per screen; card = symbol, 1D %, M (mcap), F (float mcap), mini chart with MAs,
  Vol / Avg 20D (Avg 20W on weekly) / RVol. Grid sort: Scan order, A-Z, Market cap, Price, Performance (1D %), RS rating, Volume.
- List sort menu has a reset icon and an up/down arrow per field; Performance period is selectable (1D % ...).
- Footer: Copy (symbols) and CSV export of the result list.
- Legend row of the MA layer has eye (hide), gear (settings), x (remove). Drawing toolbar items: back, cursor, line, text,
  measure, colour, delete.

### Chart settings (gear icon; folder "Chat Settings")

Tabs **Markers** / **Display**, buttons Reset / Done.
- Chart style: Default (blue/pink), Classic (green/red, default), Contrast (blue/orange), Mono (grey/black).
- Setups (off by default): Pivot / breakout line; Tight areas = 5+ bars whose closes stay in a narrow band (green shaded box);
  Inside bars = bar inside the previous bar's range (small circle).
- Events: Earnings dates (E, on by default; hover = results numbers); News markers (N, on; by type: **E** Earnings,
  **O** Orders & business, **C** Corporate action, **R** Regulatory & legal, **M** Management & promoters, **S** Sector & market);
  Circuit limits (dotted orange line, off).
- Price levels: 52-week high & low (dashed lines); Swing % moves (up/down triangles with % of each swing).
- Display: around the chart = Earnings snapshot, Company description (both on); Header chips = Float, RS rating, Stage, Theme,
  From high (each toggle).
- "Narrow band" width for tight areas: UNKNOWN (calibrate).

### Stock fundamentals (folder "Fandaments")

Stock page has tabs **Chart** / **Financials**. Financials page (screener-like, consolidated with "View Standalone" link):
- Quarterly Results, last 12 quarters: Sales, Expenses, Operating Profit, OPM %, Other Income, Interest, Depreciation,
  Profit before tax, Tax %, Net Profit, EPS.
- Profit & Loss, 10-11 years + TTM, same rows; boxes: Compounded Sales Growth (10/5/3 yr, TTM), Compounded Profit Growth
  (10/5/3 yr, TTM), Stock Price CAGR (3 / 1 yr), Return on Equity (10/5/3 yr, last year).
- Balance Sheet, 12 years: Equity Capital, Reserves, Minority Interest, Non-current Liabilities, Current Liabilities, Total
  Liabilities, Fixed Assets, CWIP, Investments, Other Assets, Total Assets.
- Cash Flows, 12 years: Operating, Investing, Financing, Net Cash Flow, Capital Expenditure, Free Cash Flow.
- Shareholding Pattern, 12 quarters: Promoters, FIIs, DIIs, Public, Others, No. of Shareholders.

Side panel (on the scanner page) sections, each collapsible with a one-line summary: Overview (RS, P/E, ROCE), Financials
(latest quarter YoY sales / profit), Peers ("#39 of 73 by size, P/E vs peer median"), Shareholding (promoters, FII, holders),
Concalls ("no transcript / presentation filed in the last two quarters").
- Financials block: tabs Quarterly / Annual / Balance sheet / Cash flow; each row with a 12-quarter mini bar chart, latest value,
  YoY, QoQ (margins in pts); "See all 13 quarters"; Growth CAGR grid (Sales, Net profit, Share price, ROE x 3Y/5Y/10Y).
- Peers table: Company, Mcap, P/E, Sales growth, Profit growth, ROCE; "Compare all 73 peers" (peers = same NSE industry).
- Shareholding: stacked bar + per holder 12-quarter mini bars, latest %, QoQ and 1Y change; shareholders count.
- Pros & Cons: rule-based sentences from the numbers (e.g. "Only -53% of profit came in as cash over 3 years").

## 2. Indicators (folder "2. Scanner/Indicator", the "fx Indicators" menu)

Menu groups: On the price / Volume and strength / Trend / Oscillators; search box. Each item has a short description, a
60-week preview on TRENT, settings with (i) tips, colour picker (21 colours), reset, Cancel / Apply. Pane indicators choose
"Pane above" or "Pane below". Defaults on: Moving averages, Volume.

| Indicator | What it is (my words) | Settings and defaults |
|---|---|---|
| Moving averages | average-close lines | Presets: **Minervini** daily EMA10, EMA21, SMA50, SMA150, SMA200 / weekly SMA10, SMA30; **Weinstein** daily SMA50, SMA150 / weekly SMA10, SMA30; **Qullamaggie** daily EMA10, EMA20, SMA50 / weekly SMA10, SMA20; **O'Neil** daily EMA21, SMA50, SMA200 / weekly SMA10, SMA40; **My preset** (default) daily SMA20, SMA200 / weekly SMA10, SMA20; "Custom" when edited. Per line: type (SMA/EMA), length, colour, remove; "+ Add average"; "Save current look as my default" |
| Supertrend | ATR trailing stop, green under price in uptrend, red above in downtrend, flips on a close through | ATR length 10, multiple 3x (1, 1.5 ... 5), up / down colours |
| Bollinger Bands | SMA with standard-deviation bands | length 20, std dev 2 (1-3), middle + band colour, shade between bands (on) |
| Swing Bands | gap between two T3 (Tillson) averages, green while fast > slow, red otherwise | fast 8, slow 14, volume factor 0.65 (0.5-0.9) |
| Watermark | faint symbol / name / sector text on the chart | symbol + timeframe, company name, market cap (off), sector + industry; Top/Middle/Bottom; size S/M/L; colour |
| Volume | daily volume bars | show on price chart or pane below (default); bar colour; average volume line (20 days daily, 20 weeks weekly; off); colour high-volume days up / down (green / red), "high volume means" above the average / 1.5x / 2x / 2.5x; pocket pivots (blue) and dry-ups (orange). Labels HVE, HVY, HVQ, Y, Q |
| RS line | stock close / index close | pane above (default) or below; compare with Nifty 50, Nifty 500, Nifty Midcap 150, Nifty Smallcap 250 (default seen), Sector index; line colour; dot on a new RS high before the price |
| Mansfield RS | (RS line / its 52-bar SMA - 1) x 100 | compare-with shared with RS line; length 52; background colours: green above a rising average, blue below a rising one, grey above a falling one, red below a falling one |
| Stage Analysis | pane coloured bar by bar: Stage 1 Basing, 2A Early uptrend, 2 Uptrend, 3 Topping, 4 Downtrend, 4A Improving | colour strength Light / Medium / Strong. Rules UNKNOWN (likely price vs 30-week / 150-day SMA and its slope) -> calibrate against the header stage chip |
| RSI | Wilder RSI | length 14, lines 70 / 30, shade zone (off) |
| MACD | EMA12 - EMA26, signal EMA9; histogram blue above 0 / pink below, solid while growing, faint while shrinking | 12 / 26 / 9, line colours |
| Money Flow Index | volume-weighted RSI on typical price | length 14, lines 80 / 20, shade (off) |
| Relative Extension | price stretch from its 50-day average scaled against the biggest stretches of the last 250 days: +100 = as far above as it has been, -100 = as far below | average SMA/EMA/WMA/VWMA, length 50, lookback 250, overbought / oversold 70 / 70, shade zones (on). Exact scaling UNKNOWN (probably dist% / max(abs dist%) over 250 days x 100) |
| ATR | average true range in rupees | length 14 |
| ADR % | average daily range as % of price | length 20 (formula calibrated: 100 x (SMA20(H/L) - 1)) |
| Trend Intensity | SMA7 / SMA65 x 100 | 7 / 65, strong levels 105 / 95, shade distance from 100 (on) |

## 3. Groups page (folder "3.Groups")

Tabs **Sector (23) / Industry (172) / Theme (96)**; period buttons 1D / 1W (default) / 1M / 3M / 1Y / YTD; search box;
"Show small groups" check (Industry and Theme). Footer: "22 of 23 sectors", "84 of 172 industries, small groups hidden,
27 new listings not yet scannable", "78 of 96 themes"; Copy / CSV.

- **Sector tab**: left table Sector, Rank (with small +/- rank change), Med 1W (median stock return over the period),
  20D H/L (count of stocks at a 20-day high / 20-day low). Right: the chosen sector's industries: Industry, Rank, Med 1W,
  > 50 SMA (% of stocks above their 50-day SMA), Stocks; industries with < 5 stocks show "-" for rank and > 50 SMA
  and are greyed; link "All <sector> stocks N".
- Sector names = NSE sector level (our classification has it): Media & Entertainment, Healthcare, Telecom, Textiles, Services,
  Auto & Components, Forest Materials, IT, Consumer Services, Capital Goods, Oil & Gas, Consumer Durables, FMCG, Financial
  Services, Realty, Chemicals, Diversified, Construction Materials, Metals & Mining, Utilities, Power, Construction.
  Industry names = NSE basic industry (e.g. Pharmaceuticals, Hospital, Iron & Steel). Note: Industry tab uses a slightly
  different, shorter naming (e.g. "Power Generation", "Investment Company", "Healthcare Services") -> they map NSE names.
- **Rank is NOT the period return** (Power is 21st with +4.06% 1W; Aerospace theme 1st with -0.25%). sector-ranks.csv
  (03-Nov) gives rank, rank_change and a tag Leading / Weakening / Lagging / Improving = RRG quadrant. So rank = a
  relative-strength score of the group (likely RS-ratio / momentum vs Nifty 500 as in RRG, or median RS rating).
  UNKNOWN exact formula -> calibrate on sector-ranks.csv.
- **Industry / Theme tab**: left Group, Rank, Med (sortable), 20D H/L; right the group's stock list (Symbol, LTP, 1D %,
  % from 20-day EMA ("% FR 20D"), RS, Themes) with the same column settings + sort menu as the scanner; clicking a stock opens
  the chart view with an "INDUSTRIES" side rail. Symbol badges **20H** / **20L** = at a 20-day high / low today.
- Theme status chip values seen so far: Weak, Resting, Fading, **Bounce**.
- Themes (96, 78 shown): editorial lists (Aerospace, Generics & APIs, Defence Electronics, Data Centres, EMS, Rare Earths ...).
  This is their own curation -> we can NOT copy it; our own theme list would have to be written by Viraj (or skipped).

## 4. Markets page (folder "4. Markets/Market Breadth")

Two tabs: **Market Breadth** and **Major Indices** (Major Indices not captured). Universe picker "Liquid stocks 1,507"
(default) or "All stocks 2,526". Range 1M / 3M (default) / 1Y. Grey line in every chart = Nifty 500. Hover on any day shows that
day's numbers and changes the headline value + its date.

Left panel "Market Breadth - read as of <date>": six rule-based verdicts, each a coloured word + one plain sentence:
| Item | Values seen | Meaning (my words) |
|---|---|---|
| Momentum | Building | short-term buying picking up but not yet lasting |
| Short-term | Down | share above 20-day avg + net 20D highs-lows |
| Big trend | Down | share above 200-day avg + stage mix |
| Breakouts | Failing | share of new breakouts still holding after 5 days ("3 in 10") |
| Overdone? | Normal | small caps stretched vs their usual range or not |
| Leadership | Large caps lead | which of Nifty 50 / Midcap 150 / Smallcap 250 leads over the range |
Thresholds UNKNOWN (we set our own and show the rule).

**Stage Analysis bar**: "of 1,459 stocks (64+ days)": Base / Uptrend / Top / Downtrend % (0.9 / 17.6 / 18.9 / 62.7 liquid;
1.1 / 15.7 / 14.6 / 68.6 all) with change in count vs previous day; stock needs 64+ days of history.

Market internals (6 charts):
1. **Participation** % above 20D / 50D / 200D average; label Very narrow / Narrow / Mixed / Broad; "better / worse / steady"
   arrow vs some days ago; shaded bands at ~20% and ~80%.
2. **Advance / Decline** ratio summed over 20D or 40D (e.g. "avg 636 up / 881 down" -> 0.72), or the cumulative **A-D line**;
   labels Far more fallers / More fallers / Balanced / more risers.
3. **Large vs Mid vs Small**: Nifty 50, Midcap 150, Smallcap 250 % change over the range.
4. **Net highs - lows**: 20-day or 52-week highs minus lows (bars), "24 highs / 105 lows".
5. **4% movers**: daily count up >= 4% minus down >= 4% (bars) or 5D / 10D ratio of up to down (line, band 1-3).
6. **Breakouts - breakdowns**: per day Breakouts (held), Breakdowns (failed), Net, Follow-through >= 5%, "Held, 5-session avg %";
   chip "6 held, 8 failed today - 27% held this week". Breakout definition UNKNOWN (likely close above 20D/50D high).
Liquid = 1,507 stocks (same liquidity rule as Outperformers, probably). All computable from our daily data.

## 5. Pages bar (tabs on top): Warm-up, Intraday, Earnings, Heatmap, Leaders, RRG, News, "+ Add page"

Leaders and Intraday pages were not captured -> UNKNOWN (Intraday is out of scope anyway: daily data only).

### Earnings page (folder "Earning")
- Week calendar (5 day columns, prev / next / Today). Past day header: "118 results, EPS YoY ▲71 ▼26"; future day: "130 due".
  Top right: "Q2 FY27 season 794 / 2,599 stocks announced".
- Each stock row has a **grade**: Excellent / Good / Mixed / Weak. Info tip: grade uses the company's own record (sales and
  profit growth, growth speeding up or not, margin change, and the price reaction), not analyst estimates.
  Formula UNKNOWN -> we define our own points system and show it.
- Hover card: Sales, PAT, EPS (actual, YoY, QoQ) and Margin (actual, YoY change in pp).
- Right panel "Recent earnings" (search + Filters): per stock price, mcap, Sales / EBITDA / Net profit / EPS for the latest quarter,
  previous quarter and same quarter last year with YoY arrow; note for half-yearly filers ("this quarter is the half-year less
  the quarter before").
- Filters: Market cap, EPS growth %, Sales growth %, Profit growth % (between ... and ...); Grade (4); Signals: EPS YoY > 100%,
  PAT YoY > 50%, Sales YoY > 25%, Accelerating, Margin up, Turnaround, RS >= 70.
- Needs: results calendar (future dates = NSE board-meeting announcements) + quarterly numbers (NSE XBRL results).

### Heatmap page (folder "Heatmap")
- Treemap grouped by NSE sector (sector name header with ">" link), tile = stock; hover = name, sector / industry, mcap, change.
- Controls: Index (Nifty 50, Nifty 200, Midcap 150, Smallcap 250, MidSmall 400); Area (Market cap, Turnover, None);
  Colour (Perf 1D / 1W / 1M / 3M %, RS rating). Colour scale -2 / -1 / -0.2 / 0.2 / 1 / 3 % (red - grey - green).
- Footer "Market closed - showing Fri 30 Oct, last snapshot 15:31" (they have intraday snapshots; we show end of day).
- Needs: index membership lists (NSE index constituents CSV), market cap (shares x price).

### News page (folder "News")
- Tabs: **Stock news** / **Global** / **Orders & deals** / **My watchlist**. Stock news filter chips: All, E Earnings,
  O Orders, C Corp action, R Regulatory, M Management. Footer "200 of 16,003 headlines, latest Sat 31 Oct 20:48".
- Row: symbol, category letter + name, a trust tag (**Confirmed filing** = from an exchange filing, with "Source" link;
  **Media report**, **Letter of intent / award**, **Unconfirmed report**, **Proposed**), one-line summary, time.
  The summaries are rewritten text (probably AI) of exchange filings + a paid news wire. Global = world headlines (wire).
- Orders & deals: left "Order wins" (O-category news); right **Bulk & block deals** table: Date, Stock (BLOCK badge), Client,
  Side, Qty, Price, ₹ Cr, % of equity; filters Last day / 5 days / 30 days, Bulk + block / Bulk / Block.
- For us: NSE corporate announcements (official, with PDF link) + NSE bulk / block deal files are free and public.
  Media / global wire headlines: no free licensed source -> skip. AI summaries: skip (no paid API); show NSE's own subject line.

### RRG page (folder "RRG")
- Relative Rotation Graph of the 22 NSE sectors (or the Top 20 / All themes). x = **RS-Ratio** (strength), y = **RS-Momentum**,
  both centred on 100; quadrants Leading (top right), Weakening (bottom right), Lagging (bottom left), Improving (top left).
- Controls: quadrant chips with counts (click = hide / show), Tail 5 / 10 points, Sectors / Themes, Daily / Weekly,
  benchmark **vs Equal-weight market** (default), vs Nifty 50, vs Nifty 500, vs Nifty Smallcap 250. Footer "20 sessions
  against the equal-weight market" (look-back window).
- Hover card: RS-Ratio, RS-Momentum, Heading (Gaining / Losing / Fading / Turning up), Sessions in quadrant (20+ cap),
  Momentum, 5 sessions (change). Right list: sectors per quadrant with a direction arrow (angle of the last step).
- Our build: sector index = equal-weight (or mcap-weight) of member stocks' adjusted closes, from our own data; JdK-style
  RS-Ratio / RS-Momentum (normalised RS and its rate of change, 20-session window). The original JdK formula is
  proprietary -> we use the open approximation and say so. Calibrate against sector-ranks.csv tags (Leading / Weakening ...).
  Note sector-ranks.csv (03-Nov) tags match this page's quadrants (e.g. Media Leading, FMCG Lagging, Realty Improving).

### Warm-up page (folder "Warm-up") = the home / morning summary
- **Market condition** (1,507 liquid stocks, as of last close; link to Market breadth): the same six-line Market read (with
  Show less / more), Participation chart (20D / 50D / 200D, 6 months, bands 20% "washed out" / 80% "stretched"; labels Narrow /
  Mixed / Broad), **Stage 2 vs Stage 4** share lines (17.6% vs 62.7%), **FII / DII cash** last 22 sessions (₹ Cr bars, latest
  day, 1-month net), **20-day highs - lows** last 22 sessions (net bars, "76 highs / 309 lows").
- **Indices strip**: Nifty 50, Nifty 500, Midcap 150, Smallcap 250, Microcap 250 (close, % change, 24-session sparkline,
  "% from 52W high", 50E / 200S chips blue when above the 50-day EMA / 200-day SMA), plus USD/INR and Crude oil (WTI).
- **Today's setups**: up to 10 Near Pivot + up to 5 VCP stocks with >= ₹5 Cr daily turnover, sorted by "To pivot %";
  columns RS (blue at 90+), Close, To pivot, 1M %, 3M %, 52W high; checkboxes, "Copy to TradingView", "Open in Scanner".
- **Where the money is**: themes with >= 5 stocks ranked by 5-session return: top 5 Leading, bottom 3 Lagging.
- **Today's events**: Earnings on the next two result days (biggest first; blue = in today's setups), IPOs listing today /
  open / opening soon with price band ("from NSE"; SME tagged), Calendar (Nifty weekly expiry, US / India CPI dates).
- **Your watchlist plan** (needs a watchlist), **Orders, expansion & approvals** (latest O-category news with tags
  Expansion / Order).

### All screenshots viewed (287). Not captured anywhere: Intraday page, Leaders page, Major Indices tab, Doublers tooltip,
Flag Pattern / IPO Base / Big Reversal / Shakeout / VCP rule details, My Watchlist, "+ New scan" builder.

Numbers read off the screenshots for calibration (RRG values, breadth values, counts) are kept privately in
`reference/calibration.md` (git-ignored), not here.

Calibrated formulas (vs all-stocks.csv, 03-Nov): ADR% = 100 x (SMA20(High/Low) - 1); RVol = Vol / mean(Vol of previous 20 days);
RSI = Wilder 14. Catalyst / Recent Order / Themes / Description are editorial text (UNKNOWN source; we cannot copy theirs).
