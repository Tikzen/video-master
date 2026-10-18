# Product Demo and Presentation Video

Load for product walkthroughs, launches, reports, pitch videos and dynamic
slide-like narratives. These are not MVs: communication hierarchy and verified
product/data truth take priority over beat-driven spectacle.

Default asks about style if absent; the agent owns content distillation,
page/scene design, narration, timing, animations, transitions and encoding.
Do not ask the user to manually author or animate every slide. In explicit
One-Sentence mode, infer the style and execute through delivery.

## Design

- Product demo: use the real product/UI/model/screenshots, map each verified
  feature to a showing scene, use zoom/focus/masks to reveal meaningful detail.
  Never invent a commercial product's controls or capabilities.
- Report: turn supplied documents/data into an ordered argument. Native
  scene elements (titles, bullets, charts, counters) animate within each page;
  pages transition as a coherent argument, not still slides stitched into a
  video. Keep chart axes/categories and repeated visual encodings stable when
  comparing values; let a chart mark, highlight rail, headline or focal zone
  carry into the next scene where that relationship is real.
- User-supplied PPTX can be a content source or rendered visual reference.
  Importing it does not preserve its native animations; reconstruct them in
  code and disclose that boundary.
- Preserve source data and units. Label any demonstration data; no invented
  KPIs. Use still/photo/video generation only where appropriate via the
  selected [image tools](image-tools.md).

## Runtime

The program builder is narration-driven: it derives page duration from real
speech or supplied per-page audio and otherwise invokes the selected TTS.
It is not the required authoring route. For an unvoiced/fixed-duration video,
a continuous scene or a more ambitious treatment, initialize the project and
author its `video.json`, `timeline.json` and deterministic scene code directly.
Use `scene: "composition"` or project-specific code, keeping the same workbench
control, renderer and validation contracts. Do not add unwanted narration or
change an approved duration to satisfy this helper.

The program builder accepts `genre: "report"` or `"product"`, `title`,
optional `accent`, and `pages`. Each page has `title`, `subtitle`,
`narration` (or supplied `audio`), and one scene layout:

- `type: "bullets"` with `bullets`: staggered entries.
- `type: "chart"` with `values`, `labels`, `unit`: animated bars and values.
- `type: "metrics"` with `metrics: [{value, unit, label}]`: counters.
- `type: "media"` with `media: {kind, src, title}`: actual local UI/product media.

```json
{
  "genre":"report","title":"项目汇报","accent":"#c94b3c",
  "pages":[
    {"type":"bullets","title":"本期进展","narration":"先看本期完成的三个环节。",
     "bullets":["需求与风格","代码场景与配音","编码检查与交付"]},
    {"type":"chart","title":"演示数据","subtitle":"示例数值，不是项目业绩",
     "narration":"柱形数据依次入场，数字跟随进度变化。",
     "values":[20,42,58,83],"labels":["一","二","三","四"],"footer":"示例数据"}
  ]
}
```

Run `node src/create-program.mjs --input program.json`, then the same render
and editor commands as the studio route. Per-page narration uses actual TTS
duration; scene/caption/audio bounds are frame-aligned. For optional backing
music, read [music-tools.md](music-tools.md); the builder reads the saved choice
or `program.music` and mixes it independently with narration and fades/ducking.
Add custom SVG/HTML/
Canvas/Three.js scenes when the confirmed design needs more than the included
layouts. Presets are executable baselines, not a reason to repeat one layout
for every project. The shared renderer supports scene-level `flow` and `iris`
transitions for presentation and product pages. The builder infers an organic
`flow` for report/product pages and a focal `iris` for product-media pages.
An Agent may author `transition: {type, duration_sec, direction, origin_x,
origin_y}` on a page to override the inference, or `transition: false` for a
deliberate hard cut. Treat these as rendering primitives: design each adjacent
pair around the content and preserve data/UI meaning. Avoid repeatedly moving
the entire page or repeating the same inferred mask. Use the builder for
timing/infrastructure, then replace or extend the scene choreography where it
does not fulfill the approved direction. A continuous evidence world, custom
product camera or semantic chart transformation can be preferable to pages;
these layouts and inferred transitions are not the available design limits.

QA each page's layout, animation midpoint, source data, narration and transition.
Final output is MP4 with editable code/timeline, not a PPTX or static PDF.

## Craft Upgrade (2026-10)

Read [craft/genre-presentation.md](../../references/craft/genre-presentation.md): one claim per page, reading-order reveals, fixed axes, labelled demo data.

**JS program builder** (same page types, better motion):
- Titles rise through a mask; subtitles fade up after them.
- Bullets enter one by one with slot reveals. Optional `active` index dims the others.
- Charts keep a **fixed axis** with nice ticks (optional `max`), bars pop in staggered with `backOut`, and value counters count up. Optional `highlight` index (default: last bar) gets the accent.
- Metrics count up with `expoOut`.
- Media pages rise in with a shadow.
- Optional `source` (or `footer`) shows provenance. Demo numbers must say so.

**Code film** (`init_code_film.py --genre present`, reference `assets/examples/code-film-present-launch`): use it for any of these:
- object handoffs between pages (bar → product window);
- value morphs between datasets on one axis;
- real-screenshot camera moves (`UIShot`) with cursor, clicks, spotlight and focus rings;
- odometers;
- a designed closing page.
