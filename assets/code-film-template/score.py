"""Original score + sound design on the film's clock.  python score.py → audio/score.wav

Rule: every named event in film.py gets a sound here, read from film.events (never retype times).
Then run `python film.py audio-qa` and fix every warning (sync misses, weak drops, boomy bands).
"""
import sys

from film import film
from motionkit.audio import Score, chord, nt, synth as s

g, ev = film.grid, film.events
sc = Score(film)

# ---- harmony bed (one chord per bar; replace with your progression)
PROG = [["D3", "F3", "A3", "C4"], ["Bb2", "D3", "F3", "A3"], ["G2", "Bb2", "D3", "F3"], ["A2", "C#3", "E3", "G3"]]
nbars = int(round(film.duration / g.bar_s))
for k in range(nbars):
    sc.pad(chord(PROG[k % len(PROG)]), g.bar(k), g.bar_s + 0.2, cutoff=1800, level=0.35, attack=0.4 if k == 0 else 0.05)

# ---- rhythm: kick on the beat from bar 1 (leave bar 0 sparse so the open breathes)
for n in range(g.bpb, int(film.duration / g.beat_s)):
    sc.kick(g.beat(n), punch=0.9)

# ---- events → sounds (map by kind; add special cases by name)
for e in ev.all():
    if e.kind == "word":
        sc.add(s.stab([f * 2 for f in chord(PROG[0])], 0.3, 0.5), e.t, "lead", send=0.2, tag=e.name)
    elif e.kind == "hit":
        sc.add(s.bounce(nt("D5"), 0.5), e.t, "fx", send=0.3, tag=e.name)
    elif e.kind == "whoosh":
        sc.add(s.whoosh(e.data.get("dur", 0.4), 400, 6000, 0.5), e.t - 0.05, "fx", tag=e.name)
    elif e.kind == "drop":
        sc.breath(e.t, 0.05)
        sc.add(s.boom(), e.t, "fx", tag=e.name)
        sc.add(s.crash(2.0), e.t, "drums", 0.5, tag=e.name)
    elif e.kind == "tick":
        sc.add(s.tick(0.6), e.t, "fx", tag=e.name)

if __name__ == "__main__":
    sc.render("audio/score.wav")
    sys.exit(0)
