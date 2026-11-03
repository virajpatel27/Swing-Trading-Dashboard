"""Stock universe audit (Phase 1): our stock list and stored history against NSE's official lists.

    reports/stock_audit.md    summary + every finding, plain English
    reports/stock_audit.csv   one row per finding (check, symbol, detail)

Checks
  missing      in NSE's equity list (EQUITY_L.csv) but not in our list
  extra        in our list but not in NSE's equity list (REITs from the Nifty 500 list are expected here)
  orphan       a stored history folder for a symbol no longer in the list: delisted / renamed / other
  new_listing  a share (ISIN INE...) traded on the newest bhavcopy day in EQ / BE / BZ but not in our list (EQUITY_L is
               updated a bit later; ETFs are not shares)
  no_history   in the list but no stored day yet (listed today / not traded yet)
  inactive     no trade for more than 10 days (suspended / not traded)
  late_start   history starts much later than the listing date (or than 2007 for older stocks)
  no_sector    no NSE sector; no_shares = no share count yet (market cap / float unknown)
Nothing is changed by the audit; the daily job already adds new listings and warns about stocks without history.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from .sources import nse

LATE_DAYS = 30


def findings(master: pd.DataFrame, nse_list: pd.DataFrame | None, folders: list[str], delisted: pd.DataFrame | None,
             changes: pd.DataFrame | None, newest_bhav: pd.DataFrame | None, history_start: date) -> pd.DataFrame:
    rows: list[dict] = []
    add = lambda check, sym, detail: rows.append({"check": check, "symbol": sym, "detail": detail})
    ours = set(master["symbol"])

    if nse_list is not None:
        theirs = set(nse_list["symbol"])
        for s in sorted(theirs - ours):
            if not s.startswith("DUMMY"):
                add("missing", s, "in NSE's equity list, not in ours")
        for r in master[~master["symbol"].isin(theirs)].itertuples():
            add("extra", r.symbol, f"series {r.series}" + (" (REIT / InvIT, from the Nifty 500 list)" if r.series in ("RR", "IV") else ""))

    ids = set(master["id"])
    gone = dict(zip(delisted["symbol"], delisted["date"].fillna("") + " " + delisted["type"])) if delisted is not None else {}
    renamed = dict(zip(changes["old"], changes["new"] + " on " + changes["date"].dt.strftime("%Y-%m-%d"))) if changes is not None else {}
    for f in sorted(set(folders) - ids):
        if f in gone:
            add("orphan", f, f"delisted {gone[f].strip()}")
        elif f in renamed:
            add("orphan", f, f"renamed to {renamed[f]}")
        else:
            add("orphan", f, "not in the list any more (reason unknown)")

    if newest_bhav is not None and len(newest_bhav):
        day = newest_bhav["date"].max()
        eq = newest_bhav[newest_bhav["series"].isin(["EQ", "BE", "BZ"])]
        if "isin" in eq.columns and (eq["isin"] != "").any():
            eq = eq[eq["isin"].str.startswith("INE")]                # ETFs / funds (ISIN INF...) trade in EQ too
        traded = eq["symbol"]
        for s in sorted(set(traded) - ours):
            add("new_listing", s, f"traded on {day:%Y-%m-%d}, not in our list yet")

    start = pd.Timestamp(history_start)
    for r in master.itertuples():
        if r.status == "no_history":
            add("no_history", r.symbol, "no day stored yet")
        elif r.status == "inactive":
            add("inactive", r.symbol, f"last trade {r.last_date}")
        listed = pd.Timestamp(r.listed) if isinstance(r.listed, str) and r.listed else None
        if r.first_date and listed is not None:                     # REITs have no listing date in NSE's equity list
            gap = (pd.Timestamp(r.first_date) - max(listed, start)).days
            if gap > LATE_DAYS:
                add("late_start", r.symbol, f"listed {r.listed or '?'}, history from {r.first_date} ({gap} days later)")
        if not isinstance(r.sector, str) or not r.sector:
            add("no_sector", r.symbol, "NSE gave no classification")
        if pd.isna(r.shares):
            add("no_shares", r.symbol, "share count not fetched yet")
    return pd.DataFrame(rows, columns=["check", "symbol", "detail"])


EXPLAIN = {
    "missing": "In NSE's list but not in ours. The daily job takes NSE's list every day, so this is normally empty.",
    "extra": "In our list but not in NSE's equity list. REITs (series RR) come from the Nifty 500 list on purpose.",
    "orphan": "Old history folders of symbols that left the list (kept, not shown). Delisted ones are the "
              "'survivorship bias' of breadth history: past days miss companies that died later.",
    "new_listing": "Shares that traded on the newest day but are not in NSE's equity list (EQUITY_L.csv). New listings "
                   "join automatically within a day or two; older names that stay here are not in NSE's list (for "
                   "example companies under insolvency) and are left out on purpose.",
    "no_history": "In the list, no stored day yet: listed in the last day or two, or not traded yet. The daily job "
                  "brings them; if one stays here for a week, run Actions -> Backfill history (job stocks, that symbol).",
    "inactive": "No trade for more than 10 days (suspended or not traded). Left out of liquid, scanners and breadth.",
    "late_start": "History starts more than 30 days after the listing date (or after 2007). Usually a long suspension, "
                  "a move from NSE's SME board or from BSE, or a rename NSE's symbolchange.csv does not list. Renames are "
                  "searched by ISIN with scripts/find_renames.py and added to config/symbol_changes_extra.csv.",
    "no_sector": "NSE gave no sector / industry; asked again every day.",
    "no_shares": "No share count yet (market cap and free float unknown). Filled by the daily job (a few hundred per run) "
                 "or at once by Actions -> Backfill history -> job classification.",
}


def report(master: pd.DataFrame, found: pd.DataFrame, today: date) -> str:
    n = len(master)
    act = master[master["status"] == "active"]
    lines = [f"# Stock universe audit - {today}", "",
             "Our stock list and stored history checked against NSE's official lists (EQUITY_L.csv, delisted.csv, "
             "symbolchange.csv, the newest bhavcopy). Made by `scripts/audit_stocks.py`.", "",
             "## Summary", "",
             "| | count |", "|---|---|",
             f"| stocks in our list | {n:,} |",
             *[f"| series {k} | {v:,} |" for k, v in master["series"].value_counts().items()],
             f"| active (traded in the last 10 days) | {len(act):,} |",
             f"| young (fewer than 30 sessions stored: new listings) | {int((master['sessions'].between(1, 29)).sum()):,} |",
             f"| liquid (median 30-day turnover >= Rs 1 Cr, close >= Rs 5) | {int(master['liquid'].sum()):,} |",
             f"| F&O stocks | {int(master['fno'].sum()):,} |",
             f"| Nifty 500 members | {int(master['n500'].sum()):,} |",
             f"| with NSE sector | {int((master['sector'].fillna('') != '').sum()):,} |",
             f"| with share count (market cap) | {int(master['shares'].notna().sum()):,} |",
             f"| history from 2007 (or from listing) | {n - int((found['check'] == 'late_start').sum()):,} |", "",
             "## Findings", ""]
    counts = found["check"].value_counts()
    for check, text in EXPLAIN.items():
        k = int(counts.get(check, 0))
        lines.append(f"### {check}: {k}")
        lines.append("")
        lines.append(text)
        if k:
            sub = found[found["check"] == check]
            lines.append("")
            shown = sub.head(40)
            lines += [f"- {r.symbol}: {r.detail}" for r in shown.itertuples()]
            if k > len(shown):
                lines.append(f"- ... and {k - len(shown)} more (see stock_audit.csv)")
        lines.append("")
    return "\n".join(lines)


def run(root: Path, http, today: date, history_start: date, all_list_url: str, log=print) -> pd.DataFrame:
    data = root / "data"
    master = pd.read_csv(data / "meta" / "stocks.csv", dtype={"listed": str, "first_date": str, "last_date": str,
                                                               "sector": str})
    master["shares"] = pd.to_numeric(master["shares"], errors="coerce")

    def safe(fn, what):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - a missing list only skips its check
            log(f"  {what} not available ({type(exc).__name__}); that check is skipped")
            return None

    nse_list = safe(lambda: nse.equity_list(http, all_list_url), "NSE equity list")
    delisted = safe(lambda: nse.delisted(http), "delisted list")
    changes = safe(lambda: nse.symbol_changes(http), "symbol changes")
    newest = None
    if master["last_date"].notna().any():
        last = pd.Timestamp(master["last_date"].dropna().max()).date()
        newest = safe(lambda: nse.fetch_bhav(http, last), "newest bhavcopy")
    folders = [p.name for p in (data / "stocks" / "raw").iterdir() if p.is_dir()]
    found = findings(master, nse_list, folders, delisted, changes, newest, history_start)
    out = root / "reports"
    out.mkdir(exist_ok=True)
    found.to_csv(out / "stock_audit.csv", index=False, lineterminator="\n")
    (out / "stock_audit.md").write_text(report(master, found, today) + "\n", encoding="utf-8", newline="\n")
    log(f"audit: {len(found)} findings {found['check'].value_counts().to_dict()}")
    return found
