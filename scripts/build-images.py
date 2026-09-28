"""Southbound: phone-sized WebP copies of the public-site photos.

The public pages load images/<name>-<width>.webp through srcset (a phone
gets a small file, a computer a sharper one) and keep the .jpg as the
fallback. Run this after adding or replacing any photo listed in SIZES:

    pip install pillow   (once)
    python3 scripts/build-images.py

It (re)writes every size and records each source photo's fingerprint in
images/sizes.json; tests/static.test.mjs fails if a photo changed and
its copies weren't rebuilt (they'd keep showing the old picture).
"""
import hashlib, json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SIZES = {
    "eddie-hero.jpg": [560, 840, 1120],
    "offer-online-coaching.jpg": [480, 800, 1280],
    "offer-running-strength.jpg": [480, 800, 1280],
    "offer-soccer-1on1.jpg": [480, 800, 1280],
    "offer-soccer-group.jpg": [480, 800, 1280],
    "gallery-1.jpg": [500, 1000],
}

def main():
    record = {}
    for name, widths in SIZES.items():
        src = os.path.join(ROOT, "images", name)
        if not os.path.exists(src):
            continue
        with open(src, "rb") as f:
            record[name] = {"sha256": hashlib.sha256(f.read()).hexdigest()[:16], "widths": widths}
        im = Image.open(src).convert("RGB")
        base = os.path.splitext(src)[0]
        for w in widths:
            out = f"{base}-{w}.webp"
            im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
            print(os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")
    with open(os.path.join(ROOT, "images", "sizes.json"), "w") as f:
        json.dump(record, f, indent=2)
        f.write("\n")

if __name__ == "__main__":
    main()
