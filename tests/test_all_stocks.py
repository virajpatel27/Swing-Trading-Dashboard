"""Universe = every NSE main-board stock (EQUITY_L.csv), Nifty 500 members marked."""
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from swingdash import backfill  # noqa: E402
from swingdash.sources import nse  # noqa: E402
from test_phase3 import FakeHttp, Resp, make_ctx  # noqa: E402

EQUITY_L = ("SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\n"
            "TCS,Tata Consultancy Services Limited,EQ,25-AUG-2004,1,1,INE467B01029,1\n"
            "SMALLCO,Small Company Limited,BE,05-JAN-2015,10,1,INE000A01011,10\n"
            "DUMMYX,Dummy,EQ,01-JAN-2020,10,1,INE000A01099,10\n")
N500 = ("Company Name,Industry,Symbol,Series,ISIN Code\nTata,Information Technology,TCS,EQ,INE467B01029\n"
        "Embassy REIT,Realty,EMBASSY,RR,INE041025011\n")


def ctx_for(tmp_path, route):
    ctx = make_ctx(tmp_path, FakeHttp(route))
    ctx.universe["stocks"].update({"source": "all_nse_eq", "all_list_url": "https://x/EQUITY_L.csv", "exclude_prefixes": ["DUMMY"]})
    return ctx


def ok(url):
    return Resp(200, (EQUITY_L if url.endswith("EQUITY_L.csv") else N500).encode())


def test_parse_equity_list():
    df = nse.parse_equity_list(EQUITY_L.encode())
    assert df["symbol"].tolist() == ["TCS", "SMALLCO", "DUMMYX"]
    assert df.loc[1, ["series", "listed"]].tolist() == ["BE", "2015-01-05"]


def test_all_nse_universe_marks_nifty500(tmp_path):
    uni = backfill.stock_universe(ctx_for(tmp_path, ok))
    assert uni["symbol"].tolist() == ["TCS", "SMALLCO", "EMBASSY"]      # placeholder out; REIT (not in EQUITY_L) kept
    assert uni["n500"].tolist() == [True, False, True]
    assert uni["industry"].tolist() == ["Information Technology", "", "Realty"]   # from the Nifty 500 list where known
    saved = pd.read_csv(tmp_path / "data/meta/universe_stocks.csv")
    assert len(saved) == 3 and "listed" in saved.columns


def test_universe_keeps_saved_list_when_nse_fails_or_shrinks(tmp_path):
    backfill.stock_universe(ctx_for(tmp_path, ok))

    def down(url):
        raise ConnectionError("NSE down")
    assert backfill.stock_universe(ctx_for(tmp_path, down))["symbol"].tolist() == ["TCS", "SMALLCO", "EMBASSY"]

    def short(url):                                                    # a broken, much shorter list
        return Resp(200, (EQUITY_L.splitlines()[0] + "\n" + EQUITY_L.splitlines()[1] + "\n").encode()
                    if url.endswith("EQUITY_L.csv") else N500.encode())
    assert backfill.stock_universe(ctx_for(tmp_path, short))["symbol"].tolist() == ["TCS", "SMALLCO", "EMBASSY"]
