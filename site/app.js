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
  async function renderGroups(level, name) {
    level = ["sector", "industry", "theme"].includes(level) ? level : "sector";
    if (!state.groups) view.innerHTML = SKEL("Loading groups");
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
    if (!state.breadth) view.innerHTML = SKEL("Loading breadth");
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
          <div class="res-h"><b>Results</b><span class="count" id="resN"></span>
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
      $("#resN").textContent = rows.length.toLocaleString("en-IN");
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
  /* ------------------------------------------------------------------ home / warm-up page (Phase N5) */
  /** simple SVG line chart: lines = [{vals, color, fill, dash}], y range lo..hi, bands = [[from, to, colour]], ticks = [values] */
  function svgLines(lines, o = {}) {
    const W = o.w || 560, H = o.h || 150, padL = 30, padB = 16, pw = W - padL - 4, ph = H - padB - 6;
    const n = Math.max(...lines.map((l) => l.vals.length), 2);
    const lo = o.lo ?? 0, hi = o.hi ?? 100;
    const X = (i) => padL + (i / (n - 1)) * pw, Y = (v) => 6 + ph - ((v - lo) / (hi - lo || 1)) * ph;
    const path = (vals) => vals.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
    let s = `<svg class="hl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.label || "chart")}">`;
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
    return `<svg class="hl-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="hl-grid"/>${vals.map((v, i) => {
      if (v == null) return "";
      const h = Math.max(1, (Math.abs(v) / m) * (mid - 1)), last = i === n - 1;
      return `<rect x="${(i * bw + bw * 0.12).toFixed(1)}" y="${v >= 0 ? mid - h : mid}" width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" class="${v >= 0 ? "pos" : "neg"} ${last ? "last" : ""}"/>`;
    }).join("")}</svg>`;
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
      <div class="hp-v"><b>${pv == null ? "–" : pv.toFixed(1) + "%"}</b><span class="tag t-info">${esc(lab(pv, B.config.participation_labels))}</span><small class="muted">above the ${hs.part}-day average · latest ${shortDay(days[days.length - 1])}</small></div>
      ${svgLines([{ vals: n500s, color: "var(--muted)", width: 1.2 }, { vals: cut(pk), color: "#2962ff", fill: "rgba(41,98,255,.12)" }], { lo: 0, hi: 100, ticks: [0, 20, 50, 80, 100], unit: "%", bands: [[80, 100, "rgba(219,39,119,.08)"]], xlabels: xl, label: "Participation" })}
      <small class="muted">grey = Nifty 500 (scaled) · pink zone = more than 80 % (stretched)</small>
      <div class="hp-h" style="margin-top:12px"><small class="muted">STAGE 2 · STAGE 4</small><span class="small"><b style="color:#2962ff">Stage 2 ${(last("stage2") ?? 0).toFixed(1)}%</b> · <b style="color:#db2777">Stage 4 ${(last("stage4") ?? 0).toFixed(1)}%</b></span></div>
      ${svgLines([{ vals: cut("stage2"), color: "#2962ff" }, { vals: cut("stage4"), color: "#db2777" }], { lo: 0, hi: 70, ticks: [0, 35, 70], unit: "%", xlabels: xl, h: 120, label: "Stage 2 and stage 4" })}` : "";
    // FII / DII + highs - lows
    const fr = flows ? flows.rows.slice(-22) : [];
    const sum = (k) => fr.reduce((a, r) => a + (r[k] || 0), 0);
    const flowRow = (k, label) => { const lastR = fr[fr.length - 1]; return `<div class="hf-row"><div class="hf-t"><b>${label}</b><small class="muted">${lastR ? shortDay(lastR.date) : ""}</small><b class="${lastR && lastR[k] >= 0 ? "up" : "down"}">${lastR ? (lastR[k] > 0 ? "+" : "") + finNum(lastR[k]) : "–"}</b></div>
      ${svgBars(fr.map((r) => r[k]))}<div class="hf-t"><small class="muted">${fr.length} session${fr.length === 1 ? "" : "s"} net</small><b class="${sum(k) >= 0 ? "up" : "down"}">${sum(k) > 0 ? "+" : ""}${finNum(sum(k))}</b></div></div>`; };
    const hl = (S.nh20 || []).slice(-22).map((h, i) => h - ((S.nl20 || []).slice(-22)[i] || 0));
    const flowHTML = `<div class="hp-h"><small class="muted">FII / DII CASH · LAST ${Math.max(fr.length, 1)} SESSION${fr.length === 1 ? "" : "S"}</small><small class="muted">₹ crore</small></div>
      ${fr.length ? flowRow("fii_net", "FII") + flowRow("dii_net", "DII") + (fr.length < 22 ? `<p class="muted small">Collected daily from NSE since ${SD.fmtDate(flows.since)}; the bars fill up to 22 sessions.</p>` : "") : '<p class="muted small">FII / DII figures start with the next daily update.</p>'}
      <div class="hp-h" style="margin-top:12px"><small class="muted">20-DAY HIGHS · LOWS · LAST 22 SESSIONS</small></div>
      ${B ? `<div class="hf-row"><div class="hf-t"><b>Net highs − lows</b><small class="muted">${shortDay(days[days.length - 1])}</small><b class="${hl[hl.length - 1] >= 0 ? "up" : "down"}">${hl[hl.length - 1] > 0 ? "+" : ""}${hl[hl.length - 1] ?? "–"}</b></div>${svgBars(hl)}
        <div class="hf-t"><span></span><span class="small"><b class="up">${last("nh20") ?? "–"} highs</b> · <b class="down">${last("nl20") ?? "–"} lows</b></span></div></div>` : ""}`;
    // indices strip
    const IDX = [["NIFTY_50", "Nifty 50"], ["NIFTY_500", "Nifty 500"], ["NIFTY_MIDCAP_150", "Midcap 150"], ["NIFTY_SMALLCAP_250", "Smallcap 250"], ["NIFTY_MICROCAP_250", "Microcap 250"], ["NIFTY_BANK", "Nifty Bank"], ["INDIA_VIX", "India VIX"]];
    const idxHTML = IDX.map(([id, name]) => { const r = state.byKey.get("n:" + id); return r ? `<a class="hi-card" href="#/i/n/${id}" data-idx="${id}"><div class="hi-t"><span>${name}</span>${pct(r.chg_1d)}</div><b>${SD.fmtPrice(r.close)}</b>
      <div class="hi-sp"><i class="skel"></i></div><div class="hi-f"><small class="muted">${r.from_hi52 == null ? "" : finNum(Math.abs(r.from_hi52), 1) + "% from high"}</small><small class="hi-ma"></small></div></a>` : ""; }).join("");
    // today's setups: near pivot / VCP / flag / tight range, liquid, RS 70+, closest to the pivot first
    const SET = [["near-pivot", "Near Pivot"], ["vcp", "VCP"], ["flag", "Flag"], ["tight-range", "Tight Range"]];
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
    const evHTML = `<small class="muted hm-l">RESULTS</small>${dueHTML || '<p class="muted small">No results dates in the next 10 days.</p>'}
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
          <section class="hcard ev"><div class="hc-h"><h2>Coming up</h2><span class="muted small">results, expiries</span></div>${evHTML}</section></div></div>
      <section class="hcard"><div class="hc-h"><h2>Your watchlist plan</h2><span class="muted small">${wl.length} stock${wl.length === 1 ? "" : "s"}</span><a class="sp-link" href="#/watchlist">Open watchlist →</a></div><div class="hw">${wlHTML}</div></section>
      <p class="muted small">Our own simple rules on end-of-day data. Educational purpose only, not investment advice.</p></div>`;
    $("#stPage").innerHTML = `<span>${setups.length} setups</span><span class="st-n">Data ${SD.fmtDate(state.screenDate || state.dataDate)}</span>`;
    const hr = $("#hrMore"); if (hr) hr.onclick = () => { hs.more = !hs.more; saveHs(); renderHome(); };
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
      ${sec("peers", "Peers", peerSum, peerBody)}${sec("shp", "Shareholding", "", '<i class="skel sp-sk"></i>')}</div>`;
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
    const tab = { "": "home", market: "market", stocks: "stocks", scanners: "scanners", screener: "scanners", sectors: "groups", groups: "groups", breadth: "breadth", watchlist: "watchlist", fields: "fields", i: "" }[parts[0]] ?? "market";
    document.querySelectorAll(".rail [data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
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
    else if (parts[0] === "groups") renderGroups(parts[1], parts.slice(2).join("/"));
    else if (parts[0] === "breadth") renderBreadth(parts[1]);
    else if (parts[0] === "sectors") renderSectors(parts[1], parts[2]);
    else if (parts[0] === "watchlist") renderWatchlist();
    else if (parts[0] === "i") renderDetail(parts[1], parts.slice(2).join("/"));
    else if (parts[0] === "market") renderMarket();
    else renderHome();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ top bar: find a stock / index, about */
  const gq = $("#gq"), gres = $("#gres");
  let gHits = [], gOn = 0;
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
  function gDraw() {
    gHits = gFind(gq.value);
    gOn = Math.min(gOn, Math.max(gHits.length - 1, 0));
    if (!gq.value.trim()) { gres.hidden = true; gq.setAttribute("aria-expanded", "false"); return; }
    gres.innerHTML = gHits.length ? gHits.map((r, i) => `<a role="option" href="#/i/${r.key.replace(":", "/")}" class="${i === gOn ? "on" : ""}">`
      + `<b>${esc(r.kind === "stock" ? r.symbol : r.name)}</b><span class="num">${SD.fmtPrice(r.close)}<br>${pct(r.chg_1d)}</span>`
      + `<small>${esc(r.kind === "stock" ? r.name : r.exchange + " index")}${r.sector ? " · " + esc(r.sector) : ""}</small></a>`).join("")
      : `<div class="empty">No stock or index matches “${esc(gq.value)}”.</div>`;
    gres.hidden = false;
    gq.setAttribute("aria-expanded", "true");
  }
  const gClose = () => { gres.hidden = true; gq.setAttribute("aria-expanded", "false"); };
  gq.oninput = () => { gOn = 0; gDraw(); };
  gq.onfocus = () => { if (gq.value.trim()) gDraw(); };
  gq.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); gOn = (gOn + (e.key === "ArrowDown" ? 1 : -1) + gHits.length) % Math.max(gHits.length, 1); gDraw(); }
    else if (e.key === "Enter" && gHits[gOn]) { location.hash = "#/i/" + gHits[gOn].key.replace(":", "/"); gq.value = ""; gClose(); gq.blur(); }
    else if (e.key === "Escape") { gq.value = ""; gClose(); gq.blur(); }
  };
  gres.onclick = (e) => { if (e.target.closest("a")) { gq.value = ""; gClose(); } };
  document.addEventListener("click", (e) => { if (!e.target.closest(".gsearch")) gClose(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); gq.focus(); }
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
