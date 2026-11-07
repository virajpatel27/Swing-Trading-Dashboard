"""Daily price cross-check against a second source (from 07-Nov-2026): BSE's bhavcopy of the same day.

Most of our stocks trade on BSE too (matched by ISIN). Closing prices of the two exchanges are set separately, so small
differences are normal, and illiquid stocks can differ a lot. A wrong price of OURS (wrong file, wrong day, bad tick)
shows as a liquid stock closing far apart. So:
  - compared: LIQUID stocks (stocks.csv) that BSE also traded with >= min_bse_volume shares that day
  - mismatch: closes more than max_diff_pct apart -> data/meta/crosscheck_bse.csv (one row per stock, latest day only)
  - summary: data/meta/crosscheck_bse.json {date, compared, mismatched, share_pct}
The data check (validate_data.py) gives a WARNING per mismatch and an ERROR when more than max_share % of the compared
stocks are mismatched (then something is wrong with the whole day: nothing is committed).
www.bseindia.com/download answers GitHub's servers (checked 2026-10-31). Daily step 4h.
"""
from __future__ import annotations

import io
import json
from datetime import date
from pathlib import Path

import pandas as pd

from . import store
from .validate import issue

URL = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{d:%Y%m%d}_F_0000.CSV"
HEADERS = {"Referer": "https://www.bseindia.com/", "Accept": "*/*"}
COLS = ["date", "symbol", "nse_close", "bse_close", "diff_pct", "bse_volume"]


def fetch(http, d: date) -> pd.DataFrame | None:
    """BSE's equity bhavcopy of day d (ISIN, close, volume), or None when BSE has none for that day."""
    r = http.get(URL.format(d=d), headers=HEADERS)
    if r.status_code != 200 or len(r.content) < 10_000:
        return None
    return parse(r.text, d)


def parse(text: str, d: date) -> pd.DataFrame | None:
    df = pd.read_csv(io.StringIO(text), dtype=str)
    if "ISIN" not in df.columns or "ClsPric" not in df.columns:
        return None
    if "FinInstrmTp" in df.columns:
        df = df[df["FinInstrmTp"] == "STK"]
    if "TradDt" in df.columns:
        df = df[df["TradDt"].str.strip() == str(d)]                 # only that day's prices (BSE file of another day: none)
    out = pd.DataFrame({"isin": df["ISIN"].str.strip(), "bse_close": pd.to_numeric(df["ClsPric"], errors="coerce"),
                        "bse_volume": pd.to_numeric(df["TtlTradgVol"], errors="coerce")})
    return out.dropna(subset=["bse_close"]).drop_duplicates("isin")


def compare(data: Path, bse: pd.DataFrame, d: date, max_diff_pct: float = 3.0, min_bse_volume: int = 1000) -> tuple[pd.DataFrame, dict]:
    master = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    master = master[(master["status"] == "active") & (master["liquid"] == "True")]
    rows, compared = [], 0
    day = pd.Timestamp(d)
    b = bse.set_index("isin")
    for r in master.itertuples():
        if r.isin not in b.index or b.at[r.isin, "bse_volume"] < min_bse_volume:
            continue
        raw = store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS)
        raw = raw[raw["date"] == day]
        if raw.empty:
            continue
        compared += 1
        nse_c, bse_c = float(raw["close"].iat[-1]), float(b.at[r.isin, "bse_close"])
        diff = (bse_c / nse_c - 1) * 100 if nse_c > 0 else float("inf")
        if abs(diff) > max_diff_pct:
            rows.append({"date": str(d), "symbol": r.symbol, "nse_close": nse_c, "bse_close": bse_c, "diff_pct": round(diff, 2),
                         "bse_volume": int(b.at[r.isin, "bse_volume"])})
    mism = pd.DataFrame(rows, columns=COLS).sort_values("diff_pct", key=abs, ascending=False) if rows else pd.DataFrame(columns=COLS)
    summary = {"date": str(d), "compared": compared, "mismatched": len(mism),
               "share_pct": round(100 * len(mism) / compared, 2) if compared else None, "max_diff_pct": max_diff_pct}
    return mism, summary


def daily(data: Path, http, d: date, log=print) -> dict:
    """Step 4h: compare day d (the newest stock day). Writes the two files; never raises for a missing BSE file."""
    bse = fetch(http, d)
    if bse is None or bse.empty:
        log(f"crosscheck BSE: no BSE bhavcopy for {d} (yet)")
        return {"date": str(d), "compared": 0, "note": "no BSE file"}
    mism, summary = compare(data, bse, d)
    meta = data / "meta"
    mism.to_csv(meta / "crosscheck_bse.csv", index=False, lineterminator="\n")
    (meta / "crosscheck_bse.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    if len(mism):
        top = ", ".join(f"{r.symbol} {r.diff_pct:+.1f}%" for r in mism.head(8).itertuples())
        log(f"::warning title=NSE vs BSE closes::{len(mism)} of {summary['compared']} liquid stocks close > 3 % apart: {top}")
    log(f"crosscheck BSE: {summary}")
    return summary


def issues(data: Path, max_share: float = 10.0) -> list[dict]:
    """For the data check: a warning per mismatched stock, an error when too many stocks are mismatched."""
    p, pj = data / "meta" / "crosscheck_bse.csv", data / "meta" / "crosscheck_bse.json"
    if not pj.exists():
        return []
    s = json.loads(pj.read_text(encoding="utf-8"))
    out = []
    if p.exists():
        for r in pd.read_csv(p).itertuples():
            out.append(issue(f"NSE {r.symbol}", "warn", "close differs from BSE",
                             f"NSE {r.nse_close:g}, BSE {r.bse_close:g} ({r.diff_pct:+.2f} %)", r.date))
    if s.get("share_pct") is not None and s["share_pct"] > max_share:
        out.append(issue("all stocks", "error", "many closes differ from BSE",
                         f"{s['mismatched']} of {s['compared']} liquid stocks ({s['share_pct']} %) close > {s.get('max_diff_pct', 3)} % "
                         f"apart from BSE on {s['date']}: wrong price file?", s["date"]))
    return out
