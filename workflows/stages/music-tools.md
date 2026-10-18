# Music And Audio Mix

Load for music choice, local composition, score arrangement, or mixing narration
with music. Treat voice, music, effects and selected footage sound as independent
tracks. Audio is part of the deliverable, not an optional untested afterthought.

## User Choice Round

Reuse an explicit chat decision or existing `music_tool.json`. Otherwise, when
music matters, open `/create?panel=music` as a separate current round, not an
extra block in the first creative-direction page. Offer simple music, supplied
authorized music, no music, plus Custom. Simple music offers electronic beat,
soft bed, light pulse and Custom. Defaults need no typing; advanced tempo and
volume are optional. Explicit one-sentence mode delegates the creative choice.

An eight-second audition only creates a local file; it does not approve or
change the timeline. Saved selection is not authorization for a paid service.
Custom stores a request for the Agent to interpret and implement. Do not pass
arbitrary natural language into the three-preset synth and claim it matched.
Agents may adapt the synth's chords, instruments, rhythms and section envelope,
or use another authorized tool, then present the actual result when appropriate.
Listen to and check the adapted output.

This baseline is deterministic instrumental synthesis: drums, bass, arpeggio,
chord pad and section dynamics. It has no sung vocals and is not a professional
song-generation model. It runs locally without service fees or cloud upload.
Do not promise a famous song, professional production, or exclusive legal rights.
Using external music services needs configuration and separate permission for
paid calls/data upload. Supplied tracks need verified reuse rights.

## Portable Tool

Python 3 and Node.js on Windows/macOS/Linux suffice; no API key, browser,
agent-native tool, npm dependency or system speech adapter is needed to compose:

```bash
python "${SKILL_DIR}/scripts/compose_music.py" \
  --project "<absolute-project>" --duration 30 --style soft --seed 19
```

Optional `--bpm` is 40–220; duration is 0.1–600 seconds.
`--node "<absolute-node-binary>"` works when Node is not on PATH.
Output is stereo PCM WAV, 32000 Hz, 16-bit. Default filename is unique.
`--output audio/music/my-score-v1.wav` chooses a project-local path and refuses
overwrite. Stdout is JSON with `src`, `absolute_path`, duration, tempo, seed,
style and provenance. This command generates an asset, not a finished video.
Use the timeline/API or builder to arrange and render it.

Project-native equivalent:

```bash
node src/compose-music.mjs --root . --duration 30 --style pulse --seed 19
```

## WebUI And Agent API

All page operations have local JSON/API counterparts:

| Operation | Contract |
|---|---|
| Inspect current selection | `GET /api/music-tool` returns `selected`, three `styles`, `local:true` |
| Save decision | `POST /api/music-tool` with selection below; persists `music_tool.json` |
| Local audition/asset | `POST /api/music-generate` `{duration:8,style:"soft",bpm:80,seed:19}` |
| Upload authorized music | `POST /api/import-audio?name=...` raw bytes; use returned `src` |
| Arrange selected music | `POST /api/music-apply` `{expected_revision:"<workspace.revision>"}` |
| Fine mix/edit | `/api/actions` with `cue.update` volume, fades, `duck_gain`, timing or track mute |

```json
{"mode":"procedural","style":"soft","bpm":80,"seed":19,"volume":0.18}
```

Modes: `none`, `procedural`, `provided` with project-relative `src`, or `custom`
with a nonempty `custom` description. `music-apply` refuses unresolved Custom,
stale revision, dirty user edits or conflicting existing unmuted music. Never
bypass these guards by overwriting timeline files.

Generation caches versioned WAV/feature metadata keyed by duration/style/BPM/
seed. Applying uses the final measured timeline duration, not the audition's
duration, and adds one `vm-music-bed` cue on track `vm-music`. Reapplying replaces
only that managed cue. `none` removes only the managed cue; other music, voice,
effects and original recordings remain intact. Reconcile other existing music
explicitly, rather than silently stacking or deleting it. Supplied recordings
shorter than the timeline require Agent arrangement first; do not blindly loop
vocals or silently change tempo.

Read the selection through `agent_control.py status`, or use its generic
`request --route /api/music-tool --method POST --file music-choice.json`.
Read workspace revision before applying through `request`.
Browser autoplay may require a user playback gesture; generation still works.

## Full Video Integration

The studio/product/report builder reads the saved selection after measuring
actual narration duration. `program.music` may explicitly override it, e.g.
`{"mode":"procedural","style":"soft","volume":0.18}`. No selection defaults to
no backing music. The MV builder reads the same saved choice; absent a choice
in explicitly delegated creation, its baseline is an original instrumental.
Explicit `--audio` / `--music-style` overrides select supplied/procedural music.
MV BPM is a supplied timing assumption, not measured beat detection.

Managed music has start/end fades and `duck_gain:0.28`: its gain is reduced
under enabled voice clips, with 80 ms attack and 250 ms release. Preview and
FFmpeg export share the same gain-envelope logic. Muted or zero-volume voice
does not trigger ducking. This is clip-based ducking, not phoneme/silence-aware
analysis. Set `duck_gain:1` to disable; adjust 0–1 through `cue.update`.
MV visuals can use stored RMS/peak features and tempo for code animation.

Agent-authored MV plans can add frame-aligned `sound_events` for independent
local `hit/whoosh/tick` effects. The same event time should trigger the visual
action and sound, with an intentional sync offset only when warranted.
See [composition-format.md](../../references/composition-format.md). Group
related landings instead of sounding every minor layer; review density,
speech clarity and exact placements in the actual mix. This does not replace
the user's music choice or activate a cloud generation service.

Before delivery, inspect decoded audio metadata, listen to the beginning,
voice/music overlaps, transitions and ending, verify intelligibility, fades,
no clipped peaks/unplanned silence and sync. Do not call a WAV asset a video
export; render and validate the actual MP4 with its intended audio stream.
