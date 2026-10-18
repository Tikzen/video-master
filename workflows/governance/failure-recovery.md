---
description: Stop/continue policy, failure ownership, and resume pointers for Video Master routes.
---

# Failure Recovery

## Global Rules

- A missing required artifact or failed required check blocks the next gate.
- A failed convenience UI falls back to chat/preview evidence only when the
  route permits it; it never fabricates a user confirmation.
- Repair the shallowest owning source, then rerun only affected downstream
  steps. Do not restart planning unless its source decision changed.
- Never silently downgrade a confirmed fact, asset, voice/provider, output
  format, rendering mode, frame rate, resolution, or approval.
- Keep last-known-good outputs and record the next resume pointer.

## Recovery Matrix

| Failure | Blocking? | Recovery | Resume at |
|---|---:|---|---|
| Required factual source unavailable | Yes for affected claim | Mark unresolved, ask for source or remove claim with confirmation | Source/evidence |
| Stage 1/2 not confirmed | Yes | Present open items in chat; wait; do not infer from files | Current confirmation |
| Spec/lock disagreement | Yes | Repair from the retained confirmed values; validate again | Spec/lock gate |
| Requested kit root invalid/incomplete | Yes when selected as required | Stop kit use; ask for valid root or permission to proceed without it | Stage 1 |
| Required licensed asset absent | Yes for dependent scene | Ask for exact file or revise the scene dependency | Asset closure |
| Optional asset missing | No | Use the already approved native/code alternative and disclose | Scene implementation |
| Browser confirmation/preview cannot start | Usually no | Re-check state once; fall back to chat or contact sheet; report the failure | Same gate or review |
| Renderer missing or not runnable | Yes for final video | Diagnose prerequisites; repair confirmed renderer path or ask for a new decision | Renderer setup |
| Renderer code error | Yes | Fix owning scene/runtime, run targeted check, then preview again | Current scene batch |
| Timeline/cue validation fails | Yes | Fix timeline/source timing; never push cues into range by guess | Timeline gate |
| Audio provider/key missing | Yes only when user selected that provider | Keep script/stems ready; request setup or approved provider change | Audio preparation |
| Encode/codec unavailable | Yes for requested export | Report actual tool error; ask before changing codec/container | Encode |
| Export fails technical QA | Yes | Fix media/timeline/encoder source; re-encode versioned temp output and recheck | QA/encode |
| User requests overwrite/publish | Requires explicit authorization | Preserve last good output; obtain authorization | Delivery |

## Resume Map

| Last valid state | Resume |
|---|---|
| Sources prepared; no project | Initialize, then Stage 1 |
| Stage 1 confirmed; Stage 2 missing | Derive Stage 2 from Stage 1 and current inputs |
| Stage 2 confirmed; spec absent | Author and audit Video Spec, then Lock |
| Spec review pending | Continue user-led review; lock remains absent/stale |
| Spec approved; lock missing | Author/validate lock |
| Story/asset/timeline validated | Resume at the first incomplete dependency |
| Code renders preview; no final encode | Reuse scene code and continue from render/QA |
| Final temp export failed QA | Repair owner, rerun targeted checks and encode |
| Final delivery accepted; new request arrives | Create a new revision/version from the accepted source project |

Planning files prove decisions only when their confirmation state is explicit.
An orphan lock, server launch, saved browser draft, or silence never proves
approval.
