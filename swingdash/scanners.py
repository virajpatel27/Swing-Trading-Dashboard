"""Scanners (Phase S6): rules over the fields of the screen snapshot, kept in config/scanners.json.

A scanner:  {"id", "folder", "name", "description", "universe": "all" | "liquid", "rule": <node>, "sort": {"field", "dir"}}
A node is   {"all": [nodes]}  (AND)   |   {"any": [nodes]}  (OR)   |   a condition:
  {"field": "rs_rating", "op": ">", "value": 90}                      field compared with a number
  {"field": "close", "op": ">", "field2": "sma50", "mult": 1.0}        field compared with another field x mult
  {"field": "hvq", "op": "is", "value": true}                          yes / no field
  {"field": "ret_1m", "op": "between", "value": [-5, 5]}
  {"field": "stage", "op": "in", "value": ["2", "2A"]}                  text field is one of a list
A missing value (stock too young, no data) never matches. "liquid" = liquid that day (median 30-session turnover >= Rs 1 Cr,
close >= Rs 5). Stale stocks (no trade for 10 days) never match. The website runs the same rules (site/scan.js; a test checks
both give the same result).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .config import ROOT

OPS = {">": np.greater, ">=": np.greater_equal, "<": np.less, "<=": np.less_equal, "==": np.equal, "!=": np.not_equal}
OP_TEXT = {">": "above", ">=": "at least", "<": "below", "<=": "at most", "==": "equal to", "!=": "not", "is": "is",
           "between": "between", "in": "is one of"}


def load(path: Path = ROOT / "config" / "scanners.json") -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fields_in(node: dict) -> list[str]:
    if "all" in node or "any" in node:
        return [f for n in node.get("all", node.get("any", [])) for f in fields_in(n)]
    return [node["field"]] + ([node["field2"]] if node.get("field2") else [])


def _num(df: pd.DataFrame, col: str) -> pd.Series:
    if col not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col], errors="coerce")


def condition(df: pd.DataFrame, c: dict) -> pd.Series:
    op = c["op"]
    if op == "is":
        s = df[c["field"]] if c["field"] in df.columns else pd.Series(None, index=df.index)
        want = bool(c.get("value", True))
        return s.map(lambda x: x is not None and not (isinstance(x, float) and np.isnan(x)) and bool(x) == want).astype(bool)
    if op == "in":
        s = df[c["field"]] if c["field"] in df.columns else pd.Series(None, index=df.index)
        return s.map(lambda x: x is not None and str(x) in {str(v) for v in c["value"]}).astype(bool)
    a = _num(df, c["field"])
    if op == "between":
        lo, hi = c["value"]
        return (a >= lo) & (a <= hi) & a.notna()
    b = _num(df, c["field2"]) * float(c.get("mult", 1.0)) if c.get("field2") else pd.Series(float(c["value"]), index=df.index)
    return pd.Series(OPS[op](a, b), index=df.index) & a.notna() & b.notna()


def node_mask(df: pd.DataFrame, node: dict) -> pd.Series:
    if "all" in node:
        m = pd.Series(True, index=df.index)
        for n in node["all"]:
            m &= node_mask(df, n)
        return m
    if "any" in node:
        m = pd.Series(False, index=df.index)
        for n in node["any"]:
            m |= node_mask(df, n)
        return m
    return condition(df, node)


def evaluate(df: pd.DataFrame, scanner: dict) -> pd.Series:
    """True for every stock (row) the scanner finds."""
    m = node_mask(df, scanner.get("rule") or {"all": []})
    if "stale" in df.columns:
        m &= ~df["stale"].fillna(False).astype(bool)
    if scanner.get("universe") == "liquid":
        col = "liquid_day" if "liquid_day" in df.columns else "liquid"
        m &= df[col].fillna(False).astype(bool)
    return m


def describe(node: dict, labels: dict[str, str], depth: int = 0) -> str:
    """The rule in plain English (the same text the website shows)."""
    if "all" in node or "any" in node:
        parts = [describe(n, labels, depth + 1) for n in node.get("all", node.get("any", []))]
        if not parts:
            return "every stock"
        joined = (" AND " if "all" in node else " OR ").join(parts)
        return f"({joined})" if depth and len(parts) > 1 else joined
    lab = labels.get(node["field"], node["field"])
    if node["op"] == "is":
        return lab if node.get("value", True) else f"not {lab}"
    if node["op"] == "in":
        return f"{lab} is one of {', '.join(str(v) for v in node['value'])}"
    if node["op"] == "between":
        return f"{lab} between {node['value'][0]:g} and {node['value'][1]:g}"
    if node.get("field2"):
        mult = float(node.get("mult", 1.0))
        rhs = labels.get(node["field2"], node["field2"]) + ("" if mult == 1 else f" x {mult:g}")
    else:
        rhs = f"{float(node['value']):g}"
    return f"{lab} {OP_TEXT[node['op']]} {rhs}"


def check(spec: dict, registry: dict) -> list[str]:
    """Scanner problems: unknown fields, fields of a later phase or not in the screen, bad operators, duplicate ids."""
    reg = {f["id"]: f for f in registry["fields"]}
    current = int(registry.get("current_phase", 0))
    errors, seen = [], set()
    for sc in spec["scanners"]:
        if sc["id"] in seen:
            errors.append(f"{sc['id']}: id used twice")
        seen.add(sc["id"])
        if sc.get("folder") not in spec["folders"]:
            errors.append(f"{sc['id']}: unknown folder {sc.get('folder')}")
        if sc.get("universe", "all") not in ("all", "liquid"):
            errors.append(f"{sc['id']}: unknown universe {sc.get('universe')}")
        for f in fields_in(sc.get("rule") or {"all": []}) + ([sc["sort"]["field"]] if sc.get("sort") else []):
            if f not in reg:
                errors.append(f"{sc['id']}: unknown field {f}")
            elif reg[f]["provided_in_phase"] > current:
                errors.append(f"{sc['id']}: field {f} belongs to phase {reg[f]['provided_in_phase']}")
            elif "screen" not in (reg[f].get("file") or []):
                errors.append(f"{sc['id']}: field {f} is not in the screen snapshot")

        def ops(n):
            if "all" in n or "any" in n:
                for x in n.get("all", n.get("any", [])):
                    ops(x)
            elif n["op"] not in OP_TEXT:
                errors.append(f"{sc['id']}: unknown operator {n['op']}")
        ops(sc.get("rule") or {"all": []})
    return errors


def counts(df: pd.DataFrame, spec: dict) -> dict[str, int]:
    return {sc["id"]: int(evaluate(df, sc).sum()) for sc in spec["scanners"]}
