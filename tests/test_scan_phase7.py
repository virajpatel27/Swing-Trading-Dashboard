"""Scanner plan Phase 7: pattern detector (pivots, bases, breakouts, contractions, flags)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import patterns  # noqa: E402


def frame(close, high=None, low=None, rvol=1.0):
    c = np.asarray(close, float)
    h = c * 1.01 if high is None else np.asarray(high, float)
    l = c * 0.99 if low is None else np.asarray(low, float)
    return pd.DataFrame({"date": pd.bdate_range("2025-01-01", periods=len(c)), "high": h, "low": l, "close": c,
                         "rvol": rvol, "from_sma50": 0.0, "hi52": pd.Series(h).rolling(252, min_periods=1).max()})


CFG = {"days": 300, "pivot": {"min_age": 15, "local": 20, "max_age": 260},
       "weekly_pivot": {"min_age": 85, "local": 60, "max_age": 390}, "breakout": {"rvol": 1.5}, "vcp": {"swing_pct": 5},
       "flag": {"pole_days": 15}, "tight": {"days": 5}}


def test_pivot_is_the_base_top_and_disappears_after_a_breakout():
    up = list(np.linspace(50, 100, 80))                       # rise to 100 (bar 79)
    base = list(np.linspace(99, 85, 15)) + list(np.linspace(85, 97, 15))   # 30-session base below 100
    c = up + base
    f = frame(c)
    out = patterns.fields(f, CFG)
    t = len(c) - 1
    assert out["pivot"][t] == f["high"].iat[79] and out["pivot_age"][t] == t - 79
    assert out["dist_pivot"][t] < 0 and 10 < out["base_depth"][t] < 20 and out["base_prior_gain"][t] > 15
    c2 = c + [104]                                            # close above the pivot: breakout, no pivot any more
    f2 = frame(c2, rvol=np.r_[np.ones(len(c)), 2.5])
    o2 = patterns.fields(f2, CFG)
    assert np.isnan(o2["pivot"][-1]) and o2["breakout_days"][-1] == 0
    assert o2["breakout_level"][-1] == f["high"].iat[79] and o2["breakout_rvol"][-1] == 2.5
    assert o2["breakout_base_age"][-1] == t - 79


def test_young_highs_are_not_pivots():
    c = list(np.linspace(50, 100, 60)) + list(np.linspace(99, 95, 10))   # only 10 sessions after the top
    out = patterns.fields(frame(c), CFG)
    assert np.isnan(out["pivot"][-1])


def test_contractions_shrink_and_are_counted():
    # base top 100, pullbacks to 80 (-20 %), back to 96, to 86 (-10 %), back to 95, to 91 (-4 %), now 94
    seg = [100, 90, 80, 88, 96, 90, 86, 92, 95, 93, 91, 94]
    c = np.array(seg, float)
    d = patterns.contractions(c, c, 0, 3)
    assert [round(x, 1) for x in d] == [20.0, 10.4, 4.2]
    pts = patterns._zigzag(c, 3)
    assert [k for _, k in pts] == ["H", "L", "H", "L", "H", "L", "H"]


def test_tight_inside_new_low_and_flag():
    c = list(np.linspace(50, 60, 40)) + list(np.linspace(60, 90, 10)) + [89, 88.5, 89.2, 88.8, 89]
    f = frame(c)
    out = patterns.fields(f, CFG)
    assert out["tight_pct"][-1] < 1.5
    assert out["flag_pole_pct"][-1] >= 40 and 3 <= out["flag_days"][-1] <= 15 and out["flag_depth_pct"][-1] < 5
    h = np.array([10, 11, 10.5, 10.2]); l = np.array([9, 9.5, 9.6, 8.0])
    o = patterns.fields(frame([9.5, 10.5, 10, 9], high=h, low=l), CFG)
    assert list(o["inside_day"]) == [False, False, True, False]
