"""Company announcements filed with NSE (exchange filings: results, con-calls, orders, management, corporate actions ...).

Source: www.nseindia.com/api/corporate-announcements?index=equities&from_date=DD-MM-YYYY&to_date=DD-MM-YYYY (the
"Corporate filings - announcements" page; ~1,000-1,500 filings a day). The daily job reads the last 3 days, the backfill
job any range day by day. Kept in data/announcements/YYYY-MM/DD.csv (one file per day, 13 months), routine filings (newspaper copies, trading
window, ...) left out. Our own category letter per filing (CATS). Only the exchange's own short text is kept, plus the
link to the company's PDF on nsearchives.nseindia.com - no news from other sites.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from swingdash.sources import nse

REFERER = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
COLS = ["dt", "symbol", "cat", "desc", "about", "url", "seq"]
PDF_BASE = "https://nsearchives.nseindia.com/corporate/"
# our categories: letter, name
CATS = {"E": "Results", "K": "Con-call / investor meet", "O": "Orders & business", "D": "Deals & expansion", "C": "Corporate action",
        "F": "Fund raising", "M": "Management", "R": "Regulatory & legal", "A": "Credit rating", "P": "Press release & updates"}
SKIP = re.compile(r"newspaper|trading window|monitoring agency|esop|esos|esps|statement of deviation|shareholders meeting|"
                  r"certificate under sebi|loss of share|duplicate share|compliance certificate|reg\. ?74|closure of trading|"
                  r"spurt in volume|price movement|committee meeting|alteration|amendment to aoa|record date for interest", re.I)
RULES = [  # first match wins: (category, pattern on NSE's subject + text)
    ("K", r"analyst|investor meet|con\. ?call|conference call|earnings? call|investor presentation|transcript|recording"),
    ("E", r"financial result|outcome of board meeting|integrated filing- ?financial|results"),
    ("C", r"dividend|bonus|split|buy ?back|record date|rights issue|book closure|sub-division|consolidation of shares"),
    ("F", r"issue of securities|allotment|qip|preferential|fund raising|private placement|ncd|debenture|warrant|open offer"),
    ("O", r"order|contract|bagging|receiving|capacity|commencement of commercial|new line|production|tie up|marketing|business update"),
    ("D", r"acquisition|amalgamation|merger|scheme of arrangement|joint venture|agreement|memorandum|mou|sale or disposal|disinvest|"
          r"investment|subsidiar|incorporation"),
    ("M", r"appointment|resignation|cessation|change in director|change in management|retirement|kmp|company secretary|auditor|ceo|cfo"),
    ("R", r"litigation|penalt|regulator|action\(s\) taken|orders passed|show cause|tax|gst|insolvency|default|fraud|sebi|search|"
          r"licen[cs]e|approval|disclosure of material issue"),
    ("A", r"credit rating|rating"),
    ("P", r"press release|general update|updates|clarification|disclosure"),
]


def path(data: Path, day: str) -> Path:
    return data / "announcements" / day[:7] / f"{day[8:10]}.csv"


def classify(desc: str, text: str) -> str | None:
    """Our category letter, or None for routine filings we leave out."""
    s = f"{desc} {text}"
    if SKIP.search(desc or ""):
        return None
    for cat, pat in RULES:
        if re.search(pat, s, re.I):
            return cat
    return "P"


def parse(rows) -> pd.DataFrame:
    """API rows -> our table (dt = 'YYYY-MM-DD HH:MM', about = what the filing says it is about, url relative to PDF_BASE)."""
    out = []
    for r in rows if isinstance(rows, list) else []:
        sym, desc = str(r.get("symbol") or "").strip(), str(r.get("desc") or "").strip()
        text = str(r.get("attchmntText") or "").strip()
        dt = pd.to_datetime(str(r.get("an_dt") or r.get("sort_date") or ""), errors="coerce", dayfirst=True)
        if not sym or pd.isna(dt):
            continue
        cat = classify(desc, text)
        if cat is None:
            continue
        about = text.split(" about ", 1)[1].strip() if " about " in text else text
        about = "" if about.lower().rstrip(".") == desc.lower() else about[:140]
        url = str(r.get("attchmntFile") or "").strip()
        url = url[len(PDF_BASE):] if url.startswith(PDF_BASE) else url
        out.append({"dt": dt.strftime("%Y-%m-%d %H:%M"), "symbol": sym, "cat": cat, "desc": desc[:90], "about": about,
                    "url": url if url not in ("-", "") else "", "seq": str(r.get("seq_id") or "")})
    return pd.DataFrame(out, columns=COLS)


def fetch(http, start: date, end: date) -> pd.DataFrame:
    q = f"api/corporate-announcements?index=equities&from_date={start:%d-%m-%Y}&to_date={end:%d-%m-%Y}"
    return parse(nse.api_json(http, q, referer=REFERER))


def store(data: Path, df: pd.DataFrame) -> int:
    """Merge into the daily files (same filing = same seq, else same dt + symbol + desc + url). Returns rows added."""
    added = 0
    if df.empty:
        return 0
    for day, part in df.groupby(df["dt"].str[:10]):
        p = path(data, day)
        old = pd.read_csv(p, dtype=str, keep_default_na=False) if p.exists() else pd.DataFrame(columns=COLS)
        both = pd.concat([old, part.astype(str)], ignore_index=True)
        key = both["seq"].where(both["seq"] != "", both["dt"] + both["symbol"] + both["desc"] + both["url"])
        both = both.loc[~key.duplicated(keep="last")].sort_values(["dt", "symbol"]).reset_index(drop=True)[COLS]
        if len(both) != len(old) or not both.equals(old[COLS].reset_index(drop=True)):
            p.parent.mkdir(parents=True, exist_ok=True)
            both.to_csv(p, index=False, lineterminator="\n")
            added += max(0, len(both) - len(old))
    return added


def prune(data: Path, today: date, months: int = 13) -> list[str]:
    keep_from = (pd.Timestamp(today) - pd.DateOffset(months=months)).strftime("%Y-%m")
    gone = []
    import shutil
    for p in sorted((data / "announcements").glob("*")):
        if p.is_dir() and p.name < keep_from:
            shutil.rmtree(p)
            gone.append(p.name)
    return gone


def daily(data: Path, http, today: date, days: int = 3, log=print) -> dict:
    df = fetch(http, today - timedelta(days=days - 1), today)
    added = store(data, df)
    gone = prune(data, today)
    log(f"announcements: {len(df)} read for the last {days} days, {added} new{f', removed {gone}' if gone else ''}")
    return {"read": len(df), "added": added}


def backfill(data: Path, http, start: date, end: date, deadline: float | None = None, log=print, clock=None) -> dict:
    """Day by day from `end` back to `start` (newest first, so a stopped run already has the recent months)."""
    import time
    clock = clock or time.monotonic
    d, n, days = end, 0, 0
    while d >= start:
        if deadline is not None and clock() > deadline:
            return {"days": days, "added": n, "stopped": f"time limit at {d}"}
        if path(data, d.isoformat()).exists() and d < end - timedelta(days=3):
            d -= timedelta(days=1)                 # already read on an earlier run
            continue
        try:
            n += store(data, fetch(http, d, d))
        except Exception as exc:  # noqa: BLE001 - one bad day does not stop the run
            log(f"  {d}: {type(exc).__name__} {str(exc)[:60]}")
        days += 1
        d -= timedelta(days=1)
    log(f"announcements backfill {start} .. {end}: {days} days, {n} filings added")
    return {"days": days, "added": n, "stopped": None}


def load(data: Path, since: str) -> pd.DataFrame:
    parts = [pd.read_csv(p, dtype=str, keep_default_na=False) for p in sorted((data / "announcements").glob("*/*.csv"))
             if f"{p.parent.name}-{p.stem}" >= since[:10]]
    if not parts:
        return pd.DataFrame(columns=COLS)
    df = pd.concat(parts, ignore_index=True)
    return df[df["dt"] >= since].sort_values("dt", ascending=False).reset_index(drop=True)


CATALYST_CATS = ("O", "D", "F")          # orders & business, deals & expansion, fund raising
_BOILER = re.compile(r"^.{0,160}?has informed the Exchange (?:regarding|about|that)\s*(?:an?\s+)?", re.I)
# filings that say nothing about the business (staff share plans, bare rule numbers, trading windows)
_DULL = re.compile(r"^(?:disclosure under regulation|regulation 30|intimation under regulation)|stock ownership plan|\besop\b|employee stock"
                   r"|stock option|trading window|loss of share certificate|^general updates?$|^updates?$", re.I)


def catalysts(df: pd.DataFrame, today: str, days: int = 120, max_len: int = 240) -> dict[str, list]:
    """Leaders page "Catalyst" column (Viraj 12-Nov-2026): per symbol the newest filing of the last `days` days about
    orders, deals / expansion or fund raising -> {SYMBOL: [date, cat, text]}. Text = the filing's own words (NSE's
    "about", else its subject) without the "X Limited has informed the Exchange regarding" start."""
    if df.empty:
        return {}
    since = (pd.Timestamp(today) - pd.Timedelta(days=days)).strftime("%Y-%m-%d")
    d = df[(df["dt"] >= since) & df["cat"].isin(CATALYST_CATS)].sort_values("dt")
    out: dict[str, list] = {}
    for r in d.itertuples():
        about = str(r.about or "").strip() if isinstance(r.about, str) else ""
        text = _BOILER.sub("", about).strip(" .,:;-'\"")
        if not text or _DULL.search(text):
            text = str(r.desc or "").strip(" .,:;-'\"")
        if not text or _DULL.search(text):
            continue
        if sum(ch.isupper() for ch in text) > 0.6 * max(1, sum(ch.isalpha() for ch in text)):
            text = text.lower()                  # SHOUTED filings read better in sentence case
        text = text[0].upper() + text[1:]
        if len(text) > max_len:
            text = text[:max_len].rsplit(" ", 1)[0] + "…"
        out[r.symbol] = [str(r.dt)[:10], r.cat, text]
    return out


def site_files(data: Path, out: Path, symbols: set[str], today: str, recent_days: int = 10, stock_days: int = 400) -> dict:
    """data/news.json (all filings of the last `recent_days` days) and data/a/<SYMBOL>.json (one stock's last `stock_days`)."""
    since = (pd.Timestamp(today) - pd.Timedelta(days=stock_days)).strftime("%Y-%m-%d")
    df = load(data, since)
    df = df[df["symbol"].isin(symbols)] if symbols else df
    rec = lambda d: [[r.dt, r.symbol, r.cat, r.desc, r.about, r.url] for r in d.itertuples()]
    recent = df[df["dt"] >= (pd.Timestamp(today) - pd.Timedelta(days=recent_days)).strftime("%Y-%m-%d")]
    (out / "data").mkdir(parents=True, exist_ok=True)
    (out / "data" / "news.json").write_text(json.dumps({"cats": CATS, "pdf": PDF_BASE, "rows": rec(recent)}, separators=(",", ":"), ensure_ascii=False),
                                            encoding="utf-8")
    cat = catalysts(df, today)
    (out / "data" / "catalysts.json").write_text(json.dumps(cat, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    adir = out / "data" / "a"
    adir.mkdir(parents=True, exist_ok=True)
    n = 0
    for sym, g in df.groupby("symbol"):
        (adir / f"{sym}.json").write_text(json.dumps(rec(g), separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        n += 1
    return {"recent": len(recent), "stocks": n}
