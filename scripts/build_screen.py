"""Screen snapshot (Phase S4) -> data/snapshot/screen.json (git-ignored; the website workflow builds it).

    python scripts/build_screen.py [--as-of 2026-11-03] [--out screen.json]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import screen  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", default=None, help="build for this day instead of the latest (calibration)")
    ap.add_argument("--out", default="screen.json")
    ap.add_argument("--workers", type=int, default=None)
    a = ap.parse_args(argv)
    t = time.time()
    snap = screen.build(ROOT, a.as_of, a.workers)
    path = screen.write(ROOT / "data", snap, a.out)
    screen.write_groups(ROOT / "data", snap, a.out.replace("screen", "group_ranks"))
    screen.write_groups(ROOT / "data", snap, a.out.replace("screen", "breadth"), key="breadth")
    print(f"{path.relative_to(ROOT)} written in {time.time() - t:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
