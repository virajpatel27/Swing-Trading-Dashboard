"""NSE: daily equity bhavcopy (raw "as traded" prices), symbol changes, Nifty 500 list, index list and index history.
Addresses and formats checked 2026-10-31 (see docs/SOURCES.md)."""
from __future__ import annotations

import io
import zipfile
from datetime import date

import pandas as pd

from ..store import fill_ohl

HOME = "https://www.nseindia.com/"
ARCH = "https://nsearchives.nseindia.com"
API_HEADERS = {"Referer": HOME, "Accept": "application/json, text/plain, */*"}
UDIFF_FROM = date(2024, 7, 8)          # new bhavcopy format from this day; the old one until 05-Jul-2024


class SourceError(RuntimeError):
    """A source answered, but not with usable data. The message is safe to print."""


# ---------------------------------------------------------------- equity bhavcopy
def bhav_url(d: date) -> str:
    if d >= UDIFF_FROM:
        return f"{ARCH}/content/cm/BhavCopy_NSE_CM_0_0_0_{d:%Y%m%d}_F_0000.csv.zip"
    mon = d.strftime("%b").upper()
    return f"{ARCH}/content/historical/EQUITIES/{d:%Y}/{mon}/cm{d:%d}{mon}{d:%Y}bhav.csv.zip"


def parse_bhav(content: bytes) -> pd.DataFrame:
    """Either bhavcopy format -> columns date, symbol, series, open, high, low, close, prev_close, volume, value."""
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        raw = pd.read_csv(z.open(z.namelist()[0]))
    raw.columns = [str(c).strip() for c in raw.columns]
    if "TckrSymb" in raw.columns:
        df = pd.DataFrame({"date": raw["TradDt"], "symbol": raw["TckrSymb"], "series": raw["SctySrs"],
                           "open": raw["OpnPric"], "high": raw["HghPric"], "low": raw["LwPric"], "close": raw["ClsPric"],
                           "prev_close": raw["PrvsClsgPric"], "volume": raw["TtlTradgVol"], "value": raw["TtlTrfVal"]})
    else:
        df = pd.DataFrame({"date": raw["TIMESTAMP"], "symbol": raw["SYMBOL"], "series": raw["SERIES"],
                           "open": raw["OPEN"], "high": raw["HIGH"], "low": raw["LOW"], "close": raw["CLOSE"],
                           "prev_close": raw["PREVCLOSE"], "volume": raw["TOTTRDQTY"], "value": raw["TOTTRDVAL"]})
    df["date"] = pd.to_datetime(df["date"], format="mixed", dayfirst=False).dt.normalize()
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df["series"] = df["series"].astype(str).str.strip()
    return df


def fetch_bhav(http, d: date) -> pd.DataFrame | None:
    """The day's bhavcopy, or None when there is none (holiday / weekend). On a holiday NSE sometimes serves the previous
    day's file under the holiday's name: the date inside the file decides."""
    r = http.get(bhav_url(d))
    if r.status_code == 404 or (r.status_code == 200 and not r.content.startswith(b"PK")):
        return None
    if r.status_code != 200:
        raise SourceError(f"NSE bhavcopy {d}: HTTP {r.status_code}")
    df = parse_bhav(r.content)
    if df.empty or (df["date"].dt.date != d).all():
        return None
    return df[df["date"].dt.date == d]


def pick_rows(day: pd.DataFrame, wanted: dict[str, str], series_priority: list[str]) -> pd.DataFrame:
    """Rows of one day's bhavcopy for the wanted symbols. wanted = {symbol on that day: current symbol}.
    One row per stock: the first series found in series_priority."""
    rows = day[day["symbol"].isin(wanted.keys()) & day["series"].isin(series_priority)].copy()
    rows["rank"] = rows["series"].map({s: i for i, s in enumerate(series_priority)})
    rows = rows.sort_values("rank").drop_duplicates("symbol", keep="first").drop(columns="rank")
    rows["symbol"] = rows["symbol"].map(wanted)
    return rows


# ---------------------------------------------------------------- symbols
def symbol_changes(http) -> pd.DataFrame:
    r = http.get(f"{ARCH}/content/equities/symbolchange.csv")
    if r.status_code != 200:
        raise SourceError(f"NSE symbol changes: HTTP {r.status_code}")
    return parse_symbol_changes(r.content)


def parse_symbol_changes(content: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(content), encoding="latin-1")
    df.columns = [str(c).strip().upper() for c in df.columns]
    out = pd.DataFrame({"old": df["OLD SYMBOL"].astype(str).str.strip(), "new": df["NEW SYMBOL"].astype(str).str.strip(),
                        "date": pd.to_datetime(df["EFFECTIVE DATE"].astype(str).str.strip(), format="%d-%b-%Y", errors="coerce")})
    return out.dropna(subset=["date"])


def symbol_history(changes: pd.DataFrame, current: list[str]) -> dict[str, list[tuple[str, pd.Timestamp]]]:
    """{current symbol: [(older symbol, used before this date), ...]}, following chains A -> B -> C backwards."""
    by_new = {}
    for r in changes.sort_values("date").itertuples():
        by_new.setdefault(r.new, []).append((r.old, r.date))
    out: dict[str, list[tuple[str, pd.Timestamp]]] = {}
    for sym in current:
        chain, seen, cur, until = [], {sym}, sym, None
        while cur in by_new:
            # the latest change into `cur` that happened before `until`
            options = [(o, d) for o, d in by_new[cur] if until is None or d <= until]
            if not options:
                break
            old, d = options[-1]
            if old in seen:
                break
            chain.append((old, d))
            seen.add(old)
            cur, until = old, d
        out[sym] = chain
    return out


def names_on(day: pd.Timestamp, current: list[str], history: dict[str, list[tuple[str, pd.Timestamp]]]) -> dict[str, str]:
    """{symbol as traded on `day`: current symbol}."""
    out = {}
    for sym in current:
        name = sym
        for old, until in history.get(sym, []):
            if day < until:
                name = old
            else:
                break
        out[name] = sym
    return out


def nifty500(http, url: str) -> pd.DataFrame:
    r = http.get(url)
    if r.status_code != 200:
        raise SourceError(f"Nifty 500 list: HTTP {r.status_code}")
    df = pd.read_csv(io.BytesIO(r.content))
    df.columns = [c.strip() for c in df.columns]
    return pd.DataFrame({"symbol": df["Symbol"].str.strip(), "name": df["Company Name"].str.strip(),
                         "industry": df["Industry"].str.strip(), "isin": df["ISIN Code"].str.strip(), "series": df["Series"].str.strip()})


def equity_list(http, url: str) -> pd.DataFrame:
    """All equity shares listed on NSE's main board (EQUITY_L.csv: ~2,600 in EQ / BE / BZ series)."""
    r = http.get(url)
    if r.status_code != 200:
        raise SourceError(f"NSE equity list: HTTP {r.status_code}")
    return parse_equity_list(r.content)


def parse_equity_list(content: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(content))
    df.columns = [c.strip() for c in df.columns]
    return pd.DataFrame({"symbol": df["SYMBOL"].astype(str).str.strip(), "name": df["NAME OF COMPANY"].astype(str).str.strip(),
                         "isin": df["ISIN NUMBER"].astype(str).str.strip(), "series": df["SERIES"].astype(str).str.strip(),
                         "listed": pd.to_datetime(df["DATE OF LISTING"].astype(str).str.strip(), format="%d-%b-%Y", errors="coerce")
                         .dt.strftime("%Y-%m-%d")})


# ---------------------------------------------------------------- indices
def api_json(http, path: str, referer: str | None = None):
    http.warm_up(HOME)
    headers = {**API_HEADERS, "Referer": referer or HOME}
    r = http.get(HOME + path, headers=headers)
    if r.status_code != 200:
        raise SourceError(f"NSE {path.split('?')[0]}: HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError:
        raise SourceError(f"NSE {path.split('?')[0]}: reply was not JSON") from None


def index_closes_today(http) -> pd.DataFrame | None:
    """Every NSE index's open/high/low/close of the latest session from the allIndices API (one call, available right after
    15:30 IST - hours before the official ind_close_all file). None while the market is still open."""
    return parse_index_closes(api_json(http, "api/allIndices"))


def parse_index_closes(data: dict) -> pd.DataFrame | None:
    ts = pd.to_datetime(str(data.get("timestamp", "")), format="%d-%b-%Y %H:%M", errors="coerce")
    if pd.isna(ts) or (ts.hour, ts.minute) < (15, 30):          # session not finished: values are not closes yet
        return None
    rows = [r for r in data.get("data") or [] if r.get("last") not in (None, "", 0)]
    out = pd.DataFrame({"name": [str(r["index"]).strip() for r in rows], "date": ts.normalize(),
                        "open": [r.get("open") for r in rows], "high": [r.get("high") for r in rows],
                        "low": [r.get("low") for r in rows], "close": [r.get("last") for r in rows]})
    for c in ("open", "high", "low", "close"):
        out[c] = pd.to_numeric(out[c], errors="coerce")
        out[c] = out[c].where(out[c] > 0)                       # 0 = "no value" in this API
    return fill_ohl(out.dropna(subset=["close"]))


def all_indices(http) -> pd.DataFrame:
    data = api_json(http, "api/allIndices").get("data") or []
    if not data:
        raise SourceError("NSE allIndices: empty list")
    return pd.DataFrame({"name": [d["index"].strip() for d in data], "category": [d.get("key", "") for d in data]})


def index_history(http, name: str, start: date, end: date) -> pd.DataFrame:
    """At most ~70 rows per call: keep start..end <= 90 days."""
    from urllib.parse import quote
    path = f"api/historicalOR/indicesHistory?indexType={quote(name)}&from={start:%d-%m-%Y}&to={end:%d-%m-%Y}"
    data = api_json(http, path, referer=HOME + "reports-indices-historical-index-data")
    if isinstance(data, dict) and data.get("error"):
        raise SourceError(f"NSE index history {name}: {data.get('showMessage', 'error')}")
    return parse_index_history(data.get("data") or [])


def parse_index_history(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close"])
    df = pd.DataFrame(rows)
    out = pd.DataFrame({"date": pd.to_datetime(df["EOD_TIMESTAMP"], format="%d-%b-%Y"),
                        "open": df.get("EOD_OPEN_INDEX_VAL"), "high": df.get("EOD_HIGH_INDEX_VAL"),
                        "low": df.get("EOD_LOW_INDEX_VAL"), "close": df["EOD_CLOSE_INDEX_VAL"]})
    return fill_ohl(out.sort_values("date").drop_duplicates("date").reset_index(drop=True))


def index_close_file(http, d: date) -> pd.DataFrame | None:
    """All NSE indices of one day (daily updates). None when the file does not exist."""
    r = http.get(f"{ARCH}/content/indices/ind_close_all_{d:%d%m%Y}.csv")
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        raise SourceError(f"NSE index file {d}: HTTP {r.status_code}")
    df = pd.read_csv(io.BytesIO(r.content))
    df.columns = [c.strip() for c in df.columns]
    out = pd.DataFrame({"name": df["Index Name"].str.strip(),
                        "date": pd.to_datetime(df["Index Date"], dayfirst=True, format="mixed"),
                        "open": pd.to_numeric(df["Open Index Value"], errors="coerce"),
                        "high": pd.to_numeric(df["High Index Value"], errors="coerce"),
                        "low": pd.to_numeric(df["Low Index Value"], errors="coerce"),
                        "close": pd.to_numeric(df["Closing Index Value"], errors="coerce")})
    return fill_ohl(out.dropna(subset=["close"]))
