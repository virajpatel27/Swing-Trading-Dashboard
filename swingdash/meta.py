"""data/meta/instruments.csv (one line per instrument: where it is, first/last date, rows, source) and the data checks over
everything stored. A check 'error' means: do not commit this data."""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from . import store, validate
from .adjust import ADJ_COLS

GROUPS = [  # (kind, exchange, folder under data/, columns, list file in data/meta, id column, name column, source)
    ("stock", "NSE", "stocks/raw", store.STOCK_COLS, "universe_stocks.csv", "id", "symbol", "NSE bhavcopy"),
    ("stock-adjusted", "NSE", "stocks/adjusted", ADJ_COLS, "universe_stocks.csv", "id", "symbol", "NSE bhavcopy + NSE corporate actions"),
    ("delivery", "NSE", "stocks/delivery", store.DELIVERY_COLS, "universe_stocks.csv", "id", "symbol", "NSE MTO delivery file"),
    ("index", "NSE", "indices/nse", store.INDEX_COLS, "indices_nse.csv", "id", "name", "NSE historicalOR"),
    ("index", "BSE", "indices/bse", store.INDEX_COLS, "indices_bse.csv", "id", "name", "BSE ProduceCSVForDate"),
]
INSTRUMENT_COLS = ["kind", "exchange", "id", "name", "category", "path", "first_date", "last_date", "rows", "source"]


def planned_drops(data: Path, days: int = 2) -> dict[str, int]:
    """{stock id: rows removed on purpose} from data/meta/dropped_rows.csv, removals of the last `days` days only."""
    path = data / "meta" / "dropped_rows.csv"
    if not path.exists():
        return {}
    df = pd.read_csv(path, dtype=str)
    recent = df[pd.to_datetime(df["removed_on"]) >= pd.Timestamp(date.today()) - pd.Timedelta(days=days)]
    return recent.groupby("id").size().to_dict()


def scan(data: Path, trading_days: pd.DatetimeIndex | None, jump_pct: float, old: pd.DataFrame | None,
         max_drop_pct: float) -> tuple[pd.DataFrame, list[dict]]:
    rows, issues = [], []
    old_rows = {} if old is None or old.empty else dict(zip(old["path"], old["rows"]))
    planned = planned_drops(data)          # rows removed on purpose in the last 2 days (data/meta/dropped_rows.csv)
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
        has_adjusted = (data / "stocks" / "adjusted").exists()
        # sort by the plain name: Windows sorts paths case-insensitively, Linux does not ("J_KBANK" vs "JAINREC")
        for folder in sorted((p for p in base.iterdir() if p.is_dir()), key=lambda p: p.name):
            rel = f"{sub}/{folder.name}"
            df = store.read(folder, cols)
            label = f"{exch} {names.get(folder.name, folder.name)}" + {"stock-adjusted": " (adjusted)",
                                                                      "delivery": " (delivery)"}.get(kind, "")
            # big moves are judged on the ADJUSTED series (raw prices jump at every split/bonus by design)
            jump = float("inf") if kind == "stock" and has_adjusted else jump_pct
            if kind == "delivery":
                issues += validate.check_delivery(label, df)
            else:
                issues += validate.check_series(label, df, trading_days if exch == "NSE" and kind != "stock-adjusted" else None,
                                                jump)
            before = int(old_rows.get(rel, 0))
            if kind in ("stock", "stock-adjusted"):
                before = max(0, before - planned.get(folder.name, 0))
            issues += validate.check_row_drop(label, before, len(df), max_drop_pct)
            if kind == "stock-adjusted":
                issues += check_adjusted_vs_raw(label, df, store.read(data / "stocks" / "raw" / folder.name, store.STOCK_COLS))
            rows.append({"kind": kind, "exchange": exch, "id": folder.name, "name": names.get(folder.name, folder.name),
                         "category": cats.get(folder.name, ""), "path": rel,
                         "first_date": df["date"].min().strftime("%Y-%m-%d") if len(df) else "",
                         "last_date": df["date"].max().strftime("%Y-%m-%d") if len(df) else "",
                         "rows": len(df), "source": source})
    # an instrument that was there before and is now gone
    now = {r["path"] for r in rows}
    for path in old_rows:
        sid = path.split("/")[-1]
        whole_stock_dropped = (path.startswith("stocks/") and f"stocks/raw/{sid}" not in now
                               and 0 < int(old_rows.get(f"stocks/raw/{sid}", 0)) <= planned.get(sid, 0))   # all its rows removed on purpose
        if path not in now and not whole_stock_dropped:
            issues.append(validate.issue(path, "error", "instrument disappeared", "folder is gone"))
    issues += check_snapshot(data, rows)
    adj_issues = data / "meta" / "adjust_issues.csv"
    if adj_issues.exists() and adj_issues.stat().st_size:
        issues += pd.read_csv(adj_issues, dtype=str).fillna("").to_dict("records")
    return pd.DataFrame(rows, columns=INSTRUMENT_COLS), issues


def check_snapshot(data: Path, rows: list[dict]) -> list[dict]:
    """latest.json must cover (nearly) every stock and index and carry the newest data date."""
    p = data / "snapshot" / "latest.json"
    if not p.exists():
        return []
    def no_nan(token):
        raise ValueError(f"{token} is not allowed in JSON")       # browsers cannot read NaN / Infinity
    try:
        snap = json.loads(p.read_text(encoding="utf-8"), parse_constant=no_nan)
        sec = data / "snapshot" / "sectors.json"
        if sec.exists():
            json.loads(sec.read_text(encoding="utf-8"), parse_constant=no_nan)
    except ValueError as exc:
        return [validate.issue("snapshot", "error", "snapshot unreadable", f"not valid JSON for browsers: {str(exc)[:80]}")]
    expected = sum(1 for r in rows if r["kind"] in ("stock", "index") and r["rows"] >= 2)
    newest = max((r["last_date"] for r in rows if r["last_date"]), default="")
    out = []
    if len(snap.get("rows", [])) < 0.95 * expected:
        out.append(validate.issue("snapshot", "error", "snapshot incomplete", f"{len(snap.get('rows', []))} rows for {expected} instruments"))
    if snap.get("data_date") != newest:
        out.append(validate.issue("snapshot", "warn", "snapshot date", f"snapshot {snap.get('data_date')}, newest data {newest}"))
    return out


def check_adjusted_vs_raw(label: str, adj: pd.DataFrame, raw: pd.DataFrame) -> list[dict]:
    """Adjusted must have the same days as raw, end on the same close, and differ from raw only by a factor in (0, 1e3]."""
    if raw.empty:
        return [validate.issue(label, "error", "adjusted without raw", "no raw prices for this stock")]
    if len(adj) != len(raw) or not adj["date"].reset_index(drop=True).equals(raw["date"].reset_index(drop=True)):
        return [validate.issue(label, "error", "adjusted/raw days differ", f"adjusted {len(adj)} rows, raw {len(raw)} rows")]
    out = []
    if abs(adj["close"].iat[-1] - raw["close"].iat[-1]) > 1e-6 * max(1.0, raw["close"].iat[-1]):
        out.append(validate.issue(label, "error", "last adjusted close != last raw close",
                                  f"{adj['close'].iat[-1]} vs {raw['close'].iat[-1]}", adj["date"].iat[-1]))
    ratio = (adj["close"] / raw["close"]).where(raw["close"] > 0)
    if ((ratio <= 0) | (ratio > 1e3)).any():
        out.append(validate.issue(label, "error", "adjustment factor out of range", f"min {ratio.min()}, max {ratio.max()}"))
    return out


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
    path = meta / "health.json"
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    same = {k: v for k, v in old.items() if k != "checked_at"} == {k: v for k, v in health.items() if k != "checked_at"}
    if not same:                    # only the time changed -> keep the file (a holiday run then has nothing to commit)
        path.write_text(json.dumps(health, indent=1) + "\n", encoding="utf-8", newline="\n")
    return health
