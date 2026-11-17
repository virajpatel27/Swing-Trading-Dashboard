"""Data check Phase 3 (17-Nov-2026): 52-week window after a trading gap, 1Y = 252 sessions, 20-day high needs 20 sessions,
returns since listing."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from swingdash import engine, screen  # noqa: E402


def frame(dates, closes):
    c = pd.Series(closes, dtype=float)
    return pd.DataFrame({"date": pd.to_datetime(dates), "open": c, "high": c * 1.01, "low": c * 0.99, "close": c, "volume": 1000.0})


def test_year_window_stops_at_400_days_after_a_gap():
    d = pd.Series(list(pd.bdate_range("2020-01-01", periods=300)) + list(pd.bdate_range("2026-01-01", periods=30)))
    w = engine.year_window(d)
    assert w[299] == 252                                  # normal: 252 sessions
    assert w[-1] == 30                                    # after a 6-year gap: only the last 30 sessions (within 400 days)
    s = pd.Series([1000.0] * 300 + [100.0] * 29 + [110.0])
    assert engine.rolling_by_len(s, w, "max").iat[-1] == 110.0
    assert engine.days_since_max(s, 252, w).iat[-1] == 0


def test_returns_and_highs():
    days = pd.bdate_range("2025-01-01", periods=300)
    f = engine.stock_fields(frame(days, np.linspace(100, 400, 300)), None, None, None, {}, {}, None)
    assert abs(f["ret_1y"].iat[-1] - (400 / f["close"].iat[-253] - 1) * 100) < 1e-9      # 252 sessions back
    young = engine.stock_fields(frame(days[:10], [100.0] * 10), None, None, None, {}, {}, None)
    assert young["high_20d"].isna().all()                                              # fewer than 20 sessions


def test_listing_moves():
    days = pd.bdate_range("2024-03-01", periods=40)
    f = frame(days, [100.0] * 39 + [150.0])
    f.loc[0, "open"], f.loc[0, "high"] = 120.0, 125.0
    m = screen.listing_moves(f, "2024-03-01", {})
    assert m["ret_since_ipo"] == 25.0 and m["from_listing_high"] == 20.0
    assert screen.listing_moves(f, "2020-01-01", {}) == {}                             # listed before 2023: none
    assert screen.listing_moves(f, "", {}) == {}                                       # bulk admission (cleared): none
