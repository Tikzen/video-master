"""Designer HUD overlay: crop marks, identity line, chapter index with rolling numerals, timecode,
beat meter and timeline scrubber. Drawn as a white alpha mask; Film composites it in ink or paper
depending on the picture underneath (post.composite_adaptive).

Use it when the piece benefits from a "making-of / technical" frame (showreels, product launch,
data stories). Skip it for emotional/cinematic pieces. Keep it ≤ 15 px and calm.
"""
import math

import cairo

from .annotate import crop_marks, typed
from .draw import new_ctx, new_surface
from .ease import clamp, out_cubic, out_expo, prog
from .text import Run, face


class HUD:
    def __init__(self, film, identity="CLAUDE", subtitle="MOTION DESIGN REEL", chapters=None,
                 intro=(0.05, 0.75), outro=None, inset=40, show=("marks", "identity", "chapter", "timecode",
                                                                  "meter", "scrubber"), size=15):
        self.f = film
        self.identity, self.subtitle = identity, subtitle
        self.chapters = chapters      # [(glyph, WORD, t0), ...] or None → from film.chapters
        self.intro = intro
        self.outro = outro or (film.duration - 0.44, film.duration - 0.06)
        self.inset = inset
        self.show = set(show)
        self.size = size

    def _vis(self, t):
        return min(prog(t, *self.intro), 1 - prog(t, *self.outro))

    def _chapters(self):
        if self.chapters:
            return self.chapters
        return [(c.glyph, c.name, c.t0) for c in self.f.chapters]

    def _mono(self, ctx, s, x, y, wght=500, align="left", a=1.0, track=0.04, size=None):
        if not s:
            return 0.0
        run = Run(face("mono"), s, size or self.size, {"wght": wght}, track)
        if align == "right":
            x -= run.advance
        ctx.new_path()
        run.path(ctx, x, y)
        ctx.set_source_rgba(1, 1, 1, a)
        ctx.fill()
        return run.advance

    def _glyph(self, ctx, s, x, y, a, align="right"):
        if not s:
            return 0.0
        try:
            fc = face("cjk") if any(ord(c) > 0x2E80 for c in s) else face("display")
        except Exception:
            fc = face("display")
        run = Run(fc, s, self.size + 1, {"wght": 700})
        if align == "right":
            x -= run.advance
        ctx.new_path()
        run.path(ctx, x, y)
        ctx.set_source_rgba(1, 1, 1, a)
        ctx.fill()
        return run.advance

    def draw(self, t):
        v = self._vis(t)
        if v <= 0:
            return None
        W, H = self.f.width, self.f.height
        s = W / 1920.0
        surf = new_surface(W, H)
        ctx = new_ctx(surf)
        ctx.scale(s, s)
        w, h = 1920, 1080 * (H / W) / (1080 / 1920)
        L, R, TOP, BOT = 74, w - 74, 62, h - 50
        if "marks" in self.show:
            crop_marks(ctx, w, h, self.inset, 26, v)
        if "identity" in self.show:
            u = prog(v, 0.15, 0.85)
            txt = typed(self.identity + " " + self.subtitle, u)
            w1 = self._mono(ctx, txt[:len(self.identity)], L, TOP, wght=800)
            if len(txt) > len(self.identity) + 1:
                self._mono(ctx, "/  " + txt[len(self.identity) + 1:], L + w1 + 12, TOP, wght=400, a=0.75)
        chs = self._chapters()
        if "chapter" in self.show and chs:
            idx = max([i for i, c in enumerate(chs) if c[2] <= t + 1e-9] or [0])
            t0 = chs[idx][2]
            roll = out_expo(prog(t, t0, t0 + 0.32)) if idx > 0 else 1.0
            av = clamp(v * 1.6 - 0.4)
            bh = 22
            ctx.save()
            ctx.rectangle(R - 160, TOP - 17, 180, bh + 4)
            ctx.clip()
            prev = chs[idx - 1] if idx > 0 else chs[idx]
            for (c, off, al) in ((prev, -roll * bh, 1 - roll), (chs[idx], (1 - roll) * bh, roll)):
                if al <= 0.01 or av <= 0:
                    continue
                x = R - self._mono(ctx, c[1], R, TOP + off, wght=700, align="right", a=al * av, track=0.12)
                self._glyph(ctx, c[0], x - 10, TOP + off + 1, al * av)
            ctx.restore()
            ctx.save()
            nx = R - 180
            ctx.rectangle(nx - 120, TOP - 17, 124, bh + 4)
            ctx.clip()
            self._mono(ctx, "/ %02d" % len(chs), nx, TOP, wght=400, align="right", a=0.6 * av)
            for (num, off, al) in ((idx if idx > 0 else 1, -roll * bh, 1 - roll), (idx + 1, (1 - roll) * bh, roll)):
                if al > 0.01 and av > 0:
                    self._mono(ctx, "%02d" % num, nx - 46, TOP + off, wght=800, align="right", a=al * av)
            ctx.restore()
        ub = prog(v, 0.25, 0.9)
        if "timecode" in self.show and ub > 0:
            fps = self.f.fps
            fr = min(int(round(t * fps)), self.f.nframes - 1)
            ss, ff = divmod(fr, fps)
            mm, ss = divmod(ss, 60)
            self._mono(ctx, typed("TC 00:%02d:%02d:%02d" % (mm, ss, ff), ub), L, BOT, wght=600)
            self._mono(ctx, typed("F %04d" % fr, ub), L + 196, BOT, wght=400, a=0.6)
        g = self.f.grid
        if "meter" in self.show and ub > 0 and g:
            bar = max(0, g.bar_index(t))
            beat = int(((t - g.offset) % g.bar_s) / g.beat_s)
            ph = g.phase(t)
            x = R - self._mono(ctx, typed("%d BPM" % round(g.bpm), ub), R, BOT, wght=400, align="right", a=0.6) - 22
            for i in range(g.bpb - 1, -1, -1):
                xx = x - 9 - (g.bpb - 1 - i) * 15
                ctx.rectangle(xx, BOT - 10, 9, 9)
                if i == beat:
                    ctx.set_source_rgba(1, 1, 1, ub * (0.55 + 0.45 * (1 - out_cubic(ph))))
                    ctx.fill()
                else:
                    ctx.set_source_rgba(1, 1, 1, 0.55 * ub)
                    ctx.set_line_width(1.2)
                    ctx.stroke()
            self._mono(ctx, typed("BAR %d.%d" % (bar + 1, beat + 1), ub), x - g.bpb * 15 - 14, BOT, wght=600, align="right")
        us = out_expo(prog(v, 0.3, 1.0))
        if "scrubber" in self.show and us > 0:
            x0, x1, y = 470, w - 470, BOT - 5
            xe = x0 + (x1 - x0) * us
            ctx.set_line_width(1.0)
            ctx.move_to(x0, y)
            ctx.line_to(xe, y)
            ctx.set_source_rgba(1, 1, 1, 0.28)
            ctx.stroke()
            n = max(1, len(chs) if chs else 8)
            for k in range(n + 1):
                xx = x0 + (x1 - x0) * k / n
                if xx > xe:
                    break
                ctx.move_to(xx, y - 4)
                ctx.line_to(xx, y + 4)
                ctx.set_source_rgba(1, 1, 1, 0.5)
                ctx.stroke()
            xp = x0 + (x1 - x0) * clamp(t / self.f.duration)
            if xp <= xe:
                ctx.set_line_width(2.0)
                ctx.move_to(x0, y)
                ctx.line_to(xp, y)
                ctx.set_source_rgba(1, 1, 1, 0.9)
                ctx.stroke()
                ctx.rectangle(xp - 1.5, y - 7, 3, 14)
                ctx.fill()
        surf.flush()
        return surf
