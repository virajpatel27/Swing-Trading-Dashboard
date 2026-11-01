"""Install a git pre-commit hook that runs scripts/check_secrets.py on the files being committed (GitHub Desktop runs it
too). It blocks a commit that contains a key, token, TOTP secret or a .env file. If Python is not found it only warns.

    python scripts/install_hooks.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HOOK = """#!/bin/sh
# Installed by scripts/install_hooks.py: stop secrets from being committed.
PY="{python}"
[ -x "$PY" ] || PY="$(command -v python3 || command -v python)"
if [ -z "$PY" ]; then
  echo "secret check skipped: Python not found" >&2
  exit 0
fi
FILES=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$FILES" ] && exit 0
echo "$FILES" | tr '\\n' '\\0' | xargs -0 "$PY" scripts/check_secrets.py || {{
  echo "Commit stopped: something that looks like a secret is in the files above. Remove it and commit again." >&2
  exit 1
}}
"""


def main() -> int:
    hooks = ROOT / ".git" / "hooks"
    if not hooks.is_dir():
        print("no .git/hooks folder: run this inside the repository")
        return 1
    path = hooks / "pre-commit"
    path.write_text(HOOK.format(python=Path(sys.executable).as_posix()), encoding="utf-8", newline="\n")
    path.chmod(0o755)
    print(f"installed {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
