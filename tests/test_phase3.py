import io
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import backfill, meta, store, validate  # noqa: E402
from swingdash.sources import bse, nse  # noqa: E402


# ---------------------------------------------------------------- helpers
def series(dates, close=100.0):
    n = len(dates)
    return pd.DataFrame({"date": pd.to_datetime(dates), "open": [close] * n, "high": [close + 1] * n, "low": [close - 1] * n,
                         "close": [close] * n})


def zip_bytes(name: str, text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(name, text)
    return buf.getvalue()


def old_bhav(d: date, rows: list[tuple]) -> bytes:
    """rows: (symbol, series, close)"""
    lines = ["SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,"]
    ts = d.strftime("%d-%b-%Y").upper()
    lines += [f"{s},{se},{c},{c + 1},{c - 1},{c},{c},{c},1000,{c * 1000},{ts}," for s, se, c in rows]
    return zip_bytes("x.csv", "\n".join(lines))


def new_bhav(d: date, rows: list[tuple]) -> bytes:
    cols = "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal"
    lines = [cols] + [f"{d},{d},CM,NSE,STK,1,INE0,{s},{se},{c},{c + 1},{c - 1},{c},{c},{c},1000,{c * 1000}" for s, se, c in rows]
    return zip_bytes("x.csv", "\n".join(lines))


class Resp:
    def __init__(self, status=200, content=b"", data=None, text=""):
        self.status_code, self.content, self._data, self.text = status, content, data, text

    def json(self):
        return self._data


class FakeHttp:
    def __init__(self, route):
        self.route, self.calls = route, []

    def get(self, url, **kw):
        self.calls.append(url)
        return self.route(url)

    def warm_up(self, home):
        pass


# ---------------------------------------------------------------- store
def test_store_round_trip_and_split_by_year(tmp_path):
    df = series(["2024-12-30", "2024-12-31", "2025-01-02", "2026-01-02", "2026-01-05"])
    changed = store.write(tmp_path, df, store.INDEX_COLS, today=date(2026, 3, 1))
    assert sorted(changed) == ["current.csv", "hist_2024_2025.parquet"]
    back = store.read(tmp_path, store.INDEX_COLS)
    assert back["date"].dt.strftime("%Y-%m-%d").tolist() == ["2024-12-30", "2024-12-31", "2025-01-02", "2026-01-02", "2026-01-05"]
    assert (tmp_path / "current.csv").read_text().count("\n") == 3      # header + 2 rows of 2026


def test_daily_append_touches_only_current_csv(tmp_path):
    df = series(["2025-06-02", "2026-01-02"])
    store.write(tmp_path, df, store.INDEX_COLS, today=date(2026, 3, 1))
    more = pd.concat([df, series(["2026-01-05"])])
    assert store.write(tmp_path, more, store.INDEX_COLS, today=date(2026, 3, 1)) == ["current.csv"]
    assert store.write(tmp_path, more, store.INDEX_COLS, today=date(2026, 3, 1)) == []       # nothing new -> nothing written


def test_new_year_adds_a_parquet_and_keeps_old_one(tmp_path):
    store.write(tmp_path, series(["2025-06-02", "2026-01-02"]), store.INDEX_COLS, today=date(2026, 3, 1))
    changed = store.write(tmp_path, series(["2025-06-02", "2026-01-02", "2027-01-04"]), store.INDEX_COLS, today=date(2027, 1, 4))
    assert sorted(changed) == ["current.csv", "hist_2026_2026.parquet"]
    assert (tmp_path / "hist_2025_2025.parquet").exists()


def test_correction_in_closed_year_rewrites_that_file(tmp_path):
    store.write(tmp_path, series(["2025-06-02", "2026-01-02"]), store.INDEX_COLS, today=date(2026, 3, 1))
    fixed = series(["2025-06-02", "2026-01-02"])
    fixed.loc[0, "close"] = 99.5
    assert store.write(tmp_path, fixed, store.INDEX_COLS, today=date(2026, 3, 1)) == ["hist_2025_2025.parquet"]
    assert store.read(tmp_path, store.INDEX_COLS)["close"].iloc[0] == 99.5


def test_folder_name():
    assert store.folder_name("M&M") == "M_M"
    assert store.folder_name("BAJAJ-AUTO") == "BAJAJ-AUTO"
    assert store.folder_name("NIFTY 50") == "NIFTY_50"


# ---------------------------------------------------------------- NSE bhavcopy
def test_parse_both_bhav_formats_same_result():
    a = nse.parse_bhav(old_bhav(date(2024, 7, 5), [("RELIANCE", "EQ", 3100.0)]))
    b = nse.parse_bhav(new_bhav(date(2024, 7, 8), [("RELIANCE", "EQ", 3100.0)]))
    assert list(a.columns) == list(b.columns)
    assert a["date"].iloc[0] == pd.Timestamp("2024-07-05") and b["date"].iloc[0] == pd.Timestamp("2024-07-08")
    assert a["close"].iloc[0] == b["close"].iloc[0] == 3100.0


def test_bhav_urls():
    assert nse.bhav_url(date(2024, 7, 5)).endswith("/historical/EQUITIES/2024/JUL/cm05JUL2024bhav.csv.zip")
    assert nse.bhav_url(date(2024, 7, 8)).endswith("/cm/BhavCopy_NSE_CM_0_0_0_20240708_F_0000.csv.zip")


def test_holiday_file_with_previous_days_date_is_ignored():
    http = FakeHttp(lambda url: Resp(200, old_bhav(date(2026, 10, 1), [("TCS", "EQ", 10.0)])))
    assert nse.fetch_bhav(http, date(2026, 10, 2)) is None
    assert nse.fetch_bhav(FakeHttp(lambda url: Resp(404)), date(2026, 10, 2)) is None
    assert nse.fetch_bhav(http, date(2026, 10, 1)) is not None


def test_server_error_is_not_mistaken_for_a_holiday():
    with pytest.raises(nse.SourceError):
        nse.fetch_bhav(FakeHttp(lambda url: Resp(503)), date(2026, 10, 1))


def test_pick_rows_series_priority_and_rename():
    day = nse.parse_bhav(old_bhav(date(2020, 1, 1), [("OLDNAME", "BE", 50.0), ("OLDNAME", "EQ", 51.0), ("TCS", "BE", 9.0), ("X", "EQ", 1.0)]))
    rows = nse.pick_rows(day, {"OLDNAME": "NEWNAME", "TCS": "TCS"}, ["EQ", "BE"])
    got = dict(zip(rows["symbol"], zip(rows["series"], rows["close"])))
    assert got == {"NEWNAME": ("EQ", 51.0), "TCS": ("BE", 9.0)}


def test_symbol_history_follows_chain():
    changes = pd.DataFrame({"old": ["A", "B", "ZZ"], "new": ["B", "C", "Q"],
                            "date": pd.to_datetime(["2010-01-01", "2015-01-01", "2012-01-01"])})
    h = nse.symbol_history(changes, ["C", "TCS"])
    assert h["C"] == [("B", pd.Timestamp("2015-01-01")), ("A", pd.Timestamp("2010-01-01"))]
    assert nse.names_on(pd.Timestamp("2009-06-01"), ["C"], h) == {"A": "C"}
    assert nse.names_on(pd.Timestamp("2012-06-01"), ["C"], h) == {"B": "C"}
    assert nse.names_on(pd.Timestamp("2016-06-01"), ["C"], h) == {"C": "C"}


def test_parse_symbol_changes():
    text = b"NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\n Some Co,OLDX,NEWX,30-OCT-2019\n"
    df = nse.parse_symbol_changes(text)
    assert df.iloc[0].tolist() == ["OLDX", "NEWX", pd.Timestamp("2019-10-30")]


# ---------------------------------------------------------------- index parsers
def test_bse_csv_fills_missing_open_high_low_with_close():
    df = bse.parse_index_csv("Date,Open,High,Low,Close\n9-October-2023,,,,117.42\n10-October-2023,118,119,117,118.5\n")
    assert df.iloc[0][["open", "high", "low", "close"]].tolist() == [117.42] * 4
    assert len(df) == 2
    assert bse.parse_index_csv("<html>").empty


def test_nse_index_history_parser():
    rows = [{"EOD_TIMESTAMP": "03-JAN-2007", "EOD_OPEN_INDEX_VAL": 2, "EOD_HIGH_INDEX_VAL": 3, "EOD_LOW_INDEX_VAL": 1, "EOD_CLOSE_INDEX_VAL": 2.5},
            {"EOD_TIMESTAMP": "02-JAN-2007", "EOD_OPEN_INDEX_VAL": 1, "EOD_HIGH_INDEX_VAL": 2, "EOD_LOW_INDEX_VAL": 1, "EOD_CLOSE_INDEX_VAL": 1.5}]
    df = nse.parse_index_history(rows)
    assert df["date"].dt.day.tolist() == [2, 3] and df["close"].tolist() == [1.5, 2.5]


# ---------------------------------------------------------------- validation
def test_validation_rules():
    df = series(["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"])
    assert validate.check_series("X", df) == []
    bad = df.copy()
    bad.loc[1, "high"] = 50          # high below low/close
    bad.loc[2, "close"] = 150        # +50% jump
    found = {i["check"] for i in validate.check_series("X", bad)}
    assert found == {"bad candle", "unexplained jump"}
    assert validate.check_series("X", bad, explained={pd.Timestamp("2026-01-05"), pd.Timestamp("2026-01-06")})[0]["check"] == "bad candle"
    dup = pd.concat([df, df.tail(1)], ignore_index=True)
    assert any(i["level"] == "error" and i["check"] == "duplicate dates" for i in validate.check_series("X", dup))
    cal = pd.DatetimeIndex(pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05", "2026-01-06"]))
    miss = validate.check_series("X", df, trading_days=cal)
    assert miss[0]["check"] == "missing dates" and "1 trading days" in miss[0]["detail"]
    assert validate.check_series("X", df.iloc[0:0])[0]["level"] == "error"


def test_row_drop_is_an_error():
    assert validate.check_row_drop("X", 1000, 995, 1.0) == []
    assert validate.check_row_drop("X", 1000, 900, 1.0)[0]["level"] == "error"


def test_meta_scan_reports_disappeared_instrument(tmp_path):
    data = tmp_path / "data"
    store.write(data / "indices" / "bse" / "SENSEX", series(["2026-01-01", "2026-01-02"]), store.INDEX_COLS, date(2026, 3, 1))
    old = pd.DataFrame({"path": ["indices/bse/SENSEX", "indices/bse/GONE"], "rows": [2, 10]})
    inst, issues = meta.scan(data, None, 20.0, old, 1.0)
    assert inst["rows"].tolist() == [2]
    assert [i["check"] for i in issues] == ["instrument disappeared"]


# ---------------------------------------------------------------- backfill (fake NSE)
UNI = "Company Name,Industry,Symbol,Series,ISIN Code\nTata,IT,TCS,EQ,INE1\nNew Co,Fin,NEWX,EQ,INE2\n"
CHANGES = b"NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\nNew Co,OLDX,NEWX,05-JAN-2026\n"


def fake_nse(url):
    if url.endswith("ind_nifty500list.csv"):
        return Resp(200, UNI.encode())
    if url.endswith("symbolchange.csv"):
        return Resp(200, CHANGES)
    name = url.rsplit("/", 1)[1]                       # cm05JAN2026bhav.csv.zip
    d = pd.to_datetime(name[2:11], format="%d%b%Y").date()
    if d == date(2026, 1, 6):                          # a holiday
        return Resp(404)
    sym = "OLDX" if d < date(2026, 1, 5) else "NEWX"
    return Resp(200, old_bhav(d, [("TCS", "EQ", 100.0 + d.day), (sym, "EQ", 50.0 + d.day)]))


def make_ctx(tmp_path, http, deadline=float("inf"), clock=None):
    settings = {"flush_every_days": 2, "nse_index_chunk_days": 90}
    universe = {"history_start": "2026-01-01", "stocks": {"list_url": "https://x/ind_nifty500list.csv", "series_priority": ["EQ", "BE"]},
                "indices": {"nse_skip_categories": []}}
    kw = {"clock": clock} if clock else {}
    return backfill.Ctx(root=tmp_path, http=http, settings=settings, universe=universe, today=date(2026, 3, 1),
                        deadline=deadline, log=lambda m: None, **kw)


def test_stock_backfill_resumes_from_checkpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "UDIFF_FROM", date(2030, 1, 1))     # fake serves the old format only
    ticks = iter(range(1000))
    ctx = make_ctx(tmp_path, FakeHttp(fake_nse), deadline=2.5, clock=lambda: next(ticks))   # stops after 3 weekdays
    r1 = backfill.backfill_stocks(ctx, until=date(2026, 1, 9))
    assert r1["stopped"] == "time limit" and r1["last_day"] == "2026-01-05"
    http2 = FakeHttp(fake_nse)
    r2 = backfill.backfill_stocks(make_ctx(tmp_path, http2), until=date(2026, 1, 9))
    assert r2["stopped"] == "" and r2["last_day"] == "2026-01-09"
    asked = [u.rsplit("/", 1)[1] for u in http2.calls if "bhav" in u]
    assert asked[0] == "cm06JAN2026bhav.csv.zip"                 # continued, did not start again
    newx = store.read(tmp_path / "data/stocks/raw/NEWX", store.STOCK_COLS)
    assert newx["date"].dt.day.tolist() == [1, 2, 5, 7, 8, 9]     # old symbol before 05-Jan, holiday 06-Jan missing
    assert newx["close"].tolist() == [51.0, 52.0, 55.0, 57.0, 58.0, 59.0]
    days = pd.read_csv(tmp_path / "data/meta/trading_days.csv")["date"].tolist()
    assert "2026-01-06" not in days and len(days) == 6
    assert json.loads((tmp_path / "data/meta/checkpoints/nse_stocks.json").read_text())["last_day"] == "2026-01-09"


def test_stock_backfill_stops_on_server_error_without_gap(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "UDIFF_FROM", date(2030, 1, 1))

    def flaky(url):
        if "cm05JAN2026" in url:
            return Resp(503)
        return fake_nse(url)
    r = backfill.backfill_stocks(make_ctx(tmp_path, FakeHttp(flaky)), until=date(2026, 1, 9))
    assert r["last_day"] == "2026-01-02" and "503" in r["stopped"]
    tcs = store.read(tmp_path / "data/stocks/raw/TCS", store.STOCK_COLS)
    assert tcs["date"].max() == pd.Timestamp("2026-01-02")       # nothing after the failed day was saved


def test_nse_index_walk_back_stops_after_two_empty_windows(tmp_path):
    def route(url):
        if "ind_close_all" in url:
            return Resp(404)
        if "allIndices" in url:
            return Resp(200, data={"data": [{"index": "NIFTY 50", "key": "BROAD MARKET INDICES"}]})
        frm = pd.to_datetime(url.split("from=")[1].split("&")[0], format="%d-%m-%Y")
        if frm < pd.Timestamp("2025-06-01"):            # the index starts in mid 2025
            return Resp(200, data={"data": []})
        return Resp(200, data={"data": [{"EOD_TIMESTAMP": frm.strftime("%d-%b-%Y"), "EOD_OPEN_INDEX_VAL": 1,
                                         "EOD_HIGH_INDEX_VAL": 1, "EOD_LOW_INDEX_VAL": 1, "EOD_CLOSE_INDEX_VAL": 1}]})
    http = FakeHttp(route)
    ctx = make_ctx(tmp_path, http)
    ctx.universe["history_start"] = "2020-01-01"
    ctx.settings["nse_index_file_start"] = "2026-02-27"
    r = backfill.backfill_nse_indices(ctx, until=date(2026, 2, 28))
    assert r["finished_total"] == 1
    hist_calls = [u for u in http.calls if "historicalOR" in u]
    df = store.read(tmp_path / "data/indices/nse/NIFTY_50", store.INDEX_COLS)
    assert len(df) == len(hist_calls) - 2                        # every window with data + exactly 2 empty ones
    assert df["date"].min() >= pd.Timestamp("2025-06-01")


def test_nse_index_files_then_walk_back_from_oldest_file_day(tmp_path):
    def index_file(d):
        ds = d.strftime("%d-%m-%Y")
        head = "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value"
        rows = [f"Nifty  50,{ds},1,2,1,{d.day}", f"CNX Bank,{ds},1,2,1,5"]          # old name -> skipped in step A
        return Resp(200, ("\n".join([head, *rows])).encode())

    def route(url):
        if "allIndices" in url:
            return Resp(200, data={"data": [{"index": "NIFTY 50", "key": "BROAD"}, {"index": "NIFTY BANK", "key": "SECTORAL"}]})
        if "ind_close_all" in url:
            d = pd.to_datetime(url.rsplit("_", 1)[1][:8], format="%d%m%Y").date()
            if d == date(2026, 2, 4):
                return Resp(404)                                                 # holiday
            return index_file(d)
        frm = pd.to_datetime(url.split("from=")[1].split("&")[0], format="%d-%m-%Y")
        to = pd.to_datetime(url.split("to=")[1].split("&")[0], format="%d-%m-%Y")
        if to < pd.Timestamp("2026-01-01"):
            return Resp(200, data={"data": []})
        return Resp(200, data={"data": [{"EOD_TIMESTAMP": to.strftime("%d-%b-%Y"), "EOD_OPEN_INDEX_VAL": 1,
                                         "EOD_HIGH_INDEX_VAL": 1, "EOD_LOW_INDEX_VAL": 1, "EOD_CLOSE_INDEX_VAL": 7}]})
    http = FakeHttp(route)
    ctx = make_ctx(tmp_path, http)
    ctx.universe["history_start"] = "2025-01-01"
    ctx.settings["nse_index_file_start"] = "2026-02-02"
    r = backfill.backfill_nse_indices(ctx, until=date(2026, 2, 6))
    assert r["finished_total"] == 2 and r["unmatched_names"] == 1 and r["files_last_day"] == "2026-02-06"
    n50 = store.read(tmp_path / "data/indices/nse/NIFTY_50", store.INDEX_COLS)
    assert n50["date"].dt.strftime("%m-%d").tolist() == ["02-01", "02-02", "02-03", "02-05", "02-06"]   # API 1 Feb + files
    walk_urls = [u for u in http.calls if "historicalOR" in u and "NIFTY%2050" in u]
    assert "to=01-02-2026" in walk_urls[0]                     # NIFTY 50 walk starts the day before its oldest file day
    bank = store.read(tmp_path / "data/indices/nse/NIFTY_BANK", store.INDEX_COLS)
    assert bank["date"].min() == pd.Timestamp("2026-02-06")   # only the API filled it (walked back from `until`)


def test_compact_joins_history_files_and_keeps_rows(tmp_path):
    store.write(tmp_path, series(["2024-06-03"]), store.INDEX_COLS, today=date(2025, 3, 1))
    store.write(tmp_path, series(["2024-06-03", "2025-06-02", "2026-01-02"]), store.INDEX_COLS, today=date(2026, 3, 1))
    assert len(list(tmp_path.glob("hist_*.parquet"))) == 2
    before = store.read(tmp_path, store.INDEX_COLS)
    assert store.compact(tmp_path, store.INDEX_COLS) is True
    assert [p.name for p in tmp_path.glob("hist_*.parquet")] == ["hist_2024_2025.parquet"]
    pd.testing.assert_frame_equal(store.read(tmp_path, store.INDEX_COLS), before)
    assert store.compact(tmp_path, store.INDEX_COLS) is False
    # a later daily write keeps the joined file untouched
    more = pd.concat([before, series(["2026-01-05"])])
    assert store.write(tmp_path, more, store.INDEX_COLS, today=date(2026, 3, 1)) == ["current.csv"]


def test_extra_stock_run_has_own_checkpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "UDIFF_FROM", date(2030, 1, 1))
    http = FakeHttp(fake_nse)
    r = backfill.backfill_stocks(make_ctx(tmp_path, http), until=date(2026, 1, 9), only=["TCS"], start=date(2026, 1, 7))
    assert r["last_day"] == "2026-01-09"
    assert [u.rsplit("/", 1)[1][:11] for u in http.calls if "bhav" in u] == ["cm07JAN2026", "cm08JAN2026", "cm09JAN2026"]
    assert not (tmp_path / "data/stocks/raw/NEWX").exists()
    assert not (tmp_path / "data/meta/checkpoints/nse_stocks.json").exists()
    cp = json.loads((tmp_path / "data/meta/checkpoints/nse_stocks_extra.json").read_text())
    assert cp["symbols"] == ["TCS"]


def test_nse_index_list_falls_back_to_last_saved_list(tmp_path):
    ctx = make_ctx(tmp_path, FakeHttp(lambda url: Resp(200, data={"data": [{"index": "NIFTY 50", "key": "BROAD"}]})))
    assert backfill.nse_index_list(ctx)["name"].tolist() == ["NIFTY 50"]

    def down(url):
        raise ConnectionError("NSE down")
    ctx.http = FakeHttp(down)
    assert backfill.nse_index_list(ctx)["name"].tolist() == ["NIFTY 50"]       # last good list
    with pytest.raises(ConnectionError):
        backfill.nse_index_list(make_ctx(tmp_path / "empty", FakeHttp(down)))   # nothing saved yet -> real error


def test_gap_windows_group_missing_days():
    days = [pd.Timestamp(x) for x in ["2026-01-05", "2026-01-06", "2026-03-01", "2026-06-15", "2026-06-16"]]
    assert backfill.gap_windows(days, 90) == [(date(2026, 1, 5), date(2026, 3, 1)), (date(2026, 6, 15), date(2026, 6, 16))]
    assert backfill.gap_windows([], 90) == []


def test_nse_index_gaps_fills_holes_and_remembers_empty_windows(tmp_path):
    def route(url):
        frm = pd.to_datetime(url.split("from=")[1].split("&")[0], format="%d-%m-%Y")
        to = pd.to_datetime(url.split("to=")[1].split("&")[0], format="%d-%m-%Y")
        days = [d for d in pd.bdate_range(frm, to) if d.month != 6]          # the API has nothing for June
        return Resp(200, data={"data": [{"EOD_TIMESTAMP": d.strftime("%d-%b-%Y"), "EOD_CLOSE_INDEX_VAL": 9} for d in days]})
    http = FakeHttp(route)
    ctx = make_ctx(tmp_path, http)
    cal = pd.bdate_range("2026-01-01", "2026-07-31")
    backfill.write_trading_days(ctx, {d.date() for d in cal})
    have = series([d for d in cal if not (d.month == 2 and d.day < 10) and d.month != 6])   # holes: 1-9 Feb and June
    have.loc[0, ["open", "high", "low"]] = None                                              # a close-only row
    store.write(tmp_path / "data/indices/nse/X", have, store.INDEX_COLS, ctx.today)
    lst = pd.DataFrame({"name": ["X"], "id": ["X"]})
    cp = {}
    assert backfill.nse_index_gaps(ctx, lst, cp, tmp_path / "cp.json") == ""
    df = store.read(tmp_path / "data/indices/nse/X", store.INDEX_COLS)
    assert df["date"].isin(pd.bdate_range("2026-02-02", "2026-02-09")).sum() == 6           # February hole filled
    assert not df["date"].dt.month.eq(6).any()                                               # June still missing
    assert df[["open", "high", "low"]].notna().all().all()                                   # close-only row filled
    assert cp["gaps"]["X"]["empty"] == [["2026-06-01", "2026-06-30"]]
    cp["gaps"]["X"]["done"] = False
    http.calls.clear()
    backfill.nse_index_gaps(ctx, lst, cp, tmp_path / "cp.json")
    assert http.calls == []                                                                  # empty window not asked again


def test_nse_parsers_fill_close_only_rows():
    df = nse.parse_index_history([{"EOD_TIMESTAMP": "02-JAN-2007", "EOD_OPEN_INDEX_VAL": None, "EOD_HIGH_INDEX_VAL": None,
                                   "EOD_LOW_INDEX_VAL": None, "EOD_CLOSE_INDEX_VAL": 5.0}])
    assert df.iloc[0][["open", "high", "low", "close"]].tolist() == [5.0] * 4
