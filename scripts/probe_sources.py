"""Phase 2 source probe: which data source answers, from where (PC or GitHub), and how far back.

Read-only, about 25 small requests. Writes reports/probe_<pc|github>.md (+ .json) and prints the same table.
Angel One checks run only when the 4 ANGEL_* values are set (GitHub Secrets, or a local .env file).

    python scripts/probe_sources.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from swingdash.http import PoliteSession  # noqa: E402

NSE_HOME = "https://www.nseindia.com/"
NSE_ARCH = "https://nsearchives.nseindia.com"
BSE_API = "https://api.bseindia.com/BseIndiaAPI/api"
BSE_HEADERS = {"Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com", "Accept": "application/json, text/plain, */*"}
NSE_HEADERS = {"Referer": NSE_HOME, "Accept": "application/json, text/plain, */*"}
# The day before RELIANCE's 1:1 bonus (ex-date 28-Oct-2024): an "as traded" close is about twice an adjusted one.
BONUS_CHECK_DAY = date(2024, 10, 25)


def recent_weekdays(today: date, n: int = 6) -> list[date]:
    """The last n weekdays before today, newest first (holidays are found by trying)."""
    out, d = [], today
    while len(out) < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            out.append(d)
    return out


def nse_bhav_url(d: date) -> str:
    """NSE equity bhavcopy: new UDiFF file from 08-Jul-2024, the old file before."""
    if d >= date(2024, 7, 8):
        return f"{NSE_ARCH}/content/cm/BhavCopy_NSE_CM_0_0_0_{d:%Y%m%d}_F_0000.csv.zip"
    mon = d.strftime("%b").upper()
    return f"{NSE_ARCH}/content/historical/EQUITIES/{d:%Y}/{mon}/cm{d:%d}{mon}{d:%Y}bhav.csv.zip"


def read_zip_csv(content: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        with z.open(z.namelist()[0]) as f:
            return pd.read_csv(f)


def bhav_close(df: pd.DataFrame, symbol: str) -> float | None:
    """Close of an EQ-series symbol in either bhavcopy format."""
    if "TckrSymb" in df.columns:
        row = df[(df["TckrSymb"] == symbol) & (df["SctySrs"] == "EQ")]
        return float(row["ClsPric"].iloc[0]) if len(row) else None
    df.columns = [c.strip() for c in df.columns]
    row = df[(df["SYMBOL"] == symbol) & (df["SERIES"] == "EQ")]
    return float(row["CLOSE"].iloc[0]) if len(row) else None


def load_env_file(path: Path) -> None:
    """KEY=VALUE lines of a local .env into os.environ (never printed)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            if v.strip() and not os.environ.get(k.strip()):
                os.environ[k.strip()] = v.strip()


class Probe:
    def __init__(self, http: PoliteSession, today: date):
        self.http, self.today, self.rows, self.facts = http, today, [], {}

    def check(self, source: str, what: str, fn) -> None:
        try:
            ok, detail = fn()
        except Exception as exc:  # noqa: BLE001
            ok, detail = False, f"{type(exc).__name__}: {str(exc)[:150]}"
        self.rows.append({"source": source, "what": what, "ok": ok, "detail": detail})
        print(f"[{'OK ' if ok else 'NO '}] {source:12} {what:38} {detail}", flush=True)

    # ------------------------------------------------------------ NSE
    def nse_json(self, path: str):
        self.http.warm_up(NSE_HOME)
        r = self.http.get(NSE_HOME.rstrip("/") + path, headers=NSE_HEADERS)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        return r.json()

    def nse_all_indices(self):
        data = self.nse_json("/api/allIndices").get("data", [])
        return bool(data), f"{len(data)} indices listed (e.g. {', '.join(d.get('index', '') for d in data[:3])})"

    def nse_index_file(self, d: date):
        r = self.http.get(f"{NSE_ARCH}/content/indices/ind_close_all_{d:%d%m%Y}.csv")
        if r.status_code != 200:
            return False, f"{d}: HTTP {r.status_code}"
        df = pd.read_csv(io.BytesIO(r.content))
        return True, f"{d}: {len(df)} indices, columns {', '.join(list(df.columns)[:4])} ..."

    def nse_index_recent(self):
        last = ""
        for d in recent_weekdays(self.today):
            ok, last = self.nse_index_file(d)
            if ok:
                return ok, last
        return False, last

    def nse_index_history(self):
        self.http.warm_up(NSE_HOME)
        r = self.http.get(NSE_HOME + "api/historicalOR/indicesHistory?indexType=NIFTY%2050&from=01-01-2007&to=31-01-2007",
                          headers={**NSE_HEADERS, "Referer": NSE_HOME + "reports-indices-historical-index-data"})
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        rows = r.json().get("data") or []
        dates = sorted(str(x.get("EOD_TIMESTAMP", "")) for x in rows)
        return bool(rows), f"NIFTY 50 Jan-2007: {len(rows)} days (e.g. {dates[0] if dates else '-'})"

    def niftyindices_history(self):
        self.http.warm_up("https://www.niftyindices.com/")
        cinfo = "{'name':'NIFTY 50','startDate':'01-Jan-2007','endDate':'31-Jan-2007','indexName':'NIFTY 50'}"
        r = self.http.post("https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString",
                           json={"cinfo": cinfo},
                           headers={"Content-Type": "application/json; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                                    "Origin": "https://www.niftyindices.com",
                                    "Referer": "https://www.niftyindices.com/reports/historical-data"})
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        rows = json.loads(r.json().get("d") or "[]")
        first = rows[-1] if rows else {}
        return bool(rows), f"NIFTY 50 Jan-2007: {len(rows)} days, first {first.get('HistoricalDate', '?')} close {first.get('CLOSE', '?')}"

    def nse_bhav(self, d: date, keep: str | None = None):
        r = self.http.get(nse_bhav_url(d))
        if r.status_code != 200:
            return False, f"{d}: HTTP {r.status_code}"
        df = read_zip_csv(r.content)
        if keep:
            self.facts[keep] = bhav_close(df, "RELIANCE")
        sym = "TckrSymb" if "TckrSymb" in df.columns else df.columns[0]
        return True, f"{d}: {len(df)} rows, {df[sym].nunique()} symbols, RELIANCE close {bhav_close(df, 'RELIANCE')}"

    def nse_bhav_recent(self):
        last = ""
        for d in recent_weekdays(self.today):
            ok, last = self.nse_bhav(d)
            if ok:
                return ok, last
        return False, last

    def nse_corp_actions(self):
        data = self.nse_json("/api/corporates-corporateActions?index=equities&from_date=01-01-2007&to_date=31-03-2007")
        rows = data if isinstance(data, list) else data.get("data", [])
        kinds = sorted({str(r.get("subject", ""))[:20] for r in rows})[:4]
        return bool(rows), f"Jan-Mar 2007: {len(rows)} actions (e.g. {'; '.join(kinds)})"

    def nse_corp_actions_recent(self):
        data = self.nse_json("/api/corporates-corporateActions?index=equities&symbol=RELIANCE&from_date=01-10-2024&to_date=31-10-2024")
        rows = data if isinstance(data, list) else data.get("data", [])
        found = [f"{r.get('exDate')} {r.get('subject')}" for r in rows]
        return bool(rows), "RELIANCE Oct-2024: " + ("; ".join(found) or "none")

    def nse_holidays(self):
        data = self.nse_json("/api/holiday-master?type=trading")
        cm = data.get("CM", [])
        return bool(cm), f"{len(cm)} trading holidays this year (first {cm[0].get('tradingDate') if cm else '-'})"

    def nifty500_list(self):
        r = self.http.get(f"{NSE_ARCH}/content/indices/ind_nifty500list.csv")
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        df = pd.read_csv(io.BytesIO(r.content))
        return len(df) > 400, f"{len(df)} stocks, columns {', '.join(df.columns)}"

    def nse_classification(self):
        self.http.warm_up(NSE_HOME)
        r = self.http.get(NSE_HOME + "api/NextApi/apiClient/GetQuoteApi", headers=NSE_HEADERS,
                          params={"functionName": "getSymbolData", "marketType": "N", "series": "EQ", "symbol": "RELIANCE"})
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        text = r.text
        keys = [k for k in ("macro", "sector", "industry", "basicIndustry") if f'"{k}"' in text]
        return bool(keys), f"RELIANCE: fields found {', '.join(keys) or 'none'}"

    # ------------------------------------------------------------ BSE
    def bse_get(self, url: str):
        r = self.http.get(url, headers=BSE_HEADERS)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        return r

    def bse_corp_actions(self):
        r = self.bse_get(f"{BSE_API}/DefaultData/w?Fdate=20240101&Purposecode=&TDate=20240131&ddlcategorys=E"
                         "&ddlindustrys=&scripcode=&segment=0&strSearch=S")
        rows = r.json()
        rows = rows if isinstance(rows, list) else rows.get("Table", [])
        return bool(rows), f"Jan-2024: {len(rows)} actions"

    def bse_index_list(self):
        rows = self.bse_get(f"{BSE_API}/FillddlIndex/w").json().get("Table") or []
        return bool(rows), f"{len(rows)} indices listed (e.g. {', '.join(r.get('shortalias', '') for r in rows[:3])})"

    def bse_index_history(self):
        rows = self.bse_get(f"{BSE_API}/IndexArchDaily/w?fmdt=01/01/2007&index=SENSEX&period=D&todt=31/01/2007").json().get("Table") or []
        first = rows[0] if rows else {}
        return bool(rows), f"SENSEX Jan-2007: {len(rows)} days, first {str(first.get('tdate', '-'))[:10]} close {first.get('I_close', '-')}"

    def bse_bhav(self, d: date):
        if d >= date(2024, 7, 8):
            url = f"https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{d:%Y%m%d}_F_0000.CSV"
        else:
            url = f"https://www.bseindia.com/download/BhavCopy/Equity/EQ{d:%d%m%y}_CSV.ZIP"
        r = self.http.get(url, headers=BSE_HEADERS)
        if r.status_code != 200 or len(r.content) < 1000:
            return False, f"{d}: HTTP {r.status_code}, {len(r.content)} bytes"
        return True, f"{d}: {len(r.content) // 1024} KB"

    def bse_bhav_recent(self):
        last = ""
        for d in recent_weekdays(self.today):
            ok, last = self.bse_bhav(d)
            if ok:
                return ok, last
        return False, last

    # ------------------------------------------------------------ yfinance (validation only)
    def yfinance_check(self):
        import yfinance as yf
        df = yf.download("RELIANCE.NS", start="2024-10-21", end="2024-10-30", auto_adjust=False, progress=False)
        if df.empty:
            return False, "no rows"
        row = df.loc[str(BONUS_CHECK_DAY)]
        close, adj = float(row["Close"].iloc[0]), float(row["Adj Close"].iloc[0])
        self.facts["yf_close"] = close
        return True, f"RELIANCE {BONUS_CHECK_DAY}: Close {close:.2f}, Adj Close {adj:.2f}"

    # ------------------------------------------------------------ Angel One
    def angel_scrip_master(self):
        r = self.http.get("https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json", timeout=120)
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        rows = r.json()
        nse_eq = sum(1 for x in rows if x.get("exch_seg") == "NSE" and str(x.get("symbol", "")).endswith("-EQ"))
        idx = {seg: sum(1 for x in rows if x.get("instrumenttype") == "AMXIDX" and x.get("exch_seg") == seg) for seg in ("NSE", "BSE")}
        return True, f"{len(rows)} instruments: {nse_eq} NSE -EQ stocks, indices NSE {idx['NSE']} / BSE {idx['BSE']}"

    def angel_checks(self) -> None:
        need = ["ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PIN", "ANGEL_TOTP_SECRET"]
        missing = [k for k in need if not os.environ.get(k)]
        if missing:
            self.rows.append({"source": "Angel One", "what": "login + history", "ok": None,
                              "detail": "skipped here (secrets not set) - runs on GitHub after the Secrets are added"})
            print("[-- ] Angel One login skipped: secrets not set")
            return
        import pyotp
        from SmartApi import SmartConnect

        api = SmartConnect(api_key=os.environ["ANGEL_API_KEY"])

        def login():
            totp = pyotp.TOTP(os.environ["ANGEL_TOTP_SECRET"].replace(" ", "").upper()).now()
            res = api.generateSession(os.environ["ANGEL_CLIENT_ID"], os.environ["ANGEL_PIN"], totp)
            ok = bool(res and res.get("status"))
            return ok, "logged in" if ok else f"refused: {str(res.get('message', ''))[:80]} ({res.get('errorcode', '')})"
        self.check("Angel One", "login (API key + client + PIN + TOTP)", login)
        if not self.rows[-1]["ok"]:
            return

        def candles(exchange, token, start, end):
            res = api.getCandleData({"exchange": exchange, "symboltoken": token, "interval": "ONE_DAY",
                                     "fromdate": f"{start} 09:15", "todate": f"{end} 15:30"})
            return (res or {}).get("data") or []

        def depth(name, exchange, token):
            def fn():
                rows = candles(exchange, token, "2007-01-01", "2007-12-31")
                return bool(rows), f"{name} 2007: {len(rows)} days, first {rows[0][0][:10] if rows else '-'}"
            return fn
        self.check("Angel One", "history depth stock", depth("RELIANCE", "NSE", "2885"))
        self.check("Angel One", "history depth NSE index", depth("NIFTY 50", "NSE", "99926000"))
        self.check("Angel One", "history depth BSE index", depth("SENSEX", "BSE", "99919000"))

        def adjusted():
            rows = candles("NSE", "2885", "2024-10-24", "2024-10-25")
            day = [r for r in rows if str(r[0]).startswith(str(BONUS_CHECK_DAY))]
            if not day:
                return False, "no candle for the check day"
            a, raw = float(day[0][4]), self.facts.get("bhav_bonus_day")
            verdict = "-"
            if raw:
                verdict = "ADJUSTED (about half the traded price)" if a < raw * 0.6 else "AS TRADED (same as bhavcopy)"
            return True, f"RELIANCE {BONUS_CHECK_DAY}: Angel close {a:.2f} vs NSE bhavcopy {raw} -> {verdict}"
        self.check("Angel One", "is history already adjusted?", adjusted)

    # ------------------------------------------------------------ run all
    def run(self) -> None:
        self.check("NSE", "all indices list (allIndices API)", self.nse_all_indices)
        self.check("NSE", "index closing file, newest", self.nse_index_recent)
        self.check("NSE", "index closing file, Jan-2007", lambda: self.nse_index_file(date(2007, 1, 2)))
        self.check("NSE", "index history Jan-2007 (historicalOR API)", self.nse_index_history)
        self.check("niftyindices", "index history Jan-2007 (old address)", self.niftyindices_history)
        self.check("NSE", "equity bhavcopy, newest", self.nse_bhav_recent)
        self.check("NSE", "equity bhavcopy, 02-Jan-2007", lambda: self.nse_bhav(date(2007, 1, 2)))
        self.check("NSE", f"equity bhavcopy, {BONUS_CHECK_DAY}", lambda: self.nse_bhav(BONUS_CHECK_DAY, keep="bhav_bonus_day"))
        self.check("NSE", "corporate actions 2007", self.nse_corp_actions)
        self.check("NSE", "corporate actions RELIANCE Oct-2024", self.nse_corp_actions_recent)
        self.check("NSE", "trading holidays", self.nse_holidays)
        self.check("NSE", "Nifty 500 member list", self.nifty500_list)
        self.check("NSE", "official sector/industry (GetQuoteApi)", self.nse_classification)
        self.check("BSE", "corporate actions", self.bse_corp_actions)
        self.check("BSE", "all indices list (FillddlIndex)", self.bse_index_list)
        self.check("BSE", "index history Jan-2007", self.bse_index_history)
        self.check("BSE", "equity bhavcopy, newest", self.bse_bhav_recent)
        self.check("BSE", "equity bhavcopy, 02-Jan-2007", lambda: self.bse_bhav(date(2007, 1, 2)))
        self.check("yfinance", "validation source", self.yfinance_check)
        self.check("Angel One", "instrument master (no login)", self.angel_scrip_master)
        self.angel_checks()


def to_markdown(rows: list[dict], where: str, when: str) -> str:
    mark = {True: "OK", False: "NO", None: "--"}
    lines = [f"# Source probe from {where} ({when})", "", "| Source | What | Result | Detail |", "|---|---|---|---|"]
    lines += [f"| {r['source']} | {r['what']} | {mark[r['ok']]} | {str(r['detail']).replace('|', '/')} |" for r in rows]
    return "\n".join(lines) + "\n"


def main() -> int:
    load_env_file(ROOT / ".env")
    where = "github" if os.environ.get("GITHUB_ACTIONS") == "true" else "pc"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    probe = Probe(PoliteSession(min_gap=1.0, retries=2), date.today())
    probe.run()
    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    md = to_markdown(probe.rows, where, now)
    (out / f"probe_{where}.md").write_text(md, encoding="utf-8")
    (out / f"probe_{where}.json").write_text(json.dumps(probe.rows, indent=1), encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(md)
    print(f"\nWritten reports/probe_{where}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
