"""Should this workflow run do its work? Writes run=true / false to $GITHUB_OUTPUT (swingdash/run_gate.py).

    python scripts/run_gate.py --mode backup     # daily backup run (05:00 IST)
    python scripts/run_gate.py --mode season     # quarterly results runs (13:00 / 16:00 / 19:30 IST)
    python scripts/run_gate.py --mode full       # always yes
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import run_gate  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="full", choices=["full", "backup", "season"])
    a = ap.parse_args(argv)
    ok, why = run_gate.decide(a.mode, ROOT / "data" / "meta", run_gate.ist_today())
    print(f"::notice title=Run check ({a.mode})::{'run' if ok else 'skip'} - {why}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"run={'true' if ok else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
