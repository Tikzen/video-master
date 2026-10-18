"""Bars 5–6 · 流 FLOW → 体 VOLUME.
DROP: the poster's glyphs shatter into 6,000 particles; a shock ring wipes the red plane to ink; a
curl-noise field + vortex turns them into glowing streams that surge on each kick. They are pulled
onto a lit 3D sphere, which morphs sphere → cube → pyramid on the beats (circle/square/triangle, now
in volume), then the camera dollies through the cloud (warp) into a flash."""
import math
import os

import cairo
import numpy as np

import c3_type as sc3_type
from look import (B, BAR, BLUE, CACHE_DIR, CX, CY, H, INK, PAPER, RED, SNAP, TAU, W, YELLOW, Run, clamp,
                  face, fill_bg, hash01, in_cubic, in_quart, io_cubic, lerp, mixc, new_ctx, new_surface, out_cubic,
                  out_expo, prog, rgba, smooth, circle)

NP = 6000
T_DROP = 4 * BAR             # 7.5
T_VOL = 5 * BAR              # 9.375
T_WARP = 6 * BAR             # 11.25
SIM_DT = 1 / 240.0
STORE = 2                    # store every 2 steps → 1/120 s
SIM_END = T_VOL + 0.05
PAL = [PAPER, YELLOW, RED, BLUE]
PAL_A = np.array(PAL, np.float32)

_D = None


# ----------------------------------------------------------------------------- 3D shapes
def _fib_sphere(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = math.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


def _pyramid_planes():
    apex = np.array([0, 1.12, 0.0])
    b = 0.98
    yb = -0.72
    base = [np.array([b, yb, b]), np.array([-b, yb, b]), np.array([-b, yb, -b]), np.array([b, yb, -b])]
    planes = [(np.array([0, -1.0, 0]), -yb)]
    for k in range(4):
        p1, p2 = base[k], base[(k + 1) % 4]
        n = np.cross(p2 - apex, p1 - apex)
        n = n / np.linalg.norm(n)
        if np.dot(n, apex) < 0:
            n = -n
        planes.append((n, float(np.dot(n, apex))))
    edges = [(apex, p) for p in base] + [(base[k], base[(k + 1) % 4]) for k in range(4)]
    return planes, edges


def _shapes(u):
    sph = u.copy()
    nsph = u.copy()
    m = np.abs(u).max(1, keepdims=True)
    cube = u / m * 0.84
    ax = np.argmax(np.abs(u), 1)
    ncube = np.zeros_like(u)
    ncube[np.arange(len(u)), ax] = np.sign(u[np.arange(len(u)), ax])
    planes, edges = _pyramid_planes()
    tmin = np.full(len(u), 1e9)
    npyr = np.zeros_like(u)
    for n, h in planes:
        d = u @ n
        tt = np.where(d > 1e-6, h / np.maximum(d, 1e-6), 1e9)
        better = tt < tmin
        tmin = np.where(better, tt, tmin)
        npyr[better] = n
    pyr = u * tmin[:, None]
    return [sph, cube, pyr], [nsph, ncube, npyr], edges


def _cube_edges():
    s = 0.84
    c = [np.array([x, y, z]) * s for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    e = []
    for i in range(8):
        for j in range(i + 1, 8):
            if np.sum(np.abs(c[i] - c[j]) > 1e-6) == 1:
                e.append((c[i], c[j]))
    return e


# ----------------------------------------------------------------------------- camera
F = 1250.0
CYV = 520.0


def cam(t):
    tl = t - T_VOL
    yaw = 0.55 * tl + (TAU / 3) * SNAP(prog(t, B(21) - 0.12, B(21) + 0.5)) + (TAU / 3) * SNAP(prog(t, B(22) - 0.12, B(22) + 0.5))
    w = in_cubic(prog(t, B(23) + 0.02, T_WARP))
    yaw += 2.2 * w * w
    pitch = 0.40 + 0.05 * math.sin(1.7 * t)
    D = 4.3 - 4.22 * w
    scale = 1.0 + 1.2 * w
    return yaw, pitch, D, scale, w


def project(P, t, ret_cam=False):
    yaw, pitch, D, scale, w = cam(t)
    P = P * scale
    cy, sy = math.cos(yaw), math.sin(yaw)
    x = P[:, 0] * cy + P[:, 2] * sy
    z = -P[:, 0] * sy + P[:, 2] * cy
    y = P[:, 1]
    cp, sp = math.cos(pitch), math.sin(pitch)
    y2 = y * cp - z * sp
    z2 = y * sp + z * cp
    zc = z2 + D
    zs = np.maximum(zc, 0.05)
    sx = CX + F * x / zs
    syy = CYV - F * y2 / zs
    if ret_cam:
        return sx, syy, zc, z2, (yaw, pitch, D, scale, w)
    return sx, syy, zc, z2


def rotate_normals(N, t):
    yaw, pitch, D, scale, w = cam(t)
    cy, sy = math.cos(yaw), math.sin(yaw)
    x = N[:, 0] * cy + N[:, 2] * sy
    z = -N[:, 0] * sy + N[:, 2] * cy
    y = N[:, 1]
    cp, sp = math.cos(pitch), math.sin(pitch)
    return np.stack([x, y * cp - z * sp, y * sp + z * cp], 1)


# ----------------------------------------------------------------------------- precompute
WAVES = None


def _field(p, t):
    """Curl of a sum of travelling sines + vortex + soft containment."""
    vx = np.zeros(len(p), np.float32)
    vy = np.zeros(len(p), np.float32)
    for (kx, ky, A, w, ph) in WAVES:
        arg = kx * p[:, 0] + ky * p[:, 1] + w * t + ph
        c = np.cos(arg) * A
        vx += c * ky
        vy -= c * kx
    d = p - np.array([CX, CY + 20], np.float32)
    r = np.sqrt((d ** 2).sum(1)) + 1e-3
    om = 0.85 * np.exp(-r / 900)
    vx += -d[:, 1] * om
    vy += d[:, 0] * om
    pull = 260 * np.clip((r - 470) / 380, 0, 1) ** 1.5
    vx -= d[:, 0] / r * pull
    vy -= d[:, 1] / r * pull
    surge = 1.0
    for tb in (B(17), B(18), B(19)):
        if t >= tb:
            surge += 1.5 * math.exp(-(t - tb) / 0.11)
    return vx * surge, vy * surge


RINGS = [  # radius, aspect, tilt, angular speed (rad/s)
    (250.0, 0.42, -0.30, 1.35),
    (400.0, 0.50, 0.18, -0.95),
    (560.0, 0.40, -0.08, 0.70),
]


def _rings(p, t, ring):
    """Velocity that gathers particles into three counter-rotating elliptical orbit streams."""
    vx = np.zeros(len(p), np.float32)
    vy = np.zeros(len(p), np.float32)
    surge = 1.0
    bump = 0.0
    for tb in (B(17), B(18), B(19)):
        if t >= tb:
            surge += 1.3 * math.exp(-(t - tb) / 0.12)
            bump += 70 * math.exp(-(t - tb) / 0.09) * math.sin(min((t - tb) * 30, math.pi))
    for k, (R, asp, tilt, om) in enumerate(RINGS):
        m = ring == k
        d = p[m] - np.array([CX, CY], np.float32)
        c, s_ = math.cos(-tilt), math.sin(-tilt)
        lx = d[:, 0] * c - d[:, 1] * s_
        ly = (d[:, 0] * s_ + d[:, 1] * c) / asp
        th = np.arctan2(ly, lx)
        rho = np.sqrt(lx * lx + ly * ly) + 1e-3
        rt = R + 45 * np.sin(3 * th + 2.2 * t + k * 2.1) + bump
        vr = (rt - rho) * 6.5
        vt = om * surge * rho
        cx_, sx_ = np.cos(th), np.sin(th)
        lvx = vr * cx_ - vt * sx_
        lvy = (vr * sx_ + vt * cx_) * asp
        c2, s2 = math.cos(tilt), math.sin(tilt)
        vx[m] = lvx * c2 - lvy * s2
        vy[m] = lvx * s2 + lvy * c2
    return vx, vy


def precompute(force=False):
    global _D, WAVES
    path = os.path.join(CACHE_DIR, "flow_v4.npz")
    rng = np.random.default_rng(7)
    WAVES = []
    for lam, s in ((1150, 430), (780, 300), (530, 190), (360, 110)):
        a = rng.uniform(0, TAU)
        k = TAU / lam
        WAVES.append((k * math.cos(a), k * math.sin(a), s / k, rng.uniform(-1.2, 1.2), rng.uniform(0, TAU)))
    if _D is not None and not force:
        return _D
    if os.path.exists(path) and not force:
        z = np.load(path)
        _D = {k: z[k] for k in z.files}
        return _D
    os.makedirs(CACHE_DIR, exist_ok=True)
    # 1) sample particles inside the poster glyphs (final layout)
    surf = new_surface()
    ctx = new_ctx(surf)
    ctx.new_path()
    sc3_type.draw_text_paths(ctx, 0, final=True)
    ctx.set_source_rgba(1, 1, 1, 1)
    ctx.fill()
    surf.flush()
    a = np.ndarray((H, W, 4), np.uint8, surf.get_data())[:, :, 3]
    ys, xs = np.nonzero(a > 128)
    idx = rng.choice(len(xs), NP, replace=False)
    pos = np.stack([xs[idx], ys[idx]], 1).astype(np.float32) + rng.uniform(0, 1, (NP, 2)).astype(np.float32)
    col = rng.choice(4, NP, p=[0.55, 0.17, 0.16, 0.12])
    O = np.array(sc3_type.period_center(), np.float32)
    # 2) explosion initial velocities
    d = pos - O
    dist = np.sqrt((d ** 2).sum(1)) + 1e-3
    dirv = d / dist[:, None]
    sp = (1250 + 1700 * rng.random(NP)) * (0.45 + 0.55 * np.exp(-dist / 1100)) + 220
    perp = np.stack([-dirv[:, 1], dirv[:, 0]], 1)
    vel = dirv * sp[:, None] + perp * (sp * 0.35 * (rng.random(NP) * 2 - 1))[:, None]
    vel = vel.astype(np.float32)
    # 3) integrate
    steps = int(round((SIM_END - T_DROP) / SIM_DT))
    store = [pos.copy()]
    p, v = pos.copy(), vel.copy()
    ring = rng.choice(3, NP, p=[0.3, 0.36, 0.34])
    for s in range(1, steps + 1):
        t = T_DROP + s * SIM_DT
        k = 3.4 * smooth(prog(t, T_DROP + 0.08, T_DROP + 0.45))
        fx, fy = _field(p, t)
        rx, ry = _rings(p, t, ring)
        kr = smooth(prog(t, T_DROP + 0.14, T_DROP + 0.6))
        fx = fx * (1 - 0.55 * kr) + rx * kr
        fy = fy * (1 - 0.55 * kr) + ry * kr
        v *= math.exp(-2.2 * SIM_DT)
        v[:, 0] += (fx - v[:, 0]) * k * SIM_DT
        v[:, 1] += (fy - v[:, 1]) * k * SIM_DT
        p += v * SIM_DT
        if s % STORE == 0:
            store.append(p.copy())
    P = np.array(store, np.float32)          # (S, NP, 2) at 1/120 s
    # 4) 3D targets, paired with particles by screen angle to minimise crossings
    u = _fib_sphere(NP)
    shapes, normals, _ = _shapes(u)
    tc = B(19) - 0.06
    pc = _interp(P, tc)
    ang_p = np.arctan2(pc[:, 1] - CYV, pc[:, 0] - CX)
    sx, sy, zc, z2 = project(shapes[0], T_VOL - 0.25)
    ang_t = np.arctan2(sy - CYV, sx - CX)
    order_p = np.argsort(ang_p)
    order_t = np.argsort(ang_t)
    assign = np.empty(NP, int)
    assign[order_p] = order_t
    delay = rng.random(NP).astype(np.float32)
    _D = dict(P=P, col=col, O=O, u=u[assign], S0=shapes[0][assign], S1=shapes[1][assign], S2=shapes[2][assign],
              N0=normals[0][assign], N1=normals[1][assign], N2=normals[2][assign], delay=delay)
    np.savez(path, **_D)
    return _D


def _interp(P, t):
    f = (t - T_DROP) * 120.0
    f = clamp(f, 0, len(P) - 1.001)
    i = int(f)
    a = f - i
    return P[i] * (1 - a) + P[i + 1] * a


# ----------------------------------------------------------------------------- volume state
def vol_state(t):
    """3D positions, normals, base colours (N,3) for the point cloud at time t."""
    D = precompute()
    y01 = (D["u"][:, 1] + 1) / 2
    w1 = np.clip((t - (B(21) - 0.14) - 0.14 * (1 - y01)) / 0.22, 0, 1)
    w2 = np.clip((t - (B(22) - 0.14) - 0.14 * y01) / 0.22, 0, 1)
    w1 = w1 * w1 * (3 - 2 * w1)
    w2 = w2 * w2 * (3 - 2 * w2)
    P = D["S0"] + (D["S1"] - D["S0"]) * w1[:, None]
    P = P + (D["S2"] - P) * w2[:, None]
    N = D["N0"] + (D["N1"] - D["N0"]) * w1[:, None]
    N = N + (D["N2"] - N) * w2[:, None]
    N = N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-6)
    c0 = np.array(mixc(BLUE, PAPER, 0.08), np.float32)
    c1 = np.array(RED, np.float32)
    c2 = np.array(YELLOW, np.float32)
    C = c0 + (c1 - c0) * w1[:, None]
    C = C + (c2 - C) * w2[:, None]
    # breathing ripple on the kick
    pulse = 0.0
    for tb in (T_VOL, B(21), B(22), B(23)):
        if t >= tb:
            pulse += 0.05 * math.exp(-(t - tb) / 0.1) * math.cos(TAU * (t - tb) * 3)
    P = P * (1 + pulse * np.sin(D["u"][:, 1] * 6 + t * 8)[:, None])
    return P, N, C


LIGHT = np.array([-0.45, 0.65, -0.62])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def _shade(N, C, t):
    Nr = rotate_normals(N, t)
    lam = np.clip(Nr @ LIGHT, 0, 1)
    rim = np.clip(1 - np.abs(Nr[:, 2]), 0, 1) ** 3
    spec = lam ** 14
    rgb = C * (0.22 + 0.95 * lam)[:, None] + np.array(PAPER, np.float32) * (0.55 * spec + 0.25 * rim)[:, None]
    return rgb


# ----------------------------------------------------------------------------- drawing
_BOKEH = [(hash01(i, 1), hash01(i, 2), hash01(i, 3), hash01(i, 4)) for i in range(11)]


def _bokeh(ctx, t, amt):
    for i, (a, b, c, d) in enumerate(_BOKEH):
        col = (BLUE, RED, YELLOW, BLUE)[i % 4]
        x = W * a + 60 * math.sin(t * 0.7 + i)
        y = H * b + 40 * math.cos(t * 0.5 + i * 2)
        r = 90 + 220 * c
        g = cairo.RadialGradient(x, y, 0, x, y, r)
        g.add_color_stop_rgba(0, col[0], col[1], col[2], (0.05 + 0.08 * d) * amt)
        g.add_color_stop_rgba(1, col[0], col[1], col[2], 0)
        ctx.set_source(g)
        circle(ctx, x, y, r)
        ctx.fill()


def _strokes(ctx, a, b, cols, alpha, width):
    """Batched additive streaks a->b grouped by palette index."""
    ctx.set_line_width(width)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    for ci in range(4):
        m = cols == ci
        if not m.any():
            continue
        aa, bb = a[m], b[m]
        for (x0, y0), (x1, y1) in zip(aa.tolist(), bb.tolist()):
            ctx.move_to(x0, y0)
            ctx.line_to(x1 + 0.01, y1)
        c = PAL[ci]
        ctx.set_source_rgba(c[0], c[1], c[2], alpha)
        ctx.stroke()


def _rgb_streaks(ctx, a, b, rgb, width):
    """Additive streaks a->b, batched by quantised colour."""
    q = np.clip(rgb, 0, 1)
    key = np.round(q * 6).astype(int)
    k = key[:, 0] * 49 + key[:, 1] * 7 + key[:, 2]
    ctx.set_line_width(width)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    for kk in np.unique(k):
        m = k == kk
        cm = q[m].mean(0)
        if cm.max() < 0.02:
            continue
        for x0, y0, x1, y1 in zip(a[m, 0].tolist(), a[m, 1].tolist(), b[m, 0].tolist(), b[m, 1].tolist()):
            ctx.move_to(x0, y0)
            ctx.line_to(x1 + 0.01, y1)
        ctx.set_source_rgba(float(cm[0]), float(cm[1]), float(cm[2]), 1.0)
        ctx.stroke()


def _flow_positions(t):
    D = precompute()
    p = _interp(D["P"], t)
    return p


def _converge(t, p):
    """Blend simulated positions onto the projected sphere."""
    D = precompute()
    s = np.clip((t - (B(19) - 0.08) - 0.16 * D["delay"]) / (T_VOL - 0.03 - (B(19) - 0.08) - 0.16), 0, 1)
    s = s * s * (3 - 2 * s)
    if s.max() <= 0:
        return p, s, None
    P, N, C = vol_state(max(t, T_VOL - 0.6))
    sx, sy, zc, z2 = project(P, t)
    tgt = np.stack([sx, sy], 1)
    return p + (tgt - p) * s[:, None], s, (P, N, C, zc, z2)


def draw_flow(ctx, t):
    D = precompute()
    fill_bg(ctx, INK)
    O = D["O"]
    # red plane outside the shock wipe
    rw = 2400 * out_cubic(prog(t, T_DROP, T_DROP + 0.42))
    if rw < 2300:
        rgba(ctx, RED)
        ctx.rectangle(0, 0, W, H)
        circle(ctx, O[0], O[1], rw)
        ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
        ctx.fill()
        ctx.set_fill_rule(cairo.FILL_RULE_WINDING)
    u = prog(t, T_DROP, T_DROP + 0.5)
    if u < 1:
        ctx.set_line_width(lerp(16, 1, u))
        rgba(ctx, PAPER, 0.9 * (1 - u))
        circle(ctx, O[0], O[1], rw * 0.985)
        ctx.stroke()
        ctx.set_line_width(lerp(4, 0.5, u))
        rgba(ctx, PAPER, 0.5 * (1 - u))
        circle(ctx, O[0], O[1], rw * 0.82)
        ctx.stroke()
    ga = smooth(prog(t, B(19), T_VOL))
    if ga > 0:
        _vol_bg(ctx, ga)
    ctx.set_operator(cairo.OPERATOR_ADD)
    _bokeh(ctx, t, smooth(prog(t, T_DROP + 0.1, T_DROP + 0.6)))
    p = _flow_positions(t)
    q = _flow_positions(t - 0.03)
    p2, s, vs = _converge(t, p)
    q2, _, _ = _converge(t - 0.03, q)
    cols = D["col"]
    # long silky trails on a subset
    sub = np.arange(0, NP, 14)
    ta = 1 - smooth(prog(t, B(19), T_VOL))
    if ta > 0:
        ctx.set_line_width(1.1)
        for ci in range(4):
            ids = sub[cols[sub] == ci]
            if len(ids) == 0:
                continue
            pts = [ _flow_positions(t - k / 60.0)[ids] for k in range(0, 14) ]
            for j in range(len(ids)):
                for k, pt in enumerate(pts):
                    (ctx.move_to if k == 0 else ctx.line_to)(float(pt[j, 0]), float(pt[j, 1]))
            c = PAL[ci]
            ctx.set_source_rgba(c[0], c[1], c[2], 0.2 * ta)
            ctx.stroke()
    brightness = 0.85
    for tb in (B(17), B(18), B(19)):
        if t >= tb:
            brightness += 0.25 * math.exp(-(t - tb) / 0.12)
    rgb = PAL_A[cols] * clamp(brightness) * 0.72
    width = 2.1
    if vs is not None:
        P, N, C, zc, z2 = vs
        depth = np.clip((1.3 - z2) / 2.6, 0, 1)
        rgbv = _shade(N, C, t) * 1.25 * (0.35 + 0.65 * depth)[:, None] * 0.9
        rgb = rgb + (rgbv - rgb) * s[:, None]
        width = lerp(2.1, 5.0, float(s.mean()))
    _rgb_streaks(ctx, q2, p2, rgb, width)
    ctx.set_operator(cairo.OPERATOR_OVER)


def _floor(ctx, t, a):
    if a <= 0:
        return
    yv = -1.42
    ctx.set_line_width(1.0)
    n = 24
    for k in range(-6, 7):
        for axis in (0, 1):
            g = k * 0.5
            ts = np.linspace(-3, 3, n)
            if axis == 0:
                P = np.stack([np.full(n, g), np.full(n, yv), ts], 1)
            else:
                P = np.stack([ts, np.full(n, yv), np.full(n, g)], 1)
            sx, sy, zc, z2 = project(P, t)
            for j in range(n - 1):
                if zc[j] < 0.3 or zc[j + 1] < 0.3:
                    continue
                rr = math.hypot(float(P[j, 0]), float(P[j, 2]))
                al = a * 0.22 * clamp(1 - rr / 3.2) * clamp(1.6 - float(z2[j]) * 0.3)
                if al <= 0.005:
                    continue
                ctx.move_to(float(sx[j]), float(sy[j]))
                ctx.line_to(float(sx[j + 1]), float(sy[j + 1]))
                ctx.set_source_rgba(0.45, 0.55, 1.0, al)
                ctx.stroke()


def _edges(ctx, t, edges, a, draw_u):
    if a <= 0:
        return
    ctx.set_line_width(1.3)
    for (p0, p1) in edges:
        m = (p0 + p1) / 2
        e0 = m + (p0 - m) * draw_u
        e1 = m + (p1 - m) * draw_u
        P = np.linspace(e0, e1, 12)
        sx, sy, zc, z2 = project(P, t)
        for j in range(11):
            al = a * (0.55 - 0.18 * float(z2[j]))
            ctx.move_to(float(sx[j]), float(sy[j]))
            ctx.line_to(float(sx[j + 1]), float(sy[j + 1]))
            rgba(ctx, PAPER, clamp(al))
            ctx.stroke()


_SCR = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=/"


def _scramble(ctx, t, x, y):
    names = [(T_VOL - 0.2, "SPHERE"), (B(21), "CUBE"), (B(22), "PYRAMID")]
    cur = names[0]
    for nm in names:
        if t >= nm[0]:
            cur = nm
    t0, s = cur
    out = []
    for i, ch in enumerate(s):
        if t < t0 + 0.05 + 0.04 * i:
            out.append(_SCR[int(hash01(i, int(t * 30)) * len(_SCR))])
        else:
            out.append(ch)
    txt = "".join(out)
    fc = face("mono")
    run = Run(fc, txt, 15, {"wght": 700}, 0.3)
    ctx.new_path()
    run.path(ctx, x - run.advance / 2, y)
    rgba(ctx, PAPER, 0.9)
    ctx.fill()
    sub = "POINT CLOUD  ·  n = 6000  ·  LAMBERT + RIM"
    run2 = Run(fc, sub, 11, {"wght": 400}, 0.12)
    ctx.new_path()
    run2.path(ctx, x - run2.advance / 2, y + 22)
    rgba(ctx, PAPER, 0.5)
    ctx.fill()
    # small brackets
    ctx.set_line_width(1.2)
    rgba(ctx, PAPER, 0.6)
    for sg in (-1, 1):
        bx = x + sg * (run.advance / 2 + 18)
        ctx.move_to(bx + sg * -6, y - 16)
        ctx.line_to(bx, y - 16)
        ctx.line_to(bx, y + 4)
        ctx.line_to(bx + sg * -6, y + 4)
    ctx.stroke()


_CUBE_E = _cube_edges()
_PYR_E = _pyramid_planes()[1]


def _vol_bg(ctx, a):
    g = cairo.RadialGradient(CX, CYV, 0, CX, CYV, 1100)
    g.add_color_stop_rgba(0, 0.07, 0.08, 0.18, a)
    g.add_color_stop_rgba(1, INK[0], INK[1], INK[2], a)
    ctx.set_source(g)
    ctx.paint()


def draw_volume(ctx, t):
    D = precompute()
    fill_bg(ctx, INK)
    _vol_bg(ctx, 1.0)
    ba = 1 - smooth(prog(t, T_VOL, T_VOL + 0.4))
    if ba > 0:
        ctx.set_operator(cairo.OPERATOR_ADD)
        _bokeh(ctx, t, ba)
        ctx.set_operator(cairo.OPERATOR_OVER)
    yaw, pitch, Dd, scale, w = cam(t)
    _floor(ctx, t, (1 - w) * smooth(prog(t, T_VOL - 0.1, T_VOL + 0.4)))
    P, N, C = vol_state(t)
    sx, sy, zc, z2 = project(P, t)
    rgb = _shade(N, C, t) * 1.25
    depth = np.clip((1.3 - z2) / 2.6, 0, 1)                   # 1 = front
    alpha = 0.35 + 0.65 * depth
    size = 2.5 * (4.3 / np.maximum(zc, 0.05)) ** 1.0 * (0.75 + 0.35 * depth)
    vis = zc > 0.12
    ctx.set_operator(cairo.OPERATOR_ADD)
    # orbit ring
    k = np.arange(240)
    th = k / 240 * TAU + t * 1.1
    tilt = 0.32
    ring = np.stack([np.cos(th) * 1.78, np.sin(th) * 1.78 * math.sin(tilt), np.sin(th) * 1.78 * math.cos(tilt)], 1)
    rx, ry, rz, rz2 = project(ring, t)
    ra = (1 - w) * smooth(prog(t, T_VOL, T_VOL + 0.4))
    if ra > 0:
        for j in range(240):
            if rz[j] < 0.2:
                continue
            a = ra * (0.25 + 0.45 * clamp((1.3 - float(rz2[j])) / 2.6)) * (1.0 if j % 30 else 2.5)
            rgba(ctx, PAPER, clamp(a))
            circle(ctx, float(rx[j]), float(ry[j]), 1.4 if j % 30 else 3.0)
            ctx.fill()
    if w > 0.02:
        # warp: streaks from the previous instant
        px, py, pz, pz2 = project(P, t - 0.035)
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        lw = 1.6 + 2.5 * w
        q = np.clip(rgb * (alpha * (1 + w))[:, None], 0, 1)
        lev = np.minimum((q.max(1) * 10).astype(int), 9)
        for L in range(10):
            m = (lev == L) & vis & (pz > 0.12)
            if not m.any():
                continue
            cm = q[m].mean(0)
            ctx.set_line_width(lw)
            for a0, b0, a1, b1 in zip(px[m].tolist(), py[m].tolist(), sx[m].tolist(), sy[m].tolist()):
                ctx.move_to(a0, b0)
                ctx.line_to(a1 + 0.01, b1)
            ctx.set_source_rgba(cm[0], cm[1], cm[2], 0.95)
            ctx.stroke()
    else:
        q = np.clip(rgb * alpha[:, None], 0, 1.2)
        lev = np.minimum((q.max(1) * 14).astype(int), 13)
        sz = np.round(size * 2) / 2
        for L in range(14):
            m = (lev == L) & vis
            if not m.any():
                continue
            cm = np.clip(q[m].mean(0), 0, 1)
            for x, y, r in zip(sx[m].tolist(), sy[m].tolist(), sz[m].tolist()):
                ctx.move_to(x + r, y)
                ctx.arc(x, y, r, 0, TAU)
            ctx.set_source_rgba(cm[0], cm[1], cm[2], 0.9)
            ctx.fill()
    ctx.set_operator(cairo.OPERATOR_OVER)
    # wireframes
    a1 = smooth(prog(t, B(21) + 0.1, B(21) + 0.25)) * (1 - smooth(prog(t, B(22) - 0.16, B(22) - 0.06)))
    _edges(ctx, t, _CUBE_E, a1 * (1 - w), out_expo(prog(t, B(21) + 0.08, B(21) + 0.35)))
    a2 = smooth(prog(t, B(22) + 0.1, B(22) + 0.25)) * (1 - smooth(prog(t, B(23), B(23) + 0.15)))
    _edges(ctx, t, _PYR_E, a2, out_expo(prog(t, B(22) + 0.08, B(22) + 0.35)))
    if w < 0.3:
        ctx.save()
        la = smooth(prog(t, T_VOL, T_VOL + 0.2)) * (1 - smooth(prog(t, B(23), B(23) + 0.2)))
        if la > 0:
            ctx.push_group()
            _scramble(ctx, t, CX, 900)
            ctx.pop_group_to_source()
            ctx.paint_with_alpha(la)
        ctx.restore()


def draw(ctx, t):
    if t < T_VOL:
        draw_flow(ctx, t)
    else:
        draw_volume(ctx, t)


def fx(t, fx):
    if T_DROP <= t < T_WARP:
        w = cam(t)[4] if t >= T_VOL else 0
        fx["bloom"] = (0.75 if t < T_VOL else 0.95) + 0.8 * w
        fx["bloom_thr"] = 0.40
