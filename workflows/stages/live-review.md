---
description: Open a code-rendered video's interactive preview and apply user annotations after the user asks.
---

# Live Review

The Create Video route exposes a synchronized, frame-accurate code preview and
a non-linear timeline before final delivery. When the project lacks an editor,
implement or copy the bundled starter's timeline UI and bind it to the
project's actual `timeline.json`; do not replace it with a screenshot/contact
sheet as the only interactive surface. A contact sheet is a QA companion.

## Open or Reopen

Start the project's preview command and report the actual URL. Never guess a
port. The editing surface must include:

- A video preview canvas with play/pause, frame stepping, current timecode,
  duration, and output dimensions.
- A horizontal ruler with a labelled second mark at every second, playhead,
  and visible scene/clip boundaries.
- Separate labelled tracks for at least video/scenes, captions/graphics, voice,
  music, and SFX when those media exist. Clips show title and exact start/end.
- Timeline zoom and horizontal scroll for long work; selection, drag-to-move,
  and trim/resize for permitted cue types.
- A selected-item inspector with native numeric/range controls for start,
  duration, scale, position, rotation, and opacity as applicable.
- Save/apply and a clear unsaved state. Saved timeline edits must update the
  same source data that the encoder consumes.

Do not show fake tracks, fake audio waveforms, or static placeholder controls.
If a scene or audio waveform is not available, mark it as absent rather than
fabricating its appearance. On narrow viewports, stack preview and inspector;
keep the dense timeline independently horizontally scrollable and touch usable.

Explain the available interactions briefly:

- Play/scrub or click a second mark to inspect that exact moment.
- Select a clip to inspect its timing and use direct controls or drag/trim for
  deterministic edits; preview them before Apply.
- Annotate changes that require visual judgment and return to chat to apply
  them.
- A precise chat edit may be applied directly without the annotation surface.

## Apply Annotations

Run only when the user says to apply saved annotations or asks for changes:

1. Read pending annotations once; if none exist, say so and stop.
2. Route each note to its owning artifact: spec/lock, storyboard, timeline,
   asset, scene code, captions, audio stem, or mix config.
3. If an annotation conflicts with a confirmed claim, global lock, license, or
   delivery requirement, surface the conflict before applying it.
4. Apply the bounded changes, rerender a preview, and run the relevant
   validator. Re-export a new version only after validation.
5. Keep the preview running unless the user asks to close it. Report applied
   changes and the new output path.
