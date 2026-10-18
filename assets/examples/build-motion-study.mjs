#!/usr/bin/env node
// Original choreography example; generate a plan, then render it with create_music_video.py --plan.
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;
if (!output) throw new Error("Usage: node build-motion-study.mjs --output NEW-DIRECTORY");
const root = path.resolve(output);
await fs.mkdir(root, { recursive: true });
const planFile = path.join(root, "mv-plan.json");
try { await fs.access(planFile); throw new Error("Example output already exists; use a new directory"); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const C = { ink: "#101116", paper: "#f4f5f6", red: "#f54462", blue: "#82c9f4", dim: "#303844" };
const W = 1280, H = 720;
const k = (at, values, ease = "cubicInOut") => ({ at, ...values, ease });
const rect = (id, x, y, width, height, fill, extra = {}) => ({
  id, kind: "rect", width, height, fill, transform: { x, y }, ...extra,
});
const text = (id, value, x, y, size, color, extra = {}) => ({
  id, kind: "text", text: value, font_size: size, font_weight: 900,
  font_family: "Arial, sans-serif", color, transform: { x, y }, ...extra,
});
const line = (id, points, color, extra = {}) => ({
  id, kind: "path", points, stroke: color, stroke_width: 2, ...extra,
});
const group = (id, x, y, layers, keyframes = []) => ({
  id, kind: "group", transform: { x, y }, layers, keyframes,
});
const grid = (color = C.dim, spacing = 64) => [
  ...Array.from({ length: 27 }, (_, i) => line(`gx-${i}`, [[-240 + i * spacing, -300], [-240 + i * spacing, 1020]], color)),
  ...Array.from({ length: 22 }, (_, i) => line(`gy-${i}`, [[-300, -300 + i * spacing], [1600, -300 + i * spacing]], color)),
];
const back = (color) => rect("background", -1000, -1000, 3300, 2700, color);
const tag = (label, color = C.paper) => text("tag", label, 54, 38, 16, color, { font_weight: 500 });
const scene = (id, start, end, purpose, layers, camera, transition) => ({
  id, track_id: "scenes", kind: "scene", scene: "composition", title: purpose,
  start_sec: start, end_sec: end, canvas: { width: W, height: H }, layers, camera, transition,
  purpose, visual_job: purpose, review_times: [start + (end - start) * 0.3, start + (end - start) * 0.7],
});

await fs.mkdir(path.join(root, "assets"), { recursive: true });
const emblem = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="${C.ink}"/><g fill="none" stroke="${C.paper}" stroke-width="3"><path d="M240 32 448 160 386 404 94 404 32 160Z M240 32 94 404 448 160 32 160 386 404Z"/><circle cx="240" cy="240" r="126"/><path d="M240 32V448 M32 240H448"/></g><circle cx="240" cy="240" r="38" fill="${C.red}"/></svg>`;
await fs.writeFile(path.join(root, "assets/emblem.svg"), emblem);
const rings = (count, radius = 140, color = C.blue) => Array.from({ length: count }, (_, i) => ({
  id: `ring-${i}`, kind: "ellipse", width: (radius + i * 36) * 2, height: (radius + i * 36) * 2,
  fill: false, stroke: i % 3 ? color : C.red, stroke_width: i % 3 ? 2 : 5,
  transform: { x: -radius - i * 36, y: -radius - i * 36 },
}));
const contour = (kind, radius) => Array.from({ length: 32 }, (_, i) => {
  const angle = i / 32 * Math.PI * 2, cosine = Math.cos(angle), sine = Math.sin(angle);
  const distance = kind === "square" ? radius / Math.max(Math.abs(cosine), Math.abs(sine)) :
    kind === "star" ? radius * (0.8 + 0.27 * Math.cos(angle * 5)) : radius;
  return [cosine * distance, sine * distance];
});

const vertices = [[0, -195], [-180, -50], [-110, 150], [110, 150], [180, -50], [0, 20]];
const edges = [[0, 1], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]];
const buildLayers = edges.map(([a, b], i) => line(`edge-${i}`, [vertices[a], vertices[b]], i % 3 ? C.blue : C.paper, {
  stroke_width: i % 3 ? 2 : 4,
  keyframes: [k(0, { reveal: 0, x: (i % 2 ? -1 : 1) * 250, y: i * 12 - 60, rotation: i * 8 }),
    k(0.35 + i * 0.06, { x: 0, y: 0, rotation: 0, reveal: 1 }, "cubicOut")],
}));
const first = scene("assemble", 0, 2.5, "Separated edges assemble; camera commits to the center", [
  back(C.ink), ...grid(), tag("01 / ASSEMBLE"),
  text("outline", "SIGNAL", 56, 192, 148, C.paper, { stroke: C.paper, stroke_width: 1,
    keyframes: [k(0, { reveal: 0 }), k(0.9, { reveal: 0 }), k(1.5, { reveal: 1 })] }),
  group("wireform", 930, 365, buildLayers,
    [k(0, { rotation: -30, scale: 0.7 }), k(1.4, { rotation: 0, scale: 1 }), k(2.5, { x: 640, y: 360, scale: 2, rotation: 14 })]),
  text("caption", "FORM / FROM / FREQUENCY", 62, 575, 20, C.blue, { font_weight: 500,
    keyframes: [k(0, { opacity: 0, x: 62, y: 600 }), k(1.1, { opacity: 1, x: 62, y: 575 })] }),
], { keyframes: [k(0, { scale: 1 }), k(1.5, { scale: 1 }), k(2.5, { scale: 1.6, x: -170, rotation: -8 }, "cubicIn")] });

const fragments = Array.from("BREAK").map((char, i) => text(`char-${i}`, char, 170 + i * 194, 220, 230, i % 2 ? C.ink : C.red, {
  keyframes: [k(0, { x: 170 + i * 194, y: i % 2 ? -300 : 800, rotation: i % 2 ? 20 : -20, opacity: 0 }),
    k(0.2 + i * 0.07, { x: 170 + i * 194, y: 220, rotation: 0, opacity: 1 }, "cubicOut"),
    k(0.9, { x: 170 + i * 194, y: 220, rotation: 0 }),
    k(1.5, { x: 640 + (i - 2) * 390, y: 180 + (i % 2 ? -380 : 420), rotation: (i - 2) * 30, scale: 1.6 }, "cubicIn")],
}));
const burst = Array.from({ length: 20 }, (_, i) => {
  const a = i / 20 * Math.PI * 2;
  return rect(`chip-${i}`, 640, 360, 20 + i % 4 * 12, 6, i % 2 ? C.ink : C.red, {
    keyframes: [k(0, { x: 640, y: 360, opacity: 0, rotation: i * 18 }),
      k(0.5, { x: 640 + Math.cos(a) * 230, y: 360 + Math.sin(a) * 170, opacity: 1 }),
      k(1.5, { x: 640 + Math.cos(a) * 860, y: 360 + Math.sin(a) * 650, rotation: i * 18 + 90, opacity: 0 })],
  });
});
const second = scene("break", 2.5, 4, "Letters land separately and fracture into a radial exit", [
  back(C.paper), tag("02 / FRACTURE", C.ink), ...burst, ...fragments,
], { keyframes: [k(0, { scale: 1.3, rotation: -6 }), k(0.45, { scale: 1, rotation: 0 })] }, { type: "zoom", duration_sec: 0.15 });

const trace = [[-100, 550], [110, 550], [260, 240], [400, 480], [550, 180], [700, 420], [900, 120], [1400, 120]];
const traceWords = ["FOLLOW", "THE", "LINE"].map((word, i) => text(`follow-${i}`, word, 110 + i * 350, 290 - i * 55, 92, C.paper, {
  letter_reveal: true,
  keyframes: [k(0, { reveal: 0, y: 400 - i * 55 }), k(0.45 + i * 0.25, { reveal: 1, y: 290 - i * 55 }, "cubicOut"),
    k(1.2, { opacity: 1 }), k(2, { opacity: 0, x: -300 + i * 350 })],
}));
const third = scene("trace", 4, 6, "A drawn signal leads the eye through moving words", [
  back(C.ink), ...grid("#252933", 92), tag("03 / TRACE"),
  line("signal", trace, C.red, { stroke_width: 8, keyframes: [k(0, { reveal: 0 }), k(1.4, { reveal: 1 }, "linear")] }),
  ...traceWords,
  rect("cursor", 0, 0, 18, 18, C.blue, { keyframes: trace.map(([x, y], i) => k(i / (trace.length - 1) * 1.8, { x, y, rotation: i * 45 }, "linear")) }),
], { keyframes: [k(0, { x: 60, scale: 0.95, rotation: 5 }), k(2, { x: -200, y: 50, scale: 1.3, rotation: -5 })] }, { type: "push", direction: "up", duration_sec: 0.2 });

const fourth = scene("focus", 6, 8, "Layered graphic panels collapse into a focused emblem", [
  back(C.paper), tag("04 / FOCUS", C.ink),
  ...Array.from({ length: 5 }, (_, i) => group(`panel-${i}`, 300 + i * 150, 140 + i * 45, [
    rect("sheet", 0, 0, 340, 340, i % 2 ? C.blue : C.red),
    { id: "asset", kind: "image", src: "assets/emblem.svg", width: 300, height: 300, transform: { x: 20, y: 20 } },
  ], [k(0, { x: -650 + i * 220, y: 180 + i * 45, rotation: -18 + i * 8, opacity: 0 }),
    k(0.3 + i * 0.09, { x: 300 + i * 150, y: 140 + i * 45, rotation: -18 + i * 8, opacity: 1 }, "cubicOut"),
    k(1.1, { x: 470, y: 180, rotation: 0, scale: 1 }),
    k(2, { x: -160, y: -260, scale: 4.5, rotation: 22 }, "cubicIn")])),
  text("focus", "FOCUS", 70, 570, 96, C.ink, {
    keyframes: [k(0, { reveal: 0 }), k(0.7, { reveal: 1 }), k(1.5, { opacity: 1 }), k(2, { opacity: 0, y: 800 })],
  }),
], { keyframes: [k(0, { scale: 1 }), k(2, { scale: 1.2, rotation: -8 })] }, { type: "wipe", direction: "left", duration_sec: 0.16 });

const contours = Array.from({ length: 33 }, (_, i) => {
  const points = Array.from({ length: 80 }, (_, j) => {
    const x = j * 25 - 300, wave = Math.sin(j * 0.16 + i * 0.1) * 48 + Math.cos(j * 0.28 - i * 0.08) * 28;
    return [x, 60 + i * 22 + wave * (0.6 + i / 24)];
  });
  return line(`terrain-${i}`, points, i % 6 ? C.blue : C.paper, {
    stroke_width: i % 6 ? 1.4 : 3,
    keyframes: [k(0, { x: i * 5, y: 100, reveal: 0 }), k(0.5 + i * 0.016, { reveal: 1, y: 0 }, "cubicOut"),
      k(2.5, { x: -260 + i * 3, y: -70 + i * 2 })],
  });
});
const fifth = scene("landscape", 8, 10.5, "Camera traverses a multi-line field while type changes hierarchy", [
  back(C.ink), group("field", 0, 0, contours),
  text("over", "OVER", 100, 100, 168, C.paper, {
    stroke: C.paper, stroke_width: 1, keyframes: [k(0, { reveal: 0, x: -500 }), k(0.8, { reveal: 1, x: 100 }),
      k(2.5, { x: 600, y: -100, rotation: -12, scale: 1.5 })],
  }),
  text("under", "UNDER", 480, 430, 164, C.red, {
    keyframes: [k(0, { opacity: 0, y: 800 }), k(1.15, { opacity: 1, y: 430 }, "cubicOut"),
      k(2.5, { x: 100, y: 300, rotation: 8 })],
  }), tag("05 / TRAVERSE"),
], { keyframes: [k(0, { scale: 1.3, rotation: 12, y: 70 }), k(1.1, { scale: 1, rotation: -7 }),
  k(2.5, { scale: 1.35, x: 80, y: -120, rotation: -16 })] }, { type: "zoom", duration_sec: 0.18 });

const tiles = Array.from({ length: 12 }, (_, i) => {
  const x = i % 4 * 320, y = Math.floor(i / 4) * 240;
  return group(`tile-${i}`, x, y, [
    rect("paper", 0, 0, 320, 240, [C.paper, C.red, C.blue][i % 3]),
    { id: "emblem", kind: "image", src: "assets/emblem.svg", width: 180, height: 180, transform: { x: 70, y: 30 },
      keyframes: [k(0, { rotation: -45, scale: 0.2 }), k(0.4 + i * 0.025, { rotation: 0, scale: 1 }, "cubicOut"),
        k(2, { rotation: i % 2 ? 90 : -90, scale: 1.3 })] },
  ], [k(0, { x: x + (i % 2 ? 1280 : -1280), y }), k(0.25 + i * 0.05, { x, y }, "cubicOut"),
    k(1.25, { x, y }), k(2, { x: 640 + (x - 640) * 3, y: 360 + (y - 360) * 3, rotation: i % 2 ? 25 : -25 }, "cubicIn")]);
});
const sixth = scene("multiply", 10.5, 12.5, "Independent panels cascade, pivot and open a central space", [
  back(C.ink), ...tiles,
  text("multiple", "MULTIPLY", 640, 280, 150, C.paper, { align: "center", stroke: C.ink, stroke_width: 6,
    keyframes: [k(0, { opacity: 0, scale: 0.4, x: 640, y: 280 }), k(0.8, { opacity: 1, scale: 1, x: 640, y: 280 }, "cubicOut"),
      k(2, { scale: 1.4, x: 640, y: 230 })] }),
], { keyframes: [k(0, { rotation: -5, scale: 1.08 }), k(2, { rotation: 6, scale: 1.2 })] }, { type: "push", direction: "left", duration_sec: 0.16 });

const finale = scene("reform", 12.5, 15, "Scattered pieces gather into a stable final composition", [
  back(C.ink), ...grid("#252933", 80),
  group("morphs", 640, 360, Array.from({ length: 7 }, (_, i) => ({
    id: `contour-${i}`, kind: "path", points: contour("square", 140 + i * 22),
    closed: true, stroke: i % 2 ? C.blue : C.red, stroke_width: i % 2 ? 1.5 : 3,
    keyframes: [k(0, { opacity: 0.5, rotation: 20 + i * 4 }), k(0.7, { opacity: 0.75, rotation: 0 }),
      k(2, { opacity: 0.2, rotation: -15 - i * 3 })],
    point_keyframes: [{ at: 0, points: contour("square", 140 + i * 22) },
      { at: 0.7, points: contour("star", 140 + i * 22), ease: "cubicInOut" },
      { at: 1.5, points: contour("circle", 140 + i * 22), ease: "cubicInOut" }],
  }))),
  group("orbits", 640, 360, rings(6, 70), [k(0, { scale: 3, rotation: -80 }), k(0.65, { scale: 1, rotation: 0 }, "cubicOut"),
    k(2.5, { rotation: 30, scale: 1.12 })]),
  ...["RE", "FORM"].map((word, i) => text(`word-${i}`, word, i ? 680 : 380, 270, 150, i ? C.paper : C.red, {
    keyframes: [k(0, { x: i ? 1400 : -600, y: i ? 650 : -300, rotation: i ? 30 : -30, scale: 0.7 }),
      k(0.6 + i * 0.12, { x: i ? 680 : 380, y: 270, rotation: 0, scale: 1 }, "cubicOut"),
      k(2.5, { x: i ? 680 : 380, y: 270, rotation: 0, scale: 1 })],
  })),
  text("ending", "SIGNAL BECOMES FORM", 640, 520, 24, C.blue, { align: "center", font_weight: 500,
    keyframes: [k(0, { reveal: 0 }), k(0.8, { reveal: 0 }), k(1.3, { reveal: 1 })] }),
  tag("07 / RECOMPOSE"),
], { keyframes: [k(0, { scale: 1.2, rotation: -4 }), k(0.8, { scale: 1, rotation: 0 }), k(2.5, { scale: 1.04 })] },
{ type: "dissolve", duration_sec: 0.12 });

const plan = { schema: "video-master.mv-plan.v1",
  project: { name: "Signal to Form / Original Motion Study", width: W, height: H, fps: 60, duration_seconds: 15 },
  design: { title: "SIGNAL / TO / FORM", palette: [C.paper, C.ink, C.red, C.blue] },
  cues: [first, second, third, fourth, fifth, sixth, finale],
  sound_events: [
    { id: "assembled", at_sec: 0.5, type: "tick", gain: 0.4 },
    { id: "lock", at_sec: 1, type: "hit", gain: 0.4 },
    { id: "break", at_sec: 2.5, type: "hit", gain: 0.8 },
    { id: "trace", at_sec: 4, type: "whoosh", duration_sec: 0.3, gain: 0.5, pan: -0.3 },
    { id: "focus", at_sec: 6, type: "hit", gain: 0.6 },
    { id: "push", at_sec: 7.5, type: "whoosh", duration_sec: 0.5, gain: 0.5, pan: 0.3 },
    { id: "field", at_sec: 8, type: "tick", gain: 0.6 },
    { id: "panels", at_sec: 10.5, type: "hit", gain: 0.7 },
    { id: "expand", at_sec: 12, type: "whoosh", duration_sec: 0.5, gain: 0.45 },
    { id: "form", at_sec: 13, type: "hit", gain: 0.6 },
  ],
  provenance: { visuals: "Original code geometry and SVG; no reference footage, lyrics, characters or music reused." },
};
await fs.writeFile(planFile, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ plan: planFile, scenes: plan.cues.length, duration_seconds: 15, fps: 60 }));
