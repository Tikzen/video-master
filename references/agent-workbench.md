# Planning Page And Agent Workbench

The user chooses direction and reviews; the agent owns production.
The server is a local planning/editor/control surface, not an embedded LLM.
A submission persists a receipt; the active agent waits, reads it and continues.
An idle/closed agent session is not automatically awakened by the page.
State this when handing off outside an active run.
The contract is standard local HTTP + JSON and a Python CLI, independent of
Codex/MCP. See `portable-runtime.md` for setup and concrete tool dependencies.
Keep all user-owned choices in the WebUI by default; chat requires an explicit
user request or a diagnosed startup/access failure, per `interaction-contract.md`.
Pages have direct links `/create?panel=images`, `voice`, `music`, `quality`, `review`, `production`
and `delivery`. They share the project state with the editor.

## Planning

Before asking creative questions, author a contextual Stage 1 JSON in the
working/analysis directory using chat facts and proposed choices. Do not make
the user choose between chat and WebUI; without an explicit override, the page
is the default. Then run this portable launch command:

```bash
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --proposal "<absolute-stage1.json>"
```

The launcher safely initializes only a new/empty project, installs missing
project npm dependencies, starts a hidden detached server, verifies the
service/project identity and page, publishes the proposal, then asks the OS
to open the exact round. It returns JSON with `url`, `page_url`, `reused`,
`pid`, `browser`, project-local `receipt` and `log`. Use revision 2 for the
first proposal: the starter reserves revision 1 for diagnostic defaults.
Later proposals increase the active round's revision. Reopening identical
published content is idempotent and preserves confirmations.

Immediately post the actual `page_url` with one brief summary, then wait for
the receipt. `browser.accepted` proves dispatch only, not a visible page.
If the host has its own browser-opening tool, pass `--no-browser`, open the
returned `page_url` with that tool, and still provide the link. If no opener
works, provide the link and keep the WebUI; do not switch silently to chat.
Do not claim a remote server's loopback URL is user-reachable without
appropriate forwarding. See `portable-runtime.md` for prerequisites.

Servers for the same project are reused after health checks; foreign services
are never stopped. Default scans ports 5179-5198; `--port N` is exact and
`--port 0` chooses an available port. `.editor/workbench.json` and
`.editor/workbench.log` belong to the project and are excluded from the skill
package. A failed launch prints an actionable error, not imaginary choices
or success. Chromium is not needed to start planning; install it before
rendering/visual QA.

`/create` is the planning page, `/` the optional editor. The first displayed
proposal must be contextual, not generic starter defaults. Proposal fields
have label, value, origin and optional options/type. On a live project the
existing `agent_control.py ... propose --file` remains available.

Use agent-paced rounds, not a fixed form wizard. Open `/create?round=stage1`
only for direction/topic/audience/effect/style. The page contains three
candidates per field and Custom, with custom inputs initially hidden. The
agent authors contextual `choices`, rather than outsourcing the brief to the
user. Read chat context first and carry existing facts into suggestions.

The submission posts `round:"creative-direction"` and records `scope` and
`deferred_fields`; it does NOT confirm duration, aspect, assets or tool paths.
After reading this receipt, reason about the next round, publish a proposal
and open its separate URL `/create?round=stage2` by rerunning the launcher with
`--proposal "<absolute-stage2.json>"`. The submitted page waits;
it never automatically switches into the next choice form. Later material
decisions can use `/create?panel=review`, `images`, `voice` or `music` as appropriate.
Do not ask every setting at once. A session draft is not approval and a changed
proposal hash does not reuse it. Native APIs remain available to other agents.

Field `choices` contains exactly three distinct strings or objects with
`value`, `label`, optional `description`; `value` must match a choice.
Custom text is accepted unless `allow_custom:false` is justified by a real
constraint. Numeric fields retain min/max checks for custom input. The mode
choice is the explicit interaction policy, not a creative candidate.

For custom direction/style, record it verbatim, choose the nearest MV/studio/
product/report renderer as a base, and adapt code and assets rather than
rejecting it. Direction illustrations are code scenes, not exported videos.
One-sentence mode delegates hidden creative details without pretending the
user approved them. Paid/cloning consent remains separate.

Only include unresolved fields needed for the current action in `fields`;
the direction page does not require topic/audience/style fields that are
already explicit in chat. The agent may change the page and renderer details
for a project. Preserve the HTTP/JSON confirmation boundary and show meaningful
choices, not internal implementation knobs or preset catalog filler.

Custom treatment requests use `POST /api/treatment-request` with the current
`proposal_hash` and `text`. Read `workflow.treatment_request`, revise the
treatments, then open the next round. This records a request, not Stage 2
approval; never lock a custom treatment merely because the request exists.

```json
{
  "stage": "stage1",
  "revision": 2,
  "title": "本轮创作方向",
  "fields": {
    "genre": {"label":"方向","value":"studio","choices":["studio","product","report"]},
    "topic": {"label":"主题","value":"新功能速览","choices":["新功能速览","使用场景解读","技术机制讲解"]},
    "audience": {"label":"观众","value":"新用户","choices":["新用户","进阶用户","团队决策者"]},
    "purpose": {"label":"观看后留下什么","value":"理解核心价值","choices":["理解核心价值","记住三项亮点","产生尝试意愿"]},
    "style": {"label":"风格","value":"像素双主播","choices":["像素双主播","现代新闻演播室","漫画讲解"]},
    "mode": {"value":"interactive","options":["interactive","one_sentence"]}
  }
}
```

Wait for the actual Stage 1 receipt, then author exactly three contextual
treatments. Each candidate needs `id`, `name`, `concept`, `image_system`,
`motion_system`, `structure`, `execution`, optional `recommended` and local
`assets/` preview. Built-in illustrative motion previews are not final scenes.
Include production choices in `fields`: duration, resolution/fps, audio,
captions, delivery and acceptance. The helper binds Stage 2 to Stage 1.

Wait for Stage 2, then write/audit spec and lock, produce assets and code,
assemble, inspect and render. Update `/api/production` with truthful status
and `{label,status}` steps. MP4 QA precedes a completion claim.

Explicit one-sentence choice records delegation and advances to production
without a fake Stage 2 receipt. Paid APIs/cloning still require separate consent.
Stage 1 changes invalidate Stage 2. Hashes prevent stale confirmations.
Revising a proposal needs a higher revision; never alter historical consent.

```bash
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 status
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 wait --stage stage1 --timeout 120
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --proposal "<absolute-stage2.json>"
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 wait --stage stage2 --timeout 120
```

The sample port above is illustrative; always substitute the launcher's actual
`url`. To open a later prepared checkpoint/tool choice, reuse the same server:

```bash
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --panel review
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --panel music
python "${SKILL_DIR}/scripts/start_workbench.py" --project "<absolute-project>" --editor
```

Publish relevant checkpoint content before opening its panel. Panels do not
generate plans, grant consent or automatically proceed to another round.

A wait timeout reports waiting, never approval. Read submitted values and
continue in the same active run. Do not ask users to author scripts/find media.

## Control API

`GET /api/workspace` returns one coherent snapshot, revision, transport and
history state. `POST /api/actions` takes `expected_revision` plus `actions`.
The helper reads current revision unless `--revision` is supplied.

| User operation | Agent operation |
|---|---|
| Text, transforms, camera, expression, volume/fades | `cue.update` `{id,patch}` |
| Move / trim | `cue.move` `{id,time}` / `cue.trim` `{id,edge,time}` |
| Add / delete clip | `cue.add` `{cue}` / `cue.delete` `{id}` |
| Add / mute / hide / rename / delete track | `track.add` `{track}` / `track.update` `{id,patch}` / `track.delete` `{id}` |
| Full assembled edit | `timeline.replace` `{timeline}` |
| Name, dimensions, fps, duration | `project.update` `{patch}` plus aligned timeline in same batch |
| Seek / frame step / selection / playback / zoom / snap / dialog | `view.set` `{patch:{time,selected_id,playing,zoom,snap,panel}}` |
| Undo / redo | `/api/actions` `{expected_revision,command:"undo"}` or `"redo"` |
| Save | `POST /api/timeline` with If-Match; actions already persist |
| Audio import | `POST /api/import-audio?name=...` raw bytes, then track/clip add |
| Upload narration / recognize words | import, `POST /api/transcribe` `{src,speaker}`, poll `/api/transcription-status`, inspect `/api/narration-assets` |
| Review note / resolve | `POST` / `PATCH /api/annotations` |
| Image / voice selection | `GET` / `POST /api/image-tool`, `/api/voice-tool` |
| Music selection / audition / arrangement | `/api/music-tool`, `/api/music-generate`, `/api/music-apply` with `expected_revision`; see music-tools |
| Experimental quality-review choice and status | `GET /api/quality-review`; Agent records explicit chat choice through `POST /api/quality-settings`, never user-only `/api/quality-choice` |
| Grounded intent / evidence / judgment / repair | `/api/quality-intent`, `/api/quality-prepare`, `/api/quality-evidence`, `/api/quality-report`, `/api/quality-repair`, `/api/quality-comparison`, `/api/quality-restore`; see quality-self-review |
| Paid voice audition | `POST /api/voice-preview` `{text,speaker,authorized:true}`, after consent |
| Local speech discovery / audition | `GET /api/local-voices`; same preview route without paid authorization for local provider |
| Sample upload/folder / clone | `/api/voice-samples`; `/api/voice-clone`; `/api/voice-clone-status`, see voice-tools |
| Script/spec/assets/music/cost review | `GET` / `POST /api/checkpoints`; user submits `/api/checkpoint-response` |
| Export / progress / delivery | `POST /api/render`, `GET /api/render-status`, `/api/deliveries` |
| Proposals / user decisions | `/api/proposals`, `/api/workflow` |

```json
[
  {"type":"cue.update","id":"title-01","patch":{"text":"NEW TITLE","transform":{"scale":1.1}}},
  {"type":"cue.move","id":"title-01","time":2},
  {"type":"view.set","patch":{"time":2,"selected_id":"title-01","playing":false}}
]
```

```bash
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 actions --file actions.json
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 import-audio --file narration.wav
python "${SKILL_DIR}/scripts/agent_control.py" --url http://127.0.0.1:5180 request --route /api/render --method POST
```

Clean editors receive Agent changes without reload. Unsaved user edits block
Agent data mutations; stale writes return 409. Never bypass this by overwriting
timeline files. Merge after the user saves or explicitly discards changes.
Undo history is session-local. Validation makes a batch atomic in memory,
but two persisted JSON files are not a database crash-transaction.

Transport commands work without a browser and are applied when it connects.
Browser playback still needs a user audio gesture under autoplay rules.
Inspect actual pixels/audio using browser tools; API success isn't visual QA.

The CLI refuses `/api/confirm`. User decisions belong to actual page submissions
or explicit chat evidence, not Agent-simulated user clicks.
The server is loopback-only and rejects foreign origins; it is not an
authenticated remote/multi-user service.

Motion review does not require another choice page. The Agent runs
`scripts/review_motion.py`, inspects the advisory prompts and renders a contact
sheet or range preview per `motion-direction.md`. To request actual preview
acceptance, attach its project-relative `renders/preview/` PNG or MP4 as
`media` in the existing review checkpoint below. Keep user choices bounded;
do not ask the user to fill motion-intent fields or operate the CLI.

## Experimental Self-Review Panel

Offer `/create?panel=quality` only when relevant to a later production decision.
The user selects off, standard (one repair round), deep (two), or a bounded
custom policy. Label it experimental and explain additional
sampling/review/rerender time. Default is off, including one-sentence mode;
general creative delegation is not opt-in. Do not repeat a choice made in chat.

`POST /api/quality-choice` is a real user submission. The Agent can instead
record the actual explicit chat instruction with `POST /api/quality-settings`
and `decision_evidence:{source:"chat-user-instruction",text:"<actual instruction>"}`.
Use the current settings revision; stale approval is not reusable. Do not
fabricate evidence or submit the user endpoint. Extra external judging or
paid uploads still require separate scoped permission.

Read [quality-self-review.md](quality-self-review.md) for source-traceable
intent, generated judgment templates, actual media evidence and the bounded
repair/comparison loop. `GET /api/quality-review` is the complete resumable
state; the POST intent/prepare/evidence/report/repair/comparison endpoints and
`scripts/review_quality.py` provide portable equivalents. The page/server
does not run an embedded judge. The active Agent inspects, submits its grounded
report, edits the owning source and rerenders; users need not enter rubrics
or manipulate individual frames.
Sampling is asynchronous through `POST /api/quality-prepare`; poll the
`operation` in GET status and inspect the returned job/evidence, not only the
HTTP acknowledgement. Repair/restore refuses recent unsaved editor changes.
The portable CLI `restore` has no editor-presence channel; when a live editor
exists, use the guarded server endpoint after save/discard.

## Additional WebUI Checkpoints

When the user needs to review a real script, spec, character set, music sample,
paid generation scope or a complete preview, publish one bounded checkpoint:

```json
{
  "id": "script-review",
  "revision": 1,
  "title": "Review the actual narration script",
  "body": "The complete actual script or bounded action scope, in the user's language.",
  "media": "assets/preview.png",
  "options": [
    {"id": "approve", "label": "Approve"},
    {"id": "revise", "label": "Request changes"}
  ]
}
```

`media` is optional and must be a local public image/audio/video path. The
body is literal text, not executable HTML/Markdown. For paid/external actions,
include destination, data sent, bounded request count and known cost/uncertainty
in body; set `requires_consent:true` and `authorizes:true` on the execution
option only. Reject/revise must work without consent.

Publish through the helper's `request --route /api/checkpoints --method POST
--file checkpoint.json`. Open `/create?panel=review`. Poll GET checkpoints;
read `response.selected`, `note`, `consent` and its proposal hash. No response
means no permission. The API merely records choices; the agent executes only
the authorized scope. A refusal never authorizes an action. New content needs
an increased revision and fresh response; old proposals/responses stay in
history. Never fabricate `/api/checkpoint-response`; the helper refuses it.

### Gallery checkpoints (pick one of several rendered candidates)

Use these when the user must choose between visual alternatives, such as studio looks,
host designs or host sources. Add the following to the checkpoint:

- `candidates`: 2–8 items, each with `{id, label, description?, media?, recommended?, warning?, requires_upload?}`.
  `media` is one local public path or an array of them (image/video). Studio looks and
  cast designs need real rendered or generated media, not descriptions. At most one
  candidate is `recommended`. `warning` shows a discouraged option, such as the template;
  the option stays selectable but is visibly not recommended.
- `notice`: a highlighted line at the top, for example "不推荐直接使用模版".
- `allow_upload`: `{label, max (1–12), hint?}` adds an image picker. Files go through
  `POST /api/import-image` (PNG/JPEG/WebP checked by magic bytes) into
  `assets/imports/images/<uuid>.<ext>` and are returned in `response.uploads`.
  A candidate with `requires_upload` cannot be submitted without an upload.
- An option with `without_candidate:true` (e.g. "都不满意，再出几套") can be submitted
  without picking one. Every other option requires `response.candidate`.

Templates and a validator: `assets/studio-rounds/*.example.json` and
`scripts/studio_rounds.py check|publish`. The validator requires ≥3 distinct
candidates with media for studio-look and host-design, ≥960 px studio frames,
transparent host art, and the template warning and notice on host-source.

Keep checkpoints proportional: do not turn every production step into a gate
or demand approval already delegated by the user. Use this channel for missing
material choices and optional reviews, not for offloading scriptwriting.
