# Portable Agent Runtime

This skill requires an agent that can read files, run commands and author
code. It does not require Codex, a particular model, MCP, a browser-control
plugin, or a desktop app. `agents/openai.yaml` is optional host metadata;
`SKILL.md`, references, scripts and project artifacts are the actual contract.
Do not assume the next agent has the current agent's native tools.

## Bootstrap

For Multiplane, use [renderers/multiplane.md](renderers/multiplane.md) and its
project-local initializer/doctor instead of assuming JS starter runtime paths.
Node >=24, matching Chromium and a real FFmpeg encoder probe are required.
Keep browser, npm, temporary and job directories on the user's permitted drive.

Set `SKILL_DIR` to the absolute folder containing this SKILL.md. Use the
host's skill discovery mechanism if supported; otherwise load SKILL.md as a
local instruction file and follow its referenced route. A plain chat-only
model without filesystem/command access cannot execute this workflow.

Required runtime: Python 3.10+, Node.js 22+ (24 recommended), npm.
Read `agent-workbench.md`, author the contextual first proposal, then use an
empty output project (or reuse a compatible project), not the skill's starter:

```bash
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --proposal "<absolute-stage1.json>"
python "${SKILL_DIR}/scripts/doctor.py" --project "<absolute-project>"
```

The launcher returns machine-readable `url` and exact `page_url`, and requests
OS browser opening by default. It needs no MCP, native browser skill or Codex
app RPC. It keeps a hidden background process alive after the command returns
and reuses only a verified service for this project. Missing npm dependencies
are installed in the project; it never overwrites an existing source project.
Use `--node "<executable>"` or `VIDEO_MASTER_NODE` when Node is not on PATH;
`--skip-install` diagnoses dependencies without downloading.

Give the actual verified `page_url`, even if the opener reports failure.
An agent-host opener may use `--no-browser` and open that URL itself. Lack of
browser-control tools is not a reason to ask the choices in chat: the Agent
still controls production via `agent_control.py` and uses portable Playwright
tests/screenshots. A remote/headless execution host may need a user-visible
port forward; explain that limitation instead of binding to a public address.
Chat is allowed only by the explicit/failure branch in `interaction-contract.md`.

Planning does not need Chromium. Before rendering or visual QA, install it in
the initialized project using its npm runtime (set the command working directory
to the absolute project; Bash users may `cd` there):

```bash
npx playwright install chromium
```

No Codex app RPC is needed for planning, actions, export or narration.
Do not claim QA from API responses alone. Tests run in isolated fixtures.

Commands in this document are Bash syntax. On PowerShell use `$SKILL_DIR`
and full paths; no Unix shell is required. Binaries can be supplied through
PATH; `FFMPEG_PATH`, `FFPROBE_PATH`, `POWERSHELL_PATH` and
`VIDEO_MASTER_PYTHON`, plus `VIDEO_MASTER_NODE` for the launcher, are explicit overrides. FFmpeg/FFprobe otherwise come
from npm packages. Do not hard-code the developer's machine paths.

## Local Narration: Concrete Tool Contract

Quality: system voices are a low-cost baseline, generally less expressive
than MiniMax or a good human recording. They cannot clone voices or sing.
Generation runs on this computer and sends neither text nor audio to a cloud.

| OS | Engine | Dependency / voice discovery |
|---|---|---|
| Windows | SAPI `System.Speech` | Windows PowerShell and installed SAPI voices; `voice.ps1 -ListVoices` |
| macOS | `say` | System speech voice installed; `say -v '?'` |
| Linux | `espeak-ng` | Install with the OS package manager; `espeak-ng --voices` |

```bash
node src/local-tts.mjs voices
node src/local-tts.mjs synthesize --text "Welcome to the studio." --speaker narrator --speed 1
node src/local-tts.mjs synthesize --text "Welcome." --voice "<exact-installed-ID>"
```

`voices` returns JSON `{backend,available,voices:[{id,language}],error?}`.
Synthesis returns JSON `{src,duration,voice_id,backend,cached}`; `src` is a
project-relative real 48kHz mono PCM WAV under `audio/local/`, `duration`
is measured by FFprobe. Missing engines/voices cause a nonzero process exit;
enumeration reports `available:false`. Never substitute cloud services.
Auto voice selection supports Chinese/English detection only; use an explicit
installed ID for other languages. Host B gets a second compatible voice only
when one exists; do not promise distinct hosts without checking the result.
Speech speed is 0.5-2; local pitch is the system default, not the cloud pitch
setting. Identical engine/voice/text/speed reuse audio; after changing OS voice
packages, use a new project or deliberately invalidate affected audio cache.

Save selected IDs in `voice_tools.json.local_voices`, independently of cloud
`voices`. UI `/create?panel=voice` lists actual local voices, exposes speed
and real audio audition. `GET /api/local-voices` and
`POST /api/voice-preview` with `{speaker,text}` offer the same capability.
No paid-service flag is needed for local synthesis.

For program production, author `program.json` and use
`node src/create-program.mjs --input program.json` in a new draft.
`tts.provider:"local"` plus `tts.local_voices` sets host mapping; each line's
`voice` overrides it. Missing per-line audio is synthesized, durations/RMS
are measured, then voice/subtitles/scenes are assembled. Do not use a cached
example voice name as if it were installed on every computer.

## Other Capability Boundaries

- **Images**: native image generation is optional and host-specific. Verify
  the actual tool and output-file handling; there is no universal built-in
  image CLI. If absent, offer the existing external adapter or user-provided
  assets; do not disguise diagnostic art as generated final characters.
  `workflows/stages/image-tools.md` owns configuration, flags and outputs.
- **MiniMax**: standard HTTPS and local `.env`, not a proprietary agent tool.
  TTS/cloning/upload contracts and consent live in
  `workflows/stages/voice-tools.md`. All UI actions have loopback endpoints.
- **Uploaded narration**: install `requirements-audio.txt` in a Python
  environment; set `VIDEO_MASTER_PYTHON` to it before starting the server.
  Model weights are separately required. `VM_ASR_MODEL` can be a local
  CTranslate2 faster-whisper directory for offline use. When the model host
  is inaccessible, report the download blocker and allow a user-configured
  mirror or pre-downloaded model; never upload audio elsewhere as a fallback.
- **Music**: the bundled music generator makes original procedural
  instrumental audio. It is not a singing generator. Licensed input songs
  can be analyzed and edited; missing vocals cannot be fabricated as present.
  `scripts/compose_music.py` needs only Python + Node, no service or npm package.
  Read `workflows/stages/music-tools.md` for concrete CLI/JSON contracts,
  selection/audition, independent track arrangement and speech ducking.
- **Media research**: use the host's actual search/download tools or an
  authorized asset manifest. Search is not bundled as an imaginary tool.
- **Review**: `/create?panel=review` handles agent-authored script/spec/asset/
  soundtrack/payment checkpoints and timestamp notes. The API stores
  decisions, never runs arbitrary shell code from a confirmation.
- **Motion QA**: `scripts/review_motion.py --project "<project>" --json`
  reads the storyboard/timeline; add `--sheet --save-frames --output
  renders/preview/motion-v1.png` to sample the project's actual renderer and
  retain full-size frames for safe-area, overlap and ending checks. This is a
  no-encode still preflight; use short native-fps ranges only when temporal
  inspection is needed, then make the full export once after the review gate.
  The audit needs Python + Node; a sheet additionally needs that project's
  Playwright/Chromium. No native browser-control plugin is required.
  Read `references/motion-direction.md` for ranges, limitations and interpretation.
- **Experimental self-review**: default off, including one-sentence mode.
  `scripts/review_quality.py --project "<project>" status` works through
  Python + Node; sampling uses the target project's Playwright/Chromium and
  actual renderer. `/create?panel=quality` stores the optional user choice.
  The Agent must actually inspect full-size images, play clips or listen to
  audio before claiming those observations. Without a supported modality,
  record unknowns; there is no hidden model, native-audio assumption or remote
  upload fallback. Read `references/quality-self-review.md` only when relevant.

The active agent reads actual receipts and continues. An idle session is not
automatically awakened by a form; another compatible agent can resume by
reading `/api/workflow`, checkpoints, notes, spec/lock and timeline.
