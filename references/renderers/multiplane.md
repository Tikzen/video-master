# Optional Multiplane backend

Use for deterministic HTML/CSS/SVG/Canvas/WebGL scenes when parallel capture,
cut-aware temporal blur, stronger determinism checks or resumable jobs help.
Keep working projects on their renderer unless migration serves the request.
Retain direction, WebUI review, studio display state, independent audio tracks,
Python motionkit and delivery gates.

## Runtime

Requires Node >=24, **multiplane@0.3.13**, matching Playwright Chromium and FFmpeg
supporting `-fps_mode passthrough` plus the chosen encoder. Upstream:
`https://github.com/LBEILC/Multiplane`. Keep the exact npm release and generated
package-lock.json. This Skill distributes integration code and an npm declaration;
upstream/dependency licenses and notices remain with their distributions.

Initialize a NEW project outside the installed Skill:

```sh
python "${SKILL_DIR}/scripts/init_multiplane.py" "<absolute-project>" \
  --name "episode-name" --duration 10 --fps 30 --install --install-browser
```

Install flags are optional; initialization works offline and refuses nonempty
targets. `--install` uses project-local npm without lifecycle scripts;
`--install-browser` separately downloads the browser. Copied adapter/audio helpers
make the project independent of the installed Skill. No global or desktop install.

Runtime folders default to `<project>/.runtime/`. Set MULTIPLANE_HOME,
PLAYWRIGHT_BROWSERS_PATH and npm_config_cache to reuse permitted runtime paths.
TEMP/TMP are explicitly redirected into the project; VIDEO_MASTER_TEMP may
override them with another permitted directory. Reuse matching browsers
where available. Check existing env values also respect disk restrictions.
Runtime folders, node_modules and jobs must stay out of Skill packages.

Set MULTIPLANE_FFMPEG (or FFMPEG_PATH) to a known binary as needed. doctor runs
a real encoder test and reports stderr for unsupported flags or NVENC driver/API
errors. GPU raster and GPU encoding are separate; default is GPU raster + x264.
Never silently substitute codecs or change drivers.

## Contract and limitations

- video.json: output dimensions/fps/duration.
- timeline.json: scenes/events, independent music/voice/SFX cues, and cuts for
  true hard cuts (not every chapter or an overlap transition).
- renderer.json: schema video-master.multiplane.v1, shot, raster, encoder,
  workers and requires_async_media.
- shot.html: fixed #stage, SHOT.ready and synchronous SHOT.render(t); delegates
  to src/scene.js setup/drawAt/post/blurAt.
- Preload assets/fonts in setup. Draw from absolute time and seeded inputs;
  canvas backing dimensions follow devicePixelRatio. Preview uses the same drawAt.
  A `blurAt(t)` hook can lower samples, not exceed `post.motionBlur`; set that
  ceiling to the highest requested count. Root-relative font URLs avoid ambiguity
  between module-relative lint paths and document-relative FontFace URLs.

The first adapter **rejects per-sample async footage seeks**, footage timelines
and requires_async_media:true. Keep these on the existing renderer or implement
a deterministic media adapter first. Never wrap async renderFrameAt as sync
render(t), play video by wall clock, or hide stale frames by disabling checks.
Short predecoded image sequences may be loaded in ready within a memory budget;
whole-film preloading is not a default. Python/Cairo retains its existing backend.

Post effects need one owner. If upstream handles temporal blur, disable old blur.
Active legacy video.json.finish is rejected until ownership is resolved. Port
required bloom/color effects deliberately and document order. Three.js/DOF and
alpha formats remain optional upstream features, not enabled by this initializer.

## Commands

Run inside the initialized project or add --project <absolute-project>:

```sh
node tools/multiplane.mjs doctor
node tools/multiplane.mjs lint
node tools/multiplane.mjs inspect
node tools/multiplane.mjs stills --at 0,2,5,8,9.966666666666667 --out renders/stills-v1
node tools/multiplane.mjs verify --at 0,2,5,8,9 --workers 2
node tools/multiplane.mjs render --from 4 --to 6 --out renders/preview/hero-v1.mp4
node tools/multiplane.mjs render --out delivery/final-v1.mp4
```

Follow the same craft/review gates; inspect full-size hero, seams and ending.
verify tests reorder/reload and single/multi-worker output. Inspect small GPU
raster-jitter warnings; use software raster when exact pixels are needed. Do not
promise bit-identical output across GPUs/drivers or speedups without same-scene,
same-quality measurements. Temporal/DOF samples add work. Full exports are reviewed
candidates, not the iteration loop.

Audio is premixed as a full absolute-time WAV using shared voiceIntervals,
mixGainExpression and audioSlices. Existing project policy modules are preferred,
preserving custom gains/release curves. Ranges trim the master once by from/to;
do not rebase ducking or double-trim. Stems remain intact. Cache identity includes
timeline, policy and source bytes.

NDJSON events stream to stdout and validation/multiplane-<command>-<timestamp>.jsonl.
Checkpoints/status are in renders/jobs/<jobId>/. Callers may map progress, warning,
finding and result into UI; the adapter does not replace the workbench.

```sh
node tools/multiplane.mjs status --job <jobId>
node tools/multiplane.mjs cancel --job <jobId>
node tools/multiplane.mjs resume --job <jobId> --workers 2
```

Resume preserves upstream checkpoint options/audio; only workers may change.
Changed loaded inputs/environment may reject resume. Diagnose instead of joining
incompatible segments. Before the first roughly ten-second segment is sealed,
there may be no completed frames to reuse.
Job management does not parse the currently edited project JSON; upstream checks
the checkpoint's actual loaded inputs. Resume decoding uses its recorded FFmpeg.

Render checks actual encoder operation and loaded shot vs video.json, preserves
upstream encoded checks, fully decodes with FFmpeg and writes a hashed delivery
receipt to validation/. These checks do not prove human approval or visual/audio
quality; perform those gates too.
