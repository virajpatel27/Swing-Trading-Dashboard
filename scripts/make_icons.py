"""Draw the app icons (rising candles on a dark square) as PNG files in site/icons/. Pure Python, no image library.
Run once; the PNGs are committed.

    python scripts/make_icons.py
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BG, GREEN, RED = (15, 23, 42), (34, 197, 94), (239, 68, 68)
# candles in a 100 x 100 design grid, inside the maskable safe zone (centre 80 %): (x, body top, body bottom, wick top, wick bottom, colour)
CANDLES = [(24, 58, 72, 52, 78, GREEN), (38, 50, 62, 44, 68, RED), (52, 40, 56, 34, 62, GREEN), (66, 28, 46, 22, 52, GREEN)]


def draw(size: int) -> bytes:
    px = [[BG] * size for _ in range(size)]
    s = size / 100

    def rect(x0, y0, x1, y1, col):
        for y in range(int(y0 * s), int(y1 * s)):
            for x in range(int(x0 * s), int(x1 * s)):
                if 0 <= x < size and 0 <= y < size:
                    px[y][x] = col
    for x, bt, bb, wt, wb, col in CANDLES:
        rect(x + 3.5, wt, x + 5.5, wb, col)           # wick
        rect(x, bt, x + 9, bb, col)                    # body
    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in px)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main() -> None:
    out = ROOT / "site" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)):
        (out / name).write_bytes(draw(size))
        print("wrote", name)


if __name__ == "__main__":
    main()
