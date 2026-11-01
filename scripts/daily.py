"""The daily update (see swingdash/daily.py). Run by .github/workflows/daily.yml; afterwards scripts/validate_data.py decides
whether the data may be committed.

    python scripts/daily.py [--max-minutes 150]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import backfill, config, daily  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def ist_today() -> date:
    """The market's date (the runner's clock is UTC; 23:50 IST is still 'today' in India). IST has no daylight saving."""
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=150)
    a = ap.parse_args(argv)
    settings, universe = config.load("settings"), config.load("universe")
    gaps = settings["polite"]
    http = PoliteSession(min_gap=1.0, retries=4, backoff=3.0, timeout=60,
                         gaps={"nsearchives.nseindia.com": gaps["nse_archives"], "www.nseindia.com": gaps["nse_api"]})
    ctx = backfill.Ctx(root=ROOT, http=http, settings=settings, universe=universe, today=ist_today(),
                       deadline=time.monotonic() + a.max_minutes * 60, log=lambda m: print(m, flush=True))
    res = daily.run(ctx, log=ctx.log)
    summary = (f"### Daily update {res['today']}\n\nData date: **{res['data_date']}** · new trading days: "
               f"{', '.join(res['new_trading_days']) or 'none'} · NSE index files up to {res['nse_indices']['files_last_day']} · "
               f"holiday: {res['holiday']} · corporate actions from: {res['adjusted']['actions_source']}\n")
    if res["problems"]:
        summary += "\nProblems (the next run continues from the checkpoint): " + "; ".join(res["problems"]) + "\n"
    print(f"::notice title=Daily update::{summary.replace(chr(10), ' ')}")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(summary)
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "daily_last.json").write_text(json.dumps(res, indent=1, default=str) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
