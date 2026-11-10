"""Tight Setups and RS before Price, calibrated 10-Nov-2026 against the reference's 4 days of exports."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import engine, patterns  # noqa: E402

CFG = yaml.safe_load(open(ROOT / "config" / "patterns.yaml"))["tight_setup"]


def test_rti_is_today_range_between_5_day_min_and_max():
    h = np.array([10, 12, 11, 15, 10.5, 11.2, 10.6, 10.4])
    l = np.array([9, 9, 9, 9, 9, 9, 9, 9.0])
    c = (h + l) / 2
    out = patterns.tight_setup(h, l, c, None, CFG)
    r = h - l                                                    # ranges 1, 3, 2, 6, 1.5, 2.2, 1.6, 1.4
    assert out["rti"][4] == pytest.approx((1.5 - 1) / (6 - 1) * 100)
    assert out["rti"][7] == pytest.approx((r[7] - 1.4) / (6 - 1.4) * 100) and out["rti"][7] == 0
    assert np.isnan(out["rti"][3])                               # fewer than 5 sessions
    ok = np.nan_to_num(out["rti"], nan=999) <= 18
    run = 0
    for x in ok[::-1]:
        if not x:
            break
        run += 1
    assert out["rti_bars"][-1] == run


def test_rti_run_and_its_range():
    h = np.array([110, 104, 108, 103, 102.0, 102.5, 102.2, 102.4])
    l = np.array([100, 101, 100, 101, 101.0, 101.4, 101.3, 101.5])
    out = patterns.tight_setup(h, l, (h + l) / 2, None, CFG)
    b = int(out["rti_bars"][-1])
    assert b >= 3
    assert out["rti_range_pct"][-1] == pytest.approx((h[-b:].max() / l[-b:].min() - 1) * 100)


def test_box_is_the_longest_sideways_window():
    # a 20 % run-up, then 8 flat sessions in a 1 % band (ADR ~ 2 %): HITECHCORP-like
    up = np.linspace(330, 405, 40)
    flat = np.array([410.5, 411.4, 412.45, 410.75, 410.55, 410.0, 412.0, 411.15])
    c = np.r_[up, flat]
    h = np.r_[up * 1.01, flat + 2.0]
    l = np.r_[up * 0.99, flat - 0.5]
    l[-8:] = np.maximum(l[-8:], 410.0)
    adr = np.full(len(c), 2.0)
    out = patterns.tight_setup(h, l, c, adr, CFG)
    b = int(out["box_bars"][-1])
    assert b >= 4 and out["box_mode"][-1] in ("tight", "long", "tight+long")
    hh, ll = h[-b:].max(), l[-b:].min()
    assert out["box_range_pct"][-1] == pytest.approx((hh / ll - 1) * 100) and out["box_range_pct"][-1] <= 2.0
    assert out["box_drift_pct"][-1] == pytest.approx(abs(c[-1] - c[-b]) / (hh - ll) * 100) and out["box_drift_pct"][-1] <= 25
    assert (h[-b - 1:].max() / l[-b - 1:].min() - 1) * 100 > 2.0 or abs(c[-1] - c[-b - 1]) / (h[-b - 1:].max() - l[-b - 1:].min()) * 100 > 25


def test_no_box_when_the_price_trends():
    c = np.linspace(100, 120, 30)                                # +0.7 % a day: never sideways
    out = patterns.tight_setup(c * 1.005, c * 0.995, c, np.full(30, 1.0), CFG)
    assert np.isnan(out["box_bars"][-1])


def test_rs_before_price_uses_the_previous_index_close_for_today():
    cfg = yaml.safe_load(open(ROOT / "config" / "indicators.yaml"))
    assert cfg["events"]["rsb_index_lag"] == 1
    n = 80
    d = pd.bdate_range("2026-01-01", periods=n)
    c = np.r_[np.full(n - 1, 100.0), [102.0]]
    c[n - 30] = 110.0                                            # the 50-day closing high: price now 7 % under it
    ix = np.r_[np.full(n - 1, 1000.0), [1050.0]]                 # the index jumps 5 % today
    ix[n - 30] = 1200.0                                          # (the RS line was low on the price high day)
    b = pd.Series(ix, index=d)
    adj = pd.DataFrame({"date": d, "open": c, "high": c * 1.01, "low": c * 0.99, "close": c, "volume": np.full(n, 1000.0)})
    lag = engine.stock_fields(adj, bench={"NIFTY_MIDSMALLCAP_400": b}, cfg=cfg).iloc[-1]
    assert bool(lag["rsb_today"])                                # 102 / 1000 tops the line's 50-day high (100 / 1000)
    cfg["events"]["rsb_index_lag"] = 0
    same = engine.stock_fields(adj, bench={"NIFTY_MIDSMALLCAP_400": b}, cfg=cfg).iloc[-1]
    assert not bool(same["rsb_today"])                           # 102 / 1050 does not
