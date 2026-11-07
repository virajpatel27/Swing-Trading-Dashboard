"""Company announcements (news) and the IPO list fix (NSE's "Equity" label, list never shrinks)."""
import json
from datetime import date

import pandas as pd

from swingdash import announcements as an
from swingdash import stock_master
from swingdash.sources import nse

PAST = [{"symbol": "ZETWERK", "securityType": "Equity", "listingDate": "23-OCT-2026", "issuePrice": "151", "companyName": "Zetwerk"},
        {"symbol": "OLDCO", "securityType": "EQ", "listingDate": "18-Sep-2012", "issuePrice": "1,200", "companyName": "Old"},
        {"symbol": "SMEX", "securityType": "SME", "listingDate": "01-Nov-2026", "issuePrice": "50"},
        {"symbol": "NEWCO", "securityType": "Equity", "listingDate": "-", "issuePrice": "-", "priceRange": "Rs.88 to Rs.94",
         "ipoStartDate": "05-NOV-2026", "ipoEndDate": "07-NOV-2026", "companyName": "New Co Ltd"},
        {"symbol": "STALE", "securityType": "Equity", "listingDate": "-", "issuePrice": "-", "ipoStartDate": "01-JAN-2019", "ipoEndDate": "03-JAN-2019"}]


def test_past_issues_reads_new_equity_label():
    df = nse.parse_past_issues(PAST)
    assert sorted(df["symbol"]) == ["OLDCO", "ZETWERK"]
    assert df.set_index("symbol").loc["OLDCO", "ipo_price"] == 1200 and df.set_index("symbol").loc["ZETWERK", "ipo_date"] == "2026-10-23"


def test_issue_pipeline_only_recent_unlisted_main_board():
    up = nse.parse_issue_pipeline(PAST, "2026-11-07")
    assert list(up["symbol"]) == ["NEWCO"] and up.iloc[0]["name"] == "New Co Ltd" and up.iloc[0]["price"] == "Rs.88 to Rs.94"


class _Http:
    def __init__(self, rows):
        self.rows = rows

    def warm_up(self, home):
        pass

    def get(self, url, **kw):
        class R:
            status_code = 200
            content = b"SYMBOL,OLD SYMBOL,NEW SYMBOL,DATE\n"
        r = R()
        r.json = lambda: self.rows
        if "public-past-issues" not in url:
            r.json = lambda: []
        return r


def test_ipo_list_never_shrinks(tmp_path, monkeypatch):
    (tmp_path / "meta").mkdir()
    pd.DataFrame({"symbol": ["KEEP"], "ipo_date": ["2025-01-02"], "ipo_price": [10.0]}).to_csv(tmp_path / "meta" / "ipos.csv", index=False)
    monkeypatch.setattr(nse, "symbol_changes", lambda http: pd.DataFrame(columns=["old", "new", "date"]))
    n = stock_master.download_ipos(tmp_path, _Http(PAST), log=lambda *a: None, today="2026-11-07")
    df = pd.read_csv(tmp_path / "meta" / "ipos.csv")
    assert n == 3 and set(df["symbol"]) == {"KEEP", "OLDCO", "ZETWERK"}
    stock_master.download_ipos(tmp_path, _Http([]), log=lambda *a: None, today="2026-11-07")      # NSE answers nothing
    assert len(pd.read_csv(tmp_path / "meta" / "ipos.csv")) == 3
    assert list(pd.read_csv(tmp_path / "meta" / "ipo_upcoming.csv")["symbol"]) == []


ROWS = [{"symbol": "BEL", "desc": "Bagging/Receiving of orders/contracts", "an_dt": "06-Nov-2026 18:01:02", "seq_id": "1",
         "attchmntText": "Bharat Electronics Limited has informed the Exchange about Bagging/Receiving of orders/contracts",
         "attchmntFile": "https://nsearchives.nseindia.com/corporate/BEL_1.pdf"},
        {"symbol": "ASTERDM", "desc": "Analysts/Institutional Investor Meet/Con. Call Updates", "an_dt": "06-Nov-2026 23:43:58", "seq_id": "2",
         "attchmntText": "Aster DM Quality Care Limited has informed the Exchange about Link of Recording", "attchmntFile": "-"},
        {"symbol": "XYZ", "desc": "Copy of Newspaper Publication", "an_dt": "06-Nov-2026 10:00:00", "seq_id": "3", "attchmntText": ""},
        {"symbol": "TCS", "desc": "Outcome of Board Meeting", "an_dt": "05-Nov-2026 16:30:00", "seq_id": "4",
         "attchmntText": "Tata Consultancy has informed the Exchange about Financial Results for the period ended Sep 2026"},
        {"symbol": "RIL", "desc": "Dividend", "an_dt": "05-Nov-2026 12:00:00", "seq_id": "5", "attchmntText": "x about Dividend"}]


def test_parse_classifies_and_skips_routine():
    df = an.parse(ROWS)
    cats = dict(zip(df["symbol"], df["cat"]))
    assert cats == {"BEL": "O", "ASTERDM": "K", "TCS": "E", "RIL": "C"}                  # newspaper copy left out
    bel = df.set_index("symbol").loc["BEL"]
    assert bel["about"] == "" and bel["url"] == "BEL_1.pdf" and bel["dt"] == "2026-11-06 18:01"
    assert df.set_index("symbol").loc["ASTERDM", "about"] == "Link of Recording" and df.set_index("symbol").loc["ASTERDM", "url"] == ""


def test_store_daily_files_dedupe_and_site_files(tmp_path):
    df = an.parse(ROWS)
    assert an.store(tmp_path, df) == 4
    assert an.store(tmp_path, df) == 0                                                  # same filings again: nothing new
    assert (tmp_path / "announcements" / "2026-11" / "06.csv").exists() and (tmp_path / "announcements" / "2026-11" / "05.csv").exists()
    assert len(an.load(tmp_path, "2026-11-06")) == 2
    r = an.site_files(tmp_path, tmp_path / "out", {"BEL", "TCS", "RIL"}, "2026-11-06", recent_days=1)
    news = json.loads((tmp_path / "out" / "data" / "news.json").read_text(encoding="utf-8"))
    assert r == {"recent": 3, "stocks": 3} and news["rows"][0][1] == "BEL" and news["cats"]["O"] == "Orders & business"
    assert json.loads((tmp_path / "out" / "data" / "a" / "TCS.json").read_text(encoding="utf-8"))[0][2] == "E"


def test_prune_keeps_13_months(tmp_path):
    for m in ("2025-09", "2025-10", "2026-11"):
        (tmp_path / "announcements" / m).mkdir(parents=True)
    assert an.prune(tmp_path, date(2026, 11, 7)) == ["2025-09"]
