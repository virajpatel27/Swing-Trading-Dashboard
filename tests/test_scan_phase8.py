"""Scanner plan Phase 8: fundamentals from NSE XBRL filings (reader, shareholding, file choice, ratios)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import fundamentals as F  # noqa: E402

CR = 10_000_000


def ctx(cid, start=None, end=None, instant=None, dim=False):
    per = f"<xbrli:instant>{instant}</xbrli:instant>" if instant else \
        f"<xbrli:startDate>{start}</xbrli:startDate><xbrli:endDate>{end}</xbrli:endDate>"
    scen = '<xbrli:scenario><xbrldi:explicitMember dimension="x:Axis">x:M</xbrldi:explicitMember></xbrli:scenario>' if dim else ""
    return f'<xbrli:context id="{cid}"><xbrli:entity><xbrli:identifier scheme="s">X</xbrli:identifier></xbrli:entity>' \
           f'<xbrli:period>{per}</xbrli:period>{scen}</xbrli:context>\n'


def fact(tag, cid, val):
    return f'<in-bse-fin:{tag} contextRef="{cid}" unitRef="INR" decimals="-5">{val}</in-bse-fin:{tag}>\n'


def company_file(q_sales=100, y_sales=400, eps_q=2.0, eps_y=8.0, nature="Consolidated", fy=("2025-04-01", "2026-03-31"),
                 q=("2026-01-01", "2026-03-31"), define_main=True):
    x = '<?xml version="1.0"?><xbrli:xbrl>\n'
    if define_main:
        x += ctx("OneD", *q) + ctx("FourD", *fy) + ctx("OneI", instant=fy[1])
    x += ctx("OneSeg01D", *q, dim=True)
    for cid, sales, eps in (("OneD", q_sales, eps_q), ("FourD", y_sales, eps_y)):
        x += fact("NatureOfReportStandaloneConsolidated", cid, nature)
        x += fact("DateOfStartOfFinancialYear", cid, fy[0])
        x += fact("DateOfBoardMeetingWhenFinancialResultsWereApproved", cid, "2026-05-08")
        if not define_main:
            x += fact("DateOfStartOfReportingPeriod", cid, q[0] if cid == "OneD" else fy[0])
            x += fact("DateOfEndOfReportingPeriod", cid, q[1] if cid == "OneD" else fy[1])
        x += fact("RevenueFromOperations", cid, sales * CR) + fact("OtherIncome", cid, 5 * CR)
        x += fact("FinanceCosts", cid, 4 * CR) + fact("DepreciationDepletionAndAmortisationExpense", cid, 6 * CR)
        x += fact("Expenses", cid, sales * 0.8 * CR) + fact("ProfitBeforeTax", cid, sales * 0.25 * CR)
        x += fact("TaxExpense", cid, sales * 0.05 * CR) + fact("ProfitLossForPeriod", cid, sales * 0.2 * CR)
        x += fact("ProfitOrLossAttributableToOwnersOfParent", cid, sales * 0.19 * CR)
        x += fact("BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations", cid, eps)
    x += fact("RevenueFromOperations", "OneSeg01D", 1)           # a segment: must be ignored
    x += fact("EquityShareCapital", "OneI", 10 * CR) + fact("OtherEquity", "OneI", 190 * CR)
    x += fact("BorrowingsNoncurrent", "OneI", 30 * CR) + fact("BorrowingsCurrent", "OneI", 20 * CR)
    x += fact("EquityAndLiabilities", "OneI", 500 * CR) + fact("PropertyPlantAndEquipment", "OneI", 150 * CR)
    x += fact("CashFlowsFromUsedInOperatingActivities", "FourD", 70 * CR)
    x += fact("CashFlowsFromUsedInInvestingActivities", "FourD", -40 * CR)
    x += fact("CashFlowsFromUsedInFinancingActivities", "FourD", -20 * CR)
    x += fact("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "FourD", 25 * CR)
    return x + "</xbrli:xbrl>"


def test_company_file_quarter_year_balance_sheet_cash_flow():
    f = F.filing(company_file())
    assert f["kind"] == "company" and f["basis"] == "C" and f["board"] == "2026-05-08"
    q = f["q"]["2026-03-31"]
    assert q["sales"] == 100 and q["interest"] == 4 and q["depreciation"] == 6
    assert q["expenses"] == 70 and q["op_profit"] == 30            # 80 total - interest - depreciation
    assert q["net_profit"] == 20 and q["np_owners"] == 19 and q["eps"] == 2.0
    assert f["y"]["2026-03-31"]["sales"] == 400
    bs = f["bs"]["2026-03-31"]
    assert bs["borrowings"] == 50 and bs["equity_capital"] + bs["reserves"] == 200 and bs["other_liabilities"] == 250
    cf = f["cf"]["2026-03-31"]
    assert cf["cfo"] == 70 and cf["capex"] == 25 and cf["fcf"] == 45 and cf["net"] == 10


def test_undefined_main_contexts_use_the_period_facts():
    f = F.filing(company_file(define_main=False, nature="Standalone"))
    assert f["basis"] == "S" and "2026-03-31" in f["q"] and "2026-03-31" in f["y"]


def test_bank_file_with_only_end_dates():
    x = '<xbrli:xbrl>\n'
    for cid, ii, eps in (("OneD", 100, 3.0), ("FourD", 380, 3.0)):           # the year repeats the quarter's EPS
        x += fact("DateOfStartOfFinancialYear", cid, "2022-04-01") + fact("DateOfEndOfReportingPeriod", cid, "2023-03-31")
        x += fact("NatureOfReportStandaloneConsolidated", cid, "Standalone")
        x += fact("InterestEarned", cid, ii * CR) + fact("InterestExpended", cid, ii * 0.5 * CR)
        x += fact("OperatingExpenses", cid, ii * 0.2 * CR) + fact("ProvisionsOtherThanTaxAndContingencies", cid, ii * 0.05 * CR)
        x += fact("OtherIncome", cid, ii * 0.1 * CR) + fact("ProfitLossFromOrdinaryActivitiesBeforeTax", cid, ii * 0.35 * CR)
        x += fact("ProfitLossForThePeriod", cid, ii * 0.25 * CR) + fact("BasicEarningsPerShareAfterExtraordinaryItems", cid, eps)
    f = F.filing(x + "</xbrli:xbrl>")
    assert f["kind"] == "bank"
    q, y = f["q"]["2023-03-31"], f["y"]["2023-03-31"]
    assert q["sales"] == 100 and q["interest"] == 50 and q["expenses"] == 25 and q["op_profit"] == 25   # financing profit
    doc = F.empty("BANK")
    F.merge_filing(doc, f, {"at": "2023-04-22 10:00:00", "qe": "2023-03-31", "list": "quarterly"})
    F.fix_eps(doc)
    assert doc["S"]["y"]["2023-03-31"]["eps"] == 11.4 and doc["S"]["y"]["2023-03-31"]["eps_fixed"]
    assert doc["S"]["q"]["2023-03-31"]["ann"] == "2023-04-22"


def shp_file(new=True):
    def grp(name, shares, holders):
        cid = f"{name}_ContextI" if new else f"{name}I"
        return ctx(cid, instant="2026-09-30") + fact("NumberOfShares", cid, shares) + fact("NumberOfShareholders", cid, holders)
    x = "<xbrli:xbrl>\n" + ctx("MainI", instant="2026-09-30") + fact("DateOfReport", "MainI", "2026-09-30")
    x += grp("ShareholdingOfPromoterAndPromoterGroup", 500, 5) + grp("NonInstitutions", 200, 9000) + grp("Governments", 10, 1)
    if new:
        x += grp("InstitutionsForeign", 150, 300) + grp("InstitutionsDomestic", 130, 50) + grp("ShareholdingPattern", 1000, 9356)
    else:
        x += grp("Institutions", 280, 350) + grp("InstitutionsForeignPortfolioInvestor", 150, 300) + grp("PublicShareholding", 490, 9351)
        x += grp("SharesHeldByNonPromoterNonPublicShareholders", 10, 1)
    return x + "</xbrli:xbrl>"


def test_shareholding_new_and_old_formats():
    for new in (True, False):
        s = F.shareholding(shp_file(new))
        assert (s["prom"], s["fii"], s["dii"], s["public"], s["govt"]) == (50.0, 15.0, 13.0, 20.0, 1.0), new
        assert s["others"] == 1.0 and s["date"] == "2026-09-30"
    assert F.shareholding(shp_file(True))["n"] == 9356


def test_choose_newest_revision_annual_files_and_quarter_end_shareholding():
    r = lambda qe, b, lst, at, n: {"url": f"https://x/{n}.xml", "qe": qe, "basis": b, "list": lst, "at": at}
    lists = {"results": [r("2026-06-30", "C", "integrated", "2026-08-07 10:00:00", "a"),
                         r("2026-06-30", "C", "integrated", "2026-08-20 10:00:00", "a_revised"),
                         r("2026-03-31", "C", "integrated", "2026-05-08 10:00:00", "b"),
                         r("2024-12-31", "C", "quarterly", "2025-02-04 10:00:00", "c")],
             "annual": [r("2026-03-31", "C", "annual", "2026-05-08 10:00:00", "ann26"),
                        r("2024-03-31", "C", "annual", "2024-05-03 10:00:00", "ann24")],
             "shp": [r("2026-09-30", None, "shp", "2026-10-10 10:00:00", "s1"), r("2026-08-16", None, "shp", "2026-08-17 10:00:00", "s_extra")]}
    names = {F.name_of(x["url"]) for x in F.choose(lists, n_quarters=12)}
    assert names == {"a_revised.xml", "b.xml", "c.xml", "ann24.xml", "s1.xml"}


def doc_with_quarters():
    doc = F.empty("T")
    q = {}
    ends = ["2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31",
            "2026-06-30"]
    for i, e in enumerate(ends):
        q[e] = {"sales": 100 + 10 * i, "op_profit": 20 + i, "np_owners": 10 + i, "net_profit": 10 + i, "eps": 1.0 + 0.1 * i,
                "ann": f"{e[:4]}-{int(e[5:7]) % 12 + 1:02d}-15" if e[5:7] != "12" else f"{int(e[:4]) + 1}-01-15"}
    y = {"2025-03-31": {"sales": 400, "np_owners": 40, "eps": 4.0, "pbt": 55, "interest": 5, "ann": "2025-04-15"},
         "2026-03-31": {"sales": 520, "np_owners": 54, "eps": 5.4, "pbt": 70, "interest": 6, "ann": "2026-04-15"}}
    bs = {"2025-03-31": {"equity_capital": 10, "reserves": 190, "borrowings": 100},
          "2026-03-31": {"equity_capital": 10, "reserves": 230, "borrowings": 60}}
    doc["C"] = {"q": q, "y": y, "bs": bs, "cf": {}}
    doc["kind"] = "company"
    doc["shp"] = {"2026-03-31": {"prom": 50, "fii": 10, "dii": 8, "public": 30, "govt": 0, "n": 1000},
                  "2026-06-30": {"prom": 49, "fii": 12, "dii": 8, "public": 29, "govt": 0, "n": 1100}}
    return doc


def test_metrics_ttm_growth_returns_and_holdings():
    doc = doc_with_quarters()
    m = F.metrics(doc, close=100.0, mcap_cr=2400.0, as_of="2026-08-01", factor=lambda d: 0.5 if d < "2025-01-01" else 1.0,
                  dividends=[("2026-07-01", 2.0), ("2025-06-01", 9.0)], next_result="2026-08-10")
    # last 4 quarters: Sep-25 .. Jun-26 (i = 5..8)
    assert m["fin_qtr"] == "2026-06-30" and m["sales_ttm"] == 100 * 4 + 10 * (5 + 6 + 7 + 8)
    assert m["eps_ttm"] == round(1.5 + 1.6 + 1.7 + 1.8, 2) and m["pe"] == round(100 / 6.6, 2)
    assert m["sales_g_yoy"] == round((180 / 140 - 1) * 100, 2) and m["eps_g_yoy"] == round((1.8 / 1.4 - 1) * 100, 2)
    assert m["eps_up_qtrs"] >= 4
    assert m["roe"] == round(54 / 220 * 100, 2)                       # average net worth (200 + 240) / 2
    assert m["roce"] == round(76 / ((300 + 300) / 2) * 100, 2)
    assert m["debt_equity"] == round(60 / 240, 2) and m["pb"] == 10.0
    assert m["div_yield"] == 2.0                                        # only the dividend of the last 365 days
    assert m["prom_hold"] == 49 and m["prom_chg_1q"] == -1 and m["fii_chg_1q"] == 2 and m["shareholders_chg_1q"] == 10.0
    assert m["next_result"] == "2026-08-10" and m["days_to_result"] == 9


def test_metrics_only_use_what_was_announced():
    doc = doc_with_quarters()
    m = F.metrics(doc, close=100.0, mcap_cr=2400.0, as_of="2026-07-01")
    assert m["fin_qtr"] == "2026-03-31"                                 # Jun-26 results come on 15-Jul
    assert "prom_hold" in m and m["shp_qtr"] == "2026-03-31"            # the Jun pattern counts from 21-Jul
    assert F.metrics(F.empty("X"), 1.0, 1.0) == {}


class FakeResp:
    def __init__(self, status, text="", obj=None):
        self.status_code, self.text, self._obj = status, text, obj

    def json(self):
        return self._obj


class FakeNSE:
    """Answers the NSE lists and files the daily step asks for."""
    def __init__(self, routes):
        self.routes, self.asked = routes, []

    def warm_up(self, home):
        pass

    def request(self, method, url, **kw):
        self.asked.append(url)
        for key, val in self.routes.items():
            if key in url:
                return FakeResp(200, val if isinstance(val, str) else "", None if isinstance(val, str) else val)
        return FakeResp(404)

    def get(self, url, **kw):
        return self.request("GET", url, **kw)


def test_daily_step_adds_new_filings_shareholding_and_calendar(tmp_path):
    import json
    from datetime import date
    import pandas as pd
    data = tmp_path / "data"
    doc = F.empty("ABC")
    doc["files"] = {"old.xml": "2026-08-01"}
    F.save(data, doc)
    F.save(data, F.empty("XYZ"))
    routes = {
        "integrated-filing-results": {"data": [
            {"symbol": "ABC", "qe_Date": "31-MAR-2026", "consolidated": "Consolidated", "broadcast_Date": "04-Nov-2026 20:00:00",
             "xbrl": "https://nsearchives.nseindia.com/corporate/xbrl/new.xml"},
            {"symbol": "NOTOURS", "qe_Date": "31-MAR-2026", "consolidated": "Consolidated", "broadcast_Date": "04-Nov-2026 21:00:00",
             "xbrl": "https://nsearchives.nseindia.com/corporate/xbrl/other.xml"}]},
        "corporate-share-holdings-master": [
            {"symbol": "XYZ", "date": "30-SEP-2026", "broadcastDate": "20-OCT-2026 10:00:00",
             "xbrl": "https://nsearchives.nseindia.com/corporate/xbrl/SHP_1.xml"}],
        "event-calendar": [{"symbol": "ABC", "purpose": "Financial Results", "date": "12-Nov-2026"},
                           {"symbol": "XYZ", "purpose": "Dividend", "date": "13-Nov-2026"}],
        "new.xml": company_file(),
        "SHP_1.xml": shp_file(True),
    }
    http = FakeNSE(routes)
    uni = pd.DataFrame({"symbol": ["ABC", "XYZ"]})
    cp = data / "meta" / "checkpoints" / "fundamentals_daily.json"
    res = F.daily(data, http, uni, date(2026, 11, 5), cp)
    assert res["results_files"] == 1 and res["shp_files"] == 1 and res["calendar"] == 1
    abc = F.load(data, "ABC")
    assert abc["C"]["q"]["2026-03-31"]["sales"] == 100 and "new.xml" in abc["files"]
    assert F.load(data, "XYZ")["shp"]["2026-09-30"]["prom"] == 50.0
    assert not any("other.xml" in u for u in http.asked)              # not in our universe / no document: skipped
    assert json.loads(cp.read_text())["_since"] >= "2026-11-02"
    cal = pd.read_csv(data / "meta" / "results_calendar.csv")
    assert list(cal["symbol"]) == ["ABC"]
    again = F.daily(data, FakeNSE(routes), uni, date(2026, 11, 5), cp)  # second run: nothing new
    assert again["results_files"] == 0 and again["shp_files"] == 0


def test_daily_marker_waits_for_files_not_online_yet(tmp_path):
    import json
    from datetime import date
    import pandas as pd
    data = tmp_path / "data"
    F.save(data, F.empty("ABC"))
    filing_row = lambda at, name: {"symbol": "ABC", "qe_Date": "30-SEP-2026", "consolidated": "Standalone", "broadcast_Date": at,
                                   "xbrl": f"https://nsearchives.nseindia.com/corporate/xbrl/{name}.xml"}
    routes = {"integrated-filing-results": {"data": [filing_row("05-Nov-2026 18:00:00", "late"),
                                                     filing_row("04-Nov-2026 10:00:00", "ok")]},
              "corporate-share-holdings-master": [], "event-calendar": [], "ok.xml": company_file()}
    cp = data / "meta" / "checkpoints" / "fundamentals_daily.json"
    res = F.daily(data, FakeNSE(routes), pd.DataFrame({"symbol": ["ABC"]}), date(2026, 11, 5), cp)
    assert res["results_files"] == 1 and res["missing_files"] == 1
    assert json.loads(cp.read_text())["_since"] == "2026-11-05 18:00:00"   # "late.xml" is asked for again next run


def test_nightly_new_only_run_with_nothing_left_asks_nse_nothing(tmp_path):
    import json
    import time
    from datetime import date
    import pandas as pd
    cp = tmp_path / "fundamentals.json"
    cp.write_text(json.dumps({"ABC": "2026-01-01", "XYZ": "2026-11-05"}))       # both read once, ABC long ago
    http = FakeNSE({})
    res = F.backfill(tmp_path / "data", http, pd.DataFrame({"symbol": ["ABC", "XYZ"]}), date(2026, 11, 5),
                     time.monotonic() + 60, cp, refresh_days=10 ** 6)
    assert res["stocks"] == 0 and res["left"] == 0 and http.asked == []
