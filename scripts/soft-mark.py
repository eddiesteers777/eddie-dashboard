#!/usr/bin/env python3
"""Draws the soft Southbound mark (four colored lines that merge into one, ending
in a dot) and writes it into brand/*.svg. Replaces the traced SB monogram
(trace-logo.py + recolor-logo.py) as the source of the mark (2026-11-11, Eddie
picked "S, set 2"). Then run: node scripts/build-icons.mjs && node scripts/build-emoji.mjs
(if emoji use the logo) && npm run manifest.
The wordmark in southbound-logo*.svg is kept as it was."""
import re, pathlib
B = pathlib.Path(__file__).resolve().parent.parent / "brand"
# Mark box matches the old viewBox so header/tile sizing does not change.
VB = "12 6 186 119"
S = 1.088; TX, TY = 3.3, 4.0           # fits drawing bounds (8..179 x 4..109) into the box

def mark(colors, dot):
    ys = [10, 30, 50, 70]
    lines = "".join(
        f'<path d="M14 {y} C84 {y} 96 100 150 100" fill="none" stroke="{c}" stroke-width="12" stroke-linecap="round"/>'
        for y, c in zip(ys, colors))
    return (f'<g transform="translate({TX} {TY}) scale({S})">{lines}'
            f'<circle cx="170" cy="100" r="9" fill="{dot}"/></g>')

NIGHT = (["#C7D6E4", "#8FC3EE", "#8FD0B2", "#D2AD62"], "#E6EEF5")   # on fog navy
DAY   = (["#6F8397", "#4F8FC4", "#4FA582", "#B58A38"], "#17212B")   # on light paper

def write(name, text): (B / name).write_text(text)

write("sb-mark.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">{mark(*NIGHT)}</svg>')
write("sb-mark-forest.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}">{mark(*DAY)}</svg>')

# Tile: keep the rounded fog background, swap the mark (740 wide, centered).
t = (B / "sb-tile.svg").read_text()
t = re.sub(r'<g transform="translate\([^)]*\) scale\([^)]*\)">.*</g></svg>',
           f'<g transform="translate(130 263) scale(3.978) translate(-12 -6)">{mark(*NIGHT)}</g></svg>', t, flags=re.S)
t = re.sub(r'<linearGradient id="sbg".*?</linearGradient>', "", t, flags=re.S)
write("sb-tile.svg", t)

# Lockups: replace the first two paths (the old monogram), keep the wordmark.
for name, pal in (("southbound-logo.svg", NIGHT), ("southbound-logo-forest.svg", (["#6F8397", "#4F8FC4", "#4FA582", "#B89B6E"], "#0E251B"))):
    s = (B / name).read_text()
    s = re.sub(r'<linearGradient id="sbg".*?</linearGradient>', "", s, flags=re.S)
    s = re.sub(r'(<path fill-rule="evenodd"[^>]*/>){2}', mark(*pal), s, count=1)
    write(name, s)
print("wrote brand marks")
