"""Scanner plan Phase 2: delivery %, SME corporate actions, share factors, data-quality report."""
import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import backfill, corporate_actions, quality, share_factors, store, validate  # noqa: E402
from swingdash.sources import nse  # noqa: E402

MTO = (b"Security Wise Delivery Position - Compulsory Rolling Settlement\n10,MTO,03112026,1789380734,0003490\n"
       b"Trade Date <03-NOV-2026>,Settlement Type <N>\n"
       b"Record Type,Sr No,Name of Security,Quantity Traded,Deliverable Quantity(gross across client level),% of ...\n"
       b"20,1,0IRFC35,N0,2,2,100.00\n20,2,RELIANCE,EQ,42319913,22642976,53.50\n20,3,TITAN,EQ,774059,369910,47.79\n"
       b"20,4,TITAN,N1,1,1,100.00\n")


class Resp:
    def __init__(self, status, content=b"", data=None):
        self.status_code, self.content, self._d = status, content, data

    def json(self):
        return self._d


def test_parse_mto():
    df = nse.parse_mto(MTO)
    assert df["date"].iat[0] == pd.Timestamp("2026-11-03")
    r = df[(df["symbol"] == "RELIANCE")].iloc[0]
    assert (r.series, r.traded_qty, r.deliv_qty, r.deliv_pct) == ("EQ", 42319913, 22642976, 53.5)
    assert len(df) == 4


def test_backfill_delivery_picks_series_follows_renames_and_waits_for_today(tmp_path):
    data = tmp_path / "data"
    (data / "meta").mkdir(parents=True)
    pd.DataFrame({"symbol": ["RELIANCE", "TITAN"], "name": "x", "isin": "", "series": "EQ", "listed": "", "industry": "",
                  "n500": True, "id": ["RELIANCE", "TITAN"]}).to_csv(data / "meta" / "universe_stocks.csv", index=False)
    pd.DataFrame({"date": ["2026-10-30", "2026-11-02", "2026-11-03"]}).to_csv(data / "meta" / "trading_days.csv", index=False)
    old_name = MTO.replace(b"TITAN", b"TITANOLD").replace(b"03112026", b"30102026")

    class Http:
        def get(self, url, **kw):
            if "MTO_30102026" in url:
                return Resp(200, old_name)
            if "MTO_02112026" in url:
                return Resp(200, MTO.replace(b"03112026", b"02112026"))
            if "MTO_" in url:
                return Resp(404)                                  # 03-Nov not published yet
            if "symbolchange" in url:
                return Resp(200, b"SM_NAME,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\nTitan,TITANOLD,TITAN,02-Nov-2026\n")
            raise ConnectionError("lists not needed")

    uni_cfg = {"history_start": "2026-10-30", "stocks": {"series_priority": ["EQ", "BE"], "list_url": "x", "all_list_url": "y",
                                                         "source": "all_nse_eq"}}
    ctx = backfill.Ctx(root=tmp_path, http=Http(), settings={}, universe=uni_cfg, today=date(2026, 11, 3), log=lambda m: None)
    res = backfill.backfill_delivery(ctx)
    assert res["files"] == 2 and res["last_day"] == "2026-11-02"           # 03-Nov waits for the next run
    t = store.read(data / "stocks" / "delivery" / "TITAN", store.DELIVERY_COLS)
    assert list(t["deliv_pct"]) == [47.79, 47.79]                         # EQ row, not N1; old symbol on 30-Oct
    assert str(t["deliv_qty"].dtype) == "Int64"
    assert json.loads((data / "meta" / "checkpoints" / "nse_delivery.json").read_text())["last_day"] == "2026-11-02"
    assert "deliv_qty\n" not in (data / "stocks" / "delivery" / "TITAN" / "current.csv").read_text()


def test_check_delivery():
    ok = pd.DataFrame({"date": pd.to_datetime(["2026-11-02", "2026-11-03"]), "deliv_qty": [5, 6], "deliv_pct": [50.0, 101.0]})
    got = validate.check_delivery("X", ok)
    assert [i["check"] for i in got] == ["delivery out of range"]


def test_corporate_actions_include_the_sme_list(tmp_path):
    asked = []

    def fake_api(http, path, referer=None):
        asked.append(path)
        return [{"symbol": "THEJO", "series": "SM", "exDate": "12-Oct-2021", "subject": "BONUS 2:1", "faceVal": "10"}] \
            if "index=sme" in path else []

    orig = nse.api_json
    nse.api_json = fake_api
    try:
        rows = corporate_actions.load_raw(None, [2021], date(2026, 11, 4), tmp_path)
    finally:
        nse.api_json = orig
    assert any("index=equities" in p for p in asked) and any("index=sme" in p for p in asked)
    acts = corporate_actions.to_actions(rows, ["THEJO"], {})["THEJO"]
    assert acts.iloc[0]["type"] == "bonus" and abs(float(acts.iloc[0]["factor"]) - 1 / 3) < 1e-9
    assert (tmp_path / "ca_nse_sme_2021.json").exists()


def test_share_factors_and_eps_factor():
    acts = pd.DataFrame({"ex_date": pd.to_datetime(["2017-09-07", "2020-05-13", "2024-10-28", "2025-01-01", "2010-01-01"]),
                         "type": ["bonus", "rights", "bonus", "demerger", "split"], "ratio": ["1:1", "1:15", "1:1", "", "FV 10->1"],
                         "factor": [0.5, 0.99061, 0.5, 0.8, 0.1],
                         "status": ["applied", "applied", "applied on 2024-10-29", "applied", "NOT APPLIED: price did not move"]})
    t = share_factors.from_actions("REL", acts)
    assert list(t["type"]) == ["bonus", "rights", "bonus"]                # no demerger, nothing not applied
    assert t.iloc[2]["applied"] == "2024-10-29" and t.iloc[2]["ex_date"] == "2024-10-28"
    assert share_factors.eps_factor(t, "REL", "2024-09-30") == 0.5
    assert abs(share_factors.eps_factor(t, "REL", "2017-06-30") - 0.5 * 0.99061 * 0.5) < 1e-12
    assert share_factors.eps_factor(t, "REL", "2025-03-31") == 1.0
    assert share_factors.eps_factor(t, "OTHER", "2020-01-01") == 1.0


def test_quality_suspect_reasons():
    d = pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-06", "2020-03-01", "2020-03-02", "2020-03-03",
                        "2020-03-04", "2020-03-05"])
    close = [100, 100, 20, 20, 60, 60, 120, 61, 61]
    adj = pd.DataFrame({"date": d, "close": close})
    raw = pd.DataFrame({"date": d, "close": close, "prev_close": [100, 100, 100, 20, 20, 60, 60, 120, 61]})
    got = {s["date"]: s["reason"] for s in quality.suspects(adj, raw, set())}
    assert got["2020-01-03"] == "split-like"                 # 100 -> 20 = 5:1 and it stayed
    assert got["2020-03-01"] == "long gap"                   # 54 days without a trade
    assert got["2020-03-03"] == "reverted"                   # 60 -> 120 -> 61
    assert quality.suspects(adj, raw, {pd.Timestamp("2020-01-03")})[0]["date"] != "2020-01-03"   # a known action
    raw2 = raw.copy()
    raw2.loc[2, "prev_close"] = 500                           # NSE re-based the price that day
    assert quality.suspects(adj, raw2, set())[0]["reason"] == "re-based"
    assert quality.split_like(100, 33.4) == 3 and quality.split_like(100, 45) is None
