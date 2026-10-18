# Craft Standard — how Video Master films reach showcase quality

This folder replaces quota rules ("≥3 materials", "20–35 layers") with the method that actually
produces good motion design. It applies to all three genres — **MV / showreel**, **studio
(演播室)**, **presentation (演示: product demo, launch, report)** — and to both renderers
(motionkit code films and the JS compositor). The WebUI/workbench and the route gates in
`workflows/` are unchanged; this is what you do *inside* treatment, storyboard, scene authoring
and QA.

## The bar (what "done" looks like)

A finished piece passes all of these, checked on real frames and real audio, not on intent:

1. **One idea.** You can state the concept in one sentence, and every chapter, transition,
   colour and type choice follows from it.
2. **One clock.** Picture and sound read the same named events; key events land on beats or
   on speech. `audio-qa` shows no sync misses.
3. **No dead cuts.** Each boundary is an object handoff, a motivated camera move, or a
   deliberate hard cut. Nothing freezes during a transition. `diff` shows no unexplained pops.
4. **Hierarchy every frame.** One hero, quieter support, a calm detail layer. Text is
   readable for ≥ 1 s (≥ 2.5 s for sentences) inside the 5 % safe area.
5. **Crafted motion.** Easing from the vocabulary (no linear moves on objects), staggers,
   anticipation/overshoot/settle where physical, motion blur on fast moves.
6. **A designed ending.** The last frame is an intentional, readable landing (or equals the
   first frame for a loop).
7. **Honest content.** Real data has a source on screen; demo data, mock UI and placeholder
   voices are labelled as such.

## The method (do it in this order)

| # | Step | Output | Read |
|---|---|---|---|
| 1 | Find the concept | one sentence + why it fits the brief | [concept-and-system.md](concept-and-system.md) |
| 2 | Build the system | palette roles, type roles, grid, detail layer → `look.py` / lock | [concept-and-system.md](concept-and-system.md), [typography.md](typography.md) |
| 3 | Lay the clock | tempo/bars or speech timing, energy curve, **event map** | [time-and-rhythm.md](time-and-rhythm.md) |
| 4 | Storyboard handoffs | chapter table with *handoff out* column | [handoffs.md](handoffs.md) |
| 5 | Make ONE hero chapter to final quality | full-size stills + chapter sheet | [motion-craft.md](motion-craft.md), genre doc |
| 6 | Build the rest, then join the seams | all chapters, transitions | [handoffs.md](handoffs.md), [procedural.md](procedural.md) |
| 7 | Finish | post, motion blur, detail layer, HUD (optional) | [finish.md](finish.md) |
| 8 | Score + sound design from the event map | `audio/score.wav` | [sound.md](sound.md) |
| 9 | Review loop (≤ 3 rounds) | sheets, diff, audio-qa, fixes, WORKLOG | [review-loop.md](review-loop.md) |
| 10 | Render once, verify the encoded file | MP4 + QA notes | [review-loop.md](review-loop.md) |

Before you start, skim [anti-patterns.md](anti-patterns.md). It lists the failures that earlier
Video Master outputs actually showed.

## Genre guides

- [genre-mv.md](genre-mv.md): music-led films, showreels, abstract/brand pieces.
- [genre-studio.md](genre-studio.md): two-host explainers, news-style shows.
- [genre-presentation.md](genre-presentation.md): product demos, launches, data reports.

## Reference implementations (copy their habits)

| Genre | Example (source) | What to study |
|---|---|---|
| MV / showreel | `assets/examples/code-film-dian-xian-mian` | concept → 8 chapters, object handoffs, particles, 3D, kinetic type, synced score, loop |
| Studio | `assets/examples/code-film-studio-timeline` | speech clock, shot grammar, screen push + PIP, captions, lower thirds |
| Presentation | `assets/examples/code-film-present-launch` | reading order, fixed-axis chart morph, UI camera + cursor, labelled demo data |

Start a new piece with `scripts/init_code_film.py` (blank template or `--from-example`).
Engine reference: [../motionkit-api.md](../motionkit-api.md).

## Choosing the renderer

- **motionkit code film** (Python): use for MV, showreels, brand films, abstract pieces, and
  any studio or presentation piece whose treatment needs custom choreography, particles, 3D,
  variable-font type, live transitions or post. Choose this when in doubt about quality.
- **JS compositor** (starter project / `create-program.mjs`): use for fast narration-driven
  reports and studio shows that fit its layouts. It has the same easing vocabulary, glyph
  text, post and motion blur (see `composition-format.md`). Apply this craft standard there too.

## Keep a WORKLOG

Every production project keeps a `WORKLOG.md`. After each step, record the decision and why,
what review found (with frame numbers, times, dB), and what you changed. The next agent, or
the user, must be able to see why the film looks the way it does.
