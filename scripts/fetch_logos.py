"""Company logos for the website (Viraj 12-Nov-2026): each company's OWN website icon, never a third-party logo set.

Run on the PC (BSE's api.bseindia.com refuses GitHub's servers):
    <python> scripts/fetch_logos.py              # new stocks only (resumes)
    <python> scripts/fetch_logos.py --refresh     # ask BSE and every website again

Steps
1. BSE scrip code per stock: ISIN -> FinInstrmId from BSE's equity bhavcopy of the latest day.
2. Company website: BSE CorpInfoNew (Table1.sURL) -> data/meta/company_sites.csv (symbol, id, isin, bse_code, website,
   logo, note, checked). NSE-only stocks have no BSE page -> no website -> the site keeps the letter badge.
3. Icon: the home page's <link rel="apple-touch-icon" / "icon"> (biggest bitmap up to 256 px), else /favicon.ico.
   Re-encoded with Pillow as a 64 x 64 PNG on a transparent square -> site/logos/<id>.png, list in site/logos/index.json.
   Downloaded bytes are only decoded as images (never run or kept).
Polite: BSE ~2 calls a second; websites 8 at a time (each a different host), 10 s timeout.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import io
import json
import re
import sys
import time
import warnings
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SITES = ROOT / "data" / "meta" / "company_sites.csv"
LOGOS = ROOT / "site" / "logos"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
BSE_H = {"User-Agent": UA, "Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com", "Accept": "application/json, */*"}
BHAV = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{d:%Y%m%d}_F_0000.CSV"
CORP = "https://api.bseindia.com/BseIndiaAPI/api/CorpInfoNew/w?scripcode={code}"
COLS = ["symbol", "id", "isin", "bse_code", "website", "logo", "note", "checked"]
Image.MAX_IMAGE_PIXELS = 4_000_000
warnings.filterwarnings("ignore")


def bse_codes(s: requests.Session) -> dict[str, str]:
    """ISIN -> BSE scrip code from the latest BSE equity bhavcopy (walks back up to 10 days)."""
    d = date.today()
    for _ in range(10):
        r = s.get(BHAV.format(d=d), headers={"User-Agent": UA, "Referer": "https://www.bseindia.com/"}, timeout=30)
        head = r.text[:400] if r.status_code == 200 else ""
        if len(r.content) > 10_000 and "ISIN" in head and "FinInstrmId" in head:     # an HTML page (no file yet) is skipped
            df = pd.read_csv(io.StringIO(r.text), dtype=str)
            if "FinInstrmTp" in df.columns:
                df = df[df["FinInstrmTp"] == "STK"]
            print(f"BSE bhavcopy {d}: {len(df)} stocks")
            return dict(zip(df["ISIN"].str.strip(), df["FinInstrmId"].str.strip()))
        d -= timedelta(days=1)
    raise SystemExit("no BSE bhavcopy in the last 10 days")


def website(s: requests.Session, code: str) -> str:
    r = s.get(CORP.format(code=code), headers=BSE_H, timeout=20)
    if r.status_code != 200:
        return ""
    try:
        t1 = r.json().get("Table1") or []
    except ValueError:
        return ""
    url = (t1[0].get("sURL") or "").strip() if t1 else ""
    url = url.split()[0].strip(",;") if url else ""
    if url and not re.match(r"https?://", url, re.I):
        url = "https://" + url
    host = urlparse(url).netloc.lower()
    return url if host and "." in host and "bseindia" not in host else ""


def _get(url: str, **kw) -> requests.Response | None:
    for verify in (True, False):
        try:
            return requests.get(url, headers={"User-Agent": UA, "Accept": "*/*"}, timeout=10, verify=verify, allow_redirects=True, **kw)
        except requests.exceptions.SSLError:
            continue
        except requests.RequestException:
            return None
    return None


def _size(tag) -> int:
    m = re.match(r"(\d+)x(\d+)", (tag.get("sizes") or "").lower())
    return int(m.group(1)) if m else 0


def icon_candidates(home: str) -> list[str]:
    out: list[str] = []
    r = _get(home)
    base = home
    if r is not None and r.status_code < 400 and "html" in r.headers.get("content-type", "").lower():
        base = r.url
        soup = BeautifulSoup(r.text[:400_000], "html.parser")
        links = [l for l in soup.find_all("link", href=True) if any(x in " ".join(l.get("rel") or []).lower() for x in ("icon", "apple-touch"))]
        def rank(l):
            rel, href, sz = " ".join(l.get("rel") or []).lower(), l["href"].lower(), _size(l)
            svg = href.endswith(".svg") or "svg" in (l.get("type") or "")
            return (svg, -(min(sz, 256) if sz else (180 if "apple" in rel else 32)))
        for l in sorted(links, key=rank):
            out.append(urljoin(base, l["href"]))
    p = urlparse(base)
    out.append(f"{p.scheme}://{p.netloc}/favicon.ico")
    seen, uniq = set(), []
    for u in out:
        if u not in seen and not u.startswith("data:"):
            seen.add(u); uniq.append(u)
    return uniq[:6]


def to_png(raw: bytes) -> bytes | None:
    try:
        im = Image.open(io.BytesIO(raw))
        if getattr(im, "format", "") == "ICO" and hasattr(im, "ico"):
            sizes = sorted(im.ico.sizes(), key=lambda s: s[0])
            im.size = sizes[-1]
        im.load()
    except Exception:
        return None
    im = im.convert("RGBA")
    if min(im.size) < 16:
        return None
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return None
    im = im.crop(bbox)
    colors = im.convert("RGB").resize((16, 16)).getcolors(256)
    if colors is not None and len(colors) <= 1:
        return None                                       # one flat colour: no logo in it
    w, h = im.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - w) // 2, (side - h) // 2))
    sq = sq.resize((64, 64), Image.LANCZOS)
    buf = io.BytesIO()
    sq.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def fetch_logo(row: dict) -> tuple[str, str, str]:
    """(id, 'ok' | '', note)"""
    try:
        for u in icon_candidates(row["website"]):
            if u.lower().endswith(".svg"):
                continue
            r = _get(u)
            if r is None or r.status_code >= 400 or len(r.content) < 100 or len(r.content) > 3_000_000:
                continue
            png = to_png(r.content)
            if png:
                (LOGOS / f"{row['id']}.png").write_bytes(png)
                return row["id"], "ok", urlparse(u).netloc
        return row["id"], "", "no usable icon"
    except Exception as e:                                 # one bad site never stops the run
        return row["id"], "", type(e).__name__


def clean(by: dict[str, dict]) -> None:
    """Drop icons that are not the company's logo (they fall back to the letter badge):
    - almost all white (a white logo is invisible in the white circle);
    - the same picture for 3+ companies whose names do not share a first word (a website builder's icon: WordPress,
      Wix, a hosting company...). Group companies with one logo (Adani, Aditya Birla) keep theirs."""
    import hashlib
    st = pd.read_csv(ROOT / "data" / "meta" / "stocks.csv", dtype=str).fillna("").set_index("id")
    groups: dict[str, list[str]] = {}
    for i, r in by.items():
        f = LOGOS / f"{i}.png"
        if r.get("logo") != "ok" or not f.exists():
            continue
        im = Image.open(f).convert("RGBA")
        px = [p for p in im.getdata() if p[3] > 40]
        light = sum(1 for p in px if min(p[:3]) > 225) / max(len(px), 1)
        if not px or light > 0.92:
            f.unlink(); r["logo"], r["note"] = "", "white icon"; continue
        groups.setdefault(hashlib.md5(im.tobytes()).hexdigest(), []).append(i)
    for ids in groups.values():
        if len(ids) < 3:
            continue
        first = [str(st.at[i, "name"]).split()[0].lower() if i in st.index and st.at[i, "name"] else i for i in ids]
        top = max(set(first), key=first.count)
        if first.count(top) * 2 >= len(ids):
            continue
        for i in ids:
            (LOGOS / f"{i}.png").unlink(missing_ok=True); by[i]["logo"], by[i]["note"] = "", "generic icon"
        print(f"  generic icon dropped for {len(ids)}: {', '.join(sorted(ids)[:8])}{' ...' if len(ids) > 8 else ''}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="ask BSE and the websites again for every stock")
    ap.add_argument("--clean-only", action="store_true", help="only drop white / generic icons from site/logos")
    a = ap.parse_args()
    if a.clean_only:
        out = pd.read_csv(SITES, dtype=str).fillna("")
        by = {r["id"]: r for r in out.to_dict("records")}
        for r in by.values():
            if r["website"] and (LOGOS / f"{r['id']}.png").exists():
                r["logo"], r["note"] = "ok", ""
        clean(by)
        out = pd.DataFrame(list(by.values()), columns=COLS).sort_values("symbol")
        out.to_csv(SITES, index=False)
        ids = sorted(i for i in out[out["logo"] == "ok"]["id"] if (LOGOS / f"{i}.png").exists())
        (LOGOS / "index.json").write_text(json.dumps({"made": date.today().isoformat(), "ids": ids}, separators=(",", ":")), encoding="utf-8")
        print(f"logos after cleaning: {len(ids)}")
        return 0
    LOGOS.mkdir(parents=True, exist_ok=True)
    st = pd.read_csv(ROOT / "data" / "meta" / "stocks.csv", dtype=str).fillna("")
    st = st[st["status"] == "active"]
    old = pd.read_csv(SITES, dtype=str).fillna("") if SITES.exists() and not a.refresh else pd.DataFrame(columns=COLS)
    have = {r.id: r._asdict() for r in old.itertuples(index=False)}
    s = requests.Session()
    codes = bse_codes(s)
    rows, today = [], date.today().isoformat()
    todo = [r for r in st.itertuples(index=False) if r.id not in have or not have[r.id].get("checked")]
    print(f"{len(st)} stocks, {len(todo)} to ask BSE")
    for k, r in enumerate(todo, 1):
        code = codes.get(r.isin, "")
        site = website(s, code) if code else ""
        have[r.id] = {"symbol": r.symbol, "id": r.id, "isin": r.isin, "bse_code": code, "website": site, "logo": "",
                      "note": "" if code else "not on BSE", "checked": today}
        if code:
            time.sleep(0.45)
        if k % 100 == 0:
            print(f"  BSE {k}/{len(todo)}"); sys.stdout.flush()
            pd.DataFrame(list(have.values()), columns=COLS).sort_values("symbol").to_csv(SITES, index=False)
    sites = pd.DataFrame([have[i] for i in st["id"] if i in have], columns=COLS)
    sites.sort_values("symbol").to_csv(SITES, index=False)                       # BSE part saved (a stopped run resumes here)
    by = {r["id"]: r for r in sites.to_dict("records")}
    for r in by.values():                                                       # icons saved by a stopped run count as done
        if not a.refresh and r["website"] and (LOGOS / f"{r['id']}.png").exists():
            r["logo"], r["note"] = "ok", ""
    need = [r for r in by.values() if r["website"] and (a.refresh or r["logo"] != "ok") and r["note"] != "no usable icon"]
    print(f"{len(sites[sites.website != ''])} with a website, {len(need)} icons to fetch")
    with cf.ThreadPoolExecutor(8) as ex:
        for k, (i, ok, note) in enumerate(ex.map(fetch_logo, need), 1):
            by[i]["logo"], by[i]["note"] = ok, note if not ok else ""
            if k % 100 == 0:
                print(f"  icons {k}/{len(need)}"); sys.stdout.flush()
                pd.DataFrame(list(by.values()), columns=COLS).sort_values("symbol").to_csv(SITES, index=False)
    clean(by)
    out = pd.DataFrame(list(by.values()), columns=COLS).sort_values("symbol")
    out.to_csv(SITES, index=False)
    ids = sorted(i for i in out[out["logo"] == "ok"]["id"] if (LOGOS / f"{i}.png").exists())
    (LOGOS / "index.json").write_text(json.dumps({"made": today, "ids": ids}, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in LOGOS.glob("*.png"))
    print(f"logos: {len(ids)} of {len(out)} stocks, {size / 1e6:.1f} MB -> site/logos/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
