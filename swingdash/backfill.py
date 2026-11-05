"""History backfill 2007 -> today. Resumable: every job keeps a checkpoint in data/meta/checkpoints/ and continues
from it, so a stopped run (time limit, network trouble) never starts again from zero.

Jobs:
  stocks       NSE daily bhavcopy, one file per trading day = all stocks at once -> data/stocks/raw/<SYMBOL>/
  nse-indices  NSE historicalOR API, walking back 90 days at a time until the index did not exist -> data/indices/nse/<ID>/
  bse-indices  BSE CSV, whole history in one call per index (PC only: BSE refuses GitHub) -> data/indices/bse/<CODE>/
  delivery     NSE MTO delivery file, one per trading day = all stocks at once -> data/stocks/delivery/<SYMBOL>/
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from . import store
from .config import as_date
from .sources import bse, nse
from .sources.nse import SourceError


@dataclass
class Ctx:
    root: Path
    http: object
    settings: dict
    universe: dict
    today: date
    deadline: float = float("inf")            # time.monotonic() value after which a job stops cleanly
    log: callable = print
    clock: callable = time.monotonic
    stats: dict = field(default_factory=dict)

    @property
    def data(self) -> Path:
        return self.root / "data"

    @property
    def start(self) -> date:
        return as_date(self.universe["history_start"])

    def out_of_time(self) -> bool:
        return self.clock() > self.deadline


# ---------------------------------------------------------------- small helpers
def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8", newline="\n")


def checkpoint(ctx: Ctx, job: str) -> Path:
    return ctx.data / "meta" / "checkpoints" / f"{job}.json"


def trading_days_path(ctx: Ctx) -> Path:
    return ctx.data / "meta" / "trading_days.csv"


def read_trading_days(ctx: Ctx) -> set[date]:
    p = trading_days_path(ctx)
    return set(pd.to_datetime(pd.read_csv(p)["date"]).dt.date) if p.exists() else set()


def write_trading_days(ctx: Ctx, days: set[date]) -> None:
    p = trading_days_path(ctx)
    p.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"date": sorted(d.isoformat() for d in days)}).to_csv(p, index=False, lineterminator="\n")


def merge_write(folder: Path, new: pd.DataFrame, cols: list[str], today: date) -> int:
    """Add new rows to an instrument (a date already stored is replaced by the new row). Returns the row count."""
    old = store.read(folder, cols)
    both = pd.concat([old, new], ignore_index=True) if len(old) else new
    store.write(folder, both, cols, today)
    return len(both.drop_duplicates("date"))


def weekdays(a: date, b: date):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


# ---------------------------------------------------------------- stocks (NSE bhavcopy)
def stock_universe(ctx: Ctx) -> pd.DataFrame:
    """The stock list. source all_nse_eq = every NSE main-board equity (EQUITY_L.csv); nifty500 = the Nifty 500 only.
    Column n500 marks Nifty 500 members either way. A download failure or a suspiciously short list keeps the saved list."""
    cfg = ctx.universe["stocks"]
    path = ctx.data / "meta" / "universe_stocks.csv"
    saved = pd.read_csv(path) if path.exists() else None
    try:
        n5 = nse.nifty500(ctx.http, cfg["list_url"])
        if cfg.get("source", "nifty500") == "all_nse_eq":
            uni = nse.equity_list(ctx.http, cfg["all_list_url"])
            uni = uni.merge(n5[["symbol", "industry"]], on="symbol", how="left")
            uni["industry"] = uni["industry"].fillna("")
            # Nifty 500 members that EQUITY_L.csv does not carry (REITs such as EMBASSY are listed separately) stay in
            extra = n5[~n5["symbol"].isin(uni["symbol"])].assign(listed="")
            uni = pd.concat([uni, extra[["symbol", "name", "isin", "series", "listed", "industry"]]], ignore_index=True)
        else:
            uni = n5.assign(listed="")
        uni["n500"] = uni["symbol"].isin(n5["symbol"])
    except Exception as exc:  # noqa: BLE001
        if saved is None:
            raise
        ctx.log(f"  stock list not available ({type(exc).__name__}); using the saved list")
        return saved
    skip = tuple(cfg.get("exclude_prefixes") or ())
    if skip:
        uni = uni[~uni["symbol"].str.startswith(skip)].reset_index(drop=True)
    uni["id"] = uni["symbol"].map(store.folder_name)
    if saved is not None and len(uni) < 0.9 * len(saved):
        ctx.log(f"  ::warning title=Stock list::NSE list has {len(uni)} stocks, saved list {len(saved)} - keeping the saved list")
        return saved
    path.parent.mkdir(parents=True, exist_ok=True)
    uni.to_csv(path, index=False, lineterminator="\n")
    return uni


def carry_over_renames(ctx: Ctx, changes: pd.DataFrame, uni: pd.DataFrame) -> list[str]:
    """A stock renamed after its history was stored (e.g. ABCOTS -> ABCIND on 02-Nov-2026) has its older days in the old
    symbol's folder. Copy the days before the change that the new folder lacks into it (the old folder is left as it is).
    Returns the new symbols that got days."""
    ids = dict(zip(uni["symbol"], uni["id"]))
    raw = ctx.data / "stocks" / "raw"
    done = []
    for r in changes.sort_values("date").itertuples():
        if r.new not in ids or r.old in ids:
            continue
        old_dir = raw / store.folder_name(r.old)
        if not old_dir.is_dir():
            continue
        old = store.read(old_dir, store.STOCK_COLS)
        old = old[old["date"] < r.date]
        new_dir = raw / ids[r.new]
        have = store.read(new_dir, store.STOCK_COLS)
        missing = old[~old["date"].isin(have["date"])] if len(have) else old
        if missing.empty:
            continue
        merge_write(new_dir, missing, store.STOCK_COLS, ctx.today)
        ctx.log(f"  rename {r.old} -> {r.new} ({r.date:%Y-%m-%d}): {len(missing)} older days carried over")
        done.append(r.new)
    return done


def backfill_stocks(ctx: Ctx, until: date | None = None, only: list[str] | None = None, start: date | None = None,
                    restart_from: date | None = None) -> dict:
    """only + start = a small extra run for a few stocks (e.g. ones added to the list later), with its own checkpoint.
    restart_from = read again from this day even if the checkpoint is later (the daily job re-checks the last days)."""
    until = until or ctx.today
    uni = stock_universe(ctx)
    if only:
        uni = uni[uni["symbol"].isin(only)]
    symbols = uni["symbol"].tolist()
    ids = dict(zip(uni["symbol"], uni["id"]))
    changes = nse.symbol_changes(ctx.http)
    history = nse.symbol_history(changes, symbols)
    carry_over_renames(ctx, changes, uni)
    prio = ctx.universe["stocks"]["series_priority"]
    cp_path = checkpoint(ctx, "nse_stocks_extra" if only else "nse_stocks")
    cp = load_json(cp_path, {})
    if only and cp.get("symbols") != sorted(symbols):
        cp = {}                                         # a different extra list starts fresh
    first = as_date(cp["last_day"]) + timedelta(days=1) if cp.get("last_day") else (start or ctx.start)
    if restart_from and restart_from < first:
        first = restart_from
    days_known = read_trading_days(ctx)
    flush_every = int(ctx.settings.get("flush_every_days", 500))
    buffer: dict[str, list[pd.DataFrame]] = {}
    done_until, files, since_flush, stopped = None, 0, 0, ""

    def flush():
        nonlocal buffer, since_flush
        for sym, parts in buffer.items():
            new = pd.concat(parts, ignore_index=True).drop(columns="symbol")
            merge_write(ctx.data / "stocks" / "raw" / ids[sym], new, store.STOCK_COLS, ctx.today)
        write_trading_days(ctx, days_known)
        if done_until:            # no date stamp in the file: a holiday run must leave it unchanged (nothing to commit)
            save_json(cp_path, {"last_day": done_until.isoformat(), **({"symbols": sorted(symbols)} if only else {})})
        ctx.log(f"  saved up to {done_until}: {len(buffer)} stocks touched, {len(days_known)} trading days known")
        buffer, since_flush = {}, 0

    for d in weekdays(first, until):
        if ctx.out_of_time():
            stopped = "time limit"
            break
        try:
            day = nse.fetch_bhav(ctx.http, d)
        except Exception as exc:  # noqa: BLE001 - stop cleanly; the next run continues from the last saved day
            stopped = f"{d}: {type(exc).__name__}: {str(exc)[:120]}"
            break
        if day is not None:
            rows = nse.pick_rows(day, nse.names_on(pd.Timestamp(d), symbols, history), prio)
            for sym, g in rows.groupby("symbol"):
                buffer.setdefault(sym, []).append(g)
            days_known.add(d)
            files += 1
            since_flush += 1
        done_until = d
        if since_flush >= flush_every:
            flush()
    flush()
    res = {"job": "stocks", "files": files, "last_day": str(done_until or cp.get("last_day")), "stopped": stopped}
    ctx.log(f"stocks: {res}")
    return res


# ---------------------------------------------------------------- delivery % (NSE MTO files)
def backfill_delivery(ctx: Ctx, until: date | None = None, restart_from: date | None = None) -> dict:
    """Deliverable quantity and delivery % per stock and day -> data/stocks/delivery/<ID>/ (date, deliv_qty, deliv_pct).
    Only known trading days are fetched (trading_days.csv, written by the stocks job). A day whose file is not out yet
    (it comes ~16:50 IST) stops the run without moving the checkpoint, so the next run asks again."""
    until = until or ctx.today
    uni = stock_universe(ctx)
    symbols = uni["symbol"].tolist()
    ids = dict(zip(uni["symbol"], uni["id"]))
    history = nse.symbol_history(nse.symbol_changes(ctx.http), symbols)
    prio = ctx.universe["stocks"]["series_priority"]
    cp_path = checkpoint(ctx, "nse_delivery")
    cp = load_json(cp_path, {})
    first = as_date(cp["last_day"]) + timedelta(days=1) if cp.get("last_day") else ctx.start
    if restart_from and restart_from < first:
        first = restart_from
    days = sorted(d for d in read_trading_days(ctx) if first <= d <= until)
    flush_every = int(ctx.settings.get("flush_every_days", 500))
    buffer: dict[str, list[pd.DataFrame]] = {}
    done_until, files, missing, since_flush, stopped = None, 0, [], 0, ""

    def flush():
        nonlocal buffer, since_flush
        for sym, parts in buffer.items():
            new = pd.concat(parts, ignore_index=True)
            merge_write(ctx.data / "stocks" / "delivery" / ids[sym], new, store.DELIVERY_COLS, ctx.today)
        if done_until:
            save_json(cp_path, {"last_day": done_until.isoformat()})
        ctx.log(f"  delivery saved up to {done_until}: {len(buffer)} stocks touched")
        buffer, since_flush = {}, 0

    for d in days:
        if ctx.out_of_time():
            stopped = "time limit"
            break
        try:
            day = nse.fetch_mto(ctx.http, d)
        except Exception as exc:  # noqa: BLE001 - stop cleanly; the next run continues from the last saved day
            stopped = f"{d}: {type(exc).__name__}: {str(exc)[:120]}"
            break
        if day is None:
            if (until - d).days <= 3:
                break                                    # not published yet: try again next run
            missing.append(str(d))                       # an old day without a file: skip it
        else:
            rows = nse.pick_rows(day, nse.names_on(pd.Timestamp(d), symbols, history), prio)
            rows = rows.assign(date=pd.Timestamp(d))[["symbol", *store.DELIVERY_COLS]]
            for sym, g in rows.groupby("symbol"):
                buffer.setdefault(sym, []).append(g.drop(columns="symbol"))
            files += 1
            since_flush += 1
        done_until = d
        if since_flush >= flush_every:
            flush()
    flush()
    if missing:
        ctx.log(f"  ::warning title=Delivery files missing::{len(missing)} trading days without an NSE file: "
                f"{', '.join(missing[:10])}")
    res = {"job": "delivery", "files": files, "last_day": str(done_until or cp.get("last_day")), "missing_days": len(missing),
           "stopped": stopped}
    ctx.log(f"delivery: {res}")
    return res


# ---------------------------------------------------------------- NSE indices
def nse_index_list(ctx: Ctx) -> pd.DataFrame:
    path = ctx.data / "meta" / "indices_nse.csv"
    try:
        df = nse.all_indices(ctx.http)
    except Exception as exc:  # noqa: BLE001 - keep the last good list
        if not path.exists():
            raise
        ctx.log(f"  NSE index list not available ({type(exc).__name__}); using the last saved list")
        return pd.read_csv(path)
    skip = set(ctx.universe["indices"].get("nse_skip_categories") or [])
    df = df[~df["category"].isin(skip)].drop_duplicates("name").reset_index(drop=True)
    df["id"] = df["name"].map(store.folder_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, lineterminator="\n")
    return df


def index_key(name: str) -> str:
    """'Nifty  50' and 'NIFTY 50' are the same index."""
    return " ".join(str(name).upper().split())


def nse_index_files(ctx: Ctx, lst: pd.DataFrame, cp: dict, cp_path: Path, until: date) -> str:
    """Step A: NSE's daily all-indices file (from 21-Feb-2012, ~1 s per day for ALL indices at once).
    Rows whose name is not a current index name (old names like 'CNX Bank') are skipped; step B fills those years."""
    by_key = {index_key(n): (n, i) for n, i in zip(lst["name"], lst["id"])}
    start = as_date(cp["files_last_day"]) + timedelta(days=1) if cp.get("files_last_day") \
        else max(ctx.start, as_date(ctx.settings.get("nse_index_file_start", "2012-02-21")))
    flush_every = int(ctx.settings.get("flush_every_days", 500))
    unmatched = set(cp.get("unmatched_names", []))
    buffer: dict[str, list[pd.DataFrame]] = {}
    state = {"done_until": None, "since": 0}

    def flush():
        for name, parts in buffer.items():
            merge_write(ctx.data / "indices" / "nse" / by_key[index_key(name)][1], pd.concat(parts, ignore_index=True),
                        store.INDEX_COLS, ctx.today)
        if state["done_until"]:
            cp["files_last_day"] = state["done_until"].isoformat()
        cp["unmatched_names"] = sorted(unmatched)
        save_json(cp_path, cp)
        ctx.log(f"  NSE index files saved up to {state['done_until']}: {len(buffer)} indices touched")
        buffer.clear()
        state["since"] = 0

    stopped = ""
    for d in weekdays(start, until):
        if ctx.out_of_time():
            stopped = "time limit"
            break
        try:
            df = nse.index_close_file(ctx.http, d)
        except Exception as exc:  # noqa: BLE001
            stopped = f"index file {d}: {type(exc).__name__}: {str(exc)[:120]}"
            break
        if df is not None:
            df = df[df["date"].dt.date == d]                 # a holiday may serve the previous day's file
            df = df.assign(key=df["name"].map(index_key))
            unmatched.update(df.loc[~df["key"].isin(by_key), "name"])
            for k, g in df[df["key"].isin(by_key)].groupby("key"):
                buffer.setdefault(by_key[k][0], []).append(g[store.INDEX_COLS])
            state["since"] += 1
        state["done_until"] = d
        if state["since"] >= flush_every:
            flush()
    flush()
    return stopped


def gap_windows(missing: list[pd.Timestamp], chunk: int) -> list[tuple[date, date]]:
    """Group missing trading days into API windows of at most `chunk` calendar days."""
    out: list[tuple[date, date]] = []
    for d in sorted(missing):
        d = d.date() if hasattr(d, "date") else d
        if out and (d - out[-1][0]).days < chunk:
            out[-1] = (out[-1][0], d)
        else:
            out.append((d, d))
    return out


def nse_index_gaps(ctx: Ctx, lst: pd.DataFrame, cp: dict, cp_path: Path) -> str:
    """Step C: trading days missing inside an index's history (e.g. a daily file that skipped it) are asked from historicalOR.
    Windows that come back empty are remembered, so a later run does not ask again. Also fills close-only rows."""
    days = pd.DatetimeIndex(sorted(pd.Timestamp(d) for d in read_trading_days(ctx)))
    chunk = int(ctx.settings.get("nse_index_chunk_days", 90))
    gaps = cp.setdefault("gaps", {})
    for row in lst.itertuples():
        st = gaps.get(row.name, {})
        if st.get("done"):
            continue
        folder = ctx.data / "indices" / "nse" / row.id
        have = store.read(folder, store.INDEX_COLS)
        if have.empty:
            gaps[row.name] = {"done": True}
            save_json(cp_path, cp)
            continue
        empty = [tuple(w) for w in st.get("empty", [])]
        span = days[(days >= have["date"].min()) & (days <= have["date"].max())]
        missing = list(span.difference(pd.DatetimeIndex(have["date"])))
        windows = [w for w in gap_windows(missing, chunk) if [w[0].isoformat(), w[1].isoformat()] not in [list(e) for e in empty]]
        parts, stopped, fails = [], "", dict(st.get("fails", {}))
        for a, b in windows:
            if ctx.out_of_time():
                stopped = "time limit"
                break
            try:
                df = nse.index_history(ctx.http, row.name, a, b)
            except Exception as exc:  # noqa: BLE001 - a window that fails twice is given up (listed as empty)
                fails[a.isoformat()] = fails.get(a.isoformat(), 0) + 1
                if fails[a.isoformat()] < 2:
                    stopped = f"gaps {row.name} {a}: {type(exc).__name__}: {str(exc)[:120]}"
                    break
                df = pd.DataFrame()
            if df.empty:
                empty.append((a.isoformat(), b.isoformat()))
            else:
                parts.append(df)
        store.write(folder, store.fill_ohl(pd.concat([have, *parts], ignore_index=True)), store.INDEX_COLS, ctx.today)
        gaps[row.name] = {"done": not stopped, "empty": [list(e) for e in empty], "filled_windows": len(parts), "fails": fails}
        save_json(cp_path, cp)
        if stopped:
            return stopped
        if windows:
            ctx.log(f"  NSE {row.name}: {len(missing)} missing days, {len(parts)} of {len(windows)} windows filled")
    return ""


def leading_island(dates: pd.Series, days: pd.DatetimeIndex, max_rows: int = 20, min_gap: int = 60) -> int:
    """How many rows at the start are a small island cut off from the rest: <= max_rows rows, then >= min_gap trading days
    with no row (e.g. NIFTY500 EQUAL WEIGHT: 1 row in 2016, 1 in 2023, real data from 2024). 0 = nothing to cut."""
    cut = 0
    d = pd.DatetimeIndex(dates).sort_values()
    while True:
        rest = d[cut:]
        if len(rest) <= max_rows:
            return cut
        pos = days.searchsorted(rest)                          # trading-day number of each row
        gaps = pos[1:max_rows + 1] - pos[:max_rows] - 1        # trading days without a row after each of the first rows
        big = [i for i, g in enumerate(gaps) if g >= min_gap]
        if not big:
            return cut
        cut += big[-1] + 1


def nse_index_islands(ctx: Ctx, lst: pd.DataFrame, cp: dict, cp_path: Path) -> None:
    """Step D: drop small isolated groups of rows before an index's real start (listed in the checkpoint as 'trimmed')."""
    days = pd.DatetimeIndex(sorted(pd.Timestamp(d) for d in read_trading_days(ctx)))
    trimmed = cp.setdefault("trimmed", {})
    for row in lst.itertuples():
        folder = ctx.data / "indices" / "nse" / row.id
        have = store.read(folder, store.INDEX_COLS)
        n = leading_island(have["date"], days) if len(have) else 0
        if n:
            gone = have.iloc[:n]
            trimmed[row.name] = trimmed.get(row.name, []) + [d.strftime("%Y-%m-%d") for d in gone["date"]]
            store.write(folder, have.iloc[n:], store.INDEX_COLS, ctx.today)
            ctx.log(f"  NSE {row.name}: dropped {n} isolated early row(s) {trimmed[row.name][-n:]}")
    save_json(cp_path, cp)


def backfill_nse_indices(ctx: Ctx, until: date | None = None) -> dict:
    """Step A: daily all-indices files (2012 ->). Step B, per index: walk back from its oldest stored day 90 days at a time
    with the historicalOR API (it knows old index names); two empty windows in a row = the index did not exist yet."""
    until = until or ctx.today
    lst = nse_index_list(ctx)
    cp_path = checkpoint(ctx, "nse_indices")
    cp = load_json(cp_path, {})
    cp.setdefault("walk", {})
    chunk = int(ctx.settings.get("nse_index_chunk_days", 90))
    done = 0
    stopped = nse_index_files(ctx, lst, cp, cp_path, until)
    walk = cp["walk"]
    for row in ([] if stopped else lst.itertuples()):
        st = walk.get(row.name, {})
        if st.get("done"):
            continue
        if st.get("oldest_checked"):
            end = as_date(st["oldest_checked"]) - timedelta(days=1)
        else:
            have = store.read(ctx.data / "indices" / "nse" / row.id, store.INDEX_COLS)
            end = have["date"].min().date() - timedelta(days=1) if len(have) else until
        empties, parts = int(st.get("empties", 0)), []
        fails, skipped = dict(st.get("fails", {})), list(st.get("skipped", []))
        while end >= ctx.start and empties < 2:
            if ctx.out_of_time():
                stopped = "time limit"
                break
            begin = max(ctx.start, end - timedelta(days=chunk - 1))
            try:
                df = nse.index_history(ctx.http, row.name, begin, end)
            except Exception as exc:  # noqa: BLE001
                # NSE never answers some windows (e.g. NIFTY100 LOW VOLATILITY 30 around Nov-2008, from PC and GitHub alike):
                # after the 2nd failure of the same window it is skipped and listed, so the walk goes on
                key = begin.isoformat()
                fails[key] = fails.get(key, 0) + 1
                if fails[key] < 2:
                    st = {**st, "fails": fails, "skipped": skipped}
                    stopped = f"{row.name} {begin}: {type(exc).__name__}: {str(exc)[:120]}"
                    break
                skipped.append([key, end.isoformat()])
                ctx.log(f"  NSE {row.name}: window {key}..{end} failed twice, skipped")
                df = None
            if df is not None and df.empty:
                empties += 1
            elif df is not None:
                empties = 0
                parts.append(df)
            st = {"oldest_checked": begin.isoformat(), "empties": empties, "fails": fails, "skipped": skipped}
            end = begin - timedelta(days=1)
        if parts:
            merge_write(ctx.data / "indices" / "nse" / row.id, pd.concat(parts, ignore_index=True), store.INDEX_COLS, ctx.today)
        if not stopped:
            st["done"] = True
            done += 1
        walk[row.name] = st
        save_json(cp_path, cp)
        if stopped:
            break
        ctx.log(f"  NSE {row.name}: done")
    if not stopped:
        stopped = nse_index_gaps(ctx, lst, cp, cp_path)
    if not stopped:
        nse_index_islands(ctx, lst, cp, cp_path)
    res = {"job": "nse-indices", "indices": len(lst), "finished_now": done,
           "finished_total": sum(1 for v in walk.values() if v.get("done")), "files_last_day": cp.get("files_last_day"),
           "unmatched_names": len(cp.get("unmatched_names", [])),
           "gaps_checked": sum(1 for v in cp.get("gaps", {}).values() if v.get("done")), "stopped": stopped}
    ctx.log(f"nse-indices: {res}")
    return res


# ---------------------------------------------------------------- BSE indices (PC only)
def backfill_bse_indices(ctx: Ctx, until: date | None = None) -> dict:
    until = until or ctx.today
    lst = bse.index_list(ctx.http)
    lst["id"] = lst["code"].map(store.folder_name)
    path = ctx.data / "meta" / "indices_bse.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    lst.to_csv(path, index=False, lineterminator="\n")
    cp_path = checkpoint(ctx, "bse_indices")
    cp = load_json(cp_path, {})
    empty, stopped, done = [], "", 0
    for row in lst.itertuples():
        if cp.get(row.code, {}).get("done"):
            continue
        if ctx.out_of_time():
            stopped = "time limit"
            break
        try:
            df = bse.index_history(ctx.http, row.code, ctx.start, until)
        except Exception as exc:  # noqa: BLE001
            stopped = f"{row.code}: {type(exc).__name__}: {str(exc)[:120]}"
            break
        if df.empty:
            empty.append(row.code)
        else:
            merge_write(ctx.data / "indices" / "bse" / row.id, df, store.INDEX_COLS, ctx.today)
        cp[row.code] = {"done": True, "rows": len(df)}
        done += 1
        save_json(cp_path, cp)
    res = {"job": "bse-indices", "indices": len(lst), "finished_now": done, "no_data": empty, "stopped": stopped}
    ctx.log(f"bse-indices: {res}")
    return res


def update_bse_indices(ctx: Ctx, until: date | None = None) -> dict:
    """Weekly BSE refresh (PC only - BSE refuses GitHub): every BSE index from 10 days before its last stored day to today;
    an index BSE added since the last run gets its whole history."""
    until = until or ctx.today
    lst = bse.index_list(ctx.http)
    lst["id"] = lst["code"].map(store.folder_name)
    lst.to_csv(ctx.data / "meta" / "indices_bse.csv", index=False, lineterminator="\n")
    added = new_indices = 0
    stopped, empty = "", []
    for row in lst.itertuples():
        if ctx.out_of_time():
            stopped = "time limit"
            break
        folder = ctx.data / "indices" / "bse" / row.id
        have = store.read(folder, store.INDEX_COLS)
        start = have["date"].max().date() - timedelta(days=10) if len(have) else ctx.start
        try:
            df = bse.index_history(ctx.http, row.code, start, until)
        except Exception as exc:  # noqa: BLE001
            stopped = f"{row.code}: {type(exc).__name__}: {str(exc)[:120]}"
            break
        if df.empty:
            empty.append(row.code)
            continue
        before = len(have)
        merge_write(folder, df, store.INDEX_COLS, ctx.today)
        added += len(store.read(folder, store.INDEX_COLS)) - before
        new_indices += before == 0
    res = {"job": "bse-update", "indices": len(lst), "rows_added": added, "new_indices": new_indices,
           "no_data": len(empty), "stopped": stopped}
    ctx.log(f"bse-update: {res}")
    return res


def backfill_fundamentals(ctx: Ctx, until: date | None = None) -> dict:
    """Results / balance sheet / cash flow / shareholding XBRL files per stock (Nifty 500 first), see swingdash/fundamentals.py.
    ~40 s per stock; the checkpoint lists the stocks done, so a stopped run continues with the next one."""
    from . import fundamentals
    uni = pd.read_csv(ctx.data / "meta" / "universe_stocks.csv")
    return fundamentals.backfill(ctx.data, ctx.http, uni, ctx.today, ctx.deadline, checkpoint(ctx, "fundamentals"),
                                 int(ctx.settings.get("fundamentals_refresh_days", 120)), log=ctx.log, clock=ctx.clock)


JOBS = {"stocks": backfill_stocks, "nse-indices": backfill_nse_indices, "bse-indices": backfill_bse_indices,
        "bse-update": update_bse_indices, "delivery": backfill_delivery, "fundamentals": backfill_fundamentals}
