"""BSE shareholding patterns for the stocks NSE has none for (old BSE stocks admitted to NSE in 2026, BSE filers such as
ABBOTINDIA) -> data/fundamentals/<SYMBOL>.json "shp" (same format as NSE's, so the screen, free float, FII / DII and the
stock panel use them at once). PC ONLY: api.bseindia.com refuses GitHub's servers (HTTP 403). Shareholding changes once a
quarter, so running it with the weekly "BSE update" is enough; the daily job then uses the saved data every day.

    python scripts/fetch_bse_shareholding.py                 # stocks without the newest quarter (resumes, skips files it has)
    python scripts/fetch_bse_shareholding.py --symbols ABBOTINDIA,KOVAI --quarters 5

Viraj 17-Nov-2026: "aatla stock no data laiye ... website ma deploy kariye".
"""
from __future__ import annotations

import argparse
import calendar
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import fundamentals as F  # noqa: E402
from swingdash import http as H  # noqa: E402
from swingdash.sources import bse  # noqa: E402

LIST_URL = bse.API + "/SHPQNewFormat/w?scripcode={code}&qtrid="
FILE_URL = "https://www.bseindia.com/XBRLFILES/SHPXBRLDataXML/{name}"
MONTHS = {m: i for i, m in enumerate(calendar.month_name) if m}
KEEP = ("prom", "fii", "dii", "govt", "public", "others", "n")


def quarter_end(text: str) -> str | None:
    """'September 2026' -> '2026-09-30'."""
    parts = str(text).split()
    if len(parts) != 2 or parts[0] not in MONTHS or not parts[1].isdigit():
        return None
    y, m = int(parts[1]), MONTHS[parts[0]]
    return f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


def to_fetch(data: Path) -> list[str]:
    """Active stocks whose newest saved quarter is older than the quarter most stocks have."""
    st = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    latest = {s: max(F.load(data, s).get("shp", {}) or {"": 0}) for s in st.loc[st["status"] == "active", "symbol"]}
    newest = Counter(latest.values()).most_common(1)[0][0]
    return sorted(s for s, q in latest.items() if q < newest)


def fetch_one(http, data: Path, symbol: str, code: str, quarters: int) -> int:
    """Saves the newest `quarters` BSE patterns of one stock; returns how many quarters were added."""
    r = http.get(LIST_URL.format(code=code), headers=bse.HEADERS)
    if r.status_code != 200:
        raise RuntimeError(f"list HTTP {r.status_code}")
    table = (r.json() or {}).get("Table") or []
    doc = F.load(data, symbol)
    doc.setdefault("shp", {}); doc.setdefault("files", {})
    added = 0
    for e in table[:quarters]:
        qe, name = quarter_end(e.get("qtr")), e.get("XbrlFile")
        if not qe or not name or f"BSE:{name}" in doc["files"]:
            continue
        x = http.get(FILE_URL.format(name=name), headers=bse.HEADERS)
        if x.status_code != 200:
            continue
        s = F.shareholding(x.content.decode("utf-8-sig", errors="replace"))
        if not s or s.get("prom") is None:
            continue
        doc["shp"][qe] = {k: s[k] for k in KEEP if k in s}
        doc["files"][f"BSE:{name}"] = str(e.get("revised_date_time") or e.get("filing_date_time") or "")[:10]
        added += 1
    if added:
        F.save(data, doc)
    return added


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="", help="comma-separated symbols (default: every stock without the newest quarter)")
    ap.add_argument("--quarters", type=int, default=5, help="newest quarters per stock (5 = 1Q and 1Y changes)")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args(argv)
    data = ROOT / "data"
    codes = pd.read_csv(data / "meta" / "bse_history.csv", dtype=str).fillna("")
    code_of = {s: c for s, c in zip(codes["symbol"], codes["bse_code"]) if c}
    syms = [s.strip().upper() for s in a.symbols.split(",") if s.strip()] or to_fetch(data)
    if a.limit:
        syms = syms[: a.limit]
    http = H.PoliteSession(min_gap=1.0)
    done = skipped = failed = quarters = 0
    for i, s in enumerate(syms, 1):
        code = code_of.get(s)
        if not code:
            skipped += 1
            continue
        try:
            n = fetch_one(http, data, s, code, a.quarters)
            quarters += n
            done += 1 if n else 0
        except Exception as e:  # noqa: BLE001 - one stock must not stop the rest
            failed += 1
            print(f"  {s}: {e}")
        if i % 25 == 0:
            print(f"  {i} / {len(syms)} stocks, {quarters} quarters saved", flush=True)
    print(f"BSE shareholding: {len(syms)} stocks asked, {done} updated ({quarters} quarters), {skipped} without a BSE code, {failed} failed")
    return 0 if failed <= max(5, len(syms) // 10) else 1


if __name__ == "__main__":
    raise SystemExit(main())
