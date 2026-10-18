"""Chapter 01 — OPEN. A minimal but CORRECT chapter to copy from (replace the content, keep the habits).

Habits shown here:
  * every time comes from the grid/events (B(n), ev[...]) — no magic seconds
  * entrances use an ease from the vocabulary (SNAP / out_expo / spring), staggered per glyph
  * one hero (the title), one accent use, a quiet detail layer (the label)
  * the exit leaves an object (the accent bar) that the NEXT chapter can pick up (handoff)
"""
from look import B, CX, CY, H, PAL, W, SNAP, annot, fill_bg, label, out_expo, prog, rgba, io_cubic, Run, face

TITLE = "TITLE"          # TODO
T_IN = B(1)              # title starts on beat 1
T_OUT = B(10)            # exit begins


def draw(ctx, t, ch=None):
    fill_bg(ctx, PAL.ground)
    run = Run(face("display"), TITLE, 220, {"wght": 800}, -0.01)
    x = CX - run.ink_w / 2 - run.ink0
    base = CY + run.cap / 2

    def per_glyph(g):
        u = SNAP(prog(t, T_IN + 0.04 * g["idx"], T_IN + 0.6 + 0.04 * g["idx"]))
        return {"dy": (1 - u) * run.cap * 1.2}

    ctx.save()
    ctx.rectangle(0, base - run.cap - 20, W, run.cap + 40)        # mask: letters rise from behind a line
    ctx.clip()
    ctx.new_path()
    run.path(ctx, x, base, per_glyph)
    rgba(ctx, PAL.text)
    ctx.fill()
    ctx.restore()

    # accent bar: grows under the title, then becomes the handoff object for chapter 02
    u = out_expo(prog(t, T_IN + 0.3, T_IN + 0.9))
    e = io_cubic(prog(t, T_OUT, T_OUT + 0.5))
    bw = run.ink_w * u
    rgba(ctx, PAL.accent)
    ctx.rectangle(CX - bw / 2, base + 30, bw, 10 + e * (H - base - 30))   # bar fills the lower frame on exit
    ctx.fill()

    label(ctx, "01 — OPEN", 74, 62, PAL.mute, out_expo(prog(t, 0.2, 0.8)), 15, 600)
