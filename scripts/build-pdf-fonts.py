"""Southbound — the fueling PDF's fonts.

jsPDF can only embed TrueType fonts, and it embeds the whole file, so this
turns the site's own self-hosted web fonts (fonts/*.woff2, SIL OFL; their
licenses sit next to them) into small static .ttf files in fonts/pdf/:

  Bebas Neue      titles and big numbers (as on every page header)
  Inter 400 / 700 body text (the variable font pinned to two weights)
  JetBrains Mono  times, miles and amounts in the schedule
  Saira 800       the Southbound wordmark

Run after changing a font:  python3 scripts/build-pdf-fonts.py
(needs:  pip install fonttools brotli)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "fonts"
OUT = SRC / "pdf"
OUT.mkdir(exist_ok=True)

# Everything the PDF writes: Basic Latin, Latin-1 and the punctuation the
# app uses. Characters the fonts don't have (⅛, →) are swapped by pdfSafe.
TEXT = "".join(chr(c) for c in range(0x20, 0x7F)) + "".join(chr(c) for c in range(0xA0, 0x100)) + "–—‘’“”•…·−"

JOBS = [
    ("bebas-neue-latin-400.woff2", None, "BebasNeue.ttf"),
    ("inter-latin-var.woff2", 400, "Inter-Regular.ttf"),
    ("inter-latin-var.woff2", 700, "Inter-Bold.ttf"),
    ("jetbrains-mono-latin-var.woff2", 500, "JetBrainsMono-Medium.ttf"),
    ("saira-latin-800.woff2", None, "Saira-ExtraBold.ttf"),
]

for src, weight, out in JOBS:
    font = TTFont(SRC / src)
    if weight is not None and "fvar" in font:
        font = instantiateVariableFont(font, {"wght": weight})
    opts = Options()
    opts.layout_features = []          # jsPDF doesn't shape text; keep it small
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    sub = Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(font)
    font.flavor = None
    font.save(OUT / out)
    print(out, (OUT / out).stat().st_size // 1024, "KB")
