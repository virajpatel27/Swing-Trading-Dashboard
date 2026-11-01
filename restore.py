"""Bring the data/ folder back from a backup. Step-by-step guide: restore.md.

    python restore.py --list                          what can be restored (weekly releases, recent data commits)
    python restore.py --from-release data-2026-11-07  the weekly zip (downloaded from GitHub, SHA-256 checked)
    python restore.py --from-commit 1a2b3c4           the data/ folder as it was in that git commit
    python restore.py --from-backup-branch            the data/ folder of the "backup" branch

The current data/ folder is first moved to data_before_restore_<time>/ (git-ignored), so nothing is lost. Afterwards the
data check runs; then commit with GitHub Desktop (Pull origin first). On GitHub the same is one click: Actions -> Restore data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def repo_slug(remote_url: str) -> str:
    """https://github.com/owner/name.git or git@github.com:owner/name.git -> owner/name"""
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?/?$", remote_url.strip())
    if not m:
        raise SystemExit(f"Not a GitHub remote: {remote_url}")
    return m.group(1)


def keep_current() -> Path | None:
    """Move data/ aside (never delete it)."""
    if not DATA.exists():
        return None
    dest = ROOT / f"data_before_restore_{datetime.now():%Y%m%d_%H%M%S}"
    shutil.move(str(DATA), str(dest))
    print(f"current data kept in {dest.name}/")
    return dest


def extract_zip(zip_path: Path, target: Path) -> int:
    """Unzip into target, refusing entries that would land outside it. Returns the number of files."""
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            dest = (target / name).resolve()
            if root not in dest.parents and dest != root:
                raise SystemExit(f"unsafe path in zip: {name}")
        z.extractall(target)
        return sum(1 for n in z.namelist() if not n.endswith("/"))


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def from_release(tag: str) -> None:
    slug = repo_slug(git("remote", "get-url", "origin"))
    base = f"https://github.com/{slug}/releases/download/{tag}/{tag}.zip"
    tmp = ROOT / "cache" / f"{tag}.zip"
    print(f"downloading {base}")
    download(base, tmp)
    download(base + ".sha256", tmp.with_suffix(".zip.sha256"))
    want = tmp.with_suffix(".zip.sha256").read_text().split()[0]
    got = hashlib.sha256(tmp.read_bytes()).hexdigest()
    if got != want:
        raise SystemExit(f"checksum mismatch ({got} != {want}): the download is damaged, nothing was changed")
    keep_current()
    n = extract_zip(tmp, DATA)
    print(f"restored {n} files from release {tag}")


def from_commit(ref: str) -> None:
    git("cat-file", "-e", f"{ref}^{{commit}}")          # fails clearly when the commit does not exist
    keep_current()
    git("checkout", ref, "--", "data")
    git("reset", "-q", "data")                           # leave the files unstaged: Viraj reviews and commits in GitHub Desktop
    print(f"restored data/ from commit {ref}")


def list_backups() -> None:
    slug = repo_slug(git("remote", "get-url", "origin"))
    try:
        with urllib.request.urlopen(f"https://api.github.com/repos/{slug}/releases?per_page=20", timeout=30) as r:
            rel = [x["tag_name"] for x in json.load(r) if x["tag_name"].startswith("data-")]
    except Exception as exc:  # noqa: BLE001
        rel = [f"(could not list releases: {type(exc).__name__})"]
    print("Weekly releases:", ", ".join(rel) or "none yet")
    print("Recent data commits:")
    print(git("log", "--oneline", "-15", "--", "data"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", action="store_true")
    g.add_argument("--from-release", metavar="TAG")
    g.add_argument("--from-commit", metavar="SHA")
    g.add_argument("--from-backup-branch", action="store_true")
    ap.add_argument("--no-check", action="store_true", help="skip the data check afterwards")
    a = ap.parse_args(argv)
    if a.list:
        list_backups()
        return 0
    if a.from_release:
        from_release(a.from_release)
    elif a.from_commit:
        from_commit(a.from_commit)
    else:
        git("fetch", "origin", "backup")
        from_commit("origin/backup")
    if a.no_check:
        return 0
    print("running the data check ...")
    # no baseline: a restore may legitimately go back to fewer rows
    return subprocess.run([sys.executable, str(ROOT / "scripts" / "validate_data.py"), "--no-baseline"], cwd=ROOT).returncode


if __name__ == "__main__":
    sys.exit(main())
