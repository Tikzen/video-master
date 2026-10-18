# Genre: MV, showreel, brand / abstract film

Reference: `assets/examples/code-film-dian-xian-mian` (15 s, 8 chapters, 128 BPM). Copy its habits.

## 1. Treatment shape (for Stage 2 candidates)

Each candidate states: **generator concept** · **chapter roster** (one row per bar or phrase,
with handoff out) · **palette and type roles** · **signature moment** (the one shot people
remember) · **energy curve** · **ending** (landing or loop) · **sound plan**. Three candidates
must differ in their generator.

Proven chapter vocabularies (adapt them, don't copy them):
- **Elements build up:** point → line → plane → type → particles → volume → rhythm montage → seal.
- **One object, many states:** a single shape travels through the piece and transforms on each downbeat.
- **Two forces:** two motifs in counterpoint that merge on the final drop.
- **Zoom journey:** continuous push through nested worlds (macro → micro), one aperture per bar.
- **Lyric-led:** each line of time-coded lyrics becomes a typographic scene (needs real timestamps).

## 2. Clock

- Original score: `Film(..., duration=D, bars=N)`. Check `info`; a chapter = a bar (or 2 bars for > 20 s).
- Supplied song: `trk = mv.analyze_track(path)` → `Film(bpm=trk.bpm)`, `film.grid.offset = trk.offset`; drive chapters from `trk.sections` and reactive layers from `trk.energy_at(t)`. If `trk.confidence < 0.35`, say so and place key events by section boundaries or time-coded lyrics.
- Energy curve: sparse open (1 element) → build → **drop at the midpoint or the 2/3 point** → peak → resolve → designed last frame.

## 3. Chapter craft checklist

- [ ] The chapter starts from the previous chapter's handoff object (exact geometry).
- [ ] One hero action per beat; secondary reactions follow by 0.05–0.15 s.
- [ ] At least one craft principle made visible (squash/stretch, overshoot, follow-through, stagger).
- [ ] A detail layer (annotation, readout, guides) where it helps the concept, and not in every chapter.
- [ ] The ground changes value at least once in the film (dark ↔ light) at a meaningful moment.
- [ ] Motion-blur windows on fast moves; impacts on the 1–2 biggest hits only.

## 4. Montage / rhythm sections

A "rhythm" chapter can cut fast (one card per beat, 16ths at the end), but:
- each card is a designed pattern (moiré, stripes, a shape grid, stuttering type), not a random stock image;
- each card enters with a *different* live transition (iris, diagonal wipe, tile flip, slices);
- the section ends by collapsing into the object that starts the finale (implode to a dot).

## 5. Kinetic type in MV

- Justify a block by variable width (`fit_width`) for a poster look; reveal line by line on beats and syncopations.
- Use `mv.WordCards` for one-word-per-beat slams; never more than ~3 words per second.
- Turn the final punctuation or letter into the next chapter's object (the full stop became the explosion).

## 6. Ending

Either a **designed end card** (logo/seal plus lockup, construction guides, chapter recap; hold
≥ 1.2 s) or a **loop** (last frame = frame 0; check with `python film.py loop`).

## 7. Sound

A score on the grid (see [sound.md](sound.md)): bounce notes rising with the hops, a string
pluck for a line, a kick entering with the first plane, word stabs, a riser plus roll into the
drop, boom + crash + shimmer on the drop, a stutter on the montage, a reverse swell into the
final hit, and a closing tick that matches the opening (for loops).
