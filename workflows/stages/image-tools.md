# Image Tool Selection and Asset Closure

Load before any generated raster assets, especially studio hosts/expressions
and backgrounds. Reuse the user's configured selection; otherwise ask once:
“生图用内置工具，还是外部 API？外部 API 会生成 .env 供你本机填写。”
One-Sentence mode may infer style, but does not imply permission for a new
paid provider. Built-in availability must be checked, not assumed.

## Selection

The preview's “生图工具” icon opens the same project tool selection as the CLI:

```bash
python "${SKILL_DIR}/scripts/image_tools.py" setup \
  --project "<project>" --path builtin
```

Or after the user selects an external provider:

```bash
python "${SKILL_DIR}/scripts/image_tools.py" setup \
  --project "<project>" --path external --backend openai
```

This creates `asset_tools.json` (no secrets), `.env.example`, and `.env` with
blank provider-specific variables. Existing `.env` is never overwritten;
tell the user which names to add if switching providers. Use project-local
configuration only. Do not read keys into chat, put them in prompts/receipts,
expose an API that returns `.env`, or include it in delivery archives.

For an OpenAI-compatible external API, the user fills:

```dotenv
IMAGE_BACKEND=openai
IMAGE_CONCURRENCY=2
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=
```

The user fills model and base URL from their chosen service's documentation,
not guessed from a version claim. For other providers the setup command emits
that adapter's names. The runner reuses PPT Master's image adapters under MIT;
the complete unmodified upstream repository remains a separate reference.
See [vendored component notes](../../vendor/ppt-master/SOURCE.md).

## Generation

- Built-in: use the available native image tool. No API key. Save outputs into
  this project. If unavailable, report that and offer external configuration;
  do not silently switch to a paid provider or claim placeholder art is final.
- External: install `requirements-images.txt`; after the user authorizes the
  anticipated requests/cost, use:

```bash
python "${SKILL_DIR}/scripts/image_tools.py" generate \
  --project "<project>" --authorize-requests -- \
  "<production prompt>" --aspect_ratio 16:9 -o assets/art --filename studio.png
```

Use `--reference-image assets/art/host-a-neutral.png` for identity-preserving
expression edits on compatible backends. Generation support does not imply
reference-edit/alpha support; verify before spending on the full set. Do not
independently regenerate each pose and pretend identity consistency is assured.

Provider errors are redacted before stdout; the runner deliberately does not
install upstream's raw transcript logging. No live provider call is part of
setup or tests. A user-filled key alone is not blanket spend authorization.

## Studio Assets

The host source comes from the user's WebUI choice (`host-source` checkpoint, see
[studio-explainer.md](studio-explainer.md)): uploaded 立绘, API original, or
upload-and-redraw. Templates are not recommended. For generated or redrawn hosts,
show ≥3 cast designs (`host-design` gallery) before making the master.

Create one named master per host. The master, its neutral image, is the identity
authority. Every other image is an **expression differential**: a reference edit of
the master that keeps the same crop, anchor, wardrobe, proportions, line art and
transparent background, and changes only the face. The set is not hand-picked.
It comes from **人物差分要求表**, which `scripts/expression_sheet.py build` generates
from the storyboard/script and whose `expression_sheet.json` is the manifest
(`key`, `prompt`, `prompt_zh`, `reference`, `output`, `status`, lines, screen time).
Each expression gets a base frame and a `_talk` (mouth open) frame. Expressions
that are on screen a lot also get `_blink`.

Differentials may use a different, edit-capable model from the one that made the
master. `expression_sheet.py generate --backend <name> [--model …]` passes
`image_tools.py generate --backend <name>`, which needs that backend's variables
in `.env`. After the user approves the row count and cost, run `generate`, then
`check`, which rejects a wrong canvas, a missing alpha channel, a body silhouette
that moved (IoU < 0.9 below the face) or a shifted base line. Then run `apply`.
Verify reference-edit support on one row before spending on the whole sheet.

Studio looks are a separate user choice: ≥3 polished candidates rendered as real
frames (`studio-look` gallery, bar in `references/craft/genre-studio.md` §0).
Generate the empty studio separately: camera frontal, left/right host space,
large unobstructed rear display, foreground desk on a separate layer when
possible, no baked titles/captions/logo. Code owns screen content, subtitles,
ticker, lighting, motion and camera. Validate alpha/crops/identity before
placing the images into `program.json` host expression paths.

If the generator lacks transparency, use an authorized background-removal
workflow and inspect edges. Do not delete a similarly colored costume while
chroma-keying or leave rectangular “stickers” unnoticed.
