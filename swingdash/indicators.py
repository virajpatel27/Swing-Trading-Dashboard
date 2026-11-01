"""Technical indicators. Always fed ADJUSTED prices (stocks) or index levels - never raw stock prices.

EMA     ewm(span=n, adjust=False), first value after n rows
RSI     Wilder (alpha = 1/n), 14
MACD    EMA12 - EMA26, signal EMA9 of MACD, histogram = MACD - signal
ATR     Wilder average of the true range, 14
52W     highest high / lowest low of the last 252 trading days
Trend   strong uptrend: close > EMA20 > EMA50 > EMA200 | uptrend: close > EMA50 > EMA200 | strong downtrend: close < EMA20 < EMA50
        < EMA200 | downtrend: close < EMA50 < EMA200 | otherwise sideways | < 200 rows: not enough history
Flags   breakout_52w: close above the highest close of the previous 252 days | breakdown_52w: below the lowest close of them
        breakout_20d: close above the highest high of the previous 20 days on volume > 1.5x its 20-day average (stocks)
        breakdown_20d: close below the lowest low of the previous 20 days
        above_50_200: close > EMA50 and close > EMA200 | rsi_50_70 | near_52w_high: within 5 % of the 52W high
        volume_spike: volume > 2x the previous 20-day average | strong_rs: RS rating >= 80
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PERIODS = {"1d": 1, "1w": 5, "1m": 21, "3m": 63, "6m": 126, "1y": 252, "3y": 756, "5y": 1260}
YEAR = 252


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    gain = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    out = 100 - 100 / (1 + gain / loss)
    return out.where(loss != 0, 100.0).where(gain.notna())


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    line = ema(close, fast) - ema(close, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "macd_signal": sig, "macd_hist": line - sig})


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    pc = close.shift(1)
    tr = pd.concat([high - low, (high - pc).abs(), (low - pc).abs()], axis=1).max(axis=1)
    tr.iloc[0] = high.iloc[0] - low.iloc[0]
    return tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def trend(close: float, e20: float, e50: float, e200: float) -> str:
    if any(pd.isna(x) for x in (close, e20, e50, e200)):
        return "not enough history"
    if close > e20 > e50 > e200:
        return "strong uptrend"
    if close > e50 > e200:
        return "uptrend"
    if close < e20 < e50 < e200:
        return "strong downtrend"
    if close < e50 < e200:
        return "downtrend"
    return "sideways"


def compute(df: pd.DataFrame, has_volume: bool = True) -> pd.DataFrame:
    """All indicator columns for one instrument (rows sorted by date)."""
    c, h, l = df["close"], df["high"], df["low"]
    out = pd.DataFrame({"date": df["date"], "close": c})
    for n in (10, 20, 50, 200):
        out[f"ema{n}"] = ema(c, n)
    out["rsi14"] = rsi(c)
    out = pd.concat([out, macd(c)], axis=1)
    out["atr14"] = atr(h, l, c)
    out["hi52"] = h.rolling(YEAR, min_periods=1).max()
    out["lo52"] = l.rolling(YEAR, min_periods=1).min()
    for k, n in PERIODS.items():
        out[f"chg_{k}"] = c / c.shift(n) - 1
    prev_hi_close = c.shift(1).rolling(YEAR, min_periods=YEAR // 2).max()
    prev_lo_close = c.shift(1).rolling(YEAR, min_periods=YEAR // 2).min()
    out["breakout_52w"] = c > prev_hi_close
    out["breakdown_52w"] = c < prev_lo_close
    out["breakdown_20d"] = c < l.shift(1).rolling(20, min_periods=20).min()
    if has_volume and "volume" in df.columns:
        v = df["volume"].astype(float)
        avg20 = v.shift(1).rolling(20, min_periods=20).mean()
        out["volume"], out["avg_vol20"] = v, avg20
        out["vol_ratio"] = v / avg20
        out["breakout_20d"] = (c > h.shift(1).rolling(20, min_periods=20).max()) & (out["vol_ratio"] > 1.5)
    else:
        out["breakout_20d"] = c > h.shift(1).rolling(20, min_periods=20).max()
    return out


def rs_vs(close: pd.Series, dates: pd.Series, bench: pd.DataFrame, n: int) -> float:
    """Relative strength over n days: (1 + own return) / (1 + benchmark return) - 1, on the instrument's own days."""
    if len(close) <= n:
        return np.nan
    b = bench.set_index("date")["close"].reindex(pd.DatetimeIndex(dates), method="ffill")
    r_own = close.iloc[-1] / close.iloc[-1 - n] - 1
    r_b = b.iloc[-1] / b.iloc[-1 - n] - 1
    return (1 + r_own) / (1 + r_b) - 1 if pd.notna(r_b) else np.nan


def rs_score(close: pd.Series) -> float:
    """Weighted 3/6/9/12-month return (recent quarter counts double); ranked across stocks into a 1-99 RS rating."""
    if len(close) <= YEAR:
        return np.nan
    r = lambda n: close.iloc[-1] / close.iloc[-1 - n] - 1
    return 0.4 * r(63) + 0.2 * r(126) + 0.2 * r(189) + 0.2 * r(252)


def rs_rating(scores: pd.Series) -> pd.Series:
    """Percentile rank of the scores -> 1..99 (NaN stays NaN)."""
    pct = scores.rank(pct=True)
    return (pct * 98 + 1).round().where(scores.notna())
