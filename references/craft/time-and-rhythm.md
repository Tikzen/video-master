# Time and Rhythm — one clock for picture and sound

## 1. Pick the clock first

| Genre | The clock | How |
|---|---|---|
| MV / showreel with original score | **tempo grid** | `Grid.fit(duration, bars=N)`: the duration becomes a whole number of bars |
| MV on a supplied song | **measured grid** | `mv.analyze_track(path)` gives BPM, offset, sections and confidence. Report low confidence honestly |
| Studio | **speech** | each line's start/end comes from real TTS/recordings (`Speech.add_wav`) |
| Presentation | **narration or reading time** | narration timing; or reading time ≈ 0.25 s/word EN, 0.22 s/字 ZH + 1 s settle |

Tempo math: `bpm = 60 × bars × beats_per_bar / duration`. Useful pairs:
- 15 s = 8 bars @ 128 BPM
- 12 s = 6 bars @ 120
- 16 s = 8 bars @ 120
- 10 s = 5 bars @ 120
- 20 s = 10 bars @ 120
- 30 s = 16 bars @ 128

Run `python film.py info`: chapters must cover 0 → duration with no gaps.

## 2. Map structure to the grid

- **Chapter = bar or phrase** (2 or 4 bars). Change chapters on downbeats.
- **Hero events on beats.** Use off-beats (x.5) for syncopated surprises, e.g. "IS A" arriving on beat 1.5.
- **Build before a drop:** one beat or one bar of rising tension (riser, accelerating roll, push-in, jitter), then the drop *on* the downbeat.
- **Studio:** cuts land 0.1–0.25 s **before** a line starts. Reactions (nod, brow) follow 0.1–0.3 s after the other host's key word.
- **Presentation:** the element appears, then the narration names it, 0.2–0.4 s later. Hold a finished state ≥ 1.5 s before leaving.

## 3. Energy curve

Sketch the energy curve before writing scenes, and write it as a row per chapter: density
(sparse/medium/dense), motion speed, loudness, brightness. A typical 15 s reel:

```
open ▁▂ (one element, quiet) → build ▃▄▅ → DROP █ (densest, loudest, brightest) → peak ▇▆ → resolve ▃▂ → last frame ▁
```

Contrast creates impact. The bar before a drop is *quieter and simpler* than the drop
(`Score.section(..., 0.74)`, `Score.breath(drop, 0.05)`). If every chapter is at full energy,
none feels big.

## 4. The event map (the sync contract)

Declare every visible moment ONCE in `film.events`, by name, with a kind:

```python
ev.add("land1", g.beat(1), "hit")
ev.add("type_line4", g.beat(14), "word", text="DECISION.")
ev.add("drop", g.bar(4), "drop")
ev.add("screen_in", line3.t0 - 0.18, "whoosh", dur=0.7)
```

- Scene code reads `ev["drop"]` instead of retyping `7.5`.
- `score.py` loops over `ev.all()` and places a sound for each kind.
- `audio-qa` checks that every hit/drop/word/tick has an onset within ±40 ms.
- If you move an event, picture, sound and QA all follow.

Kinds: `hit`, `drop`, `whoosh` (data `dur`), `tick`, `swell` (data `dur`), `word` (data `text`),
`speech` (data `speaker`, `text`, `dur`).

## 5. Timing numbers that work

| Thing | Duration |
|---|---|
| Snap arrival (title, UI element) | 0.35–0.6 s, `out_expo` / `SNAP` |
| Letter stagger | 25–45 ms per glyph (centre-out or left→right) |
| List item stagger | 120–220 ms |
| Anticipation before a big move | 0.1–0.3 s (≈ 1/4 of the move) |
| Settle after landing (spring) | 0.2–0.5 s; f 2–3 Hz, ζ 0.3–0.5 |
| Camera move between shots | 0.6–0.9 s, `io_cubic` |
| Transition / handoff | 0.25–0.6 s (beat or half-beat) |
| Readable hold, a word | ≥ 0.8 s |
| Readable hold, a sentence | ≥ 2.5 s (or the narration length) |
| Pre-drop silence | 30–60 ms |
| End-card hold | ≥ 1.2 s fully settled before any outro |

## 6. Common mistakes

- Picking 15 s at 120 BPM (7.5 bars), so the last bar is cut in half. Fix the tempo.
- Hard-coding seconds in scenes. When the timing changes, half the film desyncs. Use events.
- Animating everything at once. Stagger it, and give the eye one thing per beat.
- A drop with no preparation, or a build with no payoff.
