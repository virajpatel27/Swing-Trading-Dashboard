/* Stock chart (Phase S5, new look N2): TradingView Lightweight Charts 5 + our indicators (ind.js = the pipeline's formulas).
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
    marks: { hilo52: false, swings: false, swingPct: 10, circuit: false, inside: false, actions: true, pivot: true, vcp: true, cup: true, tight: false, earnings: true },
    show: { earn: true, earnOpen: true, desc: true, due: true }, grid: true,
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
      rsi: { on: false, len: 14, ob: 70, os: 30, color: "#9c27b0" },
      macd: { on: false, fast: 12, slow: 26, sig: 9 },
      mfi: { on: false, len: 14, ob: 80, os: 20, color: "#00bcd4" },
      relext: { on: false, ma: 50, lookback: 250, color: "#ff5722" },
      atr: { on: false, len: 14, color: "#607d8b" },
      adr: { on: false, len: 20, color: "#795548" },
      ti: { on: false, fast: 7, slow: 65, color: "#3f51b5" },
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
    rsi: [["len", "Length", "num"], ["ob", "Upper line", "num"], ["os", "Lower line", "num"], ["color", "Colour", "color"]],
    macd: [["fast", "Fast", "num"], ["slow", "Slow", "num"], ["sig", "Signal", "num"]],
    mfi: [["len", "Length", "num"], ["ob", "Upper line", "num"], ["os", "Lower line", "num"], ["color", "Colour", "color"]],
    relext: [["ma", "Average length", "num"], ["lookback", "Lookback", "num"], ["color", "Colour", "color"]],
    atr: [["len", "Length", "num"], ["color", "Colour", "color"]], adr: [["len", "Length", "num"], ["color", "Colour", "color"]],
    ti: [["fast", "Fast", "num"], ["slow", "Slow", "num"], ["color", "Colour", "color"]],
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
  const ICO = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 004.4-1"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    candle: '<svg viewBox="0 0 24 24"><path d="M7 3v4M7 17v4M17 3v2M17 15v6"/><rect x="4.5" y="7" width="5" height="10" rx="1"/><rect x="14.5" y="5" width="5" height="10" rx="1"/></svg>',
    bars: '<svg viewBox="0 0 24 24"><path d="M7 3v18M4 7h3M7 15h3M17 3v18M14 9h3M17 17h3"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>',
    cursor: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/></svg>',
    hline: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><circle cx="12" cy="12" r="1.6"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 5h14M12 5v14"/></svg>',
    measure: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    end: '<svg viewBox="0 0 24 24"><path d="M6 6l6 6-6 6M13 6l6 6-6 6"/></svg>',
  };
  const ic = (k) => `<span class="ci">${ICO[k]}</span>`;
  const indLabel = (k) => { const x = IND_MENU.flatMap((g) => g[1]).find((y) => y[0] === k); return x ? x[1] : k; };
  const indDesc = (k) => { const x = IND_MENU.flatMap((g) => g[1]).find((y) => y[0] === k); return x ? x[2] : ""; };

  async function open(box, row, opts = {}) {
    close();
    box.innerHTML = `<div class="ch-top" id="chTools"></div><div class="ch-head" id="chHead"></div><div class="legend" id="chLegend"></div>
      <div class="ch-wrap"><div class="ch-canvas" id="chCanvas"><i class="skel ch-skel"></i></div>
      <svg class="ch-pat" id="chPat"></svg><svg class="ch-svg" id="chSvg"></svg><div class="ch-dbar" id="chDraw"></div>
      <div class="ch-vol muted" id="chVol"></div><button class="ch-end" id="chEnd" type="button" title="Back to the latest bar" hidden>${ic("end")}</button></div>
      <div class="ch-earn" id="chEarn"></div><div class="ch-note muted" id="chNote"></div>`;
    cur = { box, row, opts, kind: opts.kind || "s" };
    renderTools();
    renderDrawBar();
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
    earningsTable();
  }

  function close() {
    if (cur && cur.chart) { cur.chart.remove(); }
    if (cur && cur.ro) cur.ro.disconnect();
    cur = null;
  }

  async function benchCandles(id) {
    try { const d = await getChartFile("n", id); return S.candlesFromChart(d, "adjusted"); } catch (e) { return null; }
  }

  /** draw the chart. pv = {el, cfg, alive()} draws a small preview (indicator popup) with another settings object */
  async function draw(keepRange, pv) {
    if (!cur || !cur.daily) return null;
    const L = window.LightweightCharts;
    const C = pv ? pv.cfg : cfg;
    const canvas = pv ? pv.el : cur.box.querySelector("#chCanvas");
    let range = null;
    if (!pv && cur.chart) { if (keepRange) range = cur.chart.timeScale().getVisibleLogicalRange(); cur.chart.remove(); cur.chart = null; }
    canvas.innerHTML = "";
    const weekly = C.tf === "W";
    const bars = weekly ? S.toWeekly(cur.daily) : cur.daily;
    if (!pv) cur.bars = bars;
    const times = bars.map((b) => b.time), o = bars.map((b) => b.open), h = bars.map((b) => b.high), l = bars.map((b) => b.low),
      c = bars.map((b) => b.close), v = bars.map((b) => b.volume || 0);
    const st = STYLES[C.style] || STYLES.classic;
    const ind = C.ind;
    const show = (k) => ind[k] && ind[k].on && !ind[k].hidden;
    const panes = [];       // names in order below the price
    const rsAbove = show("rsline") && ind.rsline.pane === "above";
    const chart = L.createChart(canvas, {
      autoSize: true,
      layout: { background: { color: css("--panel") }, textColor: css("--muted"), fontSize: 11, fontFamily: css("--font") || undefined, attributionLogo: !pv,
        panes: { separatorColor: css("--line"), separatorHoverColor: css("--accent-soft"), enableResize: true } },
      grid: { vertLines: { color: css("--line") + (C.grid === false ? "00" : "") }, horzLines: { color: css("--line") + (C.grid === false ? "00" : "") } },
      rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line"), rightOffset: 5, visible: true },
      crosshair: { mode: 0, vertLine: { style: 3, labelBackgroundColor: css("--text") }, horzLine: { style: 3, labelBackgroundColor: css("--text") } },
      localization: { priceFormatter: (p) => fmt(p, 2) }, handleScroll: !pv, handleScale: !pv,
    });
    if (!pv) cur.chart = chart;
    const alive = () => (pv ? pv.alive() : cur && cur.chart === chart);
    let paneNo = 0;
    const nextPane = (name) => { panes.push(name); return ++paneNo; };
    const line = (data, color, pane, extra = {}) => {
      const s = chart.addSeries(L.LineSeries, { color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }, pane);
      s.setData(data); return s;
    };
    const pts = (arr, from = 0) => arr.map((x, i) => (i >= from && x != null && !Number.isNaN(x) ? { time: times[i], value: x } : { time: times[i] }));
    let pricePane = 0, bench = null;
    if (show("rsline") || show("mansfield")) bench = await benchCandles(ind.rsline.bench);
    if (!alive()) return null;
    const benchBars = bench ? (weekly ? S.toWeekly(bench) : bench) : null;
    const rs = benchBars ? I.rsLine(bars, benchBars) : null;
    if (rsAbove && rs) { pricePane = 1; paneNo = 1; }
    // price
    const priceOpts = { upColor: st.up, downColor: st.down, wickUpColor: st.up, wickDownColor: st.down, borderVisible: false, thinBars: false };
    const price = C.type === "bar" ? chart.addSeries(L.BarSeries, { upColor: st.up, downColor: st.down }, pricePane)
      : chart.addSeries(L.CandlestickSeries, priceOpts, pricePane);
    price.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    if (!pv) cur.price = price;
    const legend = [];     // {k, html} - k null = plain text (no controls)
    const lg = (k, html) => legend.push({ k, html });
    // moving averages
    if (show("ma")) {
      const lines = (weekly ? ind.ma.w : ind.ma.d) || MA_PRESETS[ind.ma.preset || "mine"][weekly ? "w" : "d"];
      const names = [];
      lines.forEach((m, k) => {
        const [type, n, color] = Array.isArray(m) ? [m[0], m[1], m[2]] : [m.type, m.len, m.color];
        const col = color || MA_COLORS[k % MA_COLORS.length];
        const vals = type === "EMA" ? I.ema(c, n) : I.sma(c, n);
        line(pts(vals), col, pricePane, { lastValueVisible: !pv, title: "" });
        names.push(`<b style="color:${col}">${type} ${n}${weekly ? "W" : ""}</b>`);
      });
      lg("ma", `<em>MA</em> ${names.join(" ")}`);
    }
    if (show("bb")) {
      const b = I.bollinger(c, ind.bb.len, ind.bb.std);
      line(pts(b.mid), ind.bb.color, pricePane, { lineStyle: 2 });
      const up = line(pts(b.up), ind.bb.color, pricePane); line(pts(b.lo), ind.bb.color, pricePane);
      if (ind.bb.fill) up.applyOptions({ lineWidth: 1 });
      lg("bb", `<b style="color:${ind.bb.color}">BB ${ind.bb.len}, ${ind.bb.std}</b>`);
    }
    if (show("supertrend")) {
      const s = I.supertrend(h, l, c, ind.supertrend.len, ind.supertrend.mult);
      const ser = chart.addSeries(L.LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      ser.setData(s.line.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: s.dir[i] === 1 ? ind.supertrend.up : ind.supertrend.down })));
      lg("supertrend", `<b style="color:${ind.supertrend.up}">Supertrend ${ind.supertrend.len}, ${ind.supertrend.mult}</b>`);
    }
    if (show("swing")) {
      const f = I.t3(c, ind.swing.fast, ind.swing.vf), s = I.t3(c, ind.swing.slow, ind.swing.vf);
      const col = (i) => (f[i] > s[i] ? "#089981" : "#f23645");
      const sf = chart.addSeries(L.LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      sf.setData(f.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: col(i) })));
      const ss = chart.addSeries(L.LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pricePane);
      ss.setData(s.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x, color: col(i) })));
      lg("swing", `<b style="color:#089981">Swing bands ${ind.swing.fast}/${ind.swing.slow}</b>`);
    }
    // markers on the price
    const marks = [];
    if (!pv && C.marks.actions && cur.data.m) {
      for (const m of cur.data.m) {
        const t = `${String(m.d).slice(0, 4)}-${String(m.d).slice(4, 6)}-${String(m.d).slice(6, 8)}`;
        const b = [...bars].reverse().find((x) => x.time <= t);
        if (b) marks.push({ time: b.time, position: "belowBar", color: "#f59e0b", shape: "circle", text: "C", size: 0.8 });
      }
    }
    if (!pv && C.marks.earnings && cur.data.e) {             // results days: "E" on the first bar on / after the day
      for (const d of cur.data.e) {
        const t = `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`;
        const b = bars.find((x) => x.time >= t);
        if (b) marks.push({ time: b.time, position: "belowBar", color: "#7e57c2", shape: "circle", text: "E", size: 0.8 });
      }
    }
    if (!pv && C.marks.swings) {
      for (const p of I.swings(bars, C.marks.swingPct || 10)) {
        if (p.move == null) continue;
        marks.push({ time: p.time, position: p.kind === "high" ? "aboveBar" : "belowBar", color: p.kind === "high" ? st.up : st.down,
          shape: p.kind === "high" ? "arrowUp" : "arrowDown", text: `${p.move > 0 ? "+" : ""}${p.move.toFixed(1)}%` });
      }
    }
    if (!pv && C.marks.inside) {
      bars.forEach((b, i) => { if (i && b.high <= bars[i - 1].high && b.low >= bars[i - 1].low) marks.push({ time: b.time, position: "aboveBar", color: "#9e9e9e", shape: "circle", size: 0.4 }); });
    }
    if (rs && show("rsline") && ind.rsline.dot) {
      const len = weekly ? 52 : 252;
      for (let i = len; i < rs.length; i++) {
        let mx = -Infinity, ph = -Infinity;
        for (let k = i - len + 1; k <= i; k++) { if (rs[k] != null) mx = Math.max(mx, rs[k]); ph = Math.max(ph, h[k]); }
        if (rs[i] != null && rs[i] >= mx && h[i] < ph) marks.push({ time: times[i], position: "belowBar", color: ind.rsline.color, shape: "circle", size: 0.5 });
      }
    }
    // pivot / base (same rule as the pipeline, swingdash/patterns.py); cup arc + VCP wave are drawn in the SVG layer
    if (!pv) cur.pattern = null;
    if (!pv && (C.marks.pivot || C.marks.vcp || C.marks.cup !== false) && bars.length > 30) {
      const pvt = I.pivots(h, c, weekly ? { minAge: 3, local: 4, maxAge: 78, start: bars.length - 1 } : { start: bars.length - 1 });
      const t = bars.length - 1, i = pvt.idx[t];
      if (i >= 0) {
        let lo = Infinity, loAt = i; for (let k = i; k <= t; k++) if (l[k] < lo) { lo = l[k]; loAt = k; }
        const span = (val) => bars.map((b, k) => (k >= i ? { time: b.time, value: val } : { time: b.time }));
        if (C.marks.pivot) {
          line(span(pvt.piv[t]), "#2962ff", pricePane, { lineWidth: 2, lastValueVisible: true, title: "Pivot" });
          line(span(lo), css("--muted"), pricePane, { lineWidth: 1, lineStyle: 2, lastValueVisible: true, title: "Base low" });
          lg(null, `<b style="color:#2962ff">Pivot ${fmt(pvt.piv[t])}</b> <span class="muted">(${S.fmtPct((c[t] / pvt.piv[t] - 1) * 100)})</span>`);
        }
        const waves = C.marks.vcp ? I.contractions(c, h, i, 5).map((k) => {
          let wl = Infinity, at = k.lo; for (let q = k.hi; q <= k.lo; q++) if (l[q] < wl) { wl = l[q]; at = q; }
          return { hiT: times[k.hi], hiP: h[k.hi], loT: times[at], loP: wl, depth: k.depth };
        }) : [];
        cur.pattern = { startT: times[i], endT: times[t], loT: times[loAt], lo, top: pvt.piv[t], len: t - i, cup: C.marks.cup !== false && t - i >= 15, waves };
      }
    }
    if (!pv && C.marks.tight && bars.length > 5) {           // runs of 5+ closes within 2 % of each other: green band
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
    if (!pv && C.marks.hilo52 && bars.length) {
      const n = weekly ? 52 : 252, last = bars.slice(-n);
      price.createPriceLine({ price: Math.max(...last.map((b) => b.high)), color: st.up, lineWidth: 1, lineStyle: 2, title: "52W H" });
      price.createPriceLine({ price: Math.min(...last.map((b) => b.low)), color: st.down, lineWidth: 1, lineStyle: 2, title: "52W L" });
    }
    if (!pv && C.marks.circuit && cur.row.price_band && /^\d+$/.test(String(cur.row.price_band)) && cur.row.raw_close) {
      const band = Number(cur.row.price_band) / 100, last = c[c.length - 1];
      price.createPriceLine({ price: last * (1 + band), color: "#ff9800", lineWidth: 1, lineStyle: 1, title: `+${cur.row.price_band}%` });
      price.createPriceLine({ price: last * (1 - band), color: "#ff9800", lineWidth: 1, lineStyle: 1, title: `-${cur.row.price_band}%` });
    }
    if (show("watermark")) {
      const ln = [];
      const size = { S: 18, M: 30, L: 44 }[ind.watermark.size] || 30, col = css("--muted") + "33";
      if (ind.watermark.symbol) ln.push({ text: `${cur.row.symbol}, ${C.tf}`, color: col, fontSize: size });
      if (ind.watermark.name) ln.push({ text: cur.row.name || "", color: col, fontSize: Math.round(size * 0.5) });
      if (ind.watermark.sector && cur.row.sector) ln.push({ text: `${cur.row.sector} · ${cur.row.basic_industry || cur.row.industry || ""}`, color: col, fontSize: Math.round(size * 0.4) });
      L.createTextWatermark(chart.panes()[pricePane], { horzAlign: "center", vertAlign: { top: "top", middle: "center", bottom: "bottom" }[ind.watermark.pos] || "center", lines: ln });
      lg("watermark", "Watermark");
    }
    // RS line pane (above or below)
    if (show("rsline") && rs) {
      const pane = rsAbove ? 0 : nextPane("RS");
      line(pts(rs), ind.rsline.color, pane, { lastValueVisible: true, priceFormat: { type: "price", precision: 4, minMove: 0.0001 } });
      if (rsAbove) panes.unshift("RS");
      lg("rsline", `<b style="color:${ind.rsline.color}">RS line</b> <span class="muted">vs ${esc(BENCH[ind.rsline.bench] || ind.rsline.bench)}</span>`);
    }
    // volume
    let vflags = null, volPane = null;
    if (show("volume")) {
      vflags = I.volumeFlags(bars, { high_volume_x: Number(ind.volume.x) || 1.5 });
      const onPrice = ind.volume.pane === "price";
      const pane = onPrice ? pricePane : nextPane("Volume");
      volPane = onPrice ? null : pane;
      const vs = chart.addSeries(L.HistogramSeries, { priceFormat: { type: "custom", formatter: (x) => S.fmtVol(x), minMove: 1 },
        priceScaleId: onPrice ? "vol" : "right", lastValueVisible: false, priceLineVisible: false }, pane);
      if (onPrice) vs.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      const grey = css("--muted") + "66";
      vs.setData(bars.map((b, i) => {
        const f = vflags[i];
        let col = grey;
        if (ind.volume.colorHigh && f.high) col = f.up ? st.up : f.down ? st.down : grey;
        else if (ind.volume.colorHigh) col = (f.up ? st.up : st.down) + "55";
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
      lg("volume", "Volume");
    }
    if (show("stage")) {
      const stg = I.stage(c);
      const pane = nextPane("Stage");
      const s = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 0, minMove: 1 } }, pane);
      s.setData(stg.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: 1, color: STAGE_COL[x] })));
      lg("stage", "Stage analysis");
    }
    if (show("mansfield") && rs) {
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
      lg("mansfield", `Mansfield RS ${ind.mansfield.len}`);
    }
    const osc = (k, name, vals, color, levels = []) => {
      const pane = nextPane(name);
      const s = line(pts(vals), color, pane, { lastValueVisible: true });
      levels.forEach((lv) => s.createPriceLine({ price: lv, color: css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
      lg(k, `<b style="color:${color}">${name}</b>`);
      return pane;
    };
    if (show("rsi")) osc("rsi", `RSI ${ind.rsi.len}`, I.rsi(c, ind.rsi.len), ind.rsi.color || "#9c27b0", [ind.rsi.ob, ind.rsi.os]);
    if (show("macd")) {
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
      lg("macd", `<b style="color:#2962ff">MACD ${ind.macd.fast}, ${ind.macd.slow}, ${ind.macd.sig}</b>`);
    }
    if (show("mfi")) osc("mfi", `MFI ${ind.mfi.len}`, I.mfi(h, l, c, v, ind.mfi.len), ind.mfi.color || "#00bcd4", [ind.mfi.ob, ind.mfi.os]);
    if (show("relext")) osc("relext", "Rel. extension", I.relativeExtension(c, ind.relext.ma, ind.relext.lookback), ind.relext.color || "#ff5722", [70, 0, -70]);
    if (show("atr")) osc("atr", `ATR ${ind.atr.len}`, I.atr(h, l, c, ind.atr.len), ind.atr.color || "#607d8b");
    if (show("adr")) osc("adr", `ADR % ${ind.adr.len}`, I.adr(h, l, ind.adr.len), ind.adr.color || "#795548");
    if (show("ti")) osc("ti", "Trend intensity", I.trendIntensity(c, ind.ti.fast, ind.ti.slow), ind.ti.color || "#3f51b5", [105, 100, 95]);
    // indicators that are on but hidden (eye) stay in the legend, faded
    for (const g of IND_MENU) for (const [k, label] of g[1]) if (ind[k].on && ind[k].hidden) legend.push({ k, html: label, hidden: true });
    // pane sizes: the price pane gets the most room; the chart grows by 80 px per extra pane
    const ps = chart.panes();
    ps.forEach((p, i) => p.setStretchFactor(i === pricePane ? Math.max(3, 6 - ps.length) : 1));
    if (pv) {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 120), to: bars.length + 2 });
      return chart;
    }
    canvas.style.minHeight = ps.length > 2 ? `${320 + 80 * (ps.length - 1)}px` : "";
    cur.legend = legend;
    renderLegend();
    cur.volPane = volPane;
    // visible range: last year (daily) / 3 years (weekly)
    if (range) chart.timeScale().setVisibleLogicalRange(range);
    else { const n = weekly ? 156 : 250; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length + 3 }); }
    // header with crosshair values
    header(bars.length - 1, vflags);
    cur.onPaint = () => header(bars.length - 1, vflags);   // the volume label needs the painted panes (drawings.render calls it)
    chart.subscribeCrosshairMove((p) => {
      if (!p || !p.time) return header(bars.length - 1, vflags);
      const i = times.indexOf(p.time);
      if (i >= 0) header(i, vflags);
    });
    // "back to the latest bar" button when scrolled into the past
    const endBtn = cur.box.querySelector("#chEnd");
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (endBtn && r) endBtn.hidden = r.to >= bars.length - 1; });
    endBtn.onclick = () => chart.timeScale().scrollToRealTime();
    drawings.attach(chart, price, pricePane);
    cur.box.querySelector("#chNote").textContent = (weekly ? "Weekly bars (Monday-start weeks). " : "Daily bars. ")
      + "Prices adjusted for splits, bonus, rights, demergers. Drag the line between panes to resize them. Indicators use the same formulas as the table (docs/formulas.md).";
    return chart;
  }

  function renderLegend() {
    const box = cur && cur.box.querySelector("#chLegend");
    if (!box) return;
    box.innerHTML = (cur.legend || []).map((x) => x.k
      ? `<span class="lg ${x.hidden ? "off" : ""}" data-k="${x.k}">${x.html}<span class="lg-b"><button type="button" data-lg="eye" title="${x.hidden ? "Show" : "Hide"}">${ic(x.hidden ? "eyeOff" : "eye")}</button>`
        + `<button type="button" data-lg="gear" title="Settings">${ic("gear")}</button><button type="button" data-lg="x" title="Remove">${ic("x")}</button></span></span>`
      : `<span class="lg plain">${x.html}</span>`).join("");
    box.onclick = (e) => {
      const b = e.target.closest("[data-lg]"); if (!b) return;
      const k = b.closest("[data-k]").dataset.k, act = b.dataset.lg;
      if (act === "eye") cfg.ind[k].hidden = !cfg.ind[k].hidden;
      else if (act === "x") { cfg.ind[k].on = false; cfg.ind[k].hidden = false; }
      else return indicatorMenu(k);
      save(); draw(true); renderTools();
    };
  }

  function header(i, vflags) {
    if (!cur || !cur.bars) return;
    const b = cur.bars[i], p = cur.bars[i - 1], r = cur.row;
    const chg = p ? (b.close / p.close - 1) * 100 : null, chgAbs = p ? b.close - p.close : null;
    const back = (n) => { const x = cur.bars[i - n]; return x ? (b.close / x.close - 1) * 100 : null; };
    const w = cfg.tf === "W";
    const f = vflags ? vflags[i] : null;
    const due = r.next_result && cfg.show.due !== false ? `<span class="ch-due">Results due ${esc(S.fmtDate(r.next_result))}</span>` : "";
    cur.box.querySelector("#chHead").innerHTML = `<div class="ch-l2"><b class="ch-sym">${esc(r.symbol || r.name)}</b><span class="muted">${w ? "1W" : "1D"}</span>
      <span>O <b>${fmt(b.open)}</b></span><span>H <b>${fmt(b.high)}</b></span><span>L <b>${fmt(b.low)}</b></span><span>C <b>${fmt(b.close)}</b></span>
      <span class="${S.colorClass(chg)}">${chgAbs == null ? "" : (chgAbs > 0 ? "+" : "") + fmt(chgAbs)} (${S.fmtPct(chg)})</span>
      <span class="ch-r"><span>1M <b class="${S.colorClass(back(w ? 4 : 21))}">${S.fmtPct(back(w ? 4 : 21))}</b></span><span>3M <b class="${S.colorClass(back(w ? 13 : 63))}">${S.fmtPct(back(w ? 13 : 63))}</b></span></span></div>
      ${cfg.show.desc !== false ? `<div class="ch-desc muted">${esc(r.name || "")}${r.sector ? ` · ${esc(r.sector)} › ${esc(r.basic_industry || r.industry || "")}` : ""}${due}</div>` : due ? `<div class="ch-desc">${due}</div>` : ""}`;
    const vl = cur.box.querySelector("#chVol");
    if (vl) {
      const top = cur.volPane != null ? drawings.paneTopOf(cur.volPane) : null;
      if (f && b.volume != null && top != null) {
        vl.hidden = false; vl.style.top = `${top + 4}px`;
        vl.innerHTML = `Vol <b class="${f.up ? "up" : f.down ? "down" : ""}">${S.fmtVol(b.volume)}</b> · Avg 20${w ? "W" : "D"} <b>${S.fmtVol(f.avg20)}</b> · RVol <b>${f.rvol == null ? "–" : Math.round(f.rvol * 100) + "%"}</b>`;
      } else {
        vl.hidden = true;
        if (f && top == null && (cur.volTry = (cur.volTry || 0) + 1) < 20) setTimeout(() => { if (cur && cur.bars) header(i, vflags); }, 250);
      }
    }
  }

  /* ------------------------------------------------------------------ earnings table under the chart (last 5 quarters) */
  async function earningsTable() {
    const box = cur && cur.box.querySelector("#chEarn");
    if (!box) return;
    if (cur.kind !== "s" || cfg.show.earn === false || !window.SDF) { box.innerHTML = ""; return; }
    const row = cur.row;
    let doc;
    try { const r = await fetch(`data/f/${encodeURIComponent(row.id)}.json`, { cache: "no-cache" }); if (!r.ok) throw new Error(); doc = await r.json(); }
    catch (e) { box.innerHTML = ""; return; }
    if (!cur || cur.row !== row) return;
    const F = window.SDF, basis = F.basisOf(doc), t = F.quarterTable(doc, basis, 9);
    if (!t.ends.length) { box.innerHTML = ""; return; }
    const rowOf = (k) => (t.rows.find((x) => x[1] === k) || [null, k, []])[2];
    const eps = rowOf("eps"), sales = rowOf("sales"), n = t.ends.length, from = Math.max(0, n - 5);
    const fq = (end) => { const y = +end.slice(0, 4), m = +end.slice(5, 7); const q = { 6: 1, 9: 2, 12: 3, 3: 4 }[m]; const fy = m >= 4 ? y + 1 : y; return q ? `Q${q} FY${String(fy).slice(2)}` : F.label(end); };
    const ch = (a, b) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
    const pc = (x) => (x == null ? '<i class="muted">—</i>' : `<i class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${Math.round(x)}%</i>`);
    const cells = (vals, d) => t.ends.slice(from).map((e, j) => {
      const i = from + j;
      return `<td class="${i === n - 1 ? "last" : ""}"><b>${vals[i] == null ? "–" : fmt(vals[i], d)}</b><span>${pc(ch(vals[i], vals[i - 4]))}${pc(ch(vals[i], vals[i - 1]))}</span></td>`;
    }).join("");
    const open = cfg.show.earnOpen !== false;
    box.innerHTML = `<button type="button" class="ce-h" aria-expanded="${open}"><span class="caret">▾</span> Earnings <small class="muted">YoY / QoQ · ${basis === "C" ? "consolidated" : "standalone"}</small></button>
      <div class="ce-b ${open ? "" : "shut"}"><div class="ce-in"><table><thead><tr><th></th>${t.ends.slice(from).map((e, j) => `<th class="${from + j === n - 1 ? "last" : ""}">${fq(e)}</th>`).join("")}</tr></thead>
      <tbody><tr><th>EPS ₹<small>YoY<br>QoQ</small></th>${cells(eps, 2)}</tr><tr><th>${doc.kind === "bank" || doc.kind === "nbfc" ? "Revenue" : doc.kind === "insurance" ? "Premium" : "Sales"} Cr<small>YoY<br>QoQ</small></th>${cells(sales, 0)}</tr></tbody></table></div></div>`;
    box.querySelector(".ce-h").onclick = () => {
      cfg.show.earnOpen = !(cfg.show.earnOpen !== false); save();
      box.querySelector(".ce-b").classList.toggle("shut", cfg.show.earnOpen === false);
      box.querySelector(".ce-h").setAttribute("aria-expanded", String(cfg.show.earnOpen !== false));
    };
  }

  /* ------------------------------------------------------------------ toolbar, menus */
  function chipsHTML() {
    const r = cur.row, chips = [];
    if (cfg.chips.float && r.float_mcap_cr != null) chips.push(`<span class="chip-s" title="Free-float market cap">F ₹${fmt(r.float_mcap_cr, 0)} Cr</span>`);
    if (cfg.chips.rs && r.rs_rating != null) chips.push(`<span class="chip-s" title="RS rating 1-99">RS ${r.rs_rating}</span>`);
    if (cfg.chips.stage && r.stage) chips.push(`<span class="chip-s" style="color:${STAGE_COL[r.stage]};background:${STAGE_COL[r.stage]}1f">${esc(String(r.stage).replace("A", ""))} ${STAGE_TXT[r.stage]}</span>`);
    if (cfg.chips.theme !== false && r.theme_status) {
      const tc = { Leading: "#089981", Improving: "#2962ff", Weakening: "#ff9800", Lagging: "#f23645" }[r.theme_status] || css("--muted");
      chips.push(`<span class="chip-s" style="color:${tc};background:${tc}1f" title="Theme ${esc(r.theme || "")}: ${esc(r.theme_status)}">T ${esc(r.theme_status)}</span>`);
    }
    if (cfg.chips.from && r.from_hi52 != null) chips.push(`<span class="chip-s" title="From 52-week high">D ${S.fmtPct(r.from_hi52)}</span>`);
    return chips.join("");
  }

  function renderTools() {
    const box = cur.box.querySelector("#chTools");
    const seg = (name, opts, val) => `<div class="seg sm" data-seg="${name}">${opts.map(([v, t, tip]) => `<button type="button" data-v="${v}" class="${v === val ? "on" : ""}" ${tip ? `title="${tip}"` : ""}>${t}</button>`).join("")}</div>`;
    box.innerHTML = `${seg("tf", [["D", "D", "Daily"], ["W", "W", "Weekly"]], cfg.tf)}${seg("type", [["candle", ic("candle"), "Candles"], ["bar", ic("bars"), "Bars"]], cfg.type)}
      <button class="btn sm ${cfg.ind.ma.on ? "on" : ""}" data-act="ma" type="button" title="Moving averages on / off">MA</button>
      <button class="btn sm" data-act="ind" type="button"><i class="fx">ƒx</i> Indicators <span class="caret">▾</span></button>
      <span class="ch-chips">${chipsHTML()}</span>
      <button class="btn sm icon" data-act="set" type="button" title="Chart settings">${ic("gear")}</button>`;
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
        if (act.dataset.act === "ma") { cfg.ind.ma.on = !cfg.ind.ma.on; cfg.ind.ma.hidden = false; save(); act.classList.toggle("on", cfg.ind.ma.on); return draw(true); }
        if (act.dataset.act === "ind") return indicatorMenu();
        if (act.dataset.act === "set") return settingsDrawer();
      }
    };
  }

  /* vertical drawing bar: round pencil button bottom-left of the chart opens it */
  function renderDrawBar() {
    const bar = cur.box.querySelector("#chDraw");
    const open = store.get("sd-draw-open", false);
    const tools = [["cursor", "Cursor"], ["line", "Trend line"], ["hline", "Horizontal line"], ["text", "Text"], ["measure", "Measure % and bars"]];
    bar.innerHTML = `<div class="db-tools" ${open ? "" : "hidden"}>${tools.map(([k, t]) => `<button type="button" data-draw="${k}" title="${t}" class="${drawings.tool === k ? "on" : ""}">${ic(k)}</button>`).join("")}
      <label class="db-col" title="Colour"><input type="color" data-draw-color value="${drawings.color}"><span style="background:${drawings.color}"></span></label>
      <button type="button" data-draw="delete" title="Delete: click a drawing (double-click here = delete all)" class="${drawings.tool === "delete" ? "on" : ""}">${ic("trash")}</button></div>
      <button type="button" class="db-toggle ${open ? "on" : ""}" title="Drawing tools">${ic("pencil")}</button>`;
    bar.onclick = (e) => {
      if (e.target.closest(".db-toggle")) {
        const t = bar.querySelector(".db-tools"); t.hidden = !t.hidden; store.set("sd-draw-open", !t.hidden);
        e.target.closest(".db-toggle").classList.toggle("on", !t.hidden);
        if (t.hidden) { drawings.tool = "cursor"; drawings.pending = null; cur.box.querySelector(".ch-wrap").classList.remove("drawing"); renderDrawBar(); }
        return;
      }
      const dt = e.target.closest("[data-draw]");
      if (!dt) return;
      if (dt.dataset.draw === "delete" && e.detail >= 2) { drawings.clear(); return; }
      drawings.tool = dt.dataset.draw; drawings.pending = null;
      bar.querySelectorAll("[data-draw]").forEach((x) => x.classList.toggle("on", x === dt));
      cur.box.querySelector(".ch-wrap").classList.toggle("drawing", drawings.tool !== "cursor");
    };
    bar.querySelector("[data-draw-color]").oninput = (e) => {
      drawings.color = e.target.value; store.set("sd-draw-color", drawings.color);
      bar.querySelector(".db-col span").style.background = drawings.color;
    };
  }

  function modal(title, body, onApply, wide, cls) {
    const m = document.createElement("div");
    m.className = "modal-bg" + (cls ? " " + cls : "");
    m.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-label="${esc(title)}"><div class="modal-h"><b>${esc(title)}</b>
      <button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b">${body}</div>
      ${onApply ? `<div class="modal-f"><button class="btn" data-reset type="button">Reset</button><span></span><button class="btn" data-x type="button">Cancel</button><button class="btn primary" data-ok type="button">Apply</button></div>` : ""}</div>`;
    document.body.appendChild(m);
    const shut = () => { m.classList.add("closing"); setTimeout(() => m.remove(), 140); document.removeEventListener("keydown", k); };
    const k = (e) => { if (e.key === "Escape") shut(); };
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) shut();
      if (e.target.closest("[data-ok]")) { onApply(m, false); shut(); }
      if (e.target.closest("[data-reset]")) { onApply(m, true); shut(); }
    });
    document.addEventListener("keydown", k);
    m.shut = shut;
    return m;
  }

  /* colour picker: a swatch that opens a grid of colours (+ any colour) */
  const swatch = (name, val) => `<span class="sw" data-sw="${name}"><button type="button" class="sw-cur" style="background:${esc(val)}" aria-label="Colour"></button>
    <input type="hidden" name="${name}" value="${esc(val)}"><span class="sw-grid" hidden>${COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === val ? "on" : ""}" aria-label="${c}"></button>`).join("")}
    <label class="sw-any" title="Any colour"><input type="color" value="${esc(val)}">+</label></span></span>`;
  function wireSwatches(root, onPick) {
    root.addEventListener("click", (e) => {
      const curBtn = e.target.closest(".sw-cur");
      root.querySelectorAll(".sw-grid").forEach((g) => { if (!curBtn || g !== curBtn.parentElement.querySelector(".sw-grid")) g.hidden = true; });
      if (curBtn) { const g = curBtn.parentElement.querySelector(".sw-grid"); g.hidden = !g.hidden; return; }
      const c = e.target.closest("[data-c]");
      if (c) { const sw = c.closest(".sw"); setSw(sw, c.dataset.c); sw.querySelector(".sw-grid").hidden = true; onPick(); }
    });
    root.addEventListener("input", (e) => { if (e.target.closest(".sw-any")) { setSw(e.target.closest(".sw"), e.target.value); onPick(); } });
  }
  const setSw = (sw, c) => { sw.querySelector("input[type=hidden]").value = c; sw.querySelector(".sw-cur").style.background = c; sw.querySelectorAll("[data-c]").forEach((b) => b.classList.toggle("on", b.dataset.c === c)); };

  /* indicator popup: list on the left; name, description, live preview and settings on the right */
  function indicatorMenu(startK) {
    let sel = startK || (IND_MENU.flatMap((g) => g[1]).find(([k]) => cfg.ind[k].on) || ["ma"])[0];
    const list = `<div class="ip-l"><input type="search" class="ind-q" placeholder="Search indicators" aria-label="Search indicators">` + IND_MENU.map(([g, items]) =>
      `<div class="ind-g"><h4>${g}</h4>${items.map(([k, label, desc]) => `<button type="button" class="ip-row" data-k="${k}" data-t="${esc((label + " " + desc).toLowerCase())}">
        <span>${label}</span><i class="ip-on">${cfg.ind[k].on ? "✓" : ""}</i></button>`).join("")}</div>`).join("") + "</div>";
    const m = modal("Indicators", `<div class="ip">${list}<div class="ip-r" id="ipR"></div></div>`, null, true, "ind-pop");
    let prev = null;
    const kill = () => { if (prev) { try { prev.remove(); } catch (e) { /* gone */ } prev = null; } };
    const form = (k) => {
      const v = cfg.ind[k];
      if (k === "ma") {
        const lines = (tf) => ((v[tf] || MA_PRESETS[v.preset || "mine"][tf]).map((x, j) => (Array.isArray(x) ? { type: x[0], len: x[1], color: x[2] || MA_COLORS[j % MA_COLORS.length] } : x)));
        const row = (x, j, tf) => `<div class="ma-row"><select name="type"><option ${x.type === "SMA" ? "selected" : ""}>SMA</option><option ${x.type === "EMA" ? "selected" : ""}>EMA</option></select>
          <input type="number" name="len" min="2" value="${x.len}">${swatch(`c_${tf}_${j}`, x.color)}<button class="btn sm" data-del type="button" aria-label="Remove">✕</button></div>`;
        return `<label class="f-row">Preset <select name="preset">${Object.entries(MA_PRESETS).map(([pk, p]) => `<option value="${pk}" ${!v.d && v.preset === pk ? "selected" : ""}>${p.label}</option>`).join("")}<option value="" ${v.d ? "selected" : ""}>Custom</option></select></label>
          <div class="ma-grid">${["d", "w"].map((tf) => `<div class="ma-list" data-tf="${tf}"><h4>${tf === "d" ? "Daily chart" : "Weekly chart"}</h4>${lines(tf).map((x, j) => row(x, j, tf)).join("")}
          <button class="btn sm" data-add="${tf}" type="button">+ Add average</button></div>`).join("")}</div>`;
      }
      return (IND_FIELDS[k] || []).map(([key, label, type, options]) => {
        const val = v[key];
        if (type === "bool") return `<label class="f-row"><input type="checkbox" name="${key}" ${val ? "checked" : ""}> ${label}</label>`;
        if (type === "color") return `<div class="f-row">${label} ${swatch(key, val)}</div>`;
        if (type === "sel") return `<label class="f-row">${label} <select name="${key}">${options.map((o) => `<option value="${o}" ${String(o) === String(val) ? "selected" : ""}>${BENCH[o] || o}</option>`).join("")}</select></label>`;
        return `<label class="f-row">${label} <input type="number" step="any" name="${key}" value="${esc(val)}"></label>`;
      }).join("") || '<p class="muted small">No settings.</p>';
    };
    const read = (k) => {
      const f = m.querySelector("#ipForm"), out = { ...cfg.ind[k] };
      if (k === "ma") {
        const rd = (tf) => [...f.querySelectorAll(`.ma-list[data-tf=${tf}] .ma-row`)].map((r) => ({ type: r.querySelector("[name=type]").value, len: Number(r.querySelector("[name=len]").value), color: r.querySelector("input[type=hidden]").value })).filter((x) => x.len >= 2);
        out.d = rd("d"); out.w = rd("w");
        return out;
      }
      for (const [key, , type] of IND_FIELDS[k] || []) {
        const el = f.elements[key];
        if (el) out[key] = type === "bool" ? el.checked : type === "num" ? Number(el.value) : el.value;
      }
      return out;
    };
    const preview = () => {
      kill();
      const el = m.querySelector("#ipPrev");
      if (!el || !cur || !cur.daily) return;
      const tmp = JSON.parse(JSON.stringify(cfg));
      for (const k in tmp.ind) tmp.ind[k].on = false;
      tmp.ind[sel] = { ...read(sel), on: true, hidden: false };
      if (["rsline", "mansfield"].includes(sel)) tmp.ind.rsline.bench = tmp.ind.rsline.bench || cfg.ind.rsline.bench;
      const token = {};
      m._tok = token;
      draw(false, { el, cfg: tmp, alive: () => m.isConnected && m._tok === token }).then((ch) => { if (ch && m.isConnected && m._tok === token) prev = ch; else if (ch) ch.remove(); });
    };
    const showK = (k) => {
      sel = k;
      m.querySelectorAll(".ip-row").forEach((r) => r.classList.toggle("on", r.dataset.k === k));
      const on = cfg.ind[k].on;
      m.querySelector("#ipR").innerHTML = `<h3>${esc(indLabel(k))}</h3><p class="muted small">${esc(indDesc(k))}</p>
        <div class="ip-prev"><small>Preview · ${esc(cur ? cur.row.symbol || cur.row.name : "")}</small><div id="ipPrev"></div></div>
        <form id="ipForm" class="f">${form(k)}</form>
        <div class="ip-f"><button class="btn" type="button" data-ip="reset" title="Back to the standard settings">Reset</button>
        ${on ? `<button class="btn" type="button" data-ip="remove">Remove</button>` : ""}<span></span>
        <button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" data-ip="apply">${on ? "Update" : "Add to chart"}</button></div>`;
      preview();
    };
    wireSwatches(m, () => preview());
    m.querySelector(".ind-q").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      m.querySelectorAll(".ip-row").forEach((r) => { r.hidden = !r.dataset.t.includes(q); });
    };
    m.addEventListener("change", (e) => { if (e.target.closest("#ipForm")) { if (e.target.name === "preset" && e.target.value) { const p = MA_PRESETS[e.target.value]; cfg.ind.ma = { ...cfg.ind.ma, preset: e.target.value, d: null, w: null }; m.querySelector("#ipForm").innerHTML = form("ma"); void p; } preview(); } });
    m.addEventListener("input", (e) => { if (e.target.closest("#ipForm") && e.target.type === "number") preview(); });
    m.addEventListener("click", (e) => {
      const r = e.target.closest(".ip-row"); if (r) return showK(r.dataset.k);
      const add = e.target.closest("[data-add]");
      if (add) { const tf = add.dataset.add, j = add.parentElement.querySelectorAll(".ma-row").length; add.insertAdjacentHTML("beforebegin", `<div class="ma-row"><select name="type"><option>SMA</option><option>EMA</option></select><input type="number" name="len" min="2" value="50">${swatch(`c_${tf}_${j}`, MA_COLORS[j % MA_COLORS.length])}<button class="btn sm" data-del type="button" aria-label="Remove">✕</button></div>`); return preview(); }
      const del = e.target.closest("[data-del]"); if (del) { del.closest(".ma-row").remove(); return preview(); }
      const a = e.target.closest("[data-ip]"); if (!a) return;
      if (a.dataset.ip === "reset") { cfg.ind[sel] = { ...JSON.parse(JSON.stringify(DEFAULTS.ind[sel])), on: cfg.ind[sel].on }; save(); return showK(sel); }
      if (a.dataset.ip === "remove") cfg.ind[sel] = { ...cfg.ind[sel], on: false, hidden: false };
      if (a.dataset.ip === "apply") { const nv = read(sel); if (sel === "ma") { const pr = m.querySelector("[name=preset]"); if (pr && pr.value) { nv.preset = pr.value; } } cfg.ind[sel] = { ...nv, on: true, hidden: false }; }
      save(); kill(); m.shut(); draw(true); renderTools();
    });
    const obs = new MutationObserver(() => { if (!m.isConnected) { kill(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    showK(sel);
  }

  /* chart settings: a drawer from the right, changes show at once */
  function settingsDrawer() {
    const mk = cfg.marks, ch = cfg.chips, sh = cfg.show;
    const tog = (name, label, on, small, sample) => `<label class="sd-row"><span><b>${label}</b>${small ? `<small>${small}</small>` : ""}</span>${sample ? `<i class="sd-smp">${sample}</i>` : ""}<input type="checkbox" class="sd-sw" name="${name}" ${on ? "checked" : ""}></label>`;
    const smp = { pivot: '<svg viewBox="0 0 40 14"><path d="M2 7h36" stroke="#2962ff" stroke-width="2"/></svg>', cup: '<svg viewBox="0 0 40 14"><path d="M2 3Q20 22 38 3" stroke="#2962ff" stroke-width="2" fill="none"/></svg>',
      vcp: '<svg viewBox="0 0 40 14"><path d="M2 3C8 12 12 12 16 6S24 9 28 8 34 6 38 6" stroke="#2962ff" stroke-width="1.6" fill="none"/></svg>', earn: '<b class="badge e">E</b>', act: '<b class="badge c">C</b>',
      hl: '<svg viewBox="0 0 40 14"><path d="M2 7h36" stroke="#089981" stroke-dasharray="3 2"/></svg>', sw: "▲▼" };
    const body = `<div class="seg sm sd-tabs" data-tab><button type="button" data-v="m" class="on">Markers</button><button type="button" data-v="d">Display</button></div>
      <form class="f" id="sdForm"><div class="sd-pane" data-p="m">
      <h4>Setups</h4>${tog("pivot", "Pivot / breakout line", mk.pivot, "top of the current base and its low", smp.pivot)}
      ${tog("cup", "Base (cup) curve", mk.cup !== false, "rounded line under the current base", smp.cup)}
      ${tog("vcp", "Contractions (VCP)", mk.vcp, "wave of the pullbacks with their depth %", smp.vcp)}
      ${tog("tight", "Tight areas", mk.tight, "5+ closes within 2 % of each other")}
      ${tog("inside", "Inside bars", mk.inside, "bar inside the previous bar's range")}
      <h4>Events</h4>${tog("earnings", "Results days", mk.earnings !== false, "quarterly results", smp.earn)}
      ${tog("actions", "Corporate actions", mk.actions, "split / bonus / rights / demerger", smp.act)}
      ${tog("circuit", "Circuit limits", mk.circuit, "today's price band")}
      <h4>Price levels</h4>${tog("hilo52", "52-week high & low", mk.hilo52, "dashed lines", smp.hl)}
      ${tog("swings", "Swing % moves", mk.swings, "", smp.sw)}<label class="f-row sd-sub">Swing size % <input type="number" name="swingPct" value="${mk.swingPct}"></label>
      </div><div class="sd-pane" data-p="d" hidden>
      <h4>Chart style</h4><div class="sd-styles">${Object.entries(STYLES).map(([k, s]) => `<label class="sd-style"><input type="radio" name="style" value="${k}" ${cfg.style === k ? "checked" : ""}>
        <span class="sd-c"><i style="background:${s.up}"></i><i style="background:${s.down}"></i><i style="background:${s.up}"></i></span>${s.label}</label>`).join("")}</div>
      ${tog("grid", "Grid lines", cfg.grid !== false)}
      <h4>Around the chart</h4>${tog("s_earn", "Earnings table", sh.earn !== false, "last 5 quarters under the chart")}
      ${tog("s_desc", "Company line", sh.desc !== false, "name, sector and industry")}${tog("s_due", "Next results date", sh.due !== false, "when the board meets for results")}
      <h4>Header chips</h4><div class="sd-pills">${[["c_float", "Float", ch.float], ["c_rs", "RS rating", ch.rs], ["c_stage", "Stage", ch.stage], ["c_theme", "Theme", ch.theme !== false], ["c_from", "From high", ch.from]]
        .map(([n, l, on]) => `<label class="sd-pill"><input type="checkbox" name="${n}" ${on ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
      </div></form>
      <div class="sd-foot"><button class="btn" type="button" data-sd="reset">Reset</button><span></span><button class="btn primary" type="button" data-x>Done</button></div>`;
    const m = modal("Chart settings", body, null, false, "drawer sd");
    const f = m.querySelector("#sdForm");
    const apply = () => {
      const e = f.elements;
      cfg.style = e.style.value;
      for (const k of ["inside", "actions", "circuit", "hilo52", "swings", "pivot", "vcp", "tight", "earnings", "cup"]) cfg.marks[k] = e[k].checked;
      cfg.marks.swingPct = Number(e.swingPct.value) || 10;
      cfg.grid = e.grid.checked;
      cfg.chips = { float: e.c_float.checked, rs: e.c_rs.checked, stage: e.c_stage.checked, from: e.c_from.checked, theme: e.c_theme.checked };
      const earnWas = cfg.show.earn !== false;
      cfg.show = { ...cfg.show, earn: e.s_earn.checked, desc: e.s_desc.checked, due: e.s_due.checked };
      save(); draw(true); renderTools();
      if (earnWas !== (cfg.show.earn !== false)) earningsTable();
    };
    f.addEventListener("change", apply);
    m.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab] button");
      if (t) { m.querySelectorAll("[data-tab] button").forEach((b) => b.classList.toggle("on", b === t)); m.querySelectorAll(".sd-pane").forEach((p) => { p.hidden = p.dataset.p !== t.dataset.v; }); }
      if (e.target.closest("[data-sd=reset]")) {
        cfg.style = DEFAULTS.style; cfg.marks = { ...DEFAULTS.marks }; cfg.chips = { ...DEFAULTS.chips }; cfg.show = { ...DEFAULTS.show }; cfg.grid = true;
        save(); m.shut(); draw(true); renderTools(); earningsTable(); settingsDrawer();
      }
    });
  }

  /* ------------------------------------------------------------------ drawings + pattern curves (SVG over the price pane) */
  const drawings = {
    tool: "cursor", color: store.get("sd-draw-color", "#2962ff"), chart: null, series: null, items: [], pending: null,
    key() { return `sd-draw:${cur && cur.row.id}:${cfg.tf}`; },
    attach(chart, series) {
      this.chart = chart; this.series = series; this.items = store.get(this.key(), []); this.pending = null;
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
      if (cur.pattern) series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
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
      if (this.tool === "hline") { this.items.push({ type: "hline", a: d, color: this.color }); this.persist(); return; }
      if (!this.pending) { this.pending = { type: this.tool, a: d, color: this.color }; return; }
      this.items.push({ type: this.pending.type, a: this.pending.a, b: d, color: this.pending.color });
      this.pending = null; this.persist();
    },
    paneIndex() { return cur && cur.price ? (cfg.ind.rsline.on && !cfg.ind.rsline.hidden && cfg.ind.rsline.pane === "above" ? 1 : 0) : 0; },
    persist() { store.set(this.key(), this.items); this.render(); },
    clear() { if (confirm("Delete every drawing on this chart?")) { this.items = []; this.persist(); } },
    xy(pt) {
      const x = this.chart.timeScale().timeToCoordinate(pt.time), y = this.series.priceToCoordinate(pt.price);
      return x == null || y == null ? null : [x, y + this.paneTop()];
    },
    paneTopOf(i) {   // a pane's top inside the chart box; null until the chart has painted its panes
      if (!this.chart || !cur) return null;
      const panes = this.chart.panes(), pane = panes[i], el = pane && pane.getHTMLElement();
      const wrap = cur.box.querySelector(".ch-wrap");
      if (el && wrap) return el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
      // not in the page yet: add up the heights of the panes above (1 px separators)
      try { let t = 0; for (let k = 0; k < i; k++) { const hh = panes[k].getHeight(); if (!hh) return null; t += hh + 1; } return i > 0 ? t : null; } catch (e) { return null; }
    },
    paneTop() { return this.paneTopOf(this.paneIndex()); },
    paneBox() {
      const pane = this.chart.panes()[this.paneIndex()], el = pane && pane.getHTMLElement();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      let sw = 60; try { sw = this.chart.priceScale("right").width(); } catch (e) { /* default */ }
      return { top: this.paneTop(), h: r.height, w: Math.max(0, r.width - sw) };
    },
    pattern(parts) {
      const P = cur.pattern;
      if (!P || !this.series) return;
      const range = Math.max(P.top - P.lo, P.top * 0.01), blue = "#2962ff";
      if (P.waves.length >= 2) {
        // wave under the base: peaks on one level, troughs as deep as each pullback (biggest = 30 % of the base height)
        const maxD = Math.max(...P.waves.map((w) => w.depth)), base = P.lo - range * 0.06;
        const pts = [];
        P.waves.forEach((w) => { pts.push([w.hiT, base, null]); pts.push([w.loT, base - (w.depth / maxD) * range * 0.3, w.depth]); });
        pts.push([P.endT, base, null]);
        const xy = pts.map(([t, p, d]) => { const q = this.xy({ time: t, price: p }); return q ? [q[0], q[1], d] : null; }).filter(Boolean);
        if (xy.length >= 3) {
          let d = `M${xy[0][0]},${xy[0][1]}`;
          for (let i = 0; i < xy.length - 1; i++) {      // Catmull-Rom -> cubic Bezier
            const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
            d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
          }
          parts.push(`<path d="${d}" stroke="${blue}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>`);
          xy.filter((q) => q[2] != null).forEach(([x, y, dep]) => {
            const t = `-${dep.toFixed(1)}%`, w = t.length * 6.4 + 10;
            parts.push(`<g><rect x="${x - w / 2}" y="${y + 6}" width="${w}" height="16" rx="8" fill="${blue}"/><text x="${x}" y="${y + 17.5}" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="600">${t}</text></g>`);
          });
          return;
        }
      }
      if (P.cup) {
        const lip = P.lo + range * 0.3;
        const a = this.xy({ time: P.startT, price: lip }), b = this.xy({ time: P.endT, price: lip }), m = this.xy({ time: P.loT, price: P.lo - range * 0.1 });
        if (a && b && m) parts.push(`<path d="M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${2 * m[1] - (a[1] + b[1]) / 2} ${b[0]},${b[1]}" stroke="${blue}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/>`);
      }
    },
    render() {
      if (!cur || !this.chart) return;
      const svg = cur.box.querySelector("#chSvg"), pat = cur.box.querySelector("#chPat");
      if (!svg) return;
      if (this.paneTop() == null) { requestAnimationFrame(() => this.render()); return; }     // not painted yet
      if (cur.onPaint) { const f = cur.onPaint; cur.onPaint = null; f(); }
      const vl = cur.box.querySelector("#chVol");
      if (vl && cur.volPane != null) { const t = this.paneTopOf(cur.volPane); if (t != null) vl.style.top = `${t + 4}px`; }
      const pb = this.paneBox();
      const clip = pb ? `<defs><clipPath id="chClip"><rect x="0" y="${pb.top}" width="${pb.w}" height="${pb.h}"/></clipPath></defs>` : "";
      if (pat) { const pp = []; this.pattern(pp); pat.innerHTML = clip + `<g clip-path="url(#chClip)">${pp.join("")}</g>`; }
      const parts = [];
      const all = [...this.items.map((x, i) => ({ ...x, i })), ...(this.pending && this.pending.hover ? [{ ...this.pending, b: this.pending.hover, i: -1 }] : [])];
      for (const it of all) {
        const a = this.xy(it.a);
        if (!a) continue;
        if (it.type === "text") { parts.push(`<g data-i="${it.i}"><text x="${a[0]}" y="${a[1]}" fill="${it.color}" font-size="12">${esc(it.text)}</text></g>`); continue; }
        if (it.type === "hline") {
          const w = pb ? pb.w : 2000;
          parts.push(`<g data-i="${it.i}"><line x1="0" y1="${a[1]}" x2="${w}" y2="${a[1]}" stroke="${it.color}" stroke-width="1.5"/><line x1="0" y1="${a[1]}" x2="${w}" y2="${a[1]}" stroke="transparent" stroke-width="10"/>
            <text x="${w - 4}" y="${a[1] - 4}" text-anchor="end" fill="${it.color}" font-size="11">${fmt(it.a.price)}</text></g>`);
          continue;
        }
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

  window.SDChart = { open, close, settings: () => cfg, _chart: () => cur && cur.chart, _cur: () => cur, _drawings: drawings, loadLib, modal };
})();
