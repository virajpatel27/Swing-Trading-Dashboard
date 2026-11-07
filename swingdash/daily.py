"""The daily update (GitHub Actions, Mon-Fri 16:40 / 17:20 / 18:30 / 23:50 IST + 08:00 next morning; also by hand). Every step is safe to run again:

  1. stocks       NSE bhavcopy from the last saved day (missed days are caught up), re-reading the last N trading days
     1b. delivery % from NSE's MTO file (out ~16:50 IST, so the 17:20 run brings the day), last N days re-read too
  2. NSE indices  NSE daily all-indices file the same way (it appears ~23:20 IST, so the 23:50 run brings the day's indices),
                  new indices get their history, gaps are filled
  3. corporate actions + adjusted prices (rebuilt for every stock; only changed files are written)
  4. sector/industry + share count for new stocks, entries older than 30 days, or after a split / bonus
     4b. stock master data/meta/stocks.csv (F&O flag, price band, market cap, free float, liquid flag)
     4c. themes (data/meta/themes.csv) + equal-weight sector / industry / theme indices (data/groups/)
     4d-4g fundamentals, FII / DII, index members, company announcements
     4h. second-source check: closes of liquid stocks vs BSE's bhavcopy (swingdash/crosscheck_bse.py)
  5. snapshot (latest.json, sectors.json) - written only when its content changed
The data check and the commit are separate workflow steps. BSE indices are NOT here: BSE refuses GitHub (weekly PC job).
Nothing new (holiday, weekend, second run of the day) -> no file changes -> nothing to commit.
"""
from __future__ import annotations

import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from . import backfill, classification, config, crosscheck_bse, fundamentals, announcements, groups, index_members, market_flows, rebuild, snapshot, stock_master, store, themes


def recheck_start(days: set[date], n: int, fallback: date) -> date:
    """The n-th last known trading day (re-read every run, for corrections); `fallback` when there is no history."""
    known = sorted(days)
    return known[-n] if len(known) >= n else (known[0] if known else fallback)


def is_holiday(http, today: date) -> bool | None:
    """True when NSE lists today as a trading holiday; None when the list is not available."""
    try:
        from .sources import nse
        data = nse.api_json(http, "api/holiday-master?type=trading")
        days = {pd.to_datetime(d["tradingDate"], format="%d-%b-%Y").date() for d in data.get("CM", [])}
        return today in days
    except Exception:  # noqa: BLE001
        return None


def add_index_closes_today(ctx: backfill.Ctx, log=print) -> int:
    """The latest session's NSE index values from the allIndices API (out right after 15:30 IST), for indices that do not
    have that day yet. The official all-indices file (~23:20 IST) replaces them later: every run re-reads the last days."""
    from .sources import nse
    try:
        day = nse.index_closes_today(ctx.http)
    except Exception as exc:  # noqa: BLE001 - optional: the official file brings the day anyway
        log(f"  same-day NSE index values not available ({type(exc).__name__})")
        return 0
    if day is None or day.empty:
        return 0
    lst = pd.read_csv(ctx.data / "meta" / "indices_nse.csv")
    by_key = {backfill.index_key(n): i for n, i in zip(lst["name"], lst["id"])}
    added = 0
    for r in day.itertuples():
        sid = by_key.get(backfill.index_key(r.name))
        if not sid:
            continue
        folder = ctx.data / "indices" / "nse" / sid
        have = store.read(folder, store.INDEX_COLS)
        if len(have) and (have["date"] == r.date).any():
            continue                                        # the day is there already (official file or an earlier run)
        backfill.merge_write(folder, pd.DataFrame([{"date": r.date, "open": r.open, "high": r.high, "low": r.low,
                                                    "close": r.close}]), store.INDEX_COLS, ctx.today)
        added += 1
    log(f"  same-day NSE index values added for {added} indices")
    return added


def new_stocks_without_history(data: Path, min_rows: int = 30, today: date | None = None, grace_days: int = 60) -> list[str]:
    """Stocks whose saved history starts long after their listing (they joined the list later): run a stocks backfill for
    them. Not reported: listed in the last grace_days, inactive, or rarely traded but complete since listing."""
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv", dtype=str)
    listed = {}
    m = data / "meta" / "stocks.csv"
    if m.exists():
        master = pd.read_csv(m, dtype=str).fillna("")
        listed = dict(zip(master["symbol"], master.get("listed", pd.Series("", index=master.index))))
    cut = (pd.Timestamp(today or date.today()) - pd.Timedelta(days=grace_days)).strftime("%Y-%m-%d")
    status = dict(zip(master["symbol"], master.get("status", pd.Series("", index=master.index)))) if m.exists() else {}
    out = []
    for r in uni.itertuples():
        lst = listed.get(r.symbol) or ""
        if lst > cut or status.get(r.symbol) == "inactive":
            continue
        d = store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS)
        if len(d) >= min_rows:
            continue
        expected = max(lst or "2007-01-01", "2007-01-01")
        first = d["date"].min().strftime("%Y-%m-%d") if len(d) else "9999"
        if first > (pd.Timestamp(expected) + pd.Timedelta(days=30)).strftime("%Y-%m-%d"):   # older days are missing
            out.append(r.symbol)
    return out


def run(ctx: backfill.Ctx, log=print) -> dict:
    data = ctx.data
    n = int(ctx.settings["validation"].get("recheck_days", 5))
    before_days = backfill.read_trading_days(ctx)
    last_before = max(before_days) if before_days else None
    res: dict = {"today": str(ctx.today)}
    holiday = is_holiday(ctx.http, ctx.today)
    res["holiday"] = holiday

    # 1. stocks: from the checkpoint, but at least the last n trading days again
    restart = recheck_start(before_days, n, ctx.start)
    s = backfill.backfill_stocks(ctx, until=ctx.today, restart_from=restart)
    res["stocks"] = {k: s[k] for k in ("files", "last_day", "stopped")}
    after_days = backfill.read_trading_days(ctx)
    res["new_trading_days"] = sorted(str(d) for d in after_days if last_before is None or d > last_before)

    # 1b. delivery %: only after the one-time backfill (Actions -> Backfill history -> job delivery) made a checkpoint
    if backfill.checkpoint(ctx, "nse_delivery").exists():
        dl = backfill.backfill_delivery(ctx, until=ctx.today, restart_from=recheck_start(after_days, n, ctx.start))
        res["delivery"] = {k: dl[k] for k in ("files", "last_day", "stopped")}
    else:
        res["delivery"] = "not started: run Backfill history with job delivery once"

    # 2. NSE indices: re-read the daily files of the last n trading days too
    cp_path = backfill.checkpoint(ctx, "nse_indices")
    cp = backfill.load_json(cp_path, {})
    if cp.get("files_last_day"):
        back_to = recheck_start(after_days, n, ctx.start) - timedelta(days=1)
        if back_to.isoformat() < cp["files_last_day"]:
            cp["files_last_day"] = back_to.isoformat()
            backfill.save_json(cp_path, cp)
    i = backfill.backfill_nse_indices(ctx, until=ctx.today)
    res["nse_indices"] = {k: i[k] for k in ("files_last_day", "finished_total", "stopped")}
    res["nse_indices_same_day"] = add_index_closes_today(ctx, log)

    # 3. corporate actions + adjusted prices
    a = rebuild.rebuild_adjusted(ctx.root, ctx.http, ctx.settings, ctx.universe, ctx.today, cache=ctx.root / "cache", log=log)
    res["adjusted"] = {k: a[k] for k in ("adjusted_files_changed", "issues", "actions_source")}

    # 4. classification + share count for new / old entries and stocks whose share count changed (bounded time)
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    c = classification.update(data / "meta" / "classification.csv", uni, ctx.http, ctx.today,
                              int(ctx.settings.get("classification_refresh_days", 30)), time.monotonic() + 8 * 60, log=log,
                              force=stock_master.share_count_changed(data, ctx.today))
    res["classification"] = c

    # 4b. stock master (F&O flag, price band, market cap, liquid flag)
    fno, bands = stock_master.download_lists(ctx.http, log)
    stock_master.download_ipos(data, ctx.http, log, today=str(ctx.today))
    master = stock_master.build(data, fno, bands, ctx.settings.get("liquid"), log=log)
    res["stock_master_written"] = stock_master.write(data, master)
    res["liquid_stocks"] = int(master["liquid"].sum())

    # 4c. themes (config/theme_rules.yaml) and the sector / industry / theme indices
    themes.run(ctx.root, log=log)
    res["groups"] = len(groups.build(ctx.root, config.load("groups", ctx.root), ctx.today, ctx.settings.get("liquid"), log=log))

    # 4d. fundamentals: new results / shareholding files since the last run + the results calendar (only after the
    # one-time backfill, Actions -> Backfill history -> job fundamentals, made its checkpoint)
    if backfill.checkpoint(ctx, "fundamentals").exists():
        try:
            res["fundamentals"] = fundamentals.daily(data, ctx.http, uni, ctx.today, backfill.checkpoint(ctx, "fundamentals_daily"),
                                                     time.monotonic() + 15 * 60, log=log)
        except Exception as exc:  # noqa: BLE001 - never stop the price update for this
            res["fundamentals"] = {"stopped": f"{type(exc).__name__}: {str(exc)[:80]}"}
    else:
        res["fundamentals"] = "not started: run Backfill history with job fundamentals once"

    # 4e. FII / DII cash flows of the latest session (home page); NSE gives only today, so the file grows day by day
    try:
        res["fii_dii"] = market_flows.update(data, ctx.http, log=log)
    except Exception as exc:  # noqa: BLE001 - never stop the price update for this
        res["fii_dii"] = {"stopped": f"{type(exc).__name__}: {str(exc)[:80]}"}

    # 4f. members of the main NSE indices (heatmap page); rewritten only when a list changed
    try:
        res["index_members"] = index_members.update(data, ctx.http, log=log)
    except Exception as exc:  # noqa: BLE001 - never stop the price update for this
        res["index_members"] = {"stopped": f"{type(exc).__name__}: {str(exc)[:80]}"}

    # 4g. company announcements filed with NSE (news page, chart markers, stock panel): the last 3 days again
    try:
        res["announcements"] = announcements.daily(data, ctx.http, ctx.today, log=log)
    except Exception as exc:  # noqa: BLE001 - never stop the price update for this
        res["announcements"] = {"stopped": f"{type(exc).__name__}: {str(exc)[:80]}"}

    # 4h. second-source check: liquid stocks' closes vs BSE's bhavcopy of the newest day (warnings; data check errors
    #     when many differ)
    try:
        newest = pd.to_datetime(pd.read_csv(data / "meta" / "trading_days.csv")["date"]).max().date()
        res["crosscheck_bse"] = crosscheck_bse.daily(data, ctx.http, newest, log=log)
    except Exception as exc:  # noqa: BLE001 - never stop the price update for this
        res["crosscheck_bse"] = {"stopped": f"{type(exc).__name__}: {str(exc)[:80]}"}

    # 5. snapshot
    latest, sectors = snapshot.build(data, log=log)
    res["snapshot_written"] = snapshot.write(data, latest, sectors)
    res["data_date"] = latest["data_date"]
    res["new_stocks_without_history"] = new_stocks_without_history(data, today=ctx.today)
    if res["new_stocks_without_history"]:
        log(f"::warning title=New stocks need history::{', '.join(res['new_stocks_without_history'][:20])} - run Actions -> "
            "Backfill history with job 'stocks' and these symbols")
    problems = []
    if s["stopped"]:
        problems.append(f"stocks: {s['stopped']}")
    if i["stopped"]:
        problems.append(f"NSE indices: {i['stopped']}")
    if isinstance(res["delivery"], dict) and res["delivery"]["stopped"]:
        problems.append(f"delivery: {res['delivery']['stopped']}")
    res["problems"] = problems
    log(f"daily: {res}")
    return res
