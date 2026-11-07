"""Build the static website into _site/ (made inside GitHub Actions, not committed):

  _site/index.html, app.js, styles.css, sw.js, manifest.webmanifest, icons/    copied from site/
  _site/data/latest.json, sectors.json, health.json                            the daily snapshot (loaded first, small)
  _site/data/screen.json                                                       every engine field per stock (Phase S4)
  _site/data/scanners.json, fields.json                                        scanner rules, field registry (Phase S6)
  _site/data/c/<s|n|b>/<id>.json                                                one chart file per stock / NSE index / BSE index,
                                                                                loaded only when that chart is opened
Chart file (column-wise): d = dates as yyyymmdd, o h l c = ADJUSTED prices, v = volume, f = adjustment factor (raw = adjusted / f),
m = corporate action markers [{d, t, r}].
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd

from . import fundamentals, corporate_actions as ca
from . import index_members, market_flows, registry, store
from .adjust import ADJ_COLS

FOLDER = {("stock", "NSE"): "s", ("index", "NSE"): "n", ("index", "BSE"): "b"}


def _price(x: float):
    if pd.isna(x):
        return None
    return round(float(x), 4 if abs(x) < 100 else 2)


def chart_payload(df: pd.DataFrame, markers: list[dict] | None = None) -> dict:
    out = {"d": [int(d.strftime("%Y%m%d")) for d in df["date"]]}
    for c in ("open", "high", "low", "close"):
        out[c[0]] = [_price(x) for x in df[c]]
    if "volume" in df.columns:
        out["v"] = [None if pd.isna(x) else int(x) for x in df["volume"]]
    if "factor" in df.columns:
        out["f"] = [float(f"{x:.6g}") for x in df["factor"]]
    out["m"] = markers or []
    return out


def markers_for(actions: pd.DataFrame) -> list[dict]:
    """Applied split / bonus / rights / demerger / scheme / consolidation dates, for the small badges on the chart."""
    if actions.empty:
        return []
    a = actions[(actions["type"] != "dividend") & actions["status"].astype(str).str.startswith("applied")]
    out = []
    for r in a.itertuples():
        moved = pd.Series([str(r.status)]).str.extract(r"applied on (\d{4}-\d{2}-\d{2})")[0].iat[0]
        day = pd.Timestamp(moved) if isinstance(moved, str) else pd.Timestamp(r.ex_date)
        out.append({"d": int(day.strftime("%Y%m%d")), "t": r.type, "r": "" if pd.isna(r.ratio) else str(r.ratio)})
    return out


def fundamentals_payload(doc: dict, factors: pd.DataFrame | None) -> dict:
    """data/fundamentals/<SYMBOL>.json for the website (data/f/<id>.json): without the download bookkeeping, every quarter /
    year with "f" = factor for later splits / bonuses (counted from its results day, see fundamentals.metrics)."""
    from . import share_factors
    out = {"symbol": doc.get("symbol"), "kind": doc.get("kind") or "company", "shp": doc.get("shp", {})}
    for b in ("C", "S"):
        part = {}
        for k, items in (doc.get(b) or {}).items():
            rows = {}
            for end, v in items.items():
                v = {x: y for x, y in v.items() if not x.startswith("_")}
                if k in ("q", "y") and v.get("eps") is not None and factors is not None and len(factors):
                    f = share_factors.eps_factor(factors, doc.get("symbol"), v.get("ann") or end)
                    if f != 1.0:
                        v["f"] = float(f"{f:.6g}")
                rows[end] = v
            part[k] = rows
        if part:
            out[b] = part
    return out


def fields_payload(root: Path) -> dict:
    """The Field Registry for the website (formula editor drop-downs, the fields page)."""
    reg = registry.load(root / "config" / "fields.yaml")
    return {"phase": reg.get("current_phase"), "fields": [
        {"id": f["id"], "label": f["label"], "type": f["type"], "formula": f["formula"], "source": f["source"],
         "screen": "screen" in (f.get("file") or [])} for f in reg["fields"]]}


def build(root: Path, out: Path, log=print) -> dict:
    data = root / "data"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(root / "site", out)
    (out / "data" / "c").mkdir(parents=True)
    for name in ("latest.json", "sectors.json"):
        shutil.copy2(data / "snapshot" / name, out / "data" / name)
    shutil.copy2(data / "meta" / "health.json", out / "data" / "health.json")
    if (data / "snapshot" / "screen.json").exists():      # all engine fields per stock (built by scripts/build_screen.py)
        shutil.copy2(data / "snapshot" / "screen.json", out / "data" / "screen.json")
    if (data / "snapshot" / "group_ranks.json").exists():   # Groups page (Phase S9, built with screen.json)
        shutil.copy2(data / "snapshot" / "group_ranks.json", out / "data" / "group_ranks.json")
    if (data / "snapshot" / "breadth.json").exists():       # Breadth page (Phase S10)
        shutil.copy2(data / "snapshot" / "breadth.json", out / "data" / "breadth.json")
    members = index_members.site_payload(data)                  # index members (heatmap page, Phase N7)
    if members:
        (out / "data" / "index_members.json").write_text(json.dumps(members, separators=(",", ":")), encoding="utf-8")
    flows = market_flows.site_payload(data)                     # FII / DII cash flows (home page, Phase N5)
    if flows:
        (out / "data" / "fii_dii.json").write_text(json.dumps(flows, separators=(",", ":")), encoding="utf-8")
    shutil.copy2(root / "config" / "scanners.json", out / "data" / "scanners.json")
    (out / "data" / "fields.json").write_text(json.dumps(fields_payload(root)), encoding="utf-8")

    snap = json.loads((data / "snapshot" / "latest.json").read_text(encoding="utf-8"))
    cols = snap["columns"]
    n = nf = 0
    sf = data / "meta" / "share_factors.csv"
    factors = pd.read_csv(sf, dtype=str) if sf.exists() else None
    for row in snap["rows"]:
        r = dict(zip(cols, row))
        key = FOLDER[(r["kind"], r["exchange"])]
        if r["kind"] == "stock":
            df = store.read(data / "stocks" / "adjusted" / r["id"], ADJ_COLS)
            marks = markers_for(ca.load(data / "corporate_actions", r["id"]))
        else:
            df = store.read(data / "indices" / r["exchange"].lower() / r["id"], store.INDEX_COLS)
            marks = []
        payload = {"id": r["id"], "kind": r["kind"], "exchange": r["exchange"], "symbol": r["symbol"], "name": r["name"],
                   **chart_payload(df, marks)}
        fdoc = fundamentals.path_of(data, r["symbol"]) if r["kind"] == "stock" else None
        if fdoc is not None and fdoc.exists():           # Phase S8: Financials tab + E markers (results days)
            fin = fundamentals_payload(fundamentals.load(data, r["symbol"]), factors)
            fd = out / "data" / "f" / f"{r['id']}.json"
            fd.parent.mkdir(parents=True, exist_ok=True)
            fd.write_text(json.dumps(fin, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
            q = (fin.get(fundamentals.basis_of(fin)) or {}).get("q", {})
            payload["e"] = sorted({int(v["ann"].replace("-", "")) for v in q.values() if v.get("ann")})
            nf += 1
        dest = out / "data" / "c" / key / f"{r['id']}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        n += 1
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    sw = out / "sw.js"
    sw.write_text(sw.read_text(encoding="utf-8").replace("__BUILD__", stamp), encoding="utf-8")
    page = out / "index.html"                            # ?v=<build> on every file: a new build never mixes with cached old files
    page.write_text(page.read_text(encoding="utf-8").replace("__BUILD__", stamp), encoding="utf-8")
    (out / ".nojekyll").write_text("")
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    res = {"charts": n, "fundamentals": nf, "build": stamp, "size_mb": round(size / 1e6, 1)}
    log(f"site: {res}")
    return res
