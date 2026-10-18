# Review Loop — look, measure, fix, record

Quality comes from looking at real frames and changing things. Plan for 2–3 rounds per film.
This loop sits inside Gate B of `quality-gates.md`; it does not replace any gate.

## 1. What to render (cheap → expensive)

| Check | Command | Look for |
|---|---|---|
| Structure | `python film.py info` | chapters cover 0 → end, no gaps; event list matches the storyboard |
| Hero frames | `python film.py still t1 t2 …` | composition, hierarchy, type quality, safe area, at full size |
| Chapter sheets | `python film.py sheet --chapters` | each chapter's progression, density, variety |
| Seams | `python film.py sheet T-0.3 T+0.3 12` | handoff continuity at each boundary |
| Continuity | `python film.py diff` | `suspicious` frames: unexplained pops |
| Motion feel | `python film.py range T0 T1` | short native-fps preview for easing/blur (when you can play it) |
| Audio | `python score.py` + `python film.py audio-qa` | sync misses, drop contrast, bands, clipping |
| Loop | `python film.py loop` | first/last frame difference (loop pieces) |
| Encoded | `chunks` → `assemble` → ffprobe + decoded sheet | streams, duration, frames, colour, playback |

Never encode the whole film to check one change. Re-render only the affected frames.

## 2. How to look at a frame (in this order)

1. **Hierarchy:** where does the eye go first? Is that the hero? Squint: does the value structure still read?
2. **Edges and safe area:** nothing essential within 5 % of the edge; no accidental tangents or near-misses (elements almost touching).
3. **Type:** missing glyphs (boxes), wrong fallback glyphs, overlaps, bad breaks, widows, inconsistent left edges.
4. **Colour:** accent used once per moment; text contrast; no muddy additive overlaps.
5. **Craft:** does the detail layer support the hero, or compete with it? Is anything sliding linearly or popping without easing?
6. **Intent:** does this frame express the concept sentence?

## 3. Real defects these checks caught (and their fixes)

| Symptom | Cause | Fix |
|---|---|---|
| Multiple-exposure strobing on moving thin lines | too few motion-blur samples for the speed | blur window 12 samples |
| Dark seam remained when stripes merged into a plane | centre element didn't take part in the merge | add a matching paper band behind it |
| Square jumped from 280 to 323 px at a handoff | a volume-compensation formula applied too early | only compensate during overshoot |
| Particles looked like noise for 0.6 s | no structure after the explosion | add orbit attraction from +0.14 s |
| Pop at the flow → volume seam (diff 8.3 vs 0.7) | background systems differed | crossfade the backgrounds |
| Label typed fully only as it faded | entrance too late for its window | earlier `t_in` |
| `ζ` showed as a box | glyph missing in the font | `missing()` check; reword |
| Text overlapped the moving seal | text started before the seal finished moving | sequence: move first, text after |
| Presenters looked bald | hair didn't cover the skull | cap the hair over the head ellipse |
| "+ −78%" badge | glyph fallback produced a double sign | vector arrow |
| Numeral collided with the title | size picked without measuring | measure `Run.ink_w`, resize, re-check |
| Drop barely louder than the build (+2.5 dB) | riser and roll filled the gap | 50 ms breath + quieter build → +20 dB |

Expect to find defects like these on every film. The review loop exists to catch them.

## 4. Fix at the owning layer

- One scene's problem → fix that scene.
- The same problem in many places (palette, type, camera, handoff style) → fix `look.py` / the lock / the engine, then re-check everywhere.
- Timing problems → fix the event map, not individual scenes.

## 5. Record it (WORKLOG.md)

For each round: what you rendered, what you saw (frame/time/value), the cause, the fix, and the
re-check result. Keep it factual. Example:

> f563 (9.383 s) diff 8.29 vs neighbours 0.7 → flow/volume backgrounds differ → crossfade gradient during converge, fade bokeh 0.4 s → re-diff 0.9 ✓

## 6. Delivery verification

After `assemble`: ffprobe (codec, size, fps, frames = duration × fps, audio stream), a decoded
contact sheet of the MP4 (not the stills), audio-qa on the MP4, and first/middle/last frames.
Report the exact results and anything you could not check (e.g. "did not listen; verified by
onset/band analysis").
