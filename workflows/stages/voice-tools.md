# Narration Tools

Use for studio hosts, explainers, products and reports. Offer local installed
voices, MiniMax API, or authorized recordings. Do not silently switch
providers after a cloud failure. TTS is narration, not an MV singing engine.

Ask the user to choose API narration or upload existing audio; local system
speech remains a no-service optional baseline, explicitly labeled less
natural/expressive than MiniMax or a good human recording. Read
`references/portable-runtime.md` (relative to the skill root) for concrete
OS dependencies, voice enumeration, local CLI/API and output contracts.
Upload mode does not require a
text transcript from the user. The agent transcribes, checks and structures it.

The editor microphone button configures provider, account region, model,
per-speaker Voice IDs, speed and pitch. The planning page offers the same
provider choice. Configuration makes no remote request.

```bash
node src/voice-tools.mjs minimax cn
```

Setup appends only absent variables to `.env` and `.env.example`, preserving
existing credentials. Fill `MINIMAX_API_KEY` locally. Optional
`MINIMAX_TTS_BASE_URL` and `MINIMAX_TTS_MODEL` override region/model.
These are separate from `MINIMAX_BASE_URL` / `MINIMAX_MODEL` for images.
Never ask for a key in chat. Process environment overrides the file.

`voice_tools.json` stores only non-secret preferences. Account, key, region
and Voice IDs must match. A system voice or authorized custom/cloned Voice
ID works. Sample upload and cloning follow the separate consent gate below.

Add this to an agent-authored `program.json`:

```json
{
  "tts": {
    "provider": "minimax",
    "region": "cn",
    "model": "speech-2.8-turbo",
    "voices": {
      "host-a": "AUTHORIZED_VOICE_ID_A",
      "host-b": "AUTHORIZED_VOICE_ID_B",
      "narrator": "AUTHORIZED_NARRATOR_ID"
    },
    "speed": 1,
    "pitch": 0
  }
}
```

Per-line/page `voice_id` overrides speaker mapping; optional `emotion` is
validated for the model. Per-line `audio` always bypasses synthesis.
After explaining text sent, request count and potential charges, obtain
paid-service approval, then:

```bash
node src/create-program.mjs --input program.json --authorize-tts
node src/render.mjs --output delivery/narrated-v1.mp4
```

For a new project, `create_program_video.py` accepts
`--env-file <private-existing-env>` and `--authorize-tts`.
Do not blindly use `--replace-draft` on an edited project: rebuild narration
separately and apply selected cues through the control API.

All missing lines are preflighted before the first paid call. Identical
endpoint/text/voice/settings reuse cached audio. No automatic paid retry
follows network/provider failure. Paid MP3 is retained before normalization
so local decode failure does not rebill. Errors do not echo keys/raw bodies.
Deleting cache or retrying failed provider responses may incur another charge.

Decoded duration drives voice/subtitle/expression/scene intervals; RMS drives
host motion. Captions are utterance-level, not claimed word alignment.

Official contracts checked 2026-10-13:
- https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
- https://platform.minimax.io/docs/api-reference/speech-t2a-http
- https://platform.minimax.cn/docs/guides/speech-voice-clone
- https://platform.minimax.cn/docs/api-reference/voice-cloning-uploadcloneaudio
- https://platform.minimax.cn/docs/api-reference/voice-cloning-clone

Tests use mock responses with locally synthesized test audio. They verify
authorization, contract, decode, cache and errors, not live account/model
compatibility. Only a consented live call verifies that.

## Voice Cloning

Domestic MiniMax supports voice cloning; do not repeat an old "overseas only"
claim. A verified personal/business account and clone permission are required.
User must own the voice or have explicit speaker authorization. Do not clone
another person's voice based only on possession of a recording.

`/create?panel=voice` and the microphone panel provide the same widget.
User uploads MP3/M4A/WAV or drops a file into `<project>/voice-samples/`.
Samples must contain 10-300 seconds of audio and be at most 20 MB.
Choose sample, new Voice ID, target speaker, optional denoising/normalization,
then separately confirm rights and authorize sending that sample to the
selected MiniMax region with possible platform charges. A folder drop or
local upload alone is not external-upload/clone consent.

| Operation | Contract |
|---|---|
| Local sample list/folder | `GET /api/voice-samples` |
| Local upload, no external call | `POST /api/voice-samples?name=sample.wav`, raw bytes |
| Authorized clone | `POST /api/voice-clone` JSON below; returns 202/job |
| Progress/result | `GET /api/voice-clone-status` |

```json
{
  "sample": "sample-name.wav",
  "voice_id": "MyVoice2026",
  "speaker": "narrator",
  "noise_reduction": true,
  "normalize": true,
  "rights_confirmed": true,
  "authorized": true
}
```

`sample` is a basename in the private local folder, not an arbitrary path.
Only set consent fields after actual user authorization, never as default
agent convenience. The agent can copy authorized audio into this folder and
list it. The folder is not publicly served and is excluded from Git/delivery
packages. It still exists on disk; do not claim encrypted or deleted storage.

Tool implementation uploads multipart `purpose=voice_clone` + `file` to
`https://api.minimax.cn/v1/files/upload`, then sends `{file_id,voice_id,
need_noise_reduction,need_volume_normalization}` to `/v1/voice_clone`.
International region uses `api.minimax.io`. Only verified official endpoints
are accepted for cloning, not a custom TTS proxy. IDs are 8-256 ASCII
characters, start with an English letter, contain letters/digits/-/_, end
with letter/digit and must not duplicate existing account IDs.
MiniMax optional <8-second prompt samples are not exposed in this baseline.

No `text` is included in cloning, so it does not silently synthesize a paid
preview. Success saves the ID in `voice_tools.json.voices[speaker]`; then
the user can authorize a separate TTS audition or a bounded production run.
According to the official contract, a cloned voice unused in formal TTS for
7 days is deleted. An old local receipt does not prove the cloud voice still
exists: if it has expired, choose a new ID/sample authorization or verify the
account first. Error 2038 means clone permission/account verification issue.

Local `voice-samples/clones.json` saves sample fingerprint, external file ID,
consent scope and status without a key. A timeout/crash after clone submission
is persisted as uncertain and blocks resubmission until the user checks the
provider account. No automatic retries. A definite rejection can be retried
only after correcting it and renewed authorization. Cached success reassigns
the same ID locally but makes no new clone request.

## Uploaded Narration

The planning page and microphone dialog provide audio upload. The server
normalizes it, runs local faster-whisper and saves JSON text, sentence/word
timestamps plus SRT under `audio/transcripts/`. No audio is sent to a remote
service. First use downloads model weights; the model download is not an audio
upload. Install `requirements-audio.txt` in a private Python environment and
set `VIDEO_MASTER_PYTHON` before starting the server if needed.
`VM_ASR_MODEL` selects a model or a local model directory (default `small`).
No automatic cloud fallback or billed ASR is permitted.

The agent reads `/api/narration-assets` and the transcript to build scene
changes/expressions/captions around actual audio. Do not ask users to write
the recognized transcript. Correct homophones using supplied context, but
preserve what is spoken and flag uncertain proper nouns or claims.
Word timestamps are ASR estimates, not an independently verified forced
alignment. Preview and listen around boundaries before delivery.

For a whole recording, authored lines/pages accept `audio`, `audio_start`
and `audio_end` (seconds). Reuse the recording with those intervals; the
builder sets source offsets and slices measured RMS correctly. Keep complete
utterances rather than cutting words. Preserve meaningful pauses.

For two separate host recordings, store the selected host ID with each upload.
A mixed dual-host recording is transcribed, but this baseline does not
automatically identify voices; do not claim diarization. The agent can map
turns using an existing script and listening; otherwise retain unknown
speaker labels or ask for the minimum identity clarification.
