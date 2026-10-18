"""Bars 1–2 · 点 POINT → 线 LINE.
A living dot hops on the beat (anticipation / squash & stretch / slow-in slow-out with onion-skin
spacing), fires right; its trail is the line, which is plucked, fans into a woven field of 27 lines,
then thickens into a paper plane while the red line contracts into a 280 px segment."""
import math

import cairo
import numpy as np

from look import (B, BAR, BLUE, CX, CY, H, INK, PAPER, RED, TAU, W, YELLOW, clamp, face, fill_bg,
                  impulse, in_cubic, io_cubic, io_expo, io_sine, lerp, mixc, out_back, out_cubic,
                  out_expo, out_quart, prog, rgba, smooth, circle, ellipse, Run, annot)

R = 18.0
FLOOR = CY + R
G = 14000.0
HOPS = []   # (takeoff, land, height, airtime, x0, x1)
for land, h, x0, x1 in ((B(1), 90.0, CX, CX - 170), (B(2), 170.0, CX - 170, CX + 190), (B(3), 260.0, CX + 190, CX)):
    T = math.sqrt(8 * h / G)
    HOPS.append((land - T, land, h, T, x0, x1))
LAND_A = (0.30, 0.40, 0.52)
ANT_A = (0.22, 0.20, 0.26)
LAUNCH = BAR            # 1.875
LAUNCH_X = CX - 30


def dot_state(t):
    """-> (x, cy, a, b, rot): ellipse centre, semi-axes, rotation.
    Grounded: bottom anchored on the floor, squash vertical. Airborne: stretch along velocity."""
    x = CX
    for (off, land, h, T, x0, x1) in HOPS:
        if t >= off:
            x = x1 if t >= land else lerp(x0, x1, (t - off) / T)
    air = None
    for (off, land, h, T, x0, x1) in HOPS:
        if off <= t < land:
            air = (off, land, h, T, x0, x1)
    if air:
        off, land, h, T, x0, x1 = air
        u = (t - off) / T
        hgt = 4 * h * u * (1 - u)
        vx = (x1 - x0) / T
        vy = -4 * h * (1 - 2 * u) / T          # screen space (up = negative)
        sp = math.hypot(vx, vy)
        vmax = math.hypot(vx, 4 * h / T)
        st = 0.36 * (sp / vmax) ** 2 * math.sqrt(h / 170.0)
        st *= smooth((t - off) / 0.03)
        s = 1 + st
        cy = FLOOR - R - hgt
        return x, cy, R * s, R / s, math.atan2(vy, vx)
    sq = 0.0
    for k, (off, land, h, T, x0, x1) in enumerate(HOPS):
        tau = t - land
        if tau >= 0:
            nxt = HOPS[k + 1][0] if k + 1 < len(HOPS) else 99
            if t < nxt:
                sq += LAND_A[k] * math.exp(-tau / 0.055) * math.cos(TAU * tau / 0.17)
    for k, (off, land, h, T, x0, x1) in enumerate(HOPS):
        if t < off:
            sq += ANT_A[k] * smooth(prog(t, off - 0.10, off))
            break
    # breath pulse at frame 0 (loop entry)
    sq -= 0.16 * impulse(t, f=4.0, decay=0.07)
    sy = 1 - sq
    sx = 1 + sq * 1.05
    # launch wind-up: compress against the launch direction, tremble
    if t >= HOPS[-1][1]:
        e = io_cubic(prog(t, 1.56, LAUNCH))
        x = lerp(CX, LAUNCH_X, e) + 1.6 * math.sin(t * 140) * e * e
        sx *= 1 - 0.30 * e
        sy *= 1 + 0.26 * e
    cy = FLOOR - R * sy
    return x, cy, R * sx, R * sy, 0.0


def _annot(ctx, t, t_in, t_out, anchor, elbow, label, align="left", sub=None):
    annot(ctx, t, t_in, t_out, anchor, elbow, label, align, sub, PAPER)


def draw_point(ctx, t):
    fill_bg(ctx, INK)
    # floor hairline + ruler ticks
    L = 540 * out_expo(prog(t, 0.08, 0.9))
    fl_a = 1 - prog(t, LAUNCH, LAUNCH + 0.12)
    if L > 1 and fl_a > 0:
        ctx.set_line_width(1.0)
        rgba(ctx, PAPER, 0.28 * fl_a)
        ctx.move_to(CX - L, FLOOR + 0.5)
        ctx.line_to(CX + L, FLOOR + 0.5)
        ctx.stroke()
        for k in range(-13, 14):
            xx = CX + k * 40
            if abs(xx - CX) > L:
                continue
            ln = 9 if k % 4 == 0 else 4
            rgba(ctx, PAPER, (0.32 if k % 4 == 0 else 0.18) * fl_a)
            ctx.move_to(xx, FLOOR + 6)
            ctx.line_to(xx, FLOOR + 6 + ln)
            ctx.stroke()
    # ripples + dust on landings
    for k, (off, land, h, T, x0, x1) in enumerate(HOPS):
        tau = t - land
        if 0 <= tau < 0.6:
            u = out_cubic(tau / 0.6)
            rx = R + (70 + 40 * k) * u
            rgba(ctx, PAPER, 0.55 * (1 - u) * fl_a)
            ctx.set_line_width(1.4)
            ellipse(ctx, x1, FLOOR, rx, rx * 0.16)
            ctx.stroke()
            # landing tick on the ruler
            rgba(ctx, RED, 0.9 * (1 - u))
            ctx.set_line_width(2.0)
            ctx.move_to(x1, FLOOR + 6)
            ctx.line_to(x1, FLOOR + 22)
            ctx.stroke()
            if k == 2:
                for j in range(8):
                    sgn = -1 if j % 2 else 1
                    sp = 160 + 90 * ((j * 37) % 7) / 7
                    xx = x1 + sgn * (R + sp * out_cubic(tau / 0.5))
                    yy = FLOOR - 4 - 26 * math.sin(math.pi * clamp(tau / 0.45)) * (0.5 + 0.5 * ((j * 13) % 5) / 5)
                    rgba(ctx, PAPER, 0.7 * (1 - clamp(tau / 0.5)))
                    circle(ctx, xx, yy, 2.0)
                    ctx.fill()
    # onion-skin spacing ghosts + dashed arcs
    for k, (off, land, h, T, x0, x1) in enumerate(HOPS):
        if t < off:
            continue
        fade = 1 - prog(t, land + 0.18, land + 0.6)
        if fade <= 0:
            continue
        tend = min(t, land)
        # the arc the dot is travelling on
        ctx.save()
        ctx.set_line_width(1.0)
        ctx.set_dash([3, 6])
        rgba(ctx, PAPER, 0.22 * fade)
        steps = 40
        for j in range(steps + 1):
            u = j / steps * (tend - off) / T
            xx = lerp(x0, x1, u)
            yy = FLOOR - R - 4 * h * u * (1 - u)
            (ctx.move_to if j == 0 else ctx.line_to)(xx, yy)
        ctx.stroke()
        ctx.restore()
        n = int((tend - off) * 30)
        ctx.set_line_width(1.2)
        for j in range(n + 1):
            tj = off + j / 30.0
            if tj > tend - 1 / 60.0:
                break
            gx, gy, ga, gb, gr = dot_state(tj)
            rgba(ctx, PAPER, 0.34 * fade)
            ellipse(ctx, gx, gy, ga, gb, gr)
            ctx.stroke()
            rgba(ctx, PAPER, 0.55 * fade)
            circle(ctx, gx, gy, 1.4)
            ctx.fill()
    # annotations
    x, cy, a, b, rot = dot_state(t)
    lx = HOPS[1][5]
    _annot(ctx, t, 0.50, 1.02, (lx + 26, FLOOR - 12), (lx + 110, FLOOR - 110), "SQUASH & STRETCH", "left",
           "volume kept  sx × sy = 1")
    apx = (HOPS[2][4] + HOPS[2][5]) / 2
    apex = FLOOR - R - HOPS[2][2]
    _annot(ctx, t, 1.08, 1.66, (apx - 24, apex + 2), (apx - 130, apex - 56), "SLOW IN · SLOW OUT", "right",
           "spacing @ 30 fps")
    _annot(ctx, t, 1.52, 1.92, (LAUNCH_X - 22, FLOOR + 14), (LAUNCH_X - 120, FLOOR + 96), "ANTICIPATION", "right",
           "load  ·  hold  ·  release")
    # the dot
    if t < LAUNCH:
        rgba(ctx, RED)
        ellipse(ctx, x, cy, a, b, rot)
        ctx.fill()


# ----------------------------------------------------------------------------- LINE
N = 27
C = 13
S = 42.0
XS = np.linspace(-60, W + 60, 200)
LAM = 1100.0
OMEGA = TAU * 0.9
PHI = 0.38
T_SPLIT = B(5)          # 2.344
T_PULSE = B(6)          # 2.8125
T_MERGE = B(7)          # 3.281
T_END = 2 * BAR         # 3.75


def _tail_head(t):
    head = LAUNCH_X + 1400 * out_quart(prog(t, LAUNCH, LAUNCH + 0.15))
    tail = LAUNCH_X - 1150 * out_expo(prog(t, LAUNCH + 0.05, LAUNCH + 0.32))
    return tail, head


def _pluck(t, xs):
    tau = t - (LAUNCH + 0.2)
    if tau <= 0:
        return 0.0
    u = np.clip((xs + 120) / (W + 240), 0, 1)
    A = 62 * math.exp(-tau / 0.2) * smooth(tau / 0.03)
    return A * (np.sin(np.pi * u) * math.cos(TAU * 6.5 * tau) + 0.32 * np.sin(2 * np.pi * u) * math.cos(TAU * 11.0 * tau + 1.0))


def line_y(i, t, xs):
    """y(x) of line i (centre line i==C) and its thickness array."""
    d = i - C
    ad = abs(d)
    sp = out_expo(prog(t, T_SPLIT + 0.012 * ad, T_SPLIT + 0.6 + 0.012 * ad))
    base = CY + d * S * sp
    m = io_cubic(prog(t, T_MERGE + 0.008 * ad, T_MERGE + 0.36 + 0.008 * ad))
    aw = 34 * smooth(prog(t, T_SPLIT, T_SPLIT + 0.55)) * (1 - io_cubic(prog(t, T_MERGE, T_MERGE + 0.38)))
    ph = TAU * xs / LAM - OMEGA * t + PHI * d
    y = base + aw * np.sin(ph) + _pluck(t, xs) * (1 - m)
    # travelling lens bulge on beat 3 of the bar
    lp = prog(t, T_PULSE - 0.02 + 0.004 * ad, T_PULSE + 0.5 + 0.004 * ad)
    if 0 < lp < 1:
        xp = -300 + (W + 600) * io_sine(lp)
        g = np.exp(-((xs - xp) / 240.0) ** 2)
        y = y + d * S * 0.55 * g * (1 - m)
    shade = 0.5 + 0.5 * np.cos(ph)
    if i == C:
        th = np.full_like(xs, 8.0)
    else:
        th = 3.2 * (0.45 + 0.75 * shade) * (aw / 34 * 0.6 + 0.4)
        th = th + (S + 8 - th) * m
    return y, th, sp, m


def _ribbon(ctx, xs, y, th):
    top = np.stack([xs, y - th / 2], 1)
    bot = np.stack([xs[::-1], (y + th / 2)[::-1]], 1)
    pts = np.concatenate([top, bot])
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()


def draw_line(ctx, t):
    fill_bg(ctx, INK)
    if t < LAUNCH + 0.4:
        draw_point(ctx, t)       # floor fading, annotations finishing
    tail, head = _tail_head(t)
    # paper stripes
    for i in range(N):
        if i == C:
            continue
        y, th, sp, m = line_y(i, t, XS)
        if sp <= 0.001:
            continue
        a = clamp(sp * 3) * (0.92 - 0.012 * abs(i - C)) + m * 0.2
        rgba(ctx, PAPER, clamp(a))
        _ribbon(ctx, XS, y, th)
        ctx.fill()
    # paper band behind the red line closes the centre gap during the merge
    y, th, sp, m = line_y(C, t, XS)
    if m > 0:
        rgba(ctx, PAPER)
        _ribbon(ctx, XS, y, np.full_like(XS, (S + 8) * m))
        ctx.fill()
    # the red line (trail of the dot)
    launch_th = lerp(2 * R, 8.0, out_cubic(prog(t, LAUNCH, LAUNCH + 0.16)))
    # contraction into the 280 px segment
    c = io_expo(prog(t, T_MERGE + 0.02, T_MERGE + 0.44))
    x0 = lerp(tail, CX - 140, c)
    x1 = lerp(head, CX + 140, c)
    xs = np.linspace(x0, x1, 160)
    y, th, sp, m = line_y(C, t, xs)
    th = np.full_like(xs, launch_th)
    # taper the head while it rockets
    rgba(ctx, RED)
    _ribbon(ctx, xs, y, th)
    ctx.fill()
    if head < W + 60 and c < 0.01:
        circle(ctx, x1, y[-1], launch_th / 2)
        ctx.fill()
    if tail > -60 and c < 0.01:
        circle(ctx, x0, y[0], launch_th / 2)
        ctx.fill()
    if c > 0.0:
        rgba(ctx, RED)
        circle(ctx, x0, y[0], 4)
        circle(ctx, x1, y[-1], 4)
        ctx.fill()
    _annot(ctx, t, LAUNCH + 0.26, LAUNCH + 0.62, (1380, CY - 30), (1460, CY - 150), "FOLLOW-THROUGH", "left",
           "damped string  f1 = 6.5 Hz")


def cam_scale(t):
    """Slow pull-out across bar 1 (intimate → full frame), locked to 1.0 by the launch."""
    return lerp(1.28, 1.0, io_sine(prog(t, 0.0, LAUNCH - 0.05)))


def draw(ctx, t):
    if t < LAUNCH:
        s = cam_scale(t)
        ctx.save()
        ctx.translate(CX, CY)
        ctx.scale(s, s)
        ctx.translate(-CX, -CY)
        draw_point(ctx, t)
        ctx.restore()
    else:
        draw_line(ctx, t)
