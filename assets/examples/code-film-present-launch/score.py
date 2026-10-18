"""Launch bed: clean, confident, product-like. python score.py → audio/score.wav
Product/data rule: sound confirms actions (UI pops, clicks, value changes); no booms on charts."""
import sys

from film import ev, film, g  # noqa: E402
from motionkit.audio import Score, chord, nt, synth as s

sc = Score(film)
PROG = [["A2", "C#3", "E3", "B3"], ["F#2", "A2", "C#3", "E3"], ["D3", "F#3", "A3", "C#4"], ["E3", "G#3", "B3", "D#4"]]
for k in range(8):
    sc.pad(chord(PROG[k % 4]), g.bar(k), g.bar_s + 0.2, cutoff=2600, level=0.3, attack=0.6 if k == 0 else 0.05)
for n in range(8, 48, 2):                         # light pulse from bar 2 (half-time feel)
    sc.add(s.hat(False, 0.35), g.beat(n), "drums", pan=0.2)
for n in range(16, 48, 4):
    sc.kick(g.beat(n), punch=0.6, gain=0.6)

sc.add(s.bell(nt("E6"), 1.4, 1.0, 3.0, 0.22), ev["title"], "lead", send=0.5)
sc.add(s.whoosh(0.55, 500, 5000, 0.35, -0.5, 0.2), ev["bar_handoff"], "fx")
sc.add(s.tick(0.4, 2000), ev["chart"], "fx")
sc.add(s.ui_pop(988, 0.4), ev["morph"], "fx", send=0.2)
sc.add(s.ui_pop(1320, 0.3), ev["badge"], "fx", send=0.2)
sc.add(s.whoosh(0.4, 800, 6000, 0.3), ev["ui_handoff"], "fx")
sc.add(s.mouse_click(0.5), ev["click"], "fx")
sc.add(s.ui_pop(1568, 0.35), ev["click"] + 0.12, "fx", send=0.3)
sc.add(s.whoosh(0.6, 300, 7000, 0.45), ev["zoom_out"], "fx")
sc.breath(ev["close"], 0.04)
sc.add(s.boom(70, 45, 1.2, 0.5), ev["close"], "fx")
sc.add(s.stab([f * 2 for f in chord(PROG[0])], 0.5, 0.45), ev["close"], "lead", send=0.4)
for i in range(3):                                # odometer settles
    sc.add(s.click(3200 + 300 * i, 0.12), ev["number"] + 0.9 + 0.08 * i, "fx")

if __name__ == "__main__":
    sc.render("audio/score.wav", drive_db=2.0)
    sys.exit(0)
