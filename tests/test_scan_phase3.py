"""Scanner plan Phase 3: classification overrides, themes, group indices."""
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import classification, groups, store, themes  # noqa: E402
from swingdash.adjust import ADJ_COLS  # noqa: E402

TODAY = date(2026, 11, 4)


def test_overrides_fill_gaps_and_old_style_but_never_beat_nse(tmp_path):
    cls = tmp_path / "classification.csv"
    pd.DataFrame({"symbol": ["GOOD", "OLD", "NONE"], "macro": ["Energy", "", ""],
                  "sector": ["Oil Gas & Consumable Fuels", "TEXTILES", ""], "industry": ["Petroleum Products", "TEXTILES - COTTON", ""],
                  "basic_industry": ["Refineries & Marketing", "SPINNING", ""], "indices": "", "source": "NSE",
                  "fetched": "2026-11-01"}).to_csv(cls, index=False)
    ov = tmp_path / "ov.csv"
    pd.DataFrame({"symbol": ["GOOD", "OLD", "NONE", "NEW"], "macro": "M", "sector": ["X", "Textiles", "Services", "IT"],
                  "industry": "I", "basic_industry": "B", "source": ["BSE", "BSE", "manual", "manual"], "note": ""}).to_csv(ov, index=False)
    d = classification.load(cls, ov)
    # NSE's answer wins over the override; its spelling follows the reference list (punctuation only, 13-Nov-2026)
    assert d.loc["GOOD", "sector"] == "Oil, Gas & Consumable Fuels" and d.loc["GOOD", "class_source"] == "NSE"
    assert d.loc["OLD", "sector"] == "Textiles" and d.loc["OLD", "class_source"] == "BSE"
    assert d.loc["NONE", "class_source"] == "manual" and d.loc["NEW", "sector"] == "IT"
    assert classification.old_style("AUTOMOBILE") and not classification.old_style("Automobile and Auto Components")


def test_themes_from_nse_index_industry_and_manual():
    master = pd.DataFrame({"symbol": ["HAL", "BEL", "SMALLDEF", "DIXON", "GONE", "X"], "name": list("abcdef"),
                           "status": ["active"] * 4 + ["inactive", "active"]})
    cls = pd.DataFrame({"indices": ["NIFTY 50;NIFTY INDIA DEFENCE", "NIFTY INDIA DEFENCE", "", "", "", ""],
                        "basic_industry": ["Aerospace & Defense", "Aerospace & Defense", "Aerospace & Defense",
                                           "Consumer Electronics", "Aerospace & Defense", "Pharmaceuticals"]},
                       index=master["symbol"])
    rules = {"Defence": {"nse_indices": ["NIFTY INDIA DEFENCE"], "basic_industries": ["Aerospace & Defense"],
                         "exclude": ["BEL"]},
             "EMS": {"symbols": ["DIXON", "NOPE"]}}
    df, warn = themes.build(rules, master, cls)
    got = {(r.theme, r.symbol): r.source for r in df.itertuples()}
    assert got[("Defence", "HAL")] == "NSE index NIFTY INDIA DEFENCE"              # index wins over industry
    assert got[("Defence", "SMALLDEF")] == "NSE industry Aerospace & Defense"
    assert ("Defence", "BEL") not in got and ("Defence", "GONE") not in got       # excluded / not active
    assert got[("EMS", "DIXON")] == "manual - check"
    assert any("NOPE" in w for w in warn)
    assert "| Defence | 2 | 1 | 1 | 0 |" in themes.review(df, master, warn)


def test_index_series_equal_weight_median_and_min_members():
    d = pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03"])
    rets = pd.DataFrame({"A": [np.nan, 0.10, 0.0], "B": [np.nan, 0.0, 0.02], "C": [np.nan, -0.04, np.nan]}, index=d)
    s = groups.index_series(rets, 1000, 3)
    assert s["date"].iat[0] == pd.Timestamp("2020-01-02") and s["group_index"].iat[0] == 1000   # first day with 3 members
    assert len(s) == 2 and s["group_members"].tolist() == [3, 2]
    assert np.isnan(s["group_ret_mean"].iat[1])                  # only 2 members on 03-Jan: no value, index flat
    assert s["group_index"].iat[1] == 1000
    s2 = groups.index_series(rets, 1000, 2)
    assert s2["date"].iat[0] == pd.Timestamp("2020-01-02")
    assert abs(s2["group_index"].iat[1] - 1000 * 1.01) < 1e-6    # mean of 0.0 and 0.02
    assert abs(s2["group_ret_median"].iat[1] - 0.01) < 1e-12
    assert groups.index_series(rets.iloc[:, :1], 1000, 3).empty


def test_daily_returns_skip_bad_moves_and_use_traded_days():
    d = pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-06"])
    closes = pd.DataFrame({"A": [100, np.nan, 110, 300]}, index=d)
    r = groups.daily_returns(closes, 0.5)
    assert np.isnan(r.loc["2020-01-02", "A"]) and abs(r.loc["2020-01-03", "A"] - 0.10) < 1e-12
    assert np.isnan(r.loc["2020-01-06", "A"])                     # +173 %: left out


def test_slug():
    assert groups.slug("Aluminium, Copper & Zinc Products") == groups.slug("Aluminium Copper & Zinc Products")
    assert groups.slug("Oil Gas & Consumable Fuels") == "oil-gas-and-consumable-fuels"


def test_build_writes_groups_and_liquid_rule(tmp_path):
    root = tmp_path
    data = root / "data"
    (data / "meta").mkdir(parents=True)
    syms = ["A", "B", "C", "D"]
    pd.DataFrame({"symbol": syms, "id": syms, "name": syms, "status": "active"}).to_csv(data / "meta" / "stocks.csv", index=False)
    pd.DataFrame({"symbol": syms, "macro": "", "sector": ["IT", "IT", "IT", "Power"], "industry": "",
                  "basic_industry": ["Software", "Software", "Software", "Utilities"], "indices": "", "source": "NSE",
                  "fetched": "2026-11-01"}).to_csv(data / "meta" / "classification.csv", index=False)
    pd.DataFrame({"theme": ["T"] * 3, "symbol": ["A", "B", "D"], "source": "x"}).to_csv(data / "meta" / "themes.csv", index=False)
    days = pd.bdate_range("2026-08-03", periods=60)
    for i, s in enumerate(syms):
        close = 100 * (1 + 0.01 * (i + 1)) ** np.arange(60)
        adj = pd.DataFrame({"date": days, "open": close, "high": close, "low": close, "close": close,
                            "volume": 100, "factor": 1.0})
        store.write(data / "stocks" / "adjusted" / s, adj, ADJ_COLS, TODAY)
        raw = adj.assign(prev_close=close, value=5e7 if s != "C" else 1e5, series="EQ")   # C is not liquid
        store.write(data / "stocks" / "raw" / s, raw, store.STOCK_COLS, TODAY)
    lst = groups.build(root, {"min_members": 2}, TODAY, {"sessions": 30, "min_turnover_cr": 1, "min_price": 5},
                       log=lambda m: None)
    assert set(zip(lst["level"], lst["id"])) == {("sector", "it"), ("sector", "power"), ("industry", "software"),
                                                  ("industry", "utilities"), ("theme", "t")}
    it = store.read(data / "groups" / "sector" / "it", groups.COLS)
    assert int(it["group_members"].iat[-1]) == 2                  # C never counts (turnover Rs 0.01 Cr)
    assert abs(it["group_ret_mean"].iat[-1] - 0.015) < 1e-9       # mean of A (1 %) and B (2 %)
    assert len(store.read(data / "groups" / "sector" / "power", groups.COLS)) == 0       # 1 member < 2: no series
    assert (data / "meta" / "groups.csv").exists()
    pd.DataFrame({"theme": [], "symbol": [], "source": []}).to_csv(data / "meta" / "themes.csv", index=False)
    groups.build(root, {"min_members": 2}, TODAY, {}, log=lambda m: None)
    assert not (data / "groups" / "theme" / "t").exists()        # theme gone -> folder removed
