"""Sector, industry and themes taken from config/reference_classes.csv (Viraj's choice, 2026-11-07)."""
import pandas as pd

from swingdash import classification, themes

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import import_reference_classes as imp  # noqa: E402


def test_export_reader_turns_json_themes_into_pipes(tmp_path):
    f = tmp_path / "all-stocks 06-11-2026.csv"
    f.write_text('symbol,company_name,sector,industry,themes,about\n'
                 '"AAA","A Ltd","Oil, Gas & Consumable Fuels","Refineries & Marketing",["Refining & OMC","Data Centres"],"x, y"\n'
                 '"BBB","B Ltd","Unclassified","",[],""\n', encoding="utf-8")
    df = imp.build(imp.read_export(f), "2026-11-06")
    assert list(df["symbol"]) == ["AAA", "BBB"]
    assert df.iloc[0]["themes"] == "Refining & OMC|Data Centres" and df.iloc[0]["sector"] == "Oil, Gas & Consumable Fuels"
    assert df.iloc[1]["themes"] == "" and df.iloc[1]["as_of"] == "2026-11-06"


def test_reference_wins_in_classification(tmp_path):
    cls = tmp_path / "classification.csv"
    pd.DataFrame([{"symbol": "AAA", "macro": "Energy", "sector": "Oil Gas & Consumable Fuels", "industry": "Petroleum Products",
                   "basic_industry": "Refineries", "source": "NSE"},
                  {"symbol": "CCC", "macro": "X", "sector": "Chemicals", "industry": "Y", "basic_industry": "Z", "source": "NSE"}]
                 ).to_csv(cls, index=False)
    ref = tmp_path / "ref.csv"
    pd.DataFrame([{"symbol": "AAA", "sector": "Oil, Gas & Consumable Fuels", "industry": "Refineries & Marketing", "themes": "A|B", "as_of": "2026-11-06"},
                  {"symbol": "NEW", "sector": "Unclassified", "industry": "", "themes": "", "as_of": "2026-11-06"}]).to_csv(ref, index=False)
    c = classification.load(cls, overrides=None, reference=ref)
    assert c.at["AAA", "sector"] == "Oil, Gas & Consumable Fuels" and c.at["AAA", "basic_industry"] == "Refineries & Marketing"
    assert c.at["AAA", "class_source"] == "reference list 2026-11-06" and c.at["CCC", "basic_industry"] == "Z"
    assert c.at["NEW", "sector"] == "Unclassified"


def test_themes_from_reference_only_active_stocks():
    ref = pd.DataFrame({"symbol": ["AAA", "BBB", "OLD"], "themes": ["A|B", "", "A"], "as_of": ["2026-11-06"] * 3})
    master = pd.DataFrame({"symbol": ["AAA", "BBB", "OLD"], "status": ["active", "active", "inactive"]})
    df = themes.from_reference(ref, master)
    assert sorted(map(tuple, df[["theme", "symbol"]].values)) == [("A", "AAA"), ("B", "AAA")]
    assert set(df["source"]) == {"reference list 2026-11-06"}


def test_same_name_but_punctuation_takes_the_reference_spelling(tmp_path):
    """12-Nov-2026: one NSE-only stock with "Media Entertainment & Publication" made a 24th sector."""
    cls = tmp_path / "classification.csv"
    pd.DataFrame([{"symbol": "DDD", "macro": "X", "sector": "Media Entertainment & Publication", "industry": "Y",
                   "basic_industry": "Healthcare Research Analytics & Technology", "source": "NSE"},
                  {"symbol": "EEE", "macro": "X", "sector": "Chemicals", "industry": "Y", "basic_industry": "Own Name", "source": "NSE"}]
                 ).to_csv(cls, index=False)
    ref = tmp_path / "ref.csv"
    pd.DataFrame([{"symbol": "AAA", "sector": "Media, Entertainment & Publication", "industry": "Healthcare Research, Analytics & Technology",
                   "themes": "", "as_of": "2026-11-06"}]).to_csv(ref, index=False)
    c = classification.load(cls, overrides=None, reference=ref)
    assert c.at["DDD", "sector"] == "Media, Entertainment & Publication"
    assert c.at["DDD", "basic_industry"] == "Healthcare Research, Analytics & Technology"
    assert c.at["EEE", "basic_industry"] == "Own Name"
