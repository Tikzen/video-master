# Concept and Design System

## 1. The concept is a generator, not a theme

A concept is one sentence that tells you what happens next. "Futuristic tech vibe" doesn't; it
only tells you how to decorate. A good concept produces the chapter list, the transitions and the
ending by itself.

| Weak (a mood) | Strong (a generator) | What it generates |
|---|---|---|
| "dynamic and modern" | "Kandinsky's point → line → plane, then type, flow, volume, rhythm, motion" | 8 chapters; each is born from the previous object; ends back at the point (loop) |
| "explain our workflow" | "one timeline drives everything" | the evidence graphic *is* a timeline; the playhead lights every track; the cut grammar follows the speech clock |
| "product launch, premium" | "fewer edits: the number goes down, the product does it" | the chart's falling bar *becomes* the product window; the render button *becomes* the closing colour |
| "music video for a song about distance" | "two dots that never meet until the last chorus" | two-lane composition, near-misses on beats, the only merge on the final downbeat |

**How to find one in 3 moves:**
1. Write the audience's takeaway as a verb ("see that…", "feel that…").
2. Find the simplest **visual object** that can carry that verb: a dot, a line, a seal, a playhead, a bar.
3. Decide how that object **changes state** across the piece. Those state changes are your chapters.

Present 3 candidates in Stage 2. They must differ in their generator, not just in palette.

## 2. The design system ("the lock")

Write it before any scene code, in `look.py` (code film) or `video_lock.md` (JS route). Every
scene imports from it, so you change it once and the whole film follows.

### Palette = roles
- `ground`: the dominant background value. Pick a light or a dark ground; that decides the whole film's temperature.
- `ground2`: the opposite value, used for a deliberate *value flip* at a chapter change.
- `text`: titles and body on `ground`. Contrast ≥ 4.5 : 1 (`PAL.audit()`).
- `accent`: **exactly one** action colour. It marks the hero event, the key number or the speaker. If it is everywhere, it marks nothing.
- `support`, `support2`: up to two secondary hues that serve the concept (e.g. Bauhaus blue and yellow).
- `mute`: annotations, guides, axes, HUD.

Rules:
- Dominant hues ≤ 3 per frame. Build richness from value, scale and layering, not from extra hues.
- Saturated grounds (e.g. a red field) are powerful for one chapter. Bloom on them must use `key="luma"`.
- Start from `mk.palette(name)` (`bauhaus-ink`, `swiss-paper`, `night-signal`, `studio-warm`, `report-calm`), then make it yours.

### Type = roles
- **display**: one family, ideally variable (weight/width axes). Hero words, titles, numbers.
- **mono**: technical details, timecodes, labels, readouts, tabular numbers.
- **cjk / cjk_regular**: Chinese copy. Check coverage with `fonts.check()` or `face.missing()` before rendering.
- Two families plus CJK is the maximum. Variety comes from size, weight, width and case, not from more fonts.
- Fonts: `python -m motionkit.fonts install "Family" --dest assets/fonts`, then `fonts.register("display", path)`.

### Grid and safe area
- Keep essential copy within a 5 % inset, including camera transforms and spring overshoot.
- Use a 12-column grid (`present.Layout`) or an explicit construction grid (60 px modules in the MV example). Align edges to it; inconsistent left edges look amateur.
- Put the hero on a third or dead centre, chosen deliberately. Never "wherever it fits".

### The detail layer
Small technical marks make craft visible: annotations with leader lines, construction guides,
axis readouts, a HUD, frame counters. Rules:
- 12–16 px mono, 55–90 % opacity, one weight lighter than the hero.
- They appear **after** the event they describe (≈ 0.1–0.3 s) and leave before the next hero event.
- At most 1–2 on screen at once, never over the focal subject or essential copy.
- They must say something true ("spring ζ 0.36", "wdth 92.6", "示例数据"), never lorem ipsum.

## 3. Density progression (instead of layer quotas)

Plan density per chapter on the energy curve: **sparse open → build → densest at the peak →
calm resolve**. A sparse chapter (one dot on black) is correct when the curve says so. A dense
chapter needs *structure* (a grid, orbits, a chart), not random scatter. Never fill space because
it is empty; fill it because the concept puts something there.

## 4. Checklist before scene code

- [ ] Concept sentence written at the top of `look.py` / spec.
- [ ] Palette roles defined, `PAL.audit()` clean.
- [ ] Fonts registered; `missing()` empty for every string in the film.
- [ ] Grid and safe area decided.
- [ ] Energy curve sketched (chapter → density → loudness).
- [ ] Event map started (see [time-and-rhythm.md](time-and-rhythm.md)).
