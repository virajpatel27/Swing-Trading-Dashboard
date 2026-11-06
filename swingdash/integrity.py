"""Monthly integrity check (deeper than the daily data check). Changes nothing; writes a report.

  1. the daily data check over everything (rows, duplicates, date gaps, bad candles, adjusted vs raw, snapshot)
  2. corporate-action consistency: adjusted prices rebuilt from raw prices + the saved corporate-action files must equal the
     stored adjusted prices
  3. spot check against NSE: a few random past trading days are downloaded again and compared with the stored raw closes
  4. freshness: the newest data is not older than a week
"""
from __future__ import annotations

import random
from datetime import date
from pathlib import Path

import pandas as pd

from . import adjust, meta, store
from . import corporate_actions as ca
from .sources import nse


def ca_consistency(data: Path, tol: float = 1e-4) -> list[dict]:
    """Stocks whose stored adjusted closes differ from a fresh rebuild out of raw + saved actions. tol = 0.01 %: current.csv
    keeps 4 decimals (a Rs 20 stock can differ by 0.0002 % from rounding), while a wrong factor is off by >= 1 %."""
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    out = []
    for r in uni.itertuples():
        raw = store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS)
        stored = store.read(data / "stocks" / "adjusted" / r.id, adjust.ADJ_COLS)
        if raw.empty:
            continue
        acts = ca.load(data / "corporate_actions", r.id)
        if len(acts):
            acts = acts.copy()
            acts["factor"] = acts["factor"].where(acts["type"].isin(adjust.EXACT) | (acts["source"] == "manual override"))
            acts[["method", "status"]] = ""
        fresh, _, _ = adjust.adjust(raw, acts, r.symbol)
        if len(fresh) != len(stored):
            out.append({"symbol": r.symbol, "problem": f"rows: stored {len(stored)}, rebuilt {len(fresh)}"})
            continue
        diff = ((fresh["close"].values - stored["close"].values) / stored["close"].values)
        worst = float(abs(diff).max()) if len(diff) else 0.0
        if worst > tol:
            out.append({"symbol": r.symbol, "problem": f"adjusted close differs from rebuild by up to {100 * worst:.4f} %"})
    return out


def spot_check(data: Path, http, days: int = 5, seed: int | None = None, tol: float = 0.005) -> tuple[list[str], list[dict]]:
    """(days checked, mismatches) - stored raw closes vs NSE's bhavcopy for random past trading days (same symbol only)."""
    tdays = pd.to_datetime(pd.read_csv(data / "meta" / "trading_days.csv")["date"]).dt.date.tolist()
    rnd = random.Random(seed)
    picked = sorted(rnd.sample(tdays[:-10], min(days, max(0, len(tdays) - 10))))
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    ids = dict(zip(uni["symbol"], uni["id"]))
    stored = {s: store.read(data / "stocks" / "raw" / i, ["date", "close", "series"]).set_index("date") for s, i in ids.items()}
    checked, bad = [], []
    for d in picked:
        day = nse.fetch_bhav(http, d)
        if day is None:
            continue
        checked.append(d.isoformat())
        ts = pd.Timestamp(d)
        for s, df in stored.items():
            if ts not in df.index:
                continue
            row = day[(day["symbol"] == s) & (day["series"] == df.loc[ts, "series"])]
            if len(row) and abs(float(row["close"].iat[0]) / float(df.loc[ts, "close"]) - 1) > tol:
                bad.append({"date": d.isoformat(), "symbol": s, "stored": float(df.loc[ts, "close"]), "nse": float(row["close"].iat[0])})
    return checked, bad


def run(data: Path, http, today: date, spot_days: int = 5, seed: int | None = None) -> dict:
    v = __import__("swingdash.config", fromlist=["load"]).load("settings", data.parent)["validation"]
    days = pd.DatetimeIndex(pd.to_datetime(pd.read_csv(data / "meta" / "trading_days.csv")["date"]))
    old = pd.read_csv(data / "meta" / "instruments.csv") if (data / "meta" / "instruments.csv").exists() else None
    inst, issues = meta.scan(data, days, float(v["jump_pct"]), old, float(v["max_row_drop_pct"]))
    from . import fundamentals
    issues += fundamentals.check_docs(data)
    cov_path = data / "meta" / "fundamentals_coverage.json"
    if cov_path.exists():
        c = __import__("json").loads(cov_path.read_text(encoding="utf-8"))
        cov = (f"{c['all']['with_doc']} of {c['all']['stocks']} stocks have a document; latest quarter older than 150 days: "
               f"{c.get('latest_quarter_older_than_150_days', '?')}")
    else:
        cov = "not built yet"
    errors = [i for i in issues if i["level"] == "error"]
    res = {"instruments": len(inst), "rows": int(inst["rows"].sum()), "check_errors": errors,
           "check_warnings": sum(1 for i in issues if i["level"] == "warn"), "ca_problems": ca_consistency(data),
           "fundamentals": cov}
    try:
        res["spot_days"], res["spot_mismatches"] = spot_check(data, http, spot_days, seed)
    except Exception as exc:  # noqa: BLE001 - NSE not reachable: a warning, not a failure
        res["spot_days"], res["spot_mismatches"], res["spot_error"] = [], [], f"{type(exc).__name__}: {str(exc)[:120]}"
    newest = pd.to_datetime(inst["last_date"]).max().date() if len(inst) else None
    res["newest"] = str(newest)
    res["stale"] = newest is None or (today - newest).days > 7
    res["ok"] = not (errors or res["ca_problems"] or res["spot_mismatches"] or res["stale"])
    return res


def report(res: dict) -> str:
    mark = lambda ok: "OK" if ok else "PROBLEM"
    lines = [f"# Integrity check - {mark(res['ok'])}", "",
             f"- Instruments {res['instruments']}, rows {res['rows']:,}, newest data {res['newest']} ({mark(not res['stale'])})",
             f"- Data check: {len(res['check_errors'])} errors, {res['check_warnings']} warnings ({mark(not res['check_errors'])})",
             f"- Fundamentals: {res.get('fundamentals', '-')}",
             f"- Corporate-action consistency: {len(res['ca_problems'])} stocks differ ({mark(not res['ca_problems'])})",
             f"- NSE spot check: days {', '.join(res['spot_days']) or 'none'}; {len(res['spot_mismatches'])} mismatches "
             f"({mark(not res['spot_mismatches'])}){' - ' + res['spot_error'] if res.get('spot_error') else ''}"]
    for e in res["check_errors"][:20]:
        lines.append(f"  - error: {e['instrument']} {e['check']} {e['date']} {e['detail']}")
    for p in res["ca_problems"][:20]:
        lines.append(f"  - corporate actions: {p['symbol']}: {p['problem']}")
    for m in res["spot_mismatches"][:20]:
        lines.append(f"  - NSE: {m['date']} {m['symbol']} stored {m['stored']} vs NSE {m['nse']}")
    return "\n".join(lines) + "\n"
