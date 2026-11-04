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
    "hero-field.jpg": [1024, 1600],
    "footer-lift.jpg": [480, 800],
    "footer-barbell.jpg": [480, 800],
}
# Phone crops: a narrow slice of a wide photo for a phone held upright, so the phone doesn't download the
# whole 1600px picture to show a third of it. Box = (left, top, right, bottom) on the photo scaled to 1600 wide.
# hero-field: home.html shows it with object-fit:cover at object-position 55%; a slice 800 wide from x=440
# (= 880 - 0.55 * 800) keeps exactly the same window for any screen up to about 8:9 (2026-11-04).
CROPS = {
    "hero-field.jpg": {"phone-800": (440, 0, 1240, 900)},
}

def build_crops(record=None):
    for name, crops in CROPS.items():
        src = os.path.join(ROOT, "images", name)
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert("RGB")
        k = im.width / 1600
        base = os.path.splitext(src)[0]
        for tag, (l, t, r, b) in crops.items():
            box = tuple(round(v * k) for v in (l, t, r, b))
            out = f"{base}-{tag}.webp"
            im.crop(box).resize((r - l, b - t), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
            print(os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")
        if record is not None and name in record:
            record[name]["crops"] = list(crops)

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
    build_crops(record)
    with open(os.path.join(ROOT, "images", "sizes.json"), "w") as f:
        json.dump(record, f, indent=2)
        f.write("\n")

if __name__ == "__main__":
    main()
