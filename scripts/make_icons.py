"""Draw the app icons (the green bull-horn "V", same shapes as site/icons/logo.svg) as PNG files in site/icons/.
Pure Python, no image library. Run once; the PNGs are committed.

    python scripts/make_icons.py

favicon-32.png has a transparent background (only the V, on whatever the browser shows). Phones need a filled square
for home-screen icons, so icon-192/512 (Android, maskable) and apple-touch-icon (iPhone) use the dark theme colour.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BG = (15, 23, 42)                      # dark theme background (#0f172a)
LIGHT, DARK = (74, 222, 128), (22, 163, 74)   # #4ade80, #16a34a
BOX = (28.0, 36.0, 124.0, 110.0)       # logo.svg viewBox: x, y, width, height


def _cubic(p0, p1, p2, p3, n=24):
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out


def _horn(side: int) -> list[tuple[float, float]]:
    """Left horn (side=1) or its mirror (side=-1) as a polygon, in logo.svg units."""
    m = (lambda x: x) if side == 1 else (lambda x: 180 - x)
    a, b, c, d = (m(34), 40), (m(36), 70), (m(52), 86), (m(70), 88)
    e, f, g = (m(66), 100), (m(44), 96), (m(30), 76)
    return [a] + _cubic(a, b, c, d) + [e] + _cubic(e, f, g, a)


SHAPES = [
    (LIGHT, _horn(1)),
    (LIGHT, [(62, 88), (82, 88), (90, 112), (90, 142), (84, 142)]),
    (DARK, _horn(-1)),
    (DARK, [(98, 88), (118, 88), (96, 142), (90, 142), (90, 112)]),
]


def _coverage(poly, size, scale, ox, oy, sub=8):
    """Anti-aliased coverage (0..1) per pixel: `sub` sample rows per pixel, exact horizontal overlap per span."""
    cov = [[0.0] * size for _ in range(size)]
    pts = [((x - BOX[0]) * scale + ox, (y - BOX[1]) * scale + oy) for x, y in poly]
    edges = list(zip(pts, pts[1:] + pts[:1]))
    for py in range(size):
        for s in range(sub):
            y = py + (s + 0.5) / sub
            xs = sorted(x0 + (y - y0) * (x1 - x0) / (y1 - y0)
                        for (x0, y0), (x1, y1) in edges if (y0 <= y < y1) or (y1 <= y < y0))
            for xa, xb in zip(xs[0::2], xs[1::2]):
                xa, xb = max(xa, 0.0), min(xb, float(size))
                for px in range(int(xa), min(int(xb) + 1, size)):
                    w = min(xb, px + 1) - max(xa, px)
                    if w > 0:
                        cov[py][px] += w / sub
    return cov


def draw(size: int, background: tuple[int, int, int] | None, fill: float) -> bytes:
    """RGBA PNG; the logo's longer side takes `fill` of the icon width, centred."""
    scale = size * fill / max(BOX[2], BOX[3])
    ox, oy = (size - BOX[2] * scale) / 2, (size - BOX[3] * scale) / 2
    # premultiplied colour + alpha per pixel
    if background:
        px = [[[background[0], background[1], background[2], 255.0] for _ in range(size)] for _ in range(size)]
    else:
        px = [[[0.0, 0.0, 0.0, 0.0] for _ in range(size)] for _ in range(size)]
    for col, poly in SHAPES:
        cov = _coverage(poly, size, scale, ox, oy)
        for y in range(size):
            row, crow = px[y], cov[y]
            for x in range(size):
                a = min(crow[x], 1.0)
                if a > 0:
                    p = row[x]
                    p[0] = col[0] * a + p[0] * (1 - a)
                    p[1] = col[1] * a + p[1] * (1 - a)
                    p[2] = col[2] * a + p[2] * (1 - a)
                    p[3] = 255 * a + p[3] * (1 - a)
    raw = bytearray()
    for row in px:
        raw.append(0)
        for r, g, b, a in row:
            k = 255 / a if a > 0 else 0          # un-premultiply for PNG
            raw += bytes((min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), round(a)))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main() -> None:
    out = ROOT / "site" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    # maskable icons: logo inside the centre 80 % safe zone
    for name, size, bg, fill in (("icon-192.png", 192, BG, 0.62), ("icon-512.png", 512, BG, 0.62),
                                 ("apple-touch-icon.png", 180, BG, 0.70), ("favicon-32.png", 32, None, 1.0)):
        (out / name).write_bytes(draw(size, bg, fill))
        print("wrote", name)


if __name__ == "__main__":
    main()
