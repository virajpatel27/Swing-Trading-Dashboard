"""NSE: daily equity bhavcopy (raw "as traded" prices), symbol changes, Nifty 500 list, index list and index history.
Addresses and formats checked 2026-10-31 (see docs/SOURCES.md)."""
from __future__ import annotations

import io
import zipfile
from datetime import date
from pathlib import Path

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
    """Either bhavcopy format -> columns date, symbol, series, open, high, low, close, prev_close, volume, value, isin
    (isin empty in old files before ~2011, which have no ISIN column)."""
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        raw = pd.read_csv(z.open(z.namelist()[0]))
    raw.columns = [str(c).strip() for c in raw.columns]
    if "TckrSymb" in raw.columns:
        df = pd.DataFrame({"date": raw["TradDt"], "symbol": raw["TckrSymb"], "series": raw["SctySrs"],
                           "open": raw["OpnPric"], "high": raw["HghPric"], "low": raw["LwPric"], "close": raw["ClsPric"],
                           "prev_close": raw["PrvsClsgPric"], "volume": raw["TtlTradgVol"], "value": raw["TtlTrfVal"],
                           "isin": raw.get("ISIN", "")})
    else:
        df = pd.DataFrame({"date": raw["TIMESTAMP"], "symbol": raw["SYMBOL"], "series": raw["SERIES"],
                           "open": raw["OPEN"], "high": raw["HIGH"], "low": raw["LOW"], "close": raw["CLOSE"],
                           "prev_close": raw["PREVCLOSE"], "volume": raw["TOTTRDQTY"], "value": raw["TOTTRDVAL"],
                           "isin": raw.get("ISIN", "")})
    df["date"] = pd.to_datetime(df["date"], format="mixed", dayfirst=False).dt.normalize()
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df["series"] = df["series"].astype(str).str.strip()
    df["isin"] = df["isin"].fillna("").astype(str).str.strip()
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
EXTRA_CHANGES = Path(__file__).resolve().parents[2] / "config" / "symbol_changes_extra.csv"


def symbol_changes(http, extra: Path | None = EXTRA_CHANGES) -> pd.DataFrame:
    """NSE's symbolchange.csv plus our own additions (config/symbol_changes_extra.csv): NSE's file misses some renames,
    e.g. PHILIPCARB -> PCBL in 2022 (found by the same ISIN in the bhavcopy, scripts/find_renames.py)."""
    r = http.get(f"{ARCH}/content/equities/symbolchange.csv")
    if r.status_code != 200:
        raise SourceError(f"NSE symbol changes: HTTP {r.status_code}")
    out = parse_symbol_changes(r.content)
    if extra is not None and extra.exists():
        add = pd.read_csv(extra, dtype=str)
        add = pd.DataFrame({"old": add["old"].str.strip(), "new": add["new"].str.strip(), "date": pd.to_datetime(add["date"])})
        out = pd.concat([out, add], ignore_index=True).drop_duplicates(["old", "new"], keep="first")
    return out


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


# ---------------------------------------------------------------- stock master lists (checked 2026-11-03)
def _get_csv(http, url: str, what: str) -> bytes:
    r = http.get(url)
    if r.status_code != 200:
        raise SourceError(f"{what}: HTTP {r.status_code}")
    return r.content


def fno_symbols(http) -> set[str]:
    """Stocks with futures & options (fo_mktlots.csv; index rows such as NIFTY never match a stock symbol)."""
    return parse_fno(_get_csv(http, f"{ARCH}/content/fo/fo_mktlots.csv", "F&O list"))


def parse_fno(content: bytes) -> set[str]:
    df = pd.read_csv(io.BytesIO(content), dtype=str)
    df.columns = [c.strip() for c in df.columns]
    syms = df["SYMBOL"].astype(str).str.strip()
    return {s for s in syms if s and s.upper() != "SYMBOL"}


def price_bands(http) -> pd.DataFrame:
    """Today's price band (circuit limit, %) per symbol + series (sec_list.csv: 2 / 5 / 10 / 20 or 'No Band')."""
    return parse_price_bands(_get_csv(http, f"{ARCH}/content/equities/sec_list.csv", "price bands"))


def parse_price_bands(content: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(content), dtype=str)
    df.columns = [c.strip() for c in df.columns]
    return pd.DataFrame({"symbol": df["Symbol"].str.strip(), "series": df["Series"].str.strip(),
                         "band": df["Band"].astype(str).str.strip()})


def delisted(http) -> pd.DataFrame:
    """Companies NSE has delisted (symbol, name, date, type)."""
    return parse_delisted(_get_csv(http, f"{ARCH}/content/equities/delisted.csv", "delisted list"))


def parse_delisted(content: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="latin-1").iloc[:, :4]
    df.columns = ["symbol", "name", "date", "type"]
    df = df.dropna(subset=["symbol"])
    return pd.DataFrame({"symbol": df["symbol"].str.strip(), "name": df["name"].str.strip(),
                         "date": pd.to_datetime(df["date"].str.strip(), format="%d-%b-%y", errors="coerce").dt.strftime("%Y-%m-%d"),
                         "type": df["type"].fillna("").str.strip()})


def latest_promoter_holding(http, symbol: str) -> tuple[float, str] | None:
    """(promoter & promoter group %, quarter end 'YYYY-MM-DD') of the newest shareholding pattern; None when NSE has none."""
    rows = api_json(http, f"api/corporate-share-holdings-master?index=equities&symbol={symbol}")
    return parse_promoter_holding(rows if isinstance(rows, list) else [])


def parse_promoter_holding(rows: list[dict]) -> tuple[float, str] | None:
    best = None
    for r in rows:
        try:
            pct, day = float(r.get("pr_and_prgrp")), pd.to_datetime(r.get("date"), format="%d-%b-%Y")
        except (TypeError, ValueError):
            continue
        if 0 <= pct <= 100 and (best is None or day > best[1]):
            best = (pct, day)
    return None if best is None else (best[0], best[1].strftime("%Y-%m-%d"))


# ---------------------------------------------------------------- delivery (checked 2026-11-04)
def mto_url(d: date) -> str:
    """Security-wise delivery position, one file per trading day from 2007 to today (out ~16:50 IST)."""
    return f"{ARCH}/archives/equities/mto/MTO_{d:%d%m%Y}.DAT"


def fetch_mto(http, d: date) -> pd.DataFrame | None:
    """The day's delivery file, or None when NSE has none (holiday, or not published yet)."""
    r = http.get(mto_url(d))
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        raise SourceError(f"NSE delivery file {d}: HTTP {r.status_code}")
    df = parse_mto(r.content)
    return df if len(df) else None


def parse_mto(content: bytes) -> pd.DataFrame:
    """Rows of record type 20: symbol, series, traded qty, deliverable qty, delivery %. The trade date from the header."""
    day, rows = None, []
    for line in content.decode("latin-1").splitlines():
        p = [x.strip() for x in line.split(",")]
        if p[0] == "10" and len(p) >= 3 and day is None:
            day = pd.to_datetime(p[2], format="%d%m%Y", errors="coerce")
        elif p[0] == "20" and len(p) >= 7:
            rows.append(p[2:7])
    df = pd.DataFrame(rows, columns=["symbol", "series", "traded_qty", "deliv_qty", "deliv_pct"])
    for c in ("traded_qty", "deliv_qty", "deliv_pct"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df.insert(0, "date", day)
    return df.dropna(subset=["deliv_pct"])


# ---------------------------------------------------------------- IPOs (checked 2026-11-05)
# NSE wrote EQ / BE ... until early Nov-2026, now "Equity" (SME, DEBT, InvIT are left out)
MAIN_BOARD = {"EQ", "BE", "BZ", "RR", "IV", "EQUITY"}


def past_issues(http, raw: list | None = None) -> pd.DataFrame:
    """NSE's list of public issues (IPOs) with listing date and issue price; main board only (no SME, no debt)."""
    rows = raw if raw is not None else api_json(http, "api/public-past-issues")
    return parse_past_issues(rows if isinstance(rows, list) else [])


def parse_past_issues(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=["symbol", "ipo_date", "ipo_price"])
    df = df[df["securityType"].astype(str).str.strip().str.upper().isin(MAIN_BOARD)]
    out = pd.DataFrame({"symbol": df["symbol"].astype(str).str.strip(),
                        "ipo_date": pd.to_datetime(df["listingDate"].astype(str).str.strip(), format="%d-%b-%Y", errors="coerce"),
                        "ipo_price": pd.to_numeric(df["issuePrice"].astype(str).str.replace(",", "").str.strip(), errors="coerce")})
    out = out.dropna(subset=["ipo_date"]).sort_values("ipo_date").drop_duplicates("symbol", keep="last")
    out["ipo_date"] = out["ipo_date"].dt.strftime("%Y-%m-%d")
    return out.reset_index(drop=True)


def parse_issue_pipeline(rows: list[dict], today: str) -> pd.DataFrame:
    """Main-board issues not listed yet (or listing from `today` on): name, symbol, bidding days, price (range), listing day."""
    cols = ["symbol", "name", "open", "close", "price", "listing"]
    df = pd.DataFrame(rows)
    if df.empty or "securityType" not in df:
        return pd.DataFrame(columns=cols)
    df = df[df["securityType"].astype(str).str.strip().str.upper().isin(MAIN_BOARD)]
    d = lambda c: pd.to_datetime(df[c].astype(str).str.strip(), format="%d-%b-%Y", errors="coerce").dt.strftime("%Y-%m-%d")
    name = df["companyName"] if "companyName" in df else df["symbol"]
    if "company" in df:
        name = name.where(name.notna() & (name.astype(str).str.strip() != ""), df["company"])
    out = pd.DataFrame({"symbol": df["symbol"].astype(str).str.strip(), "name": name.fillna("").astype(str).str.strip(),
                        "open": d("ipoStartDate"), "close": d("ipoEndDate"),
                        "price": df["issuePrice"].astype(str).where(df["issuePrice"].astype(str).str.strip() != "-", df.get("priceRange", "")).astype(str).str.strip(),
                        "listing": d("listingDate")})
    # not listed yet (or listing from today on), bidding opened within the last 45 days or later (old withdrawn issues out)
    recent = (pd.Timestamp(today) - pd.Timedelta(days=45)).strftime("%Y-%m-%d")
    out = out[(out["listing"].isna() | (out["listing"] >= today)) & (out["open"] >= recent)]
    return out.drop_duplicates("symbol").sort_values(["open", "symbol"]).reset_index(drop=True)[cols]
