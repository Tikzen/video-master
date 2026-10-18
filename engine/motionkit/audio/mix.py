"""Score: buses, placement on the film clock, sidechain, reverb, voice ducking, dynamics, limiter.

    from motionkit.audio import Score, synth as s
    sc = Score(film)                                    # duration/grid from the film
    sc.kick(g.beat(8))                                  # drums bus + sidechain trigger
    sc.add(s.bounce(s.nt("D5")), ev["land1"], "fx", pan=-0.3, send=0.35)
    sc.pad(s.chord(["D3","F3","A3","C4"]), g.bar(0), g.bar_s * 2, cutoff=700, level=0.32)
    sc.voice("audio/voice/line01.wav", 2.10)            # narration bus, music ducks under it
    sc.section(g.bar(2), g.bar(4), 0.74)                # quieter build so the drop lands
    sc.breath(g.bar(4), 0.05)                           # 50 ms near-silence before the drop
    sc.render("audio/score.wav")                        # + audio/stems/*.wav, prints loudness

Mix bus defaults are tuned for laptop/phone speakers: bass high-passed at 42 Hz, kick has a mid
knock, master limited to −1 dBFS with ~-12 dBFS RMS for energetic pieces (use target_rms=-16 for
explainers/narration so speech stays dominant).
"""
import json
import math
import os

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

from . import synth as s

SR = s.SR
BUSES = ("drums", "bass", "pad", "lead", "fx", "voice")


class Score:
    def __init__(self, film=None, duration=None, tail=3.0):
        self.film = film
        self.duration = duration or film.duration
        self.n = int(round(self.duration * SR))
        self.buf = {b: np.zeros((self.n + int(tail * SR), 2)) for b in BUSES}
        self.send = np.zeros((self.n + int(tail * SR), 2))
        self.kicks = []
        self.voice_spans = []
        self.sections = []
        self.breaths = []
        self.placed = []          # (t, bus, tag) for QA

    # ------------------------------------------------------------------ placement
    def add(self, x, t, bus="fx", gain=1.0, pan=0.0, send=0.0, tag=None):
        x = np.asarray(x, float)
        st = x if x.ndim == 2 else s.pan(x, pan)
        st = st * gain
        i0 = int(round(t * SR))
        if i0 < 0:
            st = st[-i0:]
            i0 = 0
        L = min(len(st), len(self.buf[bus]) - i0)
        if L <= 0:
            return
        self.buf[bus][i0:i0 + L] += st[:L]
        if send:
            self.send[i0:i0 + L] += st[:L] * send
        self.placed.append((float(t), bus, tag))

    def kick(self, t, punch=1.0, gain=0.95, sidechain=True):
        self.add(s.kick(punch), t, "drums", gain, tag="kick")
        if sidechain:
            self.kicks.append(float(t))

    def pad(self, freqs, t, length, cutoff=2400, level=0.45, attack=0.05, release=0.3, send=0.35):
        self.add(s.supersaw(freqs, length, cutoff, level, attack, release), t, "pad", send=send, tag="pad")

    def seq(self, times, make, bus="fx", gain=1.0, pans=None, send=0.0, tag=None):
        for k, tk in enumerate(times):
            self.add(make(k), tk, bus, gain, pans[k % len(pans)] if pans else 0.0, send, tag)

    def voice(self, path_or_array, t, gain=1.0, pan=0.0, duck=0.35):
        """Place narration. Music/fx/pad/lead duck by `duck` (linear gain) under it."""
        x = load_wav(path_or_array) if isinstance(path_or_array, str) else np.asarray(path_or_array, float)
        self.add(x, t, "voice", gain, pan, send=0.05, tag="voice")
        self.voice_spans.append((float(t), float(t) + len(x) / SR, duck))
        return len(x) / SR

    def section(self, t0, t1, gain, ramp=0.05):
        self.sections.append((t0, t1, gain, ramp))

    def breath(self, t, length=0.05, depth=0.1):
        """Near-silence right before t (pre-drop gap). Dramatically increases perceived impact."""
        self.breaths.append((t - length, t - 0.004, depth))

    # ------------------------------------------------------------------ mixdown
    def _sidechain(self, n):
        sc = np.ones(n)
        tv = np.arange(n) / SR
        for k in self.kicks:
            i0 = int(k * SR)
            m = slice(i0, min(n, i0 + int(0.3 * SR)))
            sc[m] = np.minimum(sc[m], 1 - 0.62 * np.exp(-(tv[m] - k) / 0.09))
        return sc[:, None]

    def _duck(self, n):
        g = np.ones(n)
        for (a, b, d) in self.voice_spans:
            i0, i1 = int((a - 0.08) * SR), int((b + 0.25) * SR)
            ramp = int(0.08 * SR)
            idx = np.arange(max(0, i0), min(n, i1))
            if len(idx) == 0:
                continue
            w = np.ones(len(idx)) * d
            up = np.clip((idx - i0) / ramp, 0, 1)
            down = np.clip((i1 - idx) / (ramp * 3), 0, 1)
            w = 1 - (1 - d) * np.minimum(up, down)
            g[idx] = np.minimum(g[idx], w)
        return g[:, None]

    def render(self, path="audio/score.wav", stems=True, target_peak_db=-1.0, drive_db=3.5, reverb=2.4,
               fade_out=0.03, hp_bass=42, target_rms_db=None, max_drive_db=9.0):
        """target_rms_db: about -12 for energetic MV/showreels, -16 for narration-led studio/explainers,
        -18 for calm product/report beds under voice. None keeps the fixed drive_db."""
        n = self.n
        root = self.film.root if self.film else os.getcwd()
        path = path if os.path.isabs(path) else os.path.join(root, path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        sc = self._sidechain(n)
        dk = self._duck(n)
        B = {k: v[:n] for k, v in self.buf.items()}
        B["bass"] = s.hp(B["bass"], hp_bass) * sc * dk
        B["pad"] = s.hp(B["pad"], 120) * sc * dk
        B["lead"] = s.hp(B["lead"], 150) * (0.5 + 0.5 * sc) * dk
        B["fx"] = B["fx"] * (0.6 + 0.4 * dk)
        B["drums"] = B["drums"] * (0.5 + 0.5 * dk)
        B["voice"] = s.hp(B["voice"], 80)
        wet = np.zeros((n, 2))
        if reverb:
            ir = make_ir(reverb)
            srcs = self.send[:n] + B["pad"] * 0.35 + B["lead"] * 0.4
            for ch in range(2):
                wet[:, ch] = signal.fftconvolve(srcs[:, ch], ir[:, ch])[:n]
            wet = s.hp(wet, 250)
        gains = dict(drums=0.9, bass=0.7, pad=0.8, lead=1.0, fx=0.8, voice=1.0, reverb=0.55)
        stems_d = {k: B[k] * gains[k] for k in BUSES}
        stems_d["reverb"] = wet * gains["reverb"]
        mixd = s.hp(sum(stems_d.values()), 25)
        # glue compression (slow RMS)
        env = np.sqrt(s.lp(np.mean(mixd ** 2, 1), 8, 1).clip(1e-9))
        mixd = mixd * np.minimum(1.0, (0.28 / env) ** 0.25)[:, None]
        # automation
        tv = np.arange(n) / SR
        auto = np.ones(n)
        for (a, b, g, ramp) in self.sections:
            m = (tv >= a) & (tv < b)
            k = np.minimum(np.clip((tv[m] - a) / ramp, 0, 1), np.clip((b - tv[m]) / ramp, 0, 1))
            auto[m] *= 1 - (1 - g) * k
        for (a, b, depth) in self.breaths:
            m = (tv >= a - 0.012) & (tv < b + 0.006)
            tm = tv[m]
            w = np.where(tm < a, 1 - (tm - (a - 0.012)) / 0.012 * (1 - depth), depth)
            w = np.where(tm >= b, depth + (1 - depth) * (tm - b) / 0.006, w)
            auto[m] *= np.clip(w, depth, 1)
        mixd *= auto[:, None]
        f = np.ones(n)
        fi = int(0.002 * SR)
        f[:fi] = np.linspace(0, 1, fi)
        fo = int(fade_out * SR)
        f[-fo:] = np.linspace(1, 0, fo)
        mixd *= f[:, None]
        pk = np.abs(mixd).max() + 1e-9
        mixd = s.softclip(mixd / pk * 1.25, 1.2)          # gentle saturation glues transients
        ceil = 10 ** (target_peak_db / 20)
        mixd = mixd / (np.abs(mixd).max() + 1e-9) * ceil

        def limit(drive):
            y = mixd * 10 ** (drive / 20)
            g = np.minimum(1.0, ceil / np.maximum(maximum_filter1d(np.abs(y).max(1), 97), 1e-9))
            rel = math.exp(-1 / (0.06 * SR))
            g = np.minimum(g, signal.lfilter([1 - rel], [1, -rel], g))
            g = -maximum_filter1d(-g, 97)
            return np.clip(y * g[:, None], -ceil, ceil)

        if target_rms_db is not None:                    # search the limiter drive for a loudness target
            lo, hi = 0.0, max_drive_db
            for _ in range(9):
                mid = (lo + hi) / 2
                r = 20 * math.log10(np.sqrt((limit(mid) ** 2).mean()) + 1e-12)
                lo, hi = (mid, hi) if r < target_rms_db else (lo, mid)
            drive_db = (lo + hi) / 2
        y = limit(drive_db)
        wavfile.write(path, SR, (y * 32767).astype(np.int16))
        if stems:
            sd = os.path.join(os.path.dirname(path), "stems")
            os.makedirs(sd, exist_ok=True)
            for k, v in stems_d.items():
                if np.abs(v).max() > 1e-6:
                    v = v / (np.abs(v).max() + 1e-9) * 0.8
                    wavfile.write(os.path.join(sd, k + ".wav"), SR, (v * 32767).astype(np.int16))
        rms = float(np.sqrt((y ** 2).mean()))
        info = dict(path=path, seconds=round(n / SR, 3), peak_dbfs=round(20 * math.log10(np.abs(y).max() + 1e-9), 2),
                    rms_dbfs=round(20 * math.log10(rms + 1e-9), 2), limiter_drive_db=round(drive_db, 2),
                    kicks=len(self.kicks), voice_lines=len(self.voice_spans))
        with open(path.replace(".wav", ".json"), "w") as fh:
            json.dump(dict(info, placed=self.placed[:2000]), fh, indent=1)
        print(json.dumps(info))
        return info


def make_ir(length=2.4, predelay=0.012):
    n = int(length * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        x = s.noise(n) * np.exp(-t / (length * 0.28))
        x = s.sweep_filter(x, 9000 * np.exp(-t / 0.9) + 900, "low", 1, 1024)
        x[: int(predelay * SR)] = 0
        irs.append(x / np.sqrt((x ** 2).sum()))
    return np.stack(irs, 1)


def load_wav(path):
    """Read a WAV (any rate, mono/stereo, int/float) → mono float64 at SR."""
    sr, raw = wavfile.read(path)
    x = raw.astype(np.float64)
    if raw.dtype.kind == "i":
        x = x / float(np.iinfo(raw.dtype).max)
    elif raw.dtype.kind == "u":
        x = (x - 128.0) / 128.0
    if x.ndim == 2:
        x = x.mean(1)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr)
    return x


def envelope(path_or_array, fps=60, smooth_s=0.04):
    """Per-frame RMS envelope 0..1 (speech → mouth/bounce, music → reactive visuals)."""
    x = load_wav(path_or_array) if isinstance(path_or_array, str) else np.asarray(path_or_array, float)
    hop = SR // fps
    nfr = len(x) // hop + 1
    e = np.array([np.sqrt((x[i * hop:(i + 1) * hop] ** 2).mean()) if i * hop < len(x) else 0.0 for i in range(nfr)])
    if smooth_s:
        k = max(1, int(smooth_s * fps))
        e = np.convolve(e, np.ones(k) / k, mode="same")
    m = np.percentile(e[e > 0], 95) if (e > 0).any() else 1.0
    return np.clip(e / (m + 1e-9), 0, 1)
