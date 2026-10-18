"""Easing, springs, impulses, deterministic noise.

Every function takes plain floats and is pure (same input → same output), so
any frame can be rendered in any order. `u` is normalized progress (clamped),
`t` is seconds.

Choosing an ease (see references/craft/motion-craft.md):
    out_expo / SNAP   UI-like arrivals, titles, things that "snap into place"
    out_back          pops with a small overshoot (icons, badges, shapes)
    spring(t, f, z)   physical objects; f=Hz (2–4), z=damping (0.3 bouncy … 0.7 firm)
    io_cubic/io_expo  camera moves and big transforms that start AND end at rest
    in_cubic/in_expo  exits and things accelerating away / being sucked in
    linear            only for constant drift, scrolling patterns, rotations
"""
import math

TAU = math.tau
PI = math.pi


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    """Progress of t through [a, b] → 0..1 (clamped)."""
    if b == a:
        return 1.0 if t >= a else 0.0
    return clamp((t - a) / (b - a))


def lerp(a, b, u):
    return a + (b - a) * u


def remap(x, a0, a1, b0, b1):
    return lerp(b0, b1, prog(x, a0, a1))


def smooth(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)


def smoother(u):
    u = clamp(u)
    return u * u * u * (u * (u * 6 - 15) + 10)


def linear(u):
    return clamp(u)


def in_quad(u):
    u = clamp(u)
    return u * u


def out_quad(u):
    u = clamp(u)
    return 1 - (1 - u) ** 2


def in_cubic(u):
    u = clamp(u)
    return u ** 3


def out_cubic(u):
    u = clamp(u)
    return 1 - (1 - u) ** 3


def io_cubic(u):
    u = clamp(u)
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


def in_quart(u):
    u = clamp(u)
    return u ** 4


def out_quart(u):
    u = clamp(u)
    return 1 - (1 - u) ** 4


def io_quart(u):
    u = clamp(u)
    return 8 * u ** 4 if u < 0.5 else 1 - (-2 * u + 2) ** 4 / 2


def out_quint(u):
    u = clamp(u)
    return 1 - (1 - u) ** 5


def in_expo(u):
    u = clamp(u)
    return 0.0 if u <= 0 else 2 ** (10 * u - 10)


def out_expo(u):
    u = clamp(u)
    return 1.0 if u >= 1 else 1 - 2 ** (-10 * u)


def io_expo(u):
    u = clamp(u)
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    return 2 ** (20 * u - 10) / 2 if u < 0.5 else (2 - 2 ** (-20 * u + 10)) / 2


def io_sine(u):
    u = clamp(u)
    return 0.5 - 0.5 * math.cos(PI * u)


def out_back(u, s=1.70158):
    """Overshoot then settle. s=1.7 ≈ 10% overshoot, s=2.5 ≈ 20%."""
    u = clamp(u) - 1
    return 1 + (s + 1) * u ** 3 + s * u ** 2


def in_back(u, s=1.70158):
    u = clamp(u)
    return (s + 1) * u ** 3 - s * u ** 2


def out_elastic(u, period=0.3):
    u = clamp(u)
    if u in (0.0, 1.0):
        return u
    return 2 ** (-10 * u) * math.sin((u - period / 4) * TAU / period) + 1


def steps(u, n):
    """Stepped/held animation (on-twos, stop-motion feel)."""
    u = clamp(u)
    return math.floor(u * n) / n


def spring(t, f=2.2, z=0.32):
    """Step response 0 → 1 of a damped spring.
    t: seconds since the step, f: natural frequency in Hz, z: damping ratio.
    Overshoot ≈ exp(-z·π/√(1-z²)): z=0.2→53%, 0.3→37%, 0.4→25%, 0.5→16%, 0.7→5%."""
    if t <= 0:
        return 0.0
    w = TAU * f
    if z >= 1:
        return 1 - math.exp(-w * t) * (1 + w * t)
    wd = w * math.sqrt(1 - z * z)
    return 1 - math.exp(-z * w * t) * (math.cos(wd * t) + z * w / wd * math.sin(wd * t))


def spring_settle_time(f=2.2, z=0.32, tol=0.02):
    """Seconds until a spring stays within tol of 1 (use to schedule what follows)."""
    return -math.log(tol) / (z * TAU * f)


def impulse(t, f=6.0, decay=0.08):
    """Damped kick that starts at 0, swings, rings out. Use for hits, pulses, wobble."""
    if t <= 0:
        return 0.0
    return math.exp(-t / decay) * math.sin(TAU * f * t)


def decay(t, tau=0.15):
    """1 at t=0 falling exponentially; 0 before the event."""
    return math.exp(-t / tau) if t >= 0 else 0.0


def bezier(x1, y1, x2, y2):
    """CSS cubic-bezier(x1,y1,x2,y2) as an easing function."""
    def bx(s):
        return 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3

    def by(s):
        return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3

    def f(u):
        u = clamp(u)
        lo, hi, s = 0.0, 1.0, u
        for _ in range(28):
            x = bx(s)
            if abs(x - u) < 1e-7:
                break
            if x < u:
                lo = s
            else:
                hi = s
            s = (lo + hi) / 2
        return by(s)
    f.__name__ = "bezier(%g,%g,%g,%g)" % (x1, y1, x2, y2)
    return f


SNAP = bezier(0.16, 1.0, 0.3, 1.0)      # fast attack, long luxurious settle (signature arrivals)
SWIFT = bezier(0.7, 0.0, 0.2, 1.0)      # anticipatory start, decisive finish (big moves)
GENTLE = bezier(0.4, 0.0, 0.2, 1.0)     # material-design standard (UI, product demos)


def stagger(t, i, start, each, dur, ease=out_expo, order=None):
    """Progress of item i in a staggered group. `order` maps i → slot (e.g. centre-out)."""
    k = order(i) if order else i
    return ease(prog(t, start + k * each, start + k * each + dur))


def centre_out(n):
    c = (n - 1) / 2
    return lambda i: abs(i - c)


def keys(t, frames, ease=io_cubic):
    """Piecewise keyframes: frames = [(time, value), ...] (value float or tuple).
    Optional per-segment ease: [(time, value, ease_fn), ...] applies to the segment ending there."""
    if t <= frames[0][0]:
        return frames[0][1]
    for k in range(1, len(frames)):
        t1, v1 = frames[k][0], frames[k][1]
        if t <= t1:
            t0, v0 = frames[k - 1][0], frames[k - 1][1]
            e = frames[k][2] if len(frames[k]) > 2 else ease
            u = e(prog(t, t0, t1))
            if isinstance(v0, (tuple, list)):
                return tuple(a + (b - a) * u for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * u
    return frames[-1][1]


# ----------------------------------------------------------------------------- deterministic noise
def hash01(*args):
    """Deterministic pseudo-random in [0,1) from any numbers (use instead of random())."""
    h = 0x811C9DC5
    for a in args:
        v = int(a * 9973 + 17) if isinstance(a, float) else int(a)
        h ^= v & 0xFFFFFFFF
        h = (h * 0x01000193) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 0x5BD1E995) & 0xFFFFFFFF
        h ^= h >> 15
    return (h & 0xFFFFFF) / float(0x1000000)


def noise1(x, seed=0):
    """Smooth 1D value noise in [-1, 1]."""
    i = math.floor(x)
    f = x - i
    a = hash01(i, seed) * 2 - 1
    b = hash01(i + 1, seed) * 2 - 1
    return a + (b - a) * smooth(f)


def fbm1(x, seed=0, octaves=3):
    v, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        v += noise1(x * 2 ** o, seed + o * 31) * amp
        tot += amp
        amp *= 0.5
    return v / tot


def wobble(t, amp=1.0, freq=1.0, seed=0):
    """Organic idle drift (use small amplitudes: 1–4 px, 0.5–2°)."""
    return amp * fbm1(t * freq, seed)
