"""BSE history for the days BEFORE a stock's first NSE session (from 07-Nov-2026).

About 220 stocks came to NSE from BSE in 2026 (first NSE session 20-Apr or 17-Aug-2026: HAWKINCOOK, ELANTAS, NIRLON ...)
and many older ones were on BSE years before NSE. Without their BSE days the stage, RS rating, 52-week high, all-time high
and returns of these stocks are wrong. This module keeps BSE's daily prices of those earlier days apart from NSE's:

    data/stocks/bse/<ID>/        same files and columns as data/stocks/raw (series 'BSE'), only days before the NSE start
    data/meta/bse_history.csv    symbol, id, isin, bse_code, nse_first, bse_first, bse_rows, checked   (one row per stock asked)
    data/meta/bse_actions.csv    symbol, ex_date, subject   (BSE corporate actions before the NSE start: bonus, split ...)

Raw NSE data is never changed: `joined_raw` puts the BSE days in front of the NSE days when adjusted prices are built
(rebuild.py, integrity.py). BSE's API refuses GitHub's servers, so fetching runs on the PC only
(`python scripts/backfill.py --job bse-stocks`, also part of "BSE update karo"); GitHub only reads the saved files.
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from . import corporate_actions as ca
from . import store
from .sources import bse

META_COLS = ["symbol", "id", "isin", "bse_code", "nse_first", "bse_first", "bse_rows", "checked"]
ACTION_COLS = ["symbol", "ex_date", "subject"]
# BSE purposes without a ratio: the factor comes from the prices on the ex-date (adjust.FROM_OPEN), applied only when the
# price really moved. Rights issues without the issue price are left out (BSE's list does not give it).
KEYWORDS = [("spin off", "demerger"), ("demerger", "demerger"), ("consolidation", "capital_reduction"),
            ("reduction of capital", "capital_reduction"), ("scheme of arrangement", "scheme")]


def folder(data: Path) -> Path:
    return data / "stocks" / "bse"


def meta_path(data: Path) -> Path:
    return data / "meta" / "bse_history.csv"


def actions_path(data: Path) -> Path:
    return data / "meta" / "bse_actions.csv"


def read_meta(data: Path) -> pd.DataFrame:
    p = meta_path(data)
    return pd.read_csv(p, dtype=str).fillna("") if p.exists() else pd.DataFrame(columns=META_COLS)


def parse_bse_subject(subject: str, face_value: float | None = None) -> list[dict]:
    """BSE purpose text -> actions (same dicts as corporate_actions.parse_subject). Dividends are left out (prices are
    not adjusted for dividends by default, and BSE's dividend text is per share already)."""
    got = [a for a in ca.parse_subject(subject, face_value) if a["type"] != "dividend"]
    if got:
        return got
    low = str(subject).lower()
    for key, typ in KEYWORDS:
        if key in low:
            return [{"type": typ, "ratio": "", "factor": None}]
    return []


def candidates(master: pd.DataFrame, history_start: date, meta: pd.DataFrame, refresh: bool = False) -> pd.DataFrame:
    """Active stocks whose NSE history starts after history_start (+ 10 days) and that were not asked yet (or whose NSE
    start moved, e.g. after a rename)."""
    m = master[(master["status"] == "active") & (master["first_date"] > str(history_start + timedelta(days=10)))]
    if refresh or meta.empty:
        return m
    asked = dict(zip(meta["id"], meta["nse_first"]))
    return m[[asked.get(i) != f for i, f in zip(m["id"], m["first_date"])]]


def update(data: Path, http, master: pd.DataFrame, history_start: date, today: date, deadline: float = float("inf"),
           clock=None, log=print, refresh: bool = False) -> dict:
    """Ask BSE for the days before each candidate's first NSE session; save prices + corporate actions. Resumable: every
    stock asked is written to bse_history.csv at once."""
    import time
    clock = clock or time.monotonic
    meta = read_meta(data)
    todo = candidates(master, history_start, meta, refresh)
    if todo.empty:
        log("bse-stocks: nothing to ask")
        return {"job": "bse-stocks", "asked": 0, "with_history": int((pd.to_numeric(meta["bse_rows"], errors="coerce") > 0).sum()),
                "stopped": ""}
    scrips = bse.scrip_list(http)
    by_isin = {r.isin: r for r in scrips.itertuples()}
    acts = pd.read_csv(actions_path(data), dtype=str).fillna("") if actions_path(data).exists() else pd.DataFrame(columns=ACTION_COLS)
    asked = got = 0
    stopped = ""
    for r in todo.itertuples():
        if clock() > deadline:
            stopped = "time limit"
            break
        s = by_isin.get(r.isin)
        nse_first = pd.Timestamp(r.first_date)
        row = {"symbol": r.symbol, "id": r.id, "isin": r.isin, "bse_code": s.code if s else "", "nse_first": r.first_date,
               "bse_first": "", "bse_rows": "0", "checked": str(today)}
        if s is not None:
            try:
                px = bse.stock_history(http, s.code, history_start, (nse_first - pd.Timedelta(days=1)).date())
                px = px[px["date"] < nse_first]
                new_acts = []
                if len(px):
                    new_acts = bse.corp_actions(http, s.code, history_start, (nse_first - pd.Timedelta(days=1)).date())
            except Exception as exc:  # noqa: BLE001 - stop; the next run continues with this stock
                stopped = f"{r.symbol}: {type(exc).__name__}: {str(exc)[:120]}"
                break
            if len(px):
                store.write(folder(data) / r.id, px, store.STOCK_COLS, today)
                row.update(bse_first=px["date"].iat[0].strftime("%Y-%m-%d"), bse_rows=str(len(px)))
                got += 1
            acts = acts[acts["symbol"] != r.symbol]
            keep = [a for a in new_acts if a["ex_date"] < nse_first and parse_bse_subject(a["subject"])]
            if keep:
                acts = pd.concat([acts, pd.DataFrame([{"symbol": r.symbol, "ex_date": a["ex_date"].strftime("%Y-%m-%d"),
                                                       "subject": a["subject"]} for a in keep])], ignore_index=True)
        asked += 1
        meta = pd.concat([meta[meta["id"] != r.id], pd.DataFrame([row])], ignore_index=True)
        if asked % 25 == 0:
            _save(data, meta, acts)
    _save(data, meta, acts)
    res = {"job": "bse-stocks", "asked": asked, "with_history_now": got, "left": len(todo) - asked, "stopped": stopped,
           "with_history": int((pd.to_numeric(meta["bse_rows"], errors="coerce") > 0).sum())}
    log(f"bse-stocks: {res}")
    return res


def _save(data: Path, meta: pd.DataFrame, acts: pd.DataFrame) -> None:
    meta_path(data).parent.mkdir(parents=True, exist_ok=True)
    meta[META_COLS].sort_values("symbol").to_csv(meta_path(data), index=False, lineterminator="\n")
    acts[ACTION_COLS].sort_values(["symbol", "ex_date"]).to_csv(actions_path(data), index=False, lineterminator="\n")


def joined_raw(data: Path, sid: str, raw: pd.DataFrame | None = None) -> pd.DataFrame:
    """NSE raw prices with BSE's days before the first NSE session in front (raw itself unchanged)."""
    raw = store.read(data / "stocks" / "raw" / sid, store.STOCK_COLS) if raw is None else raw
    b = folder(data) / sid
    if raw.empty or not b.exists():
        return raw
    early = store.read(b, store.STOCK_COLS)
    early = early[early["date"] < raw["date"].min()]
    if early.empty:
        return raw
    return pd.concat([early, raw], ignore_index=True).sort_values("date").reset_index(drop=True)


def actions(data: Path, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """{symbol: BSE corporate actions before its NSE start} in corporate_actions.CA_COLS form (source 'BSE')."""
    p = actions_path(data)
    if not p.exists():
        return {}
    df = pd.read_csv(p, dtype=str).fillna("")
    df = df[df["symbol"].isin(set(symbols))]
    out: dict[str, list[dict]] = {}
    for r in df.itertuples():
        for a in parse_bse_subject(r.subject):
            out.setdefault(r.symbol, []).append({"ex_date": pd.Timestamp(r.ex_date), "type": a["type"], "ratio": a.get("ratio", ""),
                                                 "factor": a.get("factor"), "amount": None, "method": "", "status": "",
                                                 "subject": r.subject, "source": "BSE"})
    return {s: pd.DataFrame(v, columns=ca.CA_COLS) for s, v in out.items()}


def merge_actions(per: dict[str, pd.DataFrame], extra: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """NSE actions + BSE actions (BSE only for ex-dates NSE does not have the same type on)."""
    out = dict(per)
    for sym, b in extra.items():
        cur = out.get(sym, pd.DataFrame(columns=ca.CA_COLS))
        have = set(zip(pd.to_datetime(cur["ex_date"]), cur["type"])) if len(cur) else set()
        b = b[[(e, t) not in have for e, t in zip(b["ex_date"], b["type"])]]
        if len(b):
            out[sym] = pd.concat([cur, b], ignore_index=True).sort_values(["ex_date", "type"]).reset_index(drop=True)
    return out
