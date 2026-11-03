import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from swingdash import backfill, daily, meta, rebuild, snapshot, store  # noqa: E402
from swingdash import corporate_actions as ca  # noqa: E402
from swingdash.sources import nse  # noqa: E402
from test_phase3 import FakeHttp, Resp, fake_nse, make_ctx, old_bhav  # noqa: E402
from test_phase5_snapshot import make_market  # noqa: E402


def test_recheck_start():
    days = {date(2026, 1, d) for d in (1, 2, 5, 6, 7, 8, 9)}
    assert daily.recheck_start(days, 5, date(2007, 1, 1)) == date(2026, 1, 5)
    assert daily.recheck_start({date(2026, 1, 9)}, 5, date(2007, 1, 1)) == date(2026, 1, 9)
    assert daily.recheck_start(set(), 5, date(2007, 1, 1)) == date(2007, 1, 1)


def test_daily_restart_reads_last_days_again_and_takes_corrections(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "UDIFF_FROM", date(2030, 1, 1))
    backfill.backfill_stocks(make_ctx(tmp_path, FakeHttp(fake_nse)), until=date(2026, 1, 9))
    corrected = {"value": 999.0}

    def route(url):                                     # NSE re-published 08-Jan with a corrected TCS close
        if "cm08JAN2026" in url:
            return Resp(200, old_bhav(date(2026, 1, 8), [("TCS", "EQ", corrected["value"]), ("NEWX", "EQ", 58.0)]))
        return fake_nse(url)
    http = FakeHttp(route)
    r = backfill.backfill_stocks(make_ctx(tmp_path, http), until=date(2026, 1, 9), restart_from=date(2026, 1, 7))
    asked = [u.rsplit("/", 1)[1][:11] for u in http.calls if "bhav" in u]
    assert asked == ["cm07JAN2026", "cm08JAN2026", "cm09JAN2026"] and r["last_day"] == "2026-01-09"
    tcs = store.read(tmp_path / "data/stocks/raw/TCS", store.STOCK_COLS).set_index("date")["close"]
    assert tcs[pd.Timestamp("2026-01-08")] == 999.0
    cp = json.loads((tmp_path / "data/meta/checkpoints/nse_stocks.json").read_text())
    assert cp == {"last_day": "2026-01-09"}                                   # no date stamp: holiday runs change nothing


def test_snapshot_not_rewritten_when_only_the_time_changes(tmp_path):
    data = make_market(tmp_path)
    latest, sectors = snapshot.build(data, log=lambda m: None)
    assert snapshot.write(data, latest, sectors) is True
    latest2, sectors2 = snapshot.build(data, log=lambda m: None)
    latest2["generated_at"] = sectors2["generated_at"] = "2099-01-01 00:00"
    assert snapshot.write(data, latest2, sectors2) is False
    latest2["rows"][0][latest2["columns"].index("close")] = 1.0
    assert snapshot.write(data, latest2, sectors2) is True


def test_health_kept_when_only_check_time_changes(tmp_path):
    data = tmp_path / "data"
    inst = pd.DataFrame(columns=meta.INSTRUMENT_COLS)
    meta.write_reports(data, inst, [])
    first = (data / "meta/health.json").read_text()
    meta.write_reports(data, inst, [])
    assert (data / "meta/health.json").read_text() == first
    meta.write_reports(data, inst, [{"instrument": "X", "level": "warn", "check": "c", "date": "", "detail": ""}])
    assert json.loads((data / "meta/health.json").read_text())["warnings"] == 1


def test_weekly_bse_update_adds_new_days_and_new_indices(tmp_path):
    ctx = make_ctx(tmp_path, None)
    ctx.universe["history_start"] = "2007-01-01"
    old = pd.DataFrame({"date": pd.bdate_range("2026-01-01", "2026-01-20"), "open": 1.0, "high": 1.0, "low": 1.0, "close": 1.0})
    store.write(tmp_path / "data/indices/bse/SENSEX", old, store.INDEX_COLS, ctx.today)
    (tmp_path / "data/meta").mkdir(parents=True, exist_ok=True)

    def route(url):
        if "FillddlIndex" in url:
            return Resp(200, data={"Table": [{"Indx_cd": "SENSEX", "shortalias": "BSE SENSEX"}, {"Indx_cd": "NEWIDX", "shortalias": "BSE New"}]})
        frm = pd.to_datetime(url.split("dtFromDate=")[1].split("&")[0], format="%d/%m/%Y")
        days = pd.bdate_range(frm, "2026-01-30")
        lines = ["Date,Open,High,Low,Close"] + [f"{d.day}-{d.strftime('%B')}-{d.year},2,2,2,2" for d in days]
        return Resp(200, text="\n".join(lines))
    ctx.http = FakeHttp(route)
    r = backfill.update_bse_indices(ctx, until=date(2026, 1, 30))
    assert r["new_indices"] == 1 and r["rows_added"] > 0
    sx_url = [u for u in ctx.http.calls if "strIndex=SENSEX" in u][0]
    assert "dtFromDate=10/01/2026" in sx_url                               # 10 days before the last stored day
    sx = store.read(tmp_path / "data/indices/bse/SENSEX", store.INDEX_COLS)
    assert sx["date"].max() == pd.Timestamp("2026-01-30")
    assert "dtFromDate=01/01/2007" in [u for u in ctx.http.calls if "strIndex=NEWIDX" in u][0]   # a new index: whole history


def test_rebuild_keeps_last_good_actions_when_nse_fails(tmp_path):
    data = tmp_path / "data"
    raw = pd.DataFrame({"date": pd.to_datetime(["2024-10-25", "2024-10-28"]), "open": [2687.0, 1337.0], "high": [2688.7, 1353.0],
                        "low": [2644.0, 1322.1], "close": [2655.7, 1334.35], "prev_close": 0.0, "volume": [9298748, 10824350],
                        "value": 0.0, "series": "EQ"})
    store.write(data / "stocks/raw/RELIANCE", raw, store.STOCK_COLS, date(2026, 3, 1))
    (data / "meta").mkdir(parents=True)
    pd.DataFrame({"symbol": ["RELIANCE"], "id": ["RELIANCE"]}).to_csv(data / "meta/universe_stocks.csv", index=False)
    (tmp_path / "config").mkdir()
    r1 = rebuild.rebuild_adjusted(tmp_path, None, {}, {"history_start": "2024-01-01"}, date(2026, 3, 1),
                                  raw_actions=[{"symbol": "RELIANCE", "series": "EQ", "exDate": "28-Oct-2024", "subject": "Bonus 1:1", "faceVal": "10"}],
                                  log=lambda m: None)
    first = store.read(data / "stocks/adjusted/RELIANCE", ["date", "close"])["close"].tolist()

    class Down:
        def get(self, *a, **k):
            raise ConnectionError("NSE down")

        def warm_up(self, h):
            pass
    r2 = rebuild.rebuild_adjusted(tmp_path, Down(), {}, {"history_start": "2024-01-01"}, date(2026, 3, 1), log=lambda m: None)
    assert r1["actions_source"] == "NSE" and r2["actions_source"] == "saved files"
    assert store.read(data / "stocks/adjusted/RELIANCE", ["date", "close"])["close"].tolist() == first == [1327.85, 1334.35]
    assert ca.load(data / "corporate_actions", "RELIANCE")["status"].tolist() == ["applied"]


def test_placeholder_symbols_are_left_out(tmp_path):
    uni = "Company Name,Industry,Symbol,Series,ISIN Code\nTata,IT,TCS,EQ,INE1\nDummy HEG,Capital Goods,DUMMYHEG,EQ,INE2\n"
    ctx = make_ctx(tmp_path, FakeHttp(lambda url: Resp(200, uni.encode())))
    ctx.universe["stocks"]["exclude_prefixes"] = ["DUMMY"]
    assert backfill.stock_universe(ctx)["symbol"].tolist() == ["TCS"]


def test_instrument_list_order_is_the_same_on_windows_and_linux(tmp_path):
    data = tmp_path / "data"
    for sid in ("JAINREC", "J_KBANK", "jlow"):
        store.write(data / "indices/bse" / sid, pd.DataFrame({"date": pd.to_datetime(["2026-01-01"]), "open": 1.0, "high": 1.0,
                                                               "low": 1.0, "close": 1.0}), store.INDEX_COLS, date(2026, 3, 1))
    inst, _ = meta.scan(data, None, 20.0, None, 1.0)
    assert inst["id"].tolist() == ["JAINREC", "J_KBANK", "jlow"]          # plain string order ('A' < '_' < 'j')


ALL_INDICES = {"timestamp": "03-Nov-2026 15:30", "data": [
    {"index": "NIFTY 50", "open": 23582.25, "high": 23810.85, "low": 23482.8, "last": 23810.85},
    {"index": "NIFTY BANK", "open": 0, "high": 0, "low": 0, "last": 51000.5},           # 0 = no value in this API
    {"index": "SOME NEW INDEX", "open": 1, "high": 1, "low": 1, "last": 1}]}


def test_parse_index_closes_only_after_the_session():
    df = nse.parse_index_closes(ALL_INDICES)
    assert df["date"].iat[0] == pd.Timestamp("2026-11-03") and df["close"].tolist() == [23810.85, 51000.5, 1.0]
    assert df.loc[1, ["open", "high", "low"]].tolist() == [51000.5] * 3                 # filled with the close
    assert nse.parse_index_closes({**ALL_INDICES, "timestamp": "03-Nov-2026 11:42"}) is None   # market still open


def test_same_day_index_values_fill_only_missing_days(tmp_path):
    ctx = make_ctx(tmp_path, FakeHttp(lambda url: Resp(200, data=ALL_INDICES)))
    (tmp_path / "data/meta").mkdir(parents=True)
    pd.DataFrame({"name": ["NIFTY 50", "NIFTY BANK"], "id": ["NIFTY_50", "NIFTY_BANK"]}).to_csv(tmp_path / "data/meta/indices_nse.csv", index=False)
    official = pd.DataFrame({"date": pd.to_datetime(["2026-11-02", "2026-11-03"]), "open": 1.0, "high": 1.0, "low": 1.0, "close": [5.0, 6.0]})
    store.write(tmp_path / "data/indices/nse/NIFTY_BANK", official, store.INDEX_COLS, ctx.today)
    store.write(tmp_path / "data/indices/nse/NIFTY_50", official.iloc[:1], store.INDEX_COLS, ctx.today)
    assert daily.add_index_closes_today(ctx, log=lambda m: None) == 1
    n50 = store.read(tmp_path / "data/indices/nse/NIFTY_50", store.INDEX_COLS)
    assert n50["close"].tolist() == [5.0, 23810.85]
    bank = store.read(tmp_path / "data/indices/nse/NIFTY_BANK", store.INDEX_COLS)
    assert bank["close"].tolist() == [5.0, 6.0]                                         # an existing (official) day is not touched
    assert daily.add_index_closes_today(ctx, log=lambda m: None) == 0                   # a second run adds nothing
