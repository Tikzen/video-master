# Procedural Systems — particles, fields, 3D, patterns

These systems make "impossible in JSON" moments possible. Use them when the concept calls for
them (type dissolving, data becoming a shape, a world forming), not as decoration.

## 1. Determinism (non-negotiable)

- A frame is a pure function of `t`. No `random()`, no wall clock, no state carried from the previous frame.
- Simulations are integrated **once** with a fixed `dt` and seed, cached to disk, then interpolated: `@film.precompute` + `sim.cached(path, build)`. Bump the cache filename (`flow_v2.npz`) whenever parameters change.
- Pseudo-random values come from `hash01(i, k)`, `noise1`, `fbm1`, or `np.random.default_rng(seed)` inside the build function.

## 2. Particles (`mk.sim`)

Recipe for "type → particles → structure" (the FLOW chapter):

```python
pos = sim.sample_mask(W, H, draw_type_paths, n=6000, seed=7)    # points inside the glyphs
vel = sim.burst(pos, origin=period_xy, speed=(1250, 2950))      # explosion from the event origin
field = (sim.Field().curl(seed=7)                               # organic turbulence
         .vortex((960, 560), 0.85).contain((960, 560), 470)     # keep it on screen
         .orbits((960, 540), RINGS, ring_ids, ramp=(t0+0.14, t0+0.6))   # STRUCTURE: streams
         .surge_at([beat1, beat2, beat3]))                       # pulse with the kick
P = sim.integrate(pos, vel, field, t0, t1, follow=(0.08, 0.45, 3.4))
```

- **Structure beats scatter.** A uniform cloud of dots reads as noise. Organise particles into streams, rings or shapes within ≈ 0.6 s of an explosion. The first FLOW version failed exactly this way.
- Draw particles as **streaks** from `at(t − 0.03)` to `at(t)`, 1.5–3 px, additive blend, batched by colour (`sim.batch_streaks`). Add 5–7 % long silk trails for elegance.
- Brightness 0.7–0.85 per particle, so overlaps glow instead of clipping to white.
- **Converge** to a target (sphere, logo, text) with a per-particle delay (`delay` 0–0.16 s) and `io_cubic`. Pair sources with targets by angle (`sim.pair_by_angle`) to avoid crossings. Blend colour and size into the target style during convergence so nothing pops at the handoff.

## 3. 3D in 2D (`mk.space`)

- Point clouds on primitives: `fib_sphere(n)` gives directions, then `on_sphere`, `on_cube`, `on_convex(pyramid_planes())` or `on_torus`. All share indices, so morphing between shapes moves each point along its ray.
- Morph with a spatial **sweep** (delay by height, `0.14 × y01`). It reads as a scan, not a blend.
- Camera: `Camera(f=1250, dist=4.3, yaw, pitch)`. Snap rotations on beats with `SNAP`; idle yaw about 0.5 rad/s.
- Shade with `shade(cam.rotate(N), base_rgb)` (Lambert, specular and rim) and fog by depth (`depth_alpha`). These two together make points read as a solid.
- Add context: wireframe edges that draw on after a morph (`draw_edges`), a floor grid (`floor_grid`), an orbit ring. These give scale and space.
- Warp / fly-through: lower `dist` with `in_cubic` and draw streaks from the previous projection. End on a flash.

## 4. Patterns and op-art

- Concentric rings in two colours with offset centres plus multiply give moiré (`draw.rings`).
- Stripes scrolling at 300–420 px/s (`draw.stripes`) work as a rhythmic ground behind a knock-out disc.
- Grids of morphing shapes: `morph_pts(kind_a, kind_b, u, size)` with a diagonal ripple of `SNAP` steps on 8th notes.
- Halftone fields for print texture (`draw.halftone`).

## 5. Shape morphing

- Star-shaped outlines morph in polar form: `morph_pts("circle", "square", u, size)`. Kinds are circle, square, tri, squircle, ngon and star. Corners stay sharp at both ends.
- Arbitrary outlines: `resample(pts, n)` both to the same n by arc length, then interpolate.
- Text into a shape: sample glyph outlines into particles (above), or mask-reveal the next scene through glyphs (`transitions.mask_reveal`).

## 6. Performance

- Batch drawing: one stroke or fill per colour bucket, not per particle (≈ 50× faster).
- 6000 particles plus trails cost about 0.5 s per frame at 4 samples. 3D clouds about 0.4 s.
- Cache anything costly that does not depend on `t` (glyph outlines, shaped runs and layouts are cached automatically).
- Render in chunks (`python film.py chunks 0 12`). Each chunk is resumable, which matters on hosts with a per-command time limit.
