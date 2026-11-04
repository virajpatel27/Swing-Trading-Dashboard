"""Data-quality report (Phase S2) -> reports/data_quality.md + .csv. Reads data/ only (no downloads).

    python scripts/quality_report.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import quality  # noqa: E402


def main() -> int:
    quality.run(ROOT, date.today())
    print("report: reports/data_quality.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
