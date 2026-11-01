import subprocess
import sys
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

import restore  # noqa: E402
from swingdash import adjust, integrity, rebuild, store  # noqa: E402
from swingdash.sources import nse  # noqa: E402
from test_phase3 import FakeHttp, Resp, old_bhav  # noqa: E402

TODAY = date(2026, 3, 1)


# ---------------------------------------------------------------- restore
def test_repo_slug_from_remotes():
    assert restore.repo_slug("https://github.com/virajpatel27/Swing-Trading-Dashboard.git") == "virajpatel27/Swing-Trading-Dashboard"
    assert restore.repo_slug("git@github.com:owner/name.git") == "owner/name"
    with pytest.raises(SystemExit):
        restore.repo_slug("https://example.com/x")


def test_extract_zip_and_refuse_paths_outside(tmp_path):
    good = tmp_path / "good.zip"
    with zipfile.ZipFile(good, "w") as z:
        z.writestr("stocks/raw/TCS/current.csv", "date,close\n")
        z.writestr("meta/health.json", "{}")
    assert restore.extract_zip(good, tmp_path / "out") == 2
    assert (tmp_path / "out/stocks/raw/TCS/current.csv").exists()
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("../evil.txt", "x")
    with pytest.raises(SystemExit):
        restore.extract_zip(bad, tmp_path / "out2")
    assert not (tmp_path / "evil.txt").exists()


def test_restore_from_commit_keeps_current_copy(tmp_path, monkeypatch):
    def g(*a):
        return subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True, text=True).stdout.strip()
    g("init", "-q")
    g("config", "user.email", "t@t")
    g("config", "user.name", "t")
    (tmp_path / "data").mkdir()
    (tmp_path / "data/a.txt").write_text("good")
    g("add", ".")
    g("commit", "-q", "-m", "good")
    good = g("rev-parse", "HEAD")
    (tmp_path / "data/a.txt").write_text("broken")
    (tmp_path / "data/new.txt").write_text("extra")
    g("add", ".")
    g("commit", "-q", "-m", "broken")
    monkeypatch.setattr(restore, "ROOT", tmp_path)
    monkeypatch.setattr(restore, "DATA", tmp_path / "data")
    restore.from_commit(good)
    assert (tmp_path / "data/a.txt").read_text() == "good" and not (tmp_path / "data/new.txt").exists()
    kept = list(tmp_path.glob("data_before_restore_*"))
    assert len(kept) == 1 and (kept[0] / "a.txt").read_text() == "broken"
    with pytest.raises(subprocess.CalledProcessError):
        restore.from_commit("deadbeef")                      # unknown commit: clear error, nothing moved


# ---------------------------------------------------------------- integrity
def market(tmp_path):
    data = tmp_path / "data"
    raw = pd.DataFrame({"date": pd.to_datetime(["2024-10-24", "2024-10-25", "2024-10-28"]), "open": [2670.55, 2687.0, 1337.0],
                        "high": [2687.4, 2688.7, 1353.0], "low": [2646.25, 2644.0, 1322.1], "close": [2679.6, 2655.7, 1334.35],
                        "prev_close": 0.0, "volume": [11077967, 9298748, 10824350], "value": 0.0, "series": "EQ"})
    store.write(data / "stocks/raw/RELIANCE", raw, store.STOCK_COLS, TODAY)
    (data / "meta").mkdir(parents=True)
    pd.DataFrame({"symbol": ["RELIANCE"], "id": ["RELIANCE"]}).to_csv(data / "meta/universe_stocks.csv", index=False)
    pd.DataFrame({"date": ["2024-10-24", "2024-10-25", "2024-10-28"]}).to_csv(data / "meta/trading_days.csv", index=False)
    (tmp_path / "config").mkdir()
    rebuild.rebuild_adjusted(tmp_path, None, {}, {"history_start": "2024-01-01"}, TODAY, log=lambda m: None,
                             raw_actions=[{"symbol": "RELIANCE", "series": "EQ", "exDate": "28-Oct-2024", "subject": "Bonus 1:1", "faceVal": "10"}])
    return data


def test_ca_consistency_catches_a_tampered_adjusted_series(tmp_path):
    data = market(tmp_path)
    assert integrity.ca_consistency(data) == []
    adj = store.read(data / "stocks/adjusted/RELIANCE", adjust.ADJ_COLS)
    adj.loc[0, "close"] = adj.loc[0, "close"] * 1.02          # e.g. a wrong factor
    store.write(data / "stocks/adjusted/RELIANCE", adj, adjust.ADJ_COLS, TODAY)
    problems = integrity.ca_consistency(data)
    assert problems and problems[0]["symbol"] == "RELIANCE"


def test_spot_check_compares_with_nse(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "UDIFF_FROM", date(2030, 1, 1))
    data = market(tmp_path)
    days = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2024-10-01", "2024-11-29")]   # the last 10 are never sampled
    pd.DataFrame({"date": days}).to_csv(data / "meta/trading_days.csv", index=False)

    def route(url):
        d = pd.to_datetime(url.rsplit("/", 1)[1][2:11], format="%d%b%Y").date()
        close = 2679.6 if d == date(2024, 10, 24) else 999.0      # NSE agrees on 24-Oct only
        return Resp(200, old_bhav(d, [("RELIANCE", "EQ", close)]))
    checked, bad = integrity.spot_check(data, FakeHttp(route), days=len(days) - 10, seed=1)   # every day that may be sampled
    assert "2024-10-24" in checked and "2024-10-25" in checked
    assert [(m["date"], m["nse"]) for m in bad] == [("2024-10-25", 999.0), ("2024-10-28", 999.0)]   # 24-Oct agrees


# ---------------------------------------------------------------- Google Drive copy
sys.path.insert(0, str(ROOT / "scripts"))
import check_secrets  # noqa: E402
import gdrive_backup  # noqa: E402


class DriveResp:
    def __init__(self, status, data=None, headers=None):
        self.status_code, self._d, self.headers = status, data or {}, headers or {}

    def json(self):
        return self._d


class FakeDrive:
    def __init__(self, existing):
        self.files = list(existing)
        self.calls = []

    def post(self, url, **kw):
        self.calls.append(("POST", url))
        if url == gdrive_backup.TOKEN_URL:
            return DriveResp(200, {"access_token": "AT"})
        if url == gdrive_backup.UPLOAD:
            return DriveResp(200, headers={"Location": "https://upload/session"})
        return DriveResp(200, {"id": "FOLDER"})                     # folder created

    def get(self, url, params=None, **kw):
        self.calls.append(("GET", params["q"]))
        if "mimeType" in params["q"]:
            return DriveResp(200, {"files": []})                    # no folder yet
        return DriveResp(200, {"files": [{"id": n, "name": n} for n in self.files]})

    def put(self, url, data=None, **kw):
        self.files.append("data-2026-11-07.zip")
        return DriveResp(200, {"id": "NEW"})

    def delete(self, url, **kw):
        self.files.remove(url.rsplit("/", 1)[1])
        return DriveResp(204)


def test_gdrive_upload_and_keep_newest(tmp_path):
    z = tmp_path / "data-2026-11-07.zip"
    z.write_bytes(b"PK zip")
    old = [f"data-2026-0{m}-01.zip" for m in range(1, 9)]          # 8 old backups
    drive = FakeDrive(old)
    env = {"GDRIVE_CLIENT_ID": "x", "GDRIVE_CLIENT_SECRET": "y", "GDRIVE_REFRESH_TOKEN": "z"}
    assert gdrive_backup.main([str(z), "--keep", "3"], session=drive, env=env) == 0
    assert sorted(drive.files) == ["data-2026-07-01.zip", "data-2026-08-01.zip", "data-2026-11-07.zip"]


def test_gdrive_skipped_without_secrets(tmp_path, capsys):
    assert gdrive_backup.main([str(tmp_path / "x.zip")], session=object(), env={}) == 0
    assert "skipped" in capsys.readouterr().out


def test_secret_check_knows_google_secrets():
    assert check_secrets.scan_text("x = '" + "GOC" + "SPX-abcdefghijklmnopqrstuv'")[0][1] == "Google client secret"
    assert check_secrets.scan_text("1//0" + "g" * 40)[0][1] == "Google refresh token"
