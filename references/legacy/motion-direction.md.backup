# Motion Direction and Review

Read while designing a treatment/storyboard, authoring scenes, or repairing
repetitive motion. This is internal Agent work, not another user questionnaire.
It distills the supplied 2026-10-13 motion-quality research without copying
the reference projects' characters, music, assets or scene code.
For style-specific mechanisms and migration boundaries, read
[motion-style-library.md](motion-style-library.md). Use
[composition-format.md](composition-format.md) for executable authoring.

## Direct Events, Not Presets

Give each shot one readable visual job: reveal, compare, assemble, transform,
demonstrate a result, establish space, or deliberately hold for reading.
Then choose the camera and a few supporting reactions. A lyric, feature or
concept should cause something observable; changing a title/background alone
rarely demonstrates it.
These verbs are examples, not a closed vocabulary. Start from the content and
invent the event it deserves; retain or extend a starter only where it helps.
Judge the rendered opening, action and consequence, not resemblance to a
library example or use of a particular effect.

For an action shot, consider anticipation -> action -> peak -> reaction ->
settle. These are optional phases, not a universal duration formula. A hard
music cut can land directly on the peak; a report needs a longer readable hold.
Keep secondary movement lower in contrast, amplitude and speed than the focus.
Alternate motion peaks with quieter passages rather than making every layer
move at full strength.

Reuse identity, rigs and drawing primitives. Vary the event and its consequence.
A returning motif may change role, state, scale, camera, composition, material
or outcome. Stable studio scenery, recurring brand assets and a deliberate
refrain are not defects. Do not prescribe a novelty score, change colors just
to avoid repetition, or ban adjacent shots with the same scene type.

## Richness Is Choreography

For a request for impact, spectacle or a dense MV, plan a sequence of visible
changes, not a handful of decorated title slides. Put source images/footage,
cutouts, vector forms, lines, symbols and type into distinct roles. Establish
foreground/midground/background where useful; let masking, scale, occlusion
and camera focus change their relationships. A photo may split into panels;
lines may construct an object; a word can become a window onto the next world.
Not every shot needs every kind of asset.

For each energetic passage, be able to name its opening composition, main
action, resulting composition and transition into what follows. If the only
difference is a small periodic displacement of the same flattened image, the
requested event has not been implemented. Shake, beat pulse, grain and idle
motion are finishing accents, not substitutes for this sequence.

Choose both shot density and internal event density. A long continuous camera
move can traverse several materially different arrangements without hard cuts;
many hard cuts between the same title card do not create richness. For an
energetic brief, use phrases to plan changes of scale, direction, dominant shape,
focal subject, layer hierarchy and action. Reserve a readable landing/contrast
around peaks. Don't impose a global minimum number of objects, cuts, seconds,
or effects: quiet product inspection, a studio explanation and a rapid MV have
different needs. Do not fabricate factual detail to fill space.

When given a video reference, inspect time-ordered frames across its full
duration and dense strips around important transitions. Describe mechanisms
(outline -> fill, assembly -> push-in, word -> shape wipe, macro -> wide),
not only colors or adjectives. Transfer that grammar to the approved subject;
do not copy its characters, lyrics, assets or exact shot roster. Frame strips
do not establish audio sync. Inspect real playback/audio when available and
report unobserved aspects honestly.

## Map Intent to Existing Artifacts

In the treatment, state a compact visual promise: the main visual verbs,
rhythm and stable recognition anchor. Show actual differences in the three
candidate treatments, not the same scene with three palettes.

For each storyboard shot, record enough internal notes to implement and review
its intent. The existing `purpose` and `visual_job` may be sufficient; optional
`action_result`, `focal_subject`, `camera_reason`, `motif_variation` and
`motion_layers` help when the staging is complex. These are not mandatory
schema fields or choices for the user. Optional `review_times` are absolute
seconds for action peaks or dense frames the Agent wants sampled.

Keep `timeline.json` as the only clock. Convert scene-local events or beat/bar
positions into absolute cue times; derive audio, captions, camera and movement
from those times. Preserve state through a return to the studio or a recurring
product/chart view. Use a caused transition (occlusion, match shape, continued
direction, screen push) when it helps the story; a plain cut or short dissolve
is appropriate when it does not.

## Direct the Boundary, Not a Preset

For every adjacent scene pair, decide whether the boundary is a hard cut, a
continuous in-scene camera/action move, or an authored cross-scene transition.
Do not silently make every page enter from the side. When a transition is
needed, give it an internal pairwise handoff: outgoing state/action, the
identity or spatial cue that survives, incoming subject/action, focal point or
camera path, and the reason the handoff fits the content. Implement it in the
incoming cue with the shared compositor or choreograph continuous geometry
inside adjacent scenes. A matching subject can cross a cut through shape,
scale, position, occlusion, lighting or timing without literally morphing.

Treat these as mechanisms to adapt, not assets or shot templates to copy:

- **Action closes / action opens:** a foreground subject, jaws, door, product
  panel, card stack or screen fills the outgoing view; the incoming shot opens
  through the matching contour or continues the same movement.
- **Surface carries forward:** a bubble, light core, line, beam, debris cloud,
  data point or moving product highlight leaves the outgoing frame and becomes
  the incoming reveal or focal marker.
- **Continuous camera handoff:** push through an aperture, travel along a
  routed line, orbit around an object, or reframe from a host to its evidence
  screen. Let focus and scale change within the shot where possible instead of
  turning each idea into a new page.
- **Semantic graphic transition:** preserve chart axes/category ordering and
  animate changed marks into the next state; let a report callout become the
  next headline or chart region; retain product/UI identity as a camera
  approaches a control. Keep true data differences visible and sourced.
- **Text / image choreography:** a phrase becomes an outline, mask or field of
  marks; an image separates into depth layers or panels; the arriving subject
  resolves from those parts. Keep reading holds and avoid obscuring evidence.

Genre changes the restraint and visual grammar, not the expectation of
intentional cuts. The following are possibilities, not a required per-genre
formula; a custom approach may be better:

| Genre | Useful handoff | Protect |
|---|---|---|
| MV | Match the lyric/beat to carried shapes, words, light, action or a motivated full-cover reveal; reserve plain cuts for deliberate rhythmic contrast | Strong silhouette and a settle/breath after peaks |
| Studio | Let the camera push from hosts toward the actual screen; use the screen plane/focal aperture to enter evidence, then reverse the route to return | Host/subtitle/evidence clear zones and continuity of the set |
| Product | Travel along the product silhouette, interface plane, component boundary or callout into the next feature/state | Actual product geometry, UI state, labels and claim truth |
| Report / presentation | Transform or track stable chart marks, headings, highlight rails or page zones; use layered focus reveals rather than sliding a whole page | Axes, category order, units, source note, readable values and inference limits |

The starter provides `cut`, `push`, `wipe`, `zoom`, `dissolve`, `flow` (curved
edge reveal with restrained light edge), and `iris` (focal-point reveal).
`flow`/`iris` are useful compositing primitives, not complete scene direction.
Choose them only when appropriate; do not replace the old repeated page slide
with a new repeated wave or circle. Author a custom boundary or continuous
scene when it serves the idea better, and permit deliberate cuts. For fact-heavy
reports, continuity of the data encoding outranks visual flourish.

Optional internal event notes can use `{at_sec, focus, action, consequence,
layer_ids}` in the storyboard. These are planning notes, not executable
keyframes: implement their observable result in the renderer. Do not ask users
to fill this table. If removing a recurring decorative layer changes nothing
about a shot's visual job, it may be noise rather than useful density.

| Genre | Primary Event | Supporting Movement | Deliberate Holds |
|---|---|---|---|
| MV | A lyric image or musical change becomes an action, transformation or reveal | Acting, scenery response, beat accents; refrains return in a new state | Phrase endings, breath, contrast before a peak |
| Studio | Host explains -> screen becomes the focus -> visible evidence/result -> return | Expression reaction, speech-driven sticker motion, modest parallax, speaking-host inset | Readable diagrams and the host's reaction |
| Product | Show the actual operation and changed state, not only a feature label | Focus/macro, masks, object assembly, interaction sounds | Product details, before/after and final result |
| Report | Compare, rank, connect or decompose source-backed information | Staggered reveals and transitions that preserve visual encoding | Labels, units, source note and interpretation |

For factual visuals, test the content as well as its appearance: plotted values
match source data, demonstrated UI state matches the operation, or a displayed
algorithm result can be recomputed. Effects must not imply invented growth,
capabilities or causal evidence.

For premium lighting, colour, type or surface requests, read
[`visual-design-playbook.md`](visual-design-playbook.md) alongside the actual
fields in [`composition-format.md`](composition-format.md). Use a small number
of motivated accents, light sources and depth cues to strengthen the shot's
focal event; do not treat glass, bloom, gradients or particles as a default
global preset. A static glow or material label is not motion: animate the
actual light, highlight, geometry or camera on the shared timeline, then check
the encoded-size pixels and readability.

## Executable Motion Primitives

The starter's `src/motion.js` exposes `clamp01`, `lerp`, `smoothstep`,
`easeOutCubic`, `progressAt`, `springOut` and `staggeredProgress`.
All use absolute time or explicit progress and can be sampled out of order.
`lerp` deliberately does not clamp progress, so a spring's overshoot survives.
Clamp timing with `progressAt`, not the spring response.

`src/composition.js` also executes ordered/nested media, text, paths, shapes,
camera and sparse numeric keyframes in `scene: "composition"`. Use that scene
or project-specific deterministic code for complex choreography instead of
trying to fit it into the five legacy visualization presets. Preview and export
consume the same implementation; see `composition-format.md` for the actual
field semantics, capabilities and limitations.

For a lightweight arrival or reaction:

```js
import { lerp, progressAt, springOut, staggeredProgress } from "./motion.js";

const p = springOut(progressAt(time, cue.start_sec, 0.45));
drawSubject({ y: lerp(30, 0, p), scale: lerp(0.94, 1, p) });
items.forEach((item, index) => {
  const reveal = staggeredProgress(time, index, { start: cue.start_sec + 0.3 });
  drawItem(item, { opacity: reveal, y: lerp(18, 0, reveal) });
});
```

Adjust timing and amplitude to the treatment. Avoid squashing realistic product
geometry or thin labels. Background life can use small seeded/phase-fixed
sine motion; no per-frame random values, accumulating physics or independent
wall clock. If motion blur is implemented, clamp sampling to the owning shot
so it cannot blend across a hard cut.

## Review Before Full Export

Implement and inspect one representative difficult shot first. Then use the
portable helper from any working directory:

```bash
python "${SKILL_DIR}/scripts/review_motion.py" --project "<project>" --json
python "${SKILL_DIR}/scripts/review_motion.py" --project "<project>" \
  --sheet --save-frames --output renders/preview/motion-v1.png
```

The audit reads optional storyboard intent and visible scene cues. Its prompts
are advisory: missing JSON motion notes do not mean missing animation, and
repeated semantic fields do not prove repeated pixels.

The sheet samples each scene's start/middle/end, both sides of cuts, and
optional `review_times`. It writes a labeled PNG, a JSON sampling receipt, and
full-size PNGs for precise edge/readability checks, verifies a repeated
timestamp after seeking, and never overwrites an existing output. It uses the
project's renderer and installed Playwright/Chromium, not a second render
pipeline. Large sheets require a narrower `--start`/`--end` range or an explicit
bounded `--max-samples`; no cut samples are silently lost.

Inspect the sheet for composition, focal competition, repeated states and
cut continuity. Check that essential text remains within the 5% safe area
through readable holds and that moving cameras do not expose uncovered
background edges. The last active frame must resolve to the intended ending.
See [quality-gates.md](quality-gates.md) for the render-light preflight gate.
Only when stills cannot judge timing, anticipation, impact, settle,
speech/music sync or camera comfort, play a representative short range:

```bash
node src/render.mjs --start 4 --duration 2 \
  --output renders/preview/shot-v1.mp4
```

Range export samples the original absolute scene times and retains source-audio
offsets, fades and speech ducking. The receipt records the source interval.
Neither a contact sheet nor passing JSON replaces playback, full-video encoded
QA or the user's review when the selected route requires it.

## Evidence Boundary

The supplied study examined `JohnHeibel/PDoomVideo` and
`AnctyEnly453/abstract-algebra-promo`. Its transferable observations concern
event-driven shots, layered reactions, motif variation, shared timing and
targeted rendering. These directing recommendations are engineering inferences,
not a controlled audience study or a guarantee of aesthetic quality.
The original research remains in the workspace; the skill carries only the
maintained guidance and runnable helpers needed for production.
