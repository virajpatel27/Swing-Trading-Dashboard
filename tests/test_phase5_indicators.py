"""Indicators checked against hand calculations and known behaviour."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import indicators as ind  # noqa: E402


def frame(close, high=None, low=None, volume=None):
    n = len(close)
    close = pd.Series(close, dtype=float)
    return pd.DataFrame({"date": pd.bdate_range("2020-01-01", periods=n), "open": close,
                         "high": close + 1 if high is None else pd.Series(high, dtype=float),
                         "low": close - 1 if low is None else pd.Series(low, dtype=float),
                         "close": close, "volume": [1000] * n if volume is None else volume})


def test_ema_matches_hand_calculation():
    s = pd.Series([10.0, 11, 12, 13, 14])
    e = ind.ema(s, 3)                      # alpha = 2/(3+1) = 0.5, seeded with the first value, shown from the 3rd row
    assert np.isnan(e.iat[1])
    # 10 -> 10.5 -> 11.25 -> 12.125 -> 13.0625
    assert e.iloc[2:].round(4).tolist() == [11.25, 12.125, 13.0625]
    assert ind.ema(pd.Series([5.0] * 30), 10).iat[-1] == 5.0


def test_rsi_limits_and_balance():
    up = pd.Series(np.arange(1, 40, dtype=float))
    assert ind.rsi(up).iat[-1] == 100.0                       # only gains
    assert ind.rsi(up[::-1].reset_index(drop=True)).iat[-1] == pytest.approx(0.0)
    zigzag = pd.Series([10.0, 11] * 40)
    assert ind.rsi(zigzag).iat[-1] == pytest.approx(50, abs=3)  # equal ups and downs
    assert ind.rsi(up).iloc[:14].isna().all()


def test_rsi_wilder_hand_calculation():
    # 14 gains of 1, then a loss of 2; Wilder smoothing (alpha 1/14) starting from the first change
    closes = pd.Series([float(x) for x in range(1, 16)] + [13.0])   # 14 gains of 1, then a loss of 2
    g = pd.Series([1.0] * 14 + [0.0])
    l = pd.Series([0.0] * 14 + [2.0])
    ag = g.ewm(alpha=1 / 14, adjust=False).mean().iat[-1]
    al = l.ewm(alpha=1 / 14, adjust=False).mean().iat[-1]
    assert ind.rsi(closes).iat[-1] == pytest.approx(100 - 100 / (1 + ag / al))


def test_macd_of_straight_line_converges_to_constant_and_zero_histogram():
    m = ind.macd(pd.Series(np.arange(300, dtype=float)))
    # for a line with slope 1, EMA lag = (n-1)/2 -> MACD = (26-1)/2 - (12-1)/2 = 7
    assert m["macd"].iat[-1] == pytest.approx(7.0, abs=1e-3)
    assert m["macd_hist"].iat[-1] == pytest.approx(0.0, abs=1e-3)


def test_atr_constant_range_and_gaps():
    df = frame([100.0] * 40)                                   # high - low = 2 every day
    assert ind.atr(df["high"], df["low"], df["close"]).iat[-1] == pytest.approx(2.0)
    gap = frame([100.0] * 20 + [110.0] * 20)                   # gap day: true range = high 111 - previous close 100 = 11
    a = ind.atr(gap["high"], gap["low"], gap["close"])
    assert a.iat[20] == pytest.approx(2 + (11 - 2) / 14)


def test_trend_rules():
    assert ind.trend(110, 105, 100, 90) == "strong uptrend"
    assert ind.trend(102, 103, 100, 90) == "uptrend"
    assert ind.trend(80, 85, 90, 100) == "strong downtrend"
    assert ind.trend(88, 87, 90, 100) == "downtrend"
    assert ind.trend(95, 96, 100, 90) == "sideways"
    assert ind.trend(95, 96, 100, np.nan) == "not enough history"


def test_compute_columns_returns_52w_and_flags():
    close = list(np.linspace(100, 150, 300)) + [160.0]           # steady rise, then a jump to a new high
    vol = [1000] * 300 + [5000]
    out = ind.compute(frame(close, volume=vol))
    last = out.iloc[-1]
    assert last["chg_1d"] == pytest.approx(160 / 150 - 1)
    assert last["chg_1y"] == pytest.approx(160 / close[-1 - 252] - 1)
    assert np.isnan(last["chg_3y"])                                # not enough history
    assert last["hi52"] == 161 and last["lo52"] == pytest.approx(close[-252] - 1)
    assert bool(last["breakout_52w"]) and bool(last["breakout_20d"]) and last["vol_ratio"] == pytest.approx(5.0)
    assert not bool(last["breakdown_20d"])
    out2 = ind.compute(frame(close[:-1] + [100.0]))               # a crash to the low
    assert bool(out2.iloc[-1]["breakdown_20d"]) and not bool(out2.iloc[-1]["breakout_52w"])


def test_index_without_volume():
    out = ind.compute(frame(list(np.linspace(100, 120, 60))).drop(columns="volume"), has_volume=False)
    assert "vol_ratio" not in out.columns and "breakout_20d" in out.columns


def test_relative_strength_and_rating():
    dates = pd.Series(pd.bdate_range("2020-01-01", periods=300))
    own = pd.Series(np.linspace(100, 200, 300))
    bench = pd.DataFrame({"date": dates, "close": np.linspace(100, 110, 300)})
    r = ind.rs_vs(own, dates, bench, 63)
    assert r == pytest.approx((200 / own.iat[-64]) / (110 / bench["close"].iat[-64]) - 1)
    assert ind.rs_score(own) > ind.rs_score(bench["close"])
    rating = ind.rs_rating(pd.Series([0.1, 0.5, np.nan, -0.2]))
    assert rating.tolist()[:2] == [66.0, 99.0] and np.isnan(rating.iat[2]) and rating.iat[3] == 34.0
