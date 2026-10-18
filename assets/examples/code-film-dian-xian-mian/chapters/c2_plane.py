"""Bar 3 · 面 PLANE.
The 280 px red segment extrudes into a square (spring), a blue circle rolls in, a yellow triangle drops
in — Bauhaus primaries printed riso-style (multiply overprint, halftone, misregistered key line).
On the last beat the square grows into the frame itself, shoving the other shapes out."""
import math

import cairo
import numpy as np

from look import (B, BAR, BLUE, CX, CY, H, INK, PAPER, RED, TAU, W, YELLOW, annot, circle, clamp, fill_bg,
                  impulse, in_cubic, io_cubic, io_expo, lerp, out_back, out_cubic, out_expo, path_from_array,
                  prog, rgba, shape_pts, smooth, spring)

T0 = 2 * BAR                  # 3.75
TB1, TB2, TB3 = B(9), B(10), B(11)
T_GROW = (TB3 + 0.06, 3 * BAR - 0.02)

SQ_C = (CX, CY)
SQ = 280.0
CI_C = (712.0, 492.0)
CI_R = 178.0
TR_C = (1222.0, 596.0)
TR_R = 206.0


def _grow(t):
    return io_expo(prog(t, *T_GROW))


def square_rect(t):
    u = t - T0
    h = 8 + (SQ - 8) * spring(u, f=2.3, z=0.36)
    w = SQ * (1 - 0.16 * max(0.0, h / SQ - 1))
    pulse = 1 + 0.06 * impulse(t - TB3, f=3.2, decay=0.12)
    w *= pulse
    h *= pulse
    x0, y0, x1, y1 = SQ_C[0] - w / 2, SQ_C[1] - h / 2, SQ_C[0] + w / 2, SQ_C[1] + h / 2
    e = _grow(t)
    if e > 0:
        x0, y0, x1, y1 = lerp(x0, -60, e), lerp(y0, -60, e), lerp(x1, W + 60, e), lerp(y1, H + 60, e)
    return x0, y0, x1, y1


def circle_state(t):
    u = prog(t, TB1 - 0.34, TB1 + 0.24)
    x = lerp(-260, CI_C[0], out_back(u, 1.25))
    rot = (x - CI_C[0]) / CI_R            # rolling without slipping
    s = 1 + 0.06 * impulse(t - TB3, f=3.2, decay=0.12)
    sx = 1.0
    x0, y0, x1, y1 = square_rect(t)
    if _grow(t) > 0:
        lim = x0 - CI_R * 0.7
        if x > lim:
            push = x - lim
            x = lim
            sx = 1 - 0.18 * clamp(push / 120)
    return x, CI_C[1], CI_R * s, sx, rot


def tri_state(t):
    u = prog(t, TB2 - 0.30, TB2)
    y = lerp(-320, TR_C[1], u * u)
    land = t - TB2
    sy = 1.0
    if land > 0:
        y = TR_C[1]
        sy = 1 - 0.22 * math.exp(-land / 0.06) * math.cos(TAU * land / 0.2)
    rot = -0.55 * (1 - spring(t - (TB2 - 0.30), f=1.8, z=0.4))
    s = 1 + 0.06 * impulse(t - TB3 - 0.03, f=3.2, decay=0.12)
    x = TR_C[0]
    x0, y0, x1, y1 = square_rect(t)
    if _grow(t) > 0:
        lim = x1 + TR_R * 0.55
        if x < lim:
            x = lim
    return x, y, TR_R * s, sy, rot


def _grid(ctx, t, fade):
    ctx.set_line_width(1.0)
    for k in range(-16, 17):
        L = 620 * out_expo(prog(t, T0 + 0.012 * abs(k), T0 + 0.55 + 0.012 * abs(k)))
        if L <= 1:
            continue
        x = CX + 60 * k + 0.5
        rgba(ctx, INK, (0.11 if k % 4 == 0 else 0.06) * fade)
        ctx.move_to(x, CY - L)
        ctx.line_to(x, CY + L)
        ctx.stroke()
    for k in range(-9, 10):
        L = 1000 * out_expo(prog(t, T0 + 0.02 * abs(k), T0 + 0.6 + 0.02 * abs(k)))
        if L <= 1:
            continue
        y = CY + 60 * k + 0.5
        rgba(ctx, INK, (0.11 if k % 4 == 0 else 0.06) * fade)
        ctx.move_to(CX - L, y)
        ctx.line_to(CX + L, y)
        ctx.stroke()
    # construction circle + diagonals
    a = out_expo(prog(t, T0 + 0.1, T0 + 0.8))
    if a > 0:
        rgba(ctx, INK, 0.16 * fade)
        ctx.new_sub_path()
        ctx.arc(CX, CY, 330, -math.pi / 2, -math.pi / 2 + TAU * a)
        ctx.stroke()
        for sgn in (1, -1):
            ctx.move_to(CX - 600 * a, CY - sgn * 600 * a)
            ctx.line_to(CX + 600 * a, CY + sgn * 600 * a)
        rgba(ctx, INK, 0.07 * fade)
        ctx.stroke()


def _halftone(ctx, cx, cy, r, rot, a):
    ctx.save()
    circle(ctx, cx, cy, r)
    ctx.clip()
    ctx.translate(cx, cy)
    ctx.rotate(rot)
    step = 15.0
    n = int(r / step) + 1
    rgba(ctx, INK, 0.9 * a)
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            x = i * step + (step / 2 if j % 2 else 0)
            y = j * step
            k = (y + 10) / (r * 0.9)
            if k <= 0:
                continue
            rr = 6.6 * clamp(k) ** 0.8
            if rr > 0.4 and x * x + y * y < (r + 8) ** 2:
                circle(ctx, x, y, rr)
    ctx.fill()
    ctx.restore()


def draw(ctx, t):
    fill_bg(ctx, PAPER)
    e = _grow(t)
    # slow push-in
    s = 1 + 0.035 * smooth(prog(t, T0, T_GROW[0]))
    ctx.save()
    ctx.translate(CX, CY)
    ctx.scale(s, s)
    ctx.translate(-CX, -CY)
    _grid(ctx, t, 1 - e)

    ctx.set_operator(cairo.OPERATOR_MULTIPLY)
    # --- square
    x0, y0, x1, y1 = square_rect(t)
    rgba(ctx, RED)
    ctx.rectangle(x0, y0, x1 - x0, y1 - y0)
    ctx.fill()
    # --- circle
    cx, cy, r, sx, rot = circle_state(t)
    if cx > -r - 40:
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(sx, 1 / max(sx, 0.6) ** 0.5)
        ctx.translate(-cx, -cy)
        rgba(ctx, BLUE)
        circle(ctx, cx, cy, r)
        ctx.fill()
        _halftone(ctx, cx, cy, r, rot, 1.0)
        ctx.restore()
    # --- triangle
    tx, ty, tr, tsy, trot = tri_state(t)
    rp = None
    if ty > -400 and tx < W + 400:
        pts = shape_pts("tri", "tri", 0, tr, rot=0)
        pts[:, 1] *= tsy
        pts[:, 1] += tr * 0.5 * (1 - tsy)       # squash anchored at the base
        c, sn = math.cos(trot), math.sin(trot)
        rp = np.stack([pts[:, 0] * c - pts[:, 1] * sn, pts[:, 0] * sn + pts[:, 1] * c], 1) + (tx, ty)
        rgba(ctx, YELLOW)
        path_from_array(ctx, rp)
        ctx.fill()
        # engraved rule lines in the lower part of the triangle
        ctx.save()
        path_from_array(ctx, rp)
        ctx.clip()
        ctx.translate(tx, ty)
        ctx.rotate(trot)
        rgba(ctx, INK, 0.85)
        off = (t * 40) % 18
        for k in range(8):
            yy = 20 + k * 18 + off
            ctx.rectangle(-tr, yy, 2 * tr, 4.5)
        ctx.fill()
        ctx.restore()
    ctx.set_operator(cairo.OPERATOR_OVER)

    # --- misregistered key lines (riso offset)
    kl = smooth(prog(t, T0 + 0.25, T0 + 0.5)) * (1 - e)
    if kl > 0:
        ctx.set_line_width(1.6)
        rgba(ctx, INK, 0.85 * kl)
        ctx.rectangle(x0 + 10, y0 + 8, x1 - x0, y1 - y0)
        ctx.stroke()
        # inner frame
        ins = 22
        ctx.set_line_width(1.2)
        rgba(ctx, INK, 0.55 * kl)
        ctx.rectangle(x0 + ins, y0 + ins, x1 - x0 - 2 * ins, y1 - y0 - 2 * ins)
        ctx.stroke()
    ka = smooth(prog(t, TB1 + 0.1, TB1 + 0.3)) * (1 - e)
    if ka > 0 and cx > -r:
        ctx.set_line_width(1.6)
        rgba(ctx, INK, 0.85 * ka)
        circle(ctx, cx - 9, cy + 7, r)
        ctx.stroke()
    kt = smooth(prog(t, TB2 + 0.1, TB2 + 0.3)) * (1 - e)
    if kt > 0 and rp is not None:
        ctx.set_line_width(1.6)
        rgba(ctx, INK, 0.85 * kt)
        path_from_array(ctx, rp + (8, -7))
        ctx.stroke()

    # --- specimen labels
    out = TB3 + 0.02
    annot(ctx, t, T0 + 0.3, out, (x0 + 30, y1 + 2 if e == 0 else y1), (x0 + 60, y1 + 74), "B  SQUARE", "left",
          "280 × 280  ·  spring, damping 0.36", INK, 13)
    annot(ctx, t, TB1 + 0.04, out, (cx - r * 0.62, cy - r * 0.62), (cx - r * 0.95, cy - r - 46), "A  CIRCLE", "right",
          "r 178  ·  rolls, no slip", INK, 13)
    annot(ctx, t, TB2 + 0.0, out + 0.06, (tx + 6, ty - tr + 18), (tx + 70, ty - tr - 40), "C  TRIANGLE", "left",
          "60°  ·  drop + settle", INK, 13)
    ctx.restore()
