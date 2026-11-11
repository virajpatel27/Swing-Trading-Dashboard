/* Swing Trading Dashboard - page logic (pure helpers are in logic.js as SD, indicators in ind.js as SDI, the chart in chart.js
   as SDChart). Hash routes:
   #/  home (warm-up)   #/market  all instruments   #/stocks  results table + chart   #/scanners/<id>  scanner results + formula editor   #/fields  all formulas
   #/screener (old simple screener)   #/sectors[/<sector>[/<industry>]]   #/watchlist
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
  const SKEL = (label) => `<div class="skel-page" aria-label="${label}"><i class="skel h"></i><i class="skel s"></i><i class="skel bar"></i>`
    + '<i class="skel row"></i>'.repeat(6) + "</div>";
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
      $("#asof").innerHTML = `Data <b>${SD.fmtDate(snap.data_date)}</b>`;
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

  /* ------------------------------------------------------------------ groups (Phase S9): data/group_ranks.json */
  const TAG_CLS = { Leading: "t-up", Improving: "t-info", Weakening: "t-warn", Lagging: "t-down" };
  const tagHTML = (t) => (t ? `<span class="tag ${TAG_CLS[t] || ""}">${esc(t)}</span>` : "");
  async function renderGroups(level, name, sub) {
    level = ["sector", "industry", "theme"].includes(level) ? level : "sector";
    if (!state.groups) view.innerHTML = SKEL("Loading groups");
    try {
      if (!state.groups) state.groups = await getJSON("data/group_ranks.json");
      await loadScreen();
    } catch (e) { view.innerHTML = `<p class="empty">Groups are not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "groups") return;
    const gs = state.gstate || (state.gstate = { period: store.get("sd-gperiod", "1d"), small: false, q: "", sort: "rs_rating", dir: "desc", shut: {} });
    const p = gs.period, enc = encodeURIComponent, retKey = p === "1d" ? "chg_1d" : "ret_" + p;
    const L = state.groups.levels, all = L[level] || [], cfgG = state.groups.config || {};
    const isWide = wide();
    // default selection: the top-ranked group
    if (!name && isWide) { const top = all.filter((g) => !g.small).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))[0]; if (top) name = top.name; }
    const g = all.find((x) => x.name === name) || null;
    const inds = level === "sector" && g ? (L.industry || []).filter((x) => x.parent === g.name).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.n - a.n) : [];
    const subG = sub ? (L.industry || []).find((x) => x.name === sub) : null;
    const stockGroup = level === "sector" ? (subG || g) : g;
    const ids = stockGroup ? new Set(stockGroup.ids) : new Set();
    const sorters = { symbol: (r) => r.symbol, close: (r) => r.close, ret: (r) => r[retKey], from_hi52: (r) => r.from_hi52, rs_rating: (r) => r.rs_rating };
    const sk = sorters[gs.sort] || sorters.rs_rating;
    const stocks = state.screen.filter((r) => ids.has(r.id)).sort((a, b) => {
      const x = sk(a), y = sk(b);
      if (gs.sort === "symbol") return gs.dir === "asc" ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x));
      return gs.dir === "asc" ? (x ?? 1e9) - (y ?? 1e9) : (y ?? -1e9) - (x ?? -1e9);
    });
    if (state.gStock && !stocks.some((r) => r.key === state.gStock)) state.gStock = null;
    const chartOn = isWide && !!state.gStock;
    const rankCell = (x) => (x.rank == null ? '<span class="muted">–</span>' : `${x.rank}${x.rank_chg ? `<sup class="${x.rank_chg > 0 ? "up" : "down"}">${x.rank_chg > 0 ? "+" : ""}${x.rank_chg}</sup>` : ""}`);
    const tip = (x) => `${x.name}: strength ${x.strength ?? "–"} · momentum ${x.momentum ?? "–"} · ${x.above50 ?? "–"}% above 50 SMA · ${x.n} stocks${x.tag ? " · " + x.tag : ""}`;
    const q = gs.q.trim().toLowerCase();
    const list = all.filter((x) => (gs.small || !x.small || level === "sector") && (!q || x.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.n - a.n);
    const label = { sector: "Sector", industry: "Industry", theme: "Theme" }[level], plural = { sector: "Sectors", industry: "Industries", theme: "Themes" }[level];
    const col = (key, title, count, body, extra = "") => {
      const shut = gs.shut[key] || (chartOn && key !== "res" && key !== "chart" && gs.shut[key] !== false);
      return `<section class="gcol ${shut ? "shut" : ""} ${extra}" data-col="${key}"><div class="gcol-h"><b>${title}</b>${count != null ? `<small class="muted">${count}</small>` : ""}
        ${key !== "res" && key !== "chart" ? `<button type="button" class="gcol-x" data-shut="${key}" title="${shut ? "Open" : "Fold"} this column">${shut ? "›" : "‹"}</button>` : ""}</div>
        <div class="gcol-v">${esc(title)}</div><div class="gcol-b">${body}</div></section>`;
    };
    const groupTable = (items, lvl, selName, hrefOf) => `<table class="gt"><thead><tr><th class="l">${lvl === "industry" && level === "sector" ? "Industry" : label}</th><th>Rank</th><th>Med ${p.toUpperCase()}</th>
        ${lvl === "industry" && level === "sector" ? "<th>&gt; 50 SMA</th><th>Stocks</th>" : '<th title="Members at a 20-day high / low today">20D H/L</th>'}</tr></thead><tbody>`
      + items.map((x) => `<tr class="${x.name === selName ? "on" : ""} ${x.small ? "muted" : ""}" data-href="${hrefOf(x)}" title="${esc(tip(x))}"><td class="l"><span class="gt-n">${esc(x.name)}</span>${x.tag && !x.small ? ` <i class="gt-tag ${({ Leading: "t-up", Improving: "t-info", Weakening: "t-warn", Lagging: "t-down" })[x.tag] || ""}" title="${esc(x.tag)}"></i>` : ""}</td>`
        + `<td class="num">${rankCell(x)}</td><td class="num">${pct(x["med_" + p])}</td>`
        + (lvl === "industry" && level === "sector" ? `<td class="num">${x.small ? "–" : (x.above50 ?? "–") + "%"}</td><td class="num">${x.n}</td>` : `<td class="num"><span class="up">${x.hi20}</span>/<span class="down">${x.lo20}</span></td>`) + "</tr>").join("")
      + "</tbody></table>";
    const colA = col("a", plural, list.length, groupTable(list, level, g && g.name, (x) => `#/groups/${level}/${enc(x.name)}`));
    const colB = level === "sector" && g ? col("b", g.name, `${inds.length} industr${inds.length === 1 ? "y" : "ies"}`, groupTable(inds, "industry", sub, (x) => `#/groups/sector/${enc(g.name)}/${enc(x.name)}`)
      + `<a class="gt-all ${!sub ? "on" : ""}" href="#/groups/sector/${enc(g.name)}">All ${esc(g.name)} stocks · ${g.n} →</a>`) : "";
    const th = (k, l, cls = "") => `<th class="${cls} ${gs.sort === k ? "sorted" : ""}" data-gs="${k}">${l}${gs.sort === k ? (gs.dir === "asc" ? " ▲" : " ▼") : ""}</th>`;
    const resTitle = stockGroup ? (level === "sector" ? `${esc(g.name)}${subG ? " › " + esc(subG.name) : " · All stocks"}` : esc(g.name)) : "Stocks";
    const colR = col("res", resTitle, stockGroup ? `${stocks.length} stocks` : null, stockGroup ? `<table class="gt gs"><thead><tr>${th("symbol", "Symbol", "l")}${th("close", "LTP")}${th("ret", p.toUpperCase() + " %")}${th("from_hi52", "52W HI")}${th("rs_rating", "RS")}<th class="l">Themes</th></tr></thead><tbody>`
      + stocks.map((r) => `<tr class="${state.gStock === r.key ? "on" : ""}" data-stock="${esc(r.key)}"><td class="l"><b>${esc(r.symbol)}</b>${r.high >= r.high_20d ? ' <span class="tag t-up">20H</span>' : ""}${r.low <= r.low_20d ? ' <span class="tag t-down">20L</span>' : ""}</td>`
        + `<td class="num">${SD.fmtPrice(r.close)}</td><td class="num">${pct(r[retKey])}</td><td class="num">${pct(r.from_hi52)}</td><td class="num">${r.rs_rating ?? "–"}</td><td class="l small gs-th">${esc(r.themes || "—")}</td></tr>`).join("")
      + "</tbody></table>" : `<p class="empty">Pick a ${label.toLowerCase()} on the left.</p>`, "gc-grow");
    const colC = chartOn ? col("chart", "Chart", null, '<div id="gChart" class="g-chart"></div>', "gc-grow2") : "";
    const how = `Rank = strength of the group's average stock vs the equal-weight market against its own ${cfgG.ratio_window || 63}-session average (small superscript = change in ${cfgG.rank_change_sessions || 5} sessions);
      dot = Leading (green) / Improving (blue) / Weakening (orange) / Lagging (red). Small groups (&lt; ${cfgG.min_members || 5} stocks) get no rank. Hover a group for its numbers.`;
    view.innerHTML = `<div class="gx"><div class="gx-bar"><div class="seg">${[["sector", "Sector"], ["industry", "Industry"], ["theme", "Theme"]].map(([k, l]) =>
        `<a class="btn-seg ${k === level ? "on" : ""}" href="#/groups/${k}">${l} <small>${(L[k] || []).length}</small></a>`).join("")}</div>
      ${seg("gperiod", [["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["1y", "1Y"], ["ytd", "YTD"]], p)}
      <input id="gq" type="search" placeholder="Search ${level}…" value="${esc(gs.q)}" aria-label="Search groups">
      ${level !== "sector" ? `<label class="chk"><input type="checkbox" id="gsmall" ${gs.small ? "checked" : ""}> Show small groups</label>` : ""}
      <span class="pk-i" title="${esc(how.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<"))}">i</span></div>
      ${!isWide && name ? `<div class="crumbs"><a href="#/groups/${level}">‹ All ${plural.toLowerCase()}</a>${sub ? ` · <a href="#/groups/${level}/${enc(name)}">‹ ${esc(name)}</a>` : ""}</div>` : ""}
      <div class="gx-cols ${isWide ? "wide" : ""} ${name ? "has-sel" : ""} ${sub ? "has-sub" : ""}" id="gCols">${colA}${colB}${colR}${colC}</div></div>`;
    $("#stPage").innerHTML = `<span>${list.length} of ${all.length} ${plural.toLowerCase()}</span><span class="st-n">data ${SD.fmtDate(state.groups.data_date)}</span>`;
    // fill the screen height on wide screens
    const cols = $("#gCols");
    if (isWide) cols.style.height = Math.max(460, innerHeight - (cols.getBoundingClientRect().top + scrollY) - 64) + "px";
    const qi = $("#gq"); qi.oninput = () => { gs.q = qi.value; const pos = qi.selectionStart; renderGroups(level, name, sub); const n = $("#gq"); n.focus(); n.setSelectionRange(pos, pos); };
    if ($("#gsmall")) $("#gsmall").onchange = (e) => { gs.small = e.target.checked; renderGroups(level, name, sub); };
    const ps = $("[data-seg=gperiod]");
    ps.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; gs.period = b.dataset.v; store.set("sd-gperiod", gs.period); renderGroups(level, name, sub); };
    cols.onclick = (e) => {
      const sh = e.target.closest("[data-shut]");
      if (sh) { const k = sh.dataset.shut, now = sh.closest(".gcol").classList.contains("shut"); gs.shut[k] = !now; renderGroups(level, name, sub); return; }
      const v = e.target.closest(".gcol.shut .gcol-v"); if (v) { gs.shut[v.closest(".gcol").dataset.col] = false; renderGroups(level, name, sub); return; }
      const h = e.target.closest("th[data-gs]");
      if (h) { const k = h.dataset.gs; gs.dir = gs.sort === k ? (gs.dir === "asc" ? "desc" : "asc") : k === "symbol" ? "asc" : "desc"; gs.sort = k; renderGroups(level, name, sub); return; }
      const st = e.target.closest("tr[data-stock]");
      if (st) {
        if (!isWide) { location.hash = "#/i/" + st.dataset.stock.replace(":", "/"); return; }
        state.gStock = st.dataset.stock; renderGroups(level, name, sub); return;
      }
      const tr = e.target.closest("tr[data-href]"); if (tr) { state.gStock = null; location.hash = tr.dataset.href; }
    };
    if (chartOn) { const r = state.screenByKey.get(state.gStock); if (r) SDChart.open($("#gChart"), r, { kind: "s" }); }
    const on = cols.querySelector(".gcol[data-col=a] tr.on"); if (on && isWide) on.scrollIntoView({ block: "nearest" });
  }

  /* ------------------------------------------------------------------ breadth (Phase S10): data/breadth.json */
  const breadthCharts = [];
  function clearBreadthCharts() { while (breadthCharts.length) { try { breadthCharts.pop().remove(); } catch (e) { /* gone */ } } }
  const WORD_CLS = { Building: "t-info", Strong: "t-up", Fading: "t-warn", Weak: "t-down", Flat: "", Up: "t-up", Down: "t-down", Mixed: "t-warn",
    Working: "t-up", Failing: "t-down", Stretched: "t-warn", "Washed out": "t-info", Normal: "" };
  async function renderBreadth(tab) {
    clearBreadthCharts();
    const tabs = `<div class="bx-tabs"><a class="${tab !== "indices" ? "on" : ""}" href="#/breadth">Market Breadth</a><a class="${tab === "indices" ? "on" : ""}" href="#/breadth/indices">Major Indices</a></div>`;
    if (tab === "indices") return renderMajorIndices(tabs);
    if (!state.breadth) view.innerHTML = SKEL("Loading breadth");
    try { if (!state.breadth) state.breadth = await getJSON("data/breadth.json"); }
    catch (e) { view.innerHTML = `<p class="empty">Breadth is not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "breadth") return;
    const B = state.breadth;
    const bs = state.bstate || (state.bstate = Object.assign({ uni: "liquid", range: "3m", hl: "20", part: "50", ad: "20", mv: "d" }, store.get("sd-breadth", {})));
    const saveB = () => store.set("sd-breadth", { uni: bs.uni, range: bs.range, hl: bs.hl, part: bs.part, ad: bs.ad, mv: bs.mv });
    const U = B.universes[bs.uni] || B.universes.liquid, S = U.series;
    const n = Math.min({ "1m": 21, "3m": 63, "1y": 252 }[bs.range], B.days.length);
    const days = B.days.slice(-n), cut = (k) => (S[k] || []).slice(-n), full = (k) => S[k] || [];
    const f0 = (v) => (v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("en-IN"));
    const read = U.read || {};
    const READ = [["momentum", "Momentum"], ["short_term", "Short-term"], ["big_trend", "Big trend"], ["breakouts", "Breakouts"], ["overdone", "Overdone?"], ["leadership", "Leadership"]];
    const STG = [["stage1", "Base", "#9e9e9e"], ["stage2", "Uptrend", "#2962ff"], ["stage3", "Top", "#f59e0b"], ["stage4", "Downtrend", "#db2777"]];
    const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
    // rolling sums over the full series, then cut to the range
    const roll = (a, w) => a.map((_, i) => { if (i < w - 1) return null; let s = 0; for (let k = i - w + 1; k <= i; k++) { if (a[k] == null) return null; s += a[k]; } return s; });
    const ratio = (u, d) => u.map((x, i) => (x == null || d[i] == null || !d[i] ? null : x / d[i]));
    const tail = (a) => a.slice(-n);
    const n500 = (B.indices.NIFTY_500 || []).slice(-n);
    const lab = (v, labels) => { for (const [lim, t] of labels || []) if (v < lim) return t; return ""; };
    const trend = (a, i, higherBetter = true) => { const j = i - 5; if (j < 0 || a[i] == null || a[j] == null || a[i] === a[j]) return ""; const better = (a[i] > a[j]) === higherBetter; return `<span class="${better ? "up" : "down"}">· ${better ? "better ↑" : "worse ↓"}</span>`; };
    // series per chart (all already cut to the range)
    const partK = `pct_above${bs.part}`, part = cut(partK);
    const hlH = cut("nh" + bs.hl), hlL = cut("nl" + bs.hl), hl = hlH.map((v, i) => (v == null || hlL[i] == null ? null : v - hlL[i]));
    const adv = full("adv"), dec = full("dec");
    const adR = bs.ad === "line" ? cut("ad_line") : tail(ratio(roll(adv, Number(bs.ad)), roll(dec, Number(bs.ad))));
    const up4 = full("up4"), dn4 = full("dn4");
    const mv = bs.mv === "d" ? tail(up4.map((v, i) => (v == null || dn4[i] == null ? null : v - dn4[i]))) : tail(ratio(roll(up4, Number(bs.mv)), roll(dn4, Number(bs.mv))));
    const held = cut("held"), failed = cut("failed");
    const LMS = [["NIFTY_50", "N50", "#2962ff"], ["NIFTY_MIDCAP_150", "MID150", "#f59e0b"], ["NIFTY_SMALLCAP_250", "SML250", "#db2777"]];
    const lms = LMS.map(([k, l, c]) => { const x = (B.indices[k] || []).slice(-n), b0 = x.find((v) => v != null); return { l, c, vals: x.map((v) => (v == null || !b0 ? null : (v / b0 - 1) * 100)) }; });
    const judged = (a) => a.filter((x) => x != null).slice(-5).reduce((s, b) => s + b, 0);
    const h5 = judged(full("held")), f5 = judged(full("failed"));
    // one chart = header + SVG; hover anywhere moves the crosshair in every chart
    const CH = [];
    const chartBox = (id, title, toggle, info) => `<div class="bx-c" data-c="${id}"><div class="bx-ch"><small>${title}</small>${toggle || ""}</div><div class="bx-v" id="bv-${id}"></div>
      <div class="bx-svg" id="bs-${id}"></div>${info ? `<small class="muted bx-note">${info}</small>` : ""}</div>`;
    const N = days.length;
    view.innerHTML = `<div class="bx">${tabs}
      <div class="bx-g"><aside class="bx-l"><div class="bx-lh"><b>Market breadth</b><small class="muted">read as of ${shortDay(B.data_date)}</small></div>
        ${READ.filter(([k]) => read[k]).map(([k, l]) => `<div class="hr-row" title="${esc(read[k].rule || "")}"><div><i class="hr-dot ${WORD_CLS[read[k].word] || "t-info"}"></i><b>${l}</b><span class="tag ${WORD_CLS[read[k].word] || "t-info"}">${esc(read[k].word)}</span></div><p>${esc(read[k].text)}</p></div>`).join("")}
        <div class="bx-stage"><div class="bx-lh"><small class="muted">STAGE ANALYSIS</small><small class="muted">of ${f0(lastOf(full("stage_n")))} stocks (64+ days)</small></div>
          <div class="bar">${STG.map(([k, l, c]) => `<span style="flex:${lastOf(full(k)) || 0.0001};background:${c}" title="${l}"></span>`).join("")}</div>
          <div class="bx-sg">${STG.map(([k, l, c]) => { const ch = (U.stage_change || {})[k]; return `<div><small><i style="background:${c}"></i>${l}</small><b>${(lastOf(full(k)) ?? 0).toFixed(1)}%</b><small class="${ch > 0 ? "up" : ch < 0 ? "down" : "muted"}">${ch ? (ch > 0 ? "+" : "") + ch + " 1D" : "–"}</small></div>`; }).join("")}</div></div>
        <p class="muted small">Our own simple rules (hover a line to see it). Not investment advice.</p></aside>
      <section class="bx-r"><div class="bx-rh"><b>Market internals</b><span class="pk-i" title="Participation: share of stocks above their 20 / 50 / 200-day average. Net highs - lows: stocks at a 20-day (or 52-week) high minus those at a low. Advance / decline: stocks that rose / fell over the last 20 or 40 sessions (above 1 = more rose) or the cumulative advance - decline line. 4% movers: stocks up 4 % or more in a day minus those down 4 %, or the 5 / 10-day ratio. Breakouts: closes above the 50-session high; held = still above 5 sessions later. The grey line in each chart is the Nifty 500.">i</span>
          <small class="muted"><i class="bx-grey"></i> Nifty 500 (grey line)</small>
          <span class="bx-tools">${seg("buni", [["liquid", `Liquid ${f0(lastOf(B.universes.liquid.series.n))}`], ["all", `All ${f0(lastOf(B.universes.all.series.n))}`]], bs.uni)}${seg("brange", [["1m", "1M"], ["3m", "3M"], ["1y", "1Y"]], bs.range)}</span></div>
        <div class="bx-grid">
          ${chartBox("part", "PARTICIPATION", seg("bpart", [["20", "20D"], ["50", "50D"], ["200", "200D"]], bs.part))}
          ${chartBox("hl", "NET HIGHS − LOWS", seg("bhl", [["20", "20D"], ["52", "52W"]], bs.hl))}
          ${chartBox("ad", "ADVANCE / DECLINE", seg("bad", [["20", "20D"], ["40", "40D"], ["line", "A-D line"]], bs.ad))}
          ${chartBox("mv", "4% MOVERS", seg("bmv", [["d", "Daily"], ["5", "5D ratio"], ["10", "10D ratio"]], bs.mv))}
          ${chartBox("lms", "LARGE VS MID VS SMALL", "")}
          ${chartBox("bo", "BREAKOUTS · BREAKDOWNS", `<span class="bx-chip">${f0(lastOf(full("held")))} held, ${f0(lastOf(full("failed")))} failed · ${h5 + f5 ? Math.round((100 * h5) / (h5 + f5)) : "–"}% held over 5 days</span>`)}
        </div></section></div></div>`;
    $("#stPage").innerHTML = `<span>${f0(lastOf(S.n))} ${bs.uni === "liquid" ? "liquid " : ""}stocks</span><span class="st-n">data ${SD.fmtDate(B.data_date)}</span>`;
    const W = 520, H = 150, PL = 40, PR = 6, PT = 6, PB = 18;
    const make = (id, o) => {
      const vals = o.series.flatMap((s) => s.vals).filter((v) => v != null && isFinite(v));
      let lo = o.lo ?? Math.min(...vals), hi = o.hi ?? Math.max(...vals);
      if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (!(hi > lo)) { hi = lo + 1; }
      const padY = (hi - lo) * 0.06; if (o.lo == null) lo -= padY; if (o.hi == null) hi += padY;
      const X = (i) => PL + (i / Math.max(N - 1, 1)) * (W - PL - PR), Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB), bw = (W - PL - PR) / Math.max(N, 1);
      const fmtT = (v) => (Math.abs(hi - lo) < 5 ? v.toFixed(2) : Math.round(v).toLocaleString("en-IN"));
      const ticks = o.ticks || [lo + padY, (lo + hi) / 2, hi - padY];
      let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="bx-s">`;
      for (const [a, b, c] of o.bands || []) s += `<rect x="${PL}" y="${Y(Math.min(b, hi))}" width="${W - PL - PR}" height="${Math.max(0, Y(Math.max(a, lo)) - Y(Math.min(b, hi)))}" fill="${c}"/>`;
      for (const t of ticks) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(t)}" y2="${Y(t)}" class="hl-grid"/><text x="${PL - 4}" y="${Y(t) + 3}" text-anchor="end" class="hl-ax">${fmtT(t)}${o.unit || ""}</text>`;
      if (o.grey) {
        const g = o.grey.filter((v) => v != null), glo = Math.min(...g), ghi = Math.max(...g), GY = (v) => PT + (1 - (v - glo) / (ghi - glo || 1)) * (H - PT - PB);
        s += `<polyline points="${o.grey.map((v, i) => (v == null ? "" : `${X(i).toFixed(1)},${GY(v).toFixed(1)}`)).filter(Boolean).join(" ")}" fill="none" stroke="var(--muted)" stroke-opacity=".55" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      for (const se of o.series) {
        if (se.bars) s += se.vals.map((v, i) => (v == null ? "" : `<rect x="${(X(i) - bw * 0.38).toFixed(1)}" y="${Math.min(Y(v), Y(0)).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - Y(0))).toFixed(1)}" fill="${v >= 0 ? se.up : se.down}"/>`)).join("");
        else {
          const pts = se.vals.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
          if (se.fill && pts.length) s += `<path d="M${pts[0].split(",")[0]},${Y(lo)} L${pts.join(" L")} L${pts[pts.length - 1].split(",")[0]},${Y(lo)} Z" fill="${se.fill}"/>`;
          s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${se.color}" stroke-width="${se.width || 1.8}" vector-effect="non-scaling-stroke"/>`;
        }
      }
      s += `<text x="${PL}" y="${H - 4}" class="hl-ax">${esc(shortDay(days[0]))}</text><text x="${W - PR}" y="${H - 4}" text-anchor="end" class="hl-ax">${esc(shortDay(days[N - 1]))}</text>`;
      s += `<line class="bx-x" x1="0" x2="0" y1="${PT}" y2="${H - PB}" style="display:none"/>${o.series.filter((se) => !se.bars).map((se, k) => `<circle class="bx-dot" data-k="${k}" r="3.5" fill="${se.color}" style="display:none"/>`).join("")}</svg>`;
      const el = $("#bs-" + id);
      el.innerHTML = s;
      CH.push({ id, el, o, X, Y, head: o.head });
    };
    const sync = (i) => {
      for (const c of CH) {
        const line = c.el.querySelector(".bx-x"), atEnd = i == null;
        const j = atEnd ? N - 1 : i;
        line.style.display = atEnd ? "none" : ""; line.setAttribute("x1", c.X(j)); line.setAttribute("x2", c.X(j));
        c.el.querySelectorAll(".bx-dot").forEach((d) => { const se = c.o.series.filter((x) => !x.bars)[Number(d.dataset.k)], v = se.vals[j]; d.style.display = atEnd || v == null ? "none" : ""; if (v != null) { d.setAttribute("cx", c.X(j)); d.setAttribute("cy", c.Y(v)); } });
        $("#bv-" + c.id).innerHTML = c.head(j);
      }
    };
    const day = (j) => `<small class="muted bx-d">${esc(shortDay(days[j]))}</small>`;
    make("part", { series: [{ vals: part, color: "#2962ff", fill: "rgba(41,98,255,.12)" }], lo: 0, hi: 100, ticks: [0, 20, 50, 80, 100], unit: "%", grey: n500,
      bands: [[80, 100, "rgba(219,39,119,.09)"], [0, 20, "rgba(219,39,119,.05)"]],
      head: (j) => `<b>${part[j] == null ? "–" : part[j].toFixed(1) + "%"}</b><span class="bx-w">${esc(lab(part[j], B.config.participation_labels))}</span>${trend(part, j)}${day(j)}` });
    make("hl", { series: [{ vals: hl, bars: true, up: "rgba(41,98,255,.75)", down: "rgba(219,39,119,.75)" }], zero: true, grey: n500,
      head: (j) => `<b>${hl[j] == null ? "–" : (hl[j] > 0 ? "+" : "") + f0(hl[j])}</b><span class="bx-w">${hl[j] == null ? "" : hl[j] > 0 ? (hlL[j] && hlH[j] > 3 * hlL[j] ? "Far more highs than lows" : "More highs than lows") : hl[j] < 0 ? (hlH[j] && hlL[j] > 3 * hlH[j] ? "Far more lows than highs" : "More lows than highs") : "Even"}</span>${trend(hl, j)}${day(j)}<small class="muted bx-r2">${f0(hlH[j])} highs / ${f0(hlL[j])} lows</small>` });
    make("ad", { series: [{ vals: adR, color: "#2962ff" }], grey: n500, bands: bs.ad === "line" ? [] : [[0, 1, "rgba(219,39,119,.06)"], [1, 99, "rgba(41,98,255,.05)"]],
      ticks: bs.ad === "line" ? undefined : undefined,
      head: (j) => `<b>${adR[j] == null ? "–" : bs.ad === "line" ? f0(adR[j]) : adR[j].toFixed(2)}</b><span class="bx-w">${bs.ad === "line" ? "cumulative advances − declines" : adR[j] == null ? "" : esc(lab(adR[j], B.config.ad_labels) || (adR[j] >= 1 ? "More risers" : "More fallers"))}</span>${trend(adR, j)}${day(j)}<small class="muted bx-r2">${f0(tail(adv)[j])} up / ${f0(tail(dec)[j])} down that day</small>` });
    make("mv", bs.mv === "d" ? { series: [{ vals: mv, bars: true, up: "rgba(41,98,255,.75)", down: "rgba(219,39,119,.75)" }], zero: true, grey: n500,
        head: (j) => { const u = tail(up4)[j], d = tail(dn4)[j], r = d ? u / d : u ? 9 : 1; return `<b>${mv[j] == null ? "–" : (mv[j] > 0 ? "+" : "") + f0(mv[j])}</b><span class="bx-w">${r >= 2 ? "Heavy buying" : r >= 1.2 ? "More buying" : r > 0.83 ? "Balanced" : r > 0.5 ? "More selling" : "Heavy selling"}</span>${trend(mv, j)}${day(j)}<small class="muted bx-r2">${f0(u)} up / ${f0(d)} down</small>`; } }
      : { series: [{ vals: mv, color: "#2962ff" }], grey: n500, bands: [[0, 1, "rgba(219,39,119,.06)"]],
        head: (j) => `<b>${mv[j] == null ? "–" : mv[j].toFixed(2)}</b><span class="bx-w">${mv[j] == null ? "" : mv[j] >= 1 ? "more 4 % gainers" : "more 4 % losers"} (${bs.mv} days)</span>${trend(mv, j)}${day(j)}` });
    make("lms", { series: lms.map((x) => ({ vals: x.vals, color: x.c })), zero: true, unit: "%",
      head: (j) => `${lms.map((x) => `<span class="bx-lg"><i style="background:${x.c}"></i>${x.l} <b class="${x.vals[j] >= 0 ? "up" : "down"}">${x.vals[j] == null ? "–" : (x.vals[j] > 0 ? "+" : "") + x.vals[j].toFixed(1) + "%"}</b></span>`).join("")}${day(j)}` });
    make("bo", { series: [{ vals: held, bars: true, up: "rgba(41,98,255,.75)", down: "rgba(41,98,255,.75)" }, { vals: failed.map((v) => (v == null ? null : -v)), bars: true, up: "rgba(219,39,119,.75)", down: "rgba(219,39,119,.75)" }], zero: true, grey: n500,
      head: (j) => { let k = j; while (k > 0 && held[k] == null) k--;
        return `<b>${held[k] == null ? "–" : f0(held[k])}</b><span class="bx-w">held</span> <b>${failed[k] == null ? "–" : f0(failed[k])}</b><span class="bx-w">failed</span>${day(k)}<small class="muted bx-r2">${k < j ? "latest judged day · " : ""}breakouts of ${esc(shortDay(days[Math.max(0, k - 5)]))}, judged 5 sessions later</small>`; } });
    sync(null);
    view.querySelectorAll(".bx-svg").forEach((el) => {
      el.addEventListener("mousemove", (e) => { const r = el.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W; const i = Math.round(((x - PL) / (W - PL - PR)) * (N - 1)); sync(Math.max(0, Math.min(N - 1, i))); });
      el.addEventListener("mouseleave", () => sync(null));
    });
    const on = (name, fn) => { const g = $(`[data-seg=${name}]`); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b) { fn(b.dataset.v); saveB(); renderBreadth(); } }; };
    on("buni", (v) => { bs.uni = v; }); on("brange", (v) => { bs.range = v; }); on("bhl", (v) => { bs.hl = v; });
    on("bpart", (v) => { bs.part = v; }); on("bad", (v) => { bs.ad = v; }); on("bmv", (v) => { bs.mv = v; });
  }

  /* Major indices: a grid of index charts (Phase N10) */
  async function renderMajorIndices(tabs) {
    const mi = Object.assign({ grp: "broad", tf: "D", type: "candle", ma: true, sort: "default", cols: 3 }, store.get("sd-mi", {}));
    const save = () => store.set("sd-mi", mi);
    const idx = state.rows.filter((r) => r.kind === "index" && r.exchange === "NSE");
    const BROAD = ["NIFTY_50", "NIFTY_NEXT_50", "NIFTY_100", "NIFTY_200", "NIFTY_500", "NIFTY_MIDCAP_50", "NIFTY_MIDCAP_100", "NIFTY_MIDCAP_150", "NIFTY_SMALLCAP_100", "NIFTY_SMALLCAP_250", "NIFTY_MICROCAP_250", "NIFTY_MIDSMALLCAP_400", "INDIA_VIX"];
    const broad = BROAD.map((id) => idx.find((r) => r.id === id)).filter(Boolean);
    const sect = idx.filter((r) => r.category === "SECTORAL INDICES");
    let list = mi.grp === "sector" ? sect : broad;
    if (mi.sort === "1d") list = list.slice().sort((a, b) => (b.chg_1d ?? -1e9) - (a.chg_1d ?? -1e9));
    else if (mi.sort === "1w") list = list.slice().sort((a, b) => (b.chg_1w ?? -1e9) - (a.chg_1w ?? -1e9));
    else if (mi.sort === "name") list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `<div class="bx">${tabs}<div class="mi-bar">${seg("mgrp", [["broad", `Broad (${broad.length})`], ["sector", `Sector (${sect.length})`]], mi.grp)}
        ${seg("mtype", [["candle", "Candles"], ["bar", "Bars"]], mi.type)}${seg("mtf", [["D", "1D"], ["W", "1W"]], mi.tf)}
        <button class="btn sm ${mi.ma ? "on" : ""}" id="miMa" type="button">MA</button>
        <span class="mi-r"><select id="miSort" aria-label="Sort"><option value="default" ${mi.sort === "default" ? "selected" : ""}>Sort: usual order</option><option value="1d" ${mi.sort === "1d" ? "selected" : ""}>Sort: 1D %</option>
          <option value="1w" ${mi.sort === "1w" ? "selected" : ""}>Sort: 1W %</option><option value="name" ${mi.sort === "name" ? "selected" : ""}>Sort: name</option></select>
          ${seg("mcols", [["1", "1"], ["2", "2"], ["3", "3"]], String(mi.cols))}</span></div>
      <div class="mi-grid" style="--mcols:${mi.cols}">${list.map((r) => `<a class="mi-card" href="#/i/n/${encodeURIComponent(r.id)}" data-id="${esc(r.id)}"><div class="mi-h"><b>${esc(r.name)}</b>
        <small>1D ${pct(r.chg_1d)}</small><small>1W ${pct(r.chg_1w)}</small><span class="num">${SD.fmtPrice(r.close)}</span></div><div class="mi-ch"><i class="skel"></i></div></a>`).join("")}</div></div>`;
    $("#stPage").innerHTML = `<span>${list.length} of ${broad.length + sect.length} indices</span><span class="st-n">${mi.grp === "sector" ? "Sector" : "Broad"} · data ${SD.fmtDate(state.dataDate)}</span>`;
    try { await SDChart.loadLib(); } catch (e) { return; }
    const L = window.LightweightCharts, cs = getComputedStyle(document.documentElement), col = (v) => cs.getPropertyValue(v).trim();
    const draw = async (card) => {
      const el = card.querySelector(".mi-ch");
      let d; try { d = await getJSON(`data/c/n/${encodeURIComponent(card.dataset.id)}.json`); } catch (e) { el.innerHTML = '<p class="empty small">No chart</p>'; return; }
      if (!el.isConnected) return;
      let bars = SD.candlesFromChart(d, "adjusted");
      if (mi.tf === "W") bars = SD.toWeekly(bars);
      const all = bars, show = all.slice(mi.tf === "W" ? -104 : -130);
      el.innerHTML = "";
      const ch = L.createChart(el, { layout: { background: { color: "transparent" }, textColor: col("--muted"), fontSize: 10, attributionLogo: false, panes: { separatorColor: col("--line") } },
        grid: { vertLines: { visible: false }, horzLines: { color: col("--line") } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 0 } });
      breadthCharts.push(ch);
      const up = col("--up"), dn = col("--down");
      const s = mi.type === "bar" ? ch.addSeries(L.BarSeries, { upColor: up, downColor: dn, priceLineVisible: false }) : ch.addSeries(L.CandlestickSeries, { upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false, priceLineVisible: false });
      s.setData(show.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      if (mi.ma) {
        const off = all.length - show.length;
        [[20, "#2962ff"], [50, "#f59e0b"]].forEach(([n, c]) => {
          const e = SDI.ema(all.map((b) => b.close), n);
          ch.addSeries(L.LineSeries, { color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
            .setData(show.map((b, i) => (e[off + i] == null ? { time: b.time } : { time: b.time, value: e[off + i] })));
        });
      }
      if (show.some((b) => b.volume)) {
        const v = ch.addSeries(L.HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1);
        v.setData(show.map((b, i) => ({ time: b.time, value: b.volume || 0, color: (i && b.close < show[i - 1].close ? dn : up) + "88" })));
        ch.panes()[0].setStretchFactor(4); ch.panes()[1].setStretchFactor(1);
      }
      ch.timeScale().fitContent();
    };
    const obs = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { obs.unobserve(en.target); draw(en.target); } }), { rootMargin: "200px" });
    view.querySelectorAll(".mi-card").forEach((c) => obs.observe(c));
    const on = (name, fn) => { const g = view.querySelector(`[data-seg=${name}]`); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b) { fn(b.dataset.v); save(); renderBreadth("indices"); } }; };
    on("mgrp", (v) => { mi.grp = v; }); on("mtype", (v) => { mi.type = v; }); on("mtf", (v) => { mi.tf = v; }); on("mcols", (v) => { mi.cols = Number(v); });
    $("#miMa").onclick = () => { mi.ma = !mi.ma; save(); renderBreadth("indices"); };
    $("#miSort").onchange = (e) => { mi.sort = e.target.value; save(); renderBreadth("indices"); };
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

  /* Phase N1: scanner workspace. Top: new scan, scanner picker (search, folders, pin, counts), formula, pinned scanners,
     list / grid switch. Wide screens: resizable results list (more columns when wider) + chart; grid of mini charts. */
  const ICON = {
    list: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="12" y="4" width="9" height="16" rx="1.5"/></svg>',
    grid: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    filter: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    sort: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    cols: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    pin: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/></svg>',
    plus: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  const GRID_SORTS = [["scan", "Scan order"], ["az", "A-Z"], ["mcap", "Market cap"], ["price", "Price"], ["perf", "1D %"], ["rs", "RS rating"], ["vol", "Traded value"]];
  const gridSorted = (rows, k) => {
    if (k === "scan") return rows;
    const by = { az: (r) => r.symbol, mcap: (r) => r.mcap_cr, price: (r) => r.close, perf: (r) => r.chg_1d, rs: (r) => r.rs_rating, vol: (r) => r.turnover_cr }[k];
    return rows.slice().sort((a, b) => (k === "az" ? String(by(a)).localeCompare(String(by(b))) : (by(b) ?? -Infinity) - (by(a) ?? -Infinity)));
  };
  let gridCharts = [], gridObs = null;
  function clearGrid() {
    if (gridObs) { gridObs.disconnect(); gridObs = null; }
    while (gridCharts.length) { try { gridCharts.pop().remove(); } catch (e) { /* gone */ } }
  }
  const scanCounts = new Map();                      // scan id + rule -> count, for the picker
  function scanCount(sc) {
    const k = sc.id + JSON.stringify(sc.rule) + sc.universe + state.screenDate;
    if (!scanCounts.has(k)) { try { scanCounts.set(k, SDS.run(state.screen, sc).length); } catch (e) { scanCounts.set(k, null); } }
    return scanCounts.get(k);
  }
  function scanPicker(current) {
    const pins = store.get("sd-pins", []);
    const folders = [];
    for (const s of allScans()) { let f = folders.find((x) => x[0] === (s.folder || "Other")); if (!f) folders.push(f = [s.folder || "Other", []]); f[1].push(s); }
    return `<div class="pk-q">${ICON.filter}<input type="search" id="pkQ" placeholder="Search scanners" aria-label="Search scanners"></div>`
      + folders.map(([f, list]) => `<details class="pk-f" ${list.some((s) => s.id === current) ? "open" : ""}><summary>${esc(f)} <small>${list.length}</small></summary>`
        + list.map((s) => `<div class="pk-row ${s.id === current ? "on" : ""}" data-t="${esc((s.name + " " + (s.description || "")).toLowerCase())}">`
          + `<button type="button" class="pk-pin ${pins.includes(s.id) ? "on" : ""}" data-pin="${esc(s.id)}" title="${pins.includes(s.id) ? "Unpin" : "Pin to the top bar"}" aria-label="Pin ${esc(s.name)}">${ICON.pin}</button>`
          + `<a href="#/scanners/${encodeURIComponent(s.id)}">${esc(s.name)}</a>`
          + `<span class="pk-i" title="${esc(s.description || s.name)}" aria-label="About ${esc(s.name)}">i</span>`
          + `<small class="pk-n" data-count="${esc(s.id)}">…</small></div>`).join("") + "</details>").join("")
      + `<div class="tree-act"><button type="button" data-exp>Export my scans</button><label class="btn sm">Import <input type="file" id="impScans" accept=".json" hidden></label></div>`;
  }

  async function renderStocks() {
    const st = state.stocks;
    const mode = routeName();                                  // "stocks" or "scanners"
    if (!state.screen) view.innerHTML = SKEL("Loading all stocks");
    try { await loadScreen(); if (mode === "scanners") await loadScans(); }
    catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== mode) return;
    clearGrid();
    let scan = null, base = state.screen;
    if (mode === "scanners") {
      const id = decodeURIComponent(location.hash.replace(/^#\/?/, "").split("/")[1] || "") || store.get("sd-scan", "trend-template");
      scan = allScans().find((x) => x.id === id) || allScans()[0];
      if (state.lastScan !== scan.id) { state.lastScan = scan.id; if (scan.sort) { st.sort = scan.sort.field; st.dir = scan.sort.dir; } st.limit = PAGE; }
      store.set("sd-scan", scan.id);
      base = SDS.run(state.screen, scan);
    }
    const ui = Object.assign({ view: "list", gridCols: 3, gridSort: "scan", listW: 300, filters: false, panel: true }, store.get("sd-ws", {}));
    const saveUi = () => store.set("sd-ws", ui);
    const isWide = wide();
    const sectors = [...new Set(state.screen.map((r) => r.sector).filter(Boolean))].sort();
    const sortItem = SD.SORTS.find((x) => x[0] === st.sort);
    const sortName = sortItem ? sortItem[1] : SD.COLUMNS[st.sort] ? SD.COLUMNS[st.sort].label : st.sort === "symbol" ? "Symbol" : st.sort;
    const pins = store.get("sd-pins", []).map((p) => allScans().find((s) => s.id === p)).filter(Boolean);
    const bar = scan
      ? `<button class="btn primary" id="newScan" type="button">${ICON.plus}<span>New scan</span></button>
        <div class="menu-wrap"><button class="btn ws-pick" id="scanBtn" type="button" aria-haspopup="true"><b>${esc(scan.name)}</b>${scan.edited ? ' <span class="tag">edited</span>' : ""} <span class="caret">▾</span></button>
          <div class="menu picker" id="scanMenu" hidden></div></div>
        <button class="btn icon" id="csBtn" type="button" title="Custom scan: pick filters">${ICON.cols}</button>
        <button class="btn icon" id="formulaBtn" type="button" title="Formula: see or change the rule">ƒ</button>
        <div class="pins">${pins.length ? pins.map((s) => `<a class="pin-chip ${s.id === scan.id ? "on" : ""}" href="#/scanners/${encodeURIComponent(s.id)}">${esc(s.name)}</a>`).join("")
          : '<span class="muted small">Pin a scanner from the menu to show it here</span>'}</div>`
      : `<h1 class="ws-title">All stocks</h1><span class="muted small">every NSE main-board stock, all fields of ${SD.fmtDate(state.screenDate)}</span>`;
    const desc = scan ? `<p class="ws-desc">${esc(scan.description || "")} <span class="rule-en">${esc(SDS.describe(scan.rule || { all: [] }, state.labels))}${scan.universe === "liquid" ? " · liquid stocks only" : ""}</span></p>` : "";
    view.innerHTML = `<div class="ws-bar">${bar}
        <div class="ws-right">${ui.view === "grid" ? `<select id="gSort" aria-label="Grid order">${GRID_SORTS.map(([k, l]) => `<option value="${k}" ${k === ui.gridSort ? "selected" : ""}>${l}</option>`).join("")}</select>
          ${seg("gcols", [["2", "2"], ["3", "3"], ["4", "4"]], String(ui.gridCols))}` : ""}
          ${ui.view === "list" && isWide ? `<button type="button" class="btn icon ${ui.panel ? "on" : ""}" id="spBtn" title="Stock panel: overview, financials, peers, shareholding"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>` : ""}
          <div class="seg icons" role="group" aria-label="View"><button type="button" data-v="list" class="${ui.view === "list" ? "on" : ""}" title="List + chart">${ICON.list}</button>
          <button type="button" data-v="grid" class="${ui.view === "grid" ? "on" : ""}" title="Grid of charts">${ICON.grid}</button></div></div></div>
      ${desc}
      <div class="ws-main ${ui.view} ${isWide ? "wide" : ""} ${ui.panel && isWide ? "withp" : ""}" id="wsMain" style="--list-w:${ui.listW}px">
        <section class="results">
          <div class="res-h"><b>Results</b><span class="res-c"><span class="count" id="resN"></span><button class="flt-chip" id="fltChip" type="button" hidden></button></span>
            <button class="icon-btn sm ${ui.filters ? "on" : ""}" id="fltBtn" type="button" title="Search and filters">${ICON.filter}</button>
            <div class="menu-wrap"><button class="icon-btn sm" id="sortBtn" type="button" title="Sort: ${esc(sortName)}">${ICON.sort}</button>
              <div class="menu right" id="sortMenu" hidden><small class="menu-h">Sort by · now ${esc(sortName)} ${st.dir === "asc" ? "▲" : "▼"}</small>${SD.SORTS.map(([k, label]) => `<button type="button" data-sort="${k}" class="${k === st.sort ? "on" : ""}">${label}</button>`).join("")}
              <button type="button" data-flip>Reverse order ⇅</button></div></div>
            <button class="icon-btn sm" id="colBtn" type="button" title="Columns">${ICON.cols}</button></div>
          <div class="res-f" ${ui.filters ? "" : "hidden"}>${seg("uni", [["all", "All"], ["liquid", "Liquid"], ["n500", "Nifty 500"], ["fno", "F&O"]], st.universe)}
            <select id="sector" aria-label="Sector"><option value="">All sectors</option>${sectors.map((x) => `<option ${x === st.sector ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
            <input id="q" type="search" placeholder="Search in results" value="${esc(st.text)}" aria-label="Search in results"></div>
          <div id="tbl" class="res-list"></div>
        </section>
        <div class="res-drag" id="resDrag" role="separator" aria-orientation="vertical" title="Drag to make the list wider or narrower"></div>
        <div class="chart-pane" id="pane"><p class="empty">Select a stock from the results to chart it.</p></div>
        <aside class="side-panel" id="side"></aside>
        <div class="grid" id="grid" style="--gcols:${ui.gridCols}"></div>
      </div>`;
    let rows = [];
    const stPage = $("#stPage");
    const footer = () => {
      const name = scan ? scan.name : "All stocks";
      stPage.innerHTML = `<button class="st-btn" id="copy" type="button" title="Copy symbols as NSE:SYMBOL (TradingView watchlist)">Copy</button>`
        + `<button class="st-btn" id="csv" type="button">CSV</button><span>${esc(name)} · ${state.selected.size} of ${rows.length.toLocaleString("en-IN")} selected</span>`
        + `<span class="st-n">${rows.length.toLocaleString("en-IN")} stocks · ${state.screen.length.toLocaleString("en-IN")} scanned</span>`;
      // a remembered filter (universe / sector / search, shared with the Stocks page) must never hide stocks silently:
      // show it as a chip with "shown / all" (Viraj 11-Nov: Big Reversal showed 1 of 18 under a forgotten "Nifty 500")
      const on = [st.universe !== "all" ? { liquid: "Liquid", n500: "Nifty 500", fno: "F&O" }[st.universe] || st.universe : "",
        st.sector, st.text.trim() ? `"${st.text.trim()}"` : ""].filter(Boolean);
      $("#resN").textContent = on.length ? `${rows.length.toLocaleString("en-IN")} / ${base.length.toLocaleString("en-IN")}` : rows.length.toLocaleString("en-IN");
      const chip = $("#fltChip");
      chip.hidden = !on.length;
      chip.textContent = on.length ? `${on.join(" · ")} ✕` : "";
      chip.title = on.length ? `Filter on: ${on.join(", ")}. ${(base.length - rows.length).toLocaleString("en-IN")} stocks hidden. Click to show all.` : "";
      if (on.length) stPage.querySelector(".st-n").textContent = `${rows.length.toLocaleString("en-IN")} of ${base.length.toLocaleString("en-IN")} stocks (filter: ${on.join(", ")}) · ${state.screen.length.toLocaleString("en-IN")} scanned`;
      $("#copy").onclick = copySel;
      $("#csv").onclick = csvSel;
    };
    // how many extra columns fit in the list: wider list = more columns (phones: all, scroll sideways)
    const fitCols = () => {
      if (!isWide || ui.view !== "list") return st.cols;
      const w = $("#wsMain .results").clientWidth;
      return st.cols.slice(0, Math.max(0, Math.floor((w - 250) / 86)));
    };
    let shownCols = -1;
    const draw = () => {
      rows = SD.sortRows(SD.filterStocks(base, st), st.sort, st.dir);
      if (ui.view === "grid") { drawGrid(); footer(); return; }
      const cols = fitCols();
      shownCols = cols.length;
      const mark = (c) => (st.sort === c ? (st.dir === "asc" ? " ▲" : " ▼") : "");
      const head = `<th class="l ck"><input type="checkbox" id="selAll" aria-label="Select all shown"></th><th class="l sticky ${st.sort === "symbol" ? "sorted" : ""}" data-col="symbol">Symbol${mark("symbol")}</th>`
        + `<th data-col="close" class="${st.sort === "close" ? "sorted" : ""}">LTP${mark("close")}</th>`
        + cols.map((c) => `<th data-col="${c}" class="${SD.COLUMNS[c].fmt === "text" ? "l " : ""}${st.sort === c ? "sorted" : ""}">${esc(SD.COLUMNS[c].label)}${mark(c)}</th>`).join("");
      const body = rows.slice(0, st.limit).map((r) => `<tr data-key="${esc(r.key)}" class="${state.current === r.key ? "cur" : ""}">`
        + `<td class="l ck"><input type="checkbox" data-sel="${esc(r.key)}" ${state.selected.has(r.key) ? "checked" : ""} aria-label="Select ${esc(r.symbol)}"></td>`
        + `<td class="l sticky name"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></td><td class="num">${SD.fmtPrice(r.close)}</td>`
        + cols.map((c) => `<td class="${SD.COLUMNS[c].fmt === "text" ? "l" : "num"}">${cellHTML(r, c)}</td>`).join("") + "</tr>").join("");
      const more = rows.length > st.limit ? `<button class="btn more" data-more type="button">Show more (${rows.length - st.limit} left)</button>` : "";
      $("#tbl").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${more}</div>`
        : `<div class="table-wrap"><div class="empty">Nothing matches.</div></div>`;
      footer();
      store.set("sd-stocks", { universe: st.universe, sector: st.sector, sort: st.sort, dir: st.dir, cols: st.cols });
    };
    // grid of mini charts: candles of the last ~6 months + 20 / 50-day averages, drawn when the card scrolls into view
    let gridLimit = ui.gridCols * 4;
    const drawGrid = () => {
      clearGrid();
      const list = gridSorted(rows, ui.gridSort);
      const box = $("#grid");
      box.innerHTML = list.length ? list.slice(0, gridLimit).map((r) => `<article class="gcard" data-key="${esc(r.key)}" tabindex="0">
          <div class="g-h"><b>${esc(r.symbol)}</b>${pct(r.chg_1d)}<span class="g-px num">${SD.fmtPrice(r.close)}</span></div>
          <div class="g-s muted">M ${r.mcap_cr == null ? "–" : "₹" + SD.fmtInt(r.mcap_cr) + " Cr"} · F ${r.float_mcap_cr == null ? "–" : "₹" + SD.fmtInt(r.float_mcap_cr) + " Cr"}${r.rs_rating == null ? "" : " · RS " + r.rs_rating}</div>
          <div class="g-ch" data-id="${esc(r.id)}"><i class="skel"></i></div>
          <div class="g-f muted">Vol ${SD.fmtVol(r.volume)} · Avg 20D ${SD.fmtVol(r.avg_vol20)} · RVol ${r.rvol == null ? "–" : Number(r.rvol).toFixed(2) + "x"}</div></article>`).join("")
        + (list.length > gridLimit ? `<button class="btn more g-more" data-gmore type="button">Show more (${list.length - gridLimit} left)</button>` : "")
        : `<div class="empty">Nothing matches.</div>`;
      gridObs = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { gridObs.unobserve(en.target); miniChart(en.target); } }), { rootMargin: "200px" });
      box.querySelectorAll(".g-ch").forEach((el) => gridObs.observe(el));
    };
    const miniChart = async (el) => {
      let data;
      try { [data] = await Promise.all([getJSON(`data/c/s/${encodeURIComponent(el.dataset.id)}.json`), SDChart.loadLib()]); }
      catch (e) { el.innerHTML = '<p class="empty small">No chart</p>'; return; }
      if (!el.isConnected) return;
      const bars = SD.candlesFromChart(data, "adjusted").slice(-180);
      const L = window.LightweightCharts, cs = getComputedStyle(document.documentElement), col = (v) => cs.getPropertyValue(v).trim();
      el.innerHTML = "";
      const ch = L.createChart(el, { layout: { background: { color: "transparent" }, textColor: col("--muted"), fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: { borderVisible: false, visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      gridCharts.push(ch);
      const s = ch.addSeries(L.CandlestickSeries, { upColor: col("--up"), downColor: col("--down"), borderVisible: false, wickUpColor: col("--up"), wickDownColor: col("--down"), priceLineVisible: false });
      s.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      const all = SD.candlesFromChart(data, "adjusted"), off = all.length - bars.length;
      [[20, "#3b82f6"], [50, "#f59e0b"]].forEach(([n, c]) => {
        const pts = [];
        let sum = 0;
        for (let i = 0; i < all.length; i++) { sum += all[i].close; if (i >= n) sum -= all[i - n].close; if (i >= off && i >= n - 1) pts.push({ time: all[i].time, value: sum / n }); }
        ch.addSeries(L.LineSeries, { color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(pts);
      });
      ch.timeScale().fitContent();
    };
    draw();
    const openRow = (key, scroll) => {
      const r = state.screenByKey.get(key);
      if (!r) return;
      if (!isWide) { location.hash = "#/i/s/" + r.id; return; }
      state.current = key;
      view.querySelectorAll("tr.cur").forEach((x) => x.classList.remove("cur"));
      const tr = view.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
      if (tr) { tr.classList.add("cur"); if (scroll) tr.scrollIntoView({ block: "nearest" }); }
      SDChart.open($("#pane"), r, { kind: "s" });
      if (ui.panel && ui.view === "list") stockPanel($("#side"), r, { onPeer: (pid) => { const k = "s:" + pid; if (rows.some((x) => x.key === k)) openRow(k, true); else location.hash = "#/i/s/" + encodeURIComponent(pid); } });
    };
    $("#tbl").onclick = (e) => {
      const th = e.target.closest("th[data-col]");
      if (th) { const c = th.dataset.col; st.dir = st.sort === c ? (st.dir === "asc" ? "desc" : "asc") : c === "symbol" ? "asc" : "desc"; st.sort = c; return draw(); }
      if (e.target.id === "selAll") { rows.slice(0, st.limit).forEach((r) => (e.target.checked ? state.selected.add(r.key) : state.selected.delete(r.key))); return draw(); }
      const sel = e.target.closest("[data-sel]");
      if (sel) { if (sel.checked) state.selected.add(sel.dataset.sel); else state.selected.delete(sel.dataset.sel); return footer(); }
      if (e.target.closest("[data-more]")) { st.limit += PAGE; return draw(); }
      const tr = e.target.closest("tr[data-key]");
      if (tr) openRow(tr.dataset.key, false);
    };
    $("#grid").onclick = (e) => {
      if (e.target.closest("[data-gmore]")) { gridLimit += ui.gridCols * 4; return drawGrid(); }
      const c = e.target.closest(".gcard");
      if (!c) return;
      if (!isWide) { location.hash = "#/i/" + c.dataset.key.replace(":", "/"); return; }
      state.current = c.dataset.key; ui.view = "list"; saveUi(); renderStocks();
    };
    $("#grid").onkeydown = (e) => { if (e.key === "Enter" && e.target.matches(".gcard")) e.target.click(); };
    view.onkeydown = (e) => {
      if (!isWide || ui.view !== "list" || !state.current || !["ArrowDown", "ArrowUp"].includes(e.key) || e.target.matches("input, select, textarea")) return;
      const i = rows.findIndex((r) => r.key === state.current), j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (rows[j]) { e.preventDefault(); if (j >= st.limit) { st.limit += PAGE; draw(); } openRow(rows[j].key, true); }
    };
    $("[data-seg=uni]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; st.universe = b.dataset.v; st.limit = PAGE; setOn(e.currentTarget, b); draw(); };
    $("#sector").onchange = (e) => { st.sector = e.target.value; st.limit = PAGE; draw(); };
    $("#q").oninput = (e) => { st.text = e.target.value; st.limit = PAGE; draw(); };
    $("#fltChip").onclick = () => { st.universe = "all"; st.sector = ""; st.text = ""; st.limit = PAGE; renderStocks(); };
    $("#fltBtn").onclick = () => { ui.filters = !ui.filters; saveUi(); $(".res-f").hidden = !ui.filters; $("#fltBtn").classList.toggle("on", ui.filters); if (ui.filters) $("#q").focus(); };
    const toggleMenu = (id) => { const m = $(id); const open = m.hidden; view.querySelectorAll(".menu").forEach((x) => { x.hidden = true; }); m.hidden = !open; return open; };
    $("#sortBtn").onclick = () => toggleMenu("#sortMenu");
    $("#sortMenu").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.flip != null) st.dir = st.dir === "asc" ? "desc" : "asc";
      else { const s = SD.SORTS.find((x) => x[0] === b.dataset.sort); st.sort = s[0]; st.dir = s[2]; }
      renderStocks();
    };
    $("#colBtn").onclick = () => columnSettings(() => { shownCols = -1; draw(); });
    if ($("#spBtn")) $("#spBtn").onclick = () => { ui.panel = !ui.panel; saveUi(); renderStocks(); };
    view.querySelector(".ws-right .icons").onclick = (e) => { const b = e.target.closest("button"); if (!b || b.dataset.v === ui.view) return; ui.view = b.dataset.v; saveUi(); renderStocks(); };
    if (ui.view === "grid") {
      $("[data-seg=gcols]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; ui.gridCols = Number(b.dataset.v); gridLimit = ui.gridCols * 4; saveUi(); setOn(e.currentTarget, b); $("#grid").style.setProperty("--gcols", ui.gridCols); drawGrid(); };
      $("#gSort").onchange = (e) => { ui.gridSort = e.target.value; saveUi(); drawGrid(); };
    }
    // drag the divider: wider list shows more columns
    const drag = $("#resDrag"), wsMain = $("#wsMain");
    drag.onpointerdown = (e) => {
      if (!isWide) return;
      e.preventDefault(); drag.setPointerCapture(e.pointerId); wsMain.classList.add("dragging");
      const left = wsMain.getBoundingClientRect().left, max = wsMain.clientWidth - 360;
      drag.onpointermove = (ev) => {
        ui.listW = Math.round(Math.min(Math.max(ev.clientX - left, 240), max));
        wsMain.style.setProperty("--list-w", ui.listW + "px");
        if (fitCols().length !== shownCols) draw();
      };
      drag.onpointerup = () => { drag.onpointermove = drag.onpointerup = null; wsMain.classList.remove("dragging"); saveUi(); window.dispatchEvent(new Event("resize")); };
    };
    // list + chart fill the screen down to the status bar
    const fitH = () => {
      if (!wsMain.isConnected) { window.removeEventListener("resize", fitH); return; }
      if (isWide && ui.view === "list") wsMain.style.height = Math.max(480, innerHeight - (wsMain.getBoundingClientRect().top + scrollY) - 64) + "px";
    };
    fitH();
    window.addEventListener("resize", fitH);
    drag.ondblclick = () => { ui.listW = 300; saveUi(); wsMain.style.setProperty("--list-w", "300px"); draw(); window.dispatchEvent(new Event("resize")); };
    const picked = () => (state.selected.size ? rows.filter((r) => state.selected.has(r.key)) : rows);
    async function copySel() {
      const list = picked(), txt = list.map((r) => "NSE:" + r.symbol).join(",");
      try { await navigator.clipboard.writeText(txt); $("#copy").textContent = `Copied ${list.length}`; } catch (e) { prompt("Copy these symbols:", txt); }
      setTimeout(() => { const b = $("#copy"); if (b) b.textContent = "Copy"; }, 2000);
    }
    function csvSel() {
      const cols = ["symbol", "name", "close", ...st.cols];
      const blob = new Blob([SD.toCSV(picked(), cols)], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${scan ? scan.id : "stocks"}-${state.screenDate}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    if (scan) {
      $("#scanBtn").onclick = () => {
        if (!toggleMenu("#scanMenu")) return;
        const menu = $("#scanMenu");
        menu.innerHTML = scanPicker(scan.id);
        menu.querySelector("#pkQ").focus();
        // counts after the menu is drawn (each scan runs once per data day)
        setTimeout(() => menu.querySelectorAll("[data-count]").forEach((el) => {
          const s = allScans().find((x) => x.id === el.dataset.count); const n = s ? scanCount(s) : null; el.textContent = n == null ? "–" : n.toLocaleString("en-IN");
        }), 30);
        menu.querySelector("#pkQ").oninput = (e) => {
          const q = e.target.value.toLowerCase();
          menu.querySelectorAll(".pk-row").forEach((r) => { r.hidden = !r.dataset.t.includes(q); });
          menu.querySelectorAll(".pk-f").forEach((f) => { f.hidden = !f.querySelector(".pk-row:not([hidden])"); if (q) f.open = true; });
        };
        menu.querySelector("#impScans").onchange = (e) => { if (e.target.files[0]) importScans(e.target.files[0], () => renderStocks()); };
      };
      $("#scanMenu").onclick = (e) => {
        if (e.target.closest("[data-exp]")) exportScans();
        const pin = e.target.closest("[data-pin]");
        if (pin) {
          const p = store.get("sd-pins", []), id = pin.dataset.pin;
          store.set("sd-pins", p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-8));
          pin.classList.toggle("on");
          const chips = view.querySelector(".pins"), list = store.get("sd-pins", []).map((x) => allScans().find((s) => s.id === x)).filter(Boolean);
          chips.innerHTML = list.length ? list.map((s) => `<a class="pin-chip ${s.id === scan.id ? "on" : ""}" href="#/scanners/${encodeURIComponent(s.id)}">${esc(s.name)}</a>`).join("")
            : '<span class="muted small">Pin a scanner from the menu to show it here</span>';
          return;
        }
        if (e.target.closest("a")) $("#scanMenu").hidden = true;
      };
      $("#formulaBtn").onclick = () => formulaEditor(scan, (id) => { state.lastScan = null; if (id === scan.id) renderStocks(); else location.hash = "#/scanners/" + encodeURIComponent(id); });
      $("#newScan").onclick = () => customScan({ fresh: true });
      $("#csBtn").onclick = () => customScan({ load: scan.builder ? scan : null });
    }
    view.onclick = (e) => { if (!e.target.closest(".menu-wrap")) view.querySelectorAll(".menu").forEach((x) => { x.hidden = true; }); };
    if (isWide && ui.view === "list") {
      const first = state.current && rows.some((r) => r.key === state.current) ? state.current : rows[0] && rows[0].key;
      if (first) openRow(first, true);
    }
  }

  /* ------------------------------------------------------------------ scanners (Phase S6): rules in data/scanners.json,
     user edits and own scans in this browser (localStorage "sd-scans"), the formula editor */
  async function loadScans() {
    if (state.scanSpec) return;
    const [spec, fields] = await Promise.all([getJSON("data/scanners.json"), getJSON("data/fields.json")]);
    state.scanSpec = spec;
    state.fields = fields.fields.filter((f) => f.screen);
    state.labels = Object.fromEntries(fields.fields.map((f) => [f.id, f.label]));
  }
  const userScans = () => store.get("sd-scans", { edits: {}, mine: [] });
  const saveUserScans = (u) => store.set("sd-scans", u);
  function allScans() {
    const u = userScans();
    const base = state.scanSpec.scanners.map((d) => (u.edits[d.id] ? { ...d, ...u.edits[d.id], edited: true } : d));
    return [...base, ...u.mine.map((m) => ({ ...m, folder: "My Scans", mine: true }))];
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function scanTree(current) {
    const list = allScans();
    return state.scanSpec.folders.map((f) => {
      const items = list.filter((s) => s.folder === f);
      return `<div class="tree-f"><b>${esc(f)}</b>${items.map((s) => `<a href="#/scanners/${encodeURIComponent(s.id)}" class="${s.id === current ? "on" : ""}"
        title="${esc(s.description || "")}"><span>${esc(s.name)}${s.edited ? " *" : ""}</span><small>${SDS.run(state.screen, s).length.toLocaleString("en-IN")}</small></a>`).join("")}</div>`;
    }).join("");
  }

  function formulaEditor(sc, onDone) {
    const work = clone({ universe: sc.universe || "all", rule: sc.rule && (sc.rule.all || sc.rule.any) ? sc.rule : { all: [] } });
    const fieldOpts = (sel) => state.fields.slice().sort((a, b) => a.label.localeCompare(b.label))
      .map((f) => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.label)}</option>`).join("");
    const OPS = [">", ">=", "<", "<=", "==", "!=", "between", "is", "in"];
    const condHTML = (c, path) => {
      const op = c.op || ">";
      let rhs;
      if (op === "is") rhs = `<select name="val"><option value="true" ${c.value !== false ? "selected" : ""}>yes</option><option value="false" ${c.value === false ? "selected" : ""}>no</option></select>`;
      else if (op === "between") rhs = `<input name="v1" type="number" step="any" value="${esc((c.value || [0, 0])[0])}"> and <input name="v2" type="number" step="any" value="${esc((c.value || [0, 0])[1])}">`;
      else if (op === "in") rhs = `<input name="vlist" type="text" value="${esc((c.value || []).join(", "))}" placeholder="2, 2A">`;
      else rhs = `<select name="rhs"><option value="num" ${c.field2 ? "" : "selected"}>number</option><option value="field" ${c.field2 ? "selected" : ""}>field</option></select>`
        + (c.field2 ? `<select name="field2">${fieldOpts(c.field2)}</select> × <input name="mult" type="number" step="any" value="${esc(c.mult == null ? 1 : c.mult)}">`
          : `<input name="val" type="number" step="any" value="${esc(c.value == null ? 0 : c.value)}">`);
      return `<div class="cond" data-path="${path}"><select name="field">${fieldOpts(c.field)}</select>
        <select name="op">${OPS.map((o) => `<option ${o === op ? "selected" : ""}>${o}</option>`).join("")}</select>${rhs}
        <button class="btn sm" data-del="${path}" type="button" aria-label="Remove">✕</button></div>`;
    };
    const groupKind = (g) => (g.any ? "any" : "all");
    const itemsOf = (g) => g.all || g.any;
    const body = () => {
      const top = work.rule;
      return `<p class="rule-en" id="ruleEn"></p>
        <div class="f-row">Stocks: <select name="universe"><option value="all" ${work.universe === "all" ? "selected" : ""}>all</option><option value="liquid" ${work.universe === "liquid" ? "selected" : ""}>liquid only (median 30-day turnover ≥ ₹1 Cr, price ≥ ₹5)</option></select></div>
        <div class="grp" data-g="top">Match <select name="kind" data-g="top"><option value="all" ${groupKind(top) === "all" ? "selected" : ""}>ALL (AND)</option><option value="any" ${groupKind(top) === "any" ? "selected" : ""}>ANY (OR)</option></select> of these:
        ${itemsOf(top).map((it, i) => (it.all || it.any)
          ? `<div class="grp sub" data-g="${i}">Group: <select name="kind" data-g="${i}"><option value="all" ${groupKind(it) === "all" ? "selected" : ""}>ALL</option><option value="any" ${groupKind(it) === "any" ? "selected" : ""}>ANY</option></select> of
             ${itemsOf(it).map((c, j) => condHTML(c, `${i}.${j}`)).join("")}<button class="btn sm" data-addc="${i}" type="button">+ condition</button>
             <button class="btn sm" data-del="${i}" type="button">remove group</button></div>`
          : condHTML(it, String(i))).join("")}
        <button class="btn sm" data-addc="top" type="button">+ condition</button> <button class="btn sm" data-addg type="button">+ group (OR)</button></div>
        <p class="muted small">Compare a field with a number or with another field × a multiple (e.g. close &gt; SMA 50 × 1, volume ≥ Avg volume 20D × 2).
        Field meanings: <a href="#/fields" target="_blank">all fields and formulas</a>.</p>`;
    };
    const m = document.createElement("div");
    m.className = "modal-bg";
    const isDefault = !sc.mine;
    m.innerHTML = `<div class="modal wide" role="dialog" aria-label="Formula"><div class="modal-h"><b>Formula · ${esc(sc.name)}</b>
      <button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b" id="fBody"></div>
      <div class="modal-f"><button class="btn" data-test type="button">Test</button><b id="fCount"></b><span></span>
      ${isDefault ? `<button class="btn" data-reset type="button">Reset to default</button>` : `<button class="btn" data-delete type="button">Delete</button>`}
      <button class="btn" data-dup type="button">Duplicate as My Scan</button><button class="btn primary" data-save type="button">Save</button></div></div>`;
    document.body.appendChild(m);
    const read = () => {
      const fb = m.querySelector("#fBody");
      work.universe = fb.querySelector("[name=universe]").value;
      const readCond = (el) => {
        const c = { field: el.querySelector("[name=field]").value, op: el.querySelector("[name=op]").value };
        if (c.op === "is") c.value = el.querySelector("[name=val]") ? el.querySelector("[name=val]").value !== "false" : true;
        else if (c.op === "between") { const a = el.querySelector("[name=v1]"), b = el.querySelector("[name=v2]"); c.value = [Number(a ? a.value : 0), Number(b ? b.value : 0)]; }
        else if (c.op === "in") { const v = el.querySelector("[name=vlist]"); c.value = (v ? v.value : "").split(",").map((x) => x.trim()).filter(Boolean); }
        else {
          const rhs = el.querySelector("[name=rhs]");
          if (rhs && rhs.value === "field") { const f2 = el.querySelector("[name=field2]"); c.field2 = f2 ? f2.value : c.field; const mu = el.querySelector("[name=mult]"); c.mult = mu ? Number(mu.value) : 1; }
          else { const v = el.querySelector("[name=val]"); c.value = v ? Number(v.value) : 0; }
        }
        return c;
      };
      const topKind = fb.querySelector('[name=kind][data-g="top"]').value;
      const items = [];
      fb.querySelectorAll('[data-g="top"] > .cond, [data-g="top"] > .grp.sub').forEach((el) => {
        if (el.classList.contains("cond")) items.push(readCond(el));
        else items.push({ [el.querySelector("[name=kind]").value]: [...el.querySelectorAll(":scope > .cond")].map(readCond) });
      });
      work.rule = { [topKind]: items };
    };
    const draw = () => {
      m.querySelector("#fBody").innerHTML = body();
      m.querySelector("#ruleEn").textContent = SDS.describe(work.rule, state.labels);
      m.querySelector("#fCount").textContent = `${SDS.run(state.screen, { ...sc, ...work }).length} stocks`;
    };
    draw();
    const close = () => { m.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    m.addEventListener("change", () => { read(); draw(); });
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) return close();
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.addc != null || t.dataset.addg != null || t.dataset.del != null) read();
      const top = itemsOf(work.rule);                 // after read(): read() builds a new rule object
      if (t.dataset.addc != null) { const blank = { field: "rs_rating", op: ">=", value: 80 }; (t.dataset.addc === "top" ? top : itemsOf(top[Number(t.dataset.addc)])).push(blank); return draw(); }
      if (t.dataset.addg != null) { top.push({ any: [{ field: "rs_rating", op: ">=", value: 90 }] }); return draw(); }
      if (t.dataset.del != null) {
        const [i, j] = t.dataset.del.split(".").map(Number);
        if (j == null || Number.isNaN(j)) top.splice(i, 1); else itemsOf(top[i]).splice(j, 1);
        return draw();
      }
      if (t.dataset.test != null) { read(); return draw(); }
      const u = userScans();
      if (t.dataset.save != null) {
        read();
        if (sc.mine) u.mine = u.mine.map((x) => (x.id === sc.id ? { ...x, ...work } : x));
        else u.edits[sc.id] = clone(work);
        saveUserScans(u); close(); return onDone(sc.id);
      }
      if (t.dataset.reset != null) { delete u.edits[sc.id]; saveUserScans(u); close(); return onDone(sc.id); }
      if (t.dataset.delete != null) { if (!confirm(`Delete "${sc.name}"?`)) return; u.mine = u.mine.filter((x) => x.id !== sc.id); saveUserScans(u); close(); return onDone("all-stocks"); }
      if (t.dataset.dup != null) {
        read();
        const name = prompt("Name of your scan:", `${sc.name} (mine)`); if (!name) return;
        const id = "my-" + Date.now().toString(36);
        u.mine.push({ id, name: name.slice(0, 60), description: `My scan (from ${sc.name})`, universe: work.universe, rule: clone(work.rule), sort: sc.sort });
        saveUserScans(u); close(); return onDone(id);
      }
    });
  }

  function exportScans() {
    const u = userScans();
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...u }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-scans.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importScans(file, done) {
    file.text().then((txt) => {
      const x = JSON.parse(txt), u = userScans();
      Object.assign(u.edits, x.edits || {});
      const ids = new Set(u.mine.map((m) => m.id));
      (x.mine || []).forEach((m) => { if (m && m.rule && !ids.has(m.id)) u.mine.push(m); });
      saveUserScans(u); done();
    }).catch((e) => alert("Could not read that file: " + e.message));
  }

  /* ------------------------------------------------------------------ fields and formulas page */
  async function renderFields() {
    let data;
    try { data = await getJSON("data/fields.json"); } catch (e) { view.innerHTML = `<p class="empty">Not available.</p>`; return; }
    view.innerHTML = `<h1>Fields and formulas</h1><p class="sub">Every value the dashboard shows or a scanner can use, with its formula in plain words.
      Prices are adjusted for splits, bonus, rights and demergers. ${data.fields.length} fields.</p>
      <div class="controls"><input id="fq" type="search" placeholder="Search fields" aria-label="Search fields"></div><div id="ftbl"></div>`;
    const draw = (q) => {
      const rows = data.fields.filter((f) => !q || (f.id + " " + f.label + " " + f.formula).toLowerCase().includes(q));
      $("#ftbl").innerHTML = `<div class="table-wrap"><table><thead><tr><th class="l">Field</th><th class="l">Name in scanners</th><th class="l">Formula</th><th class="l">Source</th></tr></thead><tbody>`
        + rows.map((f) => `<tr><td class="l"><b>${esc(f.label)}</b></td><td class="l"><code>${esc(f.id)}</code></td><td class="l wrap">${esc(f.formula)}</td><td class="l">${esc(f.source)}</td></tr>`).join("")
        + "</tbody></table></div>";
    };
    draw("");
    $("#fq").oninput = (e) => draw(e.target.value.trim().toLowerCase());
  }

  function columnSettings(done) {
    const st = state.stocks;
    const m = document.createElement("div");
    m.className = "modal-bg drawer";
    const groups = SD.COLUMN_GROUPS.map(([g, cols]) => `<details ${g === "General" ? "open" : ""}><summary>${g} <small>${cols.length}</small></summary>`
      + cols.map(([id, label]) => `<label class="f-row" data-t="${esc(label.toLowerCase())}"><input type="checkbox" value="${id}" ${st.cols.includes(id) ? "checked" : ""}> ${esc(label)}</label>`).join("") + "</details>").join("");
    const mine = () => st.cols.map((c, i) => `<div class="mine-row"><span>${esc(SD.COLUMNS[c].label)}</span><span>`
      + `<button class="btn sm" data-up="${i}" type="button" aria-label="Move up">↑</button><button class="btn sm" data-down="${i}" type="button" aria-label="Move down">↓</button>`
      + `<button class="btn sm" data-rm="${c}" type="button" aria-label="Remove">✕</button></span></div>`).join("");
    m.innerHTML = `<div class="modal wide" role="dialog" aria-label="Column settings"><div class="modal-h"><b>Column settings</b>
      <button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b cols-grid">
      <div><h4>Your columns <small id="nCols">${st.cols.length}</small> <button class="btn sm" id="colReset" type="button">Reset</button></h4><div id="mine">${mine()}</div>
      <p class="muted small">Changes show at once and are saved in this browser. Make the list wider to see more of them.</p></div>
      <div><h4>Add columns</h4><input type="search" id="colQ" placeholder="Search columns" aria-label="Search columns"><div id="colGroups">${groups}</div></div></div></div>`;
    document.body.appendChild(m);
    const refresh = () => {
      m.querySelector("#mine").innerHTML = mine();
      m.querySelector("#nCols").textContent = st.cols.length;
      m.querySelectorAll("#colGroups input").forEach((i) => { i.checked = st.cols.includes(i.value); });
      store.set("sd-stocks", { ...store.get("sd-stocks", {}), cols: st.cols });
      done();
    };
    m.addEventListener("change", (e) => {
      if (!e.target.matches("#colGroups input")) return;
      const v = e.target.value;
      st.cols = e.target.checked ? [...st.cols.filter((c) => c !== v), v] : st.cols.filter((c) => c !== v);
      refresh();
    });
    const shut = () => { m.remove(); document.removeEventListener("keydown", onKey); };
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
    if (!r) { view.innerHTML = `<p class="empty">Not found. <a href="#/market">Back to market</a></p>`; return; }
    const lr = state.byKey.get(key) || {};
    const stat = (label, val) => `<div class="stat"><small>${label}</small><b>${val}</b></div>`;
    view.innerHTML = `<div class="crumbs"><a href="${isStock ? "#/stocks" : "#/market"}">${isStock ? "Stocks" : "Market"}</a> › ${esc(r.symbol)}</div>
      <div class="d-head"><h1>${esc(r.name || r.symbol)}</h1><span class="muted">${esc(r.symbol)} · ${esc(r.exchange || "NSE")}${isStock ? (r.sector ? " · " + esc(r.sector) : "") + (r.basic_industry ? " › " + esc(r.basic_industry) : "") : " index"}</span>
        <button class="star ${state.watch.has(key) ? "on" : ""}" data-star="${esc(key)}" aria-label="Watchlist" style="font-size:20px">★</button></div>
      ${isStock ? `<div class="seg view-tog" id="viewTog"><button type="button" data-v="chart" class="on">Chart</button><button type="button" data-v="fin">Financials</button></div>` : ""}
      <div class="d-main ${isStock ? "withp" : ""}" id="dMain"><div class="chart-box big" id="chartBox"></div>${isStock ? '<aside class="side-panel" id="side"></aside>' : ""}</div><div id="finBox" hidden></div>
      ${isStock ? `<h2>Corporate actions</h2><div id="acts" class="muted">Loading…</div>` : ""}`;
    view.querySelector("[data-star]").onclick = (e) => { toggleWatch(e.target.dataset.star); e.target.classList.toggle("on"); };
    if (isStock) {
      const showView = (v) => {
        setOn($("#viewTog"), $(`#viewTog [data-v=${v}]`));
        $("#dMain").hidden = v !== "chart";
        $("#finBox").hidden = v !== "fin";
        store.set("sd-detail-view", v);
        if (v === "fin") renderFinancials($("#finBox"), r, id);
      };
      $("#viewTog").onclick = (e) => { const b = e.target.closest("button"); if (b) showView(b.dataset.v); };
      if (store.get("sd-detail-view", "chart") === "fin") showView("fin");
      stockPanel($("#side"), r, { onFull: () => { showView("fin"); window.scrollTo(0, 0); } });
    }
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
  /* ------------------------------------------------------------------ news: company filings with NSE */
  const NEWS_COL = { E: "#7e57c2", K: "#0ea5e9", O: "#16a34a", D: "#2962ff", C: "#f59e0b", F: "#a855f7", M: "#64748b", R: "#db2777", A: "#14b8a6", P: "#94a3b8" };
  const getNews = () => state.newsP || (state.newsP = getJSON("data/news.json").catch(() => ({ cats: {}, pdf: "", rows: [] })));
  const stockNewsCache = new Map();
  const getStockNews = (sym) => { if (!stockNewsCache.has(sym)) stockNewsCache.set(sym, getJSON(`data/a/${encodeURIComponent(sym)}.json`).catch(() => [])); return stockNewsCache.get(sym); };
  const newsTime = (dt) => dt.slice(11, 16);
  const newsBadge = (c, cats) => `<i class="nw-c" style="--c:${NEWS_COL[c] || "#94a3b8"}" title="${esc((cats || {})[c] || "")}">${c}</i>`;
  const newsText = (desc, about) => `${esc(desc)}${about ? ` <span class="muted">· ${esc(about)}</span>` : ""}`;
  const newsLink = (url, pdf) => (url ? `<a class="nw-pdf" href="${esc(url.startsWith("http") ? url : pdf + url)}" target="_blank" rel="noopener" title="The company's filing (PDF on nseindia.com)">Filing ↗</a>` : "");

  async function renderNews() {
    view.innerHTML = SKEL("Loading company filings");
    const N = await getNews();
    try { await loadScreen(); } catch (e) { /* names stay empty */ }
    if (routeName() !== "news") return;
    const ns = Object.assign({ cats: [], watch: false, q: "", limit: 150 }, store.get("sd-news", {}), { limit: state.newsLimit || 150 });
    const save = () => store.set("sd-news", { cats: ns.cats, watch: ns.watch, q: ns.q });
    const q = ns.q.trim().toUpperCase();
    const watched = new Set([...state.watch].map((k) => k.split(":")[1]));
    const rows = N.rows.filter(([, sym, c]) => (!ns.cats.length || ns.cats.includes(c)) && (!ns.watch || watched.has(sym)) && (!q || sym.includes(q)));
    const byKey = (sym) => state.screenByKey.get("s:" + sym);
    let html = "", day = "";
    for (const [dt, sym, c, desc, about, url] of rows.slice(0, ns.limit)) {
      if (dt.slice(0, 10) !== day) { day = dt.slice(0, 10); html += `<h4 class="nw-day">${esc(shortDay(day))}</h4>`; }
      const r = byKey(sym);
      html += `<div class="nw-row"><small class="nw-t">${newsTime(dt)}</small>${newsBadge(c, N.cats)}<div class="nw-b"><a href="#/i/s/${encodeURIComponent(sym)}"><b>${esc(sym)}</b></a>`
        + `${r ? ` <small class="muted">${esc(r.name || "")}</small> ${pct(r.chg_1d)}` : ""}<div>${newsText(desc, about)}</div></div>${newsLink(url, N.pdf)}</div>`;
    }
    const counts = {}; for (const x of N.rows) counts[x[2]] = (counts[x[2]] || 0) + 1;
    view.innerHTML = `<div class="nw"><div class="nw-bar"><h1>Company filings</h1>
        <div class="nw-cats"><button type="button" data-cat="" class="${ns.cats.length ? "" : "on"}">All <small>${N.rows.length}</small></button>
        ${Object.entries(N.cats || {}).map(([k, l]) => `<button type="button" data-cat="${k}" class="${ns.cats.includes(k) ? "on" : ""}">${newsBadge(k, N.cats)} ${esc(l)} <small>${counts[k] || 0}</small></button>`).join("")}</div>
        <label class="chk"><input type="checkbox" id="nwWatch" ${ns.watch ? "checked" : ""}> My watchlist</label>
        <input type="search" id="nwQ" placeholder="Symbol" value="${esc(ns.q)}" aria-label="Symbol"></div>
      <div class="nw-list">${html || '<p class="empty">No filing matches.</p>'}</div>
      ${rows.length > ns.limit ? `<button class="btn more" id="nwMore" type="button">Show more (${rows.length - ns.limit} left)</button>` : ""}
      <p class="muted small">Announcements the companies filed with NSE in the last 10 days (exchange filings, not news articles). The category is our own
        grouping of NSE's subject; open the filing for the full text. Not investment advice.</p></div>`;
    $("#stPage").innerHTML = `<span>${rows.length.toLocaleString("en-IN")} filings</span><span class="st-n">${N.rows.length ? `${esc(shortDay(N.rows[N.rows.length - 1][0].slice(0, 10)))} – ${esc(shortDay(N.rows[0][0].slice(0, 10)))}` : ""}</span>`;
    view.querySelector(".nw-cats").onclick = (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      const k = b.dataset.cat;
      ns.cats = !k ? [] : ns.cats.includes(k) ? ns.cats.filter((x) => x !== k) : [...ns.cats, k];
      state.newsLimit = 150; save(); renderNews();
    };
    $("#nwWatch").onchange = (e) => { ns.watch = e.target.checked; save(); renderNews(); };
    $("#nwQ").oninput = (e) => { const v = e.target.value; clearTimeout(state.nwT); state.nwT = setTimeout(() => { state.newsQ = v; renderNewsQ(v); }, 250); };
    const renderNewsQ = (v) => { store.set("sd-news", { cats: ns.cats, watch: ns.watch, q: v }); renderNews().then(() => { const i = $("#nwQ"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }); };
    if ($("#nwMore")) $("#nwMore").onclick = () => { state.newsLimit = ns.limit + 150; renderNews(); };
  }

  /* ------------------------------------------------------------------ leaders (Phase N11): top stocks by our leader score */
  async function renderLeaders() {
    if (!state.screen) view.innerHTML = SKEL("Loading leaders");
    try { await loadScreen(); } catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "leaders") return;
    const ls = Object.assign({ by: "theme", top: 160, minTurn: 5, open: {} }, store.get("sd-leaders", {}));
    const save = () => store.set("sd-leaders", ls);
    const nInd = new Set(state.screen.map((r) => r.industry_rank).filter((x) => x != null)).size || 100;
    const pool = state.screen.filter((r) => !r.stale && (r.turnover_avg20_cr ?? 0) >= ls.minTurn && !["2", "5"].includes(String(r.price_band)));
    const scored = pool.map((r) => ({ r, s: SD.leaderScore(r, nInd) })).filter((x) => x.s != null).sort((a, b) => b.s - a.s);
    const top = scored.slice(0, ls.top);
    const keyOf = (r) => (ls.by === "theme" ? r.theme || r.basic_industry || "Other" : ls.by === "industry" ? r.basic_industry || r.industry || "Other" : r.sector || "Other");
    const groupsL = new Map();
    for (const x of top) { const k = keyOf(x.r); if (!groupsL.has(k)) groupsL.set(k, []); groupsL.get(k).push(x); }
    const secs = [...groupsL].sort((a, b) => b[1].length - a[1].length || b[1][0].s - a[1][0].s);
    const isWide = wide();
    if (state.ldStock && !top.some((x) => x.r.key === state.ldStock)) state.ldStock = null;
    if (!state.ldStock && isWide && top.length) state.ldStock = top[0].r.key;
    const tags = (r) => [r.stage === "2" || r.stage === "2A" ? "Stage 2" : "", r.dist_pivot != null && r.dist_pivot > -5 && r.dist_pivot <= 0 ? "Near pivot" : "",
      r.vcp_contractions >= 2 ? "VCP" : "", r.rs_line_52w_high ? "RS high" : "", r.pocket_pivot ? "Pocket pivot" : ""].filter(Boolean);
    const row = ({ r, s }) => `<tr data-key="${esc(r.key)}" class="${state.ldStock === r.key ? "on" : ""}"><td class="l"><b>${esc(r.symbol)}</b><span class="ld-sub">${esc(ls.by === "theme" ? r.basic_industry || "" : r.theme || "")}${tags(r).map((t) => ` <i class="hs-tag">${t}</i>`).join("")}</span></td>
      <td class="num"><span class="ld-score" style="--s:${s}">${s}</span></td><td class="num">${r.rs_rating ?? "–"}</td><td class="num">${pct(r.chg_1d)}</td><td class="num">${pct(r.ret_1w)}</td>
      <td class="num">${pct(r.ret_1m)}</td><td class="num">${pct(r.from_hi52)}</td><td class="num">${finNum(r.mcap_cr)}</td></tr>`;
    const head = `<thead><tr><th class="l">Stock</th><th title="Our leader score 0-100">Score</th><th>RS</th><th>1D</th><th>1W</th><th>1M</th><th>52W high</th><th>MCap Cr</th></tr></thead>`;
    const body = secs.map(([k, list]) => { const shut = ls.open[k] === false;
      return `<tbody class="ld-sec ${shut ? "shut" : ""}"><tr class="ld-h" data-sec="${esc(k)}"><td colspan="8"><span class="caret">▾</span> <b>${esc(k)}</b> <small class="muted">${list.length}</small>
        <small class="muted ld-avg">avg score ${Math.round(list.reduce((a, x) => a + x.s, 0) / list.length)}</small></td></tr>${shut ? "" : list.map(row).join("")}</tbody>`; }).join("");
    const rule = "Leader score (0-100, our own rule): 40 % RS rating, 20 % nearness to the 52-week high (0 % = full, -25 % or lower = none), 15 % trend (close > 50 > 150 > 200-day average, rising 200-day), 15 % industry rank, 10 % latest results (EPS and sales growth). Only stocks with enough daily turnover and without 2 % / 5 % price bands.";
    view.innerHTML = `<div class="ld"><div class="ld-bar"><h1>Top leaders <span class="pk-i" title="${esc(rule)}">i</span></h1>
        <label class="muted small">Group by ${`<select id="ldBy"><option value="theme" ${ls.by === "theme" ? "selected" : ""}>Theme</option><option value="industry" ${ls.by === "industry" ? "selected" : ""}>Industry</option><option value="sector" ${ls.by === "sector" ? "selected" : ""}>Sector</option></select>`}</label>
        <label class="muted small">Show <select id="ldTop">${[50, 100, 160, 250].map((n) => `<option ${n === ls.top ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="muted small">Turnover ≥ <select id="ldTurn">${[1, 5, 10, 25].map((n) => `<option value="${n}" ${n === ls.minTurn ? "selected" : ""}>₹${n} Cr</option>`).join("")}</select></label>
        <span class="ld-r"><button class="btn sm" id="ldAll" type="button">Fold all</button><button class="btn sm" id="ldCopy" type="button">Copy to TradingView</button></span></div>
      <div class="ld-main ${isWide ? "wide" : ""}"><div class="ld-list"><table class="gt ld-t">${head}${body}</table></div>${isWide ? '<div class="chart-pane ld-chart" id="ldPane"></div>' : ""}</div>
      <p class="muted small">${esc(rule)} Not investment advice.</p></div>`;
    $("#stPage").innerHTML = `<span>${top.length} of ${pool.length.toLocaleString("en-IN")} stocks</span><span class="st-n">top ${ls.top} by leader score · ₹${ls.minTurn} Cr+ turnover · excl. 2% / 5% bands</span>`;
    const lm = view.querySelector(".ld-main");
    if (isWide) lm.style.height = Math.max(460, innerHeight - (lm.getBoundingClientRect().top + scrollY) - 64) + "px";
    const openChart = (key) => { const r = state.screenByKey.get(key); if (r && $("#ldPane")) SDChart.open($("#ldPane"), r, { kind: "s" }); };
    if (isWide && state.ldStock) openChart(state.ldStock);
    view.querySelector(".ld-t").onclick = (e) => {
      const h = e.target.closest(".ld-h"); if (h) { const k = h.dataset.sec; ls.open[k] = ls.open[k] === false; save(); renderLeaders(); return; }
      const tr = e.target.closest("tr[data-key]"); if (!tr) return;
      if (!isWide) { location.hash = "#/i/" + tr.dataset.key.replace(":", "/"); return; }
      state.ldStock = tr.dataset.key; view.querySelectorAll(".ld-t tr.on").forEach((x) => x.classList.remove("on")); tr.classList.add("on"); openChart(tr.dataset.key);
    };
    $("#ldBy").onchange = (e) => { ls.by = e.target.value; ls.open = {}; save(); renderLeaders(); };
    $("#ldTop").onchange = (e) => { ls.top = Number(e.target.value); save(); renderLeaders(); };
    $("#ldTurn").onchange = (e) => { ls.minTurn = Number(e.target.value); save(); renderLeaders(); };
    $("#ldAll").textContent = secs.every(([k]) => ls.open[k] === false) ? "Open all" : "Fold all";
    $("#ldAll").onclick = () => { const fold = !secs.every(([k]) => ls.open[k] === false); ls.open = {}; if (fold) secs.forEach(([k]) => { ls.open[k] = false; }); save(); renderLeaders(); };
    $("#ldCopy").onclick = async () => { const t = top.map(({ r }) => "NSE:" + r.symbol).join(","); try { await navigator.clipboard.writeText(t); $("#ldCopy").textContent = `Copied ${top.length}`; } catch (e) { prompt("Copy these symbols:", t); } };
  }

  /* ------------------------------------------------------------------ RRG (Phase N9): strength x momentum with tails */
  const RRG_Q = { Leading: "#16a34a", Improving: "#2962ff", Weakening: "#f59e0b", Lagging: "#db2777" };
  const quadOf = (s, m) => (s >= 100 ? (m >= 100 ? "Leading" : "Weakening") : (m >= 100 ? "Improving" : "Lagging"));
  const ARROWS = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  const headingOf = (pts) => {
    if (pts.length < 2) return { arrow: "·", text: "–" };
    const [a, b] = pts.slice(-2), dx = b[0] - a[0], dy = b[1] - a[1];
    const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const text = ["Moving right (gaining strength)", "Up and right (best direction)", "Turning up", "Up but weaker", "Moving left (losing strength)", "Down and left (worst direction)", "Turning down", "Down but stronger"][k];
    return { arrow: ARROWS[k], text };
  };

  async function renderRRG() {
    if (!state.groups) view.innerHTML = SKEL("Loading the rotation graph");
    try { if (!state.groups) state.groups = await getJSON("data/group_ranks.json"); }
    catch (e) { view.innerHTML = `<p class="empty">Groups are not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "rrg") return;
    const rs = Object.assign({ level: "sector", tf: "d", tail: 10, bench: "mkt", top: true, pins: {} }, store.get("sd-rrg", {}));
    const save = () => store.set("sd-rrg", rs);
    const G = state.groups, days = (G.tail_days || {})[rs.tf] || [];
    const hasTails = (G.levels.sector || []).some((g) => g.tails);
    if (!hasTails) { rs.tf = "d"; rs.bench = "mkt"; }
    const maxTail = rs.tf === "w" ? 10 : 20;
    const tailN = Math.min(rs.tail, maxTail);
    let groups = (G.levels[rs.level] || []).filter((g) => !g.small && g.strength != null);
    if (rs.level !== "sector" && rs.top) groups = groups.slice().sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 20);
    const ptsOf = (g) => {
      const t = g.tails && (g.tails[rs.bench] || g.tails.mkt);
      if (t) { const s = t.s[rs.tf], m = t.m[rs.tf]; return s.map((x, i) => [x, m[i]]).filter(([a, b]) => a != null && b != null).slice(-tailN); }
      return (g.tail || []).filter(([a, b]) => a != null && b != null).slice(-tailN);
    };
    const items = groups.map((g) => { const p = ptsOf(g); const last = p[p.length - 1]; return last ? { g, p, q: quadOf(last[0], last[1]), h: headingOf(p) } : null; }).filter(Boolean);
    const pins = new Set(rs.pins[rs.level] || []);
    const W = 1000, H = 620, pad = 34;
    let dS = 2, dM = 2;
    for (const it of items) for (const [s, m] of it.p) { dS = Math.max(dS, Math.abs(s - 100)); dM = Math.max(dM, Math.abs(m - 100)); }
    dS *= 1.1; dM *= 1.12;
    const X = (s) => pad + ((s - (100 - dS)) / (2 * dS)) * (W - 2 * pad), Y = (m) => H - pad - ((m - (100 - dM)) / (2 * dM)) * (H - 2 * pad);
    const cx = X(100), cy = Y(100);
    const short = (n) => (n.length > 18 ? n.slice(0, 17) + "…" : n);
    const svg = `<svg class="rrg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Relative rotation graph">
      <rect x="${pad}" y="${pad}" width="${cx - pad}" height="${cy - pad}" class="q-imp"/><rect x="${cx}" y="${pad}" width="${W - pad - cx}" height="${cy - pad}" class="q-lead"/>
      <rect x="${pad}" y="${cy}" width="${cx - pad}" height="${H - pad - cy}" class="q-lag"/><rect x="${cx}" y="${cy}" width="${W - pad - cx}" height="${H - pad - cy}" class="q-weak"/>
      <text x="${pad + 10}" y="${pad + 20}" class="q-t" fill="${RRG_Q.Improving}">Improving</text><text x="${W - pad - 10}" y="${pad + 20}" class="q-t" text-anchor="end" fill="${RRG_Q.Leading}">Leading</text>
      <text x="${pad + 10}" y="${H - pad - 10}" class="q-t" fill="${RRG_Q.Lagging}">Lagging</text><text x="${W - pad - 10}" y="${H - pad - 10}" class="q-t" text-anchor="end" fill="${RRG_Q.Weakening}">Weakening</text>
      <text x="${W / 2}" y="${H - 8}" class="q-ax" text-anchor="middle">Strength (RS-Ratio) →</text><text x="12" y="${H / 2}" class="q-ax" text-anchor="middle" transform="rotate(-90 12 ${H / 2})">Momentum →</text>
      <text x="${cx}" y="${H - pad + 14}" class="q-ax" text-anchor="middle">100</text><text x="${pad - 4}" y="${cy + 4}" class="q-ax" text-anchor="end">100</text>
      ${items.map((it, i) => {
        const col = RRG_Q[it.q], n = it.p.length;
        // drawn path: inner points lightly smoothed (1-2-1), the head exact; curves through the midpoints
        const sp = it.p.map((pt, k) => (k === 0 || k === n - 1 ? pt : [(it.p[k - 1][0] + 2 * pt[0] + it.p[k + 1][0]) / 4, (it.p[k - 1][1] + 2 * pt[1] + it.p[k + 1][1]) / 4]));
        const P = sp.map(([a, b]) => [X(a), Y(b)]), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const segs = P.slice(1).map((pt, k) => {
          const a = k === 0 ? P[0] : mid(P[k - 1], P[k]), c = k === n - 2 ? pt : mid(P[k], pt);
          return `<path d="M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${P[k][0].toFixed(1)},${P[k][1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}" fill="none" stroke="${col}" stroke-opacity="${(0.12 + 0.78 * ((k + 1) / n)).toFixed(2)}" stroke-width="${(1 + 1.8 * ((k + 1) / n)).toFixed(1)}" stroke-linecap="round"/>`;
        }).join("");
        const dots = "";
        const [hx, hy] = [X(it.p[n - 1][0]), Y(it.p[n - 1][1])];
        const start = days.length ? days[days.length - n] : "";
        return `<g class="r-g ${pins.has(it.g.name) ? "pin" : ""}" data-i="${i}">${segs}${dots}<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="6" fill="${col}" stroke="var(--panel)" stroke-width="2"/>
          <text x="${(hx + 9).toFixed(1)}" y="${(hy + 4).toFixed(1)}" class="r-lbl">${esc(short(it.g.name))}</text>
          ${start ? `<text x="${X(it.p[0][0]).toFixed(1)}" y="${(Y(it.p[0][1]) + 16).toFixed(1)}" class="r-date" text-anchor="middle">${esc(shortDay(start))}</text>` : ""}</g>`;
      }).join("")}</svg>`;
    const byQ = (q) => items.map((it, i) => [it, i]).filter(([it]) => it.q === q);
    const side = ["Leading", "Improving", "Weakening", "Lagging"].map((q) => `<div class="rr-q"><small><i style="background:${RRG_Q[q]}"></i>${q} <b>${byQ(q).length}</b></small>
      <div class="rr-l">${byQ(q).map(([it, i]) => `<button type="button" data-i="${i}" class="${pins.has(it.g.name) ? "pin" : ""}" title="${esc(it.h.text)}"><span>${esc(it.g.name)}</span><b style="color:${RRG_Q[it.q]}">${it.h.arrow}</b></button>`).join("") || '<small class="muted">None</small>'}</div></div>`).join("");
    const lvlName = { sector: "sectors", industry: "industries", theme: "themes" }[rs.level];
    const benchName = { mkt: "the equal-weight market", NIFTY_50: "Nifty 50", NIFTY_500: "Nifty 500" }[rs.bench] || rs.bench;
    view.innerHTML = `<div class="rr">
      <div class="rr-bar"><span class="rr-chips">${["Leading", "Improving", "Weakening", "Lagging"].map((q) => `<span class="rr-chip"><i style="background:${RRG_Q[q]}"></i>${q} ${byQ(q).length}</span>`).join("")}</span>
        <span class="rr-tools"><small class="muted">Tail</small>${seg("rtail", [["5", "5"], ["10", "10"], ...(rs.tf === "d" ? [["20", "20"]] : [])], String(tailN))}
        ${seg("rlvl", [["sector", "Sectors"], ["industry", "Industries"], ["theme", "Themes"]], rs.level)}
        ${rs.level !== "sector" ? seg("rtop", [["1", "Top 20"], ["0", "All"]], rs.top ? "1" : "0") : ""}
        ${hasTails ? seg("rtf", [["d", "Daily"], ["w", "Weekly"]], rs.tf) : ""}
        ${hasTails ? `<select id="rBench" aria-label="Benchmark"><option value="mkt" ${rs.bench === "mkt" ? "selected" : ""}>vs equal-weight market</option><option value="NIFTY_50" ${rs.bench === "NIFTY_50" ? "selected" : ""}>vs Nifty 50</option><option value="NIFTY_500" ${rs.bench === "NIFTY_500" ? "selected" : ""}>vs Nifty 500</option></select>` : ""}</span></div>
      <div class="rr-main"><div class="rr-chart ${pins.size ? "has-pin" : ""}" id="rChart">${svg}<p class="muted small rr-hint">Hover a ${rs.level} to trace its path. Click to pin it (click again to unpin).</p></div>
        <aside class="rr-side"><small class="muted rr-h">${lvlName.toUpperCase()}</small>${side}</aside></div>
      <div class="ehov" id="rHov" hidden></div>
      <p class="muted small">Strength = the group's average stock vs ${esc(benchName)} against its own ${G.config.ratio_window || 63}-session average (100 = usual);
        momentum = change of strength over ${G.config.momentum_lag || 10} sessions + 100. An open approximation of a Relative Rotation Graph (config/group_rank.yaml), not the original formula. Not investment advice.</p></div>`;
    $("#stPage").innerHTML = `<span>${items.length} ${lvlName}</span><span class="st-n">${tailN} ${rs.tf === "w" ? "weekly points" : "sessions"} against ${esc(benchName)} · data ${SD.fmtDate(G.data_date)}</span>`;
    const chart = $("#rChart"), hov = $("#rHov");
    const focus = (i) => { chart.classList.toggle("focus", i != null); chart.querySelectorAll(".r-g").forEach((g) => g.classList.toggle("hot", g.dataset.i === String(i))); };
    const card = (i, x, y) => {
      const it = items[i], g = it.g, last = it.p[it.p.length - 1];
      let inQ = 0; for (let k = it.p.length - 1; k >= 0 && quadOf(it.p[k][0], it.p[k][1]) === it.q; k--) inQ++;
      const m5 = it.p.length > 5 ? last[1] - it.p[it.p.length - 6][1] : null;
      hov.innerHTML = `<div class="rr-ct"><b>${esc(g.name)}</b><span class="tag" style="color:${RRG_Q[it.q]};background:${RRG_Q[it.q]}1f">${it.q}</span></div>
        <div class="rr-kv"><span>Strength (RS-Ratio)</span><b>${finNum(last[0], 2)}</b><span>Momentum</span><b>${finNum(last[1], 2)}</b>
        <span>Heading</span><b style="color:${RRG_Q[it.q]}">${it.h.arrow} ${esc(it.h.text)}</b><span>Points in this quadrant</span><b>${inQ}${inQ === it.p.length ? "+" : ""}</b>
        ${m5 != null ? `<span>Momentum, 5 points</span><b class="${m5 >= 0 ? "up" : "down"}">${m5 > 0 ? "+" : ""}${finNum(m5, 2)}</b>` : ""}<span>Rank / stocks</span><b>${g.rank ?? "–"} / ${g.n}</b></div>`;
      hov.hidden = false;
      hov.style.left = `${Math.min(x + 14, innerWidth - 300)}px`; hov.style.top = `${Math.min(y + 14, innerHeight - 190)}px`;
    };
    chart.addEventListener("mousemove", (e) => { const g = e.target.closest(".r-g"); if (!g) { focus(null); hov.hidden = true; return; } focus(g.dataset.i); card(Number(g.dataset.i), e.clientX, e.clientY); });
    chart.addEventListener("mouseleave", () => { focus(null); hov.hidden = true; });
    const togglePin = (i) => { const n = items[i].g.name; if (pins.has(n)) pins.delete(n); else pins.add(n); rs.pins[rs.level] = [...pins]; save(); renderRRG(); };
    chart.addEventListener("click", (e) => { const g = e.target.closest(".r-g"); if (g) togglePin(Number(g.dataset.i)); });
    const sideEl = view.querySelector(".rr-side");
    sideEl.addEventListener("mouseover", (e) => { const b = e.target.closest("button[data-i]"); if (b) { focus(b.dataset.i); const r = b.getBoundingClientRect(); card(Number(b.dataset.i), r.left - 310, r.top); } });
    sideEl.addEventListener("mouseleave", () => { focus(null); hov.hidden = true; });
    sideEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) togglePin(Number(b.dataset.i)); });
    const segOn = (name, fn) => { const s = view.querySelector(`[data-seg=${name}]`); if (s) s.onclick = (e) => { const b = e.target.closest("button"); if (b) { fn(b.dataset.v); save(); renderRRG(); } }; };
    segOn("rtail", (v) => { rs.tail = Number(v); });
    segOn("rlvl", (v) => { rs.level = v; });
    segOn("rtop", (v) => { rs.top = v === "1"; });
    segOn("rtf", (v) => { rs.tf = v; });
    if ($("#rBench")) $("#rBench").onchange = (e) => { rs.bench = e.target.value; save(); renderRRG(); };
  }

  /* ------------------------------------------------------------------ heatmap (Phase N7): treemap by sector */
  const HM_INDEX = [["NIFTY_50", "Nifty 50"], ["NIFTY_NEXT_50", "Nifty Next 50"], ["NIFTY_200", "Nifty 200"], ["NIFTY_500", "Nifty 500"],
    ["NIFTY_MIDCAP_150", "Midcap 150"], ["NIFTY_SMALLCAP_250", "Smallcap 250"], ["NIFTY_MICROCAP_250", "Microcap 250"],
    ["NIFTY_MIDSMALLCAP_400", "MidSmallcap 400"], ["NIFTY_BANK", "Nifty Bank"], ["FNO", "F&O stocks"], ["LIQUID", "Liquid stocks"]];
  const HM_AREA = [["turnover_cr", "Turnover"], ["mcap_cr", "Market cap"], ["equal", "Equal"]];
  const HM_COLOR = [["chg_1d", "1D %", 3], ["ret_1w", "1W %", 6], ["ret_1m", "1M %", 12], ["ret_3m", "3M %", 25], ["from_hi52", "From 52W high", 40], ["rs_rating", "RS rating", 50]];
  let hmResize = null;
  const hexRGB = (c) => { c = c.trim(); if (c.startsWith("#")) { const n = parseInt(c.slice(1).length === 3 ? c.slice(1).replace(/./g, "$&$&") : c.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128]; };
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));

  async function renderHeatmap() {
    if (!state.screen) view.innerHTML = SKEL("Loading the heatmap");
    try { await loadScreen(); if (!state.members) state.members = await getJSON("data/index_members.json").catch(() => ({})); }
    catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "heatmap") return;
    const hm = Object.assign({ index: "NIFTY_500", area: "turnover_cr", color: "chg_1d", sector: "" }, store.get("sd-hm", {}));
    if (!state.members[hm.index] && !["FNO", "LIQUID"].includes(hm.index)) hm.index = state.members.NIFTY_500 ? "NIFTY_500" : "LIQUID";
    const save = () => store.set("sd-hm", { index: hm.index, area: hm.area, color: hm.color });
    const sel = (id, opts, val) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    const idxOpts = HM_INDEX.filter(([k]) => state.members[k] || k === "FNO" || k === "LIQUID");
    view.innerHTML = `<div class="hmx"><div class="hmx-bar"><label>Index ${sel("hmIdx", idxOpts, hm.index)}</label><label>Area ${sel("hmArea", HM_AREA, hm.area)}</label>
        <label>Colour ${sel("hmCol", HM_COLOR.map(([k, l]) => [k, l]), hm.color)}</label><span class="hm-crumb" id="hmCrumb"></span><span class="hm-n muted small" id="hmN"></span></div>
      <div class="hm-box" id="hmBox"></div><div class="hm-leg" id="hmLeg"></div><div class="ehov" id="hmHov" hidden></div></div>`;
    const draw = () => {
      const box = $("#hmBox");
      if (!box) { window.removeEventListener("resize", hmResize); return; }
      const mem = state.members[hm.index] ? new Set(state.members[hm.index].symbols) : null;
      let rows = state.screen.filter((r) => !r.stale && (mem ? mem.has(r.symbol) : hm.index === "FNO" ? r.fno : (r.liquid_day ?? r.liquid)));
      const total = rows.length;
      if (hm.sector) rows = rows.filter((r) => (r.sector || "Other") === hm.sector);
      const val = (r) => (hm.area === "equal" ? 1 : Math.max(r[hm.area] || 0, 0));
      const groups = new Map();
      for (const r of rows) { if (!(val(r) > 0)) continue; const g = hm.sector ? (r.basic_industry || r.industry || "Other") : (r.sector || "Other"); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
      const W = box.clientWidth, H = Math.max(420, Math.min(innerHeight - 250, W * 0.62));
      box.style.height = H + "px";
      const gl = [...groups].map(([g, list]) => ({ v: list.reduce((a, r) => a + val(r), 0), g, list: list.sort((a, b) => val(b) - val(a)) })).sort((a, b) => b.v - a.v);
      const cs = getComputedStyle(document.documentElement), neg = hexRGB(cs.getPropertyValue("--heat-n4")), mid = hexRGB(cs.getPropertyValue("--heat-0")), pos = hexRGB(cs.getPropertyValue("--heat-p4"));
      const cdef = HM_COLOR.find((x) => x[0] === hm.color), span = cdef[2];
      const colorOf = (v) => {
        if (v == null || !isFinite(v)) return [`rgb(${mid.join(",")})`, false];
        let t = hm.color === "rs_rating" ? (v - 50) / span : hm.color === "from_hi52" ? (v + span / 2) / (span / 2) : v / span;
        t = Math.max(-1, Math.min(1, t));
        const c = t < 0 ? mix(mid, neg, -t) : mix(mid, pos, t);
        return [`rgb(${c.join(",")})`, Math.abs(t) > 0.55];
      };
      const fmtV = (v) => (v == null ? "–" : hm.color === "rs_rating" ? String(v) : (v > 0 ? "+" : "") + Number(v).toFixed(1) + "%");
      let html = "";
      for (const gr of SD.squarify(gl, { x: 0, y: 0, w: W, h: H })) {
        const g = gr.it, head = gr.h > 34 && gr.w > 50 ? 16 : 0;
        html += `<div class="hm-g" style="left:${gr.x}px;top:${gr.y}px;width:${gr.w}px;height:${gr.h}px">${head ? `<button type="button" class="hm-gh" data-g="${esc(g.g)}" title="${hm.sector ? "" : "Open " + esc(g.g)}">${esc(g.g)}${hm.sector ? "" : " ›"}</button>` : ""}</div>`;
        for (const t of SD.squarify(g.list.map((r) => ({ v: val(r), r })), { x: gr.x + 1, y: gr.y + head + 1, w: Math.max(gr.w - 2, 0), h: Math.max(gr.h - head - 2, 0) })) {
          const r = t.it.r, v = r[hm.color], [bg, strong] = colorOf(v);
          const big = t.w > 46 && t.h > 28, fs = Math.max(10, Math.min(18, Math.sqrt(t.w * t.h) / 6));
          html += `<a class="hm-t ${strong ? "strong" : ""}" href="#/i/s/${encodeURIComponent(r.id)}" data-k="${esc(r.key)}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;background:${bg};font-size:${fs}px">`
            + (big ? `<b>${esc(r.symbol)}</b><span>${fmtV(v)}</span>` : "") + "</a>";
        }
      }
      box.innerHTML = html || '<p class="empty">No stock.</p>';
      $("#hmCrumb").innerHTML = hm.sector ? `<button type="button" class="btn sm" id="hmBack">‹ All sectors</button> <b>${esc(hm.sector)}</b>` : "";
      if ($("#hmBack")) $("#hmBack").onclick = () => { hm.sector = ""; draw(); };
      const lbl = (idxOpts.find((x) => x[0] === hm.index) || ["", hm.index])[1];
      $("#hmN").textContent = `${rows.length}${hm.sector ? ` of ${total}` : ""} stocks · ${lbl} · area ${HM_AREA.find((x) => x[0] === hm.area)[1].toLowerCase()} · colour ${cdef[1]}`;
      const ticks = hm.color === "rs_rating" ? [1, 25, 50, 75, 99] : hm.color === "from_hi52" ? [-span, -span * 0.75, -span / 2, -span / 4, 0] : [-span, -span / 2, 0, span / 2, span];
      $("#hmLeg").innerHTML = `<span class="hm-scale" style="background:linear-gradient(90deg, rgb(${neg.join(",")}), rgb(${mid.join(",")}), rgb(${pos.join(",")}))"></span>`
        + `<span class="hm-ticks">${ticks.map((x) => `<i>${hm.color === "rs_rating" ? x : (x > 0 ? "+" : "") + x + "%"}</i>`).join("")}</span>`;
      $("#stPage").innerHTML = `<span>${rows.length} stocks</span><span class="st-n">${esc(lbl)} · data ${SD.fmtDate(state.screenDate)}</span>`;
    };
    draw();
    $("#hmIdx").onchange = (e) => { hm.index = e.target.value; hm.sector = ""; save(); draw(); };
    $("#hmArea").onchange = (e) => { hm.area = e.target.value; save(); draw(); };
    $("#hmCol").onchange = (e) => { hm.color = e.target.value; save(); draw(); };
    $("#hmBox").onclick = (e) => { const g = e.target.closest(".hm-gh"); if (g && !hm.sector) { hm.sector = g.dataset.g; draw(); } };
    const hov = $("#hmHov");
    $("#hmBox").addEventListener("mousemove", (e) => {
      const a = e.target.closest(".hm-t"); if (!a) { hov.hidden = true; return; }
      const r = state.screenByKey.get(a.dataset.k); if (!r) return;
      hov.innerHTML = `<b>${esc(r.symbol)}</b> <small class="muted">${esc(r.name || "")}</small><div class="eh-k"><span>Price ₹${SD.fmtPrice(r.close)}</span><span>1D ${pct(r.chg_1d)}</span>
        <span>1W ${pct(r.ret_1w)}</span><span>1M ${pct(r.ret_1m)}</span><span>RS ${r.rs_rating ?? "–"}</span><span>MCap ₹${finNum(r.mcap_cr)} Cr</span><span>Turnover ₹${finNum(r.turnover_cr, 1)} Cr</span></div>
        <small class="muted">${esc(r.sector || "")} › ${esc(r.basic_industry || r.industry || "")}</small>`;
      hov.hidden = false;
      hov.style.left = `${Math.min(e.clientX + 14, innerWidth - 300)}px`; hov.style.top = `${Math.min(e.clientY + 14, innerHeight - 140)}px`;
    });
    $("#hmBox").addEventListener("mouseleave", () => { hov.hidden = true; });
    if (hmResize) window.removeEventListener("resize", hmResize);
    let tmr = null;
    hmResize = () => { clearTimeout(tmr); tmr = setTimeout(() => { if (routeName() === "heatmap") draw(); else window.removeEventListener("resize", hmResize); }, 150); };
    window.addEventListener("resize", hmResize);
  }

  /* ------------------------------------------------------------------ earnings calendar (Phase N6; new look 11-Nov-2026) */
  /* Our own grade of the latest quarter vs the same quarter a year before (screen fields, fundamentals.py):
     Excellent = sales +15 % or more AND net profit +25 % or more (profit positive), or a turnaround with sales +15 %
     Good      = sales +5 % or more AND profit +5 % or more (profit positive), or any turnaround (loss -> profit)
     Weak      = a loss this quarter, or sales AND profit both lower
     Mixed     = everything else with numbers
     Layout (Viraj 11-Nov, like the reference video): five day columns with today in the middle (Sat / Sun only when a
     result is on them), one hover card per stock, "Recent earnings" on the right, which becomes "Matching stocks" while
     a filter is on. */
  const GRADE_RULE = "Our rule on the latest quarter vs a year before: Excellent = sales ≥ +15 % and net profit ≥ +25 % (or a turnaround with sales ≥ +15 %); "
    + "Good = sales ≥ +5 % and profit ≥ +5 % (or any loss-to-profit turnaround); Weak = a loss, or sales and profit both down; Mixed = the rest.";
  const earnGrade = (r) => SD.earnGrade(r);
  const GRADE_CLS = { Excellent: "g-ex", Good: "g-good", Mixed: "g-mix", Weak: "g-weak" };
  const GRADE_ORDER = { Excellent: 0, Good: 1, Mixed: 2, Weak: 3 };
  const EARN_SIGNALS = [["eps100", "EPS YoY > 100%", (r) => r.eps_g_yoy > 100], ["pat50", "PAT YoY > 50%", (r) => r.np_g_yoy > 50],
    ["sales25", "Sales YoY > 25%", (r) => r.sales_g_yoy > 25], ["accel", "Accelerating", (r) => r.eps_g_accel_qtrs >= 1],
    ["margin", "Margin up", (r) => r.npm_up_qtrs >= 1], ["turn", "Turnaround", (r) => r.np_year_ago_q != null && r.np_year_ago_q <= 0 && r.np_last_q > 0],
    ["rs70", "RS ≥ 70", (r) => r.rs_rating >= 70]];
  const EARN_SORTS = [["eps", "EPS growth", (r) => r.eps_g_yoy], ["sales", "Sales growth", (r) => r.sales_g_yoy], ["np", "Profit growth", (r) => r.np_g_yoy],
    ["react", "Results-day move", (r) => r.earn_chg_pct], ["mcap", "Market cap", (r) => r.mcap_cr]];
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mondayOf = (iso) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDay(d); };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDay(d); };
  const WD3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MO3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dLbl = (iso, yr) => { const t = new Date(iso + "T00:00:00"); return `${WD3[t.getDay()]} ${t.getDate()} ${MO3[t.getMonth()]}${yr ? " " + t.getFullYear() : ""}`; };
  /** a round letter badge per stock (we have no logos): the colour comes from the symbol, so a stock always looks the same */
  const monoHue = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const mono = (sym, big) => `<i class="mono${big ? " big" : ""}" style="--h:${monoHue(sym)}" aria-hidden="true">${esc(String(sym).replace(/[^A-Z0-9]/gi, "").slice(0, big ? 2 : 1))}</i>`;
  const sgnPct = (x, d = 0, unit = "%") => (x == null || !isFinite(x) ? '<span class="muted">—</span>'
    : `<span class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : x < 0 ? "−" : ""}${finNum(Math.abs(x), d)}${unit}</span>`);
  const sig3 = (v) => (v == null || !isFinite(v) ? "–" : finNum(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0));
  const crore = (v) => (v == null || !isFinite(v) ? "–" : `${v < 0 ? "−" : ""}₹${finNum(Math.abs(v), Math.abs(v) < 10 ? 1 : 0)} Cr`);

  async function renderEarnings(arg) {
    if (!state.screen) view.innerHTML = SKEL("Loading the earnings calendar");
    try { await loadScreen(); } catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    try { if (!state.breadth) state.breadth = await getJSON("data/breadth.json"); } catch (e) { /* holidays are then just not marked */ }
    if (routeName() !== "earnings") return;
    const today = isoDay(new Date());
    const rows = state.screen.filter((r) => !r.stale);
    // season: the latest quarter most stocks report
    const qs = new Map(); for (const r of rows) if (r.fin_qtr) qs.set(r.fin_qtr, (qs.get(r.fin_qtr) || 0) + 1);
    const qEnd = [...qs.keys()].sort().pop() || "", reported = qs.get(qEnd) || 0;
    const fqLabel = qEnd ? fq(qEnd) : "";
    const byDone = new Map(), byDue = new Map(), put = (m, d, r) => { if (!m.has(d)) m.set(d, []); m.get(d).push(r); };
    for (const r of rows) {
      if (r.last_result && r.fin_qtr === qEnd) put(byDone, r.last_result, r);
      if (r.next_result && r.next_result !== r.last_result) put(byDue, r.next_result, r);
    }
    // the five columns: weekdays always, Sat / Sun only with something on them
    const wkend = (d) => { const g = new Date(d + "T00:00:00").getDay(); return g === 0 || g === 6; };
    const shows = (d) => !wkend(d) || byDone.has(d) || byDue.has(d) || d === today;
    const step = (d, k) => { let x = d; do { x = addDays(x, k); } while (!shows(x)); return x; };
    let start;
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg || "")) start = shows(arg) ? arg : step(arg, 1);
    else { const c = shows(today) ? today : step(today, 1); start = step(step(c, -1), -1); }
    const days = [start]; while (days.length < 5) days.push(step(days[days.length - 1], 1));
    let prev = start; for (let i = 0; i < 5; i++) prev = step(prev, -1);
    const next = step(days[4], 1);
    const TD = state.breadth && state.breadth.days ? state.breadth.days : [], tdSet = new Set(TD);
    const holiday = (d) => TD.length && !wkend(d) && d >= TD[0] && d <= TD[TD.length - 1] && !tdSet.has(d);
    // filters (saved in the browser)
    const flt = Object.assign({ mcap: ["", ""], eps: ["", ""], sales: ["", ""], np: ["", ""], grades: [], sig: [], q: "", sort: "eps" }, store.get("sd-earn-f", {}));
    const n = (x) => (x === "" || x == null ? null : Number(x));
    const inR = (v, [a, b]) => (n(a) == null || (v != null && v >= n(a))) && (n(b) == null || (v != null && v <= n(b)));
    const nf = () => ["mcap", "eps", "sales", "np"].filter((k) => n(flt[k][0]) != null || n(flt[k][1]) != null).length + flt.grades.length + flt.sig.length;
    const pass = (r, g) => inR(r.mcap_cr, flt.mcap) && inR(r.eps_g_yoy, flt.eps) && inR(r.sales_g_yoy, flt.sales) && inR(r.np_g_yoy, flt.np)
      && (!flt.grades.length || flt.grades.includes(g)) && flt.sig.every((k) => { const s = EARN_SIGNALS.find((x) => x[0] === k); return s && s[2](r); });
    const qq = flt.q.trim().toLowerCase(), hit = (r) => !qq || r.symbol.toLowerCase().includes(qq) || String(r.name || "").toLowerCase().includes(qq);
    const NF = nf();
    let weekDone = 0;
    const matching = [];
    const col = (d, i) => {
      const done = byDone.get(d) || [], due = byDue.get(d) || [];
      weekDone += done.length;
      const all = done.map((r) => ({ r, g: earnGrade(r), done: true })).concat(due.map((r) => ({ r, g: null, done: false })));
      const items = all.filter((x) => (x.done ? pass(x.r, x.g) : !NF))
        .sort((a, b) => (a.done === b.done ? 0 : a.done ? -1 : 1) || (GRADE_ORDER[a.g] ?? 9) - (GRADE_ORDER[b.g] ?? 9) || (b.r.mcap_cr ?? 0) - (a.r.mcap_cr ?? 0));
      for (const x of items) if (x.done) matching.push({ ...x, d });
      const up = done.filter((r) => r.eps_g_yoy > 0).length, dn = done.filter((r) => r.eps_g_yoy < 0).length;
      const isT = d === today, hol = holiday(d);
      const line = [done.length ? `${done.length} result${done.length === 1 ? "" : "s"} <span class="ec-eps">EPS YoY <span class="up">▲${up}</span> <span class="down">▼${dn}</span></span>` : "",
        due.length ? `${due.length} due` : ""].filter(Boolean).join(" · ") || "No results";
      return `<section class="ec${isT ? " today" : ""}${hol ? " hol" : ""}" style="--i:${i}"><div class="ec-h"><div class="ec-t"><b>${dLbl(d)}</b>${isT ? '<span class="ec-tag t">TODAY</span>' : ""}${hol ? '<span class="ec-tag h">HOLIDAY</span>' : ""}${NF && all.length ? `<span class="ec-n">${items.length}/${all.length}</span>` : ""}</div>
        <small>${line}</small></div>
        <div class="ec-l">${items.length ? items.map(({ r, g, done: ok }) => `<a class="ec-r${ok ? "" : " due"}" href="#/i/s/${encodeURIComponent(r.id)}" data-k="${esc(r.key)}" data-d="${d}">${mono(r.symbol)}<b>${esc(r.symbol)}</b>${ok ? `<span class="egt ${GRADE_CLS[g] || ""}">${g || "–"}</span>` : ""}</a>`).join("")
          : `<p class="ec-none">${NF && all.length ? "None match" : "Nothing listed"}</p>`}</div></section>`;
    };
    const cols = days.map(col).join("");
    const rangeTxt = `${dLbl(days[0])} – ${dLbl(days[4], true)}`;
    const isNow = days.includes(today);
    // right panel: recent earnings (no filter) or the stocks of these five days that pass the filters
    const recentTo = days[4] > today ? today : days[4], recentFrom = addDays(recentTo, -14);
    const recent = NF ? [] : rows.filter((r) => r.last_result && r.last_result > recentFrom && r.last_result <= recentTo && r.fin_qtr === qEnd && hit(r))
      .map((r) => ({ r, g: earnGrade(r) }))
      .sort((a, b) => (a.r.last_result < b.r.last_result ? 1 : a.r.last_result > b.r.last_result ? -1 : (GRADE_ORDER[a.g] ?? 9) - (GRADE_ORDER[b.g] ?? 9) || (b.r.mcap_cr ?? 0) - (a.r.mcap_cr ?? 0)));
    const sortF = (EARN_SORTS.find((s) => s[0] === flt.sort) || EARN_SORTS[0])[2];
    const match = matching.filter((x) => hit(x.r)).sort((a, b) => (sortF(b.r) ?? -1e12) - (sortF(a.r) ?? -1e12));
    const rng = (k, l) => `<div class="ef-r"><label><input type="checkbox" data-fon="${k}" ${n(flt[k][0]) != null || n(flt[k][1]) != null ? "checked" : ""}><span>${l}</span></label>
      <span class="ef-w">between</span><input type="number" data-f="${k}" data-i="0" value="${esc(flt[k][0])}" placeholder="Any"><span class="ef-w">and</span><input type="number" data-f="${k}" data-i="1" value="${esc(flt[k][1])}" placeholder="Any"></div>`;
    const FUNNEL = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 3h12M4.5 8h7M7 13h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
    const SEARCH = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    view.innerHTML = `<div class="earn">
      <div class="eh"><h1>Earnings</h1>
        <div class="menu-wrap ei"><button class="ei-b" type="button" id="eiB" aria-label="How to read this page">i</button>
          <div class="ei-p" id="eiP" hidden><b>How to read this page</b>
            <p>Point at a stock to see its sales, profit (PAT), EPS and net margin against the same quarter a year ago (YoY) and the quarter before (QoQ).</p>
            <p>The grade is our own rule on the company's NSE filing, not on analyst estimates. ${esc(GRADE_RULE.replace(/^Our rule on the latest quarter vs a year before: /, ""))}</p>
            <p>"Due" stocks have a board meeting for results on that day. Click a stock to open its chart.</p>
            <p class="muted">For information only, not a recommendation.</p></div></div>
        <div class="eh-nav"><a class="eh-a" href="#/earnings/${prev}" title="Earlier days" aria-label="Earlier days">‹</a><b class="eh-r">${rangeTxt}</b><a class="eh-a" href="#/earnings/${next}" title="Later days" aria-label="Later days">›</a></div>
        <a class="eh-today${isNow ? " on" : ""}" href="#/earnings">Today</a>
        <span class="eh-s">${esc(fqLabel)} season <b>${reported.toLocaleString("en-IN")}</b> <i>/</i> ${rows.length.toLocaleString("en-IN")} stocks announced</span></div>
      <div class="eg"><div class="ecs">${cols}</div>
        <aside class="er"><div class="er-h"><div class="er-t"><b>${NF ? "Matching stocks" : "Recent earnings"}</b>${NF ? `<small class="muted">${match.length} of ${weekDone} in these days</small>` : ""}</div>
          <div class="er-tools"><label class="er-q">${SEARCH}<input type="search" id="erQ" placeholder="Search stock" value="${esc(flt.q)}" autocomplete="off"></label>
          <div class="menu-wrap"><button class="er-fb${NF ? " on" : ""}" id="efBtn" type="button">${FUNNEL} Filters${NF ? `<i>${NF}</i>` : ""}</button>
          <div class="ef" id="efM" hidden><div class="ef-h"><b>Filters</b><small>${NF ? NF + " on" : "No filters on"}</small></div>
            <div class="ef-b"><h5>EARNINGS</h5>${rng("mcap", "Market Cap ₹ Cr")}${rng("eps", "EPS Growth %")}${rng("sales", "Sales Growth %")}${rng("np", "Profit Growth %")}
            <h5>GRADE</h5><div class="ef-g">${Object.keys(GRADE_ORDER).map((g) => `<label><input type="checkbox" data-grade="${g}" ${flt.grades.includes(g) ? "checked" : ""}><span>${g}</span></label>`).join("")}</div>
            <h5>SIGNALS</h5><div class="ef-g">${EARN_SIGNALS.map(([k, l]) => `<label><input type="checkbox" data-sig="${k}" ${flt.sig.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
            <div class="ef-f"><small id="efN">${NF} filter${NF === 1 ? "" : "s"} active</small><button class="ef-x" type="button" data-ef="reset">Reset</button><button class="ef-ok" type="button" data-ef="apply">Apply filters</button></div></div></div></div>
          ${NF ? `<label class="er-sort">Sort <select id="erS">${EARN_SORTS.map(([k, l]) => `<option value="${k}" ${flt.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}</div>
          <div class="er-l" id="erL"></div></aside></div></div>
      <div class="ehc" id="eHov" hidden></div>`;
    $("#stPage").innerHTML = `<span>${weekDone} results</span><span class="st-n">${rangeTxt}</span>${NF ? `<span class="st-n">${NF} filter${NF === 1 ? "" : "s"}</span>` : ""}`;

    // right panel cards
    const box = $("#erL");
    let shown = 0;
    const dayHead = (d) => `<div class="er-d">${d === today ? "TODAY" : d === addDays(today, -1) ? "YESTERDAY" : dLbl(d).toUpperCase()}</div>`;
    const priceLine = (r) => `<span class="erc-p">Price <b>₹${SD.fmtPrice(r.close)}</b>${r.mcap_cr != null ? `<span>M.Cap <b>₹${finNum(r.mcap_cr)} Cr</b></span>` : ""}</span>`;
    const card = ({ r }) => `<div class="erc" data-id="${esc(r.id)}"><div class="erc-h"><a href="#/i/s/${encodeURIComponent(r.id)}">${esc(r.symbol)} <span class="arr">↗</span></a>${priceLine(r)}</div>
      <div class="erc-t"><i class="skel"></i></div></div>`;
    const fillCard = async (el) => {
      const doc = await getFin(el.dataset.id);
      const t = el.querySelector(".erc-t");
      if (!doc) { t.innerHTML = '<small class="muted erc-no">No quarterly numbers.</small>'; return; }
      const q = SDF.quarterTable(doc, SDF.basisOf(doc), 5), m = q.ends.length;
      if (m < 2) { t.innerHTML = '<small class="muted erc-no">Not enough quarters.</small>'; return; }
      const cs = [m - 1, m - 2, m - 5].filter((i) => i >= 0);
      const line = (k, l) => {
        const v = (q.rows.find((x) => x[1] === k) || [0, 0, []])[2], yo = m >= 5 ? chgPct(v[m - 1], v[m - 5]) : null;
        return `<tr><td class="l">${l}</td><td>${yo == null ? '<span class="muted">–</span>' : `<span class="${yo >= 0 ? "up" : "down"}">${yo >= 0 ? "↑" : "↓"} ${finNum(Math.abs(yo))}%</span>`}</td>`
          + cs.map((i) => `<td${i === m - 1 ? ' class="now"' : ""}>${v[i] == null ? "–" : k === "eps" ? (v[i] < 0 ? "−₹" : "₹") + finNum(Math.abs(v[i]), 2) : sig3(v[i]).replace("-", "−")}</td>`).join("") + "</tr>";
      };
      t.innerHTML = `<table class="erc-tb"><thead><tr><th class="l"></th><th>YoY</th>${cs.map((i) => `<th>${shortLbl(q.ends[i])}</th>`).join("")}</tr></thead><tbody>
        ${line("sales", "Sales")}${line("op_profit", doc.kind === "bank" || doc.kind === "nbfc" ? "Fin. profit" : "EBITDA")}${line("net_profit", "Net profit")}${line("eps", "EPS")}</tbody></table>`;
    };
    const mcard = ({ r, g, d }) => {
      const k = (l, v) => `<span><small>${l}</small>${v}</span>`;
      return `<a class="emc" href="#/i/s/${encodeURIComponent(r.id)}" data-k="${esc(r.key)}" data-d="${d}"><div class="emc-h">${mono(r.symbol)}<b>${esc(r.symbol)}</b><span class="gp ${GRADE_CLS[g] || ""}">${g || "–"}</span></div>
        <small class="emc-s">${dLbl(d)} · ${esc(fqLabel)}${r.mcap_cr != null ? ` · ₹${finNum(r.mcap_cr)} Cr` : ""}</small>
        <div class="emc-k">${k("SALES", sgnPct(r.sales_g_yoy))}${k("PAT", sgnPct(r.np_g_yoy))}${k("EPS", sgnPct(r.eps_g_yoy))}${k("MARGIN", r.npm_last_q == null ? '<span class="muted">—</span>' : finNum(r.npm_last_q, 1) + "%")}${k("REACTION", r.earn_sessions != null && r.earn_sessions <= 10 ? sgnPct(r.earn_chg_pct, 1) : '<span class="muted">—</span>')}</div></a>`;
    };
    const list = NF ? match : recent, per = NF ? 30 : 10;
    const more = () => {
      if (shown >= list.length) return;
      const part = list.slice(shown, shown + per);
      let lastDay = shown ? (NF ? list[shown - 1].d : list[shown - 1].r.last_result) : null, html = "";
      for (const x of part) {
        if (!NF) { if (x.r.last_result !== lastDay) { lastDay = x.r.last_result; html += dayHead(lastDay); } html += card(x); } else html += mcard(x);
      }
      box.insertAdjacentHTML("beforeend", html);
      if (!NF) box.querySelectorAll(".erc:not([data-done])").forEach((el) => { el.dataset.done = "1"; fillCard(el); });
      shown += part.length;
    };
    if (!list.length) box.innerHTML = `<p class="er-none">${NF ? "No stock of these days passes the filters." : qq ? "No recent result for this search." : "No results in the last 14 days."}</p>`;
    else more();
    box.addEventListener("scroll", () => { if (box.scrollTop + box.clientHeight > box.scrollHeight - 300) more(); });

    // filters
    const saveF = () => store.set("sd-earn-f", flt);
    $("#erQ").oninput = (e) => { flt.q = e.target.value; saveF(); clearTimeout(state.erT); state.erT = setTimeout(() => { renderEarnings(arg); setTimeout(() => { const q = $("#erQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 250); };
    if ($("#erS")) $("#erS").onchange = (e) => { flt.sort = e.target.value; saveF(); renderEarnings(arg); };
    const efM = $("#efM"), eiP = $("#eiP");
    const countF = () => {
      const k = ["mcap", "eps", "sales", "np"].filter((f) => efM.querySelector(`[data-fon="${f}"]`).checked).length + efM.querySelectorAll("[data-grade]:checked, [data-sig]:checked").length;
      $("#efN").textContent = `${k} filter${k === 1 ? "" : "s"} active`;
    };
    $("#efBtn").onclick = (e) => { e.stopPropagation(); eiP.hidden = true; efM.hidden = !efM.hidden; };
    efM.onclick = (e) => {
      e.stopPropagation();
      const a = e.target.closest("[data-ef]"); if (!a) return;
      if (a.dataset.ef === "reset") Object.assign(flt, { mcap: ["", ""], eps: ["", ""], sales: ["", ""], np: ["", ""], grades: [], sig: [] });
      else {
        for (const k of ["mcap", "eps", "sales", "np"]) {
          const on = efM.querySelector(`[data-fon="${k}"]`).checked;
          flt[k] = on ? [0, 1].map((i) => efM.querySelector(`[data-f="${k}"][data-i="${i}"]`).value) : ["", ""];
        }
        flt.grades = [...efM.querySelectorAll("[data-grade]:checked")].map((x) => x.dataset.grade);
        flt.sig = [...efM.querySelectorAll("[data-sig]:checked")].map((x) => x.dataset.sig);
      }
      saveF(); renderEarnings(arg);
    };
    efM.addEventListener("input", (e) => { const f = e.target.dataset.f; if (f) efM.querySelector(`[data-fon="${f}"]`).checked = e.target.closest(".ef-r").querySelectorAll("input[type=number]")[0].value !== "" || e.target.closest(".ef-r").querySelectorAll("input[type=number]")[1].value !== ""; countF(); });
    efM.addEventListener("change", countF);
    $("#eiB").onclick = (e) => { e.stopPropagation(); efM.hidden = true; eiP.hidden = !eiP.hidden; };
    eiP.onclick = (e) => e.stopPropagation();
    view.onclick = () => { efM.hidden = true; eiP.hidden = true; };

    // phone / narrow screens: the columns scroll sideways, start at today
    const tc = view.querySelector(".ec.today"), ecs0 = view.querySelector(".ecs");
    if (tc && ecs0.scrollWidth > ecs0.clientWidth) ecs0.scrollLeft = Math.max(0, tc.offsetLeft - ecs0.offsetLeft - 8);

    // hover card: the quarter in numbers, beside the column
    const hov = $("#eHov");
    const hovHTML = (r, d, done) => {
      const g = done ? earnGrade(r) : null;
      const npmYa = r.sales_year_ago_q > 0 && r.np_year_ago_q != null ? (r.np_year_ago_q / r.sales_year_ago_q) * 100 : null;
      const mYoY = r.npm_last_q != null && npmYa != null ? r.npm_last_q - npmYa : null, mQoQ = r.npm_last_q != null && r.npm_q2 != null ? r.npm_last_q - r.npm_q2 : null;
      const tr = (l, a, y, q) => `<tr><td class="l">${l}</td><td class="a">${a}</td><td>${y}</td><td>${q}</td></tr>`;
      const lastQ = r.fin_qtr ? fq(r.fin_qtr) : "";
      return `<div class="ehc-h">${mono(r.symbol, true)}<div><b>${esc(r.symbol)}</b><small>${done ? `${esc(lastQ)} · ${dLbl(d)}` : `Results due ${dLbl(d)}`}</small></div>
        ${done ? `<span class="gp solid ${GRADE_CLS[g] || ""}">${g || "–"}</span>` : '<span class="gp due">Due</span>'}</div>
        ${done ? "" : `<small class="ehc-c">Last reported quarter${lastQ ? ` · ${esc(lastQ)}` : ""}</small>`}
        <table class="ehc-t"><thead><tr><th class="l"></th><th>ACTUAL</th><th>YOY</th><th>QOQ</th></tr></thead><tbody>
        ${tr("Sales", crore(r.sales_last_q), sgnPct(r.sales_g_yoy), sgnPct(r.sales_g_qoq))}
        ${tr("PAT", crore(r.np_last_q), sgnPct(r.np_g_yoy), sgnPct(r.np_g_qoq))}
        ${tr("EPS", r.eps_last_q == null ? "–" : (r.eps_last_q < 0 ? "−₹" : "₹") + finNum(Math.abs(r.eps_last_q), 2), sgnPct(r.eps_g_yoy), sgnPct(r.eps_g_qoq))}
        ${tr("Margin", r.npm_last_q == null ? "–" : finNum(r.npm_last_q, 1) + "%", sgnPct(mYoY, 1, "pp"), sgnPct(mQoQ, 1, "pp"))}</tbody></table>
        ${done && r.earn_sessions != null && r.earn_sessions <= 10 && r.earn_chg_pct != null ? `<div class="ehc-f"><span>Results-day move</span>${sgnPct(r.earn_chg_pct, 1)}</div>` : ""}`;
    };
    let hovOn = null;
    const place = (a) => {
      const c = (a.closest(".ec") || a).getBoundingClientRect(), b = a.getBoundingClientRect(), w = 300, h = hov.offsetHeight || 230;
      let left = c.right - 4; if (left + w > innerWidth - 8) left = c.left - w + 4;
      if (left < 8) left = Math.min(innerWidth - w - 8, b.left + 24);
      const top = Math.max(8, Math.min(b.top - 12, innerHeight - h - 12));
      hov.style.left = `${left}px`; hov.style.top = `${top}px`;
    };
    const showHov = (a) => {
      if (a === hovOn) return;
      const r = state.screenByKey.get(a.dataset.k); if (!r) return;
      const first = hov.hidden;
      hov.innerHTML = hovHTML(r, a.dataset.d, !a.classList.contains("due"));
      hov.hidden = false; hov.classList.toggle("move", !first);
      if (first) { hov.classList.remove("in"); void hov.offsetWidth; hov.classList.add("in"); }
      place(a); hovOn = a;
    };
    const hideHov = () => { hov.hidden = true; hovOn = null; };
    if (matchMedia("(hover: hover)").matches) {
      const ecs = view.querySelector(".ecs");
      ecs.addEventListener("mouseover", (e) => { const a = e.target.closest(".ec-r"); if (a) showHov(a); });
      ecs.addEventListener("mouseleave", hideHov);
      ecs.addEventListener("scroll", hideHov, true);
      box.addEventListener("mouseover", (e) => { const a = e.target.closest(".emc"); if (a) showHov(a); else if (!e.target.closest(".ehc")) hideHov(); });
      box.addEventListener("mouseleave", hideHov);
      box.addEventListener("scroll", hideHov);
    }
  }

  /* ------------------------------------------------------------------ home / warm-up page (Phase N5) */
  /** simple SVG line chart: lines = [{vals, color, fill, dash}], y range lo..hi, bands = [[from, to, colour]], ticks = [values] */
  function svgLines(lines, o = {}) {
    const W = o.w || 560, H = o.h || 150, padL = 30, padB = 16, pw = W - padL - 4, ph = H - padB - 6;
    const n = Math.max(...lines.map((l) => l.vals.length), 2);
    const lo = o.lo ?? 0, hi = o.hi ?? 100;
    const X = (i) => padL + (i / (n - 1)) * pw, Y = (v) => 6 + ph - ((v - lo) / (hi - lo || 1)) * ph;
    const path = (vals) => vals.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
    let s = `<svg class="hl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.label || "chart")}"${o.id ? ` id="${o.id}" data-n="${n}" data-padl="${padL}" data-pw="${pw}" data-top="6" data-ph="${ph}" data-lo="${lo}" data-hi="${hi}"` : ""}>`;
    for (const [a, b, c] of o.bands || []) s += `<rect x="${padL}" y="${Y(b)}" width="${pw}" height="${Y(a) - Y(b)}" fill="${c}"/>`;
    for (const t of o.ticks || []) s += `<line x1="${padL}" x2="${W - 4}" y1="${Y(t)}" y2="${Y(t)}" class="hl-grid"/><text x="${padL - 4}" y="${Y(t) + 3}" text-anchor="end" class="hl-ax">${t}${o.unit || ""}</text>`;
    for (const l of lines) {
      const p = path(l.vals);
      if (p.length < 2) continue;
      if (l.fill) s += `<path d="M${p[0].split(",")[0]},${Y(lo)} L${p.join(" L")} L${p[p.length - 1].split(",")[0]},${Y(lo)} Z" fill="${l.fill}"/>`;
      s += `<polyline points="${p.join(" ")}" fill="none" stroke="${l.color}" stroke-width="${l.width || 1.8}" ${l.dash ? 'stroke-dasharray="3 3"' : ""} vector-effect="non-scaling-stroke"/>`;
    }
    for (const [i, t] of o.xlabels || []) s += `<text x="${X(i)}" y="${H - 3}" text-anchor="${i === 0 ? "start" : i >= n - 1 ? "end" : "middle"}" class="hl-ax">${esc(t)}</text>`;
    return s + "</svg>";
  }
  /** bars around zero (FII / DII, highs - lows); the last bar darker */
  function svgBars(vals, o = {}) {
    const W = o.w || 300, H = o.h || 34, n = Math.max(vals.length, 1), m = Math.max(1, ...vals.map((v) => Math.abs(v || 0))), bw = W / n, mid = H / 2;
    return `<svg class="hl-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"${o.id ? ` id="${o.id}" data-n="${n}"` : ""}><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="hl-grid"/>${vals.map((v, i) => {
      if (v == null) return "";
      const h = Math.max(1, (Math.abs(v) / m) * (mid - 1)), last = i === n - 1;
      return `<rect data-i="${i}" x="${(i * bw + bw * 0.12).toFixed(1)}" y="${v >= 0 ? mid - h : mid}" width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" class="${v >= 0 ? "pos" : "neg"} ${last ? "last" : ""}"/>`;
    }).join("")}</svg>`;
  }
  /** hover on a Home chart (Viraj 11-Nov, like the reference's Warm-up page): a vertical line (+ dots on line charts) on the
      day under the pointer, and onMove(i) / onLeave() update the header text; the latest day comes back on leave */
  function chartHover(svg, series, onMove, onLeave) {
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg", W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height, n = Number(svg.dataset.n) || 1;
    const bars = svg.classList.contains("hl-bars");
    const padL = Number(svg.dataset.padl) || 0, pw = Number(svg.dataset.pw) || W, top = Number(svg.dataset.top) || 0, ph = Number(svg.dataset.ph) || H;
    const lo = Number(svg.dataset.lo) || 0, hi = Number(svg.dataset.hi) || 100;
    const X = (i) => (bars ? (i + 0.5) * (W / n) : padL + (i / Math.max(1, n - 1)) * pw), Y = (v) => top + ph - ((v - lo) / (hi - lo || 1)) * ph;
    const g = document.createElementNS(NS, "g"); g.setAttribute("class", "hl-x"); g.style.display = "none";
    const ln = document.createElementNS(NS, "line"); ln.setAttribute("y1", bars ? 0 : top); ln.setAttribute("y2", bars ? H : top + ph);
    ln.setAttribute("vector-effect", "non-scaling-stroke"); g.appendChild(ln);
    const dots = (series || []).map((sr) => { const c = document.createElementNS(NS, "circle"); c.setAttribute("r", 3.2); c.style.fill = sr.color; g.appendChild(c); return { c, sr }; });
    svg.appendChild(g);
    const rects = bars ? [...svg.querySelectorAll("rect")] : [];
    let last = -1;
    const at = (ev) => {
      const b = svg.getBoundingClientRect(), x = ((ev.clientX - b.left) / (b.width || 1)) * W;
      return Math.max(0, Math.min(n - 1, bars ? Math.floor(x / (W / n)) : Math.round(((x - padL) / (pw || 1)) * (n - 1))));
    };
    svg.addEventListener("pointermove", (ev) => {
      const i = at(ev); if (i === last) return; last = i;
      g.style.display = ""; const x = X(i); ln.setAttribute("x1", x); ln.setAttribute("x2", x);
      for (const { c, sr } of dots) { const v = sr.vals[i]; if (v == null) { c.style.display = "none"; continue; } c.style.display = ""; c.setAttribute("cx", x); c.setAttribute("cy", Y(v)); }
      rects.forEach((r) => r.classList.toggle("hov", Number(r.dataset.i) === i));
      onMove(i);
    });
    svg.addEventListener("pointerleave", () => { last = -1; g.style.display = "none"; rects.forEach((r) => r.classList.remove("hov")); onLeave(); });
  }
  const spark = (vals, up, w = 180, h = 36) => {
    const v = vals.filter((x) => x != null);
    if (v.length < 2) return "";
    const lo = Math.min(...v), hi = Math.max(...v), X = (i) => (i / (v.length - 1)) * w, Y = (x) => h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4);
    return `<svg class="spark ${up ? "up" : "down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${v.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ")}" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const shortDay = (d) => { const t = new Date(d + "T00:00:00"); return t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
  /** NSE weekly Nifty expiry: Tuesday (since 1-Sep-2025); monthly = the last Tuesday of the month (holidays move it a day earlier) */
  function expiries(from, n = 4) {
    const out = [], d = new Date(from + "T00:00:00");
    while (out.length < n) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 2) continue;
      const nx = new Date(d); nx.setDate(d.getDate() + 7);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push([iso, nx.getMonth() !== d.getMonth() ? "Monthly Nifty expiry" : "Weekly Nifty expiry"]);
    }
    return out;
  }

  async function renderHome() {
    view.innerHTML = SKEL("Loading the warm-up");
    let B = null, flows = null;
    try { await loadScreen(); } catch (e) { /* the page still shows the parts without stocks */ }
    try { if (!state.breadth) state.breadth = await getJSON("data/breadth.json"); B = state.breadth; } catch (e) { B = null; }
    try { if (!state.groups) state.groups = await getJSON("data/group_ranks.json"); } catch (e) { /* no groups yet */ }
    try { flows = await getJSON("data/fii_dii.json"); } catch (e) { flows = null; }
    try { if (!state.scanSpec) await loadScans(); } catch (e) { /* no scanners */ }
    const N = await getNews();
    let ipos = { recent: [], upcoming: [] };
    try { ipos = await getJSON("data/ipos.json"); } catch (e) { /* none yet */ }
    if (routeName() !== "") return;
    const hs = Object.assign({ part: "50", more: false }, store.get("sd-home", {}));
    const saveHs = () => store.set("sd-home", hs);
    const U = B && (B.universes.liquid || B.universes.all), S = U ? U.series : {};
    const last = (k) => { const a = S[k]; return a && a.length ? a[a.length - 1] : null; };
    const days = B ? B.days.slice(-130) : [], cut = (k) => (S[k] || []).slice(-130);
    const lab = (v, labels) => { for (const [lim, t] of labels || []) if (v < lim) return t; return ""; };
    // market read
    const READ = [["momentum", "Momentum"], ["short_term", "Short-term"], ["big_trend", "Big trend"], ["breakouts", "Breakouts"], ["overdone", "Overdone?"], ["leadership", "Leadership"]];
    const read = (U && U.read) || {};
    const rd = READ.filter(([k]) => read[k]);
    const readHTML = rd.length ? rd.map(([k, l], i) => `<div class="hr-row ${i >= 3 && !hs.more ? "more" : ""}" title="${esc(read[k].rule || "")}"><div><i class="hr-dot ${WORD_CLS[read[k].word] || "t-info"}"></i><b>${l}</b><span class="tag ${WORD_CLS[read[k].word] || "t-info"}">${esc(read[k].word)}</span></div><p>${esc(read[k].text)}</p></div>`).join("")
      + (rd.length > 3 ? `<button type="button" class="sp-link" id="hrMore">${hs.more ? "Show less" : `Show ${rd.length - 3} more`}</button>` : "") : '<p class="muted small">Breadth data not built yet.</p>';
    // participation + stages
    const pk = `pct_above${hs.part === "20" ? "20" : hs.part === "200" ? "200" : "50"}`;
    const pv = last(pk);
    const n500 = B && B.indices && B.indices.NIFTY_500 ? B.indices.NIFTY_500.slice(-130) : [];
    const nv = n500.filter((x) => x != null), nlo = Math.min(...nv), nhi = Math.max(...nv);
    const n500s = n500.map((x) => (x == null ? null : 5 + ((x - nlo) / (nhi - nlo || 1)) * 90));
    const xl = days.length ? [[0, shortDay(days[0])], [Math.floor(days.length / 2), shortDay(days[Math.floor(days.length / 2)])], [days.length - 1, shortDay(days[days.length - 1])]] : [];
    const partHTML = B ? `<div class="hp-h"><small class="muted">PARTICIPATION</small>${seg("hpart", [["20", "20D"], ["50", "50D"], ["200", "200D"]], hs.part)}</div>
      <div class="hp-v"><b id="hpVal">${pv == null ? "–" : pv.toFixed(1) + "%"}</b><span class="tag t-info" id="hpTag">${esc(lab(pv, B.config.participation_labels))}</span><small class="muted">above the ${hs.part}-day average · <span id="hpDay">latest ${shortDay(days[days.length - 1])}</span></small></div>
      ${svgLines([{ vals: n500s, color: "var(--muted)", width: 1.2 }, { vals: cut(pk), color: "#2962ff", fill: "rgba(41,98,255,.12)" }], { lo: 0, hi: 100, ticks: [0, 20, 50, 80, 100], unit: "%", bands: [[80, 100, "rgba(219,39,119,.08)"]], xlabels: xl, label: "Participation", id: "hpPart" })}
      <small class="muted">grey = Nifty 500 (scaled) · pink zone = more than 80 % (stretched)</small>
      <div class="hp-h" style="margin-top:12px"><small class="muted">STAGE 2 · STAGE 4 <span id="hsDay"></span></small><span class="small"><b style="color:#2962ff" id="hsS2">Stage 2 ${(last("stage2") ?? 0).toFixed(1)}%</b> · <b style="color:#db2777" id="hsS4">Stage 4 ${(last("stage4") ?? 0).toFixed(1)}%</b></span></div>
      ${svgLines([{ vals: cut("stage2"), color: "#2962ff" }, { vals: cut("stage4"), color: "#db2777" }], { lo: 0, hi: 70, ticks: [0, 35, 70], unit: "%", xlabels: xl, h: 120, label: "Stage 2 and stage 4", id: "hpStage" })}` : "";
    // FII / DII + highs - lows
    const fr = flows ? flows.rows.slice(-22) : [];
    const sum = (k) => fr.reduce((a, r) => a + (r[k] || 0), 0);
    const flowRow = (k, label) => { const lastR = fr[fr.length - 1]; return `<div class="hf-row"><div class="hf-t"><b>${label}</b><small class="muted" id="hf-${k}-d">${lastR ? shortDay(lastR.date) : ""}</small><b id="hf-${k}-v" class="${lastR && lastR[k] >= 0 ? "up" : "down"}">${lastR ? (lastR[k] > 0 ? "+" : "") + finNum(lastR[k]) : "–"}</b></div>
      ${svgBars(fr.map((r) => r[k]), { id: `hf-${k}` })}<div class="hf-t"><small class="muted">${fr.length} session${fr.length === 1 ? "" : "s"} net</small><b class="${sum(k) >= 0 ? "up" : "down"}">${sum(k) > 0 ? "+" : ""}${finNum(sum(k))}</b></div></div>`; };
    const hl = (S.nh20 || []).slice(-22).map((h, i) => h - ((S.nl20 || []).slice(-22)[i] || 0));
    const flowHTML = `<div class="hp-h"><small class="muted">FII / DII CASH · ${fr.length > 1 ? `LAST ${fr.length} SESSIONS` : "LATEST SESSION"}</small><small class="muted">₹ crore</small></div>
      ${fr.length ? flowRow("fii_net", "FII") + flowRow("dii_net", "DII") + (fr.length < 22 ? `<p class="muted small">Collected daily from NSE since ${SD.fmtDate(flows.since)}; the bars fill up to 22 sessions.</p>` : "") : '<p class="muted small">FII / DII figures start with the next daily update.</p>'}
      <div class="hp-h" style="margin-top:12px"><small class="muted">20-DAY HIGHS · LOWS · LAST 22 SESSIONS</small></div>
      ${B ? `<div class="hf-row"><div class="hf-t"><b>Net highs − lows</b><small class="muted" id="hhl-d">${shortDay(days[days.length - 1])}</small><b id="hhl-v" class="${hl[hl.length - 1] >= 0 ? "up" : "down"}">${hl[hl.length - 1] > 0 ? "+" : ""}${hl[hl.length - 1] ?? "–"}</b></div>${svgBars(hl, { id: "hhl" })}
        <div class="hf-t"><span></span><span class="small"><b class="up" id="hhl-h">${last("nh20") ?? "–"} highs</b> · <b class="down" id="hhl-l">${last("nl20") ?? "–"} lows</b></span></div></div>` : ""}`;
    // indices strip
    const IDX = [["NIFTY_50", "Nifty 50"], ["NIFTY_500", "Nifty 500"], ["NIFTY_MIDCAP_150", "Midcap 150"], ["NIFTY_SMALLCAP_250", "Smallcap 250"], ["NIFTY_MICROCAP_250", "Microcap 250"], ["NIFTY_BANK", "Nifty Bank"], ["INDIA_VIX", "India VIX"]];
    const idxHTML = IDX.map(([id, name]) => { const r = state.byKey.get("n:" + id); return r ? `<a class="hi-card" href="#/i/n/${id}" data-idx="${id}"><div class="hi-t"><span>${name}</span>${pct(r.chg_1d)}</div><b>${SD.fmtPrice(r.close)}</b>
      <div class="hi-sp"><i class="skel"></i></div><div class="hi-f"><small class="muted">${r.from_hi52 == null ? "" : finNum(Math.abs(r.from_hi52), 1) + "% from high"}</small><small class="hi-ma"></small></div></a>` : ""; }).join("");
    // today's setups: near pivot / VCP / flag / tight range, liquid, RS 70+, closest to the pivot first
    const SET = [["near-pivot", "Near Pivot"], ["vcp", "VCP"], ["flag", "Flag"], ["tight-range", "Tight Setups"]];
    const seen = new Map();
    if (state.screen && state.scanSpec) for (const [sid, tag] of SET) {
      const sc = allScans().find((x) => x.id === sid); if (!sc) continue;
      for (const r of SDS.run(state.screen, sc)) if ((r.liquid_day ?? r.liquid) && (r.rs_rating ?? 0) >= 70 && !seen.has(r.key)) seen.set(r.key, { r, tag, sid });
    }
    const setups = [...seen.values()].sort((a, b) => Math.abs(a.r.dist_pivot ?? 99) - Math.abs(b.r.dist_pivot ?? 99)).slice(0, 15);
    const setHTML = setups.length ? `<div class="table-wrap hs-t"><table><thead><tr><th class="l">Stock</th><th>RS</th><th>Close</th><th>To pivot</th><th>1M</th><th>3M</th><th>52W high</th></tr></thead><tbody>`
      + setups.map(({ r, tag }) => `<tr data-key="${esc(r.key)}"><td class="l name"><b>${esc(r.symbol)}</b><span><i class="hs-tag">${tag}</i> ${esc(r.basic_industry || r.industry || "")}</span></td><td class="num">${r.rs_rating ?? "–"}</td>`
        + `<td class="num">${SD.fmtPrice(r.close)}</td><td class="num">${r.dist_pivot == null ? "–" : finNum(Math.abs(r.dist_pivot), 1) + "%"}</td><td class="num">${pct(r.ret_1m)}</td><td class="num">${pct(r.ret_3m)}</td><td class="num">${pct(r.from_hi52)}</td></tr>`).join("")
      + "</tbody></table></div>" : '<p class="muted small">No liquid RS 70+ stock near a pivot today.</p>';
    // where the money is: themes by 1-week average return
    const th = state.groups && state.groups.levels && state.groups.levels.theme ? state.groups.levels.theme.filter((t) => t.avg_1w != null && !t.small) : [];
    const ths = th.slice().sort((a, b) => b.avg_1w - a.avg_1w), lead = ths.slice(0, 5), lag = ths.slice(-3).reverse();
    const mx = Math.max(1, ...ths.map((t) => Math.abs(t.avg_1w)));
    const thRow = (t) => `<a class="hm-row" href="#/groups/theme/${encodeURIComponent(t.name)}"><span>${esc(t.name)}</span><i class="hm-bar"><i class="${t.avg_1w >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(t.avg_1w) / mx) * 100}%"></i></i>${pct(t.avg_1w)}</a>`;
    const moneyHTML = ths.length ? `<small class="muted hm-l">LEADING</small>${lead.map(thRow).join("")}<small class="muted hm-l">LAGGING</small>${lag.map(thRow).join("")}<a class="sp-link" href="#/groups/theme">Open themes →</a>` : '<p class="muted small">Theme ranks not built yet.</p>';
    // events: results this week and next, expiries
    const today = state.screenDate || state.dataDate;
    const due = new Map();
    for (const r of state.screen || []) if (r.next_result && r.next_result > today && r.days_to_result != null && r.days_to_result <= 10) { if (!due.has(r.next_result)) due.set(r.next_result, []); due.get(r.next_result).push(r); }
    const dueHTML = [...due.keys()].sort().slice(0, 5).map((d) => { const list = due.get(d).sort((a, b) => (b.mcap_cr ?? 0) - (a.mcap_cr ?? 0)); return `<div class="he-d"><b>${shortDay(d)}</b><div>${list.slice(0, 6).map((r) => `<a href="#/i/s/${encodeURIComponent(r.id)}">${esc(r.symbol)}</a>`).join("")}${list.length > 6 ? `<span class="muted">+${list.length - 6} more</span>` : ""}</div></div>`; }).join("");
    // orders, deals and approvals of the last 5 days (company filings), liquid stocks, biggest first
    const d5 = (() => { const t = new Date((state.screenDate || state.dataDate) + "T00:00:00"); t.setDate(t.getDate() - 5); return t.toISOString().slice(0, 10); })();
    const deals = N.rows.filter((n) => (n[2] === "O" || n[2] === "D") && n[0] >= d5).map((n) => ({ n, r: state.screenByKey.get("s:" + n[1]) }))
      .filter((x) => x.r && (x.r.liquid_day ?? x.r.liquid)).sort((a, b) => (a.n[0] < b.n[0] ? 1 : -1)).slice(0, 8);
    const dealsHTML = deals.length ? deals.map(({ n, r }) => `<div class="hd-row"><small class="muted">${esc(shortDay(n[0].slice(0, 10)))}<br>${esc(n[0].slice(11, 16))}</small>
      <div><a href="#/i/s/${encodeURIComponent(n[1])}"><b>${esc(n[1])}</b></a> ${newsBadge(n[2], N.cats)} <small class="muted">${esc(N.cats[n[2]] || "")}</small><div class="small">${newsText(n[3], n[4])}</div></div>${newsLink(n[5], N.pdf)}</div>`).join("")
      : '<p class="muted small">No orders or deals filed by liquid stocks in the last 5 days.</p>';
    const ipoHTML = (ipos.upcoming.length ? ipos.upcoming.map(([sym, name, op, cl, price, lst]) => `<div class="he-c"><b>${esc(sym)}</b><span>${esc(name || "")} · bids ${esc(SD.fmtDate(op))} – ${esc(SD.fmtDate(cl))} · ${esc(price)}${lst ? ` · lists ${esc(SD.fmtDate(lst))}` : ""}</span></div>`).join("")
        : '<p class="muted small">No main-board IPO open or waiting to list.</p>')
      + (ipos.recent.length ? `<small class="muted hm-l">LISTED IN THE LAST 45 DAYS</small>` + ipos.recent.slice(0, 6).map(([sym, d, pr]) => { const r = state.screenByKey.get("s:" + sym), g = r && pr ? (r.close / Number(pr) - 1) * 100 : null;
          return `<div class="he-c"><b>${r ? `<a href="#/i/s/${encodeURIComponent(sym)}">${esc(sym)}</a>` : esc(sym)}</b><span>${esc(SD.fmtDate(d))} · issue ₹${esc(pr)}${g != null ? ` · now ₹${SD.fmtPrice(r.close)} ${pct(g)}` : ""}</span></div>`; }).join("") : "");
    const evHTML = `<small class="muted hm-l">RESULTS</small>${dueHTML || '<p class="muted small">No results dates in the next 10 days.</p>'}
      <small class="muted hm-l">IPOs (MAIN BOARD)</small>${ipoHTML}
      <small class="muted hm-l">CALENDAR</small>${expiries(today, 4).map(([d, t]) => `<div class="he-c"><b>${shortDay(d)}</b><span>${t}</span></div>`).join("")}<p class="muted small">Expiry days move earlier when the exchange is closed.</p>`;
    // watchlist plan
    const sig = (r) => [r.pocket_pivot && "Pocket pivot", r.high_volume && r.chg_1d > 0 && "Up on big volume", r.hve && "Highest volume ever", r.rs_line_52w_high && "RS line high",
      r.breakout_days === 0 && "Breakout today", r.dist_pivot != null && r.dist_pivot > -3 && r.dist_pivot <= 0 && "Near pivot", r.dry_up && "Volume dry-up", r.new_low_20d && "New 20-day low"].filter(Boolean);
    const wl = (state.screen || []).filter((r) => state.watch.has(r.key));
    const groupsW = [["Good day", wl.filter((r) => r.chg_1d >= 1)], ["Weak day", wl.filter((r) => r.chg_1d <= -1)], ["Quiet", wl.filter((r) => r.chg_1d > -1 && r.chg_1d < 1)]];
    const wlHTML = wl.length ? groupsW.filter(([, l]) => l.length).map(([g, l]) => `<small class="muted hm-l">${g.toUpperCase()} · ${l.length}</small>${l.map((r) => `<a class="hw-row" href="#/i/s/${encodeURIComponent(r.id)}"><div><b>${esc(r.symbol)}</b> <small class="muted">RS ${r.rs_rating ?? "–"}</small><span class="num">${SD.fmtPrice(r.close)} ${pct(r.chg_1d)}</span></div>`
      + `<div class="hw-sig">${sig(r).map((x) => `<i>${x}</i>`).join("") || '<small class="muted">No new signals</small>'}</div></a>`).join("")}`).join("") : '<p class="muted small">Tap ★ on any stock to add it; its signals show here each day.</p>';
    const nLiquid = U && U.series && U.series.n ? U.series.n[U.series.n.length - 1] : null;
    view.innerHTML = `<div class="home">
      <section class="hcard"><div class="hc-h"><h2>Market condition</h2><span class="muted small">${nLiquid ? nLiquid.toLocaleString("en-IN") + " liquid stocks · " : ""}as of ${B ? shortDay(B.data_date) : "–"}</span><a class="sp-link" href="#/breadth">Market breadth →</a></div>
        <div class="hc-3"><div class="hc-read"><small class="muted">MARKET READ</small>${readHTML}</div><div class="hc-part">${partHTML}</div><div class="hc-flow">${flowHTML}</div></div></section>
      <section class="hcard"><div class="hc-h"><h2>Indices</h2><a class="sp-link" href="#/breadth/indices">Major indices →</a></div><div class="hi-grid">${idxHTML}</div></section>
      <div class="hc-2"><section class="hcard"><div class="hc-h"><h2>Today's setups</h2><span class="muted small">${setups.length} liquid stocks, RS 70+, nearest the pivot</span>
          <button class="btn sm" id="hsCopy" type="button">Copy to TradingView</button><a class="sp-link" href="#/scanners/near-pivot">Open in Scanner →</a></div>${setHTML}</section>
        <div class="hc-col"><section class="hcard"><div class="hc-h"><h2>Where the money is</h2><span class="muted small">themes · 1 week</span></div>${moneyHTML}</section>
          <section class="hcard ev"><div class="hc-h"><h2>Coming up</h2><span class="muted small">results, IPOs, expiries</span></div>${evHTML}</section></div></div>
      <section class="hcard"><div class="hc-h"><h2>Orders, deals & expansion</h2><span class="muted small">company filings with NSE · last 5 days · liquid stocks</span><a class="sp-link" href="#/news">All filings →</a></div><div class="hd">${dealsHTML}</div></section>
      <section class="hcard"><div class="hc-h"><h2>Your watchlist plan</h2><span class="muted small">${wl.length} stock${wl.length === 1 ? "" : "s"}</span><a class="sp-link" href="#/watchlist">Open watchlist →</a></div><div class="hw">${wlHTML}</div></section>
      <p class="muted small">Our own simple rules on end-of-day data. Educational purpose only, not investment advice.</p></div>`;
    $("#stPage").innerHTML = `<span>${setups.length} setups</span><span class="st-n">Data ${SD.fmtDate(state.screenDate || state.dataDate)}</span>`;
    const hr = $("#hrMore"); if (hr) hr.onclick = () => { hs.more = !hs.more; saveHs(); renderHome(); };
    if (B) {   // hover: the day under the pointer in the header, the latest day again on leave
      const setTxt = (id, t, cls) => { const e = document.getElementById(id); if (!e) return; e.textContent = t; if (cls) e.className = cls; };
      const sgn = (v, f = (x) => String(x)) => (v == null ? "–" : (v > 0 ? "+" : "") + f(v));
      const pa = cut(pk), s2 = cut("stage2"), s4 = cut("stage4");
      chartHover(document.getElementById("hpPart"), [{ vals: pa, color: "#2962ff" }], (i) => {
        const v = pa[i]; setTxt("hpVal", v == null ? "–" : v.toFixed(1) + "%"); setTxt("hpTag", lab(v, B.config.participation_labels)); setTxt("hpDay", shortDay(days[i]));
      }, () => { setTxt("hpVal", pv == null ? "–" : pv.toFixed(1) + "%"); setTxt("hpTag", lab(pv, B.config.participation_labels)); setTxt("hpDay", "latest " + shortDay(days[days.length - 1])); });
      chartHover(document.getElementById("hpStage"), [{ vals: s2, color: "#2962ff" }, { vals: s4, color: "#db2777" }], (i) => {
        setTxt("hsDay", "· " + shortDay(days[i])); setTxt("hsS2", `Stage 2 ${(s2[i] ?? 0).toFixed(1)}%`); setTxt("hsS4", `Stage 4 ${(s4[i] ?? 0).toFixed(1)}%`);
      }, () => { setTxt("hsDay", ""); setTxt("hsS2", `Stage 2 ${(last("stage2") ?? 0).toFixed(1)}%`); setTxt("hsS4", `Stage 4 ${(last("stage4") ?? 0).toFixed(1)}%`); });
      for (const k of ["fii_net", "dii_net"]) {
        const show = (r) => { setTxt(`hf-${k}-d`, r ? shortDay(r.date) : ""); setTxt(`hf-${k}-v`, r ? sgn(r[k], finNum) : "–", r && r[k] >= 0 ? "up" : "down"); };
        chartHover(document.getElementById(`hf-${k}`), null, (i) => show(fr[i]), () => show(fr[fr.length - 1]));
      }
      const hd = B.days.slice(-22), nh = (S.nh20 || []).slice(-22), nl = (S.nl20 || []).slice(-22);
      const showHL = (i) => { setTxt("hhl-d", shortDay(hd[i])); setTxt("hhl-v", sgn(hl[i]), hl[i] >= 0 ? "up" : "down"); setTxt("hhl-h", `${nh[i] ?? "–"} highs`); setTxt("hhl-l", `${nl[i] ?? "–"} lows`); };
      chartHover(document.getElementById("hhl"), null, showHL, () => showHL(hl.length - 1));
    }
    const hp = view.querySelector("[data-seg=hpart]"); if (hp) hp.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; hs.part = b.dataset.v; saveHs(); renderHome(); };
    $("#hsCopy").onclick = async () => { const t = setups.map(({ r }) => "NSE:" + r.symbol).join(","); try { await navigator.clipboard.writeText(t); $("#hsCopy").textContent = `Copied ${setups.length}`; } catch (e) { prompt("Copy these symbols:", t); } };
    view.querySelectorAll(".hs-t tr[data-key]").forEach((tr) => { tr.onclick = () => { location.hash = "#/i/" + tr.dataset.key.replace(":", "/"); }; });
    // index sparklines (last 3 months) + above / below the 50 EMA and 200 SMA
    for (const el of view.querySelectorAll("[data-idx]")) {
      getJSON(`data/c/n/${el.dataset.idx}.json`).then((d) => {
        const c = SD.candlesFromChart(d, "adjusted").map((b) => b.close), l3 = c.slice(-63);
        const e50 = SD.ema(c, 50), s200 = c.length >= 200 ? c.slice(-200).reduce((a, x) => a + x, 0) / 200 : null, lc = c[c.length - 1];
        el.querySelector(".hi-sp").innerHTML = spark(l3, l3[l3.length - 1] >= l3[0]);
        const e = e50[e50.length - 1];
        el.querySelector(".hi-ma").innerHTML = `<span class="${lc >= e ? "up" : "down"}">50E</span> · <span class="${s200 != null && lc >= s200 ? "up" : "down"}">200S</span>`;
      }).catch(() => { el.querySelector(".hi-sp").innerHTML = ""; });
    }
  }

  /* ------------------------------------------------------------------ stock panel (Phase N4): price head + accordion
     Overview (tags, key ratios, pros & cons) · Financials (mini bars per line) · Peers (same basic industry) · Shareholding */
  const finCache = new Map();
  const getFin = (id) => { if (!finCache.has(id)) finCache.set(id, getJSON(`data/f/${encodeURIComponent(id)}.json`).catch(() => null)); return finCache.get(id); };
  const fq = (end) => { const y = +end.slice(0, 4), m = +end.slice(5, 7); const q = { 6: 1, 9: 2, 12: 3, 3: 4 }[m]; return q ? `Q${q} FY${String(m >= 4 ? y + 1 : y).slice(2)}` : SDF.label(end); };
  const shortLbl = (end) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+end.slice(5, 7) - 1]} '${end.slice(2, 4)}`;
  /** small bar chart of a series (oldest first); negative bars in the down colour, the last bar darker */
  function miniBars(vals, w = 92, h = 24) {
    const v = vals.map((x) => (x == null || !isFinite(x) ? null : Number(x)));
    const max = Math.max(0, ...v.filter((x) => x != null)), min = Math.min(0, ...v.filter((x) => x != null));
    const span = max - min || 1, n = v.length || 1, bw = w / n, zero = h * (max / span);
    return `<svg class="mbar" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${v.map((x, i) => {
      if (x == null) return "";
      const bh = Math.max(1, (Math.abs(x) / span) * h), y = x >= 0 ? zero - bh : zero;
      return `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" class="${x < 0 ? "neg" : ""} ${i === n - 1 ? "last" : ""}"/>`;
    }).join("")}</svg>`;
  }
  const chgPct = (a, b) => (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const pctTag = (x, d = 0) => (x == null ? '<span class="muted">—</span>' : `<span class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${finNum(x, d)}%</span>`);

  async function stockPanel(box, r, opts = {}) {
    if (!box) return;
    const id = r.id;
    box.dataset.id = id;
    const open = store.get("sd-panel-open", { ov: true, fin: true, peers: false, shp: false });
    const watchKey = r.key || `s:${id}`;
    const sec = (k, title, sum, body) => `<details class="sp-sec" data-sec="${k}" ${open[k] ? "open" : ""}><summary><b>${title}</b><span class="sp-sum">${sum}</span></summary><div class="sp-b">${body}</div></details>`;
    const kv = (l, v) => `<div class="sp-kv"><small>${l}</small><b>${v}</b></div>`;
    const pctv = (v, d = 1) => (v == null || !isFinite(v) ? "–" : finNum(v, d) + "%");
    const head = `<div class="sp-h"><div class="sp-t"><b title="${esc(r.name)}">${esc(r.name || r.symbol)}</b><small class="muted">NSE:${esc(r.symbol)}${r.series && r.series !== "EQ" ? " · " + esc(r.series) : ""}</small></div>
        <span class="sp-act"><button type="button" class="icon-btn sm" data-sp="full" title="Full financials page">⤢</button>
        <button type="button" class="icon-btn sm star ${state.watch.has(watchKey) ? "on" : ""}" data-sp="watch" title="Watchlist">★</button></span></div>
      <div class="sp-px"><b>₹${SD.fmtPrice(r.close)}</b>${pct(r.chg_1d)}<span class="sp-rt">1M ${pct(r.ret_1m)} · 3M ${pct(r.ret_3m)}</span></div>`;
    const tags = [r.sector, r.basic_industry, r.theme].filter(Boolean).map((t) => `<span class="sp-tag">${esc(t)}</span>`).join("")
      + (r.next_result ? `<span class="sp-tag due">📅 Results ${esc(SD.fmtDate(r.next_result))}</span>` : "");
    const pc = SDF.prosCons(r);
    const ov = `<div class="sp-tags">${tags}</div><h5>Key ratios</h5><div class="sp-grid">
        ${kv("Market cap", r.mcap_cr != null ? "₹" + finNum(r.mcap_cr) + " Cr" : "–")}${kv("P/E", finNum(r.pe, 1))}${kv("Book value", r.book_value != null ? "₹" + finNum(r.book_value, 1) : "–")}
        ${kv("Div yield", pctv(r.div_yield))}${kv("ROCE", pctv(r.roce))}${kv("ROE", pctv(r.roe))}
        ${kv("Float mcap", r.float_mcap_cr != null ? "₹" + finNum(r.float_mcap_cr) + " Cr" : "–")}${kv("Float %", pctv(r.float_pct))}${kv("RS rating", r.rs_rating ?? "–")}
        ${kv("ADR %", pctv(r.adr_pct, 2))}${kv("RVol", r.rvol == null ? "–" : Math.round(r.rvol * 100) + "%")}${kv("Avg ₹ vol 20D", r.turnover_avg20_cr != null ? "₹" + finNum(r.turnover_avg20_cr, 1) + " Cr" : "–")}</div>
      <h5>Pros & cons <small class="muted">· automatic rules on the numbers, not advice</small></h5>
      <div class="sp-pc">${pc.pros.map((x) => `<p class="pro">✓ ${esc(x)}</p>`).join("")}${pc.cons.map((x) => `<p class="con">✕ ${esc(x)}</p>`).join("")}${pc.pros.length + pc.cons.length ? "" : '<p class="muted small">Nothing stands out by our rules.</p>'}</div>`;
    const ovSum = [r.rs_rating != null ? `RS ${r.rs_rating}` : "", r.pe != null ? `P/E ${finNum(r.pe, 1)}` : "", r.roce != null ? `ROCE ${pctv(r.roce)}` : ""].filter(Boolean).join(" · ");
    // peers: same basic industry (else industry), by market cap
    const grp = r.basic_industry ? "basic_industry" : "industry";
    const peersAll = (state.screen || []).filter((x) => x[grp] && x[grp] === r[grp] && !x.stale).sort((a, b) => (b.mcap_cr ?? -1) - (a.mcap_cr ?? -1));
    const rank = peersAll.findIndex((x) => x.id === id) + 1;
    const pes = peersAll.map((x) => x.pe).filter((x) => x != null && x > 0).sort((a, b) => a - b);
    const medPE = pes.length ? pes[Math.floor(pes.length / 2)] : null;
    let peers = peersAll.slice(0, 7);
    if (rank > 7) peers = peers.slice(0, 6).concat([peersAll[rank - 1]]);
    const peerSum = peersAll.length > 1 ? `#${rank || "–"} of ${peersAll.length} by size${medPE != null && r.pe != null ? ` · P/E ${finNum(r.pe, 1)} vs ${finNum(medPE, 1)} median` : ""}` : "no peers";
    const peerBody = peersAll.length > 1 ? `<div class="sp-tw"><table class="sp-t2"><thead><tr><th class="l">Stock</th><th>MCap Cr</th><th>P/E</th><th>Sales Cr</th><th>Profit Cr</th><th>ROCE</th></tr></thead><tbody>`
      + peers.map((x) => `<tr class="${x.id === id ? "me" : ""}" data-peer="${esc(x.id)}"><td class="l"><b>${esc(x.symbol)}</b></td><td>${finNum(x.mcap_cr)}</td><td>${finNum(x.pe, 1)}</td><td>${finNum(x.sales_ttm)}</td>`
        + `<td class="${x.np_ttm < 0 ? "down" : ""}">${finNum(x.np_ttm)}</td><td>${pctv(x.roce)}</td></tr>`).join("")
      + `</tbody></table></div><button type="button" class="sp-link" data-sp="peers">Compare all ${peersAll.length} peers →</button><small class="muted"> ${esc(r[grp])} · TTM figures</small>` : '<p class="muted small">No other stock in this industry.</p>';
    box.innerHTML = `<div class="sp">${head}${sec("ov", "Overview", ovSum, ov)}${sec("fin", "Financials", '<i class="skel sp-sk"></i>', SKEL("Loading financials"))}
      ${sec("peers", "Peers", peerSum, peerBody)}${sec("shp", "Shareholding", "", '<i class="skel sp-sk"></i>')}${sec("news", "Filings & con-calls", '<i class="skel sp-sk"></i>', '<i class="skel sp-sk"></i>')}</div>`;
    box.onclick = (e) => {
      const a = e.target.closest("[data-sp]");
      if (a) {
        if (a.dataset.sp === "watch") { toggleWatch(watchKey); a.classList.toggle("on"); }
        if (a.dataset.sp === "full") { store.set("sd-detail-view", "fin"); if (opts.onFull) opts.onFull(); else location.hash = "#/i/s/" + encodeURIComponent(id); }
        if (a.dataset.sp === "peers") { Object.assign(state.stocks, { text: r[grp], universe: "all", sector: "", sort: "mcap_cr", dir: "desc", limit: PAGE }); location.hash = "#/stocks"; }
        return;
      }
      const pr = e.target.closest("[data-peer]");
      if (pr && pr.dataset.peer !== id) { if (opts.onPeer) opts.onPeer(pr.dataset.peer); else location.hash = "#/i/s/" + encodeURIComponent(pr.dataset.peer); return; }
      const t = e.target.closest("[data-ftab]");
      if (t) { store.set("sd-panel-ftab", t.dataset.ftab); drawFin(); }
    };
    box.querySelectorAll("details.sp-sec").forEach((d) => d.addEventListener("toggle", () => { const o = store.get("sd-panel-open", open); o[d.dataset.sec] = d.open; store.set("sd-panel-open", o); }));
    // filings with NSE (data/a/<SYMBOL>.json): con-call / presentation links first, then the latest filings
    getStockNews(r.symbol).then(async (list) => {
      const sx = box.querySelector('[data-sec="news"]'); if (!sx || box.dataset.id !== id) return;
      const N = await getNews(), pdf = N.pdf || "https://nsearchives.nseindia.com/corporate/";
      const d30 = (() => { const t = new Date((state.screenDate || state.dataDate) + "T00:00:00"); t.setDate(t.getDate() - 30); return t.toISOString().slice(0, 10); })();
      sx.querySelector(".sp-sum").textContent = list.length ? `${list.filter((n) => n[0] >= d30).length} in 30 days` : "none";
      const calls = list.filter((n) => n[2] === "K" && n[5]).slice(0, 6);
      const item = (n) => `<div class="sp-nw">${newsBadge(n[2], N.cats)}<div><small class="muted">${esc(SD.fmtDate(n[0].slice(0, 10)))} ${esc(n[0].slice(11, 16))}</small><div>${newsText(n[3], n[4])}</div></div>${newsLink(n[5], pdf)}</div>`;
      sx.querySelector(".sp-b").innerHTML = list.length ? `${calls.length ? `<h5>Con-calls & presentations</h5>${calls.map(item).join("")}` : ""}
        <h5>Latest filings</h5>${list.filter((n) => n[2] !== "K").slice(0, 12).map(item).join("") || '<p class="muted small">Only con-call notices.</p>'}
        <a class="sp-link" href="#/news" data-nwq="${esc(r.symbol)}">All recent filings →</a>` : '<p class="muted small">No filings with NSE in the last year.</p>';
      const a = sx.querySelector("[data-nwq]"); if (a) a.onclick = () => store.set("sd-news", { ...store.get("sd-news", {}), q: a.dataset.nwq, cats: [] });
    });
    const doc = await getFin(id);
    if (box.dataset.id !== id) return;
    const finSec = box.querySelector('[data-sec="fin"]'), shpSec = box.querySelector('[data-sec="shp"]');
    if (!doc) {
      finSec.querySelector(".sp-sum").textContent = "not filed yet"; finSec.querySelector(".sp-b").innerHTML = '<p class="muted small">No results data for this stock yet.</p>';
      shpSec.querySelector(".sp-sum").textContent = ""; shpSec.querySelector(".sp-b").innerHTML = '<p class="muted small">No shareholding data yet.</p>';
      return;
    }
    const basis = SDF.basisOf(doc);
    // summary of the latest quarter
    const qt = SDF.quarterTable(doc, basis, 13);
    const qrow = (k) => (qt.rows.find((x) => x[1] === k) || [null, k, []])[2];
    const qn = qt.ends.length;
    finSec.querySelector(".sp-sum").innerHTML = qn ? `${shortLbl(qt.ends[qn - 1])} YoY · Sales ${pctTag(chgPct(qrow("sales")[qn - 1], qrow("sales")[qn - 5]))} · Profit ${pctTag(chgPct(qrow("net_profit")[qn - 1], qrow("net_profit")[qn - 5]))}` : "";
    const drawFin = () => {
      const tab = store.get("sd-panel-ftab", "q");
      let t, lines, note = "";
      if (tab === "q") { t = SDF.quarterTable(doc, basis, 12); lines = ["sales", "op_profit", "opm", "net_profit", "eps"]; }
      else if (tab === "y") { t = SDF.annualTable(doc, basis, 10); lines = ["sales", "op_profit", "opm", "net_profit", "eps"]; }
      else if (tab === "bs") { t = SDF.bsTable(doc, basis, 10); lines = ["equity_capital", "reserves", "borrowings", "total", "fixed_assets", "investments"]; }
      else {
        t = SDF.cfTable(doc, basis, 10); lines = ["cfo", "cfi", "cff", "fcf"];
        const yt = SDF.annualTable(doc, basis, 10), npv = (yt.rows.find((x) => x[1] === "net_profit") || [0, 0, []])[2];
        const cfo = (t.rows.find((x) => x[1] === "cfo") || [0, 0, []])[2], k = Math.min(5, cfo.length);
        const npY = yt.cols[yt.cols.length - 1] === "TTM" ? npv.slice(0, -1) : npv;
        const sc = cfo.slice(-k).reduce((s, x) => s + (x || 0), 0), sp = npY.slice(-k).reduce((s, x) => s + (x || 0), 0);
        if (k && sp > 0) note = `<p class="sp-note">Last ${k} years: <b>${finNum((sc / sp) * 100)}%</b> of the profit came in as cash.</p>`;
      }
      const rows = t.rows.filter((x) => lines.includes(x[1]));
      const isPct = (k) => k === "opm";
      const n = t.cols.length;
      const body = n ? rows.map(([l, k, v]) => {
        const last = v[n - 1], yo = tab === "q" ? v[n - 5] : v[n - 2], qo = tab === "q" ? v[n - 2] : null;
        const val = last == null ? "–" : isPct(k) ? finNum(last, 1) + "%" : k === "eps" ? "₹" + finNum(last, 2) : finNum(last);
        return `<tr><td class="l">${esc(l.replace(" (₹)", ""))}</td><td>${miniBars(v)}</td><td><b class="${last < 0 ? "down" : ""}">${val}</b></td>
          <td>${isPct(k) ? '<span class="muted">—</span>' : pctTag(chgPct(last, yo))}${tab === "q" ? "<br>" + (isPct(k) ? "" : pctTag(chgPct(last, qo))) : ""}</td></tr>`;
      }).join("") : "";
      finSec.querySelector(".sp-b").innerHTML = `<div class="seg sm sp-ft">${[["q", "Quarterly"], ["y", "Annual"], ["bs", "Balance"], ["cf", "Cash flow"]].map(([k, l]) => `<button type="button" data-ftab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>
        ${note}${n ? `<table class="sp-t2 fin"><thead><tr><th class="l">₹ Cr</th><th>${tab === "q" ? n + " qtrs" : n + " yrs"}</th><th>${esc(tab === "q" ? fq(t.ends[n - 1]) : t.cols[n - 1])}</th><th>${tab === "q" ? "YoY<br>QoQ" : "1Y"}</th></tr></thead><tbody>${body}</tbody></table>` : '<p class="muted small">Not in the filings.</p>'}
        ${tab === "y" || tab === "q" ? `<h5>Growth · CAGR</h5><table class="sp-t2 grow"><thead><tr><th class="l"></th><th>3Y</th><th>5Y</th><th>10Y</th></tr></thead><tbody>
          <tr><td class="l">Sales</td><td>${pctTag(r.sales_cagr_3y)}</td><td>${pctTag(r.sales_cagr_5y)}</td><td>${pctTag(r.sales_cagr_10y)}</td></tr>
          <tr><td class="l">Net profit</td><td>${pctTag(r.np_cagr_3y)}</td><td>${pctTag(r.np_cagr_5y)}</td><td>${pctTag(r.np_cagr_10y)}</td></tr>
          <tr><td class="l">ROE (avg)</td><td>${pctv(r.roe_3y)}</td><td>${pctv(r.roe_5y)}</td><td>${pctv(r.roe_10y)}</td></tr></tbody></table>` : ""}
        <button type="button" class="sp-link" data-sp="full">See all the numbers →</button>`;
    };
    drawFin();
    // shareholding: colour bar + rows with mini bars
    const sh = SDF.shpTable(doc, 12), sn = sh.cols.length;
    const SHC = { prom: "#2962ff", fii: "#089981", dii: "#ff9800", govt: "#9c27b0", public: "#9e9e9e", others: "#795548" };
    if (!sn) { shpSec.querySelector(".sp-b").innerHTML = '<p class="muted small">No shareholding data yet.</p>'; return; }
    const shRows = sh.rows.filter(([, k]) => SHC[k] && sh.rows.find((x) => x[1] === k)[2][sn - 1] != null);
    shpSec.querySelector(".sp-sum").innerHTML = `${shortLbl(sh.ends[sn - 1])} · Promoters ${pctv((sh.rows.find((x) => x[1] === "prom") || [0, 0, []])[2][sn - 1])}`;
    shpSec.querySelector(".sp-b").innerHTML = `<div class="sp-shbar">${shRows.map(([l, k, v]) => `<i style="flex:${Math.max(v[sn - 1], 0.01)};background:${SHC[k]}" title="${esc(l)} ${finNum(v[sn - 1], 2)}%"></i>`).join("")}</div>
      <table class="sp-t2"><thead><tr><th class="l"></th><th></th><th>${esc(shortLbl(sh.ends[sn - 1]))}</th><th>QoQ</th><th>1Y</th></tr></thead><tbody>${shRows.map(([l, k, v]) => {
        const d1 = v[sn - 2] == null ? null : v[sn - 1] - v[sn - 2], d4 = v[sn - 5] == null ? null : v[sn - 1] - v[sn - 5];
        const pt = (x) => (x == null ? '<span class="muted">—</span>' : `<span class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${finNum(x, 2)}</span>`);
        return `<tr><td class="l"><i class="dot" style="background:${SHC[k]}"></i>${esc(l)}</td><td>${miniBars(v, 80, 20)}</td><td><b>${finNum(v[sn - 1], 2)}%</b></td><td>${pt(d1)}</td><td>${pt(d4)}</td></tr>`;
      }).join("")}</tbody></table><small class="muted">Change in percentage points.</small>`;
  }

  /* ------------------------------------------------------------------ custom scan window (Phase N3): 5 tabs of filters, live count,
     save / load. A filter makes conditions of the same rule format as every scanner (scan.js), so saved scans work everywhere. */
  const CS_TABS = [["u", "Stock universe"], ["t", "Technicals"], ["s", "Strength & volume"], ["e", "Earnings"], ["f", "Fundamentals"]];
  const MA_OPTS = [["ema10", "10 EMA"], ["ema20", "20 EMA"], ["ema21", "21 EMA"], ["ema50", "50 EMA"], ["ema200", "200 EMA"],
    ["sma10", "10 SMA"], ["sma20", "20 SMA"], ["sma50", "50 SMA"], ["sma150", "150 SMA"], ["sma200", "200 SMA"]];
  const gt = (a, b) => ({ field: a, op: ">", field2: b, mult: 1 });
  // t tab, s section, id, l label, ty type, h hint; types: flag, range, cmp, combo, multi, pick, period, mas
  const CS = [
    { t: "u", s: "Universe", id: "liquid", l: "Liquid stocks", ty: "flag", h: "enough rupee volume to buy and sell easily (our liquid rule)", uni: true },
    { t: "u", s: "Universe", id: "index", l: "Index", ty: "pick", opts: [["n500", "Nifty 500 only", { field: "n500", op: "is", value: true }], ["out", "Outside Nifty 500", { field: "n500", op: "is", value: false }]] },
    { t: "u", s: "Universe", id: "fno", l: "F&O stocks", ty: "pick", opts: [["only", "Include only", { field: "fno", op: "is", value: true }], ["ex", "Exclude", { field: "fno", op: "is", value: false }]] },
    { t: "u", s: "Universe", id: "stage", l: "Stage", ty: "multi", field: "stage", opts: [["2", "2 Uptrend"], ["2A", "2A Early uptrend"], ["1", "1 Basing"], ["3", "3 Topping"], ["4A", "4A Improving"], ["4", "4 Downtrend"]], def: ["2"] },
    { t: "u", s: "Universe", id: "circuit", l: "Exclude circuit stocks", ty: "flag", h: "drop 2 % and 5 % price bands", rule: { field: "price_band", op: "in", value: ["10", "20", "No Band"] } },
    { t: "u", s: "Universe", id: "listage", l: "Listing age", ty: "combo", parts: [["days_listed", ">=", 180, "older than (days)"]] },
    { t: "u", s: "Groups", id: "sector", l: "Sector", ty: "multi", field: "sector", dyn: "sector" },
    { t: "u", s: "Groups", id: "bind", l: "Basic industry", ty: "multi", field: "basic_industry", dyn: "basic_industry" },
    { t: "u", s: "Groups", id: "theme", l: "Theme", ty: "multi", field: "theme", dyn: "theme" },
    { t: "u", s: "Size", id: "mcap", l: "Market cap (₹ Cr)", ty: "range", field: "mcap_cr", def: [500, 500000] },
    { t: "u", s: "Size", id: "price", l: "Price (₹)", ty: "range", field: "close", def: [50, 10000] },
    { t: "u", s: "Size", id: "ffpct", l: "Free float %", ty: "range", field: "float_pct", def: [25, 100] },
    { t: "u", s: "Size", id: "ffmc", l: "Float market cap (₹ Cr)", ty: "range", field: "float_mcap_cr", def: [300, 100000] },
    { t: "t", s: "Moving averages", id: "maorder", l: "MA order", ty: "pick", opts: [
      ["mm", "Close > 50 > 150 > 200 SMA", [gt("close", "sma50"), gt("sma50", "sma150"), gt("sma150", "sma200")]],
      ["e3", "10 > 20 > 50 EMA", [gt("ema10", "ema20"), gt("ema20", "ema50")]],
      ["e4", "10 > 21 > 50 > 200 EMA", [gt("ema10", "ema21"), gt("ema21", "ema50"), gt("ema50", "ema200")]],
      ["s2", "50 SMA > 200 SMA", [gt("sma50", "sma200")]]] },
    { t: "t", s: "Moving averages", id: "above", l: "Price above MA", ty: "mas", dir: ">", def: ["sma50", "sma200"] },
    { t: "t", s: "Moving averages", id: "below", l: "Price below MA", ty: "mas", dir: "<", def: ["ema20"] },
    { t: "t", s: "Moving averages", id: "s200up", l: "200 SMA rising (1 month)", ty: "flag", rule: { field: "sma200_chg_1m", op: ">", value: 0 } },
    { t: "t", s: "Moving averages", id: "near50", l: "Distance from 50 SMA %", ty: "range", field: "from_sma50", def: [0, 10] },
    { t: "t", s: "Highs and lows", id: "fromhi", l: "% from 52W high", ty: "range", field: "from_hi52", def: [-25, 0] },
    { t: "t", s: "Highs and lows", id: "fromlo", l: "% from 52W low", ty: "cmp", field: "from_lo52", def: [">=", 30] },
    { t: "t", s: "Highs and lows", id: "fromath", l: "% from all-time high", ty: "range", field: "from_ath", def: [-15, 0] },
    { t: "t", s: "Highs and lows", id: "pivot", l: "Distance to pivot %", ty: "range", field: "dist_pivot", def: [-5, 0], h: "minus = below the base top" },
    { t: "t", s: "Momentum", id: "rsi", l: "RSI (14)", ty: "range", field: "rsi14", def: [50, 70] },
    { t: "t", s: "Momentum", id: "ret", l: "Return", ty: "period", opts: [["ret_1w", "1 week"], ["ret_1m", "1 month"], ["ret_3m", "3 months"], ["ret_6m", "6 months"], ["ret_1y", "1 year"], ["ret_ytd", "This year"]], def: ["ret_1m", ">=", 20] },
    { t: "t", s: "Momentum", id: "chg", l: "Daily change %", ty: "range", field: "chg_1d", def: [2, 20] },
    { t: "t", s: "Momentum", id: "gap", l: "Gap up %", ty: "cmp", field: "gap_up", def: [">=", 2] },
    { t: "t", s: "Momentum", id: "st", l: "Supertrend up", ty: "flag", rule: { field: "supertrend_dir", op: "==", value: 1 } },
    { t: "t", s: "Range and setups", id: "range", l: "Day range %", ty: "cmp", field: "range_pct", def: ["<=", 3] },
    { t: "t", s: "Range and setups", id: "adr", l: "ADR % (20 days)", ty: "cmp", field: "adr_pct", def: [">=", 3] },
    { t: "t", s: "Range and setups", id: "tight", l: "Tight closes % (5 days)", ty: "cmp", field: "tight_pct", def: ["<=", 2] },
    { t: "t", s: "Range and setups", id: "depth", l: "Base depth %", ty: "cmp", field: "base_depth", def: ["<=", 25] },
    { t: "t", s: "Range and setups", id: "vcp", l: "VCP contractions", ty: "cmp", field: "vcp_contractions", def: [">=", 2] },
    { t: "t", s: "Range and setups", id: "inside", l: "Inside day", ty: "flag", rule: { field: "inside_day", op: "is", value: true } },
    { t: "s", s: "Relative strength", id: "rs", l: "RS rating", ty: "range", field: "rs_rating", def: [70, 99] },
    { t: "s", s: "Relative strength", id: "rschg", l: "RS rating change, 1 week", ty: "cmp", field: "rs_chg_1w", def: [">=", 5] },
    { t: "s", s: "Relative strength", id: "rshi", l: "RS line at 52W high", ty: "flag", rule: { field: "rs_line_52w_high", op: "is", value: true } },
    { t: "s", s: "Relative strength", id: "rsfirst", l: "RS new high before price", ty: "flag", rule: { field: "rs_new_high_before_price", op: "is", value: true } },
    { t: "s", s: "Relative strength", id: "mans", l: "Mansfield RS above 0", ty: "flag", rule: { field: "mansfield_rs", op: ">", value: 0 } },
    { t: "s", s: "Groups", id: "secrank", l: "Sector rank", ty: "cmp", field: "sector_rank", def: ["<=", 5] },
    { t: "s", s: "Groups", id: "indrank", l: "Industry rank", ty: "cmp", field: "industry_rank", def: ["<=", 20] },
    { t: "s", s: "Groups", id: "indtag", l: "Industry status", ty: "multi", field: "industry_tag", opts: [["Leading", "Leading"], ["Improving", "Improving"], ["Weakening", "Weakening"], ["Lagging", "Lagging"]], def: ["Leading"] },
    { t: "s", s: "Groups", id: "themetag", l: "Theme status", ty: "multi", field: "theme_status", opts: [["Leading", "Leading"], ["Improving", "Improving"], ["Weakening", "Weakening"], ["Lagging", "Lagging"]], def: ["Leading"] },
    { t: "s", s: "Volume", id: "turn20", l: "Avg ₹ volume 20 days (Cr)", ty: "cmp", field: "turnover_avg20_cr", def: [">=", 5] },
    { t: "s", s: "Volume", id: "turn", l: "Price × volume today (Cr)", ty: "cmp", field: "turnover_cr", def: [">=", 10] },
    { t: "s", s: "Volume", id: "rvol", l: "Relative volume (× 20-day avg)", ty: "cmp", field: "rvol", def: [">=", 1.5] },
    { t: "s", s: "Volume", id: "deliv", l: "Delivery %", ty: "cmp", field: "deliv_pct", def: [">=", 50] },
    { t: "s", s: "Volume", id: "hv", l: "High volume", ty: "pick", opts: [["hve", "Highest ever", { field: "hve", op: "is", value: true }], ["hvy", "Highest in a year", { field: "hvy", op: "is", value: true }], ["hvq", "Highest in a quarter", { field: "hvq", op: "is", value: true }]] },
    { t: "s", s: "Volume", id: "pp", l: "Pocket pivot", ty: "flag", rule: { field: "pocket_pivot", op: "is", value: true } },
    { t: "s", s: "Volume", id: "dry", l: "Volume dry-up", ty: "flag", rule: { field: "dry_up", op: "is", value: true } },
    { t: "e", s: "Latest quarter", id: "sy", l: "Sales growth YoY %", ty: "cmp", field: "sales_g_yoy", def: [">=", 20] },
    { t: "e", s: "Latest quarter", id: "sq", l: "Sales growth QoQ %", ty: "cmp", field: "sales_g_qoq", def: [">=", 10] },
    { t: "e", s: "Latest quarter", id: "py", l: "Net profit growth YoY %", ty: "cmp", field: "np_g_yoy", def: [">=", 25] },
    { t: "e", s: "Latest quarter", id: "pq", l: "Net profit growth QoQ %", ty: "cmp", field: "np_g_qoq", def: [">=", 10] },
    { t: "e", s: "Latest quarter", id: "ey", l: "EPS growth YoY %", ty: "cmp", field: "eps_g_yoy", def: [">=", 25] },
    { t: "e", s: "Latest quarter", id: "eq", l: "EPS growth QoQ %", ty: "cmp", field: "eps_g_qoq", def: [">=", 10] },
    { t: "e", s: "Streaks", id: "sup", l: "Sales rising for (quarters)", ty: "cmp", field: "sales_up_qtrs", def: [">=", 3] },
    { t: "e", s: "Streaks", id: "eup", l: "EPS rising for (quarters)", ty: "cmp", field: "eps_up_qtrs", def: [">=", 3] },
    { t: "e", s: "Streaks", id: "pup", l: "Net profit up QoQ for (quarters)", ty: "cmp", field: "np_qoq_up_qtrs", def: [">=", 2] },
    { t: "e", s: "Streaks", id: "eacc", l: "EPS growth speeding up (quarters)", ty: "cmp", field: "eps_g_accel_qtrs", def: [">=", 2] },
    { t: "e", s: "Streaks", id: "mup", l: "Net margin up for (quarters)", ty: "cmp", field: "npm_up_qtrs", def: [">=", 2] },
    { t: "e", s: "Results days", id: "recent", l: "Results declared in the last (days)", ty: "combo", parts: [["days_since_result", "<=", 30, "days"]] },
    { t: "e", s: "Results days", id: "soon", l: "Results due in the next (days)", ty: "range", field: "days_to_result", def: [0, 14] },
    { t: "e", s: "Results days", id: "egap", l: "Results gap-up", ty: "combo", parts: [["earn_gap_pct", ">=", 3, "gap ≥ %"], ["earn_sessions", "<=", 20, "within sessions"]] },
    { t: "e", s: "Results days", id: "emove", l: "Big move on results day %", ty: "cmp", field: "earn_chg_pct", def: [">=", 5] },
    { t: "e", s: "Results days", id: "eheld", l: "Results move held", ty: "flag", rule: { field: "earn_held", op: "is", value: true } },
    { t: "f", s: "Growth", id: "scagr", l: "Sales growth (CAGR %)", ty: "period", opts: [["sales_cagr_3y", "3 years"], ["sales_cagr_5y", "5 years"], ["sales_cagr_10y", "10 years"]], def: ["sales_cagr_5y", ">=", 15] },
    { t: "f", s: "Growth", id: "pcagr", l: "Profit growth (CAGR %)", ty: "period", opts: [["np_cagr_3y", "3 years"], ["np_cagr_5y", "5 years"], ["np_cagr_10y", "10 years"]], def: ["np_cagr_5y", ">=", 15] },
    { t: "f", s: "Growth", id: "attm", l: "Sales growth TTM %", ty: "cmp", field: "sales_g_ttm", def: [">=", 15] },
    { t: "f", s: "Returns on capital", id: "roe", l: "ROE %", ty: "cmp", field: "roe", def: [">=", 15] },
    { t: "f", s: "Returns on capital", id: "roce", l: "ROCE %", ty: "cmp", field: "roce", def: [">=", 15] },
    { t: "f", s: "Returns on capital", id: "opm", l: "Operating margin TTM %", ty: "cmp", field: "opm_ttm", def: [">=", 12] },
    { t: "f", s: "Returns on capital", id: "de", l: "Debt / equity", ty: "cmp", field: "debt_equity", def: ["<=", 0.5] },
    { t: "f", s: "Valuation", id: "pe", l: "P/E", ty: "range", field: "pe", def: [5, 40] },
    { t: "f", s: "Valuation", id: "peg", l: "PEG", ty: "cmp", field: "peg", def: ["<=", 1.5] },
    { t: "f", s: "Valuation", id: "pb", l: "Price / book", ty: "cmp", field: "pb", def: ["<=", 5] },
    { t: "f", s: "Valuation", id: "dy", l: "Dividend yield %", ty: "cmp", field: "div_yield", def: [">=", 1] },
    { t: "f", s: "Holding", id: "prom", l: "Promoter holding %", ty: "cmp", field: "prom_hold", def: [">=", 50] },
    { t: "f", s: "Holding", id: "promc", l: "Promoter change, 1 quarter (pts)", ty: "cmp", field: "prom_chg_1q", def: [">=", 0.5] },
    { t: "f", s: "Holding", id: "fii", l: "FII holding %", ty: "cmp", field: "fii_hold", def: [">=", 5] },
    { t: "f", s: "Holding", id: "fiic", l: "FII change, 1 quarter (pts)", ty: "cmp", field: "fii_chg_1q", def: [">=", 0.5] },
  ];
  const csFieldsOf = (f) => (f.field ? [f.field] : f.parts ? f.parts.map((p) => p[0]) : f.rule ? [f.rule.field] : []);
  /** the conditions of one filter (an array) from its values */
  function csRule(f, v) {
    v = v || {};
    const n = (x) => (x === "" || x == null || Number.isNaN(Number(x)) ? null : Number(x));
    switch (f.ty) {
      case "flag": return f.uni ? [] : [f.rule];
      case "range": {
        const a = n(v.a), b = n(v.b);
        if (a != null && b != null) return [{ field: f.field, op: "between", value: [Math.min(a, b), Math.max(a, b)] }];
        if (a != null) return [{ field: f.field, op: ">=", value: a }];
        if (b != null) return [{ field: f.field, op: "<=", value: b }];
        return [];
      }
      case "cmp": return n(v.x) == null ? [] : [{ field: f.field, op: v.op || f.def[0], value: n(v.x) }];
      case "combo": return f.parts.map((p, i) => (n((v.x || [])[i]) == null ? null : { field: p[0], op: p[1], value: n(v.x[i]) })).filter(Boolean);
      case "period": return n(v.x) == null ? [] : [{ field: v.f || f.def[0], op: v.op || f.def[1], value: n(v.x) }];
      case "multi": return (v.sel || []).length ? [{ field: f.field, op: "in", value: v.sel.slice() }] : [];
      case "pick": { const o = f.opts.find((x) => x[0] === v.p) || f.opts[0]; return Array.isArray(o[2]) ? o[2] : [o[2]]; }
      case "mas": return (v.sel || []).map((m) => ({ field: "close", op: f.dir, field2: m, mult: 1 }));
      default: return [];
    }
  }
  const csDefault = (f) => ({ range: { a: f.def && f.def[0], b: f.def && f.def[1] }, cmp: { op: f.def && f.def[0], x: f.def && f.def[1] },
    combo: { x: (f.parts || []).map((p) => p[2]) }, period: { f: f.def && f.def[0], op: f.def && f.def[1], x: f.def && f.def[2] },
    multi: { sel: (f.def || []).slice() }, pick: { p: f.opts && f.opts[0][0] }, mas: { sel: (f.def || []).slice() }, flag: {} }[f.ty] || {});
  /** builder state {name, f: {id: {on, v}}} -> {universe, rule} */
  function csScan(cs) {
    const all = [];
    let universe = "all";
    for (const f of CS) {
      const s = cs.f[f.id];
      if (!s || !s.on) continue;
      if (f.uni) universe = "liquid";
      all.push(...csRule(f, s.v));
    }
    return { universe, rule: { all } };
  }

  function customScan(opts = {}) {
    const known = new Set((state.fields || []).map((f) => f.id));
    const avail = (f) => csFieldsOf(f).every((x) => known.has(x) || ["close", "n500", "fno", "price_band", "stage", "sector", "basic_industry", "theme", "days_listed"].includes(x));
    const list = CS.filter(avail);
    const u = userScans();
    let cs = opts.load && opts.load.builder ? clone(opts.load.builder) : opts.fresh ? { name: "", f: {} } : store.get("sd-cs-draft", null) || { name: "", f: {} };
    let loadedId = opts.load && opts.load.builder ? opts.load.id : opts.fresh ? null : cs.loadedId || null;
    delete cs.loadedId;
    let tab = store.get("sd-cs-tab", "u");
    const dyn = {};
    for (const k of ["sector", "basic_industry", "theme"]) dyn[k] = [...new Set(state.screen.map((r) => r[k]).filter(Boolean))].sort().map((x) => [x, x]);
    const m = document.createElement("div");
    m.className = "modal-bg cs-bg";
    m.innerHTML = `<div class="modal cs" role="dialog" aria-label="Custom scan">
      <div class="cs-h"><b>Custom scan</b><input class="cs-name" id="csName" placeholder="Untitled scan" value="${esc(cs.name || "")}" aria-label="Scan name" maxlength="60">
        <div class="menu-wrap"><button class="btn sm" id="csLoad" type="button">Load saved ▾</button><div class="menu right" id="csLoadM" hidden></div></div>
        <button class="btn sm" id="csSave" type="button">Save scan</button><button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div>
      <div class="cs-tabs"><div class="cs-tl" role="tablist">${CS_TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}<i data-tc="${k}"></i></button>`).join("")}</div>
        <input type="search" id="csQ" placeholder="Find a filter, e.g. RSI" aria-label="Find a filter"></div>
      <div class="cs-b" id="csB"></div>
      <div class="cs-f"><span id="csCount"></span><button class="btn" id="csReset" type="button">Reset</button><button class="btn primary" id="csRun" type="button">Run scan</button></div></div>`;
    document.body.appendChild(m);
    const st = (id) => cs.f[id] || (cs.f[id] = { on: false, v: csDefault(CS.find((x) => x.id === id)) });
    const ctrl = (f) => {
      const v = st(f.id).v;
      const num = (name, val, w) => `<input type="number" step="any" data-k="${name}" value="${val == null ? "" : esc(val)}" style="width:${w || 84}px">`;
      const opSel = (name, val, ops) => `<select data-k="${name}">${(ops || [">=", "<=", ">", "<"]).map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select>`;
      switch (f.ty) {
        case "flag": return f.h ? `<small class="muted">${esc(f.h)}</small>` : "";
        case "range": return `Between ${num("a", v.a)} and ${num("b", v.b)}`;
        case "cmp": return `${opSel("op", v.op)} ${num("x", v.x)}`;
        case "combo": return f.parts.map((p, i) => `<span class="muted">${esc(p[3])}</span> ${num("x" + i, (v.x || [])[i], 70)}`).join(" ");
        case "period": return `<select data-k="f">${f.opts.map(([k, l]) => `<option value="${k}" ${k === v.f ? "selected" : ""}>${l}</option>`).join("")}</select> ${opSel("op", v.op)} ${num("x", v.x, 70)}`;
        case "pick": return `<select data-k="p">${f.opts.map(([k, l]) => `<option value="${k}" ${k === v.p ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
        case "multi": case "mas": {
          const opts = f.ty === "mas" ? MA_OPTS : f.dyn ? dyn[f.dyn] : f.opts, sel = v.sel || [];
          const txt = sel.length ? (sel.length <= 2 ? sel.map((s) => (opts.find((o) => o[0] === s) || [s, s])[1]).join(", ") : `${sel.length} chosen`) : "Choose…";
          return `<details class="cs-ms"><summary>${esc(txt)}</summary><div class="cs-ml">${opts.length > 12 ? '<input type="search" class="cs-mq" placeholder="Search">' : ""}
            ${opts.map(([k, l]) => `<label data-t="${esc(String(l).toLowerCase())}"><input type="checkbox" data-sel="${esc(k)}" ${sel.includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></details>`;
        }
        default: return "";
      }
    };
    const rowHTML = (f) => `<div class="cs-row ${st(f.id).on ? "on" : ""}" data-id="${f.id}" data-t="${esc((f.l + " " + (f.h || "") + " " + csFieldsOf(f).map((x) => state.labels[x] || x).join(" ")).toLowerCase())}">
      <label class="cs-on"><input type="checkbox" data-on ${st(f.id).on ? "checked" : ""}> <span>${esc(f.l)}</span></label><div class="cs-c">${ctrl(f)}</div></div>`;
    const drawBody = () => {
      const q = m.querySelector("#csQ").value.trim().toLowerCase();
      const shown = q ? list.filter((f) => (f.l + " " + (f.h || "") + " " + csFieldsOf(f).map((x) => state.labels[x] || x).join(" ")).toLowerCase().includes(q)) : list.filter((f) => f.t === tab);
      const secs = [];
      for (const f of shown) { const key = q ? (CS_TABS.find((x) => x[0] === f.t) || ["", ""])[1] + " · " + f.s : f.s; let s = secs.find((x) => x[0] === key); if (!s) secs.push(s = [key, []]); s[1].push(f); }
      m.querySelector("#csB").innerHTML = secs.length ? secs.map(([s, fs]) => `<section class="cs-sec"><h4>${esc(s)}</h4>${fs.map(rowHTML).join("")}</section>`).join("")
        : '<p class="empty">No filter matches.</p>';
    };
    let timer = null;
    const count = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sc = csScan(cs), n = SDS.run(state.screen, sc).length, active = Object.entries(cs.f).filter(([id, s]) => s.on && list.some((f) => f.id === id));
        m.querySelector("#csCount").innerHTML = `<b>${n.toLocaleString("en-IN")}</b> stocks pass this scan · ${active.length} filter${active.length === 1 ? "" : "s"} active across all tabs`;
        for (const [k] of CS_TABS) { const c = active.filter(([id]) => (CS.find((f) => f.id === id) || {}).t === k).length; m.querySelector(`[data-tc="${k}"]`).textContent = c || ""; }
        cs.name = m.querySelector("#csName").value.trim();
        store.set("sd-cs-draft", { ...cs, loadedId });
      }, 90);
    };
    const readRow = (row) => {
      const f = CS.find((x) => x.id === row.dataset.id), s = st(f.id), g = (k) => { const el = row.querySelector(`[data-k="${k}"]`); return el ? el.value : undefined; };
      if (f.ty === "range") s.v = { a: g("a"), b: g("b") };
      else if (f.ty === "cmp") s.v = { op: g("op"), x: g("x") };
      else if (f.ty === "combo") s.v = { x: f.parts.map((p, i) => g("x" + i)) };
      else if (f.ty === "period") s.v = { f: g("f"), op: g("op"), x: g("x") };
      else if (f.ty === "pick") s.v = { p: g("p") };
      else if (f.ty === "multi" || f.ty === "mas") s.v = { sel: [...row.querySelectorAll("[data-sel]:checked")].map((x) => x.dataset.sel) };
    };
    const shut = () => { m.classList.add("closing"); setTimeout(() => m.remove(), 140); document.removeEventListener("keydown", onKey, true); };
    const onKey = (e) => {
      if (e.key === "Escape" && !e.target.closest("details[open]")) shut();
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); e.stopPropagation(); m.querySelector("#csQ").focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    m.addEventListener("change", (e) => {
      const row = e.target.closest(".cs-row");
      if (!row) return;
      if (e.target.matches("[data-on]")) { st(row.dataset.id).on = e.target.checked; row.classList.toggle("on", e.target.checked); }
      else {
        readRow(row);
        if (!st(row.dataset.id).on) { st(row.dataset.id).on = true; row.classList.add("on"); row.querySelector("[data-on]").checked = true; }
        if (e.target.matches("[data-sel]")) { const f = CS.find((x) => x.id === row.dataset.id), opts = f.ty === "mas" ? MA_OPTS : f.dyn ? dyn[f.dyn] : f.opts, sel = st(f.id).v.sel;
          row.querySelector("summary").textContent = sel.length ? (sel.length <= 2 ? sel.map((s) => (opts.find((o) => o[0] === s) || [s, s])[1]).join(", ") : `${sel.length} chosen`) : "Choose…"; }
      }
      count();
    });
    m.addEventListener("input", (e) => {
      if (e.target.id === "csQ") return drawBody();
      if (e.target.id === "csName") return count();
      if (e.target.classList.contains("cs-mq")) { const q = e.target.value.toLowerCase(); e.target.parentElement.querySelectorAll("label").forEach((l) => { l.hidden = !l.dataset.t.includes(q); }); return; }
      if (e.target.type === "number") { const row = e.target.closest(".cs-row"); readRow(row); if (!st(row.dataset.id).on) { st(row.dataset.id).on = true; row.classList.add("on"); row.querySelector("[data-on]").checked = true; } count(); }
    });
    const savedList = () => userScans().mine.filter((x) => x.builder);
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) return shut();
      const t = e.target.closest("[data-tab]");
      if (t) { tab = t.dataset.tab; store.set("sd-cs-tab", tab); m.querySelector("#csQ").value = ""; m.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t)); drawBody(); return; }
      if (!e.target.closest(".cs-ms")) m.querySelectorAll(".cs-ms[open]").forEach((d) => { d.open = false; });
      if (e.target.closest("#csLoad")) {
        const menu = m.querySelector("#csLoadM"), sv = savedList();
        menu.innerHTML = (sv.length ? sv.map((x) => `<button type="button" data-ld="${esc(x.id)}">${esc(x.id === "custom-last" ? "Last run" + (x.builder.name ? ": " + x.builder.name : "") : x.name)}</button>`).join("") : '<small class="menu-h">No saved custom scans yet.</small>')
          + '<button type="button" data-ld="">New, empty scan</button>';
        menu.hidden = !menu.hidden; return;
      }
      const ld = e.target.closest("[data-ld]");
      if (ld) {
        const x = savedList().find((y) => y.id === ld.dataset.ld);
        cs = x ? clone(x.builder) : { name: "", f: {} }; loadedId = x ? x.id : null;
        m.querySelector("#csName").value = cs.name || ""; m.querySelector("#csLoadM").hidden = true; drawBody(); count(); return;
      }
      if (!e.target.closest("#csLoadM")) m.querySelector("#csLoadM").hidden = true;
      if (e.target.closest("#csReset")) { cs = { name: m.querySelector("#csName").value, f: {} }; drawBody(); count(); return; }
      const save = e.target.closest("#csSave"), run = e.target.closest("#csRun");
      if (save || run) {
        cs.name = m.querySelector("#csName").value.trim();
        const sc = csScan(cs), uu = userScans();
        let id;
        if (save) {
          if (!cs.name) { const nm = prompt("Name of your scan:", "My custom scan"); if (!nm) return; cs.name = nm.slice(0, 60); m.querySelector("#csName").value = cs.name; }
          id = loadedId && loadedId !== "custom-last" && uu.mine.some((x) => x.id === loadedId) ? loadedId : "my-" + Date.now().toString(36);
        } else id = loadedId && uu.mine.some((x) => x.id === loadedId) ? loadedId : "custom-last";
        const name = id === "custom-last" ? "Custom scan (last run)" : cs.name || "Custom scan";
        const entry = { id, name, description: "Custom scan (filters)", universe: sc.universe, rule: sc.rule, builder: clone(cs) };
        uu.mine = uu.mine.some((x) => x.id === id) ? uu.mine.map((x) => (x.id === id ? entry : x)) : [...uu.mine, entry];
        saveUserScans(uu); loadedId = id;
        store.set("sd-cs-draft", { ...cs, loadedId });
        if (save) { const b = m.querySelector("#csSave"); b.textContent = "Saved ✓"; setTimeout(() => { b.textContent = "Save scan"; }, 1500); }
        if (run) { shut(); state.lastScan = null; if (location.hash === "#/scanners/" + encodeURIComponent(id)) renderStocks(); else location.hash = "#/scanners/" + encodeURIComponent(id); }
      }
    });
    drawBody();
    count();
    setTimeout(() => m.querySelector("#csQ").focus(), 50);
  }

  /* ------------------------------------------------------------------ financials (Phase S8): data/f/<id>.json, fin.js */
  const finNum = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
  function finTable(t, kind) {
    if (!t.ends.length) return `<p class="muted">Not in NSE's filings.</p>`;
    const pctRow = (k) => ["opm", "taxp"].includes(k) || kind === "pct";
    const cell = (k, v) => (v == null ? "–" : pctRow(k) ? finNum(v, 1) + "%" : k === "eps" ? finNum(v, 2) : k === "n" ? finNum(v) : kind === "shp" ? finNum(v, 2) + "%" : finNum(v));
    return `<div class="table-wrap fin"><table><thead><tr><th class="l sticky"></th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`
      + t.rows.map(([l, k, vals]) => `<tr class="${["op_profit", "net_profit", "total", "fcf", "pbt"].includes(k) ? "strong" : ""}"><td class="l sticky">${esc(l)}</td>${vals.map((v) => `<td class="num ${v != null && v < 0 ? "neg" : ""}">${cell(k, v)}</td>`).join("")}</tr>`).join("")
      + "</tbody></table></div>";
  }
  async function renderFinancials(box, r, id) {
    if (box.dataset.done) return;
    box.innerHTML = SKEL("Loading financials");
    let doc, chart;
    try { doc = await getJSON(`data/f/${encodeURIComponent(id)}.json`); } catch (e) {
      box.innerHTML = `<p class="empty">No results data for this stock yet (the first full download of NSE filings runs in batches).</p>`; return;
    }
    try { chart = await getJSON(`data/c/s/${encodeURIComponent(id)}.json`); } catch (e) { chart = null; }
    box.dataset.done = "1";
    let basis = store.get("sd-fin-basis", "C");
    if (!SDF.hasBasis(doc, basis)) basis = SDF.basisOf(doc);
    const stat = (label, val) => `<div class="stat"><small>${label}</small><b>${val}</b></div>`;
    const pctv = (v) => (v == null ? "–" : finNum(v, 1) + "%");
    const draw = () => {
      const kind = doc.kind || "company";
      const pc = SDF.prosCons(r);
      const other = basis === "C" ? "S" : "C", canOther = SDF.hasBasis(doc, other);
      const fcard = (title, html, pct) => `<section class="fcard"><div class="fcard-h"><h3>${title}</h3><span class="muted small">${pct ? "% of shares" : `${basis === "C" ? "Consolidated" : "Standalone"} figures in ₹ crore`}`
        + `${!pct && canOther ? ` · <a href="#" data-basis="${other}">View ${other === "C" ? "consolidated" : "standalone"}</a>` : ""}</span></div>${html}</section>`;
      const grow = SDF.growthTable(doc, basis, r, chart);
      const both = SDF.hasBasis(doc, "C") && SDF.hasBasis(doc, "S");
      box.innerHTML = `<div class="fin-head"><h2>Financials</h2>${both ? `<div class="seg" id="basisTog"><button type="button" data-v="C" class="${basis === "C" ? "on" : ""}">Consolidated</button><button type="button" data-v="S" class="${basis === "S" ? "on" : ""}">Standalone</button></div>` : `<span class="muted">${basis === "C" ? "Consolidated" : "Standalone"}</span>`}
        <span class="muted small">₹ crore · from NSE XBRL filings${kind !== "company" ? ` · ${kind} format` : ""} · screen ratios use ${esc(r.fin_basis || "–")}</span></div>
        <div class="stats">${stat("Market cap", r.mcap_cr != null ? "₹" + finNum(r.mcap_cr) + " Cr" : "–")}${stat("P/E", finNum(r.pe, 1))}${stat("P/B", finNum(r.pb, 2))}
          ${stat("Book value", r.book_value != null ? "₹" + finNum(r.book_value, 1) : "–")}${stat("ROE / ROCE", `${pctv(r.roe)} / ${pctv(r.roce)}`)}
          ${stat("EPS TTM", r.eps_ttm != null ? "₹" + finNum(r.eps_ttm, 2) : "–")}${stat("Dividend yield", pctv(r.div_yield))}
          ${stat("Debt / equity", finNum(r.debt_equity, 2))}${stat("PEG", finNum(r.peg, 2))}${stat("OPM / net margin TTM", `${pctv(r.opm_ttm)} / ${pctv(r.npm_ttm)}`)}
          ${stat("Promoters / FII / DII", `${pctv(r.prom_hold)} / ${pctv(r.fii_hold)} / ${pctv(r.dii_hold)}`)}${stat("Next results", r.next_result ? SD.fmtDate(r.next_result) : "–")}</div>
        <div class="pros-cons"><div class="pros"><h3>Pros</h3>${pc.pros.length ? `<ul>${pc.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">None by our rules.</p>`}</div>
          <div class="cons"><h3>Cons</h3>${pc.cons.length ? `<ul>${pc.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">None by our rules.</p>`}</div></div>
        <p class="muted small">Pros and cons are simple automatic rules on the numbers below, not advice.</p>
        ${fcard("Quarterly results", finTable(SDF.quarterTable(doc, basis, 12)))}
        ${fcard("Profit & loss", finTable(SDF.annualTable(doc, basis, 10)))}
        <div class="grow-grid">${grow.map(([title, items]) => `<div class="grow"><h4>${esc(title)}</h4>${items.map(([l, v]) => `<div><span>${l}:</span><b class="${v != null && v < 0 ? "neg" : ""}">${v == null ? "–" : finNum(v, 0) + "%"}</b></div>`).join("")}</div>`).join("")}</div>
        ${fcard("Balance sheet", finTable(SDF.bsTable(doc, basis, 10)))}
        ${fcard("Cash flows", finTable(SDF.cfTable(doc, basis, 10)))}
        ${fcard("Shareholding pattern", finTable(SDF.shpTable(doc, 12), "shp"), true)}
        <p class="muted small">EPS adjusted for later splits / bonuses. Older years: NSE's XBRL filings start ~2017 (balance sheet ~2019, cash flow ~2020).
        Banks: revenue = interest earned, financing profit = revenue − interest − expenses. Educational purpose only, not investment advice.</p>`;
      box.querySelectorAll(".table-wrap.fin").forEach((w) => { w.scrollLeft = w.scrollWidth; });   // newest period in view
      const bt = box.querySelector("#basisTog");
      if (bt) bt.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; basis = b.dataset.v; store.set("sd-fin-basis", basis); draw(); };
      box.querySelectorAll("[data-basis]").forEach((a) => { a.onclick = (e) => { e.preventDefault(); basis = a.dataset.basis; store.set("sd-fin-basis", basis); draw(); }; });
    };
    draw();
  }
  const setOn = (group, btn) => { group.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn)); };

  /* ------------------------------------------------------------------ router + theme */
  function route() {
    if (!state.rows.length) return;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const tab = { "": "home", market: "market", earnings: "earnings", heatmap: "heatmap", rrg: "rrg", leaders: "leaders", news: "news", stocks: "stocks", scanners: "scanners", screener: "scanners", sectors: "groups", groups: "groups", breadth: "breadth", watchlist: "watchlist", fields: "fields", i: "" }[parts[0]] ?? "market";
    document.querySelectorAll(".rail [data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    const act = document.querySelector(".rail-main .active");
    if (act && matchMedia("(max-width: 720px)").matches) act.scrollIntoView({ inline: "center", block: "nearest" });
    view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
    SDChart.close();
    clearBreadthCharts();
    clearGrid();
    view.onkeydown = null;
    view.onclick = null;
    $("#stPage").innerHTML = "";
    if (parts[0] === "stocks" || parts[0] === "scanners") renderStocks();
    else if (parts[0] === "fields") renderFields();
    else if (parts[0] === "screener") renderScreener();
    else if (parts[0] === "groups") renderGroups(parts[1], parts[2], parts[3]);
    else if (parts[0] === "breadth") renderBreadth(parts[1]);
    else if (parts[0] === "sectors") renderSectors(parts[1], parts[2]);
    else if (parts[0] === "watchlist") renderWatchlist();
    else if (parts[0] === "i") renderDetail(parts[1], parts.slice(2).join("/"));
    else if (parts[0] === "market") renderMarket();
    else if (parts[0] === "earnings") renderEarnings(parts[1]);
    else if (parts[0] === "heatmap") renderHeatmap();
    else if (parts[0] === "rrg") renderRRG();
    else if (parts[0] === "leaders") renderLeaders();
    else if (parts[0] === "news") renderNews();
    else renderHome();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ top bar: page tabs (add / remove / drag), find */
  // The rail keeps Home, Scanners, Groups, Breadth; every other page is a tab here (Viraj 07-Nov). The visitor's own list
  // and order live in the browser (localStorage "sd-pages"); "Add page" brings back a removed one.
  const IC = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const PAGES = {
    market: ["Market", IC('<path d="M3 17l5-6 4 3 6-8"/><path d="M14 6h4v4"/>')],
    stocks: ["Stocks", IC('<path d="M4 6h16M4 12h16M4 18h10"/>')],
    earnings: ["Earnings", IC('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M8 17h2"/>')],
    heatmap: ["Heatmap", IC('<rect x="3" y="3" width="10" height="11" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="15" y="11" width="6" height="10" rx="1"/><rect x="3" y="16" width="10" height="5" rx="1"/>')],
    leaders: ["Leaders", IC('<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z"/><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"/>')],
    rrg: ["RRG", IC('<path d="M12 3v18M3 12h18"/><path d="M6 17c2-1 3-3 5-3s4 2 6-1"/><circle cx="17" cy="13" r="1.6"/>')],
    news: ["News", IC('<path d="M4 5h13v14H6a2 2 0 01-2-2z"/><path d="M17 8h3v9a2 2 0 01-2 2"/><path d="M7 9h7M7 12h7M7 15h4"/>')],
    watchlist: ["Watchlist", IC('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>')],
    fields: ["Formulas", IC('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>')],
  };
  const PAGES_DEFAULT = ["market", "stocks", "earnings", "heatmap", "leaders", "rrg", "news", "watchlist"];
  const pgTabs = $("#pgTabs"), pgAdd = $("#pgAdd"), pgMenu = $("#pgMenu");
  let pages = (store.get("sd-pages", null) || PAGES_DEFAULT).filter((k) => PAGES[k]);
  const savePages = () => store.set("sd-pages", pages);
  function drawPages() {
    const cur = location.hash.replace(/^#\/?/, "").split("/")[0];
    pgTabs.innerHTML = pages.map((k) => `<a role="listitem" href="#/${k}" data-page="${k}" draggable="true" class="pg-tab${k === cur ? " on" : ""}" title="${esc(PAGES[k][0])}">`
      + `<i class="pg-grip" aria-hidden="true">⠿</i>${PAGES[k][1]}<span>${esc(PAGES[k][0])}</span>`
      + `<button type="button" class="pg-x" data-x="${k}" aria-label="Remove ${esc(PAGES[k][0])} from the tabs" title="Remove">✕</button></a>`).join("");
    const on = pgTabs.querySelector(".on");
    if (on) on.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  function drawPageMenu() {
    const rest = Object.keys(PAGES).filter((k) => !pages.includes(k));
    pgMenu.innerHTML = (rest.length ? rest.map((k) => `<button type="button" role="menuitem" data-add="${k}">${PAGES[k][1]}<span>${esc(PAGES[k][0])}</span></button>`).join("")
      : `<div class="muted pg-none">All pages are in the tabs.</div>`)
      + `<hr><button type="button" role="menuitem" data-reset>Reset to the default tabs</button>`;
  }
  pgTabs.addEventListener("click", (e) => {
    const x = e.target.closest("[data-x]");
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    pages = pages.filter((k) => k !== x.dataset.x); savePages(); drawPages();
  });
  pgAdd.onclick = (e) => { e.stopPropagation(); drawPageMenu(); pgMenu.hidden = !pgMenu.hidden; pgAdd.setAttribute("aria-expanded", String(!pgMenu.hidden)); };
  pgMenu.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.add) { pages.push(b.dataset.add); location.hash = "#/" + b.dataset.add; }
    if (b.hasAttribute("data-reset")) pages = PAGES_DEFAULT.slice();
    savePages(); drawPages(); pgMenu.hidden = true; pgAdd.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("click", (e) => { if (!e.target.closest(".pg-addw")) { pgMenu.hidden = true; pgAdd.setAttribute("aria-expanded", "false"); } });
  let pgDrag = null;
  pgTabs.addEventListener("dragstart", (e) => {
    const t = e.target.closest(".pg-tab");
    if (!t) return;
    pgDrag = t.dataset.page; t.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", pgDrag);
  });
  pgTabs.addEventListener("dragover", (e) => { if (pgDrag) e.preventDefault(); });
  pgTabs.addEventListener("drop", (e) => {
    e.preventDefault();
    const t = e.target.closest(".pg-tab");
    if (!pgDrag || !t || t.dataset.page === pgDrag) return;
    const r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    pages = pages.filter((k) => k !== pgDrag);
    pages.splice(pages.indexOf(t.dataset.page) + (after ? 1 : 0), 0, pgDrag);
    savePages(); drawPages();
  });
  pgTabs.addEventListener("dragend", () => { pgDrag = null; pgTabs.querySelectorAll(".drag").forEach((t) => t.classList.remove("drag")); });
  window.addEventListener("hashchange", drawPages);
  drawPages();

  // find a stock / index: press "/" anywhere (the top bar's search box was removed, Viraj 07-Nov)
  function gFind(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    // best first: exact symbol, symbol starts with, name starts with, contains; ties: bigger traded value first
    const hits = [];
    for (const r of state.rows) {
      const sym = (r.kind === "stock" ? r.symbol || "" : "").toLowerCase(), name = (r.name || "").toLowerCase();
      const rank = sym === q || name === q ? 0 : sym.startsWith(q) ? 1 : name.startsWith(q) ? 2 : sym.includes(q) || name.includes(q) ? 3 : -1;
      if (rank >= 0) hits.push([rank, -((r.close || 0) * (r.volume || 0)), r]);
    }
    return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 8).map((h) => h[2]);
  }
  function openFind() {
    if (document.querySelector(".modal-bg.find")) return;
    const m = SDChart.modal("Find a stock or index",
      `<input id="fq" type="search" class="fq" placeholder="e.g. INFY or Reliance" autocomplete="off" aria-label="Find a stock or index"><div id="fres" class="gres fres"></div>`,
      null, false, "find");
    const q = m.querySelector("#fq"), res = m.querySelector("#fres");
    let hits = [], on = 0;
    const shut = () => m.querySelector("[data-x]").click();
    const draw = () => {
      hits = gFind(q.value); on = Math.min(on, Math.max(hits.length - 1, 0));
      res.innerHTML = !q.value.trim() ? "" : hits.length ? hits.map((r, i) => `<a role="option" href="#/i/${r.key.replace(":", "/")}" class="${i === on ? "on" : ""}">`
        + `<b>${esc(r.kind === "stock" ? r.symbol : r.name)}</b><span class="num">${SD.fmtPrice(r.close)}<br>${pct(r.chg_1d)}</span>`
        + `<small>${esc(r.kind === "stock" ? r.name : r.exchange + " index")}${r.sector ? " · " + esc(r.sector) : ""}</small></a>`).join("")
        : `<div class="empty">No stock or index matches “${esc(q.value)}”.</div>`;
    };
    q.oninput = () => { on = 0; draw(); };
    q.onkeydown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); on = (on + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % Math.max(hits.length, 1); draw(); }
      else if (e.key === "Enter" && hits[on]) { location.hash = "#/i/" + hits[on].key.replace(":", "/"); shut(); }
    };
    res.onclick = (e) => { if (e.target.closest("a")) shut(); };
    setTimeout(() => q.focus(), 30);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable
        && !document.querySelector(".modal-bg")) { e.preventDefault(); openFind(); }
  });
  const showAbout = (e) => { if (e) e.preventDefault(); SDChart.modal("About this dashboard", `<div class="about">${$("#aboutTpl").innerHTML}</div>`); };
  $("#about").onclick = showAbout;
  $("#about2").onclick = showAbout;

  $("#theme").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sd-theme", next); } catch (e) { /* ignore */ }
    if (/^#\/(i|stocks|scanners)/.test(location.hash)) route();
  };
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
