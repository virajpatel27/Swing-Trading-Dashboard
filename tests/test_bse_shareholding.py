"""scripts/fetch_bse_shareholding.py (17-Nov-2026): BSE patterns saved in the NSE format, files not fetched twice."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import fetch_bse_shareholding as fb  # noqa: E402
from swingdash import fundamentals as F  # noqa: E402

XML = """<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance">x</xbrli:xbrl>"""


class Resp:
    def __init__(self, status, payload=None, content=b""):
        self.status_code, self._p, self.content = status, payload, content

    def json(self):
        return self._p


class FakeHttp:
    def __init__(self):
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append(url)
        if "SHPQNewFormat" in url:
            return Resp(200, {"Table": [{"qtr": "September 2026", "XbrlFile": "1_SHP.xml", "filing_date_time": "2026-10-14T10:00:00"},
                                        {"qtr": "June 2026", "XbrlFile": "2_SHP.xml", "filing_date_time": "2026-07-17T10:00:00"}]})
        return Resp(200, content=("﻿" + XML).encode("utf-8"))


def test_quarter_end():
    assert fb.quarter_end("September 2026") == "2026-09-30" and fb.quarter_end("February 2024") == "2024-02-29"
    assert fb.quarter_end("Sep-2026") is None


def test_fetch_one_saves_and_skips(tmp_path, monkeypatch):
    data = tmp_path / "data"
    monkeypatch.setattr(F, "shareholding", lambda text: {"date": "x", "prom": 74.99, "fii": 0.4, "dii": 8.99, "govt": 0.0,
                                                         "public": 15.62, "others": 0.0, "n": 100})
    http = FakeHttp()
    assert fb.fetch_one(http, data, "ABC", "500001", 5) == 2
    doc = json.loads((data / "fundamentals" / "ABC.json").read_text(encoding="utf-8"))
    assert doc["shp"]["2026-09-30"]["prom"] == 74.99 and doc["files"]["BSE:1_SHP.xml"] == "2026-10-14"
    n = len(http.calls)
    assert fb.fetch_one(http, data, "ABC", "500001", 5) == 0          # both files known: only the list is asked
    assert len(http.calls) == n + 1
