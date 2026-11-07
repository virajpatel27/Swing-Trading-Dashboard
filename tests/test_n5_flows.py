"""Phase N5: FII / DII cash flows collected from NSE's latest-session API."""
import json

import pandas as pd

from swingdash import market_flows as mf

API = [{"buyValue": "18084.32", "category": "DII", "date": "06-Nov-2026", "netValue": "-5968.7", "sellValue": "24053.02"},
       {"buyValue": "30455.63", "category": "FII/FPI", "date": "06-Nov-2026", "netValue": "13749.82", "sellValue": "16705.81"}]


def test_parse_reads_both_rows():
    r = mf.parse(API)
    assert r == {"date": "2026-11-06", "dii_buy": 18084.32, "dii_sell": 24053.02, "dii_net": -5968.7,
                 "fii_buy": 30455.63, "fii_sell": 16705.81, "fii_net": 13749.82}


def test_parse_rejects_bad_answers():
    assert mf.parse({"x": 1}) is None
    assert mf.parse(API[:1]) is None                                     # FII missing
    other_day = [dict(API[0]), dict(API[1], date="05-Nov-2026")]
    assert mf.parse(other_day) is None                                   # two different sessions
    assert mf.parse([dict(API[0], netValue="n/a"), API[1]]) is None


def test_merge_replaces_same_day_and_sorts():
    a = mf.parse(API)
    old = pd.DataFrame([dict(a, date="2026-11-05"), dict(a, fii_net=1.0)], columns=mf.COLS)
    df = mf.merge(old, a)
    assert list(df["date"]) == ["2026-11-05", "2026-11-06"]
    assert df.loc[1, "fii_net"] == 13749.82
    assert len(mf.merge(None, a)) == 1


class _Resp:
    status_code = 200

    def json(self):
        return API


class _Http:
    def warm_up(self, home):
        pass

    def get(self, url, **kw):
        assert url.endswith("api/fiidiiTradeReact")
        return _Resp()


def test_update_writes_csv_and_site_payload(tmp_path):
    res = mf.update(tmp_path, _Http(), log=lambda *a: None)
    assert res == {"date": "2026-11-06", "sessions": 1, "changed": True}
    assert mf.update(tmp_path, _Http(), log=lambda *a: None)["changed"] is False        # same numbers again: no rewrite
    pay = mf.site_payload(tmp_path)
    assert pay["since"] == "2026-11-06" and pay["rows"][0]["dii_net"] == -5968.7
    json.dumps(pay)
