import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { auditMotion, buildMotionSamples, visibleScenes, readMotionProject, parseReviewArgs } from "./motion-review.mjs";
import { createContactSheet } from "./contact-sheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureData = () => ({
  project: { width: 320, height: 180, fps: 10, duration_seconds: 4 },
  timeline: { fps: 10, duration_seconds: 4,
    tracks: [{ id: "scenes", visible: true, muted: false, exclusive: true },
      { id: "hidden", visible: false }, { id: "visible-muted", visible: true, muted: true }],
    cues: [
      { id: "a", kind: "scene", track_id: "scenes", start_sec: 0, end_sec: 2, scene: "opening" },
      { id: "b", kind: "scene", track_id: "scenes", start_sec: 2, end_sec: 4, scene: "hero" },
      { id: "hidden", kind: "scene", track_id: "hidden", start_sec: 0, end_sec: 4, scene: "opening" },
    ],
  },
});

test("motion audit is advisory, reads optional intent and reviews intentional motif returns", () => {
  const { project, timeline } = fixtureData();
  const unchanged = JSON.stringify(timeline);
  const basic = auditMotion(project, timeline);
  assert.equal(basic.status, "advisory");
  assert.equal(basic.scene_count, 2);
  assert.ok(basic.findings.some((finding) => finding.code === "MOTION_INTENT_NOT_IN_DATA"));
  assert.equal("score" in basic, false);
  const storyboard = { scenes: [
    { id: "a", motif: "orbit", action: "assemble", purpose: "introduce", camera: "wide" },
    { id: "b", motif: "orbit", action: "resolve", purpose: "payoff", camera: "close" },
  ] };
  const variation = auditMotion(project, timeline, storyboard);
  assert.deepEqual(variation.findings.map((finding) => finding.code), ["MOTIF_RETURN_REVIEW"]);
  assert.deepEqual(variation.findings[0].related_scene_ids, ["a"]);
  assert.equal(JSON.stringify(timeline), unchanged);
  timeline.cues[1].scene = "opening";
  const repeating = auditMotion(project, timeline);
  assert.ok(repeating.findings.some((finding) => finding.code === "ADJACENT_SCENE_REVIEW"));
});

test("motion review uses renderer visibility semantics, not visual mute", () => {
  const { project, timeline } = fixtureData();
  timeline.cues.push({ id: "overlay", kind: "scene", track_id: "visible-muted", start_sec: 0, end_sec: 1 });
  assert.deepEqual(visibleScenes(timeline).map((row) => row.id), ["a", "overlay", "b"]);
  assert.equal(auditMotion(project, timeline).scene_count, 3);
  const samples = buildMotionSamples(project, timeline);
  assert.equal(samples.some((row) => row.scene_ids.includes("hidden")), false);
  assert.ok(samples[0].scene_ids.includes("overlay"));
});

test("samples include cut sides with previous attribution, action peaks and frame alignment", () => {
  const { project, timeline } = fixtureData();
  const storyboard = [{ id: "b", review_times: [2.43] }];
  const samples = buildMotionSamples(project, timeline, { storyboard });
  const before = samples.find((sample) => sample.frame === 19);
  const after = samples.find((sample) => sample.frame === 20);
  assert.ok(before.labels.includes("cut before"));
  assert.deepEqual(before.scene_ids, ["a"]);
  assert.ok(after.labels.includes("cut after"));
  assert.deepEqual(after.scene_ids, ["b"]);
  assert.equal(samples.find((sample) => sample.frame === 24).time_sec, 2.4);
  assert.ok(samples.find((sample) => sample.frame === 24).labels.includes("action peak"));
  assert.equal(samples.at(-1).frame, 39);
  assert.ok(samples.every((sample) => Number.isInteger(sample.frame) && sample.time_sec === sample.frame / 10));
  assert.deepEqual(buildMotionSamples(project, timeline, { storyboard }), samples);
});

test("sample ranges and caps reject invalid or unsafe requests without dropping mandatory cuts", () => {
  const { project, timeline } = fixtureData();
  for (const options of [{ start: -1 }, { start: 3, end: 2 }, { end: 5 }, { start: NaN },
    { maxSamples: 0 }, { maxSamples: 129 }, { maxSamples: 1.5 }]) {
    assert.throws(() => buildMotionSamples(project, timeline, options));
  }
  assert.throws(() => buildMotionSamples(project, timeline, { maxSamples: 2 }), /exceed/);
  const range = buildMotionSamples(project, timeline, { start: 1.91, end: 2.11 });
  assert.deepEqual(range.map((sample) => sample.frame), [20, 21]);
  assert.ok(range.every((sample) => sample.scene_ids.includes("b")));
  assert.throws(() => buildMotionSamples(project, timeline, { start: 1.91, end: 1.99 }), /no complete frame/);
  assert.throws(() => buildMotionSamples(project, timeline, { storyboard: [{ id: "b", review_times: [1.5] }] }), /absolute seconds/);
  assert.throws(() => buildMotionSamples(project, timeline, { storyboard: [{ id: "b", review_times: [Infinity] }] }), /finite/);
  assert.throws(() => buildMotionSamples(project, timeline, { storyboard: [{ id: "b", review_times: 3 }] }), /array/);
});

test("CLI parsing and project reads expose concrete errors; optional storyboard is not required", async () => {
  assert.equal(parseReviewArgs(["--project", "somewhere", "--json"]).json, true);
  assert.equal(parseReviewArgs(["--save-frames"], true).saveFrames, true);
  assert.throws(() => parseReviewArgs(["--save-frames"]), /Unknown option/);
  assert.throws(() => parseReviewArgs(["--made-up"]), /Unknown option/);
  assert.throws(() => parseReviewArgs(["--project"]), /Missing value/);
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "vm-motion-read-"));
  try {
    const data = fixtureData();
    await fs.writeFile(path.join(fixture, "video.json"), JSON.stringify(data.project));
    await fs.writeFile(path.join(fixture, "timeline.json"), JSON.stringify(data.timeline));
    assert.deepEqual((await readMotionProject(fixture)).storyboard, []);
    await assert.rejects(() => readMotionProject(fixture, "missing.json"), /Cannot read storyboard/);
    await fs.writeFile(path.join(fixture, "storyboard.json"), JSON.stringify({ scenes: "not an array" }));
    await assert.rejects(() => readMotionProject(fixture), /must be an array/);
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test("rendered contact sheet is deterministic, non-overwriting, read-only and rejects stateful renderers", { timeout: 120000 }, async () => {
  let modules;
  for (const location of [root, process.cwd()]) {
    try { modules = path.dirname(path.dirname(createRequire(path.join(location, "package.json")).resolve("playwright/package.json"))); break; }
    catch {}
  }
  assert.ok(modules, "Run this integration test in an initialized project with installed Playwright.");
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "vm-motion-sheet-"));
  try {
    await fs.cp(path.join(root, "src"), path.join(fixture, "src"), { recursive: true });
    await fs.copyFile(path.join(root, "package.json"), path.join(fixture, "package.json"));
    await fs.symlink(modules, path.join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const data = fixtureData(), protectedFiles = { "video.json": JSON.stringify(data.project),
      "timeline.json": JSON.stringify(data.timeline), ".env": "NO_PAID_REQUESTS=test\n",
      "confirmations/test.json": '{"status":"do-not-change"}' };
    await fs.mkdir(path.join(fixture, "confirmations"));
    for (const [name, contents] of Object.entries(protectedFiles)) await fs.writeFile(path.join(fixture, name), contents);
    const first = await createContactSheet(fixture, { output: "renders/preview/first.png", columns: 2, saveFrames: true });
    const second = await createContactSheet(fixture, { output: "renders/preview/second.png", columns: 2 });
    assert.equal(first.seek_independence.verified, true);
    assert.equal(first.seek_independence.first_sha256, first.seek_independence.repeated_sha256);
    assert.deepEqual(first.samples.map((sample) => sample.sha256), second.samples.map((sample) => sample.sha256));
    assert.equal(first.sha256, second.sha256);
    assert.ok(first.samples.every((sample) => /^[a-f0-9]{64}$/.test(sample.sha256)));
    for (const sample of first.samples) {
      assert.ok(sample.src, "the manifest points to a retained full-size PNG");
      const frame = await fs.readFile(path.join(fixture, sample.src));
      assert.equal(frame.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(frame.readUInt32BE(16), 320);
      assert.equal(frame.readUInt32BE(20), 180);
    }
    const before = await fs.readFile(first.output);
    await assert.rejects(() => createContactSheet(fixture, { output: "renders/preview/first.png" }), /already exists/);
    assert.deepEqual(await fs.readFile(first.output), before);
    await fs.writeFile(path.join(fixture, "renders/preview/manifest-only.json"), "{}");
    await assert.rejects(() => createContactSheet(fixture, { output: "renders/preview/manifest-only.png" }), /already exists/);
    await assert.rejects(() => fs.access(path.join(fixture, "renders/preview/manifest-only.png")));
    for (const [name, contents] of Object.entries(protectedFiles)) assert.equal(await fs.readFile(path.join(fixture, name), "utf8"), contents);
    await assert.rejects(() => fs.access(path.join(fixture, "planning.json")));
    data.timeline.tracks.push({ id: "music", muted: true });
    data.timeline.cues.push({ id: "demo", track_id: "music", kind: "music", start_sec: 0, end_sec: 4, src: "audio/demo-score.wav" });
    await fs.writeFile(path.join(fixture, "timeline.json"), JSON.stringify(data.timeline));
    await assert.rejects(() => createContactSheet(fixture, { output: "renders/preview/no-demo.png" }), /never creates demo audio/);
    await assert.rejects(() => fs.access(path.join(fixture, "audio/demo-score.wav")));
    await fs.writeFile(path.join(fixture, "timeline.json"), protectedFiles["timeline.json"]);
    await fs.writeFile(path.join(fixture, "src/render.html"), `<!doctype html><canvas id="canvas"></canvas><script>
      let count = 0;
      window.renderFrameAt = async () => {
        const c = document.querySelector("canvas"); c.width = 320; c.height = 180;
        const ctx = c.getContext("2d"); ctx.fillStyle = "rgb(" + (++count) + ",0,0)";
        ctx.fillRect(0, 0, 320, 180); return c.toDataURL("image/png");
      };
    </script>`);
    await assert.rejects(() => createContactSheet(fixture, { output: "renders/preview/stateful.png" }), /seek\/order dependent/);
    await assert.rejects(() => fs.access(path.join(fixture, "renders/preview/stateful.png")));
    await assert.rejects(() => fs.access(path.join(fixture, "renders/preview/stateful.json")));
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
