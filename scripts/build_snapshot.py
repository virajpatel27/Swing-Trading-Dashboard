"""Indicators + relative strength for every stock and index -> data/snapshot/latest.json and sectors.json.

    python scripts/build_snapshot.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import snapshot  # noqa: E402


def main() -> int:
    latest, sectors = snapshot.build(ROOT / "data", log=lambda m: print(m, flush=True))
    snapshot.write(ROOT / "data", latest, sectors)
    return 0


if __name__ == "__main__":
    sys.exit(main())
