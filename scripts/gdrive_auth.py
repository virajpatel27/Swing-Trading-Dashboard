"""ONE-TIME, on the PC: get the Google Drive refresh token for the weekly off-GitHub backup.

1. Put the OAuth client file you downloaded from Google Cloud (type "Desktop app") in the project folder as client_secret.json
2. python scripts/gdrive_auth.py
3. Your browser opens: sign in to YOUR Google account and allow "See, edit, create and delete only the specific Google Drive files
   you use with this app".
4. The token is written to gdrive_token.txt (git-ignored). Open it yourself, copy its text into the GitHub Secret
   GDRIVE_REFRESH_TOKEN, then delete gdrive_token.txt and client_secret.json. The token is never printed.
"""
from __future__ import annotations

import base64
import hashlib
import http.server
import json
import secrets
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
SCOPE = "https://www.googleapis.com/auth/drive.file"


def main() -> int:
    cfile = ROOT / "client_secret.json"
    if not cfile.exists():
        print("client_secret.json not found in the project folder (see docs/MANUAL_CHECKLIST.md, Google Drive steps).")
        return 1
    c = json.loads(cfile.read_text(encoding="utf-8"))
    c = c.get("installed") or c.get("web") or c
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    got: dict = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] == state:
                got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>Done - you can close this tab and go back.</h2>".encode())

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{srv.server_port}"
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": c["client_id"], "redirect_uri": redirect, "response_type": "code", "scope": SCOPE, "access_type": "offline",
        "prompt": "consent", "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
    t = threading.Thread(target=srv.handle_request, daemon=True)
    t.start()
    print("Opening your browser for Google sign-in (waiting up to 5 minutes) ...")
    webbrowser.open(url)
    t.join(timeout=300)
    srv.server_close()
    if "code" not in got:
        print("No answer from Google (cancelled or timed out). Run again.")
        return 1
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": c["client_id"], "client_secret": c["client_secret"], "code": got["code"], "code_verifier": verifier,
        "redirect_uri": redirect, "grant_type": "authorization_code"}, timeout=30)
    token = r.json().get("refresh_token") if r.status_code == 200 else None
    if not token:
        print(f"Google did not give a refresh token (HTTP {r.status_code}). Check the steps and run again.")
        return 1
    (ROOT / "gdrive_token.txt").write_text(token, encoding="utf-8")
    print("Saved to gdrive_token.txt. Open it yourself, copy it into the GitHub Secret GDRIVE_REFRESH_TOKEN, then delete it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
