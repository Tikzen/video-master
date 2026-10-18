import test from "node:test";
import assert from "node:assert/strict";
import { sampleMotion, samplePoints, animationTime, validateMotion, validateComposition, collectCompositionVisuals, drawComposition } from "./composition.js";
import { loadVisuals, prepareVisuals, getVisual, drawMedia, drawMVOverlay } from "./mv.js";
import { renderFrame } from "./scene.js";
import { validate, moveCue } from "./model.js";

const scene = (layers, extra = {}) => ({
  id: "shot", kind: "scene", scene: "composition", track_id: "picture",
  start_sec: 10, end_sec: 14, canvas: { width: 200, height: 100 }, layers, ...extra,
});
const text = (extra = {}) => ({ id: "type", kind: "text", text: "MOTION", font_size: 20, ...extra });
const rect = (extra = {}) => ({ id: "tile", kind: "rect", width: 40, height: 20, ...extra });
const clone = (value) => structuredClone(value);

function mockCanvas() {
  const calls = [], stack = [];
  const ctx = {
    globalAlpha: 1, lineWidth: 1, textAlign: "left", textBaseline: "top",
    shadowColor: "rgba(0,0,0,0)", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
  };
  class MockGradient {
    constructor(args) { this.args = args; this.stops = []; }
    addColorStop(offset, color) { this.stops.push({ offset, color }); }
  }
  ctx.createLinearGradient = (...args) => new MockGradient(args);
  ctx.createRadialGradient = (...args) => new MockGradient(args);
  for (const name of ["beginPath", "closePath", "translate", "rotate", "scale", "rect", "arc", "ellipse", "clip", "moveTo", "lineTo", "setLineDash", "drawImage", "fillRect", "strokeRect", "setTransform"]) {
    ctx[name] = (...args) => calls.push({ name, args: clone(args), alpha: ctx.globalAlpha });
  }
  for (const name of ["fill", "stroke", "fillText", "strokeText"]) {
    ctx[name] = (...args) => calls.push({
      name, args: clone(args), alpha: ctx.globalAlpha, font: ctx.font,
      fill: ctx.fillStyle, stroke: ctx.strokeStyle, width: ctx.lineWidth,
      dashOffset: ctx.lineDashOffset, shadowColor: ctx.shadowColor, shadowBlur: ctx.shadowBlur,
    });
  }
  ctx.save = () => { stack.push({ ...ctx }); calls.push({ name: "save", args: [] }); };
  ctx.restore = () => { const state = stack.pop(); assert.ok(state, "balanced canvas state"); Object.assign(ctx, state); calls.push({ name: "restore", args: [] }); };
  ctx.measureText = (value) => ({ width: Array.from(value).length * 10 });
  return { ctx, calls, stack };
}

function draw(cue, time, getVisual) {
  const canvas = mockCanvas();
  drawComposition(canvas.ctx, { cues: [cue] }, time, 400, 200, cue, getVisual);
  assert.equal(canvas.stack.length, 0);
  return canvas.calls;
}

test("sparse tracks use independent endpoints and retain their base values", () => {
  const frames = [{ at: 0, x: 0, opacity: 0 }, { at: 1, y: 100 }, { at: 2, x: 200, opacity: 1 }];
  const snapshot = clone(frames);
  const halfway = sampleMotion({ x: 20, y: 0, rotation: 40 }, frames, 1);
  assert.equal(halfway.x, 100);
  assert.equal(halfway.y, 100);
  assert.equal(halfway.opacity, 0.5);
  assert.equal(halfway.rotation, 40);
  assert.equal(halfway.scale, 1);
  assert.equal(sampleMotion({ x: 10 }, [{ at: 2, x: 30 }], 1).x, 20);
  assert.equal(sampleMotion({ x: 10 }, [{ at: 2, x: 30 }], -1).x, 10);
  assert.equal(sampleMotion({}, frames, 6).x, 200);
  assert.deepEqual(frames, snapshot);
});

test("every supported ease executes, spring overshoots, step switches at its endpoint", () => {
  const at = (ease, time) => sampleMotion({}, [{ at: 1, x: 100, ease }], time).x;
  assert.equal(at("linear", 0.5), 50);
  assert.equal(at("cubicIn", 0.5), 12.5);
  assert.equal(at("cubicOut", 0.5), 87.5);
  assert.equal(at("cubicInOut", 0.25), 6.25);
  assert.equal(at("step", 0.999), 0);
  assert.equal(at("step", 1), 100);
  assert.ok(at("spring", 0.25) > 100);
  assert.equal(at("spring", 1), 100);
  assert.equal(sampleMotion({}, [{ at: 1, opacity: 1, reveal: 1, ease: "spring" }], 0.25).opacity, 1);
});

test("motion rejects illegal times, properties, nonfinite values and duplicate property endpoints", () => {
  assert.deepEqual(validateMotion([{ at: 0, x: 0 }, { at: 1, x: 3, ease: "spring" }], 2), []);
  assert.deepEqual(validateMotion([{ at: 1, x: 3 }, { at: 1, y: 4 }], 2), []);
  for (const frames of [
    [{ at: -1, x: 0 }], [{ at: 3, x: 0 }], [{ at: NaN, x: 0 }],
    [{ at: 1, x: Infinity }], [{ at: 1, tilt: 2 }],
    [{ at: 1, x: 0, ease: "random" }], [{ at: 1, opacity: 2 }],
    [{ at: 1, scale: -1 }], [{ at: 1 }], [null],
    [{ at: 1, x: 1 }, { at: 0, x: 0 }], [{ at: 1, x: 1 }, { at: 1, x: 2 }],
  ]) assert.ok(validateMotion(frames, 2).length, JSON.stringify(frames));
  assert.ok(validateMotion([], 2, { origin: 0 }).length);
  assert.ok(validateMotion({}, 2).length);
  assert.ok(validateMotion([], 0).length);
});

test("composition validates recursive motion, masks, sources, paths and relative timing", () => {
  const valid = scene([
    rect({ mask: { kind: "circle", x: 20, y: 10, radius: 10 }, transform: { scale_x: -1 } }),
    text({ stroke: "#333", max_width: 100, letter_reveal: true }),
    { id: "line", kind: "path", d: "M0 0 C10 0 10 20 30 20 Z", path_length: 50, keyframes: [{ at: 0, reveal: 0 }, { at: 1, reveal: 1 }] },
    { id: "nested", kind: "group", layers: [{ id: "photo", kind: "image", src: "assets/photo image.png", width: 20, height: 20 }] },
  ]);
  assert.deepEqual(validateComposition(valid), []);
  for (const mutation of [
    (cue) => { cue.layers[0].out_sec = 5; },
    (cue) => { cue.layers[0].mask.radius = 0; },
    (cue) => { cue.layers[1].font_size = 0; },
    (cue) => { cue.layers[1].letter_reveal = 0.5; },
    (cue) => { cue.layers[2].path_length = undefined; },
    (cue) => { cue.layers[2].d = "M0 0 BAD"; },
    (cue) => { cue.layers[2].d = "M0 0 L1"; },
    (cue) => { cue.layers[2].d = "M0 0 A1 1 0 2 0 2 2"; },
    (cue) => { cue.layers[2].dasharray = [0, 0]; },
    (cue) => { cue.layers[2].keyframes = {}; },
    (cue) => { cue.layers[2].keyframes = [null]; },
    (cue) => { cue.layers[3].layers[0].keyframes = [{ at: 2, nope: 1 }]; },
    (cue) => { cue.layers[3].layers[0].id = "parent::child"; },
    (cue) => { cue.layers[3].keyframes = [{ at: 1, reveal: 0.5 }]; },
    (cue) => { cue.camera = { keyframes: [{ at: 5, scale: 2 }] }; },
    (cue) => { cue.canvas.width = -1; },
  ]) {
    const invalid = clone(valid); mutation(invalid);
    assert.ok(validateComposition(invalid).length, mutation.toString());
  }
  for (const src of ["../escape.png", "/abs.png", "C:\\abs.png", "https://host/x", "%2e%2e/x", "%252e%252e/x", "assets/x?bad", "assets/\u0000x", "data:image/png,x"]) {
    assert.ok(validateComposition(scene([{ id: "bad", kind: "image", src, width: 20, height: 20 }])).some((error) => error.includes(".src")), src);
  }
});

test("material schema accepts bounded recipes and rejects inert or unsafe settings", () => {
  const material = {
    gradient: { angle_deg: -24, stops: [{ offset: 0, color: "#42dfff" }, { offset: 1, color: "#843cff" }] },
    glow: { color: "#42dfff", blur: 24, opacity: 0.7 },
    extrusion: { color: "#2b174b", distance: 8, angle_deg: 45, steps: 4 },
    glass: { tint: "#68cbff", opacity: 0.18, rim: "#dff7ff", rim_width: 2, sheen: 0.2 },
  };
  assert.deepEqual(validateComposition(scene([rect({ material })])), []);
  assert.deepEqual(validateComposition(scene([text({
    material: { gradient: { stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#f60" }] } },
  })])), []);
  assert.deepEqual(validateComposition(scene([rect({ material: {
    blend: "screen",
    gradient: { type: "radial", center_x: 0.4, center_y: 0.6, radius: 0.8,
      stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#0000" }] },
  } })])), []);
  assert.ok(validateComposition(scene([{
    id: "svg", kind: "path", d: "M0 0 L100 0", stroke: "#fff", stroke_width: 4,
    material: { gradient: { stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#f60" }] } },
  }])).some((error) => error.includes("bounds: required")));
  assert.ok(validateComposition(scene([rect({ material: { unsupported: true } })])).some((error) => error.includes("unsupported property")));
  assert.ok(validateComposition(scene([rect({ material: { glow: { color: "url(x)", blur: 20, opacity: 1 } } })])).length);
  assert.ok(validateComposition(scene([rect({ material: { glow: { color: "#fff", blur: 65, opacity: 1 } } })])).some((error) => error.includes("blur")));
  assert.ok(validateComposition(scene([rect({ material: { blend: "hue" } })])).some((error) => error.includes("composite mode")));
  assert.ok(validateComposition(scene([text({ material: { glass: { tint: "#fff", opacity: 0.2, rim: "#fff", rim_width: 1, sheen: 0.1 } } })])).some((error) => error.includes("glass")));
  assert.ok(validateComposition(scene([rect({
    material: { gradient: { stops: [{ offset: 0.8, color: "#fff" }, { offset: 0.2, color: "#f60" }] } },
  })])).some((error) => error.includes("strictly increasing")));
});

test("gradient, glow, extrusion and glass emit drawing operations", () => {
  const cue = scene([rect({
    width: 80, height: 50, fill: "#102030",
    material: {
      gradient: { angle_deg: 0, stops: [{ offset: 0, color: "#12d9ff" }, { offset: 1, color: "#ff3fa4" }] },
      glow: { color: "#12d9ff", blur: 22, opacity: 0.8 },
      extrusion: { color: "#30104e", distance: 10, angle_deg: 45, steps: 4 },
      glass: { tint: "#7adfff", opacity: 0.16, rim: "#ffffff", rim_width: 2, sheen: 0.22 },
    },
  })]);
  const calls = draw(cue, 11);
  const gradientFill = calls.find((call) => call.name === "fill" && call.fill?.stops?.length === 2);
  assert.ok(gradientFill, "the authored gradient reaches Canvas fillStyle");
  assert.equal(gradientFill.shadowBlur, 22, "the glow is drawn with the base shape");
  assert.ok(gradientFill.shadowColor.includes("0.8"));
  assert.ok(calls.filter((call) => call.name === "fill").length >= 5, "extrusion adds multiple visible depth passes");
  assert.ok(calls.some((call) => call.name === "fillRect"), "glass tint and sheen are composited over the shape");
  assert.ok(calls.some((call) => call.name === "stroke" && call.stroke === "#ffffff"), "glass rim is drawn");
});

test("media collection preserves nested IDs and intersects group intervals", () => {
  const cue = scene([
    { id: "g", kind: "group", in_sec: 1, out_sec: 3, layers: [
      { id: "still", kind: "image", src: "assets/a.png", width: 20, height: 20 },
      { id: "clip", kind: "footage", src: "assets/b.mp4", in_sec: 0.5, out_sec: 4, source_offset: 2, width: 20, height: 20 },
      { id: "none", kind: "footage", src: "assets/c.mp4", in_sec: 3.5, width: 20, height: 20 },
    ] },
  ]);
  const snapshot = clone(cue);
  assert.deepEqual(collectCompositionVisuals({ cues: [cue, { ...cue, scene: "kinetic" }] }), [
    { id: "shot::g::still", track_id: "picture", kind: "image", src: "assets/a.png", source_offset: 0, start_sec: 11, end_sec: 13 },
    { id: "shot::g::clip", track_id: "picture", kind: "footage", src: "assets/b.mp4", source_offset: 2.5, start_sec: 11, end_sec: 13 },
  ]);
  assert.deepEqual(cue, snapshot);
});

test("camera, nested transforms and alpha compose in layer order without mutating input", () => {
  const cue = scene([
    { id: "group", kind: "group", transform: { x: 30, opacity: 0.5 }, layers: [
      rect({ transform: { x: 10, y: 20, scale_x: 2, rotation: 90, opacity: 0.5 }, keyframes: [{ at: 2, x: 50 }] }),
      text({ color: "#ff0000" }),
    ] },
  ], { camera: { transform: { opacity: 0.5 }, keyframes: [{ at: 2, x: 40, scale: 2 }] } });
  const snapshot = clone(cue);
  const calls = draw(cue, 11);
  const translations = calls.filter((call) => call.name === "translate").map((call) => call.args);
  assert.deepEqual(translations.slice(0, 4), [[100, 50], [20, 0], [-100, -50], [30, 0]]);
  assert.ok(translations.some((args) => args[0] === 30 && args[1] === 20));
  assert.ok(calls.some((call) => call.name === "scale" && call.args[0] === 1.5 && call.args[1] === 1.5));
  assert.ok(calls.some((call) => call.name === "rotate" && call.args[0] === Math.PI / 2));
  assert.equal(calls.find((call) => call.name === "fill").alpha, 0.125);
  assert.equal(calls.find((call) => call.name === "fillText").alpha, 0.25);
  assert.ok(calls.findIndex((call) => call.name === "fill") < calls.findIndex((call) => call.name === "fillText"));
  assert.deepEqual(cue, snapshot);
});

test("text reveal clips real fill with alignment, preserves outline, and supports glyph reveal", () => {
  const cue = scene([text({
    align: "center", color: "#fff", stroke: "#000", stroke_width: 3, max_width: 50,
    keyframes: [{ at: 0, reveal: 0 }, { at: 2, reveal: 1 }],
  })]);
  const calls = draw(cue, 11);
  assert.ok(calls.some((call) => call.name === "rect" && call.args[0] === -25 && call.args[2] === 25));
  const strokeIndex = calls.findIndex((call) => call.name === "strokeText");
  const clipIndex = calls.findIndex((call, index) => index > strokeIndex && call.name === "clip");
  const fillIndex = calls.findIndex((call) => call.name === "fillText");
  assert.ok(strokeIndex < clipIndex && clipIndex < fillIndex);
  assert.equal(calls[fillIndex].font, "700 20px Arial, sans-serif");
  assert.deepEqual(calls[fillIndex].args, ["MOTION", 0, 0, 50]);
  const glyphCalls = draw(scene([text({ text: "你A😀B", letter_reveal: true, transform: { reveal: 0.5 } })]), 11);
  assert.equal(glyphCalls.find((call) => call.name === "fillText").args[0], "你A");
});

test("layer masks, reveal and time windows affect actual canvas calls", () => {
  const cue = scene([
    rect({ mask: { kind: "circle", x: 10, y: 5, radius: 4 }, transform: { reveal: 0.25 } }),
    text({ id: "later", in_sec: 2, out_sec: 3 }),
  ]);
  const calls = draw(cue, 11);
  assert.ok(calls.some((call) => call.name === "arc" && call.args[2] === 4));
  assert.ok(calls.filter((call) => call.name === "clip").length >= 3);
  assert.ok(calls.some((call) => call.name === "rect" && call.args[2] === 10 && call.args[3] === 20));
  assert.ok(!calls.some((call) => call.name === "fillText"));
  assert.ok(draw(cue, 12).some((call) => call.name === "fillText"));
  assert.ok(!draw(cue, 13).some((call) => call.name === "fillText"));
  assert.deepEqual(draw(cue, 14), []);
  assert.deepEqual(draw(cue, 9), []);
});

test("polyline reveal cuts by distance, SVG reveal uses stroke dash, and invalid paths fail validation", () => {
  const points = scene([{ id: "line", kind: "path", points: [[0, 0], [30, 0], [30, 40]], transform: { reveal: 0.5 }, dasharray: [2, 3], dash_offset: 1 }]);
  const calls = draw(points, 11);
  assert.deepEqual(calls.filter((call) => call.name === "lineTo").map((call) => call.args), [[30, 0], [30, 5]]);
  assert.equal(calls.find((call) => call.name === "stroke").dashOffset, 1);
  const oldPath = globalThis.Path2D;
  globalThis.Path2D = class Path2D { constructor(d) { this.d = d; } };
  try {
    const cue = scene([{ id: "svg", kind: "path", d: "M0 0 L100 0", path_length: 100, transform: { reveal: 0.4 } }]);
    const svgCalls = draw(cue, 11);
    assert.ok(svgCalls.some((call) => call.name === "setLineDash" && call.args[0][0] === 100));
    assert.equal(svgCalls.find((call) => call.name === "stroke").dashOffset, 60);
    const dashed = draw(scene([{ ...cue.layers[0], dasharray: [10, 10], dash_offset: 5 }]), 11);
    const generated = dashed.filter((call) => call.name === "setLineDash").at(-1).args[0];
    assert.deepEqual(generated.slice(0, 4), [5, 10, 10, 10]);
    assert.ok(generated.at(-1) >= 100);
  } finally {
    if (oldPath === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = oldPath;
  }
});

test("media use consistent nested cache IDs, real fitting and no inactive lookups", () => {
  const cue = scene([{ id: "group", kind: "group", in_sec: 1, layers: [
    { id: "media", kind: "image", src: "assets/p.png", width: 100, height: 100, fit: "cover" },
  ] }]);
  const lookups = [];
  const getVisual = (src, id) => { lookups.push([src, id]); return { width: 200, height: 100 }; };
  assert.ok(!draw(cue, 10, getVisual).some((call) => call.name === "drawImage"));
  const calls = draw(cue, 11, getVisual);
  assert.deepEqual(lookups, [["assets/p.png", "shot::group::media"]]);
  assert.deepEqual(calls.find((call) => call.name === "drawImage").args.slice(1), [-50, 0, 200, 100]);
  assert.ok(!draw(cue, 11, () => undefined).some((call) => call.name === "drawImage"));
});

test("out-of-order render seeks exactly match independently sampled frames", () => {
  const cue = scene([text({ keyframes: [{ at: 0, x: -80, reveal: 0 }, { at: 1, x: 20, reveal: 1, ease: "cubicOut" }, { at: 3, rotation: 30 }] })],
    { camera: { keyframes: [{ at: 2, scale: 1.6, x: 30, ease: "cubicInOut" }] } });
  const times = [10, 10.5, 11, 12.5, 13.5];
  const frames = times.map((time) => draw(cue, time));
  assert.deepEqual([13.5, 10.5, 12.5, 10, 11].map((time) => draw(cue, time)), [frames[4], frames[1], frames[3], frames[0], frames[2]]);
});

test("path point morphing changes real geometry with deterministic easing and seek-independent sampling", () => {
  const points = [[0, 0], [100, 0], [100, 100]];
  const frames = [{ at: 0, points }, { at: 2, points: [[10, 20], [50, 60], [90, 80]], ease: "cubicOut" }];
  const snapshot = clone({ points, frames });
  assert.deepEqual(samplePoints(points, frames, 1), [[8.75, 17.5], [56.25, 52.5], [91.25, 82.5]]);
  const cue = scene([{ id: "morph", kind: "path", points, point_keyframes: frames, stroke_width: 3 }]);
  assert.deepEqual(validateComposition(cue), []);
  const calls = draw(cue, 11);
  assert.deepEqual(calls.find((call) => call.name === "moveTo").args, [8.75, 17.5]);
  assert.deepEqual(calls.filter((call) => call.name === "lineTo").map((call) => call.args), [[56.25, 52.5], [91.25, 82.5]]);
  assert.deepEqual(draw(cue, 11), calls);
  assert.notDeepEqual(draw(cue, 12), calls);
  assert.deepEqual({ points, frames }, snapshot);
  for (const mutation of [
    (layer) => { layer.point_keyframes[1].points.pop(); },
    (layer) => { layer.point_keyframes[1].points[0][0] = Infinity; },
    (layer) => { layer.point_keyframes[1].ease = "jitter"; },
    (layer) => { layer.point_keyframes[1].at = 0; },
    (layer) => { layer.point_keyframes[1].at = 5; },
  ]) {
    const invalid = clone(cue); mutation(invalid.layers[0]);
    assert.ok(validateComposition(invalid).some((error) => error.includes("point_keyframes")));
  }
});

test("nondestructive trimming preserves eased cue, camera, nested morphs and footage source motion", () => {
  const project = { width: 400, height: 200, fps: 30, duration_seconds: 20 };
  const cue = scene([
    text({ transform: { x: 0 }, keyframes: [{ at: 0, x: 0 }, { at: 4, x: 200, reveal: 0.6, ease: "spring" }] }),
    { id: "morph", kind: "path", points: [[0, 0], [100, 0]], point_keyframes: [{ at: 4, points: [[10, 20], [50, 60]], ease: "cubicInOut" }] },
    { id: "group", kind: "group", in_sec: 0.5, out_sec: 3.5, layers: [
      { id: "clip", kind: "footage", src: "assets/trim.mp4", width: 30, height: 30, source_offset: 2, in_sec: 0.5, out_sec: 4 },
    ] },
  ], { camera: { keyframes: [{ at: 4, x: 80, scale: 2, ease: "cubicIn" }] }, keyframes: [{ at: 4, y: 30, ease: "cubicOut" }] });
  const timeline = { fps: 30, duration_seconds: 20, tracks: [{ id: "picture", visible: true }], cues: [cue] };
  assert.deepEqual(validate(project, timeline), []);
  const original = clone(cue), expected = draw(original, 11.3);
  moveCue(timeline, "shot", 11, "left");
  assert.equal(cue.animation_duration_sec, 4);
  assert.equal(cue.animation_offset_sec, 1);
  assert.equal(animationTime(cue, 11.3), animationTime(original, 11.3));
  assert.deepEqual(draw(cue, 11.3), expected, "left trim must not restart or refit easing");
  assert.deepEqual(validate(project, timeline), []);
  assert.deepEqual(collectCompositionVisuals(timeline), [
    { id: "shot::group::clip", track_id: "picture", kind: "footage", src: "assets/trim.mp4", source_offset: 2.5, start_sec: 11, end_sec: 13.5 },
  ]);
  moveCue(timeline, "shot", 12, "right");
  assert.equal(cue.end_sec, 12);
  assert.deepEqual(draw(cue, 11.3), expected, "right trim retains the original easing domain, including keys after visible end");
  assert.deepEqual(validate(project, timeline), []);
  moveCue(timeline, "shot", 14, "right");
  moveCue(timeline, "shot", 10, "left");
  assert.equal(cue.start_sec, 10);
  assert.equal(cue.end_sec, 14);
  assert.equal(cue.animation_offset_sec, 0);
  assert.deepEqual(draw(cue, 11.3), expected, "extending back to the source span restores the original motion");
  assert.deepEqual(cue.layers, original.layers);
  const top = {
    id: "top", kind: "footage", track_id: "picture", src: "assets/top.mp4",
    start_sec: 0, end_sec: 4, source_offset: 2,
    keyframes: [{ at: 0, x: 0 }, { at: 4, x: 100, ease: "cubicIn" }],
  };
  const topTimeline = { ...timeline, cues: [top] };
  const originalX = sampleMotion(top.transform, top.keyframes, 1.5).x;
  moveCue(topTimeline, "top", 1, "left");
  assert.equal(top.source_offset, 3);
  assert.equal(sampleMotion(top.transform, top.keyframes, animationTime(top, 1.5)).x, originalX);
  assert.deepEqual(validate(project, topTimeline), []);
});

test("numeric legacy scene/title keyframes execute and all nested animation validates", () => {
  const project = { width: 400, height: 200, fps: 30, duration_seconds: 4 };
  const timeline = {
    fps: 30, duration_seconds: 4, design: { title: "Test", palette: ["#fff", "#000", "#f00", "#0ff"] },
    tracks: [{ id: "picture", visible: true }],
    cues: [
      { id: "legacy", kind: "scene", scene: "type", track_id: "picture", start_sec: 0, end_sec: 4,
        keyframes: [{ at: 0, x: 0, scale: 1 }, { at: 2, x: 100, scale: 2 }] },
      { id: "caption", kind: "title", text: "HELLO", track_id: "picture", start_sec: 0, end_sec: 4,
        keyframes: [{ at: 0, x: 0 }, { at: 2, x: 80, scale_x: 2 }] },
    ],
  };
  assert.deepEqual(validate(project, timeline), []);
  const canvas = mockCanvas();
  renderFrame(canvas.ctx, timeline, 1, 400, 200);
  assert.ok(canvas.calls.some((call) => call.name === "translate" && call.args[0] === 250 && call.args[1] === 100), "legacy scene position samples its cue-local track");
  assert.ok(canvas.calls.some((call) => call.name === "scale" && call.args[0] === 1.5 && call.args[1] === 1.5), "legacy scene scale samples its cue-local track");
  assert.ok(canvas.calls.some((call) => call.name === "translate" && call.args[0] === 72), "title receives its 40px animated position on top of its default anchor");
  const invalid = clone(timeline);
  invalid.cues[0].keyframes[1].at = 9;
  assert.ok(validate(project, invalid).some((error) => error.includes("keyframes")));
  const nested = { ...timeline, cues: [scene([rect({ keyframes: [{ at: 1, nonexistent: 4 }] })], { start_sec: 0, end_sec: 4 })] };
  assert.ok(validate(project, nested).some((error) => error.includes("nonexistent")));
  const compositionCanvas = mockCanvas();
  drawMVOverlay(compositionCanvas.ctx, { ...timeline, cues: [scene([rect()], { start_sec: 0, end_sec: 4 })] }, 1, 400, 200);
  assert.deepEqual(compositionCanvas.calls, [], "composition authors own the design instead of receiving an unconditional diagonal wipe or BPM label");
});

test("legacy MV overlay does not invent a decorative wipe at an authored scene boundary", () => {
  for (const transition of [undefined, { type: "cut" }, { type: "iris", duration_sec: 0.4 }]) {
    const canvas = mockCanvas();
    drawMVOverlay(canvas.ctx, {
      fps: 30, duration_seconds: 4,
      tracks: [{ id: "picture", visible: true }],
      design: { title: "Film", palette: ["#fff", "#000", "#f00", "#0ff"] },
      cues: [{ id: "next", kind: "scene", scene: "type", track_id: "picture",
        start_sec: 2, end_sec: 4, ...(transition ? { transition } : {}) }],
    }, 2.1, 400, 200);
    assert.ok(canvas.calls.some((call) => call.name === "fillText"), "existing identity overlay remains");
    assert.ok(!canvas.calls.some((call) => call.name === "fill"),
      "no unconditional diagonal polygon is layered over the cut or transition");
  }
});

test("media caching isolates cue IDs, reloads changed sources and samples legacy numeric motion", async () => {
  const oldImage = globalThis.Image, oldDocument = globalThis.document;
  const created = [];
  class FakeImage {
    naturalWidth = 100;
    naturalHeight = 50;
    async decode() {}
  }
  class FakeVideo {
    duration = 20;
    videoWidth = 100;
    videoHeight = 50;
    readyState = 2;
    _time = 0;
    get currentTime() { return this._time; }
    set currentTime(value) { this._time = value; queueMicrotask(() => this.onseeked?.()); }
    set src(value) { this._src = value; queueMicrotask(() => this.onloadeddata?.()); }
    get src() { return this._src; }
    removeAttribute(name) { if (name === "src") { this._src = ""; this.released = true; } }
    load() {}
  }
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => { const video = new FakeVideo(); created.push(video); return video; } };
  try {
    const timeline = {
      fps: 30, tracks: [{ id: "picture", visible: true }],
      cues: [scene([
        { id: "a", kind: "footage", src: "assets/same.mp4", width: 50, height: 50, source_offset: 0 },
        { id: "b", kind: "footage", src: "assets/same.mp4", width: 50, height: 50, source_offset: 5 },
      ])],
    };
    await loadVisuals(timeline);
    assert.equal(created.length, 2);
    const first = getVisual("assets/same.mp4", "shot::a"), second = getVisual("assets/same.mp4", "shot::b");
    assert.notEqual(first, second);
    await prepareVisuals(timeline, 11);
    assert.equal(first.currentTime, 1);
    assert.equal(second.currentTime, 6);
    await prepareVisuals(timeline, 10.5);
    assert.equal(first.currentTime, 0.5);
    assert.equal(second.currentTime, 5.5);
    const changed = clone(timeline);
    changed.cues[0].layers[0].src = "assets/new.mp4";
    await loadVisuals(changed);
    assert.equal(created.length, 3);
    assert.equal(first.released, true);
    assert.notEqual(getVisual("assets/new.mp4", "shot::a"), first);
    assert.equal(getVisual("assets/same.mp4", "shot::a"), undefined);
    const legacy = {
      id: "legacy-media", kind: "image", src: "assets/legacy-test.png", start_sec: 0, end_sec: 4, fit: "contain",
      keyframes: [{ at: 0, x: 0 }, { at: 2, x: 100, rotation: 90, scale_x: 2 }],
    };
    await loadVisuals({ cues: [legacy] });
    const canvas = mockCanvas();
    drawMedia(canvas.ctx, legacy, 1, 400, 200);
    assert.ok(canvas.calls.some((call) => call.name === "translate" && call.args[0] === 250));
    assert.ok(canvas.calls.some((call) => call.name === "rotate" && call.args[0] === Math.PI / 4));
    assert.ok(canvas.calls.some((call) => call.name === "scale" && call.args[0] === 1.5));
    assert.ok(canvas.calls.some((call) => call.name === "drawImage"));
  } finally {
    if (oldImage === undefined) delete globalThis.Image;
    else globalThis.Image = oldImage;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
