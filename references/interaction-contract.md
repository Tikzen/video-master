# Human Interaction Contract

This is the shared confirmation and review authority. Route files own *when*
each gate happens; this file owns what is shown, what counts as confirmation,
and how edits affect the gate.

## Surface

Use the latest explicit user instruction:

| Instruction | Surface |
|---|---|
| "Confirm in chat", "don't open a page", or equivalent | Chat for every remaining gate |
| User delegates creative choices | Agent decides, records rationale; never fabricate a user receipt |
| User asks for a confirmation/preview page | Start/verify that page, open it and report its actual URL |
| No instruction | Start/verify `/create`, publish the current proposal and open the separate choice round |

Read `agent-workbench.md` and use `scripts/start_workbench.py` before the first
default-mode choice. A server that has not been started is not an unavailable
UI. Without a host browser opener, use the launcher's standard OS opener or
give the verified `page_url`; do not silently replace the page with questions.
For a remote execution host, explain the user's browser needs port forwarding;
never expose the service publicly as a workaround.

Chat fallback is allowed when the user explicitly requests it, or a real
startup/access failure remains after a bounded diagnosis. State the failing
dependency/command or access limitation first, recheck existing receipts, then
offer the same candidates together. Do not start a one-question-at-a-time
interview. A browser dispatch failure by itself leaves a working URL and is
not a WebUI startup failure. Wait timeout means waiting, not unavailable or
approved; retain the page and its round for a later reply.

Both surfaces follow the same decision contract. The page is the default
choice surface, not approval: its launch or a saved draft never confirms anything.
Use the same WebUI for all requested user interactions: direction, treatments,
image/voice configuration, cloning, optional script/spec/art/music review,
external-service permission, preview feedback and delivery. Use checkpoints
from `agent-workbench.md` for additional gates instead of inventing a chat-only
interaction. Do not add unnecessary gates merely because the UI supports them.

## Stage 1: Creative Brief Confirmation

Use chat context to prepare three relevant candidates per decision, with one
recommended default and a Custom option. Label each value `[fact]`,
`[decision]`, `[suggested]`, or `[derived]`. Resolve when needed:

- audience, purpose, audience effect, core idea/verified product truth;
- video genre and delivery platform/use;
- language, target duration, aspect ratio;
- provided audio/voice/source content and important missing assets;
- new identity vs the exact reusable kit/project path;
- exclusions, rights/consent issues, and material technical constraints.

In chat, end with a single request to accept or correct the recommendation.
Treat "looks good", "go ahead", and equivalent as confirmation. No reply is not
confirmation. On a page, fields are initialized from the recommendation;
submission is user-owned and written as a receipt. Read submitted values once
and carry them through Stage 2.

Use separate agent-paced rounds, not a fixed multi-step questionnaire.
Publish the proposal before opening `/create?round=stage1` for direction, topic, audience, intended effect and
style only. Generate contextual `choices` arrays (three strings or
`{value,label,description}` objects) for each displayed field; never ask the
user to write the brief. A fourth Custom choice reveals a text input only
when selected. Genre has three proposed renderer families plus custom
direction; the full library retains MV, studio, product and report.

Use details already supplied in chat; do not ask users to re-enter them.
After this submission, read the scoped receipt and think through the next
round before publishing/opening its separate URL. Do not automatically show
format, image or voice questions merely because the UI supports them.
Deferred fields are not approved defaults and must not enter the lock as
user decisions. Resolve them in chat, a later contextual round, or explicit
delegation. Explicit one-sentence mode can delegate audience/style too.

For custom direction/style, choose the nearest existing renderer family and
adapt its assets, composition, motion and scene structure. Record the exact
custom request in the spec; do not silently reinterpret it as a stock template.
Preserve session drafts without restoring consent. Only actual submission
creates a receipt. Paid tools and cloning remain separately authorized.

## Stage 2: Integrated Treatment + Production Confirmation

Only after Stage 1 confirmation, present exactly three coherent creative
treatments. Each is a complete candidate, not one palette variation:

1. **Concept**: central visual metaphor, emotional arc, audience takeaway.
2. **Image system**: composition, typography, color/light/material, scene
   vocabulary and the scene that proves the concept.
3. **Motion system**: camera behavior, transitions, tempo/easing, signature
   effects, audio/beat response and how intensity escalates.
4. **Structure**: opening, build, peak, resolution, ending; scene-level
   progression and rhythm.
5. **Execution**: available/proposed assets, code-rendering approach, risk,
   target format and prerequisites.

Select one and recommend it with a brief reason. Confirm production mechanics
in the same gate: duration, aspect ratio/resolution/frame rate, soundtrack and
voice path, captions, export formats, cover/chapters, continuous vs resumable
execution, and whether final preview approval is expected. Show recommended
values, not just raw IDs. Do not ask users to select technical internals that
can be safely resolved from the project.

Open `/create?round=stage2` only after the agent has prepared the integrated
treatments. Include only mechanics needed to decide these treatments; offer
three meaningful candidates plus Custom for each. Other material decisions
use separate contextual review rounds. Do not make the user fill all remaining
production settings before the agent can think or proceed.

Wait for an explicit selection/acceptance before authoring the confirmed Video
Spec or final Lock. If the user changes Stage 1 facts, update the Stage 1
recommendation and re-confirm only the changed contract; then regenerate
affected Stage 2 options.

## Final Spec Review

Default is off: after Stage 2, create and audit the complete `video_spec.md`
and `video_lock.md`, then continue. If the user opts into Refine Video Spec,
show the actual spec and wait before authoring/refreshing the lock. Accept
arbitrary user-led revisions; do not replace a prose review with fixed
questionnaires, numerical scores, or a regenerated second spec.

## Preview Review

Preview review happens after the whole edit is assembled and before the final
accepted export. Ask for actionable feedback in ordinary language. Support
precise chat edits and, when implemented, timeline scrub/scene selection,
staged direct changes, and annotations. Apply changes to the owning artifact
and refresh the preview. Do not interpret "preview server started" or
"annotations saved" as approval.

## Evidence and State

Persist confirmation receipts under the project only when useful/available:
`confirmations/stage1.json` and `confirmations/stage2.json`, each with schema,
status, confirmed values, timestamp, and source chat/surface. Never write a
receipt before acceptance or alter an earlier receipt to imply a later choice.
Derived recommendations are not receipts. An explicit chat choice remains
valid evidence, but the Agent must not pick the chat surface merely because
it has not attempted the bundled WebUI startup.
