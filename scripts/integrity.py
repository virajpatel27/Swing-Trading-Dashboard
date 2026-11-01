"""Monthly integrity check (see swingdash/integrity.py). Exit code 1 when a problem is found.

    python scripts/integrity.py [--spot-days 5]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import config, integrity  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spot-days", type=int, default=5)
    a = ap.parse_args(argv)
    gaps = config.load("settings")["polite"]
    http = PoliteSession(min_gap=1.0, retries=3, backoff=3.0, timeout=60, gaps={"nsearchives.nseindia.com": gaps["nse_archives"]})
    res = integrity.run(ROOT / "data", http, date.today(), a.spot_days)
    text = integrity.report(res)
    print(text)
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "integrity.md").write_text(text, encoding="utf-8")
    (ROOT / "reports" / "integrity.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(text)
    print(f"::{'notice' if res['ok'] else 'error'} title=Integrity check::{text.replace(chr(10), '%0A')}")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
