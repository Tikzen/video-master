# Executable Composition and MV Plans

Read when authoring multi-layer motion, kinetic type, camera work or a directed
MV. This is Agent production work, not a form for users to fill.

## Agent-Authored Plan

`src/create-mv.mjs --plan mv-plan.json --prompt "<approved intent>"` consumes:

```json
{
  "schema": "video-master.mv-plan.v1",
  "project": {
    "name": "Own film", "width": 1920, "height": 1080,
    "fps": 30, "duration_seconds": 8
  },
  "design": {
    "title": "Own film",
    "palette": ["#f4f5f6", "#101116", "#f54462", "#82c9f4"]
  },
  "cues": [
    {
      "id": "assemble", "track_id": "scenes", "kind": "scene",
      "scene": "composition", "start_sec": 0, "end_sec": 8,
      "canvas": {"width": 1920, "height": 1080},
      "camera": {
        "keyframes": [
          {"at": 0, "scale": 1},
          {"at": 5, "scale": 1.4, "x": -120, "ease": "cubicInOut"}
        ]
      },
      "layers": [
        {
          "id": "shape", "kind": "rect", "width": 320, "height": 120,
          "fill": "#f54462", "transform": {"x": 220, "y": 400},
          "keyframes": [
            {"at": 0, "x": -400, "rotation": -20},
            {"at": 1, "x": 220, "rotation": 0, "ease": "cubicOut"}
          ]
        },
        {
          "id": "word", "kind": "text", "text": "FORM",
          "font_size": 160, "font_weight": 900, "color": "#f4f5f6",
          "stroke": "#f4f5f6", "stroke_width": 1,
          "transform": {"x": 620, "y": 350},
          "keyframes": [
            {"at": 0, "reveal": 0}, {"at": 0.8, "reveal": 0},
            {"at": 1.5, "reveal": 1, "ease": "cubicOut"}
          ]
        }
      ]
    }
  ]
}
```

The minimal example explains fields, not a finished treatment. Author richer
events when requested; do not duplicate this layout for every shot.
The scene roster must cover the complete duration in order without gaps.
Optional `tracks` replace default `scenes/media/titles`; optional `storyboard`
adds notes keyed by scene ID. Cues stay identical to the executable timeline.
`vm-music` / `vm-music-bed` and `vm-motion-sfx` are reserved for managed audio.
Select the soundtrack through `--audio`/music-tool; an active authored music
bed is rejected to prevent double music. Additional sound-effect/voice cues
use other tracks. Do not duplicate the music.

Explicit CLI dimensions/fps/duration must agree with the plan, never silently
retime it. The builder honors existing music choices or `--audio`,
`--music-style electronic|soft|pulse`, or `--no-music`. A supplied BPM is an
assumption unless measured. The Agent still inspects previews and the encoded
candidate; valid JSON is not artistic acceptance.

The portable wrapper initializes a new project, copies plan-relative local
media, installs dependencies and encodes a directed candidate:

```bash
python "${SKILL_DIR}/scripts/create_music_video.py" \
  --prompt "<approved intent>" --plan "<absolute-mv-plan.json>" \
  --output "<new-project>"
```

Without `--plan`, it produces a fixed visualization **scaffold** and, unless
`--draft-only`, `renders/preview/scaffold.mp4`, not a finished delivery. Use the
scaffold for infrastructure/audio tests or replace its scene code. Never label
theme selection as understanding an arbitrary brief.

## Layer and Motion Semantics

Array order is back-to-front. Groups use `layers` recursively; IDs must be
unique among siblings and must not contain `::`. All positions are in logical
`canvas` coordinates and scale to delivery size. Layer origin is local top-left;
rotation/scale pivot at that origin, so use a translated group around centered
geometry when a center pivot is needed. Text origin is its top baseline and
`align` changes horizontal anchoring. Camera transforms the world about the
canvas center: positive `x/y` displace the world, `scale > 1` pushes in.

`transform` supplies initial numeric values:
`x/y=0`, `scale/scale_x/scale_y=1`, `rotation=0` degrees, `opacity/reveal=1`.
`scale_x/scale_y` may be negative for a deliberate flip. `keyframes` is an
ordered array of `{at, property, ...other_properties, ease?}`; `at` is
scene-local seconds, not normalized progress or global time. Each property
interpolates independently from its previous endpoint or base value at zero.
The destination key's `ease` controls that segment. Names (shared with motionkit, see
`src/motion.js` → `EASINGS`): `linear step quadIn quadOut quadInOut cubicIn cubicOut cubicInOut
quartIn quartOut quartInOut expoIn expoOut expoInOut sineInOut backIn backOut backOutStrong
elasticOut spring springSoft springFirm snap swift gentle`, plus parametric
`"bezier(x1,y1,x2,y2)"` and `"spring(damping,frequency)"`. Choosing:
`snap`/`expoOut` for arrivals, `backOut` for pops, `spring*` for physical objects,
`cubicInOut`/`expoInOut` for camera and big moves, `linear` only for constant drift
(see `craft/motion-craft.md`). Spring/back can overshoot geometry; opacity/reveal clamp to 0..1.

### Export finish (motion blur, bloom, grain, vignette, flashes)

Optional `video.json` → `"finish"` is applied by the exporter and contact sheets (the live editor
preview stays unfinished for speed). Omitting it renders exactly as before.

```json
"finish": {
  "motion_blur": {"samples": 6, "shutter": 0.5, "windows": [{"start_sec": 3.2, "end_sec": 3.8, "samples": 10}]},
  "bloom": {"amount": 0.5, "threshold": 0.6, "radius": 18},
  "grain": 0.02, "vignette": 0.2,
  "flashes": [{"at": 7.5, "amount": 0.85, "decay": 0.09}]
}
```

Values are validated (`samples` 1..16, `grain` ≤ 0.1, `vignette` ≤ 0.6, …). Use bloom 0 on paper/UI,
grain 0 for product UI, flashes only on the 1–2 biggest hits (`craft/finish.md`). Motion blur
multiplies export time by the sample count; raise samples only inside fast windows.

For a delayed exit, give each animated property a hold key before the exit
key. A lone `y` key at second 4 interpolates from its base at zero across the
whole opening; it does not mean "start moving at second 4". For example
`[{at:2,y:300},{at:3,y:-200}]` holds `y=300` until 2 seconds when its base is
also 300, then moves out. Inspect authored holds/arrivals, not only key names.

`in_sec/out_sec` control layer visibility in the same scene-local clock; they
do not reset its keyframe clock. Cue timing is frame-aligned; keyframes can use
subframe seconds. `animation_offset_sec/animation_duration_sec` are maintained
by nondestructive editor trims to preserve the original curves and footage
timing. New plans normally omit them. Moving a cue keeps local choreography.

| Kind | Payload and Behavior |
|---|---|
| `text` | `text`, `font_size`, `font_weight`, `font_family`, `line_height`, `align`, optional `max_width`; `color`/`fill`, optional `stroke`/`stroke_width`, and optional `material`. `reveal` clips fill left-to-right while retaining the outline; `letter_reveal: true` reveals whole characters instead. Separate word/letter layers give independent staggering, rotation and replacement. |
| `path` | `points: [[x,y],...]` or SVG `d`; `stroke`, `stroke_width`, optional `fill`, `closed`, `dasharray`, `dash_offset`, and optional `material`. `reveal` draws by path distance; SVG paths require measured `path_length` for reveal. Optional `point_keyframes: [{at,points,ease}]` morphs a polyline with the same point count/correspondence as its base `points`. |
| `image/footage` | Local `src`, required `width/height`, `fit: contain|cover|stretch`, optional `source_offset`. Each footage layer has an independent decoder/time; the same file can appear with different offsets. |
| `rect/ellipse` | Required `width/height`; `fill`, optional `stroke`/`stroke_width` and `material`. |
| `group` | Nested `layers`, common transform/mask. Horizontal reveal requires explicit group `width/height`. |

## Executable Material Recipes

The optional `material` object is executable in both preview and export for
text, path, rect and ellipse layers:

```json
{
  "material": {
    "gradient": {
      "type": "linear",
      "angle_deg": -24,
      "stops": [
        {"offset": 0, "color": "#effcff"},
        {"offset": 0.5, "color": "#66e8ff"},
        {"offset": 1, "color": "#9a79ff"}
      ]
    },
    "glow": {"color": "#66e8ff", "blur": 22, "opacity": 0.65},
    "extrusion": {"color": "#17172b", "distance": 10, "angle_deg": 45, "steps": 4},
    "glass": {"tint": "#66e8ff", "opacity": 0.22, "rim": "#e9fbff", "rim_width": 2, "sheen": 0.2},
    "blend": "screen"
  }
}
```

Each property is optional:

- `gradient`: `type` is `linear` (default) or `radial`; linear accepts
  `angle_deg`, radial accepts normalized `center_x/center_y` and `radius`.
  Both use 2-8 strictly ordered hex `stops` with increasing `offset` values
  in 0..1. The gradient is used as the fill. SVG `d` path gradients require
  explicit `bounds: {x,y,width,height}`; point paths infer bounds from their
  current keyframed points.
- `glow`: hex `color`, `blur` 0..64 and `opacity` 0..1. Use sparingly; large
  shadow blurs are costly in per-frame rendering.
- `extrusion`: hex `color`, positive `distance` up to 64, `angle_deg`, and
  integer `steps` 1..8. This draws offset copies as a stylized 2.5D edge, not
  actual 3D geometry.
- `glass`: only for rect/ellipse. Requires hex `tint`, `rim`, `opacity` 0..0.55,
  `rim_width` 0..8 and `sheen` 0..0.55. Optional `sheen_offset`/`sheen_width`
  place the static sheen band. It simulates tint, edge and highlight; it does
  not sample/refract what's behind it. For an animated sweep, add a child
  highlight layer and use ordinary `transform`/`keyframes`.
- `blend`: `source-over`, `screen`, `lighter`, `multiply`, `overlay` or
  `soft-light`. Additive blends are best reserved for emissive layers.

Recipes are optional and genre-specific, not global defaults. Build atmosphere
with authored translucent shapes, radial gradients and deterministic
keyframes. Unsupported CSS filters, true refraction, arbitrary shaders
and 3D camera geometry are not implied by this schema (temporal motion blur is available via `finish`);
implement and validate them in project-specific renderer code if required.
For art direction beyond the schema, including beams, typography, transitions,
hierarchy and safe areas, read [visual-design-playbook.md](visual-design-playbook.md).

Optional layer masks are local, transformed with the layer:
`{kind:"rect", x:0, y:0, width:300, height:200}` or
`{kind:"circle", x:100, y:100, radius:100}`. Animate mask content or its parent;
arbitrary animated mask geometry/filter/shader parameters are not supported
fields. Add project-specific deterministic drawing for those requirements.
Do not store unimplemented fields and claim they execute. Real 3D, arbitrary
SVG morphing, text-on-path and advanced blending need suitable
project code/libraries rather than labels in this schema; for those, prefer a motionkit code film
(`scripts/init_code_film.py`, `motionkit-api.md`).

## Cross-Scene Transitions

Any incoming scene cue may define an executable transition that determines how
the outgoing scene transforms into the incoming one. **Read
[transition-playbook.md](transition-playbook.md) for creative guidance on
choosing transitions based on scene relationships.**

### Syntax

```json
{
  "id": "scene-02",
  "start_sec": 5,
  "end_sec": 10,
  "transition": {
    "type": "flow",
    "direction": "left",
    "duration_sec": 0.6
  },
  "layers": [...]
}
```

### Supported Transition Types

**Seven transition types are fully implemented and rendered:**

1. **`cut`** - Instant switch, no transition (default if omitted)

2. **`dissolve`** - Cross-fade between scenes
   ```json
   {"type": "dissolve", "duration_sec": 0.5}
   ```

3. **`wipe`** - One scene reveals the next along a direction
   - Supports `direction`: `left`, `right`, `up`, `down`
   ```json
   {"type": "wipe", "direction": "left", "duration_sec": 0.5}
   ```

4. **`push`** - Outgoing scene slides away as incoming slides in
   - Supports `direction`: `left`, `right`, `up`, `down`
   ```json
   {"type": "push", "direction": "left", "duration_sec": 0.4}
   ```

5. **`zoom`** - Outgoing zooms out while incoming zooms in
   ```json
   {"type": "zoom", "duration_sec": 0.6}
   ```

6. **`flow`** - Organic liquid-like transition with edge highlights
   - Reveals through smoothly changing curved front
   - Narrow palette-derived light edge
   - Supports `direction`: `left`, `right`, `up`, `down`
   ```json
   {"type": "flow", "direction": "down", "duration_sec": 0.8}
   ```

7. **`iris`** - Circular reveal/conceal from focal point
   - Optional `origin_x`, `origin_y` (normalized 0..1, default 0.5)
   ```json
   {"type": "iris", "origin_x": 0.7, "origin_y": 0.3, "duration_sec": 0.6}
   ```

### Choosing Transitions

**Match the transition to the scene relationship:**

- **Sequential scenes** → `wipe` (moving forward/backward)
- **Transformational** → `flow` (organic evolution)
- **Focus shift** → `iris` or `zoom`
- **Replacement** → `push` (one context replaces another)
- **Disconnected** → `dissolve` (or reconsider if truly disconnected)
- **Dramatic beat** → `cut`

See [transition-playbook.md](transition-playbook.md) for the complete decision
framework, duration guidelines, and common patterns.

### Duration Guidelines

```javascript
0.3s  // Snappy, energetic (music video cuts)
0.5s  // Standard, professional
0.8s  // Smooth, organic (flow transitions)
1.2s  // Slow, contemplative
```

Rule of thumb: 10-20% of the shorter scene's duration, minimum 0.3s, maximum 1.5s.

### Technical Details

Transitions work between contiguous, enabled scene cues on the same track when
they belong to the same renderer family: layered composition, studio, report /
product, or legacy code-rendered MV. The outgoing scene is sampled at its last
visible source frame (including nested footage) and held while the compositor
animates; it is not rewound and replayed. Transition progress uses visible time
since the incoming cue's start, independently of its animation source offset.
Its duration must fit the incoming visible interval. Incoming choreography
keeps its own source clock, including nondestructive trim offsets. No compatible
predecessor means a normal cut. A genuinely moving outgoing handoff needs an
authored continuous scene or an implemented overlap/post-roll contract; the
starter does not imply such handles. `create-program.mjs`
accepts an Agent-authored transition object on a line or page; `false` disables
the inferred transition for that scene. Its genre-aware defaults are starting
points, not locked templates.

### Transition + Motion Continuity

**Advanced technique:** Design keyframes that work with the transition.

```json
{
  "scene-1": {
    "layers": [{
      "keyframes": [
        {"at": 3, "scale": 1},
        {"at": 5, "scale": 1.2}  // Scaling up at scene end
      ]
    }],
    "transition": {"type": "zoom", "duration_sec": 0.6}
  },
  "scene-2": {
    "start_sec": 5,
    "layers": [{
      "keyframes": [
        {"at": 0, "scale": 1.5},  // Continues the scale increase
        {"at": 2, "scale": 1, "ease": "cubicOut"}
      ]
    }]
  }
}
```

Result: Continuous scaling across transition. See
[motion-continuity.md](motion-continuity.md) for patterns.

### Creative Direction

The preset names are only compositing tools. Direct the pair: name the outgoing
action/state, what visual identity or information survives, the incoming
focus/action, and why the camera or reveal connects them. A passing object,
screen plane, foreground card, chart mark, aperture, or matched silhouette can
carry the cut. For reports and product walkthroughs, keep axes, category order,
units, product/UI identity, and labels stable whenever they encode meaning;
use a cut or subdued handoff rather than obscuring or implying a data change.

**Avoid slideshow syndrome:** Repeating generic push/wipe/dissolve for every
scene recreates PowerPoint. Repeating `flow`/`iris` without purpose is no better.
If no meaningful relation exists, use a deliberate cut or restrained handoff;
do not manufacture continuity that changes the message.

### Custom Transitions

This schema is a tested convenience, not a ceiling on Agent authoring. For a
better custom transition, implement project-specific scene/compositor code
and update any affected validation, media preparation and control contracts.
Keep preview, random-access frame rendering and export on the same timeline;
the existing WebUI and Agent API must still operate the resulting project.
Do not put an unsupported type or shader label in JSON and treat it as an
implemented effect. A continuous custom scene may need no transition preset.

## Shared Sound Events

Optional plan `sound_events` add original local effects, not another music bed:

```json
{
  "sound_events": [
    {"id":"land","at_sec":1.5,"type":"hit","gain":0.5,"pan":-0.2},
    {"id":"travel","at_sec":2,"type":"whoosh","duration_sec":0.3,"gain":0.4}
  ]
}
```

Types are `hit/whoosh/tick`. Use the same absolute frame time as the visible
event; times must be aligned to project fps. Defaults/explicit durations must
fit inside the video, rather than getting silently cut. `gain` is 0..1, `pan`
-1..1; at most 256 events. Don't score every minor object with an overlapping
transient: group related arrivals and leave space for music and narration.

The builder creates deterministic stereo 48kHz PCM with de-click envelopes
and safe normalization, on independent `vm-motion-sfx` track/cue. The file is
content-addressed and its event/frame/sample receipt lives in
`validation/motion-sfx.json`. Unsupported effects need local authorized files
or Agent-authored synthesis/another tool. Timing correctness and no clipping
do not prove genre fit or listening quality.

## Runnable Original Study

The bundled example demonstrates assembly, independently animated letters,
trace drawing, moving nested SVG panels, camera traversal, cascading panels
and reassembly. It is a capability example, not the default look:

```bash
node "${SKILL_DIR}/assets/examples/build-motion-study.mjs" --output "<new-plan-directory>"
python "${SKILL_DIR}/scripts/create_music_video.py" \
  --prompt "Original layered motion study" \
  --plan "<new-plan-directory>/mv-plan.json" --output "<new-project>"
```

Inspect dense transition strips and local playback before using its techniques
in a delivery. Agent APIs `cue.update` support `layers/camera/keyframes/canvas/
transition`; use `timeline.replace` for atomic larger changes.
