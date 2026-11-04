"""Themes + sector / industry / theme indices (Phase S3): data/meta/themes.csv, data/meta/groups.csv, data/groups/.
Reads data/ only (no downloads). The daily job does the same; --review also writes reports/themes_review.md.

    python scripts/build_groups.py [--review]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import config, groups, themes  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", action="store_true", help="also write reports/themes_review.md (PC only)")
    a = ap.parse_args(argv)
    themes.run(ROOT, write_review=a.review)
    groups.build(ROOT, config.load("groups"), date.today(), config.load("settings").get("liquid"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
