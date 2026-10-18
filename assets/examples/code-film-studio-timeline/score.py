"""Studio bed: calm, speech-first. python score.py → audio/score.wav

Rules for talk formats (references/craft/sound.md):
  * music sits UNDER the voice (Score.voice ducks it); no kick drums under speech
  * stingers only on structural moments (open, screen push, close), never on every line
  * when real narration exists: sc.voice(line.src, line.t0) for each line — timing already matches
"""
import sys

from film import DUR, ev, film, sp  # noqa: E402
from motionkit.audio import Score, chord, nt, synth as s

sc = Score(film)
PROG = [["F3", "A3", "C4", "E4"], ["D3", "F3", "A3", "C4"], ["Bb2", "D3", "F3", "A3"], ["C3", "E3", "G3", "Bb3"]]
step = 3.0
k = 0
t = 0.0
while t < DUR:
    sc.add(s.soft_keys(chord(PROG[k % 4]), step + 0.6, 0.55), t, "pad", send=0.3)
    k += 1
    t += step
sc.add(s.bell(nt("C6"), 1.6, 1.2, 3.0, 0.25), 0.3, "lead", send=0.6)                 # show open
sc.add(s.whoosh(0.7, 300, 4000, 0.35, -0.3, 0.3), ev["screen_in"], "fx")             # camera push to the wall
sc.add(s.ui_pop(1320, 0.3), ev["playhead"], "fx", send=0.2)                          # playhead starts
sc.add(s.bell(nt("F5"), 2.0, 1.0, 3.0, 0.22), DUR - 1.4, "lead", send=0.6)           # close

for ln in sp.lines:
    if getattr(ln, "src", None):                       # real narration present → place it, music ducks
        sc.voice(ln.src, ln.t0)

if __name__ == "__main__":
    sc.render("audio/score.wav", drive_db=1.0)
    sys.exit(0)
