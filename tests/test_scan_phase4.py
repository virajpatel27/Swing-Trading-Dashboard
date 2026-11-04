"""Scanner plan Phase 4: indicator engine. Golden tests on 3 real stocks (adjusted NSE data in tests/fixtures/) against
TA-Lib - the standard library whose formulas TradingView's built-in indicators share - plus rule tests."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import engine, registry, screen  # noqa: E402

talib = pytest.importorskip("talib")
FIX = ROOT / "tests" / "fixtures"
STOCKS = ["RELIANCE", "TITAN", "TRENT"]
TAIL = 300                     # compare the last 300 days: every indicator is warmed up after 500 days


def load(sym):
    df = pd.read_csv(FIX / f"golden_{sym}.csv", parse_dates=["date"])
    return df


def close_enough(ours: pd.Series, ref: np.ndarray, rel=1e-6, abs_=1e-6):
    a, b = ours.to_numpy(float)[-TAIL:], np.asarray(ref, float)[-TAIL:]
    ok = ~np.isnan(b)
    assert ok.sum() > TAIL * 0.9
    np.testing.assert_allclose(a[ok], b[ok], rtol=rel, atol=abs_)


@pytest.mark.parametrize("sym", STOCKS)
def test_golden_against_talib(sym):
    df = load(sym)
    o, h, l, c, v = (df[k].astype(float) for k in ("open", "high", "low", "close", "volume"))
    close_enough(engine.sma(c, 50), talib.SMA(c.values, 50))
    close_enough(engine.ema(c, 21), talib.EMA(c.values, 21), rel=1e-6)
    close_enough(engine.wma(c, 20), talib.WMA(c.values, 20))
    close_enough(engine.rsi(c, 14), talib.RSI(c.values, 14), abs_=1e-6)
    m, s, hist = engine.macd(c)
    tm, ts, th = talib.MACD(c.values, 12, 26, 9)
    close_enough(m, tm, abs_=1e-6), close_enough(s, ts, abs_=1e-6), close_enough(hist, th, abs_=1e-6)
    close_enough(engine.atr(h, l, c, 14), talib.ATR(h.values, l.values, c.values, 14), abs_=1e-6)
    close_enough(engine.mfi(h, l, c, v, 14), talib.MFI(h.values, l.values, c.values, v.values, 14), abs_=1e-6)
    mid, up, lo = engine.bollinger(c, 20, 2)
    tu, tm2, tl = talib.BBANDS(c.values, 20, 2, 2, 0)
    close_enough(mid, tm2), close_enough(up, tu), close_enough(lo, tl)
    close_enough(engine.t3(c, 8, 0.65), talib.T3(c.values, 8, 0.65), rel=1e-6)


def supertrend_pine(h, l, c, n=10, mult=3.0):
    """TradingView's ta.supertrend written out literally (independent of engine.supertrend)."""
    tr = np.maximum.reduce([h - l, np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))])
    tr[0] = h[0] - l[0]
    atr = pd.Series(tr).ewm(alpha=1 / n, adjust=False, min_periods=n).mean().to_numpy()
    src = (h + l) / 2
    up, dn = src - mult * atr, src + mult * atr
    st, dirs = np.full(len(c), np.nan), np.full(len(c), np.nan)
    prev_up = prev_dn = prev_st = np.nan
    for i in range(len(c)):
        if np.isnan(atr[i]):
            continue
        u = up[i] if np.isnan(prev_up) or up[i] > prev_up or c[i - 1] < prev_up else prev_up
        d = dn[i] if np.isnan(prev_dn) or dn[i] < prev_dn or c[i - 1] > prev_dn else prev_dn
        if np.isnan(prev_st):
            direction = -1                     # pine: 1 = down, -1 = up; start "up" like engine
        elif prev_st == prev_dn:
            direction = -1 if c[i] > d else 1
        else:
            direction = 1 if c[i] < u else -1
        st[i] = u if direction == -1 else d
        dirs[i] = -direction
        prev_up, prev_dn, prev_st = u, d, st[i]
    return st, dirs


@pytest.mark.parametrize("sym", STOCKS)
def test_supertrend_matches_tradingview_logic(sym):
    df = load(sym)
    h, l, c = (df[k].to_numpy(float) for k in ("high", "low", "close"))
    line, d = engine.supertrend(df["high"], df["low"], df["close"], 10, 3.0)
    ref_line, ref_d = supertrend_pine(h, l, c)
    np.testing.assert_allclose(line.to_numpy()[-TAIL:], ref_line[-TAIL:], rtol=1e-9)
    np.testing.assert_array_equal(d.to_numpy()[-TAIL:], ref_d[-TAIL:])


def test_stage_rules():
    cfg = {"long_ma": 200, "fast_ma": 50, "min_sessions": 64, "slope_days": 20, "flat": 0.01, "early_days": 30}
    up = pd.Series(np.linspace(100, 300, 400))
    assert engine.stage(up, cfg).iloc[-1] == "2"
    down = pd.Series(np.linspace(300, 100, 400))
    assert engine.stage(down, cfg).iloc[-1] == "4"
    topping = pd.concat([pd.Series(np.linspace(100, 300, 380)), pd.Series(np.linspace(300, 280, 20))], ignore_index=True)
    assert engine.stage(topping, cfg).iloc[-1] == "3"                      # above SMA200, below SMA50
    recover = pd.concat([pd.Series(np.linspace(300, 100, 300)), pd.Series(np.linspace(100, 330, 60))], ignore_index=True)
    st = engine.stage(recover, cfg)
    assert "2A" in set(st.iloc[-40:]) and st.iloc[:63].isna().all()       # early uptrend after a downtrend; no stage < 64
    improving = pd.concat([pd.Series(np.linspace(300, 100, 300)), pd.Series(np.linspace(100, 130, 30))], ignore_index=True)
    assert engine.stage(improving, cfg).iloc[-1] == "4A"


def test_relative_extension_and_days_since_high():
    c = pd.Series(np.r_[np.full(60, 100.0), np.linspace(100, 150, 40), np.linspace(150, 100, 40)])
    re_ = engine.relative_extension(c, 50, 250)
    assert re_.max() == pytest.approx(100) and re_.min() >= -100
    s = pd.Series([1, 5, 3, 5, 2, 1.0])
    assert engine.days_since_max(s, 3).tolist() == [0, 0, 1, 0, 1, 2]
    assert engine.days_since_max(s, 10).tolist() == [0, 0, 1, 0, 1, 2]


def test_volume_flags_and_returns():
    n = 300
    d = pd.bdate_range("2025-01-01", periods=n)
    c = pd.Series(100 + np.sin(np.arange(n) / 5) * 5)
    v = pd.Series(1000.0, index=range(n))
    v.iloc[-1] = 5000
    adj = pd.DataFrame({"date": d, "open": c, "high": c + 1, "low": c - 1, "close": c, "volume": v})
    adj.loc[n - 1, "close"] = adj.loc[n - 2, "close"] + 3                 # an up day on 5x volume
    f = engine.stock_fields(adj, cfg=yaml.safe_load(open(ROOT / "config" / "indicators.yaml")))
    last = f.iloc[-1]
    assert last["rvol"] == pytest.approx(5.0) and bool(last["hvy"]) and bool(last["hve"]) and bool(last["pocket_pivot"])
    assert last["ret_1w"] == pytest.approx((adj["close"].iloc[-1] / adj["close"].iloc[-6] - 1) * 100)
    first_2026 = f[f["date"].dt.year == 2026].index[0]
    assert f.loc[first_2026, "ret_ytd"] == pytest.approx((f.loc[first_2026, "close"] / f.loc[first_2026 - 1, "close"] - 1) * 100)


def test_rs_score_young_stock_and_rank():
    c = pd.Series(np.linspace(100, 200, 130))
    s = engine.rs_score(c, {63: 0.4, 126: 0.2, 189: 0.2, 252: 0.2}, 63)
    assert s.iloc[:63].isna().all() and pd.notna(s.iloc[63])               # from the 64th session; 3M and 6M used later
    exp = (0.4 * (c.iloc[-1] / c.iloc[-64] - 1) + 0.2 * (c.iloc[-1] / c.iloc[-127] - 1)) / 0.6
    assert s.iloc[-1] == pytest.approx(exp)
    vals = pd.DataFrame([[1, 2, 3, np.nan]])
    assert screen.rank99(vals).iloc[0, :3].tolist() == [33, 66, 99]


def test_registry_covers_the_screen():
    cfg = yaml.safe_load(open(ROOT / "config" / "indicators.yaml"))
    n = 400
    d = pd.bdate_range("2024-01-01", periods=n)
    c = pd.Series(np.linspace(50, 80, n))
    adj = pd.DataFrame({"date": d, "open": c, "high": c, "low": c, "close": c, "volume": 100.0})
    raw = adj.assign(value=1e8)
    bench = {b: pd.Series(np.linspace(1000, 1100, n), index=d) for b in cfg["rs_lines"]}
    f = engine.stock_fields(adj, raw, None, bench, cfg, yaml.safe_load(open(ROOT / "config" / "stage.yaml")))
    cols = ["id", *screen.MASTER_COLS, *[c for c in f.columns if c not in screen.DROP], "rs_score", "liquid_day",
            *screen.CROSS_COLS, "stale"]
    assert registry.check(registry.load(), {"screen": list(dict.fromkeys(cols))}) == []


def test_formulas_doc_is_up_to_date():
    sys.path.insert(0, str(ROOT / "scripts"))
    import make_formulas_doc
    assert (ROOT / "docs" / "formulas.md").read_text(encoding="utf-8") == make_formulas_doc.render(registry.load()), \
        "run scripts/make_formulas_doc.py"


def test_site_table_columns_are_registered_fields():
    """Every column of the website's stock table (site/logic.js COLUMN_GROUPS) is a field of screen.json in the registry."""
    import re
    js = (ROOT / "site" / "logic.js").read_text(encoding="utf-8")
    block = js[js.index("const COLUMN_GROUPS"):js.index("const COLUMNS = {}")]
    ids = re.findall(r'\["([a-z0-9_]+)", "[^"]+", "[a-z0-9]+"\]', block)
    assert len(ids) > 60
    reg = {f["id"]: f for f in registry.load()["fields"]}
    for i in ids:
        assert i in reg, f"table column {i} is not in config/fields.yaml"
        assert "screen" in (reg[i].get("file") or []) or i == "days_listed", f"{i} is not a screen.json field"
