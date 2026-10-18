"""演示 / Presentation kit — product demos, launches, data reports.

Communication first: every page has ONE claim, the visual proves it, motion reveals it in reading
order, and the next page grows out of something on this one (references/craft/genre-presentation.md).

Building blocks
  Layout(w, h)                      12-column grid, safe area, type scale (rem relative to height)
  title_block(...)                  kicker + masked title + subtitle, staggered
  bullet_list(...)                  numbered points that enter in reading order
  BarChart / LineChart / Donut      stable axes, staggered growth, value morphs between datasets,
                                    highlight one series in the accent colour, tabular counters
  counter / odometer / delta_badge  numbers that count and roll without jitter
  UIShot                            real product screenshots with a camera that eases between
                                    focus rectangles, device chrome, shadow
  spotlight / focus_ring / cursor / click_ripple   direct the eye inside UI
  morph_rect / carry                one element travels from page A's layout into page B's
  source_note                       data provenance on screen (never omit for real numbers)
"""
import math
import os

import cairo
import numpy as np

from .annotate import bracket, label
from .color import mix
from .draw import circle, partial_polyline, poly, rgba, rrect
from .ease import (SNAP, clamp, io_cubic, lerp, out_back, out_cubic, out_expo, prog, smooth, spring)
from .text import Run, draw_paragraph, face, face_for, wrap


# ----------------------------------------------------------------------------- layout
class Layout:
    def __init__(self, w, h, margin=0.07, gutter=0.0125, cols=12, safe=0.05):
        self.w, self.h = w, h
        self.m = w * margin
        self.g = w * gutter
        self.cols = cols
        self.safe = (w * safe, h * safe, w * (1 - safe), h * (1 - safe))
        self.cw = (w - 2 * self.m - (cols - 1) * self.g) / cols

    def col(self, i, span=1):
        """x, width of a column span (0-based)."""
        return self.m + i * (self.cw + self.g), span * self.cw + (span - 1) * self.g

    def rem(self, k):
        """Type/spacing unit relative to frame height (1 rem = 1/36 of height ≈ 30 px at 1080p)."""
        return self.h / 36.0 * k

    @property
    def size(self):
        r = self.rem
        return dict(display=r(4.2), h1=r(2.6), h2=r(1.7), body=r(1.0), caption=r(0.78), label=r(0.55))

    def in_safe(self, x0, y0, x1, y1):
        s = self.safe
        return x0 >= s[0] and y0 >= s[1] and x1 <= s[2] and y1 <= s[3]


def load_image(path, _cache={}):
    """Any PIL-readable image → cairo ImageSurface (cached)."""
    if path in _cache:
        return _cache[path]
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float32) / 255.0
    a = arr[..., 3:4]
    pm = (arr[..., :3] * a * 255 + 0.5).astype(np.uint8)
    h, w = pm.shape[:2]
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    buf = np.ndarray((h, w, 4), np.uint8, surf.get_data())
    buf[..., 0], buf[..., 1], buf[..., 2] = pm[..., 2], pm[..., 1], pm[..., 0]
    buf[..., 3] = (a[..., 0] * 255 + 0.5).astype(np.uint8)
    surf.mark_dirty()
    _cache[path] = surf
    return surf


# ----------------------------------------------------------------------------- titles & lists
def title_block(ctx, t, t_in, x, y, w, title, kicker=None, sub=None, col=(0.08, 0.1, 0.1), accent=(0.85, 0.3, 0.25),
                mute=(0.4, 0.45, 0.43), size=78, role="display", wght=760, sub_size=None, leading=1.08):
    """Kicker label (accent bar + caps) → title lines rise through masks → subtitle fades up.
    Returns the y below the block. Text wraps to w."""
    yy = y
    if kicker:
        u = out_expo(prog(t, t_in, t_in + 0.35))
        rgba(ctx, accent, u)
        ctx.rectangle(x, yy - size * 0.36, 34 * u, 4)
        ctx.fill()
        label(ctx, kicker.upper(), x + 46, yy - size * 0.28, accent, u, max(12, size * 0.19), 700, tracking=0.16)
        yy += size * 0.55
    fc = face_for(title, role)
    lines = wrap(fc, title, size, w, {"wght": wght})
    for i, ln in enumerate(lines):
        base = yy + size * (0.86 + i * leading)
        u = SNAP(prog(t, t_in + 0.08 + 0.07 * i, t_in + 0.75 + 0.07 * i))
        run = Run(fc, ln, size, {"wght": wght}, -0.01)
        ctx.save()
        ctx.rectangle(x - 10, base - size * 0.98, w + 40, size * 1.24)
        ctx.clip()
        ctx.new_path()
        run.path(ctx, x, base + (1 - u) * size * 1.1)
        rgba(ctx, col)
        ctx.fill()
        ctx.restore()
    yy += size * (0.86 + (len(lines) - 1) * leading) + size * 0.4
    if sub:
        ss = sub_size or size * 0.36
        u = out_cubic(prog(t, t_in + 0.35, t_in + 0.9))
        lines2, hgt = draw_paragraph(ctx, role, sub, x, yy + ss + (1 - u) * 14, ss, w, mute, u, 1.4, {"wght": 420})
        yy += hgt + ss * 0.6
    return yy


def bullet_list(ctx, t, t_in, x, y, w, items, col, accent, size=30, gap=1.9, each=0.22, role="display",
                numbered=True, active=None):
    """Points enter in reading order; `active` index dims the others to direct attention."""
    for i, it in enumerate(items):
        u = out_expo(prog(t, t_in + each * i, t_in + each * i + 0.55))
        if u <= 0:
            continue
        yy = y + i * size * gap
        dim = 1.0 if active is None or active == i else 0.38
        rgba(ctx, accent, u * dim)
        ctx.rectangle(x, yy - size * 0.75, 5, size * 0.95 * u)
        ctx.fill()
        tx = x + 22
        if numbered:
            label(ctx, "%02d" % (i + 1), tx, yy, accent, u * dim, size * 0.62, 800, role="mono", tracking=0.04)
            tx += size * 1.7
        draw_paragraph(ctx, role, it, tx + (1 - u) * 26, yy, size, w - (tx - x), col, u * dim, 1.3, {"wght": 520})


# ----------------------------------------------------------------------------- numbers
def fmt(v, decimals=0, unit="", prefix="", thousands=True):
    s = ("{:,.%df}" % decimals).format(v) if thousands else ("{:.%df}" % decimals).format(v)
    return prefix + s + unit


def counter(ctx, t, t_in, value, x, y, size, col, dur=1.0, decimals=0, unit="", prefix="", role="mono", wght=700,
            start=0.0, align="left", a=1.0):
    """Counts from `start` to value with out_expo; tabular mono digits so the width doesn't jitter."""
    u = out_expo(prog(t, t_in, t_in + dur))
    s = fmt(lerp(start, value, u), decimals, unit, prefix)
    run = Run(face(role), s, size, {"wght": wght}, -0.02)
    xx = x - run.advance if align == "right" else x - run.advance / 2 if align == "center" else x
    ctx.new_path()
    run.path(ctx, xx, y)
    rgba(ctx, col, a * min(1.0, u * 4))
    ctx.fill()
    return run


def odometer(ctx, t, t_in, value, x, y, size, col, dur=1.2, decimals=0, role="mono", wght=760, stagger=0.06):
    """Each digit column rolls to its final digit (right-most settles last). Clipped per digit."""
    s = fmt(value, decimals, thousands=True)
    fc = face(role)
    adv = Run(fc, "0", size, {"wght": wght}).advance
    xx = x
    n = len(s)
    for i, ch in enumerate(s):
        if not ch.isdigit():
            r = Run(fc, ch, size, {"wght": wght})
            ctx.new_path()
            r.path(ctx, xx, y)
            rgba(ctx, col, out_cubic(prog(t, t_in, t_in + 0.3)))
            ctx.fill()
            xx += r.advance
            continue
        d = int(ch)
        u = out_expo(prog(t, t_in + stagger * i, t_in + dur + stagger * i))
        pos = (d + 10 * (n - i)) * u      # roll through several turns, more for left digits… settle at d
        ctx.save()
        ctx.rectangle(xx - 2, y - size * 0.95, adv + 4, size * 1.25)
        ctx.clip()
        base = math.floor(pos)
        frac = pos - base
        for k in (0, 1):
            dig = int((base + k) % 10)
            r = Run(fc, str(dig), size, {"wght": wght})
            ctx.new_path()
            r.path(ctx, xx, y + (k - frac) * size * 1.1)
            rgba(ctx, col)
            ctx.fill()
        ctx.restore()
        xx += adv
    return xx - x


def delta_badge(ctx, t, t_in, text, x, y, positive=True, up_col=(0.16, 0.6, 0.42), down_col=(0.85, 0.3, 0.25),
                size=20, fg=(1, 1, 1), arrow="auto"):
    """Pill badge with a vector arrow (no glyph dependency). `positive` = good news (colour);
    arrow: 'up' | 'down' | 'none' | 'auto' (auto: down if text starts with − or -, else up)."""
    u = out_back(prog(t, t_in, t_in + 0.4), 2.0)
    if u <= 0:
        return
    col = up_col if positive else down_col
    if arrow == "auto":
        arrow = "down" if text.strip()[:1] in ("−", "-") else "up"
    run = Run(face("mono"), text, size, {"wght": 700})
    aw = size * 0.75 if arrow != "none" else 0.0
    w, h = run.advance + aw + size * 1.2, size * 1.6
    ctx.save()
    ctx.translate(x + w / 2, y)
    ctx.scale(u, u)
    rrect(ctx, -w / 2, -h / 2, w, h, h / 2)
    rgba(ctx, col)
    ctx.fill()
    x0 = -w / 2 + size * 0.6
    if arrow != "none":
        a = size * 0.32
        cx = x0 + a
        tip = -a if arrow == "up" else a
        poly(ctx, [(cx - a, -tip * 0.8), (cx + a, -tip * 0.8), (cx, tip)])
        rgba(ctx, fg)
        ctx.fill()
    ctx.new_path()
    run.path(ctx, x0 + aw, size * 0.36)
    rgba(ctx, fg)
    ctx.fill()
    ctx.restore()


# ----------------------------------------------------------------------------- charts
def nice_ticks(lo, hi, n=5):
    span = hi - lo
    raw = span / max(1, n)
    mag = 10 ** math.floor(math.log10(raw))
    step = min((s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw), default=raw)
    a = math.floor(lo / step) * step
    b = math.ceil(hi / step) * step
    return [a + k * step for k in range(int(round((b - a) / step)) + 1)]


class BarChart:
    """Vertical bar chart whose AXIS NEVER CHANGES between states (so comparisons stay honest).

        ch = BarChart((x, y, w, h), ["Q1","Q2","Q3","Q4"], vmax=100, unit="%")
        ch.draw(ctx, t, t_in, [20, 42, 58, 83], highlight=3)
        ch.draw(ctx, t, t_in, new, prev=old, t_change=T)      # bars morph old→new, counters follow
    """

    def __init__(self, rect, labels, vmin=0.0, vmax=None, ticks=None, unit="", decimals=0, ground=(0.95, 0.96, 0.94),
                 ink=(0.1, 0.13, 0.13), bar=(0.27, 0.48, 0.44), accent=(0.85, 0.3, 0.25), mute=(0.48, 0.53, 0.5),
                 bar_ratio=0.58, value_size=None, label_size=None, grid=True):
        self.x, self.y, self.w, self.h = rect
        self.labels = labels
        self.vmin = vmin
        self.ticks = ticks or nice_ticks(vmin, vmax if vmax is not None else 100, 4)
        self.vmax = vmax if vmax is not None else self.ticks[-1]
        self.unit, self.decimals = unit, decimals
        self.ink, self.bar, self.accent, self.mute = ink, bar, accent, mute
        self.ratio = bar_ratio
        self.vs = value_size or max(16, self.h * 0.075)
        self.ls = label_size or max(13, self.h * 0.05)
        self.grid = grid

    def _y(self, v):
        return self.y + self.h - (v - self.vmin) / (self.vmax - self.vmin) * self.h

    def slot(self, i):
        n = len(self.labels)
        sw = self.w / n
        bw = sw * self.ratio
        return self.x + i * sw + (sw - bw) / 2, bw

    def draw(self, ctx, t, t_in, values, prev=None, t_change=None, highlight=None, stagger=0.09, dur=0.8,
             show_values=True):
        g = out_expo(prog(t, t_in, t_in + 0.6))
        if self.grid and g > 0:
            ctx.set_line_width(1.0)
            for k, tv in enumerate(self.ticks):
                yy = self._y(tv) + 0.5
                rgba(ctx, self.mute, (0.5 if tv == self.vmin else 0.18) * g)
                ctx.move_to(self.x, yy)
                ctx.line_to(self.x + self.w * g, yy)
                ctx.stroke()
                label(ctx, fmt(tv, 0, self.unit), self.x - 12, yy + self.ls * 0.35, self.mute, 0.8 * g, self.ls * 0.8,
                      500, "right")
        m = io_cubic(prog(t, t_change, t_change + 0.7)) if (prev is not None and t_change is not None) else 1.0
        for i, v in enumerate(values):
            u = spring(t - (t_in + 0.15 + stagger * i), 2.4, 0.55) if t_in is not None else 1.0
            if u <= 0:
                continue
            v0 = prev[i] if prev is not None else v
            vv = lerp(v0, v, m) if prev is not None else v
            x, bw = self.slot(i)
            top = self._y(self.vmin + (vv - self.vmin) * u)
            base = self._y(self.vmin)
            col = self.accent if highlight == i else self.bar
            rgba(ctx, col)
            rrect(ctx, x, top, bw, max(0.0, base - top), min(6, bw * 0.08))
            ctx.fill()
            ctx.rectangle(x, max(top, base - 6), bw, min(6, base - top))
            ctx.fill()
            if show_values:
                a = clamp((u - 0.2) * 2)
                label(ctx, fmt(vv * min(1.0, u), self.decimals, self.unit), x + bw / 2, top - self.vs * 0.45,
                      self.accent if highlight == i else self.ink, a, self.vs, 760, "center")
            la = out_cubic(prog(t, t_in + 0.1 + stagger * i, t_in + 0.6 + stagger * i))
            label(ctx, self.labels[i], x + bw / 2, base + self.ls * 1.6, self.mute, la, self.ls, 560, "center",
                  role="display", tracking=0.02)

    def bar_rect(self, i, v):
        x, bw = self.slot(i)
        top = self._y(v)
        return x, top, x + bw, self._y(self.vmin)


class LineChart:
    """Line that draws on in time order; markers pop as the line reaches them; head label rides the tip."""

    def __init__(self, rect, labels, vmin=0.0, vmax=100.0, unit="", decimals=0, ink=(0.1, 0.13, 0.13),
                 line=(0.85, 0.3, 0.25), mute=(0.48, 0.53, 0.5), width=4.0, area=True):
        self.x, self.y, self.w, self.h = rect
        self.labels, self.vmin, self.vmax = labels, vmin, vmax
        self.ticks = nice_ticks(vmin, vmax, 4)
        self.vmax = self.ticks[-1]
        self.unit, self.decimals = unit, decimals
        self.ink, self.line, self.mute, self.width, self.area = ink, line, mute, width, area
        self.ls = max(13, self.h * 0.05)

    def pts(self, values):
        n = len(values)
        xs = [self.x + self.w * i / max(1, n - 1) for i in range(n)]
        ys = [self.y + self.h - (v - self.vmin) / (self.vmax - self.vmin) * self.h for v in values]
        return np.stack([xs, ys], 1)

    def draw(self, ctx, t, t_in, values, dur=1.4, col=None, ghost=None, head_label=True):
        col = col or self.line
        g = out_expo(prog(t, t_in, t_in + 0.5))
        ctx.set_line_width(1.0)
        for tv in self.ticks:
            yy = self.y + self.h - (tv - self.vmin) / (self.vmax - self.vmin) * self.h + 0.5
            rgba(ctx, self.mute, 0.18 * g)
            ctx.move_to(self.x, yy)
            ctx.line_to(self.x + self.w * g, yy)
            ctx.stroke()
            label(ctx, fmt(tv, 0, self.unit), self.x - 12, yy + self.ls * 0.35, self.mute, 0.8 * g, self.ls * 0.8, 500, "right")
        P = self.pts(values)
        for i, lb in enumerate(self.labels):
            label(ctx, lb, P[i, 0], self.y + self.h + self.ls * 1.7, self.mute, g, self.ls, 520, "center", role="display")
        if ghost is not None:
            G = self.pts(ghost)
            ctx.set_line_width(2)
            rgba(ctx, self.mute, 0.5 * g)
            ctx.set_dash([6, 6])
            poly(ctx, G, close=False)
            ctx.stroke()
            ctx.set_dash([])
        u = io_cubic(prog(t, t_in + 0.25, t_in + 0.25 + dur))
        if u <= 0:
            return
        dense = np.concatenate([np.linspace(P[i], P[i + 1], 24, endpoint=False) for i in range(len(P) - 1)] + [P[-1:]])
        k = max(2, int(len(dense) * u))
        head = dense[k - 1]
        if self.area:
            A = np.vstack([dense[:k], [[head[0], self.y + self.h], [P[0, 0], self.y + self.h]]])
            gr = cairo.LinearGradient(0, self.y, 0, self.y + self.h)
            gr.add_color_stop_rgba(0, col[0], col[1], col[2], 0.22)
            gr.add_color_stop_rgba(1, col[0], col[1], col[2], 0.0)
            ctx.set_source(gr)
            poly(ctx, A)
            ctx.fill()
        ctx.set_line_width(self.width)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        rgba(ctx, col)
        poly(ctx, dense[:k], close=False)
        ctx.stroke()
        for i in range(len(P)):
            reach = i / max(1, len(P) - 1)
            if u >= reach - 1e-6:
                pu = out_back(clamp((u - reach) * 8), 2.2)
                rgba(ctx, (1, 1, 1))
                circle(ctx, P[i, 0], P[i, 1], (self.width * 1.6) * pu)
                ctx.fill()
                rgba(ctx, col)
                ctx.set_line_width(self.width * 0.8)
                circle(ctx, P[i, 0], P[i, 1], (self.width * 1.6) * pu)
                ctx.stroke()
        if head_label:
            f = (len(values) - 1) * u
            i0 = int(min(f, len(values) - 2))
            v = lerp(values[i0], values[i0 + 1], f - i0)
            label(ctx, fmt(v, self.decimals, self.unit), head[0] + 14, head[1] - 14, col, 1.0, self.ls * 1.25, 760)


class Donut:
    def __init__(self, center, r, width, colors, track=(0.88, 0.9, 0.87)):
        self.cx, self.cy = center
        self.r, self.wd, self.colors, self.track = r, width, colors, track

    def draw(self, ctx, t, t_in, parts, dur=1.0, gap=0.012, start=-math.pi / 2):
        tot = float(sum(parts))
        ctx.set_line_width(self.wd)
        ctx.set_line_cap(cairo.LINE_CAP_BUTT)
        g = out_expo(prog(t, t_in, t_in + 0.4))
        rgba(ctx, self.track, g)
        ctx.new_sub_path()
        ctx.arc(self.cx, self.cy, self.r, 0, math.tau)
        ctx.stroke()
        a = start
        for i, p in enumerate(parts):
            u = out_expo(prog(t, t_in + 0.15 + 0.12 * i, t_in + 0.15 + 0.12 * i + dur))
            span = p / tot * math.tau
            if u > 0:
                rgba(ctx, self.colors[i % len(self.colors)])
                ctx.new_sub_path()
                ctx.arc(self.cx, self.cy, self.r, a + gap, a + gap + max(0.0, (span - 2 * gap) * u))
                ctx.stroke()
            a += span


# ----------------------------------------------------------------------------- directing attention
def spotlight(ctx, rect, amount, w, h, dim=(0.04, 0.05, 0.06), dim_a=0.62, radius=16, pad=10):
    """Dim everything except rect (x0,y0,x1,y1). amount 0..1."""
    if amount <= 0:
        return
    x0, y0, x1, y1 = rect
    ctx.save()
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.rectangle(-50, -50, w + 100, h + 100)
    rrect(ctx, x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, radius)
    rgba(ctx, dim, dim_a * amount)
    ctx.fill()
    ctx.restore()


def focus_ring(ctx, rect, u, col, pad=10, radius=14, width=3.0):
    """Rounded ring that draws on around a UI element, then a soft outer pulse."""
    if u <= 0:
        return
    x0, y0, x1, y1 = rect
    ctx.save()
    ctx.set_line_width(width)
    rgba(ctx, col)
    rrect(ctx, x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, radius)
    path = ctx.copy_path_flat()
    ctx.new_path()
    pts = [(p[1][0], p[1][1]) for p in path if p[0] in (0, 1)]
    if len(pts) > 2:
        partial_polyline(ctx, pts + [pts[0]], out_expo(u))
        ctx.stroke()
    if u > 0.6:
        k = prog(u, 0.6, 1.0)
        rgba(ctx, col, 0.35 * (1 - k))
        ctx.set_line_width(width + 10 * k)
        rrect(ctx, x0 - pad - 8 * k, y0 - pad - 8 * k, x1 - x0 + 2 * (pad + 8 * k), y1 - y0 + 2 * (pad + 8 * k), radius + 8 * k)
        ctx.stroke()
    ctx.restore()


def cursor(ctx, x, y, scale=1.0, fill=(1, 1, 1), edge=(0.05, 0.05, 0.06), pressed=0.0):
    """Vector arrow pointer with its hotspot at (x, y)."""
    s = scale * (1 - 0.12 * pressed)
    pts = [(0, 0), (0, 25), (6.5, 19.5), (11, 29), (15, 27), (10.6, 18), (18, 18)]
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    poly(ctx, [(px + 1.5, py + 2) for px, py in pts])
    ctx.set_source_rgba(0, 0, 0, 0.25)
    ctx.fill()
    poly(ctx, pts)
    rgba(ctx, fill)
    ctx.fill_preserve()
    ctx.set_line_width(1.6)
    rgba(ctx, edge)
    ctx.stroke()
    ctx.restore()


def cursor_path(t, keys):
    """keys = [(t, x, y), ...] → eased (x, y). Moves decelerate into targets like a real hand (SNAP)."""
    if t <= keys[0][0]:
        return keys[0][1], keys[0][2]
    for k in range(1, len(keys)):
        if t <= keys[k][0]:
            t0, x0, y0 = keys[k - 1]
            t1, x1, y1 = keys[k]
            u = SNAP(prog(t, t0, t1))
            # slight arc so paths aren't robotic straight lines
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2 - 0.12 * math.hypot(x1 - x0, y1 - y0)
            a = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * mx + u * u * x1
            b = (1 - u) ** 2 * y0 + 2 * (1 - u) * u * my + u * u * y1
            return a, b
    return keys[-1][1], keys[-1][2]


def click_ripple(ctx, x, y, t, t_click, col=(1, 1, 1), r=34):
    tau = t - t_click
    if not 0 <= tau < 0.45:
        return 0.0
    u = out_cubic(tau / 0.45)
    ctx.set_line_width(2.5 * (1 - u) + 0.5)
    rgba(ctx, col, 0.8 * (1 - u))
    circle(ctx, x, y, r * u)
    ctx.stroke()
    return max(0.0, 1 - tau / 0.12)      # 'pressed' amount for cursor()


# ----------------------------------------------------------------------------- product UI shots
def morph_rect(a, b, u):
    return tuple(lerp(p, q, u) for p, q in zip(a, b))


class UIShot:
    """A real screenshot (or a draw function) viewed through an easing camera.

        shot = UIShot("assets/ui/dashboard.png")             # pixel size from the file
        focus = shot.focus_at(t, [(T0, shot.full), (T1, (820, 140, 1260, 420))])
        shot.draw(ctx, frame=(160, 120, 1760, 960), focus=focus, chrome="browser", title="app.example.com")

    focus is a rect in SCREENSHOT pixels; the camera scales/pans so it fills the frame (keeping aspect).
    """

    def __init__(self, src, size=None):
        self.src = src
        if callable(src):
            self.w, self.h = size
            self.img = None
        else:
            self.img = load_image(src)
            self.w, self.h = self.img.get_width(), self.img.get_height()
        self.full = (0, 0, self.w, self.h)

    def focus_at(self, t, keys, ease=io_cubic):
        if t <= keys[0][0]:
            return keys[0][1]
        for k in range(1, len(keys)):
            if t <= keys[k][0]:
                return morph_rect(keys[k - 1][1], keys[k][1], ease(prog(t, keys[k - 1][0], keys[k][0])))
        return keys[-1][1]

    def transform(self, frame, focus):
        fx0, fy0, fx1, fy1 = frame
        x0, y0, x1, y1 = focus
        s = min((fx1 - fx0) / (x1 - x0), (fy1 - fy0) / (y1 - y0))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        return s, (fx0 + fx1) / 2 - cx * s, (fy0 + fy1) / 2 - cy * s

    def to_frame(self, frame, focus, x, y):
        s, tx, ty = self.transform(frame, focus)
        return x * s + tx, y * s + ty

    def rect_to_frame(self, frame, focus, r):
        a = self.to_frame(frame, focus, r[0], r[1])
        b = self.to_frame(frame, focus, r[2], r[3])
        return a[0], a[1], b[0], b[1]

    def draw(self, ctx, frame, focus=None, t=0.0, radius=18, shadow=True, chrome=None, title="", ui_bg=(1, 1, 1),
             chrome_col=(0.93, 0.94, 0.95)):
        focus = focus or self.full
        fx0, fy0, fx1, fy1 = frame
        bar = 38 if chrome == "browser" else 0
        if shadow:
            for k in range(6):
                ctx.set_source_rgba(0, 0, 0, 0.035)
                rrect(ctx, fx0 - k * 3, fy0 - bar + k * 5, fx1 - fx0 + k * 6, fy1 - fy0 + bar + k * 4, radius + k * 3)
                ctx.fill()
        ctx.save()
        rrect(ctx, fx0, fy0 - bar, fx1 - fx0, fy1 - fy0 + bar, radius)
        ctx.clip()
        rgba(ctx, ui_bg)
        ctx.paint()
        if chrome == "browser":
            rgba(ctx, chrome_col)
            ctx.rectangle(fx0, fy0 - bar, fx1 - fx0, bar)
            ctx.fill()
            for k, c in enumerate(((1, 0.37, 0.34), (1, 0.74, 0.18), (0.16, 0.79, 0.25))):
                rgba(ctx, c)
                circle(ctx, fx0 + 22 + k * 20, fy0 - bar / 2, 6)
                ctx.fill()
            rgba(ctx, (1, 1, 1))
            rrect(ctx, fx0 + 100, fy0 - bar + 8, min(560, (fx1 - fx0) * 0.5), bar - 16, 8)
            ctx.fill()
            if title:
                label(ctx, title, fx0 + 116, fy0 - bar / 2 + 5, (0.35, 0.37, 0.4), 1.0, 13, 500, role="mono", tracking=0.02)
        ctx.rectangle(fx0, fy0, fx1 - fx0, fy1 - fy0)
        ctx.clip()
        s, tx, ty = self.transform(frame, focus)
        ctx.translate(tx, ty)
        ctx.scale(s, s)
        if self.img is not None:
            ctx.set_source_surface(self.img, 0, 0)
            ctx.get_source().set_filter(cairo.FILTER_GOOD)
            ctx.paint()
        else:
            self.src(ctx, t)
        ctx.restore()


def phone_bezel(ctx, x, y, w, h, col=(0.07, 0.07, 0.08), radius=None):
    r = radius or w * 0.14
    rgba(ctx, col)
    rrect(ctx, x - 14, y - 14, w + 28, h + 28, r + 14)
    ctx.fill()
    rgba(ctx, (0, 0, 0))
    rrect(ctx, x + w * 0.36, y + 10, w * 0.28, 26, 13)
    ctx.fill()


def source_note(ctx, text, x, y, col, a=0.75, size=13):
    """Data provenance line. Real numbers ALWAYS carry a source; demo numbers say so."""
    label(ctx, text, x, y, col, a, size, 500, role="mono", tracking=0.03)
