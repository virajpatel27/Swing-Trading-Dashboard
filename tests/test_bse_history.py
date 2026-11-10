"""BSE history before a stock's first NSE session (swingdash/bse_history.py)."""
from datetime import date

import pandas as pd

from swingdash import bse_history as B
from swingdash import store
from swingdash.sources import bse

CSV = ("Date,Open Price,High Price,Low Price,Close Price,WAP,No.of Shares,No. of Trades,Total Turnover (Rs.),Deliverable Quantity,"
       "% Deli. Qty to Traded Qty,Spread High-Low,Spread Close-Open\r\n"
       "17-April-2026,100,102,99,101,100.5,1000,10,101000,800,80,3,1\r\n"
       "16-April-2026,98,101,97,100,99.5,900,9,90000,700,77,4,2\r\n")


def _raw(day, close):
    return pd.DataFrame({"date": [pd.Timestamp(day)], "open": [close], "high": [close], "low": [close], "close": [close],
                         "prev_close": [close], "volume": [10], "value": [close * 10], "series": ["EQ"]})


def test_parse_and_subjects():
    df = bse.parse_stock_csv(CSV)
    assert list(df["close"]) == [100.0, 101.0] and df["series"].iat[0] == "BSE" and df["prev_close"].iat[1] == 100.0
    assert B.parse_bse_subject("Bonus issue 4:1")[0]["factor"] == 0.2
    assert B.parse_bse_subject("Stock  Split From Rs.10/- to Rs.2/-")[0]["factor"] == 0.2
    assert B.parse_bse_subject("Consolidation of Shares")[0]["type"] == "capital_reduction"
    assert B.parse_bse_subject("Spin Off")[0]["type"] == "demerger"
    assert B.parse_bse_subject("Dividend - Rs. - 6.0000") == [] and B.parse_bse_subject("Right Issue of Equity Shares") == []


class FakeHttp:
    def __init__(self):
        self.calls = []

    def get(self, url, **kw):
        self.calls.append(url)

        class R:
            status_code = 200
        r = R()
        if "ListofScripData" in url:
            r.json = lambda: [{"SCRIP_CD": "500001", "scrip_id": "AAA", "ISIN_NUMBER": "INE000A01011", "FACE_VALUE": "10"}]
        elif "StockPriceCSVDownload" in url:
            r.text = CSV
        else:
            r.json = lambda: [{"exdate": "20260410", "Purpose": "Bonus issue 1:1"}, {"exdate": "20260601", "Purpose": "Bonus issue 1:1"}]
        return r


def test_update_join_and_actions(tmp_path, monkeypatch):
    monkeypatch.setattr(B, "use_prices", lambda: True)          # off on the live site (Viraj 10-Nov); the code still works
    data = tmp_path / "data"
    store.write(data / "stocks" / "raw" / "AAA", _raw("2026-04-20", 103.0), store.STOCK_COLS, date(2026, 4, 20))
    master = pd.DataFrame([{"symbol": "AAA", "id": "AAA", "isin": "INE000A01011", "status": "active", "first_date": "2026-04-20"}])
    res = B.update(data, FakeHttp(), master, date(2007, 1, 1), date(2026, 11, 9))
    assert res["with_history_now"] == 1
    j = B.joined_raw(data, "AAA")
    assert list(j["close"]) == [100.0, 101.0, 103.0]                       # BSE days in front, NSE raw unchanged
    acts = B.actions(data, ["AAA"])["AAA"]
    assert list(acts["ex_date"].dt.strftime("%Y-%m-%d")) == ["2026-04-10"]  # only actions before the NSE start
    assert B.join_issues(data) == []                                         # 101 -> 103: no jump
    again = B.update(data, FakeHttp(), master, date(2007, 1, 1), date(2026, 11, 10))
    assert again["asked"] == 0                                               # asked before: nothing to do


def test_prices_off_keeps_only_the_list(tmp_path, monkeypatch):
    monkeypatch.setattr(B, "use_prices", lambda: False)
    data = tmp_path / "data"
    store.write(data / "stocks" / "raw" / "AAA", _raw("2026-04-20", 103.0), store.STOCK_COLS, date(2026, 4, 20))
    master = pd.DataFrame([{"symbol": "AAA", "id": "AAA", "isin": "INE000A01011", "status": "active", "first_date": "2026-04-20"}])
    http = FakeHttp()
    B.update(data, http, master, date(2007, 1, 1), date(2026, 11, 10))
    meta = B.read_meta(data)
    assert meta.at[0, "bse_rows"] == "2" and meta.at[0, "bse_first"] == "2026-04-16"   # the list knows BSE came first
    assert not (data / "stocks" / "bse").exists() and not any("DefaultData" in u for u in http.calls)
    assert list(B.joined_raw(data, "AAA")["close"]) == [103.0] and B.actions(data, ["AAA"]) == {} and B.join_issues(data) == []
