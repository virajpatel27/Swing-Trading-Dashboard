"""Corporate actions from NSE: download, read the subject text into (type, ratio), map to our stocks, save one CSV per stock.

    data/corporate_actions/RELIANCE.csv   ex_date, type, ratio, factor, amount, method, status, subject, source

`factor` is the number every price BEFORE the ex-date is multiplied by (1:1 bonus -> 0.5). For rights and demergers it needs
prices, so swingdash/adjust.py fills it in and says how (`method`).
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import pandas as pd

from .sources import nse

CA_COLS = ["ex_date", "type", "ratio", "factor", "amount", "method", "status", "subject", "source"]
NOT_EQUITY_BONUS = re.compile(r"BONUS\s*[-:]?\s*(NCRPS|DEB|PREF|-\s*\d+\s*DEBENTURE)|BONUS\s+\d+\s*DEBENTURE", re.I)
# Old NSE records are abbreviated: "Fv Splt Frm Rs 10 To Re 1", "Fv Spl-Rs10tore1/Bon-1:1", "Agm/Div-Rs.2/Fv Rs10tors5".
# "SPL" alone also means "special (dividend)", so a split needs the "Rs x to Rs y" part too.
SPLIT = re.compile(r"(?:SPLI?T|\bSPL\b|SPL-|SUB-?\s*DIVISION|\bFV\b)[^/]*?R[SE]\.?\s*([\d.]+)\s*(?:/-?)?\s*(?:EACH\s*)?"
                   r"(?:PER\s*(?:EQUITY\s*)?SHARE\s*)?TO\s*(?:R[SE]\.?)?\s*([\d.]+)", re.I)
CONSOLIDATION = re.compile(r"CONSOLIDAT.*?R[SE]\.?\s*([\d.]+).*?\bTO\s*R[SE]\.?\s*([\d.]+)", re.I)
BONUS = re.compile(r"\bBON(?:US)?(?:\s*SHARES\s*IN\s*THE\s*RATIO\s*OF)?\s*(?:-|ISSUE)?\s*(\d+)\s*:\s*(\d+)", re.I)
RIGHTS = re.compile(r"\bRIGHTS?(?:\s*-?\s*(?:EQ|ISSUE|EQUITY|AT))?\s*-?\s*(\d+)\s*:\s*(\d+)"
                    r"(?:.*?PRE?M\w*\s*(?:OF\s*)?@?\s*(?:R[SE]\.?)?\s*([\d.]+))?", re.I)   # "Premium Rs 50", "Premium 91", "Prm Rs 102"
AT_PAR = re.compile(r"\bAT\s+PAR\b", re.I)                                               # issue price = face value
DIVIDEND_AMOUNT = re.compile(r"R[SE]\.?\s*-?\s*([\d.]+)\s*/?-?\s*P(?:E)?R\s*(?:EQUITY\s*)?(?:SH|UNIT)", re.I)
DIVIDEND_PCT = re.compile(r"([\d.]+)\s*%")                           # "Dividend - 40%", "Div Fin-40% + Spl-20%": % of face value


def _num(x: str) -> float | None:
    """'62..50' (a typo seen in NSE data) -> 62.5; nonsense -> None."""
    try:
        return float(re.sub(r"\.+", ".", x).strip("."))
    except ValueError:
        return None


def parse_subject(subject: str, face_value: float | None = None) -> list[dict]:
    """One NSE subject line -> 0..n actions. Types: split, consolidation, bonus, rights, demerger, scheme, capital_reduction,
    dividend. Anything else (AGM, interest, buy back ...) -> []."""
    s = " ".join(str(subject).split())
    up = s.upper()
    out: list[dict] = []
    if m := SPLIT.search(s):
        old, new = _num(m.group(1)), _num(m.group(2))
        if old and new and 0 < new < old:
            out.append({"type": "split", "ratio": f"FV {old:g}->{new:g}", "factor": new / old})
    if m := CONSOLIDATION.search(s):
        old, new = _num(m.group(1)), _num(m.group(2))
        if old and new and new > old:
            out.append({"type": "consolidation", "ratio": f"FV {old:g}->{new:g}", "factor": new / old})
    if not NOT_EQUITY_BONUS.search(s) and (m := BONUS.search(s)):
        a, b = int(m.group(1)), int(m.group(2))
        if a > 0 and b > 0:
            out.append({"type": "bonus", "ratio": f"{a}:{b}", "factor": b / (a + b)})
    if m := RIGHTS.search(s):
        a, b = int(m.group(1)), int(m.group(2))
        premium = _num(m.group(3)) if m.group(3) else (0.0 if AT_PAR.search(s) else None)
        price = (premium or 0.0) + (face_value or 0.0) if premium is not None else None
        if a > 0 and b > 0:
            out.append({"type": "rights", "ratio": f"{a}:{b}", "factor": None,
                        "amount": price})            # issue price = face value + premium (needed for the TERP)
    if "DEMERGER" in up or "DE-MERGER" in up or "SPIN" in up:
        out.append({"type": "demerger", "ratio": "", "factor": None})
    elif ("SCHEME OF ARR" in up or "SCHEME OF ARANG" in up or "COMPOSITE SCHEME" in up) and not out:
        out.append({"type": "scheme", "ratio": "", "factor": None})
    if "CAPITAL REDUCTION" in up and not out:
        out.append({"type": "capital_reduction", "ratio": "", "factor": None})
    if re.search(r"\bDIV(?!ISION)", up):                     # "Div", "Dividend", but not "Sub-Division"
        amounts = [a for a in (_num(x) for x in DIVIDEND_AMOUNT.findall(s)) if a]
        if not amounts and face_value:
            amounts = [a * face_value / 100 for a in (_num(x) for x in DIVIDEND_PCT.findall(s)) if a]
        if amounts:
            out.append({"type": "dividend", "ratio": "", "factor": None, "amount": round(sum(amounts), 4)})
    return out


INDEXES = {"equities": "ca_nse", "sme": "ca_nse_sme"}      # NSE list -> cache file prefix


def fetch_year(http, year: int, today: date, index: str = "equities") -> list[dict]:
    end = f"31-12-{year}" if year < today.year else f"31-12-{today.year}"
    data = nse.api_json(http, f"api/corporates-corporateActions?index={index}&from_date=01-01-{year}&to_date={end}")
    return data if isinstance(data, list) else data.get("data", [])


def load_raw(http, years: list[int], today: date, cache: Path | None = None, refresh_years: int = 2) -> list[dict]:
    """All NSE corporate action records of these years, main board AND SME board: many main-board stocks started on the
    SME board (series SM / ST in our history), and their bonuses / splits of that time are only in the SME list
    (THEJO 2:1 bonus 12-Oct-2021, KSOLVES, AIRAN ...). A local cache (not in git) keeps old years; the last
    `refresh_years` are always downloaded again (new announcements)."""
    rows: list[dict] = []
    for index, prefix in INDEXES.items():
        for y in years:
            p = cache / f"{prefix}_{y}.json" if cache else None
            if p and p.exists() and y < today.year - refresh_years + 1:
                rows += json.loads(p.read_text())
                continue
            got = fetch_year(http, y, today, index)
            if p:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps(got))
            rows += got
    return rows


def to_actions(raw: list[dict], symbols: list[str], history: dict) -> dict[str, pd.DataFrame]:
    """{current symbol: actions}. A record under an old symbol (before a rename) is given to the current one."""
    old_to_new: dict[str, list[tuple[str, pd.Timestamp]]] = {}
    for sym, chain in history.items():
        for old, until in chain:
            old_to_new.setdefault(old, []).append((sym, until))
    wanted = set(symbols)
    per: dict[str, list[dict]] = {}
    for r in raw:
        if str(r.get("series", "")).strip() not in ("EQ", "BE", "BZ", "RR", "IV", "SM", "ST"):
            continue
        try:
            ex = pd.to_datetime(r.get("exDate"), format="%d-%b-%Y")
        except (ValueError, TypeError):
            continue
        sym = str(r.get("symbol", "")).strip()
        target = sym if sym in wanted else next((new for new, until in old_to_new.get(sym, []) if ex < until), None)
        if not target:
            continue
        try:
            fv = float(r.get("faceVal"))
        except (TypeError, ValueError):
            fv = None
        for a in parse_subject(r.get("subject", ""), fv):
            per.setdefault(target, []).append({"ex_date": ex, "type": a["type"], "ratio": a.get("ratio", ""),
                                               "factor": a.get("factor"), "amount": a.get("amount"), "method": "",
                                               "status": "", "subject": " ".join(str(r.get("subject", "")).split()),
                                               "source": "NSE"})
    out = {}
    for sym, acts in per.items():
        df = pd.DataFrame(acts, columns=CA_COLS).sort_values(["ex_date", "type"])
        out[sym] = df.drop_duplicates(["ex_date", "type", "ratio", "amount"]).reset_index(drop=True)
    return out


def add_overrides(per: dict[str, pd.DataFrame], path: Path) -> dict[str, pd.DataFrame]:
    """config/corporate_action_overrides.csv: the few actions NSE's text gets wrong or leaves out, each with a note.
    They are added next to the NSE records (source 'manual override')."""
    if not path.exists():
        return per
    ov = pd.read_csv(path)
    out = dict(per)
    for r in ov.itertuples():
        row = {"ex_date": pd.Timestamp(r.ex_date), "type": r.type, "ratio": r.ratio, "factor": float(r.factor),
               "amount": None, "method": "", "status": "", "subject": r.note, "source": "manual override"}
        cur = out.get(r.symbol, pd.DataFrame(columns=CA_COLS))
        out[r.symbol] = pd.concat([cur, pd.DataFrame([row])], ignore_index=True).sort_values(["ex_date", "type"]).reset_index(drop=True)
    return out


def save(folder: Path, symbol_id: str, df: pd.DataFrame) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    out = df.copy()
    out["ex_date"] = pd.to_datetime(out["ex_date"]).dt.strftime("%Y-%m-%d")
    out.to_csv(folder / f"{symbol_id}.csv", index=False, lineterminator="\n", float_format="%.8g")


def load(folder: Path, symbol_id: str) -> pd.DataFrame:
    p = folder / f"{symbol_id}.csv"
    if not p.exists():
        return pd.DataFrame(columns=CA_COLS)
    df = pd.read_csv(p)
    df["ex_date"] = pd.to_datetime(df["ex_date"])
    return df
