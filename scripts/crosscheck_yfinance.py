"""Validation only (never changes data): compare our adjusted closes with Yahoo Finance.

Yahoo's 'Close' is adjusted for splits and bonuses only (not demergers, rights or dividends), so it is compared with OUR raw
prices adjusted for splits/bonus/consolidation only. A day "mismatches" when the two differ by more than --threshold %.
Writes data/meta/crosscheck_yfinance.csv (one line per stock) and prints the worst ones.

    python scripts/crosscheck_yfinance.py [--threshold 2] [--symbols RELIANCE,TCS]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import adjust, store  # noqa: E402
from swingdash import corporate_actions as ca  # noqa: E402


def split_only(raw: pd.DataFrame, acts: pd.DataFrame) -> pd.Series:
    """Raw closes adjusted for the applied split/bonus/consolidation actions only (what Yahoo does)."""
    exact = acts[acts["type"].isin(adjust.EXACT) & acts["status"].astype(str).str.startswith("applied")]
    if exact.empty:
        return raw.set_index("date")["close"]
    days = exact["status"].str.extract(r"applied on (\d{4}-\d{2}-\d{2})")[0].fillna(exact["ex_date"].dt.strftime("%Y-%m-%d"))
    mult = pd.Series(1.0, index=raw["date"])
    for d, f in zip(pd.to_datetime(days), exact["factor"].astype(float)):
        mult[mult.index < d] *= f
    return raw.set_index("date")["close"] * mult


def compare(ours: pd.Series, yahoo: pd.Series, threshold: float) -> dict:
    both = pd.concat([ours.rename("ours"), yahoo.rename("yahoo")], axis=1, join="inner").dropna()
    both = both[both["yahoo"] > 0]
    if both.empty:
        return {"days_compared": 0}
    ratio = both["ours"] / both["yahoo"]
    bad = ratio[(ratio - 1).abs() > threshold / 100]
    worst = (ratio - 1).abs().idxmax()
    return {"days_compared": len(both), "mismatch_days": len(bad), "mismatch_pct": round(100 * len(bad) / len(both), 2),
            "worst_date": worst.strftime("%Y-%m-%d"), "worst_ratio": round(float(ratio[worst]), 4),
            "first_mismatch": bad.index.min().strftime("%Y-%m-%d") if len(bad) else "",
            "last_mismatch": bad.index.max().strftime("%Y-%m-%d") if len(bad) else ""}


def main(argv=None) -> int:
    import yfinance as yf
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=2.0, help="percent difference that counts as a mismatch")
    ap.add_argument("--symbols", default="")
    ap.add_argument("--batch", type=int, default=40)
    a = ap.parse_args(argv)
    data = ROOT / "data"
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    if a.symbols:
        uni = uni[uni["symbol"].isin(a.symbols.split(","))]
    rows = []
    syms = uni["symbol"].tolist()
    ids = dict(zip(uni["symbol"], uni["id"]))
    for k in range(0, len(syms), a.batch):
        part = syms[k:k + a.batch]
        got = yf.download([f"{s}.NS" for s in part], start="2007-01-01", auto_adjust=False, progress=False,
                          group_by="ticker", threads=False)
        for s in part:
            raw = store.read(data / "stocks" / "raw" / ids[s], store.STOCK_COLS)
            if raw.empty:
                continue
            try:
                yc = got[f"{s}.NS"]["Close"].dropna()
            except KeyError:
                yc = pd.Series(dtype=float)
            yc.index = pd.to_datetime(yc.index).tz_localize(None).normalize()
            acts = ca.load(data / "corporate_actions", ids[s])
            if not len(yc):
                rows.append({"symbol": s, "days_compared": 0})
                continue
            # Yahoo adjusts splits/bonus always, demergers and rights only sometimes: keep the closer of the two bases
            full = store.read(data / "stocks" / "adjusted" / ids[s], adjust.ADJ_COLS).set_index("date")["close"]
            a1 = {"basis": "split/bonus only", **compare(split_only(raw, acts), yc, a.threshold)}
            a2 = {"basis": "all actions", **compare(full, yc, a.threshold)}
            rows.append({"symbol": s, **min(a1, a2, key=lambda r: r.get("mismatch_days", 1e9))})
        print(f"  {min(k + a.batch, len(syms))} of {len(syms)} compared", flush=True)
        time.sleep(2)
    out = pd.DataFrame(rows)
    out.to_csv(data / "meta" / "crosscheck_yfinance.csv", index=False, lineterminator="\n")
    ok = out[out["days_compared"] > 0]
    print(f"Yahoo had data for {len(ok)} of {len(out)} stocks; median mismatch {ok['mismatch_pct'].median():.2f}% of days; "
          f"stocks with > 5% mismatching days: {(ok['mismatch_pct'] > 5).sum()}")
    print(ok.sort_values("mismatch_pct", ascending=False).head(15).to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
