"""Stock master: one row per stock of the universe - the table every later feature joins to (Phase 1 of the scanner plan).

    data/meta/stocks.csv
      symbol, id, name, isin, series, listed, first_date, last_date, sessions, status, n500, fno, price_band,
      face_value, shares, promoter_pct, float_pct, raw_close, mcap_cr, float_mcap_cr, turnover_med30_cr, turnover_avg30_cr,
      liquid, sector, industry, basic_industry, shares_fetched, ipo_date, ipo_price

Sources: universe_stocks.csv (NSE EQUITY_L + Nifty 500 REITs), classification.csv (NSE GetQuoteApi: sector levels, share
count, promoter holding), NSE fo_mktlots.csv (F&O), NSE sec_list.csv (price band), our raw bhavcopy history (dates, close,
turnover). Market cap = shares x last RAW close (both "as traded" today). Free float % = 100 - promoter & promoter group
holding of the newest shareholding pattern (NSE's own free-float figure only when that is missing). When a list cannot be
downloaded the values of the last good stocks.csv are kept.

status: active = traded within STALE_DAYS of the newest trading day; inactive = no trade since (suspended / not traded);
no_history = nothing stored yet.
liquid (Viraj's rule from the master prompt, numbers in config/settings.yaml -> liquid): median daily turnover of the last
30 sessions >= Rs 1 Cr AND last close >= Rs 5 AND active.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import classification, store
from .sources import nse

COLS = ["symbol", "id", "name", "isin", "series", "listed", "first_date", "last_date", "sessions", "status", "n500", "fno",
        "price_band", "face_value", "shares", "promoter_pct", "float_pct", "raw_close", "mcap_cr", "float_mcap_cr",
        "turnover_med30_cr", "turnover_avg30_cr", "liquid", "sector", "industry", "basic_industry", "shares_fetched",
        "ipo_date", "ipo_price"]
STALE_DAYS = 10
CR = 1e7
DEFAULT_LIQUID = {"sessions": 30, "min_turnover_cr": 1.0, "min_price": 5.0}


def _num(v) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None


def price_stats(raw: pd.DataFrame, sessions: int) -> dict:
    """First / last date, number of sessions, last raw close, and the median and average turnover (Rs Cr) of the last
    `sessions` days (median -> liquid flag; average = the usual "avg turnover 30d" column)."""
    if raw.empty:
        return {"first_date": "", "last_date": "", "sessions": 0, "close": None, "turnover_med30_cr": None,
                "turnover_avg30_cr": None}
    value = pd.to_numeric(raw.tail(sessions)["value"], errors="coerce")
    med, avg = value.median(), value.mean()
    return {"first_date": raw["date"].iat[0].strftime("%Y-%m-%d"), "last_date": raw["date"].iat[-1].strftime("%Y-%m-%d"),
            "sessions": int(len(raw)), "close": float(raw["close"].iat[-1]),
            "turnover_med30_cr": None if pd.isna(med) else round(med / CR, 2),
            "turnover_avg30_cr": None if pd.isna(avg) else round(avg / CR, 2)}


def status_of(last_date: str, newest: pd.Timestamp | None) -> str:
    if not last_date:
        return "no_history"
    if newest is None or (newest - pd.Timestamp(last_date)).days <= STALE_DAYS:
        return "active"
    return "inactive"


def is_liquid(status: str, close: float | None, turnover_cr: float | None, rule: dict) -> bool:
    return status == "active" and close is not None and turnover_cr is not None \
        and close >= rule["min_price"] and turnover_cr >= rule["min_turnover_cr"]


def build(data: Path, fno: set[str] | None, bands: pd.DataFrame | None, liquid_rule: dict | None = None,
          log=print) -> pd.DataFrame:
    """The master table. fno / bands = None (download failed) -> the last saved values are kept."""
    rule = {**DEFAULT_LIQUID, **(liquid_rule or {})}
    meta = data / "meta"
    uni = pd.read_csv(meta / "universe_stocks.csv", dtype=str).fillna("")
    cls = classification.load(meta / "classification.csv")
    old_path = meta / "stocks.csv"
    old = pd.read_csv(old_path, dtype=str).fillna("").set_index("symbol") if old_path.exists() else pd.DataFrame()
    ipo_path = meta / "ipos.csv"
    ipos = pd.read_csv(ipo_path, dtype=str).fillna("").set_index("symbol") if ipo_path.exists() else pd.DataFrame()
    band_of = None if bands is None else {(s, se): b for s, se, b in zip(bands["symbol"], bands["series"], bands["band"])}
    band_any = None if bands is None else dict(zip(bands["symbol"], bands["band"]))

    stats = {r.symbol: price_stats(store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS), int(rule["sessions"]))
             for r in uni.itertuples()}
    lasts = [pd.Timestamp(s["last_date"]) for s in stats.values() if s["last_date"]]
    newest = max(lasts) if lasts else None

    rows = []
    for r in uni.itertuples():
        st = stats[r.symbol]
        c = cls.loc[r.symbol] if r.symbol in cls.index else {}
        prev = old.loc[r.symbol] if r.symbol in old.index else {}
        shares, promoter = _num(c.get("shares", "")), _num(c.get("promoter_pct", ""))
        fpct = round(100 - promoter, 2) if promoter is not None else _num(c.get("float_pct_nse", ""))
        close = st["close"]
        mcap = shares * close / CR if shares and close else None
        status = status_of(st["last_date"], newest)
        if fno is None:
            f = str(prev.get("fno", "")) == "True"
        else:
            f = r.symbol in fno
        if band_of is None:
            band = prev.get("price_band", "")
        else:
            band = band_of.get((r.symbol, r.series), band_any.get(r.symbol, ""))
        rows.append({"symbol": r.symbol, "id": r.id, "name": r.name, "isin": r.isin, "series": r.series, "listed": r.listed,
                     "first_date": st["first_date"], "last_date": st["last_date"], "sessions": st["sessions"],
                     "status": status, "n500": r.n500 == "True", "fno": f, "price_band": band,
                     "face_value": c.get("face_value", ""), "shares": int(shares) if shares else None,
                     "promoter_pct": promoter, "float_pct": fpct,
                     "raw_close": close, "mcap_cr": None if mcap is None else round(mcap, 2),
                     "float_mcap_cr": None if mcap is None or fpct is None else round(mcap * fpct / 100, 2),
                     "turnover_med30_cr": st["turnover_med30_cr"], "turnover_avg30_cr": st["turnover_avg30_cr"],
                     "liquid": is_liquid(status, close, st["turnover_med30_cr"], rule),
                     "sector": c.get("sector", ""), "industry": c.get("industry", ""),
                     "basic_industry": c.get("basic_industry", ""),
                     "shares_fetched": c.get("fetched", "") if shares else "",
                     "ipo_date": ipos.at[r.symbol, "ipo_date"] if r.symbol in ipos.index else "",
                     "ipo_price": _num(ipos.at[r.symbol, "ipo_price"]) if r.symbol in ipos.index else None})
    out = pd.DataFrame(rows, columns=COLS).sort_values("symbol").reset_index(drop=True)
    out["shares"] = out["shares"].astype("Int64")
    out["sessions"] = out["sessions"].astype(int)
    log(f"stock master: {len(out)} stocks, {int((out['status'] == 'active').sum())} active, {int(out['liquid'].sum())} liquid, "
        f"{int(out['fno'].sum())} F&O, {int(out['shares'].notna().sum())} with share count")
    return out


def write(data: Path, df: pd.DataFrame) -> bool:
    """Write stocks.csv; False when the content did not change (nothing to commit)."""
    path = data / "meta" / "stocks.csv"
    text = df.to_csv(index=False, lineterminator="\n")
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def download_lists(http, log=print) -> tuple[set[str] | None, pd.DataFrame | None]:
    """F&O list and price bands; None for a list NSE did not give (the saved values are kept then)."""
    fno = bands = None
    try:
        fno = nse.fno_symbols(http)
    except Exception as exc:  # noqa: BLE001
        log(f"  F&O list not available ({type(exc).__name__}); keeping the saved flags")
    try:
        bands = nse.price_bands(http)
    except Exception as exc:  # noqa: BLE001
        log(f"  price bands not available ({type(exc).__name__}); keeping the saved bands")
    return fno, bands


SHARE_ACTIONS = ["split", "bonus", "rights", "consolidation", "capital_reduction"]


def share_count_changed(data: Path, today) -> set[str]:
    """Stocks with a split / bonus / rights / consolidation ex-date after the day their share count was fetched (and not in
    the future): the stored count is out of date, ask NSE again."""
    out = set()
    cls_path = data / "meta" / "classification.csv"
    if not cls_path.exists():
        return out
    cls = pd.read_csv(cls_path, dtype=str).fillna("")
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv", dtype=str)
    ids = dict(zip(uni["symbol"], uni["id"]))
    for sym, fetched in zip(cls["symbol"], cls["fetched"]):
        p = data / "corporate_actions" / f"{ids.get(sym, sym)}.csv"
        if not fetched or not p.exists():
            continue
        ca = pd.read_csv(p, dtype=str).fillna("")
        hit = ca[ca["type"].isin(SHARE_ACTIONS) & (ca["ex_date"] > fetched) & (ca["ex_date"] <= str(today))]
        if len(hit):
            out.add(sym)
    return out


def download_ipos(data: Path, http, log=print, today: str | None = None) -> int:
    """data/meta/ipos.csv: main-board IPOs (NSE past issues) under today's symbols (renames followed), MERGED with the saved
    list (NSE's answer can be short or change its labels - the list never shrinks). Also data/meta/ipo_upcoming.csv:
    main-board issues not listed yet. Both kept when NSE fails."""
    try:
        raw = nse.api_json(http, "api/public-past-issues")
        raw = raw if isinstance(raw, list) else []
        ipos = nse.past_issues(http, raw)
        changes = nse.symbol_changes(http)
    except Exception as exc:  # noqa: BLE001
        log(f"  IPO list not available ({type(exc).__name__}); keeping the saved one")
        return 0
    new_of = dict(zip(changes.sort_values("date")["old"], changes.sort_values("date")["new"]))
    path = data / "meta" / "ipos.csv"
    saved = pd.read_csv(path, dtype=str) if path.exists() else pd.DataFrame(columns=["symbol", "ipo_date", "ipo_price"])
    ipos = pd.concat([saved, ipos.astype({"ipo_price": object})], ignore_index=True)
    for _ in range(5):                                   # follow chains A -> B -> C
        ipos["symbol"] = ipos["symbol"].map(lambda s: new_of.get(s, s))
    ipos["ipo_price"] = pd.to_numeric(ipos["ipo_price"], errors="coerce")
    ipos = ipos.dropna(subset=["ipo_date"]).sort_values("ipo_date").drop_duplicates("symbol", keep="last").sort_values("symbol")
    text = ipos.to_csv(index=False, lineterminator="\n")
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")
    up = nse.parse_issue_pipeline(raw, today or pd.Timestamp.today().strftime("%Y-%m-%d"))
    up_path = data / "meta" / "ipo_upcoming.csv"
    up_text = up.to_csv(index=False, lineterminator="\n")
    if not up_path.exists() or up_path.read_text(encoding="utf-8") != up_text:
        up_path.write_text(up_text, encoding="utf-8", newline="\n")
    log(f"  IPOs: {len(ipos)} main-board listings known, {len(up)} upcoming")
    return len(ipos)
