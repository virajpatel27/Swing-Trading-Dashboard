"""Indicator engine (Phase S4): every price / volume field for EVERY trading day of a stock, on ADJUSTED prices.

stock_fields() returns one row per day; the latest row feeds the screen snapshot, the full history feeds per-date features
(rank changes, stage changes, breadth, calibration). Formulas in plain English: config/fields.yaml -> docs/formulas.md.
Settings: config/indicators.yaml, config/stage.yaml. Golden tests against TA-Lib: tests/test_scan_phase4.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import patterns

YEAR, QUARTER = 252, 63
STAGE_NAMES = {"1": "Basing", "2A": "Early uptrend", "2": "Uptrend", "3": "Topping", "4": "Downtrend", "4A": "Improving"}


# ---------------------------------------------------------------- building blocks (Series in, Series out)
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    """alpha = 2 / (n + 1), started from the first value (converges to TA-Lib's SMA-seeded EMA after ~3n rows)."""
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def wilder(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def wma(s: pd.Series, n: int) -> pd.Series:
    w = np.arange(1, n + 1, dtype=float)
    return s.rolling(n, min_periods=n).apply(lambda x: np.dot(x, w) / w.sum(), raw=True)


def vwma(close: pd.Series, volume: pd.Series, n: int) -> pd.Series:
    return (close * volume).rolling(n, min_periods=n).sum() / volume.rolling(n, min_periods=n).sum()


def true_range(h: pd.Series, l: pd.Series, c: pd.Series) -> pd.Series:
    pc = c.shift(1)
    tr = pd.concat([h - l, (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    tr.iloc[0] = h.iloc[0] - l.iloc[0]
    return tr


def atr(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 14) -> pd.Series:
    return wilder(true_range(h, l, c), n)


def rsi(c: pd.Series, n: int = 14) -> pd.Series:
    d = c.diff()
    gain, loss = wilder(d.clip(lower=0), n), wilder(-d.clip(upper=0), n)
    out = 100 - 100 / (1 + gain / loss)
    return out.where(loss != 0, 100.0).where(gain.notna())


def macd(c: pd.Series, fast=12, slow=26, signal=9) -> tuple[pd.Series, pd.Series, pd.Series]:
    line = ema(c, fast) - ema(c, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return line, sig, line - sig


def mfi(h, l, c, v, n: int = 14) -> pd.Series:
    tp = (h + l + c) / 3
    flow = tp * v
    up = flow.where(tp > tp.shift(1), 0.0)
    down = flow.where(tp < tp.shift(1), 0.0)
    pos, neg = up.rolling(n, min_periods=n).sum(), down.rolling(n, min_periods=n).sum()
    out = 100 - 100 / (1 + pos / neg)
    return out.where(neg != 0, 100.0).where(pos.notna())


def bollinger(c: pd.Series, n=20, k=2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = sma(c, n)
    sd = c.rolling(n, min_periods=n).std(ddof=0)            # population standard deviation (as TA-Lib / TradingView)
    return mid, mid + k * sd, mid - k * sd


def supertrend(h: pd.Series, l: pd.Series, c: pd.Series, n=10, mult=3.0) -> tuple[pd.Series, pd.Series]:
    """(line, direction +1 up / -1 down). Bands hl2 -/+ mult x ATR(n, Wilder) that only tighten; flips on a close through."""
    a = atr(h, l, c, n).to_numpy()
    hl2 = ((h + l) / 2).to_numpy()
    cl = c.to_numpy()
    up_b, dn_b = hl2 - mult * a, hl2 + mult * a
    m = len(cl)
    line, d = np.full(m, np.nan), np.zeros(m)
    fu, fd, prev_dir = np.nan, np.nan, 1
    for i in range(m):
        if np.isnan(a[i]):
            continue
        if np.isnan(fu):
            fu, fd = up_b[i], dn_b[i]
        else:
            fu = up_b[i] if up_b[i] > fu or cl[i - 1] < fu else fu
            fd = dn_b[i] if dn_b[i] < fd or cl[i - 1] > fd else fd
        if prev_dir == 1 and cl[i] < fu:
            prev_dir = -1
        elif prev_dir == -1 and cl[i] > fd:
            prev_dir = 1
        d[i] = prev_dir
        line[i] = fu if prev_dir == 1 else fd
    return pd.Series(line, index=c.index), pd.Series(d, index=c.index).replace(0, np.nan)


def t3(c: pd.Series, n: int, v: float) -> pd.Series:
    """Tillson T3: six EMAs in a row, combined with the volume factor v."""
    e1 = c.ewm(span=n, adjust=False).mean()
    e2 = e1.ewm(span=n, adjust=False).mean()
    e3 = e2.ewm(span=n, adjust=False).mean()
    e4 = e3.ewm(span=n, adjust=False).mean()
    e5 = e4.ewm(span=n, adjust=False).mean()
    e6 = e5.ewm(span=n, adjust=False).mean()
    c1, c2 = -v ** 3, 3 * v ** 2 + 3 * v ** 3
    c3, c4 = -6 * v ** 2 - 3 * v - 3 * v ** 3, 1 + 3 * v + v ** 3 + 3 * v ** 2
    out = c1 * e6 + c2 * e5 + c3 * e4 + c4 * e3
    return out.where(pd.Series(np.arange(len(c)), index=c.index) >= 6 * n)      # needs a warm-up


def relative_extension(c: pd.Series, ma: int = 50, lookback: int = 250) -> pd.Series:
    """Stretch from the average, scaled by the biggest stretch of the lookback: +100 = as far above as ever, -100 = as far
    below as ever (separately for each side), 0 = on the average."""
    ext = (c / sma(c, ma) - 1) * 100
    hi = ext.clip(lower=0).rolling(lookback, min_periods=ma).max()
    lo = (-ext.clip(upper=0)).rolling(lookback, min_periods=ma).max()
    out = np.where(ext >= 0, 100 * ext / hi.replace(0, np.nan), 100 * ext / lo.replace(0, np.nan))
    return pd.Series(out, index=c.index).where(ext.notna()).clip(-100, 100)


def days_since_max(s: pd.Series, n: int) -> pd.Series:
    """Sessions since the highest value of the last n sessions (0 = today; the latest one when it was reached twice)."""
    x = s.to_numpy(float)
    pad = np.concatenate([np.full(n - 1, -np.inf), np.nan_to_num(x, nan=-np.inf)])
    win = np.lib.stride_tricks.sliding_window_view(pad, n)[:, ::-1]          # newest first
    return pd.Series(np.argmax(win, axis=1).astype(float), index=s.index).where(s.notna())


def stage(c: pd.Series, cfg: dict) -> pd.Series:
    """Stage per day (config/stage.yaml): 1 Basing, 2A Early uptrend, 2 Uptrend, 3 Topping, 4 Downtrend, 4A Improving."""
    mn = int(cfg.get("min_sessions", 64))
    long_ = c.rolling(int(cfg.get("long_ma", 200)), min_periods=mn).mean()
    fast = c.rolling(int(cfg.get("fast_ma", 50)), min_periods=min(mn, int(cfg.get("fast_ma", 50)))).mean()
    slope = long_ / long_.shift(int(cfg.get("slope_days", 20))) - 1
    flat = float(cfg.get("flat", 0.01))
    above_long, above_fast = c > long_, c >= fast
    base = np.where(above_long & above_fast, "2", np.where(above_long, "3",
                    np.where(above_fast & (slope.abs() < flat), "1", np.where(above_fast, "4A", "4"))))
    base = pd.Series(base, index=c.index).where(long_.notna() & fast.notna())
    # 2A: the first early_days sessions of a Stage 2 that came from 1 / 4 / 4A
    early, out, prev, run, from_low = int(cfg.get("early_days", 30)), [], None, 0, False
    for b in base:
        if b == "2":
            if prev != "2":
                from_low, run = prev in ("1", "4", "4A"), 0
            run += 1
            out.append("2A" if from_low and run <= early else "2")
        else:
            out.append(b if isinstance(b, str) else None)
        prev = b if isinstance(b, str) else prev
    return pd.Series(out, index=c.index, dtype=object)


# ---------------------------------------------------------------- one stock, all days
def stock_fields(adj: pd.DataFrame, raw: pd.DataFrame | None = None, deliv: pd.DataFrame | None = None,
                 bench: dict[str, pd.Series] | None = None, cfg: dict | None = None, stage_cfg: dict | None = None,
                 pattern_cfg: dict | None = None) -> pd.DataFrame:
    """adj: date, open, high, low, close, volume (adjusted). raw: date, close, value (as traded, for turnover).
    deliv: date, deliv_pct. bench: {index id: close Series indexed by date}. Returns one row per day."""
    cfg = cfg or {}
    a = adj.sort_values("date").reset_index(drop=True)
    d, o, h, l, c = a["date"], a["open"].astype(float), a["high"].astype(float), a["low"].astype(float), a["close"].astype(float)
    v = a["volume"].astype(float)
    f = pd.DataFrame({"date": d, "open": o, "high": h, "low": l, "close": c, "volume": v})
    pc = c.shift(1)
    f["prev_close"] = pc
    f["chg_1d"] = (c / pc - 1) * 100
    f["chg_1d_rs"] = c - pc
    f["gap_up"] = (o / pc - 1) * 100
    for k, n in {"1w": 5, "10d": 10, "1m": 21, "3m": 63, "6m": 126, "1y": 251}.items():   # 1y = 251 (calibrated)
        f[f"ret_{k}"] = (c / c.shift(n) - 1) * 100
    year_end = c.groupby(d.dt.year).transform("last").shift(1)
    first_of_year = d.dt.year != d.dt.year.shift(1)
    prev_year_close = year_end.where(first_of_year).ffill()
    f["ret_ytd"] = (c / prev_year_close - 1) * 100
    # moving averages and distances (%)
    for n in (10, 20, 50, 150, 200):
        f[f"sma{n}"] = sma(c, n)
    for n in (10, 20, 21, 50, 200):
        f[f"ema{n}"] = ema(c, n)
    for col in ("sma10", "sma20", "sma50", "sma200", "ema50"):
        f[f"from_{col}"] = (c / f[col] - 1) * 100
    # slopes of the averages (%): scanners ask "is the average rising?"
    f["sma20_chg_1w"] = (f["sma20"] / f["sma20"].shift(5) - 1) * 100
    for col in ("sma50", "sma150", "sma200", "ema50"):
        f[f"{col}_chg_1m"] = (f[col] / f[col].shift(21) - 1) * 100
    # highs / lows
    f["high_20d"], f["low_20d"] = h.rolling(20, min_periods=1).max(), l.rolling(20, min_periods=1).min()
    f["hi52"], f["lo52"] = h.rolling(YEAR, min_periods=1).max(), l.rolling(YEAR, min_periods=1).min()
    f["ath"] = h.cummax()
    f["from_hi52"], f["from_lo52"], f["from_ath"] = (c / f["hi52"] - 1) * 100, (c / f["lo52"] - 1) * 100, (c / f["ath"] - 1) * 100
    back = days_since_max(h, YEAR)                       # sessions back to the 52W high -> calendar days (calibrated)
    pos = np.arange(len(f)) - back.fillna(0).to_numpy().astype(int)
    f["days_since_hi52"] = (d - d.iloc[pos].reset_index(drop=True)).dt.days.where(back.notna())
    f["high_50d_prev"] = h.shift(1).rolling(50, min_periods=50).max()       # breakout level: highest high of the 50 days before
    f["close_pos"] = ((c - l) / (h - l) * 100).where(h > l, 50.0)           # where the close sits in the day's range, 0-100
    f["range_20d_pct"] = (f["high_20d"] / f["low_20d"] - 1) * 100            # how wide the last 20 days were
    # volume
    vc = cfg.get("volume", {})
    avg20 = v.shift(1).rolling(20, min_periods=20).mean()          # previous 20 sessions (RVol)
    avg50 = v.rolling(50, min_periods=50).mean()                    # last 50 sessions incl. today (calibrated)
    f["avg_vol20"], f["avg_vol50"] = avg20, avg50
    f["rvol"] = v / avg20
    f["vol_vs_avg50"] = v / avg50
    f["vol_chg_1d"] = (v / v.shift(1) - 1) * 100
    f["high_volume"] = v >= float(vc.get("high_volume_x", 1.5)) * avg20
    q, y = int(vc.get("quarter", QUARTER)), int(vc.get("year", YEAR))
    f["hve"] = (v >= v.cummax()) & (v > 0)
    f["hvy"] = v >= v.rolling(y, min_periods=y // 4).max()
    f["hvq"] = v >= v.rolling(q, min_periods=q // 2).max()
    f["lvy"] = v <= v.rolling(y, min_periods=y // 4).min()
    f["lvq"] = v <= v.rolling(q, min_periods=q // 2).min()
    k = int(vc.get("pocket_pivot_days", 10))
    down_vol = v.where(c < pc, 0.0).shift(1).rolling(k, min_periods=k).max()
    f["pocket_pivot"] = (c > pc) & (v > down_vol)
    dk = int(vc.get("dry_up_days", 10))
    f["dry_up"] = (v <= v.rolling(dk, min_periods=dk).min()) & (v < float(vc.get("dry_up_x", 0.5)) * avg50)
    if raw is not None and len(raw):
        r = raw.set_index("date")
        val = pd.to_numeric(r["value"], errors="coerce").reindex(d).reset_index(drop=True)
        f["turnover_cr"] = val / 1e7
        f["turnover_avg20_cr"] = f["turnover_cr"].rolling(20, min_periods=20).mean()
        f["turnover_avg50_cr"] = f["turnover_cr"].rolling(50, min_periods=50).mean()
        f["raw_close"] = pd.to_numeric(r["close"], errors="coerce").reindex(d).reset_index(drop=True)
    if deliv is not None and len(deliv):
        f["deliv_pct"] = deliv.set_index("date")["deliv_pct"].reindex(d).reset_index(drop=True)
    # oscillators / bands
    f["rsi14"] = rsi(c, 14)
    f["macd"], f["macd_signal"], f["macd_hist"] = macd(c)
    f["mfi14"] = mfi(h, l, c, v, 14)
    f["atr14"] = atr(h, l, c, 14)
    f["atr_pct"] = f["atr14"] / c * 100
    n_adr = int(cfg.get("adr_length", 20))
    f["adr_pct"] = 100 * (sma(h / l, n_adr) - 1)
    bb = cfg.get("bollinger", {})
    f["bb_mid"], f["bb_upper"], f["bb_lower"] = bollinger(c, int(bb.get("length", 20)), float(bb.get("std", 2)))
    st = cfg.get("supertrend", {})
    f["supertrend"], f["supertrend_dir"] = supertrend(h, l, c, int(st.get("length", 10)), float(st.get("multiplier", 3)))
    sb = cfg.get("swing_bands", {})
    vf = float(sb.get("volume_factor", 0.65))
    f["swing_fast"], f["swing_slow"] = t3(c, int(sb.get("fast", 8)), vf), t3(c, int(sb.get("slow", 14)), vf)
    f["swing_up"] = (f["swing_fast"] > f["swing_slow"]).where(f["swing_slow"].notna())
    re_ = cfg.get("relative_extension", {})
    f["rel_ext"] = relative_extension(c, int(re_.get("ma", 50)), int(re_.get("lookback", 250)))
    ti = cfg.get("trend_intensity", {})
    f["trend_intensity"] = sma(c, int(ti.get("fast", 7))) / sma(c, int(ti.get("slow", 65))) * 100
    # relative strength lines (vs each benchmark) and Mansfield RS
    default = cfg.get("benchmark", "NIFTY_SMALLCAP_250")
    weeks = int(cfg.get("mansfield_weeks", 52))
    for bid, bs in (bench or {}).items():
        b = bs.reindex(d.values, method="ffill").reset_index(drop=True)
        line = c / b
        f[f"rs_line_{bid.lower()}"] = line
        if bid == default:
            f["rs_line"] = line
            hi = line.rolling(YEAR, min_periods=YEAR // 2).max()
            f["rs_line_52w_high"] = line >= hi
            f["rs_new_high_before_price"] = f["rs_line_52w_high"] & (h < f["hi52"])
            last_hit = pd.Series(np.where(f["rs_line_52w_high"], np.arange(len(f)), np.nan)).ffill()
            f["rs_high_days"] = np.arange(len(f)) - last_hit          # sessions since the RS line was at its 52W high
            f["mansfield_rs"] = (line / line.rolling(weeks * 5, min_periods=weeks * 5).mean() - 1) * 100
        if bid == cfg.get("beta_benchmark", "NIFTY_50"):
            rs, rb = c.pct_change(), b.pct_change()
            f["beta_1y"] = rs.rolling(YEAR, min_periods=YEAR // 2).cov(rb) / rb.rolling(YEAR, min_periods=YEAR // 2).var()
    f["stage"] = stage(c, stage_cfg) if stage_cfg else None
    extra = {"sessions": np.arange(1, len(f) + 1)}
    if pattern_cfg:
        extra.update(patterns.fields(f, pattern_cfg))
    return pd.concat([f, pd.DataFrame(extra, index=f.index)], axis=1)


# ---------------------------------------------------------------- all stocks of one day / of every day
def rs_score(c: pd.Series, weights: dict, min_sessions: int) -> pd.Series:
    """Weighted returns over 3/6/9/12 months; a younger stock uses the periods it has (weights of the rest dropped)."""
    num = pd.Series(0.0, index=c.index)
    den = pd.Series(0.0, index=c.index)
    for n, w in weights.items():
        r = c / c.shift(int(n)) - 1
        ok = r.notna()
        num = num + r.fillna(0) * w
        den = den + ok * w
    have = pd.Series(np.arange(1, len(c) + 1), index=c.index) > min_sessions
    return (num / den.replace(0, np.nan)).where(have)


def percentile_vs(values: pd.DataFrame, reference: pd.DataFrame) -> pd.DataFrame:
    """Per row (day): each value's percentile among the reference values of that row, scaled to 1..99."""
    out = np.full(values.shape, np.nan)
    v, ref = values.to_numpy(float), reference.to_numpy(float)
    for i in range(len(values)):
        r = np.sort(ref[i][~np.isnan(ref[i])])
        if len(r) < 20:
            continue
        x = v[i]
        ok = ~np.isnan(x)
        lo, hi = np.searchsorted(r, x[ok], side="left"), np.searchsorted(r, x[ok], side="right")
        out[i, ok] = np.round(1 + 98 * ((lo + hi) / 2) / len(r))
    return pd.DataFrame(out, index=values.index, columns=values.columns)
