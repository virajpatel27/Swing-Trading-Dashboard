"""Corporate actions (NSE) -> data/corporate_actions/<SYMBOL>.csv and adjusted prices -> data/stocks/adjusted/<SYMBOL>/.
Raw prices are never changed. Afterwards run scripts/validate_data.py.

    python scripts/build_adjusted.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import config, rebuild  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main() -> int:
    settings, universe = config.load("settings"), config.load("universe")
    gaps = settings["polite"]
    http = PoliteSession(min_gap=1.0, retries=4, backoff=3.0, timeout=60,
                         gaps={"nsearchives.nseindia.com": gaps["nse_archives"], "www.nseindia.com": gaps["nse_api"]})
    rebuild.rebuild_adjusted(ROOT, http, settings, universe, date.today(), cache=ROOT / "cache",
                             log=lambda m: print(m, flush=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
