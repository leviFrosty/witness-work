#!/usr/bin/env python3
"""Writes the web app's icons into public/icons/ from the app's own artwork.

Run it when src/assets/icon.png or adaptive-icon.png changes, and commit the
PNGs: `python3 scripts/generate-web-icons.py`. They are small, and the manifest
(public/manifest.webmanifest) and index.html point at them.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

icon = Image.open(ROOT / "src/assets/icon.png").convert("RGBA")
adaptive = Image.open(ROOT / "src/assets/adaptive-icon.png").convert("RGBA")
# The adaptive icon's background colour in app.config.ts.
BACKGROUND = (248, 249, 250, 255)


def save(image, name, size):
    image.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


save(icon, "icon-192.png", 192)
save(icon, "icon-512.png", 512)
# Maskable: the foreground on a full-bleed background, so any mask shape is safe.
maskable = Image.new("RGBA", adaptive.size, BACKGROUND)
maskable.alpha_composite(adaptive)
save(maskable, "icon-maskable-512.png", 512)
save(icon, "apple-touch-icon.png", 180)
