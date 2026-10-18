"""Typography engine: HarfBuzz shaping (kerning) + variable-font axes + glyph outlines → cairo paths.

Why not cairo's toy text API: no kerning control, no variable axes, no per-glyph
transforms. Here every glyph is a path you can move, scale, rotate, mask, fill,
or sample into particles.

    fc = face("display")                                   # role registered in fonts registry
    run = Run(fc, "DECISION.", size=300, var={"wght": 800, "wdth": 92}, tracking=0.02)
    run.path(ctx, x - run.ink0, baseline)                  # ink-left aligned at x
    ctx.fill()

    draw_text(ctx, "mono", "TC 00:00:01:12", 74, 62, 15, col, var={"wght": 600})
    wd, tr = fit_width(fc, "EVERY", size, 1500, wght=800)  # justify by width axis, then tracking
    missing = fc.missing("每一帧，都是一次决定")              # [] or the glyphs this font lacks — CHECK THIS

Units: `size` is the em size in px. Cap height ≈ size × face.cap_ratio.
Coordinates: (x, y) is the pen position on the baseline; y grows downward.
"""
import math
import os

import uharfbuzz as hb

from . import fonts as _fonts


class Face:
    def __init__(self, path, index=0, name=None):
        self.path, self.index, self.name = path, index, name or os.path.basename(path)
        self.blob = hb.Blob.from_file_path(path)
        self.face = hb.Face(self.blob, index)
        self.font = hb.Font(self.face)
        self.upem = self.face.upem
        self._cur = None
        self._shape, self._glyph, self._ext = {}, {}, {}
        self.axes = self._axes()
        self.cap_ratio = self._cap_ratio()

    def _axes(self):
        try:
            return {a.tag: (a.min_value, a.default_value, a.max_value) for a in self.face.axis_infos}
        except Exception:
            return {}

    def _cap_ratio(self):
        gid = self.font.get_nominal_glyph(ord("H"))
        if gid:
            e = self.font.get_glyph_extents(gid)
            if e:
                return e.y_bearing / self.upem
        gid = self.font.get_nominal_glyph(0x4E00)   # 一 (CJK): use ~0.8 em as "cap"
        return 0.8 if gid else 0.7

    def qvar(self, var):
        if not var or not self.axes:
            return ()
        out = []
        for k, v in sorted(var.items()):
            if k not in self.axes:
                continue
            lo, _, hi = self.axes[k]
            v = min(max(v, lo), hi)
            q = 0.25 if k == "wdth" else 1.0
            out.append((k, round(v / q) * q))
        return tuple(out)

    def _set(self, key):
        if key != self._cur:
            self.font.set_variations(dict(key) if key else {})
            self._cur = key

    def has(self, ch):
        return bool(self.font.get_nominal_glyph(ord(ch)))

    def missing(self, text):
        """Characters this face cannot render (excluding whitespace). Always check before rendering copy."""
        return sorted({c for c in text if not c.isspace() and not self.has(c)})

    def shape(self, text, var=None, features=None):
        key = self.qvar(var)
        ck = (text, key, tuple(sorted((features or {}).items())))
        if ck in self._shape:
            return self._shape[ck]
        self._set(key)
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.font, buf, features or {"kern": True, "liga": False})
        res = [(i.codepoint, i.cluster, p.x_advance, p.x_offset, p.y_offset)
               for i, p in zip(buf.glyph_infos, buf.glyph_positions)]
        self._shape[ck] = res
        return res

    def outline(self, gid, var=None):
        key = self.qvar(var)
        ck = (gid, key)
        if ck not in self._glyph:
            self._set(key)
            pen = _Pen()
            self.font.draw_glyph_with_pen(gid, pen)
            self._glyph[ck] = pen.ops
        return self._glyph[ck]

    def extents(self, gid, var=None):
        key = self.qvar(var)
        ck = (gid, key)
        if ck not in self._ext:
            self._set(key)
            e = self.font.get_glyph_extents(gid)
            self._ext[ck] = (e.x_bearing, e.y_bearing, e.width, e.height) if e else (0, 0, 0, 0)
        return self._ext[ck]


class _Pen:
    def __init__(self):
        self.ops, self._cur, self._start = [], (0.0, 0.0), (0.0, 0.0)

    def moveTo(self, p):
        self.ops.append(("M", p[0], p[1]))
        self._cur = self._start = p

    def lineTo(self, p):
        self.ops.append(("L", p[0], p[1]))
        self._cur = p

    def curveTo(self, *pts):
        for i in range(0, len(pts), 3):
            c1, c2, p = pts[i:i + 3]
            self.ops.append(("C", c1[0], c1[1], c2[0], c2[1], p[0], p[1]))
            self._cur = p

    def qCurveTo(self, *pts):
        offs, end, p0 = pts[:-1], pts[-1], self._cur
        for i, c in enumerate(offs):
            p = ((c[0] + offs[i + 1][0]) / 2, (c[1] + offs[i + 1][1]) / 2) if i < len(offs) - 1 else end
            c1 = (p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1]))
            c2 = (p[0] + 2 / 3 * (c[0] - p[0]), p[1] + 2 / 3 * (c[1] - p[1]))
            self.ops.append(("C", c1[0], c1[1], c2[0], c2[1], p[0], p[1]))
            p0 = p
        self._cur = end

    def closePath(self):
        self.ops.append(("Z",))
        self._cur = self._start

    def endPath(self):
        pass


_FACES = {}


def face(role):
    """Face for a registered role ('display', 'mono', 'cjk', 'cjk_regular', 'serif', … or a font file path)."""
    if role in _FACES:
        return _FACES[role]
    path, index = _fonts.resolve(role)
    f = Face(path, index, role)
    _FACES[role] = f
    return f


def reset_faces():
    _FACES.clear()


def face_for(text, role="display", fallback=None):
    """The role's face if it can render `text`, otherwise a CJK face (bold for display/mono roles,
    regular for body roles). Use for any user/script-supplied copy so names never render as tofu."""
    fc = face(role) if isinstance(role, str) else role
    if not fc.missing(text):
        return fc
    fb = fallback or ("cjk_regular" if isinstance(role, str) and ("regular" in role or role in ("body", "serif"))
                      else "cjk")
    try:
        f2 = face(fb)
        return f2 if not f2.missing(text) or len(f2.missing(text)) < len(fc.missing(text)) else fc
    except Exception:
        return fc


def glyph_path(ctx, fc, gid, x, y, size, var=None, sx=1.0, sy=1.0, rot=0.0, ox=0.0, oy=0.0, skew=0.0):
    """Append one glyph outline. (x,y) = pen position on the baseline. sx/sy/rot/skew pivot at (x+ox, y+oy)."""
    ops = fc.outline(gid, var)
    if not ops:
        return
    s = size / fc.upem
    ctx.save()
    ctx.translate(x + ox, y + oy)
    if rot:
        ctx.rotate(rot)
    if skew:
        import cairo
        ctx.transform(cairo.Matrix(1, 0, skew, 1, 0, 0))
    if sx != 1.0 or sy != 1.0:
        ctx.scale(sx if abs(sx) > 1e-4 else 1e-4, sy if abs(sy) > 1e-4 else 1e-4)
    ctx.translate(-ox, -oy)
    ctx.scale(s, -s)
    for op in ops:
        c = op[0]
        if c == "M":
            ctx.move_to(op[1], op[2])
        elif c == "L":
            ctx.line_to(op[1], op[2])
        elif c == "C":
            ctx.curve_to(op[1], op[2], op[3], op[4], op[5], op[6])
        else:
            ctx.close_path()
    ctx.restore()


class Run:
    """A shaped line of text. Glyph dict keys:
    gid, ch, idx, x (pen x), y, adv, ink0/ink1 (ink extents x), top/bottom (ink y above baseline, +up)."""

    def __init__(self, fc, text, size, var=None, tracking=0.0, features=None):
        if isinstance(fc, str):
            fc = face(fc)
        self.fc, self.text, self.size, self.var = fc, text, size, dict(var or {})
        s = size / fc.upem
        self.glyphs = []
        x = 0.0
        shaped = fc.shape(text, var, features)
        for k, (gid, cl, adv, xo, yo) in enumerate(shaped):
            xb, yb, w, h = fc.extents(gid, var)
            self.glyphs.append(dict(gid=gid, cluster=cl, ch=text[cl] if cl < len(text) else "", idx=k,
                                    x=x + xo * s, y=-yo * s, adv=adv * s,
                                    ink0=x + (xo + xb) * s, ink1=x + (xo + xb + w) * s,
                                    top=yb * s, bottom=(yb + h) * s))
            x += adv * s + (tracking * size if k < len(shaped) - 1 else 0.0)
        self.advance = x
        inks = [g for g in self.glyphs if g["ink1"] > g["ink0"]]
        self.ink0 = min(g["ink0"] for g in inks) if inks else 0.0
        self.ink1 = max(g["ink1"] for g in inks) if inks else x
        self.ink_w = self.ink1 - self.ink0
        self.top = max((g["top"] for g in inks), default=0.0)
        self.bottom = min((g["bottom"] for g in inks), default=0.0)
        self.cap = size * fc.cap_ratio

    def __len__(self):
        return len(self.glyphs)

    def visible(self):
        return [g for g in self.glyphs if g["ink1"] > g["ink0"]]

    def path(self, ctx, x, y, per_glyph=None):
        """per_glyph(g) → dict(dx, dy, sx, sy, rot, skew, ox, oy, skip, var) or None.
        ox/oy pivot is relative to the glyph pen position; use pivot_center(g) for the ink centre."""
        for g in self.glyphs:
            if g["ink1"] <= g["ink0"]:
                continue
            tr = per_glyph(g) if per_glyph else None
            if tr and tr.get("skip"):
                continue
            if tr:
                glyph_path(ctx, self.fc, g["gid"], x + g["x"] + tr.get("dx", 0), y + g["y"] + tr.get("dy", 0),
                           self.size, tr.get("var", self.var), tr.get("sx", 1.0), tr.get("sy", 1.0),
                           tr.get("rot", 0.0), tr.get("ox", 0.0), tr.get("oy", 0.0), tr.get("skew", 0.0))
            else:
                glyph_path(ctx, self.fc, g["gid"], x + g["x"], y + g["y"], self.size, self.var)

    def pivot_center(self, g):
        """(ox, oy) for transforms around the glyph's ink centre."""
        return (g["ink0"] + g["ink1"]) / 2 - g["x"], -(g["top"] + g["bottom"]) / 2


def draw_text(ctx, role, s, x, y, size, col=None, a=1.0, var=None, tracking=0.0, align="left"):
    """One-line convenience. align: left | center | right (by advance) | ink-left | ink-center."""
    run = Run(face_for(s, role) if isinstance(role, str) else role, s, size, var, tracking)
    if align == "center":
        x -= run.advance / 2
    elif align == "right":
        x -= run.advance
    elif align == "ink-left":
        x -= run.ink0
    elif align == "ink-center":
        x -= (run.ink0 + run.ink1) / 2
    ctx.new_path()
    run.path(ctx, x, y)
    if col is not None:
        ctx.set_source_rgba(col[0], col[1], col[2], a)
        ctx.fill()
    return run


def fit_width(fc, s, size, target_w, wght=None, wdth_range=None, max_track=0.6, var=None):
    """Justify a line to target ink width: first by the width axis (if the font has one), then tracking.
    Returns (wdth or None, tracking)."""
    if isinstance(fc, str):
        fc = face(fc)
    base = dict(var or {})
    if wght is not None:
        base["wght"] = wght

    def ink(wd, tr=0.0):
        v = dict(base)
        if wd is not None:
            v["wdth"] = wd
        return Run(fc, s, size, v, tr).ink_w

    if "wdth" in fc.axes:
        lo, _, hi = fc.axes["wdth"]
        if wdth_range:
            lo, hi = max(lo, wdth_range[0]), min(hi, wdth_range[1])
        if ink(lo) <= target_w <= ink(hi):
            a, b = lo, hi
            for _ in range(30):
                m = (a + b) / 2
                if ink(m) < target_w:
                    a = m
                else:
                    b = m
            return (a + b) / 2, 0.0
        wd = lo if ink(lo) > target_w else hi
    else:
        wd = None
    tl, th_ = (-0.25, 0.0) if ink(wd) > target_w else (0.0, max_track)
    for _ in range(30):
        m = (tl + th_) / 2
        if ink(wd, m) < target_w:
            tl = m
        else:
            th_ = m
    return wd, (tl + th_) / 2


def fit_size(fc, s, target_w, var=None, tracking=0.0, lo=4, hi=2000):
    """Font size (px) at which the line's ink width equals target_w."""
    if isinstance(fc, str):
        fc = face(fc)
    for _ in range(30):
        m = (lo + hi) / 2
        if Run(fc, s, m, var, tracking).ink_w < target_w:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


# ----------------------------------------------------------------------------- multi-line
_NO_START = set("，。、；：？！）》」』】〉…—,.;:?!)]}%")
_NO_END = set("（《「『【〈([{")


def _is_cjk(ch):
    o = ord(ch)
    return 0x3000 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF or 0xFF00 <= o <= 0xFFEF


def wrap(fc, text, size, max_w, var=None, tracking=0.0):
    """Greedy line breaking. Latin breaks at spaces; CJK may break between characters,
    with kinsoku (no closing punctuation at line start / opening at line end). Returns [str]."""
    if isinstance(fc, str):
        fc = face(fc)
    tokens = []
    buf = ""
    for ch in text:
        if ch == "\n":
            if buf:
                tokens.append(buf)
                buf = ""
            tokens.append("\n")
        elif _is_cjk(ch):
            if buf:
                tokens.append(buf)
                buf = ""
            tokens.append(ch)
        elif ch == " ":
            buf += ch
            tokens.append(buf)
            buf = ""
        else:
            buf += ch
    if buf:
        tokens.append(buf)
    lines, cur = [], ""
    for tok in tokens:
        if tok == "\n":
            lines.append(cur.rstrip())
            cur = ""
            continue
        trial = cur + tok
        if cur and Run(fc, trial.rstrip(), size, var, tracking).advance > max_w:
            if tok[0] in _NO_START and cur:
                # pull the last char down with the punctuation
                last = cur[-1]
                lines.append(cur[:-1].rstrip())
                cur = last + tok
            else:
                lines.append(cur.rstrip())
                cur = tok.lstrip()
            if lines[-1] and lines[-1][-1] in _NO_END:
                cur = lines[-1][-1] + cur
                lines[-1] = lines[-1][:-1]
        else:
            cur = trial
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


def draw_paragraph(ctx, role, text, x, y, size, max_w, col, a=1.0, leading=1.35, var=None, tracking=0.0,
                   align="left", reveal=None):
    """Wrapped paragraph from the first baseline y. reveal(line_index) → (alpha, dy) for staggered entrances.
    Returns (lines, height)."""
    fc = face_for(text, role) if isinstance(role, str) else role
    lines = wrap(fc, text, size, max_w, var, tracking)
    for i, ln in enumerate(lines):
        al, dy = (1.0, 0.0) if reveal is None else reveal(i)
        if al <= 0:
            continue
        run = Run(fc, ln, size, var, tracking)
        xx = x if align == "left" else (x + (max_w - run.advance) / 2 if align == "center" else x + max_w - run.advance)
        ctx.new_path()
        run.path(ctx, xx, y + i * size * leading + dy)
        ctx.set_source_rgba(col[0], col[1], col[2], a * al)
        ctx.fill()
    return lines, len(lines) * size * leading


def draw_vertical(ctx, role, text, x, y, size, col, a=1.0, step=1.18, reveal=None):
    """Vertical CJK column centred on x, first character's top at y (竖排). Punctuation is set upright."""
    fc = face(role) if isinstance(role, str) else role
    for i, ch in enumerate(text):
        al, dy = (1.0, 0.0) if reveal is None else reveal(i)
        if al <= 0:
            continue
        run = Run(fc, ch, size)
        g = run.glyphs[0]
        ctx.new_path()
        run.path(ctx, x - (g["ink0"] + g["ink1"]) / 2, y + i * size * step + size * 0.88 + dy)
        ctx.set_source_rgba(col[0], col[1], col[2], a * al)
        ctx.fill()


def tabular(s):
    """Hint: use a monospaced/tabular face for changing numbers so digits don't jitter."""
    return s
