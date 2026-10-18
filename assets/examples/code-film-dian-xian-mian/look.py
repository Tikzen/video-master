"""Shared design system for the 点·线·面 → 动 reel: format, clock, palette, chapter names.
Every chapter imports from here, so one change re-styles the whole film (the 'lock')."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.environ.get("MOTIONKIT_PATH") or next((p for p in (os.path.join(HERE, ".motionkit"),
               os.path.abspath(os.path.join(HERE, "..", "..", "..", "engine"))) if os.path.isdir(p)), "")
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)

import motionkit as mk                                     # noqa: E402
from motionkit.ease import *                               # noqa: E402,F401,F403
from motionkit.draw import (circle, ellipse, fill_bg, poly, path_from_array, rgba, rrect,  # noqa: E402,F401
                            morph_pts as shape_pts)
from motionkit.text import Run, face, fit_width, glyph_path  # noqa: E402,F401
from motionkit.annotate import annot                       # noqa: E402,F401
from motionkit.color import hexc, mix as mixc               # noqa: E402,F401

# ---- format & clock: 128 BPM × 8 bars = exactly 15.000 s
W, H, FPS, DUR = 1920, 1080, 60, 15.0
CX, CY = W / 2, H / 2
GRID = mk.Grid.fit(DUR, bars=8)
BEAT, BAR = GRID.beat_s, GRID.bar_s
B = GRID.beat                                              # B(n): time of beat n
CACHE_DIR = os.path.join(HERE, "cache")

# ---- palette roles (Bauhaus primaries, warm paper, near-black ink)
INK = hexc("0B0B0D")
PAPER = hexc("EDE8DF")
RED = hexc("FF3B1F")       # the accent: the point, the seal
BLUE = hexc("2440FF")
YELLOW = hexc("FFC21A")
GREY = hexc("8A867E")

CHAPTERS = [("点", "POINT"), ("线", "LINE"), ("面", "PLANE"), ("字", "TYPE"),
            ("流", "FLOW"), ("体", "VOLUME"), ("律", "RHYTHM"), ("动", "MOTION")]


def new_surface(w=W, h=H):
    return mk.draw.new_surface(w, h)


def new_ctx(surf):
    return mk.draw.new_ctx(surf)


vnoise1 = mk.noise1

# old role name used by the chapters → the bundled variable display face
mk.fonts.register("archivo", mk.fonts.resolve("display")[0])


def hash01(*args):
    """The reel's original hash (kept so bokeh/splatter positions match the approved cut exactly)."""
    h = 0
    for a in args:
        h = (h * 1000003) ^ int(a * 9973 + 17)
        h &= 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return (h & 0xFFFFFF) / float(0x1000000)
