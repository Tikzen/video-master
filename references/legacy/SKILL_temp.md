---
name: video-master
description: >
  Create and revise complete code-rendered videos, including music videos,
  product showcases, animated reports, explainers, and dual-host studio shows. Use to turn a brief,
  topic, or source bundle into an approved production plan, deterministic scene
  code, rendered video, and checked delivery. Not for prompt-generated video
  clips as the primary visual output.
---

# Video Master

Video Master is a routed production workflow, not a prompt that ends at a
script or storyboard. Its job is to take one video artifact from request to
reviewable plan, executable code, encoded media, and delivery.

## Mandatory Load Order

1. Read this file and retain its absolute parent directory as `SKILL_DIR`.
2. Read [workflows/routing.md](workflows/routing.md) and select exactly one
   top-level route.
3. Read only that route's authority. Read its named references and triggered
   stages when their conditions are met.
4. Before the first interactive choice, read
   [references/interaction-contract.md](references/interaction-contract.md) and
   [references/agent-workbench.md](references/agent-workbench.md). Default means
   starting and opening the WebUI, not asking a sequence of chat questions.
5. Keep generated project artifacts in the user's requested workspace. Never
   use the skill's `assets/starter-project` as the episode output directory.
6. On a new host or missing tool, read
   [references/portable-runtime.md](references/portable-runtime.md) and run its
   capability check. No Codex-specific API or assumed native tool is required.

`routing.md` wins when another file suggests a different route. A profile
refines a route and never competes with it.

## Routes

| User outcome | Authority |
|---|---|
| Create a new episode/video from a brief, topic, sources, audio, or assets | [workflows/create-video.md](workflows/create-video.md) |
| Distill a reusable brand, motion language, scene system, or show package | [workflows/create-video-kit.md](workflows/create-video-kit.md) |
| Revise an existing editable code-based video project while preserving its system | [workflows/edit-video-project.md](workflows/edit-video-project.md) |

An MP4 without its source project can be used as visual/content reference, but
is not an editable project. Do not claim to preserve its native scene graph.

## Production Invariants

- The renderer authors every animated frame from code. Do not use text-to-video
  or image-to-video as a replacement for scenes. Still images, logos, UI
  captures, 3D models, and licensed footage may be inputs composed and animated
  by code.
- Use the full interactive route by default. Use
  [profiles/quick-create.md](workflows/profiles/quick-create.md) only when the
  user explicitly selects one-sentence completion, direct execution, or
  skipping approvals. A short prompt alone is not this selection.
  Quick removes confirmation and durable planning, not fact checking, rendering,
  or delivery QA.
- Confirm creative intent before committing to a direction; confirm the
  integrated treatment and production contract before locking the plan.
  Silence, supplied files, and model confidence are not confirmation.
  Explicit delegation lets the agent make those decisions and disclose them.
- Separate sourced facts from user decisions, creative proposals, and generated
  expression. Product claims, lyrics, likenesses, music, and source footage
  require appropriate evidence, permission, and attribution.
- A locked plan is authoritative for execution. Fix defects at the artifact
  that owns them; do not silently change an approved story, product claim,
  visual system, duration, or output format to make rendering pass.
- Rendering must be deterministic by timestamp/frame index and reproducible
  from project files. A preview is not an export; verify the encoded delivery.
- Treat framing as an authored constraint: keep essential text and evidence
  inside a 5% inset safe area while readable, including camera/layer transforms
  and spring overshoot. Intentional exits may leave frame only after the
  information is no longer needed. Any moving, zooming, or rotating scene must
  overscan its background enough to cover every viewport edge at its most
  extreme transform. The final active frame must be an intentional, readable
  ending, not a transition or a title leaving the canvas; hosts/characters
  must not cover essential copy, subtitles, or evidence.
- Keep iteration render-light: validate and inspect same-renderer contact-sheet
  and full-size PNG samples first; use only short native-fps range previews
  when motion itself needs inspection. Batch fixes and rerun only affected
  checks. Do not encode the whole video on every edit; make one complete export
  after preview/acceptance gates pass, and repeat it only after a blocking
  encoded-QA failure or an approved change that affects the output.
- Aesthetic/intent self-review is experimental and optional, default off.
  Explain extra runtime and require specific opt-in, even in one-sentence mode.
  When enabled, follow [references/quality-self-review.md](references/quality-self-review.md):
  inspect real media, preserve user expectations, and cap repairs at two rounds.
  Advisory scores never replace encoded QA or required user acceptance.
- Explain before paid generation/API use, voice cloning, publishing, or
  overwriting. Keep credentials only in a private, ignored local `.env` or
  process environment, never in project JSON, logs, delivery, or packages.

## Workflow Authority Map

| Concern | Authority |
|---|---|
| Route selection | [workflows/routing.md](workflows/routing.md) |
| Stage order, gates, confirmations, and deliverables | Selected route |
| Two-stage user interaction and review surfaces | [references/interaction-contract.md](references/interaction-contract.md) |
| Video brief/spec/lock/timeline shape | [references/production-contract.md](references/production-contract.md) |
| Code renderer and actual MP4 creation | [references/rendering.md](references/rendering.md) |
| Visual events, motion layers, motif variation and targeted review | [references/motion-direction.md](references/motion-direction.md) |
| Lighting, colour, depth, materials, kinetic type and genre-aware visual finish | [references/visual-design-playbook.md](references/visual-design-playbook.md) |
| Preview, framing preflight, render-light visual/audio QC, delivery acceptance | [references/quality-gates.md](references/quality-gates.md) |
| Experimental opt-in aesthetic and user-intent review with bounded repair | [references/quality-self-review.md](references/quality-self-review.md) |
| Failure and resume behavior | [workflows/governance/failure-recovery.md](workflows/governance/failure-recovery.md) |
| Automatic MV execution after style confirmation, or explicit one-sentence mode | [workflows/stages/automatic-mv.md](workflows/stages/automatic-mv.md) |
| Studio/dual-host scripts, expression sprites, camera-to-screen production | [workflows/stages/studio-explainer.md](workflows/stages/studio-explainer.md) |
| Animated product walkthroughs, reports and slide-like video | [workflows/stages/presentation-video.md](workflows/stages/presentation-video.md) |
| Built-in vs external image tools, standard env setup, private credentials | [workflows/stages/image-tools.md](workflows/stages/image-tools.md) |
| MiniMax/local narration, per-host voices and measured timing | [workflows/stages/voice-tools.md](workflows/stages/voice-tools.md) |
| Optional local music, supplied tracks, audition and narration/music mixing | [workflows/stages/music-tools.md](workflows/stages/music-tools.md) |
| Interactive planning page and Agent control API | [references/agent-workbench.md](references/agent-workbench.md) |
| Other agents, OS setup, local speech commands and capability failures | [references/portable-runtime.md](references/portable-runtime.md) |

Interactive planning uses `/create` by default. Before asking for choices,
prepare the contextual proposal and run `scripts/start_workbench.py --project
"<absolute-project>" --proposal "<absolute-proposal.json>"`. This portable
launcher initializes an empty project if needed, installs missing npm dependencies,
verifies the service, publishes the proposal and requests browser opening.
Read `references/agent-workbench.md` for exact launch/round/wait behavior.
Always give the verified `page_url`; no browser-opening tool is not a reason
to skip the WebUI. Chat-only confirmation requires the user's explicit request
or an explained, actual startup/access failure, not an unattempted launch.
Wait for actual receipts, then continue production in the same run.
The agent owns scripting,
assets, timeline, mix and export; the user's editor is for optional refinement.
Every editor operation has a loopback API counterpart. Do not ask users to do
work the API can do, except user-owned choices, credentials, consent and review.

## Creative Freedom

The starter is runnable infrastructure, not a fixed design or questionnaire.
Agents may replace or extend scene code, layouts, compositions, transitions,
camera behavior, motion primitives and the choice-page details when the
project needs it. Reuse only what fits the approved intent; do not force every
video into the demo's appearance or every user into its default fields.
The Agent is the creative lead: reason from the audience, content, reference
and approved outcome, then choose the strongest feasible implementation.
Adapt, combine or discard the supplied grammars; invent a better visual
metaphor, staging or handoff when appropriate. Renderer families, example
rosters, effect names and genre tables are not artistic limits or checklists.
An unchanged demo is not a finished treatment merely because it renders.

Keep the distinction between requirements and suggestions explicit.
User-confirmed intent, factual/identity fidelity, readability, consent,
portable control and reproducible delivery are binding. Sample layouts,
effect recipes, camera paths and counts of shots/layers are suggestions.
Do not turn them into extra lock rules. Improve implementation within the
approved intent without reopening every user gate; reconfirm only a material
change to that intent or an explicit locked requirement.

Before opening each round, determine which decisions materially affect the
next creative/production action. Show only those unresolved user-owned choices,
with three thoughtful candidates and opt-in custom input. Carry forward chat
facts and earlier choices without asking again. Choose technical implementation
details yourself. Read the receipt, reason, then open the next round separately.
For treatments and scene authoring, read `references/motion-direction.md`:
direct visible events and meaningful returns, then verify rendered shots rather
than treating presets or advisory audit prompts as quality guarantees.
For every genre, design scene boundaries as pairwise handoffs rather than
defaulting to a whole-page slide; let subject, camera, light or a visual motif
connect the shots, and preserve chart/UI meaning in product and factual videos.
The built-in transition roster is a convenience, not the allowed roster.
Custom SVG/Canvas/WebGL/Three.js choreography is welcome when it improves the
result. Implement it in project source, keep preview/export on the same clock,
and preserve the WebUI/Agent API; do not claim unsupported JSON labels execute.
For an energetic MV/showreel, do not equate animation with shaking one image,
sliding a whole page, or repeating one visualization. Author interacting layers,
changes of focus/scale/layout, kinetic type and purposeful transitions; match
their density to the brief. Read `references/motion-style-library.md` for varied
style grammars and `references/composition-format.md` for executable layers,
camera, keyframes and Agent-authored plans. For rich colour, lighting or
surface requests, read `references/visual-design-playbook.md`; its recipes are
optional and must remain subordinate to focal hierarchy and readability. The
preset MV generator is only a scaffold; do not deliver it as finished direction.
Preserve explicit user constraints, truthful evidence,
portable APIs, deterministic rendering, credentials and consent boundaries.
Freedom to redesign never authorizes silently changing approved intent.

Do not stop after research, treatment, script, storyboard, or code when the
selected route promises a rendered video. If a required user decision or
dependency blocks a later phase, finish safe upstream work, preserve the
resume pointer, and state the exact blocker.

For upstream attribution and the migration boundary, see
[references/ppt-master-migration.md](references/ppt-master-migration.md).

