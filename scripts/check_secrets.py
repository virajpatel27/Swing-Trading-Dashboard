"""Stop secrets from reaching the public repo.

Scans the given files (or every file git tracks / would add) for things that look like keys, tokens, TOTP secrets or a filled .env.
Exit code 1 + the file and line (never the value) when something is found.

    python scripts/check_secrets.py            # all files in the repo folder (except data/ and ignored ones)
    python scripts/check_secrets.py a.py b.md  # only these
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET_NAMES = ("ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PIN", "ANGEL_TOTP_SECRET", "TELEGRAM_BOT_TOKEN",
                "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN")

PATTERNS = [
    ("filled secret variable", re.compile(r"\b(" + "|".join(SECRET_NAMES) + r")\s*[=:]\s*['\"]?(?!\$\{\{)([A-Za-z0-9+/_\-]{4,})")),
    ("JWT token", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}")),
    ("otpauth link", re.compile(r"otp" r"auth://", re.I)),        # split so this file does not match itself
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}")),
    ("Telegram bot token", re.compile(r"\b\d{8,10}:[A-Za-z0-9_\-]{35}\b")),
    ("Google client secret", re.compile(r"GOC" r"SPX-[A-Za-z0-9_\-]{20,}")),
    ("Google refresh token", re.compile(r"\b1//0[A-Za-z0-9_\-]{30,}")),
]
SKIP_DIRS = {".git", "data", "__pycache__", ".pytest_cache", "_site", "cache"}
SKIP_SUFFIX = {".parquet", ".gz", ".zip", ".png", ".jpg", ".ico", ".webp"}
NEVER_COMMIT = {".env", "client_secret.json", "gdrive_token.txt"}


def scan_text(text: str) -> list[tuple[int, str]]:
    """[(line number, what was found)] - the value itself is never returned."""
    hits = []
    for no, line in enumerate(text.splitlines(), 1):
        for label, pat in PATTERNS:
            if pat.search(line):
                hits.append((no, label))
    return hits


def candidate_files(root: Path) -> list[Path]:
    try:
        out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=root,
                             capture_output=True, text=True, check=True).stdout.splitlines()
        files = [root / p for p in out]
    except (OSError, subprocess.CalledProcessError):
        files = [p for p in root.rglob("*") if p.is_file()]
    return [p for p in files if p.is_file() and not (set(p.relative_to(root).parts) & SKIP_DIRS)
            and p.suffix.lower() not in SKIP_SUFFIX]


def main(argv: list[str]) -> int:
    files = [Path(a) for a in argv] if argv else candidate_files(ROOT)
    problems = []
    for f in files:
        if f.name in NEVER_COMMIT:
            problems.append(f"{f}: a .env file must never be committed")
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        problems += [f"{f}:{no}: looks like a {label}" for no, label in scan_text(text)]
    for p in problems:
        print("::error title=Possible secret::" + p)
    print(f"Secret check: {len(files)} files, {len(problems)} problem(s).")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
