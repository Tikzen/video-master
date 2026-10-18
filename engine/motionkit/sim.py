"""Deterministic particle systems, precomputed once and cached to disk.

Frames must be pure functions of time, so simulations are integrated ahead of time
(fixed dt, fixed seed) and stored; render code interpolates positions at any t.

    from motionkit import sim
    @film.precompute
    def flow():
        return sim.cached(film.path("cache", "flow_v1.npz"), build_flow)   # bump _v1 when params change

    def build_flow():
        pos = sim.sample_mask(film.width, film.height, draw_type_fn, n=6000, seed=7)   # points inside glyphs
        vel = sim.burst(pos, origin=(1626, 908), speed=(1250, 2950), seed=7)
        field = sim.Field().curl(seed=7).vortex((960, 560), 0.85).contain((960, 560), 470)
        P = sim.integrate(pos, vel, field, t0=7.5, t1=9.4, drag=2.2, follow=(0.08, 0.45, 3.4))
        return dict(P=P, t0=7.5, rate=120)

    pos = sim.at(data["P"], data["t0"], data["rate"], t)       # (n, 2) positions at time t

Particle looks (references/craft/procedural.md): draw as short streaks from at(t-0.03)→at(t)
with additive blend, batch by colour (sim.batch_streaks), 1–3 px wide, bloom 0.7–1.0.
"""
import math
import os

import numpy as np

from .ease import TAU, clamp, prog, smooth


def cached(path, build, force=False):
    """Load dict-of-arrays from npz if present, else build() and save. Bump the filename to invalidate."""
    if os.path.exists(path) and not force:
        z = np.load(path, allow_pickle=False)
        return {k: (z[k].item() if z[k].ndim == 0 else z[k]) for k in z.files}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    d = build()
    np.savez(path, **{k: np.asarray(v) for k, v in d.items()})
    return d


_MEMO = {}


def memo(path, build):
    """Process-level memo around cached() (each worker loads once)."""
    if path not in _MEMO:
        _MEMO[path] = cached(path, build)
    return _MEMO[path]


def sample_mask(w, h, draw_fn, n, seed=0, threshold=128):
    """Sample n points uniformly inside whatever draw_fn(ctx) fills (white) on a w×h canvas."""
    from .draw import new_ctx, new_surface
    surf = new_surface(w, h)
    ctx = new_ctx(surf)
    ctx.set_source_rgba(1, 1, 1, 1)
    draw_fn(ctx)
    surf.flush()
    a = np.ndarray((h, w, 4), np.uint8, surf.get_data())[:, :, 3]
    ys, xs = np.nonzero(a > threshold)
    if len(xs) == 0:
        raise ValueError("sample_mask: draw_fn produced no filled pixels")
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(xs), n, replace=len(xs) < n)
    return (np.stack([xs[idx], ys[idx]], 1) + rng.uniform(0, 1, (n, 2))).astype(np.float32)


def burst(pos, origin, speed=(800, 2000), falloff=1100.0, swirl=0.35, floor=200.0, seed=0):
    """Explosion velocities radiating from origin; nearer particles faster."""
    rng = np.random.default_rng(seed + 1)
    d = pos - np.asarray(origin, np.float32)
    dist = np.sqrt((d ** 2).sum(1)) + 1e-3
    dirv = d / dist[:, None]
    sp = (speed[0] + (speed[1] - speed[0]) * rng.random(len(pos))) * (0.45 + 0.55 * np.exp(-dist / falloff)) + floor
    perp = np.stack([-dirv[:, 1], dirv[:, 0]], 1)
    return (dirv * sp[:, None] + perp * (sp * swirl * (rng.random(len(pos)) * 2 - 1))[:, None]).astype(np.float32)


class Field:
    """Composable velocity field: curl noise + vortices + attractor orbits + containment + beat surges."""

    def __init__(self):
        self.terms = []
        self.surges = []

    def curl(self, seed=0, octaves=((1150, 430), (780, 300), (530, 190), (360, 110)), weight=1.0):
        rng = np.random.default_rng(seed)
        waves = []
        for lam, s in octaves:
            a = rng.uniform(0, TAU)
            k = TAU / lam
            waves.append((k * math.cos(a), k * math.sin(a), s / k, rng.uniform(-1.2, 1.2), rng.uniform(0, TAU)))

        def f(p, t, ids):
            vx = np.zeros(len(p), np.float32)
            vy = np.zeros(len(p), np.float32)
            for (kx, ky, A, w, ph) in waves:
                c = np.cos(kx * p[:, 0] + ky * p[:, 1] + w * t + ph) * A
                vx += c * ky
                vy -= c * kx
            return vx * weight, vy * weight
        self.terms.append(f)
        return self

    def vortex(self, center, omega=0.85, radius=900.0):
        c = np.asarray(center, np.float32)

        def f(p, t, ids):
            d = p - c
            r = np.sqrt((d ** 2).sum(1)) + 1e-3
            om = omega * np.exp(-r / radius)
            return -d[:, 1] * om, d[:, 0] * om
        self.terms.append(f)
        return self

    def contain(self, center, r0=470.0, soft=380.0, strength=260.0):
        c = np.asarray(center, np.float32)

        def f(p, t, ids):
            d = p - c
            r = np.sqrt((d ** 2).sum(1)) + 1e-3
            pull = strength * np.clip((r - r0) / soft, 0, 1) ** 1.5
            return -d[:, 0] / r * pull, -d[:, 1] / r * pull
        self.terms.append(f)
        return self

    def orbits(self, center, rings, assign, stiffness=6.5, wobble=45.0, ramp=None):
        """Gather particles into elliptical orbit streams. rings=[(R, aspect, tilt, omega), ...];
        assign = int array (ring index per particle). ramp=(t0, t1) fades the term in."""
        c = np.asarray(center, np.float32)

        def f(p, t, ids):
            vx = np.zeros(len(p), np.float32)
            vy = np.zeros(len(p), np.float32)
            surge = self._surge(t)
            for k, (R, asp, tilt, om) in enumerate(rings):
                m = assign[ids] == k
                if not m.any():
                    continue
                d = p[m] - c
                cs, sn = math.cos(-tilt), math.sin(-tilt)
                lx = d[:, 0] * cs - d[:, 1] * sn
                ly = (d[:, 0] * sn + d[:, 1] * cs) / asp
                th = np.arctan2(ly, lx)
                rho = np.sqrt(lx * lx + ly * ly) + 1e-3
                rt = R + wobble * np.sin(3 * th + 2.2 * t + k * 2.1)
                vr = (rt - rho) * stiffness
                vt = om * surge * rho
                lvx = vr * np.cos(th) - vt * np.sin(th)
                lvy = (vr * np.sin(th) + vt * np.cos(th)) * asp
                c2, s2 = math.cos(tilt), math.sin(tilt)
                vx[m] = lvx * c2 - lvy * s2
                vy[m] = lvx * s2 + lvy * c2
            if ramp:
                k = smooth(prog(t, *ramp))
                return vx * k, vy * k
            return vx, vy
        self.terms.append(f)
        return self

    def surge_at(self, times, amount=1.4, tau=0.11):
        """Velocity surges on beats (kicks)."""
        self.surges += [(float(x), amount, tau) for x in times]
        return self

    def _surge(self, t):
        s = 1.0
        for (tb, a, tau) in self.surges:
            if t >= tb:
                s += a * math.exp(-(t - tb) / tau)
        return s

    def __call__(self, p, t, ids=None):
        ids = np.arange(len(p)) if ids is None else ids
        vx = np.zeros(len(p), np.float32)
        vy = np.zeros(len(p), np.float32)
        for f in self.terms:
            a, b = f(p, t, ids)
            vx += a
            vy += b
        s = self._surge(t)
        return vx * s, vy * s


def integrate(pos, vel, field, t0, t1, dt=1 / 240.0, rate=120, drag=2.2, follow=(0.08, 0.45, 3.4)):
    """Semi-implicit Euler. follow=(start, end, k): blend rate toward the field ramps from 0→k
    between t0+start and t0+end (lets an explosion breathe before the flow takes over).
    Returns (frames, n, 2) float32 sampled at `rate` Hz starting at t0."""
    p, v = pos.astype(np.float32).copy(), vel.astype(np.float32).copy()
    steps = int(round((t1 - t0) / dt))
    every = max(1, int(round(1 / (dt * rate))))
    out = [p.copy()]
    ids = np.arange(len(p))
    for s in range(1, steps + 1):
        t = t0 + s * dt
        k = follow[2] * smooth(prog(t, t0 + follow[0], t0 + follow[1])) if follow else 1.0
        fx, fy = field(p, t, ids)
        v *= math.exp(-drag * dt)
        v[:, 0] += (fx - v[:, 0]) * k * dt
        v[:, 1] += (fy - v[:, 1]) * k * dt
        p += v * dt
        if s % every == 0:
            out.append(p.copy())
    return np.array(out, np.float32)


def at(P, t0, rate, t):
    """Interpolated positions at time t from stored frames P (frames, n, 2)."""
    f = clamp((t - t0) * rate, 0, len(P) - 1.001)
    i = int(f)
    a = f - i
    return P[i] * (1 - a) + P[i + 1] * a


def pair_by_angle(src, dst, center):
    """Index array m so that src[i] → dst[m[i]] travel without crossing much (angle-sorted pairing)."""
    c = np.asarray(center, np.float32)
    a = np.arctan2(src[:, 1] - c[1], src[:, 0] - c[0])
    b = np.arctan2(dst[:, 1] - c[1], dst[:, 0] - c[0])
    m = np.empty(len(src), int)
    m[np.argsort(a)] = np.argsort(b)
    return m


def batch_streaks(ctx, a, b, rgb, width, alpha=1.0, levels=6):
    """Stroke many segments a[i]→b[i] in few cairo calls by quantising colour. Use with blend('add')."""
    import cairo
    q = np.clip(rgb, 0, 1)
    key = np.round(q * levels).astype(int)
    k = key[:, 0] * (levels + 1) ** 2 + key[:, 1] * (levels + 1) + key[:, 2]
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
        ctx.set_source_rgba(float(cm[0]), float(cm[1]), float(cm[2]), alpha)
        ctx.stroke()


def batch_dots(ctx, xy, r, rgb, alpha=1.0, levels=8):
    """Fill many discs (r scalar or array) in few calls by quantising colour."""
    q = np.clip(rgb, 0, 1)
    key = np.round(q * levels).astype(int)
    k = key[:, 0] * (levels + 1) ** 2 + key[:, 1] * (levels + 1) + key[:, 2]
    rr = np.broadcast_to(np.asarray(r, float), (len(xy),))
    for kk in np.unique(k):
        m = k == kk
        if q[m].max() < 0.01:
            continue
        cm = np.clip(q[m].mean(0), 0, 1)
        for (x, y), rad in zip(xy[m].tolist(), rr[m].tolist()):
            ctx.move_to(x + rad, y)
            ctx.arc(x, y, rad, 0, TAU)
        ctx.set_source_rgba(float(cm[0]), float(cm[1]), float(cm[2]), alpha)
        ctx.fill()
