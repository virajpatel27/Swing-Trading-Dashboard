// The website's scanner rules (site/scan.js) must find exactly what swingdash/scanners.py finds, and describe them the same.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../../site/scan.js");

const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));

test("every scanner: same stocks and same plain-English rule as Python", () => {
  const rows = fx("scan_rows.json"), { labels, scanners, expected } = fx("scan_expected.json");
  for (const sc of scanners) {
    assert.deepStrictEqual(S.run(rows, sc).map((r) => r.id), expected[sc.id].ids, sc.id);
    assert.strictEqual(S.describe(sc.rule, labels), expected[sc.id].text, sc.id);
  }
});

test("conditions: field vs field x mult, between, in, is, missing values", () => {
  const r = { close: 110, sma50: 100, x: null, st: "2A", flag: true };
  assert.ok(S.cond(r, { field: "close", op: ">", field2: "sma50", mult: 1.05 }));
  assert.ok(!S.cond(r, { field: "close", op: ">", field2: "sma50", mult: 1.2 }));
  assert.ok(S.cond(r, { field: "close", op: "between", value: [100, 110] }));
  assert.ok(S.cond(r, { field: "st", op: "in", value: ["2", "2A"] }));
  assert.ok(S.cond(r, { field: "flag", op: "is", value: true }) && !S.cond(r, { field: "flag", op: "is", value: false }));
  assert.ok(!S.cond(r, { field: "x", op: "<", value: 5 }) && !S.cond(r, { field: "x", op: "is", value: false }));
  assert.ok(S.test(r, { any: [{ field: "x", op: ">", value: 0 }, { field: "close", op: ">=", value: 110 }] }));
  assert.strictEqual(S.describe({ all: [] }), "every stock");
});
