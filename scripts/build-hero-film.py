"""Southbound: the old-print look of the home page photo (option I3, Eddie 2026-10-28).

The effect is baked into the file once, so phones do no extra work:
strong sepia, soft grain, a warm light leak top right, dark corners.
Source: images/originals/hero-field-original.jpg (untouched Pexels photo).
Writes images/hero-field.jpg. Then run `python3 scripts/build-images.py`
for the WebP sizes, and `npm run manifest`.

    python3 scripts/build-hero-film.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = os.path.join(ROOT, "images", "originals", "hero-field-original.jpg")
out = os.path.join(ROOT, "images", "hero-field.jpg")

im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
h, w = a.shape[:2]

# Sepia at 70 percent, a touch less saturated.
sep = np.stack([
    a[..., 0] * .393 + a[..., 1] * .769 + a[..., 2] * .189,
    a[..., 0] * .349 + a[..., 1] * .686 + a[..., 2] * .168,
    a[..., 0] * .272 + a[..., 1] * .534 + a[..., 2] * .131,
], -1)
a = a * .3 + np.clip(sep, 0, 1) * .7

yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
# Warm light leak, top right.
d = np.sqrt(((xx - w) / (w * .7)) ** 2 + (yy / (h * .6)) ** 2)
leak = np.clip(1 - d, 0, 1) ** 1.6 * .55
a = a + leak[..., None] * np.array([1.0, .55, .24], dtype=np.float32)
# Dark corners.
v = np.sqrt(((xx - w / 2) / (w * .62)) ** 2 + ((yy - h * .45) / (h * .62)) ** 2)
a = a * (1 - np.clip((v - .55) / .6, 0, 1) ** 1.5 * .5)[..., None]
# Grain (fixed seed so a rebuild gives the same file).
rng = np.random.default_rng(7)
a = a + rng.normal(0, .035, (h, w, 1)).astype(np.float32)
Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(out, "JPEG", quality=84, optimize=True)
print("wrote", os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")
