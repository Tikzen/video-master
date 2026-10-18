# Production Contract

Canonical concepts shared across Create Video, Create Video Kit, and Edit Video
Project. Existing project schemas take precedence when they encode the same
information clearly.

## Project Layout

```text
<project>/
  video.json                    # runtime settings and project identity
  video_brief.md                # confirmed audience, purpose, constraints
  evidence.json                 # source ledger, only when factual claims exist
  video_spec.md                 # complete approved creative/content plan
  video_lock.md                 # cross-scene execution invariants
  script.md                     # narration/dialogue/authorized lyrics if used
  storyboard.json               # scene order, visual job, staging, dependencies
  timeline.json                 # timed renderer cues and audio events
  assets/                        # selected local media, fonts, models, provenance
  audio/
    voice/ music/ sfx/           # stems stay distinct before mixing
  src/
    editor.html                 # preview + frame-accurate multi-track timeline UI
    editor.css
    editor.js
    scene.js                    # deterministic scene/frame function
    server.mjs                  # local project-bound editor API
    render.mjs                  # frame renderer + encoder entrypoint
  renders/
    preview/                     # contact sheets and preview encodes
    temp/                        # in-progress versioned encodes
  delivery/                      # promoted final video and companions
  validation/                    # receipts, reports, hashes, QA notes
  confirmations/                 # user receipts when persisted
```

Do not create empty folders just to match this tree. Do not place scratch media
under a reusable Video Kit. Keep large source files in place where stable and
record their path, hash, and permission notes.

## Provenance Types

- `[decision]`: explicitly supplied by the user.
- `[fact]`: independently verified or machine-observed metadata.
- `[suggested]`: agent's proposal awaiting confirmation.
- `[derived]`: execution value derived from confirmed facts/decisions.

These labels must not be collapsed. A suggestion becomes a decision only after
the user confirms or explicitly delegates it.

## `video.json`

Contains technical settings and project identity, not creative intent:

```json
{
  "schema": "video-master.project.v1",
  "name": "product-launch",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "duration_seconds": 30,
  "container": "mp4",
  "video_codec": "libx264",
  "audio_codec": "aac",
  "color_space": "bt709"
}
```

Resolution, frame rate, codec, duration, and color handling are confirmed or
declared defaults. They must agree with the encoder invocation and delivery
receipt. Scene code reads dimensions from this config instead of scattering
hardcoded canvas sizes.

## Evidence Item

Every factual spoken line, lower-third, product spec, comparative claim, and
quoted statement should reference evidence:

```json
{
  "id": "fact-003",
  "claim": "The case is 8.2 mm thick.",
  "source": "manufacturer-spec.pdf",
  "locator": "page 4, Dimensions",
  "timestamp": null,
  "excerpt": "Thickness: 8.2 mm",
  "status": "verified",
  "usage": "voiceover and on-screen label"
}
```

Allowed status: `verified`, `attributed`, `inference`, `unresolved`. Unresolved
claims cannot be presented as fact. Asset records separately capture original
path, project path, creator/source, license/permission, attribution, hash, and
transformations.

## `video_spec.md` and `video_lock.md`

`video_spec.md` is the complete narrative and design plan:

1. Brief and audience effect.
2. Story/core message and evidence/source policy.
3. Approved treatment, with rationale.
4. Ordered scene roster and each scene's purpose.
5. Visual and motion system, including intensity rhythm and legibility.
6. Script/beat sheet relationship to visuals.
7. Asset, voice, soundtrack and rights plan.
8. Rendering approach and output contract.
9. Acceptance checklist and known constraints.

`video_lock.md` is compact and executable. It captures invariants only:
dimensions/fps/color, global palette/type roles, identity/appearance,
composition/safe areas, camera/motion/easing/transitions, recurring layer
contract, audio/caption policy, renderer entrypoint, and required checks.
Scene timing and scene-specific content belong in storyboard/timeline.
Lock a motion/visual rule only when it is an intentional approved invariant;
do not lock the starter's effect list, layouts, example shot count or technical
recipe by accident. Technical choices and staging can evolve within the
confirmed outcome. Document custom mechanisms without presenting them as a
new user decision or limiting the Agent to previously named presets.

## `storyboard.json`

One item per ordered scene:

```json
{
  "id": "scene-04",
  "title": "Macro reveal",
  "purpose": "Reveal the lens mechanism without obscuring its shape.",
  "start_sec": 12.0,
  "end_sec": 18.5,
  "visual_job": "macro_orbit",
  "subject": "product-camera-module",
  "camera": "slow_120deg_orbit",
  "motion": "ease_in_out",
  "transition_in": "light_wipe",
  "transition_out": "match_cut",
  "script_refs": [],
  "evidence_refs": ["fact-003"],
  "asset_refs": ["assets/camera-model.glb"],
  "layers": ["background", "hero", "callout", "caption"],
  "status": "planned"
}
```

Preserve the approved content and material narrative order. Internal shot
subdivision, camera paths and element choreography remain Agent-owned unless
the user explicitly approved those exact details; update storyboard/timeline
together as they evolve. Do not silently remove an approved argument, claim or
required scene. A material story change or departure from an explicitly locked
shot roster returns to the confirmation gate; bounded staging improvements do
not require a new questionnaire.

## `timeline.json`

Use a single frame-accurate sequence model for the visual editor, preview, and
encoder:

```json
{
  "schema": "video-master.timeline.v1",
  "duration_seconds": 8,
  "fps": 30,
  "tracks": [
    {"id": "scenes", "kind": "video", "name": "Scenes", "visible": true, "muted": false},
    {"id": "titles", "kind": "graphics", "name": "Titles", "visible": true, "muted": false},
    {"id": "music", "kind": "music", "name": "Music", "visible": true, "muted": false}
  ],
  "cues": [
    {
      "id": "scene-01",
      "track_id": "scenes",
      "kind": "scene",
      "start_sec": 0,
      "end_sec": 3,
      "title": "Opening",
      "scene": "product_hero",
      "text": "A new point of view.",
      "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1},
      "keyframes": [],
      "asset_refs": [],
      "evidence_refs": []
    }
  ]
}
```

Each cue needs stable `id`, `track_id`, `kind`, `start_sec`, `end_sec`, and
scene/action; text and asset/evidence/script references apply when relevant.
Tracks need stable `id`, `kind`, `name`, `visible`, and `muted`. Multiple cues
may overlap intentionally on independent tracks. Overlap on the same exclusive
layer is invalid unless the renderer defines a blend rule. Every cue is within
total duration and snap/trim behavior rounds to whole frames at the declared
frame rate.

The timeline editor shows a labelled ruler at every whole second regardless
of clip boundaries. Its selected-clip inspector edits the same cue object that
the renderer consumes. Timecode conversion uses frame index as authority;
display values are derived, not separately stored. Save/apply writes
`timeline.json` through the local project API and updates the preview.

Audio events use seconds and optional beat/bar indices. They are derived from
the approved audio, not perceived or invented without a source. Animation
curves are functions of absolute time/frame, use seeded randomness, and render
the same frame for the same inputs.

For executable layered 2D scenes and Agent-authored MV plans, read
[composition-format.md](composition-format.md). A `scene: "composition"`
cue owns its draw-ordered layers, camera and sampled keyframes, while optional
`sound_events` compile into a separate timed SFX stem. Storyboard motion prose
does not execute. The preset MV builder remains a scaffold until the Agent
authors and inspects its actual choreography.

## Delivery Receipt

Record final relative/absolute path, SHA-256, dimensions, fps, duration,
container/codecs, audio/subtitle/chapter files, source revision, checks run,
review status, and known limitations. An encoder exit code alone is not a
delivery receipt.
