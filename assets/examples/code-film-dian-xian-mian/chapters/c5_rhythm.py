"""Bar 7 · 律 RHYTHM.
Four beat-locked pattern cards, each entering with a different transition:
  A  moiré of two ring fields (out of the warp flash)
  B  diagonal stripes + 律 in a knock-out disc        ← diagonal wipe
  C  8×5 grid of morphing shapes, diagonal ripple      ← tile flip (both cards live, per tile)
  D  RHYTHM stuttering on 16ths (weight / width axes)  ← slice slide
then everything implodes through a closing iris into one red point."""
import math

import cairo
import numpy as np

from look import (B, BAR, BLUE, CX, CY, H, INK, PAPER, RED, SNAP, TAU, W, YELLOW, Run, circle, clamp, face,
                  fill_bg, impulse, in_cubic, in_expo, in_quart, io_cubic, lerp, out_back, out_cubic, out_expo,
                  path_from_array, prog, rgba, shape_pts, smooth)

T0 = 6 * BAR                         # 11.25
TB = [T0 + B(k) for k in range(4)]   # 11.25, 11.719, 12.1875, 12.656
T_END = 7 * BAR                      # 13.125

WIPE_AB = (TB[1] - 0.10, TB[1] + 0.02)
FLIP_BC = (TB[2] - 0.12, TB[2] + 0.06)
SLICE_CD = (TB[3] - 0.08, TB[3] + 0.01)
IMPLODE = (T_END - 0.21, T_END)
DOT_R = 18.0


# ----------------------------------------------------------------------------- cards
def card_a(ctx, t):
    fill_bg(ctx, PAPER)
    e = out_cubic(prog(t, T0, T0 + 0.5))
    c1 = (CX - 90 * e - 10, CY)
    c2 = (CX + 90 * e + 10, CY)
    ctx.set_operator(cairo.OPERATOR_MULTIPLY)
    for (c, sp, col, spd) in ((c1, 46.0, BLUE, 170.0), (c2, 50.0, RED, 150.0)):
        ph = (t * spd) % sp
        rgba(ctx, col, 0.92)
        ctx.set_line_width(sp * 0.5)
        r = ph
        while r < 1400:
            circle(ctx, c[0], c[1], r)
            ctx.stroke()
            r += sp
    ctx.set_operator(cairo.OPERATOR_OVER)
    rgba(ctx, INK)
    circle(ctx, CX, CY, 22)
    ctx.fill()
    rgba(ctx, PAPER)
    circle(ctx, CX, CY, 9)
    ctx.fill()


def card_b(ctx, t):
    fill_bg(ctx, YELLOW)
    tl = t - TB[1]
    ctx.save()
    # stripes outside the disc
    rd = 300 * out_back(prog(t, TB[1] - 0.04, TB[1] + 0.22), 1.6)
    ctx.rectangle(-100, -100, W + 200, H + 200)
    circle(ctx, CX, CY, max(rd + 26, 0.1))
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.clip()
    ctx.set_fill_rule(cairo.FILL_RULE_WINDING)
    ctx.translate(CX, CY)
    ctx.rotate(-math.pi / 4)
    off = (t * 420) % 56
    rgba(ctx, INK)
    for k in range(-30, 31):
        x = k * 56 + off
        ctx.rectangle(x, -1500, 26, 3000)
    ctx.fill()
    ctx.restore()
    # disc with 律
    rgba(ctx, PAPER)
    circle(ctx, CX, CY, rd)
    ctx.fill()
    if rd > 10:
        st = 1 + 0.07 * sum(impulse(t - (TB[1] + B(k * 0.5)), 4.0, 0.06) for k in range(4))
        fc = face("cjk")
        size = 360 * (rd / 300) * st
        run = Run(fc, "律", size)
        ctx.new_path()
        g = run.glyphs[0]
        run.path(ctx, CX - (g["ink0"] + g["ink1"]) / 2, CY + (g["top"] + g["bottom"]) / 2)
        rgba(ctx, INK)
        ctx.fill()
    # registration ticks around the disc
    ctx.set_line_width(2)
    rgba(ctx, INK)
    for k in range(24):
        a = k / 24 * TAU + tl * 0.8
        r0 = rd + 34
        ctx.move_to(CX + math.cos(a) * r0, CY + math.sin(a) * r0)
        ctx.line_to(CX + math.cos(a) * (r0 + (14 if k % 6 == 0 else 6)), CY + math.sin(a) * (r0 + (14 if k % 6 == 0 else 6)))
    ctx.stroke()


GC, GR = 8, 5
CW, CH = W / GC, H / GR
KINDS = ["circle", "square", "tri"]
GPAL = [PAPER, RED, BLUE, YELLOW]


def card_c(ctx, t):
    fill_bg(ctx, INK)
    for j in range(GR):
        for i in range(GC):
            cx = (i + 0.5) * CW
            cy = (j + 0.5) * CH
            d = i + j
            k0 = (i + 2 * j) % 3
            col = GPAL[(i * 2 + j) % 4]
            # two ripple steps on the 8ths
            u1 = SNAP(prog(t, TB[2] - 0.02 + 0.022 * d, TB[2] + 0.2 + 0.022 * d))
            u2 = SNAP(prog(t, TB[2] + B(0.5) + 0.022 * d, TB[2] + B(0.5) + 0.22 + 0.022 * d))
            ka, kb, u = (KINDS[k0], KINDS[(k0 + 1) % 3], u1) if u2 <= 0 else (KINDS[(k0 + 1) % 3], KINDS[(k0 + 2) % 3], u2)
            rot = (u1 + u2) * math.pi / 2
            s = 62 * (1 + 0.18 * math.sin(math.pi * u))
            pts = shape_pts(ka, kb, u, s, rot=rot, n=180)
            pts = pts + (cx, cy)
            rgba(ctx, col)
            path_from_array(ctx, pts)
            ctx.fill()
            # tiny index
    ctx.set_line_width(1)
    rgba(ctx, PAPER, 0.12)
    for i in range(1, GC):
        ctx.move_to(i * CW, 0)
        ctx.line_to(i * CW, H)
    for j in range(1, GR):
        ctx.move_to(0, j * CH)
        ctx.line_to(W, j * CH)
    ctx.stroke()


STUT = [(900, 125), (160, 62), (900, 92), (420, 125)]


def card_d(ctx, t):
    fill_bg(ctx, RED)
    k = int(clamp((t - TB[3]) / B(0.25), 0, 3))
    wg, wd = STUT[k]
    fc = face("archivo")
    size = 330.0
    run = Run(fc, "RHYTHM", size, {"wght": wg, "wdth": wd}, 0.0)
    sc = min(1.0, 1500 / max(run.ink_w, 1))
    ctx.save()
    ctx.translate(CX, CY)
    ctx.scale(sc, sc)
    ctx.new_path()
    run.path(ctx, -(run.ink0 + run.ink1) / 2, 0.686 * size / 2)
    rgba(ctx, INK)
    ctx.fill()
    ctx.restore()
    # 16th-note ticker
    for q in range(4):
        x = CX - 3 * 26 / 2 + q * 26 - 8
        rgba(ctx, INK if q <= k else PAPER, 1 if q <= k else 0.5)
        ctx.rectangle(x, CY + 200, 16, 16)
        ctx.fill()
    run2 = Run(face("mono"), "wght %d  ·  wdth %d" % (wg, wd), 15, {"wght": 600}, 0.1)
    ctx.new_path()
    run2.path(ctx, CX - run2.advance / 2, CY - 190)
    rgba(ctx, INK)
    ctx.fill()


# ----------------------------------------------------------------------------- transitions
def _group(ctx, fn, t):
    ctx.push_group()
    fn(ctx, t)
    return ctx.pop_group()


def draw(ctx, t):
    if t < WIPE_AB[0]:
        card_a(ctx, t)
    elif t < WIPE_AB[1]:
        card_a(ctx, t)
        u = in_cubic(prog(t, *WIPE_AB))
        # diagonal wipe: B is revealed behind an advancing 45° edge with an ink bar
        pb = _group(ctx, card_b, t)
        d = lerp(-300, W + H + 300, u)
        ctx.save()
        poly = [(-200, -200), (d, -200), (d - H - 400, H + 200), (-200, H + 200)]
        ctx.move_to(*poly[0])
        for p in poly[1:]:
            ctx.line_to(*p)
        ctx.close_path()
        ctx.set_source(pb)
        ctx.fill()
        ctx.restore()
        rgba(ctx, INK)
        ctx.move_to(d, -200)
        ctx.line_to(d + 60, -200)
        ctx.line_to(d + 60 - H - 400, H + 200)
        ctx.line_to(d - H - 400, H + 200)
        ctx.close_path()
        ctx.fill()
    elif t < FLIP_BC[0]:
        card_b(ctx, t)
    elif t < FLIP_BC[1] + 0.12:
        pb = _group(ctx, card_b, t)
        pc = _group(ctx, card_c, t)
        fill_bg(ctx, INK)
        for j in range(GR):
            for i in range(GC):
                d = (i + j) / (GC + GR - 2)
                u = io_cubic(prog(t, FLIP_BC[0] + 0.1 * d, FLIP_BC[0] + 0.1 * d + 0.11))
                x0, y0 = i * CW, j * CH
                cx = x0 + CW / 2
                sx = math.cos(math.pi * u)
                src = pb if u < 0.5 else pc
                ax = abs(sx)
                if ax < 0.01:
                    continue
                ctx.save()
                ctx.translate(cx, 0)
                ctx.scale(ax, 1)
                ctx.translate(-cx, 0)
                ctx.rectangle(x0, y0, CW, CH)
                ctx.set_source(src)
                ctx.fill()
                # shading on the turning tile
                shade = 1 - ax
                if shade > 0.02:
                    ctx.rectangle(x0, y0, CW, CH)
                    rgba(ctx, INK, 0.55 * shade)
                    ctx.fill()
                ctx.restore()
    elif t < SLICE_CD[0]:
        card_c(ctx, t)
    elif t < SLICE_CD[1] + 0.06:
        card_c(ctx, t)
        pd = _group(ctx, card_d, t)
        n = 12
        hh = H / n
        for k in range(n):
            u = out_expo(prog(t, SLICE_CD[0] + 0.006 * k, SLICE_CD[1] + 0.006 * k))
            sgn = 1 if k % 2 == 0 else -1
            dx = sgn * (1 - u) * (W + 40)
            ctx.save()
            ctx.rectangle(0, k * hh, W, hh + 0.6)
            ctx.clip()
            ctx.translate(dx, 0)
            ctx.set_source(pd)
            ctx.paint()
            ctx.restore()
    elif t < IMPLODE[0]:
        card_d(ctx, t)
    else:
        e = in_quart(prog(t, *IMPLODE))
        fill_bg(ctx, INK)
        R = lerp(1150, DOT_R, e)
        s = R / 1150
        # speed lines sucked into the point
        ctx.set_line_width(2)
        for k in range(64):
            a = k / 64 * TAU + 0.3 * math.sin(k * 7.3)
            r1 = lerp(1300, R + 10, clamp(e * 1.15 - (k % 5) * 0.03))
            r0 = r1 + 80 + 140 * ((k * 37) % 9) / 9 * (1 - e)
            rgba(ctx, PAPER, 0.5 * (1 - e) + 0.2)
            ctx.move_to(CX + math.cos(a) * r0, CY + math.sin(a) * r0)
            ctx.line_to(CX + math.cos(a) * r1, CY + math.sin(a) * r1)
            ctx.stroke()
        pd = _group(ctx, card_d, t)
        rgba(ctx, RED)
        circle(ctx, CX, CY, R)
        ctx.fill()
        ctx.save()
        circle(ctx, CX, CY, R)
        ctx.clip()
        ctx.translate(CX, CY)
        ctx.rotate(-0.6 * e)
        ctx.scale(s, s)
        ctx.translate(-CX, -CY)
        ctx.set_source(pd)
        ctx.paint()
        ctx.restore()


def fx(t, fx):
    if T0 <= t < T_END:
        fx["bloom"] = 0.0
        fx["bloom_thr"] = 0.7
