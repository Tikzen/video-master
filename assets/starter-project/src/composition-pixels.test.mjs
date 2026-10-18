import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { validate, moveCue } from "./model.js";
import { run, ffmpegPath } from "./media.mjs";

const starter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = { width: 320, height: 180, fps: 30, duration_seconds: 4 };
const identity = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const rectangle = (id, color, x, y, width, height, extra = {}) => ({
  id, kind: "rect", color, width, height, transform: { x, y }, ...extra,
});
const black = () => rectangle("background", "#000000", 0, 0, 320, 180);
const scene = (layers, extra = {}) => ({
  id: "shot", track_id: "picture", kind: "scene", scene: "composition",
  start_sec: 0, end_sec: 4, canvas: { width: 320, height: 180 },
  transform: { ...identity }, layers: [black(), ...layers], ...extra,
});
const sequence = (shot) => ({
  schema: "video-master.timeline.v1", fps: 30, duration_seconds: 4,
  tracks: [{ id: "picture", kind: "video", visible: true, muted: false }],
  cues: [shot],
});

async function sample(page, timeline, time, points = [], regions = [], includeBrightBounds = false) {
  assert.deepEqual(validate(project, timeline), [], "pixel fixture is a valid project");
  return page.evaluate(async ({ timeline, project, time, points, regions, includeBrightBounds }) => {
    await window.renderFrameAt(timeline, project, time);
    const canvas = document.querySelector("#canvas");
    const ctx = canvas.getContext("2d");
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const at = (x, y) => Array.from(pixels.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4));
    let brightBounds = null;
    if (includeBrightBounds) {
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 420) continue;
          if (!brightBounds) brightBounds = { left: x, top: y, right: x, bottom: y };
          else {
            brightBounds.left = Math.min(brightBounds.left, x);
            brightBounds.top = Math.min(brightBounds.top, y);
            brightBounds.right = Math.max(brightBounds.right, x);
            brightBounds.bottom = Math.max(brightBounds.bottom, y);
          }
        }
      }
    }
    return {
      hash,
      brightBounds,
      points: points.map(([x, y]) => at(x, y)),
      regions: regions.map(([x, y, width, height]) => {
        const counts = { bright: 0, white: 0, red: 0, blue: 0, cyan: 0 };
        for (let row = y; row < y + height; row += 1) {
          for (let col = x; col < x + width; col += 1) {
            const [r, g, b] = at(col, row);
            if (r + g + b > 80) counts.bright += 1;
            if (r > 180 && g > 180 && b > 180) counts.white += 1;
            if (r > 180 && g < 60 && b < 60) counts.red += 1;
            if (b > 180 && r < 60 && g < 60) counts.blue += 1;
            if (g > 180 && b > 180 && r < 60) counts.cyan += 1;
          }
        }
        return counts;
      }),
    };
  }, { timeline, project, time, points, regions, includeBrightBounds });
}

const rgb = (frame, index) => frame.points[index].slice(0, 3);
const isRed = (pixel) => pixel[0] > 200 && pixel[1] < 40 && pixel[2] < 40;
const isBlue = (pixel) => pixel[2] > 200 && pixel[0] < 40 && pixel[1] < 40;

async function twoColorVideo(file) {
  try { await fs.access(file); return; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await run(ffmpegPath, ["-v", "error",
    "-f", "lavfi", "-i", "color=c=red:size=160x90:rate=30:duration=2",
    "-f", "lavfi", "-i", "color=c=blue:size=160x90:rate=30:duration=2",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
}

test("composition: actual browser pixels, layering, motion, reveals and media seeking", { timeout: 120000 }, async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "vm-composition-pixels-"));
  let browser, server;
  const errors = [];
  try {
    await fs.cp(path.join(starter, "src"), path.join(fixture, "src"), { recursive: true });
    await fs.mkdir(path.join(fixture, "assets"), { recursive: true });
    await fs.writeFile(path.join(fixture, "video.json"), JSON.stringify(project));
    await fs.writeFile(path.join(fixture, "timeline.json"), JSON.stringify(sequence(scene([]))));
    const instance = await createProjectServer(fixture, 0, true);
    server = instance.server;
    browser = await chromium.launch({ headless: true });
    const open = async () => {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(`${instance.url}/src/render.html`);
      await page.waitForFunction(() => typeof window.renderFrameAt === "function");
      return page;
    };

    await t.test("materials change real pixels and swept highlights remain deterministic", async () => {
      const page = await open();
      try {
        const plain = sequence(scene([
          rectangle("base", "#000000", 0, 0, 320, 180),
          rectangle("tile", "#182028", 50, 45, 90, 70),
        ]));
        const illuminated = structuredClone(plain);
        illuminated.cues[0].layers[2].material = {
          gradient: { angle_deg: 0, stops: [{ offset: 0, color: "#12d9ff" }, { offset: 1, color: "#ff3fa4" }] },
          glow: { color: "#12d9ff", blur: 22, opacity: 0.85 },
          extrusion: { color: "#4b164f", distance: 9, angle_deg: 45, steps: 4 },
        };
        const gradient = await sample(page, illuminated, 1, [[58, 70], [138, 70], [148, 70]]);
        assert.ok(rgb(gradient, 0)[2] > rgb(gradient, 0)[0], "left gradient end is cyan-biased");
        assert.ok(rgb(gradient, 1)[0] > rgb(gradient, 1)[2], "right gradient end is magenta-biased");
        assert.notDeepEqual(rgb(gradient, 2), rgb(await sample(page, plain, 1, [[148, 70]]), 0),
          "the glow/extrusion extends visible light beyond the base silhouette");

        const glassBase = sequence(scene([
          rectangle("underlay", "#080b13", 0, 0, 320, 180),
          rectangle("panel", "#101827", 110, 40, 90, 70),
        ]));
        const glass = structuredClone(glassBase);
        glass.cues[0].layers[2].material = {
          glass: { tint: "#65dfff", opacity: 0.36, rim: "#e8fbff", rim_width: 2, sheen: 0.32, angle_deg: -35 },
        };
        const glassPixel = await sample(page, glass, 1, [[150, 70]]);
        const flatPixel = await sample(page, glassBase, 1, [[150, 70]]);
        assert.notDeepEqual(rgb(glassPixel, 0), rgb(flatPixel, 0), "the glass tint changes the pixel, not only plan metadata");

        const sweep = sequence(scene([
          rectangle("underlay", "#080b13", 0, 0, 320, 180),
          { id: "surface", kind: "group", transform: { x: 100, y: 45 }, mask: { kind: "rect", x: 0, y: 0, width: 120, height: 80 },
            layers: [
              { id: "glass", kind: "rect", width: 120, height: 80, fill: "#18202e",
                material: { glass: { tint: "#4bc9f3", opacity: 0.28, rim: "#ffffff", rim_width: 1.5, sheen: 0.12 } } },
              { id: "moving-sheen", kind: "rect", width: 24, height: 80, fill: "#ffffff",
                transform: { x: -28, opacity: 0.18 }, keyframes: [{ at: 0, x: -28 }, { at: 2, x: 128, ease: "linear" }] },
            ] },
        ]));
        const first = await sample(page, sweep, 0.5);
        const later = await sample(page, sweep, 1.5);
        assert.notEqual(first.hash, later.hash, "keyframed sheen travels across the material");
        for (const [time, expected] of [[0.5, first], [1.5, later], [0.5, first]]) {
          assert.equal((await sample(page, sweep, time)).hash, expected.hash, `material seek at ${time}s is reproducible`);
        }
      } finally { await page.close(); }
    });

    await t.test("radial lighting and additive screen compositing affect the final pixels", async () => {
      const page = await open();
      try {
        const base = sequence(scene([
          rectangle("underlay", "#080b13", 0, 0, 320, 180),
          rectangle("radial-light", "#000000", 70, 35, 150, 110, {
            material: {
              gradient: { type: "radial", center_x: 0.5, center_y: 0.5, radius: 0.7,
                stops: [{ offset: 0, color: "#ff6928b0" }, { offset: 1, color: "#10091300" }] },
              glow: { color: "#ff6928", blur: 16, opacity: 0.35 },
              blend: "screen",
            },
          }),
        ]));
        const lit = await sample(page, base, 1, [[145, 90], [220, 90], [280, 150]]);
        assert.ok(rgb(lit, 0)[0] > rgb(lit, 2)[0], "radial light has a bright center and a falloff");
        const normal = structuredClone(base);
        delete normal.cues[0].layers[2].material.blend;
        const composited = await sample(page, normal, 1, [[145, 90]]);
        assert.notDeepEqual(rgb(lit, 0), rgb(composited, 0), "screen blend changes final composited color");
      } finally { await page.close(); }
    });

    await t.test("adding layer and scene keyframes changes pixels at the same timestamp", async () => {
      const page = await open();
      try {
        const plain = sequence(scene([rectangle("subject", "#ff0000", 20, 60, 40, 40)]));
        const moved = structuredClone(plain);
        moved.cues[0].layers[1].keyframes = [{ at: 0, x: 20 }, { at: 2, x: 220 }];
        const points = [[40, 80], [140, 80], [240, 80]];
        const before = await sample(page, plain, 1, points);
        const after = await sample(page, moved, 1, points);
        assert.notEqual(before.hash, after.hash, "keyframes execute rather than merely serialize");
        assert.deepEqual(rgb(before, 0), [255, 0, 0]);
        assert.deepEqual(rgb(after, 0), [0, 0, 0]);
        assert.deepEqual(rgb(after, 1), [255, 0, 0]);
        const shotMotion = structuredClone(plain);
        shotMotion.cues[0].keyframes = [{ at: 0, x: 0 }, { at: 2, x: 200 }];
        const shifted = await sample(page, shotMotion, 1, points);
        assert.notEqual(shifted.hash, before.hash, "scene cue keyframes reach the render entry point");
        assert.deepEqual(rgb(shifted, 1), [255, 0, 0]);
      } finally { await page.close(); }
    });

    await t.test("overlapping layers retain order, opacity and local masks", async () => {
      const page = await open();
      try {
        const ordered = sequence(scene([
          rectangle("back", "#0000ff", 60, 30, 100, 100),
          rectangle("front", "#ff0000", 100, 60, 100, 100),
        ]));
        const points = [[80, 50], [120, 80], [180, 80]];
        const first = await sample(page, ordered, 1, points);
        assert.deepEqual(first.points.map((pixel) => pixel.slice(0, 3)), [[0, 0, 255], [255, 0, 0], [255, 0, 0]]);
        const reversed = structuredClone(ordered);
        reversed.cues[0].layers = [black(), ...reversed.cues[0].layers.slice(1).reverse()];
        const second = await sample(page, reversed, 1, points);
        assert.deepEqual(rgb(second, 1), [0, 0, 255]);
        assert.notEqual(first.hash, second.hash);
        const translucent = structuredClone(ordered);
        translucent.cues[0].layers[2].transform.opacity = 0.5;
        const blended = await sample(page, translucent, 1, points);
        assert.ok(rgb(blended, 1)[0] >= 127 && rgb(blended, 1)[0] <= 129);
        assert.ok(rgb(blended, 1)[2] >= 126 && rgb(blended, 1)[2] <= 128);
        const masked = structuredClone(ordered);
        masked.cues[0].layers[2].mask = { kind: "circle", x: 50, y: 50, radius: 20 };
        const clipped = await sample(page, masked, 1, [[150, 110], [110, 70]]);
        assert.deepEqual(rgb(clipped, 0), [255, 0, 0]);
        assert.deepEqual(rgb(clipped, 1), [0, 0, 255]);
      } finally { await page.close(); }
    });

    await t.test("nested group motion and camera transformation change world coordinates", async () => {
      const page = await open();
      try {
        const plain = sequence(scene([{
          id: "assembly", kind: "group", transform: { x: 40, y: 20 },
          layers: [rectangle("subject", "#ff0000", 50, 40, 20, 20)],
        }]));
        const points = [[100, 70], [130, 70], [60, 40]];
        const before = await sample(page, plain, 1, points);
        assert.deepEqual(rgb(before, 0), [255, 0, 0]);
        const groupMotion = structuredClone(plain);
        groupMotion.cues[0].layers[1].keyframes = [{ at: 0, x: 40 }, { at: 2, x: 100 }];
        const moved = await sample(page, groupMotion, 1, points);
        assert.deepEqual(rgb(moved, 0), [0, 0, 0]);
        assert.deepEqual(rgb(moved, 1), [255, 0, 0]);
        const cameraMotion = structuredClone(plain);
        cameraMotion.cues[0].camera = {
          keyframes: [{ at: 0, scale: 1, x: 0 }, { at: 1, scale: 2, x: 30 }],
        };
        const focused = await sample(page, cameraMotion, 1, points);
        assert.deepEqual(rgb(focused, 0), [0, 0, 0]);
        assert.deepEqual(rgb(focused, 2), [255, 0, 0]);
        assert.notEqual(focused.hash, moved.hash, "camera is a world transform, not an individual layer offset");
      } finally { await page.close(); }
    });

    await t.test("rotated camera remains covered by background bleed at every canvas corner", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([
          rectangle("overscan-background", "#203040", -100, -100, 520, 380),
        ], { camera: { keyframes: [{ at: 0, scale: 1, rotation: 0 }, { at: 2, scale: 1, rotation: 12 }] } }));
        const corners = await sample(page, timeline, 2, [[0, 0], [319, 0], [0, 179], [319, 179]]);
        assert.deepEqual(corners.points.map((pixel) => pixel.slice(0, 3)),
          Array.from({ length: 4 }, () => [32, 48, 64]), "all four corners show the overscanned set, never uncovered canvas");
      } finally { await page.close(); }
    });

    await t.test("the ending holds a full-size readable title inside the safe area", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([{
          id: "end-card", kind: "text", text: "END CARD", font_size: 24, font_weight: 800,
          color: "#ffffff", transform: { x: 64, y: 38 },
          keyframes: [{ at: 0, x: 380, opacity: 0 }, { at: 0.8, x: -220, opacity: 0.3 },
            { at: 2, x: 64, y: 38, opacity: 1, ease: "cubicOut" }, { at: 3.6, x: 64, y: 38, opacity: 1 }],
        }]));
        const landing = await sample(page, timeline, 3.8, [], [], true);
        const hold = await sample(page, timeline, 3.2);
        assert.deepEqual(landing.hash, hold.hash, "the settled end card remains unchanged through the final hold");
        assert.ok(landing.brightBounds, "the final frame contains visible end-card text");
        assert.ok(landing.brightBounds.left >= 16 && landing.brightBounds.top >= 16 &&
          landing.brightBounds.right < 304 && landing.brightBounds.bottom < 164,
        `end-card bounds stay inside the 5% safe inset: ${JSON.stringify(landing.brightBounds)}`);
      } finally { await page.close(); }
    });

    await t.test("text fill and polyline strokes genuinely reveal instead of only fading", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([
          { id: "headline", kind: "text", text: "MOTION", font_size: 40, color: "#ffffff",
            stroke: "#ff0000", stroke_width: 1, transform: { x: 20, y: 20 },
            keyframes: [{ at: 0, reveal: 0 }, { at: 2, reveal: 1 }] },
          { id: "stroke", kind: "path", points: [[20, 130], [180, 130], [180, 150]],
            color: "#00ffff", stroke_width: 4, line_cap: "butt",
            keyframes: [{ at: 0, reveal: 0 }, { at: 2, reveal: 1 }] },
        ]));
        const regions = [[10, 10, 280, 65], [10, 120, 200, 40]];
        const hidden = await sample(page, timeline, 0, [], regions);
        const partial = await sample(page, timeline, 0.5, [[30, 130], [100, 130]], regions);
        const complete = await sample(page, timeline, 2, [[180, 140]], regions);
        assert.equal(hidden.regions[0].white, 0, "hidden text fill is absent");
        assert.ok(hidden.regions[0].red > 20, "outline remains a separate visible treatment");
        assert.equal(hidden.regions[1].cyan, 0);
        assert.ok(partial.regions[0].white > 20);
        assert.ok(complete.regions[0].white > partial.regions[0].white * 2);
        assert.deepEqual(rgb(partial, 0), [0, 255, 255]);
        assert.deepEqual(rgb(partial, 1), [0, 0, 0], "unrevealed path section is absent");
        assert.deepEqual(rgb(complete, 0), [0, 255, 255]);
        assert.ok(complete.regions[1].cyan > partial.regions[1].cyan * 2);
      } finally { await page.close(); }
    });

    await t.test("out-of-order seeks reproduce exact rasterized frames", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([
          rectangle("subject", "#ff0000", 50, 60, 60, 35, {
            keyframes: [{ at: 0, x: -80, opacity: 0 }, { at: 1, x: 80, opacity: 1, ease: "cubicOut" },
              { at: 3, x: 200, rotation: 35, scale: 1.2, ease: "cubicInOut" }],
          }),
          { id: "headline", kind: "text", text: "MOVE", font_size: 30, color: "#ffffff",
            transform: { x: 80, y: 20 }, letter_reveal: true,
            keyframes: [{ at: 0, reveal: 0 }, { at: 2, reveal: 1 }] },
        ], { camera: { keyframes: [{ at: 0, scale: 1 }, { at: 3, scale: 1.15, x: -20 }] } }));
        const times = [0.1, 0.7, 1.4, 2.5];
        const expected = new Map();
        for (const time of times) expected.set(time, (await sample(page, timeline, time)).hash);
        assert.equal(new Set(expected.values()).size, times.length, "representative times are visibly different");
        for (const time of [2.5, 0.7, 1.4, 0.1, 0.7]) {
          assert.equal((await sample(page, timeline, time)).hash, expected.get(time), `deterministic seek at ${time}s`);
        }
      } finally { await page.close(); }
    });

    await t.test("trimming preserves the original easing, camera and footage frame at retained absolute times", async () => {
      await twoColorVideo(path.join(fixture, "assets", "two-colors.mp4"));
      const page = await open();
      try {
        const original = sequence(scene([
          { id: "video", kind: "footage", src: "assets/two-colors.mp4", source_offset: 0,
            width: 320, height: 180, fit: "stretch" },
          rectangle("tile", "#ffff00", 20, 100, 40, 25, {
            keyframes: [{ at: 0, x: 20, scale: 0.6 }, { at: 2, x: 180, scale: 1, ease: "spring" },
              { at: 4, x: 240, rotation: 20, ease: "cubicInOut" }],
          }),
          { id: "headline", kind: "text", text: "TRIM", font_size: 25, color: "#ffffff",
            transform: { x: 100, y: 20 }, letter_reveal: true,
            keyframes: [{ at: 0, reveal: 0 }, { at: 2, reveal: 1, ease: "cubicOut" }] },
        ], { camera: { keyframes: [{ at: 0, scale: 1 }, { at: 4, scale: 1.08, x: -10, ease: "cubicInOut" }] } }));
        const retained = [1.5, 2.4];
        const hashes = new Map();
        for (const time of retained) hashes.set(time, (await sample(page, original, time)).hash);
        const left = structuredClone(original);
        moveCue(left, "shot", 1, "left");
        assert.equal(left.cues[0].animation_offset_sec, 1);
        assert.equal(left.cues[0].animation_duration_sec, 4);
        for (const time of retained) assert.equal((await sample(page, left, time)).hash, hashes.get(time), `left trim preserves ${time}s`);
        const both = structuredClone(left);
        moveCue(both, "shot", 3, "right");
        for (const time of retained) assert.equal((await sample(page, both, time)).hash, hashes.get(time), `both trims preserve ${time}s`);
        const right = structuredClone(original);
        moveCue(right, "shot", 3, "right");
        for (const time of retained) assert.equal((await sample(page, right, time)).hash, hashes.get(time), `right trim preserves ${time}s`);
      } finally { await page.close(); }
    });

    await t.test("path point keyframes morph actual geometry and remain deterministic when seeking", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([{
          id: "shape", kind: "path", points: [[40, 120], [160, 120], [280, 120]],
          color: "#00ffff", stroke_width: 4, line_cap: "butt",
          point_keyframes: [{ at: 0, points: [[40, 120], [160, 120], [280, 120]] },
            { at: 2, points: [[40, 120], [160, 40], [280, 120]], ease: "cubicInOut" }],
        }]));
        const points = [[160, 120], [160, 80], [160, 40]];
        const initial = await sample(page, timeline, 0, points);
        const middle = await sample(page, timeline, 1, points);
        const final = await sample(page, timeline, 2, points);
        assert.deepEqual(rgb(initial, 0), [0, 255, 255]);
        assert.deepEqual(rgb(middle, 0), [0, 0, 0]);
        assert.deepEqual(rgb(middle, 1), [0, 255, 255]);
        assert.deepEqual(rgb(final, 1), [0, 0, 0]);
        assert.deepEqual(rgb(final, 2), [0, 255, 255]);
        assert.equal(new Set([initial.hash, middle.hash, final.hash]).size, 3);
        for (const [time, expected] of [[1, middle], [0, initial], [2, final], [1, middle]]) {
          assert.equal((await sample(page, timeline, time, points)).hash, expected.hash, `morph seek at ${time}s`);
        }
      } finally { await page.close(); }
    });

    await t.test("same video source at two independent offsets displays different frames", { timeout: 45000 }, async () => {
      const source = path.join(fixture, "assets", "two-colors.mp4");
      await twoColorVideo(source);
      const page = await open();
      try {
        const footage = (id, x, offset) => ({
          id, kind: "footage", src: "assets/two-colors.mp4", source_offset: offset,
          in_sec: 0, out_sec: 1, width: 160, height: 90, fit: "stretch", transform: { x, y: 45 },
        });
        const timeline = sequence(scene([footage("earlier", 0, 0), footage("later", 160, 2)]));
        const points = [[80, 90], [240, 90]];
        const first = await sample(page, timeline, 0.4, points);
        assert.ok(isRed(rgb(first, 0)), `earlier offset should be red: ${rgb(first, 0)}`);
        assert.ok(isBlue(rgb(first, 1)), `later offset should be blue: ${rgb(first, 1)}`);
        await sample(page, timeline, 0.8, points);
        assert.equal((await sample(page, timeline, 0.4, points)).hash, first.hash, "video seeks backwards reproducibly");
        const swapped = structuredClone(timeline);
        swapped.cues[0].layers[1].source_offset = 2;
        swapped.cues[0].layers[2].source_offset = 0;
        const next = await sample(page, swapped, 0.4, points);
        assert.ok(isBlue(rgb(next, 0)));
        assert.ok(isRed(rgb(next, 1)));
        assert.notEqual(first.hash, next.hash, "same-source layers must not share a mutable video frame");
      } finally { await page.close(); }
    });

    await t.test("new images and same-layer video source replacements load without reloading the page", { timeout: 45000 }, async () => {
      await twoColorVideo(path.join(fixture, "assets", "two-colors.mp4"));
      await run(ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "color=c=lime:size=160x90:rate=30:duration=4",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(fixture, "assets", "green.mp4")]);
      const page = await open();
      try {
        const timeline = sequence(scene([]));
        const points = [[160, 90]];
        const blank = await sample(page, timeline, 0.4, points);
        const png = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 8; canvas.height = 8;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, 8, 8);
          return canvas.toDataURL("image/png").split(",")[1];
        });
        await fs.writeFile(path.join(fixture, "assets", "new.png"), Buffer.from(png, "base64"));
        timeline.cues[0].layers.push({ id: "new", kind: "image", src: "assets/new.png",
          width: 320, height: 180, fit: "stretch" });
        const image = await sample(page, timeline, 0.4, points);
        assert.deepEqual(rgb(image, 0), [0, 255, 0]);
        assert.notEqual(blank.hash, image.hash, "new assets load after the first render");
        timeline.cues[0].layers = [black(), { id: "replaceable", kind: "footage", src: "assets/two-colors.mp4",
          width: 320, height: 180, fit: "stretch", source_offset: 2, out_sec: 1 }];
        const previous = await sample(page, timeline, 0.4, points);
        assert.ok(isBlue(rgb(previous, 0)));
        timeline.cues[0].layers[1].src = "assets/green.mp4";
        timeline.cues[0].layers[1].source_offset = 0;
        const replacement = await sample(page, timeline, 0.4, points);
        assert.ok(rgb(replacement, 0)[1] > 200 && rgb(replacement, 0)[0] < 40 && rgb(replacement, 0)[2] < 40);
        assert.notEqual(previous.hash, replacement.hash, "a reused layer ID cannot retain its old video source");
      } finally { await page.close(); }
    });

    await t.test("transitions preserve moving outgoing geometry at the boundary and keep a separate visible clock", async () => {
      const page = await open();
      try {
        const timeline = sequence(scene([
          rectangle("moving-subject", "#0000ff", 20, 120, 20, 20, {
            keyframes: [{ at: 0, x: 20 }, { at: 2, x: 260 }],
          }),
        ], { id: "outgoing", end_sec: 2 }));
        timeline.cues.push(scene([rectangle("incoming-fill", "#ff0000", 0, 0, 320, 180)], {
          id: "incoming", start_sec: 2, end_sec: 4,
          transition: { type: "dissolve", duration_sec: 0.5 },
        }));
        const points = [[266, 130], [205, 130], [20, 130]];
        const terminal = await sample(page, timeline, 2 - 1 / 30, points);
        assert.ok(isBlue(rgb(terminal, 0)), "the final outgoing frame has the moving subject at its terminal position");
        for (const type of ["push", "wipe", "zoom", "dissolve", "flow", "iris"]) {
          const variant = structuredClone(timeline);
          variant.cues[1].transition = { type, direction: "right", duration_sec: 0.5 };
          const boundary = await sample(page, variant, 2, points);
          assert.ok(isBlue(rgb(boundary, 0)), `${type}: boundary does not rewind the outgoing subject`);
          assert.deepEqual(rgb(boundary, 1), [0, 0, 0], `${type}: no subject at the replayed-tail position`);
        }
        const during = await sample(page, timeline, 2.1, points);
        assert.ok(rgb(during, 0)[2] > 100, "outgoing subject remains at the terminal position while the dissolve progresses");
        assert.ok(rgb(during, 1)[2] < 10, "outgoing subject does not replay its tail under the dissolve");
        assert.equal((await sample(page, timeline, 2.1, points)).hash, during.hash, "direct and repeated boundary sampling agree");

        const flow = structuredClone(timeline);
        flow.cues[1].transition = { type: "flow", direction: "right", duration_sec: 0.5 };
        for (const offset of [0.2, 1]) {
          const trimmed = structuredClone(flow);
          trimmed.cues[1].animation_offset_sec = offset;
          trimmed.cues[1].animation_duration_sec = 4;
          for (const time of [2, 2.1, 2.25, 2.5]) {
            assert.equal((await sample(page, trimmed, time)).hash, (await sample(page, flow, time)).hash,
              `source offset ${offset} does not shift transition progress at ${time}s`);
          }
        }
      } finally { await page.close(); }
    });

    await t.test("transitions seek the real outgoing terminal video frame independently of playback history", { timeout: 45000 }, async () => {
      await twoColorVideo(path.join(fixture, "assets", "two-colors.mp4"));
      const page = await open();
      try {
        const timeline = sequence(scene([{ id: "video", kind: "footage", src: "assets/two-colors.mp4",
          width: 320, height: 180, fit: "stretch", source_offset: 1 }], { id: "outgoing", end_sec: 2 }));
        timeline.cues.push(scene([rectangle("incoming-fill", "#ff0000", 0, 0, 320, 180)], {
          id: "incoming", start_sec: 2, end_sec: 4,
          transition: { type: "wipe", direction: "right", duration_sec: 0.5 },
        }));
        const points = [[80, 90], [240, 90], [160, 90]];
        const direct = await sample(page, timeline, 2.1, points);
        assert.ok(isRed(rgb(direct, 0)), "wipe reveals the incoming shot on its chosen side");
        assert.ok(isBlue(rgb(direct, 1)), "unseen outgoing shot is prepared at its blue terminal frame");
        assert.ok(isRed(rgb(await sample(page, timeline, 0.2, points), 0)), "earlier outgoing video time is red");
        assert.equal((await sample(page, timeline, 2.1, points)).hash, direct.hash, "transition seek is independent of playback history");
        for (const type of ["push", "wipe", "zoom", "dissolve", "flow", "iris", "cut"]) {
          const variant = structuredClone(timeline);
          variant.cues[1].transition = { type, direction: "left", duration_sec: 0.5 };
          const before = await sample(page, variant, 2, points);
          const during = await sample(page, variant, 2.1, points);
          const after = await sample(page, variant, 2.5, points);
          assert.ok(isRed(rgb(after, 0)) && isRed(rgb(after, 1)), `${type}: incoming shot fills the frame after transition`);
          if (type === "cut") {
            assert.ok(isRed(rgb(before, 0)) && isRed(rgb(during, 1)), "cut has no outgoing-frame animation");
          } else {
            assert.ok(isBlue(rgb(before, 0)) && isBlue(rgb(before, 1)), `${type}: starts from the outgoing terminal frame`);
            assert.notEqual(before.hash, during.hash, `${type}: transition makes an actual pixel change`);
            assert.notEqual(during.hash, after.hash, `${type}: transition reaches a distinct final composition`);
          }
        }
        const flow = structuredClone(timeline);
        flow.cues[1].transition = { type: "flow", direction: "right", duration_sec: 0.5 };
        const curvedPoints = [[80, 10], [160, 10], [240, 10], [80, 90], [160, 90], [240, 90],
          [80, 170], [160, 170], [240, 170]];
        const curved = await sample(page, flow, 2.25, curvedPoints);
        assert.ok(curved.points.some(isRed), `the wave reveals a leading lobe: ${JSON.stringify(curved.points)}`);
        assert.ok(curved.points.some(isBlue), `the curved edge leaves a trailing trough behind the lobe: ${JSON.stringify(curved.points)}`);
        assert.notEqual(isRed(rgb(curved, 1)), isRed(rgb(curved, 4)),
          "a fixed screen column changes state along the curved reveal rather than a straight page wipe");
        assert.equal((await sample(page, flow, 2.25, curvedPoints)).hash, curved.hash,
          "the curved transition is deterministic after a repeated seek");
        for (const [direction, incomingPoint, outgoingPoint] of [
          ["right", [80, 90], [240, 90]], ["left", [240, 90], [80, 90]],
          ["down", [160, 45], [160, 135]], ["up", [160, 135], [160, 45]],
        ]) {
          flow.cues[1].transition.direction = direction;
          const frame = await sample(page, flow, 2.25, [incomingPoint, outgoingPoint]);
          assert.ok(isRed(rgb(frame, 0)) && isBlue(rgb(frame, 1)), `${direction}: flow reveals from the specified edge`);
        }
        const iris = structuredClone(timeline);
        iris.cues[1].transition = { type: "iris", duration_sec: 0.5, origin_x: 0.2, origin_y: 0.7 };
        const focused = await sample(page, iris, 2.25, [[64, 126], [300, 10]]);
        assert.ok(isRed(rgb(focused, 0)) && isBlue(rgb(focused, 1)), "iris reveals from its authored focal point, not the canvas center");
      } finally { await page.close(); }
    });

    await t.test("presentation and studio scenes use the shared transition compositor", async () => {
      const page = await open();
      try {
        const oldPage = scene([], { id: "report-a", scene: "report", start_sec: 0, end_sec: 2,
          page_number: 1, page: { type: "bullets", title: "Evidence", bullets: ["First result"] } });
        const newPage = scene([], { id: "report-b", scene: "report", start_sec: 2, end_sec: 4,
          page_number: 2, page: { type: "chart", title: "Measured outcome", values: [20, 60], labels: ["A", "B"] },
          transition: { type: "flow", direction: "left", duration_sec: 0.5 } });
        const report = sequence(oldPage);
        report.cues = [oldPage, newPage];
        report.presentation = { brand: "Report", accent: "#c94b3c", pages: 2, genre: "report" };
        const reportMid = await sample(page, report, 2.25);
        assert.notEqual(reportMid.hash, (await sample(page, report, 2)).hash,
          "report pages visibly composite old and incoming scene states");
        assert.equal((await sample(page, report, 2.25)).hash, reportMid.hash,
          "report transition remains deterministic after seeking");

        const oldStudio = scene([], { id: "studio-a", scene: "studio", start_sec: 0, end_sec: 2, camera: "studio" });
        const newStudio = scene([], { id: "studio-b", scene: "studio", start_sec: 2, end_sec: 4, camera: "screen",
          headline: "Screen focus", body: "A screen scene", transition: { type: "iris", duration_sec: 0.5, origin_x: 0.5, origin_y: 0.4 } });
        const studio = sequence(oldStudio);
        studio.cues = [oldStudio, newStudio];
        studio.studio = { brand: "Studio", ticker: "Ticker", title: "Explainer",
          screen_rect: [55, 141, 870, 360],
          hosts: [{ id: "host-a", name: "A", color: "#bf4a45", expressions: {} },
            { id: "host-b", name: "B", color: "#4c7185", expressions: {} }] };
        const studioMid = await sample(page, studio, 2.25);
        assert.notEqual(studioMid.hash, (await sample(page, studio, 2)).hash,
          "studio camera changes composite through the shared iris transition");
        assert.equal((await sample(page, studio, 2.25)).hash, studioMid.hash,
          "studio transition is deterministic after seeking");
      } finally { await page.close(); }
    });

    assert.deepEqual(errors, [], "browser modules and media load without page or HTTP errors");
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    const resolved = path.resolve(fixture);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("vm-composition-pixels-"), "Only remove this isolated temporary fixture");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
