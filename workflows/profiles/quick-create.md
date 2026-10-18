---
description: Create a code-rendered video in one uninterrupted run when the user explicitly requests speed or skipped confirmation.
---

# Quick Create Profile

This is a profile of Create Video, not another artifact route. Use only for
explicit "one-sentence completion", "skip confirmation", or "go straight to render"
intent. A one-sentence prompt or short runtime alone does not select this mode.
It removes confirmation stops and durable creative review, not the source
audit, deterministic renderer, implementation, or final QA.

## Contract

- Apply every explicit user fact, choice, restriction, and permission boundary.
- Resolve unspecified creative decisions directly; do not ask the user to
  choose from treatments. Retain only the concise brief/scene/timeline artifacts
  necessary to render and reproduce the output.
- Run bounded research for missing factual claims; treat supplied-only work as
  a closed corpus.
- Reuse a viable code project/kit or initialize from the bundled starter.
- Implement all animated frames in code; no prompt-generated video clips.
- Do not make paid calls, clone voices, publish, or overwrite without the
  required explicit authorization, even in Quick.
- Experimental aesthetic/intent self-review stays off unless separately
  requested. Specific opt-in activates
  [quality-self-review.md](../../references/quality-self-review.md), with its
  additional runtime, real-media evidence and at most two repairs. Extract
  expectations from the concise user brief; do not fabricate an approved
  treatment or interpret general delegation as enhancement consent.
- Render a short representative section, then a complete temporary export;
  inspect and validate it. If preview was explicitly skipped, keep QA and
  disclose that no human acceptance pass occurred.
- On blockers, finish safe upstream work and report exact missing dependency,
  credential, asset, or decision. Never downgrade the confirmed format/voice/
  renderer silently.

## Sequence

```text
Inspect → prepare sources → resolve treatment in context → author compact
storyboard/timeline → implement or reuse renderer → render preview → QA →
encode temporary delivery → validate encoded file → report
```

Do not create Stage 1/Stage 2 receipts, a full `video_lock.md`, or trigger
`refine-video-spec` unless the user separately asks for those durable artifacts.
The profile may create `video_spec.md` when needed to persist an output the user
specifically requested.

For MV execution, read [automatic-mv.md](../stages/automatic-mv.md) and use its
executable path. Paid-provider, rights, and voice-consent boundaries remain.
