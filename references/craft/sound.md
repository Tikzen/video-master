# Sound — score and design on the picture's clock

Half of "this feels professional" is sound. Every visible event deserves a sound, and the sound
must land on the same frame.

## 1. Sources (respect the existing gates)

- A supplied, authorised song: measure it (`mv.analyze_track`) and never stretch, replace or clip it silently.
- An original score: `motionkit.audio` (synth + Score). It is instrumental and original. Don't label it a famous song or a vocal track.
- Narration: the voice-tools stage (MiniMax/local TTS, recordings). Placing it with `Score.voice()` ducks the music under speech.
- Paid music or voice services still need the separate permission gate.

## 2. Event → sound map (start here, then season)

| Event kind | Sound | Notes |
|---|---|---|
| `hit` (landing, pop, slam) | `bounce(note)`, `knock`, `marimba` | pitch it to the harmony; rising pitches for rising energy |
| `drop` | `breath(t, 0.05)` + `boom` + `crash` + kick | the 50 ms silence before matters as much as the boom |
| `whoosh` (move, handoff) | `whoosh(dur, f0, f1, pan0, pan1)` | duration = the visual move; pan follows the motion direction |
| `swell` (build) | `riser(dur)` ending ON the target, `reverse_swell(crash)` | an accelerating snare roll on top for MV |
| `word` (title, line) | `stab(chord)`, `bell`, `ui_pop` | one per word, not per letter |
| letters / typing | `click` / `typewriter` at 0.06–0.12 gain | barely audible texture |
| particles / sparkle | `shimmer(count, span)` | dense at the burst, thinning |
| UI action | `mouse_click` + `ui_pop` 0.1 s later | product demos |
| string / line vibrating | `pluck_ks(note)` | physical match |
| morph / scramble | `glitch`, rapid clicks at 30 Hz | |

Loop over `film.events.all()` in `score.py` so a retimed event moves its sound too.

## 3. Music on the grid

- One chord per bar (or per two bars). Write progressions in a key that suits the mood (D minor for tension, A/E major for launches, F major for calm explainers).
- Layers enter with the energy curve: a pad bed, then hats, then the kick, then bass/arp at the drop.
- Talk formats: **no kick under speech**; soft keys or pads at a low level; stingers only at structural moments (open, screen push, close).
- Sidechain the pad, bass and lead to the kick (automatic in `Score`) for pump and clarity.

## 4. Mix targets

| Piece | RMS (dBFS) | Peak | Notes |
|---|---|---|---|
| Energetic MV / reel | −12 ± 1 | −1 | `drive_db` 3–3.5 |
| Launch / product | −15 ± 1.5 | −1 | `drive_db` ~2 |
| Studio / narration | −16 ± 2 (music bed), voice dominant | −1 | `drive_db` ≤ 1; ducking on |

Spectral balance for laptop and phone speakers: high-pass the bass at 42 Hz, give the kick a mid
"knock", keep presence (2–6 kHz) within ~12 dB of the loudest band. `audio-qa` warns when the sub
band dominates.

## 5. QA without listening (`python film.py audio-qa`)

The agent may not be able to listen, so prove it with numbers:

- **Sync:** every hit/drop/word/tick event has an onset within ±40 ms. A miss means the sound is missing, late or masked.
- **Impact contrast:** RMS 0.25 s after a drop minus 0.1 s before should be ≥ 6 dB, ideally ≥ 15 dB. If it is low, add `breath()` and pull the build down with `section()`.
- **Bands per chapter:** watch for sub-dominance (mid < −10 dB and presence < −16 dB relative to the loudest band).
- **No clipping, no unintended silences, duration equal to the film.**
- **Loop pieces:** the last ~30 ms fades out and the opening sound sits at t = 0.

Report audio honestly. "Spectrally balanced, synced within 40 ms, drop contrast +21 dB" is
evidence; "sounds great" is not, if you couldn't listen.
