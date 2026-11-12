"""Groups page data and per-stock group fields (Phase S9). Rule and parameters: config/group_rank.yaml.

group_table() -> {"sector": [...], "industry": [...], "theme": [...]} one dict per group:
  name, parent (industry: its sector), n, ids (member stock ids), rank, rank_chg, tag, strength, momentum, tail,
  tails = {benchmark: {"d": last `tail_daily` daily points, "w": last `tail_weekly` points 5 sessions apart}} for the RRG
  page (benchmark "mkt" = equal-weight market, plus each index of `rrg_benchmarks`), made with the RRG page's own
  settings (`rrg:` in the config: smoothing, strength window, momentum lag),
  med_<p> and avg_<p> for p in 1d / 1w / 1m / 3m / 1y / ytd (median / average member return %), hi20 / lo20 (members
  whose high / low today is the 20-day high / low), above50 (% of members above their 50-day SMA), small
stock_fields() -> per stock id: sector_rank, sector_tag, industry_rank, industry_tag, sector_rank_1m / industry_rank_1m
  (rank of the group's average 1-month return; the reference's per-stock "rank 1M" is exactly this), sector_ret_1w /
  industry_ret_1w, vs_sector_1m / vs_industry_1m (stock 1M return minus the group average), themes, theme, theme_status.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PERIODS = {"1d": "chg_1d", "1w": "ret_1w", "1m": "ret_1m", "3m": "ret_3m", "1y": "ret_1y", "ytd": "ret_ytd"}
LEVELS = ("sector", "industry", "theme")


def tag_of(strength: float, momentum: float) -> str | None:
    if strength is None or momentum is None or not np.isfinite(strength) or not np.isfinite(momentum):
        return None
    if strength >= 100:
        return "Leading" if momentum >= 100 else "Weakening"
    return "Improving" if momentum >= 100 else "Lagging"


def rrg(closes: pd.DataFrame, members: dict[str, list[str]], cfg: dict, bench: pd.Series | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Strength and momentum per day (rows) and group (columns) from the member closes (see config/group_rank.yaml).
    bench = an index's closes to compare with instead of the equal-weight market."""
    mv = float(cfg.get("max_daily_move", 0.25))
    rets = closes.pct_change(fill_method=None)
    rets = rets.where(rets.abs() <= mv)
    if bench is not None:
        market = bench.reindex(closes.index).ffill().astype(float)
    else:
        market = (1 + rets.mean(axis=1).fillna(0)).cumprod()
    idx = {}
    for g, ids in members.items():
        cols = [i for i in ids if i in rets.columns]
        if cols:
            idx[g] = (1 + rets[cols].mean(axis=1).fillna(0)).cumprod()
    if not idx:
        return pd.DataFrame(), pd.DataFrame()
    rs = 100 * pd.DataFrame(idx).div(market, axis=0)
    sm = int(cfg.get("smooth", 1))
    if sm > 1:                                   # RRG page only: average of the last `sm` sessions (rrg_settings)
        rs = rs.rolling(sm, min_periods=sm).mean()
    n = int(cfg.get("ratio_window", 63))
    strength = 100 * rs / rs.rolling(n, min_periods=n).mean()
    momentum = 100 + (strength - strength.shift(int(cfg.get("momentum_lag", 10))))
    return strength, momentum


def tail_points(series: pd.Series, n_daily: int, n_weekly: int) -> dict:
    """{"d": last n_daily values, "w": n_weekly values 5 sessions apart ending with the last one} (None for missing)."""
    w = series.iloc[::-1].iloc[::5].iloc[:n_weekly].iloc[::-1]
    return {"d": [_r(x, 1) for x in series.iloc[-n_daily:]], "w": [_r(x, 1) for x in w]}


def tail_dates(index: pd.Index, n_daily: int, n_weekly: int) -> dict:
    s = pd.Series(range(len(index)), index=index)
    w = s.iloc[::-1].iloc[::5].iloc[:n_weekly].iloc[::-1]
    return {"d": [d.strftime("%Y-%m-%d") for d in index[-n_daily:]], "w": [d.strftime("%Y-%m-%d") for d in w.index]}


def rrg_cfg(cfg: dict) -> dict:
    """The RRG page's own settings (Viraj 12-Nov-2026: smoothing 5, strength 30, momentum 10 sessions, fitted to the
    reference's RRG chart); the Groups table keeps ratio_window / momentum_lag (fitted to the reference's sector table)."""
    r = cfg.get("rrg") or {}
    return dict(cfg, ratio_window=int(r.get("ratio_window", cfg.get("ratio_window", 63))),
                momentum_lag=int(r.get("momentum_lag", cfg.get("momentum_lag", 10))), smooth=int(r.get("smooth", 1)))


def group_table(rows: pd.DataFrame, closes: pd.DataFrame, membership: pd.DataFrame, cfg: dict,
                benches: dict[str, pd.Series] | None = None) -> dict[str, list[dict]]:
    """rows = today's screen rows (index = stock id); closes = adjusted closes (days x stock ids), last sessions;
    benches = {index id: closes} for the RRG page's other benchmarks."""
    rows = rows[~rows.get("stale", pd.Series(False, index=rows.index)).fillna(False).astype(bool)]
    min_n = int(cfg.get("min_members", 5))
    back = int(cfg.get("rank_change_sessions", 5))
    tail = int(cfg.get("tail_points", 10))
    nd, nw = int(cfg.get("tail_daily", 20)), int(cfg.get("tail_weekly", 10))
    num = lambda c: pd.to_numeric(rows[c], errors="coerce") if c in rows else pd.Series(np.nan, index=rows.index)
    hi20 = num("high") >= num("high_20d")
    lo20 = num("low") <= num("low_20d")
    above = num("from_sma50") > 0
    out = {}
    for level in LEVELS:
        m = membership[(membership["level"] == level) & membership["id"].isin(rows.index)]
        members = {g: list(d["id"]) for g, d in m.groupby("name")}
        parent = dict(zip(m["name"], m["parent"]))
        big = {g: ids for g, ids in members.items() if len(ids) >= min_n}
        strength, momentum = rrg(closes, big, cfg)
        rc = rrg_cfg(cfg)
        r_s, r_m = rrg(closes, big, rc)
        other = {k: rrg(closes, big, rc, b) for k, b in (benches or {}).items() if b is not None and len(b)}
        ranks = (-strength).rank(axis=1, method="min") if len(strength) else pd.DataFrame()
        groups = []
        for g, ids in members.items():
            d = {"name": g, "parent": parent.get(g, ""), "n": len(ids), "ids": sorted(ids), "small": len(ids) < min_n}
            for p, col in PERIODS.items():
                v = num(col).loc[ids]
                d[f"med_{p}"] = _r(v.median())
                d[f"avg_{p}"] = _r(v.mean())
            d["hi20"], d["lo20"] = int(hi20.loc[ids].sum()), int(lo20.loc[ids].sum())
            d["above50"] = _r(above.loc[ids].mean() * 100)
            if g in strength.columns and len(strength) and np.isfinite(strength[g].iloc[-1]):
                s, mo = float(strength[g].iloc[-1]), float(momentum[g].iloc[-1])
                d["strength"], d["momentum"], d["tag"] = _r(s), _r(mo), tag_of(s, mo)
                d["rank"] = int(ranks[g].iloc[-1])
                if len(ranks) > back and np.isfinite(ranks[g].iloc[-1 - back]):
                    d["rank_chg"] = int(ranks[g].iloc[-1 - back] - ranks[g].iloc[-1])
                d["tail"] = [[_r(a), _r(b)] for a, b in zip(strength[g].iloc[-tail:], momentum[g].iloc[-tail:])]
                if g in r_s.columns:
                    d["tails"] = {"mkt": {"s": tail_points(r_s[g], nd, nw), "m": tail_points(r_m[g], nd, nw)}}
                for k, (bs, bm) in other.items():
                    if g in bs.columns and np.isfinite(bs[g].iloc[-1]):
                        d["tails"][k] = {"s": tail_points(bs[g], nd, nw), "m": tail_points(bm[g], nd, nw)}
            groups.append(d)
        r1m = pd.Series({d["name"]: d["avg_1m"] for d in groups if not d["small"] and d["avg_1m"] is not None})
        for d in groups:
            d["rank_1m"] = int(r1m.rank(ascending=False, method="min")[d["name"]]) if d["name"] in r1m.index else None
        out[level] = sorted(groups, key=lambda d: (d.get("rank") is None, d.get("rank") or 0, -d["n"]))
    return out


def stock_fields(rows: pd.DataFrame, table: dict[str, list[dict]], membership: pd.DataFrame) -> dict[str, dict]:
    by = {lvl: {d["name"]: d for d in table.get(lvl, [])} for lvl in LEVELS}
    out: dict[str, dict] = {}
    m = membership[membership["id"].isin(rows.index)]
    for sid, grp in m.groupby("id"):
        f: dict = {}
        r1m = pd.to_numeric(pd.Series([rows.at[sid, "ret_1m"] if "ret_1m" in rows else None]), errors="coerce").iat[0]
        for lvl in ("sector", "industry"):
            names = list(grp.loc[grp["level"] == lvl, "name"])
            g = by[lvl].get(names[0]) if names else None
            if not g:
                continue
            f[f"{lvl}_rank"], f[f"{lvl}_tag"], f[f"{lvl}_rank_1m"] = g.get("rank"), g.get("tag"), g.get("rank_1m")
            f[f"{lvl}_ret_1w"] = g.get("avg_1w")
            if g.get("avg_1m") is not None and np.isfinite(r1m):
                f[f"vs_{lvl}_1m"] = _r(r1m - g["avg_1m"])
        themes = [by["theme"][n] for n in grp.loc[grp["level"] == "theme", "name"] if n in by["theme"]]
        if themes:
            f["themes"] = ", ".join(sorted(t["name"] for t in themes))
            ranked = sorted(themes, key=lambda t: (t.get("rank") is None, t.get("rank") or 0))
            f["theme"] = ranked[0]["name"]
            f["theme_status"] = ranked[0].get("tag")
        out[sid] = {k: v for k, v in f.items() if v is not None}
    return out


def _r(x, nd=2):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)
