import test from "node:test";
import assert from "node:assert/strict";
import { compileMvPlan } from "./mv-plan.mjs";
import { validateTransition, transitionSource } from "./composition-transitions.js";

const plan = () => ({
  schema: "video-master.mv-plan.v1",
  project: { name: "Custom performance", width: 640, height: 360, fps: 60, duration_seconds: 4 },
  design: { title: "Own words", palette: ["#ffffff", "#111111", "#ff4444", "#66aaff"] },
  cues: [{ id: "opening", track_id: "scenes", kind: "scene", scene: "composition", start_sec: 0, end_sec: 4,
    camera: { keyframes: [{ at: 0, scale: 1 }, { at: 2, scale: 1.5 }] },
    layers: [{ id: "word", kind: "text", text: "Own words", transform: { x: 80, y: 100 },
      keyframes: [{ at: 0, reveal: 0 }, { at: 0.5, reveal: 1 }] }] }],
  storyboard: [{ id: "opening", purpose: "Words grow into the camera" }],
});

test("agent plan preserves authored layers, timing, camera, words and scene notes", () => {
  const source = plan(), compiled = compileMvPlan(source, { container: "mp4" });
  assert.equal(compiled.project.fps, 60);
  assert.equal(compiled.timeline.cues[0].camera.keyframes[1].scale, 1.5);
  assert.equal(compiled.storyboard[0].purpose, "Words grow into the camera");
  assert.equal(compiled.timeline.creation.kind, "agent-plan");
  compiled.timeline.cues[0].layers[0].text = "Changed";
  assert.equal(source.cues[0].layers[0].text, "Own words");
});

test("plan rejects conflicts, inert narration-only inputs and incomplete scene coverage", () => {
  assert.throws(() => compileMvPlan(plan(), {}, { duration_seconds: 8 }), /conflicts/);
  for (const mutate of [
    (value) => delete value.project.fps,
    (value) => value.cues.splice(0),
    (value) => value.cues[0].start_sec = 0.5,
    (value) => value.cues[0].end_sec = 3,
    (value) => value.cues[0].layers[0].keyframes[1].x = "100",
    (value) => value.storyboard.push({ id: "not-in-timeline" }),
    (value) => value.cues.push({ id: "vm-music-bed" }),
    (value) => value.cues.push({ id: "second-music", kind: "music", src: "audio/song.wav",
      track_id: "scenes", start_sec: 0, end_sec: 4 }),
  ]) {
    const value = plan(); mutate(value);
    assert.throws(() => compileMvPlan(value, {}));
  }
});

test("transition holds the outgoing terminal frame without replay and owns the visible incoming clock", () => {
  const first = plan().cues[0], second = { ...first, id: "next", start_sec: 4, end_sec: 8,
    transition: { type: "push", direction: "left", duration_sec: 0.3 } };
  const sequence = { tracks: [{ id: "scenes", visible: true }], cues: [first, second], fps: 60 };
  assert.deepEqual(validateTransition(second), []);
  assert.equal(transitionSource(sequence, second, 4).time, 4 - 1 / 60);
  assert.equal(transitionSource(sequence, second, 4.15).time, 4 - 1 / 60);
  assert.equal(transitionSource(sequence, second, 4.3).time, 4 - 1 / 60);
  assert.equal(transitionSource(sequence, second, 4.31), null);
  second.animation_duration_sec = 8;
  for (const offset of [0.15, 2]) {
    second.animation_offset_sec = offset;
    assert.equal(transitionSource(sequence, second, 4).time, 4 - 1 / 60, "animation trim does not skip transition onset");
    assert.equal(transitionSource(sequence, second, 4.15).time, 4 - 1 / 60);
    assert.equal(transitionSource(sequence, second, 4.31), null);
  }
  assert.equal(transitionSource(sequence, first, 0), null);
  sequence.tracks[0].visible = false;
  assert.equal(transitionSource(sequence, second, 4), null);
});

test("new mask transitions validate only meaningful normalized iris origins", () => {
  for (const transition of [
    { type: "flow", direction: "up", duration_sec: 0.4 },
    { type: "iris", duration_sec: 0.4 },
    { type: "iris", duration_sec: 0.4, origin_x: 0.2, origin_y: 0.8 },
  ]) assert.deepEqual(validateTransition({ start_sec: 0, end_sec: 4, transition }), []);
  for (const transition of [
    { type: "flow", origin_x: 0.5, duration_sec: 0.4 },
    { type: "iris", duration_sec: 0.4, origin_x: 1.1 },
    { type: "iris", duration_sec: 0.4, origin_y: NaN },
  ]) assert.ok(validateTransition({ start_sec: 0, end_sec: 4, transition }).length);
});

test("transition source supports contiguous studio and presentation scenes without crossing renderer families", () => {
  const first = { id: "first", kind: "scene", scene: "studio", track_id: "scenes", start_sec: 0, end_sec: 2 };
  const second = { id: "second", kind: "scene", scene: "studio", track_id: "scenes", start_sec: 2, end_sec: 4,
    transition: { type: "iris", duration_sec: 0.4 } };
  const timeline = { fps: 30, tracks: [{ id: "scenes", visible: true }], cues: [first, second], studio: {} };
  assert.equal(transitionSource(timeline, second, 2).cue.id, "first");
  timeline.cues[0].scene = "composition";
  assert.equal(transitionSource(timeline, second, 2), null, "a studio shot cannot inherit from a different renderer family");
});

test("transition validation rejects unknown effects and unbounded durations", () => {
  for (const transition of [{ type: "shake", duration_sec: 0.2 }, { type: "push", duration_sec: 6 },
    { type: "wipe", duration_sec: -1 }, { type: "zoom", duration_sec: 0.2, direction: "diagonal" },
    { type: "dissolve", duration_sec: 0.2, randomness: true }]) {
    assert.ok(validateTransition({ start_sec: 0, end_sec: 4, transition }).length);
  }
  assert.ok(validateTransition({ start_sec: 2, end_sec: 2.2, animation_duration_sec: 4,
    animation_offset_sec: 1, transition: { type: "flow", duration_sec: 0.3 } })
    .some((error) => error.includes("outside incoming scene")),
  "a longer animation source cannot allow a transition beyond the visible cue");
});
