#!/usr/bin/env python3
"""Puts the fog-blue logo colors on the SVGs that scripts/trace-logo.py writes in the old forest/tan/cream.

Run order after a new logo source:  python3 scripts/trace-logo.py && python3 scripts/recolor-logo.py && node scripts/build-icons.mjs
Safe to run twice (it only swaps the old colors). Letters are ice blue (navy on light backgrounds); the slash carries the four
sport tints of the Get started flow (js/startFlow.js ACCENTS).
"""
import re
from pathlib import Path

BRAND = Path(__file__).resolve().parent.parent / "brand"
TINTS = ["#8FC3EE", "#A9A7E3", "#8FD0B2", "#E3C3A0"]
DEEP = ["#4F8FC4", "#7B79C9", "#4FA582", "#C79A62"]   # same hues, deeper, for light backgrounds
ICE, NAVY, MUTE = "#E6EEF5", "#17212B", "#9FB2C3"
TILE_BG = ('<radialGradient id="tbg" cx=".25" cy=".1" r="1.1"><stop offset="0" stop-color="#34506A"/><stop offset=".6" stop-color="#1A2733"/>'
           '<stop offset="1" stop-color="#121B24"/></radialGradient><linearGradient id="tsh" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>')

def grad(cols, extra=""):
    stops = "".join(f'<stop offset="{i/3:.2f}" stop-color="{c}"/>' for i, c in enumerate(cols))
    return f'<defs>{extra}<linearGradient id="sbg" x1="0" y1="1" x2="1" y2="0">{stops}</linearGradient></defs>'

def put_defs(s, d):
    return re.sub(r"(<svg[^>]*>)", lambda m: m.group(1) + d, s, count=1)

def edit(name, fn):
    p = BRAND / name
    s = p.read_text()
    if "#B89B6E" not in s and "#0E251B" not in s and "#F3EFE6" not in s:
        return   # already recolored
    p.write_text(fn(s))

edit("sb-mark.svg", lambda s: put_defs(s.replace('fill="#F3EFE6"', f'fill="{ICE}"').replace('fill="#B89B6E"', 'fill="url(#sbg)"'), grad(TINTS)))
edit("sb-mark-forest.svg", lambda s: put_defs(s.replace('fill="#0E251B"', f'fill="{NAVY}"').replace('fill="#B89B6E"', 'fill="url(#sbg)"'), grad(DEEP)))

def tile(s):
    s = s.replace('<rect width="1000" height="1000" rx="225" fill="#F3EFE6"/>',
                  '<rect width="1000" height="1000" rx="225" fill="url(#tbg)"/><rect width="1000" height="1000" rx="225" fill="url(#tsh)"/>')
    s = s.replace('fill="#0E251B"', f'fill="{ICE}"').replace('fill="#B89B6E"', 'fill="url(#sbg)"')
    return put_defs(s, grad(TINTS, TILE_BG))
edit("sb-tile.svg", tile)

def lockup(s):
    i = s.index('fill="#B89B6E"')
    s = s[:i] + 'fill="url(#sbg)"' + s[i + len('fill="#B89B6E"'):]   # the first tan shape is the slash
    s = s.replace('fill="#B89B6E"', f'fill="{MUTE}"').replace('fill="#F3EFE6"', f'fill="{ICE}"').replace('fill="#F2EEE4"', f'fill="{ICE}"')
    return put_defs(s, grad(TINTS))
edit("southbound-logo.svg", lockup)
print("logo colors set")
