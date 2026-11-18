"""Data check Phase 6 (17-Nov-2026): RS line flags vs Midsmallcap 400 with the previous index close, industry RS rating,
resistance level."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from swingdash import engine, screen  # noqa: E402

CFG = {"rs_line_flags": {"benchmark": "MSC", "index_lag": 1, "window": 252, "min_sessions": 61}}


def frame(dates, closes):
    c = pd.Series(closes, dtype=float)
    return pd.DataFrame({"date": pd.to_datetime(dates), "open": c, "high": c * 1.01, "low": c * 0.99, "close": c, "volume": 1000.0})


def test_rs_line_flags_use_previous_index_close_and_61_sessions():
    days = pd.bdate_range("2025-01-01", periods=80)
    stock = [100.0] * 79 + [100.0]
    index = pd.Series([100.0] * 79 + [90.0], index=days)       # index falls 10 % today: the same-day RS line would jump
    f = engine.stock_fields(frame(days, stock), None, None, {"MSC": index}, CFG, {}, None)
    # today's point uses yesterday's index close (100): the line stays flat (at its high since day 61), so no NEW high today
    assert bool(f["rs_line_52w_high"].iat[-1]) and not bool(f["rs_line_new_high"].iat[-1])
    rising = [100.0 + i for i in range(80)]
    g = engine.stock_fields(frame(days, rising), None, None, {"MSC": pd.Series(100.0, index=days)}, CFG, {}, None)
    assert not g["rs_line_52w_high"].iloc[:60].any()           # fewer than 61 sessions: no flag
    assert bool(g["rs_line_52w_high"].iat[60]) and bool(g["rs_line_new_high"].iat[60])       # 61st session: first flag
    assert bool(g["rs_line_52w_high"].iat[-1]) and not bool(g["rs_line_new_high"].iat[-1])  # still at the high: not new
    assert g["rs_high_days"].iat[-1] == 0


def test_industry_rs_rating():
    mem = pd.DataFrame({"id": ["a", "b", "c", "d", "x"], "level": ["industry"] * 4 + ["sector"],
                        "name": ["I1", "I1", "I2", "I3", "S"]})
    rows = [{"id": "a", "rs_rating": 90}, {"id": "b", "rs_rating": 70}, {"id": "c", "rs_rating": 50}, {"id": "d", "rs_rating": 95},
            {"id": "x", "rs_rating": 10}]
    out = screen.industry_rs(rows, mem)
    assert out == {"a": 66.0, "b": 66.0, "c": 34.0, "d": 99.0}  # means 80 / 50 / 95 -> round(rank / 3 x 98 + 1)


def test_resistance_only_near_the_base_level():
    assert screen.resistance({"lvl_price": 110.0, "lvl_dist_adr": 2.5, "close": 100.0}) == {"res_level": 110.0, "res_dist": (100 / 110 - 1) * 100}
    assert screen.resistance({"lvl_price": 150.0, "lvl_dist_adr": 8.0, "close": 100.0})["res_level"] is None
    assert screen.resistance({"lvl_price": None, "lvl_dist_adr": None, "close": 100.0})["res_dist"] is None
    assert screen.resistance({"lvl_price": 110.0, "lvl_dist_adr": float("nan"), "close": 100.0})["res_level"] is None


def test_group_fields_use_all_members_and_all_groups():
    from swingdash import group_rank
    rows = pd.DataFrame({"ret_1m": [10.0, 0.0, 5.0], "ret_1w": [2.0, 0.0, 1.0], "liquid": ["True", "False", "False"]}, index=["a", "b", "c"])
    mem = pd.DataFrame({"id": ["a", "b", "c", "a", "b", "c"], "level": ["industry"] * 3 + ["sector"] * 3,
                        "name": ["I1", "I1", "I2", "S", "S", "S"]})
    out = group_rank.stock_fields(rows, {}, mem)
    assert out["a"]["industry_rank_1m"] == 1 and out["c"]["industry_rank_1m"] == 1      # I1 avg 5, I2 avg 5: tie
    assert out["b"]["industry_ret_1w"] == 1.0 and out["a"]["vs_industry_1m"] == 5.0       # illiquid b counts too
    assert out["a"]["sector_rank_1m"] == 1 and out["a"]["sector_ret_1w"] == 1.0


def test_recent_orders_from_nse_order_filings():
    from swingdash import announcements as A
    assert A.order_amount_cr("Bagging of orders of Rs. 21.21 Crore by its WOS") == 21.21
    assert A.order_amount_cr("order worth INR 58 lakh") == 0.58 and A.order_amount_cr("₹1,250 cr order") == 1250.0
    assert A.order_amount_cr("Rs 1.2 billion contract") == 120.0 and A.order_amount_cr("Receipt of orders") is None
    df = pd.DataFrame({"dt": ["2026-07-01 10:00", "2026-10-01 10:00", "2026-11-10 10:00", "2026-11-12 10:00", "2026-11-20 10:00"],
                       "symbol": ["A", "A", "A", "B", "A"],
                       "desc": ["Bagging/Receiving of orders/contracts", "Bagging/Receiving of orders/contracts",
                                "Awarding of order(s)/contract(s)", "Press Release", "Bagging/Receiving of orders/contracts"],
                       "about": ["old", "X Limited has informed the Exchange regarding order of Rs 10 crore", "new order of Rs. 5 Cr", "", "future"]})
    out = A.recent_orders(df, "2026-11-16")
    assert list(out) == ["A"]                                        # B: a press release; A's filing of 20-Nov is after the day
    assert out["A"] == {"recent_order": "New order of Rs. 5 Cr", "recent_order_date": "2026-11-10", "recent_order_cr": 5.0}
