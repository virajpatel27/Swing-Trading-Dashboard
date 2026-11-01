import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import snapshot, store  # noqa: E402
from swingdash.adjust import ADJ_COLS  # noqa: E402

TODAY = date(2026, 3, 1)


def series(closes, start="2024-01-01", volume=1000):
    d = pd.bdate_range(start, periods=len(closes))
    c = pd.Series(closes, dtype=float)
    return pd.DataFrame({"date": d, "open": c, "high": c * 1.01, "low": c * 0.99, "close": c, "volume": volume})


def make_market(tmp: Path):
    data = tmp / "data"
    n = 400
    up = np.linspace(100, 300, n)                  # strong stock
    flat = np.linspace(100, 105, n)                # weak stock
    old = np.linspace(100, 400, 300)               # stopped trading 100 days before the others -> stale (strong, but not ranked)
    for sid, closes in (("UPCO", up), ("FLAT", flat)):
        adj = series(closes).assign(factor=1.0)
        store.write(data / "stocks/adjusted" / sid, adj, ADJ_COLS, TODAY)
        raw = series(closes * 2).assign(prev_close=0.0, value=0.0, series="EQ")     # raw = 2x adjusted (a 1:1 bonus later)
        store.write(data / "stocks/raw" / sid, raw, store.STOCK_COLS, TODAY)
    store.write(data / "stocks/adjusted/OLDCO", series(old).assign(factor=1.0), ADJ_COLS, TODAY)
    store.write(data / "stocks/raw/OLDCO", series(old).assign(prev_close=0.0, value=0.0, series="EQ"), store.STOCK_COLS, TODAY)
    store.write(data / "indices/nse/NIFTY_50", series(np.linspace(100, 150, n))[store.INDEX_COLS], store.INDEX_COLS, TODAY)
    store.write(data / "indices/bse/SENSEX", series(np.linspace(100, 140, n))[store.INDEX_COLS], store.INDEX_COLS, TODAY)
    meta = data / "meta"
    meta.mkdir(parents=True)
    pd.DataFrame({"symbol": ["UPCO", "FLAT", "OLDCO"], "name": ["Up Co", "Flat Co", "Old Co"], "industry": ["IT", "Banks", "IT"],
                  "isin": ["A", "B", "C"], "series": ["EQ"] * 3, "id": ["UPCO", "FLAT", "OLDCO"]}).to_csv(meta / "universe_stocks.csv", index=False)
    pd.DataFrame({"symbol": ["UPCO"], "macro": ["Information Technology"], "sector": ["Information Technology"],
                  "industry": ["IT - Software"], "basic_industry": ["Computers - Software"], "indices": ["NIFTY 50"],
                  "source": ["NSE"], "fetched": ["2026-01-01"]}).to_csv(meta / "classification.csv", index=False)
    pd.DataFrame({"name": ["NIFTY 50"], "category": ["BROAD MARKET INDICES"], "id": ["NIFTY_50"]}).to_csv(meta / "indices_nse.csv", index=False)
    pd.DataFrame({"code": ["SENSEX"], "name": ["BSE SENSEX"], "id": ["SENSEX"]}).to_csv(meta / "indices_bse.csv", index=False)
    return data


def test_snapshot_rows_flags_and_relative_strength(tmp_path):
    data = make_market(tmp_path)
    latest, sectors = snapshot.build(data, log=lambda m: None)
    snap = pd.DataFrame(latest["rows"], columns=latest["columns"]).set_index("id")
    assert set(snap.index) == {"UPCO", "FLAT", "OLDCO", "NIFTY_50", "SENSEX"}
    up = snap.loc["UPCO"]
    assert up["close"] == 300.0 and up["raw_close"] == 600.0                       # indicators on adjusted, raw shown beside
    assert up["sector"] == "Information Technology" and up["industry"] == "IT - Software"
    assert snap.loc["FLAT", "sector"] == "Banks"                                   # no NSE class -> Nifty 500 list industry
    assert up["trend"] == "strong uptrend" and "above_50_200" in up["flags"] and "near_52w_high" in up["flags"]
    assert up["rs_3m"] > 0 > snap.loc["FLAT", "rs_3m"]                             # beats / trails NIFTY 50
    assert up["rs_rating"] > snap.loc["FLAT", "rs_rating"] and "strong_rs" in up["flags"]
    assert bool(snap.loc["OLDCO", "stale"]) and pd.isna(snap.loc["OLDCO", "rs_rating"])    # stale: not ranked
    assert snap.loc["SENSEX", "exchange"] == "BSE" and pd.isna(snap.loc["SENSEX", "volume"])
    assert latest["disclaimer"] == "Educational purpose only, not investment advice."
    assert [s["sector"] for s in sectors["sectors"]][0] == "Information Technology"  # strongest momentum first
    it = sectors["sectors"][0]
    assert it["stocks"] == 1 and it["industries"][0]["constituents"] == ["UPCO"]     # stale OLDCO left out


def test_snapshot_file_is_valid_json_one_row_per_line(tmp_path):
    data = make_market(tmp_path)
    latest, sectors = snapshot.build(data, log=lambda m: None)
    snapshot.write(data, latest, sectors)
    text = (data / "snapshot/latest.json").read_text(encoding="utf-8")
    back = json.loads(text)
    assert back["columns"] == snapshot.COLUMNS and len(back["rows"]) == 5
    assert text.count("\n") >= 5 + 2                                               # one instrument per line (small git diffs)
    assert json.loads((data / "snapshot/sectors.json").read_text())["sectors"]


def test_data_check_catches_incomplete_snapshot(tmp_path):
    from swingdash import meta
    data = make_market(tmp_path)
    latest, sectors = snapshot.build(data, log=lambda m: None)
    snapshot.write(data, latest, sectors)
    rows = [{"kind": "stock", "rows": 400, "last_date": latest["data_date"]}] * 5
    assert meta.check_snapshot(data, rows) == []
    latest["rows"] = latest["rows"][:2]
    snapshot.write(data, latest, sectors)
    assert meta.check_snapshot(data, rows)[0]["check"] == "snapshot incomplete"
