"""
Southbound brand files, traced from the one source of truth:
brand/southbound-logo-source.png (the SB logo Eddie supplied, 2026-09-27).

Writes (never edit these by hand; change the source and re-run):
  brand/sb-mark.svg            cream letters + tan slash, for dark backgrounds
  brand/sb-mark-forest.svg     forest letters + tan slash, for light backgrounds
  brand/sb-tile.svg            the app tile: cream rounded square, forest mark
  brand/southbound-logo.svg    mark + SOUTHBOUND COACHING wordmark (cream)
  brand/southbound-logo-forest.svg   the same on light backgrounds
The mark keeps the coordinate box every consumer already uses
(viewBox "12 6 186 119": headers, watermarks, scripts/build-emoji.mjs).
PNG icons come from these by scripts/build-icons.mjs.

Run:  pip install potracer pillow numpy && python3 scripts/trace-logo.py
"""
import json, re
from pathlib import Path
import numpy as np
from PIL import Image
import potrace

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
SOURCE = BRAND / "southbound-logo-source.png"

# Colors measured from the source (solid interiors, away from anti-aliased edges).
FOREST = "#0E251B"
TAN = "#B89B6E"
CREAM = "#F3EFE6"

X0, Y0, X1, Y1 = 100, 280, 1140, 945   # the mark's area inside the cream tile
S = 3                                  # trace at 3x for smooth curves
BOX = (12.0, 6.0, 186.0, 119.0)        # the mark's viewBox (unchanged for every consumer)


def trace(mask):
    """Boolean mask -> list of closed curves in source pixel coordinates."""
    curves = potrace.Bitmap(~mask).trace(turdsize=60 * S, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
                                          alphamax=1.0, opticurve=True, opttolerance=0.2)
    return [[(c.start_point.x, c.start_point.y)] + [
        ("L", seg.c, seg.end_point) if seg.is_corner else ("C", seg.c1, seg.c2, seg.end_point)
        for seg in c.segments] for c in curves]


def path_d(curves, fx, fy):
    pt = lambda p: f"{fx(p[0] if isinstance(p, tuple) else p.x):.2f} {fy(p[1] if isinstance(p, tuple) else p.y):.2f}"
    out = []
    for curve in curves:
        out.append("M" + pt(curve[0]))
        for seg in curve[1:]:
            if seg[0] == "L":
                out.append("L" + pt(seg[1]) + "L" + pt(seg[2]))
            else:
                out.append("C" + pt(seg[1]) + " " + pt(seg[2]) + " " + pt(seg[3]))
        out.append("Z")
    return "".join(out)


def main():
    im = Image.open(SOURCE).convert("RGB")
    crop = im.crop((X0, Y0, X1, Y1)).resize(((X1 - X0) * S, (Y1 - Y0) * S), Image.LANCZOS)
    a = np.asarray(crop).astype(int)
    dark = a.sum(axis=2) < 395
    tan = ((a[:, :, 0] - a[:, :, 2]) > 43) & (a[:, :, 0] > 120) & ~dark
    ys, xs = np.where(dark | tan)
    left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    bx, by, bw, bh = BOX
    k = min(bw / (right - left), bh / (bottom - top))
    oy = by + (bh - (bottom - top) * k) / 2
    fx = lambda x: bx + (x - left) * k
    fy = lambda y: oy + (y - top) * k
    letters = path_d(trace(dark), fx, fy)
    slash = path_d(trace(tan), fx, fy)

    def mark(letter_fill):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{bx:g} {by:g} {bw:g} {bh:g}">'
                f'<path fill-rule="evenodd" fill="{letter_fill}" d="{letters}"/>'
                f'<path fill-rule="evenodd" fill="{TAN}" d="{slash}"/></svg>\n')

    (BRAND / "sb-mark.svg").write_text(mark(CREAM))
    (BRAND / "sb-mark-forest.svg").write_text(mark(FOREST))

    # The app tile: cream rounded square, the forest mark 86% wide, centered.
    size, width = 1000, 860
    scale = width / bw
    tx = (size - width) / 2 - bx * scale
    ty = (size - bh * scale) / 2 - by * scale
    (BRAND / "sb-tile.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" rx="225" fill="{CREAM}"/>'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f})">'
        f'<path fill-rule="evenodd" fill="{FOREST}" d="{letters}"/>'
        f'<path fill-rule="evenodd" fill="{TAN}" d="{slash}"/></g></svg>\n')

    # Lockups: the new mark + the existing SOUTHBOUND COACHING wordmark.
    for name, letter_fill in (("southbound-logo.svg", CREAM), ("southbound-logo-forest.svg", FOREST)):
        old = (BRAND / name).read_text()
        view = re.search(r'viewBox="([^"]+)"', old).group(1)
        m = re.search(r'<g id="wordmark">.*?</g><!--/wordmark-->', old, re.S)
        if m:
            words = m.group(0)
        else:   # first run: everything after the old mark
            words = '<g id="wordmark">' + old[old.index('<g transform="translate(208.0'):old.rindex("</svg>")] + "</g><!--/wordmark-->"
        if letter_fill == CREAM:
            words = words.replace("#C9AD84", TAN)   # the wordmark's tan follows the logo's
        (BRAND / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">'
            f'<path fill-rule="evenodd" fill="{letter_fill}" d="{letters}"/>'
            f'<path fill-rule="evenodd" fill="{TAN}" d="{slash}"/>{words}</svg>\n')

    print("mark", round(right - left), "x", round(bottom - top), "source px ->", f"{bw:g} x {(bottom - top) * k:.1f}")


if __name__ == "__main__":
    main()
