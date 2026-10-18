import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { clone, validate, moveCue, timecode, frame } from "./model.js";
const project = JSON.parse(await fs.readFile(new URL("../video.json", import.meta.url)));
const timeline = JSON.parse(await fs.readFile(new URL("../timeline.json", import.meta.url)));
test("current project is a valid frame-aligned project", () => assert.deepEqual(validate(project, timeline), []));
const fixtureProject = { width: 640, height: 360, fps: 30, duration_seconds: 8 };
const editingFixture = () => ({
  fps: 30, duration_seconds: 8,
  tracks: [{ id: "scenes", visible: true, exclusive: true }, { id: "titles", visible: true }, { id: "music", muted: false }],
  cues: [
    { id: "scene-01", kind: "scene", track_id: "scenes", start_sec: 0, end_sec: 3 },
    { id: "scene-02", kind: "scene", track_id: "scenes", start_sec: 3, end_sec: 8 },
    { id: "title-01", kind: "title", track_id: "titles", start_sec: 0, end_sec: 3 },
    { id: "music-01", kind: "music", track_id: "music", src: "audio/music.wav", start_sec: 0, end_sec: 8, source_offset: 0 },
  ],
});
test("invalid cues, duplicate IDs and duration mismatch are rejected", () => {
  const changed = editingFixture();
  changed.cues[0].start_sec = -1;
  changed.cues.push(clone(changed.cues[0]));
  changed.duration_seconds++;
  assert.ok(validate(fixtureProject, changed).length >= 3);
});
test("trim clamps to neighboring scenes without overlapping", () => {
  const changed = editingFixture();
  moveCue(changed, "scene-01", 7, "right");
  assert.equal(changed.cues[0].end_sec, 3);
});
test("move stays inside duration and preserves length", () => {
  const changed = editingFixture();
  const cue = changed.cues.find((c) => c.id === "title-01");
  const length = cue.end_sec - cue.start_sec;
  moveCue(changed, cue.id, 100);
  assert.equal(cue.end_sec, 8);
  assert.ok(Math.abs(cue.end_sec - cue.start_sec - length) < 1e-8);
  assert.deepEqual(validate(fixtureProject, changed), []);
});
test("audio left trim changes source offset, not playback speed", () => {
  const changed = editingFixture(), cue = changed.cues.find((c) => c.kind === "music");
  moveCue(changed, cue.id, 1, "left");
  assert.equal(cue.source_offset, 1);
});
test("timecode and snapping are frame accurate", () => {
  assert.equal(timecode(2 + 1/30, 30), "00:00:02:01");
  assert.equal(frame(0.35, 30), 11/30);
});
