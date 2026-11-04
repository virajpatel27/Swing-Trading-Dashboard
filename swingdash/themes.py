"""Theme membership from config/theme_rules.yaml -> data/meta/themes.csv (theme, symbol, source), rebuilt every day.

Sources, best first: an official NSE thematic index the stock belongs to (from its NSE quote), an NSE basic industry, a
hand-made list ("manual - check"). Stocks must be in our list and active. reports/themes_review.md shows every theme with
its members and why they are in it, for Viraj to review.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml

from . import classification
from .groups import slug

COLS = ["theme", "symbol", "source"]


def load_rules(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return (yaml.safe_load(f) or {}).get("themes") or {}


def build(rules: dict, master: pd.DataFrame, cls: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """(membership, warnings). master = stocks.csv rows (symbol, status); cls = classification.load()."""
    active = set(master.loc[master["status"] == "active", "symbol"])
    idx = {s: {i.strip().upper() for i in str(cls.at[s, "indices"]).split(";") if i.strip()}
           for s in cls.index if "indices" in cls.columns}
    basic = {s: slug(str(cls.at[s, "basic_industry"])) for s in cls.index}
    rows, warnings = [], []
    for theme, r in rules.items():
        r = r or {}
        excl = set(r.get("exclude") or [])
        found: dict[str, str] = {}
        for name in r.get("nse_indices") or []:
            want = name.strip().upper()
            hits = [s for s, ii in idx.items() if want in ii]
            if not hits:
                warnings.append(f"{theme}: no stock is in NSE index '{name}'")
            for s in hits:
                found.setdefault(s, f"NSE index {name}")
        for b in r.get("basic_industries") or []:
            hits = [s for s, v in basic.items() if v == slug(b)]
            if not hits:
                warnings.append(f"{theme}: no stock has basic industry '{b}'")
            for s in hits:
                found.setdefault(s, f"NSE industry {b}")
        for s in r.get("symbols") or []:
            if s not in active:
                warnings.append(f"{theme}: {s} is not an active stock in our list")
            found.setdefault(s, "manual - check")
        for s, src in found.items():
            if s in active and s not in excl:
                rows.append({"theme": theme, "symbol": s, "source": src})
    out = pd.DataFrame(rows, columns=COLS).sort_values(["theme", "symbol"]).reset_index(drop=True)
    return out, warnings


def review(df: pd.DataFrame, master: pd.DataFrame, warnings: list[str]) -> str:
    names = dict(zip(master["symbol"], master["name"]))
    lines = ["# Themes - review list", "",
             "Made from `config/theme_rules.yaml` (edit that file to add / remove stocks). Source: **NSE index** = member of "
             "an official NSE thematic index; **NSE industry** = NSE's basic industry; **manual - check** = added by hand, "
             "please confirm.", "", "| theme | stocks | from NSE index | from NSE industry | manual |", "|---|---|---|---|---|"]
    for theme, g in df.groupby("theme"):
        src = g["source"].str.split(" ").str[:2].str.join(" ")
        lines.append(f"| {theme} | {len(g)} | {int((src == 'NSE index').sum())} | {int((src == 'NSE industry').sum())} | "
                     f"{int((g['source'] == 'manual - check').sum())} |")
    if warnings:
        lines += ["", "## Warnings", ""] + [f"- {w}" for w in warnings]
    for theme, g in df.groupby("theme"):
        lines += ["", f"## {theme} ({len(g)})", ""]
        lines += [f"- {r.symbol} - {names.get(r.symbol, '')} ({r.source})" for r in g.itertuples()]
    return "\n".join(lines) + "\n"


def run(root: Path, log=print, write_review: bool = False) -> pd.DataFrame:
    data = root / "data"
    master = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    cls = classification.load(data / "meta" / "classification.csv")
    df, warnings = build(load_rules(root / "config" / "theme_rules.yaml"), master, cls)
    text = df.to_csv(index=False, lineterminator="\n")
    path = data / "meta" / "themes.csv"
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")
    if write_review:
        (root / "reports").mkdir(exist_ok=True)
        (root / "reports" / "themes_review.md").write_text(review(df, master, warnings), encoding="utf-8", newline="\n")
    for w in warnings:
        log(f"  theme warning: {w}")
    log(f"themes: {df['theme'].nunique()} themes, {len(df)} memberships")
    return df
