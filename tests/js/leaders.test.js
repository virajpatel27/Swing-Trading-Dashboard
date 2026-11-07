// node --test tests/js   (Phase N11: our leader score)
const test = require("node:test");
const assert = require("node:assert/strict");
const SD = require("../../site/logic.js");

const best = { rs_rating: 99, close: 120, sma50: 110, sma150: 100, sma200: 90, sma200_chg_1m: 2, from_hi52: 0, industry_rank: 1, eps_g_yoy: 40, sales_g_yoy: 20 };

test("a perfect leader scores 100 (RS 99 -> 99.6 rounds up)", () => {
  assert.equal(SD.leaderScore(best, 50), 100);
});

test("each part counts as documented", () => {
  assert.equal(SD.leaderScore({ ...best, from_hi52: -25 }, 50), 80);                  // nearness to the high = 20 %
  assert.equal(SD.leaderScore({ ...best, sma200_chg_1m: -1 }, 50), 96);               // one trend step = 25 x 15 %
  assert.equal(SD.leaderScore({ ...best, industry_rank: 50 }, 50), 85);               // worst industry = 0 of 15
  assert.equal(SD.leaderScore({ ...best, eps_g_yoy: null, sales_g_yoy: null }, 50), 93);   // no results = 30 of 100 x 10 %
  assert.equal(SD.leaderScore({ ...best, rs_rating: 49 }, 50), 80);
});

test("missing RS or price = no score", () => {
  assert.equal(SD.leaderScore({ close: 10 }), null);
  assert.equal(SD.leaderScore(null), null);
});
