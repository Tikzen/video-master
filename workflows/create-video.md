---
description: Full Create Video authority from source intake through confirmed treatment, code rendering, QA, and delivery.
---

# Create Video

Default end-to-end route for a new code-rendered video. Its output is a
playable encoded video plus a reproducible source project, not merely
production notes.

For music videos also read [stages/automatic-mv.md](stages/automatic-mv.md).
In default mode, ask about missing visual/music style. Do not ask the user to
author scripts, locate images, or manually create a timeline. Once style is
resolved, the agent carries out production. Only explicit One-Sentence mode
skips creative confirmation; a short prompt alone does not.
Default "ask" means publishing candidates in the WebUI, not a chat interview.
Before any interactive choice, read
[interaction-contract.md](../references/interaction-contract.md) and
[agent-workbench.md](../references/agent-workbench.md); start, publish and open
the page with `scripts/start_workbench.py`.

For studio/dual-host work read `stages/studio-explainer.md`; for product
walkthroughs or animated reports read `stages/presentation-video.md`.
Before generated raster art read `stages/image-tools.md`; persist the user's
tool selection and never infer paid-provider permission from style delegation.
Before choosing, composing or mixing backing music, read
[stages/music-tools.md](stages/music-tools.md). Use its separate choice round
only when the music decision is unresolved; preserve narration/music/SFX as
independent tracks through the actual encoded delivery.

For specifically enabled experimental aesthetic/intent self-review, read
[quality-self-review.md](../references/quality-self-review.md). It defaults off,
adds runtime and permits at most two optional repair rounds. Offer its bounded
WebUI choice when relevant, never infer opt-in from one-sentence delegation
or make it another required early form.

**Pipeline**:

```text
Intake → Source/evidence preparation → Project initialization →
Stage 1 brief confirmation → Stage 2 treatment + production confirmation →
Video Spec + Lock → [Spec review] → Script/beat sheet/storyboard →
Asset closure → Renderer implementation → Preview/review → Quality gates →
Encode/mix/package → Delivery
```

## Step 1: Intake and source preparation

🚧 **Gate**: identify the requested outcome and read every supplied brief,
script, source document, URL, soundtrack, and visual asset that can affect it.

1. Inspect workspace instructions and determine whether a working video project
   or reusable kit already exists. Do not overwrite it; a new episode in a show
   uses its kit as input.
2. Make a source inventory. Convert documents when useful; read direct text
   directly. For a topic-only factual video, research the specific claims the
   story needs. Do not browse to decorate a closed-corpus assignment.
3. Keep an evidence ledger for every factual narration, on-screen claim, quote,
   comparison, and product spec. Record locator and timecode when available.
   Mark inference, opinion, joke, and creative invention distinctly.
4. Inventory soundtrack, voice, SFX, image, logo, UI capture, footage, fonts,
   models, license/consent, and technical properties. Ask only for missing
   materials that materially change the result or block rendering.

Interim analysis may live in a temporary analysis workspace. Do not author
final scene code, make paid API calls, or publish before the relevant approval.

**Checkpoint**: source inventory and facts are ready; unsupported claims are
flagged rather than filled in.

## Step 2: Initialize the episode project

Choose a new empty project directory. Preserve any existing files. Initialize
using the bundled starter when the workspace has no viable renderer:

```bash
python "${SKILL_DIR}/scripts/init_video_project.py" "<absolute-project-path>"
```

The next step's `start_workbench.py` also performs this initialization for a
new/empty project, so a separate initialization command is optional.
When an existing code project is the intended base, skip initialization and
adopt its conventions. Copy only selected user-approved assets into the
episode's asset pool; retain provenance and never mutate references in place.
Create the source-of-truth artifacts described in
[`production-contract.md`](../references/production-contract.md):
`video_brief.md`, `evidence.json` when factual, `video_spec.md`,
`video_lock.md`, `script.md` or `beat_sheet.md`, `storyboard.json`,
`timeline.json`, and `video.json`.

## Step 3: Stage 1 — confirm the communication contract

🚧 **BLOCKING user gate** unless the user explicitly delegates decisions.
Read the chat first. Prepare three contextual candidates plus Custom for each
unresolved creative choice, not empty fields or a fixed stock questionnaire.
Label established facts, user decisions, and proposed values. The first page
confirms direction, topic, audience, intended effect and style only when these
still need a decision. Other brief concerns are resolved when needed:

- audience and intended effect;
- core message/product truth or music/visual premise;
- delivery context/platform and aspect ratio;
- target duration and language;
- supplied vs missing narrative, soundtrack, voice, and required assets;
- new visual identity vs exact reusable kit/workspace root;
- important exclusions and rights constraints.

Write the contextual proposal, then run:

```bash
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --proposal "<absolute-stage1.json>"
```

Post its verified `page_url`, open it with the host's opener if OS dispatch was
suppressed, and wait using `agent_control.py ... wait --stage stage1`. Do not
ask each item in chat instead. Diagnose a genuine failure before using the
interaction contract's fallback; an unopened but reachable page still works.

If the user selects a kit, record its exact root but do not read its internals
until Stage 1 is confirmed. A bare style name is a creative reference, never a
filesystem path. Wait for explicit acceptance or correction before Stage 2.
Silence does not pass the gate.

Use agent-paced rounds per the interaction contract. Read the submitted
direction receipt, think through the next action, and only then publish and
open the next page. The receipt's deferred fields are not silently approved.
Do not require production settings before the creative exploration needs them.
If a direction/choice is already explicit in chat, retain it; do not ask the
user to restate it in a form.

## Step 4: Stage 2 — confirm the integrated treatment and production

After Stage 1, read only the confirmed kit materials. Produce exactly three
complete, meaningfully different treatments that all satisfy the confirmed
brief. Read [craft/README.md](../references/craft/README.md) (and the genre guide) for the
Agent's internal visual-event and rhythm design. A treatment is not a loose
moodboard. Each states:

- central visual idea and what the audience should feel/understand;
- palette, typography, material/texture, contrast and composition;
- camera grammar, motion/easing, transition logic, and signature effect;
- how the audio/beat/voice controls timing;
- beginning, escalation, peak, resolution, and closing image;
- proposed scene roster, factual/asset dependencies, renderer path, output
  resolution/frame rate, render cost/risk, and estimated runtime only when
  measurable.

Select and recommend the strongest fit with a short reason; the user can choose
another candidate or revise it. The selected treatment must be a coherent
system: scene-specific effects cannot contradict global motion, typography,
product/host identity, or legibility rules.

Resolve necessary production mechanics alongside or after the treatment:
continuous vs resumable
execution, duration, resolution/frame rate if not fixed, audio/voice path,
caption policy, export formats, and optional cover/chapter delivery. Paid
services, voice cloning, publishing, and destructive overwrites are separate
permission gates, not implied by treatment approval.

Only put mechanics on a choice page when they materially affect this round.
Other unresolved material choices can have a later bounded round. The agent
owns implementation details and may redesign any starter scene or UI detail
to fit the brief. The template is not an artistic or interaction constraint.

**BLOCKING gate**: present the integrated recommendation and wait. For a user
who explicitly delegates creative confirmation, choose one treatment, record
why, and report that this gate was delegated.
For the default WebUI branch, publish/open the separately prepared Stage 2
using the same launcher with `--proposal "<absolute-stage2.json>"`, then wait
for its receipt. A successful Stage 1 wait is intermediate: prepare the next
round in the same active run, rather than ending after the first submission.

## Step 5: Author the Video Spec and Lock

Only after Stage 2 is confirmed:

1. Write the complete `video_spec.md` once: brief, evidence-backed story,
   approved treatment, scene roster, visual system, audio plan, delivery
   contract, dependencies, exclusions, and acceptance criteria.
2. Audit every confirmed value and every required scene/claim against the
   retained confirmation. Repair any omission before the lock.
3. Write `video_lock.md` from the approved spec. Lock only cross-scene
   invariants: dimensions, frame rate, color roles, type roles, product/host
   identity, camera/motion vocabulary, recurring scene/layer contracts,
   captions/safe areas, audio policy, filenames/renderer interface. Do not put
   scene-specific timing or garnish in the lock.
   Do not lock example layouts, preset names or an incidental shot count.
   Capture the approved visual outcome and truly stable rules, leaving
   implementation and within-scene choreography open to better solutions.
4. Run `validate_video_project.py`. A valid schema does not prove that the
   approved treatment survived; manually compare the spec and lock.

If the user opted into Spec Review, read
[`stages/refine-video-spec.md`](stages/refine-video-spec.md) now. Otherwise do
not add an extra approval stop: Stage 2 already confirmed the treatment.

## Step 6: Story, soundtrack, and timeline

Write the source-aligned script/lyrics or non-verbal beat sheet. Match every
factual spoken/on-screen claim to evidence. For each planned scene, define its
purpose, subject, camera/scale, visual event, transition, duration and asset
dependencies. Make the event and observable result clear; for returning motifs,
note what changes or why a held state is deliberate. These are Agent notes,
not additional user fields. Scenes should form the approved narrative and
motion rhythm rather than repeat the same visual trick.

Build `timeline.json` from actual soundtrack/captions/recording where supplied.
Beat events may be derived from authorized audio analysis; do not claim
word-level sync without time-coded captions or speech alignment. Preserve
dialogue, music, SFX, and source audio as separate stems until mixing.
Validate all cue intervals, required assets, caption bounds, and total duration.

Fact-led, product, branded, or literal-lyric content with unresolved claims or
rights blockers stops before scene authoring. For a review-sensitive project,
present `script.md` + storyboard for optional approval using the user's chosen
review surface; see the interaction contract. Do not create a second prose
script in chat that drifts from the file.

## Step 7: Close assets and implement scenes

Acquire, generate, or transform only the assets approved by the brief and
rights inventory. Confirm before external paid generation. Keep image/video
generation out of the frame-rendering path. For product identity, use authorized
photos, models, UI captures, or accurately sourced specifications; do not
invent physical controls, branding, benchmarks, or product behavior.

Before scene code, make sure the project holds the craft artifacts from
[`references/craft/README.md`](../references/craft/README.md): the concept sentence, the
design system (`look.py` or the lock), the event map (beats or measured speech), and a
storyboard with a *handoff out* column. Build ONE hero chapter to final quality and
review it at full size before the rest. Keep a `WORKLOG.md` with decisions, review
findings and fixes. These are agent work products, not extra user gates.

Load [`references/rendering.md`](../references/rendering.md). Follow its
existing-project branch or bundled-starter branch. Implement all scenes as
code, with a shared time/frame interface and reusable primitives. Build and
play the complete scene sequence in preview mode before final-resolution
render. Inspect a representative difficult shot first; the motion authority's
contact-sheet helper and range export support this iteration.
Run structural validation after each coherent implementation batch,
not after every tiny edit. Before any complete encode, run the render-light
preflight in [`quality-gates.md`](../references/quality-gates.md): project
validation, a same-renderer contact sheet with full-size samples, and only the
short native-fps range previews needed to judge motion. Keep essential copy in
the safe area, overscan moving-camera backgrounds, and design a readable
settled ending before authoring keyframes.

If self-review is enabled, extract expectations from retained user decisions
and the approved plan, prepare actual frame/clip/audio evidence, and run its
bounded review/repair/comparison before presenting the acceptance preview.
The Agent owns this work; do not add a user-authored rubric or replace actual
inspection with a generated score.

**Checkpoint**: every storyboard scene resolves to code and real inputs; no
required asset is `pending`/missing; the preview plays end to end.

## Step 8: Preview and human review

Open a real browser/timeline preview when the project provides one; otherwise
use the renderer's local preview and a contact sheet of representative frames.
Report its actual URL/path. Never claim the user has approved because a server
started.

The user may scrub/play, inspect scene changes and audio, directly adjust safe
numeric/text controls, or annotate a creative change. Direct edits remain
staged until Apply; annotations return to chat for judgment. Apply annotations
to the owning source (spec, timeline, asset, scene code, audio mix), then
refresh the preview. A precise chat edit bypasses the annotation UI. See
[`stages/live-review.md`](stages/live-review.md).

The default full route waits for a user review of the assembled project preview
before the final encode, unless the user explicitly requested unattended
delivery or delegated acceptance. Prefer the live timeline/WebUI preview backed
by the actual renderer; a full-length MP4 is not needed just to solicit review.
An earlier complete test encode is exceptional, not the iteration loop. Never
overwrite the last approved file.

## Step 9: Quality gate, mix, encode

Run the deterministic checker and inspect representative frames/audio using
[`references/quality-gates.md`](../references/quality-gates.md). Repair all
blocking faults at their owning layer in one consolidated pass, then rerun
only the affected checks. No complete encode is allowed with a failed
preflight, missing required media, unresolved product claim, or unreviewed
blocking visual issue.

Once preflight and the applicable review gate pass, make one complete render to
a new temporary/versioned output. Mix approved audio; encode to the confirmed
codec/container. Re-encode only when encoded QA finds a blocking failure or an
approved change actually affects output. Validate the actual encoded file's duration,
dimensions, frame rate, streams, playback, sync, first/middle/last frames, and
chapter/caption alignment. Promote it to final delivery only after it passes.
If optional self-review ran, keep its coverage, unknowns and accepted repair
result in the QA receipt; an advisory score is not proof of complete delivery.

## Step 10: Package and resume

Deliver the exact MP4 path, editable source project, and requested cover,
captions, chapters, and QA receipt. State actual output specs, unresolved
limitations, and whether human preview was accepted. For interruption, resume
from the last valid gate and its owning artifact per
[`governance/failure-recovery.md`](governance/failure-recovery.md); never infer
approval or restart completed work unnecessarily.
