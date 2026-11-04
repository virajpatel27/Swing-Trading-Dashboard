import json
import shutil
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from swingdash import site_build, snapshot  # noqa: E402
from test_phase5_snapshot import make_market  # noqa: E402


def test_chart_payload_columns_rounding_and_factor():
    df = pd.DataFrame({"date": pd.to_datetime(["2024-10-25", "2024-10-28"]), "open": [1343.5, 1337.0], "high": [1344.351, 1353.0],
                       "low": [1322.0, 1322.1], "close": [1327.85, 1334.35], "volume": [18597496, 10824350], "factor": [0.5, 1.0]})
    p = site_build.chart_payload(df, [{"d": 20241028, "t": "bonus", "r": "1:1"}])
    assert p["d"] == [20241025, 20241028] and p["h"][0] == 1344.35 and p["f"] == [0.5, 1.0]
    assert p["v"] == [18597496, 10824350] and p["m"][0]["t"] == "bonus"
    small = site_build.chart_payload(pd.DataFrame({"date": pd.to_datetime(["2007-01-02"]), "open": [0.123456], "high": [0.2],
                                                    "low": [0.1], "close": [0.15]}))
    assert small["o"] == [0.1235] and "v" not in small and "f" not in small     # small old prices keep 4 decimals


def test_markers_use_the_day_the_action_was_applied():
    acts = pd.DataFrame({"ex_date": pd.to_datetime(["2024-10-24", "2023-07-20", "2024-08-01", "2020-01-01"]),
                         "type": ["bonus", "demerger", "dividend", "split"], "ratio": ["1:1", None, "", "FV 10->1"],
                         "status": ["applied on 2024-10-28", "applied", "no change", "NOT APPLIED: price did not move"]})
    assert site_build.markers_for(acts) == [{"d": 20241028, "t": "bonus", "r": "1:1"}, {"d": 20230720, "t": "demerger", "r": ""}]


def test_build_writes_site_snapshot_and_one_chart_per_instrument(tmp_path):
    data = make_market(tmp_path)
    latest, sectors = snapshot.build(data, log=lambda m: None)
    snapshot.write(data, latest, sectors)
    (data / "meta" / "health.json").write_text('{"errors": 0, "warnings": 3}')
    shutil.copytree(ROOT / "site", tmp_path / "site")
    shutil.copytree(ROOT / "config", tmp_path / "config")
    res = site_build.build(tmp_path, tmp_path / "_site", log=lambda m: None)
    out = tmp_path / "_site"
    assert res["charts"] == 5
    assert (out / "data/scanners.json").exists()
    flds = json.loads((out / "data/fields.json").read_text())["fields"]
    assert any(f["id"] == "rs_rating" and f["screen"] for f in flds)
    assert (out / "index.html").exists() and (out / "data/latest.json").exists() and (out / "data/health.json").exists()
    assert "__BUILD__" not in (out / "sw.js").read_text() and res["build"] in (out / "sw.js").read_text()
    c = json.loads((out / "data/c/s/UPCO.json").read_text())
    assert c["c"][-1] == 300.0 and c["f"][-1] == 1.0 and c["name"] == "Up Co"
    assert (out / "data/c/n/NIFTY_50.json").exists() and (out / "data/c/b/SENSEX.json").exists()
