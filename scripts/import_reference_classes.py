"""config/reference_classes.csv from a reference-app stock export (Viraj's choice 2026-11-07: sector, industry and themes
exactly as the reference app has them). The export itself stays in the git-ignored reference/ folder; only symbol ->
sector / industry / themes goes into the repo. Run again with a newer export to refresh.

    python scripts/import_reference_classes.py "reference/exports/SN File 06-11-2026/all-stocks 06-11-2026.csv"
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "config" / "reference_classes.csv"


def read_export(path: Path) -> pd.DataFrame:
    """The export writes the themes column as a bare JSON list ([\"A\",\"B\"]) - turn it into 'A|B' before reading."""
    lines = path.read_text(encoding="utf-8").splitlines()
    fixed = [lines[0]] + [re.sub(r',\[(.*?)\],', lambda m: ',"' + "|".join(json.loads("[" + m.group(1) + "]")) + '",', ln, count=1)
                          for ln in lines[1:]]
    return pd.read_csv(io.StringIO("\n".join(fixed)), dtype=str, keep_default_na=False)


def build(df: pd.DataFrame, as_of: str) -> pd.DataFrame:
    out = pd.DataFrame({"symbol": df["symbol"].str.strip(), "sector": df["sector"].str.strip(), "industry": df["industry"].str.strip(),
                        "themes": df["themes"].str.strip()})
    out["as_of"] = as_of
    return out[out["symbol"] != ""].drop_duplicates("symbol").sort_values("symbol").reset_index(drop=True)


def main(argv=None) -> int:
    argv = argv or sys.argv[1:]
    if not argv:
        print(__doc__)
        return 1
    src = Path(argv[0])
    m = re.search(r"(\d{2})-(\d{2})-(\d{2,4})", src.as_posix())
    as_of = f"{'20' + m.group(3) if len(m.group(3)) == 2 else m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""
    out = build(read_export(src), as_of)
    OUT.write_text(out.to_csv(index=False, lineterminator="\n"), encoding="utf-8", newline="\n")
    n_th = len({t for s in out["themes"] for t in s.split("|") if t})
    print(f"{OUT.relative_to(ROOT)}: {len(out)} stocks, {out['sector'].nunique()} sectors, {out['industry'].nunique()} industries, {n_th} themes (as of {as_of})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
