# Motion Style Grammar Library

Read for an MV/showreel, style exploration or a reference-led motion treatment.
These are directing mechanisms, not locked templates or fifteen ready-made
renderers. The Agent chooses/adapts an appropriate subset after learning the
user's intent. The user's example is evidence of desired craft, not permission
to force its palette or exact artwork onto every video.
Use independent art direction: combine, reinterpret or replace these grammars
and author new scene mechanics. The fifteen names are references for thinking,
not the only styles the skill can produce. Stronger brief-specific results
take priority over showing off or faithfully reproducing a bundled example.

## Cross-Genre Transition Study

These repositories reinforce a useful boundary: high-end transitions usually
come from choreography between adjacent scenes, not a large catalog of
unrelated wipes. Transfer the grammar; do not copy their code, characters,
artwork, music, or shot order.

- **PDoomVideo:** its storyboard asks for connected sets/actions and motivated
  camera movement. Its brush wipe is reserved for a few chapter boundaries;
  elsewhere, actions make the handoff. One chapter closes jaws over the camera
  and the next opens through a matching teeth-shaped reveal; a growing heart
  bubble is handed to the following chapter as the surface that gets popped.
  Read [the storyboard](https://github.com/JohnHeibel/PDoomVideo/blob/main/STORYBOARD.md#L21-L27),
  [the chapter wipe](https://github.com/JohnHeibel/PDoomVideo/blob/main/src/timeline.js#L70-L90),
  [the closing action](https://github.com/JohnHeibel/PDoomVideo/blob/main/src/ch/c01_lab.js#L491-L513),
  and [the matching opening](https://github.com/JohnHeibel/PDoomVideo/blob/main/src/ch/c02_chorus1.js#L38-L66).
- **abstract-algebra-promo:** particles are carried from a snowflake burst into
  title glyphs and back into a later scene; camera travel and reveal masks are
  animated on the shared beat-aware timeline. It has no general transition
  library, and its occasional dark fades are not a pattern to reproduce.
  Inspect [particle-to-title choreography](https://github.com/AnctyEnly453/abstract-algebra-promo/blob/main/promo.html#L480-L516),
  [camera transforms](https://github.com/AnctyEnly453/abstract-algebra-promo/blob/main/promo.html#L1469-L1475),
  and [the content reveal](https://github.com/AnctyEnly453/abstract-algebra-promo/blob/main/promo.html#L1020-L1073).

Apply the same principle to every Video Master route: the final state of A
should cause or prepare the opening state of B. For a studio, let the screen
plane or a host gesture carry into the evidence shot. For a product, follow a
real silhouette, interface or callout. For reports, preserve chart mappings
and carry a meaningful data mark or highlight. For an MV, let a lyric/object,
light source or beat-driven action bridge scenes. If no visual identity should
survive, a deliberate hard cut is better than decorative motion. The starter's
`flow` and `iris` are compositing primitives only; see
[motion-direction.md](motion-direction.md) and
[composition-format.md](composition-format.md) for per-pair direction and
runtime behavior.

## What Transfers From MG Styles 15

Source: `Vincentwei1021/mg-styles-15`, inspected at commit
`49052d80bfaf9fa8412cc9710530e5e95a3b8d8c` (2026-10-05).
The repository pairs fifteen styles with prompts, scene source and shared
render/audio utilities. The adapted guidance below is model-independent.
Its code/prompts/docs use MIT; a copy is retained under
`vendor/mg-styles-15/LICENSE`. Third-party fonts, glyph outlines, samples and
media have their own licenses, not blanket permission from that MIT file.

Transfer these mechanisms:

- **Identity through transformations.** The flat-vector example carries a
  focal circle through different narrative roles. Reuse an object's identity
  as it changes role, scale or surroundings; do not reset to a new title slide
  whenever the content changes.
- **Staged assemblies and reactions.** The isometric source offsets arrivals
  of floors, walls, roofs, vegetation and moving traffic. Parent/group motion
  plus individual delays produces a designed scene; a flattened photo moving
  as one unit cannot replace that staging.
- **Camera connects information.** The sticker-explainer source lays out a
  larger world and changes focus across it. Its objects also transform into
  the next information structure. Use camera travel and layer continuity,
  not only zooming a static page. Factual values still need evidence.
- **Separate style signature from creative seed.** Translate the output,
  renderer choice, concept and recognizable motion traits into the existing
  Spec/Lock/storyboard. Change stories, brands, copy and visual details to the
  brief; preserve only the traits that genuinely express the selected style.
- **One event clock for picture and sound.** The reference's audio sync
  utilities quantize events to frames and inspect grid error. Keep visual
  impacts and sound placements on the project's timeline, not parallel
  handwritten schedules. A grid can guide composition; it does not establish
  measured beats in a supplied song.
- **Inspect motion around its hardest events.** Study a dense strip around an
  assembly, collision, morph or transition, plus full-size hero frames. The
  source's review loop motivates concrete checks, not an automatic guarantee
  of professional quality or a mandated numeric score.

Relevant upstream paths:
`prompts/01-flat-vector.md`, `03-isometric.md`, `05-cel-boil.md`,
`08-morph.md`, `19-paperclip.md`, `22-hud.md`;
`demos/01-flat-vector/index.html`, `demos/03-isometric/main.js`,
`demos/19-paperclip/index.html` and `cues.json`;
`lib/audio/mgaudio/sync.py`, `harness/render.mjs`, `rubric.md`.
Those source files remain reference material, not runtime dependencies.

## Fifteen Starting Grammars

The style names come from that reference. The shot ideas below are this skill's
adaptable recommendations, not a demand to copy the original films. Show only
three contextual candidates plus Custom in an interactive round, not this
entire catalog. A custom style can combine or replace these mechanisms.

| Grammar | Useful Motion and Composition Decisions |
|---|---|
| Flat vector | Independently build a world around a focal shape, stagger reactions, let a shape occupy the frame and become the next environment. |
| Line art | Draw a meaningful path; let intersections construct objects, move focus along it, change outline into filled hierarchy. |
| Isometric 2.5D | Stage parts of a miniature system, preserve projection/depth order, move vehicles/data along its geometry, pull back to reveal the whole. |
| 3D render | Show actual depth, lighting and material change through a camera/object action; use real 3D tooling and assets, not a flat image with a 3D label. |
| Frame-by-frame / line boil | Use purposeful held poses, independent redraws and timing quantization; silhouette/acting/shape changes do the action, contour boil is secondary. |
| Shape morph | Maintain correspondences through shape changes; connect narrative identities, introduce surrounding reactions, avoid arbitrary vertex scrambling. |
| Sticker explainer | Combine permitted cutouts, diagrams, labels and data on a navigable world; carry an object/mark into the next explanation. |
| Cyberpunk HUD / FUI | Make instruments react to a coherent acquisition/scan/lock sequence; route attention through evidence and layered displays, not random numeric flicker. |
| Collage / cut-out | Independently animate cutouts, type and paper layers with masking and depth; use a cut edge or foreground object to carry the transition. |
| Aurora / glass | Compose refractive/translucent layers with stable type and changing spatial relationships; a background gradient alone is not an animated concept. |
| Geometric Bauhaus | Use geometry to set constraints, collide, exchange roles and reassemble; match shape/direction between phrases rather than swapping posters. |
| Synthwave / VHS | Establish travelling space, near/far motion and a focal subject; use scan/glitch/noise as finish, not the entire event. |
| Pixel art | Author readable sprites/world states, stepped poses and scene actions at a chosen pixel scale; move camera/focus without accidental filtering/shimmer. |
| Liquid motion | Deform/merge/split fluid shapes around readable impacts; use a dedicated deterministic geometry/shader method when transform-only motion is insufficient. |
| Variety captions | Connect word blocks, emphasis, cutouts and reactions to actual speech/music; vary entry, replacement and occlusion while preserving reading time. |

High density is not constant clutter. Add meaningful midground/secondary
events and vary their onset, depth, scale and contrast. Alternate crowded
peaks with breathing room. A restrained brand can still have rich movement
without acquiring a maximalist palette or excessive hard cuts.

## Implemented Versus Custom

Bundled `scene: "composition"` executes ordered/nested media, paths, shape
transforms, same-count polyline morphs, text reveals, camera transforms and
cross-scene blends. See [composition-format.md](composition-format.md).
The original study demonstrates combinations; it is not fifteen complete
style presets and does not claim to match the reference's artistic finish.

For true 3D, complex liquid simulation, arbitrary SVG topology morphs, shaders,
advanced text layout or blur, the Agent can extend project source using a
suitable library/renderer. Test the extension with the same timestamp-driven
preview/export contract. Do not merely add a style label or unsupported JSON
field. Preserve local tools, sources, rights, credentials and actual output QA.

Do not import the upstream showcase site, its large rendered-video collection,
model-specific authority prompts, unbundled fonts, sample library or a
macOS-specific render command into every episode. Our own portable WebUI,
timeline, encoder and music remain authoritative. In particular, its default
numeric AI jury/two-round escalation is **not** activated here: aesthetic
self-review remains experimental, opt-in and off by default.
