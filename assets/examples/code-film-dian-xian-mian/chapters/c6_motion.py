"""Bar 8 · 动 MOTION — end card + loop.
The point slams down and becomes a vermilion seal 「动」 (白文印, knocked-out characters, ink speckle,
splatter), a shock ring wipes to paper; the lockup "MOTION / DESIGN" is justified to one measure with
the variable width axis, logo-construction guides draw on, the chapter row 点线面字流体律动 lights up.
On the last beat everything retracts, the seal melts back into the dot and an iris closes on it —
the final frame equals frame 0, so the film loops."""
import math

import cairo
import numpy as np

from look import (B, BAR, BLUE, CX, CY, CHAPTERS, H, INK, PAPER, RED, TAU, W, Run, circle, clamp, face, fill_bg,
                  fit_width, glyph_path, hash01, in_cubic, io_cubic, io_expo, lerp, out_back, out_cubic, out_expo,
                  path_from_array, prog, rgba, shape_pts, smooth, spring, vnoise1)

T0 = 7 * BAR                     # 13.125
T_OUT = B(31)                    # 14.531  last beat
T_END = 8 * BAR                  # 15.0
DOT0 = 18.0
DOT_LOOP = 18.0 * 1.28           # matches the dot size of frame 0 (bar-1 camera starts at 1.28)

SEAL = 340.0
GAP = 66.0
TEXT_W = 620.0
GROUP_W = SEAL + GAP + TEXT_W
SEAL_X = (W - GROUP_W) / 2 + SEAL / 2
SEAL_Y = CY
TX0 = SEAL_X + SEAL / 2 + GAP
TOP = SEAL_Y - SEAL / 2
BOT = SEAL_Y + SEAL / 2
CAP = 100.0
SIZE = CAP / 0.686

_FIT = {}
_SPECK = [(hash01(i, 11), hash01(i, 12), hash01(i, 13)) for i in range(150)]
_SPLAT = [(hash01(i, 21), hash01(i, 22), hash01(i, 23), hash01(i, 24)) for i in range(46)]


def _fit():
    if not _FIT:
        fc = face("archivo")
        for s in ("MOTION", "DESIGN"):
            _FIT[s] = fit_width(fc, s, SIZE, TEXT_W, 850)
    return _FIT


def seal_state(t):
    """centre x, y, half-size, morph (0 circle → 1 square), rotation."""
    grow = out_back(prog(t, T0, T0 + 0.2), 1.9)
    half = lerp(DOT0, SEAL / 2, grow)
    morph = smooth(prog(t, T0, T0 + 0.12))
    slide = io_expo(prog(t, T0 + 0.2, T0 + 0.5))
    x = lerp(CX, SEAL_X, slide)
    rot = lerp(-0.12, -0.035, out_cubic(prog(t, T0, T0 + 0.4)))
    # outro: back to the centre, back to the dot
    o = io_expo(prog(t, T_OUT + 0.02, T_END - 0.06))
    if o > 0:
        x = lerp(x, CX, o)
        half = lerp(half, DOT_LOOP, o)
        morph = lerp(morph, 0.0, smooth(prog(t, T_OUT + 0.05, T_END - 0.12)))
        rot = lerp(rot, 0.0, o)
    return x, SEAL_Y, half, morph, rot


def _seal_path(ctx, x, y, half, morph, rot):
    th = np.linspace(0, TAU, 361)[:-1]
    # rounded-corner square as a superellipse; blend radius from the circle
    p = 14.0
    se = (np.abs(np.cos(th)) ** p + np.abs(np.sin(th)) ** p) ** (-1 / p)
    r = (1 - morph) * 1.0 + morph * se
    # rough stamped edge
    rough = 1 + 0.006 * morph * np.sin(th * 23 + 1.3) + 0.004 * morph * np.sin(th * 57)
    r = r * half * rough
    pts = np.stack([np.cos(th + rot) * r, np.sin(th + rot) * r], 1) + (x, y)
    path_from_array(ctx, pts)


def _guides(ctx, t, x, y, half):
    a_on = out_expo(prog(t, T0 + 0.42, T0 + 0.95))
    a = lerp(0.75, 0.3, prog(t, T0 + 1.0, T0 + 1.3)) * (1 - prog(t, T_OUT, T_OUT + 0.12))
    if a_on <= 0 or a <= 0:
        return
    ctx.save()
    ctx.set_line_width(1.0)
    rgba(ctx, BLUE, a)
    L = a_on
    # horizontal alignment rails through seal top / bottom / cap lines
    for yy in (TOP, BOT, TOP + CAP, TOP + CAP + 24, TOP + 2 * CAP + 24):
        ctx.move_to(SEAL_X - SEAL / 2 - 70, yy + 0.5)
        ctx.line_to(lerp(SEAL_X - SEAL / 2 - 70, TX0 + TEXT_W + 70, L), yy + 0.5)
    # vertical rails
    for xx in (SEAL_X - SEAL / 2, SEAL_X + SEAL / 2, TX0, TX0 + TEXT_W):
        ctx.move_to(xx + 0.5, TOP - 70)
        ctx.line_to(xx + 0.5, lerp(TOP - 70, BOT + 70, L))
    ctx.stroke()
    # inscribed circle + diagonals of the seal
    ctx.new_sub_path()
    ctx.arc(x, y, half, -math.pi / 2, -math.pi / 2 + TAU * L)
    ctx.stroke()
    ctx.new_sub_path()
    ctx.arc(x, y, half * 0.618, math.pi / 2, math.pi / 2 + TAU * L)
    ctx.stroke()
    for sg in (1, -1):
        ctx.move_to(x - half * L, y - sg * half * L)
        ctx.line_to(x + half * L, y + sg * half * L)
    ctx.stroke()
    # dimension mark
    yy = TOP - 34
    ctx.move_to(SEAL_X - SEAL / 2, yy)
    ctx.line_to(lerp(SEAL_X - SEAL / 2, SEAL_X + SEAL / 2, L), yy)
    for xx in (SEAL_X - SEAL / 2, SEAL_X + SEAL / 2):
        ctx.move_to(xx, yy - 6)
        ctx.line_to(xx, yy + 6)
    ctx.stroke()
    run = Run(face("mono"), "340", 12, {"wght": 600}, 0.1)
    ctx.new_path()
    run.path(ctx, SEAL_X - run.advance / 2, yy - 10)
    rgba(ctx, BLUE, a * L)
    ctx.fill()
    ctx.restore()


def _lockup(ctx, t):
    fit = _fit()
    fc = face("archivo")
    out = io_cubic(prog(t, T_OUT - 0.02, T_OUT + 0.16))
    ctx.save()
    for k, s in enumerate(("MOTION", "DESIGN")):
        wd, tr = fit[s]
        run = Run(fc, s, SIZE, {"wght": 850, "wdth": wd}, tr)
        base = TOP + CAP + k * (CAP + 24)
        ctx.save()
        ctx.rectangle(TX0 - 20, base - CAP - 8, TEXT_W + 60, CAP + 12)
        ctx.clip()

        def pg(g, k=k):
            i = g["idx"]
            u = out_expo(prog(t, T0 + 0.42 + 0.06 * k + 0.03 * i, T0 + 0.85 + 0.06 * k + 0.03 * i))
            d = (1 - u) * (CAP + 14) + out * (CAP + 14)
            return {"dy": d}
        ctx.new_path()
        run.path(ctx, TX0 - run.ink0, base, pg)
        rgba(ctx, INK)
        ctx.fill()
        ctx.restore()
    # rule
    u = out_expo(prog(t, T0 + 0.5, T0 + 0.95)) * (1 - out)
    ry = TOP + 2 * CAP + 24 + 36
    if u > 0:
        rgba(ctx, INK)
        ctx.rectangle(TX0, ry, TEXT_W * u, 3)
        ctx.fill()
    # credit line (types on)
    s = "CLAUDE  —  MOTION DESIGN REEL 2026"
    n = int(len(s) * prog(t, T0 + 0.55, T0 + 0.95) + 0.999) if out < 0.5 else 0
    if n > 0:
        run = Run(face("mono"), s[:n], 17, {"wght": 600}, 0.06)
        ctx.new_path()
        run.path(ctx, TX0, ry + 38)
        rgba(ctx, INK, 1 - out)
        ctx.fill()
    # chapter row 点线面字流体律动
    fcj = face("cjk")
    x = TX0
    for i, (ch, en) in enumerate(CHAPTERS):
        ti = T0 + 0.6 + 0.04 * i
        u = out_expo(prog(t, ti, ti + 0.25))
        if u <= 0:
            continue
        run = Run(fcj, ch, 27)
        lit = prog(t, ti + 0.1, ti + 0.2)
        col = RED if i == 7 else INK
        a = (0.25 + 0.75 * lit) * (1 - out)
        ctx.new_path()
        run.path(ctx, x, BOT + (1 - u) * 14)
        rgba(ctx, col, a)
        ctx.fill()
        x += run.advance + 50.6
        if i < 7:
            rgba(ctx, INK, 0.35 * u * (1 - out))
            circle(ctx, x - 25.3, BOT - 10, 2)
            ctx.fill()
    ctx.restore()


def draw(ctx, t):
    fill_bg(ctx, INK)
    # shock wipe to paper
    rw = 2300 * out_cubic(prog(t, T0 + 0.02, T0 + 0.4))
    # closing iris at the very end
    ri = lerp(1250, 0.0, io_cubic(prog(t, T_OUT + 0.1, T_END - 0.02)))
    R = min(rw, ri)
    if R > 0.5:
        rgba(ctx, PAPER)
        circle(ctx, CX, CY, R)
        ctx.fill()
    push = 1 + 0.02 * smooth(prog(t, T0 + 0.4, T_OUT)) * (1 - io_cubic(prog(t, T_OUT, T_END - 0.08)))
    ctx.save()
    ctx.translate(CX, CY)
    ctx.scale(push, push)
    ctx.translate(-CX, -CY)
    ctx.save()
    circle(ctx, CX, CY, max(R, 0.1))
    ctx.clip()
    # paper grid ghost
    ga = 0.05 * smooth(prog(t, T0 + 0.3, T0 + 0.8))
    if ga > 0:
        ctx.set_line_width(1)
        rgba(ctx, INK, ga)
        for k in range(-16, 17):
            ctx.move_to(CX + 60 * k + 0.5, 0)
            ctx.line_to(CX + 60 * k + 0.5, H)
        for k in range(-9, 10):
            ctx.move_to(0, CY + 60 * k + 0.5)
            ctx.line_to(W, CY + 60 * k + 0.5)
        ctx.stroke()
    x, y, half, morph, rot = seal_state(t)
    # ink splatter (lands and stays, rides with the seal)
    out = prog(t, T_OUT, T_OUT + 0.2)
    for i, (a1, a2, a3, a4) in enumerate(_SPLAT):
        ts = T0 + 0.04
        u = out_cubic(prog(t, ts, ts + 0.22 + 0.15 * a3))
        if u <= 0:
            continue
        ang = a1 * TAU
        dist = SEAL / 2 * (1.08 + 0.9 * a2 ** 2 * (0.25 if math.cos(ang) > 0.2 else 1.0))
        sx = math.cos(ang) * dist
        sy = math.sin(ang) * dist
        # clamp into a square-ish halo
        r = (1.5 + 7 * a4 ** 2) * (1 - out)
        px = x + sx * u
        py = y + sy * u
        rgba(ctx, RED, 0.95)
        if r > 0.2:
            if u < 1 and a4 > 0.6:
                ctx.save()
                ctx.translate(px, py)
                ctx.rotate(ang)
                ctx.scale(1 + 2.5 * (1 - u), 1)
                circle(ctx, 0, 0, r)
                ctx.restore()
            else:
                circle(ctx, px, py, r)
            ctx.fill()
    # the seal
    rgba(ctx, RED)
    _seal_path(ctx, x, y, half, morph, rot)
    ctx.fill()
    ca = smooth(prog(t, T0 + 0.06, T0 + 0.16)) * (1 - smooth(prog(t, T_OUT + 0.02, T_OUT + 0.2)))
    if ca > 0 and half > 40:
        ctx.save()
        _seal_path(ctx, x, y, half, morph, rot)
        ctx.clip()
        ctx.translate(x, y)
        ctx.rotate(rot)
        sc = half / (SEAL / 2)
        ctx.scale(sc, sc)
        # inner border (白文印)
        rgba(ctx, PAPER, ca)
        ctx.set_line_width(7)
        ctx.rectangle(-SEAL / 2 + 22, -SEAL / 2 + 22, SEAL - 44, SEAL - 44)
        ctx.stroke()
        fc = face("cjk")
        size = 232
        run = Run(fc, "动", size)
        g = run.glyphs[0]
        ctx.new_path()
        run.path(ctx, -(g["ink0"] + g["ink1"]) / 2, (g["top"] + g["bottom"]) / 2)
        ctx.fill()
        # stamp speckle: paper flecks knocked out of the red
        for (a, b, c) in _SPECK:
            rr = 0.6 + 2.6 * c ** 3
            circle(ctx, (a - 0.5) * SEAL * 0.96, (b - 0.5) * SEAL * 0.96, rr)
        rgba(ctx, PAPER, 0.85 * ca)
        ctx.fill()
        ctx.restore()
    _guides(ctx, t, x, y, half)
    ctx.restore()
    _lockup(ctx, t)
    ctx.restore()
    # loop dot on top of the closing iris
    if t > T_OUT + 0.25:
        x, y, half, morph, rot = seal_state(t)
        rgba(ctx, RED)
        _seal_path(ctx, x, y, half, morph, rot)
        ctx.fill()


def fx(t, fx):
    if T0 <= t:
        fx["bloom"] = 0.0
