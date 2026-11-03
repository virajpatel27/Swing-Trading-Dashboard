"""Find symbol renames NSE's symbolchange.csv misses (see swingdash/renames.py) and add them to
config/symbol_changes_extra.csv. Prints the symbols whose history must be re-read (Backfill history, job stocks).

    python scripts/find_renames.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from swingdash import config, renames  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402
from swingdash.sources import nse  # noqa: E402


def main() -> int:
    settings, universe = config.load("settings"), config.load("universe")
    http = PoliteSession(min_gap=settings["polite"]["nse_archives"], retries=3, backoff=3.0, timeout=60)
    master = pd.read_csv(ROOT / "data" / "meta" / "stocks.csv", dtype=str)
    days = sorted(pd.to_datetime(pd.read_csv(ROOT / "data" / "meta" / "trading_days.csv")["date"]).dt.date)
    changes = nse.symbol_changes(http)
    known = set(zip(changes["old"], changes["new"]))
    found = renames.find(http, master, days, config.as_date(universe["history_start"]), known)
    path = ROOT / "config" / "symbol_changes_extra.csv"
    if found.empty:
        print("no new renames found")
    else:
        renames.save(path, found)
        print(f"{len(found)} renames added to {path.relative_to(ROOT)}")
        print("re-read their history: Actions -> Backfill history -> job stocks, symbols:", ",".join(found["new"]),
              "from 2007-01-01")
    return 0


if __name__ == "__main__":
    sys.exit(main())
