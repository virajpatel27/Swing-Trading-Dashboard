/* Pure functions of the dashboard (no page access): tested with `node --test tests/js`. */
(function (root) {
  "use strict";

  const PERIODS = ["1d", "1w", "1m", "3m", "6m", "1y", "3y", "5y"];
  const SCREENS = {
    above_50_200: { label: "Above 50 & 200 EMA", test: (r) => r.flags.includes("above_50_200") },
    rsi_50_70: { label: "RSI 50–70", test: (r) => r.flags.includes("rsi_50_70") },
    near_52w_high: { label: "Near 52W high (≤5%)", test: (r) => r.flags.includes("near_52w_high") },
    volume_spike: { label: "Volume spike (>2× avg)", test: (r) => r.flags.includes("volume_spike") },
    strong_rs: { label: "Strong relative strength (RS ≥ 80)", test: (r) => r.flags.includes("strong_rs") },
    breakout_52w: { label: "52W closing-high breakout", test: (r) => r.flags.includes("breakout_52w") },
    breakout_20d: { label: "20-day breakout on volume", test: (r) => r.flags.includes("breakout_20d") },
    uptrend: { label: "Uptrend (close > EMA50 > EMA200)", test: (r) => r.trend === "uptrend" || r.trend === "strong uptrend" },
  };

  /** latest.json (column-wise) -> array of row objects */
  function rowsFromSnapshot(snap) {
    const cols = snap.columns;
    return snap.rows.map((vals) => {
      const o = {};
      cols.forEach((c, i) => { o[c] = vals[i]; });
      o.flags = o.flags || [];
      o.key = keyOf(o);
      return o;
    });
  }

  /** a unique key per instrument: s:RELIANCE, n:NIFTY_50, b:SENSEX */
  function keyOf(r) {
    return (r.kind === "stock" ? "s" : r.exchange === "NSE" ? "n" : "b") + ":" + r.id;
  }

  const inr = typeof Intl !== "undefined" ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : null;
  const inr0 = typeof Intl !== "undefined" ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }) : null;

  function fmtPrice(x) { return x == null ? "–" : inr.format(x); }
  function fmtPct(x) { return x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(2) + "%"; }
  function fmtInt(x) { return x == null ? "–" : inr0.format(x); }
  /** 12345678 -> "1.23 Cr", 456789 -> "4.57 L" (Indian units for volume) */
  function fmtVol(x) {
    if (x == null) return "–";
    if (x >= 1e7) return (x / 1e7).toFixed(2) + " Cr";
    if (x >= 1e5) return (x / 1e5).toFixed(2) + " L";
    return inr0.format(x);
  }
  function fmtDate(yyyymmdd) {
    const s = String(yyyymmdd).replace(/-/g, "");
    const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(s.slice(4, 6)) - 1];
    return `${s.slice(6, 8)}-${m}-${s.slice(0, 4)}`;
  }

  /** filter by view (all / stock / nse / bse), sector, free text, screener keys (AND) */
  function filterRows(rows, { view = "all", sector = "", text = "", screens = [], hideStale = true } = {}) {
    const q = text.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideStale && r.stale) return false;
      if (view === "stock" && r.kind !== "stock") return false;
      if (view === "n500" && !(r.kind === "stock" && r.n500)) return false;
      if (view === "nse" && !(r.kind === "index" && r.exchange === "NSE")) return false;
      if (view === "bse" && !(r.kind === "index" && r.exchange === "BSE")) return false;
      if (sector && r.sector !== sector) return false;
      if (q && !(String(r.symbol).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q)
        || String(r.industry || "").toLowerCase().includes(q))) return false;
      for (const s of screens) if (!SCREENS[s] || !SCREENS[s].test(r)) return false;
      return true;
    });
  }

  /** sort by a column; missing values always last */
  function sortRows(rows, col, dir = "desc") {
    const sign = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string") return sign * x.localeCompare(y);
      return sign * (x - y);
    });
  }

  function csvCell(v) {
    if (v == null) return "";
    if (Array.isArray(v)) v = v.join(" ");
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, cols) {
    return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
  }

  /** chart file (column-wise) -> candles; raw = adjusted / factor */
  function candlesFromChart(c, mode = "adjusted") {
    const out = [];
    const raw = mode === "raw" && Array.isArray(c.f);
    for (let i = 0; i < c.d.length; i++) {
      const f = raw ? c.f[i] : 1;
      const s = String(c.d[i]);
      out.push({ time: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, open: c.o[i] / f, high: c.h[i] / f,
        low: c.l[i] / f, close: c.c[i] / f, volume: c.v ? (raw && c.v[i] != null ? Math.round(c.v[i] * f) : c.v[i]) : null });
    }
    return out;
  }

  /** daily candles -> weekly (Monday-start weeks), for long ranges */
  function toWeekly(candles) {
    const out = [];
    let cur = null, wk = null;
    for (const c of candles) {
      const d = new Date(c.time + "T00:00:00Z");
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
      if (monday !== wk) {
        if (cur) out.push(cur);
        wk = monday;
        cur = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      } else {
        cur.high = Math.max(cur.high, c.high);
        cur.low = Math.min(cur.low, c.low);
        cur.close = c.close;
        if (c.volume != null) cur.volume = (cur.volume || 0) + c.volume;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** EMA over closes (same rule as the pipeline: span n, seeded with the first close, shown from the n-th value) */
  function ema(candles, n) {
    const a = 2 / (n + 1);
    const out = [];
    let e = null;
    candles.forEach((c, i) => {
      e = e == null ? c.close : a * c.close + (1 - a) * e;
      if (i >= n - 1) out.push({ time: c.time, value: e });
    });
    return out;
  }

  const RANGES = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, "MAX": Infinity };
  /** the slice of candles for a range button, counted back from the last candle */
  function sliceRange(candles, range) {
    const days = RANGES[range];
    if (!candles.length || days === Infinity) return candles;
    const last = new Date(candles[candles.length - 1].time + "T00:00:00Z").getTime();
    const from = new Date(last - days * 86400000).toISOString().slice(0, 10);
    return candles.filter((c) => c.time >= from);
  }

  function colorClass(x) { return x == null ? "" : x > 0 ? "up" : x < 0 ? "down" : ""; }

  /** heat colour for a % move: -4 % deep red ... 0 grey ... +4 % deep green, scaled by the period */
  function heatLevel(pct, period) {
    const scale = { "1d": 2, "1w": 4, "1m": 8, "3m": 15, "6m": 25, "1y": 40 }[period] || 8;
    if (pct == null) return 0;
    return Math.max(-4, Math.min(4, Math.round((pct / scale) * 4)));
  }

  /* ---------------------------------------------------------------- results table (Phase S5)
     Column registry: id = field in screen.json (config/fields.yaml), fmt = how it is shown. Only fields that exist. */
  const STAGE_TXT = { 1: "Basing", "2A": "Early uptrend", 2: "Uptrend", 3: "Topping", 4: "Downtrend", "4A": "Improving" };
  const COLUMN_GROUPS = [
    ["General", [["mcap_cr", "Market Cap (₹ Cr)", "cr"], ["sector", "Sector", "text"], ["basic_industry", "Industry", "text"],
      ["float_pct", "Free Float %", "num1"], ["float_mcap_cr", "Float Market Cap (₹ Cr)", "cr"], ["fno", "F&O Stock", "bool"],
      ["listed", "Listing Date", "date"], ["days_listed", "Days Since Listing", "int"], ["price_band", "Circuit %", "text"],
      ["n500", "Nifty 500", "bool"], ["ipo_date", "IPO Listing Date", "date"], ["days_since_ipo", "Days Since IPO", "int"],
      ["ipo_price", "IPO Price", "price"]]],
    ["Price & Day", [["close", "Price", "price"], ["chg_1d", "1D Change %", "pct"], ["chg_1d_rs", "1D Change ₹", "price"], ["open", "Open", "price"],
      ["high", "Day High", "price"], ["low", "Day Low", "price"], ["prev_close", "Previous Close", "price"], ["gap_up", "Gap Up %", "pct"]]],
    ["Returns", [["ret_1w", "1W Change %", "pct"], ["ret_10d", "10D Change %", "pct"], ["ret_1m", "1M Change %", "pct"], ["ret_3m", "3M Change %", "pct"],
      ["ret_6m", "6M Change %", "pct"], ["ret_1y", "1Y Change %", "pct"], ["ret_ytd", "YTD Change %", "pct"]]],
    ["Moving Averages", [["from_sma10", "From 10 SMA %", "pct"], ["from_sma20", "From 20 SMA %", "pct"], ["from_ema50", "From 50 EMA %", "pct"],
      ["from_sma50", "From 50 SMA %", "pct"], ["from_sma200", "From 200 SMA %", "pct"], ["sma10", "10 SMA", "price"], ["sma20", "20 SMA", "price"],
      ["ema50", "50 EMA", "price"], ["sma150", "150 SMA", "price"], ["sma200", "200 SMA", "price"]]],
    ["Highs, Lows & Pivot", [["pivot", "Pivot Price", "price"], ["dist_pivot", "Distance from Pivot %", "pct"], ["pivot_age", "Base Length (days)", "int"],
      ["base_depth", "Base Depth %", "num1"], ["breakout_days", "Days Since Breakout", "int"], ["breakout_run", "Run Since Breakout %", "pct"],["high_20d", "20D High", "price"], ["low_20d", "20D Low", "price"], ["hi52", "52W High", "price"], ["lo52", "52W Low", "price"],
      ["ath", "All-Time High", "price"], ["from_hi52", "From 52W High %", "pct"], ["from_lo52", "From 52W Low %", "pct"], ["from_ath", "From ATH %", "pct"],
      ["days_since_hi52", "Days Since 52W High", "int"]]],
    ["Volume", [["volume", "Volume", "vol"], ["turnover_cr", "Turnover (₹ Cr)", "num2"], ["rvol", "Relative Volume", "x"], ["avg_vol20", "Avg Volume 20D", "vol"],
      ["avg_vol50", "Avg Volume 50D", "vol"], ["vol_chg_1d", "Volume Change vs Prev Day %", "pct"], ["vol_vs_avg50", "Volume / 50D Avg", "x"],
      ["turnover_avg20_cr", "Avg Turnover 20D (₹ Cr)", "num2"], ["turnover_avg50_cr", "Avg Turnover 50D (₹ Cr)", "num2"], ["deliv_pct", "Delivery %", "num1"]]],
    ["Strength", [["rs_rating", "RS Rating", "int"], ["rs_chg_1w", "RS Rating Change (1W)", "signed"], ["rs_chg_1m", "RS Rating Change (1M)", "signed"],
      ["rs_rating_1m_ago", "RS Rating 1M Ago", "int"], ["rs_rating_1w", "RS Rating 1W", "int"], ["rs_rating_1m", "RS Rating 1M", "int"],
      ["rs_rating_3m", "RS Rating 3M", "int"], ["rs_line_52w_high", "RS Line at 52W High", "bool"], ["rs_new_high_before_price", "RS New High Before Price", "bool"],
      ["rsi14", "RSI (14)", "num1"], ["adr_pct", "ADR % (20)", "num2"], ["atr_pct", "ATR %", "num2"], ["stage", "Stage", "stage"], ["beta_1y", "Beta (1Y vs Nifty 50)", "num2"],
      ["mansfield_rs", "Mansfield RS", "num1"], ["trend_intensity", "Trend Intensity", "num1"], ["rel_ext", "Relative Extension", "num1"], ["mfi14", "MFI (14)", "num1"]]],
    ["Fundamentals", [["pe", "P/E", "num1"], ["pb", "P/B", "num2"], ["peg", "PEG", "num2"], ["eps_ttm", "EPS TTM (₹)", "num2"],
      ["roe", "ROE %", "num1"], ["roce", "ROCE %", "num1"], ["roe_3y", "ROE 3Y Avg %", "num1"], ["roe_5y", "ROE 5Y Avg %", "num1"],
      ["debt_equity", "Debt / Equity", "num2"], ["div_yield", "Dividend Yield %", "num2"], ["opm_ttm", "OPM TTM %", "num1"],
      ["npm_ttm", "Net Margin TTM %", "num1"], ["sales_ttm", "Sales TTM (₹ Cr)", "cr"], ["np_ttm", "Net Profit TTM (₹ Cr)", "cr"],
      ["book_value", "Book Value (₹)", "price"]]],
    ["Earnings Growth", [["eps_g_yoy", "EPS Growth YoY %", "pct"], ["eps_g_qoq", "EPS Growth QoQ %", "pct"], ["sales_g_yoy", "Sales Growth YoY %", "pct"],
      ["sales_g_qoq", "Sales Growth QoQ %", "pct"], ["np_g_yoy", "Profit Growth YoY %", "pct"], ["np_g_qoq", "Profit Growth QoQ %", "pct"],
      ["sales_g_ttm", "Sales Growth TTM %", "pct"], ["np_g_ttm", "Profit Growth TTM %", "pct"], ["sales_cagr_3y", "Sales CAGR 3Y %", "pct"],
      ["sales_cagr_5y", "Sales CAGR 5Y %", "pct"], ["np_cagr_3y", "Profit CAGR 3Y %", "pct"], ["np_cagr_5y", "Profit CAGR 5Y %", "pct"],
      ["eps_cagr_3y", "EPS CAGR 3Y %", "pct"], ["eps_up_qtrs", "EPS Up Quarters (YoY)", "int"], ["sales_up_qtrs", "Sales Up Quarters (YoY)", "int"]]],
    ["Groups & Results Day", [["sector_rank", "Sector Rank", "int"], ["sector_tag", "Sector Tag", "text"], ["industry_rank", "Industry Rank", "int"],
      ["industry_tag", "Industry Tag", "text"], ["sector_rank_1m", "Sector Rank 1M", "int"], ["industry_rank_1m", "Industry Rank 1M", "int"],
      ["sector_ret_1w", "Sector 1W %", "pct"], ["industry_ret_1w", "Industry 1W %", "pct"], ["vs_sector_1m", "vs Sector 1M %", "pct"],
      ["vs_industry_1m", "vs Industry 1M %", "pct"], ["theme", "Top Theme", "text"], ["theme_status", "Theme Status", "text"], ["themes", "Themes", "text"],
      ["earn_date", "Results Reaction Day", "date"], ["earn_sessions", "Sessions Since Results", "int"], ["earn_gap_pct", "Results Gap %", "pct"],
      ["earn_chg_pct", "Results Day Change %", "pct"], ["earn_vol_x", "Results Day Volume ×", "x"], ["earn_run_pct", "Run Since Results %", "pct"]]],
    ["Ownership & Results", [["prom_hold", "Promoters %", "num1"], ["prom_chg_1q", "Promoter Change 1Q", "num2"], ["prom_chg_1y", "Promoter Change 1Y", "num2"],
      ["fii_hold", "FII %", "num1"], ["fii_chg_1q", "FII Change 1Q", "num2"], ["fii_chg_1y", "FII Change 1Y", "num2"], ["dii_hold", "DII %", "num1"],
      ["dii_chg_1q", "DII Change 1Q", "num2"], ["dii_chg_1y", "DII Change 1Y", "num2"], ["public_hold", "Public %", "num1"],
      ["shareholders", "No. of Shareholders", "int"], ["shareholders_chg_1q", "Shareholders Change 1Q %", "pct"], ["fin_qtr", "Latest Quarter", "date"],
      ["last_result", "Last Results", "date"], ["next_result", "Next Results", "date"], ["days_to_result", "Days to Results", "int"]]],
  ];
  const COLUMNS = {};
  COLUMN_GROUPS.forEach(([g, cols]) => cols.forEach(([id, label, fmt]) => { COLUMNS[id] = { id, label, fmt, group: g }; }));
  const DEFAULT_COLUMNS = ["chg_1d", "volume", "turnover_cr", "ret_1w", "rvol", "mcap_cr", "rs_rating"];
  const SORTS = [["symbol", "A–Z", "asc"], ["close", "Price", "desc"], ["turnover_cr", "Price × Volume", "desc"], ["mcap_cr", "Market cap", "desc"],
    ["rs_rating", "RS rating", "desc"], ["from_hi52", "From 52W high", "desc"], ["chg_1d", "Performance (1D %)", "desc"]];

  /** screen.json (column-wise) -> row objects (+ days_listed, key) */
  function screenRows(snap, today) {
    const cols = snap.columns;
    const t = today ? Date.parse(today) : Date.parse(snap.data_date);
    return snap.rows.map((vals) => {
      const o = { kind: "stock", exchange: "NSE" };
      cols.forEach((c, i) => { o[c] = vals[i]; });
      o.days_listed = o.listed ? Math.floor((t - Date.parse(o.listed)) / 86400000) : null;
      o.key = "s:" + o.id;
      return o;
    });
  }

  /** a value shown in a table cell (text only; colours are added by the page) */
  function fmtCell(v, fmt) {
    if (v == null || v === "") return "–";
    switch (fmt) {
      case "pct": return fmtPct(v);
      case "price": return fmtPrice(v);
      case "vol": return fmtVol(v);
      case "cr": return inr0.format(v);
      case "num1": return Number(v).toFixed(1);
      case "num2": return Number(v).toFixed(2);
      case "int": return inr0.format(v);
      case "signed": return (v > 0 ? "+" : "") + inr0.format(v);
      case "x": return Number(v).toFixed(2) + "×";
      case "bool": return v ? "Yes" : "No";
      case "date": return fmtDate(v);
      case "stage": return `${String(v).replace("A", "")} ${STAGE_TXT[v] || ""}`.trim();
      default: return String(v);
    }
  }

  /** universe filter for the stock table: all / liquid / n500 / fno, plus sector and text search */
  function filterStocks(rows, { universe = "all", sector = "", text = "", hideStale = true } = {}) {
    const q = text.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideStale && r.stale) return false;
      if (universe === "liquid" && !r.liquid) return false;
      if (universe === "n500" && !r.n500) return false;
      if (universe === "fno" && !r.fno) return false;
      if (sector && r.sector !== sector) return false;
      if (q && !(String(r.symbol).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q)
        || String(r.basic_industry || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }

  const api = { PERIODS, SCREENS, RANGES, rowsFromSnapshot, keyOf, fmtPrice, fmtPct, fmtInt, fmtVol, fmtDate, filterRows, sortRows,
    toCSV, candlesFromChart, toWeekly, ema, sliceRange, colorClass, heatLevel, STAGE_TXT, COLUMN_GROUPS, COLUMNS, DEFAULT_COLUMNS, SORTS,
    screenRows, fmtCell, filterStocks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SD = api;
})(typeof self !== "undefined" ? self : this);
