"""Rebuild corporate-action files and adjusted prices for every stock from raw prices + NSE corporate actions.
Cheap enough to run every day for all stocks: only files whose content changed are written (store.write), so a stock's
adjusted history is rewritten exactly when a new corporate action appears. Raw data is only read."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from . import adjust, store
from . import corporate_actions as ca
from .sources import nse


def rebuild_adjusted(root: Path, http, settings: dict, universe: dict, today: date, cache: Path | None = None,
                     raw_actions: list[dict] | None = None, log=print) -> dict:
    data = root / "data"
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    symbols = uni["symbol"].tolist()
    ids = dict(zip(uni["symbol"], uni["id"]))
    start = int(str(universe["history_start"])[:4])
    source = "NSE"
    try:
        if raw_actions is None:
            raw_actions = ca.load_raw(http, list(range(start, today.year + 1)), today, cache)
        try:
            history = nse.symbol_history(nse.symbol_changes(http), symbols) if http else {}
        except Exception:  # noqa: BLE001 - renames matter only for old records; carry on without
            history = {}
        per = ca.to_actions(raw_actions, symbols, history)
    except Exception as exc:  # noqa: BLE001 - NSE did not answer: keep the last good corporate actions (the saved files)
        log(f"::warning title=Corporate actions::NSE not available ({type(exc).__name__}); using the saved corporate action files")
        source = "saved files"
        per = {}
        for sym in symbols:
            saved = ca.load(data / "corporate_actions", ids[sym])
            saved = saved[saved["source"] != "manual override"].copy()
            if len(saved):
                saved["factor"] = saved["factor"].where(saved["type"].isin(adjust.EXACT))   # recomputed from prices below
                saved[["method", "status"]] = ""
                per[sym] = saved
    per = ca.add_overrides(per, root / "config" / "corporate_action_overrides.csv")
    adj_div = bool(settings.get("ADJUST_DIVIDENDS", False))
    all_issues, changed, counts = [], 0, {}
    for sym in symbols:
        sid = ids[sym]
        raw = store.read(data / "stocks" / "raw" / sid, store.STOCK_COLS)
        if raw.empty:
            continue
        acts = per.get(sym, pd.DataFrame(columns=ca.CA_COLS))
        adj, acts2, issues = adjust.adjust(raw, acts, f"NSE {sym}", adj_div)
        if store.write(data / "stocks" / "adjusted" / sid, adj, adjust.ADJ_COLS, today):
            changed += 1
        if len(acts2):
            ca.save(data / "corporate_actions", sid, acts2)
            for t, s in zip(acts2["type"], acts2["status"].astype(str)):
                key = f"{t}: {'applied' if s.startswith('applied') else s}"
                counts[key] = counts.get(key, 0) + 1
        all_issues += issues
    pd.DataFrame(all_issues, columns=["instrument", "level", "check", "date", "detail"]).to_csv(
        data / "meta" / "adjust_issues.csv", index=False, lineterminator="\n")
    res = {"stocks": len(symbols), "adjusted_files_changed": changed, "issues": len(all_issues), "actions_source": source,
           "actions": dict(sorted(counts.items()))}
    log(f"adjusted: {res}")
    return res
