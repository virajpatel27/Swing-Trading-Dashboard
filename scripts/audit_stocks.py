"""Stock master + universe audit (Phase 1). Builds data/meta/stocks.csv and writes reports/stock_audit.md / .csv.
Read-only towards NSE (a handful of list downloads). Safe to run any time.

    python scripts/audit_stocks.py [--master-only]

--master-only: build stocks.csv only, no report (GitHub workflows commit data/ only; a changed report outside data/ would
block their `git pull`).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import audit, config, stock_master  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master-only", action="store_true")
    a = ap.parse_args(argv)
    settings, universe = config.load("settings"), config.load("universe")
    gaps = settings["polite"]
    http = PoliteSession(min_gap=1.0, retries=3, backoff=3.0, timeout=60,
                         gaps={"nsearchives.nseindia.com": gaps["nse_archives"], "www.nseindia.com": gaps["nse_api"]})
    data = ROOT / "data"
    fno, bands = stock_master.download_lists(http)
    master = stock_master.build(data, fno, bands, settings.get("liquid"))
    print("stocks.csv", "written" if stock_master.write(data, master) else "unchanged")
    if a.master_only:
        return 0
    audit.run(ROOT, http, date.today(), config.as_date(universe["history_start"]), universe["stocks"]["all_list_url"])
    print("report: reports/stock_audit.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
