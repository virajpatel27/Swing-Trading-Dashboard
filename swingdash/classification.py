"""Sector / industry from NSE's official 4-level classification (macro -> sector -> industry -> basic industry), plus the NSE
indices a stock belongs to. Source: NSE GetQuoteApi (checked 2026-10-31). equitytimer.com is NOT used (its Terms forbid
scraping). Fallback when NSE does not answer: the "Industry" column of the Nifty 500 list (one broad level).
The same answer carries the share count (issuedSize), face value and NSE's free-float market cap (ffmc -> float_pct_nse).
A second call (shareholding pattern) gives the promoter holding: free float = 100 - promoter % (the usual definition).

    data/meta/classification.csv   symbol, macro, sector, industry, basic_industry, indices, shares, float_pct_nse,
                                   face_value, promoter_pct, shp_date, source, fetched
"""
from __future__ import annotations

import re
import time
from datetime import date
from pathlib import Path

import pandas as pd

from .sources import nse

COLS = ["symbol", "macro", "sector", "industry", "basic_industry", "indices", "shares", "float_pct_nse", "face_value",
        "promoter_pct", "shp_date", "source", "fetched"]


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
            "indices": ";".join(" ".join(str(i).split()) for i in idx), **parse_shares(data)}


def _num(v) -> float | None:
    try:
        x = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return x if x > 0 else None


def parse_shares(data: dict) -> dict:
    """Shares issued, NSE's free float % (= free-float market cap / total market cap; NSE's index definition, a fallback
    only) and face value. Empty strings when NSE leaves them out."""
    shares, ffmc, mcap = _num(_find(data, "issuedSize")), _num(_find(data, "ffmc")), _num(_find(data, "totalMarketCap"))
    face = _num(_find(data, "faceValue"))
    pct = round(100 * ffmc / mcap, 2) if ffmc and mcap else None
    return {"shares": str(int(shares)) if shares else "", "float_pct_nse": "" if pct is None else str(min(pct, 100.0)),
            "face_value": "" if face is None else f"{face:g}"}


def fetch_one(http, symbol: str, series: str = "EQ") -> dict | None:
    http.warm_up(nse.HOME)
    r = http.get(nse.HOME + "api/NextApi/apiClient/GetQuoteApi", headers=nse.API_HEADERS,
                 params={"functionName": "getSymbolData", "marketType": "N", "series": series, "symbol": symbol})
    if r.status_code != 200:
        return None
    try:
        info = parse_quote(r.json())
    except ValueError:
        return None
    if info:
        try:
            got = nse.latest_promoter_holding(http, symbol)
        except Exception:  # noqa: BLE001 - the share pattern is optional; asked again next refresh
            got = None
        info["promoter_pct"], info["shp_date"] = (f"{got[0]:g}", got[1]) if got else ("", "")
    return info


LEVELS = ["macro", "sector", "industry", "basic_industry"]
OVERRIDES = Path(__file__).resolve().parents[1] / "config" / "classification_overrides.csv"
# sector + industry (= NSE basic industry level) exactly as the reference app lists them (Viraj 2026-11-07); wins over both
REFERENCE = Path(__file__).resolve().parents[1] / "config" / "reference_classes.csv"


def old_style(sector: str) -> bool:
    """NSE still answers a few stocks with its pre-2021 classification, written in capitals ("AUTOMOBILE", "TEXTILES")."""
    return bool(sector) and sector.isupper()


def load(path: Path, overrides: Path | None = OVERRIDES, reference: Path | None = REFERENCE) -> pd.DataFrame:
    """classification.csv with config/classification_overrides.csv on top (BSE's identical 4-level classification, fetched
    from the PC, or a marked guess) for stocks where NSE gave nothing or only its old classification. Indexed by symbol;
    column class_source says where the four levels come from."""
    cls = pd.read_csv(path, dtype=str).fillna("") if path.exists() else pd.DataFrame(columns=COLS)
    cls = cls.set_index("symbol")
    cls["class_source"] = cls["source"] if "source" in cls.columns else ""
    if overrides is not None and overrides.exists():
        cls = _apply_overrides(cls, overrides)
    if reference is not None and reference.exists():
        ref = pd.read_csv(reference, dtype=str).fillna("").drop_duplicates("symbol").set_index("symbol")
        new = ref.index.difference(cls.index)
        if len(new):
            cls = pd.concat([cls, pd.DataFrame("", index=new, columns=cls.columns)])
        idx = ref.index
        cls.loc[idx, "sector"] = ref["sector"].where(ref["sector"] != "", cls.loc[idx, "sector"])
        cls.loc[idx, "basic_industry"] = ref["industry"]
        cls.loc[idx, "class_source"] = ("reference list " + ref.get("as_of", pd.Series("", index=idx))).str.strip()
        # one spelling per group (12-Nov-2026: NSE's "Media Entertainment & Publication" made a 24th sector next to the
        # reference's "Media, Entertainment & Publication"): names equal apart from punctuation take the reference spelling
        key = lambda s: re.sub(r"[^a-z0-9]", "", str(s).lower())
        for col, refcol in (("sector", "sector"), ("basic_industry", "industry")):
            canon = {key(x): x for x in ref[refcol].unique() if x}
            cls[col] = cls[col].map(lambda v: canon.get(key(v), v) if v else v)
    return cls


def _apply_overrides(cls: pd.DataFrame, overrides: Path) -> pd.DataFrame:
    ov = pd.read_csv(overrides, dtype=str).fillna("").set_index("symbol")
    for sym, r in ov.iterrows():
        cur = cls.loc[sym] if sym in cls.index else None
        if cur is not None and cur.get("source") == "NSE" and cur.get("industry") and not old_style(cur.get("sector", "")):
            continue                                       # NSE has a proper answer now: it wins
        if cur is None:
            cls.loc[sym] = ""
        cls.loc[sym, LEVELS] = [r[c] for c in LEVELS]
        cls.loc[sym, "class_source"] = r["source"]
    return cls


def update(path: Path, universe: pd.DataFrame, http, today: date, refresh_days: int = 30, deadline: float = float("inf"),
           log=print, clock=time.monotonic, force: set[str] | None = None) -> dict:
    """Ask NSE for stocks with no entry, an entry older than refresh_days, no share count yet, or in `force` (e.g. a split
    or bonus since the last answer changed the share count); keep the last good entry when NSE fails.
    Stocks NSE never answered for get the Nifty 500 list's broad industry (source 'Nifty 500 list')."""
    old = pd.read_csv(path, dtype=str).fillna("") if path.exists() else pd.DataFrame(columns=COLS)
    have = {r["symbol"]: {c: r.get(c, "") for c in COLS} for r in old.to_dict("records")}
    force = force or set()
    asked = got = 0
    for r in universe.itertuples():
        cur = have.get(r.symbol)
        fresh = cur and cur.get("source") == "NSE" and cur.get("fetched") and cur.get("shares") and \
            r.symbol not in force and (today - date.fromisoformat(cur["fetched"])).days < refresh_days
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
            info["shares"] = info.get("shares") or "0"      # NSE answered without a share count: do not ask again every run
            have[r.symbol] = {"symbol": r.symbol, **info, "source": "NSE", "fetched": today.isoformat()}
        elif not cur:
            have[r.symbol] = {"symbol": r.symbol, "macro": "", "sector": getattr(r, "industry", ""), "industry": "",
                              "basic_industry": "", "indices": "", "shares": "", "float_pct_nse": "", "face_value": "",
                              "promoter_pct": "", "shp_date": "", "source": "Nifty 500 list", "fetched": today.isoformat()}
    out = pd.DataFrame(list(have.values()), columns=COLS)
    out = out[out["symbol"].isin(universe["symbol"])].sort_values("symbol")
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, index=False, lineterminator="\n")
    res = {"asked": asked, "answered": got, "from_nse": int((out["source"] == "NSE").sum()), "fallback": int((out["source"] != "NSE").sum())}
    log(f"classification: {res}")
    return res
