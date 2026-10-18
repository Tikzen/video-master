---
description: Revise an existing code-rendered video project while preserving unselected scenes and production identity.
---

# Edit Video Project

Use when the user expects an existing editable video project to remain the
source of truth. This route creates a new versioned render and edits only the
approved change surface.

## 1. Inspect and map

Inspect project instructions, render entrypoint, current output, timeline,
scene roster, audio tracks, assets, and project manifest. Run the existing
validation/build before edits when practical. Identify requested scene/time
range and any dependents (captions, sound cues, chapters, recurring elements).

If user says "redesign the whole video", route to Create Video with current
project as source/kit. If the request is ambiguous between preserve and
redesign, ask one discriminator.

## 2. Plan and confirm

Present one change plan before writing: affected scenes and time intervals,
unchanged scenes/tracks, claims/assets/audio to change, dependent cues, output
version, and regression checks. Include what cannot be safely preserved. Wait
for explicit approval; in Quick only skip this when the user explicitly
delegates or requests direct changes.

Do not modify immutable/source footage, original audio, or prior delivery.
Prefer non-destructive edits, scene overrides, and versioned outputs.

Experimental aesthetic/intent self-review is off unless specifically enabled.
Read [quality-self-review.md](../references/quality-self-review.md) when opted in;
retain its runtime warning and zero-to-two repair budget. A request to improve
one scene does not authorize redesigning protected scenes or the approved style.

## 3. Edit at the owning layer

Map each requested change to one owner:

| Change | Owner |
|---|---|
| Story/claim/wording | Approved script or scene content data; evidence ledger if facts change |
| Duration/order/transition | Timeline/sequence |
| Appearance/geometry/effect | Scene code or video lock only when a global invariant changes |
| Sound/voice/music | Separate audio stem or mix config |
| Captions/chapters | Derived from final locked timeline/audio; regenerate after timing changes |

For backing-music changes, read [stages/music-tools.md](stages/music-tools.md).
Keep original recordings and unrelated music cues intact; use the managed-bed
API for additions/replacements and verify speech ducking after timing changes.

Preserve frame size/rate and global identity unless explicitly changed. A global
lock change requires checking every scene that uses it. A timeline/order change
requires rechecking all affected audio sync, captions, transitions, and chapter
markers.

## 4. Render and validate

Render affected ranges for visual iteration, then produce the complete
versioned output. For motion changes, read
[craft/README.md](../references/craft/README.md) (and the genre guide) and use its contact
sheet/range helpers; JSON repetition prompts are advisory, not acceptance.
For enabled self-review, compare actual baseline/candidate evidence against
the same retained expectations; register repairs before editing and reject
binding regressions or inconclusive preference. Keep any user-selected edit
scope as an invariant and version the accepted result.
Run the project's tests/checker and
[`quality-gates.md`](../references/quality-gates.md) on the encoded video.
Verify unselected sections still match the prior output when the tool permits
frame comparison. Never overwrite the source or last accepted delivery.

Report the changed scenes/ranges, preserved regions, output path, checks run,
and any remaining discrepancy from the confirmed plan.
