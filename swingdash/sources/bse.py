"""BSE: index list and index history. api.bseindia.com refuses GitHub's servers (HTTP 403, 2026-10-31): run from a PC."""
from __future__ import annotations

import io
from datetime import date

import pandas as pd

from .nse import SourceError

API = "https://api.bseindia.com/BseIndiaAPI/api"
HEADERS = {"Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com", "Accept": "*/*"}


def index_list(http) -> pd.DataFrame:
    r = http.get(f"{API}/FillddlIndex/w", headers=HEADERS)
    if r.status_code != 200:
        raise SourceError(f"BSE index list: HTTP {r.status_code}")
    rows = r.json().get("Table") or []
    if not rows:
        raise SourceError("BSE index list: empty")
    return pd.DataFrame({"code": [x["Indx_cd"].strip() for x in rows], "name": [x["shortalias"].strip() for x in rows]})


def index_history(http, code: str, start: date, end: date) -> pd.DataFrame:
    """The whole range in ONE call (2007 -> today works). Rows with only a close get open = high = low = close."""
    r = http.get(f"{API}/ProduceCSVForDate/w?strIndex={code}&dtFromDate={start:%d/%m/%Y}&dtToDate={end:%d/%m/%Y}", headers=HEADERS)
    if r.status_code != 200:
        raise SourceError(f"BSE index history {code}: HTTP {r.status_code}")
    return parse_index_csv(r.text)


def parse_index_csv(text: str) -> pd.DataFrame:
    text = text.strip()
    if not text.startswith("Date"):
        return pd.DataFrame(columns=["date", "open", "high", "low", "close"])
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip().lower() for c in df.columns]
    df["date"] = pd.to_datetime(df["date"], format="%d-%B-%Y")
    for c in ("open", "high", "low", "close"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["close"])
    for c in ("open", "high", "low"):
        df[c] = df[c].fillna(df["close"])
    return df[["date", "open", "high", "low", "close"]].sort_values("date").drop_duplicates("date").reset_index(drop=True)
