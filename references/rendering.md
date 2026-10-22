# Rendering Authority

Use this authority to create an actual video. Keep all visual animation
code-rendered; footage and images are inputs, not the renderer.

## Choose the Renderer

1. Use a functioning renderer already in the project.
2. Otherwise choose the least-complex renderer that serves the confirmed
   treatment:
   - DOM/Canvas/SVG for typography-led 2D and infographics.
   - WebGL/Three.js when the core scene needs real 3D geometry, lighting, or
     camera motion.
   - A React timeline renderer such as Remotion when it is already present or
     composition is naturally component/timeline based.
   - An established specialist renderer for equation-heavy, diagrammatic, or
     other domain-specific motion.
   - **Multiplane** as an optional HTML/Canvas/WebGL backend for parallel capture,
     resumable export and cut-aware motion blur. Read
     [renderers/multiplane.md](renderers/multiplane.md); initialize with
     `scripts/init_multiplane.py`. This first adapter rejects asynchronous
     footage seeks and active legacy finish settings. Retain the existing
     backend for unsupported projects.
   - **motionkit code film** (bundled Python engine) when the treatment needs
     showcase-level choreography: MV/showreels, brand or abstract films, and studio or
     presentation pieces with custom staging, particles, 3D point clouds,
     variable-font kinetic type, live two-scene transitions, temporal motion blur
     or post. Initialize it inside the episode project with
     `python "${SKILL_DIR}/scripts/init_code_film.py" "<project>/code-film" --genre mv|studio|present`
     (or `--from-example dian-xian-mian|studio-timeline|present-launch`). It renders
     deterministically, chunked and resumably, with built-in QA (`still`, `sheet`,
     `diff`, `audio-qa`, `loop`). See [motionkit-api.md](motionkit-api.md) and
     [craft/README.md](craft/README.md). Its MP4 can be added to the workbench timeline
     as a footage cue for preview, annotation and delivery.
3. If none exists, initialize from
   [`assets/starter-project`](../assets/starter-project) with
   `scripts/init_video_project.py`.

Do not add a heavyweight framework to an existing project merely for style.
Before implementation, inspect `node`, package manager, browser/runtime,
renderer dependencies, `ffmpeg`, and `ffprobe`. Report missing prerequisites
early; install only through the project's established package flow and do not
silently replace confirmed tool choices.

## Runtime Contract

The core scene API is conceptually:

```text
render_frame(project, timeline, t_or_frame, assets, seed) -> frame
```

For each timestamp `t`:

- Resolve the scene and active layer cues from the confirmed storyboard and
  timeline; do not hardcode a separate story in renderer logic.
- Compute every transform, particle seed, lighting value, caption, camera
  position, and transition from absolute `t`, `fps`, and input data.
- Do not depend on wall-clock `requestAnimationFrame`, previous frame state,
  nondeterministic random calls, network assets, or external services while
  exporting.
- Preview and final export must call the same scene logic.
- Keep original audio separate; never silently stretch, replace, clip, or
  discard it. Use precomputed waveform/beat features for audio-reactive motion.

Real-time playback may use requestAnimationFrame to select `t`; the resulting
frame still comes from the deterministic function. No scene may depend on
visiting earlier frames.

## Implement

- Create a render graph/layer stack with named scene boundaries and transition
  ownership. Each scene has an explicit enter/hold/exit contract.
- Implement one representative hero scene first. Render it at target size and
  inspect it before applying the design language to all scenes.
- Build shared typography, camera, lighting, material, particle, transition,
  mask, and compositing utilities only when they remove real duplication.
- Animate for intent: product truth/readability, music structure, story beat,
  speaker identity. Use [motion-direction.md](motion-direction.md) for visual
  events, secondary reactions and motif variation; an effect without a
  communication job is removed. The starter shares deterministic easing
  primitives in `src/motion.js`, not a fixed choreography.
- For layered 2D authoring, use the executable composition/plan contract in
  [composition-format.md](composition-format.md). Arrays define draw order;
  each layer/group/camera has real sampled motion, not descriptive metadata.
  If a desired effect is unsupported, implement/test project code instead of
  storing an inert property. The five-theme MV scaffold is not a completed
  music-video treatment.
- Use actual licensed product imagery/model/UI when fidelity requires it.
  Programmatic proxies must be labeled as placeholders, not passed off as the
  real product.
- Use local fonts/media during export. Detect font/model files and report
  fallback or substitution rather than accepting browser defaults silently.

## Preflight Without Full Exports

Before encoding a complete video, validate the project and render a contact sheet
with full-size samples through the project's actual renderer:

```bash
node src/validate.mjs
python "${SKILL_DIR}/scripts/review_motion.py" --project "." --sheet \
  --save-frames --output renders/preview/preflight-v1.png
```

Inspect readable holds, camera extremes, transitions, dense text and the final
active frame at delivery dimensions. Essential copy stays inside a 5% inset
safe area, moving cameras keep background coverage at all edges, and the final
frame must be an intentional readable landing. The contact sheet renders stills
in Chromium and does not encode video. Use a short native-fps range only when
stills cannot establish motion quality; after a consolidated fix, rerun only
the affected checks. See [quality-gates.md](quality-gates.md) for the full gate.

Do not full-render every iteration. Complete the human/agent preview gate first,
then encode the complete video once to a versioned candidate. Re-encode only if
the encoded QA fails for a blocking reason or an approved change affects output.

## Render

For the bundled starter:

```bash
npm install
npx playwright install chromium
npm run editor
node src/render.mjs --output renders/temp/preview.mp4 --duration 8 --fps 30
```

For a later shot, use absolute timeline time; no timeline rewrite is needed:

```bash
node src/render.mjs --start 12 --duration 3 --output renders/preview/shot-v1.mp4
```

`--start` and duration snap to the selected output frame rate. Audio is trimmed
from its original source offset, and fades/ducking retain original timing.
The delivery receipt records `source_start_sec` and `source_end_sec`.
The default, without a range override, still renders the complete video.

Optional audio:

```bash
node src/render.mjs --output renders/temp/preview.mp4 --audio audio/music/track.wav
```

The starter streams one deterministic PNG frame at a time to FFmpeg rather than
storing an unbounded frame directory. npm installs platform FFmpeg/FFprobe
binaries; Chromium is installed with the separate command above. To use
another FFmpeg build, set `FFMPEG_PATH` / `FFPROBE_PATH` to absolute executable
paths. Report dependency installation failures explicitly. Do not silently
output a GIF or browser recording instead of the requested MP4.

For another project, use its own render command. Always write to a temporary or
versioned destination first; promote only after the encoded file passes QA.
