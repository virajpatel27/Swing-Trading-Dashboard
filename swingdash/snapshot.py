"""The dashboard's daily files:

  data/snapshot/latest.json    one row per stock / index: price, % changes, 52W, indicators, trend, flags, relative strength
  data/snapshot/sectors.json   sector -> industry -> stocks, with median moves and a momentum ranking

Stocks use ADJUSTED prices (the raw close is shown next to it). Relative strength: NSE stocks and NSE indices vs NIFTY 50,
BSE indices vs SENSEX. Written column-wise with one instrument per line (small, and git stores only changed lines).
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from . import indicators as ind
from . import store
from .adjust import ADJ_COLS

DISCLAIMER = "Educational purpose only, not investment advice."
COLUMNS = ["id", "kind", "exchange", "symbol", "name", "category", "n500", "macro", "sector", "industry", "basic_industry", "first_date",
           "date", "stale", "close", "raw_close", "chg_1d", "chg_1w", "chg_1m", "chg_3m", "chg_6m", "chg_1y", "chg_3y", "chg_5y",
           "hi52", "lo52", "from_hi52", "from_lo52", "volume", "avg_vol20", "vol_ratio", "ema10", "ema20", "ema50", "ema200",
           "rsi14", "macd", "macd_signal", "macd_hist", "atr14", "atr_pct", "trend", "rs_3m", "rs_6m", "rs_rating", "flags"]
FLAG_RULES = ["breakout_52w", "breakdown_52w", "breakout_20d", "breakdown_20d"]
STALE_DAYS = 10


def _r(x, nd=2):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) or pd.isna(x) else round(float(x), nd)


def _pct(x):
    return _r(None if x is None or pd.isna(x) else 100 * x)


def instrument_row(df: pd.DataFrame, info: dict, bench: pd.DataFrame | None, has_volume: bool, raw_close=None) -> tuple[dict, float]:
    """(snapshot row, RS score) for one instrument."""
    x = ind.compute(df, has_volume)
    last = x.iloc[-1]
    c = float(last["close"])
    flags = [f for f in FLAG_RULES if bool(last.get(f, False))]
    if pd.notna(last["ema50"]) and pd.notna(last["ema200"]) and c > last["ema50"] and c > last["ema200"]:
        flags.append("above_50_200")
    if pd.notna(last["rsi14"]) and 50 <= last["rsi14"] <= 70:
        flags.append("rsi_50_70")
    if c >= 0.95 * last["hi52"]:
        flags.append("near_52w_high")
    if has_volume and pd.notna(last.get("vol_ratio")) and last["vol_ratio"] > 2:
        flags.append("volume_spike")
    row = {**info, "first_date": df["date"].iat[0].strftime("%Y-%m-%d"), "date": last["date"].strftime("%Y-%m-%d"),
           "close": _r(c), "raw_close": _r(raw_close if raw_close is not None else c),
           **{f"chg_{k}": _pct(last[f"chg_{k}"]) for k in ind.PERIODS},
           "hi52": _r(last["hi52"]), "lo52": _r(last["lo52"]),
           "from_hi52": _pct(c / last["hi52"] - 1), "from_lo52": _pct(c / last["lo52"] - 1) if last["lo52"] > 0 else None,
           "volume": int(last["volume"]) if has_volume and pd.notna(last.get("volume")) else None,
           "avg_vol20": int(last["avg_vol20"]) if has_volume and pd.notna(last.get("avg_vol20")) else None,
           "vol_ratio": _r(last.get("vol_ratio")) if has_volume else None,
           **{f"ema{n}": _r(last[f"ema{n}"]) for n in (10, 20, 50, 200)},
           "rsi14": _r(last["rsi14"], 1), "macd": _r(last["macd"]), "macd_signal": _r(last["macd_signal"]),
           "macd_hist": _r(last["macd_hist"]), "atr14": _r(last["atr14"]), "atr_pct": _pct(last["atr14"] / c) if c else None,
           "trend": ind.trend(c, last["ema20"], last["ema50"], last["ema200"]),
           "rs_3m": _pct(ind.rs_vs(df["close"], df["date"], bench, 63)) if bench is not None else None,
           "rs_6m": _pct(ind.rs_vs(df["close"], df["date"], bench, 126)) if bench is not None else None,
           "flags": flags}
    return row, ind.rs_score(df["close"])


def build(data: Path, log=print) -> tuple[dict, dict]:
    meta = data / "meta"
    uni = pd.read_csv(meta / "universe_stocks.csv")
    cls_path = meta / "classification.csv"
    cls = pd.read_csv(cls_path, dtype=str).fillna("").set_index("symbol") if cls_path.exists() else pd.DataFrame()
    nifty = store.read(data / "indices" / "nse" / "NIFTY_50", store.INDEX_COLS)
    sensex = store.read(data / "indices" / "bse" / "SENSEX", store.INDEX_COLS)
    rows, scores = [], []

    for r in uni.itertuples():
        adj = store.read(data / "stocks" / "adjusted" / r.id, ADJ_COLS)
        if len(adj) < 2:
            continue
        raw = store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS)
        c = cls.loc[r.symbol] if r.symbol in cls.index else {}
        info = {"id": r.id, "kind": "stock", "exchange": "NSE", "symbol": r.symbol, "name": r.name, "category": "",
                "n500": bool(getattr(r, "n500", True)),
                "macro": c.get("macro", ""), "sector": c.get("sector", "") or r.industry, "industry": c.get("industry", ""),
                "basic_industry": c.get("basic_industry", "")}
        row, score = instrument_row(adj, info, nifty if len(nifty) else None, True, raw["close"].iat[-1] if len(raw) else None)
        rows.append(row)
        scores.append(("stock", score))

    for exch, list_file, name_col, bench in (("NSE", "indices_nse.csv", "name", nifty), ("BSE", "indices_bse.csv", "name", sensex)):
        lst = pd.read_csv(meta / list_file)
        for r in lst.itertuples():
            df = store.read(data / "indices" / exch.lower() / r.id, store.INDEX_COLS)
            if len(df) < 2:
                continue
            info = {"id": r.id, "kind": "index", "exchange": exch, "symbol": getattr(r, "code", r.name), "name": getattr(r, name_col),
                    "category": getattr(r, "category", ""), "n500": False, "macro": "", "sector": "", "industry": "", "basic_industry": ""}
            row, score = instrument_row(df, info, bench if len(bench) else None, False)
            rows.append(row)
            scores.append(("index", score))

    snap = pd.DataFrame(rows)
    newest = pd.to_datetime(snap["date"]).max()
    snap["stale"] = (newest - pd.to_datetime(snap["date"])).dt.days > STALE_DAYS
    kinds = pd.Series([k for k, _ in scores])
    raw_scores = pd.Series([s for _, s in scores], dtype=float)
    rating = pd.Series(np.nan, index=snap.index)
    for k in ("stock", "index"):                       # stocks ranked among stocks, indices among indices; stale ones left out
        m = (kinds == k) & ~snap["stale"]
        rating[m] = ind.rs_rating(raw_scores[m])
    snap["rs_rating"] = rating.astype("Int64")
    snap["flags"] = [f + (["strong_rs"] if pd.notna(rt) and rt >= 80 else []) for f, rt in zip(snap["flags"], snap["rs_rating"])]
    snap = snap[COLUMNS]
    latest = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"), "data_date": newest.strftime("%Y-%m-%d"),
              "disclaimer": DISCLAIMER, "prices": "stocks: adjusted for splits, bonus, rights, demergers (raw_close = as traded)",
              "benchmarks": {"NSE": "NIFTY 50", "BSE": "SENSEX"}, "columns": COLUMNS,
              "rows": [[None if (isinstance(v, float) and np.isnan(v)) or v is pd.NA else v for v in rec]
                       for rec in snap.astype(object).where(snap.notna(), None).values.tolist()]}
    sectors = build_sectors(snap)
    log(f"snapshot: {len(snap)} instruments ({int((snap['kind'] == 'stock').sum())} stocks), data date {latest['data_date']}, "
        f"{int(snap['stale'].sum())} stale, {len(sectors['sectors'])} sectors")
    return latest, sectors


def build_sectors(snap: pd.DataFrame) -> dict:
    st = snap[(snap["kind"] == "stock") & ~snap["stale"]].copy()
    st["sector"] = st["sector"].replace("", "Unclassified")
    st["industry"] = st["industry"].replace("", "Unclassified")
    moves = ["chg_1d", "chg_1w", "chg_1m", "chg_3m", "chg_6m", "chg_1y"]

    def stats(g: pd.DataFrame) -> dict:
        out = {"stocks": int(len(g))}
        for m in moves:
            out[m] = _r(g[m].median())
        out["pct_above_ema50"] = _r(100 * (g["close"] > g["ema50"]).mean(), 1)
        out["pct_above_ema200"] = _r(100 * (g["close"] > g["ema200"]).mean(), 1)
        out["avg_rs_rating"] = _r(g["rs_rating"].astype(float).mean(), 1)
        return out

    def ranked(items: list[dict]) -> list[dict]:
        """Momentum = average percentile of the median 1-month and 3-month moves; rank 1 = strongest."""
        df = pd.DataFrame(items)
        if df.empty:
            return items
        score = (df["chg_1m"].rank(pct=True) + df["chg_3m"].rank(pct=True)) / 2
        df["momentum"] = score.round(3)
        df["momentum_rank"] = score.rank(ascending=False, method="min", na_option="bottom").astype(int)
        df = df.sort_values("momentum_rank")
        # browsers reject NaN in JSON: missing numbers become null
        return [{k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in rec.items()} for rec in df.to_dict("records")]

    sectors = []
    for sec, g in st.groupby("sector"):
        inds = [{"industry": i, **stats(h), "constituents": h.sort_values("rs_rating", ascending=False)["id"].tolist()}
                for i, h in g.groupby("industry")]
        sectors.append({"sector": sec, **stats(g), "industries": ranked(inds)})
    return {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"), "disclaimer": DISCLAIMER,
            "levels": "NSE classification: sector -> industry -> stocks", "sectors": ranked(sectors)}


def unchanged(path: Path, new: dict) -> bool:
    """Same content as the file on disk, apart from generated_at (then the file is left alone: nothing to commit)."""
    if not path.exists():
        return False
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return False
    strip = lambda d: {k: v for k, v in d.items() if k != "generated_at"}
    return strip(old) == json.loads(json.dumps(strip(new), default=str))


def write(data: Path, latest: dict, sectors: dict) -> bool:
    """Write latest.json and sectors.json; False (nothing written) when neither changed."""
    out = data / "snapshot"
    if unchanged(out / "latest.json", latest) and unchanged(out / "sectors.json", sectors):
        return False
    out.mkdir(parents=True, exist_ok=True)
    head = {k: v for k, v in latest.items() if k != "rows"}
    # allow_nan=False: a NaN would make the file unreadable for browsers, so fail here instead
    lines = [json.dumps(row, separators=(",", ":"), ensure_ascii=False, allow_nan=False) for row in latest["rows"]]
    text = json.dumps(head, ensure_ascii=False, allow_nan=False)[:-1] + ',\n"rows":[\n' + ",\n".join(lines) + "\n]}\n"
    (out / "latest.json").write_text(text, encoding="utf-8", newline="\n")
    (out / "sectors.json").write_text(json.dumps(sectors, ensure_ascii=False, indent=1, default=str, allow_nan=False) + "\n",
                                      encoding="utf-8", newline="\n")
    return True
