#!/usr/bin/env node
// Original code-only study for gradients, compositing, light and stylized depth.
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;
if (!output) throw new Error("Usage: node build-material-study.mjs --output NEW-DIRECTORY");
const root = path.resolve(output);
await fs.mkdir(root, { recursive: true });
const planFile = path.join(root, "mv-plan.json");
try { await fs.access(planFile); throw new Error("Example output already exists; use a new directory"); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const C = {
  ink: "#080a10", deep: "#111622", paper: "#f5f3ef",
  orange: "#ff6538", amber: "#ffbd68", cyan: "#66e8ff", violet: "#9a79ff",
  dim: "#222a35", shadow: "#25111a",
};
const W = 1280, H = 720;
const k = (at, values, ease = "cubicInOut") => ({ at, ...values, ease });
const rect = (id, x, y, width, height, fill, extra = {}) => ({
  id, kind: "rect", width, height, fill, transform: { x, y }, ...extra,
});
const ellipse = (id, x, y, width, height, fill, extra = {}) => ({
  id, kind: "ellipse", width, height, fill, transform: { x, y }, ...extra,
});
const text = (id, value, x, y, size, color, extra = {}) => ({
  id, kind: "text", text: value, font_size: size, font_weight: 900,
  font_family: "Arial, sans-serif", color, transform: { x, y }, ...extra,
});
const line = (id, points, color, extra = {}) => ({
  id, kind: "path", points, stroke: color, stroke_width: 2, ...extra,
});
const closedPath = (id, points, fill, extra = {}) => ({
  id, kind: "path", points, closed: true, fill, stroke: false, ...extra,
});
const background = () => rect("background", 0, 0, W, H, C.ink);
const label = (value, color = C.paper) => text("section-label", value, 112, 54, 17, color, { font_weight: 600 });
const vignette = ellipse("vignette", 0, 0, W, H, "#00000000", {
  material: { gradient: { type: "radial", center_x: 0.5, center_y: 0.46, radius: 0.83,
    stops: [{ offset: 0.58, color: "#00000000" }, { offset: 1, color: "#020309d8" }] } },
});
const scene = (id, start, end, purpose, layers, camera, transition) => ({
  id, kind: "scene", scene: "composition", track_id: "scenes",
  title: purpose, start_sec: start, end_sec: end, canvas: { width: W, height: H },
  layers, camera, transition, purpose, visual_job: purpose,
  review_times: [start + 0.5, end - 0.5],
});

const floorLines = Array.from({ length: 15 }, (_, index) => {
  const x = index * 120 - 260;
  return line(`floor-ray-${index}`, [[640, 260], [x, 780]], index % 3 ? C.dim : "#3b2a2b", {
    stroke_width: index % 3 ? 1 : 2,
  });
});
const horizonLines = Array.from({ length: 9 }, (_, index) => {
  const y = 274 + index ** 1.65 * 9;
  return line(`depth-line-${index}`, [[0, y], [W, y]], index % 3 ? "#18202b" : "#43251f", {
    stroke_width: index % 3 ? 1 : 2,
  });
});
const capsules = Array.from({ length: 7 }, (_, index) => {
  const width = 330 + index * 115, height = 62 + index * 48;
  const x = (W - width) / 2, y = 278 - index * 40;
  const points = [
    [x + height / 2, y], [x + width - height / 2, y],
    [x + width, y + height / 2], [x + width - height / 2, y + height],
    [x + height / 2, y + height], [x, y + height / 2],
    [x + height / 2, y],
  ];
  return line(`capsule-rail-${index}`, points, index % 2 ? "#f8b79e" : C.orange, {
    stroke_width: index === 0 ? 5 : 2,
    material: { glow: { color: C.orange, blur: index === 0 ? 22 : 9, opacity: index === 0 ? 0.9 : 0.5 } },
    keyframes: [k(0, { scale: 0.72 + index * 0.04, opacity: 0.12 + index * 0.08, y: 65 }),
      k(1.1, { scale: 1, opacity: 0.7 + index * 0.04, y: 0 }, "cubicOut"),
      k(3, { scale: 1.12 + index * 0.1, opacity: 0.1, y: -120 })],
  });
});
const sparks = Array.from({ length: 32 }, (_, index) => {
  const x = (index * 197 + 83) % W, y = 210 + (index * 83) % 440;
  const size = 2 + index % 3;
  return ellipse(`ember-${index}`, x, y, size, size, index % 4 ? C.amber : C.paper, {
    material: { glow: { color: C.orange, blur: 10, opacity: 0.8 } },
    keyframes: [k(0, { opacity: 0.1, x: x - 12, y: y + 24 }),
      k(1.2, { opacity: index % 2 ? 0.9 : 0.4, x, y }),
      k(3, { opacity: 0.08, x: x + 35, y: y - 110 })],
  });
});
const fuse = line("traveling-hotline", [[120, 500], [350, 500], [460, 350], [640, 430], [820, 275], [1160, 275]],
  C.amber, { stroke_width: 5, keyframes: [k(0, { reveal: 0 }), k(1.35, { reveal: 1 }, "cubicOut")] });
const title = text("hero-type", "LIGHT / IN MOTION", 112, 148, 96, C.paper, {
  material: { gradient: { angle_deg: 0, stops: [{ offset: 0, color: C.paper }, { offset: 0.72, color: "#ffc2a1" }, { offset: 1, color: C.orange }] },
    glow: { color: C.orange, blur: 26, opacity: 0.65 },
    extrusion: { color: C.shadow, distance: 12, angle_deg: 48, steps: 5 } },
  keyframes: [k(0, { opacity: 0, x: -360, y: 155, rotation: -8 }),
    k(0.48, { opacity: 1, x: 112, y: 148, rotation: 0 }, "cubicOut"),
    k(2.4, { opacity: 1, x: 112, y: 148 }),
    k(3, { opacity: 0, x: -260, y: 110, scale: 1.08, rotation: -6 })],
});
const tunnel = scene("kinetic-tunnel", 0, 3, "Perspective rails, ember points and a traced light lead into bold kinetic type", [
  background(), ...floorLines, ...horizonLines,
  ellipse("warm-falloff", 420, 180, 440, 480, "#10080800", {
    material: { gradient: { type: "radial", center_x: 0.5, center_y: 0.5, radius: 0.72,
      stops: [{ offset: 0, color: "#ff5a263b" }, { offset: 1, color: "#ff5a2600" }] },
      blend: "screen" },
  }),
  ...capsules, ...sparks, fuse, title,
  text("subline", "A CODE-RENDERED LIGHT STUDY", 112, 286, 18, C.amber, {
    font_weight: 600, keyframes: [k(0, { opacity: 0, y: 320 }), k(0.9, { opacity: 1, x: 112, y: 286 }, "cubicOut"),
      k(2.4, { opacity: 1 }), k(3, { opacity: 0, x: 200 })],
  }),
  vignette,
], { keyframes: [k(0, { scale: 1.08 }), k(2.5, { scale: 1.04, x: -5, y: 4 }), k(3, { scale: 1.08, x: 5, y: -4 })] });

const glassCards = Array.from({ length: 3 }, (_, index) => {
  const width = 286, height = 356, x = 184 + index * 306, y = 188 + (index === 1 ? -42 : 24);
  const tint = [C.cyan, C.violet, C.orange][index];
  return {
    id: `glass-card-${index}`, kind: "group", transform: { x, y },
    mask: { kind: "rect", x: 0, y: 0, width, height },
    keyframes: [k(0, { y: y + 130, rotation: (index - 1) * 14, opacity: 0, scale: 0.78 }),
      k(0.55 + index * 0.14, { y, rotation: (index - 1) * 6, opacity: 1, scale: 1 }, "cubicOut"),
      k(2.65, { y: y - 55, rotation: (index - 1) * -9, scale: 1.06, opacity: 0.3 })],
    layers: [
      rect("back-plate", 0, 0, width, height, "#101724", {
        material: { glass: { tint, opacity: 0.3, rim: "#ecfbff", rim_width: 2, sheen: 0.23, sheen_offset: 0.34, angle_deg: -42 },
          extrusion: { color: "#141725", distance: 12, angle_deg: 45, steps: 4 },
          glow: { color: tint, blur: 28, opacity: 0.34 }, blend: "screen" },
      }),
      closedPath("facet", [[16, 18], [width - 22, 18], [width - 56, 98], [38, 98]], "#ffffff14"),
      line("edge-trace", [[18, height - 48], [width - 26, height - 48]], tint, {
        stroke_width: 3, material: { glow: { color: tint, blur: 16, opacity: 0.8 } },
      }),
      rect("moving-sheen", -90, 0, 62, height, "#ffffff", {
        material: {
          gradient: { angle_deg: 0, stops: [
            { offset: 0, color: "#ffffff00" }, { offset: 0.36, color: "#ffffff18" },
            { offset: 0.54, color: "#ffffffc0" }, { offset: 0.68, color: "#ffffff24" },
            { offset: 1, color: "#ffffff00" },
          ] },
          glow: { color: "#e9fbff", blur: 12, opacity: 0.28 },
          blend: "screen",
        },
        keyframes: [k(0, { x: -90, opacity: 0 }), k(0.72 + index * 0.12, { x: -90, opacity: 0 }),
          k(1.55 + index * 0.12, { x: width - 28, opacity: 0.9 }, "cubicInOut"),
          k(1.95 + index * 0.12, { x: width + 44, opacity: 0 })],
      }),
      text("index", `0${index + 1}`, 28, 116, 84, C.paper, {
        material: { gradient: { angle_deg: 90, stops: [{ offset: 0, color: C.paper }, { offset: 1, color: tint }] },
          glow: { color: tint, blur: 10, opacity: 0.35 } },
      }),
      text("caption", ["DEPTH", "SHEEN", "COLOR"][index], 30, 224, 28, C.paper, { font_weight: 800 }),
      text("microcopy", ["RIM LIGHT / 2.5D", "TINT / SPECULAR", "BLEND / REFRACT"][index], 30, 270, 14, "#c5ceda", { font_weight: 500 }),
      ...Array.from({ length: 5 }, (_, row) => rect(`data-line-${row}`, 30, 314 + row * 8, 70 + ((row * 37 + index * 51) % 170), 2, tint, {
        transform: { x: 0, y: 0, opacity: 0.28 + row * 0.1 },
      })),
    ],
  };
});
const luminousCore = closedPath("faceted-core", [[0, -130], [118, -74], [102, 86], [0, 142], [-118, 76], [-100, -90]], "#172636", {
  transform: { x: 640, y: 358 },
  material: { gradient: { angle_deg: -70, stops: [{ offset: 0, color: "#effcff" }, { offset: 0.24, color: C.cyan }, { offset: 1, color: "#26306d" }] },
    glow: { color: C.cyan, blur: 36, opacity: 0.86 },
    extrusion: { color: "#202044", distance: 26, angle_deg: 48, steps: 8 } },
  keyframes: [k(0, { scale: 0.2, rotation: -80, opacity: 0 }),
    k(0.72, { scale: 1, rotation: 0, opacity: 1 }, "spring"),
    k(2.9, { scale: 1.5, rotation: 50, opacity: 0 })],
});
const lightSpears = Array.from({ length: 13 }, (_, index) => {
  const angle = index / 13 * Math.PI * 2, radius = 185 + index % 4 * 22;
  const x = 640 + Math.cos(angle) * radius, y = 352 + Math.sin(angle) * radius * 0.68;
  return closedPath(`light-spear-${index}`, [[x, y], [640 + Math.cos(angle - 0.06) * 330, 352 + Math.sin(angle - 0.06) * 236],
    [640 + Math.cos(angle + 0.06) * 330, 352 + Math.sin(angle + 0.06) * 236]], "#70dfff10", {
    material: { gradient: { type: "radial", center_x: 0.5, center_y: 0.5, radius: 0.9,
      stops: [{ offset: 0, color: `${C.cyan}30` }, { offset: 1, color: `${C.cyan}00` }] }, blend: "screen" },
    keyframes: [k(0, { opacity: 0, scale: 0.4 }), k(0.7 + index * 0.035, { opacity: 0.8, scale: 1 }, "cubicOut"),
      k(2.5, { opacity: 0.05, scale: 1.2 })],
  });
});
const glassStage = scene("stylized-materials", 3, 6, "Tinted glass plates, moving rim highlights and a faceted luminous object create stylized 2.5D depth", [
  background(),
  ellipse("blue-atmosphere", 350, 72, 580, 580, "#122236", {
    material: { gradient: { type: "radial", center_x: 0.5, center_y: 0.5, radius: 0.76,
      stops: [{ offset: 0, color: "#147aa75a" }, { offset: 1, color: "#11172400" }] } },
  }),
  ...lightSpears, luminousCore, ...glassCards,
  text("glass-note", "STYLIZED MATERIAL / NO REAL REFRACTION", 112, 598, 15, "#d8e7f1", {
    font_weight: 500, keyframes: [k(0, { opacity: 0 }), k(0.65, { opacity: 0.78 }), k(2.5, { opacity: 0.78 }), k(3, { opacity: 0 })],
  }),
], { keyframes: [k(0, { scale: 1.08 }), k(1.4, { scale: 1.04 }), k(3, { scale: 1.08, x: -5, y: 4 })] },
{ type: "push", direction: "left", duration_sec: 0.22 });

const shards = Array.from({ length: 34 }, (_, index) => {
  const x = (index * 151 + 31) % W, y = (index * 89 + 70) % H;
  const width = 9 + index % 23, height = 2 + index % 5;
  return rect(`shard-${index}`, x, y, width, height, index % 4 ? C.orange : C.cyan, {
    transform: { rotation: index * 19, opacity: 0.15 },
    material: { glow: { color: index % 4 ? C.orange : C.cyan, blur: 10, opacity: 0.6 }, blend: "screen" },
    keyframes: [k(0, { x, y, rotation: index * 19, opacity: 0.1 }),
      k(0.85, { x: 640 + (x - 640) * 0.4, y: 360 + (y - 360) * 0.4, rotation: index * 19 - 90, opacity: 0.82 }, "cubicOut"),
      k(2.5, { x: 640 + (x - 640) * 1.8, y: 360 + (y - 360) * 1.6, rotation: index * 19 + 130, opacity: 0 })],
  });
});
const finalScene = scene("impact-type", 6, 9, "Typography fractures into flying code shapes, then locks into a readable high-contrast end card", [
  background(), ...shards,
  ellipse("orange-pool", 440, 170, 430, 430, "#160b0d", {
    material: { gradient: { type: "radial", center_x: 0.5, center_y: 0.5, radius: 0.8,
      stops: [{ offset: 0, color: "#ff552c5c" }, { offset: 1, color: "#ff552c00" }] }, blend: "screen" },
  }),
  text("impact-word-1", "MAKE", 270, 218, 170, C.paper, {
    material: { gradient: { angle_deg: 0, stops: [{ offset: 0, color: C.paper }, { offset: 1, color: C.orange }] },
      extrusion: { color: C.shadow, distance: 18, angle_deg: 47, steps: 7 },
      glow: { color: C.orange, blur: 25, opacity: 0.65 } },
    keyframes: [k(0, { x: -660, y: 160, rotation: -15, opacity: 0 }),
      k(0.48, { x: 270, y: 218, rotation: 0, opacity: 1 }, "cubicOut"),
      k(0.86, { x: 286, y: 210, scale: 1.03 }),
      k(1.1, { x: 270, y: 218, scale: 1 }),
      k(3, { x: 270, y: 218, scale: 1 })],
  }),
  text("impact-word-2", "IT MOVE", 270, 410, 126, C.orange, {
    stroke: C.paper, stroke_width: 1,
    material: { glow: { color: C.orange, blur: 28, opacity: 0.7 },
      extrusion: { color: "#320f19", distance: 10, angle_deg: 48, steps: 4 } },
    keyframes: [k(0, { x: 1470, y: 520, rotation: 11, opacity: 0 }),
      k(0.66, { x: 270, y: 410, rotation: 0, opacity: 1 }, "cubicOut"),
      k(1.02, { x: 254, y: 416, scale: 1.04 }),
      k(1.24, { x: 270, y: 410, scale: 1 }),
      k(3, { x: 270, y: 410, scale: 1 })],
  }),
  rect("sweep-light", -260, 0, 86, H, "#ffffff", {
    transform: { rotation: 13, opacity: 0 },
    material: { gradient: { angle_deg: 0, stops: [{ offset: 0, color: "#ffffff00" }, { offset: 0.48, color: "#fff8" }, { offset: 1, color: "#ffffff00" }] },
      glow: { color: C.paper, blur: 18, opacity: 0.4 }, blend: "screen" },
    keyframes: [k(0, { x: -260, y: 0, opacity: 0 }), k(1.36, { x: -260, opacity: 0 }),
      k(1.44, { x: 120, opacity: 0.92, ease: "cubicOut" }), k(1.9, { x: 1550, opacity: 0, ease: "cubicIn" })],
  }),
  line("final-rule", [[88, 590], [1192, 590]], C.orange, {
    stroke_width: 3, material: { glow: { color: C.orange, blur: 16, opacity: 0.8 } },
    keyframes: [k(0, { reveal: 0 }), k(1, { reveal: 0 }), k(1.42, { reveal: 1, ease: "cubicOut" })],
  }),
  text("endline", "LIGHT / DEPTH / MOTION", 112, 614, 18, C.paper, {
    font_weight: 600, keyframes: [k(0, { opacity: 0, y: 666 }), k(1.48, { opacity: 0, y: 666 }),
      k(1.9, { opacity: 0.92, x: 112, y: 614, ease: "cubicOut" }), k(3, { opacity: 0.92, x: 112, y: 614 })],
  }),
  vignette,
], { keyframes: [k(0, { scale: 1.08 }), k(1.1, { scale: 1.04 }), k(3, { scale: 1.04 })] },
{ type: "zoom", duration_sec: 0.18 });

const plan = {
  schema: "video-master.mv-plan.v1",
  project: { name: "Light in Motion / Material Study", width: W, height: H, fps: 30, duration_seconds: 9 },
  design: { title: "LIGHT / IN MOTION", palette: [C.ink, C.paper, C.orange, C.cyan] },
  cues: [tunnel, glassStage, finalScene],
  sound_events: [
    { id: "fuse-arrival", at_sec: 0.6, type: "tick", gain: 0.3 },
    { id: "tunnel-lock", at_sec: 1.1, type: "hit", gain: 0.55 },
    { id: "glass-arrival", at_sec: 3, type: "whoosh", duration_sec: 0.3, gain: 0.45 },
    { id: "core-arrival", at_sec: 4.2, type: "hit", gain: 0.55 },
    { id: "type-impact", at_sec: 6, type: "hit", gain: 0.75 },
    { id: "endcard", at_sec: 7.9, type: "tick", gain: 0.4 },
  ],
  provenance: { visuals: "Original Canvas 2D geometry and typography. No reference footage, lyrics, characters or images reused." },
};
await fs.writeFile(planFile, JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ plan: planFile, scenes: plan.cues.length, duration_seconds: 9, fps: 30 }));
