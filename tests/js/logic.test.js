// node --test tests/js
const test = require("node:test");
const assert = require("node:assert/strict");
const SD = require("../../site/logic.js");

const snap = {
  columns: ["id", "kind", "exchange", "symbol", "name", "sector", "industry", "stale", "close", "chg_1d", "trend", "flags", "rs_rating"],
  rows: [
    ["RELIANCE", "stock", "NSE", "RELIANCE", "Reliance Industries", "Oil Gas", "Petroleum", false, 1164.9, -0.21, "downtrend", [], 32],
    ["TCS", "stock", "NSE", "TCS", "Tata Consultancy", "IT", "IT - Software", false, 2502.6, 0.99, "uptrend", ["above_50_200", "rsi_50_70"], 85],
    ["NIFTY_50", "index", "NSE", "NIFTY 50", "NIFTY 50", "", "", false, 24000, 0.5, "sideways", [], null],
    ["SENSEX", "index", "BSE", "SENSEX", "BSE SENSEX", "", "", false, 80000, null, "sideways", [], 50],
    ["OLDCO", "stock", "NSE", "OLDCO", "Old Co", "IT", "", true, 10, 1, "sideways", [], null],
  ],
};
const rows = SD.rowsFromSnapshot(snap);

test("snapshot rows and keys", () => {
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.key), ["s:RELIANCE", "s:TCS", "n:NIFTY_50", "b:SENSEX", "s:OLDCO"]);
});

test("filters: view, sector, text, stale, screens (AND)", () => {
  assert.deepEqual(SD.filterRows(rows, { view: "stock" }).map((r) => r.id), ["RELIANCE", "TCS"]);
  assert.deepEqual(SD.filterRows(rows, { view: "nse" }).map((r) => r.id), ["NIFTY_50"]);
  assert.deepEqual(SD.filterRows(rows, { view: "bse" }).map((r) => r.id), ["SENSEX"]);
  assert.deepEqual(SD.filterRows(rows, { sector: "IT" }).map((r) => r.id), ["TCS"]);
  assert.deepEqual(SD.filterRows(rows, { sector: "IT", hideStale: false }).map((r) => r.id), ["TCS", "OLDCO"]);
  assert.deepEqual(SD.filterRows(rows, { text: "consult" }).map((r) => r.id), ["TCS"]);
  assert.deepEqual(SD.filterRows(rows, { screens: ["above_50_200", "rsi_50_70", "strong_rs"] }).map((r) => r.id), []);
  assert.deepEqual(SD.filterRows(rows, { screens: ["above_50_200", "uptrend"] }).map((r) => r.id), ["TCS"]);
});

test("sort keeps missing values last in both directions", () => {
  assert.deepEqual(SD.sortRows(rows, "chg_1d", "desc").map((r) => r.id), ["OLDCO", "TCS", "NIFTY_50", "RELIANCE", "SENSEX"]);
  assert.deepEqual(SD.sortRows(rows, "chg_1d", "asc").map((r) => r.id).slice(-1), ["SENSEX"]);
  assert.deepEqual(SD.sortRows(rows, "name", "asc").map((r) => r.id)[0], "SENSEX");
});

test("formats (Indian grouping and units)", () => {
  assert.equal(SD.fmtPrice(1234567.891), "12,34,567.89");
  assert.equal(SD.fmtPct(1.234), "+1.23%");
  assert.equal(SD.fmtPct(-0.5), "-0.50%");
  assert.equal(SD.fmtPct(null), "–");
  assert.equal(SD.fmtVol(12345678), "1.23 Cr");
  assert.equal(SD.fmtVol(456789), "4.57 L");
  assert.equal(SD.fmtDate(20261030), "30-Oct-2026");
  assert.equal(SD.fmtDate("2026-10-30"), "30-Oct-2026");
});

test("CSV quotes commas and joins flag lists", () => {
  const csv = SD.toCSV([{ a: "x,y", b: ["p", "q"], c: null }], ["a", "b", "c"]);
  assert.equal(csv, 'a,b,c\n"x,y",p q,\n');
});

const chart = { d: [20241024, 20241025, 20241028], o: [1335.28, 1343.5, 1337], h: [1343.7, 1344.35, 1353],
  l: [1323.13, 1322, 1322.1], c: [1339.8, 1327.85, 1334.35], v: [22155934, 18597496, 10824350], f: [0.5, 0.5, 1] };

test("raw candles = adjusted / factor (RELIANCE 1:1 bonus)", () => {
  const adj = SD.candlesFromChart(chart, "adjusted");
  const raw = SD.candlesFromChart(chart, "raw");
  assert.equal(adj[1].close, 1327.85);
  assert.equal(raw[1].close, 2655.7);
  assert.equal(raw[1].volume, 9298748);          // volume back to as traded
  assert.equal(raw[2].close, adj[2].close);      // last candle: adjusted = raw
  assert.equal(adj[0].time, "2024-10-24");
});

test("weekly candles", () => {
  const days = [["2026-10-26", 10, 12, 9, 11, 100], ["2026-10-27", 11, 15, 10, 14, 100], ["2026-10-30", 14, 14, 8, 9, 50],
    ["2026-11-02", 9, 10, 9, 10, 10]].map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
  const w = SD.toWeekly(days);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], { time: "2026-10-26", open: 10, high: 15, low: 8, close: 9, volume: 250 });
});

test("EMA matches the pipeline rule", () => {
  const c = [10, 11, 12, 13, 14].map((close, i) => ({ time: `2026-01-0${i + 1}`, close }));
  assert.deepEqual(SD.ema(c, 3).map((p) => p.value), [11.25, 12.125, 13.0625]);
});

test("range slice counts back from the last candle", () => {
  const c = ["2025-01-01", "2026-06-01", "2026-10-01", "2026-10-30"].map((time) => ({ time, close: 1 }));
  assert.equal(SD.sliceRange(c, "1M").length, 2);
  assert.equal(SD.sliceRange(c, "6M").length, 3);
  assert.equal(SD.sliceRange(c, "MAX").length, 4);
});

test("heat levels are clamped and scaled by period", () => {
  assert.equal(SD.heatLevel(1, "1d"), 2);
  assert.equal(SD.heatLevel(-10, "1d"), -4);
  assert.equal(SD.heatLevel(8, "1m"), 4);
  assert.equal(SD.heatLevel(null, "1m"), 0);
});

test("Nifty 500 view shows only member stocks", () => {
  const r = SD.rowsFromSnapshot({ columns: ["id", "kind", "exchange", "symbol", "name", "n500", "stale", "flags"],
    rows: [["A", "stock", "NSE", "A", "A", true, false, []], ["B", "stock", "NSE", "B", "B", false, false, []],
      ["N", "index", "NSE", "N", "N", false, false, []]] });
  assert.deepEqual(SD.filterRows(r, { view: "n500" }).map((x) => x.id), ["A"]);
  assert.deepEqual(SD.filterRows(r, { view: "stock" }).map((x) => x.id), ["A", "B"]);
});

// ---- Phase S5: stock table helpers
test("screenRows adds key and days since listing; fmtCell formats by type", () => {
  const snap = { data_date: "2026-11-04", columns: ["id", "symbol", "listed", "chg_1d", "stage", "liquid"],
    rows: [["TITAN", "TITAN", "2004-09-24", 4.2174, "2", true]] };
  const [r] = SD.screenRows(snap);
  assert.strictEqual(r.key, "s:TITAN");
  assert.strictEqual(r.days_listed, Math.floor((Date.parse("2026-11-04") - Date.parse("2004-09-24")) / 86400000));
  assert.strictEqual(SD.fmtCell(4.2174, "pct"), "+4.22%");
  assert.strictEqual(SD.fmtCell("2A", "stage"), "2 Early uptrend");
  assert.strictEqual(SD.fmtCell(1.6489, "x"), "1.65×");
  assert.strictEqual(SD.fmtCell(null, "pct"), "–");
  assert.strictEqual(SD.fmtCell(-3, "signed"), "-3");
});

test("filterStocks: universe, sector, search; default columns exist", () => {
  const rows = [{ symbol: "A", name: "Alpha", liquid: true, n500: true, fno: false, sector: "IT", basic_industry: "Software" },
    { symbol: "B", name: "Beta", liquid: false, n500: false, fno: true, sector: "Power", basic_industry: "Utilities", stale: false },
    { symbol: "C", name: "Gamma", liquid: true, stale: true }];
  assert.deepStrictEqual(SD.filterStocks(rows, { universe: "liquid" }).map((r) => r.symbol), ["A"]);
  assert.deepStrictEqual(SD.filterStocks(rows, { universe: "fno" }).map((r) => r.symbol), ["B"]);
  assert.deepStrictEqual(SD.filterStocks(rows, { text: "soft" }).map((r) => r.symbol), ["A"]);
  assert.deepStrictEqual(SD.filterStocks(rows, { sector: "Power" }).map((r) => r.symbol), ["B"]);
  SD.DEFAULT_COLUMNS.forEach((c) => assert.ok(SD.COLUMNS[c], c));
  assert.strictEqual(SD.SORTS[0][0], "symbol");
});
