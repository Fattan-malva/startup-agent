#!/usr/bin/env python3
"""
Buat ikon aplikasi "Atelier Corp" (logo A) untuk iOS / PWA.

File yang dihasilkan:
    public/icons/apple-touch-icon.png   180x180  (iOS Add to Home Screen)
    public/icons/icon-192.png           192x192  (manifest)
    public/icons/icon-512.png           512x512  (manifest)
    public/icons/icon-maskable-512.png  512x512  (manifest, safe-zone 80%)

Jalankan:  python3 tools/make-icons.py
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")

BG_TOP = (30, 37, 48)
BG_BOT = (12, 15, 20)
A_TOP = (247, 210, 160)
A_BOT = (201, 143, 78)
GLOW = (226, 176, 119)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def vertical_gradient(size, top, bottom):
    """Gradien vertikal satu gambar."""
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        px[0, y] = lerp(top, bottom, y / max(1, size - 1))
    return img.resize((size, size), Image.BILINEAR)


def letter_a_mask(size, inset=0.0):
    """Siluet huruf A (isosceles) sebagai mask grayscale."""
    s = size
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)

    def P(x, y):
        """Koordinat ternormalisasi 0..1 -> piksel, dengan inset (padding)."""
        span = 1.0 - inset * 2
        return (inset + x * span) * s, (inset + y * span) * s

    apex = P(0.5, 0.17)
    l_out = P(0.135, 0.815)
    l_in = P(0.315, 0.815)
    r_out = P(0.865, 0.815)
    r_in = P(0.685, 0.815)

    d.polygon([apex, l_out, l_in], fill=255)
    d.polygon([apex, r_in, r_out], fill=255)

    # palang tengah
    y0, y1 = P(0, 0.585)[1], P(0, 0.675)[1]
    d.rectangle([P(0.28, 0)[0], y0, P(0.72, 0)[0], y1], fill=255)

    #=pangkal membulat sedikit
    return mask.filter(ImageFilter.GaussianBlur(max(1.0, s * 0.004)))


def letter_a_gradient(size, inset=0.0):
    """Huruf A dengan gradien hangat + glow."""
    mask = letter_a_mask(size, inset)
    grad = vertical_gradient(size, A_TOP, A_BOT)

    glow = mask.filter(ImageFilter.GaussianBlur(size * 0.035))
    glow_img = Image.new("RGB", (size, size), GLOW)
    glow_layer = Image.new("RGB", (size, size), (0, 0, 0))
    glow_layer.paste(glow_img, (0, 0), glow)

    base = Image.new("RGB", (size, size), (0, 0, 0))
    base.paste(grad, (0, 0), mask)
    return base, glow_layer


def make_icon(size, inset=0.0, radius_ratio=0.0, glow=True):
    bg = vertical_gradient(size, BG_TOP, BG_BOT)
    a, g = letter_a_gradient(size, inset)

    out = bg
    if glow:
        out = Image.blend(out, g, 0.45)
    out = Image.alpha_composite(out.convert("RGBA"), a.convert("RGBA"))

    # garis "lantai" isometric di bawah huruf A
    line = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line)
    cx = size * 0.5
    base_y = size * (inset + 0.815 * (1 - inset * 2)) + size * 0.055
    half = size * 0.30 * (1 - inset * 2)
    dep = size * 0.055
    ld.polygon(
        [
            (cx - half, base_y),
            (cx, base_y + dep),
            (cx + half, base_y),
            (cx, base_y - dep),
        ],
        fill=(226, 176, 119, 60),
    )
    out = Image.alpha_composite(out, line)

    if radius_ratio > 0:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
        )
        out.putalpha(mask)

    return out.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)

    jobs = [
        ("apple-touch-icon.png", 180, 0.055, 0.0, True),
        ("icon-192.png", 192, 0.085, 0.0, True),
        ("icon-512.png", 512, 0.085, 0.0, True),
        ("icon-maskable-512.png", 512, 0.20, 0.0, True),
    ]

    for name, size, inset, radius, glow in jobs:
        img = make_icon(size, inset=inset, radius_ratio=radius, glow=glow)
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print("  ->", os.path.relpath(path, ROOT), f"{size}x{size}")

    print("selesai.")


if __name__ == "__main__":
    main()
