"""Original score + sound design for 点·线·面 → 动.  python score.py  →  audio/score.wav (+ stems)

Every sound reads its time from film.events / film.grid — the same numbers the picture uses —
so sync is structural. Read top to bottom as a cue sheet: one block per chapter.
128 BPM · D minor · Dm9 | Dm9 | B♭maj7 | Gm9 | Dm9 | B♭maj7#11 | Gm→A7 | Dm(add9)
"""
import sys

from film import B, BAR, c1_point_line, c3_type, ev, film, g
from motionkit.audio import Score, synth as s
from motionkit.audio.synth import chord, nt

CH = [["D3", "F3", "A3", "C4", "E4"], ["D3", "F3", "A3", "C4", "E4"], ["Bb2", "D3", "F3", "A3", "C4"],
      ["G2", "Bb2", "D3", "F3", "A3"], ["D3", "F3", "A3", "C4", "E4"], ["Bb2", "D3", "F3", "A3", "E4"],
      ["G2", "Bb2", "D3", "F3", "A3"], ["D3", "A3", "D4", "F4", "E4", "A4"]]
ROOT = ["D2", "D2", "Bb1", "G1", "D2", "Bb1", "G1", "D2"]

s.seed(128)
sc = Score(film)

# ── 01 POINT: a tick on frame 0 (it returns at the loop), HUD chatter, three pitched landings ──
sc.add(s.tick(0.9), 0.0, "fx", 0.8, send=0.5)
for k in range(18):
    sc.add(s.click(3800 + 300 * (k % 3), 0.12), 0.06 + k * 0.038, "fx", pan=-0.7 + 0.08 * k)
sc.pad(chord(CH[0]), 0.0, 2 * BAR + 0.5, cutoff=700, level=0.32, attack=1.2, release=0.5)
for k, (off, land, h, T, x0, x1) in enumerate(c1_point_line.HOPS):
    sc.add(s.chirp(420 + 80 * k, 900 + 200 * k, 0.12, 0.10), off - 0.01, "fx", pan=(x0 - 960) / 900)
    sc.add(s.bounce(nt(["D5", "F5", "A5"][k]), 0.55 + 0.1 * k), ev["land%d" % (k + 1)], "fx",
           pan=(x1 - 960) / 700, send=0.35)
for (ti, txt) in ((0.62, "SQUASH & STRETCH"), (1.20, "SLOW IN · SLOW OUT"), (1.64, "ANTICIPATION")):
    for off, snd in s.typewriter(len(txt), 0.24, 0.07):
        sc.add(snd, ti + off, "fx", pan=0.2)
sc.add(s.riser(0.33, 0.25), 1.55)
sc.add(s.chirp(150, 600, 0.3, 0.12), 1.57)

# ── 02 LINE: launch whoosh, a plucked string, harp-like split, lens sweep L→R ──
sc.add(s.whoosh(0.22, 1500, 9000, 0.55, -0.2, 1.0, 0.6), ev["launch"] - 0.02)
sc.add(s.tick(0.5), ev["launch"])
sc.add(s.pluck_ks(nt("D3"), 1.8, 0.7, 0.9975), ev["launch"] + 0.2, "lead", 0.75, send=0.3)
sc.add(s.pluck_ks(nt("A3"), 1.4, 0.5, 0.997), ev["launch"] + 0.2, "lead", 0.3, 0.3)
for k, n_ in enumerate(["D4", "F4", "A4", "C5", "E5", "F5", "A5", "C6", "D6"]):
    sc.add(s.bell(nt(n_), 1.2, 1.2, 2.0, 0.22), ev["split"] + k * 0.035, "lead", pan=-0.8 + k * 0.2, send=0.5)
for t16 in g.beats_between(B(5) + 0.01, 2 * BAR - 0.01, 4):
    sc.add(s.hat(False, 0.45), t16, "drums", pan=0.25)
sc.add(s.whoosh(0.55, 500, 3500, 0.45, -1.0, 1.0), B(6) - 0.02)
sc.add(s.sub(nt("D2"), BAR), BAR, "bass", 0.16)
sc.add(s.reverse_swell(s.crash(1.2), 0.5), 2 * BAR - 0.5, "fx", 0.5)
sc.add(s.whoosh(0.45, 300, 2400, 0.35, 0, 0, 2.0), B(7))

# ── 03 PLANE: kick enters with the square; each shape has its own material sound ──
P0 = g.bar(2)
for k in range(4):
    sc.kick(P0 + B(k))
    sc.add(s.bass_note(nt(ROOT[2]) * 2, B(0.45), 0.55), P0 + B(k + 0.5), "bass")
    sc.add(s.hat(True, 0.4), P0 + B(k + 0.5), "drums", pan=0.2)
sc.add(s.boom(90, 60, 0.4, 0.5), ev["square"], "fx", 0.5)
sc.add(s.marimba(nt("F4"), 0.6, 0.6), ev["circle"], "fx", pan=-0.4)
sc.add(s.chirp(1500, 420, 0.3, 0.18), ev["triangle"] - 0.3, "fx", pan=0.4)
sc.add(s.bell(nt("A4"), 0.9, 4.0, 1.41, 0.5), ev["triangle"], "fx", pan=0.4, send=0.4)
sc.add(s.stab(chord(CH[2][1:]), 0.3, 0.6), ev["expand"], "lead")
sc.add(s.whoosh(0.42, 200, 6000, 0.7, 0, 0, 1.5), ev["expand"] + 0.04)
sc.pad(chord(CH[2]), P0, BAR + 0.3, cutoff=2300, level=0.42)

# ── 04 TYPE: a stab per line, letter ticks, weight-wave marimba, riser + roll, kick drops out ──
T0 = g.bar(3)
for k in range(3):
    sc.kick(T0 + B(k))
    sc.add(s.bass_note(nt(ROOT[3]) * 2, B(0.45), 0.55), T0 + B(k + 0.5), "bass")
sc.add(s.clap(), T0 + B(1), "drums", 0.55, send=0.3)
gm = chord(CH[3])
for name, k in (("type_line1", 1.0), ("type_line2", 1.12), ("type_line4", 1.25)):
    sc.add(s.stab([f * k for f in gm[1:]], 0.3, 0.55), ev[name], "lead")
sc.add(s.stab([f * 2 for f in gm[2:4]], 0.15, 0.35), ev["type_line3"], "lead")
for k in range(9):
    sc.add(s.marimba(nt("D5") * 2 ** (k / 8), 0.2, 0.12), ev["type_line4"] + 0.045 * k, "fx", pan=-0.7 + 0.17 * k)
sc.pad(gm, T0, BAR, cutoff=2500, level=0.4)
sc.add(s.riser(BAR / 4, 0.65), ev["riser"])
rolls = [ev["riser"] + k * B(0.125) for k in range(4)] + [B(15.5) + k * B(1 / 12) for k in range(6)]
for k, tr in enumerate(t for t in rolls if t < g.bar(4) - 0.03):
    sc.add(s.snare(0.25 + 0.05 * k), tr, "drums", 0.7, 0.1)
sc.section(g.bar(2), g.bar(4) - B(1), 0.74)        # the build sits back…
sc.breath(ev["drop"], 0.05)                         # …and a 50 ms gap makes the drop land

# ── 05–06 FLOW / VOLUME: the drop, particle shimmer, rolling bass, arps; morph glitches; warp ──
sc.add(s.boom(58, 34, 2.4, 1.0), ev["drop"], "fx", 0.95)
sc.add(s.crash(2.4), ev["drop"], "drums", 0.55, send=0.25)
for off, snd, p in s.shimmer(260, 0.9):
    sc.add(snd, ev["drop"] + off, "fx", pan=p)
pat = [0, 2, 1, 3, 2, 4, 3, 1]
for bar in (4, 5):
    b0 = g.bar(bar)
    last = 12 if bar == 5 else 16                   # beat 4 of bar 6 is the warp
    for k in range(4 if bar == 4 else 3):
        sc.kick(b0 + B(k), 1.05)
        sc.add(s.hat(True, 0.42), b0 + B(k + 0.5), "drums", pan=0.25)
    for k in (1, 3) if bar == 4 else (1,):
        sc.add(s.clap(), b0 + B(k), "drums", 0.6, send=0.25)
    ch = [nt(x) * 2 for x in CH[bar]]
    for k in range(last):
        tk = b0 + k * B(0.25)
        sc.add(s.hat(False, 0.5 if k % 2 else 0.32), tk, "drums", pan=-0.25)
        f = nt(ROOT[bar]) * (2 if k % 4 in (1, 3) else 1) * (1.5 if k % 8 == 6 else 1)
        sc.add(s.bass_note(f * 2, B(0.22), 0.5, 1100), tk, "bass")
        sc.add(s.arp_pluck(ch[pat[k % 8] % len(ch)] * (2 if k >= 8 else 1), 0.2, 0.4), tk, "lead",
               pan=0.6 if k % 2 else -0.6, send=0.25)
    sc.pad(chord(CH[bar]), b0, BAR + 0.2, cutoff=4200, level=0.5, attack=0.02, release=0.2)
for k, tb in enumerate((B(17), B(18), B(19))):
    sc.add(s.whoosh(0.4, 400, 3000, 0.35, -1 if k % 2 else 1, 1 if k % 2 else -1), tb - 0.05)
sc.add(s.reverse_swell(s.crash(1.0), 0.45), ev["sphere"] - 0.45, "fx", 0.6)
sc.add(s.boom(80, 50, 0.8, 0.6), ev["sphere"], "fx", 0.6)
sc.add(s.bell(nt("D6"), 1.4, 2.0, 3.0, 0.3), ev["sphere"], "lead", send=0.6)
for name in ("cube", "pyramid"):
    sc.add(s.glitch(0.1, 0.22), ev[name] - 0.105)            # the glitch ENDS on the hit, never covers it
    sc.add(s.boom(100, 70, 0.3, 0.6), ev[name], "fx", 0.8)
    sc.breath(ev[name], 0.012, 0.3)
sc.add(s.riser(g.beat_s + 0.02, 0.8), ev["warp"])
sc.add(s.whoosh(g.beat_s, 300, 12000, 0.6, 0, 0, 1.8), ev["warp"])
for k in range(8):
    sc.add(s.snare(0.3 + 0.07 * k), ev["warp"] + k * B(0.125), "drums", 0.6)
sc.breath(g.bar(6), 0.036)

# ── 07 RHYTHM: a chord stab per card; each transition gets its own texture; 16th stutter; implosion ──
R0 = g.bar(6)
stabs = [["G3", "Bb3", "D4", "F4"], ["A3", "C#4", "E4", "G4"], ["Bb3", "D4", "F4", "A4"], ["A3", "C#4", "E4", "A4"]]
sc.add(s.crash(1.6), R0, "drums", 0.5)
for k in range(4):
    sc.kick(R0 + B(k), 1.05)
    sc.add(s.stab(chord(stabs[k]), 0.36, 0.8), ev["card%d" % (k + 1)], "lead", send=0.3)
    sc.add(s.hat(True, 0.4), R0 + B(k + 0.5), "drums", pan=0.2)
for k in range(3):
    sc.add(s.bass_note(nt("G1" if k < 2 else "A1") * 2, B(0.45), 0.55), R0 + B(k + 0.5), "bass")
sc.add(s.clap(), R0 + B(1), "drums", 0.6)
sc.add(s.whoosh(0.14, 1200, 7000, 0.5, -1, 1), ev["card2"] - 0.11)                    # diagonal wipe
for k in range(40):                                                                    # tile flips, diagonal order
    i, j = k % 8, k // 8
    sc.add(s.click(1600 + 900 * ((i * 7 + j * 3) % 5), 0.16, 0.008), ev["card3"] - 0.12 + 0.1 * (i + j) / 11 + 0.055,
           "fx", pan=-0.9 + i * 0.25)
for k in range(12):                                                                    # slice zips
    sc.add(s.click(5000 - k * 150, 0.12, 0.01), ev["card4"] - 0.08 + 0.006 * k, "fx", pan=0.8 if k % 2 else -0.8)
for q in range(4):
    sc.kick(ev["card4"] + q * B(0.25), 0.7 + 0.1 * q)
    sc.add(s.stab([nt(x) * (1 + 0.06 * q) for x in stabs[3]], 0.1, 0.4), ev["card4"] + q * B(0.25), "lead")
sc.add(s.reverse_swell(s.crash(1.2), 0.32), g.bar(7) - 0.32, "fx", 1.1)
sc.add(s.whoosh(0.3, 8000, 300, 0.4), g.bar(7) - 0.3)
sc.breath(ev["seal"] + 0.002, 0.045)

# ── 08 MOTION: the seal slams (boom + knock + crash), splatter patter, glints per chapter glyph ──
M0 = ev["seal"]
sc.add(s.boom(48, 30, 2.6, 1.15), M0, "fx", 1.0)
sc.kick(M0, 1.2)
sc.add(s.crash(2.8), M0, "drums", 0.45)
sc.add(s.knock(1.0), M0 + 0.005, "fx", 0.9)
sc.pad(chord(CH[7]), M0, 1.82, cutoff=3500, level=0.62, attack=0.01, release=1.1)
sc.add(s.sine(nt("D1") * 2, int(1.8 * s.SR)) * s.env_exp(int(1.8 * s.SR), 0.45, 0.005), M0, "bass", 0.5)
sc.add(s.bell(nt("D6"), 2.0, 1.8, 3.0, 0.4) + s.bell(nt("A6"), 2.0, 1.2, 3.0, 0.18), M0 + 0.01, "lead", send=0.7)
for off, snd, p in s.shimmer(30, 0.35, 1800, 5000, (0.05, 0.12), 1.5):
    sc.add(snd, M0 + 0.04 + off, "fx", pan=p * 0.8)
for k in range(12):
    sc.add(s.click(3000 + 100 * (k % 6), 0.1), g.bar(7) + 0.42 + 0.03 * (k % 6) + 0.06 * (k // 6), "fx", pan=0.3)
for off, snd in s.typewriter(30, 0.4, 0.07, 4400):
    sc.add(snd, g.bar(7) + 0.55 + off, "fx", pan=0.35)
for i, n_ in enumerate(["D6", "F6", "G6", "A6", "C7", "D7", "F7", "A7"]):
    sc.add(s.bell(nt(n_), 0.8, 0.8, 2.0, 0.08 if i < 7 else 0.16), g.bar(7) + 0.7 + 0.04 * i, "lead",
           pan=0.1 + 0.08 * i, send=0.6)
sc.add(s.whoosh(0.35, 6000, 500, 0.45, 0.6, -0.6), ev["outro"] + 0.02)
sc.add(s.whoosh(0.4, 2000, 200, 0.3), ev["outro"] + 0.1)
sc.add(s.bounce(nt("D5"), 0.25), film.duration - 0.07)          # the dot lands = loop point

if __name__ == "__main__":
    sc.render("audio/score.wav", target_rms_db=-12.0)
    sys.exit(0)
