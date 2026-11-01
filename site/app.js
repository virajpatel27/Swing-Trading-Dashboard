/* Swing Trading Dashboard - page logic (pure helpers are in logic.js as SD). Hash routes:
   #/  market   #/screener   #/sectors[/<sector>[/<industry>]]   #/watchlist   #/i/<s|n|b>/<id>  detail with chart */
(function () {
  "use strict";
  const $ = (sel, el = document) => el.querySelector(sel);
  const view = $("#view");
  const CHART_LIB = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
  const PAGE = 100;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: ignore */ } },
  };
  const state = {
    rows: [], byKey: new Map(), sectors: null, health: null, dataDate: "",
    watch: new Set(store.get("sd-watch", [])),
    market: Object.assign({ view: "all", sector: "", text: "", sort: "chg_1d", dir: "desc", limit: PAGE }, store.get("sd-market", {})),
    screener: Object.assign({ screens: ["above_50_200", "rsi_50_70"], universe: "stock", text: "", sort: "rs_rating", dir: "desc", limit: PAGE },
      store.get("sd-screener", {})),
    period: store.get("sd-period", "1m"),
  };
  state.market.limit = PAGE;
  state.screener.limit = PAGE;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `<span class="${SD.colorClass(x)}">${SD.fmtPct(x)}</span>`;
  const TREND_TAG = { "strong uptrend": "t-up", uptrend: "t-up", "strong downtrend": "t-down", downtrend: "t-down" };

  const COLS = [
    { k: "name", label: "Name", cls: "l sticky", td: "name", html: (r) => r.kind === "stock"
      ? `<b>${esc(r.symbol)}</b><span>${esc(r.name)}</span>` : `<b>${esc(r.name)}</b><span>${r.exchange} index</span>` },
    { k: "close", label: "LTP", html: (r) => SD.fmtPrice(r.close) },
    { k: "chg_1d", label: "1D", html: (r) => pct(r.chg_1d) }, { k: "chg_1w", label: "1W", html: (r) => pct(r.chg_1w) },
    { k: "chg_1m", label: "1M", html: (r) => pct(r.chg_1m) }, { k: "chg_3m", label: "3M", html: (r) => pct(r.chg_3m) },
    { k: "chg_6m", label: "6M", html: (r) => pct(r.chg_6m) }, { k: "chg_1y", label: "1Y", html: (r) => pct(r.chg_1y) },
    { k: "chg_3y", label: "3Y", html: (r) => pct(r.chg_3y) }, { k: "chg_5y", label: "5Y", html: (r) => pct(r.chg_5y) },
    { k: "from_hi52", label: "From 52W H", html: (r) => pct(r.from_hi52) }, { k: "from_lo52", label: "From 52W L", html: (r) => pct(r.from_lo52) },
    { k: "volume", label: "Volume", html: (r) => SD.fmtVol(r.volume) },
    { k: "rsi14", label: "RSI", html: (r) => (r.rsi14 == null ? "–" : r.rsi14.toFixed(1)) },
    { k: "trend", label: "Trend", cls: "l", html: (r) => `<span class="tag ${TREND_TAG[r.trend] || ""}">${esc(r.trend)}</span>` },
    { k: "rs_rating", label: "RS", html: (r) => (r.rs_rating == null ? "–" : r.rs_rating) },
  ];
  const FLAG_TEXT = { above_50_200: "> 50 & 200 EMA", rsi_50_70: "RSI 50-70", near_52w_high: "near 52W high", volume_spike: "volume spike",
    strong_rs: "strong RS", breakout_52w: "52W breakout", breakdown_52w: "52W breakdown", breakout_20d: "20D breakout", breakdown_20d: "20D breakdown" };

  /* ------------------------------------------------------------------ data */
  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  async function load() {
    try {
      const [snap, sectors, health] = await Promise.all([getJSON("data/latest.json"), getJSON("data/sectors.json"),
        getJSON("data/health.json").catch(() => null)]);
      state.rows = SD.rowsFromSnapshot(snap);
      state.rows.forEach((r) => state.byKey.set(r.key, r));
      state.sectors = sectors;
      state.health = health;
      state.dataDate = snap.data_date;
      const h = health ? ` · data check: ${health.errors ? `<span class="bad">${health.errors} errors</span>` : "0 errors"}, ${health.warnings} notes` : "";
      $("#status").innerHTML = `Data as of <b>${SD.fmtDate(snap.data_date)}</b> (end of day) · updated ${esc(snap.generated_at)}${h}`
        + (navigator.onLine ? "" : ' · <span class="bad">offline copy</span>');
      route();
    } catch (e) {
      $("#status").innerHTML = `<span class="bad">Could not load the data (${esc(e.message)}).</span> Check the connection and reload.`;
    }
  }

  /* ------------------------------------------------------------------ table */
  function tableHTML(rows, opt) {
    const cols = opt.cols || COLS;
    const head = `<th class="l" aria-label="Watchlist"></th>` + cols.map((c) =>
      `<th class="${c.cls || ""} ${opt.sort === c.k ? "sorted" : ""}" data-col="${c.k}">${c.label}${opt.sort === c.k ? (opt.dir === "asc" ? " ▲" : " ▼") : ""}</th>`).join("");
    const body = rows.slice(0, opt.limit).map((r) => `<tr data-key="${esc(r.key)}">`
      + `<td class="l"><button class="star ${state.watch.has(r.key) ? "on" : ""}" data-star="${esc(r.key)}" aria-label="Watchlist">★</button></td>`
      + cols.map((c) => `<td class="${[c.td, c.cls || "num"].filter(Boolean).join(" ")}">${c.html(r)}</td>`).join("") + "</tr>").join("");
    const more = rows.length > opt.limit ? `<button class="btn more" data-more>Show more (${rows.length - opt.limit} left)</button>` : "";
    return rows.length ? `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`
      : `<div class="table-wrap"><div class="empty">Nothing matches.</div></div>`;
  }

  /** clicks inside a table: sort, star, show more, open */
  function wireTable(box, st, rerender) {
    box.onclick = (ev) => {
      const th = ev.target.closest("th[data-col]");
      if (th) {
        const c = th.dataset.col;
        st.dir = st.sort === c && st.dir === "desc" ? "asc" : "desc";
        st.sort = c;
        return rerender();
      }
      const star = ev.target.closest("[data-star]");
      if (star) { toggleWatch(star.dataset.star); star.classList.toggle("on"); return; }
      if (ev.target.closest("[data-more]")) { st.limit += PAGE; return rerender(); }
      const tr = ev.target.closest("tr[data-key]");
      if (tr) location.hash = "#/i/" + tr.dataset.key.replace(":", "/");
    };
  }

  function toggleWatch(key) {
    state.watch.has(key) ? state.watch.delete(key) : state.watch.add(key);
    store.set("sd-watch", [...state.watch]);
  }

  function downloadCSV(rows, name) {
    const cols = ["symbol", "name", "kind", "exchange", "sector", "industry", "close", "raw_close", "chg_1d", "chg_1w", "chg_1m", "chg_3m",
      "chg_6m", "chg_1y", "chg_3y", "chg_5y", "from_hi52", "from_lo52", "volume", "rsi14", "trend", "rs_rating", "flags", "date"];
    const blob = new Blob([SD.toCSV(rows, cols)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${state.dataDate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const seg = (name, options, cur) => `<div class="seg" role="group" data-seg="${name}">` + options.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${v === cur ? "on" : ""}">${l}</button>`).join("") + "</div>";

  /* ------------------------------------------------------------------ market */
  function renderMarket() {
    const st = state.market;
    const sectors = [...new Set(state.rows.filter((r) => r.kind === "stock" && r.sector).map((r) => r.sector))].sort();
    view.innerHTML = `<h1>Market</h1><p class="sub">All NSE and BSE indices and all NSE main-board stocks. Tap a column to sort, a row to open its chart.</p>
      <div class="controls">${seg("view", [["all", "All"], ["stock", "All stocks"], ["n500", "Nifty 500"], ["nse", "NSE indices"], ["bse", "BSE indices"]], st.view)}
        <select id="sector" aria-label="Sector"><option value="">All sectors</option>${sectors.map((s) => `<option ${s === st.sector ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <input id="q" type="search" placeholder="Search symbol, name, industry" value="${esc(st.text)}" aria-label="Search">
        <button class="btn" id="csv" type="button">CSV</button> <span class="count" id="count"></span></div><div id="tbl"></div>`;
    const draw = () => {
      const rows = SD.sortRows(SD.filterRows(state.rows, st), st.sort, st.dir);
      $("#count").textContent = `${rows.length} shown`;
      $("#tbl").innerHTML = tableHTML(rows, st);
      store.set("sd-market", { view: st.view, sector: st.sector, sort: st.sort, dir: st.dir });
      return rows;
    };
    let rows = draw();
    wireTable($("#tbl"), st, () => { rows = draw(); });
    $("[data-seg=view]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; st.view = b.dataset.v; st.limit = PAGE; renderMarket(); };
    $("#sector").onchange = (e) => { st.sector = e.target.value; st.limit = PAGE; rows = draw(); };
    $("#q").oninput = (e) => { st.text = e.target.value; st.limit = PAGE; rows = draw(); };
    $("#csv").onclick = () => downloadCSV(rows, "market");
  }

  /* ------------------------------------------------------------------ screener */
  function renderScreener() {
    const st = state.screener;
    const chips = Object.entries(SD.SCREENS).map(([k, s]) =>
      `<label class="chip ${st.screens.includes(k) ? "on" : ""}"><input type="checkbox" value="${k}" ${st.screens.includes(k) ? "checked" : ""}>${s.label}</label>`).join("");
    view.innerHTML = `<h1>Swing screener</h1><p class="sub">Tick the conditions; a result must meet all of them. Indicators use adjusted prices of ${SD.fmtDate(state.dataDate)}.</p>
      <div class="chips" id="chips">${chips}</div>
      <div class="controls">${seg("uni", [["stock", "All stocks"], ["n500", "Nifty 500"], ["all", "Stocks + indices"]], st.universe)}
        <input id="q" type="search" placeholder="Search in results" value="${esc(st.text)}" aria-label="Search">
        <button class="btn" id="csv" type="button">CSV</button> <span class="count" id="count"></span></div><div id="tbl"></div>`;
    const cols = [...COLS.slice(0, 2), COLS[2], COLS[4], COLS[5], COLS[10], COLS[12], COLS[13], COLS[15],
      { k: "flags", label: "Signals", cls: "l", html: (r) => `<div class="flags">${r.flags.map((f) => `<span class="tag">${FLAG_TEXT[f] || f}</span>`).join("")}</div>` }];
    const draw = () => {
      const rows = SD.sortRows(SD.filterRows(state.rows, { view: st.universe, text: st.text, screens: st.screens }), st.sort, st.dir);
      $("#count").textContent = `${rows.length} match`;
      $("#tbl").innerHTML = tableHTML(rows, { ...st, cols });
      store.set("sd-screener", { screens: st.screens, universe: st.universe, sort: st.sort, dir: st.dir });
      return rows;
    };
    let rows = draw();
    wireTable($("#tbl"), st, () => { rows = draw(); });
    $("#chips").onchange = (e) => {
      st.screens = [...view.querySelectorAll("#chips input:checked")].map((i) => i.value);
      e.target.closest(".chip").classList.toggle("on", e.target.checked);
      st.limit = PAGE; rows = draw();
    };
    $("[data-seg=uni]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; st.universe = b.dataset.v; renderScreener(); };
    $("#q").oninput = (e) => { st.text = e.target.value; rows = draw(); };
    $("#csv").onclick = () => downloadCSV(rows, "screener");
  }

  /* ------------------------------------------------------------------ sectors */
  function renderSectors(sector, industry) {
    const p = state.period;
    const key = "chg_" + p;
    const periodSeg = seg("period", [["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["1y", "1Y"]], p);
    const tiles = (items, nameKey, href) => `<div class="heat">${items.map((g) =>
      `<a class="tile h${SD.heatLevel(g[key], p)}" href="${href(g)}"><b>${esc(g[nameKey])}</b><div class="v">${SD.fmtPct(g[key])}</div>`
      + `<small>${g.stocks} stocks · momentum #${g.momentum_rank}</small></a>`).join("")}</div>`;
    const groupTable = (items, nameKey, href, label) => `<div class="table-wrap"><table><thead><tr><th class="l">#</th><th class="l">${label}</th><th>Stocks</th>`
      + ["1d", "1w", "1m", "3m", "6m", "1y"].map((k) => `<th>${k.toUpperCase()}</th>`).join("")
      + `<th>% > EMA50</th><th>% > EMA200</th><th>Avg RS</th></tr></thead><tbody>` + items.map((g) =>
        `<tr data-href="${href(g)}"><td class="l">${g.momentum_rank}</td><td class="l"><b>${esc(g[nameKey])}</b></td><td class="num">${g.stocks}</td>`
        + ["1d", "1w", "1m", "3m", "6m", "1y"].map((k) => `<td class="num">${pct(g["chg_" + k])}</td>`).join("")
        + `<td class="num">${g.pct_above_ema50 ?? "–"}%</td><td class="num">${g.pct_above_ema200 ?? "–"}%</td><td class="num">${g.avg_rs_rating ?? "–"}</td></tr>`).join("")
      + "</tbody></table></div>";
    const enc = encodeURIComponent;
    const all = state.sectors.sectors;
    let html;
    if (!sector) {
      const sorted = [...all].sort((a, b) => (b[key] ?? -1e9) - (a[key] ?? -1e9));
      html = `<h1>Sectors</h1><p class="sub">Median move of the stocks in each NSE sector. Momentum rank = average of the 1M and 3M ranks. Tap a sector for its industries.</p>
        <div class="controls">${periodSeg}</div>${tiles(sorted, "sector", (g) => `#/sectors/${enc(g.sector)}`)}
        <h2>Momentum ranking</h2>${groupTable(all, "sector", (g) => `#/sectors/${enc(g.sector)}`, "Sector")}`;
    } else {
      const sec = all.find((s) => s.sector === sector);
      if (!sec) { view.innerHTML = `<p class="empty">Sector not found.</p>`; return; }
      if (!industry) {
        const sorted = [...sec.industries].sort((a, b) => (b[key] ?? -1e9) - (a[key] ?? -1e9));
        html = `<div class="crumbs"><a href="#/sectors">Sectors</a> › ${esc(sector)}</div><h1>${esc(sector)}</h1>
          <p class="sub">${sec.stocks} stocks · median ${p.toUpperCase()} ${SD.fmtPct(sec[key])} · ${sec.pct_above_ema50}% above EMA50</p>
          <div class="controls">${periodSeg}</div>${tiles(sorted, "industry", (g) => `#/sectors/${enc(sector)}/${enc(g.industry)}`)}
          <h2>Industries</h2>${groupTable(sec.industries, "industry", (g) => `#/sectors/${enc(sector)}/${enc(g.industry)}`, "Industry")}`;
      } else {
        const ind = sec.industries.find((i) => i.industry === industry);
        if (!ind) { view.innerHTML = `<p class="empty">Industry not found.</p>`; return; }
        html = `<div class="crumbs"><a href="#/sectors">Sectors</a> › <a href="#/sectors/${enc(sector)}">${esc(sector)}</a> › ${esc(industry)}</div>
          <h1>${esc(industry)}</h1><p class="sub">${ind.stocks} stocks · median ${p.toUpperCase()} ${SD.fmtPct(ind[key])}</p><div id="tbl"></div>`;
      }
    }
    view.innerHTML = html;
    const ps = $("[data-seg=period]");
    if (ps) ps.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.period = b.dataset.v; store.set("sd-period", state.period); renderSectors(sector, industry); };
    view.querySelectorAll("tr[data-href]").forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
    if (industry) {
      const ids = new Set(all.find((s) => s.sector === sector).industries.find((i) => i.industry === industry).constituents.map((id) => "s:" + id));
      const st = { sort: "rs_rating", dir: "desc", limit: 500 };
      const draw = () => { $("#tbl").innerHTML = tableHTML(SD.sortRows(state.rows.filter((r) => ids.has(r.key)), st.sort, st.dir), st); };
      draw();
      wireTable($("#tbl"), st, draw);
    }
  }

  /* ------------------------------------------------------------------ watchlist */
  function renderWatchlist() {
    const st = state.watchSort || (state.watchSort = { sort: "chg_1d", dir: "desc", limit: 1000 });
    view.innerHTML = `<h1>Watchlist</h1><p class="sub">Tap ★ in any table to add or remove. Saved only in this browser.</p><div id="tbl"></div>`;
    const draw = () => {
      const rows = state.rows.filter((r) => state.watch.has(r.key));
      $("#tbl").innerHTML = rows.length ? tableHTML(SD.sortRows(rows, st.sort, st.dir), st)
        : `<div class="table-wrap"><div class="empty">Your watchlist is empty. Tap ★ next to a stock or index.</div></div>`;
    };
    draw();
    wireTable($("#tbl"), st, draw);
  }

  /* ------------------------------------------------------------------ detail + chart */
  let libPromise = null, chartObj = null;
  function loadLib() {
    if (window.LightweightCharts) return Promise.resolve();
    return libPromise || (libPromise = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = CHART_LIB; s.async = true; s.onload = ok; s.onerror = () => { libPromise = null; fail(new Error("chart library did not load")); };
      document.head.appendChild(s);
    }));
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  async function renderDetail(kindKey, id) {
    const r = state.byKey.get(`${kindKey}:${id}`);
    if (!r) { view.innerHTML = `<p class="empty">Not found. <a href="#/">Back to market</a></p>`; return; }
    const stat = (label, val) => `<div class="stat"><small>${label}</small><b>${val}</b></div>`;
    const isStock = r.kind === "stock";
    view.innerHTML = `<div class="crumbs"><a href="#/">Market</a> › ${esc(r.symbol)}</div>
      <div class="d-head"><h1>${esc(r.name)}</h1><span class="muted">${esc(r.symbol)} · ${r.exchange}${isStock ? " · " + esc(r.sector) + (r.industry ? " › " + esc(r.industry) : "") : " index"}</span>
        <button class="star ${state.watch.has(r.key) ? "on" : ""}" data-star="${esc(r.key)}" aria-label="Watchlist" style="font-size:20px">★</button></div>
      <div class="d-head"><span class="px">${SD.fmtPrice(r.close)}</span><span class="chg ${SD.colorClass(r.chg_1d)}">${SD.fmtPct(r.chg_1d)} today</span>
        <span class="muted">${SD.fmtDate(r.date)}${isStock && r.raw_close !== r.close ? ` · as traded ${SD.fmtPrice(r.raw_close)}` : ""}</span></div>
      <div class="stats">
        ${stat("52W high / low", `${SD.fmtPrice(r.hi52)} / ${SD.fmtPrice(r.lo52)}`)}${stat("From 52W high", pct(r.from_hi52))}
        ${stat("RSI (14)", r.rsi14 ?? "–")}${stat("Trend", `<span class="tag ${TREND_TAG[r.trend] || ""}">${esc(r.trend)}</span>`)}
        ${stat("RS rating / RS 3M", `${r.rs_rating ?? "–"} / ${pct(r.rs_3m)}`)}${stat("EMA 20 / 50 / 200", `${SD.fmtPrice(r.ema20)} / ${SD.fmtPrice(r.ema50)} / ${SD.fmtPrice(r.ema200)}`)}
        ${stat("MACD / signal", `${r.macd ?? "–"} / ${r.macd_signal ?? "–"}`)}${stat("ATR (14)", `${SD.fmtPrice(r.atr14)} (${r.atr_pct ?? "–"}%)`)}
        ${stat("1M / 3M / 1Y", `${pct(r.chg_1m)} / ${pct(r.chg_3m)} / ${pct(r.chg_1y)}`)}${stat("3Y / 5Y", `${pct(r.chg_3y)} / ${pct(r.chg_5y)}`)}
        ${isStock ? stat("Volume / 20D avg", `${SD.fmtVol(r.volume)} / ${SD.fmtVol(r.avg_vol20)}`) : ""}${stat("History from", SD.fmtDate(r.first_date))}
      </div>
      ${r.flags.length ? `<div class="flags" style="margin-bottom:10px">${r.flags.map((f) => `<span class="tag">${FLAG_TEXT[f] || f}</span>`).join("")}</div>` : ""}
      <div class="chart-box"><div class="chart-tools">${seg("range", Object.keys(SD.RANGES).map((k) => [k, k]), store.get("sd-range", "1Y"))}
        ${isStock ? seg("mode", [["adjusted", "Adjusted"], ["raw", "Raw"]], "adjusted") : ""}
        <div class="legend"><span><i style="background:#f59e0b"></i>EMA20</span><span><i style="background:#3b82f6"></i>EMA50</span><span><i style="background:#a855f7"></i>EMA200</span></div></div>
        <div id="chart"><p class="empty">Loading chart…</p></div><p class="note" id="cnote"></p></div>
      ${isStock ? `<h2>Corporate actions</h2><div id="acts" class="muted">Loading…</div>` : ""}`;
    view.querySelector("[data-star]").onclick = (e) => { toggleWatch(r.key); e.target.classList.toggle("on"); };
    let data;
    try {
      [data] = await Promise.all([getJSON(`data/c/${kindKey}/${encodeURIComponent(id)}.json`), loadLib()]);
    } catch (e) {
      $("#chart").innerHTML = `<p class="empty">Chart not available (${esc(e.message)}).</p>`;
      return;
    }
    if (location.hash !== `#/i/${kindKey}/${id}`) return;            // user went elsewhere meanwhile
    const opts = { range: store.get("sd-range", "1Y"), mode: "adjusted" };
    const draw = () => drawChart(data, opts);
    draw();
    $("[data-seg=range]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; opts.range = b.dataset.v; store.set("sd-range", opts.range); setOn(e.currentTarget, b); draw(); };
    const ms = $("[data-seg=mode]");
    if (ms) ms.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; opts.mode = b.dataset.v; setOn(ms, b); draw(); };
    if (isStock) {
      const m = data.m || [];
      $("#acts").innerHTML = m.length ? `<div class="table-wrap"><table><thead><tr><th class="l">Ex-date</th><th class="l">Action</th><th class="l">Ratio</th></tr></thead><tbody>`
        + [...m].reverse().map((a) => `<tr><td class="l">${SD.fmtDate(a.d)}</td><td class="l">${esc(a.t)}</td><td class="l">${esc(a.r)}</td></tr>`).join("")
        + "</tbody></table></div>" : "None since 2007 (dividends are not adjusted).";
    }
  }
  const setOn = (group, btn) => { group.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn)); };

  function drawChart(data, opts) {
    const el = $("#chart");
    if (!el) return;
    if (chartObj) { chartObj.remove(); chartObj = null; }
    el.innerHTML = "";
    const L = window.LightweightCharts;
    const daily = SD.candlesFromChart(data, opts.mode);
    const weekly = ["3Y", "5Y", "MAX"].includes(opts.range);
    const series = weekly ? SD.toWeekly(daily) : daily;
    const shown = SD.sliceRange(series, opts.range);
    const chart = L.createChart(el, {
      autoSize: true, layout: { background: { color: css("--panel") }, textColor: css("--muted"), fontSize: 11 },
      grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } },
      rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line") }, crosshair: { mode: 0 },
    });
    chartObj = chart;
    const up = css("--up"), down = css("--down");
    const cs = chart.addCandlestickSeries({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    cs.setData(shown.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    if (data.v) {
      const vs = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "", color: css("--line") });
      vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(shown.filter((c) => c.volume != null).map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? up + "66" : down + "66" })));
    }
    if (opts.mode === "adjusted") {
      [[20, "#f59e0b"], [50, "#3b82f6"], [200, "#a855f7"]].forEach(([n, color]) => {
        const e = SD.ema(series, n).filter((p) => p.time >= (shown[0] || {}).time);
        chart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(e);
      });
    }
    // corporate action badges: put each on the candle that contains its date
    const first = (shown[0] || {}).time;
    const markers = (data.m || []).map((m) => {
      const t = `${String(m.d).slice(0, 4)}-${String(m.d).slice(4, 6)}-${String(m.d).slice(6, 8)}`;
      const c = [...shown].reverse().find((x) => x.time <= t);
      return c && t >= first ? { time: c.time, position: "aboveBar", color: css("--warn"), shape: "arrowDown", text: `${m.t} ${m.r}`.trim() } : null;
    }).filter(Boolean);
    cs.setMarkers(markers);
    chart.timeScale().fitContent();
    $("#cnote").textContent = (weekly ? "Weekly candles (EMAs of weekly closes). " : "Daily candles. ")
      + (opts.mode === "raw" ? "Raw = prices as traded; EMAs hidden because indicators always use adjusted prices." : data.f ? "Adjusted for splits, bonus, rights, demergers." : "");
  }

  /* ------------------------------------------------------------------ router + theme */
  function route() {
    if (!state.rows.length) return;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const tab = { "": "market", screener: "screener", sectors: "sectors", watchlist: "watchlist", i: "" }[parts[0]] ?? "market";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    if (chartObj && parts[0] !== "i") { chartObj.remove(); chartObj = null; }
    if (parts[0] === "screener") renderScreener();
    else if (parts[0] === "sectors") renderSectors(parts[1], parts[2]);
    else if (parts[0] === "watchlist") renderWatchlist();
    else if (parts[0] === "i") renderDetail(parts[1], parts.slice(2).join("/"));
    else renderMarket();
    window.scrollTo(0, 0);
  }

  $("#theme").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sd-theme", next); } catch (e) { /* ignore */ }
    if (location.hash.startsWith("#/i/")) route();
  };
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
