// node --test tests/js   (Phase S8: fundamentals tables of the Financials tab)
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../../site/fin.js");

const q = {};
["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"].forEach((e, i) => {
  q[e] = { sales: 100 + i * 10, expenses: 80, op_profit: 20 + i * 10, pbt: 15, tax: 3, net_profit: 12, np_owners: 11, eps: 2, ann: e };
});
q["2024-03-31"] = { sales: 50, eps: 1 };              // an older year-end quarter: not part of the row of quarters
q["2025-03-31"].f = 0.5;                              // a bonus after that results day
const doc = {
  kind: "company",
  C: { q, y: { "2025-03-31": { sales: 400, np_owners: 40, eps: 8, f: 0.5 }, "2026-03-31": { sales: 520, np_owners: 50, eps: 10 } },
    bs: { "2025-03-31": { total: 10 }, "2025-09-30": { total: 11 }, "2026-03-31": { total: 12 } }, cf: {} },
  S: { q: {}, y: {} },
  shp: { "2026-06-30": { prom: 50, fii: 10, dii: 8, govt: 0, public: 30, others: 2, n: 1000 } },
};

test("quarters in a row, derived lines and adjusted EPS", () => {
  const t = F.quarterTable(doc, "C", 12);
  assert.equal(t.ends.length, 6);
  assert.equal(t.cols[0], "Mar 2025");
  const row = (k) => t.rows.find((r) => r[1] === k)[2];
  assert.equal(row("opm")[0], 20);
  assert.equal(row("taxp")[0], 20);
  assert.deepEqual(row("eps").slice(0, 2), [1, 2]);          // 2 x 0.5, then 2
  assert.equal(row("net_profit")[0], 11);                     // profit to owners
});

test("annual table adds TTM after the last full year", () => {
  const t = F.annualTable(doc, "C", 10);
  assert.deepEqual(t.cols, ["Mar 2025", "Mar 2026", "TTM"]);
  const sales = t.rows.find((r) => r[1] === "sales")[2];
  assert.equal(sales[2], 120 + 130 + 140 + 150);
  assert.equal(t.rows.find((r) => r[1] === "eps")[2][0], 4);
});

test("balance sheet: year ends plus the newer half-year; basis choice", () => {
  assert.deepEqual(F.bsTable(doc, "C").ends, ["2025-03-31", "2026-03-31"]);
  const d2 = JSON.parse(JSON.stringify(doc));
  d2.C.bs["2026-09-30"] = { total: 13 };
  assert.deepEqual(F.bsTable(d2, "C").ends, ["2025-03-31", "2026-03-31", "2026-09-30"]);
  assert.equal(F.basisOf(doc), "C");
  assert.equal(F.hasBasis(doc, "S"), false);
});

test("growth, price CAGR and pros / cons", () => {
  assert.equal(Math.round(F.cagr(200, 100, 1)), 100);
  assert.equal(F.cagr(-1, 100, 3), null);
  const chart = { d: [20200102, 20230102, 20260102], c: [100, 150, 200] };
  assert.equal(Math.round(F.priceCAGR(chart, 3) * 10) / 10, Math.round(((200 / 150) ** (1 / 3) - 1) * 1000) / 10);
  assert.equal(F.priceCAGR(chart, 10), null);
  const pc = F.prosCons({ roe_3y: 25, debt_equity: 0.05, prom_hold: 20, np_ttm: -5, fin_kind: "company" });
  assert.equal(pc.pros.length, 2);
  assert.equal(pc.cons.length, 2);
  assert.deepEqual(F.resultDays(doc, "C").slice(0, 1), ["2025-03-31"]);
});
