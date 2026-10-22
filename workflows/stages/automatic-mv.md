# Automatic MV Execution

This stage is an execution capability, not a replacement for default style
confirmation. Load for music videos after the user's style is known, or when
the user explicitly selects One-Sentence mode.

## Two User Modes

- **Default:** if style is absent, publish one separate WebUI round with three
  contextual candidates and Custom, using `start_workbench.py`; do not revert
  to sequential chat questions. Users supply style,
  not scripts, storyboards, asset spreadsheets, or technical parameters.
  Follow the selected route's integrated creative confirmation gates;
  consolidate questions instead of making the user operate a production team.
- **One-Sentence:** explicit "一句话完成 / 全自动 / 不要问我" delegates creative
  choices. Infer an executable style, finish the video, and disclose defaults.
  No synthetic user receipts, no mandatory preview approval.

After style is resolved, the agent owns concept, music choice/composition,
licensed asset discovery, image selection, script/word cards, beat plan,
code scene authoring, transitions, export, and QA. Do not hand these tasks
back as user homework.

## Music

Read [music-tools.md](music-tools.md). Use authorized supplied audio when present.
Analyze its actual structure; an assumed BPM is not measured beat detection.
In the default route, resolve missing music choice through its separate WebUI
round (simple / supplied / none + Custom); do not silently replace a requested
song. Explicit one-sentence mode may use the original procedural instrumental
as a zero-service baseline. It has chord
progression, bass, arp, drums, a section envelope, stereo, and saved RMS/peaks.
Do not label it human singing, a famous song, or a professional generative
music service. If vocals are indispensable, use a configured authorized
provider or explain that exact blocker; don't pass off an instrumental as a
completed vocal song.
`--music-style electronic|soft|pulse` selects the baseline musical mood.
Other styles need Agent adaptation, not merely a changed label.


## Craft Gate (replaces the old diversity quota)

Before scene code, the agent must have, in the project:

1. A **one-sentence generator concept** and a design system (`look.py` or `video_lock.md`):
   palette roles, type roles with a glyph-coverage check, grid. See `references/craft/concept-and-system.md`.
2. A **clock and event map**: tempo fitted to whole bars, or a measured grid from the supplied song
   (`motionkit.mv.analyze_track`), plus named events. See `references/craft/time-and-rhythm.md`.
3. A **storyboard table** with a *handoff out* column for every chapter. See `references/craft/handoffs.md`.
4. One **hero chapter** rendered to final quality and reviewed at full size before the rest.

Default renderer for an art-directed MV is a motionkit code film:
`python "${SKILL_DIR}/scripts/init_code_film.py" "<project>/code-film" --genre mv --duration D --bars N`
(or `--from-example dian-xian-mian` to start from the reference reel). The JSON plan path below
remains available for simpler pieces. `scripts/validate_diversity.py` is advisory only; passing
it does not demonstrate quality, and failing it does not block a well-crafted film.

When the request selects Multiplane, follow
[renderers/multiplane.md](../../references/renderers/multiplane.md) instead of
initializing motionkit. Author the same event-driven scene and sound system;
use upstream stills/verify for preflight. The selected renderer changes execution,
not craft, review permissions or independent audio-stem requirements.

## Media

Research 3–8 relevant images/short clips when network material is in scope.
Verify each source's reuse conditions and credits; do not treat search previews
or "royalty-free" wording as universal authorization. Save actual metadata in
the manifest, acquire originals or authorized derivatives, then render fully
offline. Avoid scraping paywalled/watermarked stock or bypassing access.
Use a bounded fallback when discovery fails: replace optional visuals with
code geometry and disclose it. A required real product/person cannot be
silently substituted.

Manifest shape for `create_music_video.py --manifest <absolute-json>`:

```json
{
  "assets": [
    {
      "kind": "image",
      "url": "https://verified-source.example/authorized.jpg",
      "source": "https://verified-source.example/item-page",
      "credit": "Exact source credit",
      "usage": "Verified license/permission and restrictions",
      "title": "Chosen shot"
    }
  ]
}
```

Alternatively use `local` relative to the manifest file. `kind: "footage"`
supports MP4/WebM; keep short local clips. Source audio is not included
automatically. Add it as an explicit audio cue if the brief needs it.
Never use video-generation services as a shortcut for the code motion.

## Direction Before Encoding

Read [craft/motion-craft.md](../../references/craft/motion-craft.md) and [craft/handoffs.md](../../references/craft/handoffs.md) and, for a
style-led MV, [craft/genre-mv.md](../../references/craft/genre-mv.md).
An energetic treatment needs developing visual events, multiple independent
elements, changing spatial/type hierarchy and purposeful camera/transitions.
An image with a sine offset, whole-page slides, or the fixed visualization
loop is not enough. Match internal event and shot density to the user's
request; do not impose a cut/effect quota on every genre.

The Agent authors an executable plan and scene code, not the user. Implement
a difficult representative event first, inspect the render-light contact sheet
and full-size samples, and make a short native-fps preview only where stills
cannot show the motion. Consolidate fixes before checking again; do not encode
the whole MV for every iteration. A single continuous shot can
contain many changing scenes; repeated hard cuts between title cards cannot
substitute for choreography. Keep the user's selected style, not the supplied
reference's exact colors, characters, lyrics or roster.

## Executable Directed Plan

Read [composition-format.md](../../references/composition-format.md), then:

```bash
python "${SKILL_DIR}/scripts/create_music_video.py" \
  --prompt "<user's style and intended feeling>" \
  --plan "<Agent-authored-mv-plan.json>" \
  --output "<new-empty-project>" \
  --draft-only
```

This prepares the project, dependencies, original soundtrack and authored
timeline without a complete encode. Dimensions/fps/duration come from the plan;
explicit CLI overrides must agree. Inspect the project with its own
`src/contact-sheet.mjs` or the portable `review_motion.py --sheet --save-frames`,
then open the live project preview for applicable review. Once those gates pass,
run `node src/render.mjs --output delivery/directed-v1.mp4` once and check the
actual encoded file. The project includes `video.json`, `timeline.json`,
`storyboard.json`, source, provenance and music. The convenience command without
`--draft-only` remains available when an immediate complete encode is explicitly
needed; it skips this staged preflight and should not be the default iteration
loop.

Without `--plan`, the command is an infrastructure **scaffold**: three themes,
default 1920x1080/30fps/24s instrumental. Any encode goes to
`renders/preview/scaffold.mp4`, never automatically to final delivery.
The bundled themes are tested starting points, not a universal style parser.
The agent interprets natural language and changes `design`, cues, SVG/Canvas
composition, or scene code to fit the requested style. Do not route every
prompt to the same "kinetic" preset and claim it matched. For project-specific
art direction, initialize → create draft → author scene code → render. Using
`--draft-only` is allowed for that intermediate step, never as final delivery.

The composition renderer handles ordered/nested independent layers, sparse
numeric keyframes, paths and polyline morphs, masks, typography, camera and
actual cross-scene blends. Legacy visualization presets remain available as
scaffolding, not the design ceiling. Images/SVGs and
videos are decoded locally; video frames are sought to exact timeline time
before export. Preview and export share the same compositor.

Inspect more than first/middle/last for an MV: sample each distinct scene and
transition, verify variation and audio, then deliver MP4 plus editable
timeline. Offer the editor as optional refinement, not a prerequisite to
receiving a video.

