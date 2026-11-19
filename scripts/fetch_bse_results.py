"""BSE quarterly / yearly results for the stocks NSE has no results for (BSE filers such as ABBOTINDIA, old BSE stocks
admitted to NSE in 2026) -> data/fundamentals/<SYMBOL>.json "S" (standalone, same format as NSE's), so PE, EPS TTM,
growth, OPM and PEG appear for them; consolidated -> "C" when the company files it (preferred, as for NSE stocks: the
reference's EPS TTM of 3BBLACKBIO = the consolidated one). BSE gives the profit and loss only (no balance sheet): no
ROE / PB / debt from it.
PC ONLY: api.bseindia.com refuses GitHub's servers (HTTP 403). Runs with the weekly "BSE update"; it asks only for
periods it does not have yet.

    python scripts/fetch_bse_results.py                    # stocks without NSE results (resumes, skips saved periods)
    python scripts/fetch_bse_results.py --symbols ABBOTINDIA --quarters 8 --years 4

Viraj 18-Nov-2026: "Ha, BSE results lavo".
BSE calls (found 18-Nov-2026 in bseindia.com's own page scripts):
  CorprateResultbeta/w?scripcode=  -> per financial year Q1..Q4 / YR as "Sep-26;SQ2026-2027;131.00;<link>" (131.00 = id)
  Corp_detailedResult_Transpose_ng/w?Scrip_cd=&Qtr=<id> -> standalone line items in Rs MILLION (EPS in Rs)
  Corp_BSEDnBResults_SEBI_Consolidated_Res_ng/w?type1=c&strtype=<id>&strscripcd=&...&action=show -> consolidated, same
      items as [{Description, Amount}] (empty when the company has no consolidated results)
  BoardMeeting/w?scripcode=&type=   -> board meetings with purpose "Results" (the results day)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import fundamentals as F  # noqa: E402
from swingdash import http as H  # noqa: E402
from swingdash.sources import bse  # noqa: E402

LIST_URL = bse.API + "/CorprateResultbeta/w?scripcode={code}"
ITEMS_URL = bse.API + "/Corp_detailedResult_Transpose_ng/w?Scrip_cd={code}&Qtr={qid}"
CONS_URL = (bse.API + "/Corp_BSEDnBResults_SEBI_Consolidated_Res_ng/w?type1=c&strtype={qid}&strscripcd={code}"
            "&strscripname=&strresultType=&action=show")
MEET_URL = bse.API + "/BoardMeeting/w?scripcode={code}&type="
MILLION_TO_CR = 0.1
CR_DIGITS = 1           # 0.1 crore = BSE's whole Rs million: the reference's growth of BSE stocks is computed from these
                        # (19-Nov-2026: PAT growth YoY 28 % -> 86 %, sales 62 % -> 87 % match; AZADIND 0.78 / 0.07 cr = 700 %)


def periods(table: list[dict], quarters: int, years: int) -> list[tuple[str, str]]:
    """BSE list -> [(kind 'q' / 'y', period id)], newest first: the last `quarters` quarters and `years` years."""
    qs, ys = [], []
    for row in table or []:
        for k in ("Q4", "Q3", "Q2", "Q1"):
            v = row.get(k)
            if isinstance(v, str) and v.count(";") >= 2:
                qs.append(("q", v.split(";")[2].strip()))
        v = row.get("YR")
        if isinstance(v, str) and v.count(";") >= 2:
            ys.append(("y", v.split(";")[2].strip()))
    qs = sorted(set(qs), key=lambda x: float(x[1]), reverse=True)[:quarters]
    ys = sorted(set(ys), key=lambda x: float(x[1]), reverse=True)[:years]
    return qs + ys


def _val(rows: list[dict], *starts: str) -> float | None:
    """Value of the first line named exactly like one of `starts`, else the first line starting with it."""
    for s in starts:
        name = lambda r: str(r.get("fld_desc", "")).strip().lower()
        hit = [r for r in rows if name(r) == s.lower()] or [r for r in rows if name(r).startswith(s.lower())]
        if hit:
            try:
                return float(str(hit[0].get("Value")).replace(",", ""))
            except (TypeError, ValueError):
                return None
    return None


def parse_items(table1: list[dict]) -> tuple[str, dict] | None:
    """BSE line items of one period -> (period end 'YYYY-MM-DD', our P&L items in Rs crore)."""
    rows = table1 or []
    end = next((r.get("Value") for r in rows if str(r.get("fld_desc", "")).strip() == "Date End"), None)
    try:
        end = pd.to_datetime(end, format="%d-%b-%y").strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return None
    cr = lambda x: None if x is None else round(x * MILLION_TO_CR, CR_DIGITS)
    sales = _val(rows, "Net Sales/Revenue From Operations", "Net Sales", "Revenue From Operations", "Interest Earned", "Total Income")
    other = _val(rows, "Other Income")
    exp = _val(rows, "Expenditure")
    dep = _val(rows, "Depreciation")
    fin = _val(rows, "Finance Costs", "Interest")
    pbt = _val(rows, "Profit (+)/ Loss (-) from Ordinary Activities before Tax", "Profit before tax")
    tax = _val(rows, "Tax")
    net = _val(rows, "Net Profit (+)/ Loss (-) for the period", "Net Profit")
    if net is None:
        net = _val(rows, "Net Profit (+)/ Loss (-) from Ordinary Activities after Tax")
    owners = _val(rows, "Net Profit after Mino", "Income Attributable to Consolidated Group")
    owners = net if owners is None else owners
    exc = _val(rows, "Exceptional")
    eps_all = _val(rows, "Basic for discontinued & continuing operation")
    eps = eps_all if eps_all else _val(rows, "Basic EPS for continuing operation", "Basic EPS")
    if sales is None and net is None:
        return None
    absn = lambda x: None if x is None else abs(x)
    expenses = None if exp is None else abs(exp) - (absn(dep) or 0) - (absn(fin) or 0)
    items = {"sales": cr(sales), "other_income": cr(other), "interest": cr(absn(fin)), "depreciation": cr(absn(dep)),
             "expenses": cr(expenses), "pbt": cr(pbt), "tax": cr(absn(tax)), "net_profit": cr(net), "np_owners": cr(owners),
             "exceptional": cr(exc), "eps": None if eps is None else round(eps, 2)}
    if items["sales"] is not None and items["expenses"] is not None:
        items["op_profit"] = round(items["sales"] - items["expenses"], CR_DIGITS)
    return end, {k: v for k, v in items.items() if v is not None}


def cons_rows(payload) -> list[dict]:
    """Consolidated answer [{Description, Amount}] -> the standalone shape [{fld_desc, Value}] parse_items reads."""
    return [{"fld_desc": r.get("Description"), "Value": r.get("Amount")} for r in payload or [] if isinstance(r, dict)]


def result_days(table: list[dict]) -> list[str]:
    """Board meetings for results -> sorted days 'YYYY-MM-DD'."""
    out = []
    for r in table or []:
        if "result" in str(r.get("Purpose_name", "")).lower():
            d = pd.to_datetime(str(r.get("tm") or r.get("meeting_date") or "")[:10], errors="coerce")
            if pd.notna(d):
                out.append(d.strftime("%Y-%m-%d"))
    return sorted(set(out))


def ann_for(end: str, days: list[str]) -> str:
    """Results day of a period: the first results board meeting after the period end (within 120 days)."""
    e = pd.Timestamp(end)
    for d in days:
        if e < pd.Timestamp(d) <= e + pd.Timedelta(days=120):
            return d
    return ""


def fetch_one(http, data: Path, symbol: str, code: str, quarters: int, years: int) -> int:
    """Saves the missing periods of one stock; returns how many were added."""
    r = http.get(LIST_URL.format(code=code), headers=bse.HEADERS)
    if r.status_code != 200:
        raise RuntimeError(f"list HTTP {r.status_code}")
    want = periods((r.json() or {}).get("Table") or [], quarters, years)
    doc = F.load(data, symbol)
    if (doc.get("C") or doc.get("S")) and doc.get("results_source") != "BSE":
        return 0                                     # NSE results exist: leave the stock alone
    files = doc.setdefault("files", {})
    todo = [(basis, k, q) for k, q in want for basis, tag in (("S", "R"), ("C", "RC")) if f"BSE:{tag}:{q}" not in files]
    if not todo:
        return 0
    m = http.get(MEET_URL.format(code=code), headers=bse.HEADERS)
    days = result_days((m.json() or {}).get("Table") or []) if m.status_code == 200 else []
    doc["results_source"] = "BSE"
    added = 0
    no_cons = False
    for basis, kind, qid in todo:
        if basis == "C" and no_cons:
            files[f"BSE:RC:{qid}"] = "none"
            continue
        if basis == "S":
            x = http.get(ITEMS_URL.format(code=code, qid=qid), headers=bse.HEADERS)
            rows = (x.json() or {}).get("table1") if x.status_code == 200 else None
        else:
            x = http.get(CONS_URL.format(code=code, qid=qid), headers=bse.HEADERS)
            if x.status_code != 200:
                rows = None
            elif not str(getattr(x, "text", "x")).strip():
                rows = []                            # empty answer = the company files no consolidated results
                no_cons = not doc.get("C")           # newest period empty and none saved: skip its older ones too
            else:
                rows = cons_rows(x.json())
        if rows is None:
            continue                                 # not answered now: asked again next week
        got = parse_items(rows)
        files[f"BSE:{'R' if basis == 'S' else 'RC'}:{qid}"] = "none"
        if not got:
            continue                                 # no consolidated results for this period: never asked again
        end, items = got
        if basis == "C" and items.get("eps") is None and items.get("np_owners") is not None:
            s = doc.get("S", {}).get(kind, {}).get(end, {})       # some consolidated answers have no EPS lines:
            if s.get("eps") and s.get("np_owners"):                # same share count as the standalone result
                items["eps"] = round(items["np_owners"] * s["eps"] / s["np_owners"], 2)
        ann = ann_for(end, days)
        if kind == "q" and ann:
            items["ann"] = ann
        b = doc.setdefault(basis, {})
        b.setdefault(kind, {})[end] = {**b.get(kind, {}).get(end, {}), **items, "_at": ann or end}
        files[f"BSE:{'R' if basis == 'S' else 'RC'}:{qid}"] = ann or end
        added += 1
    doc["kind"] = doc.get("kind") or "company"
    F.save(data, doc)
    return added


def to_fetch(data: Path) -> list[str]:
    """Active stocks without NSE results (no consolidated or standalone periods, or only BSE ones)."""
    st = pd.read_csv(data / "meta" / "stocks.csv", dtype=str).fillna("")
    out = []
    for s in st.loc[st["status"] == "active", "symbol"]:
        d = F.load(data, s)
        if d.get("results_source") == "BSE" or not (d.get("C") or d.get("S")):
            out.append(s)
    return sorted(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="", help="comma-separated symbols (default: every stock without NSE results)")
    ap.add_argument("--quarters", type=int, default=9, help="newest quarters per stock (9 = TTM, YoY and TTM growth)")
    ap.add_argument("--years", type=int, default=4, help="newest years per stock (4 = 3-year CAGR)")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args(argv)
    data = ROOT / "data"
    codes = pd.read_csv(data / "meta" / "bse_history.csv", dtype=str).fillna("")
    code_of = {s: c for s, c in zip(codes["symbol"], codes["bse_code"]) if c}
    syms = [s.strip().upper() for s in a.symbols.split(",") if s.strip()] or to_fetch(data)
    if a.limit:
        syms = syms[: a.limit]
    http = H.PoliteSession(min_gap=1.0)
    done = skipped = failed = n = 0
    for i, s in enumerate(syms, 1):
        code = code_of.get(s)
        if not code:
            skipped += 1
            continue
        try:
            k = fetch_one(http, data, s, code, a.quarters, a.years)
            n += k
            done += 1 if k else 0
        except Exception as e:  # noqa: BLE001 - one stock must not stop the rest
            failed += 1
            print(f"  {s}: {e}")
        if i % 20 == 0:
            print(f"  {i} / {len(syms)} stocks, {n} periods saved", flush=True)
    print(f"BSE results: {len(syms)} stocks asked, {done} updated ({n} periods), {skipped} without a BSE code, {failed} failed")
    return 0 if failed <= max(5, len(syms) // 10) else 1


if __name__ == "__main__":
    raise SystemExit(main())
