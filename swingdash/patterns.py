"""Pattern detector (Phase S7): bases, pivots, breakouts, tight closes, VCP contractions, flags, reversals, shakeouts.
Settings in config/patterns.yaml; every field is in config/fields.yaml / docs/formulas.md.

Pivot (the top of the current base) on day t: the most recent bar i with
    t - i >= min_age  (old enough to be a base, not the move itself),
    high[i] > every high after it up to t  (still the highest point since),
    high[i] >= the `local` highs before it  (a real swing high),
    high[i] > close[t]  (still above the price: not broken out),
    t - i <= max_age.
Found with a "staircase" of falling highs (a stack), so every day costs only a few steps. Matched the reference app's
resistance level exactly for 52 % of its stocks (03-Nov-2026); most of the rest use a level that is not the highest since.

Per day (last `days` sessions): pivot, pivot_age, dist_pivot, base_depth, base_low, the same for long bases (pivot_w ...),
breakouts (breakout_days, breakout_level, breakout_run). Latest day only: VCP contractions and the flag.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _pivots(h: np.ndarray, c: np.ndarray, start: int, min_age: int, local: int, max_age: int) -> tuple[np.ndarray, np.ndarray]:
    """(pivot price, pivot bar index) for every day >= start (NaN / -1 before or when there is none)."""
    n = len(h)
    lm = np.zeros(n, dtype=bool)                       # high >= the `local` highs before it
    run_max = pd.Series(h).shift(1).rolling(local, min_periods=1).max().to_numpy()
    lm[:] = ~(h < np.nan_to_num(run_max, nan=-np.inf))
    piv, idx = np.full(n, np.nan), np.full(n, -1)
    stack: list[int] = []
    for t in range(max(0, start - max_age - 1), n):
        while stack and h[stack[-1]] <= h[t]:
            stack.pop()
        stack.append(t)
        if t < start:
            continue
        for i in reversed(stack):
            age = t - i
            if age < min_age:
                continue
            if age > max_age:
                break
            if lm[i] and h[i] > c[t]:
                piv[t], idx[t] = h[i], i
                break
    return piv, idx


def _zigzag(seg: np.ndarray, pct: float) -> list[tuple[int, str]]:
    """Swing points of a base: it starts at its top (point 0, a high); a swing low is set when the price rises pct % from
    the lowest close, a swing high when it falls pct % from the highest. The last point is the unfinished leg."""
    pts, d, ext = [(0, "H")], -1, 0
    for i in range(1, len(seg)):
        if d == -1:
            if seg[i] < seg[ext]:
                ext = i
            elif (seg[i] / seg[ext] - 1) * 100 >= pct:
                pts.append((ext, "L")); d, ext = 1, i
        else:
            if seg[i] > seg[ext]:
                ext = i
            elif (1 - seg[i] / seg[ext]) * 100 >= pct:
                pts.append((ext, "H")); d, ext = -1, i
    if ext != pts[-1][0]:
        pts.append((ext, "L" if d == -1 else "H"))
    return pts


def contractions(c: np.ndarray, h: np.ndarray, start: int, pct: float) -> list[float]:
    """Depths (%) of the pullbacks from the base top (bar `start`) to today: each swing high to the swing low after it."""
    seg = c[start:]
    if len(seg) < 3:
        return []
    seg = seg.copy()
    seg[0] = max(seg[0], h[start])                      # the base starts at the pivot bar's high
    pts = _zigzag(seg, pct)
    out = []
    for (i, k), (j, k2) in zip(pts, pts[1:]):
        if k == "H" and k2 == "L":
            out.append((1 - seg[j] / seg[i]) * 100)
    return out


def fields(f: pd.DataFrame, cfg: dict) -> dict[str, np.ndarray]:
    """Pattern columns for the engine's frame f (date, high, low, close, rvol, adr_pct, from_sma50, hi52, ...)."""
    h, l, c = f["high"].to_numpy(float), f["low"].to_numpy(float), f["close"].to_numpy(float)
    n = len(c)
    out: dict[str, np.ndarray] = {}
    start = max(0, n - int(cfg.get("days", 300)))
    for key, pre in (("pivot", ""), ("weekly_pivot", "_w")):
        p = cfg.get(key, {})
        piv, idx = _pivots(h, c, start, int(p.get("min_age", 15)), int(p.get("local", 20)), int(p.get("max_age", 260)))
        age = np.where(idx >= 0, np.arange(n) - idx, np.nan)
        base_low = np.full(n, np.nan)
        prior = np.full(n, np.nan)
        for t in range(start, n):
            i = idx[t]
            if i >= 0:
                base_low[t] = l[i:t + 1].min()
                if i >= 63:
                    prior[t] = (c[i] / c[i - 63] - 1) * 100
        out[f"pivot{pre}"] = piv
        out[f"pivot{pre}_age"] = age
        out[f"dist_pivot{pre}"] = (c / piv - 1) * 100
        out[f"base{pre}_depth"] = (1 - base_low / piv) * 100
        if not pre:
            out["base_low"] = base_low
            out["base_prior_gain"] = prior
    # breakouts: close above the day-before pivot on volume
    rvol = f["rvol"].to_numpy(float) if "rvol" in f else np.full(n, np.nan)
    prev_piv = np.r_[np.nan, out["pivot"][:-1]]
    bo = (c > prev_piv) & (rvol >= float(cfg.get("breakout", {}).get("rvol", 1.5)))
    prev_age = np.r_[np.nan, out["pivot_age"][:-1]]
    last, level, close_at, b_rvol, b_age = -1, np.nan, np.nan, np.nan, np.nan
    days, lev, run = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    brv, bage = np.full(n, np.nan), np.full(n, np.nan)
    for t in range(start, n):
        if bo[t]:
            last, level, close_at, b_rvol, b_age = t, prev_piv[t], c[t], rvol[t], prev_age[t]
        if last >= 0:
            days[t], lev[t], run[t] = t - last, level, (c[t] / close_at - 1) * 100
            brv[t], bage[t] = b_rvol, b_age
    out["breakout_days"], out["breakout_level"], out["breakout_run"] = days, lev, run
    out["breakout_rvol"], out["breakout_base_age"] = brv, bage
    # tight closes, inside day, wide reversal day, new low, undercut of the 50-day average
    k = int(cfg.get("tight", {}).get("days", 5))
    cs = pd.Series(c)
    out["tight_pct"] = ((cs.rolling(k).max() / cs.rolling(k).min() - 1) * 100).to_numpy()
    out["inside_day"] = np.r_[False, (h[1:] <= h[:-1]) & (l[1:] >= l[:-1])]
    out["range_pct"] = (h / l - 1) * 100
    out["new_low_20d"] = l <= pd.Series(l).shift(1).rolling(20, min_periods=20).min().to_numpy()
    out["new_low_20d_3d"] = pd.Series(out["new_low_20d"]).rolling(3, min_periods=1).max().astype(bool).to_numpy()
    if "from_sma50" in f:
        out["min_from_sma50_5d"] = f["from_sma50"].rolling(5, min_periods=1).min().to_numpy()
    if "hi52" in f:
        out["pivot_vs_hi52"] = (out["pivot"] / f["hi52"].to_numpy(float) - 1) * 100
    # latest day only: VCP contractions and the flag
    vc, vl, vf = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    pole, fdepth, fdays = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    if n >= 30:
        t = n - 1
        if not np.isnan(out["pivot_age"][t]):
            d = contractions(c[:t + 1], h, int(t - out["pivot_age"][t]), float(cfg.get("vcp", {}).get("swing_pct", 5)))
            run_ = 1
            for a, b in zip(d[::-1][1:], d[::-1]):     # count the trailing run of ever smaller pullbacks
                if b < a:
                    run_ += 1
                else:
                    break
            vc[t] = run_ if d else 0
            vl[t] = d[-1] if d else np.nan
            vf[t] = d[-run_] if d else np.nan
        pd_ = int(cfg.get("flag", {}).get("pole_days", 15))
        best, best_e = 0.0, -1
        for e in range(max(1, t - 20), t + 1):
            lo = c[max(0, e - pd_):e].min()
            g = (c[e] / lo - 1) * 100
            if g > best:
                best, best_e = g, e
        if best_e >= 0:
            top = h[best_e:t + 1].max()
            pole[t], fdays[t] = best, t - best_e
            fdepth[t] = (1 - l[best_e:t + 1].min() / top) * 100
    out["vcp_contractions"], out["vcp_last_pct"], out["vcp_first_pct"] = vc, vl, vf
    out["flag_pole_pct"], out["flag_depth_pct"], out["flag_days"] = pole, fdepth, fdays
    return out
