"""NSE sector/industry for every stock in the universe -> data/meta/classification.csv (only missing or > 30 days old).

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

from swingdash import classification, config  # noqa: E402
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
                          log=lambda m: print(m, flush=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
