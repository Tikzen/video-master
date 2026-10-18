# Visual Design Playbook

Read when a brief asks for richer art direction, lighting, surfaces, colour,
kinetic type or a less slide-like finish. This is a toolkit, not a visual
template. Pick a few mechanisms that reinforce the approved subject and genre;
do not add every effect to every shot.

## Design From Focus Outward

Before styling, name the focal subject and the event the viewer should notice.
Use these design criteria together, not as a mandatory construction order:

1. **Value structure:** separate the focal subject, support and environment by
   lightness before adding hue. Reserve the strongest local contrast for the
   focal event; keep backgrounds and secondary motion quieter.
2. **Palette roles:** assign a base/environment, text, action accent and
   atmosphere role. Accent colour should mark an action, state change, route,
   or key word, rather than appear on every object.
3. **Lighting:** place a few motivated sources. A key light establishes the
   focal plane; rim light separates silhouettes; fill light preserves detail.
   Code beams from tapered polygons with soft gradients, or overlap broad,
   low-opacity radial fields. Add small bright cores only where an event lands.
4. **Depth cues:** combine converging perspective lines, scale falloff,
   foreground occlusion, parallax groups, controlled extrusion and changing
   focus. A graphic can look convincingly dimensional without physical
   simulation or a 3D engine.
5. **Surface cues:** use a narrow highlight band and darker extrusion for
   metal; tint, edge rim and a moving sheen for stylized glass; a radial
   gradient and sparse particles for atmosphere. These are visual shorthand,
   not optical material simulation.

Use different colour families when the brief supports them. Keep the number
of dominant hues small, and build richness from value, saturation, scale,
edge treatment and layer depth rather than adding unrelated neon colours.

## Light, Texture, and Compositing

The executable composition renderer shares these `material` recipes between
preview and export:

```json
{
  "material": {
    "gradient": {
      "type": "linear",
      "angle_deg": -24,
      "stops": [
        {"offset": 0, "color": "#ecfbff"},
        {"offset": 0.45, "color": "#66e8ff"},
        {"offset": 1, "color": "#9a79ff"}
      ]
    },
    "glow": {"color": "#66e8ff", "blur": 22, "opacity": 0.65},
    "extrusion": {"color": "#161b35", "distance": 10, "angle_deg": 45, "steps": 4},
    "blend": "screen"
  }
}
```

- `gradient.type` is `linear` (default) or `radial`. Radial gradients support
  normalized `center_x`, `center_y`, and `radius`; gradients on SVG path data
  require explicit `bounds`. Stops are ordered, strictly increasing hex-color
  entries. A gradient replaces the layer's ordinary fill.
- `glow.blur` is limited to 0-64 renderer units. Glow uses Canvas shadow blur;
  keep it on a few small/emissive layers because broad high-resolution blur can
  be expensive and can erase edge contrast.
- `extrusion` draws a bounded stack of offset shape/text/path copies. It is a
  2.5D graphic treatment, not perspective geometry. Limit it to hero type,
  badges or faceted shapes; avoid thick depth on dense copy.
- `blend` currently accepts `source-over`, `screen`, `lighter`, `multiply`,
  `overlay`, and `soft-light`. Keep additive blends (`screen`/`lighter`) to
  light, sparks and glints so they do not wash out text.
- `glass` is supported only on rectangles and ellipses. It layers tint,
  translucent sheen and a rim; use child shapes/keyframes for a moving sweep.
  It does not sample or refract the background. Label it as stylized when
  realism could be mistaken for a real product/material claim.
- Use layered geometry for scanlines, grids, hatching, halftone, dust and
  chromatic accents. Derive positions from a stable seed or authored arrays
  and absolute timeline time; never call unseeded random or accumulate state
  during render.

Simple light recipe: a broad transparent radial field behind the subject, a
tapered translucent beam or path, a small high-opacity core, and one or two
low-contrast particles. Animate the beam/core in response to a real beat, word,
camera move or state change. Keep the light source behind text unless light
itself is the focal event.

Simple metal/glass recipe: give the silhouette a darker offset/extrusion; use
a gradient for the body; draw a thin bright rim; sweep one narrow transparent
highlight using the ordinary layer keyframes. Keep separate highlight layers
masked to the surface. Do not claim a new material property merely because
the graphic looks glossy.

## Kinetic Type and Shot Changes

Treat words as visual actors, but preserve a readable landing:

- Split a headline into words or short phrases when they need separate
  direction, scale, rotation, reveal, outline or depth. Animate the semantic
  verb: "open" can part layers, "connect" can draw a path, "expand" can move
  from a small point to a wide field.
- Give incoming type an anticipation or clear direction, a readable arrival,
  and a purposeful exit or transformation. Stagger related parts; do not
  make every glyph bounce, glow and rotate simultaneously.
- A light sweep may reveal a word, a word may become a mask/window, or a line
  may carry attention to the next shot. Prefer a transition with a visible
  relationship to the previous shot over an unrelated decorative wipe.
- For information-led video, keep labels, units and key claims stable long
  enough to read. Use motion to show correspondence or change, not to obscure
  values. For a sung or spoken line, accent only the current phrase or stressed
  word and leave quieter intervals for comprehension.

For analytics, sales figures or changing diagrams, preserve object identity,
ordering and a visible mapping between old and new states when those
relationships matter. Research on animated statistical graphics found that
appropriate transitions can aid graphical perception, but that is not a
license to animate every fact or to imply causal change absent from the data.

## Genre Recipes

These are starting points; adapt or discard them to match the user's confirmed
direction. The Agent may choose a different material vocabulary, palette,
renderer or motion grammar when it better expresses the brief. The table does
not restrict a genre to the effects shown here.

| Direction | Useful code grammar | Keep in check |
|---|---|---|
| Industrial/sci-fi kinetic type | Dark value field, perspective rails, capsule outlines, orange/cool emissive accents, dense supporting microtype, one lit path, off-axis oversized words, fast focus changes | Keep a small number of legible hero phrases; let microtype remain texture rather than false evidence |
| Music-video passage | Layered symbols/cutouts/type, light sources that answer the beat or lyric, objects that assemble/split, camera travel through depth, impact accents followed by a quieter hold | Beat-synced shake is an accent, not the scene action |
| Studio explanation | Stable stage and host safe zone, restrained rim/key light, depth/parallax in set dressing, clear push into an evidence screen, host inset outside the data area | Keep the host away from subtitles, callouts and key evidence |
| Product showcase | Product silhouette/value contrast first, rim highlights on actual edges, animated focus/macro, interface state or feature callout connected to its real location, readable before/after | Use approved product imagery/claims; don't let invented reflections or UI imply unavailable capabilities |
| Report/presentation video | One information hierarchy, staggered reveals, selective focus, data-driven bars/paths, stable axes/labels, shared-object transitions | Every page should have a visual event, not just a different heading and background |

## Accessibility and Review

- Keep text contrast comfortably high over the moving background. WCAG contrast
  ratios are a useful conservative check for essential on-screen copy (normal
  text 4.5:1, large text 3:1); video is not thereby certified WCAG-conformant.
- Treat a 5% inset from each canvas edge as the default safe area for essential
  titles, subtitles, labels and product evidence. Measure actual rendered text
  at output size; include its font width, line height, stroke/glow allowance,
  parent transforms, camera motion and spring overshoot. An intentional
  transition may carry content beyond frame only after its reading/action beat
  is complete. Give moving or rotating backgrounds sufficient overscan to cover
  the viewport at every authored transform; no unintended black/transparent
  wedges may appear at frame edges.
- Avoid repeated full-screen flashes. Keep animation below the WCAG three-flash
  threshold or use an applicable safe-area alternative. Prefer a directional
  light sweep, scale change or short glow pulse over alternating the whole
  canvas between high-contrast states.
- Do not put a face, character, glow core or bright particle field over a
  subtitle, data label or essential UI. Check compositions at delivery size,
  not only enlarged preview. Studio hosts keep a dedicated clear zone for
  subtitles and evidence screens; during a screen push, move the host to an
  intentional inset or remove it instead of leaving it over the data area.
- Design the final active frame separately from the exit transition. Keep the
  resolved end card or last evidence state stable and readable through the end;
  check `duration - 1/fps` rather than assuming the last keyframe looks correct.
- Review representative action peaks and quiet holds. Check that glow retains
  a crisp source edge, type is readable after motion settles, layers have
  purposeful depth, and no decorative effect competes with the focal event.
- If playback, accessibility, source evidence or audience comprehension was
  not tested, state that boundary instead of treating a strong still frame as
  proof of quality.

## Sources and Limits

The playbook converts the following sources into practical direction; it does
not copy their implementation or claim that they validate a specific style:

- [Material Design: Understanding motion](https://m2.material.io/design/motion/understanding-motion.html)
  and [Choreography](https://m1.material.io/motion/choreography.html):
  motion can clarify focus, hierarchy, relationships and continuity.
- Heer and Robertson, [Animated Transitions in Statistical Data Graphics](https://doi.org/10.1145/1275808.1276396),
  IEEE TVCG 13(6), 2007: controlled studies of transitions in statistical
  graphics; findings apply to data graphics, not all video genres.
- Lee and Park, [What drives the learning benefits of moving text?](https://doi.org/10.1057/s41599-023-01646-6),
  Humanities and Social Sciences Communications 10, 2023: a theory paper on
  kinetic typography in instructional design, not a universal readability law.
- W3C [Filter Effects Module](https://www.w3.org/TR/filter-effects-1/):
  describes blur, compositing, lighting and turbulence primitives. The current
  Canvas renderer implements only the bounded recipes documented above; the
  rest require project-specific code and cross-browser/export validation.
- W3C [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  and [three flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html):
  accessibility reference points for essential text and flashing content.
- MDN Canvas references:
  [gradients](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient),
  [radial gradients](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createRadialGradient),
  [shadow blur](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur),
  and [compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
