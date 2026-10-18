"""Cairo drawing helpers: shapes, morphs, ribbons, draw-on paths, patterns, camera, blending.

All coordinates are pixels in the film's frame. Functions append to the current
path unless they say they fill/stroke. Colours are RGB tuples in 0..1.
"""
import contextlib
import math

import cairo
import numpy as np

from .ease import TAU, PI, clamp, lerp

OP = {
    "over": cairo.OPERATOR_OVER, "add": cairo.OPERATOR_ADD, "multiply": cairo.OPERATOR_MULTIPLY,
    "screen": cairo.OPERATOR_SCREEN, "overlay": cairo.OPERATOR_OVERLAY, "difference": cairo.OPERATOR_DIFFERENCE,
    "darken": cairo.OPERATOR_DARKEN, "lighten": cairo.OPERATOR_LIGHTEN, "source": cairo.OPERATOR_SOURCE,
    "soft-light": cairo.OPERATOR_SOFT_LIGHT, "color-dodge": cairo.OPERATOR_COLOR_DODGE,
}


# ----------------------------------------------------------------------------- surfaces
def new_surface(w, h, alpha=False):
    return cairo.ImageSurface(cairo.FORMAT_ARGB32, int(w), int(h))


def new_ctx(surf):
    ctx = cairo.Context(surf)
    ctx.set_antialias(cairo.ANTIALIAS_GOOD)
    return ctx


def surface_to_array(surf):
    """HxWx3 float32 RGB 0..1 (opaque surfaces)."""
    buf = surf.get_data()
    a = np.ndarray((surf.get_height(), surf.get_width(), 4), np.uint8, buf)
    return a[:, :, [2, 1, 0]].astype(np.float32) * (1.0 / 255.0)


def surface_rgba(surf):
    """HxWx4 float32 premultiplied RGBA 0..1."""
    buf = surf.get_data()
    a = np.ndarray((surf.get_height(), surf.get_width(), 4), np.uint8, buf)
    return a[:, :, [2, 1, 0, 3]].astype(np.float32) * (1.0 / 255.0)


def surface_alpha(surf):
    buf = surf.get_data()
    a = np.ndarray((surf.get_height(), surf.get_width(), 4), np.uint8, buf)
    return a[:, :, 3].astype(np.float32) * (1.0 / 255.0)


def array_to_surface(rgb):
    """HxWx3 float/uint8 → opaque cairo ImageSurface (for compositing numpy layers back into cairo)."""
    if rgb.dtype != np.uint8:
        rgb = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    h, w = rgb.shape[:2]
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    a = np.ndarray((h, w, 4), np.uint8, surf.get_data())
    a[:, :, 0] = rgb[:, :, 2]
    a[:, :, 1] = rgb[:, :, 1]
    a[:, :, 2] = rgb[:, :, 0]
    a[:, :, 3] = 255
    surf.mark_dirty()
    return surf


# ----------------------------------------------------------------------------- paint state
def rgba(ctx, col, a=1.0):
    ctx.set_source_rgba(col[0], col[1], col[2], a)


def fill_bg(ctx, col):
    """Fill the entire surface regardless of the current transform (camera/shake safe)."""
    ctx.save()
    ctx.identity_matrix()
    ctx.reset_clip()
    ctx.set_operator(cairo.OPERATOR_SOURCE)
    rgba(ctx, col)
    ctx.paint()
    ctx.restore()


@contextlib.contextmanager
def blend(ctx, mode):
    ctx.save()
    ctx.set_operator(OP[mode])
    try:
        yield
    finally:
        ctx.restore()


@contextlib.contextmanager
def camera(ctx, cx, cy, scale=1.0, rot=0.0, dx=0.0, dy=0.0):
    """World transform about a pivot: zoom `scale` and rotate around (cx, cy), then pan (dx, dy)."""
    ctx.save()
    ctx.translate(cx + dx, cy + dy)
    if rot:
        ctx.rotate(rot)
    if scale != 1.0:
        ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)
    try:
        yield
    finally:
        ctx.restore()


@contextlib.contextmanager
def alpha_group(ctx, a):
    """Draw a group with one opacity (avoids overlapping-alpha artifacts)."""
    ctx.push_group()
    try:
        yield
    finally:
        ctx.pop_group_to_source()
        ctx.paint_with_alpha(clamp(a))


def group(ctx, fn, *args):
    """Render fn(ctx, *args) into a pattern (for transitions that need live copies of a scene)."""
    ctx.push_group()
    fn(ctx, *args)
    return ctx.pop_group()


# ----------------------------------------------------------------------------- primitives
def circle(ctx, x, y, r):
    ctx.new_sub_path()
    ctx.arc(x, y, max(r, 0.0), 0, TAU)


def ellipse(ctx, x, y, rx, ry, rot=0.0):
    ctx.save()
    ctx.translate(x, y)
    if rot:
        ctx.rotate(rot)
    ctx.scale(max(rx, 1e-4), max(ry, 1e-4))
    ctx.new_sub_path()
    ctx.arc(0, 0, 1, 0, TAU)
    ctx.restore()


def rrect(ctx, x, y, w, h, r):
    r = max(0.0, min(r, w / 2, h / 2))
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -PI / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, PI / 2)
    ctx.arc(x + r, y + h - r, r, PI / 2, PI)
    ctx.arc(x + r, y + r, r, PI, 1.5 * PI)
    ctx.close_path()


def rect_c(ctx, cx, cy, w, h, rot=0.0):
    """Centred rectangle with rotation."""
    ctx.save()
    ctx.translate(cx, cy)
    if rot:
        ctx.rotate(rot)
    ctx.rectangle(-w / 2, -h / 2, w, h)
    ctx.restore()


def poly(ctx, pts, close=True):
    it = iter(pts)
    x, y = next(it)
    ctx.move_to(float(x), float(y))
    for x, y in it:
        ctx.line_to(float(x), float(y))
    if close:
        ctx.close_path()


def path_from_array(ctx, pts, close=True):
    poly(ctx, pts, close)


def regular_polygon(cx, cy, r, n, rot=-PI / 2):
    a = np.arange(n) / n * TAU + rot
    return np.stack([cx + np.cos(a) * r, cy + np.sin(a) * r], 1)


def star(cx, cy, r_out, r_in, n=5, rot=-PI / 2):
    a = np.arange(2 * n) / (2 * n) * TAU + rot
    r = np.where(np.arange(2 * n) % 2 == 0, r_out, r_in)
    return np.stack([cx + np.cos(a) * r, cy + np.sin(a) * r], 1)


# ----------------------------------------------------------------------------- polar morphs
def shape_radius(kind, th, p=None):
    """Boundary radius at polar angle th for a centred unit shape.
    kind: circle | square (half side 1) | tri (circumradius 1, apex up) | squircle (p=4..20)
          | ngon (p=n sides, circumradius 1) | star (p=(n, inner_ratio))"""
    th = np.asarray(th, float)
    if kind == "circle":
        return np.ones_like(th)
    if kind == "square":
        return 1.0 / np.maximum(np.abs(np.cos(th)), np.abs(np.sin(th)))
    if kind == "squircle":
        q = p or 6.0
        return (np.abs(np.cos(th)) ** q + np.abs(np.sin(th)) ** q) ** (-1 / q)
    if kind == "tri":
        a = np.mod(th + PI / 2, TAU / 3) - PI / 3
        return 0.5 / np.cos(a)
    if kind == "ngon":
        n = int(p or 6)
        a = np.mod(th + PI / 2, TAU / n) - PI / n
        return math.cos(PI / n) / np.cos(a)
    if kind == "star":
        n, k = p or (5, 0.5)
        a = np.mod(th + PI / 2, TAU / n) / (TAU / n)
        tri = np.abs(a * 2 - 1)
        return k + (1 - k) * tri
    raise ValueError(kind)


def morph_pts(kind_a, kind_b, u, size_a, size_b=None, rot=0.0, n=360, pa=None, pb=None, cx=0.0, cy=0.0):
    """Polar morph between two star-shaped outlines (circle↔square↔triangle…). Returns Nx2 array."""
    th = np.linspace(0, TAU, n + 1)[:-1]
    size_b = size_a if size_b is None else size_b
    ra = shape_radius(kind_a, th, pa) * size_a
    rb = shape_radius(kind_b, th, pb) * size_b
    r = ra + (rb - ra) * u
    return np.stack([cx + np.cos(th + rot) * r, cy + np.sin(th + rot) * r], 1)


def resample(pts, n, closed=True):
    """Resample a polyline to n points evenly spaced by arc length (for morphing arbitrary outlines)."""
    p = np.asarray(pts, float)
    if closed:
        p = np.vstack([p, p[:1]])
    seg = np.sqrt(((p[1:] - p[:-1]) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(seg)])
    tgt = np.linspace(0, s[-1], n + (0 if closed else 1))[: n]
    x = np.interp(tgt, s, p[:, 0])
    y = np.interp(tgt, s, p[:, 1])
    return np.stack([x, y], 1)


# ----------------------------------------------------------------------------- lines that grow
def polyline_length(pts):
    p = np.asarray(pts, float)
    return float(np.sqrt(((p[1:] - p[:-1]) ** 2).sum(1)).sum())


def partial_polyline(ctx, pts, u, start=0.0):
    """Append the [start..u] portion (by arc length) of a polyline — draw-on lines, routes, signatures."""
    p = np.asarray(pts, float)
    seg = np.sqrt(((p[1:] - p[:-1]) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    a, b = clamp(start) * L, clamp(u) * L
    if b <= a:
        return
    first = True
    for i in range(len(p) - 1):
        s0, s1 = s[i], s[i + 1]
        if s1 < a or s0 > b:
            continue
        t0 = 0.0 if s0 >= a else (a - s0) / max(seg[i], 1e-9)
        t1 = 1.0 if s1 <= b else (b - s0) / max(seg[i], 1e-9)
        x0, y0 = p[i] + (p[i + 1] - p[i]) * t0
        x1, y1 = p[i] + (p[i + 1] - p[i]) * t1
        if first:
            ctx.move_to(x0, y0)
            first = False
        ctx.line_to(x1, y1)


def point_on_polyline(pts, u):
    p = np.asarray(pts, float)
    seg = np.sqrt(((p[1:] - p[:-1]) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(seg)])
    d = clamp(u) * s[-1]
    i = int(np.clip(np.searchsorted(s, d) - 1, 0, len(seg) - 1))
    f = (d - s[i]) / max(seg[i], 1e-9)
    xy = p[i] + (p[i + 1] - p[i]) * f
    ang = math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0])
    return float(xy[0]), float(xy[1]), ang


def arc_draw(ctx, cx, cy, r, u, start=-PI / 2, direction=1):
    """Circle that draws on from `start` (u: 0..1)."""
    if u <= 0:
        return
    ctx.new_sub_path()
    if direction > 0:
        ctx.arc(cx, cy, r, start, start + TAU * clamp(u))
    else:
        ctx.arc_negative(cx, cy, r, start, start - TAU * clamp(u))


def ribbon(ctx, xs, ys, th):
    """Filled stroke with per-sample thickness (xs, ys, th arrays). Mostly-horizontal ribbons/waves."""
    top = np.stack([xs, ys - th / 2], 1)
    bot = np.stack([xs[::-1], (ys + th / 2)[::-1]], 1)
    poly(ctx, np.concatenate([top, bot]))


def ribbon_path(ctx, pts, widths):
    """Filled stroke along an arbitrary polyline with per-point width (normal offsets)."""
    p = np.asarray(pts, float)
    w = np.broadcast_to(np.asarray(widths, float), (len(p),))
    d = np.gradient(p, axis=0)
    n = np.stack([-d[:, 1], d[:, 0]], 1)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    left = p + n * (w / 2)[:, None]
    right = p - n * (w / 2)[:, None]
    poly(ctx, np.concatenate([left, right[::-1]]))


def capsule(ctx, x0, y0, x1, y1, w):
    """Rounded line segment as a fillable shape (stretching dots, speed streaks)."""
    ang = math.atan2(y1 - y0, x1 - x0)
    L = math.hypot(x1 - x0, y1 - y0)
    ctx.save()
    ctx.translate(x0, y0)
    ctx.rotate(ang)
    r = w / 2
    ctx.new_sub_path()
    ctx.arc(L, 0, r, -PI / 2, PI / 2)
    ctx.arc(0, 0, r, PI / 2, 1.5 * PI)
    ctx.close_path()
    ctx.restore()


# ----------------------------------------------------------------------------- gradients
def linear_gradient(x0, y0, x1, y1, stops):
    """stops: [(offset, rgb, alpha), ...]"""
    g = cairo.LinearGradient(x0, y0, x1, y1)
    for off, c, a in stops:
        g.add_color_stop_rgba(off, c[0], c[1], c[2], a)
    return g


def radial_gradient(cx, cy, r0, r1, stops, fx=None, fy=None):
    g = cairo.RadialGradient(fx if fx is not None else cx, fy if fy is not None else cy, r0, cx, cy, r1)
    for off, c, a in stops:
        g.add_color_stop_rgba(off, c[0], c[1], c[2], a)
    return g


def glow_disc(ctx, x, y, r, col, a=0.5):
    """Soft radial light (bokeh / light source). Use with blend 'add' or 'screen' on dark grounds."""
    ctx.set_source(radial_gradient(x, y, 0, r, [(0, col, a), (0.4, col, a * 0.35), (1, col, 0)]))
    circle(ctx, x, y, r)
    ctx.fill()


def beam(ctx, x0, y0, ang, length, w0, w1, col, a=0.35):
    """Tapered light beam from (x0,y0) toward angle `ang` (radians)."""
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    x1, y1 = x0 + dx * length, y0 + dy * length
    pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
           (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    ctx.set_source(linear_gradient(x0, y0, x1, y1, [(0, col, a), (1, col, 0)]))
    poly(ctx, pts)
    ctx.fill()


# ----------------------------------------------------------------------------- patterns (print/op-art)
def halftone(ctx, x, y, w, h, step, radius_fn, rot=0.0):
    """Dot screen inside a box. radius_fn(u, v) → px radius with u,v in 0..1 across the box."""
    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(rot)
    R = math.hypot(w, h) / 2
    n = int(R / step) + 1
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            px = i * step + (step / 2 if j % 2 else 0)
            py = j * step
            u, v = (px + w / 2) / w, (py + h / 2) / h
            if not (-0.05 <= u <= 1.05 and -0.05 <= v <= 1.05):
                continue
            r = radius_fn(u, v)
            if r > 0.3:
                circle(ctx, px, py, r)
    ctx.restore()


def stripes(ctx, cx, cy, angle, period, width, offset=0.0, extent=3000):
    """Parallel bars (fill afterwards). angle in radians; offset scrolls them."""
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    off = offset % period
    n = int(extent / period) + 2
    for k in range(-n, n + 1):
        ctx.rectangle(k * period + off, -extent, width, 2 * extent)
    ctx.restore()


def rings(ctx, cx, cy, period, phase=0.0, r_max=2400):
    """Concentric circles path for op-art fields (stroke with width ≈ period/2)."""
    r = phase % period
    while r < r_max:
        circle(ctx, cx, cy, r)
        r += period


def grid_lines(ctx, cx, cy, step, half_w, half_h, grow=1.0, major=4):
    """Construction grid from the centre outward; returns (minor_path_drawn) – stroke yourself.
    grow 0..1 extends lines from the centre."""
    nx = int(half_w / step) + 1
    ny = int(half_h / step) + 1
    for k in range(-nx, nx + 1):
        x = cx + k * step + 0.5
        L = half_h * grow
        ctx.move_to(x, cy - L)
        ctx.line_to(x, cy + L)
    for k in range(-ny, ny + 1):
        y = cy + k * step + 0.5
        L = half_w * grow
        ctx.move_to(cx - L, y)
        ctx.line_to(cx + L, y)
