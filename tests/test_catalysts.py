"""Leaders page "Catalyst" column: newest order / deal / fund-raising filing per stock (announcements.catalysts)."""
import pandas as pd

from swingdash import announcements


def _df(rows):
    return pd.DataFrame(rows, columns=["dt", "symbol", "cat", "desc", "about", "url", "seq"])


def test_newest_business_filing_wins_and_boilerplate_is_cut():
    df = _df([
        ["2026-10-01 10:00", "ABC", "O", "Bagging/Receiving of orders/contracts", "ABC Limited has informed the Exchange regarding an order of Rs 120 crore from NHAI", "", 1],
        ["2026-11-05 10:00", "ABC", "D", "Acquisition", "Acquisition of 100% stake in XYZ Private Limited.", "", 2],
        ["2026-11-06 10:00", "ABC", "K", "Analysts Meet", "Schedule of meet", "", 3],          # not a catalyst category
        ["2026-11-06 11:00", "DEF", "O", "Bagging/Receiving of orders/contracts", "DEF Limited has informed the Exchange regarding Order worth Rs 50 crore", "", 4],
    ])
    c = announcements.catalysts(df, "2026-11-12")
    assert c["ABC"] == ["2026-11-05", "D", "Acquisition of 100% stake in XYZ Private Limited"]
    assert c["DEF"][2] == "Order worth Rs 50 crore"


def test_dull_old_and_shouted_filings():
    df = _df([
        ["2026-11-01 10:00", "GHI", "F", "Allotment", "Allotment of equity shares under the GHI Employee Stock Option Plan 2020", "", 1],
        ["2026-05-01 10:00", "JKL", "O", "Order", "An order of Rs 10 crore", "", 2],                   # older than 120 days
        ["2026-11-02 10:00", "MNO", "D", "Acquisition", "INTIMATION OF ACQUISITION OF SHARES IN PQR LIMITED", "", 3],
    ])
    c = announcements.catalysts(df, "2026-11-12")
    assert "JKL" not in c
    assert c["GHI"] == ["2026-11-01", "F", "Allotment"]
    assert c["MNO"][2] == "Intimation of acquisition of shares in pqr limited"
