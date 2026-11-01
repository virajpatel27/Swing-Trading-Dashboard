"""Build the website into _site/ (snapshot + one chart file per instrument). Look at it locally with:

    python scripts/build_site.py
    python -m http.server 8000 --directory _site      -> http://localhost:8000
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import site_build  # noqa: E402


def main() -> int:
    site_build.build(ROOT, ROOT / "_site", log=lambda m: print(m, flush=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
