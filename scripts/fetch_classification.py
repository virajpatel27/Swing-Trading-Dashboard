"""NSE sector/industry, share count and promoter holding for every stock in the universe -> data/meta/classification.csv
(only missing, > 30 days old, without a share count yet, or after a split / bonus). Two NSE calls per stock (~6 s), so the
first full run takes ~4.5 h: a stopped run simply continues next time.

    python scripts/fetch_classification.py [--max-minutes 60]
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import classification, config, stock_master  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=60)
    a = ap.parse_args(argv)
    settings = config.load("settings")
    http = PoliteSession(min_gap=1.0, retries=3, backoff=3.0, timeout=60, gaps={"www.nseindia.com": settings["polite"]["nse_api"]})
    uni = pd.read_csv(ROOT / "data" / "meta" / "universe_stocks.csv")
    classification.update(ROOT / "data" / "meta" / "classification.csv", uni, http, date.today(),
                          int(settings.get("classification_refresh_days", 30)), time.monotonic() + a.max_minutes * 60,
                          log=lambda m: print(m, flush=True),
                          force=stock_master.share_count_changed(ROOT / "data", date.today()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
