import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import classification  # noqa: E402

QUOTE = {"equityResponse": [{"secInfo": {"macro": "Energy", "sector": "Oil Gas & Consumable Fuels", "industryInfo": "Petroleum Products",
                                         "basicIndustry": "Refineries & Marketing", "indexList": ["NIFTY 50", "NIFTY 100"]}}]}


class Resp:
    def __init__(self, status, data=None):
        self.status_code, self._d = status, data

    def json(self):
        return self._d


class Http:
    def __init__(self, answers):
        self.answers = answers

    def warm_up(self, home):
        pass

    def get(self, url, **kw):
        a = self.answers.get(kw["params"]["symbol"])
        if isinstance(a, Exception):
            raise a
        return a or Resp(404)


def test_parse_quote_reads_four_levels_and_indices():
    got = classification.parse_quote(QUOTE)
    assert got == {"macro": "Energy", "sector": "Oil Gas & Consumable Fuels", "industry": "Petroleum Products",
                   "basic_industry": "Refineries & Marketing", "indices": "NIFTY 50;NIFTY 100"}
    assert classification.parse_quote({"x": 1}) is None


def test_update_keeps_last_good_and_falls_back(tmp_path):
    p = tmp_path / "classification.csv"
    uni = pd.DataFrame({"symbol": ["RELIANCE", "NEWCO", "OLDOK"], "industry": ["Oil", "Banks", "IT"], "series": ["EQ"] * 3})
    pd.DataFrame([{"symbol": "OLDOK", "macro": "Information Technology", "sector": "IT", "industry": "IT - Software",
                   "basic_industry": "Software", "indices": "", "source": "NSE", "fetched": "2026-01-01"}]).to_csv(p, index=False)
    http = Http({"RELIANCE": Resp(200, QUOTE), "NEWCO": Resp(503), "OLDOK": ConnectionError("down")})
    res = classification.update(p, uni, http, date(2026, 3, 1), refresh_days=30, log=lambda m: None)
    out = pd.read_csv(p, dtype=str).fillna("").set_index("symbol")
    assert out.loc["RELIANCE", "basic_industry"] == "Refineries & Marketing" and out.loc["RELIANCE", "source"] == "NSE"
    assert out.loc["OLDOK", "industry"] == "IT - Software"                 # NSE failed: last good entry kept
    assert out.loc["NEWCO", "sector"] == "Banks" and out.loc["NEWCO", "source"] == "Nifty 500 list"
    assert res == {"asked": 3, "answered": 1, "from_nse": 2, "fallback": 1}
    res2 = classification.update(p, uni, http, date(2026, 3, 2), refresh_days=30, log=lambda m: None)
    assert res2["asked"] == 2                                              # fresh NSE entry (RELIANCE) not asked again
