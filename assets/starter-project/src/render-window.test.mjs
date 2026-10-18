import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderWindow, audioSlices } from "./render-window.mjs";
import { mixGainExpression, playbackGain, voiceIntervals } from "./audio-mix.js";
import { generateMusic } from "./music-tools.mjs";
import { probe, run, ffmpegPath } from "./media.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("range rendering snaps time and retains original source offsets, fades and release tails", () => {
  const timeline = {
    duration_seconds: 6, fps: 30,
    tracks: [{ id: "voice", muted: false }, { id: "music", muted: false }, { id: "off", muted: true }],
    cues: [
      { id: "voice", kind: "voice", track_id: "voice", start_sec: 1, end_sec: 2, src: "voice.wav" },
      { id: "bed", kind: "music", track_id: "music", start_sec: 0.5, end_sec: 5.5, src: "bed.wav", source_offset: 2, volume: 0.2, duck_gain: 0.28, fade_in: 2, fade_out: 2 },
      { id: "muted", kind: "music", track_id: "off", start_sec: 0, end_sec: 6, src: "off.wav" },
      { id: "late", kind: "voice", track_id: "voice", start_sec: 4, end_sec: 5, src: "late.wav" },
    ],
  };
  const window = renderWindow(timeline, { start: 2.01, duration: 1 });
  assert.deepEqual(window, { start: 2, end: 3, duration: 1, fps: 30, frames: 30 });
  const [slice] = audioSlices(timeline, window);
  assert.equal(audioSlices(timeline, window).length, 1);
  assert.equal(slice.cue.id, "bed");
  assert.equal(slice.source_offset, 3.5);
  assert.equal(slice.duration, 1);
  assert.equal(slice.start_sec, 0);
  assert.equal(renderWindow(timeline, { start: 2 }).duration, 4);
  assert.throws(() => renderWindow(timeline, { start: -1 }), /Invalid/);
  assert.throws(() => renderWindow(timeline, { start: 5, duration: 2 }), /within/);
  assert.throws(() => renderWindow(timeline, { duration: 0.001 }), /frames/);
  assert.throws(() => renderWindow(timeline, { duration: Infinity }), /Invalid/);
  const expression = mixGainExpression(slice.cue, voiceIntervals(timeline), slice.source_start_sec);
  const evaluate = (local) => {
    const { min, max } = Math;
    const t = local;
    return eval(expression);
  };
  for (const time of [2, 2.1, 2.3, 2.9]) {
    assert.ok(Math.abs(evaluate(time - 2) - playbackGain(slice.cue, voiceIntervals(timeline), time)) < 1e-9);
  }
  assert.ok(evaluate(0) < 0.05, "speech release and the partly completed original fade remain active");
  assert.equal(timeline.cues[1].source_offset, 2, "slicing is non-destructive");
});

test("real range MP4 has absolute-time frames and audible source-trimmed audio", { timeout: 60000 }, async () => {
  await fs.mkdir(path.join(root, ".editor"), { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, ".editor", "range-render-"));
  try {
    await fs.cp(path.join(root, "src"), path.join(fixture, "src"), { recursive: true });
    await fs.copyFile(path.join(root, "package.json"), path.join(fixture, "package.json"));
    await fs.symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const music = await generateMusic(fixture, { duration: 4, style: "pulse" });
    const project = { name: "Range test", width: 640, height: 360, fps: 30, duration_seconds: 4 };
    const timeline = {
      schema: "video-master.timeline.v1", fps: 30, duration_seconds: 4,
      design: { title: "Range test", palette: ["#ffffff", "#161619", "#cc343c", "#4d84bd"] },
      tracks: [
        { id: "scenes", visible: true, muted: false, exclusive: true },
        { id: "music", visible: true, muted: false },
      ],
      cues: [
        { id: "opening", kind: "scene", track_id: "scenes", start_sec: 0, end_sec: 2, scene: "type", word: "FIRST" },
        { id: "later", kind: "scene", track_id: "scenes", start_sec: 2, end_sec: 4, scene: "grid" },
        { id: "bed", kind: "music", track_id: "music", start_sec: 0, end_sec: 4, src: music.src, volume: 0.3, fade_in: 0.2, fade_out: 0.4 },
      ],
    };
    await fs.writeFile(path.join(fixture, "video.json"), JSON.stringify(project));
    await fs.writeFile(path.join(fixture, "timeline.json"), JSON.stringify(timeline));
    const args = [path.join(fixture, "src/render.mjs"), "--start", "2", "--duration", "1", "--output", "renders/temp/range.mp4"];
    await run(process.execPath, args);
    const receipt = JSON.parse(await fs.readFile(path.join(fixture, "validation/range.json")));
    assert.equal(receipt.status, "passed");
    assert.equal(receipt.source_start_sec, 2);
    assert.equal(receipt.source_end_sec, 3);
    const info = await probe(path.join(fixture, "renders/temp/range.mp4"));
    assert.equal(info.streams.find((stream) => stream.codec_type === "video").nb_frames, "30");
    assert.ok(info.streams.some((stream) => stream.codec_type === "audio"));
    assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.05);
    const volume = await promisify(execFile)(ffmpegPath, ["-hide_banner", "-i", path.join(fixture, "renders/temp/range.mp4"), "-af", "volumedetect", "-vn", "-f", "null", "-"], { windowsHide: true });
    const meanVolume = Number(volume.stderr.match(/mean_volume: ([-\d.]+) dB/)?.[1]);
    assert.ok(Number.isFinite(meanVolume) && meanVolume < 0 && meanVolume > -50, `Audible range audio: ${meanVolume} dB`);
    assert.notDeepEqual(await fs.readFile(path.join(receipt.previews, "first.png")), await fs.readFile(path.join(receipt.previews, "last.png")));
    await assert.rejects(() => run(process.execPath, args), /Output already exists/);
  } finally {
    assert.ok(path.resolve(fixture).startsWith(path.resolve(root, ".editor") + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
