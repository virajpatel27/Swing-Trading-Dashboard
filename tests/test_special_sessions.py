"""Weekend / holiday NSE sessions (Muhurat, budget Saturdays): found 10-Nov-2026, 21 were missing since 2007."""
from datetime import date, timedelta

from swingdash import backfill


def test_weekdays_include_special_and_recent_weekend_days():
    days = list(backfill.weekdays(date(2026, 10, 26), date(2026, 11, 20)))
    assert date(2026, 11, 8) in days                       # Diwali Muhurat (Sunday), from config/special_sessions.csv
    assert date(2026, 11, 1) not in days and date(2026, 10, 31) not in days   # ordinary weekend days are skipped
    today = date.today()
    recent = list(backfill.weekdays(today - timedelta(days=30), today))
    assert all(today - timedelta(days=k) in recent for k in range(7))         # a run up to today tries its last 7 days
    old_weekend = [today - timedelta(days=k) for k in range(10, 30) if (today - timedelta(days=k)).weekday() >= 5
                   and today - timedelta(days=k) not in backfill.special_days()]
    assert not any(d in recent for d in old_weekend)


def test_special_list_has_the_known_sessions():
    sp = backfill.special_days()
    for d in ("2026-11-08", "2026-02-01", "2025-02-01", "2024-01-20", "2023-11-12", "2020-11-14"):
        assert date.fromisoformat(d) in sp


def test_lonely_special_session_rows_are_dropped(tmp_path):
    import pandas as pd
    from swingdash import store
    raw = tmp_path / "data" / "stocks" / "raw"
    good = pd.DataFrame({"date": pd.to_datetime(["2020-11-12", "2020-11-13", "2020-11-14", "2020-11-17"]), "close": [1, 2, 3, 4]})
    lonely = pd.DataFrame({"date": pd.to_datetime(["2009-10-17", "2020-11-14", "2024-06-03"]), "close": [5, 6, 7]})
    store.write(raw / "GOOD", good, store.STOCK_COLS, date(2026, 11, 10))
    store.write(raw / "LONELY", lonely, store.STOCK_COLS, date(2026, 11, 10))
    ctx = backfill.Ctx(root=tmp_path, http=None, settings={}, universe={}, today=date(2026, 11, 10), log=lambda *_: None)
    assert backfill.drop_lonely_special_rows(ctx) == 2
    assert len(store.read(raw / "GOOD", store.STOCK_COLS)) == 4                  # the Muhurat row between normal days stays
    assert store.read(raw / "LONELY", store.STOCK_COLS)["date"].dt.strftime("%Y-%m-%d").tolist() == ["2024-06-03"]
    store.write(raw / "ONLY", lonely.iloc[:2], store.STOCK_COLS, date(2026, 11, 10))       # only lonely rows: folder removed
    assert backfill.drop_lonely_special_rows(ctx) == 2 and not (raw / "ONLY").exists()


def test_planned_drops_are_not_a_row_drop_error(tmp_path):
    import pandas as pd
    from swingdash import meta, store
    data = tmp_path / "data"
    store.write(data / "stocks" / "raw" / "EDUCOMP", pd.DataFrame({"date": pd.to_datetime(["2026-11-06", "2026-11-09"]), "close": [1, 2]}),
                store.STOCK_COLS, date(2026, 11, 10))
    old = pd.DataFrame({"path": ["stocks/raw/EDUCOMP"], "rows": [20]})
    _, issues = meta.scan(data, None, 50.0, old, 20.0)
    assert any(i["check"] == "row drop" for i in issues)                    # 20 -> 2 without a note = a failed download
    backfill.record_dropped_rows(data, [{"removed_on": str(date.today()), "id": "EDUCOMP", "date": f"2009-10-{d}",
                                         "reason": "lonely special-session row"} for d in range(10, 28)])
    _, issues = meta.scan(data, None, 50.0, old, 20.0)
    assert not any(i["check"] == "row drop" for i in issues)                # 18 planned removals: 20 - 18 = 2 rows expected


def test_stock_removed_on_purpose_is_not_disappeared(tmp_path):
    import pandas as pd
    from swingdash import meta
    data = tmp_path / "data"
    (data / "stocks" / "raw").mkdir(parents=True)
    old = pd.DataFrame({"path": ["stocks/raw/RAJVIR", "stocks/adjusted/RAJVIR", "stocks/raw/OTHER"], "rows": [7, 7, 50]})
    backfill.record_dropped_rows(data, [{"removed_on": str(date.today()), "id": "RAJVIR", "date": f"2009-10-1{d}",
                                         "reason": "lonely special-session row"} for d in range(7)])
    _, issues = meta.scan(data, None, 50.0, old, 20.0)
    gone = [i for i in issues if i["check"] == "instrument disappeared"]
    assert [i["instrument"] for i in gone] == ["stocks/raw/OTHER"]                 # RAJVIR planned, OTHER still an error
