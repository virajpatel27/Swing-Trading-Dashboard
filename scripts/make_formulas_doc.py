"""docs/formulas.md from config/fields.yaml (the Field Registry): every field, its formula, inputs, phase and source.
Run it after changing the registry; tests/test_scan_phase4.py fails when the document is out of date.

    python scripts/make_formulas_doc.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import registry  # noqa: E402

FILES = {"stocks": "data/meta/stocks.csv", "snapshot": "data/snapshot/latest.json", "screen": "data/snapshot/screen.json",
         "delivery": "data/stocks/delivery/<ID>/", "groups": "data/groups/<level>/<id>/"}


def render(reg: dict) -> str:
    lines = ["# Formulas - every field of the dashboard", "",
             "Made from `config/fields.yaml` by `scripts/make_formulas_doc.py` (do not edit by hand). All prices are ADJUSTED for "
             "splits, bonus, rights and demergers unless a field says \"as traded\". Settings: `config/indicators.yaml`, "
             "`config/stage.yaml`, `config/settings.yaml`. Calibration against the reference app: `docs/calibration.md`.", "",
             f"Current phase: **S{reg.get('current_phase', 0)}**. Fields: **{len(reg['fields'])}**.", "", "## Sources", ""]
    lines += [f"- **{k}**: {v}" for k, v in (reg.get("sources") or {}).items()]
    by_phase: dict[int, list[dict]] = {}
    for f in reg["fields"]:
        by_phase.setdefault(int(f["provided_in_phase"]), []).append(f)
    for ph in sorted(by_phase):
        title = "existing dashboard (before the scanner plan)" if ph == 0 else f"phase S{ph}"
        lines += ["", f"## Fields of {title}", "", "| field | label | type | formula | inputs | files |", "|---|---|---|---|---|---|"]
        for f in by_phase[ph]:
            files = ", ".join(FILES.get(x, x) for x in (f.get("file") or []))
            formula = str(f["formula"]).replace("|", "/")
            lines.append(f"| `{f['id']}` | {f['label']} | {f['type']} | {formula} | {', '.join(f['inputs'])} | {files} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    text = render(registry.load())
    (ROOT / "docs" / "formulas.md").write_text(text, encoding="utf-8", newline="\n")
    print("docs/formulas.md written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
