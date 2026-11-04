/* Swing Trading Dashboard - page logic (pure helpers are in logic.js as SD, indicators in ind.js as SDI, the chart in chart.js
   as SDChart). Hash routes:
   #/  market   #/stocks  results table + chart   #/screener   #/sectors[/<sector>[/<industry>]]   #/watchlist
   #/i/<s|n|b>/<id>  detail with chart */
(function () {
  "use strict";
  const $ = (sel, el = document) => el.querySelector(sel);
  const view = $("#view");
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
    screen: null, screenByKey: new Map(), screenDate: "",
    stocks: Object.assign({ universe: "all", sector: "", text: "", sort: "rs_rating", dir: "desc", cols: SD.DEFAULT_COLUMNS.slice() },
      store.get("sd-stocks", {}), { limit: PAGE }),
    selected: new Set(), current: null,
  };
  state.stocks.cols = state.stocks.cols.filter((c) => SD.COLUMNS[c]);
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

  /* ------------------------------------------------------------------ stocks: results table + chart (Phase S5) */
  async function loadScreen() {
    if (state.screen) return state.screen;
    const snap = await getJSON("data/screen.json");
    state.screen = SD.screenRows(snap);
    state.screen.forEach((r) => state.screenByKey.set(r.key, r));
    state.screenDate = snap.data_date;
    return state.screen;
  }
  const wide = () => matchMedia("(min-width: 1100px)").matches;
  const routeName = () => location.hash.replace(/^#\/?/, "").split("/")[0];

  function cellHTML(r, c) {
    const col = SD.COLUMNS[c], v = r[c];
    const txt = esc(SD.fmtCell(v, col.fmt));
    if (col.fmt === "pct" || col.fmt === "signed") return `<span class="${SD.colorClass(v)}">${txt}</span>`;
    if (col.fmt === "stage" && v) return `<span class="stg s${String(v).replace("A", "a")}">${txt}</span>`;
    return txt;
  }

  async function renderStocks() {
    const st = state.stocks;
    if (!state.screen) view.innerHTML = `<p class="empty">Loading all stocks…</p>`;
    try { await loadScreen(); } catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "stocks") return;
    const sectors = [...new Set(state.screen.map((r) => r.sector).filter(Boolean))].sort();
    const sortItem = SD.SORTS.find((x) => x[0] === st.sort);
    const sortName = sortItem ? sortItem[1] : SD.COLUMNS[st.sort] ? SD.COLUMNS[st.sort].label : st.sort;
    view.innerHTML = `<h1>Stocks</h1><p class="sub">Every NSE main-board stock with all indicator fields of ${SD.fmtDate(state.screenDate)}.
      Pick columns with ⚙, sort with the menu or a column title, tick rows to copy or export.${wide() ? " Click a row for its chart, ↑ / ↓ to move." : " Tap a row for its chart."}</p>
      <div class="controls">${seg("uni", [["all", "All"], ["liquid", "Liquid"], ["n500", "Nifty 500"], ["fno", "F&O"]], st.universe)}
        <select id="sector" aria-label="Sector"><option value="">All sectors</option>${sectors.map((x) => `<option ${x === st.sector ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
        <input id="q" type="search" placeholder="Search symbol, name, industry" value="${esc(st.text)}" aria-label="Search">
        <div class="menu-wrap"><button class="btn" id="sortBtn" type="button">Sort: ${esc(sortName)} ${st.dir === "asc" ? "▲" : "▼"}</button>
          <div class="menu" id="sortMenu" hidden>${SD.SORTS.map(([k, label]) => `<button type="button" data-sort="${k}" class="${k === st.sort ? "on" : ""}">${label}</button>`).join("")}
          <button type="button" data-flip>Reverse order ⇅</button></div></div>
        <button class="btn" id="colBtn" type="button" title="Column settings">⚙ Columns</button>
        <button class="btn" id="copy" type="button" title="Copy symbols as NSE:SYMBOL (TradingView watchlist format)">Copy</button>
        <button class="btn" id="csv" type="button">CSV</button></div>
      <div class="split ${wide() ? "on" : ""}"><div id="tbl" class="list"></div><div class="chart-pane" id="pane"><p class="empty">Click a stock to see its chart.</p></div></div>
      <div class="foot-bar" id="fbar"></div>`;
    let rows = [];
    const footer = () => { $("#fbar").textContent = `${rows.length.toLocaleString("en-IN")} stocks · ${state.screen.length.toLocaleString("en-IN")} scanned · `
      + `${state.selected.size} selected · data ${SD.fmtDate(state.screenDate)} · Not investment advice`; };
    const draw = () => {
      rows = SD.sortRows(SD.filterStocks(state.screen, st), st.sort, st.dir);
      const cols = st.cols;
      const mark = (c) => (st.sort === c ? (st.dir === "asc" ? " ▲" : " ▼") : "");
      const head = `<th class="l"><input type="checkbox" id="selAll" aria-label="Select all shown"></th><th class="l sticky ${st.sort === "symbol" ? "sorted" : ""}" data-col="symbol">Stock${mark("symbol")}</th>`
        + `<th data-col="close" class="${st.sort === "close" ? "sorted" : ""}">LTP${mark("close")}</th>`
        + cols.map((c) => `<th data-col="${c}" class="${SD.COLUMNS[c].fmt === "text" ? "l " : ""}${st.sort === c ? "sorted" : ""}">${esc(SD.COLUMNS[c].label)}${mark(c)}</th>`).join("");
      const body = rows.slice(0, st.limit).map((r) => `<tr data-key="${esc(r.key)}" class="${state.current === r.key ? "cur" : ""}">`
        + `<td class="l"><input type="checkbox" data-sel="${esc(r.key)}" ${state.selected.has(r.key) ? "checked" : ""} aria-label="Select ${esc(r.symbol)}"></td>`
        + `<td class="l sticky name"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></td><td class="num">${SD.fmtPrice(r.close)}</td>`
        + cols.map((c) => `<td class="${SD.COLUMNS[c].fmt === "text" ? "l" : "num"}">${cellHTML(r, c)}</td>`).join("") + "</tr>").join("");
      const more = rows.length > st.limit ? `<button class="btn more" data-more type="button">Show more (${rows.length - st.limit} left)</button>` : "";
      $("#tbl").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`
        : `<div class="table-wrap"><div class="empty">Nothing matches.</div></div>`;
      footer();
      store.set("sd-stocks", { universe: st.universe, sector: st.sector, sort: st.sort, dir: st.dir, cols: st.cols });
    };
    draw();
    const openRow = (key, scroll) => {
      const r = state.screenByKey.get(key);
      if (!r) return;
      if (!wide()) { location.hash = "#/i/s/" + r.id; return; }
      state.current = key;
      view.querySelectorAll("tr.cur").forEach((x) => x.classList.remove("cur"));
      const tr = view.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
      if (tr) { tr.classList.add("cur"); if (scroll) tr.scrollIntoView({ block: "nearest" }); }
      SDChart.open($("#pane"), r, { kind: "s" });
    };
    $("#tbl").onclick = (e) => {
      const th = e.target.closest("th[data-col]");
      if (th) { const c = th.dataset.col; st.dir = st.sort === c ? (st.dir === "asc" ? "desc" : "asc") : c === "symbol" ? "asc" : "desc"; st.sort = c; return renderStocks(); }
      if (e.target.id === "selAll") { rows.slice(0, st.limit).forEach((r) => (e.target.checked ? state.selected.add(r.key) : state.selected.delete(r.key))); return draw(); }
      const sel = e.target.closest("[data-sel]");
      if (sel) { if (sel.checked) state.selected.add(sel.dataset.sel); else state.selected.delete(sel.dataset.sel); return footer(); }
      if (e.target.closest("[data-more]")) { st.limit += PAGE; return draw(); }
      const tr = e.target.closest("tr[data-key]");
      if (tr) openRow(tr.dataset.key, false);
    };
    view.onkeydown = (e) => {
      if (!wide() || !state.current || !["ArrowDown", "ArrowUp"].includes(e.key) || e.target.matches("input, select, textarea")) return;
      const i = rows.findIndex((r) => r.key === state.current), j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (rows[j]) { e.preventDefault(); if (j >= st.limit) { st.limit += PAGE; draw(); } openRow(rows[j].key, true); }
    };
    $("[data-seg=uni]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; st.universe = b.dataset.v; st.limit = PAGE; setOn(e.currentTarget, b); draw(); };
    $("#sector").onchange = (e) => { st.sector = e.target.value; st.limit = PAGE; draw(); };
    $("#q").oninput = (e) => { st.text = e.target.value; st.limit = PAGE; draw(); };
    $("#sortBtn").onclick = () => { $("#sortMenu").hidden = !$("#sortMenu").hidden; };
    $("#sortMenu").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.flip != null) st.dir = st.dir === "asc" ? "desc" : "asc";
      else { const s = SD.SORTS.find((x) => x[0] === b.dataset.sort); st.sort = s[0]; st.dir = s[2]; }
      renderStocks();
    };
    $("#colBtn").onclick = () => columnSettings(() => renderStocks());
    const picked = () => (state.selected.size ? rows.filter((r) => state.selected.has(r.key)) : rows);
    $("#copy").onclick = async () => {
      const list = picked(), txt = list.map((r) => "NSE:" + r.symbol).join(",");
      try { await navigator.clipboard.writeText(txt); $("#copy").textContent = `Copied ${list.length}`; } catch (e) { prompt("Copy these symbols:", txt); }
      setTimeout(() => { const b = $("#copy"); if (b) b.textContent = "Copy"; }, 2000);
    };
    $("#csv").onclick = () => {
      const cols = ["symbol", "name", "close", ...st.cols];
      const blob = new Blob([SD.toCSV(picked(), cols)], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `stocks-${state.screenDate}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    if (wide()) {
      const first = state.current && rows.some((r) => r.key === state.current) ? state.current : rows[0] && rows[0].key;
      if (first) openRow(first, false);
    }
  }

  function columnSettings(done) {
    const st = state.stocks;
    const m = document.createElement("div");
    m.className = "modal-bg";
    const groups = SD.COLUMN_GROUPS.map(([g, cols]) => `<details ${g === "General" ? "open" : ""}><summary>${g} <small>${cols.length}</small></summary>`
      + cols.map(([id, label]) => `<label class="f-row" data-t="${esc(label.toLowerCase())}"><input type="checkbox" value="${id}" ${st.cols.includes(id) ? "checked" : ""}> ${esc(label)}</label>`).join("") + "</details>").join("");
    const mine = () => st.cols.map((c, i) => `<div class="mine-row"><span>${esc(SD.COLUMNS[c].label)}</span><span>`
      + `<button class="btn sm" data-up="${i}" type="button" aria-label="Move up">↑</button><button class="btn sm" data-down="${i}" type="button" aria-label="Move down">↓</button>`
      + `<button class="btn sm" data-rm="${c}" type="button" aria-label="Remove">✕</button></span></div>`).join("");
    m.innerHTML = `<div class="modal wide" role="dialog" aria-label="Column settings"><div class="modal-h"><b>Column settings</b>
      <button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b cols-grid">
      <div><input type="search" id="colQ" placeholder="Search columns" aria-label="Search columns"><div id="colGroups">${groups}</div></div>
      <div><h4>Your columns <small id="nCols">${st.cols.length}</small> <button class="btn sm" id="colReset" type="button">Reset</button></h4><div id="mine">${mine()}</div>
      <p class="muted small">Changes are saved automatically in this browser.</p></div></div></div>`;
    document.body.appendChild(m);
    const refresh = () => {
      m.querySelector("#mine").innerHTML = mine();
      m.querySelector("#nCols").textContent = st.cols.length;
      m.querySelectorAll("#colGroups input").forEach((i) => { i.checked = st.cols.includes(i.value); });
      store.set("sd-stocks", { ...store.get("sd-stocks", {}), cols: st.cols });
    };
    m.addEventListener("change", (e) => {
      if (!e.target.matches("#colGroups input")) return;
      const v = e.target.value;
      st.cols = e.target.checked ? [...st.cols.filter((c) => c !== v), v] : st.cols.filter((c) => c !== v);
      refresh();
    });
    const shut = () => { m.remove(); document.removeEventListener("keydown", onKey); done(); };
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    document.addEventListener("keydown", onKey);
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) return shut();
      const t = e.target.closest("button"); if (!t) return;
      if (t.id === "colReset") st.cols = SD.DEFAULT_COLUMNS.slice();
      else if (t.dataset.rm) st.cols = st.cols.filter((c) => c !== t.dataset.rm);
      else if (t.dataset.up != null || t.dataset.down != null) {
        const i = Number(t.dataset.up != null ? t.dataset.up : t.dataset.down), j = t.dataset.up != null ? i - 1 : i + 1;
        if (j >= 0 && j < st.cols.length) [st.cols[i], st.cols[j]] = [st.cols[j], st.cols[i]];
      } else return;
      refresh();
    });
    m.querySelector("#colQ").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      m.querySelectorAll("#colGroups label").forEach((l) => { l.style.display = l.dataset.t.includes(q) ? "" : "none"; });
      if (q) m.querySelectorAll("#colGroups details").forEach((d) => { d.open = true; });
    };
  }

  /* ------------------------------------------------------------------ detail + chart */
  async function renderDetail(kindKey, id) {
    const key = `${kindKey}:${id}`;
    let r = state.byKey.get(key);
    const isStock = kindKey === "s";
    if (isStock) { try { await loadScreen(); } catch (e) { /* fall back to the market row */ } r = state.screenByKey.get(key) || r; }
    if (location.hash.replace(/^#\/?/, "") !== `i/${kindKey}/${id}`) return;
    if (!r) { view.innerHTML = `<p class="empty">Not found. <a href="#/">Back to market</a></p>`; return; }
    const lr = state.byKey.get(key) || {};
    const stat = (label, val) => `<div class="stat"><small>${label}</small><b>${val}</b></div>`;
    view.innerHTML = `<div class="crumbs"><a href="${isStock ? "#/stocks" : "#/"}">${isStock ? "Stocks" : "Market"}</a> › ${esc(r.symbol)}</div>
      <div class="d-head"><h1>${esc(r.name || r.symbol)}</h1><span class="muted">${esc(r.symbol)} · ${esc(r.exchange || "NSE")}${isStock ? (r.sector ? " · " + esc(r.sector) : "") + (r.basic_industry ? " › " + esc(r.basic_industry) : "") : " index"}</span>
        <button class="star ${state.watch.has(key) ? "on" : ""}" data-star="${esc(key)}" aria-label="Watchlist" style="font-size:20px">★</button></div>
      <div class="chart-box big" id="chartBox"></div>
      ${isStock ? `<div class="stats">
        ${stat("Market cap", r.mcap_cr != null ? "₹" + SD.fmtCell(r.mcap_cr, "cr") + " Cr" : "–")}${stat("Free float", r.float_pct != null ? Number(r.float_pct).toFixed(1) + "%" : "–")}
        ${stat("RS rating / 1W change", `${r.rs_rating ?? "–"} / ${SD.fmtCell(r.rs_chg_1w, "signed")}`)}${stat("Stage", SD.fmtCell(r.stage, "stage"))}
        ${stat("RSI (14) / ADR %", `${SD.fmtCell(r.rsi14, "num1")} / ${SD.fmtCell(r.adr_pct, "num2")}`)}${stat("52W high / from it", `${SD.fmtPrice(r.hi52)} / ${pct(r.from_hi52)}`)}
        ${stat("1M / 3M / 1Y", `${pct(r.ret_1m)} / ${pct(r.ret_3m)} / ${pct(r.ret_1y)}`)}${stat("Turnover / delivery", `₹${SD.fmtCell(r.turnover_cr, "num2")} Cr / ${SD.fmtCell(r.deliv_pct, "num1")}%`)}
        ${stat("F&O / circuit band", `${r.fno ? "Yes" : "No"} / ${esc(r.price_band || "–")}${/^\d+$/.test(String(r.price_band || "")) ? "%" : ""}`)}${stat("Listed / history from", `${SD.fmtDate(r.listed || "")} / ${SD.fmtDate(lr.first_date || r.listed || "")}`)}
      </div><h2>Corporate actions</h2><div id="acts" class="muted">Loading…</div>` : ""}`;
    view.querySelector("[data-star]").onclick = (e) => { toggleWatch(e.target.dataset.star); e.target.classList.toggle("on"); };
    await SDChart.open($("#chartBox"), r, { kind: kindKey });
    if (isStock && $("#acts")) {
      try {
        const data = await getJSON(`data/c/s/${encodeURIComponent(id)}.json`);
        const m = data.m || [];
        $("#acts").innerHTML = m.length ? `<div class="table-wrap"><table><thead><tr><th class="l">Ex-date</th><th class="l">Action</th><th class="l">Ratio</th></tr></thead><tbody>`
          + [...m].reverse().map((a) => `<tr><td class="l">${SD.fmtDate(a.d)}</td><td class="l">${esc(a.t)}</td><td class="l">${esc(a.r)}</td></tr>`).join("")
          + "</tbody></table></div>" : "None since 2007 (dividends are not adjusted).";
      } catch (e) { $("#acts").textContent = "Not available."; }
    }
  }
  const setOn = (group, btn) => { group.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn)); };

  /* ------------------------------------------------------------------ router + theme */
  function route() {
    if (!state.rows.length) return;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const tab = { "": "market", stocks: "stocks", screener: "screener", sectors: "sectors", watchlist: "watchlist", i: "" }[parts[0]] ?? "market";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    SDChart.close();
    view.onkeydown = null;
    if (parts[0] === "stocks") renderStocks();
    else if (parts[0] === "screener") renderScreener();
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
    if (location.hash.startsWith("#/i/") || location.hash.startsWith("#/stocks")) route();
  };
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
