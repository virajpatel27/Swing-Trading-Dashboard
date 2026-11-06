"""Scanner plan Phase 10: market breadth counts and the plain-English read."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import breadth  # noqa: E402

CFG = {"days": 30, "min_sessions_stage": 5, "breakout": {"hold_sessions": 5}, "movers_pct": 4, "ad_window": 5,
       "participation_labels": [[20, "Very narrow"], [40, "Narrow"], [60, "Mixed"], [80, "Broad"], [101, "Very broad"]],
       "ad_labels": [[0.9, "More fallers"], [1.1, "Balanced"], [99, "More risers"]], "indices": []}


def stock(closes, liquid=True, stage="2"):
    c = pd.Series(closes, dtype=float)
    f = pd.DataFrame({"date": pd.bdate_range("2026-01-01", periods=len(c)), "close": c, "high": c * 1.01, "low": c * 0.99})
    f["chg_1d"] = c.pct_change() * 100
    for n in (20, 50, 200):
        sma = c.rolling(n, min_periods=n).mean()
        f[f"from_sma{n}"] = (c / sma - 1) * 100
    f["hi52"], f["lo52"] = f["high"].rolling(252, min_periods=1).max(), f["low"].rolling(252, min_periods=1).min()
    f["high_50d_prev"] = f["high"].shift(1).rolling(50, min_periods=50).max()
    f["sessions"] = np.arange(1, len(f) + 1)
    h = breadth.day_flags(f)
    h["close"], h["liquid_day"], h["stage"], h["chg_1d"] = c, liquid, stage, f["chg_1d"]
    h.index = f["date"]
    return h


def test_breadth_counts_breakouts_and_read():
    flat = [100.0] * 80
    up = [100.0] * 60 + [100 * 1.05 ** i for i in range(1, 21)]           # 5 % a day for the last 20 days
    brk = [100.0] * 70 + [104.0, 105, 106, 107, 108, 109, 110, 111, 112, 113]  # breaks the 50-day high once, holds
    fail = [100.0] * 70 + [104.0, 100, 99, 98, 97, 96, 95, 94, 93, 92]         # breaks out, falls back
    hists = {"FLAT": stock(flat, stage="4"), "UP": stock(up), "BRK": stock(brk), "FAIL": stock(fail, liquid=False, stage="3")}
    s = breadth.series(hists, CFG, liquid_only=False)
    last = s.iloc[-1]
    assert last["n"] == 4 and last["up4"] == 1 and last["adv"] == 2 and last["dec"] == 1
    assert last["pct_above20"] == 50.0                                    # UP and BRK above their 20-day average
    day_bo = hists["BRK"].index[70]
    assert s.loc[day_bo, "breakouts"] == 2 and s.loc[day_bo, "held"] == 1 and s.loc[day_bo, "failed"] == 1
    assert np.isnan(s["held"].iloc[-1])                                   # last 5 days: not known yet
    assert last["stage2"] == 50.0 and last["stage4"] == 25.0
    liq = breadth.series(hists, CFG, liquid_only=True)
    assert liq.iloc[-1]["n"] == 3 and liq.loc[day_bo, "breakouts"] == 1
    r = breadth.read(s, {}, CFG)
    assert r["breakouts"]["word"] in ("Working", "Mixed", "Failing") and "rule" in r["short_term"]
    assert breadth._label(45, CFG["participation_labels"]) == "Mixed"
