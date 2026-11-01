"""Copy a backup zip to Google Drive (off-GitHub backup) and keep only the newest N there.

Uses Viraj's own Google account through OAuth with the narrow scope `drive.file` (the app sees ONLY the files it created).
Secrets (GitHub Secrets / environment): GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN. When they are not set
the script says so and exits 0 (the Google Drive copy is optional). One-time setup: docs/MANUAL_CHECKLIST.md.

    python scripts/gdrive_backup.py data-2026-11-07.zip [--keep 12]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/drive/v3/files"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
FOLDER = "Swing Trading Dashboard backups"
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveError(RuntimeError):
    """Safe to print: never contains a token."""


def access_token(session, client_id: str, client_secret: str, refresh_token: str) -> str:
    r = session.post(TOKEN_URL, data={"client_id": client_id, "client_secret": client_secret,
                                      "refresh_token": refresh_token, "grant_type": "refresh_token"}, timeout=30)
    if r.status_code != 200:
        raise DriveError(f"Google refused the refresh token (HTTP {r.status_code}). Make the token again (see the checklist).")
    return r.json()["access_token"]


def find_or_create_folder(session, headers: dict) -> str:
    q = f"name = '{FOLDER}' and mimeType = '{FOLDER_MIME}' and trashed = false"
    r = session.get(API, headers=headers, params={"q": q, "fields": "files(id,name)"}, timeout=30)
    if r.status_code != 200:
        raise DriveError(f"listing folders failed (HTTP {r.status_code})")
    files = r.json().get("files", [])
    if files:
        return files[0]["id"]
    r = session.post(API, headers=headers, json={"name": FOLDER, "mimeType": FOLDER_MIME}, params={"fields": "id"}, timeout=30)
    if r.status_code not in (200, 201):
        raise DriveError(f"creating the folder failed (HTTP {r.status_code})")
    return r.json()["id"]


def upload(session, headers: dict, folder_id: str, path: Path) -> str:
    size = path.stat().st_size
    r = session.post(UPLOAD, headers={**headers, "X-Upload-Content-Type": "application/zip", "X-Upload-Content-Length": str(size)},
                     params={"uploadType": "resumable"}, json={"name": path.name, "parents": [folder_id]}, timeout=60)
    if r.status_code != 200 or "Location" not in r.headers:
        raise DriveError(f"starting the upload failed (HTTP {r.status_code})")
    with open(path, "rb") as f:
        put = session.put(r.headers["Location"], data=f, headers={"Content-Length": str(size)}, timeout=1800)
    if put.status_code not in (200, 201):
        raise DriveError(f"upload failed (HTTP {put.status_code})")
    return put.json()["id"]


def prune(session, headers: dict, folder_id: str, keep: int) -> list[str]:
    """Delete all but the newest `keep` backup zips in the folder; returns the deleted names."""
    q = f"'{folder_id}' in parents and trashed = false and name contains 'data-'"
    r = session.get(API, headers=headers, params={"q": q, "fields": "files(id,name)", "pageSize": 200}, timeout=30)
    if r.status_code != 200:
        raise DriveError(f"listing backups failed (HTTP {r.status_code})")
    files = sorted(r.json().get("files", []), key=lambda f: f["name"], reverse=True)   # data-YYYY-MM-DD sorts by date
    gone = []
    for f in files[keep:]:
        d = session.delete(f"{API}/{f['id']}", headers=headers, timeout=30)
        if d.status_code in (200, 204):
            gone.append(f["name"])
    return gone


def main(argv=None, session=None, env=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("zip", type=Path)
    ap.add_argument("--keep", type=int, default=12)
    a = ap.parse_args(argv)
    env = os.environ if env is None else env
    need = ["GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN"]
    if not all(env.get(k) for k in need):
        print("Google Drive copy skipped: GDRIVE_* secrets are not set (optional).")
        return 0
    s = session or requests.Session()
    try:
        token = access_token(s, env["GDRIVE_CLIENT_ID"], env["GDRIVE_CLIENT_SECRET"], env["GDRIVE_REFRESH_TOKEN"])
        headers = {"Authorization": f"Bearer {token}"}
        folder = find_or_create_folder(s, headers)
        upload(s, headers, folder, a.zip)
        gone = prune(s, headers, folder, a.keep)
    except DriveError as exc:
        print(f"::error title=Google Drive backup::{exc}")
        return 1
    print(f"Google Drive: uploaded {a.zip.name} to '{FOLDER}'" + (f"; removed old {', '.join(gone)}" if gone else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
