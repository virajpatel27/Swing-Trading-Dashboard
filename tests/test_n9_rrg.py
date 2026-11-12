"""Phase N9: RRG tails (daily / weekly) and index benchmarks in the group table."""
import numpy as np
import pandas as pd

from swingdash import group_rank


def _data():
    days = pd.bdate_range("2026-01-01", periods=140)
    rng = np.random.default_rng(3)
    closes = {f"S{i}": 100 * np.cumprod(1 + rng.normal(0.002 if i < 6 else -0.001, 0.003, len(days))) for i in range(12)}
    C = pd.DataFrame(closes, index=days)
    mem = pd.DataFrame([("sector", "A" if i < 6 else "B", "", f"S{i}", f"S{i}") for i in range(12)],
                       columns=["level", "name", "parent", "symbol", "id"])
    rows = pd.DataFrame({"id": list(C.columns), "ret_1m": 1.0, "ret_1w": 1.0, "chg_1d": 0.5, "ret_3m": 1, "ret_1y": 1, "ret_ytd": 1,
                         "from_sma50": 1.0, "high": 10, "high_20d": 11, "low": 5, "low_20d": 4}).set_index("id")
    return C, mem, rows


def test_tail_points_daily_and_weekly():
    s = pd.Series(range(30), dtype=float)
    t = group_rank.tail_points(s, 4, 3)
    assert t["d"] == [26.0, 27.0, 28.0, 29.0] and t["w"] == [19.0, 24.0, 29.0]
    d = group_rank.tail_dates(pd.bdate_range("2026-01-01", periods=12), 2, 2)
    assert d["d"] == ["2026-01-15", "2026-01-16"] and d["w"] == ["2026-01-09", "2026-01-16"]


def test_group_table_has_tails_for_market_and_benchmarks():
    C, mem, rows = _data()
    bench = pd.Series(np.linspace(100, 110, len(C)), index=C.index)
    cfg = {"ratio_window": 40, "momentum_lag": 5, "min_members": 3, "tail_daily": 6, "tail_weekly": 4}
    t = group_rank.group_table(rows, C, mem, cfg, {"NIFTY_50": bench, "EMPTY": pd.Series(dtype=float)})
    a = {g["name"]: g for g in t["sector"]}["A"]
    assert set(a["tails"]) == {"mkt", "NIFTY_50"}
    for k in ("mkt", "NIFTY_50"):
        assert len(a["tails"][k]["s"]["d"]) == 6 and len(a["tails"][k]["m"]["w"]) == 4
    assert a["tails"]["mkt"]["s"]["d"][-1] == round(a["strength"], 1)
    assert a["tails"]["NIFTY_50"]["s"]["d"] != a["tails"]["mkt"]["s"]["d"]          # a different yardstick


def test_rrg_settings_only_change_the_tails():
    """The RRG page's own settings (`rrg:`) smooth the RS first; the Groups table keeps ratio_window / momentum_lag."""
    cfg = {"ratio_window": 20, "momentum_lag": 5, "rrg": {"smooth": 5, "ratio_window": 10, "momentum_lag": 3}}
    rc = group_rank.rrg_cfg(cfg)
    assert (rc["smooth"], rc["ratio_window"], rc["momentum_lag"]) == (5, 10, 3)
    assert group_rank.rrg_cfg({"ratio_window": 20, "momentum_lag": 5})["smooth"] == 1
    idx = pd.bdate_range("2026-01-01", periods=60)
    closes = pd.DataFrame({"a": np.linspace(100, 160, 60), "b": np.linspace(100, 90, 60), "c": 100 + 5 * np.sin(np.arange(60))}, index=idx)
    s1, _ = group_rank.rrg(closes, {"G": ["a", "c"]}, cfg)
    s2, _ = group_rank.rrg(closes, {"G": ["a", "c"]}, rc)
    assert s1["G"].notna().sum() > 0 and s2["G"].notna().sum() > 0
    assert not np.allclose(s1["G"].iloc[-5:], s2["G"].iloc[-5:])
