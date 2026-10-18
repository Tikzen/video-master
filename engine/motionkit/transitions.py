"""Transitions where BOTH sides stay alive.

Every function takes draw callbacks `a(ctx)` (outgoing) and `b(ctx)` (incoming) that draw their
scene at the CURRENT time, so nothing freezes during the handoff. Use these only when no object
can carry the cut (see references/craft/handoffs.md: object continuity first, these second).

    def draw(ctx, t, ch):
        u = mk.io_cubic(mk.prog(t, T0, T0 + 0.25))
        tr.iris(ctx, lambda c: card_a(c, t), lambda c: card_b(c, t), u, origin=(960, 540), w=W, h=H)
"""
import math

import cairo

from .draw import circle, fill_bg, group, poly, rgba
from .ease import clamp, io_cubic, lerp, out_expo, prog


def _pat(ctx, fn):
    ctx.push_group()
    fn(ctx)
    return ctx.pop_group()


def iris(ctx, a, b, u, origin, w, h, ring=None, ring_w=10.0):
    """Circular reveal of b from origin (u 0→1). ring=(rgb, alpha) draws a shock ring at the edge."""
    a(ctx)
    if u <= 0:
        return
    r = math.hypot(max(origin[0], w - origin[0]), max(origin[1], h - origin[1])) * u * 1.02
    pb = _pat(ctx, b)
    ctx.save()
    circle(ctx, origin[0], origin[1], r)
    ctx.clip()
    ctx.set_source(pb)
    ctx.paint()
    ctx.restore()
    if ring and u < 1:
        ctx.set_line_width(ring_w * (1 - u) + 1)
        rgba(ctx, ring[0], ring[1] * (1 - u))
        circle(ctx, origin[0], origin[1], r)
        ctx.stroke()


def iris_close(ctx, content, u, center, r_from, r_to, bg, fill=None, rot=0.0):
    """Implosion: the whole picture shrinks into a disc that ends as a dot of radius r_to (u 0→1).
    content(ctx) draws the full-frame picture; fill colours the disc behind it (e.g. the dot colour)."""
    fill_bg(ctx, bg)
    R = lerp(r_from, r_to, u)
    s = R / r_from
    if fill is not None:
        rgba(ctx, fill)
        circle(ctx, center[0], center[1], R)
        ctx.fill()
    pc = _pat(ctx, content)
    ctx.save()
    circle(ctx, center[0], center[1], R)
    ctx.clip()
    ctx.translate(center[0], center[1])
    if rot:
        ctx.rotate(rot * u)
    ctx.scale(max(s, 1e-4), max(s, 1e-4))
    ctx.translate(-center[0], -center[1])
    ctx.set_source(pc)
    ctx.paint()
    ctx.restore()


def diagonal_wipe(ctx, a, b, u, w, h, angle=math.pi / 4, bar=None, bar_w=60.0):
    """A straight front sweeping across at `angle`; optional solid bar (rgb) riding the edge."""
    a(ctx)
    if u <= 0:
        return
    L = w + h
    d = lerp(-L * 0.25, L * 1.25, u)
    k = math.tan(angle) * h
    pts = [(-200, -200), (d, -200), (d - k - 400, h + 200), (-200, h + 200)]
    pb = _pat(ctx, b)
    ctx.save()
    poly(ctx, pts)
    ctx.clip()
    ctx.set_source(pb)
    ctx.paint()
    ctx.restore()
    if bar and u < 1:
        rgba(ctx, bar)
        poly(ctx, [(d, -200), (d + bar_w, -200), (d + bar_w - k - 400, h + 200), (d - k - 400, h + 200)])
        ctx.fill()


def tile_flip(ctx, a, b, t, t0, dur, w, h, cols=8, rows=5, spread=0.1, shade=(0, 0, 0), shade_a=0.55, bg=(0, 0, 0)):
    """Grid of cards flipping around their vertical axis in a diagonal wave, A on the front, B on the back."""
    pa, pb = _pat(ctx, a), _pat(ctx, b)
    fill_bg(ctx, bg)
    cw, ch = w / cols, h / rows
    for j in range(rows):
        for i in range(cols):
            d = (i + j) / max(1, cols + rows - 2)
            u = io_cubic(prog(t, t0 + spread * d, t0 + spread * d + dur))
            sx = math.cos(math.pi * u)
            ax = abs(sx)
            if ax < 0.01:
                continue
            x0, y0 = i * cw, j * ch
            cx = x0 + cw / 2
            ctx.save()
            ctx.translate(cx, 0)
            ctx.scale(ax, 1)
            ctx.translate(-cx, 0)
            ctx.rectangle(x0, y0, cw, ch)
            ctx.set_source(pa if u < 0.5 else pb)
            ctx.fill()
            if 1 - ax > 0.02:
                ctx.rectangle(x0, y0, cw, ch)
                rgba(ctx, shade, shade_a * (1 - ax))
                ctx.fill()
            ctx.restore()


def slices(ctx, a, b, t, t0, dur, w, h, n=12, stagger=0.006, horizontal=True, ease=out_expo):
    """B arrives in n strips sliding in alternately from opposite sides."""
    a(ctx)
    pb = _pat(ctx, b)
    for k in range(n):
        u = ease(prog(t, t0 + stagger * k, t0 + dur + stagger * k))
        if u <= 0:
            continue
        sgn = 1 if k % 2 == 0 else -1
        ctx.save()
        if horizontal:
            hh = h / n
            ctx.rectangle(0, k * hh, w, hh + 0.6)
            ctx.clip()
            ctx.translate(sgn * (1 - u) * (w + 40), 0)
        else:
            ww = w / n
            ctx.rectangle(k * ww, 0, ww + 0.6, h)
            ctx.clip()
            ctx.translate(0, sgn * (1 - u) * (h + 40))
        ctx.set_source(pb)
        ctx.paint()
        ctx.restore()


def push(ctx, a, b, u, w, h, direction=(1, 0), gap=0.0):
    """Camera whip/push: A leaves, B enters in the same direction (pair with Film motion blur ≥ 8)."""
    dx, dy = direction
    ctx.save()
    ctx.translate(-dx * u * (w + gap), -dy * u * (h + gap))
    a(ctx)
    ctx.restore()
    ctx.save()
    ctx.translate(dx * (1 - u) * (w + gap), dy * (1 - u) * (h + gap))
    pb = _pat(ctx, b)
    ctx.set_source(pb)
    ctx.paint()
    ctx.restore()


def mask_reveal(ctx, a, b, mask_path, alpha=1.0):
    """B seen through whatever path mask_path(ctx) builds (e.g. glyph outlines growing to fill frame)."""
    a(ctx)
    pb = _pat(ctx, b)
    ctx.save()
    ctx.new_path()
    mask_path(ctx)
    ctx.clip()
    ctx.set_source(pb)
    ctx.paint_with_alpha(clamp(alpha))
    ctx.restore()


def grow_rect(rect, u, w, h, bleed=60.0):
    """Interpolate a rect (x0, y0, x1, y1) to the full frame (+bleed): 'the plane becomes the frame'."""
    x0, y0, x1, y1 = rect
    return (lerp(x0, -bleed, u), lerp(y0, -bleed, u), lerp(x1, w + bleed, u), lerp(y1, h + bleed, u))


def crossfade(ctx, a, b, u):
    """Last resort. Prefer an object handoff or a deliberate cut."""
    a(ctx)
    pb = _pat(ctx, b)
    ctx.set_source(pb)
    ctx.paint_with_alpha(clamp(u))
