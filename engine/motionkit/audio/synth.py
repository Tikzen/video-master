"""Instrument and sound-design synthesis (numpy/scipy). All functions return mono float64 arrays
(or (n,2) stereo where noted) at SR, peak roughly ≤ 1. Deterministic: noise uses a seeded RNG.

Musical: kick clap snare hat crash  | bass_note stab supersaw arp_pluck pluck_ks bell marimba sub
Design : tick click bounce chirp whoosh riser boom knock reverse_swell shimmer glitch typewriter
See references/craft/sound.md for which sound belongs to which visual event.
"""
import math

import numpy as np
from scipy import signal

SR = 48000
TAU = 2 * math.pi
_RNG = np.random.default_rng(128)


def seed(n):
    global _RNG
    _RNG = np.random.default_rng(n)


def nt(name):
    """Note name → Hz ('D3', 'Bb2', 'F#4')."""
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    n = names[name[0]]
    i = 1
    if len(name) > 2 or (len(name) == 2 and not name[1].isdigit()):
        if name[1] == "b":
            n, i = n - 1, 2
        elif name[1] == "#":
            n, i = n + 1, 2
    midi = 12 * (int(name[i:]) + 1) + n
    return 440.0 * 2 ** ((midi - 69) / 12)


def chord(names):
    return [nt(x) for x in names]


def tt(n):
    return np.arange(n) / SR


def noise(n):
    return _RNG.standard_normal(n)


def env_exp(n, tau, attack=0.002):
    t = tt(n)
    return np.clip(t / max(attack, 1e-5), 0, 1) * np.exp(-t / tau)


def adsr(n, a, d, s, r):
    t = tt(n)
    dur = n / SR
    hold = dur - r
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where((t >= a + d) & (t < hold), s, e)
    e = np.where(t >= hold, s * np.clip(1 - (t - hold) / max(r, 1e-6), 0, 1), e)
    return e


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, f1, f2, order=2):
    return signal.sosfilt(signal.butter(order, [f1, min(f2, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def sweep_filter(x, fc_curve, kind="low", order=2, block=256):
    """Time-varying Butterworth (block-wise with carried state). kind: low | high | band."""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        fc = float(np.clip(fc_curve[min(i, len(fc_curve) - 1)], 20, SR * 0.45))
        if kind == "band":
            sos = signal.butter(order, [fc / 1.5, min(fc * 1.5, SR * 0.45)], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(order, fc, kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return out


def saw(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, np.float64), (n,))
    dt = f / SR
    ph = (np.cumsum(dt) + phase) % 1.0
    y = 2 * ph - 1
    m1 = ph < dt
    t1 = ph[m1] / dt[m1]
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt[m2]
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


def sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, np.float64), (n,))
    return np.sin(TAU * (np.cumsum(f) / SR) + phase)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def pan(x, p):
    a = (p + 1) * math.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], 1)


# ----------------------------------------------------------------------------- drums
def kick(punch=1.0, length=0.42, tune=52):
    n = int(length * SR)
    t = tt(n)
    f = tune + 120 * np.exp(-t / 0.03) + 40 * np.exp(-t / 0.006)
    body = sine(f, n) * np.exp(-t / 0.2) * np.clip(t / 0.001, 0, 1)
    knock = bp(noise(n), 140, 420) * np.exp(-t / 0.025) * 0.9
    click = hp(noise(n), 2500) * np.exp(-t / 0.0035) * 0.45
    return softclip((body + knock + click) * 1.3 * punch, 1.6)


def clap(level=1.0):
    n = int(0.35 * SR)
    t = tt(n)
    e = np.zeros(n)
    for k, off in enumerate((0.0, 0.009, 0.019)):
        i = int(off * SR)
        e[i:] += np.exp(-t[: n - i] / 0.006) * (0.8 if k < 2 else 1.0)
    i = int(0.026 * SR)
    e[i:] += np.exp(-t[: n - i] / 0.13) * 0.55
    return bp(noise(n), 900, 4200) * e * 1.4 * level


def snare(level=1.0):
    n = int(0.25 * SR)
    t = tt(n)
    tone = sine(190 * (1 + 0.4 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.05) * 0.5
    return (tone + bp(noise(n), 1500, 9000) * np.exp(-t / 0.09)) * level


def hat(open_=False, level=1.0):
    n = int((0.32 if open_ else 0.06) * SR)
    t = tt(n)
    m = np.zeros(n)
    for f in (3150, 4180, 5240, 6470, 7930, 9100):
        m += np.sign(np.sin(TAU * f * t))
    return hp(m * 0.15 + noise(n), 7000) * np.exp(-t / (0.11 if open_ else 0.018)) * level * 0.5


def crash(length=2.2, level=1.0):
    n = int(length * SR)
    t = tt(n)
    chans = []
    for _ in range(2):
        m = np.zeros(n)
        for f in (3730, 4620, 5810, 6890, 8120, 9650, 11200):
            m += np.sign(np.sin(TAU * f * t + _RNG.uniform(0, 6)))
        chans.append(hp(m * 0.1 + noise(n), 4200))
    x = np.stack(chans, 1)
    return x * (np.exp(-t / 0.75) * np.clip(t / 0.002, 0, 1))[:, None] * 0.5 * level


# ----------------------------------------------------------------------------- tonal
def bass_note(freq, length, level=1.0, cutoff=900):
    n = int(length * SR)
    t = tt(n)
    x = saw(freq, n) * 0.6 + sine(freq / 2, n) * 0.9 + saw(freq * 1.005, n) * 0.4
    x = sweep_filter(x, 180 + cutoff * np.exp(-t / 0.07), "low", 2, 128)
    return x * adsr(n, 0.004, 0.05, 0.8, 0.04) * level


def sub(freq, length, level=1.0, attack=0.3, release=0.3):
    n = int(length * SR)
    return sine(freq, n) * adsr(n, attack, 0.2, 0.8, release) * level


def supersaw(freqs, length, cutoff=1800, level=1.0, attack=0.25, release=0.6, voices=5, det=0.012):
    """Stereo pad/chord (n,2)."""
    n = int(length * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2 + 1e-9)
            x = saw(f * (1 + det * d), n, _RNG.uniform())
            a = (d * 0.8 + 1) * math.pi / 4
            L += x * math.cos(a)
            R += x * math.sin(a)
    x = np.stack([L, R], 1) * adsr(n, attack, 0.3, 0.85, release)[:, None]
    return lp(x, cutoff, 2) * level / (len(freqs) * voices) * 3


def stab(freqs, length=0.32, level=1.0, cutoff=5200):
    n = int(length * SR)
    t = tt(n)
    x = np.zeros(n)
    for f in freqs:
        x += saw(f, n) + 0.5 * saw(f * 1.01, n) + 0.5 * saw(f * 0.995, n)
    x = sweep_filter(x, 600 + cutoff * np.exp(-t / 0.06), "low", 2, 128)
    return x * np.exp(-t / (length * 0.45)) * np.clip(t / 0.002, 0, 1) * level / len(freqs) * 0.9


def arp_pluck(freq, length=0.22, level=1.0):
    n = int(length * SR)
    t = tt(n)
    x = saw(freq, n) * 0.6 + np.sign(np.sin(TAU * freq * 1.002 * t)) * 0.3
    x = sweep_filter(x, 500 + 5500 * np.exp(-t / 0.045), "low", 2, 128)
    return x * np.exp(-t / 0.09) * np.clip(t / 0.001, 0, 1) * level


def pluck_ks(freq, length=1.6, bright=0.6, decay=0.996):
    """Karplus–Strong string (vibrating lines, plucked objects)."""
    n = int(length * SR)
    p = max(2, int(SR / freq))
    buf = lp(_RNG.uniform(-1, 1, p), 1200 + 8000 * bright)
    out = np.zeros(n)
    idx, prev = 0, 0.0
    for i in range(n):
        cur = buf[idx]
        out[i] = cur
        buf[idx] = decay * 0.5 * (cur + prev)
        prev = cur
        idx = idx + 1 if idx + 1 < p else 0
    return out


def bell(freq, length=1.8, index=2.5, ratio=3.5, level=1.0):
    n = int(length * SR)
    t = tt(n)
    env = np.exp(-t / (length * 0.32)) * np.clip(t / 0.002, 0, 1)
    return np.sin(TAU * freq * t + np.sin(TAU * freq * ratio * t) * index * np.exp(-t / 0.25)) * env * level


def marimba(freq, length=0.6, level=1.0):
    n = int(length * SR)
    t = tt(n)
    x = np.sin(TAU * freq * t) * np.exp(-t / 0.18) + 0.25 * np.sin(TAU * freq * 3.99 * t) * np.exp(-t / 0.04)
    return x * np.clip(t / 0.0015, 0, 1) * level


def soft_keys(freqs, length=1.2, level=1.0):
    """Gentle electric-piano chord for calm explainers/reports (mono)."""
    n = int(length * SR)
    t = tt(n)
    x = np.zeros(n)
    for f in freqs:
        x += np.sin(TAU * f * t + 0.8 * np.sin(TAU * f * t) * np.exp(-t / 0.3)) * np.exp(-t / 0.9)
    return lp(x, 3500) * np.clip(t / 0.004, 0, 1) * level / max(1, len(freqs))


# ----------------------------------------------------------------------------- sound design
def tick(level=1.0, freq=2400):
    n = int(0.05 * SR)
    t = tt(n)
    return (np.sin(TAU * freq * t) * np.exp(-t / 0.008) + 0.4 * hp(noise(n), 5000) * np.exp(-t / 0.002)) * level


def click(freq=3000, level=1.0, length=0.006):
    n = max(8, int(length * SR))
    t = tt(n)
    return np.sin(TAU * freq * t) * np.exp(-t / (length / 4)) * level


def typewriter(count, span, level=0.08, freq=4200):
    """Returns list of (offset_s, sound) for `count` key clicks spread over `span` seconds."""
    return [(span * k / max(1, count), click(freq + 200 * ((k * 7) % 3), level)) for k in range(count)]


def bounce(freq, level=1.0):
    """'Bloop' for landings and pops: pitch-drop sine + body thump."""
    n = int(0.42 * SR)
    t = tt(n)
    x = sine(freq * (1 + 0.6 * np.exp(-t / 0.012)), n) * np.exp(-t / 0.11) * np.clip(t / 0.001, 0, 1)
    th = sine(95 * (1 + np.exp(-t / 0.01)), n) * np.exp(-t / 0.05) * 0.7
    return (x + th) * level


def chirp(f0, f1, length, level=1.0):
    n = int(length * SR)
    u = tt(n) / length
    return sine(f0 * (f1 / f0) ** u, n) * np.sin(np.pi * u) ** 1.5 * level


def whoosh(length, f0=500, f1=5000, level=1.0, pan0=0.0, pan1=0.0, curve=1.0):
    """Swept band-passed noise (stereo, travelling pan). Length = the visual move's duration."""
    n = int(length * SR)
    u = tt(n) / length
    x = sweep_filter(noise(n), f0 * (f1 / f0) ** (u ** curve), "band", 1) * np.sin(np.pi * np.clip(u, 0, 1)) ** 2
    x *= level * 2.0
    a = (pan0 + (pan1 - pan0) * u + 1) * math.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def riser(length, level=1.0):
    """Build-up into a downbeat: noise sweep + rising saw. Place so it ENDS on the hit."""
    n = int(length * SR)
    u = tt(n) / length
    nz = sweep_filter(noise(n), 300 * (12000 / 300) ** (u ** 1.6), "band", 1) * 1.6
    f = 110 * 2 ** (u * 3.0)
    tone = lp((saw(f, n) + saw(f * 1.006, n)) * 0.12, 4000)
    return (nz + tone) * u ** 2.2 * level


def boom(f0=52, f1=34, length=2.2, level=1.0):
    """Sub impact for drops/slams."""
    n = int(length * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25) + 70 * np.exp(-t / 0.02)
    body = sine(f, n) * np.exp(-t / 0.8)
    thump = lp(noise(n), 260) * np.exp(-t / 0.08) * 2.0
    return softclip((body + thump) * level, 1.4)


def knock(level=1.0, freq=170):
    """Wooden/stamp contact."""
    n = int(0.25 * SR)
    t = tt(n)
    return (bp(noise(n), 400, 1600) * np.exp(-t / 0.03) * 1.4 + sine(freq, n) * np.exp(-t / 0.06)) * level


def reverse_swell(src, length):
    """Reverse the head of a sound (crash/chord) so it swells INTO an event."""
    x = src[: int(length * SR)][::-1].copy()
    e = np.linspace(0, 1, len(x)) ** 2
    return x * (e[:, None] if x.ndim == 2 else e)


def shimmer(count, span, f_lo=3500, f_hi=9500, level=(0.04, 0.12), density_pow=2.2):
    """Granular glints for particles/sparkle: list of (offset_s, sound, pan)."""
    out = []
    for _ in range(count):
        off = span * _RNG.random() ** density_pow
        out.append((off, click(_RNG.uniform(f_lo, f_hi), _RNG.uniform(*level), 0.004), _RNG.uniform(-1, 1)))
    return out


def glitch(length=0.22, level=0.25):
    """Digital morph/scramble: up-down FM chirp."""
    return chirp(200, 2400, length, level) + chirp(2400, 300, length, level * 0.6)


def ui_pop(freq=880, level=0.4):
    """Soft UI confirmation (product demos): short sine pair."""
    n = int(0.18 * SR)
    t = tt(n)
    return (np.sin(TAU * freq * t) + 0.5 * np.sin(TAU * freq * 1.5 * t)) * np.exp(-t / 0.05) * level


def mouse_click(level=0.35):
    n = int(0.03 * SR)
    t = tt(n)
    return (bp(noise(n), 2000, 8000) * np.exp(-t / 0.003) + np.sin(TAU * 1400 * t) * np.exp(-t / 0.004) * 0.5) * level
