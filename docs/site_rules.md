# Website-only rules (not fields of screen.json)

Simple rules the website applies in the browser. Our own rules, not advice.

## Results grade (earnings page, Phase N6) - site/logic.js `earnGrade`, tested in tests/js/earn.test.js
Latest quarter vs the same quarter a year before (consolidated when filed, else standalone):
- **Excellent**: sales growth >= +15 % and net profit growth >= +25 % with a profit; or a turnaround (loss / zero a year ago,
  profit now) with sales >= +15 %.
- **Good**: sales >= +5 % and profit >= +5 % with a profit; or any turnaround.
- **Weak**: a loss this quarter, or sales and profit both lower.
- **Mixed**: everything else with numbers. No numbers = no grade.

Signals (filters): EPS YoY > 100 %, profit YoY > 50 %, sales YoY > 25 %, EPS growth speeding up (eps_g_accel_qtrs >= 1),
net margin up (npm_up_qtrs >= 1), turnaround, RS rating >= 70.

## Home page (Phase N5)
- Today's setups: Near Pivot, VCP, Flag and Tight Range scanners; liquid that day, RS rating >= 70; closest to the pivot
  first (|dist_pivot|); 15 shown.
- Where the money is: themes (not "small") by 1-week average member return; top 5 and bottom 3.
- Nifty expiry: weekly = every Tuesday, monthly = the last Tuesday of the month (holidays move it a day earlier).
- Watchlist plan: good day = 1D >= +1 %, weak day = 1D <= -1 %, else quiet; signals = pocket pivot, up on high volume,
  highest volume ever, RS line at a 52-week high, breakout today, within 3 % below the pivot, volume dry-up, new 20-day low.

## Heatmap (Phase N7)
- Tiles: squarified treemap (site/logic.js `squarify`, tests/js/treemap.test.js); first by sector, then by stock.
- Area: today's turnover (Rs crore), market cap, or equal. Colour: diverging red - grey - green, capped at +/-3 % (1D),
  6 % (1W), 12 % (1M), 25 % (3M); from 52W high 0 to -40 %; RS rating centred on 50.

## RRG (Phase N9)
- Points come from swingdash/group_rank.py (strength, momentum; config/group_rank.yaml). Daily tail = the last 5 / 10 / 20
  sessions; weekly = points 5 sessions apart (last 5 / 10). Benchmarks: equal-weight market (default), Nifty 50, Nifty 500.
- Drawn tails: inner points smoothed 1-2-1, the head is exact. Heading = direction of the last step (8 arrows).
