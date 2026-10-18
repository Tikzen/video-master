"""演播室 / Studio kit — dual-host explainers and news-style shows.

The show is driven by SPEECH: line timing comes from real (or placeholder) audio, and every
visual decision hangs off it — who is on camera, when the screen takes over, mouth/blink/nod,
lower thirds and captions (references/craft/genre-studio.md).

  Speech                 per-line timing + per-frame envelope (from WAV, or synthetic placeholder)
  VectorHost             parametric flat-illustration presenter: blink, visemes, brows, nod, breathe, gesture
  SpriteHost             PNG expression sprites (generated/authorised art) with speech bounce + cross-fades
  NewsSet                designed vector studio: wall, LED screen (live content), desk, light strips
  StudioCamera           shot grammar wide / two / a / b / screen with moves or cuts, subtle operator drift
  auto_shots(lines)      derive a sensible shot list from the script
  lower_third, caption, pip, ticker, live_bug
"""
import math

import cairo
import numpy as np

from .annotate import label
from .color import hexc, mix, shade
from .draw import circle, ellipse, linear_gradient, poly, radial_gradient, rgba, rrect
from .ease import (SNAP, clamp, hash01, io_cubic, lerp, noise1, out_back, out_cubic, out_expo, prog, smooth, spring)
from .text import Run, draw_paragraph, face, face_for, wrap


# ----------------------------------------------------------------------------- speech
class Line:
    def __init__(self, speaker, text, t0, t1, env=None, fps=60, expression="neutral", shot=None, media=None,
                 emphasis=None, src=None):
        self.speaker, self.text, self.t0, self.t1 = speaker, text, float(t0), float(t1)
        self.env, self.fps = env, fps
        self.expression, self.shot, self.media = expression, shot, media
        self.emphasis = emphasis or []
        self.src = src

    def level(self, t):
        if t < self.t0 or t >= self.t1 or self.env is None:
            return 0.0
        f = (t - self.t0) * self.fps
        i = int(f)
        if i + 1 >= len(self.env):
            return float(self.env[-1]) if len(self.env) else 0.0
        a = f - i
        return float(self.env[i] * (1 - a) + self.env[i + 1] * a)


class Speech:
    """All lines of a show on one clock.

        sp = Speech(fps=60)
        sp.add_wav("A", "我们先看结论。", "audio/voice/01.wav", t0=0.6)       # real narration
        sp.add_synthetic("B", "因为时间线是唯一的时钟。", t0=sp.end + 0.25)   # placeholder (labelled!)
    """

    def __init__(self, fps=60):
        self.fps = fps
        self.lines = []

    @property
    def end(self):
        return max((l.t1 for l in self.lines), default=0.0)

    def add_wav(self, speaker, text, path, t0, **kw):
        from .audio.mix import envelope, load_wav
        x = load_wav(path)
        env = envelope(x, self.fps)
        ln = Line(speaker, text, t0, t0 + len(x) / 48000.0, env, self.fps, src=path, **kw)
        self.lines.append(ln)
        return ln

    def add_synthetic(self, speaker, text, t0, cps=None, **kw):
        """Deterministic syllable envelope for previews before TTS exists. cps: chars/s
        (≈4.2 for Chinese, ≈14 letters/s for English). Replace with add_wav for delivery."""
        cjk = sum(1 for c in text if ord(c) > 0x2E80)
        cps = cps or (4.3 if cjk > len(text) * 0.3 else 13.0)
        units = [c for c in text if not c.isspace()]
        dur = max(0.6, len(units) / cps)
        n = int(dur * self.fps) + 1
        env = np.zeros(n)
        tv = np.arange(n) / self.fps
        step = dur / max(1, len(units))
        for k, ch in enumerate(units):
            if ch in "，。、；：？！,.;:?!":
                continue
            c = (k + 0.5) * step
            amp = 0.55 + 0.45 * hash01(k, len(text))
            env += amp * np.exp(-((tv - c) / (step * 0.38)) ** 2)
        env = np.clip(env, 0, 1)
        ln = Line(speaker, text, t0, t0 + dur, env, self.fps, **kw)
        ln.synthetic = True
        self.lines.append(ln)
        return ln

    def active(self, t):
        """Line whose AUDIO is playing at t (None in pauses). Use for mouths, not for display."""
        for ln in self.lines:
            if ln.t0 <= t < ln.t1:
                return ln
        return None

    def held(self, t):
        """Line whose DISPLAY state owns t: the most recent line that has started, held through the
        pause until the next line begins. Captions, name plates and the PIP read this, so silence
        never falls back to an opening/default state. None only before the first line."""
        cur = None
        for ln in self.lines:
            if ln.t0 <= t and (cur is None or ln.t0 >= cur.t0):
                cur = ln
        return cur

    def drive(self, speaker, t, rate=60, window=1.4, attack=0.04, release=0.14, hz=3.0, damping=0.25):
        """Voice-driven squash/stretch for a whole sticker: envelope follower (fast attack, slower
        release) into an under-damped spring. Loud syllables stretch, the spring rebounds, and when
        the voice stops the motion eases down instead of cutting. Pure function of t (fixed absolute
        grid, simulated from rest over a look-back window), so scrubbing equals playback."""
        key = (speaker, round(t * rate))
        cache = self.__dict__.setdefault("_drive_cache", {})
        if key in cache:
            return cache[key]
        norm = self.__dict__.setdefault("_norm", {})
        dt, steps = 1.0 / rate, int(round(window * rate))
        om = 2 * math.pi * hz
        k, c = om * om, 2 * damping * om
        end = int(math.floor(t * rate + 1e-6))
        env = x = v = 0.0
        lines = [ln for ln in self.lines if ln.speaker == speaker]
        for i in range(end - steps, end + 1):
            ti = i * dt
            target = 0.0
            for ln in lines:
                if ln.t0 <= ti < ln.t1:
                    if id(ln) not in norm:
                        e = np.asarray(ln.env if ln.env is not None else [0.0])
                        norm[id(ln)] = max(1e-4, float(np.percentile(e, 95)))
                    target = min(1.2, ln.level(ti) / norm[id(ln)])
                    break
            env += (target - env) * (1 - math.exp(-dt / (attack if target > env else release)))
            v += (k * (env - x) - c * v) * dt
            x += v * dt
        if len(cache) > 20000:
            cache.clear()
        cache[key] = x
        return x

    def level(self, speaker, t):
        return max((ln.level(t) for ln in self.lines if ln.speaker == speaker), default=0.0)

    def speaking(self, speaker, t, hold=0.15):
        return any(ln.speaker == speaker and ln.t0 <= t < ln.t1 + hold for ln in self.lines)

    def last_line(self, speaker, t):
        ls = [ln for ln in self.lines if ln.speaker == speaker and ln.t0 <= t]
        return ls[-1] if ls else None


# ----------------------------------------------------------------------------- performance
EXPRESSIONS = {
    #             brow_raise  brow_tilt  smile  eye_open  mouth_base
    "neutral":   (0.0, 0.0, 0.25, 1.0, 0.0),
    "smile":     (0.15, 0.0, 0.85, 0.9, 0.05),
    "excited":   (0.55, -0.1, 1.0, 1.1, 0.15),
    "explain":   (0.25, 0.05, 0.45, 1.0, 0.0),
    "thinking":  (-0.1, 0.45, 0.05, 0.85, 0.0),
    "surprised": (0.9, -0.2, 0.2, 1.25, 0.35),
    "serious":   (-0.35, -0.25, 0.0, 0.95, 0.0),
}


class Performance:
    """Turns speech + expression keys into per-frame face/body state for one host. Deterministic."""

    def __init__(self, speaker, speech, expressions=None, seed=1, gestures=None):
        self.id, self.sp, self.seed = speaker, speech, seed
        self.expr = sorted(expressions or [(0.0, "neutral")])   # [(t, name)]
        self.gestures = gestures or []                           # [(t0, t1)] hand-up explaining

    def expr_names(self, t):
        """(current, previous, blend 0..1) — sprite hosts cross-fade images with this."""
        cur, prev, tc = self.expr[0][1], self.expr[0][1], self.expr[0][0]
        for (tk, name) in self.expr:
            if tk <= t:
                prev, cur, tc = cur, name, tk
        return cur, prev, smooth(prog(t, tc, tc + 0.28))

    def _expr_at(self, t):
        cur, prev, u = self.expr_names(t)
        a, b = EXPRESSIONS.get(prev, EXPRESSIONS["neutral"]), EXPRESSIONS.get(cur, EXPRESSIONS["neutral"])
        return tuple(lerp(x, y, u) for x, y in zip(a, b))

    def blink(self, t):
        k = int(t / 3.1)
        tb = k * 3.1 + 0.4 + 2.2 * hash01(k, self.seed)
        d = abs(t - tb)
        v = clamp(1 - d / 0.07)
        if hash01(k, self.seed, 7) > 0.75:            # occasional double blink
            v = max(v, clamp(1 - abs(t - tb - 0.22) / 0.06))
        return v

    def state(self, t):
        br, bt, sm, eo, mb = self._expr_at(t)
        lvl = self.sp.level(self.id, t)
        talking = self.sp.speaking(self.id, t)
        mouth = clamp(mb + lvl * 0.95)
        # viseme variety: width narrows on 'o'-like peaks (deterministic wobble)
        mouth_w = 1.0 - 0.25 * lvl * (0.5 + 0.5 * math.sin(t * 23.0 + self.seed))
        # head motion: nod at line starts and on loud syllables, gentle idle drift otherwise
        nod = 0.0
        ln = self.sp.last_line(self.id, t)
        if ln:
            nod += 0.6 * math.exp(-max(0.0, t - ln.t0) / 0.25) * math.sin(min(math.pi, (t - ln.t0) * 9))
            if t >= ln.t1:
                nod += 0.4 * math.exp(-(t - ln.t1) / 0.3) * math.sin(min(math.pi, (t - ln.t1) * 8))
        nod += 0.5 * lvl ** 2 * math.sin(t * 7.0)
        tilt = 0.035 * noise1(t * 0.35, self.seed) + (0.04 if talking else 0.0) * math.sin(t * 1.3 + self.seed)
        look = (0.5 * noise1(t * 0.5, self.seed + 3), 0.3 * noise1(t * 0.4, self.seed + 5))
        listen = 0.0 if talking else 1.0
        g = 0.0
        for (g0, g1) in self.gestures:
            g = max(g, min(spring(t - g0, 2.0, 0.6), 1 - smooth(prog(t, g1 - 0.3, g1))))
        cur, prev, mu = self.expr_names(t)
        return dict(mouth=mouth, mouth_w=mouth_w, blink=self.blink(t), brow=br + 0.25 * lvl, brow_tilt=bt,
                    smile=sm, eye_open=eo, nod=nod, tilt=tilt, look=look, breathe=math.sin(t * 1.6 + self.seed),
                    talking=talking, listen=listen, gesture=g, level=lvl, t=t, expr=cur, expr_prev=prev, expr_mix=mu,
                    drive=self.sp.drive(self.id, t), seed=self.seed)


# ----------------------------------------------------------------------------- vector presenter
class VectorHost:
    """Flat-illustration presenter drawn in code (bust, from mid-torso up).

        host = VectorHost(skin="#F2C9A5", hair="#2B2220", outfit="#2E86AB", hair_style="bob", glasses=True)
        host.draw(ctx, x, y_desk, height_px, perf.state(t), facing=+1)

    (x, y_desk) is the point on the desk line under the host's centre; height_px = head top → desk line.
    Style choices are parameters so two hosts read as a pair but stay distinct.
    """

    def __init__(self, skin="#F2C9A5", hair="#2B2220", outfit="#2E86AB", outfit2=None, shirt="#F4F1EA",
                 hair_style="bob", outfit_style="blazer", glasses=False, earrings=None, blush=0.22, line="#2A2324"):
        c = lambda v: hexc(v) if isinstance(v, str) else v
        self.skin, self.hair, self.outfit = c(skin), c(hair), c(outfit)
        self.outfit2 = c(outfit2) if outfit2 else shade(self.outfit, -0.25)
        self.shirt, self.line = c(shirt), c(line)
        self.hair_style, self.outfit_style = hair_style, outfit_style
        self.glasses, self.earrings, self.blush = glasses, (c(earrings) if earrings else None), blush

    def draw(self, ctx, x, y, height, st, facing=1):
        U = height / 2.25          # head-top (hair) sits ≈2.25 units above the desk line
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(U * facing, U)
        br = st.get("breathe", 0.0)
        self._torso(ctx, br, st)
        # head group pivots at the neck
        ctx.save()
        ctx.translate(0, -1.05)
        ctx.rotate(st.get("tilt", 0.0) * facing)
        ctx.translate(0, 0.02 * st.get("nod", 0.0))
        self._head(ctx, st)
        ctx.restore()
        if st.get("gesture", 0) > 0.01:
            self._hand(ctx, st["gesture"])
        ctx.restore()

    # torso / outfit -----------------------------------------------------------
    def _torso(self, ctx, br, st):
        sy = 1 + 0.012 * br
        ctx.save()
        ctx.scale(1, sy)
        # neck
        rgba(ctx, shade(self.skin, -0.12))
        rrect(ctx, -0.2, -1.25, 0.4, 0.62, 0.12)
        ctx.fill()
        # body
        body = [(-0.55, -0.72), (0.55, -0.72), (1.18, -0.42), (1.32, 0.4), (-1.32, 0.4), (-1.18, -0.42)]
        ctx.move_to(-0.55, -0.72)
        ctx.curve_to(-0.2, -0.62, 0.2, -0.62, 0.55, -0.72)
        ctx.curve_to(0.95, -0.66, 1.2, -0.5, 1.26, -0.2)
        ctx.line_to(1.36, 0.45)
        ctx.line_to(-1.36, 0.45)
        ctx.line_to(-1.26, -0.2)
        ctx.curve_to(-1.2, -0.5, -0.95, -0.66, -0.55, -0.72)
        ctx.close_path()
        rgba(ctx, self.outfit)
        ctx.fill()
        if self.outfit_style == "blazer":
            # shirt V + lapels
            rgba(ctx, self.shirt)
            poly(ctx, [(-0.32, -0.7), (0.32, -0.7), (0.0, -0.05)])
            ctx.fill()
            rgba(ctx, self.outfit2)
            poly(ctx, [(-0.36, -0.71), (-0.05, -0.12), (-0.18, 0.05), (-0.55, -0.55)])
            ctx.fill()
            poly(ctx, [(0.36, -0.71), (0.05, -0.12), (0.18, 0.05), (0.55, -0.55)])
            ctx.fill()
            rgba(ctx, shade(self.outfit, 0.25), 0.6)
            circle(ctx, 0.0, 0.18, 0.035)
            ctx.fill()
        elif self.outfit_style == "hoodie":
            rgba(ctx, self.outfit2)
            ctx.move_to(-0.62, -0.74)
            ctx.curve_to(-0.4, -0.35, 0.4, -0.35, 0.62, -0.74)
            ctx.curve_to(0.3, -0.6, -0.3, -0.6, -0.62, -0.74)
            ctx.fill()
            rgba(ctx, self.shirt)
            ctx.set_line_width(0.035)
            for sx in (-0.12, 0.12):
                ctx.move_to(sx, -0.5)
                ctx.line_to(sx * 1.2, -0.12)
            ctx.stroke()
        else:  # tee
            rgba(ctx, self.outfit2)
            ctx.set_line_width(0.06)
            ctx.move_to(-0.3, -0.7)
            ctx.curve_to(-0.15, -0.5, 0.15, -0.5, 0.3, -0.7)
            ctx.stroke()
        ctx.restore()

    # head ----------------------------------------------------------------------
    def _hair_back(self, ctx):
        rgba(ctx, self.hair)
        hs = self.hair_style
        if hs == "bob":
            ctx.move_to(-0.78, -0.55)
            ctx.curve_to(-0.86, 0.05, -0.75, 0.25, -0.5, 0.28)
            ctx.line_to(0.5, 0.28)
            ctx.curve_to(0.75, 0.25, 0.86, 0.05, 0.78, -0.55)
            ctx.curve_to(0.7, -1.25, -0.7, -1.25, -0.78, -0.55)
            ctx.fill()
        elif hs == "long":
            ctx.move_to(-0.8, -0.55)
            ctx.curve_to(-0.95, 0.4, -0.9, 0.95, -0.55, 1.15)
            ctx.line_to(0.55, 1.15)
            ctx.curve_to(0.9, 0.95, 0.95, 0.4, 0.8, -0.55)
            ctx.curve_to(0.72, -1.27, -0.72, -1.27, -0.8, -0.55)
            ctx.fill()
        elif hs == "bun":
            circle(ctx, 0.05, -1.32, 0.3)
            ctx.fill()
            ctx.move_to(-0.7, -0.5)
            ctx.curve_to(-0.75, -1.2, 0.75, -1.2, 0.7, -0.5)
            ctx.fill()

    @staticmethod
    def _cap(ctx, rx, ry, cy):
        """Skull cap: half-ellipse over the top of the head, from left temple to right temple."""
        ctx.save()
        ctx.translate(0, cy)
        ctx.scale(rx, ry)
        ctx.new_sub_path()
        ctx.arc(0, 0, 1, math.pi, 2 * math.pi)
        ctx.restore()

    def _hair_front(self, ctx):
        rgba(ctx, self.hair)
        hs = self.hair_style
        if hs in ("bob", "long"):
            self._cap(ctx, 0.71, 0.82, -0.40)
            ctx.curve_to(0.55, -0.72, 0.15, -0.86, -0.12, -0.68)    # side-swept fringe
            ctx.curve_to(-0.35, -0.85, -0.6, -0.72, -0.7, -0.45)
            ctx.fill()
        elif hs == "short":
            self._cap(ctx, 0.69, 0.84, -0.42)
            ctx.curve_to(0.62, -0.62, 0.45, -0.78, 0.2, -0.8)
            ctx.curve_to(-0.1, -0.7, -0.45, -0.78, -0.58, -0.6)
            ctx.close_path()
            ctx.fill()
        elif hs == "bun":
            self._cap(ctx, 0.67, 0.78, -0.42)
            ctx.curve_to(0.5, -0.78, -0.5, -0.78, -0.66, -0.45)
            ctx.fill()
        elif hs == "buzz":
            rgba(ctx, self.hair, 0.85)
            self._cap(ctx, 0.66, 0.76, -0.46)
            ctx.curve_to(0.4, -0.86, -0.4, -0.86, -0.64, -0.5)
            ctx.fill()

    def _head(self, ctx, st):
        self._hair_back(ctx)
        # ears
        rgba(ctx, shade(self.skin, -0.06))
        ellipse(ctx, -0.63, -0.3, 0.12, 0.17)
        ellipse(ctx, 0.63, -0.3, 0.12, 0.17)
        ctx.fill()
        if self.earrings:
            rgba(ctx, self.earrings)
            circle(ctx, -0.64, -0.1, 0.05)
            circle(ctx, 0.64, -0.1, 0.05)
            ctx.fill()
        # face: soft superellipse with a gentle chin
        th = np.linspace(0, math.tau, 120, endpoint=False)
        p = 2.5
        r = (np.abs(np.cos(th)) ** p + np.abs(np.sin(th)) ** p) ** (-1 / p)
        xs = np.cos(th) * r * 0.62
        ys = np.sin(th) * r * 0.74 - 0.32
        ys = np.where(ys > -0.1, -0.1 + (ys + 0.1) * (1 - 0.18 * np.abs(np.cos(th))), ys)
        rgba(ctx, self.skin)
        poly(ctx, np.stack([xs, ys], 1))
        ctx.fill()
        # cheeks
        if self.blush > 0:
            for sx in (-1, 1):
                ctx.set_source(radial_gradient(sx * 0.36, -0.1, 0, 0.16, [(0, (0.95, 0.45, 0.42), self.blush), (1, (0.95, 0.45, 0.42), 0)]))
                circle(ctx, sx * 0.36, -0.1, 0.16)
                ctx.fill()
        lx, ly = st.get("look", (0, 0))
        # eyes
        open_ = clamp(st.get("eye_open", 1.0) * (1 - st.get("blink", 0.0)), 0.06, 1.3)
        for sx in (-1, 1):
            ex, ey = sx * 0.24 + lx * 0.03, -0.3 + ly * 0.02
            rgba(ctx, self.line)
            ellipse(ctx, ex, ey, 0.072, 0.098 * open_)
            ctx.fill()
            if open_ > 0.4:
                rgba(ctx, (1, 1, 1), 0.9)
                circle(ctx, ex + 0.022, ey - 0.03 * open_, 0.022)
                ctx.fill()
        # brows
        b, bt = st.get("brow", 0.0), st.get("brow_tilt", 0.0)
        ctx.set_line_width(0.055)
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        rgba(ctx, shade(self.hair, 0.05))
        for sx in (-1, 1):
            y0 = -0.5 - 0.06 * b
            ctx.move_to(sx * 0.13, y0 + sx * 0.0 + 0.04 * bt)
            ctx.curve_to(sx * 0.22, y0 - 0.05, sx * 0.3, y0 - 0.05, sx * 0.37, y0 + 0.01 - 0.05 * bt)
        ctx.stroke()
        # nose
        ctx.set_line_width(0.035)
        rgba(ctx, shade(self.skin, -0.25))
        ctx.move_to(0.02, -0.22)
        ctx.curve_to(0.05, -0.14, 0.04, -0.1, -0.02, -0.08)
        ctx.stroke()
        # mouth: smile line → open shape
        m, sm, mw = st.get("mouth", 0.0), st.get("smile", 0.3), st.get("mouth_w", 1.0)
        w = 0.14 * (0.85 + 0.3 * sm) * mw
        y = 0.04
        if m < 0.08:
            ctx.set_line_width(0.04)
            rgba(ctx, self.line)
            ctx.move_to(-w, y - 0.02 * sm)
            ctx.curve_to(-w * 0.4, y + 0.06 * sm + 0.01, w * 0.4, y + 0.06 * sm + 0.01, w, y - 0.02 * sm)
            ctx.stroke()
        else:
            h = 0.03 + 0.15 * m
            rgba(ctx, shade(self.line, 0.05))
            ctx.move_to(-w, y - 0.01)
            ctx.curve_to(-w * 0.5, y - 0.02 + 0.03 * sm * 0, w * 0.5, y - 0.02, w, y - 0.01)
            ctx.curve_to(w * 0.8, y + h, -w * 0.8, y + h, -w, y - 0.01)
            ctx.fill()
            # tongue hint
            if m > 0.4:
                rgba(ctx, (0.85, 0.42, 0.45))
                ellipse(ctx, 0, y + h * 0.62, w * 0.45, h * 0.25)
                ctx.fill()
            # teeth
            rgba(ctx, (1, 1, 1), 0.92)
            ctx.rectangle(-w * 0.62, y - 0.005, w * 1.24, min(0.035, h * 0.3))
            ctx.fill()
        self._hair_front(ctx)
        if self.glasses:
            ctx.set_line_width(0.035)
            rgba(ctx, self.line)
            for sx in (-1, 1):
                rrect(ctx, sx * 0.24 - 0.15, -0.42, 0.3, 0.22, 0.07)
                ctx.stroke()
            ctx.move_to(-0.09, -0.33)
            ctx.curve_to(-0.04, -0.37, 0.04, -0.37, 0.09, -0.33)
            ctx.stroke()

    def _hand(self, ctx, g):
        u = out_back(g, 1.4)
        ctx.save()
        ctx.translate(0.85, 0.5 - 0.95 * u)
        ctx.rotate(-0.35 + 0.15 * math.sin(g * 3))
        rgba(ctx, self.outfit)
        rrect(ctx, -0.17, 0.0, 0.34, 1.2, 0.17)
        ctx.fill()
        rgba(ctx, self.skin)
        ellipse(ctx, 0.0, -0.06, 0.18, 0.2)
        ctx.fill()
        rrect(ctx, -0.17, -0.42, 0.09, 0.32, 0.045)
        rrect(ctx, -0.06, -0.48, 0.09, 0.38, 0.045)
        rrect(ctx, 0.05, -0.44, 0.09, 0.34, 0.045)
        ctx.fill()
        ctx.restore()


class SpriteHost:
    """Authorised/generated PNG expressions {name: path} (transparent, bust framed like VectorHost:
    head top near the image top, desk/crop line at `desk_v` of image height).

    Motion is ONE transform of the whole sticker about its base (never a local warp): the voice
    drive (Speech.drive) stretches it up to ≈5 % and the spring rebounds; when speech stops it eases
    down into idle breathing (≈0.9 %) and a slow sway (≈±1.25°) on global time. Expressions are
    whole-image swaps cross-faded over 0.28 s. Optional differentials from the expression sheet:
    `<expr>_talk` (mouth open, used on loud frames, flapping on twos) and `<expr>_blink`."""

    def __init__(self, expressions, desk_v=0.92, head_v=0.04, amount=1.0):
        from .present import load_image
        self.img = {k: load_image(v) for k, v in expressions.items()}
        self.desk_v, self.head_v, self.amount = desk_v, head_v, amount

    def _variant(self, name, st):
        base = name if name in self.img else "neutral"
        if st.get("blink", 0) > 0.5 and f"{base}_blink" in self.img:
            return f"{base}_blink"
        t = st.get("t", 0.0)
        if f"{base}_talk" in self.img and st.get("talking") and st.get("level", 0) > 0.12 and int(t * 12) % 2 == 0:
            return f"{base}_talk"
        return base

    def transform(self, st):
        t, seed, d = st.get("t", 0.0), st.get("seed", 0), st.get("drive", 0.0)
        stretch = 0.05 * self.amount * d
        breathe = 0.009 * math.sin(t * 1.55 + seed * 1.7)
        sy = 1 + stretch + breathe
        sx = 1 - 0.55 * stretch - 0.35 * breathe
        rot = math.radians(1.25 * math.sin(t * 0.83 + seed * 2.1) + 0.9 * d * math.sin(t * 2.4 + seed))
        return sx, sy, rot

    def draw(self, ctx, x, y, height, st, facing=1):
        sx, sy, rot = self.transform(st)

        def one(name, a):
            im = self.img.get(self._variant(name, st)) or self.img.get("neutral") or next(iter(self.img.values()))
            ih = im.get_height() * (self.desk_v - self.head_v)
            s = height / ih
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(rot * facing)
            ctx.scale(s * facing * sx, s * sy)
            ctx.set_source_surface(im, -im.get_width() / 2, -im.get_height() * self.desk_v)
            ctx.paint_with_alpha(a)
            ctx.restore()
        cur, prev, mu = st.get("expr", "neutral"), st.get("expr_prev"), st.get("expr_mix", 1.0)
        if prev and prev != cur and mu < 1:
            one(prev, 1 - mu)
            one(cur, mu)
        else:
            one(cur, 1.0)


# ----------------------------------------------------------------------------- set
class NewsSet:
    """A designed vector studio in 1920×1080 design space.

    Geometry is chosen so the story screen sits ABOVE and BETWEEN the hosts (no host ever covers
    screen copy in the wide shot) and every camera framing is derived from the host anchors:

        set_ = NewsSet(pal, brand="CODE STUDIO")
        set_.anchors   {"a": (x, desk_y), "b": (x, desk_y)}   host feet-on-desk points
        set_.host_h    head-top → desk height used for hosts
        set_.shots()   {"wide", "two", "a", "b", "screen"} → rects for StudioCamera

    Screen content is authored as if FULL FRAME (1920×1080). draw_screen() maps it into the
    on-set screen, so the same function also renders the push-in and the full-frame graphic.
    """

    def __init__(self, pal, brand="VIDEO MASTER", desk_y=860, host_h=410, host_x=(500, 1420),
                 screen=(640, 130, 1280, 490)):
        self.p = pal
        self.brand = brand
        self.desk_y, self.host_h = desk_y, host_h
        self.anchors = {"a": (host_x[0], desk_y), "b": (host_x[1], desk_y)}
        self.screen = screen
        x0, y0, x1, y1 = screen
        assert abs((x1 - x0) / (y1 - y0) - 16 / 9) < 0.02, "screen rect must be 16:9"

    def shots(self, headroom=0.11, lead=0.11, tight=1.3):
        """Camera framings. Singles: head top at `headroom` of frame height, desk just in frame, and
        lead room on the side the host faces (hosts face the centre)."""
        d, hh = self.desk_y, self.host_h
        out = {"wide": (0, 0, 1920, 1080)}
        xa, xb = self.anchors["a"][0], self.anchors["b"][0]
        w2 = (xb - xa) + hh * 1.9
        h2 = w2 * 9 / 16
        cx2 = (xa + xb) / 2
        y1 = d + hh * 0.42
        out["two"] = (cx2 - w2 / 2, y1 - h2, cx2 + w2 / 2, y1)
        hs = (hh * tight) / (1 - headroom)
        ws = hs * 16 / 9
        for key, sgn in (("a", 1), ("b", -1)):
            x = self.anchors[key][0] + sgn * lead * ws
            top = d - hh - headroom * hs
            out[key] = (x - ws / 2, top, x + ws / 2, top + hs)
        # graphic framing: the screen fills ~75 % of the frame (upper-left), leaving a right gutter for
        # the speaker PIP and a clear bottom band for captions — nothing overlaps the evidence
        x0, y0, x1, y1 = self.screen
        w, h = x1 - x0, y1 - y0
        fw = w / 0.75
        fh = fw * 9 / 16
        fx0 = x0 - 0.035 * fw
        fy0 = y0 - 0.045 * fh
        out["screen"] = (fx0, fy0, fx0 + fw, fy0 + fh)
        out["screen_full"] = (x0, y0, x1, y1)
        return out

    def draw_back(self, ctx, t):
        p = self.p
        wall = shade(p.ground2, 0.06)
        ctx.set_source(linear_gradient(0, 0, 0, 1080, [(0, shade(wall, 0.1), 1), (0.7, wall, 1), (1, shade(wall, -0.25), 1)]))
        ctx.paint()
        # architectural fins with light strips (slow breathing, not blinking)
        for k, x in enumerate((110, 290, 1630, 1810)):
            rgba(ctx, shade(wall, -0.14))
            ctx.rectangle(x - 58, 60, 116, 900)
            ctx.fill()
            a = 0.55 + 0.2 * math.sin(t * 0.9 + k * 1.3)
            ctx.set_source(linear_gradient(0, 60, 0, 960, [(0, p.support, 0), (0.5, p.support, a), (1, p.support, 0)]))
            ctx.rectangle(x - 4, 90, 8, 840)
            ctx.fill()
        # floor
        ctx.set_source(linear_gradient(0, self.desk_y - 20, 0, 1080, [(0, shade(wall, -0.35), 1), (1, shade(wall, -0.55), 1)]))
        ctx.rectangle(0, self.desk_y - 20, 1920, 1100 - self.desk_y)
        ctx.fill()
        # screen glow + bezel
        x0, y0, x1, y1 = self.screen
        ctx.set_source(radial_gradient((x0 + x1) / 2, (y0 + y1) / 2, 80, 760, [(0, p.support, 0.22), (1, p.support, 0)]))
        ctx.paint()
        rgba(ctx, shade(p.ground2, -0.45))
        rrect(ctx, x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28, 12)
        ctx.fill()

    def draw_screen(self, ctx, t, content_fn, bg=None, sheen=True):
        """content_fn(ctx, t) draws a full-frame 1920×1080 graphic; it is mapped into the screen rect."""
        x0, y0, x1, y1 = self.screen
        ctx.save()
        rrect(ctx, x0, y0, x1 - x0, y1 - y0, 4)
        ctx.clip()
        ctx.translate(x0, y0)
        ctx.scale((x1 - x0) / 1920.0, (y1 - y0) / 1080.0)
        rgba(ctx, bg or shade(self.p.ground2, -0.25))
        ctx.paint()
        content_fn(ctx, t)
        if sheen:
            ctx.set_source(linear_gradient(0, 0, 1920, 1080, [(0, (1, 1, 1), 0.05), (0.45, (1, 1, 1), 0.0), (1, (1, 1, 1), 0.03)]))
            ctx.paint()
        ctx.restore()

    def draw_desk(self, ctx, t):
        p = self.p
        y = self.desk_y
        top = shade(p.ground, -0.04)
        ctx.move_to(170, y)
        ctx.curve_to(660, y - 20, 1260, y - 20, 1750, y)
        ctx.line_to(1790, y + 28)
        ctx.curve_to(1270, y + 10, 650, y + 10, 130, y + 28)
        ctx.close_path()
        rgba(ctx, top)
        ctx.fill()
        ctx.move_to(130, y + 28)
        ctx.curve_to(650, y + 10, 1270, y + 10, 1790, y + 28)
        ctx.line_to(1730, 1100)
        ctx.line_to(190, 1100)
        ctx.close_path()
        ctx.set_source(linear_gradient(0, y, 0, 1080, [(0, shade(p.ground2, -0.1), 1), (1, shade(p.ground2, -0.45), 1)]))
        ctx.fill()
        rgba(ctx, p.accent)
        ctx.move_to(150, y + 62)
        ctx.curve_to(650, y + 47, 1270, y + 47, 1770, y + 62)
        ctx.line_to(1766, y + 74)
        ctx.curve_to(1270, y + 59, 650, y + 59, 154, y + 74)
        ctx.close_path()
        ctx.fill()
        label(ctx, self.brand, 960, y + 132, shade(p.ground, -0.1), 0.85, 22, 800, "center", tracking=0.3)


def default_screen(title, pal, kicker="", role="display"):
    """Idle screen loop: brand title + slow moving bands. Replace with real evidence when a line needs it."""
    def fn(ctx, t):
        for k in range(7):
            x = (t * 60 + k * 330) % 2400 - 300
            ctx.set_source(linear_gradient(x, 0, x + 300, 0, [(0, pal.support, 0), (0.5, pal.support, 0.16), (1, pal.support, 0)]))
            poly(ctx, [(x, 0), (x + 220, 0), (x - 140, 1080), (x - 360, 1080)])
            ctx.fill()
        if kicker:
            label(ctx, kicker, 160, 420, pal.accent, 1.0, 34, 700, tracking=0.2, role="display")
        from .text import draw_text
        draw_text(ctx, role, title, 160, 580, 150, (1, 1, 1), 1.0, {"wght": 800})
    return fn


# ----------------------------------------------------------------------------- camera grammar
class StudioCamera:
    """Shot list [(t, name, 'cut'|'move')] → camera transform. Moves ease (io_cubic, move_dur);
    cuts are instant and should land 0.1–0.25 s BEFORE the line starts (speaker already framed).
    A tiny operator drift keeps static shots alive."""

    def __init__(self, shots, frames, move_dur=0.7, drift=1.0, w=1920, h=1080):
        self.shots = sorted(shots, key=lambda s: s[0])
        self.frames = frames
        self.move_dur, self.drift, self.w, self.h = move_dur, drift, w, h

    def _seg(self, t):
        idx = 0
        for i, (ts, nm, md) in enumerate(self.shots):
            if ts <= t:
                idx = i
        ts, nm, md = self.shots[idx]
        cur = self.frames[nm]
        pname = self.shots[idx - 1][1] if idx > 0 else nm
        # a move starts from wherever the camera was (possibly mid-move): one recursion per chained move
        prev = self.rect_at(ts - 1e-6) if (md == "move" and idx > 0) else cur
        return prev, cur, ts, md, nm, pname

    def rect_at(self, t):
        prev, cur, t0, mode, name, pname = self._seg(t)
        if mode == "move":
            u = io_cubic(prog(t, t0, t0 + self.move_dur))
            return tuple(lerp(a, b, u) for a, b in zip(prev, cur))
        return cur

    def name_at(self, t):
        return self._seg(t)[4]

    def focus(self, t, name):
        """How fully the camera is on shot `name` (0..1), including the move in/out."""
        prev, cur, t0, mode, nm, pname = self._seg(t)
        u = io_cubic(prog(t, t0, t0 + self.move_dur)) if mode == "move" else 1.0
        if nm == name:
            return u if pname != name else 1.0
        if pname == name:
            return 1 - u
        return 0.0

    def apply(self, ctx, t):
        x0, y0, x1, y1 = self.rect_at(t)
        s = min(self.w / (x1 - x0), self.h / (y1 - y0))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        dx = self.drift * 3 * noise1(t * 0.25, 11)
        dy = self.drift * 2 * noise1(t * 0.21, 17)
        ctx.translate(self.w / 2 + dx, self.h / 2 + dy)
        ctx.scale(s, s)
        ctx.translate(-cx, -cy)
        return s


def auto_shots(speech, host_keys=("a", "b"), lead=0.18, open_shot="wide", single_min=2.2):
    """Shot list from the script: open wide, singles on longer lines, two-shot for quick exchanges,
    a move to 'screen' for lines with media, and a move back to wide after the last line.
    Line.speaker must be a key in host_keys for singles."""
    shots = [(0.0, open_shot, "cut")]
    for i, ln in enumerate(speech.lines):
        t = max(0.0, ln.t0 - lead)
        last = shots[-1][1]
        if ln.media:
            if last != "screen":
                shots.append((t, "screen", "move"))
        elif ln.t1 - ln.t0 > single_min and ln.speaker in host_keys:
            shots.append((t, ln.speaker, "move" if last == "screen" else "cut"))
        elif last != "two":
            shots.append((t, "two", "move" if last in ("wide", "screen") else "cut"))
    shots.append((speech.end + 0.2, "wide", "move"))
    return shots


class Show:
    """Baseline director for a two-host programme. Correct by default; override pieces as needed.

        show = Show(film, speech, set_, hosts={"a": HostSpec(...), "b": HostSpec(...)},
                    screens={"chart": chart_fn}, idle_screen=default_screen("本期主题", pal))
        @film.chapter(0, film.duration, "SHOW")
        def draw(ctx, t, ch): show.draw(ctx, t)

    What it does for you: camera grammar from the script (auto_shots), screen push-in that ends on a
    full-frame graphic with the speaker in a PIP, hosts fading out of the way of screen copy, captions
    in a fixed zone, lower thirds on each host's first line, LIVE bug, optional ticker.
    """

    def __init__(self, film, speech, set_, hosts, screens=None, idle_screen=None, shots=None, captions=True,
                 caption_zone=(330, 900, 1590, 1040), lower_thirds=True, bug=True, ticker_text=None, move_dur=0.7,
                 pip_rect=(1500, 560, 1860, 763), caption_max_hold=2.0, caption_tail=0.6):
        # caption_max_hold: pauses longer than this are deliberate beats, so the caption clears;
        # normal turn gaps (0.25–0.45 s) hold it. caption_tail: hold after the final line.
        self.caption_max_hold, self.caption_tail = caption_max_hold, caption_tail
        self.f, self.sp, self.set, self.hosts = film, speech, set_, hosts
        self.screens = screens or {}
        self.idle = idle_screen or default_screen(set_.brand, set_.p)
        self.cam = StudioCamera(shots or auto_shots(speech, tuple(hosts)), set_.shots(), move_dur)
        self.captions, self.caption_zone = captions, caption_zone
        self.lower_thirds, self.bug, self.ticker_text = lower_thirds, bug, ticker_text
        self.pip_rect = pip_rect
        self._first = {}
        for ln in speech.lines:
            self._first.setdefault(ln.speaker, ln)

    def screen_fn(self, t):
        """Media of the line that is (or was last) on the screen; idle loop otherwise."""
        cur = None
        for ln in self.sp.lines:
            if ln.media and ln.t0 - 0.6 <= t:
                cur = ln
        if cur is not None and cur.media in self.screens:
            return self.screens[cur.media]
        return self.idle

    def _world(self, ctx, t, host_alpha=1.0):
        self.set.draw_back(ctx, t)
        self.set.draw_screen(ctx, t, lambda c, tt: self.screen_fn(t)(c, tt))
        for key, spec in self.hosts.items():
            x, y = self.set.anchors[key]
            st = spec.perf.state(t)
            if host_alpha < 1:
                ctx.push_group()
                spec.host.draw(ctx, x, y, self.set.host_h, st, spec.facing)
                ctx.pop_group_to_source()
                ctx.paint_with_alpha(host_alpha)
            else:
                spec.host.draw(ctx, x, y, self.set.host_h, st, spec.facing)
        self.set.draw_desk(ctx, t)

    def draw(self, ctx, t):
        W, H = self.f.width, self.f.height
        from .draw import fill_bg
        fill_bg(ctx, (0, 0, 0))
        fs = self.cam.focus(t, "screen")
        ctx.save()
        ctx.scale(W / 1920.0, H / 1080.0)
        ctx.save()
        self.cam.apply(ctx, t)
        self._world(ctx, t, host_alpha=1 - smooth(fs / 0.6))
        ctx.restore()
        ln = self.sp.held(t)
        # PIP: the speaker of the held line while the screen owns the frame — it stays through the
        # pause and changes when the next line starts (no default host in gaps).
        if fs > 0.6:
            spk = ln.speaker if ln else None
            if spk in self.hosts:
                k = self.set.shots(headroom=0.1, lead=0.0, tight=0.95)[spk]     # PIP = close-up
                def inset(c, rect, key=spk, sh=k):
                    x0, y0, x1, y1 = rect
                    s = (x1 - x0) / (sh[2] - sh[0])
                    c.translate(x0, y0)
                    c.scale(s, s)
                    c.translate(-sh[0], -sh[1])
                    self._world(c, t)
                pip(ctx, self.pip_rect, inset, prog(fs, 0.6, 1.0), border=self.set.p.ground)
        # lower thirds: each host's first line, never during the screen shot
        if self.lower_thirds:
            for key, spec in self.hosts.items():
                fl = self._first.get(key)
                if fl and spec.name:
                    ctx.push_group()
                    lower_third(ctx, t, fl.t0 + 0.15, min(fl.t1, fl.t0 + 3.2), 110, 800, spec.name, spec.role,
                                spec.color, size=38)
                    ctx.pop_group_to_source()
                    ctx.paint_with_alpha(1 - fs)
        if self.captions and ln is not None:
            # Hold the caption until the next line (or `caption_tail` after the last one);
            # consecutive lines swap text on a plate that stays up.
            order = sorted(self.sp.lines, key=lambda l: l.t0)
            i = order.index(ln)
            nxt = order[i + 1] if i + 1 < len(order) else None
            prv = order[i - 1] if i > 0 else None
            close = nxt is None or nxt.t0 - ln.t1 > self.caption_max_hold
            until = (ln.t1 + self.caption_tail) if nxt is None else (
                ln.t1 + 0.2 if close else nxt.t0)
            spec = self.hosts.get(ln.speaker)
            caption(ctx, t, ln, self.caption_zone, speaker_col=spec.color if spec else self.set.p.accent,
                    until=until, fade_in=prv is None or ln.t0 - prv.t1 > self.caption_max_hold, fade_out=close)
        if self.bug:
            live_bug(ctx, t, 1740, 52, self.set.p.accent)
        if self.ticker_text:
            ticker(ctx, t, self.ticker_text, 1040, 1920, 40, shade(self.set.p.ground2, -0.3), (1, 1, 1),
                   self.set.p.accent)
        ctx.restore()


class HostSpec:
    def __init__(self, host, perf, name="", role="", color=(0.9, 0.35, 0.2), facing=1):
        self.host, self.perf, self.name, self.role, self.color, self.facing = host, perf, name, role, color, facing


# ----------------------------------------------------------------------------- broadcast graphics
def lower_third(ctx, t, t_in, t_out, x, y, name, role, accent, text=(1, 1, 1), plate=(0.08, 0.09, 0.1),
                size=34, w=None):
    """Bar wipes in → name rises → role fades; exits faster than it entered."""
    if t < t_in or t > t_out + 0.4:
        return
    fc = face_for(name, "display")
    run = Run(fc, name, size, {"wght": 760})
    w = w or max(run.advance + size * 1.6, 360)
    u = SNAP(prog(t, t_in, t_in + 0.5))
    o = io_cubic(prog(t, t_out, t_out + 0.3))
    wid = w * u * (1 - o)
    if wid <= 1:
        return
    h1, h2 = size * 1.55, size * 0.95
    rgba(ctx, accent)
    ctx.rectangle(x, y - h1, 10, h1 + h2)
    ctx.fill()
    rgba(ctx, plate, 0.92)
    ctx.rectangle(x + 10, y - h1, wid, h1)
    ctx.fill()
    rgba(ctx, accent, 0.95)
    ctx.rectangle(x + 10, y, wid * 0.82, h2)
    ctx.fill()
    ctx.save()
    ctx.rectangle(x + 10, y - h1, wid, h1 + h2)
    ctx.clip()
    k = out_expo(prog(t, t_in + 0.15, t_in + 0.6))
    ctx.new_path()
    run.path(ctx, x + 10 + size * 0.6, y - h1 * 0.3 + (1 - k) * h1)
    rgba(ctx, text)
    ctx.fill()
    label(ctx, role.upper(), x + 10 + size * 0.6, y + h2 * 0.7, text, out_cubic(prog(t, t_in + 0.3, t_in + 0.7)),
          size * 0.5, 700, tracking=0.12)
    ctx.restore()


def caption(ctx, t, line, rect, col=(1, 1, 1), plate=(0.06, 0.07, 0.08), plate_a=0.78, size=34, speaker_col=None,
            speaker_name=None, role="cjk_regular", max_lines=2, until=None, fade_in=True, fade_out=True):
    """Utterance-level subtitle plate (no fake word timing).
    rect = (x0, y0, x1, y1) caption zone (keep it clear of faces and screen copy).
    `until`: display end. Pass the next line's start so the caption HOLDS through the pause
    (silence is not "no content"); default ends 0.2 s after the audio. Between consecutive
    lines use fade_out=False on the old one and fade_in=False on the new one: the plate stays
    up and only the text swaps, instead of flickering."""
    if line is None:
        return
    end = line.t1 + 0.2 if until is None else until
    if not (line.t0 - (0.05 if fade_in else 0.0) <= t < end):
        return
    a = prog(t, line.t0 - 0.05, line.t0 + 0.07) if fade_in else 1.0
    if fade_out:
        a = min(a, 1 - prog(t, end - 0.12, end))
    x0, y0, x1, y1 = rect
    fc = face_for(line.text, role)
    lines = wrap(fc, line.text, size, x1 - x0 - size * 2)[-max_lines:]
    lh = size * 1.45
    h = lh * len(lines) + size * 0.8
    yy = y1 - h
    rgba(ctx, plate, plate_a * a)
    rrect(ctx, x0, yy, x1 - x0, h, 10)
    ctx.fill()
    if speaker_col is not None:
        rgba(ctx, speaker_col, a)
        rrect(ctx, x0, yy, 8, h, 4)
        ctx.fill()
    for i, ln in enumerate(lines):
        run = Run(fc, ln, size)
        ctx.new_path()
        run.path(ctx, (x0 + x1) / 2 - run.advance / 2, yy + size * 0.4 + lh * (i + 0.78))
        rgba(ctx, col, a)
        ctx.fill()
    if speaker_name:
        label(ctx, speaker_name, x0 + 22, yy - 10, speaker_col or col, a, 14, 700, tracking=0.12)


def pip(ctx, rect, draw_fn, u=1.0, border=(1, 1, 1), radius=18):
    """Picture-in-picture inset (e.g. the speaking host while the screen is full-frame)."""
    if u <= 0:
        return
    x0, y0, x1, y1 = rect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    s = out_back(u, 1.6)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(s, s)
    ctx.translate(-cx, -cy)
    rgba(ctx, (0, 0, 0), 0.25)
    rrect(ctx, x0 + 6, y0 + 10, x1 - x0, y1 - y0, radius)
    ctx.fill()
    ctx.save()
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, radius)
    ctx.clip()
    draw_fn(ctx, rect)
    ctx.restore()
    ctx.set_line_width(4)
    rgba(ctx, border)
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, radius)
    ctx.stroke()
    ctx.restore()


def ticker(ctx, t, text, y, w, h, bg, fg, accent, tag="NEWS", speed=120, size=None, role="cjk_regular"):
    size = size or h * 0.48
    rgba(ctx, bg)
    ctx.rectangle(0, y, w, h)
    ctx.fill()
    rgba(ctx, accent)
    ctx.rectangle(0, y, h * 2.4, h)
    ctx.fill()
    label(ctx, tag, h * 1.2, y + h * 0.64, fg, 1, size * 0.8, 800, "center", role="display", tracking=0.1)
    fc = face_for(text, role)
    run = Run(fc, text + "     ·     ", size)
    off = (t * speed) % run.advance
    ctx.save()
    ctx.rectangle(h * 2.4, y, w, h)
    ctx.clip()
    x = h * 2.4 + 24 - off
    while x < w:
        ctx.new_path()
        run.path(ctx, x, y + h * 0.66)
        rgba(ctx, fg)
        ctx.fill()
        x += run.advance
    ctx.restore()


def live_bug(ctx, t, x, y, accent, text="LIVE", fg=(1, 1, 1)):
    a = 0.6 + 0.4 * (0.5 + 0.5 * math.cos(t * math.tau * 0.8))
    rgba(ctx, accent)
    rrect(ctx, x, y, 92, 34, 6)
    ctx.fill()
    rgba(ctx, fg, a)
    circle(ctx, x + 18, y + 17, 6)
    ctx.fill()
    label(ctx, text, x + 32, y + 24, fg, 1, 16, 800, tracking=0.12, role="display")
