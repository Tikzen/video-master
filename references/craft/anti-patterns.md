# Anti-patterns — what earlier outputs actually did wrong

Read this before designing. Each item comes from a real Video Master output, and each has a fix.

## Direction

| Anti-pattern | Looks like | Fix |
|---|---|---|
| **Effect collection instead of concept** | "BREAK / FORM / BECOME" over the same chrome shard with glows and rings in every scene | write the one-sentence generator first ([concept-and-system.md](concept-and-system.md)); every chapter must be a state of the same idea |
| **Slideshow syndrome** ("直接下一页") | each scene is a new page; a wipe or dissolve between unrelated layouts | handoff column; object becomes object ([handoffs.md](handoffs.md)) |
| **Quota-driven clutter** | ≥3 materials, 20–35 layers and "lighting per scene" satisfied at once, so nothing reads | design density on the energy curve; one hero per moment |
| **Same trick everywhere** | the same iris/flow transition, the same glow, the same camera push in every scene | 4+ different handoff mechanisms per film; a signature effect at most twice |
| **Spectacle over meaning (data and product)** | charts flying around, axes rescaling, invented UI | axis fixed; only the changed value moves; real or labelled UI |

## Frame

| Anti-pattern | Fix |
|---|---|
| Text over busy shapes or particles (e.g. "BREAK" under shards) | clear zone or plate; hero text gets the cleanest area; check contrast against the pixels actually behind it |
| Everything centred and the same size | hierarchy ratios 1.6–2×; deliberate asymmetry; grid alignment |
| Accent colour on every object | one accent use per moment |
| Glow on everything / neon on paper | bloom only on emissive elements and dark grounds; `luma` key on saturated grounds |
| Empty half-frames by accident | measure the composition; add a hero element that serves the concept (the outlined "2.0"), or recompose |
| System-default fonts, missing glyphs | register real fonts; `missing()` check on every string |

## Motion

| Anti-pattern | Fix |
|---|---|
| Linear slides, fades only | ease vocabulary; slot reveals; springs on physical things |
| Everything enters at once | staggers (letters 25–45 ms, items 120–220 ms) |
| Shake, pulse or periodic wobble as "energy" | build real events: something arrives, transforms, causes the next thing |
| Outgoing scene frozen during a transition | live two-scene transitions or continuous chapters |
| Fast thin elements strobing | motion-blur windows 8–12 samples |
| No hold, so the viewer can't read | ≥ 0.8 s per word, ≥ 2.5 s per sentence, ≥ 1.2 s settled end card |
| The ending is a fade to black or a title still moving | a designed last frame (or a loop to frame 0) |

## Studio / hosts (2026-10 studio retrospective)

| Anti-pattern | Looks like | Fix |
|---|---|---|
| **Template set or template host shipped as final** | starter/default studio, code-vector presenters with only the colours changed | ≥3 rendered studio looks and a host-source round in the WebUI; the template is labelled "不推荐" and needs an explicit choice ([genre-studio.md](genre-studio.md) §0) |
| **Local warp as "breathing"** | the middle of the illustration stretches; the face or torso distorts | one transform of the whole sticker about its base; expression = whole-image swap |
| **Periodic wobble pretending to be speech** | `sin(t·19)·volume`; the host jitters at a fixed rate, unrelated to the syllables; stops dead at the line end | envelope follower → spring (`speechDrive` / `Speech.drive`): stretches on loud syllables, rebounds, eases down when the voice stops |
| **Motion that exists only in code** | ±0.5° sway, 0.4 % squash; invisible at PIP size, the user says "微动作没有实装" | size motion for the smallest appearance (PIP ≈135 px: ≥3 px travel); verify on consecutive *encoded* frames, large shot and PIP |
| **"No audio" treated as "no content"** | in the 0.3–0.45 s gap between lines the caption shows the opening slogan, the name plate shows the brand, the PIP shows host A | display state holds the last line until the next line starts (`heldLine` / `Speech.held`); audio cues keep their true length |
| **Opening default used as mid-show fallback** | "回到第一帧" at 19 s, 24 s, 49 s … | a default belongs to one named place (the open / the end card); never to `else` in the middle of the programme |
| **State that depends on playback history** | a "remember last caption" variable; scrubbing or chunked render shows different frames | derive every state from absolute time and the timeline; test random-order rendering equals sequential |
| **Patching the reported timestamps** | fixing 19 s and 24 s by hand; 49 s still breaks | a repeated defect means shared logic; fix the shared rule, then traverse every cue end / gap / next start |
| **Expressions regenerated independently** | each pose generated from text, so the face, outfit or crop drifts between images | one master, then reference edits from the expression sheet (`expression_sheet.py`); `check` rejects moved bodies |

## Sound

| Anti-pattern | Fix |
|---|---|
| Music bed with no relation to the picture | score from the event map; hits on events |
| Drop not louder than the build | `section()` the build down, `breath()` before the drop; verify ≥ 6 dB contrast |
| Sub-heavy mix that disappears on phones | high-pass the bass, mid knock on the kick, presence within ~12 dB |
| Kick drums under narration | talk formats: pads/keys only, voice ducking |

## Process

| Anti-pattern | Fix |
|---|---|
| Full encode after every tweak | stills, sheets, diff; one final encode |
| "Looks good" without looking | render, view at full size, measure (diff, audio-qa), record in WORKLOG |
| Fixing the same issue scene by scene | fix it in `look.py`, the lock or the engine |
| Claiming sync or audio quality you didn't verify | report what you measured and what you couldn't check |
| Accepting "the code has an animation" as done | acceptance is what the viewer sees in the encoded file; turn each user complaint into a measurable check (table in [genre-studio.md](genre-studio.md) §8) |
| Re-asking a direction the user already gave | feedback becomes a standing constraint in WORKLOG/spec; don't reopen it or ask for the same confirmation again |
| Unlabelled demo data, mock UI or placeholder voice | label it on screen and in the delivery notes |
