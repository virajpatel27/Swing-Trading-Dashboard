import sys
from datetime import date
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import check_secrets  # noqa: E402
import probe_sources  # noqa: E402
from swingdash.http import PoliteSession  # noqa: E402


# ---------------------------------------------------------------- polite HTTP
class FakeResp:
    def __init__(self, status):
        self.status_code = status


class FakeSession:
    def __init__(self, answers):
        self.answers, self.headers, self.calls = list(answers), {}, 0

    def request(self, method, url, **kw):
        self.calls += 1
        a = self.answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return FakeResp(a)


def make(answers, retries=4):
    sleeps = []
    s = PoliteSession(min_gap=0, retries=retries, backoff=2, session=FakeSession(answers), sleep=sleeps.append)
    return s, sleeps


def test_retries_with_exponential_backoff_then_succeeds():
    s, sleeps = make([503, 429, 200])
    assert s.get("https://x.test/a").status_code == 200
    assert sleeps == [2, 4]


def test_does_not_retry_a_plain_404():
    s, sleeps = make([404])
    assert s.get("https://x.test/a").status_code == 404
    assert sleeps == []


def test_gives_last_status_after_all_retries():
    s, _ = make([503, 503], retries=2)
    assert s.get("https://x.test/a").status_code == 503


def test_raises_when_never_connected():
    s, _ = make([requests.ConnectionError("down")] * 2, retries=2)
    try:
        s.get("https://x.test/a")
    except requests.ConnectionError:
        pass
    else:
        raise AssertionError("expected ConnectionError")


def test_pause_between_calls_to_same_site():
    sleeps, t = [], [0.0]
    s = PoliteSession(min_gap=1.0, session=FakeSession([200, 200]), sleep=sleeps.append, clock=lambda: t[0])
    s.get("https://x.test/a")
    t[0] = 0.25
    s.get("https://x.test/b")
    assert sleeps == [0.75]


# ---------------------------------------------------------------- secret check
def test_secret_check_finds_filled_values_but_not_names():
    # fake values are built from pieces so this file itself passes the repo-wide check
    assert check_secrets.scan_text("ANGEL_PIN" + "=1234") == [(1, "filled secret variable")]
    assert check_secrets.scan_text("ANGEL_API_KEY: ${{ secrets.ANGEL_API_KEY }}") == []
    assert check_secrets.scan_text("ANGEL_API_KEY=\nset `ANGEL_PIN` in GitHub") == []
    assert check_secrets.scan_text("x = '" + "eyJ" + "hbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6IkExMjMifQ.abcdefghijklmnop'")[0][1] == "JWT token"
    assert check_secrets.scan_text("otp" + "auth://totp/Angel?secret=ABC")[0][1] == "otpauth link"


def test_secret_check_refuses_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text("nothing")
    assert check_secrets.main([str(env)]) == 1


def test_repo_itself_has_no_secrets():
    assert check_secrets.main([]) == 0


def test_angel_sdk_imports():
    """smartapi-python does not install everything it imports; requirements.txt must add the rest."""
    from SmartApi import SmartConnect  # noqa: F401


# ---------------------------------------------------------------- probe helpers
def test_recent_weekdays_skip_weekend():
    assert probe_sources.recent_weekdays(date(2026, 11, 2), 2) == [date(2026, 10, 30), date(2026, 10, 29)]


def test_bhav_urls_old_and_new_format():
    assert probe_sources.nse_bhav_url(date(2007, 1, 2)).endswith("/content/historical/EQUITIES/2007/JAN/cm02JAN2007bhav.csv.zip")
    assert probe_sources.nse_bhav_url(date(2024, 10, 25)).endswith("/content/cm/BhavCopy_NSE_CM_0_0_0_20241025_F_0000.csv.zip")


def test_annotation_is_one_line_with_counts():
    rows = [{"source": "NSE", "what": "a", "ok": True, "detail": "100% fine\nnext"},
            {"source": "BSE", "what": "b", "ok": False, "detail": "HTTP 403"},
            {"source": "Angel One", "what": "c", "ok": None, "detail": "skipped"}]
    line = probe_sources.annotation(rows)
    assert "\n" not in line
    assert line.startswith("::notice title=Source probe: 1 OK, 1 NO, 1 skipped::")
    assert "100%25 fine%0Anext" in line and "%0A[NO] BSE | b | HTTP 403" in line


def test_bhav_close_reads_both_formats():
    new = pd.DataFrame({"TckrSymb": ["RELIANCE", "RELIANCE"], "SctySrs": ["BE", "EQ"], "ClsPric": [1.0, 2655.5]})
    old = pd.DataFrame({"SYMBOL": ["RELIANCE"], "SERIES ": ["EQ"], "CLOSE": [2500.0]})
    old.columns = ["SYMBOL", "SERIES", "CLOSE"]
    assert probe_sources.bhav_close(new, "RELIANCE") == 2655.5
    assert probe_sources.bhav_close(old, "RELIANCE") == 2500.0
    assert probe_sources.bhav_close(new, "TCS") is None
