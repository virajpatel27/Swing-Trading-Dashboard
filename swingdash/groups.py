"""Own group indices for every sector, industry and theme, for every trading day from 2007 (Phase S3).

    data/groups/<level>/<id>/      date, group_index, group_ret_mean, group_ret_median, group_members   (store.py format)
    data/meta/groups.csv           level, id, name, parent, stocks, small, first_date, last_date

NSE has an index for only a few groups, so we build our own from the member stocks' ADJUSTED closes:
  group_ret_mean    equal-weight return of the day = average of the members' one-day returns
  group_ret_median  median of the same returns (the "typical stock" of the group)
  group_index       start_value x cumulative product of (1 + group_ret_mean) - the equal-weight index
  group_members     how many members counted that day
A member counts on a day only when it was LIQUID the day before (median turnover of its last 30 sessions >= Rs 1 Cr and
close >= Rs 5: the stock master's rule, config/settings.yaml -> liquid) and traded that day. Without this, hundreds of
thinly traded stocks bounce between bid and ask and blow the equal-weight index up (IT sector 2007->2026: 42x with all
stocks, 9x with liquid ones; NIFTY IT, cap-weighted, 5.8x). A member's day is also left out when its move is beyond
max_daily_move (bad / re-based prices), and a day with fewer than min_members counted members gets no value. Membership is today's classification for the whole history (NSE publishes
no history of it), so a group's past is "today's members back then". Settings: config/groups.yaml.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import classification, store
from .adjust import ADJ_COLS

COLS = ["date", "group_index", "group_ret_mean", "group_ret_median", "group_members"]
LIST_COLS = ["level", "id", "name", "parent", "stocks", "small", "first_date", "last_date"]


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", " and ")).strip("-")
    return s or "unnamed"


def membership(data: Path, root: Path) -> pd.DataFrame:
    """One row per (level, group name, parent, symbol, id): sector and industry from the classification, themes from
    data/meta/themes.csv (made by themes.py from config/theme_rules.yaml). Stocks not active are left out."""
    master = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    master = master[master["status"] == "active"]
    cls = classification.load(data / "meta" / "classification.csv")
    rows = []
    for r in master.itertuples():
        c = cls.loc[r.symbol] if r.symbol in cls.index else None
        if c is None:
            continue
        if c["sector"]:
            rows.append(("sector", c["sector"], "", r.symbol, r.id))
        if c["basic_industry"]:
            rows.append(("industry", c["basic_industry"], c["sector"], r.symbol, r.id))
    themes = data / "meta" / "themes.csv"
    if themes.exists():
        t = pd.read_csv(themes, dtype=str).fillna("")
        ids = dict(zip(master["symbol"], master["id"]))
        for r in t.itertuples():
            if r.symbol in ids:
                rows.append(("theme", r.theme, "", r.symbol, ids[r.symbol]))
    return pd.DataFrame(rows, columns=["level", "name", "parent", "symbol", "id"]).drop_duplicates(["level", "name", "symbol"])


def close_matrix(data: Path, ids: list[str]) -> pd.DataFrame:
    """Adjusted closes, one column per stock id, one row per trading day."""
    cols = {}
    for i in ids:
        df = store.read(data / "stocks" / "adjusted" / i, ADJ_COLS)
        if len(df):
            cols[i] = df.set_index("date")["close"].astype(float)
    return pd.DataFrame(cols).sort_index()


def liquid_matrix(data: Path, ids: list[str], index: pd.Index, rule: dict) -> pd.DataFrame:
    """True where a stock was liquid on the PREVIOUS trading day (raw turnover and raw close, as traded then)."""
    val, close = {}, {}
    for i in ids:
        df = store.read(data / "stocks" / "raw" / i, store.STOCK_COLS)
        if len(df):
            d = df.set_index("date")
            val[i], close[i] = d["value"].astype(float), d["close"].astype(float)
    n = int(rule.get("sessions", 30))
    turnover = pd.DataFrame(val).rolling(n, min_periods=min(10, n)).median()
    ok = (turnover >= float(rule.get("min_turnover_cr", 1.0)) * 1e7) & (pd.DataFrame(close) >= float(rule.get("min_price", 5.0)))
    return ok.shift(1, fill_value=False).reindex(index=index, columns=ids, fill_value=False)


def daily_returns(closes: pd.DataFrame, max_move: float) -> pd.DataFrame:
    """One-day returns between consecutive TRADED days of each stock (a stock that did not trade is NaN that day).
    Moves beyond +-max_move become NaN (left out)."""
    rets = {}
    for c in closes.columns:
        s = closes[c].dropna()
        r = s.pct_change()
        rets[c] = r.where(r.abs() <= max_move)
    return pd.DataFrame(rets).reindex(closes.index)


def index_series(rets: pd.DataFrame, start_value: float, min_members: int) -> pd.DataFrame:
    n = rets.notna().sum(axis=1)
    ok = n >= min_members
    mean = rets.mean(axis=1).where(ok)
    med = rets.median(axis=1).where(ok)
    first = ok.idxmax() if ok.any() else None
    out = pd.DataFrame({"date": rets.index, "group_ret_mean": mean.values, "group_ret_median": med.values,
                        "group_members": n.values})
    if first is None:
        return out.iloc[0:0].assign(group_index=np.nan)[COLS]
    out = out[out["date"] >= first].reset_index(drop=True)
    growth = (1 + out["group_ret_mean"].fillna(0)).cumprod()
    out["group_index"] = (start_value * growth / growth.iat[0]).round(4)     # the first day is the base: start_value
    out.loc[0, ["group_ret_mean", "group_ret_median"]] = np.nan
    out[["group_ret_mean", "group_ret_median"]] = out[["group_ret_mean", "group_ret_median"]].round(6)
    return out[COLS]


def build(root: Path, settings: dict, today, liquid_rule: dict | None = None, log=print) -> pd.DataFrame:
    """Compute and store every group index; returns the group list (also written to data/meta/groups.csv)."""
    data = root / "data"
    cfg = {"levels": ["sector", "industry", "theme"], "start_value": 1000, "min_members": 3, "max_daily_move": 0.5,
           "small_group": 5, **(settings or {})}
    mem = membership(data, root)
    mem = mem[mem["level"].isin(cfg["levels"])]
    ids = sorted(mem["id"].unique())
    closes = close_matrix(data, ids)
    liquid = liquid_matrix(data, list(closes.columns), closes.index, liquid_rule or {})
    rets = daily_returns(closes, float(cfg["max_daily_move"])).where(liquid)
    listing, changed = [], 0
    mem = mem.assign(key=mem["name"].map(slug))        # "Aluminium, Copper & Zinc" (BSE) = "Aluminium Copper & Zinc" (NSE)
    for (level, gid), g in mem.groupby(["level", "key"]):
        name = g["name"].value_counts().index[0]           # the spelling most members use
        ids = [i for i in g["id"] if i in rets.columns]
        series = index_series(rets[ids], float(cfg["start_value"]), int(cfg["min_members"]))
        if len(series):
            changed += bool(store.write(data / "groups" / level / gid, series, COLS, today))
        listing.append({"level": level, "id": gid, "name": name, "parent": g["parent"].value_counts().index[0], "stocks": len(g),
                        "small": len(g) < int(cfg["small_group"]),
                        "first_date": series["date"].iat[0].strftime("%Y-%m-%d") if len(series) else "",
                        "last_date": series["date"].iat[-1].strftime("%Y-%m-%d") if len(series) else ""})
    lst = pd.DataFrame(listing, columns=LIST_COLS).sort_values(["level", "name"]).reset_index(drop=True)
    remove_stale(data, lst)
    text = lst.to_csv(index=False, lineterminator="\n")
    path = data / "meta" / "groups.csv"
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")
    log(f"groups: {lst.groupby('level').size().to_dict()} groups, {changed} with changed files")
    return lst


def remove_stale(data: Path, lst: pd.DataFrame) -> None:
    """A group that no longer has members (e.g. a theme removed from theme_rules.yaml) loses its folder."""
    keep = {(r.level, r.id) for r in lst.itertuples()}
    base = data / "groups"
    if not base.exists():
        return
    for level_dir in base.iterdir():
        for g in level_dir.iterdir() if level_dir.is_dir() else []:
            if g.is_dir() and (level_dir.name, g.name) not in keep:
                for f in g.iterdir():
                    f.unlink()
                g.rmdir()
