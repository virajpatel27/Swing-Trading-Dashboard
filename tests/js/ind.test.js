// The chart's indicators (site/ind.js) must give the pipeline's values (swingdash/engine.py) on real stocks.
// Expected values: tests/js/make_expected.py.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../../site/ind.js");

const FIX = path.join(__dirname, "..", "fixtures");
const STOCKS = ["RELIANCE", "TITAN", "TRENT"];

function candles(sym) {
  const [head, ...lines] = fs.readFileSync(path.join(FIX, `golden_${sym}.csv`), "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(","), o = {};
    cols.forEach((c, i) => { o[c] = c === "date" ? v[i] : Number(v[i]); });
    return { time: o.date, open: o.open, high: o.high, low: o.low, close: o.close, volume: o.volume };
  });
}

function same(name, ours, exp) {
  assert.strictEqual(ours.length, exp.length, `${name}: length`);
  for (let i = 0; i < exp.length; i++) {
    const a = ours[i] == null || Number.isNaN(ours[i]) ? null : ours[i], b = exp[i];
    if (b === null || a === null) { assert.strictEqual(a, b, `${name}[${i}]: ${a} vs ${b}`); continue; }
    if (typeof b === "number") assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b)), `${name}[${i}]: ${a} vs ${b}`);
    else assert.strictEqual(a, b, `${name}[${i}]: ${a} vs ${b}`);
  }
}

for (const sym of STOCKS) {
  test(`indicators equal the pipeline: ${sym}`, () => {
    const exp = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", `expected_${sym}.json`), "utf8"));
    const cs = candles(sym);
    const o = cs.map((x) => x.open), h = cs.map((x) => x.high), l = cs.map((x) => x.low), c = cs.map((x) => x.close), v = cs.map((x) => x.volume);
    same("sma50", I.sma(c, 50), exp.sma50);
    same("ema21", I.ema(c, 21), exp.ema21);
    same("rsi14", I.rsi(c, 14), exp.rsi14);
    const m = I.macd(c);
    same("macd", m.line, exp.macd); same("macd_signal", m.signal, exp.macd_signal); same("macd_hist", m.hist, exp.macd_hist);
    same("mfi14", I.mfi(h, l, c, v, 14), exp.mfi14);
    same("atr14", I.atr(h, l, c, 14), exp.atr14);
    same("adr_pct", I.adr(h, l, 20), exp.adr_pct);
    const bb = I.bollinger(c, 20, 2);
    same("bb_mid", bb.mid, exp.bb_mid); same("bb_upper", bb.up, exp.bb_upper); same("bb_lower", bb.lo, exp.bb_lower);
    const st = I.supertrend(h, l, c, 10, 3);
    same("supertrend", st.line, exp.supertrend); same("supertrend_dir", st.dir, exp.supertrend_dir);
    same("swing_fast", I.t3(c, 8, 0.65), exp.swing_fast); same("swing_slow", I.t3(c, 14, 0.65), exp.swing_slow);
    same("rel_ext", I.relativeExtension(c, 50, 250), exp.rel_ext);
    same("trend_intensity", I.trendIntensity(c, 7, 65), exp.trend_intensity);
    same("stage", I.stage(c), exp.stage);
    const vf = I.volumeFlags(cs);
    same("avg_vol20", vf.map((x) => x.avg20), exp.avg_vol20);
    same("rvol", vf.map((x) => x.rvol), exp.rvol);
    for (const [k, e] of [["high", "high_volume"], ["hvy", "hvy"], ["hvq", "hvq"], ["lvq", "lvq"], ["pocket", "pocket_pivot"], ["dry", "dry_up"]]) {
      same(e, vf.map((x) => x[k]), exp[e].map((x) => (x === null ? false : x)));
    }
    const pv = I.pivots(h, c, { minAge: 15, local: 20, maxAge: 260, start: c.length - 300 });
    same("pivot", pv.piv, exp.pivot);
    same("pivot_age", pv.idx.map((i, t) => (i < 0 ? null : t - i)), exp.pivot_age);
    const t = c.length - 1, age = exp.pivot_age[t];
    if (age != null) {
      const d = I.contractions(c, h, t - age, 5).map((x) => x.depth);
      let run = d.length ? 1 : 0;
      for (let k = d.length - 1; k > 0 && d[k] < d[k - 1]; k--) run++;
      assert.strictEqual(run, exp.vcp_contractions[t], "vcp_contractions");
      if (d.length) assert.ok(Math.abs(d[d.length - 1] - exp.vcp_last_pct[t]) < 1e-9, "vcp_last_pct");
    }
    void o;
  });
}

test("swing points alternate high / low with % moves", () => {
  const cs = [100, 110, 120, 100, 90, 95, 110, 130, 115].map((x, i) => ({ time: `2026-01-${String(i + 1).padStart(2, "0")}`, close: x }));
  const s = I.swings(cs, 10);
  assert.deepStrictEqual(s.map((p) => p.kind), ["high", "low", "high", "low"]);
  assert.strictEqual(s[0].price, 120);
  assert.ok(Math.abs(s[1].move - (90 / 120 - 1) * 100) < 1e-9);
});

test("RS line uses the last benchmark close on or before each day", () => {
  const cs = [{ time: "2026-01-01", close: 10 }, { time: "2026-01-03", close: 12 }];
  const b = [{ time: "2026-01-01", close: 100 }, { time: "2026-01-02", close: 200 }];
  assert.deepStrictEqual(I.rsLine(cs, b), [0.1, 0.06]);
});
