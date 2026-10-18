# Finish — light, texture and post

Finishing is the last 10 % that makes frames feel photographed instead of drawn. It is never a
substitute for concept or motion.

## 1. Pipeline (motionkit `Film.render_frame`)

scene × N sub-frames (motion blur) → bloom → chromatic aberration → overlay/HUD → flash → vignette → grain

Defaults live in `film.post`. Per-time overrides go in `@film.fx`. Impacts go in `film.impact()`.

## 2. Settings by context

| Context | bloom | bloom_key / thr | grain | vignette | notes |
|---|---|---|---|---|---|
| Paper / light graphic | 0 | — | 0.015–0.02 | 0.15–0.2 | crisp; let multiply overprint do the richness |
| Saturated colour ground (red, blue) | ≤ 0.6 on emissive parts | `luma`, 0.6 | 0.02 | 0.2 | `max` key would make the whole ground glow |
| Dark graphic / type | 0.3–0.5 | `max`, 0.55 | 0.02 | 0.22 | |
| Particles / light / 3D points | 0.75–1.2 | `max`, 0.40–0.45 | 0.02 | 0.22 | additive blend + bloom = glow |
| Product UI / data | 0 | — | 0 | ≤ 0.08 | pixel-crisp; no grain on screenshots |
| Studio show | 0 | — | ≤ 0.012 | ≤ 0.14 | broadcast clean |

## 3. Impacts (big hits only)

```python
film.impact(ev["drop"], shake=16, ca=0.010, flash=0.85, decay=0.18)
film.impact(ev["seal"], shake=20, ca=0.007, flash=0.0, decay=0.32)
```

- One impact per section at most. Shake ≤ 20 px and gone within about 0.4 s.
- Chromatic aberration 0.004–0.01, only on impacts. As a constant look it reads as a mistake.
- A flash covers a hard change of ground (e.g. red → ink). Decay ≤ 0.18 s, or it looks like an exposure error.

## 4. Light without a 3D engine

- **Additive blend** (`blend(ctx, "add")`) for anything emissive: particles, beams, glints. Never for text.
- **Radial glows** (`glow_disc`) for light sources. Put a small bright core only where an event lands.
- **Beams** (`beam`): tapered polygons with a gradient falloff.
- **Lambert + rim** on 3D points (`space.shade`) instantly reads as volume.
- **Value flips** between chapters (dark ↔ light ground) are the strongest "lighting change". Use 1–2 per film.

## 5. Print and texture (for flat design)

- Multiply overprint: overlapping colour shapes create a third colour (riso/Bauhaus).
- Halftone dots (`draw.halftone`), hatching (`stripes`), misregistered key lines offset 6–10 px.
- Stamp texture: rough edges plus knocked-out speckles (the 动 seal).
- Construction grids at 5–11 % opacity.

## 6. HUD (optional)

`film.hud = mk.HUD(film, identity="BRAND", subtitle="…")` adds crop marks, a chapter index with
rolling numerals, timecode, a beat meter and a scrubber. Its colour adapts per pixel to the
picture underneath. Use it for showreels, launches and technical stories; skip it for emotional
or cinematic pieces and for studio shows, which have their own graphics.

## 7. Colour management and encoding

- Frames are sRGB. The encoder uses a BT.709 matrix and tags (`cli._chunk_job`), so colours don't shift in players.
- The master is CRF 12; delivery is CRF 18 High profile. Grain raises bitrate a lot (≈ 35–40 Mbps at 1080p60). If size matters, lower grain before lowering quality.
