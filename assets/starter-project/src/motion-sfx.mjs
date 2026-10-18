import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const TYPES = Object.freeze({ hit: 0.28, whoosh: 0.45, tick: 0.08 });
const EVENT_KEYS = new Set(["id", "at_sec", "type", "gain", "duration_sec", "pan"]);
const MAX_EVENTS = 256;
const MAX_PCM = Math.floor(32767 * 0.9);
const TAU = Math.PI * 2;
const insideRoot = (root, file) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export function validateSoundEvents(events = [], duration, fps) {
  const errors = [];
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) errors.push("sound events: duration must be positive and at most 600 seconds");
  if (!Number.isInteger(fps) || fps <= 0 || fps > 240) errors.push("sound events: fps must be an integer from 1 to 240");
  if (!Array.isArray(events)) return [...errors, "sound_events: expected an array"];
  if (events.length > MAX_EVENTS) return [...errors, `sound_events: at most ${MAX_EVENTS} events are supported`];
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    const label = `sound_events[${index}]`;
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      errors.push(`${label}: expected an event object`);
      continue;
    }
    if (typeof event.id !== "string" || !event.id.trim() || event.id.length > 100 || /[\u0000-\u001f]/.test(event.id)) errors.push(`${label}.id: expected a nonempty ID of at most 100 characters`);
    else if (ids.has(event.id)) errors.push(`${label}.id: duplicate event ID`);
    ids.add(event.id);
    if (!Object.hasOwn(TYPES, event.type)) errors.push(`${label}.type: expected hit, whoosh or tick`);
    if (Object.keys(event).some((key) => !EVENT_KEYS.has(key))) errors.push(`${label}: unsupported event property`);
    if (!Number.isFinite(event.at_sec) || event.at_sec < 0 || event.at_sec >= duration) errors.push(`${label}.at_sec: outside the timeline`);
    else if (Number.isInteger(fps) && Math.abs(event.at_sec * fps - Math.round(event.at_sec * fps)) > 1e-6) errors.push(`${label}.at_sec: must be frame aligned; timestamps are not silently snapped`);
    const length = event.duration_sec ?? TYPES[event.type];
    if (!Number.isFinite(length) || length < 0.05 || length > 2) errors.push(`${label}.duration_sec: expected 0.05..2 seconds`);
    else if (Number.isFinite(event.at_sec) && event.at_sec + length > duration + 1e-9) errors.push(`${label}: effect extends beyond the timeline`);
    if (event.gain != null && (!Number.isFinite(event.gain) || event.gain < 0 || event.gain > 1)) errors.push(`${label}.gain: expected 0..1`);
    if (event.pan != null && (!Number.isFinite(event.pan) || event.pan < -1 || event.pan > 1)) errors.push(`${label}.pan: expected -1..1`);
  }
  return errors;
}

function resolvedEvents(events, fps, sampleCount) {
  return events.map((event) => {
    const duration = event.duration_sec ?? TYPES[event.type];
    const start = Math.round(event.at_sec * SAMPLE_RATE);
    const end = Math.min(sampleCount, Math.round((event.at_sec + duration) * SAMPLE_RATE));
    return {
      id: event.id, type: event.type, at_sec: event.at_sec, frame: Math.round(event.at_sec * fps),
      gain: event.gain ?? 0.7, duration_sec: duration, pan: event.pan ?? 0,
      start_sample: start, end_sample: end, sample_count: end - start,
      actual_start_sec: start / SAMPLE_RATE, actual_end_sec: end / SAMPLE_RATE,
      timing_error_sec: start / SAMPLE_RATE - event.at_sec,
    };
  }).sort((a, b) => a.start_sample - b.start_sample || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function addEvent(mix, event) {
  let random = createHash("sha256").update(`video-master.motion-sfx.v1:${event.type}:${event.id}`).digest().readUInt32LE(0) || 1;
  const angle = (event.pan + 1) * Math.PI / 4;
  const left = Math.cos(angle) * event.gain, right = Math.sin(angle) * event.gain;
  const count = event.sample_count, duration = count / SAMPLE_RATE;
  const attack = Math.max(1, Math.min(Math.round(SAMPLE_RATE * (event.type === "tick" ? 0.001 : 0.003)), Math.floor(count / 3)));
  const release = Math.max(1, Math.min(Math.round(SAMPLE_RATE * 0.012), Math.floor(count / 3)));
  let fast = 0, slow = 0;
  for (let index = 0; index < count; index += 1) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    const noise = (random >>> 0) / 2147483648 - 1;
    const time = index / SAMPLE_RATE, progress = index / (count - 1);
    const enter = Math.sin(Math.min(1, index / attack) * Math.PI / 2) ** 2;
    const leave = Math.sin(Math.min(1, (count - 1 - index) / release) * Math.PI / 2) ** 2;
    let value;
    if (event.type === "hit") {
      const phase = TAU * (55 * time + 105 * 0.035 * (1 - Math.exp(-time / 0.035)));
      value = Math.sin(phase) * Math.exp(-time / Math.max(0.035, duration * 0.3)) * 0.8 +
        (noise * 0.25 + Math.sin(TAU * 980 * time) * 0.12) * Math.exp(-time / 0.022);
    } else if (event.type === "whoosh") {
      const cutoff = 450 + 7200 * Math.sin(Math.PI * progress) ** 2;
      fast += (1 - Math.exp(-TAU * cutoff / SAMPLE_RATE)) * (noise - fast);
      slow += (1 - Math.exp(-TAU * cutoff * 0.18 / SAMPLE_RATE)) * (noise - slow);
      value = ((fast - slow) * 1.4 + Math.sin(TAU * (350 * time + 1500 * time * time / duration)) * 0.08) *
        Math.sin(Math.PI * progress) ** 1.4;
    } else {
      value = (Math.sin(TAU * 2600 * time) * 0.65 + Math.sin(TAU * 1700 * time) * 0.2 + noise * 0.15) *
        Math.exp(-time / Math.min(0.025, duration * 0.22));
    }
    const sample = value * enter * leave;
    const offset = (event.start_sample + index) * CHANNELS;
    mix[offset] += sample * left;
    mix[offset + 1] += sample * right;
  }
}

function waveBuffer(mix) {
  let rawPeak = 0;
  for (const sample of mix) rawPeak = Math.max(rawPeak, Math.abs(sample));
  const normalization = rawPeak > MAX_PCM / 32767 ? MAX_PCM / 32767 / rawPeak : 1;
  const wav = Buffer.alloc(44 + mix.length * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(CHANNELS, 22); wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28); wav.writeUInt16LE(CHANNELS * 2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(mix.length * 2, 40);
  let peak = 0;
  for (let index = 0; index < mix.length; index += 1) {
    const sample = Math.round(mix[index] * normalization * 32767);
    wav.writeInt16LE(sample, 44 + index * 2);
    peak = Math.max(peak, Math.abs(sample));
  }
  return { wav, normalization_gain: normalization, raw_peak: rawPeak, peak: peak / 32767 };
}

async function outputDirectory(root) {
  const realRoot = await fs.realpath(path.resolve(root));
  if (!(await fs.stat(realRoot)).isDirectory()) throw new Error("SFX project root must be a directory");
  let directory = realRoot;
  for (const segment of ["audio", "sfx"]) {
    directory = path.join(directory, segment);
    try { await fs.mkdir(directory); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const actual = await fs.realpath(directory);
    if (!insideRoot(realRoot, actual)) throw new Error("SFX output directory resolves outside the project");
    if (!(await fs.stat(actual)).isDirectory()) throw new Error("SFX output directory is not a directory");
    directory = actual;
  }
  return directory;
}

export async function synthesizeMotionSfx(root, events = [], { duration, fps } = {}) {
  const errors = validateSoundEvents(events, duration, fps);
  if (errors.length) throw new Error(errors.join("; "));
  const receipt = {
    schema: "video-master.motion-sfx.v1", sample_rate: SAMPLE_RATE, channels: CHANNELS,
    duration, fps, provenance: "Original deterministic procedural motion effects; no sampled music, external recording or cloned voice.",
  };
  if (!events.length) return { ...receipt, src: null, events: [], sha256: null, peak: 0, normalization_gain: 1 };
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const resolved = resolvedEvents(events, fps, sampleCount);
  const mix = new Float32Array(sampleCount * CHANNELS);
  for (const event of resolved) addEvent(mix, event);
  const { wav, ...levels } = waveBuffer(mix);
  const sha256 = createHash("sha256").update(wav).digest("hex");
  const name = `motion-${sha256}.wav`, src = `audio/sfx/${name}`;
  const target = path.join(await outputDirectory(root), name);
  let reused = false;
  try { await fs.writeFile(target, wav, { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.lstat(target);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== wav.length ||
        !(await fs.readFile(target)).equals(wav)) throw new Error("Content-addressed SFX output already exists with different contents; nothing was overwritten");
    reused = true;
  }
  return { ...receipt, src, events: resolved, sha256, samples: sampleCount, ...levels, reused };
}
