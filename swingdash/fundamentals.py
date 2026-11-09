"""Fundamentals (Phase S8) from NSE's official XBRL filings - results, balance sheet, cash flow, shareholding.

Sources (all public, see docs/SOURCES.md):
  api/corporates-financial-results?period=Quarterly|Annual   filings up to Dec-2024 (XBRL from ~2017; the Annual list
                                                             also has the balance sheet from ~FY2020)
  api/integrated-filing-results                               "Integrated Filing - Financials" from 2025 (results +
                                                             balance sheet + cash flow in the Q2 / Q4 files)
  api/corporate-share-holdings-master                         shareholding pattern per quarter (XBRL)
  api/event-calendar                                          upcoming board meetings for results
The XBRL files themselves are on nsearchives.nseindia.com (fast, no cookies).

One JSON per stock: data/fundamentals/<SYMBOL>.json
  {"symbol", "kind": company|bank|nbfc|insurance, "updated",
   "C" / "S" (consolidated / standalone): {"q": {quarter end: line items}, "y": {FY end: ...}, "bs": {...}, "cf": {...}},
   "shp": {quarter end: {prom, fii, dii, govt, public, others, n}}, "files": {file name: broadcast day}}
Money in Rs crore, EPS in Rs (as reported: the website / screen adjust it for later splits and bonuses with
share_factors.eps_factor), holdings in %.
"""
from __future__ import annotations

import json
import re
import time
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from .sources import nse

CR = 1e7
INTEGRATED_REF = nse.HOME + "companies-listing/corporate-integrated-filing"
INTEGRATED = "api/integrated-filing-results?index=equities&type=Integrated%20Filing-%20Financials"

_CTX = re.compile(r'<(?:xbrli:)?context\s+id="([^"]+)"\s*>(.*?)</(?:xbrli:)?context>', re.S)
_FACT = re.compile(r'<([\w\-]+):(\w+)\b([^>]*?)(?:/>|>([^<]*)</\1:\2>)', re.S)
_REF = re.compile(r'contextRef="([^"]+)"')
_SKIP_PREFIX = {"xbrli", "link", "xbrldi", "xlink", "iso4217", "xsi"}


# ----------------------------------------------------------------------------------------------------------- XBRL reading
def read_xbrl(text: str) -> dict:
    """{"periods": [{"start", "end", "months", "v": {tag: value}}], "instants": {day: {tag: value}}, "meta": {tag: text}}.
    Only contexts without dimensions (the company totals). A duration context's dates come from its own
    DateOfStart/EndOfReportingPeriod facts when present: in some older files the context dates are wrong."""
    ctx, dims = {}, set()
    for cid, body in _CTX.findall(text):
        if "explicitMember" in body or "typedMember" in body:
            dims.add(cid)
            continue
        p = dict(re.findall(r"<(?:xbrli:)?(startDate|endDate|instant)>\s*([^<\s]+)", body))
        ctx[cid] = p
    facts: dict[str, dict[str, str]] = {}
    for prefix, tag, attrs, val in _FACT.findall(text):
        if prefix in _SKIP_PREFIX:
            continue
        m = _REF.search(attrs)
        if not m or m.group(1) in dims:     # some older files use OneD / FourD without defining them
            continue
        facts.setdefault(m.group(1), {})[tag] = (val or "").strip()
    out = {"periods": [], "instants": {}, "meta": {}}
    fy_start = next((f["DateOfStartOfFinancialYear"] for f in facts.values() if f.get("DateOfStartOfFinancialYear")), "")
    for cid, f in facts.items():
        p = ctx.get(cid, {})
        nums = {k: _num(v) for k, v in f.items()}
        nums = {k: v for k, v in nums.items() if v is not None}
        for k, v in f.items():
            if _num(v) is None and v and len(v) < 120:
                out["meta"].setdefault(k, v)
        if "instant" in p or (not p and cid.endswith("I") and "DateOfStartOfReportingPeriod" not in f):
            if "instant" not in p:
                continue
            out["instants"].setdefault(p["instant"][:10], {}).update(nums)
            continue
        start = f.get("DateOfStartOfReportingPeriod") or p.get("startDate")
        end = f.get("DateOfEndOfReportingPeriod") or p.get("endDate")
        if end and not start and not p:          # files that give only the end day: One = the quarter, Four = year to date
            if cid.startswith("One"):
                start = (pd.Timestamp(end[:10]) - pd.DateOffset(months=3) + pd.Timedelta(days=1)).date().isoformat()
            elif cid.startswith("Four"):
                start = fy_start
        if not start or not end:
            continue
        try:
            d0, d1 = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
        except ValueError:
            continue
        out["periods"].append({"start": d0.isoformat(), "end": d1.isoformat(),
                               "months": round(((d1 - d0).days + 1) / 30.44), "v": nums})
    return out


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def kind_of(x: dict) -> str:
    tags = set()
    for p in x["periods"]:
        tags |= set(p["v"])
    for v in x["instants"].values():
        tags |= set(v)
    if tags & {"NetPremiumIncome", "GrossPremiumIncome", "NetPremiumEarned", "GrossDirectPremium", "PremiumEarnedNet",
               "GrossPremiumsWritten", "NetPremiumWritten", "PremiumEarned"}:
        return "insurance"
    if "InterestExpended" in tags or "InterestEarned" in tags and "Deposits" in tags and "RevenueFromOperations" not in tags:
        return "bank"
    if "InterestEarned" in tags or "ImpairmentOnFinancialInstruments" in tags or "FeesAndCommissionIncome" in tags:
        return "nbfc"
    return "company"


def _first(v: dict, *tags):
    for t in tags:
        if t in v:
            return v[t]
    return None


def _sum(v: dict, *tags):
    got = [v[t] for t in tags if t in v]
    return sum(got) if got else None


def _cr(x):
    return None if x is None else round(x / CR, 2)


def pl_items(v: dict, kind: str) -> dict | None:
    """Normalised P&L of one period (Rs crore). op_profit = sales - expenses (companies) or financing profit
    = sales - interest - expenses (banks / NBFCs). Expenses never include interest and depreciation."""
    if kind == "bank":
        sales = _first(v, "InterestEarned")
        interest = _first(v, "InterestExpended")
        expenses = _sum(v, "OperatingExpenses", "ProvisionsOtherThanTaxAndContingencies")
        dep = None
        pbt = _first(v, "ProfitLossFromOrdinaryActivitiesBeforeTax", "ProfitBeforeTax")
        net = _first(v, "ProfitLossForThePeriod", "ProfitLossForPeriod")
        owners = _first(v, "ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates", "ProfitLossForThePeriod")
        eps = _first(v, "BasicEarningsPerShareAfterExtraordinaryItems", "BasicEarningsPerShareBeforeExtraordinaryItems")
        exceptional = _first(v, "ExceptionalItems")
    elif kind == "insurance":
        sales = _first(v, "NetPremiumIncome", "PremiumEarned", "NetPremiumEarned", "PremiumEarnedNet", "GrossPremiumIncome")
        interest = expenses = dep = exceptional = None
        pbt = _first(v, "ProfitLossBeforeTax", "ProfitOrLossBeforeTax", "ProfitBeforeTax")
        net = _first(v, "ProfitLossAfterTaxAndExtraordinaryItems", "ProfitLossAfterTax", "ProfitLossForPeriod")
        owners = net
        eps = _first(v, "BasicAndDilutedEPSAfterExtraordinaryItemsNetOfTaxExpenseForThePeriodNotToBeAnnualized",
                     "BasicEPSAfterExtraordinaryItems", "BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations")
    else:
        sales = _first(v, "RevenueFromOperations")
        interest = _first(v, "FinanceCosts")
        dep = _first(v, "DepreciationDepletionAndAmortisationExpense")
        total = _first(v, "Expenses")
        expenses = None if total is None else total - (interest or 0) - (dep or 0)
        pbt = _first(v, "ProfitBeforeTax")
        net = _first(v, "ProfitLossForPeriod")
        owners = _first(v, "ProfitOrLossAttributableToOwnersOfParent")
        if owners is None or (owners == 0 and net):
            owners = net
        eps = _first(v, "BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations",
                     "BasicEarningsLossPerShareFromContinuingOperations")
        exceptional = _first(v, "ExceptionalItemsBeforeTax")
    if sales is None and net is None:
        return None
    tax = _first(v, "TaxExpense", "ProvisionForTax", "ProvisionsForTaxes")
    other = _first(v, "OtherIncome", "ShareholdersAccountOtherIncome")
    if kind in ("bank", "nbfc"):
        op = None if sales is None or expenses is None else sales - (interest or 0) - expenses
    else:
        op = None if sales is None or expenses is None else sales - expenses
    out = {"sales": _cr(sales), "expenses": _cr(expenses), "op_profit": _cr(op), "other_income": _cr(other),
           "interest": _cr(interest), "depreciation": _cr(dep), "pbt": _cr(pbt), "tax": _cr(tax), "net_profit": _cr(net),
           "np_owners": _cr(owners), "eps": None if eps is None else round(eps, 2), "exceptional": _cr(exceptional)}
    paid, reserves = _first(v, "PaidUpValueOfEquityShareCapital", "PaidUpEquityShareCapital"), \
        _first(v, "ReserveExcludingRevaluationReserves", "ReservesAndSurplusExcludingRevaluationReserve")
    if paid is not None:
        out["paid_up"] = _cr(paid)
    if reserves is not None:
        out["reserves"] = _cr(reserves)
    fv = _first(v, "FaceValueOfEquityShareCapital")
    if fv:
        out["face_value"] = fv
    return {k: v for k, v in out.items() if v is not None}


def bs_items(v: dict, kind: str) -> dict | None:
    """Balance sheet at one day (Rs crore)."""
    if kind == "bank":
        cap, res = _first(v, "Capital"), _first(v, "ReservesAndSurplus")
        borrow = _first(v, "Borrowings")
        total = _first(v, "CapitalAndLiabilities", "Assets")
        out = {"equity_capital": cap, "reserves": res, "deposits": _first(v, "Deposits"), "borrowings": borrow,
               "other_liabilities": _first(v, "OtherLiabilitiesAndProvisions"), "total": total,
               "fixed_assets": _first(v, "FixedAssets"), "investments": _first(v, "Investments"),
               "advances": _first(v, "Advances"),
               "cash": _sum(v, "CashAndBalancesWithReserveBankOfIndia", "BalancesWithBanksAndMoneyAtCallAndShortNotice")}
        if total is not None:
            out["other_assets"] = total - sum(out[k] or 0 for k in ("fixed_assets", "investments", "advances", "cash"))
    else:
        cap, res = _first(v, "EquityShareCapital"), _first(v, "OtherEquity")
        total = _first(v, "EquityAndLiabilities", "Assets")
        if total is None or cap is None:
            return None
        borrow = _sum(v, "BorrowingsNoncurrent", "BorrowingsCurrent", "Borrowings", "DebtSecurities", "SubordinatedLiabilities")
        deposits = _first(v, "Deposits") if kind == "nbfc" else None
        fixed = _sum(v, "PropertyPlantAndEquipment", "InvestmentProperty", "Goodwill", "OtherIntangibleAssets",
                     "RightOfUseAssets", "BiologicalAssetsOtherThanBearerPlants")
        cwip = _sum(v, "CapitalWorkInProgress", "IntangibleAssetsUnderDevelopment")
        inv = _sum(v, "NoncurrentInvestments", "CurrentInvestments", "InvestmentsAccountedForUsingEquityMethod", "Investments")
        out = {"equity_capital": cap, "reserves": res, "borrowings": borrow, "deposits": deposits, "total": total,
               "fixed_assets": fixed, "cwip": cwip, "investments": inv,
               "cash": _sum(v, "CashAndCashEquivalents", "BankBalanceOtherThanCashAndCashEquivalents"),
               "minority": _first(v, "NonControllingInterest"), "loans": _first(v, "Loans") if kind == "nbfc" else None,
               "inventories": _first(v, "Inventories"), "receivables": _sum(v, "TradeReceivablesCurrent", "TradeReceivablesNoncurrent", "TradeReceivables")}
        out["other_liabilities"] = total - (cap or 0) - (res or 0) - (borrow or 0) - (deposits or 0)
        out["other_assets"] = total - (fixed or 0) - (cwip or 0) - (inv or 0)
    if out.get("total") is None:
        return None
    return {k: _cr(x) for k, x in out.items() if x is not None}


def cf_items(v: dict) -> dict | None:
    cfo = _first(v, "CashFlowsFromUsedInOperatingActivities")
    if cfo is None:
        return None
    capex = _sum(v, "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
                 "PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities", "PurchaseOfIntangibleAssetsUnderDevelopment")
    cfi, cff = _first(v, "CashFlowsFromUsedInInvestingActivities"), _first(v, "CashFlowsFromUsedInFinancingActivities")
    net = _first(v, "IncreaseDecreaseInCashAndCashEquivalents",
                 "IncreaseDecreaseInCashAndCashEquivalentsBeforeEffectOfExchangeRateChanges")
    if net is None and cfi is not None and cff is not None:
        net = cfo + cfi + cff
    out = {"cfo": cfo, "cfi": cfi, "cff": cff, "net": net, "capex": abs(capex) if capex is not None else None}
    out["fcf"] = cfo - (out["capex"] or 0)
    return {k: _cr(x) for k, x in out.items() if x is not None}


def filing(text: str) -> dict:
    """One results file -> {"kind", "basis", "q": {end: items}, "y": {end: items}, "bs": {day: items}, "cf": {end: items},
    "board": board meeting day}. Quarters = 3-month periods, years = 12-month periods (other lengths are skipped)."""
    x = read_xbrl(text)
    kind = kind_of(x)
    nature = (x["meta"].get("NatureOfReportStandaloneConsolidated") or "").lower()
    out = {"kind": kind, "basis": "C" if nature.startswith("consol") else "S", "q": {}, "y": {}, "bs": {}, "cf": {},
           "board": x["meta"].get("DateOfBoardMeetingWhenFinancialResultsWereApproved", "")[:10]}
    for p in x["periods"]:
        key = {3: "q", 12: "y"}.get(p["months"])
        if not key:
            continue
        items = pl_items(p["v"], kind)
        if items:
            out[key][p["end"]] = {**out[key].get(p["end"], {}), **items}
        if key == "y":
            cf = cf_items(p["v"])
            if cf:
                out["cf"][p["end"]] = cf
    for day, v in x["instants"].items():
        b = bs_items(v, kind)
        if b:
            out["bs"][day] = b
    return out


# -------------------------------------------------------------------------------------------------------- shareholding
SHP_GROUPS = {
    "prom": ["ShareholdingOfPromoterAndPromoterGroup"],
    "fii": ["InstitutionsForeign"],
    "fii_old": ["InstitutionsForeignPortfolioInvestor", "ForeignPortfolioInvestor", "ForeignVentureCapitalInvestors",
                "ForeignInstitutionalInvestors"],
    "dii": ["InstitutionsDomestic"],
    "inst_old": ["Institutions"],
    "govt": ["Governments", "Goverments", "CentralGovernmentOrStateGovernmentSOrPresidentOfIndia"],
    "public": ["NonInstitutions"],
    "total": ["ShareholdingPattern", "TotalShareholding", "GrandTotal"],
    "public_all": ["PublicShareholding"],
    "nonpub": ["SharesHeldByNonPromoterNonPublicShareholders", "NonPromoterNonPublicShareholding"],
}


def shareholding(text: str) -> dict | None:
    """Shareholding pattern file -> {"date", "prom", "fii", "dii", "govt", "public", "others", "n"} (%)."""
    ctx_ids = [c for c, _ in _CTX.findall(text)]
    names = {}
    for c in ctx_ids:
        base = re.sub(r"(_ContextI|_ContextD|ContextI|I)$", "", c)
        names[c] = base
    vals: dict[str, dict[str, float]] = {}
    meta = {}
    for prefix, tag, attrs, val in _FACT.findall(text):
        if prefix in _SKIP_PREFIX:
            continue
        m = _REF.search(attrs)
        if not m:
            continue
        cid = m.group(1)
        if tag == "DateOfReport":
            meta["date"] = (val or "").strip()[:10]
        if tag not in ("NumberOfShares", "NumberOfShareholders", "ShareholdingAsAPercentageOfTotalNumberOfShares"):
            continue
        v = _num(val)
        if v is None:
            continue
        vals.setdefault(names.get(cid, cid), {})[tag] = v
    get = lambda grp, t="NumberOfShares": next((vals[n][t] for n in SHP_GROUPS[grp] if n in vals and t in vals[n]), None)
    total = get("total")
    if not total:
        parts = [get("prom"), get("public_all"), get("nonpub")]
        total = sum(p for p in parts if p) or None
    if not total or get("prom") is None and get("public_all") is None:
        return None
    pct = lambda s: None if s is None else round(s / total * 100, 2)
    prom = pct(get("prom")) or 0.0
    fii = get("fii")
    if fii is None:
        olds = [vals[n]["NumberOfShares"] for n in SHP_GROUPS["fii_old"] if n in vals and "NumberOfShares" in vals[n]]
        fii = sum(olds) if olds else None
    dii = get("dii")
    if dii is None and get("inst_old") is not None:
        dii = get("inst_old") - (fii or 0)
    out = {"date": meta.get("date", ""), "prom": prom, "fii": pct(fii) or 0.0, "dii": pct(dii) or 0.0,
           "govt": pct(get("govt")) or 0.0, "public": pct(get("public")) or 0.0}
    out["others"] = round(max(0.0, 100 - sum(out[k] for k in ("prom", "fii", "dii", "govt", "public"))), 2)
    n = get("total", "NumberOfShareholders")
    if n is None:
        n = sum(x for x in (get("prom", "NumberOfShareholders"), get("public_all", "NumberOfShareholders"),
                            get("nonpub", "NumberOfShareholders")) if x)
    out["n"] = int(n) if n else None
    return out


# ------------------------------------------------------------------------------------------------------- NSE file lists
def _day(s: str) -> str:
    """'31-Dec-2024', '30-JUN-2026', '04-Feb-2025 22:54:42' -> ISO day."""
    s = (s or "").strip()
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M", "%d-%b-%Y"):
        try:
            return datetime.strptime(s.title(), fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def _stamp(s: str) -> str:
    """Broadcast time as sortable text 'YYYY-MM-DD HH:MM:SS'."""
    s = (s or "").strip()
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y %H:%M", "%d-%b-%Y"):
        try:
            return datetime.strptime(s.title(), fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return ""


def name_of(url: str) -> str:
    return url.rsplit("/", 1)[-1]


def norm_old(r: dict, period: str) -> dict | None:
    url = r.get("xbrl") or ""
    if not url.lower().endswith(".xml"):
        return None
    return {"url": url, "qe": _day(r.get("toDate", "")), "basis": "C" if r.get("consolidated") == "Consolidated" else "S",
            "list": period, "at": _stamp(r.get("broadCastDate") or r.get("filingDate") or ""), "symbol": r.get("symbol", "")}


def norm_integrated(r: dict) -> dict | None:
    url = r.get("xbrl") or ""
    if not url.lower().endswith(".xml"):
        return None
    return {"url": url, "qe": _day(r.get("qe_Date", "")), "basis": "C" if r.get("consolidated") == "Consolidated" else "S",
            "list": "integrated", "at": _stamp(r.get("broadcast_Date") or r.get("creation_Date") or ""),
            "symbol": r.get("symbol", "")}


def norm_shp(r: dict) -> dict | None:
    url = r.get("xbrl") or ""
    if not url.lower().endswith(".xml"):
        return None
    return {"url": url, "qe": _day(r.get("date", "")), "list": "shp", "at": _stamp(r.get("broadcastDate") or ""),
            "symbol": r.get("symbol", "")}


def _rows(j):
    j = j.get("data", j) if isinstance(j, dict) else j
    return j if isinstance(j, list) else []


def list_filings(http, symbol: str) -> dict[str, list[dict]]:
    """All result / shareholding files NSE lists for one stock."""
    s = symbol.replace("&", "%26")
    out = {"results": [], "annual": [], "shp": []}
    for period in ("Quarterly", "Annual"):
        rows = _rows(nse.api_json(http, f"api/corporates-financial-results?index=equities&symbol={s}&period={period}"))
        out["results" if period == "Quarterly" else "annual"] += [x for x in (norm_old(r, period.lower()) for r in rows) if x]
    rows = _rows(nse.api_json(http, f"{INTEGRATED}&symbol={s}&page=1&size=60", referer=INTEGRATED_REF))
    out["results"] += [x for x in map(norm_integrated, rows) if x]
    rows = _rows(nse.api_json(http, f"api/corporate-share-holdings-master?index=equities&symbol={s}"))
    out["shp"] = [x for x in map(norm_shp, rows) if x]
    return out


def choose(lists: dict, n_quarters: int = 12, n_years: int = 10, n_shp: int = 12) -> list[dict]:
    """The files to read: the newest version of every (quarter, basis) of the last n_quarters quarters, the Annual-list
    file of each older year (it carries the balance sheet), and the last n_shp shareholding files."""
    def newest(rows):
        best = {}
        for r in rows:
            k = (r["qe"], r.get("basis"))
            if r["qe"] and (k not in best or (r["list"] == "integrated", r["at"]) > (best[k]["list"] == "integrated", best[k]["at"])):
                best[k] = r
        return best
    q = newest(lists["results"])
    ends = sorted({k[0] for k in q}, reverse=True)[:n_quarters]
    picked = [q[k] for k in q if k[0] in ends]
    integrated = {k for k, r in q.items() if r["list"] == "integrated"}   # their Q2 / Q4 files carry BS + cash flow
    a = newest(lists["annual"])
    years = sorted({k[0] for k in a}, reverse=True)[:n_years]
    picked += [a[k] for k in a if k[0] in years and k not in integrated]
    # a year the Annual list lacks: its 4th-quarter file has the 12-month P&L too
    fy_month = max(years)[5:7] if years else "03"
    first = f"{int(ends[0][:4]) - n_years}-00" if ends else "9999"
    older = {k: r for k, r in q.items() if k[0] not in ends and k[0][5:7] == fy_month and k[0] > first and k not in a}
    picked += list(older.values())
    s = {}
    for r in lists["shp"]:
        if r["qe"][5:] not in ("03-31", "06-30", "09-30", "12-31"):     # extra filings (e.g. after a QIP): skip
            continue
        if r["qe"] and (r["qe"] not in s or r["at"] > s[r["qe"]]["at"]):
            s[r["qe"]] = r
    picked += [s[k] for k in sorted(s, reverse=True)[:n_shp]]
    return picked


# ----------------------------------------------------------------------------------------------------- the stock file
def empty(symbol: str) -> dict:
    return {"symbol": symbol, "kind": "", "updated": "", "C": {}, "S": {}, "shp": {}, "files": {}}


def path_of(data: Path, symbol: str) -> Path:
    return data / "fundamentals" / f"{symbol}.json"


def load(data: Path, symbol: str) -> dict:
    p = path_of(data, symbol)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return empty(symbol)


def save(data: Path, doc: dict) -> None:
    p = path_of(data, doc["symbol"])
    p.parent.mkdir(parents=True, exist_ok=True)
    for b in ("C", "S"):
        for part in ("q", "y", "bs", "cf"):
            if part in doc.get(b, {}):
                doc[b][part] = dict(sorted(doc[b][part].items()))
    doc["shp"] = dict(sorted(doc.get("shp", {}).items()))
    p.write_text(json.dumps(_finite(doc), separators=(",", ":"), ensure_ascii=False, sort_keys=False, allow_nan=False) + "\n",
                 encoding="utf-8", newline="\n")


def _finite(x):
    """NaN / infinity become null (browsers cannot read NaN in JSON)."""
    if isinstance(x, dict):
        return {k: _finite(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_finite(v) for v in x]
    if isinstance(x, float) and (x != x or x in (float("inf"), float("-inf"))):
        return None
    return x


def check_docs(data: Path) -> list[dict]:
    """Data check of data/fundamentals/*.json: readable JSON, the right symbol, no NaN; a stock document of more than 1 MB
    is suspicious (warning)."""
    out = []
    issue = lambda sym, level, check, detail: {"instrument": sym, "level": level, "check": check, "detail": detail, "date": ""}

    def no_nan(c):
        raise ValueError(f"{c} in the file")
    for f in sorted((data / "fundamentals").glob("*.json")):
        text = f.read_text(encoding="utf-8")
        try:
            doc = json.loads(text, parse_constant=no_nan)
        except ValueError as exc:
            out.append(issue(f.stem, "error", "fundamentals_json", f"not readable: {str(exc)[:80]}"))
            continue
        if doc.get("symbol") != f.stem:
            out.append(issue(f.stem, "error", "fundamentals_symbol", f"file says {doc.get('symbol')}"))
        if len(text) > 1_000_000:
            out.append(issue(f.stem, "warn", "fundamentals_size", f"{len(text) // 1000} kB"))
    return out


def merge_filing(doc: dict, f: dict, ref: dict) -> None:
    """Put one parsed results file into the stock document. A later broadcast of the same period replaces the earlier
    one (revised results); a quarter keeps its announcement day ("ann")."""
    if f["kind"] and (not doc.get("kind") or doc["kind"] == "company"):
        doc["kind"] = f["kind"]
    b = doc.setdefault(f["basis"], {})
    at = ref.get("at", "")
    ann = (f.get("board") or at[:10]) if ref.get("list") != "annual" else ""
    for part in ("q", "y", "bs", "cf"):
        dest = b.setdefault(part, {})
        for end, items in f[part].items():
            old = dest.get(end)
            if old and old.get("_at", "") > at:
                continue
            new = {**(old or {}), **items, "_at": at}
            if part in ("q", "y") and end == ref.get("qe") and ann:
                new["ann"] = ann
            dest[end] = new


def fetch_file(http, url: str) -> str:
    """One XBRL file. Short timeout and 2 tries: a file the archive does not serve now is read again next run."""
    r = http.request("GET", url, retries=2, timeout=25)
    if r.status_code != 200:
        raise nse.SourceError(f"{name_of(url)}: HTTP {r.status_code}")
    return r.text


def update_stock(http, data: Path, symbol: str, today: date, lists: dict | None = None, log=print) -> dict:
    """Read every chosen file this stock's document has not seen yet. Returns {"new": files read, "failed": n}."""
    doc = load(data, symbol)
    lists = lists if lists is not None else list_filings(http, symbol)
    new = failed = 0
    for ref in choose(lists):
        name = name_of(ref["url"])
        if name in doc["files"]:
            continue
        try:
            text = fetch_file(http, ref["url"])
            if ref["list"] == "shp":
                s = shareholding(text)
                if s:
                    day = ref["qe"] or s.pop("date", "")
                    s.pop("date", None)
                    doc["shp"][day] = s
            else:
                merge_filing(doc, filing(text), ref)
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the stock
            if "HTTP 404" in str(exc):          # NSE lists it but does not have it: never ask again
                doc["files"][name] = "404"
                continue
            failed += 1
            log(f"  {symbol} {name}: {type(exc).__name__} {str(exc)[:80]}")
            continue
        doc["files"][name] = ref["at"][:10]
        new += 1
    doc["updated"] = today.isoformat()
    fix_eps(doc)
    save(data, doc)
    return {"new": new, "failed": failed}


# ------------------------------------------------------------------------------------------------------------- jobs
def backfill(data: Path, http, universe: pd.DataFrame, today: date, deadline: float, cp_path: Path,
             refresh_days: int = 120, log=print, clock=time.monotonic, only: list[str] | None = None) -> dict:
    """First full read per stock: Nifty 500 first, then the rest. Checkpoint {symbol: day} = stocks done; a stock is read
    again after refresh_days (catches anything the daily step missed)."""
    cp = json.loads(cp_path.read_text(encoding="utf-8")) if cp_path.exists() else {}
    uni = universe.copy()
    n5 = uni["n500"] if "n500" in uni else pd.Series(False, index=uni.index)
    uni["_n5"] = n5.astype(str).str.lower().isin(["true", "1", "yes"])
    uni = uni.sort_values(["_n5", "symbol"], ascending=[False, True])
    todo = [s for s in uni["symbol"] if (only is None or s in only) and
            (s not in cp or (today - date.fromisoformat(cp[s])).days >= refresh_days)]
    done = files = failed = 0
    stopped = ""
    for sym in todo:
        if clock() > deadline:
            stopped = "time limit"
            break
        try:
            res = update_stock(http, data, sym, today, log=log)
        except Exception as exc:  # noqa: BLE001 - the NSE list API failed: try the next stock, keep no checkpoint
            failed += 1
            log(f"fundamentals {sym}: {type(exc).__name__} {str(exc)[:100]}")
            if failed >= 25 and done == 0:
                stopped = f"NSE not answering ({type(exc).__name__})"
                break
            continue
        done += 1
        files += res["new"]
        if res["failed"] == 0:
            cp[sym] = today.isoformat()
        cp_path.parent.mkdir(parents=True, exist_ok=True)
        if done % 10 == 0:
            cp_path.write_text(json.dumps(cp, indent=0, sort_keys=True) + "\n", encoding="utf-8")
            log(f"fundamentals: {done}/{len(todo)} stocks, {files} files")
    cp_path.parent.mkdir(parents=True, exist_ok=True)
    cp_path.write_text(json.dumps(cp, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    res = {"stocks": done, "files": files, "errors": failed, "left": len(todo) - done, "stopped": stopped,
           "covered": len(cp)}
    log(f"fundamentals backfill: {res}")
    return res


def recent_results(http, since: str, max_pages: int = 15, size: int = 100) -> list[dict]:
    """Integrated filings of ALL companies broadcast at or after `since` ('YYYY-MM-DD HH:MM:SS'), newest first."""
    out = []
    for page in range(1, max_pages + 1):
        rows = _rows(nse.api_json(http, f"{INTEGRATED}&page={page}&size={size}", referer=INTEGRATED_REF))
        got = [x for x in map(norm_integrated, rows) if x]
        out += [r for r in got if r["at"] >= since]
        if len(rows) < size or (got and min(r["at"] for r in got) < since):
            break
    return out


def daily(data: Path, http, universe: pd.DataFrame, today: date, cp_path: Path, deadline: float = float("inf"),
          log=print, clock=time.monotonic) -> dict:
    """Daily step: new results files (all companies, since the last run), new shareholding patterns, the results calendar.
    Only stocks that already have a document (the backfill makes the first one)."""
    cp = json.loads(cp_path.read_text(encoding="utf-8")) if cp_path.exists() else {}
    have = {p.stem for p in (data / "fundamentals").glob("*.json")}
    syms = set(universe["symbol"]) & have
    since = cp.get("_since", (pd.Timestamp(today) - pd.Timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"))
    res = {"results_files": 0, "shp_files": 0, "calendar": 0, "stopped": ""}
    try:
        recent = recent_results(http, since)
    except Exception as exc:  # noqa: BLE001
        res["stopped"] = f"results list: {type(exc).__name__}"
        recent = []
    by_sym: dict[str, list] = {}
    for r in recent:
        if r["symbol"] in syms:
            by_sym.setdefault(r["symbol"], []).append(r)
    complete = not res["stopped"]
    missed: list[str] = []                    # broadcast times of files NSE did not serve yet (just published)
    for sym, refs in sorted(by_sym.items()):
        if clock() > deadline:
            res["stopped"], complete = "time limit", False
            break
        doc = load(data, sym)
        for ref in sorted(refs, key=lambda r: r["at"]):
            if name_of(ref["url"]) in doc["files"]:
                continue
            try:
                merge_filing(doc, filing(fetch_file(http, ref["url"])), ref)
            except Exception as exc:  # noqa: BLE001
                log(f"  {sym} {name_of(ref['url'])}: {type(exc).__name__}")
                missed.append(ref["at"])
                continue
            doc["files"][name_of(ref["url"])] = ref["at"][:10]
            res["results_files"] += 1
        doc["updated"] = today.isoformat()
        fix_eps(doc)
        save(data, doc)
    try:
        latest = [x for x in map(norm_shp, _rows(nse.api_json(http, "api/corporate-share-holdings-master?index=equities"))) if x]
    except Exception as exc:  # noqa: BLE001
        latest = []
        res["stopped"] = res["stopped"] or f"shareholding list: {type(exc).__name__}"
    for ref in latest:
        if ref["symbol"] not in syms or clock() > deadline:
            continue
        doc = load(data, ref["symbol"])
        if name_of(ref["url"]) in doc["files"] or (ref["qe"] in doc["shp"] and ref["at"][:10] <= max((v for v in doc["files"].values() if v != "404"), default="")):
            continue
        try:
            s = shareholding(fetch_file(http, ref["url"]))
        except Exception:  # noqa: BLE001
            continue
        if s:
            s.pop("date", None)
            doc["shp"][ref["qe"]] = s
            doc["files"][name_of(ref["url"])] = ref["at"][:10]
            save(data, doc)
            res["shp_files"] += 1
    try:
        cal = _rows(nse.api_json(http, "api/event-calendar?index=equities"))
        res["calendar"] = write_calendar(data, cal, today)
    except Exception as exc:  # noqa: BLE001
        log(f"results calendar: {type(exc).__name__}")
    if complete:      # next run starts at the oldest file still missing, else at the newest filing seen
        new = min(missed) if missed else max([r["at"] for r in recent], default=since)
        cp["_since"] = max(new, since)
        res["missing_files"] = len(missed)
    cp_path.parent.mkdir(parents=True, exist_ok=True)
    cp_path.write_text(json.dumps(cp, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    log(f"fundamentals daily: {res}")
    return res


def write_calendar(data: Path, rows: list[dict], today: date) -> int:
    """data/meta/results_calendar.csv: symbol, date (board meeting for results), purpose. Upcoming days only; days
    already passed are kept 7 days so a late run still knows the day."""
    p = data / "meta" / "results_calendar.csv"
    old = pd.read_csv(p, dtype=str) if p.exists() else pd.DataFrame(columns=["symbol", "date", "purpose"])
    new = pd.DataFrame([{"symbol": r.get("symbol", ""), "date": _day(r.get("date", "")), "purpose": (r.get("purpose") or "")[:80]}
                        for r in rows if "result" in (r.get("purpose") or "").lower()])
    allr = pd.concat([old, new], ignore_index=True).dropna(subset=["date"])
    allr = allr[allr["date"] >= (pd.Timestamp(today) - pd.Timedelta(days=7)).strftime("%Y-%m-%d")]
    allr = allr.drop_duplicates(["symbol", "date"], keep="last").sort_values(["date", "symbol"])
    p.parent.mkdir(parents=True, exist_ok=True)
    allr.to_csv(p, index=False, lineterminator="\n")
    return len(allr)


# ------------------------------------------------------------------------------------------------------- clean-up
def fix_eps(doc: dict) -> None:
    """Some filings repeat the 4th quarter's EPS in the year column (seen in bank files of 2018-2023). When the year's EPS
    equals that quarter's EPS while the year's profit is clearly bigger, it is recomputed from the profit and the
    quarter's share count (marked "eps_fixed"). Nothing else is touched (a bonus inside the year changes the counts)."""
    for b in ("C", "S"):
        q, y = doc.get(b, {}).get("q", {}), doc.get(b, {}).get("y", {})
        for end, it in y.items():
            q4 = q.get(end)
            eps, np_ = it.get("eps"), it.get("np_owners", it.get("net_profit"))
            if not q4 or eps is None or not np_ or not q4.get("eps") or not q4.get("np_owners"):
                continue
            if abs(eps - q4["eps"]) <= 0.01 * max(abs(eps), 0.01) and np_ / q4["np_owners"] > 2:
                it["eps"], it["eps_fixed"] = round(np_ / (q4["np_owners"] / q4["eps"]), 2), True


# ------------------------------------------------------------------------------------------------------- ratios
def basis_of(doc: dict) -> str:
    """Consolidated when it is as recent as standalone (some companies stop filing consolidated results)."""
    last = lambda b: max(doc.get(b, {}).get("q", {}) or [""])
    c, s = last("C"), last("S")
    return "C" if c and c >= s else ("S" if s else "C")


def _known(items: dict, as_of: str | None, lag_days: int = 60) -> dict:
    """Periods announced on or before as_of (no announcement day: period end + lag_days)."""
    if not as_of:
        return dict(sorted(items.items()))
    out = {}
    for end, v in sorted(items.items()):
        ann = v.get("ann") or (pd.Timestamp(end) + pd.Timedelta(days=lag_days)).strftime("%Y-%m-%d")
        if ann <= as_of:
            out[end] = v
    return out


def _months(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def _growth(new, old):
    if new is None or old is None or old <= 0:
        return None
    return round((new / old - 1) * 100, 2)


def _cagr(new, old, years):
    if new is None or old is None or old <= 0 or new <= 0:
        return None
    return round(((new / old) ** (1 / years) - 1) * 100, 2)


def _r(x, nd=2):
    return None if x is None else round(x, nd)


def net_worth(b: dict, end: str) -> float | None:
    bs = b.get("bs", {}).get(end)
    if bs and bs.get("equity_capital") is not None and bs.get("reserves") is not None:
        return bs["equity_capital"] + bs["reserves"]
    y = b.get("y", {}).get(end, {})
    if y.get("paid_up") is not None and y.get("reserves") is not None:
        return y["paid_up"] + y["reserves"]
    return None


def year_roe(b: dict, years: list[str], i: int) -> float | None:
    end = years[i]
    v = b["y"][end]
    np_ = v.get("net_profit", v.get("np_owners"))
    nw1 = net_worth(b, end)                  # year-end net worth (calibrated 09-Nov: 86 % equal; average of two years 55 %)
    return None if np_ is None or not nw1 or nw1 <= 0 else np_ / nw1 * 100


def _streak(values: list) -> int:
    """How many of the latest values in a row are higher than the value before them (None breaks the run)."""
    n = 0
    for i in range(len(values) - 1, 0, -1):
        if values[i] is None or values[i - 1] is None or not values[i] > values[i - 1]:
            break
        n += 1
    return n


def quarter_trends(q: dict, qe: list[str], eps, npo) -> dict:
    """Phase S9 earnings-scanner inputs from the quarters in a row (no gaps) ending with the latest:
    *_g_accel_qtrs = latest quarters in a row whose YoY growth beat the previous quarter's YoY growth,
    npm_up_qtrs = latest quarters in a row with a higher net margin than the quarter before,
    np_qoq_up_qtrs / sales_qoq_up_qtrs = latest quarters in a row higher than the quarter before."""
    run = [qe[-1]] if qe else []
    for e in reversed(qe[:-1]):
        if _months(e, run[0]) != 3:
            break
        run.insert(0, e)
    ago = lambda e: next((x for x in qe if _months(x, e) == 12), None)
    yoy = lambda f: [(_growth(f(e, q[e]), f(a, q[a])) if (a := ago(e)) else None) for e in run]
    sales = lambda e, v: v.get("sales")
    npm = [(npo(q[e]) / q[e]["sales"] * 100) if q[e].get("sales") and q[e]["sales"] > 0 and npo(q[e]) is not None else None
           for e in run]
    ye_eps, ye_sales = yoy(eps), yoy(sales)
    out = {}
    for i in (1, 2, 3):                                  # q3 = the latest quarter, q1 = two quarters before it
        if len(run) >= 4 - i:
            k = len(run) - (4 - i)
            out[f"sales_g_q{i}"], out[f"eps_g_q{i}"] = ye_sales[k], ye_eps[k]
            out[f"npm_q{i}"] = None if npm[k] is None else _r(npm[k])
    a3 = ago(run[-1]) if run else None
    if a3:
        out["eps_year_ago_q"] = eps(a3, q[a3])
    out.update({"eps_g_accel_qtrs": _streak(ye_eps), "sales_g_accel_qtrs": _streak(ye_sales), "npm_up_qtrs": _streak(npm),
           "np_qoq_up_qtrs": _streak([npo(q[e]) for e in run]), "sales_qoq_up_qtrs": _streak([sales(e, q[e]) for e in run])})
    if run:
        last, a = run[-1], ago(run[-1])
        out["np_last_q"] = npo(q[last])
        out["sales_last_q"] = q[last].get("sales")
        if npm[-1] is not None:
            out["npm_last_q"] = _r(npm[-1])
        if a:
            out["np_year_ago_q"] = npo(q[a])
            out["sales_year_ago_q"] = q[a].get("sales")
    return out


def metrics(doc: dict, close: float | None, mcap_cr: float | None, as_of: str | None = None,
            factor=lambda end: 1.0, dividends: list[tuple[str, float]] | None = None,
            next_result: str | None = None) -> dict:
    """Screen fields of one stock (config/fields.yaml, phase 8). factor(period_end) adjusts a per-share number for later
    splits / bonuses; dividends = [(ex day, Rs per share as paid)]; as_of = only what was announced by then."""
    out: dict = {}
    if not doc or not (doc.get("C") or doc.get("S")):
        return out
    ok = lambda x: x is not None and x == x and x not in (float("inf"), float("-inf"))
    close = close if ok(close) and close > 0 else None
    mcap_cr = mcap_cr if ok(mcap_cr) and mcap_cr > 0 else None
    bk = basis_of(doc)
    b = doc.get(bk, {})
    q = _known(b.get("q", {}), as_of)
    y = _known(b.get("y", {}), as_of)
    kind = doc.get("kind") or "company"
    out["fin_basis"] = "Consolidated" if bk == "C" else "Standalone"
    out["fin_kind"] = kind
    qe = list(q)
    # a split / bonus before the results were approved is already in the reported EPS (Ind AS 33): adjust from that day
    eps = lambda e, v: None if v.get("eps") is None else v["eps"] * factor(v.get("ann") or e)
    npo = lambda v: v.get("net_profit", v.get("np_owners"))   # PAT incl. minority (reference: 92 % equal, owners' 68 %)
    if qe:
        out["fin_qtr"] = qe[-1]
        ann = q[qe[-1]].get("ann")
        out["last_result"] = ann
        if ann and as_of:
            out["days_since_result"] = (pd.Timestamp(as_of) - pd.Timestamp(ann)).days

    def ttm(ends):
        if len(ends) < 4 or _months(ends[-4], ends[-1]) != 9:
            return None
        rows = [(e, q[e]) for e in ends[-4:]]
        tot = lambda f: None if any(f(e, r) is None for e, r in rows) else sum(f(e, r) for e, r in rows)
        ebitda = lambda e, r: None if r.get("pbt") is None else \
            r["pbt"] + (r.get("interest") or 0) + (r.get("depreciation") or 0) - (r.get("other_income") or 0)
        return {"sales": tot(lambda e, r: r.get("sales")), "np": tot(lambda e, r: npo(r)),
                "op": tot(ebitda), "eps": tot(eps)}
    t = ttm(qe)
    if t is None and y:                                   # quarters incomplete: the last full year
        ye0 = list(y)[-1]
        if not qe or ye0 >= qe[-1]:
            v = y[ye0]
            op = None if v.get("pbt") is None else \
                v["pbt"] + (v.get("interest") or 0) + (v.get("depreciation") or 0) - (v.get("other_income") or 0)
            t = {"sales": v.get("sales"), "np": npo(v), "op": op, "eps": eps(ye0, v)}
    if t:
        out["sales_ttm"], out["np_ttm"], out["eps_ttm"] = _r(t["sales"]), _r(t["np"]), _r(t["eps"])
        if t["sales"] and t["sales"] > 0:
            out["opm_ttm"] = _r(t["op"] / t["sales"] * 100) if t["op"] is not None else None
            out["npm_ttm"] = _r(t["np"] / t["sales"] * 100) if t["np"] is not None else None
        if close and t["eps"] and t["eps"] > 0:
            out["pe"] = _r(close / t["eps"])
        elif mcap_cr and t["np"] and t["np"] > 0 and t["eps"] is None:
            out["pe"] = _r(mcap_cr / t["np"])
        t_prev = ttm(qe[:-4]) if len(qe) >= 8 else None
        if t_prev and _months(qe[-5], qe[-1]) == 12:
            out["sales_g_ttm"], out["np_g_ttm"] = _growth(t["sales"], t_prev["sales"]), _growth(t["np"], t_prev["np"])
    if qe:
        e0, v0 = qe[-1], q[qe[-1]]
        prev = qe[-2] if len(qe) > 1 and _months(qe[-2], e0) == 3 else None
        ago = next((e for e in qe if _months(e, e0) == 12), None)
        for k, f in (("sales", lambda e, v: v.get("sales")), ("np", lambda e, v: npo(v)), ("eps", eps)):
            if ago:
                out[f"{k}_g_yoy"] = _growth(f(e0, v0), f(ago, q[ago]))
            if prev:
                out[f"{k}_g_qoq"] = _growth(f(e0, v0), f(prev, q[prev]))
        for k, f in (("eps", eps), ("sales", lambda e, v: v.get("sales"))):
            n = 0
            for i in range(len(qe) - 1, -1, -1):
                a = next((e for e in qe if _months(e, qe[i]) == 12), None)
                g = _growth(f(qe[i], q[qe[i]]), f(a, q[a])) if a else None
                if g is None or g <= 0:
                    break
                n += 1
            out[f"{k}_up_qtrs"] = n
        out["eps_last_q"] = _r(eps(e0, v0))
        out.update(quarter_trends(q, qe, eps, npo))
    ye = list(y)
    if ye:
        last = ye[-1]
        out["fin_year"] = last
        for n in (3, 5, 10):
            old = next((e for e in ye if _months(e, last) == 12 * n), None)
            if old:
                out[f"sales_cagr_{n}y"] = _cagr(y[last].get("sales"), y[old].get("sales"), n)
                out[f"np_cagr_{n}y"] = _cagr(npo(y[last]), npo(y[old]), n)
                if n == 3:
                    out["eps_cagr_3y"] = _cagr(eps(last, y[last]), eps(old, y[old]), n)
        roes = [year_roe(b, ye, i) for i in range(len(ye))]
        out["roe"] = _r(roes[-1])
        for n in (3, 5, 10):
            got = [r for r in roes[-n:] if r is not None]
            if len(roes) >= n and len(got) == n and _months(ye[-n], last) == 12 * (n - 1):
                out[f"roe_{n}y"] = _r(sum(got) / n)
        if kind in ("company", "nbfc"):
            def cap_employed(end):
                nw, bs = net_worth(b, end), b.get("bs", {}).get(end)
                return None if nw is None or not bs or bs.get("borrowings") is None else nw + bs["borrowings"]
            v = y[last]
            ebit = None if v.get("pbt") is None else v["pbt"] + (v.get("interest") or 0)
            c1 = cap_employed(last)
            cap = c1
            if ebit is not None and cap and cap > 0:
                out["roce"] = _r(ebit / cap * 100)
    bse = sorted(e for e in b.get("bs", {})
                 if not as_of or (pd.Timestamp(e) + pd.Timedelta(days=60)).strftime("%Y-%m-%d") <= as_of)
    nw_now = None
    if bse:
        bs = b["bs"][bse[-1]]
        nw_now = net_worth(b, bse[-1])
        if nw_now and nw_now > 0 and bs.get("borrowings") is not None and kind in ("company", "nbfc"):
            out["debt_equity"] = _r(bs["borrowings"] / nw_now)
    if nw_now is None and ye:
        nw_now = net_worth(b, ye[-1])
    if nw_now and nw_now > 0 and mcap_cr:
        out["pb"] = _r(mcap_cr / nw_now)
        if close:
            out["book_value"] = _r(close / out["pb"]) if out["pb"] else None
    growth = out.get("eps_g_yoy")                        # calibrated 09-Nov: PE / latest quarter's EPS growth YoY
    if out.get("pe") and growth and growth > 0:
        out["peg"] = _r(out["pe"] / growth)
    if dividends is not None and close:
        day = pd.Timestamp(as_of) if as_of else pd.Timestamp.today().normalize()
        dps = sum(a * factor(d) for d, a in dividends if day - pd.Timedelta(days=365) < pd.Timestamp(d) <= day)
        out["div_yield"] = _r(dps / close * 100)
    sh = {e: v for e, v in sorted(doc.get("shp", {}).items())
          if not as_of or (pd.Timestamp(e) + pd.Timedelta(days=21)).strftime("%Y-%m-%d") <= as_of}
    se = list(sh)
    if se:
        cur = sh[se[-1]]
        out["shp_qtr"] = se[-1]
        for k in ("prom", "fii", "dii", "public", "govt"):
            out[f"{k}_hold"] = cur.get(k)
        p1 = next((e for e in reversed(se[:-1]) if _months(e, se[-1]) == 3), None)
        p4 = next((e for e in se if _months(e, se[-1]) == 12), None)
        for k in ("prom", "fii", "dii"):
            if p1:
                out[f"{k}_chg_1q"] = _r(cur.get(k, 0) - sh[p1].get(k, 0))
            if p4:
                out[f"{k}_chg_1y"] = _r(cur.get(k, 0) - sh[p4].get(k, 0))
        out["shareholders"] = cur.get("n")
        if p1 and cur.get("n") and sh[p1].get("n"):
            out["shareholders_chg_1q"] = _growth(cur["n"], sh[p1]["n"])
    if next_result:
        out["next_result"] = next_result
        if as_of:
            out["days_to_result"] = (pd.Timestamp(next_result) - pd.Timestamp(as_of)).days
    return {k: v for k, v in out.items() if v is not None}


def dividends_of(data: Path, symbol: str) -> list[tuple[str, float]]:
    p = data / "corporate_actions" / f"{symbol}.csv"
    if not p.exists():
        return []
    try:
        ca = pd.read_csv(p, dtype=str)
    except (ValueError, OSError):
        return []
    ca = ca[ca["type"] == "dividend"]
    amt = pd.to_numeric(ca["amount"], errors="coerce")
    return [(d, float(a)) for d, a in zip(ca["ex_date"], amt) if pd.notna(a) and a > 0]


def next_results(data: Path, as_of: str) -> dict[str, str]:
    p = data / "meta" / "results_calendar.csv"
    if not p.exists():
        return {}
    cal = pd.read_csv(p, dtype=str).dropna(subset=["date"])
    cal = cal[cal["date"] >= as_of].sort_values("date")
    return dict(cal.drop_duplicates("symbol")[["symbol", "date"]].itertuples(index=False, name=None))


def screen_fields(data: Path, rows: list[dict], as_of: str | None = None) -> dict[str, dict]:
    """{stock id: phase-8 fields} for the screen rows (each row needs id, symbol, close, mcap_cr, date)."""
    from . import share_factors
    sf_path = data / "meta" / "share_factors.csv"
    table = pd.read_csv(sf_path, dtype=str) if sf_path.exists() else pd.DataFrame(columns=["symbol", "applied", "factor"])
    by_sym = {s: g for s, g in table.groupby("symbol")}
    day = as_of or max((str(r.get("date") or "")[:10] for r in rows), default="")
    cal = next_results(data, day) if day else {}
    out = {}
    for r in rows:
        sym = r.get("symbol") or ""
        p = path_of(data, sym)
        if not sym or not p.exists():
            continue
        doc = load(data, sym)
        t = by_sym.get(sym)
        factor = (lambda end, t=t: 1.0) if t is None else (lambda end, t=t: share_factors.eps_factor(t, sym, end))
        try:
            out[r["id"]] = metrics(doc, r.get("close"), _num(r.get("mcap_cr")), as_of=day or None, factor=factor,
                                   dividends=dividends_of(data, sym), next_result=cal.get(sym))
        except Exception:  # noqa: BLE001 - one odd document must not stop the screen
            continue
    return out
