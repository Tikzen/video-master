// Studio performance + display state as pure functions of absolute time.
// Rules (references/craft/genre-studio.md §3, §6): audio state ≠ display state; a default
// value belongs to one named place (the open), never to a silent gap; whole-sticker
// transforms only; the same timestamp draws the same frame in any playback order.
import { trackEnabled } from "./model.js";

const byTimeline = new WeakMap();
const KINDS = new Set(["voice", "subtitle", "expression"]);
// The editor mutates cues in place, so the cache is keyed by a cheap checksum, not identity alone.
function signature(timeline) {
  let h = timeline.cues.length;
  for (const c of timeline.cues) {
    if (!KINDS.has(c.kind)) continue;
    h = (h * 31 + Math.round(c.start_sec * 1000) * 7 + Math.round(c.end_sec * 1000) + (c.energy?.length || 0)
      + String(c.speaker || "").length * 13 + String(c.expression || c.text || "").length * 17 + c.track_id.length) % 2147483647;
  }
  for (const t of timeline.tracks || []) h = (h * 31 + (t.visible === false ? 1 : 0) + (t.muted ? 2 : 0)) % 2147483647;
  return h;
}
function index(timeline) {
  const key = signature(timeline);
  let entry = byTimeline.get(timeline);
  if (entry?.key === key) return entry;
  const enabled = timeline.cues.filter((c) => trackEnabled(timeline, c));
  const sorted = (kind) => enabled.filter((c) => c.kind === kind).sort((a, b) => a.start_sec - b.start_sec);
  const voices = {}, norms = new Map();
  for (const cue of sorted("voice")) {
    (voices[cue.speaker] ||= []).push(cue);
    const values = [...(cue.energy || [])].sort((a, b) => a - b);
    // Normalize per line so quiet and loud recordings move the host by the same visual amount.
    norms.set(cue, Math.max(1e-4, values[Math.floor(values.length * 0.95)] || 0));
  }
  entry = { key, voices, norms, subtitles: sorted("subtitle"), expressions: sorted("expression") };
  byTimeline.set(timeline, entry);
  return entry;
}

function levelFrom({ voices, norms }, speaker, time) {
  for (const cue of voices[speaker] || []) {
    if (time < cue.start_sec || time >= cue.end_sec) continue;
    const value = cue.energy?.[Math.floor((time - cue.start_sec) * 30)] ?? 0;
    return Math.min(1.2, value / norms.get(cue));
  }
  return 0;
}
/** Normalized speech level 0..~1.2 of one speaker at time t (0 outside their voice cues). */
export const speechLevel = (timeline, speaker, time) => levelFrom(index(timeline), speaker, time);

export const DRIVE = { rate: 60, window: 1.4, attack: 0.04, release: 0.14, hz: 3.0, damping: 0.25 };
/**
 * Voice-driven sticker motion. An envelope follower (fast attack, slow release) feeds an
 * under-damped spring, so a loud syllable stretches the sticker, the spring rebounds past
 * rest, and when the voice stops the motion eases down instead of cutting off.
 * Simulated on a fixed absolute grid from rest over a look-back window: pure in `time`.
 */
export function speechDrive(timeline, speaker, time, options = {}) {
  const p = { ...DRIVE, ...options }, dt = 1 / p.rate, steps = Math.round(p.window * p.rate);
  const omega = 2 * Math.PI * p.hz, k = omega * omega, c = 2 * p.damping * omega;
  const end = Math.floor(time * p.rate + 1e-6), data = index(timeline);
  let env = 0, x = 0, v = 0;
  for (let i = end - steps; i <= end; i++) {
    const target = levelFrom(data, speaker, i * dt);
    env += (target - env) * (1 - Math.exp(-dt / (target > env ? p.attack : p.release)));
    v += (k * (env - x) - c * v) * dt;
    x += v * dt;
  }
  return { level: env, stretch: x, velocity: v };
}

/**
 * Whole-sticker transform about the sticker's base (feet / desk crop line).
 * Idle sway and breathing run on global time so a new line never resets the phase.
 * Amplitudes are sized to stay visible in a ~135 px PIP (verify on encoded frames).
 */
export function stickerTransform(timeline, speaker, time, seed = 0, amount = 1) {
  const drive = speechDrive(timeline, speaker, time);
  const stretch = 0.05 * amount * drive.stretch;              // speech: up to ≈ 5 % taller, rebounds below rest
  const breathe = 0.009 * Math.sin(time * 1.55 + seed * 1.7);  // idle: ≈ 0.9 % whole-body breath
  const scaleY = 1 + stretch + breathe;
  const scaleX = 1 - 0.55 * stretch - 0.35 * breathe;          // keep apparent volume
  const sway = (1.25 * Math.sin(time * 0.83 + seed * 2.1) + 0.9 * drive.stretch * Math.sin(time * 2.4 + seed)) * Math.PI / 180;
  const shiftX = 0.004 * Math.sin(time * 0.61 + seed * 3.3);   // fraction of sticker height
  return { scaleX, scaleY, rotation: sway, shiftX, drive };
}

/**
 * Display state for caption, name plate and PIP. Within the programme the most recent
 * line holds through silence until the next one starts. Before the first line there is
 * no line (the open owns its own copy). Never derived from "is anyone speaking now".
 */
export function heldLine(timeline, time) {
  const { subtitles } = index(timeline);
  let current;
  for (const cue of subtitles) { if (cue.start_sec <= time) current = cue; else break; }
  return current;
}
/** Speaker who owns the PIP / name plate: the most recent line's speaker, held through gaps. */
export function heldSpeaker(timeline, time) {
  let best;
  for (const cue of timeline.cues) {
    if (cue.kind !== "voice" || !cue.speaker || cue.start_sec > time) continue;
    if (!best || cue.start_sec > best.start_sec) best = cue;
  }
  return best?.speaker;
}

const variantKey = (expressions, base, variant) => expressions?.[`${base}_${variant}`] ? `${base}_${variant}` : base;
/**
 * Sprite expression for a speaker: whole-image swaps with a short cross-fade, plus optional
 * expression-differential variants `<expr>_talk` (mouth open) and `<expr>_blink`
 * (eyes closed) generated from the differential sheet. Missing variants fall back to the base.
 */
export function spriteFrame(timeline, host, time, { blink = 0, fade = 0.18 } = {}) {
  const { expressions } = index(timeline);
  const own = expressions.filter((c) => c.speaker === host.id);
  const at = (t) => own.find((c) => t >= c.start_sec && t < c.end_sec)?.expression || "neutral";
  let boundary = -Infinity;
  for (const c of own) for (const edge of [c.start_sec, c.end_sec]) if (edge <= time && edge > boundary) boundary = edge;
  const current = at(time), previous = Number.isFinite(boundary) ? at(boundary - 1e-4) : current;
  const mix = previous === current ? 1 : Math.min(1, Math.max(0, (time - boundary) / fade));
  const level = speechLevel(timeline, host.id, Math.floor(time * 12) / 12);   // mouth flaps on twos (12 fps)
  const pick = (base) => {
    const name = host.expressions?.[base] ? base : "neutral";
    if (blink > 0.5) return variantKey(host.expressions, name, "blink");
    return level > 0.32 ? variantKey(host.expressions, name, "talk") : name;
  };
  return { current: pick(current), previous: pick(previous), mix };
}
