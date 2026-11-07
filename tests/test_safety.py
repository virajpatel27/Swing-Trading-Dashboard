"""Step 5 safety checks (07-Nov-2026): shrink guard and the NSE-vs-BSE close cross-check."""
import json
from datetime import date

import pandas as pd

from swingdash import crosscheck_bse, shrink_guard, store


def test_shrink_guard(tmp_path, monkeypatch):
    (tmp_path / "data" / "meta").mkdir(parents=True)
    (tmp_path / "data" / "meta" / "stocks.csv").write_text("h\n" + "x\n" * 50, encoding="utf-8")
    (tmp_path / "data" / "fundamentals").mkdir()
    for i in range(10):
        (tmp_path / "data" / "fundamentals" / f"{i}.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(shrink_guard, "head_lines", lambda root, rel: 100 if rel == "data/meta/stocks.csv" else None)
    monkeypatch.setattr(shrink_guard, "head_files", lambda root, rel: 40 if rel == "data/fundamentals" else None)
    got = shrink_guard.check(tmp_path)
    assert {(i["instrument"], i["level"], i["check"]) for i in got} == {
        ("data/meta/stocks.csv", "error", "file shrank"), ("data/fundamentals", "error", "folder shrank")}
    monkeypatch.setattr(shrink_guard, "head_lines", lambda root, rel: 55 if rel == "data/meta/stocks.csv" else None)
    monkeypatch.setattr(shrink_guard, "head_files", lambda root, rel: None)
    assert shrink_guard.check(tmp_path) == []                         # 51 of 55 lines: fine


def _data(tmp_path, closes):
    data = tmp_path / "data"
    (data / "meta").mkdir(parents=True)
    rows = []
    for i, (sym, c) in enumerate(closes.items()):
        rows.append({"symbol": sym, "id": sym, "isin": f"INE{i:09d}", "status": "active", "liquid": "True"})
        store.write(data / "stocks" / "raw" / sym, pd.DataFrame({"date": [pd.Timestamp("2026-11-06")], "open": [c], "high": [c],
                    "low": [c], "close": [c], "prev_close": [c], "volume": [1000], "value": [c * 1000], "series": ["EQ"]}),
                    store.STOCK_COLS, date(2026, 11, 6))
    pd.DataFrame(rows).to_csv(data / "meta" / "stocks.csv", index=False)
    return data


def test_bse_crosscheck(tmp_path):
    data = _data(tmp_path, {"AAA": 100.0, "BBB": 200.0, "CCC": 50.0})
    text = ("TradDt,FinInstrmTp,ISIN,ClsPric,TtlTradgVol\n2026-11-06,STK,INE000000000,100.5,5000\n"
            "2026-11-06,STK,INE000000001,212.0,5000\n2026-11-06,STK,INE000000002,40.0,10\n2026-11-05,STK,INE000000002,50,5000\n")
    bse = crosscheck_bse.parse(text, date(2026, 11, 6))
    mism, s = crosscheck_bse.compare(data, bse, date(2026, 11, 6))
    assert s["compared"] == 2 and list(mism["symbol"]) == ["BBB"]          # CCC: too little BSE volume that day
    (data / "meta" / "crosscheck_bse.csv").write_text(mism.to_csv(index=False), encoding="utf-8")
    (data / "meta" / "crosscheck_bse.json").write_text(json.dumps(s), encoding="utf-8")
    levels = sorted(i["level"] for i in crosscheck_bse.issues(data, max_share=10))
    assert levels == ["error", "warn"]                                       # 1 of 2 = 50 % > 10 %: the whole day looks wrong
