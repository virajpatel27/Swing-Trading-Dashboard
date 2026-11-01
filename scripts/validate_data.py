"""Check all stored data; write data/meta/instruments.csv, data_issues.csv and health.json.
Exit code 1 when there is an 'error' (then the data must NOT be committed).

    python scripts/validate_data.py
    python scripts/validate_data.py --baseline old_instruments.csv   # row-drop check against an earlier list
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import config, meta  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", type=Path, default=None, help="instruments.csv from before the run (default: the current one)")
    ap.add_argument("--no-baseline", action="store_true", help="skip the row-drop check (after a restore to an older backup)")
    a = ap.parse_args(argv)
    data = ROOT / "data"
    v = config.load("settings")["validation"]
    base = a.baseline or data / "meta" / "instruments.csv"
    old = None if a.no_baseline else (pd.read_csv(base) if base.exists() else None)
    tdp = data / "meta" / "trading_days.csv"
    days = pd.DatetimeIndex(pd.to_datetime(pd.read_csv(tdp)["date"])) if tdp.exists() else None
    inst, issues = meta.scan(data, days, float(v["jump_pct"]), old, float(v["max_row_drop_pct"]))
    health = meta.write_reports(data, inst, issues)
    print(f"Instruments {health['instruments']} {health['by_group']}, rows {health['rows']:,}, newest {health['newest_date']}")
    print(f"Errors {health['errors']}, warnings {health['warnings']} (details: data/meta/data_issues.csv)")
    for i in [i for i in issues if i["level"] == "error"][:20]:
        print(f"::error title=Data check: {i['check']}::{i['instrument']} {i['date']} {i['detail']}")
    return 1 if health["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
