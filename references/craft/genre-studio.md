# Genre: Studio (演播室) — two-host explainers and news-style shows

Reference: `assets/examples/code-film-studio-timeline` (18 s, two hosts, screen push + PIP).
The existing program builder (`create-program.mjs`, `stages/studio-explainer.md`) still handles
TTS and timing. Use its measured voice files with motionkit's `Speech.add_wav` when the
treatment needs better staging than the builder's baseline.

Rules marked **(R)** come from a delivered studio project's retrospective (2026-10). Each one
is a mistake that has already reached a user, so treat them as binding.

## 0. Look and cast are chosen by the user, from real candidates (R)

- **The studio must be polished, not a template.** Before production, render **≥3 distinct
  studio looks** with the renderer that will make the film, and let the user pick one in the
  WebUI (`studio-look` gallery checkpoint, `assets/studio-rounds/studio-look.example.json`).
  Each candidate needs at least a wide frame and a screen-push frame at ≥960 px, with the
  hosts, caption plate and real screen content in place. A palette swap of one layout does not
  count as three candidates. Variety means different concepts: material, light, architecture
  and motif.
- **Host source is a user choice** (`host-source` checkpoint): upload 立绘 · generate with an
  image API · upload a reference and redraw it · built-in template. The page shows the
  notice that **templates are not recommended**, and the template option carries a warning.
  The template becomes final only if the user explicitly picks it there.
- When the user picks generate or redraw, show **≥3 cast designs** (`host-design` gallery: a
  neutral and a smile per host) before generating the master. The master is the identity
  authority for every later image.
- The API route is built around **expression differentials** (表情差分). Do not ask for a new
  character for each emotion. Edit the master into a set of whole images with identical
  framing (§4).

### Set design bar (what "精美" means here)

- **Concept first:** one idea for the set, derived from the topic and the hosts' colours (e.g.
  blue-white, cute, rich but tidy). Then three depth bands: back wall/architecture with soft
  light; mid props and the screen; foreground desk on its own layer.
- **Light and material:** gradients, rim or soft glow on the screen, gentle shadows under the
  desk and hosts, one warm/cool contrast. Flat single-colour rectangles read as a template.
- **Rich without clutter:** decorations sit at low contrast and low saturation behind the
  hierarchy. Nothing decorative enters the caption zone, the screen copy or the host
  silhouettes. One accent per moment.
- **Alive:** the idle set has slow loops (light drift, a screen brand loop, small particles
  ≤ 0.3 Hz), and none of them blink or compete with speech.
- **Colour fit:** the set's palette roles are derived from the hosts (their key colour becomes
  the accent or support), so the characters belong in the room.
- **Evidence:** introductions show real screenshots, the user's actual prompt text or a
  diagram, never pure text cards. Give the source.

## 1. Speech is the clock

- Script → TTS/recordings (voice-tools stage, consent and permission gates unchanged) → `sp.add_wav(speaker, text, path, t0)`. Gaps between turns: 0.25–0.45 s (faster for banter, slower for weighty points).
- Before audio exists, `sp.add_synthetic(...)` gives labelled placeholder timing (≈ 4.3 字/s, 13 letters/s). **Never deliver placeholder voice as final.**
- Every visual decision hangs off line times: shots, expressions, gestures, screen content, captions and lower thirds.

### Three clocks per line (R)

| Interval | Meaning | Owner |
|---|---|---|
| voice `t0..t1` | actual speech | mouth, speech drive, ducking |
| display `t0..next.t0` | what the viewer should still see: caption, name plate, PIP speaker | `heldLine` / `heldSpeaker` (JS), `Speech.held` (motionkit) |
| scene `t0..sceneEnd` | the shot and screen content | scene cues / camera |

Silence is not "no content". In the gap after a line, the caption, the name plate and the PIP
keep that line's state, and they switch together when the next line starts. Opening copy
belongs only to the open; end-card copy only to the formal end. Never use either as an
`else` branch. Don't stretch audio cues to hide a display bug. Compute every state from
absolute time; never from "the last frame I drew". Delivered SRTs follow the same display
rule.

## 2. Shot grammar (`StudioCamera`, `auto_shots`)

| Situation | Shot | Transition |
|---|---|---|
| Show open / close | wide | close: move back to wide after the last line |
| Line > 2.2 s | single on the speaker (lead room toward the other host) | cut 0.1–0.25 s before the line |
| Quick exchange (< 2.2 s lines) | two-shot | move or hold, not a cut per line |
| Line with evidence (media) | screen: push into the LED wall, speaker in a PIP | camera move 0.7 s, motion blur |
| Reaction worth showing | single on the listener | only when the reaction carries meaning |

Never iris or wipe between speakers in the same set; cuts and camera moves are the studio language.

## 3. Performance (`Performance`, `stickerTransform`)

- **Sprite (立绘) hosts move as one whole sticker (R).** Apply a single transform (scale,
  rotation, offset) to the whole image about its base, meaning the feet or the desk crop line.
  Never stretch part of the body, never split head and body, and never warp the face.
- **Voice-driven stretch and rebound (R).** While a host talks, the whole sticker stretches
  taller and slightly narrower with the loudness of each syllable. A spring then pulls it back
  past rest. When the voice stops, the motion eases down into idle; it neither cuts off nor
  keeps bouncing. Implementation: an envelope follower (attack ≈ 40 ms, release ≈ 140 ms) on
  the per-line normalised RMS feeds an under-damped spring (≈ 3 Hz, ζ ≈ 0.25). JS:
  `speechDrive` / `stickerTransform` in `src/studio-motion.js`; motionkit: `Speech.drive`,
  used by `SpriteHost`. A fixed-rate `sin(t·k)·volume` wobble is not speech motion.
- **Amplitude is sized for the smallest appearance.** Speech stretch up to ≈ 5 %, idle
  breath ≈ 0.9 %, sway ≈ ±1.25°. On a 135 px PIP that is ≥ 3 px of travel. Idle motion runs
  on global time, so a new line never resets the phase.
- Expressions: whole-image swaps cross-faded over 0.15–0.28 s, keyed to meaning: `smile`
  (greeting), `explain` (teaching), `thinking` (question), `excited` (reveal), `serious`
  (caveat). Differential frames `<expr>_talk` (mouth open, alternating on twos with the voice)
  and `<expr>_blink` add life without any warping. A missing differential falls back to the
  base image, and `create-program` reports it in `missing_expressions`.
- Vector hosts: mouth from the speech envelope; blink every 2.5–4.5 s; nod at line starts and
  ends; brows lift on loud syllables; gestures on the key claim, 1–2 s, not on every line.
- The listener stays alive: small tilt and drift, an occasional nod after the speaker's key word.

## 4. Hosts and the expression-differential sheet

- **SpriteHost / program-builder sprites** from authorised or generated art. All images of a
  host share the master's canvas, anchor, outfit and proportions, with a transparent
  background.
- **After the storyboard/script is written, also output 人物差分要求表 (R).** Run
  `python scripts/expression_sheet.py build --project <P>` whenever `program.json` lines and
  expressions are written or changed. It lists, per host, every expression the script uses,
  with these columns: lines, screen time, priority, base, `_talk` and `_blink` frames,
  reference image, and identity-locked prompts in Chinese and English. Show it to the user
  together with the storyboard.
- **Generate the differentials with an edit-capable image model from that sheet.** This may
  be a different provider from the one that made the master: `expression_sheet.py generate
  --backend <edit-capable> [--model …]` after the user has authorised the request count. Each
  row is a reference edit of the master; talk and blink frames are edits of their own base
  expression. Then run `check` (canvas, alpha, body silhouette IoU, base line) and `apply`,
  which writes only passing images into `program.json`. Never regenerate a pose from text
  alone and claim identity consistency.
- **VectorHost** (code-drawn flat illustration): this is the template path. The user must
  explicitly accept it as final.
- Never copy existing characters, station marks or likenesses without rights.

## 5. Evidence on the screen

- The screen is the hero when it is on camera. Hosts fade out of its way; the speaker survives as a PIP in a free corner.
- Screen graphics follow [genre-presentation.md](genre-presentation.md): one claim, reading order, fixed axes, a source note.
- Animate the screen content *after* the camera arrives (≈ 0.2–0.4 s), so the move and the reveal don't compete.
- Idle screen: a calm brand loop (`default_screen`), never a frozen still.

## 6. Broadcast graphics

- **Lower third** on each host's first line (0.15 s after the line starts; out within 3.2 s). Never during screen shots.
- **Captions:** utterance-level, in one fixed zone below faces and above the ticker, with a
  plate and a speaker-colour tab, at most 2 lines, 34 px at 1080p. Don't claim word-level
  timing without alignment data. Between consecutive lines the plate stays up and only the
  text swaps (motionkit `caption(..., until=next.t0, fade_in=False/fade_out=False)`); a
  deliberate pause longer than about 2 s may clear it.
- **PIP speaker** = the held line's speaker, never a default host.
- **LIVE bug / ticker** only if the format is news-like. The ticker scrolls at about 120 px/s.
- Keep hosts' faces, hands and the screen copy clear of captions and graphics (Gate B rule). Check dense frames.

## 7. Sound

Music sits under speech (`Score.voice` ducks it; drive ≤ 1 dB; RMS ≈ −16). No kick under talk.
Stingers only at the open, screen pushes and the close. A UI pop when evidence lands.

## 8. Review focus — turn feelings into checks (R)

| User says | Measurable check |
|---|---|
| "不要当纸片" / micro-motion missing | consecutive encoded frames differ in the host region, both in the large shot and in the PIP; ≥ 3 px travel at PIP size |
| "不要扭曲" | one transform for the whole image; no per-part warps in code; inspect zoomed frames at speech peaks |
| "动作跟着声音" | stretch peaks line up with loud syllables; motion decays within about 0.5 s of the line end; no snap at the line end (frame-to-frame delta at the end < delta during speech) |
| "背景丰富但不杂乱" | named hierarchy; nothing decorative in caption/screen/host zones; contrast of decoration < hero |
| "不要纯文字" | screenshots, prompts or diagrams with sources on the screen |
| "不要回到第一帧" | for **every** cue end → gap → next start (and last line → end card): caption, name and PIP equal the held line; no opening copy after the open |

Also check:

- Frames at every cut and screen push: is the speaker framed before speaking? Do captions avoid faces?
- Diff: cuts declared with `film.cut()`; no pops elsewhere.
- Mouth activity matches line spans (no talking during the other host's line).
- Determinism: render a sample of times in random order, then again sequentially; the frames must be identical.
- The placeholder voice is clearly labelled until the real voice is in.
- Report the scope honestly: code check, image check, playback, audio identity, actual listening.
