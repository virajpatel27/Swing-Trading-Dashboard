/* Stock chart (Phase S5): TradingView Lightweight Charts 5 + our indicators (ind.js = the pipeline's formulas).
   SDChart.open(box, row, opts) draws one stock into `box`. Settings, indicator choices and drawings are kept in this browser
   (localStorage). Panes: price, then volume and the oscillators; the RS line can sit above the price. */
(function () {
  "use strict";
  const LIB = "https://unpkg.com/lightweight-charts@5.0.8/dist/lightweight-charts.standalone.production.js";
  const I = window.SDI, S = window.SD;
  const KEY = "sd-chart-v1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const COLORS = ["#2962ff", "#f23645", "#089981", "#ff9800", "#9c27b0", "#00bcd4", "#e91e63", "#795548", "#607d8b", "#4caf50",
    "#ffeb3b", "#3f51b5", "#8bc34a", "#ff5722", "#673ab7", "#009688", "#cddc39", "#ffc107", "#03a9f4", "#9e9e9e", "#000000"];
  const STYLES = {
    default: { label: "Default", up: "#2962ff", down: "#e91e63" }, classic: { label: "Classic", up: "#089981", down: "#f23645" },
    contrast: { label: "Contrast", up: "#2962ff", down: "#ff9800" }, mono: { label: "Mono", up: "#9e9e9e", down: "#000000" },
  };
  const MA_PRESETS = {
    minervini: { label: "Minervini", d: [["EMA", 10], ["EMA", 21], ["SMA", 50], ["SMA", 150], ["SMA", 200]], w: [["SMA", 10], ["SMA", 30]] },
    weinstein: { label: "Weinstein", d: [["SMA", 50], ["SMA", 150]], w: [["SMA", 10], ["SMA", 30]] },
    qullamaggie: { label: "Qullamaggie", d: [["EMA", 10], ["EMA", 20], ["SMA", 50]], w: [["SMA", 10], ["SMA", 20]] },
    oneil: { label: "O'Neil", d: [["EMA", 21], ["SMA", 50], ["SMA", 200]], w: [["SMA", 10], ["SMA", 40]] },
    mine: { label: "My preset", d: [["SMA", 20], ["SMA", 200]], w: [["SMA", 10], ["SMA", 20]] },
  };
  const MA_COLORS = ["#2962ff", "#ff9800", "#e91e63", "#089981", "#9c27b0", "#795548"];
  const BENCH = { NIFTY_50: "Nifty 50", NIFTY_500: "Nifty 500", NIFTY_MIDCAP_150: "Nifty Midcap 150", NIFTY_SMALLCAP_250: "Nifty Smallcap 250" };
  const STAGE_TXT = { 1: "Basing", "2A": "Early uptrend", 2: "Uptrend", 3: "Topping", 4: "Downtrend", "4A": "Improving" };
  const STAGE_COL = { 1: "#9e9e9e", "2A": "#66bb6a", 2: "#089981", 3: "#ff9800", 4: "#f23645", "4A": "#ef9a9a" };

  /* ------------------------------------------------------------------ settings (with defaults) */
  const DEFAULTS = {
    style: "classic", type: "candle", tf: "D",
    marks: { hilo52: false, swings: false, swingPct: 10, circuit: false, inside: false, actions: true, pivot: true, vcp: true, tight: false, earnings: true },
    chips: { float: true, rs: true, stage: true, from: true, theme: true },
    ind: {
      ma: { on: true, preset: "mine", d: null, w: null },
      supertrend: { on: false, len: 10, mult: 3, up: "#089981", down: "#f23645" },
      bb: { on: false, len: 20, std: 2, color: "#2962ff", fill: true },
      swing: { on: false, fast: 8, slow: 14, vf: 0.65 },
      watermark: { on: false, symbol: true, name: true, sector: true, pos: "middle", size: "M" },
      volume: { on: true, pane: "below", avg: false, x: 1.5, colorHigh: true, pp: true, dry: true, labels: true },
      rsline: { on: false, bench: "NIFTY_SMALLCAP_250", pane: "above", color: "#2962ff", dot: true },
      mansfield: { on: false, len: 52 },
      stage: { on: false },
      rsi: { on: false, len: 14, ob: 70, os: 30 },
      macd: { on: false, fast: 12, slow: 26, sig: 9 },
      mfi: { on: false, len: 14, ob: 80, os: 20 },
      relext: { on: false, ma: 50, lookback: 250 },
      atr: { on: false, len: 14 },
      adr: { on: false, len: 20 },
      ti: { on: false, fast: 7, slow: 65 },
    },
  };
  const merge = (a, b) => { const o = Array.isArray(a) ? [...a] : { ...a }; for (const k in b || {}) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] ? merge(a[k], b[k]) : b[k]; return o; };
  let cfg = merge(DEFAULTS, store.get(KEY, {}));
  const save = () => store.set(KEY, cfg);

  const IND_MENU = [
    ["On the price", [["ma", "Moving averages", "Average-close lines; presets Minervini, Weinstein, Qullamaggie, O'Neil or your own"],
      ["supertrend", "Supertrend", "ATR trailing stop: green under price in an uptrend, red above in a downtrend"],
      ["bb", "Bollinger Bands", "20-day average with 2 standard-deviation bands"],
      ["swing", "Swing Bands", "Two Tillson T3 averages: green while the fast one is above"],
      ["watermark", "Watermark", "Faint symbol, name and sector text on the chart"]]],
    ["Volume and strength", [["volume", "Volume", "Daily volume; high-volume days, pocket pivots (blue), dry-ups (orange), HVE / HVY / HVQ"],
      ["rsline", "RS line", "Close / benchmark close; a dot when it makes a new 52-week high"],
      ["mansfield", "Mansfield RS", "RS line vs its own long average, coloured by the average's direction"],
      ["stage", "Stage analysis", "Each bar coloured by its stage: Basing, Uptrend, Topping, Downtrend"]]],
    ["Trend", [["ti", "Trend Intensity", "7-day vs 65-day average x 100 (>105 strong up, <95 strong down)"],
      ["relext", "Relative Extension", "Stretch from the 50-day average, scaled to the last 250 days (-100 .. +100)"]]],
    ["Oscillators", [["rsi", "RSI", "Wilder RSI with 70 / 30 lines"], ["macd", "MACD", "12 / 26 / 9; histogram solid while growing, faint while shrinking"],
      ["mfi", "Money Flow Index", "Volume-weighted RSI with 80 / 20 lines"], ["atr", "ATR", "Average true range in rupees"],
      ["adr", "ADR %", "Average daily range as % of price"]]],
  ];
  const IND_FIELDS = {  // settings form per indicator: [key, label, type, options]
    supertrend: [["len", "ATR length", "num"], ["mult", "Multiple", "num"], ["up", "Up colour", "color"], ["down", "Down colour", "color"]],
    bb: [["len", "Length", "num"], ["std", "Standard deviations", "num"], ["color", "Colour", "color"], ["fill", "Shade between bands", "bool"]],
    swing: [["fast", "Fast length", "num"], ["slow", "Slow length", "num"], ["vf", "Volume factor (0.5-0.9)", "num"]],
    watermark: [["symbol", "Symbol + timeframe", "bool"], ["name", "Company name", "bool"], ["sector", "Sector + industry", "bool"],
      ["pos", "Position", "sel", ["top", "middle", "bottom"]], ["size", "Size", "sel", ["S", "M", "L"]]],
    volume: [["pane", "Show", "sel", ["below", "price"]], ["avg", "Average volume line (20)", "bool"], ["colorHigh", "Colour high-volume days", "bool"],
      ["x", "High volume = average x", "sel", ["1", "1.5", "2", "2.5"]], ["pp", "Pocket pivots (blue)", "bool"], ["dry", "Dry-ups (orange)", "bool"],
      ["labels", "Labels HVE / HVY / HVQ / Y / Q", "bool"]],
    rsline: [["bench", "Compare with", "sel", Object.keys(BENCH)], ["pane", "Pane", "sel", ["above", "below"]], ["color", "Colour", "color"],
      ["dot", "Dot at a new RS high before the price", "bool"]],
    mansfield: [["len", "Average length (bars)", "num"]],
    rsi: [["len", "Length", "num"], ["ob", "Upper line", "num"], ["os", "Lower line", "num"]],
    macd: [["fast", "Fast", "num"], ["slow", "Slow", "num"], ["sig", "Signal", "num"]],
    mfi: [["len", "Length", "num"], ["ob", "Upper line", "num"], ["os", "Lower line", "num"]],
    relext: [["ma", "Average length", "num"], ["lookback", "Lookback", "num"]],
    atr: [["len", "Length", "num"]], adr: [["len", "Length", "num"]], ti: [["fast", "Fast", "num"], ["slow", "Slow", "num"]],
  };

  /* ------------------------------------------------------------------ data */
  let libP = null;
  const loadLib = () => window.LightweightCharts ? Promise.resolve() : libP || (libP = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = LIB; s.async = true; s.onload = ok;
    s.onerror = () => { libP = null; no(new Error("chart library did not load")); };
    document.head.appendChild(s);
  }));
  const cache = new Map();
  async function getChartFile(kind, id) {
    const k = `${kind}/${id}`;
    if (!cache.has(k)) cache.set(k, fetch(`data/c/${k}.json`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`chart ${id}: HTTP ${r.status}`); return r.json(); }));
    return cache.get(k);
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? "–" : Number(x).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));

  /* ------------------------------------------------------------------ the chart */
  let cur = null;   // {box, row, data, bench, chart, ...}

  async function open(box, row, opts = {}) {
    close();
    box.innerHTML = `<div class="ch-head" id="chHead"></div><div class="ch-tools" id="chTools"></div>
      <div class="ch-wrap"><div class="ch-draw" id="chDraw"></div><div class="ch-canvas" id="chCanvas"><p class="empty">Loading chart…</p></div>
      <svg class="ch-svg" id="chSvg"></svg></div><div class="ch-note muted" id="chNote"></div>`;
    cur = { box, row, opts, kind: opts.kind || "s" };
    renderTools();
    let data;
    try {
      [data] = await Promise.all([getChartFile(cur.kind, row.id), loadLib()]);
    } catch (e) {
      box.querySelector("#chCanvas").innerHTML = `<p class="empty">Chart not available (${esc(e.message)}).</p>`;
      return;
    }
    if (!cur || cur.row !== row) return;
    cur.data = data;
    cur.daily = S.candlesFromChart(data, "adjusted");
    draw();
  }

  function close() {
    if (cur && cur.chart) { cur.chart.remove(); }
    if (cur && cur.ro) cur.ro.disconnect();
    cur = null;
  }

  async function benchCandles(id) {
    try { const d = await getChartFile("n", id); return S.candlesFromChart(d, "adjusted"); } catch (e) { return null; }
  }

  async function draw(keepRange) {
    if (!cur || !cur.daily) return;
    const L = window.LightweightCharts;
    const canvas = cur.box.querySelector("#chCanvas");
    let range = null;
    if (cur.chart) { if (keepRange) range = cur.chart.timeScale().getVisibleLogicalRange(); cur.chart.remove(); cur.chart = null; }
    canvas.innerHTML = "";
    const weekly = cfg.tf === "W";
    const bars = weekly ? S.toWeekly(cur.daily) : cur.daily;
    cur.bars = bars;
    const times = bars.map((b) => b.time), o = bars.map((b) => b.open), h = bars.map((b) => b.high), l = bars.map((b) => b.low),
      c = bars.map((b) => b.close), v = bars.map((b) => b.volume || 0);
    const st = STYLES[cfg.style] || STYLES.classic;
    const ind = cfg.ind;
    const panes = [];       // names in order below the price
    const rsAbove = ind.rsline.on && ind.rsline.pane === "above";
    const chart = L.createChart(canvas, {
      autoSize: true, layout: { background: { color: css("--panel") }, textColor: css("--muted"), fontSize: 11, panes: { separatorColor: css("--line") } },
      grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } },
      rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line"), rightOffset: 5 }, crosshair: { mode: 0 },
      localization: { priceFormatter: (p) => fmt(p, Math.abs(p) < 100 ? 2 : 2) },
    });
    cur.chart = chart;
    let paneNo = 0;
    const nextPane = (name) => { panes.push(name); return ++paneNo; };
    const line = (data, color, pane, extra = {}) => {
      const s = chart.addSeries(L.LineSeries, { color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }, pane);
      s.setData(data); return s;
    };
    const pts = (arr, from = 0) => arr.map((x, i) => (i >= from && x != null && !Number.isNaN(x) ? { time: times[i], value: x } : { time: times[i] }));
    // RS line above the price: pane 0 is the RS line, the price moves to pane 1
    let pricePane = 0, bench = null;
    if (ind.rsline.on || ind.mansfield.on) bench = await benchCandles(ind.rsline.bench);
    if (!cur || cur.chart !== chart) return;
    const benchBars = bench ? (weekly ? S.toWeekly(bench) : bench) : null;
    const rs = benchBars ? I.rsLine(bars, benchBars) : null;
    if (rsAbove && rs) { pricePane = 1; paneNo = 1; }
    // price
    const priceOpts = { upColor: st.up, downColor: st.down, wickUpColor: st.up, wickDownColor: st.down, borderVisible: false, thinBars: false };
    const price = cfg.type === "bar" ? chart.addSeries(L.BarSeries, { upColor: st.up, downColor: st.down }, pricePane)
      : chart.addSeries(L.CandlestickSeries, priceOpts, pricePane);
    price.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    cur.price = price;
    const legend = [];
    // moving averages
    if (ind.ma.on) {
      const lines = (weekly ? ind.ma.w : ind.ma.d) || MA_PRESETS[ind.ma.preset || "mine"][weekly ? "w" : "d"];
      lines.forEach((m, k) => {
        const [type, n, color] = Array.isArray(m) ? [m[0], m[1], m[2]] : [m.type, m.len, m.color];
        const col = color || MA_COLORS[k % MA_COLORS.length];
        const vals = type === "EMA" ? I.ema(c, n) : I.sma(c, n);
        line(pts(vals), col, pricePane);
        legend.push(`<span><i style="background:${col}"></i>${type} ${n}${weekly ? "W" : ""}</span>`);
      });
    }
    if (ind.bb.on) {
      const b = I.bollinger(c, ind.bb.len, ind.bb.std);
      line(pts(b.mid), ind.bb.color, pricePane, { lineStyle: 2 });
      line(pts(b.up), ind.bb.color, pricePane); line(pts(b.lo), ind.bb.color, pricePane);
      legend.push(`<span><i style="background:${ind.bb.color}"></i>BB ${ind.bb.len}, ${ind.bb.std}</span>`);
    }
    if (ind.supertrend.on) {
      const s = I.supertrend(h, l, c, ind.supertrend.len, ind.supertrend.mult);
      const ser = chart.addSeries(L.LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      ser.setData(s.line.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: s.dir[i] === 1 ? ind.supertrend.up : ind.supertrend.down })));
      legend.push(`<span><i style="background:${ind.supertrend.up}"></i>Supertrend ${ind.supertrend.len}, ${ind.supertrend.mult}</span>`);
    }
    if (ind.swing.on) {
      const f = I.t3(c, ind.swing.fast, ind.swing.vf), s = I.t3(c, ind.swing.slow, ind.swing.vf);
      const col = (i) => (f[i] > s[i] ? "#089981" : "#f23645");
      const sf = chart.addSeries(L.LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      sf.setData(f.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: col(i) })));
      const ss = chart.addSeries(L.LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      ss.setData(s.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: col(i) })));
      legend.push(`<span><i style="background:#089981"></i>Swing bands ${ind.swing.fast}/${ind.swing.slow}</span>`);
    }
    // markers on the price
    const marks = [];
    if (cfg.marks.actions && cur.data.m) {
      for (const m of cur.data.m) {
        const t = `${String(m.d).slice(0, 4)}-${String(m.d).slice(4, 6)}-${String(m.d).slice(6, 8)}`;
        const b = [...bars].reverse().find((x) => x.time <= t);
        if (b) marks.push({ time: b.time, position: "aboveBar", color: css("--warn"), shape: "arrowDown", text: `${m.t} ${m.r}`.trim() });
      }
    }
    if (cfg.marks.earnings && cur.data.e) {             // results days (Phase S8): "E" on the first bar on / after the day
      for (const d of cur.data.e) {
        const t = `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`;
        const b = bars.find((x) => x.time >= t);
        if (b) marks.push({ time: b.time, position: "belowBar", color: "#7e57c2", shape: "circle", text: "E" });
      }
    }
    if (cfg.marks.swings) {
      for (const p of I.swings(bars, cfg.marks.swingPct || 10)) {
        if (p.move == null) continue;
        marks.push({ time: p.time, position: p.kind === "high" ? "aboveBar" : "belowBar", color: p.kind === "high" ? st.up : st.down,
          shape: p.kind === "high" ? "arrowUp" : "arrowDown", text: `${p.move > 0 ? "+" : ""}${p.move.toFixed(1)}%` });
      }
    }
    if (cfg.marks.inside) {
      bars.forEach((b, i) => { if (i && b.high <= bars[i - 1].high && b.low >= bars[i - 1].low) marks.push({ time: b.time, position: "aboveBar", color: "#9e9e9e", shape: "circle", size: 0.4 }); });
    }
    if (rs && ind.rsline.on && ind.rsline.dot) {
      const len = weekly ? 52 : 252;
      for (let i = len; i < rs.length; i++) {
        let mx = -Infinity, ph = -Infinity;
        for (let k = i - len + 1; k <= i; k++) { if (rs[k] != null) mx = Math.max(mx, rs[k]); ph = Math.max(ph, h[k]); }
        if (rs[i] != null && rs[i] >= mx && h[i] < ph) marks.push({ time: times[i], position: "belowBar", color: ind.rsline.color, shape: "circle", size: 0.5 });
      }
    }
    // pivot / base (same rule as the pipeline, swingdash/patterns.py): line from the base top to today + the base low
    if ((cfg.marks.pivot || cfg.marks.vcp) && bars.length > 30) {
      const pv = I.pivots(h, c, weekly ? { minAge: 3, local: 4, maxAge: 78, start: bars.length - 1 } : { start: bars.length - 1 });
      const t = bars.length - 1, i = pv.idx[t];
      if (i >= 0) {
        const span = (v) => bars.map((b, k) => (k >= i ? { time: b.time, value: v } : { time: b.time }));
        if (cfg.marks.pivot) {
          line(span(pv.piv[t]), "#2962ff", pricePane, { lineWidth: 2, lastValueVisible: true, title: "Pivot" });
          let lo = Infinity; for (let k = i; k <= t; k++) lo = Math.min(lo, l[k]);
          line(span(lo), css("--muted"), pricePane, { lineWidth: 1, lineStyle: 2, lastValueVisible: true, title: "Base low" });
          legend.push(`<span><i style="background:#2962ff"></i>Pivot ${fmt(pv.piv[t])} (${S.fmtPct((c[t] / pv.piv[t] - 1) * 100)})</span>`);
        }
        if (cfg.marks.vcp) {
          for (const k of I.contractions(c, h, i, 5)) {
            marks.push({ time: times[k.lo], position: "belowBar", color: "#ff6d00", shape: "arrowUp", text: `-${k.depth.toFixed(1)}%` });
          }
        }
      }
    }
    if (cfg.marks.tight && bars.length > 5) {           // runs of 5+ closes within 2 % of each other: green band
      const top = [], bot = [];
      const inTight = new Array(bars.length).fill(false);
      for (let k = 4; k < bars.length; k++) {
        const w = c.slice(k - 4, k + 1);
        if (Math.max(...w) / Math.min(...w) - 1 <= 0.02) for (let j = k - 4; j <= k; j++) inTight[j] = true;
      }
      let k = 0;
      while (k < bars.length) {
        if (!inTight[k]) { top.push({ time: times[k] }); bot.push({ time: times[k] }); k++; continue; }
        let j = k; while (j + 1 < bars.length && inTight[j + 1]) j++;
        let hi = -Infinity, lo = Infinity; for (let q = k; q <= j; q++) { hi = Math.max(hi, h[q]); lo = Math.min(lo, l[q]); }
        for (let q = k; q <= j; q++) { top.push({ time: times[q], value: hi }); bot.push({ time: times[q], value: lo }); }
        k = j + 1;
      }
      line(top, "#089981", pricePane, { lineWidth: 2 }); line(bot, "#089981", pricePane, { lineWidth: 2 });
    }
    marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    if (marks.length) L.createSeriesMarkers(price, marks);
    if (cfg.marks.hilo52 && bars.length) {
      const n = weekly ? 52 : 252, last = bars.slice(-n);
      price.createPriceLine({ price: Math.max(...last.map((b) => b.high)), color: st.up, lineWidth: 1, lineStyle: 2, title: "52W H" });
      price.createPriceLine({ price: Math.min(...last.map((b) => b.low)), color: st.down, lineWidth: 1, lineStyle: 2, title: "52W L" });
    }
    if (cfg.marks.circuit && cur.row.price_band && /^\d+$/.test(String(cur.row.price_band)) && cur.row.raw_close) {
      const band = Number(cur.row.price_band) / 100, last = c[c.length - 1];
      price.createPriceLine({ price: last * (1 + band), color: "#ff9800", lineWidth: 1, lineStyle: 1, title: `+${cur.row.price_band}%` });
      price.createPriceLine({ price: last * (1 - band), color: "#ff9800", lineWidth: 1, lineStyle: 1, title: `-${cur.row.price_band}%` });
    }
    if (ind.watermark.on) {
      const ln = [];
      const size = { S: 18, M: 30, L: 44 }[ind.watermark.size] || 30, col = css("--muted") + "33";
      if (ind.watermark.symbol) ln.push({ text: `${cur.row.symbol}, ${cfg.tf}`, color: col, fontSize: size });
      if (ind.watermark.name) ln.push({ text: cur.row.name || "", color: col, fontSize: Math.round(size * 0.5) });
      if (ind.watermark.sector && cur.row.sector) ln.push({ text: `${cur.row.sector} · ${cur.row.basic_industry || cur.row.industry || ""}`, color: col, fontSize: Math.round(size * 0.4) });
      L.createTextWatermark(chart.panes()[pricePane], { horzAlign: "center", vertAlign: { top: "top", middle: "center", bottom: "bottom" }[ind.watermark.pos] || "center", lines: ln });
    }
    // RS line pane (above or below)
    if (ind.rsline.on && rs) {
      const pane = rsAbove ? 0 : nextPane("RS");
      line(pts(rs), ind.rsline.color, pane, { lastValueVisible: true, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } });
      if (rsAbove) panes.unshift("RS");
    }
    // volume
    let vflags = null;
    if (ind.volume.on) {
      vflags = I.volumeFlags(bars, { high_volume_x: Number(ind.volume.x) || 1.5 });
      const onPrice = ind.volume.pane === "price";
      const pane = onPrice ? pricePane : nextPane("Volume");
      const vs = chart.addSeries(L.HistogramSeries, { priceFormat: { type: "custom", formatter: (x) => S.fmtVol(x), minMove: 1 },
        priceScaleId: onPrice ? "vol" : "right", lastValueVisible: false, priceLineVisible: false }, pane);
      if (onPrice) vs.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      const grey = css("--muted") + "88";
      vs.setData(bars.map((b, i) => {
        const f = vflags[i];
        let col = grey;
        if (ind.volume.colorHigh && f.high) col = f.up ? st.up : f.down ? st.down : grey;
        if (ind.volume.pp && f.pocket) col = "#2962ff";
        if (ind.volume.dry && f.dry) col = "#ff9800";
        return { time: b.time, value: b.volume || 0, color: col };
      }));
      if (ind.volume.avg) line(pts(vflags.map((f) => f.avg20)), "#ff9800", pane, { lineWidth: 1, priceScaleId: onPrice ? "vol" : "right" });
      if (ind.volume.labels) {
        const vm = [];
        vflags.forEach((f, i) => {
          const t = f.hve ? "HVE" : f.hvy ? "HVY" : f.hvq ? "HVQ" : f.lvy ? "Y" : f.lvq ? "Q" : "";
          if (t && (t.length === 3 || i >= bars.length - 260)) vm.push({ time: times[i], position: "aboveBar", color: t.length === 3 ? css("--text") : css("--muted"), shape: "square", size: 0, text: t });
        });
        if (vm.length) L.createSeriesMarkers(vs, vm);
      }
    }
    // stage pane
    if (ind.stage.on) {
      const stg = I.stage(c);
      const pane = nextPane("Stage");
      const s = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 0, minMove: 1 } }, pane);
      s.setData(stg.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: 1, color: STAGE_COL[x] })));
    }
    if (ind.mansfield.on && rs) {
      const m = I.mansfield(rs, ind.mansfield.len);
      const avg = I.sma(rs.map((x) => (x == null ? NaN : x)), ind.mansfield.len);
      const pane = nextPane("Mansfield");
      const s = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: true }, pane);
      s.setData(m.map((x, i) => {
        if (x == null) return { time: times[i] };
        const rising = i > 0 && avg[i] != null && avg[i - 1] != null && avg[i] > avg[i - 1];
        const col = x >= 0 ? (rising ? "#089981" : "#9e9e9e") : (rising ? "#2962ff" : "#f23645");
        return { time: times[i], value: x, color: col };
      }));
    }
    const osc = (name, vals, color, levels = []) => {
      const pane = nextPane(name);
      const s = line(pts(vals), color, pane, { lastValueVisible: true });
      levels.forEach((lv) => s.createPriceLine({ price: lv, color: css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
      return pane;
    };
    if (ind.rsi.on) osc(`RSI ${ind.rsi.len}`, I.rsi(c, ind.rsi.len), "#9c27b0", [ind.rsi.ob, ind.rsi.os]);
    if (ind.macd.on) {
      const m = I.macd(c, ind.macd.fast, ind.macd.slow, ind.macd.sig);
      const pane = nextPane("MACD");
      const hs = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      hs.setData(m.hist.map((x, i) => {
        if (x == null) return { time: times[i] };
        const grow = i > 0 && m.hist[i - 1] != null && Math.abs(x) >= Math.abs(m.hist[i - 1]);
        const base = x >= 0 ? "#2962ff" : "#e91e63";
        return { time: times[i], value: x, color: grow ? base : base + "66" };
      }));
      line(pts(m.line), "#2962ff", pane); line(pts(m.signal), "#ff9800", pane);
    }
    if (ind.mfi.on) osc(`MFI ${ind.mfi.len}`, I.mfi(h, l, c, v, ind.mfi.len), "#00bcd4", [ind.mfi.ob, ind.mfi.os]);
    if (ind.relext.on) osc("Rel. extension", I.relativeExtension(c, ind.relext.ma, ind.relext.lookback), "#ff5722", [70, 0, -70]);
    if (ind.atr.on) osc(`ATR ${ind.atr.len}`, I.atr(h, l, c, ind.atr.len), "#607d8b");
    if (ind.adr.on) osc(`ADR % ${ind.adr.len}`, I.adr(h, l, ind.adr.len), "#795548");
    if (ind.ti.on) osc("Trend intensity", I.trendIntensity(c, ind.ti.fast, ind.ti.slow), "#3f51b5", [105, 100, 95]);
    // pane sizes by stretch factor: the price pane gets the most room, each other pane an equal small share;
    // the chart grows by 80 px per extra pane (so the price stays readable on a phone)
    const ps = chart.panes();
    ps.forEach((p, i) => p.setStretchFactor(i === pricePane ? Math.max(3, 6 - ps.length) : 1));
    canvas.style.minHeight = ps.length > 2 ? `${320 + 80 * (ps.length - 1)}px` : "";
    cur.box.querySelector("#chLegend").innerHTML = legend.join("") + (panes.length ? `<span class="muted">· panes: ${panes.join(", ")}</span>` : "");
    // visible range: last year (daily) / 3 years (weekly)
    if (range) chart.timeScale().setVisibleLogicalRange(range);
    else { const n = weekly ? 156 : 250; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length + 3 }); }
    // header with crosshair values
    header(bars.length - 1, vflags);
    chart.subscribeCrosshairMove((p) => {
      if (!p || !p.time) return header(bars.length - 1, vflags);
      const i = times.indexOf(p.time);
      if (i >= 0) header(i, vflags);
    });
    drawings.attach(chart, price, pricePane);
    cur.box.querySelector("#chNote").textContent = (weekly ? "Weekly bars (Monday-start weeks). " : "Daily bars. ")
      + "Prices adjusted for splits, bonus, rights, demergers. Indicators use the same formulas as the table (docs/formulas.md).";
  }

  function header(i, vflags) {
    if (!cur || !cur.bars) return;
    const b = cur.bars[i], p = cur.bars[i - 1], r = cur.row;
    const chg = p ? (b.close / p.close - 1) * 100 : null;
    const back = (n) => { const x = cur.bars[i - n]; return x ? (b.close / x.close - 1) * 100 : null; };
    const w = cfg.tf === "W";
    const chips = [];
    if (cfg.chips.float && r.float_mcap_cr != null) chips.push(`<span class="chip-s" title="Free-float market cap">F ₹${fmt(r.float_mcap_cr, 0)} Cr</span>`);
    if (cfg.chips.rs && r.rs_rating != null) chips.push(`<span class="chip-s" title="RS rating 1-99">RS ${r.rs_rating}</span>`);
    if (cfg.chips.stage && r.stage) chips.push(`<span class="chip-s" style="border-color:${STAGE_COL[r.stage]};color:${STAGE_COL[r.stage]}">${esc(String(r.stage).replace("A", ""))} ${STAGE_TXT[r.stage]}</span>`);
    if (cfg.chips.theme !== false && r.theme_status) {
      const tc = { Leading: "#089981", Improving: "#2962ff", Weakening: "#ff9800", Lagging: "#f23645" }[r.theme_status] || css("--muted");
      chips.push(`<span class="chip-s" style="border-color:${tc};color:${tc}" title="Theme ${esc(r.theme || "")}: ${esc(r.theme_status)}">T ${esc(r.theme_status)}</span>`);
    }
    if (cfg.chips.from && r.from_hi52 != null) chips.push(`<span class="chip-s" title="From 52-week high">D ${S.fmtPct(r.from_hi52)}</span>`);
    const f = vflags ? vflags[i] : null;
    cur.box.querySelector("#chHead").innerHTML = `<div class="ch-l1"><b class="ch-sym">${esc(r.symbol)}</b>${chips.join("")}</div>
      <div class="ch-l2"><span>${S.fmtDate(b.time)} · ${w ? "1W" : "1D"}</span><span>O <b>${fmt(b.open)}</b></span><span>H <b>${fmt(b.high)}</b></span>
      <span>L <b>${fmt(b.low)}</b></span><span>C <b>${fmt(b.close)}</b></span><span class="${S.colorClass(chg)}">${S.fmtPct(chg)}</span>
      <span>1M <b class="${S.colorClass(back(w ? 4 : 21))}">${S.fmtPct(back(w ? 4 : 21))}</b></span><span>3M <b class="${S.colorClass(back(w ? 13 : 63))}">${S.fmtPct(back(w ? 13 : 63))}</b></span>
      ${f && b.volume != null ? `<span>Vol <b>${S.fmtVol(b.volume)}</b></span><span>Avg 20${w ? "W" : "D"} <b>${S.fmtVol(f.avg20)}</b></span><span>RVol <b>${f.rvol == null ? "–" : Math.round(f.rvol * 100) + "%"}</b></span>` : ""}</div>
      <div class="ch-desc muted">${esc(r.name || "")}${r.sector ? ` · ${esc(r.sector)} › ${esc(r.basic_industry || r.industry || "")}` : ""}</div>`;
  }

  /* ------------------------------------------------------------------ toolbar, menus */
  function renderTools() {
    const box = cur.box.querySelector("#chTools");
    const seg = (name, opts, val) => `<div class="seg sm" data-seg="${name}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${v === val ? "on" : ""}">${t}</button>`).join("")}</div>`;
    box.innerHTML = `${seg("tf", [["D", "D"], ["W", "W"]], cfg.tf)}${seg("type", [["candle", "Candles"], ["bar", "Bars"]], cfg.type)}
      <button class="btn sm ${cfg.ind.ma.on ? "on" : ""}" data-act="ma" type="button">MA</button>
      <button class="btn sm" data-act="ind" type="button"><i>fx</i> Indicators</button>
      <button class="btn sm" data-act="set" type="button" title="Chart settings">⚙</button>
      <div class="draw-tools" role="toolbar" aria-label="Drawing">
        <button type="button" data-draw="cursor" title="Cursor" class="on">↖</button><button type="button" data-draw="line" title="Trend line">╱</button>
        <button type="button" data-draw="text" title="Text">T</button><button type="button" data-draw="measure" title="Measure">⇕</button>
        <input type="color" data-draw-color value="${drawings.color}" title="Colour"><button type="button" data-draw="delete" title="Delete a drawing (click it); hold to clear all">🗑</button>
      </div><div class="legend" id="chLegend"></div>`;
    box.onclick = (e) => {
      const sb = e.target.closest("[data-seg] button");
      if (sb) {
        const g = sb.closest("[data-seg]").dataset.seg;
        cfg[g] = sb.dataset.v; save();
        sb.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === sb));
        return draw(g !== "tf");
      }
      const act = e.target.closest("[data-act]");
      if (act) {
        if (act.dataset.act === "ma") { cfg.ind.ma.on = !cfg.ind.ma.on; save(); act.classList.toggle("on", cfg.ind.ma.on); return draw(true); }
        if (act.dataset.act === "ind") return indicatorMenu();
        if (act.dataset.act === "set") return settingsMenu();
      }
      const dt = e.target.closest("[data-draw]");
      if (dt) {
        if (dt.dataset.draw === "delete" && e.detail >= 2) { drawings.clear(); return; }
        drawings.tool = dt.dataset.draw;
        box.querySelectorAll("[data-draw]").forEach((x) => x.classList.toggle("on", x === dt));
        cur.box.querySelector(".ch-wrap").classList.toggle("drawing", drawings.tool !== "cursor");
      }
    };
    box.querySelector("[data-draw-color]").oninput = (e) => { drawings.color = e.target.value; store.set("sd-draw-color", drawings.color); };
  }

  function modal(title, body, onApply, wide) {
    const m = document.createElement("div");
    m.className = "modal-bg";
    m.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-label="${esc(title)}"><div class="modal-h"><b>${esc(title)}</b>
      <button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b">${body}</div>
      ${onApply ? `<div class="modal-f"><button class="btn" data-reset type="button">Reset</button><span></span><button class="btn" data-x type="button">Cancel</button><button class="btn primary" data-ok type="button">Apply</button></div>` : ""}</div>`;
    document.body.appendChild(m);
    const shut = () => m.remove();
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) shut();
      if (e.target.closest("[data-ok]")) { onApply(m, false); shut(); }
      if (e.target.closest("[data-reset]")) { onApply(m, true); shut(); }
    });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { shut(); document.removeEventListener("keydown", k); } });
    return m;
  }

  function indicatorMenu() {
    const body = `<input type="search" class="ind-q" placeholder="Search indicators" aria-label="Search indicators">` + IND_MENU.map(([g, items]) =>
      `<div class="ind-g"><h4>${g}</h4>${items.map(([k, label, desc]) => `<div class="ind-row" data-k="${k}" data-t="${esc((label + " " + desc).toLowerCase())}">
        <label><input type="checkbox" data-on="${k}" ${cfg.ind[k].on ? "checked" : ""}> <b>${label}</b><small>${esc(desc)}</small></label>
        <button class="btn sm" data-gear="${k}" type="button" title="Settings">⚙</button></div>`).join("")}</div>`).join("");
    const m = modal("Indicators", body, null, true);
    m.querySelector(".ind-q").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      m.querySelectorAll(".ind-row").forEach((r) => { r.style.display = r.dataset.t.includes(q) ? "" : "none"; });
    };
    m.addEventListener("change", (e) => {
      const k = e.target.dataset.on;
      if (k) { cfg.ind[k].on = e.target.checked; save(); draw(true); renderTools(); }
    });
    m.addEventListener("click", (e) => {
      const g = e.target.closest("[data-gear]");
      if (g) { m.remove(); g.dataset.gear === "ma" ? maMenu() : indSettings(g.dataset.gear); }
    });
  }

  function indSettings(k) {
    const fields = IND_FIELDS[k] || [];
    const val = cfg.ind[k];
    const inp = ([key, label, type, options]) => {
      const v = val[key];
      if (type === "bool") return `<label class="f-row"><input type="checkbox" name="${key}" ${v ? "checked" : ""}> ${label}</label>`;
      if (type === "color") return `<label class="f-row">${label} <input type="color" name="${key}" value="${esc(v)}"></label>`;
      if (type === "sel") return `<label class="f-row">${label} <select name="${key}">${options.map((o) => `<option value="${o}" ${String(o) === String(v) ? "selected" : ""}>${BENCH[o] || o}</option>`).join("")}</select></label>`;
      return `<label class="f-row">${label} <input type="number" step="any" name="${key}" value="${esc(v)}"></label>`;
    };
    const label = IND_MENU.flatMap((g) => g[1]).find((x) => x[0] === k)[1];
    modal(`${label} - settings`, `<form class="f">${fields.map(inp).join("")}<label class="f-row"><input type="checkbox" name="__on" ${val.on ? "checked" : ""}> Show on the chart</label></form>`, (m, reset) => {
      if (reset) cfg.ind[k] = { ...DEFAULTS.ind[k], on: true };
      else {
        const f = m.querySelector("form");
        for (const [key, , type] of fields) {
          const el = f.elements[key];
          cfg.ind[k][key] = type === "bool" ? el.checked : type === "num" ? Number(el.value) : el.value;
        }
        cfg.ind[k].on = f.elements.__on.checked;
      }
      save(); draw(true); renderTools();
    });
  }

  function maMenu() {
    const ma = cfg.ind.ma;
    const rows = (tf) => {
      const lines = (ma[tf] || MA_PRESETS[ma.preset || "mine"][tf]).map((x, k) => (Array.isArray(x) ? { type: x[0], len: x[1], color: x[2] || MA_COLORS[k % MA_COLORS.length] } : x));
      return `<div class="ma-list" data-tf="${tf}"><h4>${tf === "d" ? "Daily chart" : "Weekly chart"}</h4>${lines.map((x) => maRow(x)).join("")}
        <button class="btn sm" data-add="${tf}" type="button">+ Add average</button></div>`;
    };
    const maRow = (x) => `<div class="ma-row"><select name="type"><option ${x.type === "SMA" ? "selected" : ""}>SMA</option><option ${x.type === "EMA" ? "selected" : ""}>EMA</option></select>
      <input type="number" name="len" min="2" value="${x.len}"><input type="color" name="color" value="${x.color}"><button class="btn sm" data-del type="button" aria-label="Remove">✕</button></div>`;
    const body = `<p class="muted">Presets</p><div class="seg sm" data-preset>${Object.entries(MA_PRESETS).map(([k, p]) => `<button type="button" data-v="${k}" class="${!ma.d && ma.preset === k ? "on" : ""}">${p.label}</button>`).join("")}</div>
      <div class="ma-grid">${rows("d")}${rows("w")}</div><label class="f-row"><input type="checkbox" id="maDefault"> Save current look as my default</label>`;
    const m = modal("Moving averages", body, (mm, reset) => {
      if (reset) { cfg.ind.ma = { ...DEFAULTS.ind.ma }; save(); return draw(true); }
      const read = (tf) => [...mm.querySelectorAll(`.ma-list[data-tf=${tf}] .ma-row`)].map((r) => ({ type: r.querySelector("[name=type]").value, len: Number(r.querySelector("[name=len]").value), color: r.querySelector("[name=color]").value })).filter((x) => x.len >= 2);
      cfg.ind.ma.d = read("d"); cfg.ind.ma.w = read("w"); cfg.ind.ma.on = true;
      if (mm.querySelector("#maDefault").checked) MA_PRESETS.mine = { label: "My preset", d: cfg.ind.ma.d.map((x) => [x.type, x.len, x.color]), w: cfg.ind.ma.w.map((x) => [x.type, x.len, x.color]) };
      save(); draw(true); renderTools();
    }, true);
    m.addEventListener("click", (e) => {
      const p = e.target.closest("[data-preset] button");
      if (p) { cfg.ind.ma = { on: true, preset: p.dataset.v, d: null, w: null }; save(); m.remove(); draw(true); maMenu(); return; }
      const add = e.target.closest("[data-add]");
      if (add) add.insertAdjacentHTML("beforebegin", maRow({ type: "SMA", len: 50, color: MA_COLORS[0] }));
      const del = e.target.closest("[data-del]");
      if (del) del.closest(".ma-row").remove();
    });
  }

  function settingsMenu() {
    const mk = cfg.marks, ch = cfg.chips;
    const cb = (name, label, on, small) => `<label class="f-row"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${label}${small ? `<small>${small}</small>` : ""}</label>`;
    const body = `<form class="f"><h4>Chart style</h4><div class="styles">${Object.entries(STYLES).map(([k, s]) => `<label class="style-opt"><input type="radio" name="style" value="${k}" ${cfg.style === k ? "checked" : ""}>
      <span style="background:${s.up}"></span><span style="background:${s.down}"></span> ${s.label}</label>`).join("")}</div>
      <h4>Setups</h4>${cb("pivot", "Pivot / breakout line", mk.pivot, "top of the current base (blue) and its low (dotted)")}
      ${cb("vcp", "Base pullbacks (VCP)", mk.vcp, "depth of each pullback inside the base (orange arrows)")}
      ${cb("tight", "Tight areas", mk.tight, "5+ closes within 2 % of each other (green band)")}
      <h4>Markers</h4>${cb("inside", "Inside bars", mk.inside, "bar inside the previous bar's range (small circle)")}
      ${cb("actions", "Corporate actions", mk.actions, "split / bonus / rights / demerger days")}
      ${cb("earnings", "Results days (E)", mk.earnings !== false, "quarterly results announcements (purple E)")}
      ${cb("circuit", "Circuit limits", mk.circuit, "today's price band around the last close (dotted orange)")}
      ${cb("hilo52", "52-week high & low", mk.hilo52, "dashed lines")}
      ${cb("swings", "Swing % moves", mk.swings, "triangles with the % of each swing")} <label class="f-row">Swing size % <input type="number" name="swingPct" value="${mk.swingPct}"></label>
      <h4>Header chips</h4>${cb("c_float", "Float market cap", ch.float)}${cb("c_rs", "RS rating", ch.rs)}${cb("c_stage", "Stage", ch.stage)}${cb("c_from", "From 52-week high", ch.from)}${cb("c_theme", "Theme status", ch.theme !== false)}
      <p class="muted small">News markers come in a later phase.</p></form>`;
    modal("Chart settings", body, (m, reset) => {
      if (reset) { cfg.style = DEFAULTS.style; cfg.marks = { ...DEFAULTS.marks }; cfg.chips = { ...DEFAULTS.chips }; }
      else {
        const f = m.querySelector("form").elements;
        cfg.style = f.style.value;
        for (const k of ["inside", "actions", "circuit", "hilo52", "swings", "pivot", "vcp", "tight", "earnings"]) cfg.marks[k] = f[k].checked;
        cfg.marks.swingPct = Number(f.swingPct.value) || 10;
        cfg.chips = { float: f.c_float.checked, rs: f.c_rs.checked, stage: f.c_stage.checked, from: f.c_from.checked, theme: f.c_theme.checked };
      }
      save(); draw(true);
    }, true);
  }

  /* ------------------------------------------------------------------ drawings (SVG over the price pane) */
  const drawings = {
    tool: "cursor", color: store.get("sd-draw-color", "#2962ff"), chart: null, series: null, items: [], pending: null,
    key() { return `sd-draw:${cur && cur.row.id}:${cfg.tf}`; },
    attach(chart, series) {
      this.chart = chart; this.series = series; this.items = store.get(this.key(), []);
      const svg = cur.box.querySelector("#chSvg");
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.render());
      chart.subscribeClick((p) => this.click(p));
      chart.subscribeCrosshairMove((p) => { if (this.pending && p && p.point) { this.pending.hover = this.toData(p); this.render(); } });
      svg.onclick = (e) => {
        if (this.tool !== "delete") return;
        const g = e.target.closest("[data-i]");
        if (g) { this.items.splice(Number(g.dataset.i), 1); this.persist(); }
      };
      if (cur.ro) cur.ro.disconnect();
      cur.ro = new ResizeObserver(() => this.render());
      cur.ro.observe(cur.box.querySelector(".ch-wrap"));
      setTimeout(() => this.render(), 50);
    },
    toData(p) { return p && p.point && p.time ? { time: p.time, price: this.series.coordinateToPrice(p.point.y) } : null; },
    click(p) {
      if (!cur || this.tool === "cursor" || this.tool === "delete" || (p.paneIndex != null && p.paneIndex !== this.paneIndex())) return;
      const d = this.toData(p);
      if (!d || d.price == null) return;
      if (this.tool === "text") {
        const t = prompt("Text on the chart:");
        if (t) { this.items.push({ type: "text", a: d, text: t.slice(0, 80), color: this.color }); this.persist(); }
        return;
      }
      if (!this.pending) { this.pending = { type: this.tool, a: d, color: this.color }; return; }
      this.items.push({ type: this.pending.type, a: this.pending.a, b: d, color: this.pending.color });
      this.pending = null; this.persist();
    },
    paneIndex() { return cur && cur.price ? (cfg.ind.rsline.on && cfg.ind.rsline.pane === "above" ? 1 : 0) : 0; },
    persist() { store.set(this.key(), this.items); this.render(); },
    clear() { if (confirm("Delete every drawing on this chart?")) { this.items = []; this.persist(); } },
    xy(pt) {
      const x = this.chart.timeScale().timeToCoordinate(pt.time), y = this.series.priceToCoordinate(pt.price);
      return x == null || y == null ? null : [x, y + this.paneTop()];
    },
    paneTop() {      // the price pane's top inside the chart box; null until the chart has painted its panes
      const pane = this.chart.panes()[this.paneIndex()], el = pane && pane.getHTMLElement();
      const wrap = cur && cur.box.querySelector(".ch-wrap");
      return el && wrap ? el.getBoundingClientRect().top - wrap.getBoundingClientRect().top : null;
    },
    render() {
      if (!cur || !this.chart) return;
      const svg = cur.box.querySelector("#chSvg");
      if (!svg) return;
      if (this.paneTop() == null) { requestAnimationFrame(() => this.render()); return; }     // not painted yet
      const parts = [];
      const all = [...this.items.map((x, i) => ({ ...x, i })), ...(this.pending && this.pending.hover ? [{ ...this.pending, b: this.pending.hover, i: -1 }] : [])];
      for (const it of all) {
        const a = this.xy(it.a);
        if (!a) continue;
        if (it.type === "text") { parts.push(`<g data-i="${it.i}"><text x="${a[0]}" y="${a[1]}" fill="${it.color}" font-size="12">${esc(it.text)}</text></g>`); continue; }
        const b = this.xy(it.b);
        if (!b) continue;
        if (it.type === "line") parts.push(`<g data-i="${it.i}"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${it.color}" stroke-width="2"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="transparent" stroke-width="10"/></g>`);
        if (it.type === "measure") {
          const pct = (it.b.price / it.a.price - 1) * 100;
          const t1 = cur.bars.findIndex((x) => x.time === it.a.time), t2 = cur.bars.findIndex((x) => x.time === it.b.time);
          const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
          const col = pct >= 0 ? "#089981" : "#f23645";
          parts.push(`<g data-i="${it.i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}22" stroke="${col}"/>
            <text x="${x + w / 2}" y="${y - 4}" text-anchor="middle" fill="${col}" font-size="12">${pct > 0 ? "+" : ""}${pct.toFixed(2)}% · ${Math.abs(t2 - t1)} bars</text></g>`);
        }
      }
      svg.innerHTML = parts.join("");
    },
  };

  window.SDChart = { open, close, settings: () => cfg, _chart: () => cur && cur.chart };
})();
