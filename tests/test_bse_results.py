"""scripts/fetch_bse_results.py (18-Nov-2026): BSE results in the NSE document format, results day from board meetings,
periods not fetched twice, stocks with NSE results left alone."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import fetch_bse_results as fr  # noqa: E402
from swingdash import fundamentals as F  # noqa: E402


def item(desc, value, t="1.0000"):
    return {"fld_type": t, "fld_desc": desc, "Value": value, "type": "Type1_Sh3_IND_AS"}


ITEMS = [item("Type", "Un-Audited"), item("Date Begin", "01-Jul-26"), item("Date End", "30-Sep-26"),
         item("Net Sales/Revenue From Operations", "19510.1000"), item("Other Income", "680.6000"),
         item("Total Income", "20190.7000"), item("Expenditure", "-14086.0000"),
         item("Depreciation and amortisation expense", "-194.9000"), item("Finance Costs", "-59.5000"),
         item("Profit (+)/ Loss (-) from Ordinary Activities before Tax", "6104.7000"), item("Tax", "-1570.2000"),
         item("Net Profit (+)/ Loss (-) from Ordinary Activities after Tax", "4534.5000"), item("Net Profit", "4534.5000"),
         item("Basic EPS for continuing operation", "213.3900"), item("Basic for discontinued & continuing operation", "0.0000")]


def test_parse_items_million_to_crore():
    end, it = fr.parse_items(ITEMS)
    assert end == "2026-09-30"
    assert it["sales"] == 1951.0 and it["net_profit"] == 453.5 and it["eps"] == 213.39    # 0.1 crore, EPS in Rs
    assert it["expenses"] == 1383.2 and it["interest"] == 6.0 and it["tax"] == 157.0 and it["op_profit"] == 567.8


def test_periods_and_results_day():
    table = [{"fy": "2026-2027", "Q1": "Jun-26;JQ2026-2027;130.00;x", "Q2": "Sep-26;SQ2026-2027;131.00;x", "YR": None},
             {"fy": "2025-2026", "Q1": "Jun-25;JQ;126.00;x", "Q2": "Sep-25;SQ;127.00;x", "Q3": "Dec-25;DQ;128.00;x",
              "Q4": "Mar-26;MQ;129.00;x", "YR": "Mar-26;MC;129.50;x"}]
    assert fr.periods(table, 3, 1) == [("q", "131.00"), ("q", "130.00"), ("q", "129.00"), ("y", "129.50")]
    days = fr.result_days([{"Purpose_name": "Results", "tm": "2026-11-05T00:00:00"}, {"Purpose_name": "Dividend", "tm": "2026-11-20T00:00:00"},
                           {"Purpose_name": "Results", "tm": "2026-08-12T00:00:00"}])
    assert days == ["2026-08-12", "2026-11-05"]
    assert fr.ann_for("2026-09-30", days) == "2026-11-05" and fr.ann_for("2025-12-31", days) == ""


class Resp:
    def __init__(self, payload):
        self.status_code, self._p = 200, payload

    def json(self):
        return self._p


class FakeHttp:
    def __init__(self):
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append(url)
        if "CorprateResultbeta" in url:
            return Resp({"Table": [{"fy": "2026-2027", "Q2": "Sep-26;SQ;131.00;x"}]})
        if "BoardMeeting" in url:
            return Resp({"Table": [{"Purpose_name": "Results", "tm": "2026-11-05T00:00:00"}]})
        return Resp({"table1": ITEMS})


def test_fetch_one_saves_once_and_leaves_nse_stocks(tmp_path):
    data = tmp_path / "data"
    http = FakeHttp()
    assert fr.fetch_one(http, data, "ABC", "500001", 4, 0) == 1
    doc = json.loads((data / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))
    assert doc["results_source"] == "BSE" and doc["S"]["q"]["2026-09-30"]["ann"] == "2026-11-05"
    n = len(http.calls)
    assert fr.fetch_one(http, data, "ABC", "500001", 4, 0) == 0 and len(http.calls) == n + 1     # only the list is asked
    nse = F.empty("XYZ")
    nse["C"] = {"q": {"2026-09-30": {"sales": 1.0}}}
    F.save(data, nse)
    assert fr.fetch_one(http, data, "XYZ", "500002", 4, 0) == 0
    assert not json.loads((data / "fundamentals" / "XYZ.json").read_text(encoding="utf-8"))["S"]


class ConsHttp(FakeHttp):
    def get(self, url, headers=None):
        if "Consolidated_Res" in url:
            self.calls.append(url)
            rows = [{"Description": i["fld_desc"], "Amount": i["Value"]} for i in ITEMS if i["fld_desc"] != "Net Profit"]
            return Resp(rows + [{"Description": "Net Profit", "Amount": "5000.0000"},
                                {"Description": "Net Profit after Mino Inter & Share of P & L", "Amount": "4800.0000"}])
        return super().get(url, headers)


def test_consolidated_goes_to_C_with_owners_profit(tmp_path):
    data = tmp_path / "data"
    assert fr.fetch_one(ConsHttp(), data, "ABC", "500001", 4, 0) == 2
    doc = json.loads((data / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))
    c = doc["C"]["q"]["2026-09-30"]
    assert c["net_profit"] == 500.0 and c["np_owners"] == 480.0 and c["ann"] == "2026-11-05"
    assert doc["files"]["BSE:RC:131.00"] == "2026-11-05" and F.basis_of(doc) == "C"
    assert fr.fetch_one(FakeHttp(), tmp_path / "d2", "ABC", "500001", 4, 0) == 1       # no consolidated: S only
    assert json.loads((tmp_path / "d2" / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))["files"]["BSE:RC:131.00"] == "none"


class EmptyConsHttp(FakeHttp):
    def get(self, url, headers=None):
        if "Consolidated_Res" in url:
            self.calls.append(url)
            r = Resp(None)
            r.text = ""                              # BSE's answer when there are no consolidated results

            def bad():
                raise ValueError("Expecting value")
            r.json = bad
            return r
        return super().get(url, headers)


def test_empty_consolidated_answer_is_none_not_failure(tmp_path):
    assert fr.fetch_one(EmptyConsHttp(), tmp_path, "ABC", "500001", 4, 0) == 1
    doc = json.loads((tmp_path / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))
    assert doc["files"]["BSE:RC:131.00"] == "none" and "2026-09-30" in doc["S"]["q"]


def test_numbers_with_commas_and_missing_consolidated_eps():
    end, it = fr.parse_items([item("Date End", "30-Sep-26"), item("Net Sales", "1,312.26"), item("Net Profit", "61.62")])
    assert it["sales"] == 131.2 and "eps" not in it


class NoEpsConsHttp(FakeHttp):
    def get(self, url, headers=None):
        if "Consolidated_Res" in url:
            self.calls.append(url)
            return Resp([{"Description": "Date End", "Amount": "30-Sep-26"}, {"Description": "Net Sales", "Amount": "20,000.00"},
                         {"Description": "Net Profit", "Amount": "9,069.00"}])
        return super().get(url, headers)


def test_consolidated_eps_from_standalone_shares(tmp_path):
    assert fr.fetch_one(NoEpsConsHttp(), tmp_path, "ABC", "500001", 4, 0) == 2
    doc = json.loads((tmp_path / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))
    assert doc["C"]["q"]["2026-09-30"]["eps"] == round(906.9 * 213.39 / 453.5, 2)


def test_no_consolidated_asks_only_once(tmp_path):
    class ListHttp(EmptyConsHttp):
        def get(self, url, headers=None):
            if "CorprateResultbeta" in url:
                self.calls.append(url)
                return Resp({"Table": [{"fy": "2026-2027", "Q1": "Jun-26;JQ;130.00;x", "Q2": "Sep-26;SQ;131.00;x"}]})
            return super().get(url, headers)
    http = ListHttp()
    fr.fetch_one(http, tmp_path, "ABC", "500001", 4, 0)
    assert sum("Consolidated_Res" in u for u in http.calls) == 1
    files = json.loads((tmp_path / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))["files"]
    assert files["BSE:RC:130.00"] == "none" and files["BSE:RC:131.00"] == "none"
