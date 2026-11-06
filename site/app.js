/* Swing Trading Dashboard - page logic (pure helpers are in logic.js as SD, indicators in ind.js as SDI, the chart in chart.js
   as SDChart). Hash routes:
   #/  market   #/stocks  results table + chart   #/scanners/<id>  scanner results + formula editor   #/fields  all formulas
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

  /* ------------------------------------------------------------------ groups (Phase S9): data/group_ranks.json */
  const TAG_CLS = { Leading: "t-up", Improving: "t-info", Weakening: "t-warn", Lagging: "t-down" };
  const tagHTML = (t) => (t ? `<span class="tag ${TAG_CLS[t] || ""}">${esc(t)}</span>` : "");
  async function renderGroups(level, name) {
    level = ["sector", "industry", "theme"].includes(level) ? level : "sector";
    if (!state.groups) view.innerHTML = `<p class="empty">Loading groups…</p>`;
    try {
      if (!state.groups) state.groups = await getJSON("data/group_ranks.json");
      await loadScreen();
    } catch (e) { view.innerHTML = `<p class="empty">Groups are not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "groups") return;
    const gs = state.gstate || (state.gstate = { period: store.get("sd-gperiod", "1w"), small: false, q: "", sort: "rank" });
    const p = gs.period, enc = encodeURIComponent;
    const all = state.groups.levels[level] || [];
    const cfgG = state.groups.config || {};
    const rankCell = (g) => (g.rank == null ? "–" : `${g.rank}${g.rank_chg ? ` <small class="${g.rank_chg > 0 ? "up" : "down"}">${g.rank_chg > 0 ? "+" : ""}${g.rank_chg}</small>` : ""}`);
    const gRow = (g, lvl) => `<tr data-href="#/groups/${lvl}/${enc(g.name)}" class="${g.small ? "muted" : ""}"><td class="l">${rankCell(g)}</td><td class="l"><b>${esc(g.name)}</b></td>`
      + `<td class="l">${tagHTML(g.tag)}</td><td class="num">${pct(g["med_" + p])}</td><td class="num"><span class="up">${g.hi20}</span> / <span class="down">${g.lo20}</span></td>`
      + `<td class="num">${g.small ? "–" : (g.above50 ?? "–") + "%"}</td><td class="num">${g.n}</td></tr>`;
    const gTable = (items, lvl, label) => `<div class="table-wrap"><table><thead><tr><th class="l">Rank</th><th class="l">${label}</th><th class="l">Tag</th>`
      + `<th>Med ${p.toUpperCase()}</th><th title="members at a 20-day high / low today">20D H/L</th><th>&gt; 50 SMA</th><th>Stocks</th></tr></thead><tbody>`
      + items.map((g) => gRow(g, lvl)).join("") + "</tbody></table></div>";
    const periodSeg = seg("gperiod", [["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["1y", "1Y"], ["ytd", "YTD"]], p);
    const lvlSeg = `<div class="seg" data-seg="glevel">${[["sector", "Sector"], ["industry", "Industry"], ["theme", "Theme"]].map(([k, l]) =>
      `<a class="btn-seg ${k === level ? "on" : ""}" href="#/groups/${k}">${l} (${(state.groups.levels[k] || []).length})</a>`).join("")}</div>`;
    const how = `Rank = strength of the group's average stock vs the equal-weight market, compared with its own ${cfgG.ratio_window || 63}-session average;
      tag = Leading / Weakening / Lagging / Improving from strength and its ${cfgG.momentum_lag || 10}-session change (an open approximation of a
      Relative Rotation Graph; config/group_rank.yaml). Small groups (&lt; ${cfgG.min_members || 5} stocks) get no rank.`;
    if (!name) {
      const q = gs.q.trim().toLowerCase();
      let items = all.filter((g) => (gs.small || !g.small || level === "sector") && (!q || g.name.toLowerCase().includes(q)));
      if (gs.sort === "med") items = [...items].sort((a, b) => (b["med_" + p] ?? -1e9) - (a["med_" + p] ?? -1e9));
      view.innerHTML = `<h1>Groups</h1><p class="sub">${how}</p>
        <div class="controls">${lvlSeg}${periodSeg}<input id="gq" type="search" placeholder="Search groups" value="${esc(gs.q)}" aria-label="Search groups">
          ${level !== "sector" ? `<label class="chk"><input type="checkbox" id="gsmall" ${gs.small ? "checked" : ""}> Show small groups</label>` : ""}
          <select id="gsort" aria-label="Sort"><option value="rank" ${gs.sort === "rank" ? "selected" : ""}>Sort: Rank</option><option value="med" ${gs.sort === "med" ? "selected" : ""}>Sort: Median ${p.toUpperCase()}</option></select></div>
        ${gTable(items, level, level === "sector" ? "Sector" : level === "industry" ? "Industry" : "Theme")}
        <div class="foot-bar">${items.length} of ${all.length} ${level === "industry" ? "industries" : level + "s"} · data ${SD.fmtDate(state.groups.data_date)} · Not investment advice</div>`;
      const qi = $("#gq"); qi.oninput = () => { gs.q = qi.value; const pos = qi.selectionStart; renderGroups(level); const n = $("#gq"); n.focus(); n.setSelectionRange(pos, pos); };
      if ($("#gsmall")) $("#gsmall").onchange = (e) => { gs.small = e.target.checked; renderGroups(level); };
      $("#gsort").onchange = (e) => { gs.sort = e.target.value; renderGroups(level); };
    } else {
      const g = all.find((x) => x.name === name);
      if (!g) { view.innerHTML = `<p class="empty">Group not found. <a href="#/groups/${level}">Back</a></p>`; return; }
      const ids = new Set(g.ids);
      const stocks = state.screen.filter((r) => ids.has(r.id)).sort((a, b) => (b["ret_" + p] ?? b.chg_1d ?? -1e9) - (a["ret_" + p] ?? a.chg_1d ?? -1e9));
      const retKey = p === "1d" ? "chg_1d" : "ret_" + p;
      const inds = level === "sector" ? (state.groups.levels.industry || []).filter((x) => x.parent === name) : [];
      view.innerHTML = `<div class="crumbs"><a href="#/groups/${level}">Groups · ${level}</a> › ${esc(name)}</div>
        <div class="d-head"><h1>${esc(name)}</h1>${tagHTML(g.tag)}<span class="muted">${g.rank != null ? `rank ${g.rank} of ${all.filter((x) => x.rank != null).length}` : "small group (no rank)"}
          ${g.strength != null ? ` · strength ${g.strength} · momentum ${g.momentum}` : ""}</span></div>
        <div class="controls">${periodSeg}</div>
        <div class="stats">${["1d", "1w", "1m", "3m", "1y", "ytd"].map((k) => `<div class="stat"><small>Median ${k.toUpperCase()} / average</small><b>${pct(g["med_" + k])} / ${pct(g["avg_" + k])}</b></div>`).join("")}
          <div class="stat"><small>20-day highs / lows today</small><b>${g.hi20} / ${g.lo20}</b></div><div class="stat"><small>Above 50 SMA</small><b>${g.above50 ?? "–"}%</b></div></div>
        ${inds.length ? `<h2>Industries</h2>${gTable(inds, "industry", "Industry")}` : ""}
        <h2>${level === "sector" ? `All ${esc(name)} stocks` : "Stocks"} (${stocks.length})</h2>
        <div class="table-wrap"><table><thead><tr><th class="l">Stock</th><th>LTP</th><th>1D %</th><th>${p.toUpperCase()} %</th><th>RS</th><th>From 50 SMA</th><th class="l">Themes</th></tr></thead><tbody>
        ${stocks.map((r) => `<tr data-href="#/i/s/${enc(r.id)}"><td class="l name"><b>${esc(r.symbol)}</b>${r.high >= r.high_20d ? ' <span class="tag t-up">20H</span>' : ""}${r.low <= r.low_20d ? ' <span class="tag t-down">20L</span>' : ""}<span>${esc(r.name)}</span></td>`
          + `<td class="num">${SD.fmtPrice(r.close)}</td><td class="num">${pct(r.chg_1d)}</td><td class="num">${pct(r[retKey])}</td><td class="num">${r.rs_rating ?? "–"}</td>`
          + `<td class="num">${pct(r.from_sma50)}</td><td class="l small">${esc(r.themes || "")}</td></tr>`).join("")}</tbody></table></div>`;
    }
    const ps = $("[data-seg=gperiod]");
    if (ps) ps.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; gs.period = b.dataset.v; store.set("sd-gperiod", gs.period); renderGroups(level, name); };
    view.querySelectorAll("tr[data-href]").forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
  }

  /* ------------------------------------------------------------------ breadth (Phase S10): data/breadth.json */
  const breadthCharts = [];
  function clearBreadthCharts() { while (breadthCharts.length) { try { breadthCharts.pop().remove(); } catch (e) { /* gone */ } } }
  const WORD_CLS = { Building: "t-info", Strong: "t-up", Fading: "t-warn", Weak: "t-down", Flat: "", Up: "t-up", Down: "t-down", Mixed: "t-warn",
    Working: "t-up", Failing: "t-down", Stretched: "t-warn", "Washed out": "t-info", Normal: "" };
  async function renderBreadth(tab) {
    clearBreadthCharts();
    const tabs = `<div class="seg"><a class="btn-seg ${tab !== "indices" ? "on" : ""}" href="#/breadth">Market Breadth</a><a class="btn-seg ${tab === "indices" ? "on" : ""}" href="#/breadth/indices">Major Indices</a></div>`;
    if (tab === "indices") return renderMajorIndices(tabs);
    if (!state.breadth) view.innerHTML = `<p class="empty">Loading breadth…</p>`;
    try { if (!state.breadth) state.breadth = await getJSON("data/breadth.json"); await SDChart.loadLib(); }
    catch (e) { view.innerHTML = `<p class="empty">Breadth is not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "breadth") return;
    const B = state.breadth, bs = state.bstate || (state.bstate = { uni: store.get("sd-buni", "liquid"), range: store.get("sd-brange", "3m"), hl: "52" });
    const U = B.universes[bs.uni], S = U.series;
    const n = { "1m": 21, "3m": 63, "1y": 252 }[bs.range];
    const days = B.days.slice(-n), cut = (arr) => (arr || []).slice(-n);
    const last = (k) => { const a = S[k]; return a ? a[a.length - 1] : null; };
    const f0 = (v) => (v == null ? "–" : Math.round(v).toLocaleString("en-IN"));
    const read = U.read || {};
    const READ = [["momentum", "Momentum"], ["short_term", "Short-term"], ["big_trend", "Big trend"], ["breakouts", "Breakouts"], ["overdone", "Overdone?"], ["leadership", "Leadership"]];
    const stage = [["stage1", "Base", "#9e9e9e"], ["stage2", "Uptrend", "#089981"], ["stage3", "Top", "#ff9800"], ["stage4", "Downtrend", "#f23645"]];
    const judged = (k) => (S[k] || []).filter((x) => x != null).slice(-5).reduce((a, b) => a + b, 0);    // last 5 days that can be judged
    const held5 = judged("held"), fail5 = judged("failed");
    const lastHeld = [...(S.held || [])].reverse().find((x) => x != null), lastFail = [...(S.failed || [])].reverse().find((x) => x != null);
    const adSum = (k) => cut(S[k]).slice(-20).reduce((a, b) => a + (b || 0), 0) / Math.min(20, n);
    const cards = [
      ["part", "Participation", `${f0(last("pct_above20"))}% / ${f0(last("pct_above50"))}% / ${f0(last("pct_above200"))}%`, `above 20 / 50 / 200-day average · ${esc(U.labels.participation || "")}`],
      ["ad", "Advance / Decline (20 sessions)", (last("ad_ratio") ?? 0).toFixed(2), `avg ${f0(adSum("adv"))} up / ${f0(adSum("dec"))} down · ${esc(U.labels.ad || "")}`],
      ["lms", "Large vs Mid vs Small", "", "Nifty 50 / Midcap 150 / Smallcap 250, % change over the range"],
      ["hl", "Net new highs − lows", `${f0(last("nh" + bs.hl) - last("nl" + bs.hl))}`, `${f0(last("nh" + bs.hl))} highs / ${f0(last("nl" + bs.hl))} lows (${bs.hl === "52" ? "52-week" : "20-day"})`],
      ["mv", "4% movers", `${f0(last("up4") - last("dn4"))}`, `${f0(last("up4"))} up / ${f0(last("dn4"))} down today`],
      ["bo", "Breakouts held vs failed", `${f0(lastHeld)} held, ${f0(lastFail)} failed`, `${held5 + fail5 ? Math.round((100 * held5) / (held5 + fail5)) : "–"}% held over the last 5 evaluated days · breakout = close above the 50-session high, held = still above 5 sessions later`],
    ];
    view.innerHTML = `<h1>Market</h1>${tabs}
      <div class="controls">${seg("buni", [["liquid", `Liquid stocks ${f0(last("n") && B.universes.liquid.series.n.slice(-1)[0])}`], ["all", `All stocks ${f0(B.universes.all.series.n.slice(-1)[0])}`]], bs.uni)}
        ${seg("brange", [["1m", "1M"], ["3m", "3M"], ["1y", "1Y"]], bs.range)}<span class="muted small">grey line = Nifty 500</span></div>
      <div class="breadth-grid"><div class="read"><h2>Market read · ${SD.fmtDate(B.data_date)}</h2>
        ${READ.filter(([k]) => read[k]).map(([k, l]) => `<div class="read-row" title="${esc(read[k].rule)}"><small>${l}</small><span class="tag ${WORD_CLS[read[k].word] || "t-info"}">${esc(read[k].word)}</span><p>${esc(read[k].text)}</p></div>`).join("")}
        <p class="muted small">Our own simple rules (hover a line to see it). Not investment advice.</p></div>
        <div><div class="stage-bar"><small>Stage mix of ${f0(last("stage_n"))} stocks with 64+ sessions</small><div class="bar">${stage.map(([k, l, c]) => `<span style="flex:${last(k) || 0.0001};background:${c}" title="${l}"></span>`).join("")}</div>
          <div class="stage-legend">${stage.map(([k, l, c]) => { const ch = U.stage_change[k]; return `<span><i style="background:${c}"></i>${l} ${(last(k) ?? 0).toFixed(1)}%${ch ? ` <small class="${ch > 0 ? "up" : "down"}">${ch > 0 ? "+" : ""}${ch}</small>` : ""}</span>`; }).join("")}</div></div>
        <div class="bcards">${cards.map(([id, t, v, sub]) => `<div class="bcard"><div class="bc-head"><b>${t}</b>${id === "hl" ? seg("bhl", [["52", "52W"], ["20", "20D"]], bs.hl) : ""}</div>
          ${v ? `<div class="bc-val">${v}</div>` : ""}<small class="muted">${sub}</small><div class="bc-chart" id="bc-${id}"></div></div>`).join("")}</div></div></div>`;
    const L = window.LightweightCharts, cs = getComputedStyle(document.documentElement), col = (v) => cs.getPropertyValue(v).trim();
    const mk = (id) => {
      const el = $("#bc-" + id);
      const ch = L.createChart(el, { height: 170, layout: { background: { color: "transparent" }, textColor: col("--muted"), fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: col("--line") } }, rightPriceScale: { borderVisible: false }, leftPriceScale: { visible: false },
        timeScale: { borderVisible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 0 } });
      breadthCharts.push(ch);
      const n500 = cut(B.indices.NIFTY_500);
      if (id !== "lms" && n500.length) {
        const s = ch.addSeries(L.LineSeries, { color: "#9e9e9e", lineWidth: 1, priceScaleId: "left", lastValueVisible: false, priceLineVisible: false });
        s.setData(days.map((d, i) => (n500[i] == null ? { time: d } : { time: d, value: n500[i] })));
      }
      return ch;
    };
    const line = (ch, arr, color, extra) => { const s = ch.addSeries(L.LineSeries, { color, lineWidth: 2, priceLineVisible: false, ...(extra || {}) }); s.setData(days.map((d, i) => (arr[i] == null ? { time: d } : { time: d, value: arr[i] }))); return s; };
    const bars = (ch, arr, up, down) => { const s = ch.addSeries(L.HistogramSeries, { priceLineVisible: false }); s.setData(days.map((d, i) => (arr[i] == null ? { time: d } : { time: d, value: arr[i], color: arr[i] >= 0 ? up : down }))); return s; };
    { const ch = mk("part"); const a = line(ch, cut(S.pct_above20), "#2962ff"); line(ch, cut(S.pct_above50), "#ff9800"); line(ch, cut(S.pct_above200), "#7e57c2");
      a.createPriceLine({ price: 20, color: col("--down"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); a.createPriceLine({ price: 80, color: col("--up"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); }
    { const ch = mk("ad"); const a = line(ch, cut(S.ad_ratio), "#2962ff"); a.createPriceLine({ price: 1, color: col("--muted"), lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); }
    { const ch = mk("lms"); [["NIFTY_50", "#2962ff"], ["NIFTY_MIDCAP_150", "#ff9800"], ["NIFTY_SMALLCAP_250", "#f23645"]].forEach(([k, c]) => {
        const x = cut(B.indices[k]); const b0 = x.find((v) => v != null); if (b0) line(ch, x.map((v) => (v == null ? null : (v / b0 - 1) * 100)), c); }); }
    { const ch = mk("hl"); const h = cut(S["nh" + bs.hl]), l = cut(S["nl" + bs.hl]); bars(ch, h.map((v, i) => (v == null || l[i] == null ? null : v - l[i])), col("--up"), col("--down")); }
    { const ch = mk("mv"); const u = cut(S.up4), d = cut(S.dn4); bars(ch, u.map((v, i) => (v == null || d[i] == null ? null : v - d[i])), col("--up"), col("--down")); }
    { const ch = mk("bo"); bars(ch, cut(S.held), col("--up"), col("--up")); bars(ch, cut(S.failed).map((v) => (v == null ? null : -v)), col("--down"), col("--down")); }
    breadthCharts.forEach((c) => c.timeScale().fitContent());
    const on = (name, fn) => { const g = $(`[data-seg=${name}]`); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b) { fn(b.dataset.v); renderBreadth(); } }; };
    on("buni", (v) => { bs.uni = v; store.set("sd-buni", v); });
    on("brange", (v) => { bs.range = v; store.set("sd-brange", v); });
    on("bhl", (v) => { bs.hl = v; });
  }
  function renderMajorIndices(tabs) {
    const idx = state.rows.filter((r) => r.kind === "index");
    const groups = [["Broad market", idx.filter((r) => r.exchange === "NSE" && ["INDICES ELIGIBLE IN DERIVATIVES", "BROAD MARKET INDICES"].includes(r.category)).concat(idx.filter((r) => r.id === "SENSEX"))],
      ["Sectors", idx.filter((r) => r.exchange === "NSE" && r.category === "SECTORAL INDICES")]];
    const cols = [["chg_1d", "1D"], ["chg_1w", "1W"], ["chg_1m", "1M"], ["chg_3m", "3M"], ["chg_1y", "1Y"], ["from_hi52", "From 52W high"]];
    view.innerHTML = `<h1>Market</h1>${tabs}<p class="sub">Main NSE indices (and BSE Sensex). Tap a row for its chart.</p>`
      + groups.map(([title, rows]) => `<h2>${title}</h2><div class="table-wrap"><table><thead><tr><th class="l">Index</th><th>Close</th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}<th>RSI</th><th class="l">Trend</th></tr></thead><tbody>`
        + rows.map((r) => `<tr data-href="#/i/${r.key.replace(":", "/")}"><td class="l"><b>${esc(r.name)}</b></td><td class="num">${SD.fmtPrice(r.close)}</td>${cols.map(([k]) => `<td class="num">${pct(r[k])}</td>`).join("")}`
          + `<td class="num">${r.rsi14 ?? "–"}</td><td class="l">${esc(r.trend || "")}</td></tr>`).join("") + "</tbody></table></div>").join("");
    view.querySelectorAll("tr[data-href]").forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
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
    const mode = routeName();                                  // "stocks" or "scanners"
    if (!state.screen) view.innerHTML = `<p class="empty">Loading all stocks…</p>`;
    try { await loadScreen(); if (mode === "scanners") await loadScans(); }
    catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== mode) return;
    let scan = null, base = state.screen;
    if (mode === "scanners") {
      const id = decodeURIComponent(location.hash.replace(/^#\/?/, "").split("/")[1] || "") || store.get("sd-scan", "trend-template");
      scan = allScans().find((x) => x.id === id) || allScans()[0];
      if (state.lastScan !== scan.id) { state.lastScan = scan.id; if (scan.sort) { st.sort = scan.sort.field; st.dir = scan.sort.dir; } st.limit = PAGE; }
      store.set("sd-scan", scan.id);
      base = SDS.run(state.screen, scan);
    }
    const sectors = [...new Set(state.screen.map((r) => r.sector).filter(Boolean))].sort();
    const sortItem = SD.SORTS.find((x) => x[0] === st.sort);
    const sortName = sortItem ? sortItem[1] : SD.COLUMNS[st.sort] ? SD.COLUMNS[st.sort].label : st.sort;
    const head = scan ? `<div class="scan-head"><div class="menu-wrap"><button class="btn" id="scanBtn" type="button">☰ Scanners ▾</button>
        <div class="menu tree" id="scanMenu" hidden>${scanTree(scan.id)}<div class="tree-act"><button type="button" data-exp>Export my scans</button>
        <label class="btn sm">Import <input type="file" id="impScans" accept=".json" hidden></label></div></div></div>
        <h1>${esc(scan.name)}${scan.edited ? ' <span class="tag">edited</span>' : ""}</h1><button class="btn" id="formulaBtn" type="button">ƒ Formula</button></div>
        <p class="sub">${esc(scan.description || "")}<br><span class="rule-en">${esc(SDS.describe(scan.rule || { all: [] }, state.labels))}${scan.universe === "liquid" ? " · liquid stocks only" : ""}</span></p>`
      : `<h1>Stocks</h1><p class="sub">Every NSE main-board stock with all indicator fields of ${SD.fmtDate(state.screenDate)}.
      Pick columns with ⚙, sort with the menu or a column title, tick rows to copy or export.${wide() ? " Click a row for its chart, ↑ / ↓ to move." : " Tap a row for its chart."}</p>`;
    view.innerHTML = `${head}
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
      rows = SD.sortRows(SD.filterStocks(base, st), st.sort, st.dir);
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
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${scan ? scan.id : "stocks"}-${state.screenDate}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    if (scan) {
      $("#scanBtn").onclick = () => { $("#scanMenu").hidden = !$("#scanMenu").hidden; };
      $("#scanMenu").onclick = (e) => { if (e.target.closest("[data-exp]")) exportScans(); if (e.target.closest("a")) $("#scanMenu").hidden = true; };
      $("#impScans").onchange = (e) => { if (e.target.files[0]) importScans(e.target.files[0], () => renderStocks()); };
      $("#formulaBtn").onclick = () => formulaEditor(scan, (id) => { state.lastScan = null; if (id === scan.id) renderStocks(); else location.hash = "#/scanners/" + encodeURIComponent(id); });
    }
    if (wide()) {
      const first = state.current && rows.some((r) => r.key === state.current) ? state.current : rows[0] && rows[0].key;
      if (first) openRow(first, false);
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
      ${isStock ? `<div class="seg view-tog" id="viewTog"><button type="button" data-v="chart" class="on">Chart</button><button type="button" data-v="fin">Financials</button></div>` : ""}
      <div class="chart-box big" id="chartBox"></div><div id="finBox" hidden></div>
      ${isStock ? `<div id="earnSnap" class="earn-snap"></div><div class="stats">
        ${stat("Market cap", r.mcap_cr != null ? "₹" + SD.fmtCell(r.mcap_cr, "cr") + " Cr" : "–")}${stat("Free float", r.float_pct != null ? Number(r.float_pct).toFixed(1) + "%" : "–")}
        ${stat("RS rating / 1W change", `${r.rs_rating ?? "–"} / ${SD.fmtCell(r.rs_chg_1w, "signed")}`)}${stat("Stage", SD.fmtCell(r.stage, "stage"))}
        ${stat("RSI (14) / ADR %", `${SD.fmtCell(r.rsi14, "num1")} / ${SD.fmtCell(r.adr_pct, "num2")}`)}${stat("52W high / from it", `${SD.fmtPrice(r.hi52)} / ${pct(r.from_hi52)}`)}
        ${stat("1M / 3M / 1Y", `${pct(r.ret_1m)} / ${pct(r.ret_3m)} / ${pct(r.ret_1y)}`)}${stat("Turnover / delivery", `₹${SD.fmtCell(r.turnover_cr, "num2")} Cr / ${SD.fmtCell(r.deliv_pct, "num1")}%`)}
        ${stat("F&O / circuit band", `${r.fno ? "Yes" : "No"} / ${esc(r.price_band || "–")}${/^\d+$/.test(String(r.price_band || "")) ? "%" : ""}`)}${stat("Listed / history from", `${SD.fmtDate(r.listed || "")} / ${SD.fmtDate(lr.first_date || r.listed || "")}`)}
      </div><h2>Corporate actions</h2><div id="acts" class="muted">Loading…</div>` : ""}`;
    view.querySelector("[data-star]").onclick = (e) => { toggleWatch(e.target.dataset.star); e.target.classList.toggle("on"); };
    if (isStock) {
      $("#earnSnap").innerHTML = earningsSnapshot(r);
      const showView = (v) => {
        setOn($("#viewTog"), $(`#viewTog [data-v=${v}]`));
        $("#chartBox").hidden = v !== "chart";
        $("#finBox").hidden = v !== "fin";
        store.set("sd-detail-view", v);
        if (v === "fin") renderFinancials($("#finBox"), r, id);
      };
      $("#viewTog").onclick = (e) => { const b = e.target.closest("button"); if (b) showView(b.dataset.v); };
      if (store.get("sd-detail-view", "chart") === "fin") showView("fin");
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
  /* ------------------------------------------------------------------ financials (Phase S8): data/f/<id>.json, fin.js */
  const finNum = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
  function earningsSnapshot(r) {
    if (!r.fin_qtr && !r.next_result) return "";
    const g = (v) => (v == null ? "–" : `<span class="${v >= 0 ? "up" : "down"}">${SD.fmtPct(v)}</span>`);
    return `<b>Earnings</b> · latest quarter ${r.fin_qtr ? SDF.label(r.fin_qtr) : "–"}${r.last_result ? ` (results ${SD.fmtDate(r.last_result)})` : ""}
      · Sales YoY ${g(r.sales_g_yoy)} · Profit YoY ${g(r.np_g_yoy)} · EPS YoY ${g(r.eps_g_yoy)} · EPS TTM ₹${finNum(r.eps_ttm, 2)}
      ${r.next_result ? ` · <b>next results ${SD.fmtDate(r.next_result)}</b>` : ""}`;
  }
  function finTable(t, kind) {
    if (!t.ends.length) return `<p class="muted">Not in NSE's filings.</p>`;
    const pctRow = (k) => ["opm", "taxp"].includes(k) || kind === "pct";
    const cell = (k, v) => (v == null ? "–" : pctRow(k) ? finNum(v, 1) + "%" : k === "eps" ? finNum(v, 2) : k === "n" ? finNum(v) : kind === "shp" ? finNum(v, 2) + "%" : finNum(v));
    return `<div class="table-wrap fin"><table><thead><tr><th class="l sticky"></th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`
      + t.rows.map(([l, k, vals]) => `<tr class="${["op_profit", "net_profit", "total", "fcf", "pbt"].includes(k) ? "strong" : ""}"><td class="l sticky">${esc(l)}</td>${vals.map((v) => `<td class="num">${cell(k, v)}</td>`).join("")}</tr>`).join("")
      + "</tbody></table></div>";
  }
  async function renderFinancials(box, r, id) {
    if (box.dataset.done) return;
    box.innerHTML = `<p class="empty">Loading financials…</p>`;
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
        <h3>Quarterly results</h3>${finTable(SDF.quarterTable(doc, basis, 12))}
        <h3>Profit & loss</h3>${finTable(SDF.annualTable(doc, basis, 10))}
        <div class="grow-grid">${grow.map(([title, items]) => `<div class="grow"><h4>${esc(title)}</h4>${items.map(([l, v]) => `<div><span>${l}:</span><b>${v == null ? "–" : finNum(v, 0) + "%"}</b></div>`).join("")}</div>`).join("")}</div>
        <h3>Balance sheet</h3>${finTable(SDF.bsTable(doc, basis, 10))}
        <h3>Cash flows</h3>${finTable(SDF.cfTable(doc, basis, 10))}
        <h3>Shareholding pattern</h3>${finTable(SDF.shpTable(doc, 12), "shp")}
        <p class="muted small">EPS adjusted for later splits / bonuses. Older years: NSE's XBRL filings start ~2017 (balance sheet ~2019, cash flow ~2020).
        Banks: revenue = interest earned, financing profit = revenue − interest − expenses. Educational purpose only, not investment advice.</p>`;
      box.querySelectorAll(".table-wrap.fin").forEach((w) => { w.scrollLeft = w.scrollWidth; });   // newest period in view
      const bt = box.querySelector("#basisTog");
      if (bt) bt.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; basis = b.dataset.v; store.set("sd-fin-basis", basis); draw(); };
    };
    draw();
  }
  const setOn = (group, btn) => { group.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn)); };

  /* ------------------------------------------------------------------ router + theme */
  function route() {
    if (!state.rows.length) return;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const tab = { "": "market", stocks: "stocks", scanners: "scanners", screener: "scanners", sectors: "groups", groups: "groups", breadth: "breadth", watchlist: "watchlist", fields: "", i: "" }[parts[0]] ?? "market";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    SDChart.close();
    clearBreadthCharts();
    view.onkeydown = null;
    if (parts[0] === "stocks" || parts[0] === "scanners") renderStocks();
    else if (parts[0] === "fields") renderFields();
    else if (parts[0] === "screener") renderScreener();
    else if (parts[0] === "groups") renderGroups(parts[1], parts.slice(2).join("/"));
    else if (parts[0] === "breadth") renderBreadth(parts[1]);
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
    if (/^#\/(i|stocks|scanners)/.test(location.hash)) route();
  };
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  load();
})();
