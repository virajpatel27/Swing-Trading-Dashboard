"""FII / DII cash-market flows (Phase N5, home page).

NSE's www.nseindia.com/api/fiidiiTradeReact answers only the latest session (provisional figures, Rs crore), so the
daily job adds one line per session to data/market/fii_dii.csv and the history grows from 06-Nov-2026 on. The website
gets the last 60 sessions as data/fii_dii.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from swingdash.sources import nse

COLS = ["date", "fii_buy", "fii_sell", "fii_net", "dii_buy", "dii_sell", "dii_net"]
REFERER = "https://www.nseindia.com/reports/fii-dii"


def path(data: Path) -> Path:
    return data / "market" / "fii_dii.csv"


def parse(rows) -> dict | None:
    """One session's numbers from the API answer; None when FII or DII is missing or the dates differ."""
    if not isinstance(rows, list):
        return None
    out: dict = {}
    dates = set()
    for r in rows:
        cat = str(r.get("category", "")).upper()
        key = "fii" if cat.startswith("FII") else "dii" if cat.startswith("DII") else None
        if not key:
            continue
        try:
            out[f"{key}_buy"] = round(float(r["buyValue"]), 2)
            out[f"{key}_sell"] = round(float(r["sellValue"]), 2)
            out[f"{key}_net"] = round(float(r["netValue"]), 2)
        except (KeyError, TypeError, ValueError):
            return None
        d = pd.to_datetime(str(r.get("date", "")), format="%d-%b-%Y", errors="coerce")
        if pd.isna(d):
            return None
        dates.add(d.strftime("%Y-%m-%d"))
    if len(dates) != 1 or not all(f"{k}_net" in out for k in ("fii", "dii")):
        return None
    out["date"] = dates.pop()
    return out


def merge(old: pd.DataFrame | None, rec: dict) -> pd.DataFrame:
    """Add or replace the session `rec` (the provisional figures can be revised the same evening)."""
    new = pd.DataFrame([rec], columns=COLS)
    if old is None or old.empty:
        return new
    df = pd.concat([old[old["date"] != rec["date"]], new], ignore_index=True)
    return df.sort_values("date").reset_index(drop=True)[COLS]


def update(data: Path, http, log=print) -> dict:
    rec = parse(nse.api_json(http, "api/fiidiiTradeReact", referer=REFERER))
    if rec is None:
        return {"stopped": "FII / DII answer not understood"}
    p = path(data)
    old = pd.read_csv(p, dtype={"date": str}) if p.exists() else None
    df = merge(old, rec)
    changed = old is None or not df.equals(old[COLS].reset_index(drop=True))
    if changed:
        p.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(p, index=False, lineterminator="\n")
    log(f"FII / DII {rec['date']}: FII {rec['fii_net']:+,.0f} Cr, DII {rec['dii_net']:+,.0f} Cr ({len(df)} sessions kept)")
    return {"date": rec["date"], "sessions": len(df), "changed": bool(changed)}


def site_payload(data: Path, n: int = 60) -> dict | None:
    p = path(data)
    if not p.exists():
        return None
    df = pd.read_csv(p, dtype={"date": str}).tail(n)
    return {"source": "NSE provisional FII / FPI and DII cash-market trades, Rs crore", "since": str(pd.read_csv(p, dtype={"date": str})["date"].iloc[0]),
            "rows": json.loads(df.to_json(orient="records"))}
