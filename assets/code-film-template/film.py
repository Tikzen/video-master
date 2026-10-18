"""__TITLE__ — code film (motionkit).  Replace every TODO, then delete this line.

    python film.py info               clock, chapters, events (check for gaps)
    python film.py still 1.0 3.2      full-size frames → renders/stills/
    python film.py sheet --chapters   one contact sheet per chapter → renders/sheets/
    python film.py diff               continuity QA (unexpected pops between frames)
    python score.py                   original score → audio/score.wav
    python film.py audio-qa           loudness / bands / sync vs. events
    python film.py chunks 0 12        resumable render (repeat until 12/12), then:
    python film.py assemble           delivery/<name>.mp4

Order of work (references/craft/README.md): concept → look.py → storyboard + EVENTS →
ONE hero chapter to full quality → the rest → handoffs → score → QA → render.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "chapters")]

from look import DUR, FPS, H, W, mk  # noqa: E402

import ch01_open  # noqa: E402   TODO: one module per chapter (or per pair that shares state)

film = mk.Film("__NAME__", W, H, FPS, DUR, bars=__BARS__, root=__file__)
g, ev = film.grid, film.events

# ---------------------------------------------------------------- chapters (cover 0 → DUR with no gaps)
film.chapter(0.0, DUR, name="OPEN", glyph="")(ch01_open.draw)          # TODO: split into real chapters

# ---------------------------------------------------------------- shared events: picture ⇄ sound ⇄ QA
# Every visible hit/landing/word/transition gets ONE named time here. Scenes and score.py read it.
ev.add("title", g.beat(4), "word")                                       # TODO

# ---------------------------------------------------------------- impacts (shake + chroma + flash) — big hits only
# film.impact(ev["drop"], shake=14, ca=0.008, flash=0.7, decay=0.18)

# ---------------------------------------------------------------- motion blur: 6 sub-frames, more on fast moves
film.blur(default=6, windows=[])                                         # e.g. [(t0, t1, 10)]

# ---------------------------------------------------------------- look
film.post.update(grain=0.02, vig=0.2)                                    # bloom per chapter in @film.fx


@film.fx
def look_fx(t, fx):
    fx["bloom"] = 0.0          # TODO: 0.3–1.0 on dark/emissive chapters, 0 on paper/UI


# film.hud = mk.HUD(film, identity="BRAND", subtitle="SUBTITLE")         # optional technical overlay

if __name__ == "__main__":
    sys.exit(film.cli())
