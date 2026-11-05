"""Coverage of the fundamentals data (Phase S8): how many stocks have results, balance sheet, cash flow and shareholding,
how fresh the latest quarter is. Writes data/meta/fundamentals_coverage.json (small, committed with the data) and prints
a GitHub notice; with --md also reports/fundamentals_coverage.md (PC).

    python scripts/fundamentals_report.py [--md]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import fundamentals  # noqa: E402


def coverage(data: Path, today: date) -> dict:
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv", dtype=str)
    n5 = set(uni.loc[uni.get("n500", "").astype(str).str.lower().isin(["true", "1"]), "symbol"])
    rows = []
    for sym in uni["symbol"]:
        p = fundamentals.path_of(data, sym)
        if not p.exists():
            rows.append({"symbol": sym, "n500": sym in n5, "doc": False})
            continue
        d = fundamentals.load(data, sym)
        b = d.get(fundamentals.basis_of(d), {})
        q = sorted(b.get("q", {}))
        rows.append({"symbol": sym, "n500": sym in n5, "doc": True, "kind": d.get("kind") or "?",
                     "quarters": len(q), "last_q": q[-1] if q else "", "years": len(b.get("y", {})),
                     "bs": len(b.get("bs", {})), "cf": len(b.get("cf", {})), "shp": len(d.get("shp", {}))})
    df = pd.DataFrame(rows)
    have = df[df["doc"]]
    stale_cut = (pd.Timestamp(today) - pd.Timedelta(days=150)).strftime("%Y-%m-%d")
    part = lambda m: {"stocks": int(m.sum()), "with_doc": int((m & df["doc"]).sum())}
    out = {"date": today.isoformat(), "universe": len(df), "nifty500": part(df["n500"]), "all": part(df["n500"] | ~df["n500"])}
    if len(have):
        out.update({
            "kinds": dict(Counter(have["kind"])),
            "with_8_quarters": int((have["quarters"] >= 8).sum()),
            "with_5_years": int((have["years"] >= 5).sum()),
            "with_balance_sheet": int((have["bs"] > 0).sum()),
            "with_cash_flow": int((have["cf"] > 0).sum()),
            "with_shareholding": int((have["shp"] > 0).sum()),
            "latest_quarter_older_than_150_days": int((have["last_q"] < stale_cut).sum()),
            "no_results": sorted(have.loc[have["quarters"] == 0, "symbol"])[:50],
        })
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", action="store_true")
    a = ap.parse_args(argv)
    data = ROOT / "data"
    c = coverage(data, date.today())
    (data / "meta").mkdir(parents=True, exist_ok=True)
    (data / "meta" / "fundamentals_coverage.json").write_text(json.dumps(c, indent=1) + "\n", encoding="utf-8")
    msg = (f"Nifty 500: {c['nifty500']['with_doc']}/{c['nifty500']['stocks']} stocks, all: {c['all']['with_doc']}/{c['all']['stocks']}; "
           f"8+ quarters {c.get('with_8_quarters', 0)}, 5+ years {c.get('with_5_years', 0)}, balance sheet {c.get('with_balance_sheet', 0)}, "
           f"shareholding {c.get('with_shareholding', 0)}")
    print(f"::notice title=Fundamentals coverage::{msg}")
    if a.md:
        lines = ["# Fundamentals coverage", "", f"Made {c['date']} by `scripts/fundamentals_report.py --md`.", "",
                 "| | value |", "|---|---|"]
        lines += [f"| {k} | {v} |" for k, v in c.items() if k not in ("no_results", "date")]
        if c.get("no_results"):
            lines += ["", "Stocks with a document but no results (often new listings or a format we do not read yet): "
                      + ", ".join(c["no_results"])]
        (ROOT / "reports").mkdir(exist_ok=True)
        (ROOT / "reports" / "fundamentals_coverage.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
