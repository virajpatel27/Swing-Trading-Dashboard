"""Settings from config/*.yaml."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, root: Path = ROOT) -> dict:
    with open(root / "config" / f"{name}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))
