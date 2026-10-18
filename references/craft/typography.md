# Typography in Motion

Type is the fastest way to look designed, and the fastest way to look amateur.

## 1. Fonts

- Use real, licensed fonts from files, never browser or system defaults by accident.
- Bundled with motionkit: **Archivo** (variable wght 100–900, wdth 62–125) as `display`, and **JetBrains Mono** (variable wght) as `mono`. Both OFL.
- More families: `python -m motionkit.fonts install "Bricolage Grotesque" --dest assets/fonts`, then `fonts.register("display", path)`. Good variable choices, by mood:

| Mood | Families |
|---|---|
| Neutral, precise | Inter, Archivo, Manrope |
| Expressive grotesk | Bricolage Grotesque, Anybody (wdth 50–150), Syne |
| Editorial serif | Fraunces (soft/wonk axes), Instrument Serif, Playfair Display |
| Tech / mono | JetBrains Mono, IBM Plex Mono, Space Mono |
| Display condensed | Big Shoulders Display, Oswald |

- **CJK:** the `cjk` role resolves Noto Sans CJK SC, Microsoft YaHei, PingFang or Source Han from the system. Check coverage before rendering: `face("cjk").missing(text)` must be `[]`. Bundled Latin fonts lack glyphs like `ζ ≈ ₁ φ ▲`; check those as well.

## 2. Hierarchy

- At most three sizes on screen, with ratios of about 1.6–2× between levels (e.g. 206 / 104 / 34 px at 1080p).
- Minimum sizes at 1080p: body 28 px, caption 24 px, technical label 12–14 px (detail layer only).
- Weight contrast: hero 760–850, body 420–520, labels 600 mono.
- Tracking: big display −0.01 to −0.02 em; all-caps labels +0.08 to +0.18 em.
- Line length 30–60 characters (Latin) or 12–24 字 (Chinese). Break lines on meaning, not where they happen to overflow.

## 3. Variable axes as motion

Animate the axes themselves:
- **Weight wave:** `wght` 100 → 800 letter by letter. The word "gets heavier" as it lands.
- **Width fit:** `fit_width(face, text, size, measure, wght=...)` solves `wdth` (then tracking) so that lines of different length share one measure. This is the justified poster.
- **Stutter:** jump weight/width on 16th notes for rhythm sections (`RHYTHM` card).
- **Live readouts** of axis values in the detail layer make the craft legible.

Changing `wdth` changes advances. Re-shape the run every frame (motionkit caches by quantised axis).

## 4. Entrances and exits

| Technique | How | When |
|---|---|---|
| Slot rise | clip to the line box, glyph `dy` from +cap to 0, SNAP, 25–45 ms stagger | default for titles |
| Flip | per-glyph `sy` 0→1 with spring, pivot at cap centre, centre-out | punchy single words |
| Track open | tracking −0.05 → target, `out_back` | short words, small lines |
| Weight wave | per-letter `wght` ramp | hero word |
| Typewriter | `annotate.typed(s, u)` | technical labels only |
| Odometer | `present.odometer` | numbers |

Exits are faster than entrances (≈ 60 %) and use `in_cubic` or a mask drop. Never fade body
copy in and out letter by letter.

## 5. Chinese specifics

- Vertical text (竖排) via `draw_vertical`: columns read right → left, with ~1.15–1.2 em per character.
- Wrapping uses `wrap()` with kinsoku: no `，。、` at the start of a line, no `（《` at the end.
- Chinese titles need more leading (1.2–1.35) and no negative tracking.
- Mixed Chinese and Latin: set Latin in the display face and Chinese in the CJK face, aligned on a shared baseline. Size CJK about 0.92× the Latin cap height so the two look the same size.

## 6. Numbers

- Changing numbers use a mono or tabular face so the width doesn't jitter.
- Count with `counter()` (`out_expo`, 0.8–1.3 s) or roll with `odometer()`. End exactly on the true value, with its unit.
- Keep units and decimals consistent across a chart and its labels.

## 7. Legibility check

- Contrast ≥ 4.5 : 1 against the actual pixels behind the text, including during transitions.
- Captions on busy backgrounds get a plate (`studio.caption` does this).
- No text inside the 5 % edge, nothing under hosts' faces or hands, and no text over particles at full density.
