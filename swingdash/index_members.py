"""Members of the main NSE indices (Phase N7, heatmap page).

NSE publishes one CSV per index (Company Name, Industry, Symbol, Series, ISIN Code). The daily job reads them and keeps
data/meta/index_members.csv (index, symbol); it is rewritten only when a list changed. A list that fails or looks too
short keeps its saved members. The website gets data/index_members.json.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pandas as pd

BASE = "https://nsearchives.nseindia.com/content/indices/"
# id (as data/indices uses it), name, file, expected member count
INDEXES = [
    ("NIFTY_50", "Nifty 50", "ind_nifty50list.csv", 50),
    ("NIFTY_NEXT_50", "Nifty Next 50", "ind_niftynext50list.csv", 50),
    ("NIFTY_200", "Nifty 200", "ind_nifty200list.csv", 200),
    ("NIFTY_500", "Nifty 500", "ind_nifty500list.csv", 500),
    ("NIFTY_MIDCAP_150", "Nifty Midcap 150", "ind_niftymidcap150list.csv", 150),
    ("NIFTY_SMALLCAP_250", "Nifty Smallcap 250", "ind_niftysmallcap250list.csv", 250),
    ("NIFTY_MICROCAP_250", "Nifty Microcap 250", "ind_niftymicrocap250_list.csv", 250),
    ("NIFTY_MIDSMALLCAP_400", "Nifty MidSmallcap 400", "ind_niftymidsmallcap400list.csv", 400),
    ("NIFTY_BANK", "Nifty Bank", "ind_niftybanklist.csv", 12),
]


def path(data: Path) -> Path:
    return data / "meta" / "index_members.csv"


def parse(content: bytes) -> list[str]:
    df = pd.read_csv(io.BytesIO(content))
    df.columns = [c.strip() for c in df.columns]
    return sorted({str(s).strip() for s in df["Symbol"].dropna() if str(s).strip()})


def update(data: Path, http, log=print) -> dict:
    p = path(data)
    old = pd.read_csv(p) if p.exists() else pd.DataFrame(columns=["index", "symbol"])
    parts, notes = [], []
    for iid, name, file, expected in INDEXES:
        keep = old[old["index"] == iid]
        try:
            r = http.get(BASE + file)
            if r.status_code != 200:
                raise ValueError(f"HTTP {r.status_code}")
            syms = parse(r.content)
            if len(syms) < 0.8 * expected:
                raise ValueError(f"only {len(syms)} members")
            parts.append(pd.DataFrame({"index": iid, "symbol": syms}))
        except Exception as exc:  # noqa: BLE001 - keep the saved list
            notes.append(f"{name}: {str(exc)[:60]}")
            parts.append(keep[["index", "symbol"]])
    df = pd.concat(parts, ignore_index=True).sort_values(["index", "symbol"]).reset_index(drop=True)
    changed = old.empty or not df.equals(old.sort_values(["index", "symbol"]).reset_index(drop=True))
    if changed and len(df):
        p.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(p, index=False, lineterminator="\n")
    log(f"index members: {df['index'].nunique()} indices, {len(df)} rows{' (changed)' if changed else ''}" + (f"; kept old: {'; '.join(notes)}" if notes else ""))
    return {"indices": int(df["index"].nunique()), "rows": len(df), "changed": bool(changed), "kept_old": notes}


def site_payload(data: Path) -> dict | None:
    p = path(data)
    if not p.exists():
        return None
    df = pd.read_csv(p)
    names = {i: n for i, n, _, _ in INDEXES}
    return {i: {"name": names.get(i, i), "symbols": g["symbol"].tolist()} for i, g in df.groupby("index", sort=False)
            if i in names}
