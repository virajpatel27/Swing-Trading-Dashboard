"""data/meta/instruments.csv (one line per instrument: where it is, first/last date, rows, source) and the data checks over
everything stored. A check 'error' means: do not commit this data."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pandas as pd

from . import store, validate

GROUPS = [  # (kind, exchange, folder under data/, columns, list file in data/meta, id column, name column, source)
    ("stock", "NSE", "stocks/raw", store.STOCK_COLS, "universe_stocks.csv", "id", "symbol", "NSE bhavcopy"),
    ("index", "NSE", "indices/nse", store.INDEX_COLS, "indices_nse.csv", "id", "name", "NSE historicalOR"),
    ("index", "BSE", "indices/bse", store.INDEX_COLS, "indices_bse.csv", "id", "name", "BSE ProduceCSVForDate"),
]
INSTRUMENT_COLS = ["kind", "exchange", "id", "name", "category", "path", "first_date", "last_date", "rows", "source"]


def scan(data: Path, trading_days: pd.DatetimeIndex | None, jump_pct: float, old: pd.DataFrame | None,
         max_drop_pct: float) -> tuple[pd.DataFrame, list[dict]]:
    rows, issues = [], []
    old_rows = {} if old is None or old.empty else dict(zip(old["path"], old["rows"]))
    for kind, exch, sub, cols, list_file, id_col, name_col, source in GROUPS:
        base = data / sub
        lst = data / "meta" / list_file
        names, cats = {}, {}
        if lst.exists():
            ldf = pd.read_csv(lst)
            names = dict(zip(ldf[id_col], ldf[name_col]))
            cats = dict(zip(ldf[id_col], ldf["category"] if "category" in ldf.columns else ldf.get("industry", [""] * len(ldf))))
        if not base.exists():
            continue
        for folder in sorted(p for p in base.iterdir() if p.is_dir()):
            rel = f"{sub}/{folder.name}"
            df = store.read(folder, cols)
            label = f"{exch} {names.get(folder.name, folder.name)}"
            issues += validate.check_series(label, df, trading_days if exch == "NSE" else None, jump_pct)
            issues += validate.check_row_drop(label, int(old_rows.get(rel, 0)), len(df), max_drop_pct)
            rows.append({"kind": kind, "exchange": exch, "id": folder.name, "name": names.get(folder.name, folder.name),
                         "category": cats.get(folder.name, ""), "path": rel,
                         "first_date": df["date"].min().strftime("%Y-%m-%d") if len(df) else "",
                         "last_date": df["date"].max().strftime("%Y-%m-%d") if len(df) else "",
                         "rows": len(df), "source": source})
    # an instrument that was there before and is now gone
    now = {r["path"] for r in rows}
    for path in old_rows:
        if path not in now:
            issues.append(validate.issue(path, "error", "instrument disappeared", "folder is gone"))
    return pd.DataFrame(rows, columns=INSTRUMENT_COLS), issues


def write_reports(data: Path, inst: pd.DataFrame, issues: list[dict]) -> dict:
    meta = data / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    inst.to_csv(meta / "instruments.csv", index=False, lineterminator="\n")
    pd.DataFrame(issues, columns=["instrument", "level", "check", "date", "detail"]).to_csv(
        meta / "data_issues.csv", index=False, lineterminator="\n")
    health = {
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "instruments": int(len(inst)),
        "by_group": {f"{k} {e}": int(n) for (k, e), n in inst.groupby(["kind", "exchange"]).size().items()} if len(inst) else {},
        "rows": int(inst["rows"].sum()) if len(inst) else 0,
        "newest_date": inst["last_date"].max() if len(inst) else "",
        "errors": sum(1 for i in issues if i["level"] == "error"),
        "warnings": sum(1 for i in issues if i["level"] == "warn"),
    }
    (meta / "health.json").write_text(json.dumps(health, indent=1) + "\n", encoding="utf-8", newline="\n")
    return health
