"""Data-quality report for all stocks (Phase S2): reports/data_quality.md + reports/data_quality.csv.

Reads what the data check already found (data/meta/data_issues.csv) and looks again at every ADJUSTED series for big
one-day moves:
  circuit-size   20 % < |move| <= 30 %: normal for Indian stocks (20 % circuit + news); counted only
  suspect        |move| > 30 % with no corporate action that day, listed with a likely reason:
                   long gap     more than 30 days without a trade before it (suspension, BSE-only years): a real re-start
                   re-based     NSE's own previous close of that day differs > 30 % from the last stored close: NSE changed
                                the base price -> a consolidation / capital reduction NSE's list does not show (candidate
                                for config/corporate_action_overrides.csv)
                   reverted     the next day undid most of it -> most likely a bad price in NSE's file
                   split-like   the price changed by a simple ratio (1:2, 1:5, 1:10 ...) and stayed: probably a split /
                                bonus / consolidation NSE's corporate action list misses (override candidate)
                   unexplained  none of these
Nothing is changed; fixes go to config/corporate_action_overrides.csv (with a note) after a human looked at them.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from . import store
from .adjust import ADJ_COLS

SUSPECT_PCT = 30.0
REASONS = ["long gap", "re-based", "split-like", "reverted", "unexplained"]
SIMPLE_RATIOS = [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 20, 25, 50, 100]


def split_like(before: float, after: float, tol: float = 0.03) -> float | None:
    """The simple ratio (2, 5, 10 ...) the price changed by, if it did; None otherwise."""
    if before <= 0 or after <= 0:
        return None
    r = max(before, after) / min(before, after)
    return next((k for k in SIMPLE_RATIOS if abs(r / k - 1) <= tol), None)
COLS = ["symbol", "date", "move_pct", "close_before", "close", "gap_days", "nse_prev_close", "reason"]


def suspects(adj: pd.DataFrame, raw: pd.DataFrame, action_days: set, pct: float = SUSPECT_PCT) -> list[dict]:
    """Big one-day moves of the adjusted series with their likely reason (raw = same days, for NSE's previous close)."""
    if len(adj) < 2:
        return []
    c = adj["close"].astype(float)
    move = c.pct_change() * 100
    nxt = move.shift(-1)
    r = raw.set_index("date") if len(raw) else pd.DataFrame(columns=["prev_close", "close"])
    prev_nse = pd.to_numeric(r["prev_close"], errors="coerce")
    last_raw = pd.to_numeric(r["close"], errors="coerce").shift(1)
    out = []
    for i in move.index[move.abs() > pct]:
        day = adj["date"].iat[i]
        if day in action_days:
            continue
        gap = int((day - adj["date"].iat[i - 1]).days)
        pn, lr = prev_nse.get(day), last_raw.get(day)
        rebased = pd.notna(pn) and pd.notna(lr) and lr > 0 and abs(pn / lr - 1) > pct / 100
        reverted = pd.notna(nxt.iat[i]) and nxt.iat[i] * move.iat[i] < 0 and \
            abs((1 + nxt.iat[i] / 100) * (1 + move.iat[i] / 100) - 1) < abs(move.iat[i] / 100) / 2
        ratio = split_like(float(c.iat[i - 1]), float(c.iat[i]))
        reason = ("long gap" if gap > 30 else "re-based" if rebased else "reverted" if reverted else
                  "split-like" if ratio else "unexplained")
        out.append({"date": day.strftime("%Y-%m-%d"), "move_pct": round(float(move.iat[i]), 1),
                    "close_before": round(float(c.iat[i - 1]), 2), "close": round(float(c.iat[i]), 2), "gap_days": gap,
                    "nse_prev_close": None if pd.isna(pn) else float(pn), "reason": reason})
    return out


def scan(data: Path) -> tuple[pd.DataFrame, dict]:
    uni = pd.read_csv(data / "meta" / "universe_stocks.csv")
    rows, counts = [], {"stocks": 0, "rows": 0, "circuit_size": 0, "suspect": 0, **{k: 0 for k in REASONS}}
    for r in uni.itertuples():
        adj = store.read(data / "stocks" / "adjusted" / r.id, ADJ_COLS)
        if adj.empty:
            continue
        counts["stocks"] += 1
        counts["rows"] += len(adj)
        acts_path = data / "corporate_actions" / f"{r.id}.csv"
        days = set()
        if acts_path.exists():
            a = pd.read_csv(acts_path, dtype=str).fillna("")
            a = a[a["type"] != "dividend"]
            days = set(pd.to_datetime(a["ex_date"])) | set(pd.to_datetime(
                a["status"].str.extract(r"applied on (\d{4}-\d{2}-\d{2})")[0].dropna()))
        move = adj["close"].astype(float).pct_change().abs() * 100
        counts["circuit_size"] += int(((move > 20) & (move <= SUSPECT_PCT)).sum())
        raw = store.read(data / "stocks" / "raw" / r.id, store.STOCK_COLS)
        for s in suspects(adj, raw, days):
            counts["suspect"] += 1
            counts[s["reason"]] += 1
            rows.append({"symbol": r.symbol, **s})
    return pd.DataFrame(rows, columns=COLS), counts


EXPLAIN_MOVES = [
    "- **long gap**: more than 30 days without a trade before it (suspension, years traded only on BSE): a real re-start, "
    "nothing to fix.",
    "- **re-based**: NSE's own 'previous close' of that day is far from our last close, so NSE changed the base price "
    "(consolidation / capital reduction, often after an insolvency plan) that its corporate action list does not show. "
    "Charts before that day are not comparable; candidates for `config/corporate_action_overrides.csv` (each needs a check "
    "of the company's filing).",
    "- **split-like**: the price changed by a simple ratio (2x, 5x, 10x ...) and stayed there: probably a split / bonus / "
    "consolidation missing from NSE's list. Override candidates after checking the company's filing.",
    "- **reverted**: the next day undid most of it, most likely a bad price in NSE's file.",
    "- **unexplained**: none of these (big news, or something to check).",
]


def _table(sub: pd.DataFrame, title: str, n: int = 40) -> list[str]:
    top = sub.reindex(sub["move_pct"].abs().sort_values(ascending=False).index).head(n)
    out = [f"### {title}: {len(sub)}", "", "| stock | date | move % | close before | close | NSE prev close | gap days |",
           "|---|---|---|---|---|---|---|"]
    for r in top.itertuples():
        prev = "" if pd.isna(r.nse_prev_close) else f"{r.nse_prev_close:g}"
        out.append(f"| {r.symbol} | {r.date} | {r.move_pct:+.1f} | {r.close_before:g} | {r.close:g} | {prev} | {r.gap_days} |")
    if len(sub) > len(top):
        out += ["", f"... and {len(sub) - len(top)} more in data_quality.csv"]
    return out + [""]


def report(data: Path, sus: pd.DataFrame, counts: dict, today: date) -> str:
    meta = data / "meta"
    issues = pd.read_csv(meta / "data_issues.csv", dtype=str).fillna("") if (meta / "data_issues.csv").exists() else \
        pd.DataFrame(columns=["instrument", "level", "check", "date", "detail"])
    by = issues.groupby(["level", "check"]).size()
    lines = [f"# Data quality report - {today}", "",
             "All NSE stocks, adjusted prices 2007 -> today. Made by `scripts/quality_report.py` from the data check "
             "(`data/meta/data_issues.csv`) plus a fresh look at big one-day moves.", "",
             "## Summary", "", "| | count |", "|---|---|",
             f"| stocks with prices | {counts['stocks']:,} |", f"| price rows (trading days x stocks) | {counts['rows']:,} |",
             f"| errors (data that must not be saved) | {int((issues['level'] == 'error').sum())} |",
             f"| warnings of the data check | {int((issues['level'] == 'warn').sum()):,} |",
             f"| one-day moves of 20-30 % (circuit-size, normal) | {counts['circuit_size']:,} |",
             f"| moves above {SUSPECT_PCT:g} % without a corporate action | {counts['suspect']:,} |",
             *[f"| - of these: {k} | {counts[k]:,} |" for k in REASONS], "",
             "## Warnings of the data check by type", "", "| level | check | count |", "|---|---|---|",
             *[f"| {lv} | {ch} | {n:,} |" for (lv, ch), n in by.items()], "",
             "What they mean:",
             "- **missing dates**: trading days without a row. Normal for thinly traded and suspended stocks (no trade = no row).",
             "- **bad candle**: high below low or close outside high-low in NSE's own file (old years). Kept as NSE gave it.",
             "- **unexplained jump**: close moved more than 20 % in a day. Mostly circuit moves; the real suspects are below.",
             "- **corporate action not seen in prices / without factor**: NSE listed an action, the price did not show it, or "
             "a rights issue had no price. Not applied; see `data/meta/adjust_issues.csv`.", ""]
    ca = issues[issues["check"].str.startswith("corporate action") | (issues["check"] == "ex-date moved")]
    lines += [f"## Corporate actions to look at: {len(ca)}", ""]
    lines += [f"- {r.instrument}, {r.date}: {r.check} - {r.detail}" for r in ca.itertuples()] or ["- none"]
    lines += ["", f"## Moves above {SUSPECT_PCT:g} % without a corporate action: {len(sus)}", "", *EXPLAIN_MOVES, ""]
    for reason in ["re-based", "split-like", "unexplained", "reverted"]:
        sub = sus[sus["reason"] == reason]
        if len(sub):
            lines += _table(sub, reason)
    gaps = issues[issues["check"] == "missing dates"].copy()
    if len(gaps):
        gaps["n"] = gaps["detail"].str.extract(r"(\d+) trading days")[0].astype(int)
        lines += ["## Most missing days (top 20; usually suspended or rarely traded)", ""]
        lines += [f"- {r.instrument}: {r.detail}" for r in gaps.sort_values("n", ascending=False).head(20).itertuples()]
    return "\n".join(lines) + "\n"


def run(root: Path, today: date, log=print) -> dict:
    data = root / "data"
    sus, counts = scan(data)
    out = root / "reports"
    out.mkdir(exist_ok=True)
    sus.to_csv(out / "data_quality.csv", index=False, lineterminator="\n")
    (out / "data_quality.md").write_text(report(data, sus, counts, today), encoding="utf-8", newline="\n")
    log(f"quality: {counts}")
    return counts
