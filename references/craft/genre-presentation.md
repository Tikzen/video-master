# Genre: Presentation (演示) — product demos, launches, data reports

Reference: `assets/examples/code-film-present-launch` (16 s: title → chart morph → product UI →
close). Communication first: every page makes **one claim**, the visual proves it, motion
reveals it in reading order, and the next page grows out of this one.

## 1. Page anatomy (reading order = animation order)

1. **Kicker** (small caps label + accent bar): the context. Enters first, 0.35 s.
2. **Title:** the claim, as a sentence ("每支片子平均人工修改次数" or better "返工减少 78%"). Slot reveal, line by line.
3. **Evidence:** a chart, a number, a UI region or a bullet list. Enters after the title settles (≈ 0.3–0.5 s).
4. **Takeaway mark:** highlight, delta badge or callout. On the beat or the narration word that names it.
5. **Source note:** small mono line. Real data: the source. Demo data: "示例数据".

Hold the finished page ≥ 1.5 s (or the narration length) before handing off.

## 2. Layout

- `present.Layout(W, H)`: 12 columns, 7 % margins, 5 % safe area, `rem` = H/36 for sizes.
- Left-align text to one column edge across all pages. A consistent left edge is the cheapest professional signal.
- Size hierarchy: title 2.6 rem, subtitle 1.0–1.2 rem, labels 0.55–0.8 rem.
- Use the empty half deliberately: a hero numeral, the product, or the chart. Never leave it empty by accident.

## 3. Data honesty in motion

- **The axis never moves** between states. Create one `BarChart`/`LineChart` with fixed `vmax` and ticks, and morph only the values (`prev=..., t_change=...`).
- Highlight the one value the claim is about (accent); the others stay muted (support).
- Counters end exactly on the true value with units; `odometer` for hero numbers.
- No 3D tilts, no perspective distortion, no truncated axes that exaggerate. Label any demo data on screen.
- Units and decimals are consistent between the bars, the labels and the narration.

## 4. Product UI

- Use real screenshots or recordings: `UIShot("assets/ui/screen.png")`. Never invent a real product's controls. A code-drawn mock is acceptable for a concept demo **only** when labelled ("界面为示意").
- The camera eases between focus rectangles (`focus_at(t, [(t, rect), ...])`): full UI → region → control, 0.8–1.2 s per move, `io_cubic`.
- Keep the cursor in UI space and map it through the camera (`to_frame`) so it stays on target while zooming. Paths arc (`cursor_path`), clicks get a ripple and a pressed state, and the UI responds (state change) 0.1 s later.
- Direct attention with `spotlight` (dim 0.4–0.6) and `focus_ring` after the click, not before.
- Device chrome (`chrome="browser"`, `phone_bezel`) and a soft shadow make a screenshot feel like a product.

## 5. Handoffs between pages

Pick one per boundary (see [handoffs.md](handoffs.md)):
- the title's accent bar → the chart baseline;
- the highlighted bar → the product window;
- a UI button → the full-frame colour of the next page (dive);
- a number → the next headline;
- a chart region → the zoomed detail chart, with axes kept consistent.

No whole-page slides. A deliberate cut is fine between sections whose topics differ.

## 6. Sound

Confirm actions: `ui_pop` on value changes and badges, `mouse_click` + pop on clicks, a soft
whoosh on handoffs, an optional light pulse (half-time hats, sparse kick). One boom at most, on
the close. Narration ducks the music (RMS ≈ −15 to −16).

## 7. Review focus

- Every page: kicker → title → evidence → takeaway → source all visible and readable at the hold.
- Chart frames before and after the morph: axis identical, values correct, the highlight on the right bar.
- UI frames: the cursor exactly on the control at click time; no invented UI; labels present.
- Diff: the handoff seams are continuous (shared rect constants).
