"""Price reaction to quarterly results (Phase S9) - inputs of the Earnings Gap and Episodic Pivot scanners.

Results days come from data/fundamentals/<SYMBOL>.json (the "ann" day of each quarter). Indian companies announce results
during or after market hours, so the reaction session is the results day itself or the next session: the one of the two
with the bigger opening gap. Fields (latest results day on or before the data day):

  earn_date         the reaction session
  earn_sessions     sessions since it (0 = today)
  earn_gap_pct      open of the reaction session vs the close before (%)
  earn_chg_pct      close of the reaction session vs the close before (%)
  earn_vol_x        volume of the reaction session / 50-day average volume the day before
  earn_close_pos    where the reaction session closed in its range (0 = low, 100 = high)
  earn_held         the reaction session closed at or above its open (the gap held that day)
  earn_gap_filled   any low since (incl. that day) at or below the close before the gap
  earn_run_pct      close now vs close of the reaction session (%)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

FIELDS = ["earn_date", "earn_sessions", "earn_gap_pct", "earn_chg_pct", "earn_vol_x", "earn_close_pos", "earn_held",
          "earn_gap_filled", "earn_run_pct"]


def result_days(data: Path, symbol: str) -> list[str]:
    """Every known results day of a stock (both consolidated and standalone quarters)."""
    p = data / "fundamentals" / f"{symbol}.json"
    if not p.exists():
        return []
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return []
    days = {v.get("ann") for b in ("C", "S") for v in (doc.get(b) or {}).get("q", {}).values()}
    return sorted(d for d in days if d)


def reaction(f: pd.DataFrame, days: list[str]) -> dict:
    """f = one stock's per-day frame (date, open, high, low, close, volume, avg_vol50, ...) up to the data day."""
    if not days or len(f) < 3:
        return {}
    dates = f["date"].dt.strftime("%Y-%m-%d").to_numpy()
    last_day = dates[-1]
    known = [d for d in days if d <= last_day]
    if not known:
        return {}
    i0 = int(np.searchsorted(dates, known[-1]))              # first session on / after the results day
    if i0 >= len(f) or i0 == 0:
        return {}
    o, h, l, c = (f[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    v = f["volume"].to_numpy(dtype=float) if "volume" in f else np.full(len(f), np.nan)
    avg = f["avg_vol50"].to_numpy(dtype=float) if "avg_vol50" in f else np.full(len(f), np.nan)
    gap = lambda i: (o[i] / c[i - 1] - 1) * 100 if c[i - 1] > 0 else np.nan
    cands = [i for i in (i0, i0 + 1) if i < len(f)]
    i = max(cands, key=lambda k: -np.inf if np.isnan(gap(k)) else gap(k))
    prev = c[i - 1]
    rng = h[i] - l[i]
    out = {"earn_date": dates[i], "earn_sessions": int(len(f) - 1 - i), "earn_gap_pct": gap(i),
           "earn_chg_pct": (c[i] / prev - 1) * 100 if prev > 0 else np.nan,
           "earn_vol_x": v[i] / avg[i - 1] if avg[i - 1] and avg[i - 1] > 0 else np.nan,
           "earn_close_pos": (c[i] - l[i]) / rng * 100 if rng > 0 else 50.0,
           "earn_held": bool(c[i] >= o[i]),
           "earn_gap_filled": bool(np.nanmin(l[i:]) <= prev),
           "earn_run_pct": (c[-1] / c[i] - 1) * 100 if c[i] > 0 else np.nan}
    return {k: (round(float(x), 2) if isinstance(x, (float, np.floating)) and np.isfinite(x) else x) for k, x in out.items()
            if not (isinstance(x, float) and not np.isfinite(x))}
