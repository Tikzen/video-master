"""3D in 2D: point clouds on primitive surfaces, perspective camera, Lambert/rim shading, morphs.

    from motionkit import space
    u = space.fib_sphere(6000)                         # unit directions
    S, N = space.on_sphere(u)                          # positions, normals
    C, NC = space.on_cube(u, 0.84)                     # radial projection: same index → same direction
    P, NP_ = space.on_convex(u, space.pyramid_planes()) # any convex polyhedron
    cam = space.Camera(f=1250, cx=960, cy=520, dist=4.3, yaw=t*0.55, pitch=0.40)
    sx, sy, z = cam.project(lerp(S, C, w))             # z: camera-space depth (+ = away)
    lit = space.shade(cam.rotate(N), base_rgb, light=(-0.45, 0.65, -0.62))
    space.draw_points(ctx, sx, sy, z, lit, size=2.5, dist=cam.dist)

Why radial projection: every point keeps its direction, so morphs sphere→cube→pyramid move each
point outward/inward along a ray — no crossings, readable as one object changing shape.
"""
import math

import numpy as np

from .ease import TAU
from .sim import batch_dots, batch_streaks


def fib_sphere(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = math.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


def on_sphere(u, r=1.0):
    return u * r, u.copy()


def on_cube(u, half=0.84):
    m = np.abs(u).max(1, keepdims=True)
    ax = np.argmax(np.abs(u), 1)
    n = np.zeros_like(u)
    n[np.arange(len(u)), ax] = np.sign(u[np.arange(len(u)), ax])
    return u / m * half, n


def plane_from(a, b, c, inside=(0, 0, 0)):
    n = np.cross(np.asarray(b) - a, np.asarray(c) - a)
    n = n / np.linalg.norm(n)
    h = float(np.dot(n, a))
    if np.dot(n, inside) > h:
        n, h = -n, -h
    return n, h


def pyramid_planes(base=0.98, yb=-0.72, apex=1.12):
    A = np.array([0, apex, 0.0])
    B = [np.array([base, yb, base]), np.array([-base, yb, base]), np.array([-base, yb, -base]), np.array([base, yb, -base])]
    planes = [(np.array([0, -1.0, 0]), -yb)]
    for k in range(4):
        planes.append(plane_from(A, B[k], B[(k + 1) % 4]))
    edges = [(A, p) for p in B] + [(B[k], B[(k + 1) % 4]) for k in range(4)]
    return planes, edges


def cube_edges(half=0.84):
    c = [np.array([x, y, z]) * half for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    return [(c[i], c[j]) for i in range(8) for j in range(i + 1, 8) if np.sum(np.abs(c[i] - c[j]) > 1e-6) == 1]


def on_convex(u, planes):
    """Radially project unit directions onto a convex polyhedron given as planes [(n, h)] with n·x = h."""
    if isinstance(planes, tuple):
        planes = planes[0]
    tmin = np.full(len(u), 1e9)
    nrm = np.zeros_like(u)
    for n, h in planes:
        d = u @ n
        tt = np.where(d > 1e-6, h / np.maximum(d, 1e-6), 1e9)
        better = tt < tmin
        tmin = np.where(better, tt, tmin)
        nrm[better] = n
    return u * tmin[:, None], nrm


def on_torus(u, R=0.85, r=0.32):
    """Map sphere directions to a torus (θ from azimuth, φ from polar) — for loops/rings."""
    th = np.arctan2(u[:, 2], u[:, 0])
    ph = np.arccos(np.clip(u[:, 1], -1, 1)) * 2
    x = (R + r * np.cos(ph)) * np.cos(th)
    z = (R + r * np.cos(ph)) * np.sin(th)
    y = r * np.sin(ph)
    n = np.stack([np.cos(ph) * np.cos(th), np.sin(ph), np.cos(ph) * np.sin(th)], 1)
    return np.stack([x, y, z], 1), n


def ring_points(n, radius, tilt=0.3, phase=0.0):
    th = np.arange(n) / n * TAU + phase
    return np.stack([np.cos(th) * radius, np.sin(th) * radius * math.sin(tilt), np.sin(th) * radius * math.cos(tilt)], 1)


class Camera:
    """Orbit camera: world rotated by yaw (about Y) then pitch (about X), viewed from distance `dist`.
    Screen: x right, y down. f = focal length in px (object of radius 1 at dist d spans ≈ f/d px)."""

    def __init__(self, f=1250.0, cx=960.0, cy=540.0, dist=4.3, yaw=0.0, pitch=0.35, roll=0.0, scale=1.0):
        self.f, self.cx, self.cy, self.dist = f, cx, cy, dist
        self.yaw, self.pitch, self.roll, self.scale = yaw, pitch, roll, scale

    def rotate(self, P):
        cy, sy = math.cos(self.yaw), math.sin(self.yaw)
        x = P[:, 0] * cy + P[:, 2] * sy
        z = -P[:, 0] * sy + P[:, 2] * cy
        y = P[:, 1]
        cp, sp = math.cos(self.pitch), math.sin(self.pitch)
        y2 = y * cp - z * sp
        z2 = y * sp + z * cp
        if self.roll:
            cr, sr = math.cos(self.roll), math.sin(self.roll)
            x, y2 = x * cr - y2 * sr, x * sr + y2 * cr
        return np.stack([x, y2, z2], 1)

    def project(self, P):
        """→ (sx, sy, z_cam, z_obj): z_cam = distance from camera (cull ≤ 0.1), z_obj = depth within object
        (negative = toward camera)."""
        R = self.rotate(P * self.scale)
        zc = R[:, 2] + self.dist
        zs = np.maximum(zc, 0.05)
        return self.cx + self.f * R[:, 0] / zs, self.cy - self.f * R[:, 1] / zs, zc, R[:, 2]


def shade(Nr, base, light=(-0.45, 0.65, -0.62), ambient=0.22, diffuse=0.95, spec=0.55, rim=0.25,
          spec_power=14, spec_col=(0.93, 0.91, 0.88)):
    """Lambert + specular + rim on rotated normals. base: (n,3) or (3,). Returns (n,3)."""
    L = np.asarray(light, float)
    L = L / np.linalg.norm(L)
    lam = np.clip(Nr @ L, 0, 1)
    rimv = np.clip(1 - np.abs(Nr[:, 2]), 0, 1) ** 3
    b = np.broadcast_to(np.asarray(base, np.float32), (len(Nr), 3))
    return b * (ambient + diffuse * lam)[:, None] + np.asarray(spec_col, np.float32) * (
        spec * lam ** spec_power + rim * rimv)[:, None]


def depth_alpha(z_obj, near=-1.3, far=1.3, lo=0.35):
    """Fog: front points opaque/bright, back points dim (z_obj from Camera.project)."""
    d = np.clip((far - z_obj) / (far - near), 0, 1)
    return lo + (1 - lo) * d


def draw_points(ctx, sx, sy, zc, rgb, size=2.5, dist=4.3, z_obj=None, cull=0.12, alpha=0.9):
    """Perspective-sized discs, batched by colour. Use inside blend(ctx, 'add') on dark grounds."""
    a = depth_alpha(z_obj) if z_obj is not None else np.ones(len(sx))
    r = size * (dist / np.maximum(zc, 0.05)) * (0.75 + 0.35 * a)
    vis = zc > cull
    xy = np.stack([sx, sy], 1)[vis]
    batch_dots(ctx, xy, np.round(r[vis] * 2) / 2, rgb[vis] * a[vis, None], alpha)


def draw_streaks(ctx, prev_xy, xy, rgb, width=2.0, alpha=0.95):
    batch_streaks(ctx, prev_xy, xy, rgb, width, alpha)


def draw_edges(ctx, cam, edges, col, a=0.5, draw_u=1.0, width=1.3, segments=12):
    """Wireframe edges (list of (p0, p1)) drawing on from their midpoints; depth-faded."""
    ctx.save()
    ctx.set_line_width(width)
    for (p0, p1) in edges:
        m = (p0 + p1) / 2
        e0, e1 = m + (p0 - m) * draw_u, m + (p1 - m) * draw_u
        P = np.linspace(e0, e1, segments)
        sx, sy, zc, z = cam.project(P)
        for j in range(segments - 1):
            al = a * (0.55 - 0.18 * float(z[j])) / 0.55
            ctx.move_to(float(sx[j]), float(sy[j]))
            ctx.line_to(float(sx[j + 1]), float(sy[j + 1]))
            ctx.set_source_rgba(col[0], col[1], col[2], max(0.0, min(1.0, al)))
            ctx.stroke()
    ctx.restore()


def floor_grid(ctx, cam, y=-1.42, extent=3.0, step=0.5, col=(0.45, 0.55, 1.0), a=0.22, segments=24):
    """Perspective ground grid that fades with distance — instant sense of space under 3D objects."""
    ctx.save()
    ctx.set_line_width(1.0)
    n = int(extent / step)
    ts = np.linspace(-extent, extent, segments)
    for k in range(-n, n + 1):
        g = k * step
        for axis in (0, 1):
            P = (np.stack([np.full(segments, g), np.full(segments, y), ts], 1) if axis == 0
                 else np.stack([ts, np.full(segments, y), np.full(segments, g)], 1))
            sx, sy, zc, z = cam.project(P)
            for j in range(segments - 1):
                if zc[j] < 0.3 or zc[j + 1] < 0.3:
                    continue
                rr = math.hypot(float(P[j, 0]), float(P[j, 2]))
                al = a * max(0.0, 1 - rr / (extent * 1.07)) * max(0.0, min(1.0, 1.6 - float(z[j]) * 0.3))
                if al <= 0.005:
                    continue
                ctx.move_to(float(sx[j]), float(sy[j]))
                ctx.line_to(float(sx[j + 1]), float(sy[j + 1]))
                ctx.set_source_rgba(col[0], col[1], col[2], al)
                ctx.stroke()
    ctx.restore()
