"""History backfill 2007 -> today, resumable (run it again and it continues where it stopped).

    python scripts/backfill.py --job stocks --max-minutes 300
    python scripts/backfill.py --job nse-indices
    python scripts/backfill.py --job bse-indices          # PC only: BSE refuses GitHub's servers
    python scripts/backfill.py --job delivery             # delivery % 2007 -> (needs the stocks job's trading days)
    python scripts/backfill.py --job all

Afterwards run scripts/validate_data.py (the workflow does it) before committing.
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import backfill, config, store  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", choices=[*backfill.JOBS, "all", "compact"], required=True,
                    help="compact = join each instrument's history files into one (no download)")
    ap.add_argument("--symbols", default="", help="stocks job only: comma-separated symbols for a small extra run")
    ap.add_argument("--from", dest="start", type=date.fromisoformat, default=None, help="with --symbols: first day")
    ap.add_argument("--restart-from", type=date.fromisoformat, default=None,
                    help="stocks job: read again from this day for ALL stocks (e.g. 2007-01-01 after adding stocks to the list)")
    ap.add_argument("--max-minutes", type=float, default=330)
    ap.add_argument("--until", type=date.fromisoformat, default=None, help="last day to fetch (default: today)")
    ap.add_argument("--attempts", type=int, default=5, help="restarts after a network stop (each continues from the checkpoint)")
    ap.add_argument("--pause", type=int, default=120, help="seconds to wait before such a restart")
    a = ap.parse_args(argv)
    if a.job == "compact":
        n = 0
        for sub, cols in (("stocks/raw", store.STOCK_COLS), ("stocks/delivery", store.DELIVERY_COLS),
                          ("indices/nse", store.INDEX_COLS), ("indices/bse", store.INDEX_COLS)):
            base = ROOT / "data" / sub
            n += sum(store.compact(f, cols) for f in (base.iterdir() if base.exists() else []) if f.is_dir())
        print(f"compacted {n} instruments")
        return 0
    settings, universe = config.load("settings"), config.load("universe")
    gaps = settings["polite"]
    http = PoliteSession(min_gap=1.0, retries=4, backoff=3.0, timeout=60, gaps={
        "nsearchives.nseindia.com": gaps["nse_archives"], "www.nseindia.com": gaps["nse_api"], "api.bseindia.com": gaps["bse_api"]})
    ctx = backfill.Ctx(root=ROOT, http=http, settings=settings, universe=universe, today=date.today(),
                       deadline=time.monotonic() + a.max_minutes * 60, log=lambda m: print(m, flush=True))
    jobs = list(backfill.JOBS) if a.job == "all" else [a.job]
    for job in jobs:
        for attempt in range(1, a.attempts + 1):
            try:
                if job == "stocks" and a.symbols:
                    res = backfill.backfill_stocks(ctx, a.until, only=a.symbols.split(","), start=a.start)
                elif job == "stocks" and a.restart_from:
                    res = backfill.backfill_stocks(ctx, a.until, restart_from=a.restart_from)
                    a.restart_from = None            # a retry after a network stop continues from the checkpoint
                else:
                    res = backfill.JOBS[job](ctx, a.until)
            except Exception as exc:  # noqa: BLE001 - e.g. a list download failed before any checkpointed work
                res = {"stopped": f"{type(exc).__name__}: {str(exc)[:120]}"}
            if not res.get("stopped") or res["stopped"] == "time limit" or attempt == a.attempts:
                break
            # NSE sometimes drops connections for a few minutes: pause, then continue from the checkpoint
            print(f"{job} stopped ({res['stopped'][:80]}); waiting {a.pause}s, attempt {attempt + 1} of {a.attempts}", flush=True)
            time.sleep(a.pause)
        if res.get("stopped") and res["stopped"] != "time limit":
            print(f"::warning title=Backfill {job} stopped early::{res['stopped']} (the next run continues from the checkpoint)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
