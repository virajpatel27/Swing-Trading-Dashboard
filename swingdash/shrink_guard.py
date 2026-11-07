"""Shrink guard (from 07-Nov-2026): a data file or folder that suddenly has far fewer rows / files than in the last commit
is almost always a failed download that wrote a short file. The data check (scripts/validate_data.py) then reports an
ERROR, so the workflow does not commit and the last good data stays.

Compared with the committed version (git HEAD): line count of each guarded CSV, file count of each guarded folder.
Outside a git checkout (or for a new file) nothing is checked.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from .validate import issue

FILES = ["data/meta/stocks.csv", "data/meta/universe_stocks.csv", "data/meta/classification.csv", "data/meta/trading_days.csv",
         "data/meta/ipos.csv", "data/meta/themes.csv", "data/meta/groups.csv", "data/meta/share_factors.csv",
         "data/meta/index_members.csv", "data/meta/indices_nse.csv", "data/meta/indices_bse.csv", "data/meta/results_calendar.csv",
         "data/market/fii_dii.csv"]
FOLDERS = ["data/fundamentals", "data/corporate_actions", "data/stocks/raw", "data/stocks/adjusted", "data/announcements"]


def _git(root: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def head_lines(root: Path, rel: str) -> int | None:
    out = _git(root, "show", f"HEAD:{rel}")
    return None if out is None else len(out.splitlines())


def head_files(root: Path, rel: str) -> int | None:
    out = _git(root, "ls-tree", "-r", "--name-only", "HEAD", rel)
    return None if out is None else len([x for x in out.splitlines() if x.strip()])


def check(root: Path, max_drop_pct: float = 20.0, min_size: int = 20, files=FILES, folders=FOLDERS) -> list[dict]:
    """Errors for every guarded file / folder that lost more than max_drop_pct of its lines / files (ignoring small ones)."""
    out = []
    for rel in files:
        p = root / rel
        before = head_lines(root, rel)
        if before is None or before < min_size:
            continue
        now = len(p.read_text(encoding="utf-8").splitlines()) if p.exists() else 0
        if now < before * (1 - max_drop_pct / 100):
            out.append(issue(rel, "error", "file shrank", f"{before} lines in the last commit, now {now}"))
    for rel in folders:
        before = head_files(root, rel)
        if before is None or before < min_size:
            continue
        p = root / rel
        now = sum(1 for f in p.rglob("*") if f.is_file()) if p.exists() else 0
        if now < before * (1 - max_drop_pct / 100):
            out.append(issue(rel, "error", "folder shrank", f"{before} files in the last commit, now {now}"))
    return out
