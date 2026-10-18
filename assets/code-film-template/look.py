"""DESIGN SYSTEM — the film's 'lock'. Fill this in BEFORE writing any scene code.
Every chapter imports from here; change it once, the whole film follows.

Checklist (references/craft/concept-and-system.md):
  [ ] one-sentence concept that generates the structure (not a list of effects)
  [ ] format + duration; tempo chosen so the duration is a whole number of bars
  [ ] palette ROLES (ground / text / ONE accent / ≤2 support / mute) + contrast checked
  [ ] type roles: one display family (ideally variable), one mono for details, CJK if needed
  [ ] fonts checked for every character the film will show (fonts.check)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.environ.get("MOTIONKIT_PATH") or os.path.join(HERE, ".motionkit")
if os.path.isdir(ENGINE) and ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)

import motionkit as mk                     # noqa: E402
from motionkit.ease import *               # noqa: E402,F401,F403
from motionkit.draw import circle, ellipse, fill_bg, poly, rgba, rrect, morph_pts  # noqa: E402,F401
from motionkit.text import Run, face, fit_width, draw_text, draw_paragraph        # noqa: E402,F401
from motionkit.annotate import annot, label                                        # noqa: E402,F401

# ---- concept (write it here so every scene author sees it)
CONCEPT = "TODO: one sentence — what single idea generates every chapter and handoff?"

# ---- format & clock
W, H, FPS, DUR = 1920, 1080, 60, 12.0
GRID = mk.Grid.fit(DUR, bars=6)            # 6 bars in 12 s → 120 BPM. Print GRID.describe(DUR) to check.
B, BAR = GRID.beat, GRID.bar_s
CX, CY = W / 2, H / 2

# ---- palette roles (start from a tested palette, then make it yours)
PAL = mk.palette("swiss-paper")            # ground, ground2, text, accent, support, mute
for fg, bg, ratio, ok in PAL.audit():
    if not ok:
        print("WARNING low contrast %s on %s: %.2f" % (fg, bg, ratio))

# ---- type roles: register project fonts here (python -m motionkit.fonts install "Family" --dest assets/fonts)
# mk.fonts.register("display", os.path.join(HERE, "assets/fonts/BricolageGrotesque-VF.ttf"))
DISPLAY, MONO, CJK = "display", "mono", "cjk"
