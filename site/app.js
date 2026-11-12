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
  /** a stock's logo = its company's own website icon (scripts/fetch_logos.py -> site/logos/<id>.png, list in logos/index.json);
      without one, a round letter badge whose colour comes from the symbol, so a stock always looks the same */
  const monoHue = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const logo = (r, big) => {
    const sym = String((r && r.symbol) || ""), id = r && r.id;
    if (id && state.logos && state.logos.has(id)) return `<i class="slogo${big ? " big" : ""}" aria-hidden="true"><img src="logos/${encodeURIComponent(id)}.png" alt="" loading="lazy" decoding="async"></i>`;
    return `<i class="mono${big ? " big" : ""}" style="--h:${monoHue(sym)}" aria-hidden="true">${esc(sym.replace(/[^A-Z0-9]/gi, "").slice(0, big ? 2 : 1))}</i>`;
  };
  const SKEL = (label) => `<div class="skel-page" aria-label="${label}"><i class="skel h"></i><i class="skel s"></i><i class="skel bar"></i>`
    + '<i class="skel row"></i>'.repeat(6) + "</div>";
  const pct = (x) => `<span class="${SD.colorClass(x)}">${SD.fmtPct(x)}</span>`;
  const TREND_TAG = { "strong uptrend": "t-up", uptrend: "t-up", "strong downtrend": "t-down", downtrend: "t-down" };

  const COLS = [
    { k: "name", label: "Name", cls: "l sticky", td: "name", html: (r) => r.kind === "stock"
      ? `<div class="nm">${logo(r)}<div><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></div></div>` : `<b>${esc(r.name)}</b><span>${r.exchange} index</span>` },
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
      state.logos = new Set(((await getJSON("logos/index.json").catch(() => null)) || {}).ids || []);
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
      + stocks.map((r) => `<tr class="${state.gStock === r.key ? "on" : ""}" data-stock="${esc(r.key)}"><td class="l"><b class="wl">${logo(r)}${esc(r.symbol)}</b>${r.high >= r.high_20d ? ' <span class="tag t-up">20H</span>' : ""}${r.low <= r.low_20d ? ' <span class="tag t-down">20L</span>' : ""}</td>`
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
  /* new look 12-Nov-2026 (Viraj, reference video "Breadth 09-11-2026"): one shared crosshair - pointing at any chart
     moves a dashed line + ring markers to the same day in all six charts and every header shows that day's numbers;
     the two lower charts also show a small card; charts are drawn at their real pixel size and animate in (lines
     draw, bars grow) when the range or a toggle changes. */
  const BX_TIP = {
    part: "Share of stocks above their 20 / 50 / 200-day average. Above 80 % = crowded, below 20 % = washed out.",
    hl: "Stocks at a 20-day (or 52-week) high minus stocks at a 20-day (52-week) low, one bar a day.",
    ad: "Stocks that rose divided by stocks that fell over the last 20 or 40 sessions (above 1 = more rose), or the running advance - decline line.",
    mv: "Stocks up 4 % or more in a day minus those down 4 % or more, or the 5 / 10-day ratio of the two.",
    lms: "Nifty 50, Midcap 150 and Smallcap 250, each from the first day of the range.",
    bo: "Closes above the 50-session high (breakouts) judged 5 sessions later: held = still above, failed = back below.",
  };
  const BX_TONE = { Strong: "up", Up: "up", Working: "up", Building: "up", Positive: "up", Weak: "down", Down: "down", Failing: "down",
    Fading: "warn", Mixed: "warn", Stretched: "warn", Caution: "warn", "Washed out": "info" };
  const bxDM = (iso, yr) => { const t = new Date(iso + "T00:00:00"); return `${t.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getMonth()]}${yr ? " " + t.getFullYear() : ""}`; };
  let bxResize = null;

  async function renderBreadth(tab) {
    clearBreadthCharts();
    const IC_B = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 18a8 8 0 1 1 16 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 18l4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const IC_I = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 19h16M5 15l4-5 4 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const tabs = `<div class="bx-tabs"><a class="${tab !== "indices" ? "on" : ""}" href="#/breadth">${IC_B}Market Breadth</a><a class="${tab === "indices" ? "on" : ""}" href="#/breadth/indices">${IC_I}Major Indices</a></div>`;
    if (tab === "indices") return renderMajorIndices(tabs);
    if (!state.breadth) view.innerHTML = SKEL("Loading breadth");
    try { if (!state.breadth) state.breadth = await getJSON("data/breadth.json"); }
    catch (e) { view.innerHTML = `<p class="empty">Breadth is not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "breadth") return;
    const B = state.breadth;
    const bs = state.bstate || (state.bstate = Object.assign({ uni: "liquid", range: "3m", hl: "20", part: "50", ad: "20", mv: "d" }, store.get("sd-breadth", {})));
    const saveB = () => store.set("sd-breadth", { uni: bs.uni, range: bs.range, hl: bs.hl, part: bs.part, ad: bs.ad, mv: bs.mv });
    const U = B.universes[bs.uni] || B.universes.liquid, S = U.series;
    const n = Math.min({ "1m": 21, "3m": 63, "1y": 252 }[bs.range], B.days.length), off = B.days.length - n;
    const days = B.days.slice(-n), cut = (k) => (S[k] || []).slice(-n), full = (k) => S[k] || [];
    const f0 = (v) => (v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("en-IN"));
    const sg = (v, f = f0) => (v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v)));
    const read = U.read || {};
    const READ = [["momentum", "Momentum"], ["short_term", "Short-term"], ["big_trend", "Big trend"], ["breakouts", "Breakouts"], ["overdone", "Overdone?"], ["leadership", "Leadership"]];
    const STG = [["stage1", "Base", "#9aa3b2"], ["stage2", "Uptrend", "#3b7dd8"], ["stage3", "Top", "#e0a23e"], ["stage4", "Downtrend", "#d8457c"]];
    const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
    const roll = (a, w) => a.map((_, i) => { if (i < w - 1) return null; let s = 0; for (let k = i - w + 1; k <= i; k++) { if (a[k] == null) return null; s += a[k]; } return s; });
    const ratio = (u, d) => u.map((x, i) => (x == null || d[i] == null || !d[i] ? null : x / d[i]));
    const tail = (a) => a.slice(-n);
    const n500 = (B.indices.NIFTY_500 || []).slice(-n);
    const lab = (v, labels) => { for (const [lim, t] of labels || []) if (v < lim) return t; return ""; };
    const trend = (a, i, higherBetter = true) => { const j = i - 5; if (j < 0 || a[i] == null || a[j] == null || a[i] === a[j]) return ""; const better = (a[i] > a[j]) === higherBetter; return `<span class="bx-tr ${better ? "up" : "down"}">· ${better ? "better ↑" : "worse ↓"}</span>`; };
    const partK = `pct_above${bs.part}`, part = cut(partK);
    const hlH = cut("nh" + bs.hl), hlL = cut("nl" + bs.hl), hl = hlH.map((v, i) => (v == null || hlL[i] == null ? null : v - hlL[i]));
    const adv = full("adv"), dec = full("dec");
    const adR = bs.ad === "line" ? cut("ad_line") : tail(ratio(roll(adv, Number(bs.ad)), roll(dec, Number(bs.ad))));
    const advW = bs.ad === "line" ? null : tail(roll(adv, Number(bs.ad))), decW = bs.ad === "line" ? null : tail(roll(dec, Number(bs.ad)));
    const up4 = full("up4"), dn4 = full("dn4");
    const mv = bs.mv === "d" ? tail(up4.map((v, i) => (v == null || dn4[i] == null ? null : v - dn4[i]))) : tail(ratio(roll(up4, Number(bs.mv)), roll(dn4, Number(bs.mv))));
    const held = cut("held"), failed = cut("failed"), bouts = cut("breakouts");
    const LMS = [["NIFTY_50", "N50", "Nifty 50", "#3b7dd8"], ["NIFTY_MIDCAP_150", "MID150", "Nifty Midcap 150", "#c98a1e"], ["NIFTY_SMALLCAP_250", "SML250", "Nifty Smallcap 250", "#6b7280"]];
    const lms = LMS.map(([k, l, nm, c]) => { const all = B.indices[k] || [], x = all.slice(-n), b0 = x.find((v) => v != null);
      return { l, nm, c, vals: x.map((v) => (v == null || !b0 ? null : (v / b0 - 1) * 100)), day: x.map((v, j) => { const p = all[off + j - 1]; return v == null || p == null ? null : (v / p - 1) * 100; }) }; });
    const judged = (a) => a.filter((x) => x != null).slice(-5).reduce((s, b) => s + b, 0);
    const h5 = judged(full("held")), f5 = judged(full("failed"));
    const N = days.length;
    const segB = (name, opts, val) => `<div class="rr-seg bx-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(val) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const chartBox = (id, title, toggle) => `<div class="bx-c" data-c="${id}" style="--k:${["part", "hl", "ad", "mv", "lms", "bo"].indexOf(id)}"><div class="bx-ch"><small class="bx-t" data-tip="${esc(BX_TIP[id])}">${title}</small>${toggle || ""}</div>
      <div class="bx-v" id="bv-${id}"></div><div class="bx-svg" id="bs-${id}"></div></div>`;
    const CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const uniN = (k) => f0(lastOf(B.universes[k].series.n));
    view.innerHTML = `<div class="bx">${tabs}
      <div class="bx-g"><aside class="bx-l"><div class="bx-lh"><h3>Market Breadth</h3><small>Read as of ${esc(shortDay(B.data_date))}</small></div>
        ${READ.filter(([k]) => read[k]).map(([k, l], i) => { const t = BX_TONE[read[k].word] || "neu"; return `<div class="bx-rd" style="--i:${i}" data-tip="${esc(read[k].rule || "")}"><div class="bx-rt"><i class="bx-dt ${t}"></i><b>${l}</b><span class="bx-wd ${t}">${esc(read[k].word)}</span></div><p>${esc(read[k].text)}</p></div>`; }).join("")}
        <div class="bx-stage"><div class="bx-sh"><small class="bx-t" data-tip="Stage of each stock with 64+ sessions: base, uptrend (stage 2), top, downtrend (stage 4); change vs the day before.">STAGE ANALYSIS</small><small>of ${f0(lastOf(full("stage_n")))} stocks (64+ days)</small></div>
          <div class="bar">${STG.map(([k, l, c]) => `<span style="flex:${lastOf(full(k)) || 0.0001};background:${c}" title="${l} ${(lastOf(full(k)) ?? 0).toFixed(1)}%"></span>`).join("")}</div>
          <div class="bx-sg">${STG.map(([k, l, c]) => { const ch = (U.stage_change || {})[k]; return `<div><small><i style="background:${c}"></i>${l}</small><b>${(lastOf(full(k)) ?? 0).toFixed(1)}%</b><small class="${ch > 0 ? "up" : ch < 0 ? "down" : "muted"}">${ch ? (ch > 0 ? "+" : "") + ch + " 1D" : "–"}</small></div>`; }).join("")}</div></div>
        <p class="bx-foot">Our own simple rules - point at a line to see it. Not investment advice.</p></aside>
      <section class="bx-r"><div class="bx-rh"><h3>Market internals</h3><span class="pk-i bx-t" data-tip="Point at any chart: every chart moves to the same day and shows that day's numbers. The grey line in each chart is the Nifty 500.">i</span>
          <small class="bx-gl"><i></i>Nifty 500 (grey line)</small>
          <div class="bx-tools"><div class="hm-dd bx-dd" data-dd="uni"><button type="button" class="hm-ddb"><b>${bs.uni === "all" ? "All stocks" : "Liquid stocks"} <span class="bx-n">${uniN(bs.uni === "all" ? "all" : "liquid")}</span></b>${CHEV}</button>
            <div class="hm-menu" hidden><button type="button" data-v="liquid" class="${bs.uni !== "all" ? "on" : ""}">Liquid stocks · ${uniN("liquid")}</button><button type="button" data-v="all" class="${bs.uni === "all" ? "on" : ""}">All stocks · ${uniN("all")}</button></div></div>
            ${segB("brange", [["1m", "1M"], ["3m", "3M"], ["1y", "1Y"]], bs.range)}</div></div>
        <div class="bx-grid">
          ${chartBox("part", "PARTICIPATION", segB("bpart", [["20", "20D"], ["50", "50D"], ["200", "200D"]], bs.part))}
          ${chartBox("hl", `NET ${bs.hl === "52" ? "52W" : "20D"} HIGHS − LOWS`, segB("bhl", [["20", "20D"], ["52", "52W"]], bs.hl))}
          ${chartBox("ad", "ADVANCE / DECLINE", segB("bad", [["20", "20D"], ["40", "40D"], ["line", "A-D line"]], bs.ad))}
          ${chartBox("mv", "4% MOVERS", segB("bmv", [["d", "Daily"], ["5", "5D ratio"], ["10", "10D ratio"]], bs.mv))}
          ${chartBox("lms", "LARGE VS MID VS SMALL", "")}
          ${chartBox("bo", "BREAKOUTS − BREAKDOWNS", "")}
        </div></section></div></div>
      <div class="bx-tipbox" id="bxTip" hidden></div>`;
    $("#stPage").innerHTML = `<span>${f0(lastOf(S.n))} ${bs.uni === "liquid" ? "liquid " : ""}stocks</span><span class="st-n">data through ${esc(shortDay(B.data_date))}</span>`;

    // ---- the six charts (drawn at the box's real pixel width)
    const H = 156, PL = 42, PR = 8, PT = 8, PB = 22;
    const CH = [];
    const day = (j, extra) => `<small class="bx-d">${esc(bxDM(days[j]))}${extra ? ` · ${extra}` : ""}</small>`;
    const word = (t, tone) => `<span class="bx-w ${tone || ""}">${t}</span>`;
    const draw = (c, anim) => {
      const el = c.el, o = c.o, W = Math.max(260, el.clientWidth);
      const vals = o.series.flatMap((s) => s.vals).filter((v) => v != null && isFinite(v));
      let lo = o.lo ?? Math.min(...vals), hi = o.hi ?? Math.max(...vals);
      if (o.zero) { const m = o.sym ? Math.max(Math.abs(lo), Math.abs(hi)) : 0; if (o.sym) { lo = -m; hi = m; } else { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } }
      if (!(hi > lo)) hi = lo + 1;
      const pad = (hi - lo) * 0.06; if (o.lo == null && !o.sym) lo -= pad; if (o.hi == null && !o.sym) hi += pad;
      const X = (i) => PL + (i / Math.max(N - 1, 1)) * (W - PL - PR), Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB), bw = (W - PL - PR) / Math.max(N, 1);
      const fmtT = o.fmtT || ((v) => (Math.abs(hi - lo) < 5 ? v.toFixed(2) : (v > 0 && o.zero ? "+" : "") + Math.round(v).toLocaleString("en-IN")));
      const ticks = o.ticks || (o.zero ? [hi, 0, lo].map((v) => Math.round(v)) : [hi - pad, lo + pad]);
      let s = `<svg class="bx-s${anim ? " bx-in" : ""}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bxg-${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7dd8" stop-opacity=".22"/><stop offset="1" stop-color="#3b7dd8" stop-opacity=".02"/></linearGradient></defs>`;
      for (const [a, b, cls] of o.bands || []) s += `<rect class="bx-band ${cls}" x="${PL}" y="${Y(Math.min(b, hi)).toFixed(1)}" width="${W - PL - PR}" height="${Math.max(0, Y(Math.max(a, lo)) - Y(Math.min(b, hi))).toFixed(1)}"/>`;
      for (const r of o.refs || []) s += `<line class="bx-ref" x1="${PL}" x2="${W - PR}" y1="${Y(r).toFixed(1)}" y2="${Y(r).toFixed(1)}"/>`;
      for (const t of ticks) s += `<text x="${PL - 6}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end" class="bx-ax">${fmtT(t)}${o.unit || ""}</text>`;
      if (o.grey) {
        const g = o.grey.filter((v) => v != null), glo = Math.min(...g), ghi = Math.max(...g), GY = (v) => PT + 4 + (1 - (v - glo) / (ghi - glo || 1)) * (H - PT - PB - 8);
        s += `<polyline class="bx-grey" points="${o.grey.map((v, i) => (v == null ? "" : `${X(i).toFixed(1)},${GY(v).toFixed(1)}`)).filter(Boolean).join(" ")}"/>`;
      }
      if (o.zero) s += `<line class="bx-zero" x1="${PL}" x2="${W - PR}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
      o.series.forEach((se, k) => {
        if (se.bars) {
          const w = Math.max(1, Math.min(bw * 0.62, 10));
          s += `<g class="bx-bars">${se.vals.map((v, i) => (v == null || v === 0 ? "" : `<rect class="bx-b ${(se.tone ? se.tone(v) : v >= 0) ? "pos" : "neg"}" data-i="${i}" style="--d:${Math.min(i * 6, 500)}ms" x="${(X(i) - w / 2).toFixed(1)}" y="${Math.min(Y(v), Y(0)).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - Y(0))).toFixed(1)}"/>`)).join("")}</g>`;
        } else {
          const pts = se.vals.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
          if (!pts.length) return;
          const d = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
          if (se.fill) s += `<path class="bx-area" d="${d} L${pts[pts.length - 1][0].toFixed(1)},${Y(lo).toFixed(1)} L${pts[0][0].toFixed(1)},${Y(lo).toFixed(1)} Z" fill="url(#bxg-${c.id})"/>`;
          s += `<path class="bx-ln" d="${d}" pathLength="1" style="stroke:${se.color};--d:${k * 120}ms"/>`;
        }
      });
      const xl = [0, Math.floor((N - 1) / 2), N - 1];
      s += xl.map((i, k) => `<text x="${X(i).toFixed(1)}" y="${H - 5}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}" class="bx-ax">${esc(bxDM(days[i], k === 0 && bs.range === "1y"))}</text>`).join("");
      s += `<g class="bx-hv" style="opacity:0"><line class="bx-x" x1="0" x2="0" y1="${PT}" y2="${H - PB}"/>${o.series.filter((se) => !se.bars).map((se, k) => `<circle class="bx-dot" data-k="${k}" r="4" cx="0" cy="0" style="stroke:${se.color}"/>`).join("")}</g>`;
      s += `<rect class="bx-hit" x="${PL}" y="0" width="${W - PL - PR}" height="${H}"/></svg>`;
      el.innerHTML = s;
      Object.assign(c, { X, Y, W });
    };
    const make = (id, o) => { const c = { id, el: $("#bs-" + id), o }; CH.push(c); draw(c, true); };
    make("part", { series: [{ vals: part, color: "#3b7dd8", fill: true }], lo: 0, hi: 100, ticks: [100, 50, 0], unit: "%", grey: n500, refs: [80, 50, 20],
      bands: [[80, 100, "pk"], [0, 20, "bl"]],
      head: (j) => `<b>${part[j] == null ? "–" : Math.round(part[j]) + "%"}</b>${word(esc(lab(part[j], B.config.participation_labels)), part[j] >= 60 ? "up" : part[j] < 30 ? "down" : "")}${trend(part, j)}${day(j)}` });
    make("hl", { series: [{ vals: hl, bars: true }], zero: true, sym: true, grey: n500,
      head: (j) => { const v = hl[j], far = v > 0 ? hlH[j] > 3 * (hlL[j] || 0.5) : hlL[j] > 3 * (hlH[j] || 0.5);
        return `<b>${sg(v)}</b>${word(v == null ? "" : v > 0 ? (far ? "Far more highs than lows" : "More highs than lows") : v < 0 ? (far ? "Far more lows than highs" : "More lows than highs") : "Even", v > 0 ? "up" : v < 0 ? "down" : "")}${trend(hl, j)}${day(j, `${f0(hlH[j])} highs / ${f0(hlL[j])} lows`)}`; } });
    make("ad", { series: [{ vals: adR, color: "#3b7dd8" }], grey: n500, refs: bs.ad === "line" ? [] : [1], ...(bs.ad === "line" ? {} : { lo: 0.5, hi: 1.5, ticks: [1.5, 1, 0.5], fmtT: (v) => v.toFixed(2) }),
      bands: bs.ad === "line" ? [] : [[1.25, 1.5, "bl"], [0.5, 0.75, "pk"]],
      head: (j) => `<b>${adR[j] == null ? "–" : bs.ad === "line" ? f0(adR[j]) : adR[j].toFixed(2)}</b>${word(bs.ad === "line" ? "advances − declines, running" : adR[j] == null ? "" : esc(lab(adR[j], B.config.ad_labels) || (adR[j] >= 1 ? "More risers" : "More fallers")), adR[j] >= 1.05 ? "up" : adR[j] <= 0.95 ? "down" : "")}${trend(adR, j)}`
        + day(j, bs.ad === "line" ? `${f0(tail(adv)[j])} up / ${f0(tail(dec)[j])} down` : `avg ${f0(advW[j] / Number(bs.ad))} up / ${f0(decW[j] / Number(bs.ad))} down`) });
    make("mv", bs.mv === "d" ? { series: [{ vals: mv, bars: true }], zero: true, sym: true, grey: n500,
        head: (j) => { const u = tail(up4)[j], d = tail(dn4)[j], r = d ? u / d : u ? 9 : 1; return `<b>${sg(mv[j])}</b>${word(r >= 2 ? "Heavy buying" : r >= 1.2 ? "More up 4%+" : r > 0.83 ? "Balanced" : r > 0.5 ? "More down 4%+" : "Heavy selling", r >= 1.2 ? "up" : r <= 0.83 ? "down" : "")}${trend(mv, j)}${day(j, `${f0(u)} up / ${f0(d)} down`)}`; } }
      : { series: [{ vals: mv, color: "#3b7dd8" }], grey: n500, refs: [1], bands: [[0, 1, "pk"]],
        head: (j) => `<b>${mv[j] == null ? "–" : mv[j].toFixed(2)}</b>${word(mv[j] == null ? "" : mv[j] >= 1 ? "More 4% gainers" : "More 4% losers", mv[j] >= 1 ? "up" : "down")}${trend(mv, j)}${day(j, `${bs.mv}-day ratio`)}` });
    make("lms", { series: lms.map((x) => ({ vals: x.vals, color: x.c })), zero: true, unit: "%", fmtT: (v) => (v > 0 ? "+" : "") + Math.round(v),
      head: (j) => { const lead = lms.slice().sort((a, b) => (b.vals[j] ?? -1e9) - (a.vals[j] ?? -1e9))[0];
        return `${word({ N50: "Large caps lead", MID150: "Mid caps lead", SML250: "Small caps lead" }[lead.l], "")}${lms.map((x) => `<span class="bx-lg"><i style="background:${x.c}"></i>${x.l} <b class="${x.vals[j] >= 0 ? "up" : "down"}">${x.vals[j] == null ? "–" : sg(x.vals[j], (v) => v.toFixed(1)) + "%"}</b></span>`).join("")}${day(j)}`; },
      tip: (j) => `<b>${esc(shortDay(days[j]))}</b>${lms.map((x) => `<div><span><i style="background:${x.c}"></i>${x.nm}</span><em class="${x.day[j] >= 0 ? "up" : "down"}">${x.day[j] == null ? "–" : sg(x.day[j], (v) => v.toFixed(1)) + "%"}</em></div>`).join("")}` });
    const heldPct = (j) => { let h = 0, f = 0; for (let k = Math.max(0, j - 4); k <= j; k++) { h += held[k] || 0; f += failed[k] || 0; } return h + f ? (100 * h) / (h + f) : null; };
    make("bo", { series: [{ vals: held.map((h, i) => (h == null || failed[i] == null ? null : h - failed[i])), bars: true }], zero: true, sym: true,
      head: (j) => `<span class="bx-chip">${f0(lastOf(full("held")))} held, ${f0(lastOf(full("failed")))} failed today · ${h5 + f5 ? Math.round((100 * h5) / (h5 + f5)) : "–"}% held this week</span>${day(j)}`,
      tip: (j) => `<b>${esc(shortDay(days[j]))}</b><div><span>Breakouts (held)</span><em class="up">${f0(held[j])}</em></div><div><span>Breakdowns (failed)</span><em class="down">${f0(failed[j])}</em></div>`
        + `<div><span>Net</span><em class="${(held[j] || 0) - (failed[j] || 0) >= 0 ? "up" : "down"}">${held[j] == null ? "–" : sg(held[j] - failed[j])}</em></div><div><span>New breakouts that day</span><em>${f0(bouts[j])}</em></div>`
        + `<div><span>Held, 5-session avg</span><em>${heldPct(j) == null ? "–" : heldPct(j).toFixed(1) + "%"}</em></div>` });

    // ---- one shared crosshair
    const tip = $("#bxTip");
    const tips = CH.filter((c) => c.o.tip).map((c) => { const t = document.createElement("div"); t.className = "bx-ct"; t.hidden = true; c.el.parentElement.appendChild(t); return { c, t }; });
    let cur = null;
    const sync = (i) => {
      const atEnd = i == null, j = atEnd ? N - 1 : i;
      if (i === cur && !atEnd) return; cur = i;
      for (const c of CH) {
        const g = c.el.querySelector(".bx-hv");
        if (g) {
          g.style.opacity = atEnd ? 0 : 1; g.style.transform = `translateX(${c.X(j).toFixed(1)}px)`;
          g.querySelectorAll(".bx-dot").forEach((d) => { const se = c.o.series.filter((x) => !x.bars)[Number(d.dataset.k)], v = se.vals[j]; d.style.display = v == null ? "none" : ""; if (v != null) d.style.cy = `${c.Y(v).toFixed(1)}px`; });
        }
        const sv = c.el.querySelector("svg"); if (sv) sv.classList.toggle("hov", !atEnd);
        c.el.querySelectorAll(".bx-b.on").forEach((b) => b.classList.remove("on"));
        if (!atEnd) c.el.querySelectorAll(`.bx-b[data-i="${j}"]`).forEach((b) => b.classList.add("on"));
        $("#bv-" + c.id).innerHTML = c.o.head(j);
      }
      for (const { c, t } of tips) {
        if (atEnd) { t.hidden = true; continue; }
        t.innerHTML = c.o.tip(j); t.hidden = false;
        const x = c.X(j), w = t.offsetWidth, box = c.el.clientWidth;
        t.style.transform = `translate(${(x + 14 + w > box ? x - w - 14 : x + 14).toFixed(0)}px, 0)`;
      }
    };
    sync(null);
    view.querySelectorAll(".bx-svg").forEach((el) => {
      const c = CH.find((x) => x.el === el);
      el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(), x = e.clientX - r.left; sync(Math.max(0, Math.min(N - 1, Math.round(((x - PL) / (c.W - PL - PR)) * (N - 1))))); });
      el.addEventListener("pointerleave", () => sync(null));
    });
    // little explanation cards on titles and the reading rows
    view.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-tip]"); if (!t || !t.dataset.tip) { tip.hidden = true; return; }
      tip.textContent = t.dataset.tip; tip.hidden = false;
      const b = t.getBoundingClientRect(), w = tip.offsetWidth;
      tip.style.transform = `translate(${Math.max(8, Math.min(innerWidth - w - 8, b.left)).toFixed(0)}px, ${(b.bottom + 8).toFixed(0)}px)`;
    });
    view.addEventListener("pointerleave", () => { tip.hidden = true; });
    // options
    const on = (name, fn) => { const g = $(`[data-seg=${name}]`); if (g) g.onclick = (e) => { const b = e.target.closest("button"); if (b && !b.classList.contains("on")) { fn(b.dataset.v); saveB(); renderBreadth(); } }; };
    on("brange", (v) => { bs.range = v; }); on("bhl", (v) => { bs.hl = v; });
    on("bpart", (v) => { bs.part = v; }); on("bad", (v) => { bs.ad = v; }); on("bmv", (v) => { bs.mv = v; });
    const dd = view.querySelector(".bx-dd");
    dd.onclick = (e) => {
      e.stopPropagation();
      const o = e.target.closest(".hm-menu button");
      if (!o) { const open = !dd.classList.contains("open"); dd.classList.toggle("open", open); dd.querySelector(".hm-menu").hidden = !open; return; }
      if (o.dataset.v !== bs.uni) { bs.uni = o.dataset.v; saveB(); renderBreadth(); }
    };
    view.onclick = () => { dd.classList.remove("open"); dd.querySelector(".hm-menu").hidden = true; };
    if (bxResize) window.removeEventListener("resize", bxResize);
    let tmr = null;
    bxResize = () => { clearTimeout(tmr); tmr = setTimeout(() => { if (routeName() !== "breadth" || !document.body.contains(CH[0].el)) { window.removeEventListener("resize", bxResize); return; } CH.forEach((c) => draw(c, false)); cur = undefined; sync(null); }, 120); };
    window.addEventListener("resize", bxResize);
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
        + `<td class="l sticky name"><div class="nm">${logo(r)}<div><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></div></div></td><td class="num">${SD.fmtPrice(r.close)}</td>`
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
          <div class="g-h"><b class="wl">${logo(r)}${esc(r.symbol)}</b>${pct(r.chg_1d)}<span class="g-px num">${SD.fmtPrice(r.close)}</span></div>
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

  /** column drawer. o (optional, Leaders page): { get, set, def, extra: [[id, label]], name } - its own column list;
      default = the Stocks / Scanners list (state.stocks.cols, saved in sd-stocks) */
  function columnSettings(done, o) {
    const st = state.stocks;
    o = o || { get: () => st.cols, set: (v) => { st.cols = v; store.set("sd-stocks", { ...store.get("sd-stocks", {}), cols: v }); }, def: SD.DEFAULT_COLUMNS, extra: [] };
    const lab = (c) => ((o.extra || []).find((x) => x[0] === c) || [])[1] || (SD.COLUMNS[c] ? SD.COLUMNS[c].label : c);
    const cats = (o.extra && o.extra.length ? [[o.name || "This page", o.extra]] : []).concat(SD.COLUMN_GROUPS);
    const m = document.createElement("div");
    m.className = "modal-bg drawer";
    const groups = () => cats.map(([g, cols]) => `<details ${g === cats[0][0] ? "open" : ""}><summary>${g} <small>${cols.filter(([id]) => o.get().includes(id)).length}/${cols.length}</small></summary>`
      + cols.map(([id, label]) => `<label class="f-row" data-t="${esc(label.toLowerCase())}"><input type="checkbox" value="${id}" ${o.get().includes(id) ? "checked" : ""}> ${esc(label)}</label>`).join("") + "</details>").join("");
    const mine = () => o.get().map((c, i) => `<div class="mine-row"><span>${esc(lab(c))}</span><span>`
      + `<button class="btn sm" data-up="${i}" type="button" aria-label="Move up">↑</button><button class="btn sm" data-down="${i}" type="button" aria-label="Move down">↓</button>`
      + `<button class="btn sm" data-rm="${c}" type="button" aria-label="Remove">✕</button></span></div>`).join("");
    m.innerHTML = `<div class="modal wide" role="dialog" aria-label="Column settings"><div class="modal-h"><b>Column settings</b>
      <small class="muted cs-saved">✓ Changes saved automatically</small><button class="icon-btn" data-x type="button" aria-label="Close">✕</button></div><div class="modal-b cols-grid">
      <div><h4>Your columns <small id="nCols">${o.get().length}</small> <button class="btn sm" id="colReset" type="button">Reset</button></h4><div id="mine">${mine()}</div>
      <p class="muted small">Changes show at once and are saved in this browser. Make the list wider to see more of them.</p></div>
      <div><h4>Add columns</h4><input type="search" id="colQ" placeholder="Find a column, e.g. RSI" aria-label="Search columns"><div id="colGroups">${groups()}</div></div></div></div>`;
    document.body.appendChild(m);
    const refresh = () => {
      m.querySelector("#mine").innerHTML = mine();
      m.querySelector("#nCols").textContent = o.get().length;
      m.querySelectorAll("#colGroups input").forEach((i) => { i.checked = o.get().includes(i.value); });
      m.querySelectorAll("#colGroups details").forEach((d, k) => { const sm = d.querySelector("summary small"); if (sm) sm.textContent = `${cats[k][1].filter(([id]) => o.get().includes(id)).length}/${cats[k][1].length}`; });
      done();
    };
    m.addEventListener("change", (e) => {
      if (!e.target.matches("#colGroups input")) return;
      const v = e.target.value, cur = o.get();
      o.set(e.target.checked ? [...cur.filter((c) => c !== v), v] : cur.filter((c) => c !== v));
      refresh();
    });
    const shut = () => { m.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    document.addEventListener("keydown", onKey);
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-x]")) return shut();
      const t = e.target.closest("button"); if (!t) return;
      const cur = o.get().slice();
      if (t.id === "colReset") o.set(o.def.slice());
      else if (t.dataset.rm) o.set(cur.filter((c) => c !== t.dataset.rm));
      else if (t.dataset.up != null || t.dataset.down != null) {
        const i = Number(t.dataset.up != null ? t.dataset.up : t.dataset.down), j = t.dataset.up != null ? i - 1 : i + 1;
        if (j >= 0 && j < cur.length) { [cur[i], cur[j]] = [cur[j], cur[i]]; o.set(cur); }
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
      <div class="d-head"><h1>${isStock ? logo(r, true) : ""}${esc(r.name || r.symbol)}</h1><span class="muted">${esc(r.symbol)} · ${esc(r.exchange || "NSE")}${isStock ? (r.sector ? " · " + esc(r.sector) : "") + (r.basic_industry ? " › " + esc(r.basic_industry) : "") : " index"}</span>
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

  /* ------------------------------------------------------------------ leaders (Phase N11; new look 12-Nov-2026): top stocks by our leader score
     Like the reference video (Viraj 12-Nov): the scanner workspace - "Top Leaders" list grouped by theme / industry with
     a count per group, a chart beside it, a divider to drag (a wider list shows more columns, the Catalyst first), a
     sort menu (stocks + groups), the column drawer, search; rows glide to their new place when the order changes. */
  const LD_EXTRA = [["catalyst", "Catalyst (latest order / deal / fund raising filing)"], ["score", "Leader score"]];
  const LD_DEF = ["catalyst", "chg_1d", "ret_1w", "rs_rating", "mcap_cr", "vs_sector_1m"];
  const LD_SHORT = { catalyst: "Catalyst", score: "Score", chg_1d: "1D %", ret_1w: "1W %", ret_1m: "1M %", ret_3m: "3M %", ret_6m: "6M %", rs_rating: "RS",
    mcap_cr: "Mcap", vs_sector_1m: "vs Sect", from_hi52: "52W hi", turnover_cr: "Turnover", rvol: "RVol" };
  const LD_SORTS = [["score", "Leader score", "desc"], ["az", "A - Z", "asc"], ["close", "Price", "desc"], ["turnover_cr", "Price × Volume", "desc"],
    ["mcap_cr", "Market cap", "desc"], ["rs_rating", "RS rating", "desc"], ["from_hi52", "From 52W high", "desc"], ["perf", "Performance", "desc"]];
  const LD_PERF = [["chg_1d", "1D %"], ["ret_1w", "1W %"], ["ret_1m", "1M %"], ["ret_3m", "3M %"]];
  const LD_GSORT = [["score", "Leader score"], ["az", "Name A → Z"], ["za", "Name Z → A"], ["most", "Most stocks"], ["few", "Fewest stocks"]];
  const LD_BY = [["theme", "Theme"], ["industry", "Industry"], ["sector", "Sector"]];
  const LD_RULE = "Leader score (0-100, our own rule): 40 % RS rating, 20 % nearness to the 52-week high (0 % = full, -25 % or lower = none), 15 % trend (close > 50 > 150 > 200-day average, rising 200-day), 15 % industry rank, 10 % latest results (EPS and sales growth). Only stocks with enough daily turnover and without 2 % / 5 % price bands.";
  const shortD = (iso) => { const t = new Date(iso + "T00:00:00"); return `${t.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getMonth()]}`; };

  async function renderLeaders() {
    if (!state.screen) view.innerHTML = SKEL("Loading leaders");
    try {
      await loadScreen();
      if (!state.catalysts) state.catalysts = await getJSON("data/catalysts.json").catch(() => ({}));
    } catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "leaders") return;
    const ls = Object.assign({ by: "theme", top: 150, minTurn: 5, sort: "score", dir: "desc", perf: "chg_1d", gsort: "score", cols: LD_DEF.slice(), listW: 330, q: "", open: {} },
      store.get("sd-leaders", {}));
    if (!Array.isArray(ls.cols)) ls.cols = LD_DEF.slice();
    ls.cols = ls.cols.filter((c) => c === "catalyst" || c === "score" || SD.COLUMNS[c]);
    const save = () => store.set("sd-leaders", ls);
    const nInd = new Set(state.screen.map((r) => r.industry_rank).filter((x) => x != null)).size || 100;
    const pool = state.screen.filter((r) => !r.stale && (r.turnover_avg20_cr ?? 0) >= ls.minTurn && !["2", "5"].includes(String(r.price_band)));
    const scored = pool.map((r) => ({ r, s: SD.leaderScore(r, nInd) })).filter((x) => x.s != null).sort((a, b) => b.s - a.s);
    const top = scored.slice(0, ls.top);
    const keyOf = (r) => (ls.by === "theme" ? r.theme || r.basic_industry || "Other" : ls.by === "industry" ? r.basic_industry || r.industry || "Other" : r.sector || "Other");
    const isWide = wide();
    if (state.ldStock && !top.some((x) => x.r.key === state.ldStock)) state.ldStock = null;
    if (!state.ldStock && isWide && top.length) state.ldStock = top[0].r.key;
    const I = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    view.innerHTML = `<div class="ws-main list ldx ${isWide ? "wide" : ""}" id="ldMain" style="--list-w:${ls.listW}px">
      <section class="results ld-res"><div class="res-h"><b>Top Leaders</b><span class="pk-i" title="${esc(LD_RULE)}">i</span><span class="res-c"><span class="count" id="ldN"></span></span>
          <button class="icon-btn sm ${ls.q ? "on" : ""}" id="ldQB" type="button" title="Search">${ICON.filter}</button>
          <div class="menu-wrap"><button class="icon-btn sm" id="ldSB" type="button" title="Sort">${ICON.sort}</button><div class="menu right ld-sm" id="ldSM" hidden></div></div>
          <button class="icon-btn sm" id="ldCB" type="button" title="Columns">${ICON.cols}</button></div>
        <div class="ld-q" ${ls.q ? "" : "hidden"}><input type="search" id="ldQ" placeholder="Search leaders" value="${esc(ls.q)}" autocomplete="off"></div>
        <div class="res-list" id="ldL"></div></section>
      <div class="res-drag" id="ldDrag" role="separator" aria-orientation="vertical" title="Drag to make the list wider (more columns)"></div>
      <div class="chart-pane" id="ldPane"><p class="empty">Select a stock to chart it.</p></div></div>`;
    const list = $("#ldL"), main = $("#ldMain");

    // --- the list
    const valOf = (x, k) => (k === "score" ? x.s : k === "az" || k === "symbol" ? x.r.symbol : k === "perf" ? x.r[ls.perf] : k === "catalyst" ? (state.catalysts[x.r.symbol] || [""])[0] : x.r[k]);
    const cmp = (k, dir) => (a, b) => {
      const va = valOf(a, k), vb = valOf(b, k);
      if (typeof va === "string" || typeof vb === "string") return String(va ?? "").localeCompare(String(vb ?? "")) * (dir === "asc" ? 1 : -1);
      return ((va ?? -Infinity) - (vb ?? -Infinity)) * (dir === "asc" ? 1 : -1) || b.s - a.s;
    };
    const fitCols = () => {
      if (!isWide) return ls.cols;
      let w = list.clientWidth - 236; const out = [];
      for (const c of ls.cols) { const need = c === "catalyst" ? 340 : 84; if (w < need) break; out.push(c); w -= need; }
      return out;
    };
    let shownCols = [], rowsNow = [];
    const cell = (x, c) => {
      const r = x.r;
      if (c === "catalyst") { const k = state.catalysts[r.symbol]; return `<td class="l ld-cat">${k ? `<span class="ld-cd">${esc(shortD(k[0]))}</span>${esc(k[2])}` : '<span class="muted">—</span>'}</td>`; }
      if (c === "score") return `<td class="num"><span class="ld-score" style="--s:${x.s}">${x.s}</span></td>`;
      if (c === "rs_rating") return `<td class="num ld-rs">${r.rs_rating ?? "–"}</td>`;
      if (c === "mcap_cr") return `<td class="num">${finNum(r.mcap_cr)}</td>`;
      return `<td class="${SD.COLUMNS[c] && SD.COLUMNS[c].fmt === "text" ? "l" : "num"}">${cellHTML(r, c)}</td>`;
    };
    const flipFrom = () => { const m = new Map(); list.querySelectorAll("tr[data-f]").forEach((tr) => m.set(tr.dataset.f, tr.getBoundingClientRect().top)); return m; };
    const flipTo = (old, newCols) => {
      const lb = list.getBoundingClientRect();
      list.querySelectorAll("tr[data-f]").forEach((tr) => {
        const b = tr.getBoundingClientRect(); if (b.bottom < lb.top - 200 || b.top > lb.bottom + 200) return;
        const o = old.get(tr.dataset.f);
        if (o == null) tr.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
        else if (Math.abs(o - b.top) > 1) tr.animate([{ transform: `translateY(${o - b.top}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
      if (newCols.length) list.querySelectorAll(newCols.map((i) => `tr > :nth-child(${i + 4})`).join(",")).forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }));
    };
    const draw = (anim) => {
      const old = anim ? flipFrom() : null;
      const q = ls.q.trim().toLowerCase();
      const items = q ? top.filter(({ r }) => r.symbol.toLowerCase().includes(q) || String(r.name || "").toLowerCase().includes(q) || keyOf(r).toLowerCase().includes(q)) : top;
      const groups = new Map();
      for (const x of items) { const k = keyOf(x.r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      // group strength = sum of its best 3 leader scores (a group with several leaders beats a lone one)
      const gl = [...groups].map(([k, l]) => ({ k, l: l.sort(cmp(ls.sort, ls.dir)), avg: l.map((x) => x.s).sort((p, q) => q - p).slice(0, 3).reduce((a, v) => a + v, 0) }));
      const gs = { score: (a, b) => b.avg - a.avg, az: (a, b) => a.k.localeCompare(b.k), za: (a, b) => b.k.localeCompare(a.k), most: (a, b) => b.l.length - a.l.length || b.avg - a.avg, few: (a, b) => a.l.length - b.l.length || b.avg - a.avg }[ls.gsort] || ((a, b) => b.avg - a.avg);
      gl.sort(gs);
      const cols = fitCols(), added = cols.map((c, i) => (shownCols.includes(c) ? -1 : i)).filter((i) => i >= 0 && shownCols.length);
      shownCols = cols;
      rowsNow = gl.flatMap((g) => (ls.open[g.k] === false ? [] : g.l)).map((x) => x.r);
      const sortK = ls.sort === "az" ? "symbol" : ls.sort;
      const arrow = (k) => (sortK === k || (k === "symbol" && ls.sort === "az") ? `<i class="ld-ar">${ls.dir === "asc" ? "↑" : "↓"}</i>` : '<i class="ld-ar off">↕</i>');
      const head = `<tr><th class="l ck"><input type="checkbox" id="ldAll" aria-label="Select all"></th><th class="l sticky" data-col="symbol">${arrow("symbol")}Symbol</th><th data-col="close">${arrow("close")}LTP</th>`
        + cols.map((c) => `<th data-col="${c}" class="${c === "catalyst" ? "l ld-cath" : ""}">${c === "catalyst" ? "" : arrow(c)}${esc(LD_SHORT[c] || (SD.COLUMNS[c] ? SD.COLUMNS[c].label : c))}</th>`).join("") + "</tr>";
      const n = 3 + cols.length;
      const body = gl.map((g) => {
        const shut = ls.open[g.k] === false;
        return `<tr class="ld-g${shut ? " shut" : ""}" data-f="g:${esc(g.k)}" data-g="${esc(g.k)}"><td colspan="${n}"><span class="ld-gt"><i class="ld-dot"></i>${esc(g.k)}<i class="ld-chev">▾</i></span><span class="ld-gn">${g.l.length}</span></td></tr>`
          + (shut ? "" : g.l.map((x) => `<tr class="ld-r${state.ldStock === x.r.key ? " cur" : ""}" data-f="${esc(x.r.key)}" data-key="${esc(x.r.key)}"><td class="l ck"><input type="checkbox" data-sel="${esc(x.r.key)}" ${state.selected.has(x.r.key) ? "checked" : ""} aria-label="Select ${esc(x.r.symbol)}"></td>`
            + `<td class="l sticky name"><div class="nm">${logo(x.r)}<b>${esc(x.r.symbol)}</b><button type="button" class="ld-w${state.watch.has(x.r.key) ? " on" : ""}" data-w="${esc(x.r.key)}" title="${state.watch.has(x.r.key) ? "In your watchlist" : "Add to watchlist"}">${state.watch.has(x.r.key) ? "★" : "+"}</button></div></td>`
            + `<td class="num">${SD.fmtPrice(x.r.close)}</td>${cols.map((c) => cell(x, c)).join("")}</tr>`).join(""));
      }).join("");
      list.innerHTML = items.length ? `<div class="table-wrap"><table class="ld-t"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : '<div class="empty">No leader matches.</div>';
      $("#ldN").textContent = q ? `${items.length} / ${top.length}` : String(top.length);
      footer();
      if (old) flipTo(old, added);
    };
    const footer = () => {
      $("#stPage").innerHTML = `<button class="st-btn" id="ldCopy" type="button" title="Copy symbols as NSE:SYMBOL (TradingView watchlist)">Copy</button><button class="st-btn" id="ldCsv" type="button">CSV</button>`
        + `<span>Top Leaders · ${state.selected.size ? [...state.selected].filter((k) => top.some((x) => x.r.key === k)).length : 0} of ${top.length} selected</span>`
        + `<span class="st-n">${top.length} of ${pool.length.toLocaleString("en-IN")} stocks · top ${ls.top} by leader score · ₹${ls.minTurn} Cr+ turnover · excl. 2% / 5% bands · ${state.screen.length.toLocaleString("en-IN")} scanned</span>`;
      const picked = () => { const s = top.filter((x) => state.selected.has(x.r.key)).map((x) => x.r); return s.length ? s : rowsNow; };
      $("#ldCopy").onclick = async () => { const l = picked(), t = l.map((r) => "NSE:" + r.symbol).join(","); try { await navigator.clipboard.writeText(t); $("#ldCopy").textContent = `Copied ${l.length}`; } catch (e) { prompt("Copy these symbols:", t); } setTimeout(() => { const b = $("#ldCopy"); if (b) b.textContent = "Copy"; }, 2000); };
      $("#ldCsv").onclick = () => { const blob = new Blob([SD.toCSV(picked(), ["symbol", "name", "close", ...ls.cols.filter((c) => SD.COLUMNS[c])])], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `leaders-${state.screenDate}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    };
    const fitH = () => { if (isWide) main.style.height = Math.max(480, innerHeight - main.getBoundingClientRect().top - 46) + "px"; };
    fitH();
    draw(false);

    // --- chart beside the list
    const openRow = (key, scroll) => {
      const r = state.screenByKey.get(key); if (!r) return;
      if (!isWide) { location.hash = "#/i/s/" + r.id; return; }
      state.ldStock = key;
      list.querySelectorAll("tr.cur").forEach((x) => x.classList.remove("cur"));
      const tr = list.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
      if (tr) { tr.classList.add("cur"); if (scroll) tr.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      const pane = $("#ldPane");
      pane.classList.remove("ld-swap"); void pane.offsetWidth; pane.classList.add("ld-swap");
      SDChart.open(pane, r, { kind: "s" });
    };
    if (isWide && state.ldStock) openRow(state.ldStock, true);
    list.onclick = (e) => {
      const th = e.target.closest("th[data-col]");
      if (th) { const c = th.dataset.col === "symbol" ? "az" : th.dataset.col; ls.dir = ls.sort === c ? (ls.dir === "asc" ? "desc" : "asc") : c === "az" ? "asc" : "desc"; ls.sort = c; save(); return draw(true); }
      if (e.target.id === "ldAll") { rowsNow.forEach((r) => (e.target.checked ? state.selected.add(r.key) : state.selected.delete(r.key))); list.querySelectorAll("[data-sel]").forEach((i) => { i.checked = e.target.checked; }); return footer(); }
      const sel = e.target.closest("[data-sel]");
      if (sel) { if (sel.checked) state.selected.add(sel.dataset.sel); else state.selected.delete(sel.dataset.sel); return footer(); }
      const w = e.target.closest("[data-w]");
      if (w) { toggleWatch(w.dataset.w); const on = state.watch.has(w.dataset.w); w.classList.toggle("on", on); w.textContent = on ? "★" : "+"; w.title = on ? "In your watchlist" : "Add to watchlist"; return; }
      const g = e.target.closest("tr.ld-g");
      if (g) { const k = g.dataset.g; ls.open[k] = ls.open[k] === false; save(); return draw(true); }
      const tr = e.target.closest("tr[data-key]");
      if (tr) openRow(tr.dataset.key, false);
    };
    view.onkeydown = (e) => {
      if (!isWide || !state.ldStock || !["ArrowDown", "ArrowUp"].includes(e.key) || e.target.matches("input, select, textarea")) return;
      const i = rowsNow.findIndex((r) => r.key === state.ldStock), j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (rowsNow[j]) { e.preventDefault(); openRow(rowsNow[j].key, true); }
    };

    // --- search, sort menu, columns
    $("#ldQB").onclick = () => { const b = view.querySelector(".ld-q"); b.hidden = !b.hidden; $("#ldQB").classList.toggle("on", !b.hidden || !!ls.q); if (!b.hidden) $("#ldQ").focus(); };
    $("#ldQ").oninput = (e) => { ls.q = e.target.value; save(); draw(true); };
    const sm = $("#ldSM");
    const menuHTML = () => `<div class="ld-mh"><b>Sort by</b><button type="button" data-reset title="Back to leader score">↺</button></div>`
      + LD_SORTS.map(([k, l]) => `<div class="ld-mi${ls.sort === k ? " on" : ""}"><button type="button" data-s="${k}">${l}</button>${k === "perf" ? `<select id="ldPerf" aria-label="Performance period">${LD_PERF.map(([p, pl]) => `<option value="${p}" ${p === ls.perf ? "selected" : ""}>${pl}</option>`).join("")}</select>` : ""}${ls.sort === k ? `<i>${ls.dir === "asc" ? "↑" : "↓"}</i>` : ""}</div>`).join("")
      + `<small class="menu-h">SORT GROUPS BY</small>` + LD_GSORT.map(([k, l]) => `<div class="ld-mi${ls.gsort === k ? " on" : ""}"><button type="button" data-gs="${k}">${l}</button>${ls.gsort === k ? "<i>✓</i>" : ""}</div>`).join("")
      + `<small class="menu-h">GROUP BY</small><div class="ld-seg">${LD_BY.map(([k, l]) => `<button type="button" data-by="${k}" class="${ls.by === k ? "on" : ""}">${l}</button>`).join("")}</div>`
      + `<small class="menu-h">SHOW</small><div class="ld-sel"><select id="ldTop" aria-label="How many">${[50, 100, 150, 250].map((n) => `<option value="${n}" ${n === ls.top ? "selected" : ""}>Top ${n}</option>`).join("")}</select>`
      + `<select id="ldTurn" aria-label="Turnover">${[1, 5, 10, 25].map((n) => `<option value="${n}" ${n === ls.minTurn ? "selected" : ""}>₹${n} Cr+ turnover</option>`).join("")}</select></div>`;
    $("#ldSB").onclick = (e) => { e.stopPropagation(); const open = sm.hidden; view.querySelectorAll(".menu").forEach((x) => { x.hidden = true; }); if (open) { sm.innerHTML = menuHTML(); sm.hidden = false; } $("#ldSB").classList.toggle("on", open); };
    sm.onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.reset != null) { ls.sort = "score"; ls.dir = "desc"; ls.gsort = "score"; }
      else if (b.dataset.s) { const s = LD_SORTS.find((x) => x[0] === b.dataset.s); if (ls.sort === s[0]) ls.dir = ls.dir === "asc" ? "desc" : "asc"; else { ls.sort = s[0]; ls.dir = s[2]; } }
      else if (b.dataset.gs) ls.gsort = b.dataset.gs;
      else if (b.dataset.by) { ls.by = b.dataset.by; ls.open = {}; }
      else return;
      save(); sm.innerHTML = menuHTML(); draw(true);
    };
    sm.onchange = (e) => {
      if (e.target.id === "ldPerf") { ls.perf = e.target.value; ls.sort = "perf"; ls.dir = "desc"; save(); sm.innerHTML = menuHTML(); draw(true); }
      else if (e.target.id === "ldTop" || e.target.id === "ldTurn") { ls[e.target.id === "ldTop" ? "top" : "minTurn"] = Number(e.target.value); save(); renderLeaders(); }
    };
    view.onclick = () => { sm.hidden = true; const b = $("#ldSB"); if (b) b.classList.remove("on"); };
    $("#ldCB").onclick = () => columnSettings(() => { save(); draw(true); },
      { get: () => ls.cols, set: (v) => { ls.cols = v; }, def: LD_DEF, extra: LD_EXTRA, name: "Leaders" });

    // --- drag the divider: a wider list shows more columns (they fade in)
    const drag = $("#ldDrag");
    drag.onpointerdown = (e) => {
      if (!isWide) return;
      e.preventDefault(); drag.setPointerCapture(e.pointerId); main.classList.add("dragging");
      const left = main.getBoundingClientRect().left, max = main.clientWidth - 380;
      drag.onpointermove = (ev) => {
        ls.listW = Math.round(Math.min(Math.max(ev.clientX - left, 260), max));
        main.style.setProperty("--list-w", ls.listW + "px");
        if (fitCols().join() !== shownCols.join()) draw(true);
      };
      drag.onpointerup = () => { drag.onpointermove = null; main.classList.remove("dragging"); save(); window.dispatchEvent(new Event("resize")); };
    };
    drag.ondblclick = () => { ls.listW = 330; save(); main.style.setProperty("--list-w", "330px"); draw(true); window.dispatchEvent(new Event("resize")); };
    if (state.ldResize) window.removeEventListener("resize", state.ldResize);
    state.ldResize = () => { if (routeName() !== "leaders" || !document.body.contains(main)) { window.removeEventListener("resize", state.ldResize); return; } fitH(); if (fitCols().join() !== shownCols.join()) draw(false); };
    window.addEventListener("resize", state.ldResize);
  }

  /* ------------------------------------------------------------------ RRG (Phase N9; new look 12-Nov-2026): strength x momentum with tails
     Like the reference video (Viraj 12-Nov): four soft quadrants, curved tails that fade into the past, quadrant chips
     that hide / show, Tail 5 | 10, Sectors | Industries | Themes, Daily | Weekly, a benchmark menu, a list grouped by
     quadrant with heading arrows. Hover = trace the path (others fade, dated start), click = pin. Changing any option
     moves every dot along to its new place; the first view draws the tails in. */
  const RR_Q = ["Leading", "Improving", "Weakening", "Lagging"], RR_K = { Leading: "lead", Improving: "imp", Weakening: "weak", Lagging: "lag" };
  const quadOf = (s, m) => (s >= 100 ? (m >= 100 ? "Leading" : "Weakening") : (m >= 100 ? "Improving" : "Lagging"));
  const ARROWS = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  /** direction of the last step: arrow + a short word (right-up = gaining, left-down = losing) */
  const headingOf = (pts) => {
    if (pts.length < 2) return { arrow: "·", text: "–", cls: "" };
    const [a, b] = pts.slice(-2), dx = b[0] - a[0], dy = b[1] - a[1];
    const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const [text, cls] = dx >= 0 && dy >= 0 ? ["Gaining", "hd-up"] : dx < 0 && dy < 0 ? ["Losing", "hd-dn"] : dx >= 0 ? ["Momentum fading", "hd-mix"] : ["Momentum building", "hd-mix2"];
    return { arrow: ARROWS[k], text, cls };
  };
  const RR_SHORT = { "Automobile and Auto Components": "Auto", "Financial Services": "Fin Services", "Consumer Durables": "Cons Durables",
    "Fast Moving Consumer Goods": "FMCG", "Media, Entertainment & Publication": "Media", "Media Entertainment & Publication": "Media",
    "Information Technology": "IT", "Oil, Gas & Consumable Fuels": "Oil & Gas", "Consumer Services": "Cons Services", "Capital Goods": "Cap Goods",
    "Metals & Mining": "Metals", "Construction Materials": "Constr Matl", "Forest Materials": "Forest Matl", "Telecommunication": "Telecom" };
  const RR_BENCH = [["mkt", "Equal-weight market"], ["NIFTY_50", "Nifty 50"], ["NIFTY_500", "Nifty 500"], ["NIFTY_SMALLCAP_250", "Nifty Smallcap 250"], ["NIFTY_MIDSMALLCAP_400", "Nifty MidSmallcap 400"]];
  let rrFrom = null, rrResize = null, rrAnim = 0;
  /** a smooth curve through the points (Catmull-Rom as cubic Bezier) */
  const rrPath = (P) => {
    if (!P.length) return "";
    const f = (v) => v.toFixed(1);
    let d = `M${f(P[0][0])},${f(P[0][1])}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d;
  };

  async function renderRRG() {
    if (!state.groups) view.innerHTML = SKEL("Loading the rotation graph");
    try { if (!state.groups) state.groups = await getJSON("data/group_ranks.json"); }
    catch (e) { view.innerHTML = `<p class="empty">Groups are not built yet (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "rrg") return;
    const rs = Object.assign({ level: "sector", tf: "d", tail: 10, bench: "mkt", top: true, pins: {}, hide: [] }, store.get("sd-rrg", {}));
    const save = () => store.set("sd-rrg", rs);
    const G = state.groups, days = (G.tail_days || {})[rs.tf] || [];
    const hasTails = (G.levels.sector || []).some((g) => g.tails);
    if (!hasTails) { rs.tf = "d"; rs.bench = "mkt"; }
    const benches = RR_BENCH.filter(([k]) => k === "mkt" || (G.levels.sector || []).some((g) => g.tails && g.tails[k]));
    if (!benches.some(([k]) => k === rs.bench)) rs.bench = "mkt";
    if (![5, 10].includes(rs.tail)) rs.tail = 10;
    const tailN = rs.tail, hide = new Set(rs.hide || []);
    let groups = (G.levels[rs.level] || []).filter((g) => !g.small && g.strength != null && !(rs.level === "sector" && g.name === "Unclassified"));
    const allN = groups.length;
    if (rs.level !== "sector" && rs.top) groups = groups.slice().sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 20);
    const ptsOf = (g) => {
      const t = g.tails && (g.tails[rs.bench] || g.tails.mkt);
      if (t) { const s = t.s[rs.tf], m = t.m[rs.tf]; return s.map((x, i) => [x, m[i]]).filter(([a, b]) => a != null && b != null).slice(-tailN); }
      return (g.tail || []).filter(([a, b]) => a != null && b != null).slice(-tailN);
    };
    const all = groups.map((g) => { const p = ptsOf(g); const last = p[p.length - 1]; return last ? { g, name: g.name, p, q: quadOf(last[0], last[1]), h: headingOf(p) } : null; }).filter(Boolean);
    const byQ = (q) => all.filter((it) => it.q === q);
    const items = all.filter((it) => !hide.has(it.q));
    const pins = new Set(rs.pins[rs.level] || []);
    const unit = rs.tf === "w" ? "week" : "day";
    const lvlName = { sector: "sectors", industry: "industries", theme: "themes" }[rs.level], lvl1 = lvlName === "industries" ? "industry" : lvlName.slice(0, -1);
    const benchName = rs.bench === "mkt" ? "the equal-weight market" : (benches.find((b) => b[0] === rs.bench) || ["", rs.bench])[1];
    const label = (n) => (rs.level === "sector" && RR_SHORT[n]) || (n.length > 20 ? n.slice(0, 19) + "…" : n);
    const seg2 = (name, opts, val) => `<div class="rr-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(val) ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const side = RR_Q.map((q) => {
      const list = byQ(q), hid = hide.has(q);
      return `<div class="rr-q ${RR_K[q]}${hid ? " off" : ""}"><div class="rr-qh"><i></i><b>${q}</b><span>${list.length}</span>${hid ? `<em>Hidden · <button type="button" data-show="${q}">Show</button></em>` : ""}</div>
        <div class="rr-l">${list.map((it) => `<button type="button" data-n="${esc(it.name)}" class="${pins.has(it.name) ? "pin" : ""}"><span>${esc(label(it.name))}</span><b class="${it.h.cls}">${it.h.arrow}</b></button>`).join("") || '<small>None</small>'}</div></div>`;
    }).join("");
    view.innerHTML = `<div class="rr">
      <div class="rr-bar"><div class="rr-chips">${RR_Q.map((q) => `<button type="button" class="rr-chip ${RR_K[q]}${hide.has(q) ? " off" : ""}" data-q="${q}" title="${hide.has(q) ? "Show" : "Hide"} ${q.toLowerCase()}"><i></i>${q} <b>${byQ(q).length}</b></button>`).join("")}</div>
        <div class="rr-tools"><span class="rr-tl">Tail</span>${seg2("rtail", [[5, "5"], [10, "10"]], tailN)}
          ${seg2("rlvl", [["sector", "Sectors"], ["industry", "Industries"], ["theme", "Themes"]], rs.level)}
          ${hasTails ? seg2("rtf", [["d", "Daily"], ["w", "Weekly"]], rs.tf) : ""}
          ${hasTails ? `<div class="hm-dd rr-dd" data-dd="bench"><button type="button" class="hm-ddb"><b>vs ${esc((benches.find((b) => b[0] === rs.bench) || benches[0])[1])}</b>${CHEV}</button>
            <div class="hm-menu" hidden>${benches.map(([k, l]) => `<button type="button" data-v="${k}" class="${k === rs.bench ? "on" : ""}">vs ${esc(l)}</button>`).join("")}</div></div>` : ""}</div></div>
      <div class="rr-main"><div class="rr-plot"><span class="rr-ym">Momentum →</span><div class="rr-chart" id="rChart"></div>
          <div class="rr-foot"><small>Hover a ${lvl1} to trace its path. Click to pin it.</small><span>Strength →</span></div></div>
        <aside class="rr-side"><div class="rr-sh"><small>${lvlName.toUpperCase()}</small>${rs.level !== "sector" ? seg2("rtop", [["1", "Top 20"], ["0", "All"]], rs.top ? "1" : "0") : ""}</div>${side}</aside></div>
      <div class="rr-card" id="rHov" hidden></div></div>`;
    $("#stPage").innerHTML = `<span>${rs.level !== "sector" && rs.top ? `${all.length} of ${allN}` : all.length} ${lvlName}</span><span class="st-n">${tailN} ${unit === "week" ? "weeks" : "sessions"} against ${esc(benchName)}</span><span class="st-n">data through ${esc(shortDay(G.data_date))}</span>`;

    // --- the chart: a model in data units, painted to the chart's pixel size (t = 0..1 for the move from the old model)
    const chart = $("#rChart"), hov = $("#rHov");
    const dom = (() => {
      let s0 = 100, s1 = 100, m0 = 100, m1 = 100;
      for (const it of items) for (const [s, m] of it.p) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); m0 = Math.min(m0, m); m1 = Math.max(m1, m); }
      const ps = Math.max((s1 - s0) * 0.08, 0.6), pm = Math.max((m1 - m0) * 0.1, 0.6);
      return [s0 - ps, s1 + ps, m0 - pm, m1 + pm];
    })();
    // drawn tails: inner points smoothed twice (1-2-1), the head stays exact (the card shows the real numbers)
    const soft = (p) => { let q = p; for (let r = 0; r < 2; r++) q = q.map((pt, k) => (k === 0 || k === q.length - 1 ? pt : [(q[k - 1][0] + 2 * pt[0] + q[k + 1][0]) / 4, (q[k - 1][1] + 2 * pt[1] + q[k + 1][1]) / 4])); return q; };
    const model = { dom, items: items.map((it) => ({ name: it.name, q: it.q, p: soft(it.p) })) };
    const from = rrFrom; rrFrom = null;
    const fromBy = new Map((from ? from.items : []).map((x) => [x.name, x]));
    let geo = [];   // pixel positions of the final paint, for hover
    const paint = (t) => {
      const W = chart.clientWidth, H = chart.clientHeight;
      if (!W || !H) return;
      const e = t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const L = (a, b) => a + (b - a) * e;
      const d = from ? model.dom.map((v, i) => L(from.dom[i], v)) : model.dom;
      const X = (s) => ((s - d[0]) / (d[1] - d[0])) * W, Y = (m) => H - ((m - d[2]) / (d[3] - d[2])) * H;
      const cx = Math.max(0, Math.min(W, X(100))), cy = Math.max(0, Math.min(H, Y(100)));
      let s = `<svg class="rr-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Relative rotation graph"><defs>`;
      const body = [];
      geo = [];
      model.items.forEach((it, k) => {
        const o = fromBy.get(it.name), n = it.p.length;
        const pts = it.p.map((pt, j) => {
          if (!o || e >= 1) return pt;
          const op = o.p[Math.round((j / Math.max(n - 1, 1)) * (o.p.length - 1))] || pt;
          return [L(op[0], pt[0]), L(op[1], pt[1])];
        });
        const P = pts.map(([a, b]) => [X(a), Y(b)]), head = P[n - 1], c = RR_K[it.q];
        s += `<linearGradient id="rrG${k}" gradientUnits="userSpaceOnUse" x1="${P[0][0].toFixed(1)}" y1="${P[0][1].toFixed(1)}" x2="${head[0].toFixed(1)}" y2="${head[1].toFixed(1)}"><stop offset="0" style="stop-color:var(--q-${c});stop-opacity:.05"/><stop offset="1" style="stop-color:var(--q-${c});stop-opacity:.95"/></linearGradient>`;
        const start = days.length >= n ? days[days.length - n] : "";
        const fade = o || !from ? "" : ` style="opacity:${e.toFixed(2)}"`;
        body.push(`<g class="r-g ${c}${pins.has(it.name) ? " pin" : ""}" data-n="${esc(it.name)}" style="--k:${k}"${fade}><path class="r-tail" d="${rrPath(P)}" stroke="url(#rrG${k})" pathLength="1"/>
          <g class="r-pts">${P.slice(0, -1).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4"/>`).join("")}${start ? `<text x="${P[0][0].toFixed(1)}" y="${(P[0][1] - 9).toFixed(1)}" class="r-date" text-anchor="middle">${esc(shortDay(start))}</text>` : ""}</g>
          <circle class="r-head" cx="${head[0].toFixed(1)}" cy="${head[1].toFixed(1)}" r="5"/><text class="r-lbl" x="${(head[0] + (head[0] > W - 90 ? -9 : 9)).toFixed(1)}" y="${(head[1] + 4).toFixed(1)}"${head[0] > W - 90 ? ' text-anchor="end"' : ""}>${esc(label(it.name))}</text></g>`);
        geo.push({ name: it.name, P });
      });
      s += `</defs><rect class="qf imp" x="0" y="0" width="${cx}" height="${cy}"/><rect class="qf lead" x="${cx}" y="0" width="${W - cx}" height="${cy}"/>
        <rect class="qf lag" x="0" y="${cy}" width="${cx}" height="${H - cy}"/><rect class="qf weak" x="${cx}" y="${cy}" width="${W - cx}" height="${H - cy}"/>
        <line class="qx" x1="${cx}" y1="0" x2="${cx}" y2="${H}"/><line class="qx" x1="0" y1="${cy}" x2="${W}" y2="${cy}"/>
        <text class="qt imp" x="12" y="22">Improving</text><text class="qt lead" x="${Math.min(cx + 12, W - 70)}" y="22">Leading</text>
        <text class="qt lag" x="12" y="${H - 12}">Lagging</text><text class="qt weak" x="${Math.min(cx + 12, W - 80)}" y="${H - 12}">Weakening</text>${body.join("")}</svg>`;
      chart.innerHTML = s;
    };
    const svgCls = (fn) => { const sv = chart.querySelector("svg"); if (sv) fn(sv); };
    cancelAnimationFrame(rrAnim);
    if (from) {
      const t0 = performance.now(), dur = 650;
      const step = (now) => { const t = Math.min(1, (now - t0) / dur); paint(t); if (t < 1) rrAnim = requestAnimationFrame(step); else applyMarks(); };
      paint(0); rrAnim = requestAnimationFrame(step);
    } else { paint(1); svgCls((sv) => sv.classList.add("intro")); }

    // --- hover / pin
    let hot = null;
    const applyMarks = () => svgCls((sv) => {
      sv.classList.toggle("focus", hot != null); sv.classList.toggle("pinned", pins.size > 0);
      sv.querySelectorAll(".r-g").forEach((g) => { g.classList.toggle("hot", g.dataset.n === hot); g.classList.toggle("pin", pins.has(g.dataset.n)); });
      view.querySelectorAll(".rr-l button").forEach((b) => b.classList.toggle("hot", b.dataset.n === hot));
    });
    const cardHTML = (name) => {
      const it = all.find((x) => x.name === name); if (!it) return "";
      const last = it.p[it.p.length - 1];
      let inQ = 0; for (let k = it.p.length - 1; k >= 0 && quadOf(it.p[k][0], it.p[k][1]) === it.q; k--) inQ++;
      const m5 = it.p.length > 5 ? last[1] - it.p[it.p.length - 6][1] : null;
      const row = (l, v, c = "") => `<span>${l}</span><b class="${c}">${v}</b>`;
      return `<div class="rr-ct"><b>${esc(it.name)}</b><span class="${RR_K[it.q]}">${it.q}</span></div><div class="rr-kv">
        ${row("RS-Ratio", finNum(last[0], 2))}${row("RS-Momentum", finNum(last[1], 2))}${row("Heading", `${it.h.arrow} ${esc(it.h.text)}`, it.h.cls)}
        ${row(`${unit === "week" ? "Weeks" : "Days"} in quadrant`, `${inQ}${inQ === it.p.length ? "+" : ""}`)}
        ${m5 != null ? row(`Momentum, 5 ${unit}s`, `${m5 > 0 ? "+" : m5 < 0 ? "−" : ""}${finNum(Math.abs(m5), 2)}`, m5 >= 0 ? "up" : "down") : ""}
        ${row("Stocks", it.g.n ?? "–")}</div>`;
    };
    const showCard = (name, x, y, left) => {
      const h = cardHTML(name); if (!h) return;
      if (hov.hidden || hov.dataset.n !== name) { hov.innerHTML = h; hov.dataset.n = name; }
      hov.hidden = false;
      const w = hov.offsetWidth, ht = hov.offsetHeight;
      let px = left ? x - w - 14 : x + 16, py = y + 16;
      if (px + w > innerWidth - 8) px = x - w - 14;
      if (py + ht > innerHeight - 8) py = y - ht - 12;
      hov.style.transform = `translate(${Math.max(8, px)}px, ${Math.max(8, py)}px)`;
    };
    const hideCard = () => { hov.hidden = true; hov.dataset.n = ""; };
    const nearest = (x, y) => {
      let best = null, bd = 24 * 24;
      for (const g of geo) for (let j = g.P.length - 1; j >= 0; j--) {
        const dx = g.P[j][0] - x, dy = g.P[j][1] - y, dd = dx * dx + dy * dy - (j === g.P.length - 1 ? 60 : 0);
        if (dd < bd) { bd = dd; best = g.name; }
      }
      return best;
    };
    chart.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const b = chart.getBoundingClientRect(), n = nearest(e.clientX - b.left, e.clientY - b.top);
      if (n !== hot) { hot = n; applyMarks(); }
      if (n) showCard(n, e.clientX, e.clientY); else hideCard();
      chart.style.cursor = n ? "pointer" : "";
    });
    chart.addEventListener("pointerleave", () => { hot = null; applyMarks(); hideCard(); });
    const togglePin = (n) => { if (pins.has(n)) pins.delete(n); else pins.add(n); rs.pins[rs.level] = [...pins]; save(); applyMarks(); view.querySelectorAll(".rr-l button").forEach((b) => b.classList.toggle("pin", pins.has(b.dataset.n))); };
    chart.addEventListener("click", () => { if (hot) togglePin(hot); });
    const sideEl = view.querySelector(".rr-side");
    sideEl.addEventListener("mouseover", (e) => { const b = e.target.closest(".rr-l button"); if (!b) return; if (hot !== b.dataset.n) { hot = b.dataset.n; applyMarks(); } const r = b.getBoundingClientRect(); showCard(hot, r.left, r.top - 10, true); });
    sideEl.addEventListener("mouseleave", () => { hot = null; applyMarks(); hideCard(); });

    // --- options: every change moves the dots from where they are now
    const again = () => { rrFrom = model; save(); renderRRG(); };
    sideEl.addEventListener("click", (e) => {
      const b = e.target.closest(".rr-l button"); if (b) { togglePin(b.dataset.n); return; }
      const sh = e.target.closest("[data-show]"); if (sh) { rs.hide = (rs.hide || []).filter((q) => q !== sh.dataset.show); again(); return; }
      const t = e.target.closest('[data-seg="rtop"] button'); if (t) { rs.top = t.dataset.v === "1"; again(); }
    });
    view.querySelector(".rr-chips").onclick = (e) => { const c = e.target.closest(".rr-chip"); if (!c) return; const q = c.dataset.q; rs.hide = hide.has(q) ? [...hide].filter((x) => x !== q) : [...hide, q]; again(); };
    view.querySelectorAll(".rr-tools [data-seg]").forEach((sg) => { sg.onclick = (e) => {
      const b = e.target.closest("button"); if (!b || b.classList.contains("on")) return;
      const v = b.dataset.v, k = sg.dataset.seg;
      if (k === "rtail") rs.tail = Number(v); else if (k === "rlvl") { rs.level = v; rrFrom = null; save(); renderRRG(); return; } else if (k === "rtf") rs.tf = v;
      again();
    }; });
    const dd = view.querySelector(".rr-dd");
    if (dd) dd.onclick = (e) => {
      e.stopPropagation();
      const o = e.target.closest(".hm-menu button");
      if (!o) { const open = !dd.classList.contains("open"); dd.classList.toggle("open", open); dd.querySelector(".hm-menu").hidden = !open; return; }
      dd.classList.remove("open"); dd.querySelector(".hm-menu").hidden = true;
      if (o.dataset.v !== rs.bench) { rs.bench = o.dataset.v; again(); }
    };
    view.onclick = () => { if (dd) { dd.classList.remove("open"); dd.querySelector(".hm-menu").hidden = true; } };
    if (rrResize) window.removeEventListener("resize", rrResize);
    let tmr = null;
    rrResize = () => { clearTimeout(tmr); tmr = setTimeout(() => { if (routeName() !== "rrg" || !document.body.contains(chart)) { window.removeEventListener("resize", rrResize); return; } paint(1); applyMarks(); }, 120); };
    window.addEventListener("resize", rrResize);
    if (pins.size) applyMarks();
  }

  /* ------------------------------------------------------------------ heatmap (Phase N7; new look 12-Nov-2026): treemap by sector
     Like the reference video (Viraj 12-Nov): three pill menus (Index / Area / Colour) + our Palette, sector names above
     each block (click = zoom in, "All" or Esc = back), seven colour steps with a legend, a card that follows the pointer,
     and tiles that glide to their new place when the index, area, colour or zoom changes. */
  const HM_INDEX = [["NIFTY_50", "Nifty 50"], ["NIFTY_NEXT_50", "Nifty Next 50"], ["NIFTY_200", "Nifty 200"], ["NIFTY_500", "Nifty 500"],
    ["NIFTY_MIDCAP_150", "Midcap 150"], ["NIFTY_SMALLCAP_250", "Smallcap 250"], ["NIFTY_MICROCAP_250", "Microcap 250"],
    ["NIFTY_MIDSMALLCAP_400", "MidSmall 400"], ["NIFTY_BANK", "Nifty Bank"], ["FNO", "F&O stocks"], ["LIQUID", "Liquid stocks"]];
  const HM_AREA = [["turnover_cr", "Turnover"], ["mcap_cr", "Market cap"], ["equal", "Equal"]];
  // colour steps: the six cut points between the seven colours (the reference's 1D scale is -2 / -1 / -0.2 / 0.2 / 1 / 3 %)
  const HM_COLOR = [["chg_1d", "Perf 1D %", [-2, -1, -0.2, 0.2, 1, 3]], ["ret_1w", "Perf 1W %", [-5, -2.5, -0.5, 0.5, 2.5, 5]],
    ["ret_1m", "Perf 1M %", [-10, -5, -1, 1, 5, 10]], ["ret_3m", "Perf 3M %", [-20, -10, -2, 2, 10, 20]],
    ["from_hi52", "From 52W high", [-40, -25, -15, -8, -4, -1]], ["rs_rating", "RS rating", [20, 38, 48, 52, 62, 80]]];
  const HM_PAL = [["gr", "Green / Red"], ["bp", "Blue / Pink"]];
  const HM_BINS = ["n3", "n2", "n1", "z", "p1", "p2", "p3"];
  const hmBin = (v, cuts) => { if (v == null || !isFinite(v)) return "na"; let i = 0; while (i < cuts.length && v >= cuts[i]) i++; return HM_BINS[i]; };
  let hmResize = null, hmKey = null;

  async function renderHeatmap() {
    if (!state.screen) view.innerHTML = SKEL("Loading the heatmap");
    try { await loadScreen(); if (!state.members) state.members = await getJSON("data/index_members.json").catch(() => ({})); }
    catch (e) { view.innerHTML = `<p class="empty">Could not load the stock table (${esc(e.message)}).</p>`; return; }
    if (routeName() !== "heatmap") return;
    const hm = Object.assign({ index: "NIFTY_500", area: "turnover_cr", color: "chg_1d", pal: "gr" }, store.get("sd-hm", {}));
    hm.sector = "";
    if (!state.members[hm.index] && !["FNO", "LIQUID"].includes(hm.index)) hm.index = state.members.NIFTY_500 ? "NIFTY_500" : "LIQUID";
    if (!HM_COLOR.some((c) => c[0] === hm.color)) hm.color = "chg_1d";
    if (!HM_PAL.some((c) => c[0] === hm.pal)) hm.pal = "gr";
    const save = () => store.set("sd-hm", { index: hm.index, area: hm.area, color: hm.color, pal: hm.pal });
    const idxOpts = HM_INDEX.filter(([k]) => state.members[k] || k === "FNO" || k === "LIQUID");
    const OPTS = { index: idxOpts, area: HM_AREA, color: HM_COLOR, pal: HM_PAL };
    const CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const nameOf = (k) => ((OPTS[k].find((o) => o[0] === hm[k]) || OPTS[k][0])[1]);
    const dd = (k, label) => `<div class="hm-dd${k === "pal" ? " pal" : ""}" data-dd="${k}"><button type="button" class="hm-ddb" aria-haspopup="listbox" aria-expanded="false"><span>${label}</span><b>${esc(nameOf(k))}</b>${CHEV}</button>
      <div class="hm-menu" role="listbox" hidden>${OPTS[k].map(([v, l]) => `<button type="button" role="option" data-v="${esc(v)}" class="${v === hm[k] ? "on" : ""}">${esc(l)}</button>`).join("")}</div></div>`;
    view.innerHTML = `<div class="hmx" data-pal="${hm.pal}"><div class="hmx-bar">${dd("index", "Index")}${dd("area", "Area")}${dd("color", "Colour")}${dd("pal", "Palette")}</div>
      <div class="hm-crumb" id="hmCrumb" hidden></div>
      <div class="hm-box" id="hmBox"></div>
      <div class="hm-foot"><div class="hm-leg" id="hmLeg"></div><small id="hmN"></small></div>
      <div class="hm-tip" id="hmTip" hidden></div></div>`;
    const box = $("#hmBox"), tip = $("#hmTip");
    const tiles = new Map(), heads = new Map();
    const fmtV = (v) => (v == null || !isFinite(v) ? "–" : hm.color === "rs_rating" ? String(Math.round(v)) : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
    const drop = (map, k, el) => { map.delete(k); el.classList.remove("new", "hov"); el.classList.add("out"); setTimeout(() => el.remove(), 340); };

    const draw = (still) => {
      if (!document.body.contains(box)) { window.removeEventListener("resize", hmResize); return; }
      box.classList.toggle("still", !!still);
      const mem = state.members[hm.index] ? new Set(state.members[hm.index].symbols) : null;
      let rows = state.screen.filter((r) => !r.stale && (mem ? mem.has(r.symbol) : hm.index === "FNO" ? r.fno : (r.liquid_day ?? r.liquid)));
      const total = rows.length;
      if (hm.sector) rows = rows.filter((r) => (r.sector || "Other") === hm.sector);
      const val = (r) => (hm.area === "equal" ? 1 : Math.max(r[hm.area] || 0, 0));
      const groups = new Map();
      for (const r of rows) { if (!(val(r) > 0)) continue; const g = r.sector || "Other"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
      const shown = [...groups.values()].reduce((a, l) => a + l.length, 0);
      // breadcrumb first: it changes the height left for the map
      const crumb = $("#hmCrumb");
      crumb.hidden = !hm.sector;
      crumb.innerHTML = hm.sector ? `<button type="button" id="hmAll">All</button><i>›</i><b>${esc(hm.sector)}</b>` : "";
      const narrow = innerWidth <= 720;
      box.style.height = narrow ? `${Math.max(560, Math.round(box.clientWidth * 1.9))}px` : "";
      const W = box.clientWidth, H = box.clientHeight || 480;
      const gl = [...groups].map(([g, list]) => ({ v: list.reduce((a, r) => a + val(r), 0), g, list: list.sort((a, b) => val(b) - val(a)) })).sort((a, b) => b.v - a.v);
      const cuts = HM_COLOR.find((x) => x[0] === hm.color)[2];
      const seenT = new Set(), seenH = new Set();
      let gi = 0;
      for (const gr of SD.squarify(gl, { x: 0, y: 0, w: W, h: H })) {
        const g = gr.it, head = !hm.sector && gr.h > 44 && gr.w > 40 ? 17 : 0;
        const gx = gr.x + 2, gy = gr.y + 2, gw = Math.max(gr.w - 4, 0), gh = Math.max(gr.h - 4, 0);
        if (head) {
          let h = heads.get(g.g);
          if (!h) { h = document.createElement("button"); h.type = "button"; h.className = "hm-gh new"; h.dataset.g = g.g; h.innerHTML = `${esc(g.g)} <i>›</i>`; h.title = `Open ${g.g}`;
            h.style.setProperty("--d", `${Math.min(gi * 35, 420)}ms`); h.addEventListener("animationend", () => h.classList.remove("new"), { once: true }); box.appendChild(h); heads.set(g.g, h); }
          h.style.left = `${gx}px`; h.style.top = `${gy}px`; h.style.width = `${gw}px`;
          seenH.add(g.g);
        }
        for (const t of SD.squarify(g.list.map((r) => ({ v: val(r), r })), { x: gx, y: gy + head, w: gw, h: Math.max(gh - head, 0) })) {
          const r = t.it.r, v = r[hm.color], k = r.key;
          let el = tiles.get(k);
          if (!el) {
            el = document.createElement("a"); el.className = "hm-t new"; el.dataset.k = k; el.href = `#/i/s/${encodeURIComponent(r.id)}`;
            el.style.setProperty("--d", `${Math.min(gi * 35, 420)}ms`); el.addEventListener("animationend", () => el.classList.remove("new"), { once: true });
            box.appendChild(el); tiles.set(k, el);
          }
          const w = Math.max(t.w - 1, 0), h = Math.max(t.h - 1, 0), c = `hq-${hmBin(v, cuts)}`;
          el.style.left = `${t.x}px`; el.style.top = `${t.y}px`; el.style.width = `${w}px`; el.style.height = `${h}px`;
          if (el._c !== c) { if (el._c) el.classList.remove(el._c); el.classList.add(c); el._c = c; }
          el.dataset.g = g.g;
          el.style.fontSize = `${Math.max(7.5, Math.min(14, Math.min(Math.sqrt(w * h) / 7.5, w / 6.2))).toFixed(1)}px`;
          const txt = w >= 34 && h >= 22 ? `<b>${esc(r.symbol)}</b>${h >= 34 && w >= 40 ? `<span>${fmtV(v)}</span>` : ""}` : "";
          if (el._t !== txt) { el.innerHTML = txt; el._t = txt; }
          seenT.add(k);
        }
        gi++;
      }
      for (const [k, el] of [...tiles]) if (!seenT.has(k)) drop(tiles, k, el);
      for (const [k, el] of [...heads]) if (!seenH.has(k)) drop(heads, k, el);
      let empty = box.querySelector(".hm-empty");
      if (!shown && !empty) box.insertAdjacentHTML("beforeend", '<p class="hm-empty">No stock with this setting.</p>'); else if (shown && empty) empty.remove();
      // legend + counts
      $("#hmLeg").innerHTML = `<div class="hm-sw">${HM_BINS.map((b) => `<i class="hq-${b}"></i>`).join("")}</div>`
        + `<div class="hm-tk">${cuts.map((x, i) => `<span style="left:${((i + 1) * 100) / 7}%">${hm.color === "rs_rating" ? x : String(x).replace("-", "−") + "%"}</span>`).join("")}</div>`;
      const idxName = nameOf("index"), areaName = nameOf("area"), colName = nameOf("color");
      $("#hmN").textContent = `${shown}${hm.sector ? ` of ${total}` : ""} symbols · Area = ${areaName}`;
      $("#stPage").innerHTML = `<span>${shown} stocks</span><span class="st-n">${esc(idxName)} · area ${esc(areaName.toLowerCase())} · colour ${esc(colName)}</span><span class="st-n">data ${SD.fmtDate(state.screenDate)}</span>`;
      if ($("#hmAll")) $("#hmAll").onclick = () => zoom("");
    };
    const zoom = (sector) => { hm.sector = sector; hideTip(); draw(); };

    // pill menus
    const closeMenus = (except) => view.querySelectorAll(".hm-dd.open").forEach((d) => { if (d !== except) { d.classList.remove("open"); d.querySelector(".hm-menu").hidden = true; d.querySelector(".hm-ddb").setAttribute("aria-expanded", "false"); } });
    view.querySelector(".hmx-bar").onclick = (e) => {
      e.stopPropagation();
      const d = e.target.closest(".hm-dd"); if (!d) return;
      const opt = e.target.closest(".hm-menu button");
      if (!opt) { const open = !d.classList.contains("open"); closeMenus(d); d.classList.toggle("open", open); d.querySelector(".hm-menu").hidden = !open; d.querySelector(".hm-ddb").setAttribute("aria-expanded", String(open)); return; }
      const k = d.dataset.dd, v = opt.dataset.v;
      closeMenus();
      if (hm[k] === v) return;
      hm[k] = v; if (k === "index") hm.sector = "";
      d.querySelector(".hm-ddb b").textContent = nameOf(k);
      d.querySelectorAll(".hm-menu button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
      if (k === "pal") view.querySelector(".hmx").dataset.pal = v;
      save(); draw();
    };
    view.onclick = () => closeMenus();
    if (hmKey) document.removeEventListener("keydown", hmKey);
    hmKey = (e) => {
      if (routeName() !== "heatmap") { document.removeEventListener("keydown", hmKey); return; }
      if (e.key !== "Escape") return;
      if (view.querySelector(".hm-dd.open")) closeMenus(); else if (hm.sector) zoom("");
    };
    document.addEventListener("keydown", hmKey);
    box.addEventListener("click", (e) => { const g = e.target.closest(".hm-gh"); if (g && !hm.sector) zoom(g.dataset.g); });

    // the card that follows the pointer
    let hovEl = null;
    const hideTip = () => { if (hovEl) { hovEl.classList.remove("hov"); heads.get(hovEl.dataset.g)?.classList.remove("hl"); } hovEl = null; tip.hidden = true; };
    const tipHTML = (r) => {
      const v = r[hm.color], b = hmBin(v, HM_COLOR.find((x) => x[0] === hm.color)[2]);
      const tone = b[0] === "p" ? "up" : b[0] === "n" ? "down" : "muted";
      const main = hm.color === "rs_rating" ? `RS ${v ?? "–"}` : hm.color === "from_hi52" ? `${fmtV(v)} from high` : fmtV(v);
      const k = (l, x) => `<span><small>${l}</small>${x}</span>`;
      const p = (x) => (x == null || !isFinite(x) ? '<i class="muted">–</i>' : `<i class="${x >= 0 ? "up" : "down"}">${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}%</i>`);
      return `<div class="hm-tip-h"><b class="wl">${logo(r)}${esc(r.symbol)}</b><span class="${tone}">${main}</span></div>
        <div class="hm-tip-n">${esc(r.name || "")}</div>
        <div class="hm-tip-s">${esc(r.sector || "")}${r.basic_industry || r.industry ? " · " + esc(r.basic_industry || r.industry) : ""}</div>
        <div class="hm-tip-g">${k("Price", `₹${SD.fmtPrice(r.close)}`)}${k("1D", p(r.chg_1d))}${k("1M", p(r.ret_1m))}${k("RS", r.rs_rating ?? "–")}</div>
        <div class="hm-tip-m">Market cap ₹${finNum(r.mcap_cr)} Cr${r.turnover_cr != null ? ` · Turnover ₹${finNum(r.turnover_cr, 1)} Cr` : ""}</div>`;
    };
    box.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const a = e.target.closest(".hm-t:not(.out)");
      if (a !== hovEl) {
        if (hovEl) { hovEl.classList.remove("hov"); heads.get(hovEl.dataset.g)?.classList.remove("hl"); }
        hovEl = a;
        if (!a) { tip.hidden = true; return; }
        const r = state.screenByKey.get(a.dataset.k); if (!r) { tip.hidden = true; return; }
        a.classList.add("hov"); heads.get(a.dataset.g)?.classList.add("hl");
        tip.innerHTML = tipHTML(r); tip.hidden = false;
      }
      if (!a) return;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = e.clientX + 16, y = e.clientY + 16;
      if (x + tw > innerWidth - 8) x = e.clientX - tw - 12;
      if (y + th > innerHeight - 8) y = e.clientY - th - 12;
      tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    });
    box.addEventListener("pointerleave", hideTip);

    draw();
    if (hmResize) window.removeEventListener("resize", hmResize);
    let tmr = null;
    hmResize = () => { clearTimeout(tmr); tmr = setTimeout(() => { if (routeName() === "heatmap") draw(true); else window.removeEventListener("resize", hmResize); }, 120); };
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
        <div class="ec-l">${items.length ? items.map(({ r, g, done: ok }) => `<a class="ec-r${ok ? "" : " due"}" href="#/i/s/${encodeURIComponent(r.id)}" data-k="${esc(r.key)}" data-d="${d}">${logo(r)}<b>${esc(r.symbol)}</b>${ok ? `<span class="egt ${GRADE_CLS[g] || ""}">${g || "–"}</span>` : ""}</a>`).join("")
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
    const card = ({ r }) => `<div class="erc" data-id="${esc(r.id)}"><div class="erc-h"><a href="#/i/s/${encodeURIComponent(r.id)}">${logo(r)}${esc(r.symbol)} <span class="arr">↗</span></a>${priceLine(r)}</div>
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
      return `<a class="emc" href="#/i/s/${encodeURIComponent(r.id)}" data-k="${esc(r.key)}" data-d="${d}"><div class="emc-h">${logo(r)}<b>${esc(r.symbol)}</b><span class="gp ${GRADE_CLS[g] || ""}">${g || "–"}</span></div>
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
      return `<div class="ehc-h">${logo(r, true)}<div><b>${esc(r.symbol)}</b><small>${done ? `${esc(lastQ)} · ${dLbl(d)}` : `Results due ${dLbl(d)}`}</small></div>
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
      + setups.map(({ r, tag }) => `<tr data-key="${esc(r.key)}"><td class="l name"><div class="nm">${logo(r)}<div><b>${esc(r.symbol)}</b><span><i class="hs-tag">${tag}</i> ${esc(r.basic_industry || r.industry || "")}</span></div></div></td><td class="num">${r.rs_rating ?? "–"}</td>`
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
    const wlHTML = wl.length ? groupsW.filter(([, l]) => l.length).map(([g, l]) => `<small class="muted hm-l">${g.toUpperCase()} · ${l.length}</small>${l.map((r) => `<a class="hw-row" href="#/i/s/${encodeURIComponent(r.id)}"><div><b class="wl">${logo(r)}${esc(r.symbol)}</b> <small class="muted">RS ${r.rs_rating ?? "–"}</small><span class="num">${SD.fmtPrice(r.close)} ${pct(r.chg_1d)}</span></div>`
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
    const head = `<div class="sp-h">${logo(r, true)}<div class="sp-t"><b title="${esc(r.name)}">${esc(r.name || r.symbol)}</b><small class="muted">NSE:${esc(r.symbol)}${r.series && r.series !== "EQ" ? " · " + esc(r.series) : ""}</small></div>
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
      + peers.map((x) => `<tr class="${x.id === id ? "me" : ""}" data-peer="${esc(x.id)}"><td class="l"><b class="wl">${logo(x)}${esc(x.symbol)}</b></td><td>${finNum(x.mcap_cr)}</td><td>${finNum(x.pe, 1)}</td><td>${finNum(x.sales_ttm)}</td>`
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
    // the Pages bar belongs to the Home section only (Viraj 12-Nov, like the reference): Scanners, Groups and Breadth
    // (their own rail buttons) start straight with their card
    document.body.dataset.sec = ["scanners", "groups", "breadth"].includes(tab) ? "tool" : "home";
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
