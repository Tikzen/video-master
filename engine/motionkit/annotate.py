"""The 'detail layer': technical annotations that make craft visible without competing with the hero.

Rules (references/craft/concept-and-system.md → Detail layer):
  * small (12–16 px mono), low contrast (55–90 % alpha), one weight lighter than the hero
  * appear AFTER the event they describe (≈0.1 s), leave before the next hero event
  * at most 1–2 on screen at once; never over the focal subject or essential copy
"""
import math

from .draw import circle, rgba
from .ease import clamp, lerp, out_expo, prog
from .text import Run, face, face_for


def annot(ctx, t, t_in, t_out, anchor, elbow, label, align="left", sub=None, col=(0.93, 0.91, 0.88),
          size=14, role="mono"):
    """Leader-line callout: dot at `anchor`, line to `elbow`, underline sized to the label, typed-on text.
    align='left' writes to the right of the elbow; 'right' writes to the left."""
    if t < t_in or t > t_out + 0.22:
        return
    fade = 1 - prog(t, t_out, t_out + 0.22)
    fc = face_for(label + (sub or ""), role)
    full = Run(fc, label, size, {"wght": 600}, 0.08)
    seg = full.advance + 8
    ax, ay = anchor
    ex, ey = elbow
    sgn = 1 if align == "left" else -1
    lx = ex + sgn * seg
    u1 = out_expo(prog(t, t_in, t_in + 0.16))
    u2 = out_expo(prog(t, t_in + 0.08, t_in + 0.3))
    ctx.save()
    ctx.set_line_width(1.2)
    rgba(ctx, col, 0.8 * fade)
    circle(ctx, ax, ay, 3.0 * u1)
    ctx.fill()
    ctx.move_to(ax, ay)
    ctx.line_to(lerp(ax, ex, u1), lerp(ay, ey, u1))
    if u2 > 0:
        ctx.line_to(lerp(ex, lx, u2), ey)
    ctx.stroke()
    n = int(len(label) * prog(t, t_in + 0.12, t_in + 0.36) + 0.999)
    if n > 0:
        tx = ex + 4 if align == "left" else lx + 4
        run = Run(fc, label[:n], size, {"wght": 600}, 0.08)
        ctx.new_path()
        run.path(ctx, tx, ey - 8)
        rgba(ctx, col, 0.95 * fade)
        ctx.fill()
        if sub and n == len(label):
            run2 = Run(fc, sub, size - 2, {"wght": 400}, 0.06)
            ctx.new_path()
            run2.path(ctx, tx, ey + 19)
            rgba(ctx, col, 0.6 * fade * prog(t, t_in + 0.36, t_in + 0.5))
            ctx.fill()
    ctx.restore()


def label(ctx, s, x, y, col, a=1.0, size=13, wght=600, align="left", role="mono", tracking=0.08):
    run = Run(face_for(s, role), s, size, {"wght": wght}, tracking)
    if align == "right":
        x -= run.advance
    elif align == "center":
        x -= run.advance / 2
    ctx.new_path()
    run.path(ctx, x, y)
    rgba(ctx, col, a)
    ctx.fill()
    return run.advance


def typed(s, u):
    """Typewriter reveal: prefix of s for progress u."""
    return s[: int(math.floor(len(s) * clamp(u) + 1e-6))]


def rails(ctx, x0, x1, ys, u, col, a=0.4, width=1.0):
    """Typographic guide rails (baselines / cap lines) drawing on left→right with progress u."""
    if u <= 0:
        return
    ctx.save()
    ctx.set_line_width(width)
    rgba(ctx, col, a)
    for y in ys:
        ctx.move_to(x0, y + 0.5)
        ctx.line_to(lerp(x0, x1, u), y + 0.5)
    ctx.stroke()
    ctx.restore()


def dimension(ctx, x0, y0, x1, y1, text, col, u=1.0, a=0.8, tick=6, size=12):
    """Measurement line with end ticks and a centred label (logo construction sheets, specs)."""
    if u <= 0:
        return
    ctx.save()
    ctx.set_line_width(1.0)
    rgba(ctx, col, a)
    xm, ym = lerp(x0, x1, u), lerp(y0, y1, u)
    ctx.move_to(x0, y0)
    ctx.line_to(xm, ym)
    ang = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    for (x, y) in ((x0, y0), (x1, y1)):
        ctx.move_to(x - math.cos(ang) * tick, y - math.sin(ang) * tick)
        ctx.line_to(x + math.cos(ang) * tick, y + math.sin(ang) * tick)
    ctx.stroke()
    ctx.restore()
    if u >= 0.6:
        label(ctx, text, (x0 + x1) / 2, (y0 + y1) / 2 - 10, col, a * prog(u, 0.6, 1.0), size, 600, "center")


def crop_marks(ctx, w, h, inset=40, arm=26, u=1.0, col=(1, 1, 1), a=0.9, width=1.5):
    ctx.save()
    ctx.set_line_width(width)
    rgba(ctx, col, a)
    for i, (cx, cy, dx, dy) in enumerate(((inset, inset, 1, 1), (w - inset, inset, -1, 1),
                                         (inset, h - inset, 1, -1), (w - inset, h - inset, -1, -1))):
        k = out_expo(prog(u, i * 0.08, 0.6 + i * 0.08))
        if k <= 0:
            continue
        ctx.move_to(cx, cy + dy * arm * k)
        ctx.line_to(cx, cy)
        ctx.line_to(cx + dx * arm * k, cy)
    ctx.stroke()
    ctx.restore()


def bracket(ctx, x0, y0, x1, y1, col, a=0.7, arm=8, width=1.2):
    """Corner brackets around a box (focus frames, UI call-outs)."""
    ctx.save()
    ctx.set_line_width(width)
    rgba(ctx, col, a)
    for (x, y, dx, dy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        ctx.move_to(x, y + dy * arm)
        ctx.line_to(x, y)
        ctx.line_to(x + dx * arm, y)
    ctx.stroke()
    ctx.restore()
