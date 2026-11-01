"""Sector / industry from NSE's official 4-level classification (macro -> sector -> industry -> basic industry), plus the NSE
indices a stock belongs to. Source: NSE GetQuoteApi (checked 2026-10-31). equitytimer.com is NOT used (its Terms forbid
scraping). Fallback when NSE does not answer: the "Industry" column of the Nifty 500 list (one broad level).

    data/meta/classification.csv   symbol, macro, sector, industry, basic_industry, indices, source, fetched
"""
from __future__ import annotations

import time
from datetime import date
from pathlib import Path

import pandas as pd

from .sources import nse

COLS = ["symbol", "macro", "sector", "industry", "basic_industry", "indices", "source", "fetched"]


def _find(obj, key):
    """First value of `key` anywhere in nested JSON."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        obj = list(obj.values())
    if isinstance(obj, list):
        for v in obj:
            got = _find(v, key)
            if got is not None:
                return got
    return None


def parse_quote(data: dict) -> dict | None:
    macro, sector = _find(data, "macro"), _find(data, "sector")
    industry, basic = _find(data, "industryInfo"), _find(data, "basicIndustry")
    if not any([macro, sector, industry, basic]):
        return None
    idx = _find(data, "indexList") or []
    clean = lambda v: " ".join(str(v).split()) if v not in (None, "", "-", "NA") else ""
    return {"macro": clean(macro), "sector": clean(sector), "industry": clean(industry), "basic_industry": clean(basic),
            "indices": ";".join(" ".join(str(i).split()) for i in idx)}


def fetch_one(http, symbol: str, series: str = "EQ") -> dict | None:
    http.warm_up(nse.HOME)
    r = http.get(nse.HOME + "api/NextApi/apiClient/GetQuoteApi", headers=nse.API_HEADERS,
                 params={"functionName": "getSymbolData", "marketType": "N", "series": series, "symbol": symbol})
    if r.status_code != 200:
        return None
    try:
        return parse_quote(r.json())
    except ValueError:
        return None


def update(path: Path, universe: pd.DataFrame, http, today: date, refresh_days: int = 30, deadline: float = float("inf"),
           log=print, clock=time.monotonic) -> dict:
    """Ask NSE for stocks with no entry or an entry older than refresh_days; keep the last good entry when NSE fails.
    Stocks NSE never answered for get the Nifty 500 list's broad industry (source 'Nifty 500 list')."""
    old = pd.read_csv(path, dtype=str).fillna("") if path.exists() else pd.DataFrame(columns=COLS)
    have = {r["symbol"]: r for r in old.to_dict("records")}
    asked = got = 0
    for r in universe.itertuples():
        cur = have.get(r.symbol)
        fresh = cur and cur.get("source") == "NSE" and cur.get("fetched") and \
            (today - date.fromisoformat(cur["fetched"])).days < refresh_days
        if fresh:
            continue
        if clock() > deadline:
            break
        asked += 1
        try:
            info = fetch_one(http, r.symbol, getattr(r, "series", "EQ") or "EQ")
        except Exception:  # noqa: BLE001 - keep the last good entry
            info = None
        if info:
            got += 1
            have[r.symbol] = {"symbol": r.symbol, **info, "source": "NSE", "fetched": today.isoformat()}
        elif not cur:
            have[r.symbol] = {"symbol": r.symbol, "macro": "", "sector": getattr(r, "industry", ""), "industry": "",
                              "basic_industry": "", "indices": "", "source": "Nifty 500 list", "fetched": today.isoformat()}
    out = pd.DataFrame(list(have.values()), columns=COLS)
    out = out[out["symbol"].isin(universe["symbol"])].sort_values("symbol")
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, index=False, lineterminator="\n")
    res = {"asked": asked, "answered": got, "from_nse": int((out["source"] == "NSE").sum()), "fallback": int((out["source"] != "NSE").sum())}
    log(f"classification: {res}")
    return res
