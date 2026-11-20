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
    contrast: { label: "Contrast", up: "#2962ff", down: "#ff9800" }, mono: { label: "Mono", up: "#a3a9b3", down: "#1f2430", dup: "#c9d0db", ddn: "#5b6577" },
  };
  const MA_PRESETS = {
    minervini: { label: "Minervini", d: [["EMA", 10], ["EMA", 21], ["SMA", 50], ["SMA", 150], ["SMA", 200]], w: [["SMA", 10], ["SMA", 30]] },
    weinstein: { label: "Weinstein", d: [["SMA", 50], ["SMA", 150]], w: [["SMA", 10], ["SMA", 30]] },
    qullamaggie: { label: "Qullamaggie", d: [["EMA", 10], ["EMA", 20], ["SMA", 50]], w: [["SMA", 10], ["SMA", 20]] },
    oneil: { label: "O'Neil", d: [["EMA", 21], ["SMA", 50], ["SMA", 200]], w: [["SMA", 10], ["SMA", 40]] },
    mine: { label: "My preset", d: [["SMA", 20], ["SMA", 200]], w: [["SMA", 10], ["SMA", 20]] },
  };
  // like the reference's legend: EMA 10 orange, EMA 21 light blue, SMA 50 navy, SMA 150 violet, SMA 200 dark (13-Nov-2026)
  const MA_COLORS = ["#f0a35e", "#5b9bd5", "#2b3f6c", "#a06fd0", "#3a3f4b", "#795548"];
  const BENCH = { NIFTY_50: "Nifty 50", NIFTY_500: "Nifty 500", NIFTY_MIDCAP_150: "Nifty Midcap 150", NIFTY_SMALLCAP_250: "Nifty Smallcap 250",
    NIFTY_MIDSMALLCAP_400: "Nifty Midsmallcap 400", SECTOR: "Sector index" };
  /* "Sector index" = the NSE index closest to the stock's NSE sector (our own pairing, 20-Nov-2026); Nifty 500 when none fits */
  const SECTOR_INDEX = { "Capital Goods": "NIFTY_INDIA_MANUFACTURING", "Financial Services": "NIFTY_FINANCIAL_SERVICES", Chemicals: "NIFTY_CHEMICALS",
    Healthcare: "NIFTY_HEALTHCARE_INDEX", "Fast Moving Consumer Goods": "NIFTY_FMCG", "Consumer Durables": "NIFTY_CONSUMER_DURABLES",
    Services: "NIFTY_SERVICES_SECTOR", "Information Technology": "NIFTY_IT", "Consumer Services": "NIFTY_INDIA_CONSUMPTION",
    "Automobile and Auto Components": "NIFTY_AUTO", Realty: "NIFTY_REALTY", Construction: "NIFTY_INFRASTRUCTURE", "Metals & Mining": "NIFTY_METAL",
    "Media, Entertainment & Publication": "NIFTY_MEDIA", "Oil, Gas & Consumable Fuels": "NIFTY_OIL___GAS", "Construction Materials": "NIFTY_CEMENT",
    Power: "NIFTY_ENERGY", Utilities: "NIFTY_ENERGY", Telecommunication: "NIFTY_MIDSMALL_IT___TELECOM", "Forest Materials": "NIFTY_COMMODITIES" };
  const benchId = (b, row) => (b === "SECTOR" ? SECTOR_INDEX[(row && row.sector) || ""] || "NIFTY_500" : b || "NIFTY_500");
  const STAGE_TXT = { 1: "Basing", "2A": "Early uptrend", 2: "Uptrend", 3: "Topping", 4: "Downtrend", "4A": "Improving" };
  const STAGE_COL = { 1: "#9e9e9e", "2A": "#66bb6a", 2: "#089981", 3: "#ff9800", 4: "#f23645", "4A": "#ef9a9a" };

  /* ------------------------------------------------------------------ settings (with defaults) */
  const DEFAULTS = {
    style: "mono", type: "candle", tf: "D", tfFav: ["D", "W"], tfCustom: [], look: 2,
    marks: { hilo52: false, swings: false, swingPct: 10, circuit: false, inside: false, actions: true, pivot: false, vcp: false, cup: false, tight: false, earnings: true, news: true },
    show: { earn: true, earnOpen: true, desc: true, due: true }, grid: false,
    chips: { float: true, rs: true, stage: true, from: true, theme: true },
    // indicator settings and colours as in the reference's indicator pages (Viraj's videos of 12-Nov-2026, built 20-Nov-2026)
    ind: {
      ma: { on: true, preset: "minervini", d: null, w: null },
      supertrend: { on: false, len: 10, mult: 3, up: "#5cb85c", down: "#e05252" },
      bb: { on: false, len: 20, std: 2, mid: "#f0a35e", color: "#4a90d9", fill: true },
      swing: { on: false, fast: 8, slow: 14, vf: 0.65 },
      watermark: { on: false, symbol: true, name: true, mcap: false, sector: true, pos: "middle", size: "M", color: "#a8adb5" },
      volume: { on: true, pane: "below", bar: "#b9bdc4", avg: false, avgColor: "#5f6368", colorHigh: true, up: "#5cb85c", down: "#e5534b",
        x: "1", pp: true, ppColor: "#4a9fe0", dryColor: "#f0a030", labels: true },
      rsline: { on: false, bench: "NIFTY_500", pane: "above", color: "#2b2f36", dot: true, dotColor: "#2f7fe0" },
      mansfield: { on: false, bench: "NIFTY_500", len: 52, color: "#2b2f36", bg: true },
      stage: { on: false, strength: "medium" },
      rsi: { on: false, pane: "below", len: 14, color: "#9b51e0", ob: 70, os: 30, shade: true },
      macd: { on: false, pane: "below", fast: 12, slow: 26, sig: 9, color: "#2b2f36", sigColor: "#a0a5ad" },
      mfi: { on: false, pane: "below", len: 14, color: "#d6458b", ob: 80, os: 20, shade: true },
      relext: { on: false, pane: "below", type: "SMA", ma: 50, lookback: 250, ob: 70, os: 70, color: "#1a64b8", shade: true },
      atr: { on: false, pane: "below", len: 14, color: "#f0a35e" },
      adr: { on: false, pane: "below", len: 20, color: "#4a90d9" },
      ti: { on: false, pane: "below", fast: 7, slow: 65, up: 105, dn: 95, shade: false, color: "#1a64b8" },
    },
  };
  const merge = (a, b) => { const o = Array.isArray(a) ? [...a] : { ...a }; for (const k in b || {}) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] ? merge(a[k], b[k]) : b[k]; return o; };
  let cfg = merge(DEFAULTS, store.get(KEY, {}));
  // one-time switch to the reference look (13-Nov-2026, Viraj): mono candles, no grid, Minervini averages;
  // anything can be changed back in Chart settings afterwards
  if ((cfg.look || 0) < 2) { cfg.look = 2; cfg.style = "mono"; cfg.grid = false; if (cfg.ind && cfg.ind.ma && !cfg.ind.ma.d) cfg.ind.ma.preset = "minervini"; store.set(KEY, cfg); }
  // one-time switch to the reference's indicator settings and colours (20-Nov-2026): which indicators are on and the own
  // moving averages are kept, everything else takes the new standard values
  if (cfg.look < 3) {
    cfg.look = 3;
    for (const k in DEFAULTS.ind) {
      const o = cfg.ind[k] || {};
      cfg.ind[k] = { ...JSON.parse(JSON.stringify(DEFAULTS.ind[k])), on: !!o.on, hidden: !!o.hidden, ...(k === "ma" ? { preset: o.preset, d: o.d, w: o.w } : {}) };
    }
    store.set(KEY, cfg);
  }
  // one-time (20-Nov-2026, Viraj's scan videos): the general pivot / VCP / cup marks are off like the reference's
  // "Pivot / breakout line" setting; a scanner draws its own pattern. They can be switched on again in Chart settings.
  if (cfg.look < 4) { cfg.look = 4; cfg.marks.pivot = false; cfg.marks.vcp = false; cfg.marks.cup = false; store.set(KEY, cfg); }
  const save = () => store.set(KEY, cfg);

  /* indicator list: the reference's groups, order and names (20-Nov-2026); descriptions in our own words */
  const IND_MENU = [
    ["On the price", [["ma", "Moving averages", "Lines that average the closing price over a number of bars. A stock holding above rising averages is in good health."],
      ["supertrend", "Supertrend", "A stop line kept a few ATRs away from the price: green below it in an uptrend, red above it in a downtrend. A close through the line flips it."],
      ["bb", "Bollinger Bands", "A 20-day average with bands two standard deviations above and below. Bands squeezing together mean the stock has gone quiet, often before a big move."],
      ["swing", "Swing Bands", "The space between two smooth T3 averages (8 and 14 bars), green while the fast one is on top and red while it is below."],
      ["watermark", "Watermark", "The stock's symbol, company and sector written faintly across the chart."]]],
    ["Volume and strength", [["volume", "Volume", "Shares traded each day. Big bars on breakout days show real demand."],
      ["rsline", "RS line", "The stock's price divided by an index. A rising line means the stock is beating the market."],
      ["mansfield", "Mansfield RS", "The RS line against its own 52-bar average, in %. Above 0 the stock is beating the index by more than usual. Background: green above a rising average, blue below a rising one, grey above a falling one, red below a falling one."]]],
    ["Trend", [["stage", "Stage Analysis", "A strip under the chart coloured bar by bar by the trend stage: green in an uptrend (lighter at the start), amber while basing or topping, red in a downtrend."]]],
    ["Oscillators", [["rsi", "RSI", "How strong recent moves are, on a 0 to 100 scale. Over 70 is stretched, under 30 is weak."],
      ["macd", "MACD", "The 12-bar average minus the 26-bar average, with a 9-bar signal line. The bars show the gap: blue above zero, pink below, solid while it grows and faint while it shrinks."],
      ["mfi", "Money Flow Index", "Like RSI, but weighted by volume: money flowing in on up days against out on down days, 0 to 100. Over 80 is stretched, under 20 is weak."],
      ["relext", "Relative Extension", "How far the price is from its 50-day average, against its biggest stretches of the last 250 days: +100 as far above as it has been, -100 as far below, 0 on the average."],
      ["atr", "ATR", "Average true range: how many rupees the stock usually moves in a day. Handy for setting a stop-loss distance."],
      ["adr", "ADR %", "Average daily range: how much the stock usually moves in a day, as a % of its price."],
      ["ti", "Trend Intensity", "The 7-day average divided by the 65-day average, times 100. Over 100 the trend is up; over 105 it is strong, under 95 strongly down."]]],
  ];
  const PANE_INDS = ["rsline", "rsi", "macd", "mfi", "relext", "atr", "adr", "ti"];   // can sit above or below the price
  const STAGE_KEY = [["1", "Stage 1", "Basing", "#f2c94c"], ["2A", "Stage 2A", "Early uptrend", "#a5dc6a"], ["2", "Stage 2", "Uptrend", "#6cc24a"],
    ["3", "Stage 3", "Topping", "#f0b34a"], ["4", "Stage 4", "Downtrend", "#e0475f"], ["4A", "Stage 4A", "Improving", "#ec7088"]];
  const STAGE_ALPHA = { light: 0.28, medium: 0.5, strong: 0.85 };

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
  /** lines drawn over the candles (MA, BB, Supertrend, Swing bands) are thin and see-through so the candles stay clear
      (Viraj 18-Nov-2026, like the reference); the legend keeps the full colour */
  const soft = (c, a = 0.55) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return c;
    const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
  };
  const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? "–" : Number(x).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
  /* moving-average presets; "My preset" is what "Save current look as my default" stored in this browser */
  const maPreset = (k) => (k === "mine" && store.get("sd-ma-mine", null)) || MA_PRESETS[k] || MA_PRESETS.minervini;
  const maRow = (m, k) => {
    const [type, len, color, on] = Array.isArray(m) ? m : [m.type, m.len, m.color, m.on];
    return { type: type === "EMA" ? "EMA" : "SMA", len: Number(len), color: color || MA_COLORS[k % MA_COLORS.length], on: on !== false };
  };

  /* shaded areas (Bollinger fill, swing ribbon, oscillator zones) drawn in an SVG over the chart; redrawn on scroll, zoom,
     resize and pane drag. spec: {pane, series, kind: band (a[], b[], color(i)) | hband (a, b, color) | above / below (a, color)} */
  function fillLayer(chart, host, specs) {
    if (!specs.length) return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ch-fill");
    host.appendChild(svg);
    const uid = Math.random().toString(36).slice(2, 8);      // clip ids must be unique on the page (chart + preview)
    let raf = 0;
    const render = () => {
      raf = 0;
      if (!svg.isConnected) return;
      const hr = host.getBoundingClientRect(), ts = chart.timeScale(), r = ts.getVisibleLogicalRange(), ps = chart.panes();
      // width of the plot area: paneSize (the time scale reports 0 when it is hidden, as in the preview)
      const w = (chart.paneSize && chart.paneSize(0).width) || ts.width();
      if (!r || !w) return;
      let defs = "", body = "";
      specs.forEach((f, n) => {
        const pe = ps[f.pane] && ps[f.pane].getHTMLElement();
        if (!pe) return;
        const pr = pe.getBoundingClientRect(), ox = pr.left - hr.left, oy = pr.top - hr.top, ph = pr.height;
        const Y = (val) => { const y = f.series.priceToCoordinate(val); return y == null ? null : oy + y; };
        defs += `<clipPath id="cf${uid}${n}"><rect x="${ox}" y="${oy}" width="${w}" height="${ph}"/></clipPath>`;
        if (f.kind === "cols") {
          const i0 = Math.max(0, Math.floor(r.from) - 1), i1 = Math.min(f.cols.length - 1, Math.ceil(r.to) + 1);
          const x0 = ts.logicalToCoordinate(i0), x1 = ts.logicalToCoordinate(i0 + 1);
          const half = x0 != null && x1 != null ? Math.abs(x1 - x0) / 2 : 2;
          let k = i0;
          while (k <= i1) {
            const cc = f.cols[k];
            let j = k; while (j + 1 <= i1 && f.cols[j + 1] === cc) j++;
            const a = ts.logicalToCoordinate(k), b = ts.logicalToCoordinate(j);
            if (cc && a != null && b != null) body += `<rect clip-path="url(#cf${uid}${n})" x="${(ox + a - half).toFixed(1)}" y="${oy}" width="${(b - a + 2 * half).toFixed(1)}" height="${ph}" fill="${cc}"/>`;
            k = j + 1;
          }
          return;
        }
        if (f.kind !== "band") {
          const ya = Y(f.a), yb = f.kind === "hband" ? Y(f.b) : f.kind === "above" ? oy : oy + ph;
          if (ya == null || yb == null) return;
          body += `<rect clip-path="url(#cf${uid}${n})" x="${ox}" y="${Math.min(ya, yb).toFixed(1)}" width="${w}" height="${Math.abs(yb - ya).toFixed(1)}" fill="${f.color}"/>`;
          return;
        }
        // a band between two series, split where a value is missing or the colour changes
        const i0 = Math.max(0, Math.floor(r.from) - 1), i1 = Math.min(f.a.length - 1, Math.ceil(r.to) + 1);
        let seg = [], col = null;
        const flush = () => {
          if (seg.length > 1) body += `<polygon clip-path="url(#cf${uid}${n})" fill="${col}" points="${seg.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ")} ${seg.slice().reverse().map((q) => `${q[0].toFixed(1)},${q[2].toFixed(1)}`).join(" ")}"/>`;
          seg = [];
        };
        for (let i = i0; i <= i1; i++) {
          const a = f.a[i], b = f.b[i];
          const x = a == null || b == null || Number.isNaN(a) || Number.isNaN(b) ? null : ts.logicalToCoordinate(i);
          const ya = x == null ? null : Y(a), yb = x == null ? null : Y(b);
          if (x == null || ya == null || yb == null) { flush(); continue; }
          const cc = f.color(i);
          if (seg.length && cc !== col) { const last = seg[seg.length - 1]; flush(); seg.push(last); }
          col = cc; seg.push([ox + x, ya, yb]);
        }
        flush();
      });
      svg.innerHTML = `<defs>${defs}</defs>${body}`;
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(render); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(later);
    chart.timeScale().subscribeSizeChange(later);
    // a price-axis drag or wheel zoom changes the price scale without a range event: redraw on those (not on every mouse move)
    host.addEventListener("pointermove", (e) => { if (e.buttons) later(); }, { passive: true });
    host.addEventListener("wheel", later, { passive: true });
    host.addEventListener("pointerup", () => setTimeout(later, 20));
    later(); setTimeout(render, 90); setTimeout(render, 450);
    return render;
  }

  /* ------------------------------------------------------------------ scanner drawings
     What the reference draws when a stock is opened from a scanner (Viraj's videos of 12-Nov-2026), from the same screen
     fields that put the stock in the scan, so the drawing always matches the scan:
       stage2-breakout  "Pivot" line across the chart at the breakout level (highest high of the 50 sessions before it)
       recent-breakout  line from the old resistance (swing high) to the breakout day
       daily-base / weekly-base  base level from its swing high to today (tick at the end) + a shallow arc under the base
       near-pivot       base level line with the end tick, no arc
       vcp              pivot line from the base high + a wave under the price with the three pullbacks (-%)
       tight-range      top and bottom of the tight sessions
       ipo-base         IPO base level from its day to today
       big-reversal     arrow under the reversal day        shakeout  a "U" under the shakeout day
     Every other scanner draws nothing (also the reference). Indexes are on the daily bars; on weekly / other charts the
     drawing is placed on the bar that holds that day. */
  const SCAN_BLUE = "#2f5bd3";
  function scanDrawing(scan, r, D, bars) {
    if (!scan || !r || !D || D.length < 3) return null;
    const n = D.length, num = (k) => (r[k] == null || r[k] === "" || Number.isNaN(Number(r[k])) ? null : Number(r[k]));
    const H = D.map((b) => b.high), Lw = D.map((b) => b.low);
    const T = (i) => D[Math.max(0, Math.min(n - 1, i))].time;
    const out = { lines: [] };
    const seg = (i1, i2, p, tick) => { if (i1 >= 0 && i1 <= i2 && p > 0) out.lines.push({ t1: T(i1), t2: T(i2), p, tick }); };
    // the base's arc: from a little after the base high to today, just under the base's lowest low (reference pictures)
    const baseArc = (j) => { let lo = Infinity; for (let k = j + 1; k < n; k++) lo = Math.min(lo, Lw[k]); return { t1: T(j + Math.round((n - 1 - j) * 0.08)), t2: T(n - 1), lo }; };
    if (scan === "stage2-breakout") {
      const age = num("s2b_age"); if (age == null) return null;
      const b = n - 1 - age; if (b < 2) return null;
      let lv = -Infinity; for (let k = Math.max(0, b - 50); k < b; k++) lv = Math.max(lv, H[k]);
      out.pivot = lv;
      return out;
    }
    if (scan === "recent-breakout") {
      const age = num("rb_age"), lv = num("rb_level"); if (age == null || !lv) return null;
      const b = n - 1 - age;
      let j = -1; for (let k = b - 1; k >= Math.max(0, b - 400); k--) if (Math.abs(H[k] - lv) <= lv * 1e-6) { j = k; break; }
      if (j < 0) return null;
      seg(j, Math.min(n - 1, b + 1), lv, false);
      return out;
    }
    if (scan === "daily-base" || scan === "near-pivot") {
      const age = num("lvl_age"), lv = num("lvl_price"); if (age == null || !lv) return null;
      const j = n - 1 - age;
      seg(j, n - 1, lv, true);
      if (scan === "daily-base") out.arc = baseArc(j);
      return out;
    }
    if (scan === "weekly-base") {
      const age = num("wlvl_age"), lv = num("wlvl_price"); if (age == null || !lv) return null;
      const W = S.toPeriod(D, "W", 1), w = W.length - 1 - age; if (w < 0) return null;
      const w0 = W[w].time, w1 = W[w + 1] ? W[w + 1].time : "9999";
      let j = -1; for (let k = 0; k < n; k++) if (D[k].time >= w0 && D[k].time < w1 && (j < 0 || H[k] > H[j])) j = k;
      if (j < 0) return null;
      seg(j, n - 1, lv, true);
      out.arc = baseArc(j);
      return out;
    }
    if (scan === "ipo-base") {
      const bb = num("ipo_base_bars"), lv = num("ipo_lvl"); if (bb == null || !lv) return null;
      seg(n - 1 - bb, n - 1, lv, true);
      return out;
    }
    if (scan === "vcp") {
      const age = num("vcp_age"), bb = num("vcp_base_bars"), pv = num("vcp_pivot"); if (age == null || bb == null || !pv) return null;
      const e = n - 1 - age, p = e - bb + 1;
      seg(p, n - 1, pv, false);
      const legs = I.vcpLegs(H, Lw, p, e);
      if (legs) {
        const dep = [num("vcp_depth1"), num("vcp_depth2"), num("vcp_depth3")];
        let lo = Infinity; for (let k = p; k < n; k++) lo = Math.min(lo, Lw[k]);
        out.wave = { top: pv, lo, endT: T(n - 1), legs: legs.map((g, k) => ({ hiT: T(g.hi), loT: T(g.lo), depth: dep[k] != null ? dep[k] : g.depth })) };
      }
      return out;
    }
    if (scan === "tight-range") {
      // the quiet run (rti mode, 3+ sessions) when it qualified, else the tight box (box mode) - the scan's two modes
      const rb = num("rti_bars"), nb = rb >= 3 ? rb : num("box_bars"); if (!nb || nb < 2) return null;
      const a = Math.max(0, n - nb);
      let hi = -Infinity, lo = Infinity; for (let k = a; k < n; k++) { hi = Math.max(hi, H[k]); lo = Math.min(lo, Lw[k]); }
      seg(a, n - 1, hi, false); seg(a, n - 1, lo, false);
      return out;
    }
    if (scan === "big-reversal") {
      const age = num("br_age"); if (age == null) return null;
      const b = n - 1 - age; if (b < 0) return null;
      out.arrow = { t: T(b), p: Lw[b] };
      return out;
    }
    if (scan === "shakeout") {
      const age = num("so_age"); if (age == null) return null;
      // the shakeout day = the biggest intraday drop from the close before, in the 2 sessions up to the recovery
      // (equals the reference's fall_date on 30 of 32 stocks, 02-06 Nov 2026; the lowest low: 28 of 32)
      const C = D.map((b) => b.close), rec = n - 1 - age;
      let k = rec, best = -Infinity;
      for (let q = Math.max(1, rec - 2); q <= rec; q++) { const dr = (C[q - 1] - Lw[q]) / C[q - 1]; if (dr > best) { best = dr; k = q; } }
      out.cup = { t: T(k), p: Lw[k], t1: T(k - 1), t2: T(k + 1) };
      return out;
    }
    void bars;
    return null;
  }

  /* pane titles like the reference ("RSI 14 46.9", eye / settings / remove on hover); the value follows the crosshair */
  function paneLabels(chart, host, specs, pricePane) {
    const box = document.createElement("div");
    box.className = "ch-pl";
    host.appendChild(box);
    box.innerHTML = specs.map((s, n) => `<span class="lg pl" data-k="${s.k}" data-n="${n}"><span class="pl-n">${s.name}</span><b class="pl-v" style="color:${s.color}"></b><span class="pl-x"></span>`
      + `<span class="lg-b"><button type="button" data-lg="eye" title="Hide">${ic("eye")}</button><button type="button" data-lg="gear" title="Settings">${ic("gear")}</button><button type="button" data-lg="x" title="Remove">${ic("x")}</button></span></span>`).join("");
    box.onclick = legendClick;
    const at = (i) => specs.forEach((s, n) => {
      const el = box.children[n]; if (!el) return;
      const x = s.vals[i];
      el.querySelector(".pl-v").innerHTML = s.html ? s.html(x) : x == null || Number.isNaN(x) ? "" : s.f(x);
      el.querySelector(".pl-x").innerHTML = (s.more ? s.more(i) : "") + (s.badge ? s.badge(x) : "");
    });
    const place = () => {
      if (!box.isConnected) return;
      const hr = host.getBoundingClientRect(), ps = chart.panes();
      specs.forEach((s, n) => {
        const pe = ps[s.pane] && ps[s.pane].getHTMLElement(), el = box.children[n];
        if (!pe || !el) return;
        const pr = pe.getBoundingClientRect();
        el.style.left = `${pr.left - hr.left + 4}px`; el.style.top = `${pr.top - hr.top + 2}px`;
      });
      // the price legend sits at the top of the price pane (also when panes are above it)
      const lgBox = cur && cur.box.querySelector("#chLegend"), pp = ps[pricePane] && ps[pricePane].getHTMLElement();
      if (lgBox && pp) lgBox.style.top = `${pp.getBoundingClientRect().top - cur.box.querySelector(".ch-wrap").getBoundingClientRect().top + 4}px`;
    };
    const n = specs.length ? specs[0].vals.length - 1 : 0;
    at(n); place();
    requestAnimationFrame(() => requestAnimationFrame(place)); setTimeout(place, 120); setTimeout(place, 600);
    chart.timeScale().subscribeSizeChange(place);
    return { at, place };
  }

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

  /* one-line company descriptions in our own words (data/meta/company_about.csv -> data/about.json, Viraj 12-Nov-2026) */
  let ABOUT = {}, aboutP = null;
  async function open(box, row, opts = {}) {
    close();
    if (!aboutP) aboutP = fetch("data/about.json").then((x) => (x.ok ? x.json() : {})).catch(() => ({})).then((j) => { ABOUT = j || {}; return ABOUT; });
    await aboutP;
    box.innerHTML = `<div class="ch-top" id="chTools"></div><div class="ch-head" id="chHead"></div>
      <div class="ch-wrap"><div class="legend" id="chLegend"></div><div class="ch-canvas" id="chCanvas"><i class="skel ch-skel"></i></div>
      <svg class="ch-pat" id="chPat"></svg><svg class="ch-svg" id="chSvg"></svg><div class="ch-dbar" id="chDraw"></div>
      <div class="ch-vol muted" id="chVol"></div><div class="ch-news" id="chNews" hidden></div><button class="ch-end" id="chEnd" type="button" title="Back to the latest bar" hidden>${ic("end")}</button></div>
      <div class="ch-earn" id="chEarn"></div><div class="ch-note muted" id="chNote"></div>`;
    cur = { box, row, opts, kind: opts.kind || "s" };
    renderTools();
    renderDrawBar();
    let data;
    try {
      let news;
      [data, , news] = await Promise.all([getChartFile(cur.kind, row.id), loadLib(),
        cur.kind === "s" ? fetch(`data/a/${encodeURIComponent(row.symbol || row.id)}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => []) : []]);
      cur.news = Array.isArray(news) ? news : [];
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
    // timeframe (15-Nov-2026): D / W or a custom n days / weeks / months / years built from the daily bars; intraday
    // timeframes need intraday data, which this site does not have (end-of-day data), so they fall back to daily
    const TF = S.tfParse(C.tf), intraday = TF.u === "m" || TF.u === "h";
    const weekly = !intraday && TF.u !== "D";                 // weekly-style settings (MA set, pivots, 52 bars) for W / M / Y bars
    const bars = intraday ? cur.daily : S.toPeriod(cur.daily, TF.u, TF.n);
    if (!pv) cur.bars = bars;
    const times = bars.map((b) => b.time), o = bars.map((b) => b.open), h = bars.map((b) => b.high), l = bars.map((b) => b.low),
      c = bars.map((b) => b.close), v = bars.map((b) => b.volume || 0);
    const st0 = STYLES[C.style] || STYLES.classic, darkUi = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    const st = st0.dup && darkUi ? { ...st0, up: st0.dup, down: st0.ddn } : st0;      // mono: lighter shades on a dark page
    const ind = C.ind;
    const show = (k) => ind[k] && ind[k].on && !ind[k].hidden;
    const only = !!(pv && pv.only);          // preview of a pane indicator: only that pane, no candles
    const panes = [];       // names in order below the price
    const chart = L.createChart(canvas, {
      autoSize: true,
      layout: { background: { color: css("--panel") }, textColor: css("--muted"), fontSize: 11, fontFamily: css("--font") || undefined, attributionLogo: false,
        panes: { separatorColor: css("--line"), separatorHoverColor: css("--accent-soft"), enableResize: true } },
      grid: { vertLines: { color: css("--line") + (C.grid === false || pv ? "00" : "") }, horzLines: { color: css("--line") + (C.grid === false || pv ? "00" : "") } },
      rightPriceScale: { borderColor: css("--line"), visible: !pv }, timeScale: { borderColor: css("--line"), rightOffset: pv ? 1 : 5, visible: !pv },
      crosshair: { mode: 0, vertLine: { style: 3, labelBackgroundColor: css("--text"), visible: !pv }, horzLine: { style: 3, labelBackgroundColor: css("--text"), visible: !pv } },
      handleScroll: !pv, handleScale: !pv,
      kineticScroll: { mouse: !pv, touch: !pv },          // the chart glides on after a drag (smooth, Viraj 20-Nov-2026)
    });
    if (!pv) cur.chart = chart;
    if (!pv && !keepRange) { canvas.classList.remove("ch-in"); void canvas.offsetWidth; canvas.classList.add("ch-in"); }   // soft fade-in of a new stock
    const alive = () => (pv ? pv.alive() : cur && cur.chart === chart);
    const line = (data, color, pane, extra = {}) => {
      const s = chart.addSeries(L.LineSeries, { color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }, pane);
      s.setData(data); return s;
    };
    const pts = (arr, from = 0) => arr.map((x, i) => (i >= from && x != null && !Number.isNaN(x) ? { time: times[i], value: x } : { time: times[i] }));
    const fills = [];        // shaded areas drawn in an SVG layer over the chart (bands, zones): see fillLayer
    const labels = [];       // pane titles with the value under the crosshair (pane indicators)
    let bench = null;
    const rsBench = benchId(ind.rsline.bench, cur.row), mBench = benchId(ind.mansfield.bench || ind.rsline.bench, cur.row);
    if (show("rsline")) bench = await benchCandles(rsBench);
    const mbench = show("mansfield") ? (mBench === rsBench && bench ? bench : await benchCandles(mBench)) : null;
    if (!alive()) return null;
    const toBars = (b) => (b ? (intraday ? b : S.toPeriod(b.filter((x) => x.time >= cur.daily[0].time), TF.u, TF.n)) : null);
    const rs = bench ? I.rsLine(bars, toBars(bench)) : null;
    const rsM = mbench ? I.rsLine(bars, toBars(mbench)) : null;
    // panes: indicators set to "Pane above" sit over the price (in list order), the rest below it
    const above = only ? [] : PANE_INDS.filter((k) => show(k) && ind[k].pane === "above" && (k !== "rsline" || rs));
    const pricePane = above.length;
    let paneNo = pricePane;
    const nextPane = (name) => { panes.push(name); return ++paneNo; };
    const paneOf = (k, name) => (only ? 0 : above.includes(k) ? above.indexOf(k) : nextPane(name));
    // price
    const inrFmt = { type: "custom", formatter: (x) => fmt(x, 2), minMove: 0.01 };
    const priceOpts = { upColor: st.up, downColor: st.down, wickUpColor: st.up, wickDownColor: st.down, borderVisible: false, thinBars: false, priceFormat: inrFmt, visible: !only, priceLineVisible: !pv, lastValueVisible: !pv, ...(only ? { priceScaleId: "px" } : {}) };
    const price = C.type === "bar" ? chart.addSeries(L.BarSeries, { upColor: st.up, downColor: st.down, priceFormat: inrFmt, visible: !only, priceLineVisible: !pv, lastValueVisible: !pv, ...(only ? { priceScaleId: "px" } : {}) }, pricePane)
      : chart.addSeries(L.CandlestickSeries, priceOpts, pricePane);
    price.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    if (!pv) cur.price = price;
    const legend = [];     // {k, html} - k null = plain text (no controls)
    const lg = (k, html) => legend.push({ k, html });
    const prm = (s, col) => `<b style="color:${col}">${s}</b>`;            // legend: grey name, coloured settings
    // moving averages (each line can be switched off with its tick box)
    if (show("ma") && !only) {
      const lines = (weekly ? ind.ma.w : ind.ma.d) || maPreset(ind.ma.preset)[weekly ? "w" : "d"];
      const names = [];
      lines.forEach((m, k) => {
        const x = maRow(m, k);
        if (!x.on || !(x.len >= 2)) return;
        const vals = x.type === "EMA" ? I.ema(c, x.len) : I.sma(c, x.len);
        line(pts(vals), soft(x.color), pricePane, { lineWidth: 1, lastValueVisible: !pv, title: "" });
        names.push(`<b style="color:${x.color}">${x.type} ${x.len}${C.tf === "D" || intraday ? "" : C.tf === "W" ? "W" : " · " + esc(C.tf)}</b>`);
      });
      if (names.length) lg("ma", `<em>MA</em> ${names.join(" ")}`);
    }
    if (show("bb") && !only) {
      const b = I.bollinger(c, ind.bb.len, ind.bb.std);
      const bc = soft(ind.bb.color, 0.8);
      const up = line(pts(b.up), bc, pricePane, { lineWidth: 1 }); line(pts(b.lo), bc, pricePane, { lineWidth: 1 });
      line(pts(b.mid), soft(ind.bb.mid, 0.85), pricePane, { lineWidth: 1 });
      if (ind.bb.fill) fills.push({ pane: pricePane, series: up, kind: "band", a: b.up, b: b.lo, color: () => soft(ind.bb.color, 0.09) });
      lg("bb", `<em>BB</em> ${prm(`${ind.bb.len} ${ind.bb.std}`, ind.bb.color)}`);
    }
    if (show("supertrend") && !only) {
      // green under the price, red over it, and no joining stroke where the trend flips (like the reference); one line whose
      // segment into a flip bar is see-through (the chart library would bridge gaps between two separate lines)
      const s = I.supertrend(h, l, c, ind.supertrend.len, ind.supertrend.mult);
      const upC = soft(ind.supertrend.up, 0.9), dnC = soft(ind.supertrend.down, 0.9);
      line(s.line.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: x,
        color: i > 0 && s.dir[i - 1] === s.dir[i] ? (s.dir[i] === 1 ? upC : dnC) : "rgba(0,0,0,0)" })), upC, pricePane, { lineWidth: 1.5 });
      lg("supertrend", `<em>Supertrend</em> ${prm(`${ind.supertrend.len} ${ind.supertrend.mult}`, ind.supertrend.up)}`);
    }
    if (show("swing") && !only) {
      // the shaded gap between the two T3 averages: green while the fast one is on top, red while it is below
      const f = I.t3(c, ind.swing.fast, ind.swing.vf), s = I.t3(c, ind.swing.slow, ind.swing.vf);
      const anchor = line(pts(f), "rgba(0,0,0,0)", pricePane, { lineWidth: 1, autoscaleInfoProvider: undefined });
      fills.push({ pane: pricePane, series: anchor, kind: "band", a: f, b: s, color: (i) => (f[i] >= s[i] ? "rgba(76, 175, 80, 0.24)" : "rgba(239, 83, 80, 0.22)") });
      lg("swing", `<em>Swing Bands</em> ${prm(`${ind.swing.fast} ${ind.swing.slow}`, "#4caf50")}`);
    }
    // markers on the price
    const marks = [];
    // results days, corporate actions and company filings: one row of small round badges at the bottom of the price pane
    // (like the reference), a count bubble when a day has several filings; hover a bar for the details card
    if (!pv) { cur.newsAt = new Map(); cur.evs = new Map(); }
    if (!pv) {
      const add = (t, c, n) => { if (!cur.evs.has(t)) cur.evs.set(t, { cats: [], n: 0 }); const e = cur.evs.get(t); if (!e.cats.includes(c)) e.cats.push(c); e.n += n || 0; };
      const dOf = (d) => `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`;
      if (C.marks.earnings && cur.data.e) for (const d of cur.data.e) { const b = bars.find((x) => x.time >= dOf(d)); if (b) add(b.time, "E"); }
      if (C.marks.actions && cur.data.m) for (const m of cur.data.m) { const b = [...bars].reverse().find((x) => x.time <= dOf(m.d)); if (b) add(b.time, "C"); }
      if (C.marks.news !== false && cur.news && cur.news.length) {
        const PRI = "ODRMFKCAEP";
        for (const n of cur.news) {
          const b = bars.find((x) => x.time >= n[0].slice(0, 10));
          if (!b) continue;
          if (!cur.newsAt.has(b.time)) cur.newsAt.set(b.time, []);
          cur.newsAt.get(b.time).push(n);
        }
        for (const [t, list] of cur.newsAt) {
          const cats = [...new Set(list.map((n) => n[2]))].sort((x, y) => PRI.indexOf(x) - PRI.indexOf(y)).filter((c) => !(c === "E" && C.marks.earnings) && c !== "P");
          if (!cats.length) continue;
          cats.forEach((c, k) => add(t, c, k === 0 ? list.length : 0));
        }
      }
    }
    if (!pv && C.marks.swings) {
      for (const p of I.swings(bars, C.marks.swingPct || 10)) {
        if (p.move == null) continue;
        marks.push({ time: p.time, position: p.kind === "high" ? "aboveBar" : "belowBar", color: p.kind === "high" ? st.up : st.down,
          shape: "circle", size: 0, text: `${p.move > 0 ? "+" : ""}${p.move.toFixed(1)}%` });
      }
    }
    if (!pv && C.marks.inside) {
      bars.forEach((b, i) => { if (i && b.high <= bars[i - 1].high && b.low >= bars[i - 1].low) marks.push({ time: b.time, position: "aboveBar", color: "#9e9e9e", shape: "circle", size: 0.4 }); });
    }
    // pivot / base (same rule as the pipeline, swingdash/patterns.py); cup arc + VCP wave are drawn in the SVG layer
    if (!pv) cur.pattern = null;
    // (on a scanner page only that scan's own drawing is shown, Viraj 20-Nov-2026: no general pivot / base low / wave)
    if (!pv && !cur.opts.scan && (C.marks.pivot || C.marks.vcp || C.marks.cup !== false) && bars.length > 30) {
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
    // the open scanner's own drawing (Viraj's scan videos of 12-Nov-2026): every scan draws only its own pattern
    if (!pv) {
      cur.scanDraw = scanDrawing(cur.opts.scan, cur.row, cur.daily, bars);
      const sd = cur.scanDraw;
      if (sd && sd.pivot != null) price.createPriceLine({ price: sd.pivot, color: SCAN_BLUE, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: "Pivot" });
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
    if (!pv) eventRow(chart, pricePane);
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
    if (show("watermark") && !only) {
      const w = ind.watermark, ln = [];
      const sz = { S: [20, 13, 12], M: [30, 18, 16], L: [42, 25, 22] }[w.size] || [30, 18, 16];
      const col = soft(w.color || "#a8adb5", 0.55);
      const tfTxt = C.tf === "D" ? "1D" : C.tf === "W" ? "1W" : C.tf;
      if (w.symbol) ln.push({ text: `${cur.row.symbol || cur.row.name || ""}, ${tfTxt}`, color: col, fontSize: sz[0] });
      if (w.name && cur.row.name) ln.push({ text: `${cur.row.name}${w.mcap && cur.row.mcap_cr ? ` · ₹${fmt(cur.row.mcap_cr, 0)} Cr` : ""}`, color: col, fontSize: sz[1] });
      if (w.sector && cur.row.sector) ln.push({ text: [cur.row.sector, cur.row.basic_industry || cur.row.industry].filter(Boolean).join(", "), color: col, fontSize: sz[2] });
      if (ln.length) L.createTextWatermark(chart.panes()[pricePane], { horzAlign: "center", vertAlign: { top: "top", middle: "center", bottom: "bottom" }[w.pos] || "center", lines: ln });
      lg("watermark", "<em>Watermark</em>");
    }
    const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null && !Number.isNaN(a[i])) return a[i]; return null; };
    // RS line (pane above or below); a dot when the RS line makes a new high while the price has not
    if (show("rsline") && rs) {
      const pane = paneOf("rsline", "RS");
      const s = line(pts(rs), ind.rsline.color, pane, { lastValueVisible: !pv, priceFormat: { type: "custom", formatter: (x) => fmt(x * 100, 2), minMove: 0.0001 } });
      if (ind.rsline.dot) {
        const len = weekly ? 52 : 252, dots = [];
        for (let i = Math.min(len, rs.length); i < rs.length; i++) {
          let mx = -Infinity, ph = -Infinity;
          for (let k = Math.max(0, i - len + 1); k < i; k++) { if (rs[k] != null) mx = Math.max(mx, rs[k]); ph = Math.max(ph, h[k]); }
          if (rs[i] != null && rs[i] > mx && h[i] <= ph) dots.push({ time: times[i], position: "inBar", color: ind.rsline.dotColor || "#2f7fe0", shape: "circle", size: 0.6 });
        }
        if (dots.length) L.createSeriesMarkers(s, dots);
      }
      labels.push({ pane, k: "rsline", name: `RS <span class="muted">vs ${esc(rsBench === "NIFTY_500" && ind.rsline.bench !== "NIFTY_500" ? "Nifty 500" : BENCH[ind.rsline.bench] || ind.rsline.bench)}</span>`, color: ind.rsline.color, vals: rs, f: (x) => fmt(x * 100, 2) });
    }
    // volume
    let vflags = null, volPane = null;
    if (show("volume") && (!pv || only || ind.volume.pane === "price")) {
      const V = ind.volume;
      vflags = I.volumeFlags(bars, { high_volume_x: Number(V.x) || 1 });
      const onPrice = V.pane === "price" && !only;
      const pane = only ? 0 : onPrice ? pricePane : nextPane("Volume");
      volPane = onPrice || pv ? null : pane;
      const axVol = (x) => (x >= 1e7 ? `${(x / 1e7).toFixed(1)}Cr` : x >= 1e5 ? `${(x / 1e5).toFixed(1)}L` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(Math.round(x)));
      const vs = chart.addSeries(L.HistogramSeries, { priceFormat: { type: "custom", formatter: axVol, minMove: 1 },
        priceScaleId: onPrice ? "vol" : "right", lastValueVisible: false, priceLineVisible: false }, pane);
      vs.priceScale().applyOptions({ scaleMargins: onPrice ? { top: 0.8, bottom: 0 } : { top: 0.12, bottom: 0 } });
      vs.setData(bars.map((b, i) => {
        const f = vflags[i];
        let col = V.bar || "#b9bdc4";
        if (V.colorHigh && f.high) col = f.up ? V.up : f.down ? V.down : col;
        if (V.pp && f.pocket) col = V.ppColor;
        if (V.pp && f.dry) col = V.dryColor;
        return { time: b.time, value: b.volume || 0, color: col };
      }));
      if (V.avg) line(pts(vflags.map((f) => f.avg20)), V.avgColor || "#5f6368", pane, { lineWidth: 1, priceScaleId: onPrice ? "vol" : "right" });
      if (V.labels && !pv) {
        const vm = [];
        vflags.forEach((f, i) => {
          const t = f.hve ? "HVE" : f.hvy ? "HVY" : f.hvq ? "HVQ" : f.lvy ? "Y" : f.lvq ? "Q" : "";
          if (t && (t.length === 3 || i >= bars.length - 260)) vm.push({ time: times[i], position: "aboveBar", color: t.length === 3 ? css("--text") : css("--muted"), shape: "square", size: 0, text: t });
        });
        if (vm.length) L.createSeriesMarkers(vs, vm);
      }
      if (onPrice) lg("volume", "<em>Volume</em>");
    }
    // Stage Analysis: a strip coloured bar by bar (colour strength light / medium / strong)
    if (show("stage")) {
      const stg = I.stage(c), a = STAGE_ALPHA[ind.stage.strength] || STAGE_ALPHA.medium;
      const col = Object.fromEntries(STAGE_KEY.map(([k, , , cc]) => [k, soft(cc, a)]));
      const pane = only ? 0 : nextPane("Stage");
      // the price scale stays visible (a pane whose only scale is hidden makes the chart library fail) but shows no numbers
      const s = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: () => "", minMove: 1 } }, pane);
      s.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0 }, ticksVisible: false });
      s.setData(stg.map((x, i) => (x == null ? { time: times[i] } : { time: times[i], value: 1, color: "rgba(0,0,0,0)" })));
      fills.push({ pane, series: s, kind: "cols", cols: stg.map((x) => (x == null ? null : col[String(x)])) });
      const name = (x) => { const r = STAGE_KEY.find((y) => y[0] === String(x)); return r ? `<b style="color:${r[3]}">${r[1]}</b> <span class="muted">${r[2]}</span>` : "–"; };
      labels.push({ pane, k: "stage", name: "Stage Analysis", color: css("--muted"), vals: stg, html: name });
    }
    // Mansfield RS: the line, a zero line, and a background coloured by the average's direction
    if (show("mansfield") && rsM) {
      const M = ind.mansfield, m = I.mansfield(rsM, M.len);
      const avg = I.sma(rsM.map((x) => (x == null ? NaN : x)), M.len);
      const pane = only ? 0 : nextPane("Mansfield");
      const bgCols = M.bg === false ? null : m.map((x, i) => {
        const a0 = avg[i], a1 = avg[i - 1];
        if (x == null || a0 == null || a1 == null || Number.isNaN(a0) || Number.isNaN(a1)) return null;
        const rising = a0 > a1;
        return x >= 0 ? (rising ? "rgba(92, 184, 92, 0.2)" : "rgba(150, 156, 166, 0.16)") : (rising ? "rgba(74, 144, 217, 0.18)" : "rgba(224, 82, 82, 0.18)");
      });
      const s = line(pts(m), M.color, pane, { lastValueVisible: !pv, lineWidth: 1.25 });
      s.createPriceLine({ price: 0, color: "#4a90d9", lineWidth: 1, lineStyle: 0, axisLabelVisible: false });
      if (bgCols) fills.push({ pane, series: s, kind: "cols", cols: bgCols });
      labels.push({ pane, k: "mansfield", name: `Mansfield RS ${M.len}`, color: M.color, vals: m, f: (x) => fmt(x, 2) });
    }
    // oscillators: line + dashed level lines, optional shaded zone (pane above or below)
    const osc = (k, name, vals, color, o = {}) => {
      const pane = paneOf(k, name);
      const s = line(pts(vals), color, pane, { lastValueVisible: !pv, lineWidth: 1.25, ...(o.extra || {}) });
      (o.levels || []).forEach(([lv, lc]) => s.createPriceLine({ price: lv, color: lc || css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
      (o.fills || []).forEach((f) => fills.push({ pane, series: s, ...f }));
      labels.push({ pane, k, name, color: o.vcol || color, vals, f: o.f || ((x) => fmt(x, 1)), badge: o.badge, more: o.more });
      return { pane, s };
    };
    const fixed = (lo, hi) => ({ autoscaleInfoProvider: () => ({ priceRange: { minValue: lo, maxValue: hi } }) });
    if (show("rsi")) {
      const R = ind.rsi;
      osc("rsi", `RSI ${R.len}`, I.rsi(c, R.len), R.color, { levels: [[R.ob], [R.os]],
        fills: R.shade ? [{ kind: "hband", a: R.ob, b: R.os, color: soft(R.color, 0.08) }] : [], extra: fixed(Math.min(20, R.os - 10), Math.max(80, R.ob + 10)) });
    }
    if (show("macd")) {
      const M = ind.macd, m = I.macd(c, M.fast, M.slow, M.sig);
      const pane = paneOf("macd", "MACD");
      const hs = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      hs.setData(m.hist.map((x, i) => {
        if (x == null) return { time: times[i] };
        const grow = i > 0 && m.hist[i - 1] != null && Math.abs(x) >= Math.abs(m.hist[i - 1]);
        return { time: times[i], value: x, color: x >= 0 ? (grow ? "#2f80ed" : "#a9cdf5") : (grow ? "#d6337a" : "#f3a9c9") };
      }));
      line(pts(m.signal), M.sigColor, pane, { lineWidth: 1.25 });
      line(pts(m.line), M.color, pane, { lineWidth: 1.5, lastValueVisible: !pv });
      labels.push({ pane, k: "macd", name: `MACD ${M.fast} ${M.slow} ${M.sig}`, color: M.color, vals: m.line, f: (x) => fmt(x, 2) });
    }
    if (show("mfi")) {
      const M = ind.mfi;
      osc("mfi", `MFI ${M.len}`, I.mfi(h, l, c, v, M.len), M.color, { levels: [[M.ob], [M.os]],
        fills: M.shade ? [{ kind: "hband", a: M.ob, b: M.os, color: soft(M.color, 0.08) }] : [], extra: fixed(Math.min(0, M.os - 10), Math.max(100, M.ob + 10)) });
    }
    if (show("relext")) {
      const R = ind.relext, vals = I.relativeExtension(c, R.ma, R.lookback, R.type);
      const avgR = R.type === "EMA" ? I.ema(c, R.ma) : I.sma(c, R.ma);
      osc("relext", `Rel Ext ${R.ma} ${R.type || "SMA"}`, vals, R.color, {
        levels: [[R.ob, "#e57373"], [0], [-R.os, "#5cb85c"]], f: (x) => fmt(x, 2),
        more: (i) => (avgR[i] ? `<span class="muted">${S.fmtPct((c[i] / avgR[i] - 1) * 100)} from MA</span>` : ""),
        fills: R.shade ? [{ kind: "above", a: R.ob, color: "rgba(229, 115, 115, 0.12)" }, { kind: "below", a: -R.os, color: "rgba(92, 184, 92, 0.13)" }] : [],
        badge: (x) => (x == null ? "" : x >= R.ob ? '<i class="pl-bd up">Overbought</i>' : x <= -R.os ? '<i class="pl-bd dn">Oversold</i>' : ""),
        extra: fixed(-105, 105) });
    }
    if (show("atr")) osc("atr", `ATR ${ind.atr.len}`, I.atr(h, l, c, ind.atr.len), ind.atr.color, { f: (x) => fmt(x, 2) });
    if (show("adr")) osc("adr", `ADR ${ind.adr.len}`, I.adr(h, l, ind.adr.len), ind.adr.color, { f: (x) => `${fmt(x, 2)}%` });
    if (show("ti")) {
      const T = ind.ti, vals = I.trendIntensity(c, T.fast, T.slow);
      const tiCol = (x) => (x == null ? css("--muted") : x >= T.up ? "#2e9d5b" : x >= 100 ? "#5cb85c" : x >= T.dn ? "#e0973a" : "#e05252");
      const lv = [[T.up, "#5cb85c"], [100], [T.dn, "#e57373"]];
      if (T.shade) {
        // shaded distance from 100: green above, red below (baseline series)
        const pane = paneOf("ti", "TI");
        const s = chart.addSeries(L.BaselineSeries, { baseValue: { type: "price", price: 100 }, lineWidth: 1.25, priceLineVisible: false, lastValueVisible: !pv, crosshairMarkerVisible: false,
          topLineColor: "#4caf50", topFillColor1: "rgba(76, 175, 80, 0.28)", topFillColor2: "rgba(76, 175, 80, 0.05)",
          bottomLineColor: "#e05252", bottomFillColor1: "rgba(224, 82, 82, 0.05)", bottomFillColor2: "rgba(224, 82, 82, 0.28)" }, pane);
        s.setData(pts(vals));
        lv.forEach(([x, lc]) => s.createPriceLine({ price: x, color: lc || css("--muted"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
        labels.push({ pane, k: "ti", name: `TI ${T.fast}/${T.slow}`, color: tiCol(lastOf(vals)), vals, f: (x) => `<span style="color:${tiCol(x)}">${fmt(x, 2)}</span>` });
      } else osc("ti", `TI ${T.fast}/${T.slow}`, vals, T.color, { levels: lv, f: (x) => `<span style="color:${tiCol(x)}">${fmt(x, 2)}</span>` });
    }
    // indicators that are on but hidden (eye) stay in the legend, faded
    for (const g of IND_MENU) for (const [k, label] of g[1]) if (ind[k].on && ind[k].hidden) legend.push({ k, html: label, hidden: true });
    // pane sizes: the price pane gets the most room; the chart grows by 80 px per extra pane
    const ps = chart.panes();
    ps.forEach((p, i) => p.setStretchFactor(i === pricePane && !only ? (ps.length === 2 ? 3 : Math.max(3, 6 - ps.length)) : 1));
    if (pv) {     // preview: the last 3 months of days or 60 weeks, like the reference
      const n = weekly ? 60 : 63;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length - 0.5 });
      fillLayer(chart, canvas, fills);
      return chart;
    }
    canvas.style.minHeight = ps.length > 2 ? `${320 + 80 * (ps.length - 1)}px` : "";
    cur.legend = legend;
    renderLegend();
    cur.fillRender = fillLayer(chart, canvas, fills);
    cur.paneLabels = paneLabels(chart, canvas, labels, pricePane);
    cur.volPane = volPane;
    // visible range: last year (daily) / 3 years (weekly)
    if (range) chart.timeScale().setVisibleLogicalRange(range);
    else { const n = Math.max(30, Math.round(({ D: 250, W: 156, M: 120, Y: 40 }[TF.u] || 250) / (TF.u === "Y" ? 1 : TF.n))); chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length + 3 }); }
    // header with crosshair values
    header(bars.length - 1, vflags);
    cur.onPaint = () => { header(bars.length - 1, vflags); if (cur.fillRender) cur.fillRender(); if (cur.paneLabels) cur.paneLabels.place(); };   // the volume label needs the painted panes (drawings.render calls it)
    const tIdx = new Map(times.map((x, k) => [x, k]));
    let hovI = null, hovRaf = 0;
    const hov = () => {
      hovRaf = 0;
      if (!cur || cur.chart !== chart) return;
      const i = hovI == null ? bars.length - 1 : hovI;
      header(i, vflags, hovI != null);
      if (cur.paneLabels) cur.paneLabels.at(i);
    };
    chart.subscribeCrosshairMove((p) => {          // header + pane values follow the mouse, at most once per frame
      cur.hoverNews = !!(p && p.time);
      const i = p && p.time ? tIdx.get(p.time) : null;
      hovI = i == null ? null : i;
      if (!hovRaf) hovRaf = requestAnimationFrame(hov);
    });
    // dragging a pane divider (price / volume / indicators): badges, volume label and drawings follow at once
    let dragRaf = 0;
    const follow = () => { dragRaf = 0; if (!cur || cur.chart !== chart) return; if (cur.placeEv) cur.placeEv(); if (cur.onPaint) cur.onPaint(); drawings.render(); };
    canvas.addEventListener("pointermove", (e) => { if (e.buttons && !dragRaf) dragRaf = requestAnimationFrame(follow); });
    canvas.addEventListener("pointerup", () => setTimeout(follow, 30));
    // "back to the latest bar" button when scrolled into the past
    const endBtn = cur.box.querySelector("#chEnd");
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (endBtn && r) endBtn.hidden = r.to >= bars.length - 1; });
    endBtn.onclick = () => chart.timeScale().scrollToRealTime();
    drawings.attach(chart, price, pricePane);
    cur.box.querySelector("#chNote").textContent = `${tfName(TF.n, TF.u)} bars${TF.u === "W" ? " (Monday-start weeks)" : ""}. `
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
    box.onclick = legendClick;
  }
  /* eye / settings / remove buttons of the legend and the pane titles */
  function legendClick(e) {
    const b = e.target.closest("[data-lg]"); if (!b) return;
    const k = b.closest("[data-k]").dataset.k, act = b.dataset.lg;
    if (act === "eye") cfg.ind[k].hidden = !cfg.ind[k].hidden;
    else if (act === "x") { cfg.ind[k].on = false; cfg.ind[k].hidden = false; }
    else return indicatorMenu(k);
    save(); draw(true); renderTools();
  }

  const EV_COL = { E: "#5b6fd6", C: "#e0527a", M: "#7b8494", O: "#16a34a", D: "#2962ff", K: "#0ea5e9", F: "#a855f7", R: "#db2777", A: "#14b8a6" };
  const EV_NAME = { E: "Results", C: "Corporate action", M: "Management", O: "Orders & business", D: "Deals & expansion", K: "Con-call / meet", F: "Fund raising", R: "Regulatory & legal", A: "Credit rating" };
  function eventRow(chart, pi) {
    const wrap = cur.box.querySelector(".ch-wrap");
    let el = wrap.querySelector("#chEv");
    if (!el) { el = document.createElement("div"); el.id = "chEv"; el.className = "ch-ev"; wrap.appendChild(el); }
    const evs = [...(cur.evs || new Map())];
    el.innerHTML = evs.map(([t, e]) => `<span class="ev-b" data-t="${t}" title="${esc(S.fmtDate(t))}: ${esc(e.cats.map((c) => EV_NAME[c] || c).join(", "))}">${e.cats.slice(0, 3).map((c, k) =>
      `<i class="ev" style="--c:${EV_COL[c] || "#94a3b8"}">${c}${k === 0 && e.n > 1 ? `<sup>${e.n > 9 ? "9+" : e.n}</sup>` : ""}</i>`).join("")}</span>`).join("");
    const place = () => {
      if (!cur || cur.chart !== chart || !el.isConnected) return;
      const pane = chart.panes()[pi], pe = pane && pane.getHTMLElement();
      if (!pe) return;
      const wr = wrap.getBoundingClientRect(), pr = pe.getBoundingClientRect(), ts = chart.timeScale(), w = ts.width();
      el.style.top = `${pr.bottom - wr.top - 24}px`;
      const db = cur.box.querySelector("#chDraw");
      if (db) { db.style.top = "auto"; db.style.bottom = `${wr.bottom - pr.bottom + 28}px`; }
      el.querySelectorAll(".ev-b").forEach((b) => { const x = ts.timeToCoordinate(b.dataset.t); const off = x == null || x < 6 || x > w - 6; b.hidden = off; if (!off) b.style.left = `${pr.left - wr.left + x}px`; });
    };
    cur.placeEv = place;
    let pr = 0;
    const placeSoon = () => { if (!pr) pr = requestAnimationFrame(() => { pr = 0; place(); }); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(placeSoon);
    chart.timeScale().subscribeSizeChange(placeSoon);
    requestAnimationFrame(() => requestAnimationFrame(place));
    setTimeout(place, 120); setTimeout(place, 600);          // also when the page is in the background (no animation frames)
    if (cur.evRO) cur.evRO.disconnect();
    cur.evRO = new ResizeObserver(place); cur.evRO.observe(wrap);
  }

  function header(i, vflags, hovering) {
    if (!cur || !cur.bars) return;
    const b = cur.bars[i], p = cur.bars[i - 1], r = cur.row;
    const nb = cur.box.querySelector("#chNews"), nl = cur.newsAt && cur.newsAt.get(b.time);
    if (nb) {
      nb.hidden = !nl || i === cur.bars.length - 1 && !cur.hoverNews;
      if (nl) {
        const NAME = { E: "Results", K: "Con-call / meet", O: "Orders & business", D: "Deals & expansion", C: "Corporate action", F: "Fund raising", M: "Management", R: "Regulatory & legal", A: "Credit rating", P: "Update" };
        nb.innerHTML = `<small class="muted">FILINGS · ${esc(S.fmtDate(b.time))} · ${nl.length}</small>` + nl.slice(0, 5).map((n) => `<div><b class="nc-${n[2]}">${NAME[n[2]] || n[2]}</b> <small class="muted">${esc(n[0].slice(11, 16))}</small><span>${esc(n[4] || n[3])}</span></div>`).join("")
          + (nl.length > 5 ? `<small class="muted">+${nl.length - 5} more in the stock panel</small>` : "");
      }
    }
    const chg = p ? (b.close / p.close - 1) * 100 : null, chgAbs = p ? b.close - p.close : null;
    const back = (n) => { const x = cur.bars[i - n]; return x ? (b.close / x.close - 1) * 100 : null; };
    // 1M / 3M change from the daily bars up to the last session of bar i (any timeframe)
    const dEnd = () => { const D = cur.daily, nx = cur.bars[i + 1]; if (!nx) return D.length - 1; let lo = 0, hi = D.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (D[m].time < nx.time) lo = m; else hi = m - 1; } return lo; };
    const backD = (n) => { const D = cur.daily, k = dEnd(), x = D[k - n]; return x && D[k] ? (D[k].close / x.close - 1) * 100 : null; };
    const tfU = S.tfParse(cfg.tf).u, w = tfU !== "D" && tfU !== "m" && tfU !== "h";
    const f = vflags ? vflags[i] : null;
    const due = r.next_result && cfg.show.due !== false ? `<span class="ch-due">Results due ${esc(S.fmtDate(r.next_result))}</span>` : "";
    const hd = cur.box.querySelector("#chHead");
    if (!hd.querySelector(".ch-l2")) hd.innerHTML = '<div class="ch-l2"></div><div class="ch-st"></div>';
    const stKey = `${r.key || r.id}|${cfg.show.desc}|${cfg.show.due}|${ABOUT[r.symbol] ? 1 : 0}`;
    if (hd.dataset.k !== stKey) {
      hd.dataset.k = stKey;
      hd.querySelector(".ch-st").innerHTML = `${cfg.show.desc !== false && ABOUT[r.symbol] ? `<p class="ch-about">${esc(ABOUT[r.symbol])}</p>` : ""}
      ${cfg.show.desc !== false ? `<div class="ch-desc muted">${esc(r.name || "")}${r.sector ? ` · ${esc(r.sector)} › ${esc(r.basic_industry || r.industry || "")}` : ""}${due}</div>` : due ? `<div class="ch-desc">${due}</div>` : ""}`;
    }
    if (!hovering) {             // layout reads only when not following the mouse (they slow every mouse move)
      const chipsEl = cur.box.querySelector(".ch-chips"), hr0 = hd.getBoundingClientRect(), cKey = `${Math.round(hr0.width)}|${chipsEl ? chipsEl.childElementCount : 0}`;
      if (chipsEl && cur.mKey !== cKey) { cur.mKey = cKey; const cr = chipsEl.getBoundingClientRect(); cur.mLeft = cr.width ? cr.left - hr0.left + cr.width / 2 : null; }
      hd.style.setProperty("--m-left", cur.mLeft != null ? `${cur.mLeft}px` : "55%");
    }
    hd.querySelector(".ch-l2").innerHTML = `<b class="ch-sym">${esc(r.symbol || r.name)}</b><span class="muted">${cfg.tf === "D" || tfIntra(cfg.tf) ? "1D" : cfg.tf === "W" ? "1W" : esc(cfg.tf)}</span>
      <span>O <b>${fmt(b.open)}</b></span><span>H <b>${fmt(b.high)}</b></span><span>L <b>${fmt(b.low)}</b></span><span>C <b>${fmt(b.close)}</b></span>
      <span class="${S.colorClass(chg)}">${chgAbs == null ? "" : (chgAbs > 0 ? "+" : "") + fmt(chgAbs)} (${S.fmtPct(chg)})</span>
      <span class="ch-r"><span>1M <b class="${S.colorClass(backD(21))}">${S.fmtPct(backD(21))}</b></span><span>3M <b class="${S.colorClass(backD(63))}">${S.fmtPct(backD(63))}</b></span></span>`;
    const vl = cur.box.querySelector("#chVol");
    if (vl) {
      const top = cur.volPane != null ? (hovering && cur.volTop != null ? cur.volTop : (cur.volTop = drawings.paneTopOf(cur.volPane))) : null;
      if (f && b.volume != null && top != null) {
        vl.hidden = false;
        if (!hovering) {
          vl.style.top = `${top + 4}px`;
          let psw = 60; try { psw = cur.chart.priceScale("right").width(); } catch (e) { /* default */ }
          vl.style.right = `${psw + 8}px`;
        }
        vl.innerHTML = `<span>Vol <b class="${f.up ? "up" : f.down ? "down" : ""}">${S.fmtVol(b.volume)}</b></span><span>Avg 20${!w ? "D" : cfg.tf === "W" ? "W" : " · " + esc(cfg.tf)} <b>${S.fmtVol(f.avg20)}</b><i></i>RVol <b class="rv">${f.rvol == null ? "–" : Math.round(f.rvol * 100) + "%"}</b></span>`;
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
    const pc = (x) => (x == null ? '<i class="muted">—</i>' : `<i class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}%</i>`);
    const cells = (vals, d) => t.ends.slice(from).map((e, j) => {
      const i = from + j;
      return `<div class="ce-c"><b>${vals[i] == null ? "–" : fmt(vals[i], d)}</b><span>${pc(ch(vals[i], vals[i - 4]))}${pc(ch(vals[i], vals[i - 1]))}</span></div>`;
    }).join("");
    const open = cfg.show.earnOpen !== false, k = n - from;
    const sl = doc.kind === "bank" || doc.kind === "nbfc" ? "Revenue" : doc.kind === "insurance" ? "Premium" : "Sales";
    box.innerHTML = `<div class="ce" style="--qn:${k}"><div class="ce-r ce-hd"><button type="button" class="ce-h" aria-expanded="${open}" title="Quarterly results, ${basis === "C" ? "consolidated" : "standalone"} (click to fold)"><span class="caret">▾</span>Earnings</button>${t.ends.slice(from).map((e, j) => `<div class="ce-q${from + j === n - 1 ? " last" : ""}">${fq(e)}</div>`).join("")}</div>
      <div class="ce-b ${open ? "" : "shut"}"><div class="ce-in"><div class="ce-r"><div class="ce-k"><span>EPS <small>₹</small></span><em>YoY<br>QoQ</em></div>${cells(eps, 2)}</div>
      <div class="ce-r"><div class="ce-k"><span>${sl} <small>Cr</small></span><em>YoY<br>QoQ</em></div>${cells(sales, 0)}</div></div></div></div>`;
    box.querySelector(".ce-h").onclick = () => {
      cfg.show.earnOpen = !(cfg.show.earnOpen !== false); save();
      box.querySelector(".ce-b").classList.toggle("shut", cfg.show.earnOpen === false);
      box.querySelector(".ce-h").setAttribute("aria-expanded", String(cfg.show.earnOpen !== false));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 280);
    };
  }

  /* ------------------------------------------------------------------ toolbar, menus */
  function chipsHTML() {
    const r = cur.row, chips = [];
    const chip = (k, v, col, tip) => `<span class="chip-t" title="${esc(tip)}"><i>${k}</i><b${col ? ` style="color:${col}"` : ""}>${v}</b></span>`;
    if (cfg.chips.float && r.float_mcap_cr != null) chips.push(chip("F", `₹${fmt(r.float_mcap_cr, 0)} Cr`, "", "Free-float market cap"));
    if (cfg.chips.rs && r.rs_rating != null) chips.push(chip("RS", r.rs_rating, r.rs_rating >= 80 ? "var(--accent)" : "", "RS rating 1-99"));
    if (cfg.chips.stage && r.stage) chips.push(`<span class="chip-t" title="Stage ${esc(String(r.stage))}"><b style="color:${String(r.stage) === "2" ? "var(--accent)" : STAGE_COL[r.stage]}">${esc(String(r.stage).replace("A", ""))} ${STAGE_TXT[r.stage]}</b></span>`);
    if (cfg.chips.theme !== false && r.theme_status) {
      const tc = { Leading: "#089981", Improving: "#2962ff", Weakening: "#ff9800", Lagging: "#f23645" }[r.theme_status] || "#787b86";
      chips.push(chip("T", esc(r.theme_status), tc, `Theme ${r.theme || ""}: ${r.theme_status}`));
    }
    if (cfg.chips.from && r.from_hi52 != null) chips.push(chip("D", S.fmtPct(r.from_hi52), "", "From 52-week high"));
    return chips.join("");
  }

  function renderTools() {
    const box = cur.box.querySelector("#chTools");
    const seg = (name, opts, val) => `<div class="seg sm" data-seg="${name}">${opts.map(([v, t, tip]) => `<button type="button" data-v="${v}" class="${v === val ? "on" : ""}" ${tip ? `title="${tip}"` : ""}>${t}</button>`).join("")}</div>`;
    const favs = tfSort([...new Set([...(cfg.tfFav || ["D", "W"]).filter((x) => !tfIntra(x)), ...(tfIntra(cfg.tf) ? [] : [cfg.tf])])]);
    box.innerHTML = `<div class="tf-bar">${seg("tf", favs.map((x) => { const t = S.tfParse(x); return [x, x, tfName(t.n, t.u)]; }), cfg.tf)}<button type="button" class="tf-dd" data-act="tfm" title="More timeframes" aria-label="More timeframes" aria-haspopup="true"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>${seg("type", [["candle", ic("candle"), "Candles"], ["bar", ic("bars"), "Bars"]], cfg.type)}
      <button class="btn sm ${cfg.ind.ma.on ? "on" : ""}" data-act="ma" type="button" title="Moving averages on / off">MA</button>
      <button class="btn sm ind-btn" data-act="ind" type="button" aria-haspopup="dialog"><i class="fx">ƒx</i> Indicators <svg class="caret" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <span class="ch-chips">${chipsHTML()}</span>
      <button class="btn sm icon" data-act="set" type="button" title="Chart settings">${ic("gear")}</button>${cur.opts && cur.opts.extraTool ? cur.opts.extraTool : ""}`;
    box.onclick = (e) => {
      if (e.target.closest("[data-xtool]") && cur.opts && cur.opts.onExtraTool) return cur.opts.onExtraTool(e);
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
        if (act.dataset.act === "tfm") return tfMenu(act);
        if (act.dataset.act === "set") return settingsDrawer();
      }
    };
  }

  /* timeframe menu (Viraj 15-Nov-2026, reference picture): on top a number box and a unit box to make any timeframe
     (minutes, hours, days, weeks, months, years); below, the list with a heart on each - hearted ones show as buttons in
     the toolbar. Custom ones can be removed (x). Intraday timeframes are listed but need intraday data (not on this site). */
  const TF_BASE = ["D", "W", "5m", "15m", "30m", "1h", "75m"];
  const TF_UNITS = [["m", "Minutes", "minute"], ["h", "Hours", "hour"], ["D", "Days", "day"], ["W", "Weeks", "week"], ["M", "Months", "month"], ["Y", "Years", "year"]];
  const TF_MIN = { m: 1, h: 60, D: 1440, W: 7200, M: 30000, Y: 360000 };
  const tfIntra = (tf) => /[mh]$/.test(String(tf));
  const tfDur = (tf) => { const t = S.tfParse(tf); return t.n * TF_MIN[t.u]; };
  const tfSort = (a) => a.slice().sort((x, y) => tfDur(x) - tfDur(y));
  function tfName(n, u) { const w = (TF_UNITS.find((x) => x[0] === u) || TF_UNITS[2])[2]; return n === 1 ? { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[w] || `1 ${w}` : `${n} ${w}s`; }
  const HEART = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 20.3s-7.2-4.4-9.3-8.6C1.2 8.6 3 5 6.6 5c2.1 0 3.5 1.2 4.4 2.6.1.2.4.2.5 0C12.4 6.2 13.8 5 15.9 5c3.6 0 5.4 3.6 3.9 6.7-2.1 4.2-9.3 8.6-9.3 8.6z" fill="currentColor" fill-opacity="var(--hf, 0)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  function tfMenu(btn) {
    const old = document.querySelector(".tf-pop"); if (old) { old.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "tf-pop";
    let note = "";
    const list = () => [...TF_BASE, ...tfSort((cfg.tfCustom || []).filter((x) => !TF_BASE.includes(x)))];
    const paint = () => {
      const fav = new Set(cfg.tfFav || []), mine = new Set(cfg.tfCustom || []);
      const nIn = pop.querySelector(".tf-n"), uIn = pop.querySelector(".tf-u");
      const keepN = nIn ? nIn.value : "2", keepU = uIn ? uIn.value : "D";
      pop.innerHTML = `<div class="tf-add"><input class="tf-n" type="number" min="1" max="999" step="1" value="${keepN}" aria-label="Number" placeholder="Number">
          <select class="tf-u" aria-label="Unit">${TF_UNITS.map(([v, l]) => `<option value="${v}" ${v === keepU ? "selected" : ""}>${l}</option>`).join("")}</select>
          <button type="button" class="tf-go" title="Add this timeframe to the list and open it">Add</button></div>
        ${note ? `<p class="tf-note">${note}</p>` : ""}
        <div class="tf-list" role="menu">${list().map((tf) => { const off = tfIntra(tf), t = S.tfParse(tf);
          return `<div class="tf-it${tf === cfg.tf ? " on" : ""}${off ? " off" : ""}" role="menuitem" data-tf="${tf}" title="${off ? "Intraday bars need intraday data - this site has end-of-day data only" : esc(tfName(t.n, t.u))}">
            <span>${tf}</span>${mine.has(tf) ? `<button type="button" class="tf-rm" data-rm title="Remove ${tf}" aria-label="Remove ${tf}">✕</button>` : ""}
            <button type="button" class="tf-fav${fav.has(tf) ? " on" : ""}" data-fav ${off ? "disabled" : ""} title="${fav.has(tf) ? "Remove from the toolbar" : "Show in the toolbar"}" aria-label="Favourite ${tf}">${HEART}</button></div>`; }).join("")}</div>`;
      const n = pop.querySelector(".tf-n");
      n.onkeydown = (e) => { if (e.key === "Enter") add(); };
    };
    const pick = (tf) => { cfg.tf = tf; save(); close(); renderTools(); draw(false); };
    const add = () => {
      const n = Math.floor(Number(pop.querySelector(".tf-n").value)), u = pop.querySelector(".tf-u").value;
      if (!(n >= 1 && n <= 999)) { note = "Type a number from 1 to 999."; return paint(); }
      const tf = S.tfLabel(n, u);
      if (!list().includes(tf)) cfg.tfCustom = [...(cfg.tfCustom || []), tf];
      save();
      if (tfIntra(tf)) { note = `${tf} added. Minute and hour bars need intraday data; this site has end-of-day data, so they cannot open yet.`; return paint(); }
      pick(tf);
    };
    paint();
    document.body.appendChild(pop);
    const b = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(b.left - 40, innerWidth - pop.offsetWidth - 8))}px`;
    pop.style.top = `${b.bottom + 6}px`;
    const close = () => { pop.remove(); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", onKey); };
    const outside = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", onKey); });
    pop.onclick = (e) => {
      e.stopPropagation();
      if (e.target.closest(".tf-go")) return add();
      const it = e.target.closest("[data-tf]"); if (!it) return;
      const tf = it.dataset.tf;
      if (e.target.closest("[data-fav]")) {
        const f = new Set(cfg.tfFav || []);
        if (f.has(tf)) { if (f.size > 1) f.delete(tf); } else f.add(tf);
        cfg.tfFav = [...f]; save(); note = ""; paint(); renderTools(); return;
      }
      if (e.target.closest("[data-rm]")) {
        cfg.tfCustom = (cfg.tfCustom || []).filter((x) => x !== tf); cfg.tfFav = (cfg.tfFav || []).filter((x) => x !== tf);
        if (!cfg.tfFav.length) cfg.tfFav = ["D"];
        save(); note = "";
        if (cfg.tf === tf) { cfg.tf = "D"; save(); renderTools(); draw(false); } else renderTools();
        return paint();
      }
      if (tfIntra(tf)) { note = "Minute and hour bars need intraday data; this site has end-of-day data, so they cannot open yet."; return paint(); }
      pick(tf);
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

  /* indicator menu (20-Nov-2026, built like the reference's pages in Viraj's videos): drops down under the "Indicators"
     button. Left: search and the list in groups (tick = on the chart). Right: name, description, a live preview of only this
     indicator (last 3 months, or 60 weeks on a weekly chart), its settings, and reset / remove / Cancel / Apply (Update when
     it is already on the chart). Descriptions and tips are in our own words. */
  const INFO = {
    stlen: "Number of bars in the average true range.", stmult: "How many ATRs the line stays away from the price. Bigger = fewer flips.",
    len: "Number of bars used.", bbstd: "Width of the bands in standard deviations.", swlen: "Bars of the fast and the slow T3 average.",
    vf: "Smoothing of the T3 averages: lower follows the price more closely, higher is smoother.",
    avg: "A line through the 20-day average volume.", high: "Bars with volume above the level below, green on up days and red on down days.",
    pp: "Pocket pivot: an up day with more volume than any down day of the last 10. Dry-up: a very quiet day.",
    dot: "A dot when the RS line makes a new 52-week high while the price has not yet.", bench: "The index the stock is compared with.",
    mlen: "Bars in the RS line's own average (52 = one year of weeks).", bg: "Colour the background by where the RS line is against its average.",
    macd: "Bars of the fast average, the slow average and the signal line.", reavg: "The average the stretch is measured from.",
    look: "How many past days set the +100 / -100 scale.", tilen: "Bars of the fast and the slow average.",
  };
  const RESET_ICO = '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/></svg>';
  const SEARCH_ICO = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  const PRICE_INDS = ["ma", "supertrend", "bb", "swing", "watermark"];
  function indicatorMenu(startK) {
    const old = document.querySelector(".ipd");
    if (old) { old.shut(); if (!startK) return; }
    if (!cur) return;
    const btn = cur.box.querySelector('[data-act="ind"]');
    let sel = startK || (IND_MENU.flatMap((g) => g[1]).find(([k]) => cfg.ind[k].on) || ["ma"])[0];
    const pop = document.createElement("div");
    pop.className = "ipd";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Indicators");
    pop.innerHTML = `<div class="ipd-l"><label class="ipd-q">${SEARCH_ICO}<input type="search" placeholder="Search" aria-label="Search indicators"></label>
      <div class="ipd-list">${IND_MENU.map(([g, items]) => `<div class="ipd-g"><h6>${g}</h6>${items.map(([k, label, desc]) =>
        `<button type="button" class="ipd-it" data-k="${k}" data-t="${esc((label + " " + desc).toLowerCase())}"><span>${label}</span><i class="ipd-tk"></i></button>`).join("")}</div>`).join("")}</div></div>
      <div class="ipd-r"><div class="ipd-b" id="ipB"></div><div class="ipd-f" id="ipF"></div></div>`;
    document.body.appendChild(pop);
    const place = () => {
      const b = btn ? btn.getBoundingClientRect() : { left: 40, bottom: 90 };
      const W = Math.min(600, innerWidth - 16), top = Math.round(b.bottom + 6);
      pop.style.width = `${W}px`;
      pop.style.left = `${Math.round(Math.max(8, Math.min(b.left - 2, innerWidth - W - 8)))}px`;
      pop.style.top = `${top}px`;
      pop.style.height = `${Math.max(320, Math.min(650, innerHeight - top - 10))}px`;
    };
    place();
    requestAnimationFrame(() => pop.classList.add("open"));
    if (btn) btn.classList.add("open");
    let prev = null;
    const kill = () => { if (prev) { try { prev.remove(); } catch (e) { /* gone */ } prev = null; } };
    const onDown = (e) => { if (!pop.contains(e.target) && !(btn && btn.contains(e.target))) shut(); };
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    const shut = () => {
      if (pop.classList.contains("closing")) return;
      pop.classList.remove("open"); pop.classList.add("closing"); kill();
      if (btn) btn.classList.remove("open");
      document.removeEventListener("mousedown", onDown, true); document.removeEventListener("keydown", onKey); removeEventListener("resize", place);
      setTimeout(() => pop.remove(), 160);
    };
    pop.shut = shut;
    setTimeout(() => { document.addEventListener("mousedown", onDown, true); document.addEventListener("keydown", onKey); addEventListener("resize", place); });
    const ticks = () => pop.querySelectorAll(".ipd-it").forEach((r) => { r.classList.toggle("sel", r.dataset.k === sel); r.querySelector(".ipd-tk").textContent = cfg.ind[r.dataset.k].on ? "✓" : ""; });

    // ---- form pieces
    const info = (t) => (INFO[t] ? `<i class="ipd-i" title="${esc(INFO[t])}">i</i>` : "");
    const R = (label, ctl, tip, cls = "") => `<div class="ipf ${cls}"><span class="ipf-l">${label}${tip ? info(tip) : ""}</span><span class="ipf-c">${ctl}</span></div>`;
    const num = (name, val, w = "") => `<input class="ipn ${w}" type="number" step="any" name="${name}" value="${esc(val)}">`;
    const seg = (name, opts, val) => `<span class="ipseg" data-seg="${name}"><input type="hidden" name="${name}" value="${esc(val)}">${opts.map(([v, t]) =>
      `<button type="button" data-v="${v}" class="${String(v) === String(val) ? "on" : ""}">${t}</button>`).join("")}</span>`;
    const sel_ = (name, opts, val, numeric) => `<span class="ipsel"><select name="${name}" ${numeric ? "data-num" : ""}>${opts.map(([v, t]) =>
      `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${t}</option>`).join("")}</select></span>`;
    const chk = (name, label, val, tip, right = "", cls = "") => `<div class="ipf ${cls}"><label class="ipf-l ipc"><input type="checkbox" name="${name}" ${val ? "checked" : ""}><span>${label}</span>${tip ? info(tip) : ""}</label><span class="ipf-c">${right}</span></div>`;
    const paneSeg = (v) => R("Show on", seg("pane", [["above", "Pane above"], ["below", "Pane below"]], v.pane || "below"));
    const benchOpts = Object.entries(BENCH);
    const maRows = (v, tf) => ((v[tf] && v[tf].length ? v[tf] : maPreset(v.preset)[tf]) || []).map((m, j) => maRow(m, j));
    const maLine = (x, j) => `<div class="ma-r"><input type="checkbox" class="ma-on" ${x.on ? "checked" : ""} aria-label="Show this average"><span class="ma-n">MA ${j + 1}</span>
      ${sel_("", [["SMA", "SMA"], ["EMA", "EMA"]], x.type).replace('name=""', 'class="ma-t"')}<input class="ipn ma-len" type="number" min="2" step="1" value="${x.len}" aria-label="Length">
      ${swatch(`ma_${Math.random().toString(36).slice(2, 8)}`, x.color)}<button type="button" class="ma-x" data-del aria-label="Remove this average">✕</button></div>`;
    const presetOpts = () => [["", "Custom"], ...Object.entries(MA_PRESETS).map(([pk, p]) => [pk, pk === "mine" ? "My preset" : p.label])];
    const forms = {
      ma: (v) => `${R("Preset", sel_("preset", presetOpts(), v.custom ? "" : v.preset || "minervini"))}
        ${["d", "w"].map((tf) => `<h6 class="ipd-h">${tf === "d" ? "Daily chart" : "Weekly chart"}</h6><div class="ma-list" data-tf="${tf}">${maRows(v, tf).map(maLine).join("")}</div>
        <button type="button" class="ipd-add" data-add="${tf}">＋ Add average</button>`).join("")}
        <button type="button" class="ipd-save" data-ip="savedef"><svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg> Save current look as my default</button><span class="ipd-saved" hidden>Saved as your default</span>`,
      supertrend: (v) => R("ATR length", num("len", v.len), "stlen") + R("ATR multiple", sel_("mult", [1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((x) => [x, `${x}×`]), v.mult, true), "stmult")
        + R("Uptrend colour", swatch("up", v.up)) + R("Downtrend colour", swatch("down", v.down)),
      bb: (v) => R("Length", num("len", v.len), "len") + R("Standard deviations", sel_("std", [1, 1.5, 2, 2.5, 3].map((x) => [x, x]), v.std, true), "bbstd")
        + R("Middle line colour", swatch("mid", v.mid)) + R("Band colour", swatch("color", v.color)) + chk("fill", "Shade between the bands", v.fill),
      swing: (v) => R("Fast and slow lengths", num("fast", v.fast, "sm") + num("slow", v.slow, "sm"), "swlen")
        + R("Volume factor", sel_("vf", [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map((x) => [x, x]), v.vf, true), "vf"),
      watermark: (v) => chk("symbol", "Symbol and timeframe", v.symbol) + chk("name", "Company name", v.name) + chk("mcap", "Market cap after the name", v.mcap)
        + chk("sector", "Sector and industry", v.sector) + R("Where", seg("pos", [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], v.pos))
        + R("Text size", seg("size", [["S", "Small"], ["M", "Medium"], ["L", "Large"]], v.size)) + R("Text colour", swatch("color", v.color)),
      volume: (v) => R("Show on", seg("pane", [["price", "Price chart"], ["below", "Pane below"]], v.pane)) + R("Bar colour", swatch("bar", v.bar))
        + chk("avg", "Average volume line", v.avg, "avg", swatch("avgColor", v.avgColor))
        + chk("colorHigh", "Colour high-volume days", v.colorHigh, "high", swatch("up", v.up) + swatch("down", v.down))
        + R("High volume means", sel_("x", [["1", "Above the average"], ["1.5", "1.5× the average"], ["2", "2× the average"], ["2.5", "2.5× the average"]], String(v.x)), "", "sub")
        + chk("pp", "Pocket pivots and dry-ups", v.pp, "pp", swatch("ppColor", v.ppColor) + swatch("dryColor", v.dryColor)),
      rsline: (v) => paneSeg(v) + R("Compare with", sel_("bench", benchOpts, v.bench), "bench") + R("Line colour", swatch("color", v.color))
        + chk("dot", "Dot on a new RS high", v.dot, "dot", swatch("dotColor", v.dotColor)),
      mansfield: (v) => R("Compare with", sel_("bench", benchOpts, v.bench), "bench") + R("Length", num("len", v.len), "mlen") + R("Line colour", swatch("color", v.color))
        + chk("bg", "Background colours", v.bg, "bg"),
      stage: (v) => R("Colour strength", seg("strength", [["light", "Light"], ["medium", "Medium"], ["strong", "Strong"]], v.strength))
        + `<h6 class="ipd-h">Colour key</h6><div class="ipd-key">${STAGE_KEY.map(([, n, t, cc]) => `<span><i style="background:${cc}"></i><b>${n}</b><em>${t}</em></span>`).join("")}</div>`,
      rsi: (v) => paneSeg(v) + R("Length", num("len", v.len), "len") + R("Line colour", swatch("color", v.color))
        + R("Upper and lower lines", num("ob", v.ob, "sm") + num("os", v.os, "sm")) + chk("shade", "Shade the zone between", v.shade),
      macd: (v) => paneSeg(v) + R("Fast, slow and signal", num("fast", v.fast, "sm") + num("slow", v.slow, "sm") + num("sig", v.sig, "sm"), "macd")
        + R("MACD line colour", swatch("color", v.color)) + R("Signal line colour", swatch("sigColor", v.sigColor)),
      mfi: (v) => forms.rsi(v),
      relext: (v) => paneSeg(v) + R("Average", sel_("type", [["SMA", "SMA"], ["EMA", "EMA"]], v.type) + num("ma", v.ma, "sm"), "reavg") + R("Lookback", num("lookback", v.lookback), "look")
        + R("Overbought and oversold", num("ob", v.ob, "sm") + num("os", v.os, "sm")) + R("Line colour", swatch("color", v.color)) + chk("shade", "Shade the zones", v.shade),
      atr: (v) => paneSeg(v) + R("Length", num("len", v.len), "len") + R("Line colour", swatch("color", v.color)),
      adr: (v) => forms.atr(v),
      ti: (v) => paneSeg(v) + R("Fast and slow averages", num("fast", v.fast, "sm") + num("slow", v.slow, "sm"), "tilen")
        + R("Strong up and down levels", num("up", v.up, "sm") + num("dn", v.dn, "sm")) + chk("shade", "Shade the distance from 100", v.shade),
    };
    const read = (k) => {
      const f = pop.querySelector("#ipForm"), out = { ...cfg.ind[k] };
      if (!f) return out;
      if (k === "ma") {
        const rd = (tf) => [...f.querySelectorAll(`.ma-list[data-tf=${tf}] .ma-r`)].map((r) => ({ type: r.querySelector(".ma-t").value, len: Number(r.querySelector(".ma-len").value),
          color: r.querySelector(".sw input[type=hidden]").value, on: r.querySelector(".ma-on").checked })).filter((x) => x.len >= 2);
        out.d = rd("d"); out.w = rd("w");
        const pr = f.querySelector("[name=preset]").value;
        out.custom = !pr; if (pr) out.preset = pr;
        return out;
      }
      for (const el of f.querySelectorAll("[name]")) {
        const key = el.name;
        if (el.type === "checkbox") out[key] = el.checked;
        else if (el.type === "number" || el.hasAttribute("data-num")) out[key] = Number(el.value);
        else out[key] = el.value;
      }
      return out;
    };
    const wmText = (v) => {
      const r = cur.row, tf = cfg.tf === "D" ? "1D" : cfg.tf === "W" ? "1W" : cfg.tf, sz = { S: 0.75, M: 1, L: 1.3 }[v.size] || 1;
      const ln = [v.symbol ? [`${r.symbol || r.name}, ${tf}`, 22] : null, v.name && r.name ? [`${r.name}${v.mcap && r.mcap_cr ? ` · ₹${fmt(r.mcap_cr, 0)} Cr` : ""}`, 13] : null,
        v.sector && r.sector ? [[r.sector, r.basic_industry || r.industry].filter(Boolean).join(", "), 12] : null].filter(Boolean);
      return `<div class="ipd-wm" style="color:${esc(soft(v.color, 0.75))};justify-content:${{ top: "flex-start", middle: "center", bottom: "flex-end" }[v.pos] || "center"}">${ln.map(([t, s]) => `<span style="font-size:${Math.round(s * sz)}px">${esc(t)}</span>`).join("")}</div>`;
    };
    const preview = () => {
      kill();
      const el = pop.querySelector("#ipPrev");
      if (!el || !cur || !cur.daily) return;
      const v = read(sel);
      if (sel === "watermark") { el.innerHTML = wmText(v); return; }
      const tmp = JSON.parse(JSON.stringify(cfg));
      for (const k in tmp.ind) tmp.ind[k].on = false;
      tmp.ind[sel] = { ...v, on: true, hidden: false };
      const onlyPane = !PRICE_INDS.includes(sel) && !(sel === "volume" && v.pane === "price");
      const token = {};
      pop._tok = token;
      draw(false, { el, cfg: tmp, only: onlyPane, alive: () => pop.isConnected && pop._tok === token }).then((ch) => { if (ch && pop.isConnected && pop._tok === token) prev = ch; else if (ch) ch.remove(); });
    };
    const showK = (k) => {
      kill();
      sel = k;
      ticks();
      const on = cfg.ind[k].on, wk = S.tfParse(cfg.tf).u !== "D";
      pop.querySelector("#ipB").innerHTML = `<h3>${esc(indLabel(k))}</h3><p class="ipd-d">${esc(indDesc(k))}</p>
        <div class="ipd-pv"><div class="ipd-pvh"><span>Preview · <b>${esc(cur.row.symbol || cur.row.name || "")}</b></span><span>${wk ? "Last 60 weeks" : "Last 3 months"}</span></div><div class="ipd-pvc" id="ipPrev"></div></div>
        <form id="ipForm" class="ipd-form" onsubmit="return false">${(forms[k] || (() => ""))(cfg.ind[k])}</form>`;
      pop.querySelector("#ipF").innerHTML = `<button type="button" class="ipd-ib" data-ip="reset" title="Back to the standard settings" aria-label="Reset">${RESET_ICO}</button>
        ${on ? `<button type="button" class="ipd-ib" data-ip="remove" title="Remove from the chart" aria-label="Remove">${ICO.trash}</button>` : ""}<span></span>
        <button type="button" class="btn" data-ip="cancel">Cancel</button><button type="button" class="btn primary" data-ip="apply">${on ? "Update" : "Apply"}</button>`;
      pop.querySelector("#ipB").scrollTop = 0;
      preview();
    };
    const renumber = () => pop.querySelectorAll(".ma-list").forEach((l) => l.querySelectorAll(".ma-n").forEach((n, j) => { n.textContent = `MA ${j + 1}`; }));
    const custom = () => { const p = pop.querySelector("#ipForm [name=preset]"); if (p) p.value = ""; };
    wireSwatches(pop, () => { if (sel === "ma") custom(); preview(); });
    pop.querySelector(".ipd-q input").oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      pop.querySelectorAll(".ipd-it").forEach((r) => { r.hidden = !!q && !r.dataset.t.includes(q); });
      pop.querySelectorAll(".ipd-g").forEach((g) => { g.hidden = ![...g.querySelectorAll(".ipd-it")].some((r) => !r.hidden); });
    };
    pop.addEventListener("change", (e) => {
      if (!e.target.closest("#ipForm")) return;
      if (e.target.name === "preset") {
        if (e.target.value) {
          const p = maPreset(e.target.value);
          for (const tf of ["d", "w"]) pop.querySelector(`.ma-list[data-tf=${tf}]`).innerHTML = (p[tf] || []).map((m, j) => maLine(maRow(m, j), j)).join("");
        }
      } else if (sel === "ma") custom();
      preview();
    });
    pop.addEventListener("input", (e) => { if (e.target.closest("#ipForm") && e.target.type === "number") { if (sel === "ma") custom(); preview(); } });
    pop.addEventListener("click", (e) => {
      const it = e.target.closest(".ipd-it"); if (it) return showK(it.dataset.k);
      const sb = e.target.closest(".ipseg button");
      if (sb) {
        const g = sb.closest(".ipseg");
        g.querySelector("input").value = sb.dataset.v;
        g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === sb));
        return preview();
      }
      const add = e.target.closest("[data-add]");
      if (add) {
        const list = pop.querySelector(`.ma-list[data-tf=${add.dataset.add}]`), j = list.children.length;
        list.insertAdjacentHTML("beforeend", maLine({ type: "SMA", len: 50, color: MA_COLORS[j % MA_COLORS.length], on: true }, j));
        custom(); return preview();
      }
      const del = e.target.closest("[data-del]");
      if (del) { del.closest(".ma-r").remove(); renumber(); custom(); return preview(); }
      const a = e.target.closest("[data-ip]"); if (!a) return;
      const act = a.dataset.ip;
      if (act === "cancel") return shut();
      if (act === "savedef") {
        const v = read("ma");
        store.set("sd-ma-mine", { label: "My preset", d: v.d, w: v.w });
        const p = pop.querySelector("#ipForm [name=preset]"); if (p) p.value = "mine";
        const n = pop.querySelector(".ipd-saved"); if (n) { n.hidden = false; setTimeout(() => { n.hidden = true; }, 2200); }
        return;
      }
      if (act === "reset") {
        const keep = cfg.ind[sel].on;
        const fresh = { ...JSON.parse(JSON.stringify(DEFAULTS.ind[sel])), on: keep };
        pop.querySelector("#ipForm").innerHTML = forms[sel](fresh);
        return preview();
      }
      if (act === "remove") cfg.ind[sel] = { ...cfg.ind[sel], on: false, hidden: false };
      if (act === "apply") cfg.ind[sel] = { ...read(sel), on: true, hidden: false };
      save(); shut(); draw(true); renderTools();
    });
    showK(sel);
  }

  /* chart settings: a drawer from the right, changes show at once (reference look 13-Nov-2026: one scrolling panel,
     Markers / Display tabs jump to their part, chart style cards, checkboxes with a small sample on the right).
     o.note = a yellow hint on top (Major Indices), o.onChange(cfg) = called after every change. */
  function settingsDrawer(o = {}) {
    const mk = cfg.marks, ch = cfg.chips, sh = cfg.show;
    const info = (t) => `<i class="sd-i" title="${esc(t)}">i</i>`;
    const row = (name, label, on, tip, sample) => `<label class="sd-r"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span>${label}</span>${tip ? info(tip) : ""}<em class="sd-smp">${sample || ""}</em></label>`;
    const cdl = (c, y, h) => `<svg viewBox="0 0 10 22" width="9" height="20"><line x1="5" x2="5" y1="${y - 3}" y2="${y + h + 3}" stroke="${c}" stroke-width="1.4"/><rect x="1.5" y="${y}" width="7" height="${h}" rx="1.6" fill="${c}"/></svg>`;
    const smp = { pivot: '<svg viewBox="0 0 30 8" width="30" height="8"><path d="M1 4h28" stroke="#5b9bd5" stroke-width="1.6"/></svg>',
      tight: '<i class="sd-tb"></i>', inside: '<i class="sd-io"></i>', earn: '<b class="sd-bd">E</b>', news: '<b class="sd-bd">N</b>',
      circ: '<svg viewBox="0 0 30 8" width="30" height="8"><path d="M1 4h28" stroke="#d9a441" stroke-width="1.4" stroke-dasharray="2 2"/></svg>',
      hl: '<svg viewBox="0 0 30 8" width="30" height="8"><path d="M1 2h28M1 6h28" stroke="#e57373" stroke-width="1" stroke-dasharray="3 2"/></svg>', sw: "▾▴" };
    const body = `<div class="sd-tabs" role="tablist"><button type="button" data-go="m" class="on">Markers</button><button type="button" data-go="d">Display</button></div>
      <form class="f sd-scroll" id="sdForm">${o.note ? `<p class="sd-note">${esc(o.note)}</p>` : ""}
      <section data-p="m"><h6>Chart style</h6><div class="sd-styles">${Object.entries(STYLES).map(([k, s]) => `<label class="sd-style"><input type="radio" name="style" value="${k}" ${cfg.style === k ? "checked" : ""}>
        <span class="sd-c">${cdl(s.up, 4, 11)}${cdl(s.down, 7, 9)}</span>${s.label}</label>`).join("")}</div>
      <h5>Markers</h5><h6>Setups</h6>${row("pivot", "Pivot / breakout line", mk.pivot, "", smp.pivot)}
      ${row("tight", "Tight areas", mk.tight, "5 or more closes within 2 % of each other (green band)", smp.tight)}
      ${row("inside", "Inside bars", mk.inside, "A bar that stays inside the previous bar's high-low range", smp.inside)}
      <h6>Events</h6>${row("earnings", "Earnings dates", mk.earnings !== false, "E on the quarterly results days", smp.earn)}
      ${row("news", "News markers", mk.news !== false, "Letters for the company's NSE filings: orders, deals, management, corporate actions ... (hover a letter for details)", smp.news)}
      ${row("circuit", "Circuit limits", mk.circuit, "", smp.circ)}
      <h6>Price levels</h6>${row("hilo52", "52-week high & low", mk.hilo52, "", smp.hl)}
      ${row("swings", "Swing % moves", mk.swings, "", smp.sw)}</section>
      <section data-p="d"><h5>Display</h5><h6>Around the chart</h6>${row("s_earn", "Earnings snapshot", sh.earn !== false)}
      ${row("s_desc", "Company description", sh.desc !== false)}
      <h6>Header chips</h6><div class="sd-pills">${[["c_float", "Float", ch.float], ["c_rs", "RS rating", ch.rs], ["c_stage", "Stage", ch.stage], ["c_theme", "Theme", ch.theme !== false], ["c_from", "From high", ch.from]]
        .map(([n, l, on]) => `<label class="sd-pill"><input type="checkbox" name="${n}" ${on ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></section>
      </form>
      <div class="sd-foot"><button class="btn" type="button" data-sd="reset">Reset</button><button class="btn primary" type="button" data-x>Done</button></div>`;
    const m = modal("Chart settings", body, null, false, "drawer sd");
    const f = m.querySelector("#sdForm");
    const apply = () => {
      const e = f.elements;
      cfg.style = e.style.value;
      for (const k of ["inside", "circuit", "hilo52", "swings", "pivot", "tight", "earnings", "news"]) cfg.marks[k] = e[k].checked;
      cfg.marks.cup = cfg.marks.vcp = cfg.marks.pivot;          // the base drawing goes with the pivot line
      cfg.marks.actions = cfg.marks.news;                        // corporate actions are filings too
      cfg.chips = { float: e.c_float.checked, rs: e.c_rs.checked, stage: e.c_stage.checked, from: e.c_from.checked, theme: e.c_theme.checked };
      const earnWas = cfg.show.earn !== false;
      cfg.show = { ...cfg.show, earn: e.s_earn.checked, desc: e.s_desc.checked, due: e.s_desc.checked };
      save();
      if (cur && cur.daily) { draw(true); renderTools(); if (earnWas !== (cfg.show.earn !== false)) earningsTable(); }
      if (o.onChange) o.onChange(cfg);
    };
    f.addEventListener("change", apply);
    // tabs jump to their part; scrolling marks the tab of the part in view
    const tabs = [...m.querySelectorAll("[data-go]")], secs = [...f.querySelectorAll("section[data-p]")];
    const mark = (k) => tabs.forEach((b) => b.classList.toggle("on", b.dataset.go === k));
    const dSec = secs[1];
    f.addEventListener("scroll", () => mark(dSec.offsetTop - f.offsetTop <= f.scrollTop + 60 || f.scrollTop + f.clientHeight >= f.scrollHeight - 2 ? "d" : "m"));
    m.addEventListener("click", (e) => {
      const t = e.target.closest("[data-go]");
      if (t) { const s = secs.find((x) => x.dataset.p === t.dataset.go); f.scrollTo({ top: t.dataset.go === "m" ? 0 : s.offsetTop - f.offsetTop - 6, behavior: "smooth" }); mark(t.dataset.go); }
      if (e.target.closest("[data-sd=reset]")) {
        cfg.style = DEFAULTS.style; cfg.marks = { ...DEFAULTS.marks }; cfg.chips = { ...DEFAULTS.chips }; cfg.show = { ...DEFAULTS.show }; cfg.grid = DEFAULTS.grid;
        save(); m.shut();
        if (cur && cur.daily) { draw(true); renderTools(); earningsTable(); }
        if (o.onChange) o.onChange(cfg);
        setTimeout(() => settingsDrawer(o), 150);
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
      let rr = 0;
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (!rr) rr = requestAnimationFrame(() => { rr = 0; this.render(); }); });
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
      const sdr = cur.scanDraw;
      if (cur.pattern || (sdr && (sdr.wave || sdr.arc || sdr.arrow || sdr.cup))) series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
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
    /** a daily date -> the time of the bar that holds it (weekly / monthly / custom charts) */
    barT(t) {
      const B = cur && cur.bars; if (!B || !B.length) return t;
      let lo = 0, hi = B.length - 1; if (t < B[0].time) return B[0].time;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].time <= t) lo = m; else hi = m - 1; }
      return B[lo].time;
    },
    /** the open scanner's drawing (scanDrawing) in the SVG layer */
    scanParts(parts, pb) {
      const sd = cur.scanDraw;
      if (!sd || !this.series) return;
      const X = (t) => this.chart.timeScale().timeToCoordinate(this.barT(t)), Y = (p) => { const y = this.series.priceToCoordinate(p); return y == null ? null : y + this.paneTop(); };
      const blue = SCAN_BLUE;
      for (const ln of sd.lines || []) {
        let x1 = X(ln.t1), x2 = X(ln.t2); const y = Y(ln.p);
        if (y == null) continue;
        if (x1 == null) x1 = 0;
        if (x2 == null) continue;
        parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${blue}" stroke-width="1.6" stroke-linecap="round"/>`);
        if (ln.tick) parts.push(`<line x1="${x2}" y1="${y}" x2="${x2}" y2="${y + 7}" stroke="${blue}" stroke-width="1.6" stroke-linecap="round"/>`);
      }
      if (sd.arc && pb) {          // a smooth arc just under the base's lowest low (like the reference's base drawing)
        const x1 = X(sd.arc.t1), x2 = X(sd.arc.t2), yl = Y(sd.arc.lo);
        if (x1 != null && x2 != null && yl != null && x2 - x1 > 8) {
          const floor = pb.top + pb.h - 6, y0 = Math.min(yl + 12, floor - 14), d = Math.max(10, Math.min(42, (x2 - x1) * 0.09, floor - y0));
          parts.push(`<path d="M${x1},${y0} Q${(x1 + x2) / 2},${y0 + 2 * d} ${x2},${y0}" stroke="${blue}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
        }
      }
      if (sd.wave) {               // VCP: a wave under the price - deep first pullback, then smaller ones, -% under each trough
        // placed in pixels under the base's lowest low so it always fits inside the price pane (labels included)
        const W = sd.wave, yLo = Y(W.lo), bottom = pb ? pb.top + pb.h - 26 : null;
        const maxD = Math.max(...W.legs.map((g) => g.depth));
        const yb = yLo == null ? null : Math.min(yLo + 14, bottom != null ? bottom - 20 : yLo + 14);
        const room = yb == null ? 0 : Math.max(16, Math.min(64, (bottom != null ? bottom : yb + 64) - yb));
        const pts = [];
        W.legs.forEach((g) => { pts.push([g.hiT, 0, null]); pts.push([g.loT, (g.depth / maxD) * room, g.depth]); });
        pts.push([W.endT, -room * 0.12, null]);
        const xy = yb == null ? [] : pts.map(([t, dy, d]) => { const x = X(t); return x == null ? null : [x, yb + dy, d]; }).filter(Boolean);
        if (xy.length >= 3) {
          let d = `M${xy[0][0]},${xy[0][1]}`;
          for (let i = 0; i < xy.length - 1; i++) {      // Catmull-Rom -> cubic Bezier
            const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
            d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
          }
          parts.push(`<path d="${d}" stroke="${blue}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
          xy.filter((q) => q[2] != null).forEach(([x, y, dep]) => {
            const tx = `-${dep.toFixed(1)}%`, w = tx.length * 6.2 + 12;
            parts.push(`<g><rect x="${x - w / 2}" y="${y + 5}" width="${w}" height="16" rx="3" fill="${blue}"/><text x="${x}" y="${y + 16.5}" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="600">${tx}</text></g>`);
          });
        }
      }
      if (sd.arrow) {              // big reversal: an arrow pointing up at the reversal day
        const x = X(sd.arrow.t), y = Y(sd.arrow.p);
        if (x != null && y != null) parts.push(`<g stroke="${blue}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M${x},${y + 26} V${y + 7}"/><path d="M${x - 5},${y + 12} L${x},${y + 6} L${x + 5},${y + 12}"/></g>`);
      }
      if (sd.cup) {                // shakeout: a "U" under the shakeout day
        const x = X(sd.cup.t), y = Y(sd.cup.p), xa = X(sd.cup.t1), xb = X(sd.cup.t2);
        if (x != null && y != null) {
          const hw = Math.max(9, Math.min(22, xa != null && xb != null ? (xb - xa) * 0.75 : 12));
          parts.push(`<path d="M${x - hw},${y + 6} Q${x},${y + 6 + hw * 2.6} ${x + hw},${y + 6}" stroke="${blue}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
        }
      }
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
      if (pat) { const pp = []; this.pattern(pp); this.scanParts(pp, pb); pat.innerHTML = clip + `<g clip-path="url(#chClip)">${pp.join("")}</g>`; }
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

  /** fetch a stock's chart file ahead (the next rows of a list), so opening it is instant */
  const prefetch = (id, kind = "s") => { if (id) getChartFile(kind, id).catch(() => null); };
  window.SDChart = { open, close, prefetch, settings: () => cfg, settingsDrawer, STYLES, _chart: () => cur && cur.chart, _cur: () => cur, _drawings: drawings, loadLib, modal };
})();
