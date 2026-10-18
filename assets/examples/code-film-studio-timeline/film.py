"""演播室范例 · 《一条时间线》— two-host explainer, 18 s, motionkit studio kit.

    python film.py info | still 2 7 12 | sheet --chapters | diff | chunks 0 12 | assemble
    python score.py ; python film.py audio-qa

What this example teaches (references/craft/genre-studio.md):
  * SPEECH IS THE CLOCK: every line's start/end comes from the voice (here a labelled synthetic
    placeholder; swap add_synthetic → add_wav with real TTS and everything re-times itself).
  * shots come from the script (auto_shots): singles on long lines, two-shot on quick turns,
    a move to the screen when a line carries evidence, back to wide at the end.
  * the evidence (the timeline graphic) is the hero when it is on screen: hosts fade out of its way,
    the speaker survives as a PIP, captions stay in one fixed zone.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.environ.get("MOTIONKIT_PATH") or next((p for p in (os.path.join(HERE, ".motionkit"),
               os.path.abspath(os.path.join(HERE, "..", "..", "..", "engine"))) if os.path.isdir(p)), "")
sys.path.insert(0, ENGINE)

import motionkit as mk                                    # noqa: E402
from motionkit import studio as st                        # noqa: E402
from motionkit.annotate import label                      # noqa: E402
from motionkit.draw import rgba, rrect                    # noqa: E402
from motionkit.ease import io_cubic, out_expo, prog       # noqa: E402

W, H, FPS, DUR = 1920, 1080, 60, 18.0
PAL = mk.palette("studio-warm")

film = mk.Film("studio-timeline", W, H, FPS, DUR, root=__file__)
ev = film.events

# ---------------------------------------------------------------- script → speech clock
sp = st.Speech(fps=FPS)
GAP = 0.32                                                # breath between turns
l1 = sp.add_synthetic("a", "大家好，今天聊聊代码视频的核心。", 0.9, expression="smile")
l2 = sp.add_synthetic("b", "核心只有一样东西：一条时间线。", l1.t1 + GAP, expression="explain")
l3 = sp.add_synthetic("a", "画面、配音和字幕，都从它读取时间。", l2.t1 + GAP, media="timeline")
l4 = sp.add_synthetic("b", "所以改一处，全片的节奏一起跟着动。", l3.t1 + GAP, expression="excited")
for i, ln in enumerate(sp.lines):
    ev.add("line%d" % (i + 1), ln.t0, "speech", speaker=ln.speaker, text=ln.text, dur=ln.t1 - ln.t0)
ev.add("screen_in", l3.t0 - 0.18, "whoosh", dur=0.7)
ev.add("playhead", l3.t0 + 1.2, "tick")

# ---------------------------------------------------------------- cast (two distinct but matched designs)
host_a = st.VectorHost(skin="#F1C7A3", hair="#2A1E1C", outfit=PAL.accent, hair_style="bob", outfit_style="blazer",
                       earrings="#F3C969")
host_b = st.VectorHost(skin="#D9A57E", hair="#1B1A1F", outfit=PAL.support, hair_style="short",
                       outfit_style="hoodie", glasses=True)
perf_a = st.Performance("a", sp, [(0, "smile"), (l3.t0, "explain"), (l4.t0, "smile")], seed=3,
                        gestures=[(l3.t0 + 0.2, l3.t0 + 1.6)])
perf_b = st.Performance("b", sp, [(0, "neutral"), (l2.t0, "explain"), (l4.t0, "excited")], seed=8,
                        gestures=[(l4.t0 + 0.3, l4.t1)])
hosts = {"a": st.HostSpec(host_a, perf_a, "阿岚", "主持人", PAL.accent),
         "b": st.HostSpec(host_b, perf_b, "小青", "技术嘉宾", PAL.support, facing=-1)}


# ---------------------------------------------------------------- the evidence: a living timeline graphic
def timeline_screen(ctx, t):
    """Drawn in 1920×1080 design space; the set maps it onto the LED wall."""
    t0 = l3.t0
    rgba(ctx, mk.shade(PAL.ground2, -0.15))
    ctx.paint()
    label(ctx, "ONE TIMELINE", 160, 220, PAL.accent, out_expo(prog(t, t0 - 0.3, t0 + 0.2)), 40, 800,
          tracking=0.18, role="display")
    tracks = [("画面 PICTURE", PAL.accent), ("配音 VOICE", PAL.support), ("字幕 CAPTION", PAL.support2)]
    x0, x1 = 160, 1760
    for k, (name, col) in enumerate(tracks):
        y = 380 + k * 170
        u = out_expo(prog(t, t0 + 0.1 * k, t0 + 0.7 + 0.1 * k))
        label(ctx, name, x0, y - 22, (1, 1, 1), u, 26, 600, role="cjk_regular", tracking=0.04)
        rgba(ctx, (1, 1, 1), 0.12 * u)
        ctx.rectangle(x0, y, (x1 - x0) * u, 64)
        ctx.fill()
        for j in range(5):                               # clips on the track, staggered in
            a = x0 + j * 320 + (40 if k == 1 else 0) * (j % 2)
            w = 260 - 50 * ((j + k) % 3)
            v = out_expo(prog(t, t0 + 0.3 + 0.06 * (j + k), t0 + 0.9 + 0.06 * (j + k)))
            rgba(ctx, col, 0.9)
            rrect(ctx, a, y + 8, w * v, 48, 8)
            ctx.fill()
    # playhead sweeps; every track lights where it passes = "everything reads one clock"
    ph = x0 + (x1 - x0) * io_cubic(prog(t, ev["playhead"], l3.t1 + 0.4))
    rgba(ctx, (1, 1, 1))
    ctx.rectangle(ph - 2, 330, 4, 470)
    ctx.fill()
    rrect(ctx, ph - 34, 300, 68, 34, 8)
    ctx.fill()
    label(ctx, "%.2f s" % max(0.0, t - t0), ph, 323, mk.shade(PAL.ground2, -0.15), 1, 18, 700, "center")


set_ = st.NewsSet(PAL, brand="VIDEO MASTER · LIVE")
show = st.Show(film, sp, set_, hosts, screens={"timeline": timeline_screen},
               idle_screen=st.default_screen("一条时间线", PAL, kicker="TODAY", role="cjk"),
               ticker_text="代码渲染 · 同一时钟驱动画面、声音与字幕 · 改一处全片联动")

film.chapter(0, DUR, name="SHOW", glyph="播")(lambda ctx, t, ch: show.draw(ctx, t))
for ts, name, mode in show.cam.shots:                      # every camera cut is intentional
    if mode == "cut" and ts > 0:
        film.cut(ts)
film.blur(default=4, windows=[(ev["screen_in"] - 0.05, ev["screen_in"] + 0.8, 8)])
film.post.update(grain=0.012, vig=0.14, bloom=0.0)

if __name__ == "__main__":
    print("NOTE: voice is a synthetic placeholder envelope — replace add_synthetic with add_wav for delivery.")
    sys.exit(film.cli())
