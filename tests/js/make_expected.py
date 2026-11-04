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

from swingdash import engine  # noqa: E402

FIELDS = ["sma50", "ema21", "rsi14", "macd", "macd_signal", "macd_hist", "mfi14", "atr14", "adr_pct", "bb_mid", "bb_upper",
          "bb_lower", "supertrend", "supertrend_dir", "swing_fast", "swing_slow", "rel_ext", "trend_intensity", "stage",
          "avg_vol20", "rvol", "high_volume", "hvy", "hvq", "lvq", "pocket_pivot", "dry_up"]


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
        f = engine.stock_fields(df, cfg=cfg, stage_cfg=stage_cfg)
        exp = {k: [clean(v) for v in f[k].tolist()] for k in FIELDS}
        (out_dir / f"expected_{p.stem.split('_', 1)[1]}.json").write_text(json.dumps(exp), encoding="utf-8")
        print(p.name, len(f))


if __name__ == "__main__":
    main()
