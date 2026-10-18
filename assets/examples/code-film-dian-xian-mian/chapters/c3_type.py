"""Bar 4 · 字 TYPE.
"EVERY / FRAME / is a → / DECISION." builds a justified poster on the red plane. Every big line has the
same cap height and the same measure; justification is done by animating the variable font's wdth / wght
axes and tracking (live read-outs show the values). Vertical Chinese columns. One-beat riser: jitter,
push-in, and the full stop — the point again — charges up for the drop."""
import math

import cairo

from look import (B, BAR, CX, CY, H, INK, PAPER, RED, TAU, W, Run, clamp, face, fill_bg, glyph_path, hash01,
                  impulse, in_cubic, in_quart, io_cubic, lerp, out_back, out_cubic, out_expo, prog, rgba, smooth,
                  spring, vnoise1, fit_width, circle)

T0 = 3 * BAR                 # 5.625
TL = [T0, B(13), B(13.5), B(14)]      # line arrivals: 5.625, 6.094, 6.328, 6.5625
T_RISE = B(15)               # 7.031
T_END = 4 * BAR              # 7.5

X0, X1 = 150.0, 1650.0
MEAS = X1 - X0
CAP = 206.0
CAPR = 0.686
SIZE = CAP / CAPR
SCAP = 54.0
SSIZE = SCAP / CAPR
GAP = 38.0
BASE = []
_y = 150 + CAP
BASE.append(_y)                      # EVERY
_y += GAP + CAP
BASE.append(_y)                      # FRAME
_y += GAP + SCAP
BASE.append(_y)                      # is a
_y += GAP + CAP
BASE.append(_y)                      # DECISION.

FC = None
FIT = {}


def _init():
    global FC
    if FC is not None:
        return
    FC = face("archivo")
    for s in ("EVERY", "FRAME"):
        FIT[s] = fit_width(FC, s, SIZE, MEAS, 800)
    # DECISION.: wdth only
    FIT["DECISION."] = fit_width(FC, "DECISION.", SIZE, MEAS, 800)
    # per-letter kerning offsets for DECISION. at final weight
    wd, tr = FIT["DECISION."]
    full = Run(FC, "DECISION.", SIZE, {"wght": 800, "wdth": wd}, tr)
    acc = 0.0
    kern = []
    for ch, g in zip("DECISION.", full.glyphs):
        single = Run(FC, ch, SIZE, {"wght": 800, "wdth": wd})
        kern.append(g["x"] - acc)
        acc += single.advance
    FIT["kern"] = kern


def _guides(ctx, t, k, cap):
    tb = TL[k]
    u = out_expo(prog(t, tb - 0.16, tb + 0.18))
    if u <= 0:
        return
    a = lerp(0.42, 0.2, prog(t, tb + 0.3, tb + 0.7))
    y = BASE[k]
    ctx.set_line_width(1.0)
    rgba(ctx, PAPER, a)
    for yy in (y + 0.5, y - cap + 0.5):
        ctx.move_to(X0 - 60, yy)
        ctx.line_to(lerp(X0 - 60, X1 + 60, u), yy)
    ctx.stroke()


def _readout(ctx, t, k, wght, wdth, trk):
    tb = TL[k]
    if t < tb:
        return
    a = smooth(prog(t, tb, tb + 0.12))
    cap = SCAP if k == 2 else CAP
    y = BASE[k] - cap - 11
    s = "wght %3d   wdth %5.1f   track %+.3f" % (wght, wdth, trk)
    run = Run(face("mono"), s, 12, {"wght": 500}, 0.04)
    ctx.new_path()
    run.path(ctx, X1 - run.advance, y)
    rgba(ctx, PAPER, 0.85 * a)
    ctx.fill()
    run2 = Run(face("mono"), "L%d" % (k + 1), 12, {"wght": 800}, 0.04)
    ctx.new_path()
    run2.path(ctx, X0, y)
    ctx.fill()


def _jit(t, i, line):
    a = 4.0 * in_cubic(prog(t, T_RISE, T_END))
    if a <= 0:
        return 0.0, 0.0
    return a * vnoise1(t * 45 + i * 3.1, line * 7 + 1), a * vnoise1(t * 45 + i * 5.7, line * 7 + 4)


def line_every(ctx, t, final=False):
    tb = TL[0]
    wd1, tr1 = FIT["EVERY"]
    e = 1.0 if final else out_expo(prog(t, tb - 0.05, tb + 0.6))
    wd, tr = lerp(62, wd1, e), lerp(-0.02, tr1, e)
    run = Run(FC, "EVERY", SIZE, {"wght": 800, "wdth": wd}, tr)
    y = BASE[0]

    def pg(g):
        i = g["idx"]
        u = 1.0 if final else out_expo(prog(t, tb - 0.06 + 0.04 * i, tb + 0.42 + 0.04 * i))
        jx, jy = (0, 0) if final else _jit(t, i, 0)
        return {"dy": (1 - u) * (CAP + 30) + jy, "dx": jx}
    return run, X0 - run.ink0, y, pg, (800, wd, tr)


def line_frame(ctx, t, final=False):
    tb = TL[1]
    wd, tr = FIT["FRAME"]
    run = Run(FC, "FRAME", SIZE, {"wght": 800, "wdth": wd}, tr)
    y = BASE[1]

    def pg(g):
        i = g["idx"]
        if final:
            return None
        order = abs(i - 2)
        sy = spring(t - (tb - 0.04 + 0.05 * order), f=3.0, z=0.42)
        if sy < 0.004:
            return {"skip": True}
        jx, jy = _jit(t, i, 1)
        return {"sy": sy, "oy": -CAP / 2, "ox": (g["ink0"] + g["ink1"]) / 2 - g["x"], "dx": jx, "dy": jy}
    return run, X0 - run.ink0, y, pg, (800, wd, tr)


def line_isa(ctx, t, final=False):
    tb = TL[2]
    e = 1.0 if final else out_expo(prog(t, tb - 0.04, tb + 0.4))
    tr = lerp(-0.05, 0.12, e)
    run = Run(FC, "IS A", SSIZE, {"wght": 800, "wdth": 125}, tr)
    y = BASE[2]

    def pg(g):
        i = g["idx"]
        u = 1.0 if final else out_expo(prog(t, tb - 0.05 + 0.03 * i, tb + 0.3 + 0.03 * i))
        jx, jy = (0, 0) if final else _jit(t, i, 2)
        return {"dy": (1 - u) * (SCAP + 16) + jy, "dx": jx}
    return run, X0 - run.ink0, y, pg, (800, 125, tr)


def _isa_rule(ctx, t, run_end, final=False):
    tb = TL[2]
    u = 1.0 if final else out_expo(prog(t, tb + 0.05, tb + 0.5))
    if u <= 0:
        return
    y = BASE[2] - SCAP / 2
    xa = run_end + 34
    xb = lerp(xa, X1, u)
    th = 10.0
    ctx.rectangle(xa, y - th / 2, xb - xa - 26 * u, th)
    # arrow head
    ctx.move_to(xb, y)
    ctx.line_to(xb - 34 * u, y - 22 * u)
    ctx.line_to(xb - 34 * u, y + 22 * u)
    ctx.close_path()


def decision_layout(t, final=False):
    """Per-letter weights (weight wave), returns list of (gid, x, wght, u_rise)."""
    tb = TL[3]
    wd, tr = FIT["DECISION."]
    out = []
    x = X0
    first = True
    for i, ch in enumerate("DECISION."):
        if final:
            wg, u = 800.0, 1.0
        else:
            wv = out_cubic(prog(t, tb - 0.02 + 0.045 * i, tb + 0.32 + 0.045 * i))
            wg = lerp(100, 800, wv)
            u = out_expo(prog(t, tb - 0.06 + 0.03 * i, tb + 0.34 + 0.03 * i))
        r = Run(FC, ch, SIZE, {"wght": wg, "wdth": wd})
        g = r.glyphs[0]
        if first:
            x = X0 - g["ink0"]
            first = False
        out.append((g["gid"], x + FIT["kern"][i], wg, u, r))
        x += r.advance
    return out, wd


def period_center(final=True):
    _init()
    lay, wd = decision_layout(0, final=True)
    gid, x, wg, u, r = lay[-1]
    g = r.glyphs[0]
    cx = x + (g["ink0"] + g["ink1"]) / 2
    pr = (g["ink1"] - g["ink0"]) / 2 * 1.12
    cy = BASE[3] - pr
    return cx, cy


def draw_text_paths(ctx, t, final=False, skip_period=False):
    """All poster glyphs as one path (used both for drawing and for the particle mask)."""
    _init()
    for fn in (line_every, line_frame, line_isa):
        run, x, y, pg, _ = fn(ctx, t, final)
        if not final:
            k = (line_every, line_frame, line_isa).index(fn)
            if t < TL[k] - 0.1:
                continue
        run.path(ctx, x, y, pg)
        if fn is line_isa:
            _isa_rule(ctx, t, x + run.ink1, final)
    if final or t >= TL[3] - 0.1:
        lay, wd = decision_layout(t, final)
        for i, (gid, x, wg, u, r) in enumerate(lay):
            if i == len(lay) - 1:
                if not skip_period:
                    g = r.glyphs[0]
                    pr = (g["ink1"] - g["ink0"]) / 2 * 1.12
                    circle(ctx, x + (g["ink0"] + g["ink1"]) / 2, BASE[3] + (1 - u) * (CAP + 30) - pr, pr)
                continue
            jx, jy = (0, 0) if final else _jit(t, i, 3)
            glyph_path(ctx, FC, gid, x + jx, BASE[3] + (1 - u) * (CAP + 30) + jy, SIZE, {"wght": wg, "wdth": wd})


def _cjk_columns(ctx, t):
    cols = [("每一帧", 1806.0), ("都是一次决定", 1762.0)]
    fc = face("cjk")
    k = 0
    for s, x in cols:
        for j, ch in enumerate(s):
            ts = B(14.6) + 0.035 * k
            k += 1
            u = out_expo(prog(t, ts, ts + 0.3))
            if u <= 0:
                continue
            run = Run(fc, ch, 30)
            y = 330 + j * 37 + (1 - u) * 18
            ctx.new_path()
            run.path(ctx, x - run.advance / 2, y)
            rgba(ctx, INK, u)
            ctx.fill()
    # small vertical rule above the columns
    u = out_expo(prog(t, B(14.4), B(14.4) + 0.4))
    if u > 0:
        ctx.set_line_width(1.2)
        rgba(ctx, INK, 0.8)
        ctx.move_to(1784, 150)
        ctx.line_to(1784, 150 + 140 * u)
        ctx.stroke()


def draw(ctx, t):
    _init()
    fill_bg(ctx, RED)
    rise = prog(t, T_RISE, T_END)
    s = 1 + 0.055 * in_cubic(rise)
    pcx, pcy = period_center()
    ctx.save()
    ctx.translate(pcx, pcy)
    ctx.scale(s, s)
    ctx.translate(-pcx, -pcy)
    # faint carry-over grid from PLANE, darker red
    ctx.set_line_width(1.0)
    rgba(ctx, INK, 0.07)
    for k in range(-16, 17):
        x = CX + 60 * k + 0.5
        ctx.move_to(x, -100)
        ctx.line_to(x, H + 100)
    for k in range(-10, 11):
        y = CY + 60 * k + 0.5
        ctx.move_to(-100, y)
        ctx.line_to(W + 100, y)
    ctx.stroke()
    for k in (0, 1, 3):
        _guides(ctx, t, k, CAP)
    _guides(ctx, t, 2, SCAP)
    # readouts
    for k, fn in enumerate((line_every, line_frame, line_isa)):
        run, x, y, pg, (wg, wd, tr) = fn(ctx, t)
        _readout(ctx, t, k, wg, wd, tr)
    if t >= TL[3]:
        lay, wd = decision_layout(t)
        wmean = sum(l[2] for l in lay) / len(lay)
        _readout(ctx, t, 3, wmean, wd, 0.0)
    # masks: each line is revealed through its own slot
    ctx.save()
    ctx.new_path()
    for k in range(4):
        cap = SCAP if k == 2 else CAP
        ctx.rectangle(-200, BASE[k] - cap - 14, W + 400, cap + 22)
    ctx.clip()
    ctx.new_path()
    draw_text_paths(ctx, t, skip_period=True)
    rgba(ctx, INK)
    ctx.fill()
    # the full stop — the point returns, charging up
    lay, wd = decision_layout(t)
    gid, x, wg, u, r = lay[-1]
    if u > 0:
        g = r.glyphs[0]
        pc = x + (g["ink0"] + g["ink1"]) / 2
        py = BASE[3] + (1 - u) * (CAP + 30)
        charge = smooth(rise)
        flick = 0.5 + 0.5 * math.cos(TAU * t / B(0.25))
        sc = 1 + 0.55 * in_cubic(rise) + 0.08 * charge * flick
        pr = (g["ink1"] - g["ink0"]) / 2 * 1.12
        ctx.new_path()
        circle(ctx, pc, py - pr, pr * sc)
        col = tuple(lerp(a, b, charge) for a, b in zip(INK, PAPER))
        rgba(ctx, col)
        ctx.fill()
    ctx.restore()
    _cjk_columns(ctx, t)
    ctx.restore()


def fx(t, fx):
    if 3 * BAR <= t < 4 * BAR:
        fx["bloom_key"] = "luma"
        fx["bloom_thr"] = 0.6
