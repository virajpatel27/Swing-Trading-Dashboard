"""Find symbol renames that NSE's symbolchange.csv does not list (e.g. PHILIPCARB -> PCBL on 13-Jan-2022).

A stock whose stored history starts much later than its listing date (or than 2007) may have traded under another symbol
before. The bhavcopy of its first stored day carries its ISIN; if the bhavcopy of the trading day before shows the same ISIN
under a different symbol, that symbol is the old name. Bhavcopies have an ISIN column from about mid-2011 on, so earlier
renames cannot be found this way (they stay in the audit as late_start).

Results go to config/symbol_changes_extra.csv (old, new, date, note); nse.symbol_changes() adds them to NSE's list, so the
backfill, the corporate actions and the daily job all follow them. The missing history then comes from
Actions -> Backfill history (job stocks, symbols = the new names, from 2007-01-01).
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from .sources import nse

EXTRA_COLS = ["old", "new", "date", "note"]


def candidates(master: pd.DataFrame, history_start: date, late_days: int = 30) -> pd.DataFrame:
    """Active stocks whose history starts more than late_days after max(listing date, history start)."""
    m = master[master["first_date"].fillna("") != ""].copy()
    listed = pd.to_datetime(m["listed"], errors="coerce").fillna(pd.Timestamp(history_start))
    expect = listed.where(listed > pd.Timestamp(history_start), pd.Timestamp(history_start))
    m["gap"] = (pd.to_datetime(m["first_date"]) - expect).dt.days
    return m[m["gap"] > late_days]


def previous_day(days: list[date], d: date) -> date | None:
    before = [x for x in days if x < d]
    return before[-1] if before else None


def match(first_day: pd.DataFrame, day_before: pd.DataFrame, symbol: str) -> str | None:
    """The other symbol that carried this stock's ISIN on the day before its first stored day."""
    isin = first_day.loc[first_day["symbol"] == symbol, "isin"]
    isin = next((i for i in isin if i.startswith("INE")), None)
    if not isin:
        return None
    old = day_before[(day_before["isin"] == isin) & (day_before["symbol"] != symbol)]["symbol"].unique()
    return old[0] if len(old) == 1 else None


def find(http, master: pd.DataFrame, trading_days: list[date], history_start: date, known: set[tuple[str, str]],
         log=print) -> pd.DataFrame:
    rows = []
    cache: dict[date, pd.DataFrame | None] = {}

    def bhav(d: date):
        if d not in cache:
            cache[d] = nse.fetch_bhav(http, d)
        return cache[d]

    for r in candidates(master, history_start).itertuples():
        first = date.fromisoformat(r.first_date)
        prev = previous_day(trading_days, first)
        if prev is None:
            continue
        a, b = bhav(first), bhav(prev)
        if a is None or b is None or not (a["isin"] != "").any():
            log(f"  {r.symbol}: no ISIN in the bhavcopy of {first} (before ~2011) - cannot check")
            continue
        old = match(a, b, r.symbol)
        if old and (old, r.symbol) not in known:
            rows.append({"old": old, "new": r.symbol, "date": first.isoformat(),
                         "note": f"same ISIN in NSE bhavcopy {prev} / {first}"})
            log(f"  {r.symbol}: was {old} until {prev}")
    return pd.DataFrame(rows, columns=EXTRA_COLS)


def save(path: Path, found: pd.DataFrame) -> pd.DataFrame:
    """Add new findings to config/symbol_changes_extra.csv (existing lines are kept)."""
    old = pd.read_csv(path, dtype=str) if path.exists() else pd.DataFrame(columns=EXTRA_COLS)
    both = pd.concat([old, found], ignore_index=True).drop_duplicates(["old", "new"], keep="first").sort_values(["new", "date"])
    path.parent.mkdir(parents=True, exist_ok=True)
    both.to_csv(path, index=False, lineterminator="\n")
    return both
