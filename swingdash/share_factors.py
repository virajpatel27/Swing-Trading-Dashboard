"""EPS / per-share adjustment factors, for the fundamentals of Phase S8.

    data/meta/share_factors.csv   symbol, ex_date, applied, type, ratio, factor

One line per split, bonus, consolidation or rights issue that the price adjustment applied (factor != 1). `applied` = the
trading day the price really changed (NSE's ex-date is sometimes a few days off). A per-share number reported for a period
that ENDED before `applied` is made comparable with today's share count by multiplying it with every later factor:
    adjusted EPS = reported EPS x product(factor of actions applied after the period end)
(1:1 bonus: factor 0.5 -> EPS 20 becomes 10; rights: the bonus element, as accounting standards restate EPS.)
Demergers and schemes are left out: they change the company, not the share count. Rebuilt with the adjusted prices.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import corporate_actions as ca

TYPES = ["split", "bonus", "consolidation", "rights"]
COLS = ["symbol", "ex_date", "applied", "type", "ratio", "factor"]


def from_actions(symbol: str, acts: pd.DataFrame) -> pd.DataFrame:
    if acts.empty:
        return pd.DataFrame(columns=COLS)
    status = acts["status"].fillna("").astype(str)
    factor = pd.to_numeric(acts["factor"], errors="coerce")
    keep = acts["type"].isin(TYPES) & status.str.startswith("applied") & factor.notna() & (factor != 1)
    a = acts[keep]
    ex = pd.to_datetime(a["ex_date"]).dt.strftime("%Y-%m-%d")
    applied = status[keep].str.extract(r"applied on (\d{4}-\d{2}-\d{2})")[0].fillna(ex)
    return pd.DataFrame({"symbol": symbol, "ex_date": ex, "applied": applied, "type": a["type"],
                         "ratio": a["ratio"].fillna("").astype(str), "factor": factor[keep].round(10)})[COLS]


def build(data: Path, uni: pd.DataFrame) -> pd.DataFrame:
    parts = [from_actions(r.symbol, ca.load(data / "corporate_actions", r.id)) for r in uni.itertuples()]
    parts = [p for p in parts if len(p)]
    out = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=COLS)
    return out.sort_values(["symbol", "applied"]).reset_index(drop=True)


def write(data: Path, df: pd.DataFrame) -> bool:
    path = data / "meta" / "share_factors.csv"
    text = df.to_csv(index=False, lineterminator="\n")
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def eps_factor(table: pd.DataFrame, symbol: str, period_end) -> float:
    """Multiply a per-share number of the period ending `period_end` by this to compare it with today's shares."""
    t = table[(table["symbol"] == symbol) & (pd.to_datetime(table["applied"]) > pd.Timestamp(period_end))]
    return float(pd.to_numeric(t["factor"]).prod()) if len(t) else 1.0
