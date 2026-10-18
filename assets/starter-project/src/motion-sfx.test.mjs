import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateSoundEvents, synthesizeMotionSfx } from "./motion-sfx.mjs";

async function fixture() {
  return fs.mkdtemp(path.join(os.tmpdir(), "vm-motion-sfx-"));
}
async function dispose(root) {
  const resolved = path.resolve(root);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("vm-motion-sfx-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
function readWave(wav) {
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  return {
    frames: (wav.length - 44) / 4,
    at: (frame, channel = 0) => wav.readInt16LE(44 + frame * 4 + channel * 2),
  };
}

test("SFX rejects malformed, unaligned, duplicated and out-of-range events", () => {
  const base = { id: "impact", at_sec: 0.2, type: "hit" };
  assert.deepEqual(validateSoundEvents([base], 2, 30), []);
  assert.deepEqual(validateSoundEvents([], 2, 30), []);
  assert.deepEqual(validateSoundEvents([{ ...base, gain: 0, pan: -1, duration_sec: 0.05 }], 2, 30), []);
  for (const events of [
    null, {}, [null], [[]], [{ ...base, id: "" }], [{ ...base, id: "bad\u0000id" }],
    [base, { ...base }], [{ ...base, type: "boom" }], [{ ...base, gain: NaN }],
    [{ ...base, gain: -0.1 }], [{ ...base, gain: 1.1 }], [{ ...base, pan: Infinity }],
    [{ ...base, pan: -1.1 }], [{ ...base, pan: 1.1 }], [{ ...base, at_sec: -1 }],
    [{ ...base, at_sec: NaN }], [{ ...base, at_sec: 2 }], [{ ...base, at_sec: 1.9 }],
    [{ ...base, at_sec: 0.01 }], [{ ...base, duration_sec: 0.049 }], [{ ...base, duration_sec: 2.01 }],
    [{ ...base, duration_sec: Infinity }], [{ ...base, duration_sec: 2 }],
    [{ ...base, another: true }], Array.from({ length: 257 }, (_, index) => ({ ...base, id: String(index) })),
  ]) assert.ok(validateSoundEvents(events, 2, 30).length, JSON.stringify(events));
  for (const duration of [NaN, 0, -1, 601, Infinity]) assert.ok(validateSoundEvents([], duration, 30).length);
  for (const fps of [NaN, 0, -1, 29.97, 241, Infinity]) assert.ok(validateSoundEvents([], 2, fps).length);
});

test("SFX empty plan produces no file or implicit audio track", async () => {
  const root = await fixture();
  try {
    const result = await synthesizeMotionSfx(root, [], { duration: 1, fps: 30 });
    assert.equal(result.src, null);
    assert.deepEqual(result.events, []);
    assert.deepEqual(await fs.readdir(root), []);
    await assert.rejects(() => synthesizeMotionSfx(root, [{ id: "late", type: "hit", at_sec: 0.9 }], { duration: 1, fps: 30 }), /beyond/);
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await dispose(root); }
});

test("SFX WAV is deterministic, content addressed, stereo 48 kHz and order invariant", async () => {
  const root = await fixture();
  try {
    const events = [
      { id: "whoosh", type: "whoosh", at_sec: 0.1, duration_sec: 0.3, pan: -0.3 },
      { id: "impact", type: "hit", at_sec: 0.5, gain: 0.8 },
      { id: "type", type: "tick", at_sec: 0.8, pan: 0.7 },
    ];
    const first = await synthesizeMotionSfx(root, events, { duration: 1, fps: 30 });
    const file = path.join(root, first.src), wav = await fs.readFile(file), parsed = readWave(wav);
    assert.equal(parsed.frames, 48000);
    assert.equal(first.sha256, createHash("sha256").update(wav).digest("hex"));
    assert.equal(first.src, `audio/sfx/motion-${first.sha256}.wav`);
    assert.ok(first.peak > 0 && first.peak < 0.9);
    assert.equal(first.reused, false);
    const before = await fs.stat(file);
    const second = await synthesizeMotionSfx(root, [...events].reverse(), { duration: 1, fps: 30 });
    assert.equal(second.sha256, first.sha256);
    assert.deepEqual(second.events, first.events);
    assert.equal(second.reused, true);
    assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs, "existing matching WAV is not rewritten");
    assert.deepEqual(await fs.readFile(file), wav);
    const hashes = [];
    for (const type of ["hit", "whoosh", "tick"]) {
      hashes.push((await synthesizeMotionSfx(root, [{ id: "same", type, at_sec: 0.2, duration_sec: 0.2 }], { duration: 1, fps: 30 })).sha256);
    }
    assert.equal(new Set(hashes).size, 3, "effect types synthesize distinct original waveforms");
  } finally { await dispose(root); }
});

test("SFX events begin at their exact frame/sample placement with silent boundaries and panning", async () => {
  const root = await fixture();
  try {
    const result = await synthesizeMotionSfx(root, [
      { id: "left-hit", type: "hit", at_sec: 6 / 30, duration_sec: 0.1, pan: -1, gain: 1 },
      { id: "right-tick", type: "tick", at_sec: 15 / 30, duration_sec: 0.08, pan: 1, gain: 1 },
    ], { duration: 1, fps: 30 });
    const wav = readWave(await fs.readFile(path.join(root, result.src)));
    assert.deepEqual(result.events.map((event) => [event.frame, event.start_sample, event.end_sample]),
      [[6, 9600, 14400], [15, 24000, 27840]]);
    for (const [index, event] of result.events.entries()) {
      const audible = index;
      let first = -1, count = 0;
      for (let frame = event.start_sample; frame < event.end_sample; frame += 1) {
        assert.equal(wav.at(frame, 1 - audible), 0, "hard-panned opposite channel stays silent");
        if (wav.at(frame, audible) !== 0) { if (first < 0) first = frame; count += 1; }
      }
      assert.equal(wav.at(event.start_sample, audible), 0, "de-click attack starts at zero");
      assert.equal(wav.at(event.end_sample - 1, audible), 0, "de-click release finishes at zero");
      assert.ok(first > event.start_sample && first < event.start_sample + 100, "sound appears immediately after the planned boundary");
      assert.ok(count > 100);
    }
    for (let frame = 0; frame < wav.frames; frame += 1) {
      if (result.events.some((event) => frame >= event.start_sample && frame < event.end_sample)) continue;
      assert.equal(wav.at(frame, 0), 0);
      assert.equal(wav.at(frame, 1), 0);
    }
    const fractional = await synthesizeMotionSfx(root, [{ id: "fractional", type: "tick", at_sec: 1 / 29 }],
      { duration: 1, fps: 29 });
    assert.equal(fractional.events[0].start_sample, Math.round(48000 / 29));
    assert.ok(Math.abs(fractional.events[0].timing_error_sec) <= 0.5 / 48000);
    assert.equal(fractional.events[0].at_sec, 1 / 29, "frame timestamp is retained, not silently quantized");
  } finally { await dispose(root); }
});

test("SFX overlapping peaks normalize safely without PCM clipping or gain-zero noise", async () => {
  const root = await fixture();
  try {
    const events = Array.from({ length: 64 }, (_, index) => ({
      id: `impact-${index}`, type: "hit", at_sec: 0.2, duration_sec: 0.2, gain: 1,
    }));
    const result = await synthesizeMotionSfx(root, events, { duration: 1, fps: 30 });
    const wav = readWave(await fs.readFile(path.join(root, result.src)));
    assert.ok(result.normalization_gain > 0 && result.normalization_gain < 1);
    assert.ok(result.raw_peak > 1);
    let peak = 0;
    for (let frame = 0; frame < wav.frames; frame += 1) {
      for (let channel = 0; channel < 2; channel += 1) peak = Math.max(peak, Math.abs(wav.at(frame, channel)));
    }
    assert.ok(peak <= Math.floor(32767 * 0.9));
    assert.ok(peak > 29000, "safe normalization retains usable effect level");
    const silent = await synthesizeMotionSfx(root, [{ id: "silent", type: "whoosh", at_sec: 0, gain: 0 }],
      { duration: 1, fps: 30 });
    assert.equal(silent.peak, 0);
    assert.equal(silent.normalization_gain, 1);
    const data = (await fs.readFile(path.join(root, silent.src))).subarray(44);
    assert.ok(data.every((byte) => byte === 0));
  } finally { await dispose(root); }
});

test("SFX refuses a content-address collision without overwriting the existing file", async () => {
  const root = await fixture();
  try {
    const events = [{ id: "effect", type: "hit", at_sec: 0.2 }];
    const result = await synthesizeMotionSfx(root, events, { duration: 1, fps: 30 });
    const file = path.join(root, result.src);
    await fs.writeFile(file, "test-only corrupted existing output");
    await assert.rejects(() => synthesizeMotionSfx(root, events, { duration: 1, fps: 30 }), /different contents.*nothing was overwritten/);
    assert.equal(await fs.readFile(file, "utf8"), "test-only corrupted existing output");
  } finally { await dispose(root); }
});

test("SFX refuses an audio-directory junction that escapes the project", async () => {
  const root = await fixture();
  const project = path.join(root, "project"), external = path.join(root, "external");
  const junction = path.join(project, "audio");
  try {
    await fs.mkdir(project); await fs.mkdir(external);
    await fs.symlink(external, junction, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => synthesizeMotionSfx(project, [{ id: "effect", type: "tick", at_sec: 0.2 }],
      { duration: 1, fps: 30 }), /outside the project/);
    assert.deepEqual(await fs.readdir(external), [], "no external output directory was created");
  } finally {
    await fs.unlink(junction).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await dispose(root);
  }
});
