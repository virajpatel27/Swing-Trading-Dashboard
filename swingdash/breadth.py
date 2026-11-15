"""Market breadth (Phase S10): per-day counts over all stocks and over the stocks liquid that day, plus a plain-English
read. Parameters: config/breadth.yaml. Written to data/snapshot/breadth.json with screen.json (git-ignored; the website
workflow builds it).

Per stock and day (day_flags, from the engine frame): above20 / above50 / above200 (close above the SMA), adv / dec,
nh52 / nl52 (the day's high / low is the highest / lowest of the last 252 sessions incl. today; stocks with 200+ sessions),
nh20 / nl20 (same over 20 sessions), up4 / dn4 (4 % movers), bo (breakout = "4 % breakout": up 4 %+ on volume above the
day before and at least 100,000 shares), bo_lvl (the breakout day's close), stage, sessions, liquid.
Re-tuned 15-Nov-2026 against the reference (docs/calibration.md).

Per universe and day (series): pct_above20/50/200, adv, dec, ad_ratio (adv / dec summed over 20 sessions), ad_line
(running sum of adv - dec over the kept days), nh52, nl52, nh20, nl20, up4, dn4, breakouts, held / failed (5 sessions
later the close is above the breakout day's close or not), follow (5 sessions later >= 5 % above it), stage1/2/3/4 (% of
stocks with 64+ sessions), n. The liquid universe also needs liquid_min_sessions (30) sessions of history.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import store

FLAGS = ["chg_1d", "above20", "above50", "above200", "nh52", "nl52", "nh20", "nl20", "bo", "bo_lvl", "sessions"]
STAGE_OF = {"1": 1, "1A": 1, "2": 2, "2A": 2, "3": 3, "4": 4, "4A": 4}
HL52_WINDOW, HL52_MIN_SESSIONS = 252, 200      # 52-week high / low: highest / lowest of 252 sessions incl. today, 200+ sessions
HL20_WINDOW = 20                               # 20-day high / low: same over 20 sessions incl. today
BO_PCT, BO_MIN_VOLUME = 4.0, 100_000           # breakout: +4 % or more, volume above the day before and >= 100,000 shares


def day_flags(f: pd.DataFrame) -> pd.DataFrame:
    """Per-day breadth flags of one stock (f = engine frame). NaN where the input is not known yet."""
    h, l, c = f["high"], f["low"], f["close"]
    out = pd.DataFrame(index=f.index)
    out["chg_1d"] = f["chg_1d"]
    for n in (20, 50, 200):
        col = f.get(f"from_sma{n}")
        out[f"above{n}"] = (col > 0).where(col.notna()) if col is not None else np.nan
    sess = pd.Series(f["sessions"].to_numpy() if "sessions" in f else np.arange(1, len(f) + 1), index=f.index)
    # like the reference (15-Nov-2026): today's high AT the highest high of the window incl. today (ties count), the
    # previous days needed in full; 52 weeks only for stocks with HL52_MIN_SESSIONS sessions (young listings left out)
    w = HL52_WINDOW - 1
    hi_p, lo_p = h.shift(1).rolling(w, min_periods=1).max(), l.shift(1).rolling(w, min_periods=1).min()
    old = sess >= HL52_MIN_SESSIONS
    out["nh52"] = ((h >= hi_p) & old).where(hi_p.notna())
    out["nl52"] = ((l <= lo_p) & old).where(lo_p.notna())
    w = HL20_WINDOW - 1
    hi_p, lo_p = h.shift(1).rolling(w, min_periods=w).max(), l.shift(1).rolling(w, min_periods=w).min()
    out["nh20"], out["nl20"] = (h >= hi_p).where(hi_p.notna()), (l <= lo_p).where(lo_p.notna())
    if "volume" in f:
        v = f["volume"].astype(float)
        bo = (f["chg_1d"] >= BO_PCT) & (v > v.shift(1)) & (v >= BO_MIN_VOLUME)
        out["bo"] = bo.where(f["chg_1d"].notna())
        out["bo_lvl"] = c.where(bo)
    else:
        out["bo"], out["bo_lvl"] = np.nan, np.nan
    out["sessions"] = sess
    return out


def _label(v, table):
    if v is None or not np.isfinite(v):
        return None
    for bound, word in table:
        if v < bound:
            return word
    return table[-1][1]


def series(hists: dict[str, pd.DataFrame], cfg: dict, liquid_only: bool) -> pd.DataFrame:
    """Per-day counts over the stocks of one universe (rows = days)."""
    days = int(cfg.get("days", 260))
    hold = int((cfg.get("breakout") or {}).get("hold_sessions", 5))
    mv = float(cfg.get("movers_pct", 4))
    mat = lambda col: pd.DataFrame({k: h[col] for k, h in hists.items() if col in h}).sort_index()
    chg = mat("chg_1d")
    idx = chg.index[-(days + 60):]
    chg = chg.reindex(idx)
    member = chg.notna()
    if liquid_only:
        member &= mat("liquid_day").reindex(idx).fillna(False).astype(bool)
        member &= mat("sessions").reindex(idx) >= int(cfg.get("liquid_min_sessions", 30))   # a full 30-session turnover median
    cnt = lambda m: (m.fillna(False).astype(bool) & member).sum(axis=1)
    pct = lambda m: 100 * cnt(m) / (m.notna() & member).sum(axis=1).replace(0, np.nan)
    out = pd.DataFrame(index=idx)
    out["n"] = member.sum(axis=1)
    for n in (20, 50, 200):
        out[f"pct_above{n}"] = pct(mat(f"above{n}").reindex(idx))
    out["adv"], out["dec"] = cnt(chg > 0), cnt(chg < 0)
    w = int(cfg.get("ad_window", 20))
    out["ad_ratio"] = out["adv"].rolling(w).sum() / out["dec"].rolling(w).sum().replace(0, np.nan)
    for k in ("nh52", "nl52", "nh20", "nl20"):
        out[k] = cnt(mat(k).reindex(idx))
    out["up4"], out["dn4"] = cnt(chg >= mv), cnt(chg <= -mv)
    bo = mat("bo").reindex(idx).fillna(False).astype(bool) & member
    lvl = mat("bo_lvl").reindex(idx)
    close = mat("close").reindex(idx)
    out["breakouts"] = bo.sum(axis=1)
    later = close.shift(-hold)
    ok = bo & later.notna()
    out["held"] = (ok & (later > lvl)).sum(axis=1).where(later.notna().any(axis=1))
    out["failed"] = (ok & ~(later > lvl)).sum(axis=1).where(later.notna().any(axis=1))
    fp = 1 + float((cfg.get("breakout") or {}).get("follow_pct", 5)) / 100
    out["follow"] = (ok & (later >= lvl * fp)).sum(axis=1).where(later.notna().any(axis=1))
    stg = mat("stage").reindex(idx).replace(STAGE_OF)
    old = mat("sessions").reindex(idx) >= int(cfg.get("min_sessions_stage", 64))
    known = stg.notna() & old & member
    tot = known.sum(axis=1).replace(0, np.nan)
    for s in (1, 2, 3, 4):
        out[f"stage{s}"] = 100 * ((stg == s) & known).sum(axis=1) / tot
    out["stage_n"] = known.sum(axis=1)
    out = out.iloc[-days:]
    out["ad_line"] = (out["adv"] - out["dec"]).cumsum()
    return out


def index_closes(data: Path, ids: list[str], days: pd.Index) -> dict[str, list]:
    out = {}
    for i in ids:
        df = store.read(data / "indices" / "nse" / i, store.INDEX_COLS)
        if len(df):
            s = df.set_index("date")["close"].astype(float).reindex(days).ffill()
            out[i] = [None if not np.isfinite(x) else round(float(x), 2) for x in s]
    return out


def read(s: pd.DataFrame, idx: dict[str, list], cfg: dict) -> dict:
    """The six verdicts (word + sentence + the rule) for the last day of one universe."""
    last, prev5 = s.iloc[-1], s.iloc[-6] if len(s) > 5 else s.iloc[0]
    v = lambda x: None if x is None or not np.isfinite(x) else float(x)
    out = {}
    a20, a20_5 = v(last["pct_above20"]), v(prev5["pct_above20"])
    if a20 is not None and a20_5 is not None:
        word = ("Strong" if a20 >= 60 else "Building") if a20 > a20_5 + 2 else ("Fading" if a20 >= 50 else "Weak") if a20 < a20_5 - 2 else "Flat"
        out["momentum"] = {"word": word, "text": f"{a20:.0f} % of stocks above their 20-day average, {a20_5:.0f} % five sessions ago",
                           "rule": "% above 20-day average vs 5 sessions ago: rising (+2 pts) = Building (Strong from 60 %), falling = Fading (Weak below 50 %)"}
    net20 = v(last["nh20"] - last["nl20"])
    if a20 is not None and net20 is not None:
        word = "Up" if a20 >= 50 and net20 > 0 else "Down" if a20 < 50 and net20 < 0 else "Mixed"
        out["short_term"] = {"word": word, "text": f"{a20:.0f} % above the 20-day average; {int(last['nh20'])} new 20-day highs vs {int(last['nl20'])} lows",
                             "rule": "Up = >= 50 % above 20-day avg and more 20-day highs than lows; Down = both the other way; else Mixed"}
    a200, up, down = v(last["pct_above200"]), v(last["stage2"]), v(last["stage4"])
    if a200 is not None and up is not None and down is not None:
        word = "Up" if a200 >= 60 and up > down else "Down" if a200 < 40 and down > up else "Mixed"
        out["big_trend"] = {"word": word, "text": f"{a200:.0f} % above the 200-day average; {up:.0f} % of stocks in an uptrend, {down:.0f} % in a downtrend",
                            "rule": "Up = >= 60 % above 200-day avg and more uptrends than downtrends; Down = < 40 % and more downtrends; else Mixed"}
    judged = s[s["held"].notna()].iloc[-5:]                 # the last 5 days whose breakouts can be judged (5 sessions later)
    held, failed = judged["held"].sum(), judged["failed"].sum()
    if held + failed > 0:
        rate = 100 * held / (held + failed)
        word = "Working" if rate >= 50 else "Mixed" if rate >= 30 else "Failing"
        out["breakouts"] = {"word": word, "text": f"{int(held)} of {int(held + failed)} breakouts of the last 5 evaluated days held ({rate:.0f} %)",
                            "rule": "breakout = up 4 %+ on volume above the day before (100,000+ shares); held = 5 sessions later still above that day's close; >= 50 % Working, >= 30 % Mixed, else Failing"}
    sc = idx.get("NIFTY_SMALLCAP_250")
    if sc and len(sc) > 60:
        x = pd.Series(sc, dtype=float)
        dist = (x / x.rolling(50).mean() - 1) * 100
        hist = dist.dropna()
        if len(hist) > 20 and np.isfinite(dist.iloc[-1]):
            pr = float((hist < dist.iloc[-1]).mean() * 100)
            word = "Stretched" if pr >= 90 else "Washed out" if pr <= 10 else "Normal"
            out["overdone"] = {"word": word, "text": f"Smallcap 250 is {dist.iloc[-1]:+.1f} % from its 50-day average (higher than {pr:.0f} % of the past year's days)",
                               "rule": "Smallcap 250 distance from its 50-day average vs the last year: top 10 % Stretched, bottom 10 % Washed out"}
    names = {"NIFTY_50": "Large caps", "NIFTY_MIDCAP_150": "Mid caps", "NIFTY_SMALLCAP_250": "Small caps"}
    rets = {}
    for k in names:
        x = idx.get(k)
        if x and len(x) > 63 and x[-1] and x[-64]:
            rets[k] = (x[-1] / x[-64] - 1) * 100
    if rets:
        k = max(rets, key=rets.get)
        out["leadership"] = {"word": f"{names[k]} lead", "text": "3-month change: " + ", ".join(f"{names[n]} {r:+.1f} %" for n, r in rets.items()),
                             "rule": "best 3-month change of Nifty 50 / Midcap 150 / Smallcap 250"}
    return out


def build(data: Path, hists: dict[str, pd.DataFrame], cfg: dict) -> dict:
    out = {"universes": {}}
    for name, liquid in (("liquid", True), ("all", False)):
        s = series(hists, cfg, liquid)
        out["universes"][name] = s
    days = out["universes"]["all"].index
    idx = index_closes(data, list(cfg.get("indices", [])), days)
    res = {"data_date": days[-1].strftime("%Y-%m-%d"), "days": [d.strftime("%Y-%m-%d") for d in days], "indices": idx,
           "config": cfg, "universes": {}}
    for name, s in out["universes"].items():
        s = s.reindex(days)
        cols = {c: [None if not np.isfinite(x) else round(float(x), 3) for x in s[c].astype(float)] for c in s.columns}
        prev = s.iloc[-2] if len(s) > 1 else s.iloc[-1]
        res["universes"][name] = {"series": cols, "read": read(s, idx, cfg),
                                  "labels": {"participation": _label(float(s["pct_above50"].iloc[-1]), cfg.get("participation_labels", [])),
                                             "ad": _label(float(s["ad_ratio"].iloc[-1]), cfg.get("ad_labels", []))},
                                  "stage_change": {f"stage{k}": _chg(s, k) for k in (1, 2, 3, 4)}}
    return res


def _chg(s: pd.DataFrame, k: int):
    """Change in the NUMBER of stocks in stage k vs the previous day."""
    if len(s) < 2:
        return None
    n = s["stage_n"] * s[f"stage{k}"] / 100
    d = n.iloc[-1] - n.iloc[-2]
    return None if not np.isfinite(d) else int(round(d))
