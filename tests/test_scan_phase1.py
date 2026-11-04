"""Scanner plan Phase 1: stock master, liquid flag, audit, renames, field registry."""
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import audit, backfill, registry, renames, snapshot, stock_master, store  # noqa: E402
from swingdash.sources import nse  # noqa: E402

TODAY = date(2026, 11, 3)


def raw_rows(start: str, n: int, close: float, value: float) -> pd.DataFrame:
    d = pd.bdate_range(start, periods=n)
    return pd.DataFrame({"date": d, "open": close, "high": close, "low": close, "close": close, "prev_close": close,
                         "volume": 1000, "value": value, "series": "EQ"})


def make_data(tmp: Path) -> Path:
    data = tmp / "data"
    (data / "meta").mkdir(parents=True)
    pd.DataFrame({"symbol": ["BIG", "THIN", "PENNY", "OLD", "NEWCO"], "name": list("ABCDE"),
                  "isin": ["INE1", "INE2", "INE3", "INE4", "INE5"], "series": ["EQ", "EQ", "BE", "EQ", "EQ"],
                  "listed": ["2001-01-01", "2010-05-03", "2001-01-01", "2001-01-01", "2026-11-02"],
                  "industry": "", "n500": [True, False, False, False, False],
                  "id": ["BIG", "THIN", "PENNY", "OLD", "NEWCO"]}).to_csv(data / "meta" / "universe_stocks.csv", index=False)
    pd.DataFrame({"symbol": ["BIG", "THIN"], "macro": "", "sector": ["IT", "Banks"], "industry": "", "basic_industry": "",
                  "indices": "", "shares": ["1000000000", ""], "float_pct_nse": ["40", ""], "face_value": ["1", ""],
                  "promoter_pct": ["55", ""], "shp_date": ["2026-09-30", ""], "source": "NSE",
                  "fetched": "2026-10-01"}).to_csv(data / "meta" / "classification.csv", index=False)
    raw = data / "stocks" / "raw"
    store.write(raw / "BIG", raw_rows("2026-08-03", 70, 100.0, 5e7), store.STOCK_COLS, TODAY)     # Rs 5 Cr a day
    store.write(raw / "THIN", raw_rows("2026-08-03", 70, 100.0, 5e6), store.STOCK_COLS, TODAY)    # Rs 0.5 Cr
    store.write(raw / "PENNY", raw_rows("2026-08-03", 70, 3.0, 5e7), store.STOCK_COLS, TODAY)     # price < 5
    store.write(raw / "OLD", raw_rows("2026-06-01", 30, 50.0, 5e7), store.STOCK_COLS, TODAY)      # stopped trading
    return data


def test_master_market_cap_float_liquid_status(tmp_path):
    data = make_data(tmp_path)
    bands = pd.DataFrame({"symbol": ["BIG", "PENNY"], "series": ["EQ", "BE"], "band": ["No Band", "5"]})
    m = stock_master.build(data, {"BIG"}, bands, log=lambda s: None).set_index("symbol")
    assert list(m.reset_index().columns) == stock_master.COLS
    assert m.loc["BIG", "mcap_cr"] == 10000.0                       # 1e9 shares x Rs 100 / 1e7
    assert m.loc["BIG", "float_pct"] == 45.0 and m.loc["BIG", "float_mcap_cr"] == 4500.0   # 100 - promoter 55
    assert bool(m.loc["BIG", "liquid"]) and not m.loc["THIN", "liquid"] and not m.loc["PENNY", "liquid"]
    assert m.loc["OLD", "status"] == "inactive" and not m.loc["OLD", "liquid"]
    assert m.loc["NEWCO", "status"] == "no_history" and m.loc["NEWCO", "sessions"] == 0
    assert bool(m.loc["BIG", "fno"]) and not m.loc["THIN", "fno"]
    assert m.loc["PENNY", "price_band"] == "5" and m.loc["BIG", "price_band"] == "No Band"
    assert pd.isna(m.loc["THIN", "mcap_cr"])                        # no share count yet
    assert stock_master.write(data, m.reset_index()) is True
    assert stock_master.write(data, m.reset_index()) is False       # same content -> nothing to commit
    # lists not downloadable -> the saved flags stay
    m2 = stock_master.build(data, None, None, log=lambda s: None).set_index("symbol")
    assert bool(m2.loc["BIG", "fno"]) and m2.loc["PENNY", "price_band"] == "5"


def test_liquid_rule_uses_median_and_settings(tmp_path):
    data = make_data(tmp_path)
    m = stock_master.build(data, set(), None, {"min_turnover_cr": 0.4}, log=lambda s: None).set_index("symbol")
    assert bool(m.loc["THIN", "liquid"])                            # 0.5 Cr >= 0.4 Cr
    r = raw_rows("2026-08-03", 30, 10.0, 1e7)
    r.loc[:3, "value"] = 1e10                                       # four huge days move the average, not the median
    st = stock_master.price_stats(r, 30)
    assert st["turnover_med30_cr"] == 1.0 and st["turnover_avg30_cr"] > 100


def test_share_count_changed_after_split(tmp_path):
    data = make_data(tmp_path)
    (data / "corporate_actions").mkdir()
    pd.DataFrame({"ex_date": ["2026-10-20", "2027-01-01"], "type": ["split", "bonus"]}).to_csv(
        data / "corporate_actions" / "BIG.csv", index=False)
    assert stock_master.share_count_changed(data, TODAY) == {"BIG"}           # split after 2026-10-01
    assert stock_master.share_count_changed(data, date(2026, 10, 10)) == set()


def test_nse_list_parsers():
    assert nse.parse_fno(b"UNDERLYING,SYMBOL ,NOV-26\nNIFTY 50,NIFTY ,65\nTITAN LTD,TITAN ,175\n") == {"NIFTY", "TITAN"}
    b = nse.parse_price_bands(b"Symbol,Series,Security Name,Band,Remarks\nABAN,BE,ABAN,2,-\n")
    assert b.iloc[0].to_dict() == {"symbol": "ABAN", "series": "BE", "band": "2"}
    d = nse.parse_delisted("Symbol,Company,Delisted Date,Type of Delisting,,\nCABOT,Cabot Ltd,15-Apr-02,Voluntary ,,\n"
                           .encode("latin-1"))
    assert d.iloc[0].to_dict() == {"symbol": "CABOT", "name": "Cabot Ltd", "date": "2002-04-15", "type": "Voluntary"}


def test_audit_findings(tmp_path):
    data = make_data(tmp_path)
    m = stock_master.build(data, set(), None, log=lambda s: None)
    m["shares"] = pd.to_numeric(m["shares"])
    nse_list = pd.DataFrame({"symbol": ["BIG", "THIN", "PENNY", "OLD", "NEWCO", "MISSING1", "DUMMYX"]})
    changes = pd.DataFrame({"old": ["GONE2"], "new": ["BIG"], "date": [pd.Timestamp("2020-01-01")]})
    delisted = pd.DataFrame({"symbol": ["GONE1"], "name": ["x"], "date": ["2010-01-01"], "type": ["Compulsory"]})
    bhav = pd.DataFrame({"date": pd.Timestamp("2026-11-02"), "symbol": ["BIG", "FRESH", "SMECO"],
                         "series": ["EQ", "EQ", "SM"], "isin": ["INE1", "INE9", "INE8"]})
    f = audit.findings(m, nse_list, ["BIG", "THIN", "PENNY", "OLD", "GONE1", "GONE2"], delisted, changes, bhav,
                       date(2007, 1, 1))
    got = {(r.check, r.symbol) for r in f.itertuples()}
    assert ("missing", "MISSING1") in got and ("missing", "DUMMYX") not in got
    assert ("orphan", "GONE1") in got and ("orphan", "GONE2") in got
    assert ("new_listing", "FRESH") in got and ("new_listing", "SMECO") not in got
    assert ("inactive", "OLD") in got and ("no_history", "NEWCO") in got
    assert ("late_start", "THIN") in got                            # listed 2010, history from 2026
    assert ("no_sector", "PENNY") in got and ("no_shares", "THIN") in got
    text = audit.report(m, f, TODAY)
    assert "liquid" in text and "### missing: 1" in text


def test_etfs_are_not_new_listings(tmp_path):
    data = make_data(tmp_path)
    m = stock_master.build(data, set(), None, log=lambda s: None)
    bhav = pd.DataFrame({"date": pd.Timestamp("2026-11-02"), "symbol": ["GOLDBEES"], "series": ["EQ"],
                         "isin": ["INF204KB17I5"]})
    f = audit.findings(m, None, [], None, None, bhav, date(2007, 1, 1))
    assert f[f["check"] == "new_listing"].empty


def test_rename_found_by_isin():
    day1 = pd.DataFrame({"symbol": ["PHILIPCARB", "X"], "isin": ["INE602A01023", "INE000"]})
    day2 = pd.DataFrame({"symbol": ["PCBL", "X"], "isin": ["INE602A01023", "INE000"]})
    assert renames.match(day2, day1, "PCBL") == "PHILIPCARB"
    assert renames.match(day2, day1, "X") is None                   # same symbol both days: no rename
    assert renames.previous_day([date(2022, 1, 12), date(2022, 1, 13)], date(2022, 1, 13)) == date(2022, 1, 12)
    master = pd.DataFrame({"symbol": ["PCBL", "OK"], "listed": ["1995-03-29", "2001-01-01"],
                           "first_date": ["2022-01-13", "2007-01-02"]})
    assert list(renames.candidates(master, date(2007, 1, 1))["symbol"]) == ["PCBL"]


def test_carry_over_renames(tmp_path):
    data = make_data(tmp_path)
    raw = data / "stocks" / "raw"
    store.write(raw / "OLDNAME", raw_rows("2026-01-01", 40, 7.0, 1e6), store.STOCK_COLS, TODAY)
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    ctx = SimpleNamespace(data=data, today=TODAY, log=lambda s: None)
    changes = pd.DataFrame({"old": ["OLDNAME"], "new": ["NEWCO"], "date": [pd.Timestamp("2026-02-01")]})
    assert backfill.carry_over_renames(ctx, changes, uni) == ["NEWCO"]
    got = store.read(raw / "NEWCO", store.STOCK_COLS)
    assert len(got) == 22 and got["date"].max() < pd.Timestamp("2026-02-01")     # only days before the change
    assert backfill.carry_over_renames(ctx, changes, uni) == []                   # second run: nothing new


def test_registry_dependencies():
    reg = registry.load()
    files = {"stocks": stock_master.COLS, "snapshot": snapshot.COLUMNS, "delivery": store.DELIVERY_COLS}
    assert registry.check(reg, files) == []


def test_registry_catches_mistakes():
    reg = {"current_phase": 1, "sources": {"bhavcopy": "x"},
           "fields": [{"id": "a", "label": "A", "type": "number", "formula": "f", "inputs": ["bhavcopy"],
                       "provided_in_phase": 1, "source": "s", "file": ["f1"]},
                      {"id": "b", "label": "B", "type": "number", "formula": "f", "inputs": ["c", "zzz"],
                       "provided_in_phase": 1, "source": "s"},
                      {"id": "c", "label": "C", "type": "weird", "formula": "f", "inputs": [], "provided_in_phase": 4,
                       "source": "s", "file": ["f1"]}]}
    errs = registry.check(reg, {"f1": ["a", "c", "nope"]})
    assert any("unknown input zzz" in e for e in errs)
    assert any("uses c from a later phase" in e for e in errs)
    assert any("unknown type weird" in e for e in errs)
    assert any("column nope is not in the registry" in e for e in errs)
    assert any("column c belongs to phase 4" in e for e in errs)
