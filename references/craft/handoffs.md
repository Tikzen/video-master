# Handoffs — how one chapter becomes the next

Earlier Video Master outputs failed here most visibly ("直接下一页": every scene was a new page).
The fix is a habit, not a transition library: **the final state of A causes or *is* the first
state of B.**

## 1. The handoff column

Every storyboard row has a **handoff out** cell stating *object · position · size · colour*.
The next chapter must start from exactly those values: import the constants, don't eyeball them.

| Out of | Object carried | Into | Exact match |
|---|---|---|---|
| POINT | the red dot fires right; its trail is the line | LINE | dot Ø 36 px → line 8 px at y = 540 |
| LINE | stripes thicken into a paper plane; the red line shrinks to a segment | PLANE | segment 280 × 8 at centre → square extrudes from it |
| PLANE | the square grows to the frame | TYPE | square rect → full frame (red ground) |
| TYPE | the full stop *is* the point; it detonates | FLOW | shock ring origin = period centre |
| DATA | the highlighted bar | PRODUCT | `bar_rect(3)` morphs to the UI window rect |
| PRODUCT | camera dives into the render button | CLOSE | button fills frame = accent ground |

## 2. Mechanisms, in order of preference

1. **Object becomes object.** The same thing changes role: dot → line, bar → window, period → explosion origin, square → frame.
2. **Shape grows to frame.** An element scales until it *is* the next background. Other elements get pushed out physically.
3. **Camera dives / pulls.** Push through an aperture, a screen or a button. Pull back to reveal context. With motion blur.
4. **Matched silhouette or position.** Something with the same shape, place or colour is waiting on the other side of a cut.
5. **Event-origin wipe.** A shock ring or iris expands from where the action happened, not from the screen centre by default.
6. **Live two-scene transitions** (`mk.transitions`: iris, diagonal_wipe, tile_flip, slices, push, mask_reveal). Both scenes keep moving. Use these for montage sections or when no object can carry the cut.
7. **Deliberate hard cut** on a downbeat or speech start. Honest and often the best choice in studio and data pieces. Declare it with `film.cut(t)` so `diff` doesn't flag it.
8. **Crossfade.** Almost never; it reads as indecision.

## 3. Rules

- **Nothing freezes.** The outgoing scene keeps animating during the handoff (the old JS compositor froze it; motionkit transitions don't).
- **Match exactly.** A jump of even 10–40 px at a seam reads as a glitch. Share constants (e.g. `CHART_BASE`, `UI_FRAME`, `period_center()`) between chapters.
- **Background systems change too.** If A has a gradient or bokeh and B has a plain ground, crossfade the *background* during the handoff. Otherwise `diff` shows a pop.
- **Vary the mechanism.** In a 6–8 chapter film use 4+ different mechanisms. The same wipe every time recreates PowerPoint.
- **Data and UI keep meaning.** Axes, category order and product identity never jump. Only the thing that changes moves.
- **Studio:** consecutive lines in the same shot don't need transitions. Screen visits are camera moves into the real screen plane, with the speaker kept as a PIP.

## 4. Implementation patterns (motionkit)

```python
# shared geometry lives at module level so both chapters read the same numbers
CHART_BASE = (x0, 798, x1, 802)
...
hand = io_expo(prog(t, ev["bar_handoff"], ev["bar_handoff"] + 0.55))
x0, y0, x1, y1 = pr.morph_rect(BAR0, CHART_BASE, hand)        # object becomes object

r = tr.grow_rect(square_rect, e, W, H)                         # shape grows to frame

tr.iris(ctx, lambda c: card_a(c, t), lambda c: card_b(c, t), u, origin=period_xy, w=W, h=H,
        ring=(PAPER, 0.9))                                     # event-origin wipe, both live

tr.iris_close(ctx, lambda c: card_d(c, t), e, (CX, CY), 1150, 18, INK, fill=RED, rot=-0.6)  # implode to a dot
```

Give every fast handoff a motion-blur window: `film.blur(windows=[(t0, t1, 10)])`.

## 5. Verify

- `python film.py diff`: every flagged frame is a declared cut or a known fast transition. Investigate anything else (it is usually a state mismatch).
- Render a dense strip around each seam (`sheet T-0.3 T+0.3 12`) and check that the carried object is continuous.
