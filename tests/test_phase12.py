"""Scanner plan Phase 12 (hardening): the daily warning about stocks without history, fundamentals file check."""
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import daily, fundamentals, store  # noqa: E402


def test_history_warning_skips_new_listings_inactive_and_complete_stocks(tmp_path):
    data = tmp_path / "data"
    (data / "meta").mkdir(parents=True)
    rows = [("NEWIPO", "2026-10-20", "active"), ("OLDGAP", "2010-05-01", "active"), ("DEAD", "2012-01-01", "inactive"),
            ("RARE", "2026-08-01", "active"), ("FULL", "2015-01-01", "active")]
    pd.DataFrame({"symbol": [r[0] for r in rows], "id": [r[0] for r in rows]}).to_csv(data / "meta" / "universe_stocks.csv", index=False)
    pd.DataFrame({"symbol": [r[0] for r in rows], "listed": [r[1] for r in rows], "status": [r[2] for r in rows]}).to_csv(
        data / "meta" / "stocks.csv", index=False)

    def put(sid, start, n):
        d = pd.bdate_range(start, periods=n)
        df = pd.DataFrame({c: 1.0 for c in store.STOCK_COLS if c != "date"}, index=range(n))
        df["date"] = d
        for c in ("volume",):
            if c in df:
                df[c] = 100
        store.write(data / "stocks" / "raw" / sid, df[store.STOCK_COLS], store.STOCK_COLS, date(2026, 11, 6))
    put("NEWIPO", "2026-10-20", 10)
    put("OLDGAP", "2026-10-01", 20)        # listed 2010, data only from Oct-2026: older days missing
    put("RARE", "2026-08-03", 25)          # listed Aug-2026, rarely traded but complete
    put("FULL", "2015-01-01", 400)
    assert daily.new_stocks_without_history(data, today=date(2026, 11, 6)) == ["OLDGAP"]


def test_fundamentals_check_and_no_nan_written(tmp_path):
    data = tmp_path / "data"
    doc = fundamentals.empty("ABC")
    doc["C"] = {"q": {"2026-06-30": {"sales": float("nan"), "eps": 1.0}}}
    fundamentals.save(data, doc)
    text = (data / "fundamentals" / "ABC.json").read_text(encoding="utf-8")
    assert "NaN" not in text and json.loads(text)["C"]["q"]["2026-06-30"]["sales"] is None
    (data / "fundamentals" / "BAD.json").write_text('{"symbol": "BAD", "x": NaN}', encoding="utf-8")
    (data / "fundamentals" / "WRONG.json").write_text('{"symbol": "OTHER"}', encoding="utf-8")
    checks = {(i["instrument"], i["check"]) for i in fundamentals.check_docs(data)}
    assert checks == {("BAD", "fundamentals_json"), ("WRONG", "fundamentals_symbol")}
