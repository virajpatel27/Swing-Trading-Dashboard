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
