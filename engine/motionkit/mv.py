"""MV kit — music-led films: measured beat grids from real songs, energy curves, sections, and
kinetic word/lyric cards. (references/craft/genre-mv.md)

    trk = mv.analyze_track("audio/song.wav")          # measured, not assumed
    print(trk.report())                               # bpm, confidence, offset, sections
    film = mk.Film("mv", 1920, 1080, 60, trk.duration, bpm=trk.bpm)
    film.grid.offset = trk.offset                     # bar 0 starts on the measured downbeat phase
    energy = trk.energy_at(t)                         # 0..1 smoothed loudness for reactive layers
    for s in trk.sections: film.chapter(s.t0, s.t1, s.label)(...)

    words = mv.WordCards([("EVERY", g.beat(0)), ("FRAME", g.beat(1)), ...], style="slam")
    words.draw(ctx, t, pal)

Honesty rules: report confidence; if it is low (< 0.35) or the song has tempo changes, say so and
place key events by listening/tapping or from time-coded lyrics. Never claim word-level lyric sync
without time-coded lyrics.
"""
import math

import numpy as np
from scipy import signal

from .ease import SNAP, clamp, io_cubic, lerp, out_back, out_expo, prog, spring
from .text import Run, face, face_for


class Section:
    def __init__(self, t0, t1, label, energy):
        self.t0, self.t1, self.label, self.energy = t0, t1, label, energy

    def __repr__(self):
        return "Section(%.2f–%.2f %s e=%.2f)" % (self.t0, self.t1, self.label, self.energy)


class Track:
    def __init__(self, path, sr, duration, bpm, offset, confidence, beats, downbeats, env_t, env, onset_t, onset,
                 sections):
        self.path, self.sr, self.duration = path, sr, duration
        self.bpm, self.offset, self.confidence = bpm, offset, confidence
        self.beats, self.downbeats = beats, downbeats
        self.env_t, self.env = env_t, env
        self.onset_t, self.onset = onset_t, onset
        self.sections = sections

    def energy_at(self, t):
        return float(np.interp(t, self.env_t, self.env))

    def onset_at(self, t, width=0.05):
        """Onset strength near t (0..1) — drive flashes/cuts from the song's real transients."""
        m = np.abs(self.onset_t - t) < width
        return float(self.onset[m].max()) if m.any() else 0.0

    def nearest_beat(self, t):
        return float(self.beats[np.argmin(np.abs(self.beats - t))]) if len(self.beats) else t

    def strong_onsets(self, top=16, min_gap=0.25):
        idx = np.argsort(self.onset)[::-1]
        out = []
        for i in idx:
            tt = float(self.onset_t[i])
            if all(abs(tt - o) >= min_gap for o in out):
                out.append(tt)
            if len(out) >= top:
                break
        return sorted(out)

    def report(self):
        lines = ["track %s  %.2fs" % (self.path, self.duration),
                 "tempo %.2f BPM (measured %.2f, confidence %.2f%s)  downbeat phase %.3fs" % (
                     self.bpm, getattr(self, "bpm_measured", self.bpm), self.confidence, "" if self.confidence >= 0.35 else " — LOW: verify by listening",
                     self.offset),
                 "beats %d  bars ~%d" % (len(self.beats), len(self.downbeats))]
        for s in self.sections:
            lines.append("  section %-8s %7.2f – %7.2f  energy %.2f" % (s.label, s.t0, s.t1, s.energy))
        return "\n".join(lines)


def _load_mono(path):
    from .audio.mix import load_wav, SR
    if path.lower().endswith((".mp3", ".m4a", ".aac", ".mp4", ".flac", ".ogg")):
        import subprocess
        import tempfile
        from .cli import ffmpeg_bin
        tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run([ffmpeg_bin(), "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SR), tmp], check=True)
        path = tmp
    return load_wav(path), SR


def analyze_track(path, bpm_range=(70, 180), beats_per_bar=4, prior_bpm=120.0):
    """Estimate tempo (autocorrelation of spectral flux), beat phase, downbeats, energy and sections."""
    x, sr = _load_mono(path)
    hop = 512
    f, tt, Z = signal.stft(x, sr, nperseg=2048, noverlap=2048 - hop)
    mag = np.log1p(np.abs(Z) * 10)
    flux = np.maximum(np.diff(mag, axis=1), 0).sum(0)
    flux = np.concatenate([[0], flux])
    flux = flux - signal.medfilt(flux, 31)
    flux = np.maximum(flux, 0)
    flux /= flux.max() + 1e-9
    fr = sr / hop
    # tempo by autocorrelation with a log-normal prior around prior_bpm
    ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
    lags = np.arange(len(ac))
    best, best_s, scores = None, -1, []
    for bpm in np.arange(bpm_range[0], bpm_range[1] + 0.01, 0.25):
        lag = fr * 60.0 / bpm
        v = 0.0
        for mult in (1, 2, 4):
            L = lag * mult
            if L < len(ac) - 1:
                i = int(L)
                v += (ac[i] * (1 - (L - i)) + ac[i + 1] * (L - i)) / mult
        w = math.exp(-0.5 * (math.log2(bpm / prior_bpm) / 0.9) ** 2)
        scores.append((v * w, bpm))
        if v * w > best_s:
            best_s, best = v * w, bpm
    sc = np.array([s for s, _ in scores])
    conf = float((best_s - np.median(sc)) / (best_s + 1e-9))
    # refine tempo + phase jointly with a comb over the onset curve (0.01 BPM steps)
    pos = np.arange(len(flux))

    def comb(bpm_):
        per = fr * 60.0 / bpm_
        nb_ = int(len(flux) / per)
        best_v, best_p = -1.0, 0.0
        for p in np.linspace(0, per, 48, endpoint=False):
            v = np.interp(p + np.arange(nb_) * per, pos, flux).sum() / max(1, nb_)
            if v > best_v:
                best_v, best_p = v, p
        return best_v, best_p
    cands = [(comb(b)[0], b) for b in np.arange(best - 0.75, best + 0.76, 0.01)]
    measured = float(max(cands)[1])
    best = float(round(measured)) if abs(measured - round(measured)) <= 0.3 else measured   # produced music: integer BPM
    period = fr * 60.0 / best
    nb = int(len(flux) / period)
    ph = comb(best)[1]
    beat_t = (ph + np.arange(nb) * period) / fr
    beat_t = beat_t[beat_t < len(x) / sr]
    # downbeat: chords usually change on "one" (harmonic novelty), kicks/bass hit it hardest (low onsets)
    low = np.maximum(np.diff(mag[f < 200], axis=1), 0).sum(0)
    low = np.concatenate([[0], low])
    idx = np.clip((beat_t * fr).astype(int), 0, len(low) - 1)
    band = (f > 55) & (f < 2000)
    pc = np.round(12 * np.log2(f[band] / 440.0)).astype(int) % 12
    chroma = np.zeros((12, mag.shape[1]))
    for k in range(12):
        chroma[k] = mag[band][pc == k].sum(0)
    chroma /= chroma.sum(0, keepdims=True) + 1e-9
    beat_chroma = np.stack([chroma[:, idx[i]:idx[i + 1]].mean(1) if i + 1 < len(idx) and idx[i + 1] > idx[i]
                            else chroma[:, idx[i]] for i in range(len(idx))], 1)
    nov = np.zeros(len(idx))
    for i in range(2, len(idx) - 2):
        a = beat_chroma[:, i - 2:i].mean(1)
        b = beat_chroma[:, i:i + 2].mean(1)
        nov[i] = 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
    low_b = low[idx]
    sh = np.array([nov[k::beats_per_bar].sum() for k in range(beats_per_bar)])
    sl = np.array([low_b[k::beats_per_bar].sum() for k in range(beats_per_bar)])
    score = sh / (sh.max() + 1e-9) + 0.5 * sl / (sl.max() + 1e-9)
    best_k = int(np.argmax(score))
    down = beat_t[best_k::beats_per_bar]
    bar_s = 60.0 / best * beats_per_bar
    first = float(down[0]) if len(down) else float(beat_t[0])
    offset = ((first + bar_s / 2) % bar_s) - bar_s / 2        # the downbeat nearest t=0 (may be slightly < 0)
    # energy envelope (60 Hz, smoothed 0.15 s)
    hop2 = sr // 60
    n2 = len(x) // hop2
    env = np.array([np.sqrt((x[i * hop2:(i + 1) * hop2] ** 2).mean()) for i in range(n2)])
    env = np.convolve(env, np.ones(9) / 9, "same")
    env = env / (np.percentile(env, 98) + 1e-9)
    env_t = np.arange(n2) / 60.0
    # sections: novelty on 2-bar energy, snapped to downbeats
    bar = 60.0 / best * beats_per_bar
    sec_e = []
    for d in down:
        m = (env_t >= d) & (env_t < d + bar)
        sec_e.append(float(env[m].mean()) if m.any() else 0.0)
    sec_e = np.array(sec_e)
    bounds = [0]
    for i in range(2, len(sec_e) - 1):
        if abs(sec_e[i] - sec_e[i - 1]) > 0.18 and i - bounds[-1] >= 2:
            bounds.append(i)
    bounds.append(len(down))
    sections = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        e = float(sec_e[a:b].mean()) if b > a else 0.0
        t0 = 0.0 if a == 0 else float(down[a])
        t1 = float(down[b]) if b < len(down) else len(x) / sr
        sections.append(Section(t0, t1, "", e))
    if sections:
        es = sorted(s.energy for s in sections)
        for s in sections:
            r = es.index(s.energy) / max(1, len(es) - 1)
            s.label = "peak" if r > 0.75 else "build" if r > 0.4 else "calm"
        sections[0].label = "intro" if sections[0].energy < np.median(es) else sections[0].label
    trk = Track(path, sr, len(x) / sr, round(float(best), 2), offset, round(conf, 3), beat_t, down, env_t, env,
                np.arange(len(flux)) / fr, flux, sections)
    trk.bpm_measured = round(measured, 2)
    return trk


# ----------------------------------------------------------------------------- kinetic word cards
STYLES = ("slam", "rise", "stretch", "type", "split", "scale")


class WordCards:
    """One word (or short phrase) per beat, centred, each with an entrance that reads in < 0.15 s.

    words: [(text, t_in), ...] (t_out = next t_in). style: one of STYLES or a list cycling per word.
    Use for lyric hooks and title beats; keep body copy elsewhere. Size auto-fits to max_w.
    """

    def __init__(self, words, style="slam", role="display", max_w=1500, max_size=360, wght=820, wdth=None,
                 center=(960, 540), tracking=-0.01):
        self.words = words
        self.style = style
        self.role, self.max_w, self.max_size, self.wght, self.wdth = role, max_w, max_size, wght, wdth
        self.center, self.tracking = center, tracking

    def _style(self, i):
        return self.style[i % len(self.style)] if isinstance(self.style, (list, tuple)) else self.style

    def active(self, t):
        cur = None
        for i, (w, t0) in enumerate(self.words):
            if t >= t0:
                cur = i
        return cur

    def draw(self, ctx, t, col, accent=None, exit_dur=0.06):
        i = self.active(t)
        if i is None:
            return
        word, t0 = self.words[i]
        t1 = self.words[i + 1][1] if i + 1 < len(self.words) else None
        fc = face_for(word, self.role)
        var = {"wght": self.wght}
        if self.wdth and "wdth" in fc.axes:
            var["wdth"] = self.wdth
        size = self.max_size
        run = Run(fc, word, size, var, self.tracking)
        if run.ink_w > self.max_w:
            size *= self.max_w / run.ink_w
            run = Run(fc, word, size, var, self.tracking)
        st = self._style(i)
        local = t - t0
        cx, cy = self.center
        x = cx - (run.ink0 + run.ink1) / 2
        y = cy + run.cap / 2
        a = 1.0
        if t1 is not None and t > t1 - exit_dur:
            a = 1 - prog(t, t1 - exit_dur, t1)
        ctx.save()
        if st == "slam":
            s = lerp(1.6, 1.0, out_expo(prog(local, 0, 0.12)))
            ctx.translate(cx, cy)
            ctx.scale(s, s)
            ctx.translate(-cx, -cy)
            run.path(ctx, x, y)
        elif st == "rise":
            ctx.rectangle(0, y - run.cap - 20, 4000, run.cap + 40)
            ctx.clip()
            u = SNAP(prog(local, 0, 0.35))
            run.path(ctx, x, y + (1 - u) * run.cap * 1.2,
                     lambda g: {"dy": (1 - SNAP(prog(local, 0.02 * g["idx"], 0.3 + 0.02 * g["idx"]))) * run.cap * 1.2})
        elif st == "stretch" and "wdth" in fc.axes:
            lo, _, hi = fc.axes["wdth"]
            wd = lerp(lo, var.get("wdth", hi), out_expo(prog(local, 0, 0.3)))
            v2 = dict(var, wdth=wd)
            r2 = Run(fc, word, size, v2, self.tracking)
            r2.path(ctx, cx - (r2.ink0 + r2.ink1) / 2, y)
        elif st == "type":
            n = int(len(word) * clamp(local / max(0.04 * len(word), 1e-3)) + 0.999)
            r2 = Run(fc, word[:n], size, var, self.tracking)
            r2.path(ctx, x, y)
        elif st == "split":
            u = io_cubic(prog(local, 0, 0.18))
            mid = (run.ink0 + run.ink1) / 2

            def pg(g):
                c = (g["ink0"] + g["ink1"]) / 2
                return {"dx": (1 - u) * (c - mid) * 0.6}
            run.path(ctx, x, y, pg)
        else:  # scale pop with overshoot per glyph
            def pg(g):
                k = out_back(prog(local, 0.025 * g["idx"], 0.22 + 0.025 * g["idx"]), 2.2)
                ox, oy = run.pivot_center(g)
                return {"sx": k, "sy": k, "ox": ox, "oy": oy, "skip": k <= 0.01}
            run.path(ctx, x, y, pg)
        ctx.set_source_rgba(col[0], col[1], col[2], a)
        ctx.fill()
        if accent is not None and st in ("slam", "scale"):
            u = out_expo(prog(local, 0.04, 0.3))
            ctx.set_source_rgba(accent[0], accent[1], accent[2], a)
            ctx.rectangle(x + run.ink0, y + 26, run.ink_w * u, 10)
            ctx.fill()
        ctx.restore()


def beat_strobe(t, grid, decay=0.09, every=1, div=1):
    """1 on every `every`-th beat (div=2 → eighths) decaying; use for flashes, scale bumps, palette swaps."""
    n = grid.beat_index(t) * div
    k = math.floor(n)
    if k % every:
        return 0.0
    return math.exp(-(n - k) * grid.beat_s / div / decay)
