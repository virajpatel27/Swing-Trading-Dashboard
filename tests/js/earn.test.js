// node --test tests/js   (Phase N6: our results grade on the earnings page)
const test = require("node:test");
const assert = require("node:assert/strict");
const SD = require("../../site/logic.js");

test("excellent, good, mixed, weak", () => {
  assert.equal(SD.earnGrade({ sales_g_yoy: 20, np_g_yoy: 30, np_last_q: 10, np_year_ago_q: 7 }), "Excellent");
  assert.equal(SD.earnGrade({ sales_g_yoy: 8, np_g_yoy: 6, np_last_q: 10, np_year_ago_q: 9 }), "Good");
  assert.equal(SD.earnGrade({ sales_g_yoy: 20, np_g_yoy: 2, np_last_q: 10, np_year_ago_q: 9.8 }), "Mixed");
  assert.equal(SD.earnGrade({ sales_g_yoy: -3, np_g_yoy: -10, np_last_q: 9, np_year_ago_q: 10 }), "Weak");
});

test("losses and turnarounds", () => {
  assert.equal(SD.earnGrade({ sales_g_yoy: 30, np_g_yoy: 50, np_last_q: -1, np_year_ago_q: -2 }), "Weak");       // still a loss
  assert.equal(SD.earnGrade({ sales_g_yoy: 18, np_g_yoy: null, np_last_q: 4, np_year_ago_q: -2 }), "Excellent"); // turnaround, sales +18 %
  assert.equal(SD.earnGrade({ sales_g_yoy: 2, np_g_yoy: null, np_last_q: 4, np_year_ago_q: 0 }), "Good");        // turnaround
});

test("no numbers = no grade", () => {
  assert.equal(SD.earnGrade({}), null);
  assert.equal(SD.earnGrade({ sales_g_yoy: null, np_g_yoy: null, np_last_q: 5 }), null);
});
