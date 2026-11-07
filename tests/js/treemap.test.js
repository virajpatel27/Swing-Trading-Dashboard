// node --test tests/js   (Phase N7: squarified treemap of the heatmap page)
const test = require("node:test");
const assert = require("node:assert/strict");
const SD = require("../../site/logic.js");

test("rectangles fill the box, keep the value shares and do not overlap", () => {
  const items = [60, 30, 20, 10, 6, 4, 2, 1].map((v, i) => ({ v, id: i }));
  const box = { x: 10, y: 20, w: 600, h: 300 };
  const r = SD.squarify(items, box);
  assert.equal(r.length, items.length);
  const area = r.reduce((a, q) => a + q.w * q.h, 0);
  assert.ok(Math.abs(area - 600 * 300) < 1e-6);
  const tot = items.reduce((a, it) => a + it.v, 0);
  for (const q of r) {
    assert.ok(Math.abs((q.w * q.h) / (600 * 300) - q.it.v / tot) < 1e-9);
    assert.ok(q.x >= 10 - 1e-9 && q.y >= 20 - 1e-9 && q.x + q.w <= 610 + 1e-6 && q.y + q.h <= 320 + 1e-6);
  }
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;
    assert.ok(!ov, `rect ${i} overlaps ${j}`);
  }
});

test("zero and empty inputs", () => {
  assert.deepEqual(SD.squarify([], { x: 0, y: 0, w: 10, h: 10 }), []);
  assert.deepEqual(SD.squarify([{ v: 0 }], { x: 0, y: 0, w: 10, h: 10 }), []);
  assert.equal(SD.squarify([{ v: 1 }, { v: 0 }], { x: 0, y: 0, w: 10, h: 10 }).length, 1);
});
