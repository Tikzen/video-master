# Quality Gates

Quality gates check different contracts. A passing JSON validator does not
prove visual quality; a good screenshot does not prove a valid MP4.

Experimental aesthetic/intent self-review follows
[quality-self-review.md](quality-self-review.md) only after specific opt-in.
It adds evidence-backed expectation checks and bounded repair before acceptance;
it does not replace these gates. Keep user-fit and aesthetics separate, and
never average away a binding constraint or call an unobserved modality passed.

## Gate A: Plan and Asset Readiness

Before scene authoring:

- Confirm Stage 1 and Stage 2 receipts exist, unless Quick/delegated mode.
- Validate Video Spec against retained confirmation; validate Lock against the
  approved Spec.
- Validate complete ordered storyboard, timeline, duration, and all evidence
  links.
- Confirm every required asset exists, is readable, permitted, and matches the
  agreed use; optional gaps have an approved fallback.
- Confirm executable renderer/dependencies and output path. Never start an
  expensive generation call to discover a blocked pipeline.

## Gate B: Code and Representative Preview

For Multiplane projects use `stills`, `verify` and short `render --from --to`
equivalents from [renderers/multiplane.md](renderers/multiplane.md). Its receipt
adds encoder/format/full-decode checks; content, framing, audio and acceptance
gates below still apply.

After a coherent code batch and before a full render:

- Run syntax/build/tests and the timeline/project validator.
- Render a contact sheet with the same scene renderer. It is a still-image
  preflight, not a video export:

  ```bash
  python "${SKILL_DIR}/scripts/review_motion.py" --project "<project>" \
    --sheet --save-frames --output renders/preview/preflight-v1.png
  ```

  The sheet includes scene starts/middles/ends, both sides of cuts and authored
  review times. Inspect its paired JSON receipt and the saved full-size PNGs.
  Contact-sheet tiles are only an overview; use full-size samples for text,
  overlap and edge checks. Every inspection output needs a new path.
- Check readable titles, subtitles, values and evidence against a 5% inset
  safe area at delivery dimensions, including transformed bounds and spring
  overshoot. Edge exits are acceptable only after the information has finished
  its job. For camera pan/zoom/rotation, verify the background has enough bleed
  to cover all four viewport edges at the most extreme transform. Keep hosts
  and characters out of essential copy and evidence zones.
- Inspect the last active frame (`duration - 1/fps`) and the ending's settled
  hold. It must show the intended readable finish, not a cut-off title, a
  transition, an accidental blank or a subject still moving out of frame.
- Use [motion-direction.md](motion-direction.md) for the advisory storyboard
  audit and event/cut review. Inspect visible events, reactions and motif
  returns; do not fail a project just because JSON intent fields are absent or
  a scene type repeats.
- For an energetic MV/showreel, compare opening/action/result states within
  shots and both sides of transitions. Check independent element choreography,
  changing focus/layout/scale and legible dynamic type. Small periodic shaking,
  a background pulse or page slides alone do not fulfill that brief. Evaluate
  actual progression and rhythm, not an arbitrary number of layers or cuts.
- Across every genre, inspect a dense strip around representative scene
  boundaries: identify what carries from outgoing to incoming, confirm the
  reveal/camera has a visible reason, and reject repeated whole-page movement
  when it adds no meaning. In reports, check that chart axes, categories,
  units, source notes and value relationships remain stable and readable
  through the handoff; in studio/product shots, check the host/evidence or
  product/UI focal region stays clear.
  Judge custom direction by its observable result and fit to the brief, not
  whether it used the library's recommended grammar, material or transition.
  Do not award quality merely for a higher effect/cut count or for passing a
  preset's tests.
- Inspect the entire preview for missing scenes, blank frames, out-of-bounds
  type, unsafe crops, product/host identity drift, unmotivated motion, and
  unreadable or obstructed content.
- Verify deterministic output by rendering the same timestamp/frame twice and
  comparing pixel hashes; allow documented renderer nondeterminism only if the
  user confirmed it and final QA remains possible.
- Listen through representative speech/music/effects and inspect sync against
  actual audio.
- When stills cannot establish easing, momentum, cut rhythm, glass/light travel
  or camera comfort, encode only a short native-fps range around the uncertain
  event and play it. A range preview is much cheaper than a full export; do not
  lower fps to judge motion cadence.
- Consolidate visual edits before checking again. After a repair, regenerate
  only the affected contact-sheet interval/full-size frames and short ranges.
  Do not encode a complete video for each edit; reserve one full export for
  after the required preview gates pass. Record actual inspection and any
  unperformed checks instead of translating a prompt count into a quality score.
- Verify speech remains intelligible over music, enabled narration triggers the
  intended ducking, independent track levels/fades agree in preview and export,
  and no accidental duplicate music bed or abrupt ending is present.

- For a motionkit code film, run the review loop in
  [craft/review-loop.md](craft/review-loop.md): `python film.py sheet --chapters`,
  full-size `still` frames at hero moments and seams, `python film.py diff` (every
  `suspicious` frame is explained or fixed), `python film.py audio-qa` (no sync misses;
  drop contrast ≥ 6 dB; no sub-dominant chapters), and `python film.py loop` for looping
  pieces. Record findings and fixes in the project `WORKLOG.md`.

- **State across silence (every genre with speech).** Traverse every cue end,
  the gap after it, the next cue start and the last cue's end-card boundary.
  Captions, speaker names, PIP or inset subjects and screen content must show
  the held line, not an opening, brand or default value. Audio cues keep their
  true length. Never "fix" this by stretching audio. Sampling a few times is
  not enough: the defect repeats at every gap.
- **Perceptible character motion.** Characters that should be alive must
  visibly change across consecutive frames at their smallest on-screen size
  (studio PIP ≈ 135 px: ≥ 3 px of travel). Speech-driven motion has to follow
  loudness and ease down after the line instead of snapping. Check a short
  native-fps range and its encoded frames. The presence of animation code
  proves nothing.
- **History independence.** Render a set of timestamps in random order and
  again sequentially (or across chunk boundaries); the hashes must match.
- **One root cause per repeated defect.** When a user reports the same defect
  at several timestamps, find the shared rule (defaults, boundaries, a state
  source) and fix it there. Then re-run the full traversal, not only the
  reported times.

The main agent repairs local issues in a consolidated pass and reruns relevant
checks. Route systemic issues (repeated typography, palette, camera, or
transition problems) back to the Lock/renderer system rather than patching every
scene independently.

## Gate C: Human Preview

The default full route presents a complete preview/contact sheet before final
delivery. Distinguish blocking factual/legal questions from subjective
polish. Apply user notes to the owning artifact and refresh preview. Quick or
explicit delegation may waive this acceptance stop, never technical QA.
An optional self-review report is not a human approval receipt. Include its
actual coverage, unknowns and before/after result rather than a bare total score.

## Gate D: Encoded Delivery

Use `ffprobe` or the selected renderer's equivalent to inspect the final
encoded file. Verify:

- file exists and is non-empty; video and intended audio streams are present;
- expected duration, dimensions, frame rate, aspect ratio, codec/container;
- first/middle/last frames plus transitions decode and are not unexpectedly
  blank, frozen, black, or corrupted;
- audio begins/ends as intended, contains no clipping/dropout/unintended
  silence, and stays synced;
- subtitles/chapters reference the final timeline and remain within duration;
- actual output opens and plays in a normal media player;
- fixes that were made for the preview are actually present in the encode:
  re-extract the gap frames and a motion strip from the MP4 and compare them
  with the reference renders.

Keep test outputs in `renders/temp/`. A failure never replaces the last
accepted delivery. The QA note reports actual checks and their result; it never
claims checks that the available runtime could not perform.
