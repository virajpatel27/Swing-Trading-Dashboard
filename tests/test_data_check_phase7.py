"""Data check Phase 7 (18-Nov-2026): growth from a loss, year ratios from the other basis, dividends of '&' symbols."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from swingdash import fundamentals as F  # noqa: E402


def q(sales, np_, eps, ann):
    return {"sales": sales, "net_profit": np_, "np_owners": np_, "eps": eps, "pbt": np_, "ann": ann}


def test_growth_from_a_loss():
    doc = {"kind": "company", "C": {"q": {"2025-09-30": q(100.0, -20.0, -2.0, "2025-11-10"),
                                          "2026-06-30": q(110.0, 5.0, 0.5, "2026-08-10"),
                                          "2026-09-30": q(120.0, 10.0, 1.0, "2026-11-10")}}}
    m = F.metrics(doc, 50.0, 500.0, "2026-11-16")
    assert m["np_g_yoy"] == 150.0 and m["eps_g_yoy"] == 150.0      # (10 - -20) / 20: the reference's rule
    assert m["np_g_qoq"] == 100.0 and m["sales_g_yoy"] == 20.0
    assert "peg" not in m or m["peg"] > 0


def test_year_ratios_from_standalone_when_consolidated_has_no_year():
    bs = {"2026-03-31": {"equity_capital": 10.0, "reserves": 90.0, "borrowings": 0.0, "total": 150.0}}
    doc = {"kind": "company",
           "C": {"q": {"2026-09-30": q(50.0, 5.0, 1.0, "2026-11-05")}},                    # first consolidated quarter
           "S": {"q": {"2026-06-30": q(40.0, 4.0, 0.8, "2026-08-05")},
                 "y": {"2026-03-31": {"sales": 160.0, "net_profit": 20.0, "pbt": 25.0, "ann": "2026-05-10"}}, "bs": bs}}
    m = F.metrics(doc, 50.0, 500.0, "2026-11-16")
    assert m["fin_basis"] == "Consolidated" and m["roe"] == 20.0                          # 20 / (10 + 90)


def test_dividends_use_the_folder_id(tmp_path):
    ca = tmp_path / "corporate_actions"
    ca.mkdir()
    (ca / "M_M.csv").write_text("ex_date,type,ratio,factor,amount\n2026-07-01,dividend,,1,30\n", encoding="utf-8")
    assert F.dividends_of(tmp_path, "M_M") == [("2026-07-01", 30.0)]
    assert F.dividends_of(tmp_path, "M&M") == []


def test_next_result_cleared_once_results_are_out():
    doc = {"kind": "company", "C": {"q": {"2026-09-30": q(120.0, 10.0, 1.0, "2026-11-12")}}}
    assert "next_result" not in F.metrics(doc, 50.0, 500.0, "2026-11-12", next_result="2026-11-12")
    assert F.metrics(doc, 50.0, 500.0, "2026-11-12", next_result="2027-02-10")["next_result"] == "2027-02-10"
