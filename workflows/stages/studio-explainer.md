# Studio Explainer

Load for dual-host news/explanation in a composited studio, including the
user's anime/pixel-style reference. Ask style/host identity in default mode;
one-sentence completion may infer original characters. One-sentence mode still
never ships the starter set or the template hosts as final without saying so; it
designs original ones and discloses that choice. Do not copy an existing
character, station mark, likeness, or source program branding without rights.

## Agent-Owned Production

1. Resolve sourced topic → evidence-backed explanation → two-host script.
   The user provides topic/style, not a finished script or shot list.
2. **Studio look round (WebUI).** Design at least three polished, distinct studio looks
   and render each with the production renderer: a wide frame and a screen-push frame,
   ≥960 px, with hosts or stand-ins, the caption plate and real screen content
   (bar: [genre-studio.md §0](../../references/craft/genre-studio.md)). Publish them as a
   `studio-look` gallery checkpoint, then open `/create?panel=review`. Template:
   `assets/studio-rounds/studio-look.example.json`. Validate and publish it with
   `scripts/studio_rounds.py publish`. Do not ship the starter set or the motionkit
   default `NewsSet` palette unchanged.
3. **Host source round (WebUI).** Run `studio_rounds.py prepare` and publish
   `host-source` (template `host-source.example.json`). It offers four sources: upload
   立绘, generate with an image API, upload and redraw, or the built-in template. The
   page must state that **templates are not recommended**, and the template card carries
   a warning. Uploaded files arrive in `response.uploads` (`assets/imports/images/`).
   - *Upload*: the upload is the master. Check alpha and crop. If the image has a
     background, ask before removing it. With a single image, animate only the whole
     sticker (§ motion rules below).
   - *Generate* / *Redraw*: read [image-tools.md](image-tools.md), configure the
     provider through `/create?panel=images`, get consent for the request count, then
     publish a `host-design` gallery: ≥3 cast designs, each a neutral and a smile per
     host, transparent. The chosen design's neutral becomes `hosts[].master`.
   - *Template*: record the explicit choice and set `accept_vector_skin`. This is never
     the default.
   Carry earlier chat facts forward (e.g. "蓝色可爱，白色成熟") and don't ask again.
4. **Storyboard + 人物差分要求表.** When `program.json` (lines, speakers,
   expressions, cameras, media) and the storyboard are written, also run
   `python "${SKILL_DIR}/scripts/expression_sheet.py" build --project <P>` and deliver
   `expression_sheet.md` next to the storyboard. Rerun it after every script change.
   When an image API is available, generate the differentials from the sheet; this may
   use a different, edit-capable model from the one that made the master:
   `expression_sheet.py generate --project <P> --authorize-requests --backend <name>`,
   only after the user has approved the row count and cost. Then run `check`, fix or
   regenerate failing rows, and run `apply`. With no API, the sheet is still delivered,
   so the user can commission or draw the differentials, and missing ones fall back to
   the base image.
5. Prepare TTS using the user's selected provider or consented voices.
   Read [voice-tools.md](voice-tools.md) for MiniMax/local selection, private
   env setup, paid authorization and per-host voice mapping.
   The supplied Windows local-TTS adapter is a no-service baseline, not cloned
   or premium voice quality. Existing authorized per-line recordings also work.
6. Build actual speech-length intervals, alternating turns with measured gaps,
   expression cues, subtitles and screen shots. Subtitle cue bounds are
   utterance-level; don't claim word alignment.
   Read [music-tools.md](music-tools.md) when backing music is wanted or undecided.
   The program builder applies the saved music choice, or `program.music`, at
   final measured duration on an independent track, with speech ducking.
7. Verify before the single full export (gates below), render the complete video,
   check camera/state changes and audio in the encoded file, then deliver the source
   and the optional precision editor.

## Motion and Display Rules (binding)

These come from a delivered project's retrospective. Each one has already reached a user once.

- **Whole sticker only.** A host image moves as one transform about its base. Never
  stretch a body region, split layers or warp the face.
- **Voice drives stretch and rebound.** While a host speaks, the whole sticker follows the
  loudness: it stretches up on loud syllables, then the spring rebounds. When the voice
  stops, the motion eases down into idle breathing and sway, which run on global time.
  The builder does this through `src/studio-motion.js` (`stickerTransform`). Custom
  renderers must keep the same behaviour, not a fixed-frequency wobble.
- **Motion must be visible.** Size it for the PIP, so it gives ≥3 px of travel at about
  135 px. Prove it on consecutive frames of the encoded file, in both the large shot and
  the PIP.
- **Display ≠ audio.** In the pause between lines, the caption, the name plate and the PIP
  hold the last line (`heldLine`, `heldSpeaker`). Opening copy is for the open only; the
  host fallback is for before the first line only. The builder writes caption cues to the
  scene end and keeps the audio cues at their true length.
- **Pure in time.** The same timestamp produces the same frame under scrubbing, random
  access and chunked rendering. There is no "previous frame" state.

## Studio Gates (before the one full export)

1. Traverse **every** line end → gap → next line start, plus the last line → end card.
   At each point, the caption, the name and the PIP equal the held line, and no opening or
   default copy appears.
2. Render a short native-fps range across a few turns, at least 8 s. Check that the motion
   is visible and follows speech in the large shot and the PIP, with no snap at line ends.
3. Render times in random order and then sequentially; the results must be identical.
4. After encoding, re-check gap frames and the motion strip from the MP4 itself, not from
   the preview path.
5. Report the coverage honestly: what was code-checked, image-checked, played, compared
   byte-wise or actually listened to.

## Executable Program

In an initialized project, author `program.json`:

```json
{
  "genre": "studio",
  "title": "技术演播室",
  "background": "assets/art/studio.png",
  "hosts": [
    {"id":"host-a","name":"阿岚","color":"#c95353","master":"assets/art/host-a-neutral.png","expressions":{
      "neutral":"assets/art/host-a-neutral.png",
      "excited":"assets/art/hosts/host-a/excited.png",
      "excited_talk":"assets/art/hosts/host-a/excited_talk.png",
      "neutral_blink":"assets/art/hosts/host-a/neutral_blink.png"
    }},
    {"id":"host-b","name":"小青","color":"#36a59d","expressions":{
      "neutral":"assets/art/host-b-neutral.png",
      "explain":"assets/art/host-b-explain.png"
    }}
  ],
  "lines": [
    {"speaker":"host-a","text":"今天来看纯代码的视频工作流。","expression":"excited","camera":"studio"},
    {"speaker":"host-b","text":"我们把关键内容放到身后的大屏。","expression":"explain","camera":"screen",
     "headline":"一条时间线","body":"场景、配音、字幕和镜头共用数据。",
     "media":{"kind":"image","src":"assets/screen.png","title":"工作台截图"}}
  ]
}
```

`expressions` keys follow the differential sheet: `<expr>` is the base image,
`<expr>_talk` is the same face with the mouth open, and `<expr>_blink` has the eyes
closed. Every image for a host is on the master's exact canvas. `expression_sheet.py
apply` fills these keys; the renderer uses each one when it is present and otherwise
falls back to the base image.

Provide optional `audio` path per line to bypass TTS. For local speech, run
`node src/local-tts.mjs voices` and use actual installed IDs; no particular
voice is guaranteed. Windows SAPI, macOS `say` and Linux `espeak-ng` follow
[portable-runtime.md](../../references/portable-runtime.md). Missing voices
are explicit blockers, not permission to use cloud speech. MiniMax uses
`tts.provider: "minimax"` and explicit `--authorize-tts` after consent.
The builder does not clone voices; the separate voice-tools stage owns cloning.

For generated backgrounds, inspect and set `screen_rect: [x,y,width,height]`
in the 1280x720 design coordinates. Host `anchor: [x,y,size]` controls sticker
placement. Optional `desk` is a transparent full-frame foreground layer.
The agent owns this alignment; do not ask the user to hand-measure pixels.

### Keep Hosts Clear of Content

Prioritize readable text over character prominence. Place hosts, hands,
expression effects and their speaking inset outside subtitle, headline,
screen-body and chart-label areas wherever possible. When screen content
becomes the focus, shrink, move or fade hosts earlier; choose an unoccupied
inset corner instead of always using the same corner. If space is tight,
temporarily remove the sticker rather than obscure information. Inspect dense
frames and zoom/pose transitions, not only the initial neutral layout. This
is Agent-owned staging work, not another user questionnaire.

```bash
node src/create-program.mjs --input program.json
node src/render.mjs --output delivery/studio-v1.mp4
npm run editor
```

Scene/audio/caption/expression tracks are generated from actual audio metadata.
The screen camera zooms toward the background display, fades large hosts,
retains the held line's speaker as a small overlay, and returns to studio.
Whole-sticker stretch and rebound follow the measured speech RMS through
`src/studio-motion.js` and ease down when the voice stops. Pose changes, talk
frames and blink frames swap whole sprites. Captions and the name plate hold
through the pauses between lines. The source of truth remains `timeline.json`. Studio/report scene
boundaries use the shared transition compositor; the program builder adds a
focal iris when a studio cue changes between stage and screen camera modes.
Keep the actual screen plane and its evidence as the focus, and use an authored
`line.transition` only when it improves that handoff. Consecutive lines on the
same camera mode normally keep the set continuous instead of wiping on every
speaker turn.
This is the diagnostic builder's baseline, not the required studio direction.
The Agent may replace its camera/inset staging, set layers and handoff with
custom code or a continuous scene while preserving host identity, speech
timing and readable evidence. Do not use an iris on every screen visit merely
because it is inferred by the builder.

The included vector skin exists for camera/audio diagnostics only. Omitting
art assets is not a valid way to claim final anime production. A user must
explicitly accept that code-vector style before it can be final.

## Craft Upgrade (2026-10)

Read [craft/genre-studio.md](../../references/craft/genre-studio.md) before staging.

**JS program builder** (unchanged contract, better baseline):
- The code-vector host is now a flat-illustration presenter with deterministic blinking, a mouth driven by the voice energy, expression-driven brows and smile, nods at line starts, and breathing. Optional per-host `look`: `{skin, hair, outfit, outfit2, shirt, hairStyle: "bob"|"short", glasses}`. The code-vector style still needs the user's explicit acceptance as final.
- Sprite hosts: whole-sticker voice-driven stretch/rebound with ease-down, idle breath and sway on global time, `_talk`/`_blink` differentials (2026-10-16 fix; the earlier fixed-rate wobble was too weak and cut off at line ends).
- A lower third appears on each host's first line. Optional per-host `role` sets its second line.
- The screen push eases with `cubicInOut`.
- Add a `finish` block to `video.json` for motion blur, bloom and grain at export (see `composition-format.md`).

**Code film** (`init_code_film.py --genre studio`, reference `assets/examples/code-film-studio-timeline`): use it when the treatment needs any of these:
- shot grammar beyond stage/screen (singles, two-shots, cuts before lines);
- PIP with the speaker during screen shots;
- gestures;
- custom evidence graphics that animate after the camera arrives;
- broadcast graphics.

Feed it the builder's measured voice files with `Speech.add_wav`, so TTS, timing and consent stay in the existing voice stage.
In motionkit, read display state from `Speech.held(t)`, not `Speech.active(t)`, which reflects audio only. `SpriteHost` already uses `Speech.drive`. `Show` holds captions until the next line starts.
