"""Film: the frame pipeline every code film shares.

    import motionkit as mk
    film = mk.Film("reel", width=1920, height=1080, fps=60, duration=15.0, bars=8, root=__file__)
    g, ev = film.grid, film.events
    ev.add("land1", g.beat(1), "hit")

    @film.chapter(0, g.bar(2), name="POINT", glyph="点")
    def point(ctx, t, ch):            # ch.local = t - ch.t0, ch.u = progress 0..1 through the chapter
        mk.fill_bg(ctx, PAL.ground)
        ...

    film.impact(g.bar(4), shake=16, ca=0.01, flash=0.85, decay=0.18)   # drop
    film.blur(default=6, windows=[(g.bar(1) - 0.01, g.bar(1) + 0.3, 10)])
    film.post.update(grain=0.022, vig=0.22)

    @film.fx
    def look(t, fx):                  # per-time post overrides
        fx["bloom"] = 0.9 if g.bar(4) <= t < g.bar(6) else 0.0

    if __name__ == "__main__":
        film.cli()                    # still / sheet / diff / chunks / assemble / audio-qa / loop / info

Determinism contract: a frame is a pure function of its time. Never use random(), wall
clock, or state carried between frames. Simulations go in @film.precompute and are cached.
"""
import math
import os

from .draw import new_ctx, new_surface, surface_alpha, surface_to_array
from .ease import clamp, noise1, prog
from .grid import EventMap, Grid
from . import post as _post

_ACTIVE = []


class Chapter:
    def __init__(self, t0, t1, fn, name="", glyph="", index=0):
        self.t0, self.t1, self.fn, self.name, self.glyph, self.index = float(t0), float(t1), fn, name, glyph, index
        self.local = 0.0
        self.u = 0.0

    @property
    def dur(self):
        return self.t1 - self.t0

    def __repr__(self):
        return "Chapter(%d %s %s %.3f–%.3f)" % (self.index, self.glyph, self.name, self.t0, self.t1)


class Film:
    def __init__(self, name="film", width=1920, height=1080, fps=60, duration=10.0, bpm=None, bars=None,
                 beats_per_bar=4, root=None):
        self.name = name
        self.width, self.height, self.fps = int(width), int(height), int(fps)
        self.duration = float(duration)
        self.nframes = int(round(self.duration * self.fps))
        if bpm:
            self.grid = Grid(bpm, beats_per_bar)
        elif bars:
            self.grid = Grid.fit(self.duration, bars, beats_per_bar=beats_per_bar)
        else:
            self.grid = None
        self.events = EventMap()
        self.chapters = []
        self.impacts = []
        self.cuts = []                 # intentional hard cuts (whitelist for diff QA)
        self._fx = []
        self._pre = []
        self.blur_default = 6
        self.blur_windows = []
        self.shutter = 0.5
        self.hud = None
        self.hud_colors = ((0.93, 0.91, 0.88), (0.043, 0.043, 0.051))
        self.hud_opacity = 0.82
        self.post = dict(bloom=0.0, bloom_thr=0.55, bloom_key="max", bloom_r=1.0, ca=0.0, ca_c=None,
                         flash=0.0, flash_col=(1.0, 1.0, 1.0), vig=0.2, grain=0.02)
        self.root = os.path.dirname(os.path.abspath(root)) if root else os.getcwd()
        self.overlay_fn = None         # optional fn(ctx, t) drawn unblurred over the scene (credits/captions)
        self.underlay_fn = None
        _ACTIVE.append(self)

    # ------------------------------------------------------------------ authoring API
    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def chapter(self, t0, t1, name="", glyph=""):
        def deco(fn):
            self.chapters.append(Chapter(t0, t1, fn, name, glyph, len(self.chapters)))
            self.chapters.sort(key=lambda c: c.t0)
            for i, c in enumerate(self.chapters):
                c.index = i
            return fn
        return deco

    def impact(self, at, shake=0.0, ca=0.0, flash=0.0, decay=0.2, flash_col=None, ca_center=None):
        """An impact = coordinated camera shake + chromatic aberration + flash, decaying exponentially.
        Put one on every big hit (drops, slams), never on small ticks."""
        self.impacts.append(dict(t=float(at), shake=shake, ca=ca, flash=flash, decay=decay,
                                 flash_col=flash_col, ca_c=ca_center))

    def cut(self, at):
        """Declare an intentional hard cut so continuity QA doesn't flag it."""
        self.cuts.append(float(at))

    def blur(self, default=6, windows=(), shutter=0.5):
        """Temporal motion blur: `default` sub-frames per frame, more inside fast windows [(t0, t1, n)]."""
        self.blur_default = default
        self.blur_windows = list(windows)
        self.shutter = shutter

    def fx(self, fn):
        self._fx.append(fn)
        return fn

    def precompute(self, fn):
        """Register expensive deterministic setup (simulations, sampling). Run once before rendering;
        the function must cache its result to disk itself (see motionkit.sim.cached)."""
        self._pre.append(fn)
        return fn

    def run_precompute(self):
        for fn in self._pre:
            fn()

    # ------------------------------------------------------------------ evaluation
    def chapter_at(self, t):
        cur = None
        for c in self.chapters:
            if t >= c.t0 - 1e-9:
                cur = c
        return cur or (self.chapters[0] if self.chapters else None)

    def draw(self, ctx, t):
        c = self.chapter_at(t)
        if c is None:
            raise RuntimeError("no chapters registered")
        c.local = t - c.t0
        c.u = clamp(c.local / max(c.dur, 1e-9))
        c.fn(ctx, t, c)

    def shake_at(self, t):
        dx = dy = 0.0
        for k, im in enumerate(self.impacts):
            tau = t - im["t"]
            if im["shake"] > 0 and 0 <= tau < im["decay"] * 5:
                e = im["shake"] * math.exp(-tau / im["decay"])
                dx += e * noise1(tau * 38, 3 + k)
                dy += e * noise1(tau * 38, 7 + k)
        return dx, dy

    def fx_at(self, t):
        fx = dict(self.post)
        for im in self.impacts:
            tau = t - im["t"]
            if tau >= 0:
                fx["ca"] = fx["ca"] + im["ca"] * math.exp(-tau / im["decay"])
                fx["flash"] = fx["flash"] + im["flash"] * math.exp(-tau / (im["decay"] * 0.5))
                if im["flash_col"] and im["flash"] * math.exp(-tau / (im["decay"] * 0.5)) > 0.01:
                    fx["flash_col"] = im["flash_col"]
                if im["ca_c"] and tau < im["decay"] * 3:
                    fx["ca_c"] = im["ca_c"]
        for fn in self._fx:
            fn(t, fx)
        fx["flash"] = clamp(fx["flash"])
        return fx

    def samples_at(self, t):
        n = self.blur_default
        for a, b, k in self.blur_windows:      # later windows override earlier ones
            if a <= t <= b:
                n = k
        return max(1, int(n))

    def render_frame(self, fi, samples=None, with_post=True, with_hud=True, as_float=False):
        t = fi / self.fps
        n = samples or self.samples_at(t)
        surf = new_surface(self.width, self.height)
        acc = None
        for k in range(n):
            ts = t + ((k + 0.5) / n - 0.5) * self.shutter / self.fps if n > 1 else t
            ctx = new_ctx(surf)
            dx, dy = self.shake_at(ts)
            if dx or dy:
                ctx.translate(dx, dy)
            self.draw(ctx, ts)
            surf.flush()
            a = surface_to_array(surf)
            acc = a if acc is None else acc + a
        img = acc / n
        if with_post:
            fx = self.fx_at(t)
            if fx["bloom"] > 0:
                img = _post.bloom(img, fx["bloom"], fx["bloom_thr"], fx["bloom_r"], fx["bloom_key"])
            if fx["ca"] > 0.0004:
                c = fx["ca_c"] or (self.width / 2, self.height / 2)
                img = _post.chroma(img, fx["ca"], c[0], c[1])
        if self.overlay_fn:
            ov = new_surface(self.width, self.height)
            octx = new_ctx(ov)
            self.overlay_fn(octx, t)
            ov.flush()
            from .draw import surface_rgba
            img = _post.composite_rgba(img, surface_rgba(ov))
        if with_hud and self.hud is not None:
            hs = self.hud.draw(t)
            if hs is not None:
                img = _post.composite_adaptive(img, surface_alpha(hs), self.hud_colors[0], self.hud_colors[1],
                                               self.hud_opacity)
        if with_post:
            if fx["flash"] > 0:
                img = _post.flash(img, fx["flash"], fx["flash_col"])
            if fx["vig"] > 0:
                img = _post.vignette(img, fx["vig"])
            if fx["grain"] > 0:
                img = _post.grain(img, fi, fx["grain"])
        return img if as_float else _post.to_u8(img)

    # ------------------------------------------------------------------ reporting
    def info(self):
        lines = ["%s  %dx%d @ %dfps  %.3fs  (%d frames)" % (self.name, self.width, self.height, self.fps,
                                                           self.duration, self.nframes)]
        if self.grid:
            lines.append(self.grid.describe(self.duration))
        lines.append("chapters:")
        for c in self.chapters:
            lines.append("  %d  %-3s %-12s %7.3f – %7.3f  (%.3fs)" % (c.index, c.glyph, c.name, c.t0, c.t1, c.dur))
        gaps = []
        for a, b in zip(self.chapters, self.chapters[1:]):
            if abs(a.t1 - b.t0) > 1e-6:
                gaps.append((a.name, b.name, a.t1, b.t0))
        if self.chapters and abs(self.chapters[-1].t1 - self.duration) > 1e-6:
            gaps.append((self.chapters[-1].name, "END", self.chapters[-1].t1, self.duration))
        if gaps:
            lines.append("WARNING chapter gaps/overlaps: %s" % gaps)
        lines.append("events: %d   impacts: %d   cuts: %d" % (len(self.events.all()), len(self.impacts), len(self.cuts)))
        for e in self.events.all():
            lines.append("  %7.3f  %-8s %s" % (e.t, e.kind, e.name))
        return "\n".join(lines)

    def cli(self, argv=None):
        from .cli import main
        return main(self, argv)
