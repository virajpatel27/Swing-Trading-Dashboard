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
    """Stage per day (config/stage.yaml): 1 Basing, 2A Early uptrend, 2 Uptrend, 3 Topping, 4 Downtrend, 4A Improving.
    Stocks with long_ma sessions or more:
      above SMA200: 2, except below SMA50 after an extended run (SMA20 > SMA200 x 1.06 and close > SMA200 x 1.03) = 3
      at / below SMA200: 1 when back above SMA50 and (almost) above SMA150, 4A when above SMA50 only, else 4
    Younger stocks (min_sessions on): above SMA50 = 2 (3 when the close drops 1.5 % below SMA10), else 1 when 2 % above
    SMA30, else 4."""
    mn, L = int(cfg.get("min_sessions", 64)), int(cfg.get("long_ma", 200))
    sma = lambda k: c.rolling(int(k)).mean()
    long_, fast, mid, short = sma(L), sma(cfg.get("fast_ma", 50)), sma(cfg.get("mid_ma", 150)), sma(cfg.get("short_ma", 20))
    above_long, above_fast = c > long_, c >= fast
    extended = (short > long_ * (1 + float(cfg.get("top_ext", 0.06)))) & (c > long_ * (1 + float(cfg.get("top_above", 0.03))))
    basing = above_fast & (c > mid * (1 - float(cfg.get("base_tol", 0.008))))
    old = np.where(above_long, np.where(above_fast | ~extended, "2", "3"),
                   np.where(basing, "1", np.where(above_fast, "4A", "4")))
    # young stocks (min_sessions .. long_ma sessions): the same idea on shorter averages
    y = cfg.get("young") or {}
    y_long, y_fast, y_mid = sma(y.get("long_ma", 50)), sma(y.get("fast_ma", 10)), sma(y.get("mid_ma", 30))
    young = np.where(c > y_long * (1 - float(y.get("long_tol", 0.005))),
                     np.where(c < y_fast * (1 - float(y.get("fast_tol", 0.015))), "3", "2"),
                     np.where(c > y_mid * (1 + float(y.get("base_above", 0.02))), "1", "4"))
    n = pd.Series(np.arange(1, len(c) + 1), index=c.index)
    base = pd.Series(np.where(n >= L, old, young), index=c.index).where((n >= mn) & c.notna())
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
        # average turnover = volume x close (adjusted volume x adjusted close = as traded), incl. today; calibrated 07-Nov:
        # 98 % / 95 % equal to the reference (NSE's traded value, i.e. volume x average price: 89 %)
        pxv = v * c / 1e7
        f["turnover_avg20_cr"] = pxv.rolling(20, min_periods=20).mean()
        f["turnover_avg50_cr"] = pxv.rolling(50, min_periods=50).mean()
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
    ev_cfg = cfg.get("events") or {}
    rsb_id = ev_cfg.get("rsb_benchmark", "NIFTY_MIDSMALLCAP_400")
    if bench and rsb_id in bench:
        # RS before price (calibrated 07-Nov-2026): today the RS line vs rsb_benchmark is above its highest of the previous
        # rsb_lookback sessions while the close is 0..rsb_max_below % under its highest close of those sessions
        n_ = int(ev_cfg.get("rsb_lookback", 50))
        bx = bench[rsb_id].reindex(d.values, method="ffill").reset_index(drop=True)
        rl = c / bx
        # rsb_index_lag 1 (10-Nov-2026, Viraj: "Reference jevu"): the reference builds TODAY's RS point from the
        # PREVIOUS session's index close (3 of its 4 exports; the history uses same-day closes) - recall 0.68 -> 0.98
        lag = int(ev_cfg.get("rsb_index_lag", 0))
        rl_today = c / bx.shift(lag) if lag else rl
        below = (1 - c / c.shift(1).rolling(n_, min_periods=1).max()) * 100
        f["rsb_px_below"] = below
        f["rsb_today"] = (rl_today > rl.shift(1).rolling(n_, min_periods=1).max()) & (below > 0)             & (below <= float(ev_cfg.get("rsb_max_below", 10)))
    lines = set(cfg.get("rs_lines") or (bench or {}).keys())
    for bid, bs in (bench or {}).items():
        if bid not in lines and bid != cfg.get("beta_benchmark", "NIFTY_50"):
            continue
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
            # 252 sessions up to the PREVIOUS day (calibrated 07-Nov: 84 % within 0.05 of the reference, incl. today 75 %)
            f["beta_1y"] = (rs.rolling(YEAR, min_periods=YEAR // 2).cov(rb) / rb.rolling(YEAR, min_periods=YEAR // 2).var()).shift(1)
    f["stage"] = stage(c, stage_cfg) if stage_cfg else None
    f = pd.concat([f, events(f, cfg.get("events") or {})], axis=1)
    extra = {"sessions": np.arange(1, len(f) + 1)}
    if pattern_cfg:
        extra.update(patterns.fields(f, pattern_cfg))
    return pd.concat([f, pd.DataFrame(extra, index=f.index)], axis=1)


def event_age(ev: pd.Series, window: int, value: pd.Series | None = None) -> pd.Series:
    """Sessions since the latest event (0 = today), NaN when none in the last `window` sessions. value given: the event
    also ends when a later day's value is bigger than the event day's (e.g. a bigger volume day came after it)."""
    ev = ev.fillna(False).astype(bool).reset_index(drop=True)
    pos = pd.Series(np.where(ev, np.arange(len(ev)), np.nan)).ffill()
    age = pd.Series(np.arange(len(ev)), dtype=float) - pos
    if value is not None:
        v = pd.Series(value.to_numpy(float))
        seg = ev.cumsum()
        later = v.where(~ev, -np.inf).groupby(seg).cummax()          # biggest value AFTER the event day so far
        at_event = v.where(ev).groupby(seg).transform("max")
        age = age.where(~(later > at_event))
    return age.where(age <= window)


def events(f: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Event fields (calibrated 07-Nov-2026 on 4 days of the reference lists; settings config/indicators.yaml -> events):
      hv_age   High-volume event within `window` sessions: up chg_move_x x the previous day's ADR or more, close in the top
               part of the day (close_pos), volume above every volume of the previous hv_lookback sessions; it ends when a
               bigger volume day follows. hv_rvol / hv_move = volume vs the previous 50-day average / % change that day.
      br_age   Big reversal: high >= br_high % and close >= br_close % over the previous close, volume >= br_rvol x the
               previous 20-day average, previous close >= br_below % under SMA200."""
    w = int(cfg.get("window", 5))
    c, h, v = f["close"], f["high"], f["volume"]
    pc = c.shift(1)
    out = pd.DataFrame(index=f.index)
    adr_prev = f["adr_pct"].shift(1)
    hv = (f["chg_1d"] >= float(cfg.get("hv_move_x", 2.0)) * adr_prev) & (f["close_pos"] >= float(cfg.get("hv_close_pos", 75))) \
        & (v > v.shift(1).rolling(int(cfg.get("hv_lookback", 63)), min_periods=1).max())
    out["hv_age"] = event_age(hv, w, v).to_numpy()
    seg = hv.fillna(False).astype(bool).cumsum()
    rv50 = v / v.shift(1).rolling(50, min_periods=20).mean()
    out["hv_rvol"] = rv50.where(hv).groupby(seg).ffill().where(out["hv_age"].notna())
    out["hv_move"] = f["chg_1d"].where(hv).groupby(seg).ffill().where(out["hv_age"].notna())
    sma200_prev = c.rolling(200, min_periods=200).mean().shift(1)
    br = ((h / pc - 1) * 100 >= float(cfg.get("br_high", 13))) & (f["chg_1d"] >= float(cfg.get("br_close", 12))) \
        & (f["rvol"] >= float(cfg.get("br_rvol", 3))) & ((pc / sma200_prev - 1) * 100 <= -float(cfg.get("br_below", 6)))
    out["br_age"] = event_age(br, w).to_numpy()
    # Stage 2 breakout: close above the highest high of the previous 50 sessions on >= 2 x volume, close in the top
    # quarter of the day, Stage 2 that day (kept s2b_window sessions)
    st = f["stage"].astype(str) if "stage" in f else pd.Series("", index=f.index)
    s2b = (c > h.shift(1).rolling(50, min_periods=1).max()) & (f["rvol"] >= float(cfg.get("s2b_rvol", 2.0))) \
        & (f["close_pos"] >= float(cfg.get("hv_close_pos", 75))) & st.isin(["2", "2A"])
    out["s2b_age"] = event_age(s2b, int(cfg.get("s2b_window", 6))).to_numpy()
    # Shakeout: an intraday drop of >= the usual daily range (20-day mean of (high-low)/close) that holds within 3 % of
    # SMA50 (the close before it above SMA50), recovered to the close before the drop within 2 sessions, in an uptrend
    # (close above SMA50 and SMA200, SMA50 above SMA200)
    l = f["low"]
    s50, s200 = c.rolling(50, min_periods=50).mean(), c.rolling(200, min_periods=200).mean()
    rng_prev = ((h - l) / c * 100).rolling(20, min_periods=20).mean().shift(1)
    drop = (1 - l / pc) * 100
    fall = (drop >= rng_prev) & (drop >= float(cfg.get("so_min_drop", 1.5))) \
        & (l >= s50 * (1 - float(cfg.get("so_sma50_tol", 3)) / 100)) & (pc > s50.shift(1))
    conf = pd.Series(False, index=f.index)
    for r in range(int(cfg.get("so_recovery", 2)) + 1):
        conf |= fall.shift(r, fill_value=False).astype(bool) & (c >= pc.shift(r))
    out["so_age"] = event_age(conf & (c > s50) & (c > s200) & (s50 > s200), w).to_numpy()
    out["rb_age"], out["rb_level"] = recent_breakout(f, cfg)
    return pd.concat([out, base_levels(f, cfg), vcp_setup(f, cfg)], axis=1)


def _zigzag_lows(h, l, start: int, thr: float) -> list[int]:
    """Confirmed swing lows after `start` (a low): a low counts once price rose thr (fraction) above it."""
    lows, seek, ei, ev = [], "H", start, h[start]
    for i in range(start + 1, len(h)):
        if seek == "H":
            if h[i] > ev:
                ei, ev = i, h[i]
            elif l[i] <= ev * (1 - thr):
                seek, ei, ev = "L", i, l[i]
        else:
            if l[i] < ev:
                ei, ev = i, l[i]
            elif h[i] >= ev * (1 + thr):
                lows.append(ei)
                seek, ei, ev = "H", i, h[i]
    return lows


def _vcp_at(h, l, c, e: int, cfg: dict):
    """VCP with data up to row e, or None. pivot = highest high 15..34 bars back (incl. e) with no close above it since;
    L1 = lowest low after it; a = last confirmed zigzag low after L1; H1 = highest high L1..a; H2 = highest high after a;
    L3 = lowest low after H2. Depths pivot->L1, H1->a, H2->L3 must shrink."""
    mn, mx = int(cfg.get("vcp_min_base", 15)), int(cfg.get("vcp_max_base", 34))
    lo, hi = e - mx + 1, e - mn + 1
    if lo < 1 or not c[e] > 0:
        return None
    h, l, c = h[:e + 1], l[:e + 1], c[:e + 1]
    seg = h[lo:hi + 1]
    if np.all(np.isnan(seg)):
        return None
    p = lo + int(np.nanargmax(seg))
    if np.nanmax(c[p + 1:]) > h[p]:
        return None
    i1 = p + 1 + int(np.nanargmin(l[p + 1:]))
    lows = _zigzag_lows(h, l, i1, float(cfg.get("vcp_swing", 0.03)))
    if not lows or lows[-1] >= e:
        return None
    a = lows[-1]
    h1 = np.nanmax(h[i1:a + 1])
    j2 = a + 1 + int(np.nanargmax(h[a + 1:]))
    if j2 >= e:
        return None
    k3 = j2 + 1 + int(np.nanargmin(l[j2 + 1:]))
    d = [(1 - l[i1] / h[p]) * 100, (1 - l[a] / h1) * 100, (1 - l[k3] / h[j2]) * 100]
    if not d[0] > d[1] > d[2] > 0:
        return None
    if d[0] > float(cfg.get("vcp_first_max", 25)) or d[2] > float(cfg.get("vcp_last_max", 8)) \
            or (1 - c[e] / h[p]) * 100 > float(cfg.get("vcp_dist_max", 10)):
        return None
    hi52 = np.nanmax(h[max(0, e - 251):])
    tidy = (1 - h[p] / hi52) * 100 <= float(cfg.get("vcp_pivot_vs_hi52", 7)) and d[1] <= float(cfg.get("vcp_mid_ratio", 0.6)) * d[0]
    return d, h[p], e - p + 1, tidy


def vcp_setup(f: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """VCP of the LATEST day (calibrated 07-Nov-2026 on the reference's VCP lists; the scanner adds the Trend Template).
    An event: the day the VCP first appears (not seen with the same pivot in the vcp_fresh sessions before), kept
    vcp_window sessions with the values of that day. vcp_age = sessions since, vcp_depth1..3 = the three pullbacks %,
    vcp_pivot = the base high, vcp_base_bars = sessions from the pivot to that day."""
    cols = ["vcp_age", "vcp_depth1", "vcp_depth2", "vcp_depth3", "vcp_pivot", "vcp_base_bars"]
    out = pd.DataFrame(np.nan, index=f.index, columns=cols)
    h, l, c = (f[k].to_numpy(float) for k in ("high", "low", "close"))
    t, win, fresh = len(f) - 1, int(cfg.get("vcp_window", 2)), int(cfg.get("vcp_fresh", 5))
    cache: dict[int, object] = {}

    def at(e: int):
        if e not in cache:
            cache[e] = _vcp_at(h, l, c, e, cfg)
        return cache[e]

    for e in range(t, max(-1, t - win - 1), -1):
        v = at(e)
        if v is None:
            continue
        st = e                                         # walk back to the first day of this base's VCP
        while st - 1 >= 0 and (w := at(st - 1)) is not None and w[1] == v[1]:
            st -= 1
        seen = any((w := at(x)) is not None and w[1] == v[1] for x in range(max(0, st - fresh), st - 1))
        first = at(st)
        if t - st <= win and not seen and first[3]:   # first[3]: pivot near the 52-week high, 2nd pullback <= 0.6 x 1st
            out.loc[out.index[-1], cols] = [t - st, *first[0], first[1], first[2]]
        break
    return out


def _base_level(h, l, c, t: int, k: int, min_age: int, max_age: int, prior_min: float = 0.2) -> int | None:
    """Latest swing high (highest of +-k bars), min_age..max_age bars before t, that no close got above in (j, t],
    reached after a rise of >= prior_min from the low of the 60 bars before it."""
    for j in range(t - min_age, max(k, t - max_age) - 1, -1):
        if not h[j] >= np.nanmax(h[j - k:j + k + 1]) or np.nanmax(c[j + 1:t + 1]) > h[j]:
            continue
        lo = np.nanmin(l[max(0, j - 60):j + 1])
        if lo > 0 and h[j] / lo - 1 >= prior_min:
            return j
    return None


def base_levels(f: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Base / pivot levels of the LATEST day (earlier rows empty), calibrated 07-Nov-2026 on 4 days of reference lists.
      lvl_*   daily: the latest swing high (+-base_swing bars, base_min_age..base_max_age sessions old, after a 20 % rise,
              no close above it since). lvl_depth = % from it to the lowest low since, lvl_dist_adr = % below it / ADR %.
      wlvl_*  the same on weekly candles (+-wbase_swing weeks, wbase_min_age..wbase_max_age weeks).
      ipo_*   stocks with <= ipo_max_bars sessions: level = the listing day's high, moved to a later day's high whenever a
              close gets above the level; ipo_base_bars = sessions since that day.
    adr100_pct = 100-session ADR % (the reference caps a base's depth at 8.5 x this)."""
    n = len(f)
    cols = ["adr100_pct", "lvl_price", "lvl_age", "lvl_depth", "lvl_dist_adr", "wlvl_price", "wlvl_age", "wlvl_depth",
            "wlvl_dist_adr", "ipo_lvl", "ipo_base_bars", "ipo_depth", "ipo_dist"]
    out = pd.DataFrame(np.nan, index=f.index, columns=cols)
    h, l, c = (f[k].to_numpy(float) for k in ("high", "low", "close"))
    out["adr100_pct"] = 100 * ((f["high"] / f["low"]).rolling(100, min_periods=100).mean() - 1)
    if n < 5:
        return out
    t, adr = n - 1, f["adr_pct"].iat[-1]
    row = out.index[-1]
    j = _base_level(h, l, c, t, int(cfg.get("base_swing", 16)), int(cfg.get("base_min_age", 22)), int(cfg.get("base_max_age", 168)))
    if j is not None and j < t:
        out.loc[row, ["lvl_price", "lvl_age", "lvl_depth", "lvl_dist_adr"]] = [
            h[j], t - j, (1 - np.nanmin(l[j + 1:]) / h[j]) * 100, (h[j] / c[t] - 1) * 100 / adr if adr > 0 else np.nan]
    wk = f["date"].dt.to_period("W-FRI")
    g = pd.DataFrame({"h": f["high"], "l": f["low"], "c": f["close"]}).groupby(wk.to_numpy())
    wh, wl, wc = g["h"].max().to_numpy(), g["l"].min().to_numpy(), g["c"].last().to_numpy()
    tw = len(wc) - 1
    jw = _base_level(wh, wl, wc, tw, int(cfg.get("wbase_swing", 4)), int(cfg.get("wbase_min_age", 17)), int(cfg.get("wbase_max_age", 71)))
    if jw is not None and jw < tw:
        out.loc[row, ["wlvl_price", "wlvl_age", "wlvl_depth", "wlvl_dist_adr"]] = [
            wh[jw], tw - jw, (1 - np.nanmin(wl[jw + 1:]) / wh[jw]) * 100, (wh[jw] / c[t] - 1) * 100 / adr if adr > 0 else np.nan]
    if n <= int(cfg.get("ipo_max_bars", 30)):
        lvl, jl = h[0], 0
        for i in range(1, n):
            if c[i] > lvl:
                lvl, jl = h[i], i
        if jl < t:
            out.loc[row, ["ipo_lvl", "ipo_base_bars", "ipo_depth", "ipo_dist"]] = [
                lvl, t - jl, (1 - np.nanmin(l[jl + 1:]) / lvl) * 100, (lvl / c[t] - 1) * 100]
    return out


def _broken_level(h, l, c, e: int, k: int, min_age: int, prior_min: float, lookback: int = 250) -> int | None:
    """Row of the level broken on day e: the most recent swing high (highest of +-k bars) at least min_age bars old that
    no close got above until the day before e, reached after a rise of >= prior_min from the low of the 60 bars before it.
    None when the most recent such high is not broken by close[e]."""
    for j in range(e - min_age, max(k, e - lookback), -1):
        if h[j] < np.nanmax(h[j - k:j + k + 1]) or np.nanmax(c[j + 1:e]) > h[j]:
            continue
        if c[e] <= h[j]:
            return None
        if h[j] / np.nanmin(l[max(0, j - 60):j + 1]) - 1 >= prior_min:
            return j
    return None


def recent_breakout(f: pd.DataFrame, cfg: dict, last: int = 30) -> tuple[np.ndarray, np.ndarray]:
    """Recent breakout (calibrated 07-Nov-2026): a close above an old resistance level (see _broken_level) on >= rb_rvol
    x the 20-day volume within rb_window sessions, today >= rb_above above the level, Stage 2 today.
    Only the last `last` rows are computed (the screen and scanners use the latest day); earlier rows are empty."""
    n = len(f)
    age, lvl = np.full(n, np.nan), np.full(n, np.nan)
    h, l, c = (f[k].to_numpy(float) for k in ("high", "low", "close"))
    rv = f["rvol"].to_numpy(float)
    st = f["stage"].astype(str).to_numpy() if "stage" in f else np.full(n, "")
    k, min_age, prior = int(cfg.get("rb_swing", 8)), int(cfg.get("rb_min_age", 26)), float(cfg.get("rb_prior", 0.2))
    win, above, rmin = int(cfg.get("rb_window", 4)), 1 + float(cfg.get("rb_above", 5)) / 100, float(cfg.get("rb_rvol", 2.0))
    found: dict[int, int | None] = {}
    for t in range(max(0, n - last), n):
        if st[t] not in ("2", "2A"):
            continue
        for e in range(t, max(-1, t - win - 1), -1):
            if not rv[e] >= rmin:
                continue
            if e not in found:
                found[e] = _broken_level(h, l, c, e, k, min_age, prior) if e > min_age + k else None
            j = found[e]
            if j is not None and c[t] >= h[j] * above:
                age[t], lvl[t] = t - e, h[j]
                break
    return age, lvl


# ---------------------------------------------------------------- all stocks of one day / of every day
def rs_score(c: pd.Series, weights: dict, min_sessions: int) -> pd.Series:
    """Weighted returns over 3/6/9/12 months; a younger stock uses the periods it has (weights of the rest dropped), and
    one younger than the shortest period its return since the first session (calibrated 07-Nov: the reference rates
    stocks from their 11th session on)."""
    num = pd.Series(0.0, index=c.index)
    den = pd.Series(0.0, index=c.index)
    for n, w in weights.items():
        r = c / c.shift(int(n)) - 1
        ok = r.notna()
        num = num + r.fillna(0) * w
        den = den + ok * w
    have = pd.Series(np.arange(1, len(c) + 1), index=c.index) > min_sessions
    since = c / c.iloc[0] - 1 if len(c) else c
    return (num / den.replace(0, np.nan)).fillna(since).where(have)


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
