"""One folder per instrument: closed years in Parquet files that are never rewritten unless their rows change,
the current year in `current.csv` (one line per day, so a daily update costs git only a few bytes).

    data/stocks/raw/RELIANCE/hist_2007_2025.parquet
    data/stocks/raw/RELIANCE/current.csv

Read = all Parquet files + current.csv, sorted by date. Write = compare with what is on disk and touch only what changed.
"""
from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pandas as pd

CURRENT = "current.csv"
PRICE_COLS = ["open", "high", "low", "close"]
STOCK_COLS = ["date", "open", "high", "low", "close", "prev_close", "volume", "value", "series"]
INDEX_COLS = ["date", "open", "high", "low", "close"]
DELIVERY_COLS = ["date", "deliv_qty", "deliv_pct"]          # raw deliverable quantity (not split-adjusted) and its %


def folder_name(symbol: str) -> str:
    """A safe folder name: 'M&M' -> 'M_M'. The real symbol is kept in data/meta/instruments.csv."""
    return re.sub(r"[^A-Za-z0-9\-]", "_", symbol.strip())


def _normalise(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    df = df.copy()
    for c in cols:
        if c not in df.columns:
            df[c] = pd.NA
    df = df[cols]
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    df = df.drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)
    for c in cols:
        if c in ("date", "series"):
            continue
        df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in ("volume", "deliv_qty", "group_members"):
        if c in df.columns:
            df[c] = df[c].round().astype("Int64")
    if "series" in df.columns:
        df["series"] = df["series"].astype("string")
    return df


def read(folder: Path, cols: list[str] | None = None) -> pd.DataFrame:
    parts = [pd.read_parquet(p) for p in sorted(folder.glob("hist_*.parquet"))]
    cur = folder / CURRENT
    if cur.exists() and cur.stat().st_size:
        parts.append(pd.read_csv(cur, dtype={"series": "string"}))
    if not parts:
        return pd.DataFrame(columns=cols or INDEX_COLS)
    df = pd.concat(parts, ignore_index=True)
    return _normalise(df, cols or list(df.columns))


def _same(a: pd.DataFrame, b: pd.DataFrame) -> bool:
    if len(a) != len(b):
        return False
    a, b = a.reset_index(drop=True), b.reset_index(drop=True)
    try:
        pd.testing.assert_frame_equal(a, b, check_dtype=False, check_exact=False, rtol=1e-9)
        return True
    except AssertionError:
        return False


def fill_ohl(df: pd.DataFrame) -> pd.DataFrame:
    """Index rows that have only a close (old NSE files, some BSE rows): open = high = low = close, so charts can draw them."""
    df = df.copy()
    for c in ("open", "high", "low"):
        df[c] = df[c].fillna(df["close"])
    return df


def compact(folder: Path, cols: list[str]) -> bool:
    """Join several hist_*.parquet files of one instrument into one (after a backfill). True when files changed."""
    files = sorted(folder.glob("hist_*.parquet"))
    if len(files) < 2:
        return False
    df = _normalise(pd.concat([pd.read_parquet(p) for p in files], ignore_index=True), cols)
    name = f"hist_{df['date'].dt.year.min()}_{df['date'].dt.year.max()}.parquet"
    tmp = folder / (name + ".tmp")
    df.to_parquet(tmp, index=False, compression="zstd")
    for p in files:
        p.unlink()
    tmp.rename(folder / name)
    return True


def write(folder: Path, df: pd.DataFrame, cols: list[str], today: date | None = None) -> list[str]:
    """Store df (the whole series). Returns the names of the files that changed."""
    today = today or date.today()
    folder.mkdir(parents=True, exist_ok=True)
    df = _normalise(df, cols)
    closed = df[df["date"].dt.year < today.year]
    current = df[df["date"].dt.year >= today.year]
    changed: list[str] = []

    # Closed years: keep each existing Parquet file whose rows are still the same; rewrite the others.
    covered: set[int] = set()
    for p in sorted(folder.glob("hist_*.parquet")):
        y0, y1 = (int(x) for x in p.stem.split("_")[1:3])
        want = closed[(closed["date"].dt.year >= y0) & (closed["date"].dt.year <= y1)].reset_index(drop=True)
        covered.update(range(y0, y1 + 1))
        if want.empty:
            p.unlink()
            changed.append(p.name)
        elif not _same(_normalise(pd.read_parquet(p), cols), want):
            want.to_parquet(p, index=False, compression="zstd")
            changed.append(p.name)
    rest = closed[~closed["date"].dt.year.isin(covered)]
    if not rest.empty:
        name = f"hist_{rest['date'].dt.year.min()}_{rest['date'].dt.year.max()}.parquet"
        rest.reset_index(drop=True).to_parquet(folder / name, index=False, compression="zstd")
        changed.append(name)

    cur = folder / CURRENT
    out = current.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    text = out.to_csv(index=False, lineterminator="\n", float_format="%.4f")
    if not cur.exists() or cur.read_text(encoding="utf-8") != text:
        cur.write_text(text, encoding="utf-8", newline="\n")
        changed.append(CURRENT)
    return changed
