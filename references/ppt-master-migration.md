# PPT Master Migration

Reference: `hugohe3/ppt-master`, separately cloned commit `bf89859`.
The complete upstream repository is kept unmodified; Video Master is a
derivative workflow/product, not an official upstream distribution.

| PPT Master concept | Video Master ownership |
|---|---|
| Create / Template / Edit artifact lifecycle | Create Video / Create Video Kit / Edit Video Project |
| Communication brief confirmation | Audience, style, genre, source and soundtrack confirmation |
| Three integrated design treatments | Three coherent image + motion + production treatments |
| Default Confirm UI daemon, health check, browser dispatch and receipt wait | `start_workbench.py` publishes/opens each prepared round; `agent_control.py wait` reads real receipts |
| Design spec / execution lock | `video_spec.md` / `video_lock.md` |
| Slide/page queue | Storyboard + frame-aligned multi-track timeline |
| Live preview and annotations | Shared renderer preview, draggable editor, timestamp notes |
| Image backend selection and env | Built-in vs external choice, provider-specific standard `.env` |
| Failure/resume ownership | Recover owning spec, cue, asset, audio or encoding layer |
| Final export validation | Encoded MP4 metadata, determinism, decode and visual/audio checks |

Image components in `vendor/ppt-master` reuse actual upstream adapters under
the MIT license preserved at [vendor license](../vendor/ppt-master/LICENSE).
Its `SOURCE.md` documents the two local host adapters. Studio, MV, report/
product renderers, music synthesis, TTS-to-timeline builder and editor are
Video Master implementations.

The confirmation-chain adaptation was checked against upstream
`references/confirm-surface.md`, `workflows/generate-pptx.md` Step 4 and
`scripts/server_common.py` on 2026-10-14. The useful behavior is operational:
no surface override means a page, recommendations exist before opening,
the daemon survives its launcher, an actual URL is reported, and Stage 1
returns to the active Agent for the next proposal. Video Master keeps separate
Agent-paced round URLs, a shared planning/editor server and portable JSON
receipts; it does not copy PPT-only template installation or auto-shutdown.

One-Sentence mode is explicit opt-in. Default asks missing style; it does not
require the user to do scripting, asset gathering, or editing labor. The editor
is a review/refinement surface, not a hidden prerequisite for final output.

Not parity claims: this is not a full AE engine, native PPT animation importer,
universal style model, professional vocal generator, or a guarantee of free
commercial rights in every retrieved asset. Live external image providers are
configured by the user and tested locally with mocks unless specifically
authorized for real requests.
