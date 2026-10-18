# motionkit API (engine/motionkit)

Python ≥ 3.10. Dependencies: `pycairo uharfbuzz numpy scipy opencv-python-headless pillow fonttools brotli`,
plus ffmpeg (PATH, `FFMPEG_PATH`, or `imageio-ffmpeg`). `scripts/init_code_film.py` checks all of them.
`import motionkit as mk`. Method: [craft/README.md](craft/README.md).

## Film & clock
| Call | Purpose |
|---|---|
| `mk.Film(name, w, h, fps, duration, bpm=None, bars=None, root=__file__)` | frame pipeline; `bars=` fits the tempo to whole bars |
| `@film.chapter(t0, t1, name, glyph)` → `fn(ctx, t, ch)` | chapter; `ch.local`, `ch.u` (0..1), `ch.t0/t1` |
| `film.events.add(name, t, kind, **data)` / `ev[name]` | the shared event map (hit/drop/whoosh/tick/swell/word/speech) |
| `film.impact(t, shake, ca, flash, decay, flash_col)` | coordinated hit FX |
| `film.blur(default, windows=[(t0, t1, n)])` | temporal motion blur (180° shutter) |
| `film.post.update(bloom, bloom_thr, bloom_key, grain, vig)` / `@film.fx def f(t, fx)` | finishing defaults / per-time overrides |
| `film.cut(t)` | declare an intentional hard cut (diff QA) |
| `@film.precompute` | expensive deterministic setup (simulations) |
| `film.hud = mk.HUD(film, identity, subtitle)` | optional designer overlay |
| `film.cli()` | `info still sheet range diff loop chunks assemble render audio-qa events precompute` |
| `mk.Grid(bpm)` · `Grid.fit(dur, bars)` · `g.beat(n)` `g.bar(k)` `g.at(bar, beat)` `g.pulse(t)` `g.phase(t)` | musical clock |

## Easing & noise (`mk.*`)
`prog clamp lerp remap smooth smoother linear in_/out_/io_ quad cubic quart expo, out_quint io_sine
out_back(u,s) in_back out_elastic steps(u,n) spring(t,f,z) spring_settle_time impulse(t,f,decay)
decay(t,tau) bezier(x1,y1,x2,y2) SNAP SWIFT GENTLE stagger centre_out keys(t,frames) hash01 noise1 fbm1 wobble`

## Drawing (`mk.draw`)
Surfaces: `new_surface new_ctx surface_to_array surface_rgba array_to_surface`.
State: `rgba fill_bg blend(ctx, mode) camera(ctx, cx, cy, scale, rot, dx, dy) alpha_group group`.
Shapes: `circle ellipse rrect rect_c poly regular_polygon star capsule ribbon ribbon_path`.
Morphs: `shape_radius morph_pts(kind_a, kind_b, u, size_a, size_b, rot, n) resample`.
Lines: `polyline_length partial_polyline point_on_polyline arc_draw`.
Light: `linear_gradient radial_gradient glow_disc beam`. Patterns: `halftone stripes rings grid_lines`.

## Type (`mk.text`, `mk.fonts`)
`face(role)` (roles: display, mono, cjk, cjk_regular, cjk_serif, or any registered name) ·
`Run(face, text, size, var={"wght":800,"wdth":92}, tracking)` with `.glyphs .advance .ink0 .ink1 .ink_w .cap`
and `.path(ctx, x, baseline, per_glyph)` where `per_glyph(g)` returns `{dx, dy, sx, sy, rot, skew, ox, oy, var, skip}` ·
`draw_text draw_paragraph draw_vertical wrap fit_width fit_size glyph_path` · `face.missing(text)` ·
`fonts.register(role, path)` · `python -m motionkit.fonts install|check|list`.

## Detail layer (`mk.annotate`)
`annot(ctx, t, t_in, t_out, anchor, elbow, label, align, sub, col)` · `label` · `typed(s, u)` · `rails` · `dimension` · `crop_marks` · `bracket`.

## Post (`mk.post`)
`bloom(img, amount, thr, radius, key)` · `chroma` · `flash` · `vignette` · `grain` · `blur` · `depth_of_field` · `composite_adaptive` · `composite_rgba`.

## Systems
- `mk.sim`: `cached memo sample_mask burst Field().curl().vortex().contain().orbits().surge_at() integrate at pair_by_angle batch_streaks batch_dots`.
- `mk.space`: `fib_sphere on_sphere on_cube on_convex pyramid_planes cube_edges on_torus ring_points Camera(.rotate .project) shade depth_alpha draw_points draw_streaks draw_edges floor_grid`.
- `mk.transitions` (both sides live): `iris iris_close diagonal_wipe tile_flip slices push mask_reveal grow_rect crossfade`.

## Genre kits
- **`mk.mv`**: `analyze_track(path)` gives a Track (`bpm`, `offset`, `confidence`, `sections`, `energy_at(t)`, `report()`) · `WordCards([(word, t), ...], style)` · `beat_strobe(t, grid)`.
- **`mk.studio`**: `Speech().add_wav/add_synthetic` · `Speech.active(t)` (audio only) vs `Speech.held(t)` (display: the last started line, held through pauses) · `Speech.drive(speaker, t)` (voice → envelope → spring stretch/rebound, eases down after speech; pure in t) · `Performance(speaker, speech, expressions, seed, gestures)` · `VectorHost(...)` · `SpriteHost({expr: png, expr_talk: png, expr_blink: png}, amount=1)` (whole-sticker transform only) · `caption(..., until=, fade_in=, fade_out=)` · `NewsSet(pal, brand)` · `StudioCamera` · `auto_shots` · `Show(film, speech, set, hosts={"a": HostSpec(...)}, screens={...})` · `lower_third caption pip ticker live_bug default_screen`.
- **`mk.present`**: `Layout` · `title_block bullet_list` · `counter odometer delta_badge fmt` · `BarChart(rect, labels, vmax).draw(ctx, t, t_in, values, prev, t_change, highlight)` · `LineChart` · `Donut` · `spotlight focus_ring cursor cursor_path click_ripple` · `UIShot(src).focus_at/transform/to_frame/rect_to_frame/draw(frame, focus, chrome)` · `phone_bezel morph_rect source_note load_image`.

## Audio (`motionkit.audio`)
`Score(film)`: `.add(x, t, bus, gain, pan, send) .kick .pad .seq .voice(wav, t, duck) .section(t0, t1, gain) .breath(t, len) .render(path, drive_db)`.
`synth`: kick clap snare hat crash · bass_note sub supersaw stab arp_pluck pluck_ks bell marimba soft_keys ·
tick click typewriter bounce chirp whoosh riser boom knock reverse_swell shimmer glitch ui_pop mouse_click · `nt chord`.
`envelope(wav, fps)` · `load_wav` · analysis: `python film.py audio-qa`.
