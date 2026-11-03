"""The Field Registry (config/fields.yaml): every column / indicator / scanner condition with its formula, inputs and the
phase that provides it. check() lists every broken rule (empty list = all good)."""
from __future__ import annotations

from pathlib import Path

import yaml

from .config import ROOT

REQUIRED = ["id", "label", "type", "formula", "inputs", "provided_in_phase", "source"]
TYPES = {"text", "number", "percent", "rupees", "crore", "integer", "boolean", "date", "list"}


def load(path: Path = ROOT / "config" / "fields.yaml") -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def check(reg: dict, files: dict[str, list[str]] | None = None) -> list[str]:
    """Problems in the registry. files = {file name: its columns}; each column must be a registered field of that file,
    provided in a phase <= current_phase."""
    errors: list[str] = []
    fields, sources = reg.get("fields") or [], set((reg.get("sources") or {}).keys())
    current = int(reg.get("current_phase", 0))
    by_id: dict[str, dict] = {}
    for f in fields:
        missing = [k for k in REQUIRED if k not in f]
        if missing:
            errors.append(f"{f.get('id', '?')}: missing {missing}")
            continue
        if f["id"] in by_id:
            errors.append(f"{f['id']}: listed twice")
        if f["id"] in sources:
            errors.append(f"{f['id']}: same name as a source")
        if f["type"] not in TYPES:
            errors.append(f"{f['id']}: unknown type {f['type']}")
        by_id[f["id"]] = f
    for f in by_id.values():
        for i in f["inputs"]:
            if i in sources:
                continue
            if i not in by_id:
                errors.append(f"{f['id']}: unknown input {i}")
            elif by_id[i]["provided_in_phase"] > f["provided_in_phase"]:
                errors.append(f"{f['id']} (phase {f['provided_in_phase']}) uses {i} from a later phase "
                              f"({by_id[i]['provided_in_phase']})")
    for name, cols in (files or {}).items():
        for c in cols:
            f = by_id.get(c)
            if f is None:
                errors.append(f"{name}: column {c} is not in the registry")
            elif name not in (f.get("file") or []):
                errors.append(f"{name}: column {c} is registered, but not for this file")
            elif f["provided_in_phase"] > current:
                errors.append(f"{name}: column {c} belongs to phase {f['provided_in_phase']} (current {current})")
    return errors
