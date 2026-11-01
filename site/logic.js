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

  const api = { PERIODS, SCREENS, RANGES, rowsFromSnapshot, keyOf, fmtPrice, fmtPct, fmtInt, fmtVol, fmtDate, filterRows, sortRows,
    toCSV, candlesFromChart, toWeekly, ema, sliceRange, colorClass, heatLevel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SD = api;
})(typeof self !== "undefined" ? self : this);
