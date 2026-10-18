"""Musical time grid + shared event map: the single clock for picture AND sound.

Rule (references/craft/time-and-rhythm.md): pick the tempo so the film is a
whole number of bars, map chapters to bars, put every visible event on a beat
or a deliberate subdivision, and declare those events ONCE in an EventMap that
both scene code and the score read. Then sync is structural, not hoped for.

    g = Grid(bpm=128)               # 4/4
    g.beat(5)       -> 2.34375 s   (beat 5 counted from 0)
    g.bar(2)        -> 3.75 s      (start of bar 2, 0-based)
    g.at(2, 1.5)    -> bar 2, beat 1.5
    Grid.fit(15.0, bars=8) -> Grid(bpm=128)
"""
import json
import math


class Grid:
    def __init__(self, bpm=120.0, beats_per_bar=4, offset=0.0):
        self.bpm = float(bpm)
        self.bpb = int(beats_per_bar)
        self.offset = float(offset)

    @property
    def beat_s(self):
        return 60.0 / self.bpm

    @property
    def bar_s(self):
        return self.beat_s * self.bpb

    def beat(self, n):
        """Time of beat n (0-based, fractional allowed: 4.5 = the 'and' after beat 4)."""
        return self.offset + n * self.beat_s

    def bar(self, k):
        """Start time of bar k (0-based)."""
        return self.offset + k * self.bar_s

    def at(self, bar, beat=0.0):
        return self.bar(bar) + beat * self.beat_s

    def sub(self, n, div=4):
        """n-th subdivision: div=2 eighths, 4 sixteenths, 3 triplets."""
        return self.offset + n * self.beat_s / div

    def beat_index(self, t):
        return (t - self.offset) / self.beat_s

    def bar_index(self, t):
        return int(math.floor((t - self.offset) / self.bar_s))

    def phase(self, t, div=1):
        """0..1 position inside the current beat (div=1) or subdivision."""
        x = (t - self.offset) / (self.beat_s / div)
        return x - math.floor(x)

    def pulse(self, t, decay=0.12, div=1):
        """1 on each beat decaying to 0 — drive brightness/scale accents with it."""
        ph = self.phase(t, div) * self.beat_s / div
        return math.exp(-ph / decay)

    def beats_between(self, a, b, div=1):
        n0 = math.ceil((a - self.offset) / (self.beat_s / div) - 1e-9)
        n1 = math.floor((b - self.offset) / (self.beat_s / div) + 1e-9)
        return [self.offset + n * self.beat_s / div for n in range(n0, n1 + 1)]

    @staticmethod
    def fit(duration, bars=None, bpm_range=(90, 140), beats_per_bar=4):
        """Choose a tempo that makes `duration` an exact number of bars.
        With bars=None, returns the candidate nearest 120 BPM inside bpm_range."""
        cands = []
        for nb in ([bars] if bars else range(1, 200)):
            bpm = 60.0 * nb * beats_per_bar / duration
            if bars or bpm_range[0] <= bpm <= bpm_range[1]:
                cands.append((abs(bpm - 120), nb, bpm))
        if not cands:
            raise ValueError("no whole-bar tempo in range for %.3fs" % duration)
        cands.sort()
        return Grid(cands[0][2], beats_per_bar)

    def describe(self, duration):
        return "%.3f BPM · %d/4 · beat %.4fs · bar %.4fs · %.2f bars in %.3fs" % (
            self.bpm, self.bpb, self.beat_s, self.bar_s, duration / self.bar_s, duration)


class Event:
    __slots__ = ("name", "t", "kind", "data")

    def __init__(self, name, t, kind="hit", data=None):
        self.name, self.t, self.kind, self.data = name, float(t), kind, data or {}

    def __repr__(self):
        return "Event(%r, %.3f, %r)" % (self.name, self.t, self.kind)


class EventMap:
    """Named moments shared by scene code, sound design and QA.

    kinds (free text, but these get default sounds/QA treatment):
      hit      sharp visual impact (landing, slam, stamp)       → transient
      drop     section downbeat with big energy change          → boom + crash
      whoosh   fast travel/transition (duration in data['dur']) → swept noise
      tick     small UI/type event                               → click
      swell    build into a later event (data['dur'])            → riser / reverse
      word     a word/line appears (data['text'])               → stab / blip
      speech   a spoken line (data: speaker, text, dur, src)
    """

    def __init__(self):
        self._ev = {}

    def add(self, name, t, kind="hit", **data):
        if name in self._ev:
            raise KeyError("duplicate event %r" % name)
        self._ev[name] = Event(name, t, kind, data)
        return self._ev[name].t

    def __getitem__(self, name):
        return self._ev[name].t

    def get(self, name):
        return self._ev[name]

    def __contains__(self, name):
        return name in self._ev

    def all(self, kind=None):
        ev = sorted(self._ev.values(), key=lambda e: e.t)
        return [e for e in ev if kind is None or e.kind == kind]

    def between(self, a, b, kind=None):
        return [e for e in self.all(kind) if a <= e.t < b]

    def last_before(self, t, kind=None):
        ev = [e for e in self.all(kind) if e.t <= t]
        return ev[-1] if ev else None

    def since(self, name, t):
        """Seconds since event (negative before it)."""
        return t - self._ev[name].t

    def to_json(self, path):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump([{"name": e.name, "t": round(e.t, 6), "kind": e.kind, "data": e.data} for e in self.all()],
                      fh, ensure_ascii=False, indent=1)

    def table(self):
        rows = ["| t (s) | event | kind |", "|---:|---|---|"]
        rows += ["| %.3f | %s | %s |" % (e.t, e.name, e.kind) for e in self.all()]
        return "\n".join(rows)
