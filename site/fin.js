/* Fundamentals tables of one stock (Phase S8): pure functions over data/f/<id>.json (made by swingdash/site_build.py from
   data/fundamentals/<SYMBOL>.json). Tested with `node --test tests/js`. Money in Rs crore; EPS multiplied by "f" (later
   splits / bonuses) so every period compares with today's share count. */
(function (root) {
  "use strict";

  const QROWS = {
    company: [["sales", "Sales"], ["expenses", "Expenses"], ["op_profit", "Operating Profit"], ["opm", "OPM %"], ["other_income", "Other Income"],
      ["interest", "Interest"], ["depreciation", "Depreciation"], ["pbt", "Profit before tax"], ["taxp", "Tax %"], ["net_profit", "Net Profit"],
      ["eps", "EPS (₹)"]],
    bank: [["sales", "Revenue (interest earned)"], ["interest", "Interest expended"], ["expenses", "Expenses (incl. provisions)"],
      ["op_profit", "Financing Profit"], ["opm", "Financing Margin %"], ["other_income", "Other Income"], ["pbt", "Profit before tax"],
      ["taxp", "Tax %"], ["net_profit", "Net Profit"], ["eps", "EPS (₹)"]],
    insurance: [["sales", "Net premium"], ["other_income", "Other Income"], ["pbt", "Profit before tax"], ["taxp", "Tax %"],
      ["net_profit", "Net Profit"], ["eps", "EPS (₹)"]],
  };
  QROWS.nbfc = QROWS.bank.map(([k, l]) => [k, k === "sales" ? "Revenue" : k === "interest" ? "Interest" : k === "expenses" ? "Expenses" : l]);
  const BSROWS = {
    company: [["equity_capital", "Equity Capital"], ["reserves", "Reserves"], ["borrowings", "Borrowings"], ["other_liabilities", "Other Liabilities"],
      ["total", "Total Liabilities"], ["fixed_assets", "Fixed Assets"], ["cwip", "CWIP"], ["investments", "Investments"], ["other_assets", "Other Assets"],
      ["total", "Total Assets"]],
    bank: [["equity_capital", "Equity Capital"], ["reserves", "Reserves"], ["deposits", "Deposits"], ["borrowings", "Borrowings"],
      ["other_liabilities", "Other Liabilities"], ["total", "Total Liabilities"], ["fixed_assets", "Fixed Assets"], ["investments", "Investments"],
      ["advances", "Advances"], ["other_assets", "Other Assets"], ["total", "Total Assets"]],
  };
  BSROWS.nbfc = [["equity_capital", "Equity Capital"], ["reserves", "Reserves"], ["borrowings", "Borrowings"], ["deposits", "Deposits"],
    ["other_liabilities", "Other Liabilities"], ["total", "Total Liabilities"], ["loans", "Loans"], ["fixed_assets", "Fixed Assets"],
    ["investments", "Investments"], ["other_assets", "Other Assets"], ["total", "Total Assets"]];
  BSROWS.insurance = BSROWS.company;
  const CFROWS = [["cfo", "Cash from Operating Activity"], ["cfi", "Cash from Investing Activity"], ["cff", "Cash from Financing Activity"],
    ["net", "Net Cash Flow"], ["capex", "Capex"], ["fcf", "Free Cash Flow"]];
  const SHROWS = [["prom", "Promoters"], ["fii", "FIIs"], ["dii", "DIIs"], ["govt", "Government"], ["public", "Public"], ["others", "Others"],
    ["n", "No. of Shareholders"]];

  const months = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = (end) => `${MON[+end.slice(5, 7) - 1]} ${end.slice(0, 4)}`;

  function basisOf(doc) {
    const last = (b) => Object.keys((doc[b] || {}).q || {}).sort().pop() || "";
    const c = last("C"), s = last("S");
    return c && c >= s ? "C" : s ? "S" : "C";
  }
  const hasBasis = (doc, b) => Object.keys((doc[b] || {}).q || {}).length + Object.keys((doc[b] || {}).y || {}).length > 0;

  /** one period's numbers with the derived lines (OPM %, tax %, adjusted EPS) */
  function line(v) {
    const o = { ...v };
    if (v.sales) o.opm = v.op_profit != null ? (v.op_profit / v.sales) * 100 : null;
    o.taxp = v.pbt ? (v.tax != null ? (v.tax / v.pbt) * 100 : null) : null;
    if (v.eps != null) o.eps = v.eps * (v.f || 1);
    if (v.np_owners != null) o.net_profit = v.np_owners;
    return o;
  }

  /** the last n quarters in a row (no gaps), oldest first */
  function lastQuarters(q, n) {
    const ends = Object.keys(q || {}).sort();
    const out = [];
    for (let i = ends.length - 1; i >= 0 && out.length < n; i--) {
      if (out.length && months(ends[i], out[0]) !== 3) break;
      out.unshift(ends[i]);
    }
    return out;
  }

  function quarterTable(doc, basis, n = 12) {
    const b = doc[basis] || {}, kind = doc.kind || "company";
    const ends = lastQuarters(b.q, n);
    return { cols: ends.map(label), ends, rows: (QROWS[kind] || QROWS.company).map(([k, l]) => [l, k, ends.map((e) => line(b.q[e])[k])]),
      ann: ends.map((e) => b.q[e].ann || null) };
  }

  /** TTM = the last 4 quarters in a row (sums; OPM / tax % from the sums; EPS = sum of adjusted EPS) */
  function ttm(doc, basis) {
    const b = doc[basis] || {};
    const ends = lastQuarters(b.q, 4);
    if (ends.length < 4) return null;
    const rows = ends.map((e) => line(b.q[e]));
    const sum = (k) => (rows.some((r) => r[k] == null) ? null : rows.reduce((a, r) => a + r[k], 0));
    const o = {};
    for (const k of ["sales", "expenses", "op_profit", "other_income", "interest", "depreciation", "pbt", "tax", "net_profit", "eps"]) o[k] = sum(k);
    o.opm = o.sales && o.op_profit != null ? (o.op_profit / o.sales) * 100 : null;
    o.taxp = o.pbt && o.tax != null ? (o.tax / o.pbt) * 100 : null;
    o.end = ends[3];
    return o;
  }

  function annualTable(doc, basis, n = 10) {
    const b = doc[basis] || {}, kind = doc.kind || "company";
    const ends = Object.keys(b.y || {}).sort().slice(-n);
    const t = ttm(doc, basis);
    const withT = t && (!ends.length || t.end > ends[ends.length - 1]);
    const vals = ends.map((e) => line(b.y[e]));
    if (withT) vals.push(t);
    const cols = ends.map(label).concat(withT ? ["TTM"] : []);
    return { cols, ends, rows: (QROWS[kind] || QROWS.company).map(([k, l]) => [l, k, vals.map((v) => v[k])]) };
  }

  /** balance sheet: the year-end sheets plus the latest half-year sheet when it is newer */
  function bsTable(doc, basis, n = 10) {
    const b = doc[basis] || {}, kind = doc.kind || "company";
    const all = Object.keys(b.bs || {}).sort();
    const fy = Object.keys(b.y || {}).sort().map((e) => e.slice(5));
    const yearEnd = fy.length ? fy[fy.length - 1] : "03-31";
    let ends = all.filter((e) => e.slice(5) === yearEnd).slice(-n);
    const last = all[all.length - 1];
    if (last && (!ends.length || last > ends[ends.length - 1])) ends = ends.concat([last]);
    return { cols: ends.map(label), ends, rows: (BSROWS[kind] || BSROWS.company).map(([k, l]) => [l, k, ends.map((e) => b.bs[e][k])]) };
  }

  function cfTable(doc, basis, n = 10) {
    const b = doc[basis] || {};
    const ends = Object.keys(b.cf || {}).sort().slice(-n);
    return { cols: ends.map(label), ends, rows: CFROWS.map(([k, l]) => [l, k, ends.map((e) => b.cf[e][k])]) };
  }

  function shpTable(doc, n = 12) {
    const ends = Object.keys(doc.shp || {}).sort().slice(-n);
    return { cols: ends.map(label), ends, rows: SHROWS.map(([k, l]) => [l, k, ends.map((e) => doc.shp[e][k])]) };
  }

  /** compounded growth (%) of a yearly series over y years; null when either end <= 0 */
  function cagr(newV, oldV, y) {
    if (newV == null || oldV == null || newV <= 0 || oldV <= 0 || y <= 0) return null;
    return (Math.pow(newV / oldV, 1 / y) - 1) * 100;
  }

  /** price CAGR over y years from chart data (adjusted closes, d = yyyymmdd); null when the history is shorter */
  function priceCAGR(chart, y) {
    if (!chart || !chart.d || !chart.d.length) return null;
    const last = chart.d.length - 1, d1 = String(chart.d[last]);
    const target = Number(`${+d1.slice(0, 4) - y}${d1.slice(4)}`);
    if (chart.d[0] > target) return null;
    let i = 0;
    while (i < last && chart.d[i + 1] <= target) i++;
    return cagr(chart.c[last], chart.c[i], y);
  }

  /** Compounded growth table: sales / profit / price over 10Y, 5Y, 3Y and TTM / 1Y; ROE from the screen row */
  function growthTable(doc, basis, row, chart) {
    const b = doc[basis] || {};
    const ends = Object.keys(b.y || {}).sort();
    const last = ends[ends.length - 1];
    const yv = (e, k) => (e && b.y[e] ? line(b.y[e])[k] : null);
    const back = (n) => ends.find((e) => last && months(e, last) === 12 * n);
    const g = (k, n) => cagr(yv(last, k), yv(back(n), k), n);
    return [
      ["Compounded Sales Growth", [["10 Years", g("sales", 10)], ["5 Years", g("sales", 5)], ["3 Years", g("sales", 3)], ["TTM", row.sales_g_ttm]]],
      ["Compounded Profit Growth", [["10 Years", g("net_profit", 10)], ["5 Years", g("net_profit", 5)], ["3 Years", g("net_profit", 3)], ["TTM", row.np_g_ttm]]],
      ["Stock Price CAGR", [["10 Years", priceCAGR(chart, 10)], ["5 Years", priceCAGR(chart, 5)], ["3 Years", priceCAGR(chart, 3)], ["1 Year", row.ret_1y]]],
      ["Return on Equity", [["10 Years", row.roe_10y], ["5 Years", row.roe_5y], ["3 Years", row.roe_3y], ["Last Year", row.roe]]],
    ];
  }

  /** rule-based pros and cons from the screen row (our own simple rules; not advice) */
  function prosCons(r) {
    const pros = [], cons = [];
    const n = (x) => x != null && isFinite(x);
    const fin = r.fin_kind === "bank" || r.fin_kind === "nbfc" || r.fin_kind === "insurance";
    if (n(r.roe_3y) && r.roe_3y >= 20) pros.push(`Good return on equity: 3-year average ROE ${r.roe_3y.toFixed(1)}%`);
    if (n(r.roe_3y) && r.roe_3y < 10) cons.push(`Low return on equity: 3-year average ROE ${r.roe_3y.toFixed(1)}%`);
    if (n(r.np_cagr_5y) && r.np_cagr_5y >= 20) pros.push(`Profit grew ${r.np_cagr_5y.toFixed(1)}% a year over 5 years`);
    if (n(r.sales_cagr_5y) && r.sales_cagr_5y < 8) cons.push(`Slow sales growth: ${r.sales_cagr_5y.toFixed(1)}% a year over 5 years`);
    if (n(r.sales_cagr_3y) && r.sales_cagr_3y >= 20) pros.push(`Sales grew ${r.sales_cagr_3y.toFixed(1)}% a year over 3 years`);
    if (!fin && n(r.debt_equity) && r.debt_equity <= 0.1) pros.push("Almost debt free");
    if (!fin && n(r.debt_equity) && r.debt_equity > 1) cons.push(`High debt: debt / equity ${r.debt_equity.toFixed(2)}`);
    if (n(r.div_yield) && r.div_yield >= 2) pros.push(`Dividend yield ${r.div_yield.toFixed(1)}%`);
    if (n(r.eps_up_qtrs) && r.eps_up_qtrs >= 4) pros.push(`EPS higher than a year before in each of the last ${r.eps_up_qtrs} quarters`);
    if (n(r.np_g_yoy) && r.np_g_yoy <= -20) cons.push(`Latest quarter's profit ${r.np_g_yoy.toFixed(0)}% vs a year before`);
    if (n(r.prom_chg_1y) && r.prom_chg_1y <= -2) cons.push(`Promoters cut their holding by ${(-r.prom_chg_1y).toFixed(1)} points in a year`);
    if (n(r.prom_chg_1y) && r.prom_chg_1y >= 1) pros.push(`Promoters raised their holding by ${r.prom_chg_1y.toFixed(1)} points in a year`);
    if (n(r.prom_hold) && r.prom_hold > 0 && r.prom_hold < 30) cons.push(`Low promoter holding: ${r.prom_hold.toFixed(1)}%`);
    if (n(r.pb) && r.pb > 0 && r.pb < 1) pros.push(`Trades below book value (P/B ${r.pb.toFixed(2)})`);
    if (n(r.pb) && r.pb > 15) cons.push(`Trades at ${r.pb.toFixed(1)} times book value`);
    if (n(r.np_ttm) && r.np_ttm < 0) cons.push("Loss over the last 4 quarters");
    return { pros, cons };
  }

  /** results announcement days (yyyy-mm-dd) of every known quarter, for the E markers */
  function resultDays(doc, basis) {
    const q = (doc[basis] || {}).q || {};
    return Object.keys(q).sort().map((e) => q[e].ann).filter(Boolean);
  }

  const api = { QROWS, BSROWS, CFROWS, SHROWS, basisOf, hasBasis, line, lastQuarters, quarterTable, ttm, annualTable, bsTable, cfTable,
    shpTable, cagr, priceCAGR, growthTable, prosCons, resultDays, label, months };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SDF = api;
})(typeof self !== "undefined" ? self : this);
