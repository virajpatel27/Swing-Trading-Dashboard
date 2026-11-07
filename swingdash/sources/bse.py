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


# ---------------------------------------------------------------- stocks (PC only, like the indices)
STOCK_CSV_COLS = {"Date": "date", "Open Price": "open", "High Price": "high", "Low Price": "low", "Close Price": "close",
                  "No.of Shares": "volume", "Total Turnover (Rs.)": "value"}


def scrip_list(http) -> pd.DataFrame:
    """Every active BSE equity scrip: code, BSE symbol, ISIN, face value."""
    r = http.get(f"{API}/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active", headers=HEADERS)
    if r.status_code != 200:
        raise SourceError(f"BSE scrip list: HTTP {r.status_code}")
    rows = r.json() or []
    if not rows:
        raise SourceError("BSE scrip list: empty")
    df = pd.DataFrame(rows)
    return pd.DataFrame({"code": df["SCRIP_CD"].astype(str).str.strip(), "bse_symbol": df["scrip_id"].astype(str).str.strip(),
                         "isin": df["ISIN_NUMBER"].astype(str).str.strip(), "face_value": pd.to_numeric(df["FACE_VALUE"], errors="coerce")})


def stock_history(http, code: str, start: date, end: date) -> pd.DataFrame:
    """Daily prices of one BSE scrip, the whole range in ONE call (as traded, not adjusted)."""
    r = http.get(f"{API}/StockPriceCSVDownload/w?pageType=0&rbType=D&Scode={code}&FDates={start:%d/%m/%Y}&TDates={end:%d/%m/%Y}",
                 headers=HEADERS)
    if r.status_code != 200:
        raise SourceError(f"BSE stock history {code}: HTTP {r.status_code}")
    return parse_stock_csv(r.text)


def parse_stock_csv(text: str) -> pd.DataFrame:
    """BSE stock price CSV -> date, open, high, low, close, prev_close, volume, value, series ('BSE')."""
    cols = ["date", "open", "high", "low", "close", "prev_close", "volume", "value", "series"]
    text = text.strip()
    if not text.startswith("Date"):
        return pd.DataFrame(columns=cols)
    df = pd.read_csv(io.StringIO(text)).rename(columns=lambda c: STOCK_CSV_COLS.get(c.strip(), c.strip()))
    df["date"] = pd.to_datetime(df["date"], format="%d-%B-%Y", errors="coerce")
    for c in ("open", "high", "low", "close", "volume", "value"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["date", "close"])
    df = df[df["close"] > 0].sort_values("date").drop_duplicates("date").reset_index(drop=True)
    for c in ("open", "high", "low"):
        df[c] = df[c].where(df[c] > 0, df["close"])
    df["prev_close"] = df["close"].shift(1)
    df["series"] = "BSE"
    return df[cols]


def corp_actions(http, code: str, start: date, end: date) -> list[dict]:
    """BSE's corporate-action list of one scrip: [{ex_date, subject}] (subject = BSE's purpose text)."""
    r = http.get(f"{API}/DefaultData/w?Fdate={start:%Y%m%d}&Purposecode=&TDate={end:%Y%m%d}&ddlcategorys=E&ddlindustrys="
                 f"&scripcode={code}&segment=0&strSearch=S", headers=HEADERS)
    if r.status_code != 200:
        raise SourceError(f"BSE corporate actions {code}: HTTP {r.status_code}")
    rows = r.json()
    rows = rows if isinstance(rows, list) else (rows or {}).get("Table", [])
    out = []
    for x in rows:
        ex = pd.to_datetime(str(x.get("exdate", "")), format="%Y%m%d", errors="coerce")
        if pd.notna(ex):
            out.append({"ex_date": ex, "subject": " ".join(str(x.get("Purpose", "")).split())})
    return out
