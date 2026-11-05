"""Expected values for tests/js/ind.test.js: the Python engine (swingdash/engine.py) on the golden fixtures
(tests/fixtures/golden_*.csv). Run again after changing a formula:

    python tests/js/make_expected.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from swingdash import engine, registry, scanners  # noqa: E402

FIELDS = ["sma50", "ema21", "rsi14", "macd", "macd_signal", "macd_hist", "mfi14", "atr14", "adr_pct", "bb_mid", "bb_upper",
          "bb_lower", "supertrend", "supertrend_dir", "swing_fast", "swing_slow", "rel_ext", "trend_intensity", "stage",
          "avg_vol20", "rvol", "high_volume", "hvy", "hvq", "lvq", "pocket_pivot", "dry_up", "pivot", "pivot_age",
          "vcp_contractions", "vcp_last_pct"]


def clean(v):
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return v if isinstance(v, str) else float(v)


def main():
    cfg = yaml.safe_load(open(ROOT / "config" / "indicators.yaml"))
    stage_cfg = yaml.safe_load(open(ROOT / "config" / "stage.yaml"))
    out_dir = ROOT / "tests" / "js" / "fixtures"
    out_dir.mkdir(exist_ok=True)
    for p in sorted((ROOT / "tests" / "fixtures").glob("golden_*.csv")):
        df = pd.read_csv(p, parse_dates=["date"])
        f = engine.stock_fields(df, cfg=cfg, stage_cfg=stage_cfg,
                                pattern_cfg=yaml.safe_load(open(ROOT / "config" / "patterns.yaml")))
        exp = {k: [clean(v) for v in f[k].tolist()] for k in FIELDS}
        (out_dir / f"expected_{p.stem.split('_', 1)[1]}.json").write_text(json.dumps(exp), encoding="utf-8")
        print(p.name, len(f))


def scan_fixture():
    """Random rows over every field the scanners use (with gaps), and what the Python evaluator finds: the JS one must agree."""
    rng = np.random.default_rng(7)
    spec = scanners.load()
    fields = sorted({f for sc in spec["scanners"] for f in scanners.fields_in(sc["rule"])})
    kinds = {f["id"]: f["type"] for f in registry.load()["fields"]}
    rows = []
    for i in range(400):
        r = {"id": f"S{i}", "stale": bool(rng.random() < 0.05), "liquid_day": bool(rng.random() < 0.6)}
        for f in fields:
            t = kinds[f]
            if rng.random() < 0.05:
                r[f] = None
            elif t == "boolean":
                r[f] = bool(rng.random() < 0.3)
            elif f == "stage":
                r[f] = str(rng.choice(["1", "2", "2A", "3", "4", "4A"]))
            elif f.startswith("rs_rating"):
                r[f] = int(rng.integers(1, 100))
            elif f in ("close", "sma50", "sma150", "sma200", "high_50d_prev"):
                r[f] = float(round(100 * rng.uniform(0.8, 1.2), 2))
            else:
                r[f] = float(round(rng.normal(0, 1) * {"days_listed": 400, "rvol": 1, "close_pos": 40}.get(f, 30) + {"close_pos": 50, "rvol": 1.5, "days_listed": 600}.get(f, 0), 3))
        rows.append(r)
    df = pd.DataFrame(rows)
    labels = {f["id"]: f["label"] for f in registry.load()["fields"]}
    exp = {sc["id"]: {"ids": df.loc[scanners.evaluate(df, sc), "id"].tolist(), "text": scanners.describe(sc["rule"], labels)}
           for sc in spec["scanners"]}
    out = ROOT / "tests" / "js" / "fixtures"
    (out / "scan_rows.json").write_text(json.dumps(rows), encoding="utf-8")
    (out / "scan_expected.json").write_text(json.dumps({"labels": labels, "scanners": spec["scanners"], "expected": exp}), encoding="utf-8")
    print("scan fixture", len(rows), {k: len(v["ids"]) for k, v in exp.items()})


if __name__ == "__main__":
    main()
    scan_fixture()
