"""Data checks. 'error' = the data must not be saved; 'warn' = saved, listed in data/meta/data_issues.csv for a human to look at."""
from __future__ import annotations

import pandas as pd

from .store import PRICE_COLS


def issue(instrument: str, level: str, check: str, detail: str, day=None) -> dict:
    return {"instrument": instrument, "level": level, "check": check,
            "date": "" if day is None else pd.Timestamp(day).strftime("%Y-%m-%d"), "detail": detail}


def check_series(name: str, df: pd.DataFrame, trading_days: pd.DatetimeIndex | None = None,
                 jump_pct: float = 20.0, explained: set | None = None) -> list[dict]:
    """explained = dates of known corporate actions (a big jump on those days is not an issue)."""
    out: list[dict] = []
    if df.empty:
        return [issue(name, "error", "empty", "no rows")]
    missing_cols = [c for c in ["date", *PRICE_COLS] if c not in df.columns]
    if missing_cols:
        return [issue(name, "error", "schema", f"missing columns {missing_cols}")]
    d = df["date"]
    if d.duplicated().any():
        out.append(issue(name, "error", "duplicate dates", f"{int(d.duplicated().sum())} duplicates", d[d.duplicated()].iloc[0]))
    if not d.is_monotonic_increasing:
        out.append(issue(name, "error", "order", "dates not in order"))
    if df["close"].isna().any():
        out.append(issue(name, "error", "missing close", f"{int(df['close'].isna().sum())} rows", d[df["close"].isna()].iloc[0]))

    p = df[PRICE_COLS]
    bad = (p <= 0).any(axis=1)
    for _, r in df[bad].head(5).iterrows():
        out.append(issue(name, "warn", "zero/negative price", f"O {r.open} H {r.high} L {r.low} C {r.close}", r.date))
    bad = (df["high"] < df["low"]) | (df["high"] < p[["open", "close"]].max(axis=1) - 1e-6) | \
          (df["low"] > p[["open", "close"]].min(axis=1) + 1e-6)
    for _, r in df[bad].head(5).iterrows():
        out.append(issue(name, "warn", "bad candle", f"O {r.open} H {r.high} L {r.low} C {r.close}", r.date))
    if int(bad.sum()) > 5:
        out.append(issue(name, "warn", "bad candle", f"{int(bad.sum())} bad candles in total"))

    chg = df["close"].pct_change().abs() * 100
    explained = explained or set()
    jumps = df[(chg > jump_pct) & ~df["date"].isin(explained)]
    for _, r in jumps.head(10).iterrows():
        out.append(issue(name, "warn", "unexplained jump", f"close moved {chg[r.name]:.1f}% (to {r.close})", r.date))

    if trading_days is not None and len(trading_days):
        span = trading_days[(trading_days >= d.min()) & (trading_days <= d.max())]
        gone = span.difference(pd.DatetimeIndex(d))
        if len(gone):
            out.append(issue(name, "warn", "missing dates", f"{len(gone)} trading days without a row "
                             f"(first {gone[0]:%Y-%m-%d}, last {gone[-1]:%Y-%m-%d})", gone[0]))
    return out


def check_delivery(name: str, df: pd.DataFrame) -> list[dict]:
    """Delivery rows: one per date, delivery % between 0 and 100, deliverable quantity not negative."""
    if df.empty:
        return [issue(name, "error", "empty", "no rows")]
    out = []
    d = df["date"]
    if d.duplicated().any():
        out.append(issue(name, "error", "duplicate dates", f"{int(d.duplicated().sum())} duplicates", d[d.duplicated()].iloc[0]))
    bad = (df["deliv_pct"] < 0) | (df["deliv_pct"] > 100) | (df["deliv_qty"] < 0)
    if bad.any():
        out.append(issue(name, "warn", "delivery out of range", f"{int(bad.sum())} rows", d[bad].iloc[0]))
    return out


def check_row_drop(name: str, before: int, after: int, max_drop_pct: float) -> list[dict]:
    if before and after < before * (1 - max_drop_pct / 100):
        return [issue(name, "error", "row drop", f"rows went from {before} to {after}")]
    return []
