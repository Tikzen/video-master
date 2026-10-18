---
description: Select one Video Master artifact lifecycle and its active profile.
---

# Routing Rules

Select exactly one top-level lifecycle. The selected route owns its inputs,
mutation model, gates, and output. Supporting profiles and stages refine it.

| Route | Request | Required input | Mutation | Output |
|---|---|---|---|---|
| Create Video | Make a new video, from topic, brief, script, source bundle, music, or visual references | A usable brief/material set; research may fill factual gaps | New isolated episode workspace | Editable code project, encoded video, requested delivery companions |
| Create Video Kit | Distill repeatable identity, motion rules, scene grammar, or show package | Reference bundle or explicit brief; a bare name is insufficient | New separate reusable kit workspace | Portable kit package; no episode unless separately requested |
| Edit Video Project | Change an existing source project while preserving its identity and pipeline | Editable project source and existing media | Edit only confirmed parts; preserve unselected tracks/scenes | New versioned render plus changed source |

## Deterministic Boundaries

- Existing code project plus requested edits → Edit Video Project.
- Existing code project plus a new episode using its system → Create Video, with
  that exact project/kit root as an input; do not route to Edit.
- Reference files plus explicit reusable-system request → Create Video Kit.
- An MP4 with no source project plus a new treatment → Create Video, using the
  MP4 only as reference if it is available and permitted.
- An MP4 with no source project plus "change this but preserve the edit" →
  explain that the native edit data is missing; ask for the editable project or
  confirmation to rebuild. Never pretend the MP4 is a native project.
- Ambiguous "keep this style" with an existing source project: ask one
  discriminator only if it is unclear whether to make a new episode in that
  system or revise the existing episode.
- Explicit one-sentence completion / no-more-questions / skip-confirmation
  intent activates the route's Quick profile. A short prompt, urgency,
  duration or scene count alone never does.

## Kit Kinds

Create Video Kit has one entry and selects one mutually exclusive child:

| Kind | Reusable payload | Excludes |
|---|---|---|
| Brand | Logo, palette, typography, product/host identity and legal rules | Scene roster and motion method |
| Motion Style | Timing, easing, camera, transitions, material/light, texture, audio-response method | Brand truth and episode-specific storyboard |
| Scene System | Reusable scene compositions, scene interfaces, safe areas, layer and transition contracts | Brand identity unless explicitly integrated |
| Show Package | Integrated recurring show, host/character roles, studio, lower thirds, scene system and motion identity | Episode-specific facts/script/audio |

A comprehensive reference does not force Show Package. Classify only what is
stable and worth reusing. Two kinds may coexist in a workspace only when their
ownership does not conflict; a Show Package owns the integrated system.
