"""Scanner plan Phase 9: results-day reaction, quarter trends for the earnings scanners, group ranks / tags."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import earnings, fundamentals as F, group_rank  # noqa: E402


def frame(rows):
    df = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"])
    df["date"] = pd.to_datetime(df["date"])
    df["avg_vol50"] = 100.0
    return df


def test_reaction_picks_the_bigger_gap_and_checks_the_fill():
    f = frame([("2026-10-01", 100, 101, 99, 100, 100), ("2026-10-02", 100, 101, 99, 100, 100),     # results 02-Oct after market
               ("2026-10-05", 110, 116, 109, 115, 450),                                              # gap +10 %, volume 4.5x
               ("2026-10-06", 115, 117, 112, 116, 200), ("2026-10-07", 116, 118, 114, 117, 150)])
    r = earnings.reaction(f, ["2026-07-20", "2026-10-02"])
    assert r["earn_date"] == "2026-10-05" and r["earn_sessions"] == 2
    assert r["earn_gap_pct"] == 10.0 and r["earn_chg_pct"] == 15.0 and r["earn_vol_x"] == 4.5
    assert r["earn_close_pos"] == round(6 / 7 * 100, 2) and r["earn_held"] is True and r["earn_gap_filled"] is False
    f2 = pd.concat([f, frame([("2026-10-08", 105, 106, 99, 100, 100)])], ignore_index=True)
    assert earnings.reaction(f2, ["2026-10-02"])["earn_gap_filled"] is True
    assert earnings.reaction(f, ["2026-12-01"]) == {}                                               # not announced yet


def test_quarter_trends_streaks():
    ends = ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"]
    sales = [100, 100, 100, 100, 110, 115, 125]           # YoY growth 10, 15, 25: accelerating 2 quarters
    np_ = [-5, 5, 6, 7, 8, 9, 12]
    q = {e: {"sales": s, "np_owners": n, "eps": n / 10} for e, s, n in zip(ends, sales, np_)}
    t = F.quarter_trends(q, ends, lambda e, v: v["eps"], lambda v: v["np_owners"])
    assert t["sales_g_accel_qtrs"] == 2 and t["sales_qoq_up_qtrs"] == 3 and t["np_qoq_up_qtrs"] == 6
    assert t["np_year_ago_q"] == 6 and t["np_last_q"] == 12 and t["npm_last_q"] == 9.6
    assert F._streak([1, 2, None, 3, 4, 5]) == 2


def test_group_rank_tags_and_stock_fields():
    days = pd.bdate_range("2026-01-01", periods=120)
    rng = np.random.default_rng(1)
    closes = {}
    for i in range(12):                                 # A: rising lately, B: falling lately, others flat noise
        drift = 0.004 if i < 6 else -0.004
        r = rng.normal(0, 0.002, len(days))
        r[-40:] += drift
        closes[f"S{i}"] = 100 * np.cumprod(1 + r)
    for i in range(12, 24):
        closes[f"S{i}"] = 100 * np.cumprod(1 + rng.normal(0, 0.002, len(days)))
    C = pd.DataFrame(closes, index=days)
    mem = pd.DataFrame([("sector", "A" if i < 6 else "B" if i < 12 else "C", "", f"S{i}", f"S{i}") for i in range(24)]
                       + [("theme", "T1", "", f"S{i}", f"S{i}") for i in range(3)],
                       columns=["level", "name", "parent", "symbol", "id"])
    rows = pd.DataFrame({"id": list(C.columns), "ret_1m": [5.0] * 24, "ret_1w": [1.0] * 24, "chg_1d": 0.5, "ret_3m": 1, "ret_1y": 1,
                         "ret_ytd": 1, "from_sma50": [1.0] * 12 + [-1.0] * 12, "high": 10, "high_20d": [10] * 6 + [11] * 18,
                         "low": 5, "low_20d": 4}).set_index("id")
    cfg = {"ratio_window": 63, "momentum_lag": 10, "rank_change_sessions": 5, "min_members": 3, "tail_points": 5}
    t = group_rank.group_table(rows, C, mem, cfg)
    sec = {g["name"]: g for g in t["sector"]}
    assert sec["A"]["rank"] == 1 and sec["A"]["tag"] in ("Leading", "Weakening") and sec["B"]["tag"] in ("Lagging", "Improving")
    assert sec["A"]["hi20"] == 6 and sec["A"]["above50"] == 100.0 and sec["C"]["above50"] == 0.0 and len(sec["A"]["tail"]) == 5
    assert t["theme"][0]["name"] == "T1" and t["theme"][0]["small"] is False
    f = group_rank.stock_fields(rows, t, mem)
    assert f["S0"]["sector_rank"] == 1 and f["S0"]["vs_sector_1m"] == 0.0 and f["S0"]["theme"] == "T1"
    assert f["S0"]["theme_status"] == t["theme"][0]["tag"] and "theme" not in f["S20"]
    assert group_rank.tag_of(101, 99) == "Weakening" and group_rank.tag_of(99, 101) == "Improving"
