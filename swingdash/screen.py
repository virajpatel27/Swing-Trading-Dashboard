"""Screen snapshot (Phase S4): data/snapshot/screen.json = one row per stock with every field of the indicator engine
for the latest day (or any day: as_of), plus the fields that compare stocks with each other per day:

  rs_rating            1-99: percentile rank of the weighted 3/6/9/12-month return among the stocks of that day
  rs_rating_1w/1m/3m   1-99: percentile rank of the 1-week / 1-month / 3-month return among the stocks of that day
  (config/indicators.yaml -> rs_rating.universe: all = every stock with a value, liquid = only liquid ones count)
  rs_chg_1w, rs_chg_1m RS rating now minus 5 / 21 sessions ago; rs_rating_1m_ago
Stocks are computed in parallel (one process per CPU core). The file is NOT stored in git (it changes completely every
day): the website workflow builds it (scripts/build_screen.py), like the PC.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from . import breadth, earnings, engine, fundamentals, group_rank, groups, store
from .adjust import ADJ_COLS
from .config import ROOT

DISCLAIMER = "Educational purpose only, not investment advice."
MASTER_COLS = ["symbol", "name", "series", "listed", "n500", "fno", "price_band", "mcap_cr", "float_mcap_cr", "float_pct",
               "shares", "liquid", "sector", "industry", "basic_industry", "ipo_date", "ipo_price"]
HIST_COLS = ["close", "ret_1w", "ret_1m", "ret_3m"]
CROSS_COLS = ["rs_rating", "rs_rating_1w", "rs_rating_1m", "rs_rating_3m", "rs_chg_1w", "rs_chg_1m", "rs_rating_1m_ago"]
DROP = ["sessions"]
HIST_KEEP = 420


def _settings(root: Path) -> tuple[dict, dict, dict]:
    load = lambda n: yaml.safe_load(open(root / "config" / f"{n}.yaml", encoding="utf-8"))
    return load("indicators"), load("stage"), load("settings").get("liquid", {}), load("patterns")


def _benchmarks(data: Path, ids: list[str]) -> dict[str, pd.Series]:
    out = {}
    for b in ids:
        df = store.read(data / "indices" / "nse" / b, store.INDEX_COLS)
        if len(df):
            out[b] = df.set_index("date")["close"].astype(float)
    return out


def one_stock(args) -> tuple[str, dict, pd.DataFrame] | None:
    """(id, fields of the as_of day, per-day series for the cross-stock fields) - runs in a worker process."""
    sid, data, bench, cfg, stage_cfg, liquid_rule, as_of, pattern_cfg, result_days = args
    adj = store.read(data / "stocks" / "adjusted" / sid, ADJ_COLS)
    if as_of is not None:
        adj = adj[adj["date"] <= as_of]
    if len(adj) < 2:
        return None
    raw = store.read(data / "stocks" / "raw" / sid, store.STOCK_COLS)
    deliv = store.read(data / "stocks" / "delivery" / sid, store.DELIVERY_COLS)
    f = engine.stock_fields(adj, raw, deliv if len(deliv) else None, bench, cfg, stage_cfg, pattern_cfg)
    rs = cfg.get("rs_rating", {})
    weights = {int(k): float(v) for k, v in (rs.get("weights") or {63: .4, 126: .2, 189: .2, 252: .2}).items()}
    f["rs_score"] = engine.rs_score(f["close"], weights, int(rs.get("min_sessions", 63)))
    n = int(liquid_rule.get("sessions", 30))
    turnover = f["turnover_cr"] if "turnover_cr" in f else pd.Series(np.nan, index=f.index)
    rc = f["raw_close"] if "raw_close" in f else f["close"]
    f["liquid_day"] = (turnover.rolling(n, min_periods=min(10, n)).median() >= float(liquid_rule.get("min_turnover_cr", 1.0))) \
        & (rc >= float(liquid_rule.get("min_price", 5.0)))
    hist = f[HIST_COLS + ["rs_score", "liquid_day", "stage"]].join(breadth.day_flags(f).drop(columns=["chg_1d"]))
    hist["chg_1d"] = f["chg_1d"]
    hist.index = f["date"]
    hist = hist.iloc[-HIST_KEEP:]                               # cross fields, groups and breadth use the last ~1.5 years
    last = f.iloc[-1].drop(labels=DROP, errors="ignore").to_dict()
    last.update(earnings.reaction(f, result_days))          # Phase S9: price reaction to the latest results
    return sid, last, hist


def rank99(values: pd.DataFrame, universe: pd.DataFrame | None = None) -> pd.DataFrame:
    """Per row (day): percentile rank 1..99. universe given: rank against those values only (liquid stocks)."""
    if universe is None:                                    # rounded DOWN: 85.9 % within 3 of the reference, rounding 82.7 %
        return np.floor(values.rank(axis=1, pct=True) * 99 + 1e-9).clip(1, 99)
    return engine.percentile_vs(values, universe)


def cross_fields(hists: dict[str, pd.DataFrame], universe: str = "all") -> pd.DataFrame:
    """Per-day percentile fields for every stock; returns the values of the last day (index = stock id)."""
    mat = lambda col: pd.DataFrame({k: h[col] for k, h in hists.items()}).sort_index()
    liquid = mat("liquid_day").fillna(False).astype(bool) if universe == "liquid" else None
    out = {}
    score = mat("rs_score")
    rating = rank99(score, None if liquid is None else score.where(liquid))
    out["rs_rating"] = rating
    for k in ("1w", "1m", "3m"):
        r = mat(f"ret_{k}")
        out[f"rs_rating_{k}"] = rank99(r, None if liquid is None else r.where(liquid))
    last = pd.DataFrame({c: m.iloc[-1] for c, m in out.items()})
    last["rs_chg_1w"] = rating.iloc[-1] - rating.iloc[-6] if len(rating) > 5 else np.nan
    last["rs_chg_1m"] = rating.iloc[-1] - rating.iloc[-22] if len(rating) > 21 else np.nan
    last["rs_rating_1m_ago"] = rating.iloc[-22] if len(rating) > 21 else np.nan
    return last[CROSS_COLS]


def _clean(v, nd=4):
    if v is None or (isinstance(v, float) and not np.isfinite(v)) or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        f = float(v)
        return round(f, nd) if abs(f) < 1e6 else round(f, 2)
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%d")
    return v


def build(root: Path = ROOT, as_of=None, workers: int | None = None, log=print) -> dict:
    data = root / "data"
    cfg, stage_cfg, liquid_rule, pattern_cfg = _settings(root)
    master = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    bench = _benchmarks(data, sorted(set(cfg.get("rs_lines", [])) | {cfg.get("beta_benchmark", "NIFTY_50")}
                                     | {(cfg.get("events") or {}).get("rsb_benchmark", "NIFTY_MIDSMALLCAP_400")}))
    as_of = pd.Timestamp(as_of) if as_of is not None else None
    days = {sid: earnings.result_days(data, sym) for sid, sym in zip(master["id"], master["symbol"])}
    jobs = [(sid, data, bench, cfg, stage_cfg, liquid_rule, as_of, pattern_cfg, days[sid]) for sid in master["id"]]
    workers = workers or max(1, min(4, os.cpu_count() or 1))
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            results = [r for r in ex.map(one_stock, jobs, chunksize=16) if r]
    else:
        results = [r for r in map(one_stock, jobs) if r]
    lasts = {sid: last for sid, last, _ in results}
    hists = {sid: h for sid, _, h in results}
    cross = cross_fields(hists, (cfg.get("rs_rating") or {}).get("universe", "all"))
    newest = max(pd.Timestamp(l["date"]) for l in lasts.values())
    m = master.set_index("id")
    rows = []
    for sid, last in lasts.items():
        info = m.loc[sid]
        row = {"id": sid, **{c: info.get(c, "") for c in MASTER_COLS}, **last,
               **(cross.loc[sid].to_dict() if sid in cross.index else {})}
        row["stale"] = (newest - pd.Timestamp(last["date"])).days > 10
        listed = pd.to_datetime(row.get("listed") or None, errors="coerce")
        row["days_listed"] = None if pd.isna(listed) else int((pd.Timestamp(last["date"]) - listed).days)
        ipo = pd.to_datetime(row.get("ipo_date") or None, errors="coerce")
        row["days_since_ipo"] = None if pd.isna(ipo) else int((pd.Timestamp(last["date"]) - ipo).days)
        rows.append(row)
    # groups (Phase S9): rank / tag / returns per sector, industry, theme + each stock's group fields
    gcfg = yaml.safe_load(open(root / "config" / "group_rank.yaml", encoding="utf-8"))
    n_hist = int(gcfg.get("history_sessions", 160))
    closes = pd.DataFrame({sid: h["close"].iloc[-n_hist - 5:] for sid, h in hists.items()}).sort_index().iloc[-n_hist:]
    mem = groups.membership(data, root)
    rdf = pd.DataFrame(rows).set_index("id")
    benches = {}
    for bid in gcfg.get("rrg_benchmarks", []):          # RRG page: the same chart against an index (Phase N9)
        bdf = store.read(data / "indices" / "nse" / bid, store.INDEX_COLS)
        if len(bdf):
            benches[bid] = bdf.set_index("date")["close"].astype(float)
    table = group_rank.group_table(rdf, closes, mem, gcfg, benches)
    gfields = group_rank.stock_fields(rdf, table, mem)
    for row in rows:
        row.update(gfields.get(row["id"], {}))
    # fundamentals (Phase S8): only what was announced by the data day
    fin = fundamentals.screen_fields(data, rows, as_of.strftime("%Y-%m-%d") if as_of is not None else None)
    for row in rows:
        row.update(fin.get(row["id"], {}))
    cols = list(rows[0].keys())
    for r in rows[1:]:
        cols += [c for c in r if c not in cols]
    typed = {"n500", "fno", "liquid"}
    table_groups = table
    table = [[_clean(r.get(c)) if c not in typed else str(r.get(c)) == "True" for c in cols] for r in rows]
    for c in ("mcap_cr", "float_mcap_cr", "float_pct", "shares", "ipo_price"):
        i = cols.index(c)
        for t in table:
            t[i] = None if t[i] in ("", None) else float(t[i])
    snap = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"), "data_date": newest.strftime("%Y-%m-%d"),
            "disclaimer": DISCLAIMER, "prices": "adjusted for splits, bonus, rights, demergers", "columns": cols, "rows": table,
            "groups": {"data_date": newest.strftime("%Y-%m-%d"), "config": gcfg, "levels": table_groups,
                       "tail_days": group_rank.tail_dates(closes.index, int(gcfg.get("tail_daily", 20)), int(gcfg.get("tail_weekly", 10)))},
            "breadth": breadth.build(data, hists, yaml.safe_load(open(root / "config" / "breadth.yaml", encoding="utf-8")))}
    log(f"screen: {len(table)} stocks x {len(cols)} fields, data date {snap['data_date']}")
    return snap


def write(data: Path, snap: dict, name: str = "screen.json") -> Path:
    out = data / "snapshot"
    out.mkdir(parents=True, exist_ok=True)
    head = {k: v for k, v in snap.items() if k not in ("rows", "groups", "breadth")}
    lines = [json.dumps(r, separators=(",", ":"), ensure_ascii=False, allow_nan=False) for r in snap["rows"]]
    text = json.dumps(head, ensure_ascii=False, allow_nan=False)[:-1] + ',\n"rows":[\n' + ",\n".join(lines) + "\n]}\n"
    (out / name).write_text(text, encoding="utf-8", newline="\n")
    return out / name


def write_groups(data: Path, snap: dict, name: str = "group_ranks.json", key: str = "groups") -> Path | None:
    """data/snapshot/group_ranks.json / breadth.json (git-ignored, built with screen.json): Groups and Breadth pages."""
    if key not in snap:
        return None
    out = data / "snapshot" / name
    out.write_text(json.dumps(snap[key], separators=(",", ":"), ensure_ascii=False, allow_nan=False), encoding="utf-8")
    return out


def as_frame(snap: dict) -> pd.DataFrame:
    return pd.DataFrame(snap["rows"], columns=snap["columns"])
