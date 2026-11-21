"""Quarterly results during the results seasons (Viraj, 21-Nov-2026: 13:00 / 16:00 / 19:30 IST from cron-job.org):
the new results / shareholding files NSE listed since the last read (fundamentals.daily, the same step the daily update
runs) and then stocks never read yet (new listings, bounded time). Run by the "Results season" workflow.

    python scripts/fundamentals_results.py --max-minutes 25
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import backfill, config, fundamentals  # noqa: E402
from swingdash.run_gate import ist_today  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=25)
    a = ap.parse_args(argv)
    settings, universe = config.load("settings"), config.load("universe")
    gaps = settings["polite"]
    http = PoliteSession(min_gap=1.0, retries=4, backoff=3.0, timeout=60,
                         gaps={"nsearchives.nseindia.com": gaps["nse_archives"], "www.nseindia.com": gaps["nse_api"]})
    ctx = backfill.Ctx(root=ROOT, http=http, settings=settings, universe=universe, today=ist_today(),
                       deadline=time.monotonic() + a.max_minutes * 60, log=lambda m: print(m, flush=True))
    data = ctx.data
    if not backfill.checkpoint(ctx, "fundamentals").exists():
        print("Fundamentals not started: run Backfill history with job fundamentals once.")
        return 0
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    res = fundamentals.daily(data, http, uni, ctx.today, backfill.checkpoint(ctx, "fundamentals_daily"),
                             time.monotonic() + a.max_minutes * 60 * 0.6, log=ctx.log)
    print(f"::notice title=Quarterly results::{res}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
