"""点 · 线 · 面 → 动 — 15 s motion-design reel (reference code film for Video Master / motionkit).

    python film.py info                 grid, chapters, events
    python film.py sheet --chapters     one contact sheet per chapter
    python film.py still 7.2 13.9       full-size frames
    python film.py diff                 continuity check (unexpected pops)
    python score.py                     original score → audio/score.wav
    python film.py audio-qa             loudness / bands / sync vs events
    python film.py chunks 0 12          resumable render, then:  python film.py assemble

Read STORYBOARD.md first: every chapter is born from the previous one (object handoffs),
and the last frame equals the first (loop).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "chapters")]

from look import B, BAR, CHAPTERS, DUR, FPS, H, W, mk, prog  # noqa: E402

import c1_point_line   # noqa: E402
import c2_plane        # noqa: E402
import c3_type         # noqa: E402
import c4_flow_volume  # noqa: E402
import c5_rhythm       # noqa: E402
import c6_motion       # noqa: E402

film = mk.Film("dian-xian-mian", W, H, FPS, DUR, bars=8, root=__file__)
g, ev = film.grid, film.events

# ---------------------------------------------------------------- chapters: one bar each
# (module, chapter index) – c1 and c4 each own two chapters that share continuous state
ROUTE = [c1_point_line, c1_point_line, c2_plane, c3_type, c4_flow_volume, c4_flow_volume, c5_rhythm, c6_motion]
for i, ((glyph, name), mod) in enumerate(zip(CHAPTERS, ROUTE)):
    film.chapter(g.bar(i), g.bar(i + 1), name=name, glyph=glyph)(lambda ctx, t, ch, m=mod: m.draw(ctx, t))

# ---------------------------------------------------------------- shared events (picture ⇄ sound ⇄ QA)
for k, (off, land, h, T, x0, x1) in enumerate(c1_point_line.HOPS):
    ev.add("land%d" % (k + 1), land, "hit")
ev.add("launch", c1_point_line.LAUNCH, "whoosh", dur=0.2)
ev.add("split", c1_point_line.T_SPLIT, "swell")
ev.add("square", g.bar(2), "hit")
ev.add("circle", c2_plane.TB1, "hit")
ev.add("triangle", c2_plane.TB2, "hit")
ev.add("expand", c2_plane.TB3, "whoosh", dur=0.4)
for k, tl in enumerate(c3_type.TL):
    ev.add("type_line%d" % (k + 1), tl, "word")
ev.add("riser", c3_type.T_RISE, "swell", dur=BAR / 4)
ev.add("drop", g.bar(4), "drop")
ev.add("sphere", g.bar(5), "hit")
ev.add("cube", B(21), "hit")
ev.add("pyramid", B(22), "hit")
ev.add("warp", B(23), "swell", dur=g.beat_s)
for k, tb in enumerate(c5_rhythm.TB):
    ev.add("card%d" % (k + 1), tb, "hit")
ev.add("implode", c5_rhythm.IMPLODE[0], "swell", dur=c5_rhythm.IMPLODE[1] - c5_rhythm.IMPLODE[0])
ev.add("seal", g.bar(7) + 0.02, "drop")
ev.add("outro", c6_motion.T_OUT, "whoosh", dur=0.35)

# ---------------------------------------------------------------- impacts (shake + chroma + flash, decaying)
film.impact(ev["drop"], shake=16, ca=0.010, flash=0.85, decay=0.18)
film.impact(g.bar(6), ca=0.008, flash=1.0, decay=0.16)          # warp flash → montage
film.impact(ev["seal"], shake=20, ca=0.007, decay=0.32)
film.impact(ev["launch"], ca=0.004, decay=0.14)
film.impact(ev["square"], shake=4, decay=0.18)

# ---------------------------------------------------------------- motion blur (180° shutter)
fast = [(BAR - 0.01, BAR + 0.3), (2 * BAR + 3 * g.beat_s, 3 * BAR + 0.05), (4 * BAR - 0.05, 4 * BAR + 0.35),
        (6 * BAR - 0.5, 6 * BAR + 0.1), (7 * BAR - 0.25, 7 * BAR + 0.3), (14.5, 15.0)]
film.blur(default=6, windows=[(4 * BAR, 6 * BAR, 4),                 # 6000 particles: cheaper, still smooth
                              (B(6) - 0.02, B(7) + 0.1, 12)]         # lens bulge through 27 thin lines
                             + [(a, b, 10) for a, b in fast])

# ---------------------------------------------------------------- look
film.post.update(grain=0.022, vig=0.22)
BLOOM = [0.35, 0.40, 0.0, 0.0, 0.95, 1.05, 0.30, 0.0]   # dark grounds glow, paper grounds stay crisp


@film.fx
def look(t, fx):
    ch = film.chapter_at(t).index
    fx["bloom"] = BLOOM[ch]
    if ch == 1:
        fx["bloom"] = 0.40 * (1 - prog(t, 1.6 * BAR, 1.9 * BAR))
    if ch in (4, 5):
        fx["bloom_thr"] = 0.42
    if ch == 3:                                               # riser: the full stop starts to glow
        r = prog(t, 3 * BAR + 3 * g.beat_s, 4 * BAR)
        fx["bloom"] = 0.6 * r
        fx["ca"] += 0.004 * r * r
    for k in range(1, 4):                                     # montage cut accents
        tau = t - (6 * BAR + B(k))
        if 0 <= tau < 0.4:
            fx["ca"] += 0.005 * 2.718281828 ** (-tau / 0.08)
    for mod in (c4_flow_volume, c5_rhythm, c6_motion, c3_type):
        if hasattr(mod, "fx"):
            mod.fx(t, fx)


film.precompute(c4_flow_volume.precompute)
film.hud = mk.HUD(film, identity="CLAUDE", subtitle="MOTION DESIGN REEL  2026")

if __name__ == "__main__":
    sys.exit(film.cli())
