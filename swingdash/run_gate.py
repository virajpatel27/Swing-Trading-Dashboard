"""Quick yes / no checks at the start of a workflow, so a run that has nothing to do ends in about a minute
(Viraj's schedule of 21-Nov-2026, all runs started by cron-job.org). Standard library only: the check runs before the
Python packages are installed.

  backup   (05:00 IST, Tue-Sat) run the daily update only when the last session is not complete:
           its stock prices are missing (last saved trading day before the previous weekday) or NSE's official index
           file of the last saved day is not read yet (checkpoint nse_indices.files_last_day older).
           A day after a market holiday also runs (the holiday list needs NSE; a ~15 minute run, harmless).
  season   (13:00 / 16:00 / 19:30 IST) read new quarterly results only in the results seasons: 10 Jul - 14 Aug,
           10 Oct - 14 Nov, 10 Jan - 14 Feb, 15 Apr - 30 May (SEBI: results within 45 days of a quarter's end,
           60 days for the year's last quarter).
"""
from __future__ import annotations

import csv
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
# (from month, from day, to month, to day), both ends included
SEASONS = [(7, 10, 8, 14), (10, 10, 11, 14), (1, 10, 2, 14), (4, 15, 5, 30)]


def ist_today() -> date:
    return datetime.now(IST).date()


def in_results_season(d: date) -> bool:
    return any((m1, d1) <= (d.month, d.day) <= (m2, d2) for m1, d1, m2, d2 in SEASONS)


def previous_weekday(d: date) -> date:
    p = d - timedelta(days=1)
    while p.weekday() >= 5:
        p -= timedelta(days=1)
    return p


def last_trading_day(meta: Path) -> date | None:
    p = meta / "trading_days.csv"
    if not p.exists():
        return None
    with open(p, encoding="utf-8") as f:
        days = [r["date"] for r in csv.DictReader(f) if r.get("date")]
    return date.fromisoformat(max(days)) if days else None


def index_files_last_day(meta: Path) -> date | None:
    p = meta / "checkpoints" / "nse_indices.json"
    try:
        v = json.loads(p.read_text(encoding="utf-8")).get("files_last_day")
        return date.fromisoformat(v) if v else None
    except (OSError, ValueError):
        return None


def backup_needed(meta: Path, today: date) -> tuple[bool, str]:
    last = last_trading_day(meta)
    if last is None:
        return True, "no trading days saved"
    want = previous_weekday(today)
    if last < want:
        return True, f"prices up to {last}, the session of {want} is missing (or it was a holiday)"
    idx = index_files_last_day(meta)
    if idx is None or idx < last:
        return True, f"NSE's official index file of {last} not read yet (read up to {idx})"
    return False, f"complete: prices and official index values up to {last}"


def decide(mode: str, meta: Path, today: date) -> tuple[bool, str]:
    if mode == "backup":
        return backup_needed(meta, today)
    if mode == "season":
        ok = in_results_season(today)
        return ok, f"{today}: {'results season' if ok else 'not a results season - nothing to do'}"
    return True, f"mode {mode}: always runs"
