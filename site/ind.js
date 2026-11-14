/* Chart indicators in the browser - the SAME formulas as the pipeline (swingdash/engine.py), so a value on the chart
   equals the value in the table. Pure functions on arrays (null = no value yet); tested against the Python engine in
   tests/js/ind.test.js. Candles: [{time, open, high, low, close, volume}]. */
(function (root) {
  "use strict";
  const N = (x) => (x == null || Number.isNaN(x) ? null : x);

  function sma(v, n) {
    const out = new Array(v.length).fill(null);
    let s = 0, cnt = 0;
    for (let i = 0; i < v.length; i++) {
      s += v[i]; cnt++;
      if (i >= n) { s -= v[i - n]; cnt--; }
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }
  /** rolling mean that starts after minP values (young stocks), like pandas rolling(n, min_periods) */
  function smaMin(v, n, minP) {
    const out = new Array(v.length).fill(null);
    let s = 0;
    for (let i = 0; i < v.length; i++) {
      s += v[i];
      if (i >= n) s -= v[i - n];
      const cnt = Math.min(i + 1, n);
      if (cnt >= minP) out[i] = s / cnt;
    }
    return out;
  }
  /** ewm(alpha, adjust=False) started from the first value, shown from the minP-th value */
  function ewm(v, alpha, minP) {
    const out = new Array(v.length).fill(null);
    let e = null, seen = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) { out[i] = e != null && seen >= minP ? e : null; continue; }
      e = e == null ? v[i] : alpha * v[i] + (1 - alpha) * e;
      seen++;
      if (seen >= minP) out[i] = e;
    }
    return out;
  }
  const ema = (v, n) => ewm(v, 2 / (n + 1), n);
  const wilder = (v, n) => ewm(v, 1 / n, n);
  function wma(v, n) {
    const out = new Array(v.length).fill(null), den = (n * (n + 1)) / 2;
    for (let i = n - 1; i < v.length; i++) { let s = 0; for (let k = 0; k < n; k++) s += v[i - n + 1 + k] * (k + 1); out[i] = s / den; }
    return out;
  }
  function vwma(c, vol, n) {
    const out = new Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++) { let a = 0, b = 0; for (let k = i - n + 1; k <= i; k++) { a += c[k] * vol[k]; b += vol[k]; } out[i] = b ? a / b : null; }
    return out;
  }
  function trueRange(h, l, c) {
    return h.map((x, i) => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
  }
  const atr = (h, l, c, n = 14) => wilder(trueRange(h, l, c), n);
  function rsi(c, n = 14) {
    const g = c.map((x, i) => (i === 0 ? null : Math.max(x - c[i - 1], 0)));
    const d = c.map((x, i) => (i === 0 ? null : Math.max(c[i - 1] - x, 0)));
    const ag = wilder(g, n), al = wilder(d, n);
    return ag.map((x, i) => (x == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])));
  }
  function macd(c, fast = 12, slow = 26, sig = 9) {
    const f = ema(c, fast), s = ema(c, slow);
    const line = f.map((x, i) => (x == null || s[i] == null ? null : x - s[i]));
    const signal = ewm(line, 2 / (sig + 1), sig);
    return { line, signal, hist: line.map((x, i) => (x == null || signal[i] == null ? null : x - signal[i])) };
  }
  function mfi(h, l, c, v, n = 14) {
    const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
    const out = new Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++) {
      let pos = 0, neg = 0;
      for (let k = i - n + 1; k <= i; k++) {
        if (k === 0) continue;                       // the first day has no "previous" typical price (counts as 0)
        const flow = tp[k] * v[k];
        if (tp[k] > tp[k - 1]) pos += flow; else if (tp[k] < tp[k - 1]) neg += flow;
      }
      out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }
    return out;
  }
  function bollinger(c, n = 20, k = 2) {
    const mid = sma(c, n), up = [], lo = [];
    for (let i = 0; i < c.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); continue; }
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n); up.push(mid[i] + k * sd); lo.push(mid[i] - k * sd);
    }
    return { mid, up, lo };
  }
  function supertrend(h, l, c, n = 10, mult = 3) {
    const a = atr(h, l, c, n), line = new Array(c.length).fill(null), dir = new Array(c.length).fill(null);
    let fu = null, fd = null, d = 1;
    for (let i = 0; i < c.length; i++) {
      if (a[i] == null) continue;
      const hl2 = (h[i] + l[i]) / 2, ub = hl2 - mult * a[i], db = hl2 + mult * a[i];
      if (fu == null) { fu = ub; fd = db; } else {
        fu = ub > fu || c[i - 1] < fu ? ub : fu;
        fd = db < fd || c[i - 1] > fd ? db : fd;
      }
      if (d === 1 && c[i] < fu) d = -1; else if (d === -1 && c[i] > fd) d = 1;
      dir[i] = d; line[i] = d === 1 ? fu : fd;
    }
    return { line, dir };
  }
  function t3(c, n, v = 0.65) {
    const e = (x) => ewm(x, 2 / (n + 1), 1);
    const e1 = e(c), e2 = e(e1), e3 = e(e2), e4 = e(e3), e5 = e(e4), e6 = e(e5);
    const c1 = -(v ** 3), c2 = 3 * v ** 2 + 3 * v ** 3, c3 = -6 * v ** 2 - 3 * v - 3 * v ** 3, c4 = 1 + 3 * v + v ** 3 + 3 * v ** 2;
    return c.map((_, i) => (i < 6 * n ? null : c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i]));
  }
  function relativeExtension(c, ma = 50, lookback = 250) {
    const m = sma(c, ma);
    const ext = c.map((x, i) => (m[i] == null ? null : (x / m[i] - 1) * 100));
    const out = new Array(c.length).fill(null);
    for (let i = 0; i < c.length; i++) {
      if (ext[i] == null) continue;
      let hi = 0, lo = 0, seen = 0;
      for (let k = Math.max(0, i - lookback + 1); k <= i; k++) {
        if (ext[k] == null) continue;
        seen++; hi = Math.max(hi, ext[k]); lo = Math.max(lo, -ext[k]);
      }
      if (seen < ma) continue;                       // pandas rolling(lookback, min_periods=ma)
      const den = ext[i] >= 0 ? hi : lo;
      out[i] = den ? Math.max(-100, Math.min(100, (100 * ext[i]) / den)) : null;
    }
    return out;
  }
  function trendIntensity(c, fast = 7, slow = 65) {
    const f = sma(c, fast), s = sma(c, slow);
    return f.map((x, i) => (x == null || s[i] == null ? null : (x / s[i]) * 100));
  }
  const adr = (h, l, n = 20) => sma(h.map((x, i) => x / l[i]), n).map((x) => (x == null ? null : 100 * (x - 1)));
  /** benchmark closes aligned to the stock's dates (last known close on or before each date) */
  function align(times, bench) {
    const out = new Array(times.length).fill(null);
    let j = -1;
    for (let i = 0; i < times.length; i++) {
      while (j + 1 < bench.length && bench[j + 1].time <= times[i]) j++;
      out[i] = j >= 0 ? bench[j].close : null;
    }
    return out;
  }
  function rsLine(candles, bench) {
    const b = align(candles.map((x) => x.time), bench);
    return candles.map((x, i) => (b[i] ? x.close / b[i] : null));
  }
  function mansfield(rs, len) {
    const m = sma(rs.map((x) => (x == null ? NaN : x)), len);
    return rs.map((x, i) => (x == null || m[i] == null || Number.isNaN(m[i]) ? null : (x / m[i] - 1) * 100));
  }
  /** Stage per bar (config/stage.yaml defaults = engine.stage): 1 Basing, 2A, 2, 3 Topping, 4 Downtrend, 4A Improving */
  function stage(c, cfg = {}) {
    const d = (k, v) => (cfg[k] == null ? v : cfg[k]), y = cfg.young || {}, yd = (k, v) => (y[k] == null ? v : y[k]);
    const mn = d("min_sessions", 64), L = d("long_ma", 200), early = d("early_days", 30);
    const lg = smaMin(c, L, L), fa = smaMin(c, d("fast_ma", 50), d("fast_ma", 50)), bm = smaMin(c, d("base_ma", 100), d("base_ma", 100));
    const sh = smaMin(c, d("short_ma", 10), d("short_ma", 10)), stays = d("top_stays", true);
    const yl = smaMin(c, yd("long_ma", 50), yd("long_ma", 50)), yf = smaMin(c, yd("fast_ma", 10), yd("fast_ma", 10));
    const ym = smaMin(c, yd("mid_ma", 30), yd("mid_ma", 30));
    const out = new Array(c.length).fill(null);
    let prev = null, run = 0, fromLow = false, prevOld = null;
    for (let i = 0; i < c.length; i++) {
      if (c[i] == null) { prevOld = null; continue; }
      if (i + 1 < mn) continue;
      let b;
      if (i + 1 >= L) {
        const aL = c[i] > lg[i], aF = c[i] >= fa[i];
        const ext = sh[i] > lg[i] * (1 + d("top_ext", 0.08)) && c[i] > lg[i] * (1 + d("top_above", 0.02));
        const basing = aF && c[i] > bm[i] * (1 + d("base_above", 0.005)) && c[i] > lg[i] * (1 - d("base_floor", 0.1));
        b = aL ? (aF || !ext ? "2" : "3") : basing ? "1" : aF ? "4A" : "4";
        if (stays && b === "2" && prevOld === "3" && aL && !aF) b = "3";      // a Topping stays while below the fast MA
        prevOld = b;
      } else {
        b = c[i] > yl[i] * (1 - yd("long_tol", 0.005)) ? (c[i] < yf[i] * (1 - yd("fast_tol", 0.015)) ? "3" : "2")
          : c[i] > ym[i] * (1 + yd("base_above", 0.02)) ? "1" : "4";
      }
      if (b === "2") {
        if (prev !== "2") { fromLow = ["1", "4", "4A"].includes(prev); run = 0; }
        run++;
        out[i] = fromLow && run <= early ? "2A" : "2";
      } else out[i] = b;
      prev = b;
    }
    return out;
  }
  /** volume colouring / labels for each bar (engine.py volume block; settings config/indicators.yaml) */
  function volumeFlags(candles, cfg = {}) {
    const v = candles.map((x) => x.volume || 0), c = candles.map((x) => x.close);
    const n = v.length, hx = cfg.high_volume_x || 1.5, pp = cfg.pocket_pivot_days || 10, dk = cfg.dry_up_days || 10;
    const dx = cfg.dry_up_x || 0.5, q = cfg.quarter || 63, y = cfg.year || 252;
    const avg20 = new Array(n).fill(null), avg50 = sma(v, 50);
    for (let i = 20; i < n; i++) { let s = 0; for (let k = i - 20; k < i; k++) s += v[k]; avg20[i] = s / 20; }
    const out = [];
    let maxEver = 0;
    for (let i = 0; i < n; i++) {
      const win = (len) => v.slice(Math.max(0, i - len + 1), i + 1);
      maxEver = Math.max(maxEver, v[i]);
      const up = i > 0 && c[i] > c[i - 1], down = i > 0 && c[i] < c[i - 1];
      let downMax = null;
      if (i >= pp) { downMax = 0; for (let k = i - pp; k < i; k++) if (k > 0 && c[k] < c[k - 1]) downMax = Math.max(downMax, v[k]); }
      const yw = win(y), qw = win(q), dw = win(dk);
      out.push({
        avg20: avg20[i], rvol: avg20[i] ? v[i] / avg20[i] : null, high: avg20[i] != null && v[i] >= hx * avg20[i], up, down,
        hve: v[i] > 0 && v[i] >= maxEver, hvy: yw.length >= Math.floor(y / 4) && v[i] >= Math.max(...yw),
        hvq: qw.length >= Math.floor(q / 2) && v[i] >= Math.max(...qw),
        lvy: yw.length >= Math.floor(y / 4) && v[i] <= Math.min(...yw), lvq: qw.length >= Math.floor(q / 2) && v[i] <= Math.min(...qw),
        pocket: up && downMax != null && v[i] > downMax, dry: dw.length >= dk && v[i] <= Math.min(...dw) && avg50[i] != null && v[i] < dx * avg50[i],
      });
    }
    return out;
  }
  /** swing points: a new swing starts after the price reverses by pct % from the last extreme (zigzag on closes) */
  function swings(candles, pct = 10) {
    const pts = [];
    if (!candles.length) return pts;
    let dir = 0, ext = 0;
    for (let i = 1; i < candles.length; i++) {
      const p = candles[i].close, e = candles[ext].close;
      if (dir >= 0 && p > e) { if (dir === 0 || dir === 1) ext = i; dir = dir || 1; }
      if (dir <= 0 && p < e) { if (dir === 0 || dir === -1) ext = i; dir = dir || -1; }
      const rev = (candles[i].close / candles[ext].close - 1) * 100;
      if (dir === 1 && rev <= -pct) { pts.push({ i: ext, kind: "high" }); dir = -1; ext = i; }
      else if (dir === -1 && rev >= pct) { pts.push({ i: ext, kind: "low" }); dir = 1; ext = i; }
    }
    pts.push({ i: ext, kind: dir === 1 ? "high" : "low" });
    return pts.map((p, k) => ({ ...p, time: candles[p.i].time, price: candles[p.i].close,
      move: k === 0 ? null : (candles[p.i].close / candles[pts[k - 1].i].close - 1) * 100 }));
  }

  /** Pivot per bar = swingdash/patterns.py _pivots(): the most recent swing high >= minAge bars old, still the highest
      high since, >= the `local` highs before it, above the close; null when there is none. {piv, idx} arrays. */
  function pivots(h, c, { minAge = 15, local = 20, maxAge = 260, start = 0 } = {}) {
    const n = h.length, piv = new Array(n).fill(null), idx = new Array(n).fill(-1);
    const lm = h.map((x, i) => { let m = -Infinity; for (let k = Math.max(0, i - local); k < i; k++) m = Math.max(m, h[k]); return !(x < m); });
    const stack = [];
    for (let t = Math.max(0, start - maxAge - 1); t < n; t++) {
      while (stack.length && h[stack[stack.length - 1]] <= h[t]) stack.pop();
      stack.push(t);
      if (t < start) continue;
      for (let s = stack.length - 1; s >= 0; s--) {
        const i = stack[s], age = t - i;
        if (age < minAge) continue;
        if (age > maxAge) break;
        if (lm[i] && h[i] > c[t]) { piv[t] = h[i]; idx[t] = i; break; }
      }
    }
    return { piv, idx };
  }
  /** swing points of a base (patterns.py _zigzag): [[index, "H"|"L"], ...], index 0 = the base top */
  function baseSwings(seg, pct) {
    const pts = [[0, "H"]];
    let d = -1, ext = 0;
    for (let i = 1; i < seg.length; i++) {
      if (d === -1) {
        if (seg[i] < seg[ext]) ext = i;
        else if ((seg[i] / seg[ext] - 1) * 100 >= pct) { pts.push([ext, "L"]); d = 1; ext = i; }
      } else if (seg[i] > seg[ext]) ext = i;
      else if ((1 - seg[i] / seg[ext]) * 100 >= pct) { pts.push([ext, "H"]); d = -1; ext = i; }
    }
    if (ext !== pts[pts.length - 1][0]) pts.push([ext, d === -1 ? "L" : "H"]);
    return pts;
  }
  /** pullbacks inside the base from bar `start` to the end: [{hi, lo, depth}] with bar indexes (patterns.contractions) */
  function contractions(c, h, start, pct = 5) {
    const seg = c.slice(start);
    if (seg.length < 3) return [];
    seg[0] = Math.max(seg[0], h[start]);
    const pts = baseSwings(seg, pct), out = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      if (pts[k][1] === "H" && pts[k + 1][1] === "L") out.push({ hi: start + pts[k][0], lo: start + pts[k + 1][0], depth: (1 - seg[pts[k + 1][0]] / seg[pts[k][0]]) * 100 });
    }
    return out;
  }

  const api = { N, sma, smaMin, ema, ewm, wilder, wma, vwma, trueRange, atr, rsi, macd, mfi, bollinger, supertrend, t3,
    relativeExtension, trendIntensity, adr, align, rsLine, mansfield, stage, volumeFlags, swings, pivots, baseSwings, contractions };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SDI = api;
})(typeof self !== "undefined" ? self : this);
