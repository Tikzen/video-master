import test from "node:test";
import assert from "node:assert/strict";
import { speechDrive, stickerTransform, heldLine, heldSpeaker, spriteFrame } from "./studio-motion.js";

// Two lines with a 0.433 s pause (the gap that caused the "back to frame one" regression).
function fixture() {
  const syllables = (seconds) => Array.from({ length: Math.round(seconds * 30) }, (_, i) => 0.02 + 0.18 * Math.max(0, Math.sin(i * 0.9)) ** 2);
  const tracks = ["captions", "voice-a", "voice-b", "expressions"].map((id) => ({ id, kind: id.startsWith("voice") ? "voice" : "graphics", visible: true, muted: false }));
  const cues = [
    { id: "v0", kind: "voice", track_id: "voice-a", speaker: "a", start_sec: 0.5, end_sec: 3.0, energy: syllables(2.5) },
    { id: "v1", kind: "voice", track_id: "voice-b", speaker: "b", start_sec: 3.433, end_sec: 6.0, energy: syllables(2.567) },
    { id: "c0", kind: "subtitle", track_id: "captions", speaker: "a", text: "第一句", start_sec: 0.5, end_sec: 3.0 },
    { id: "c1", kind: "subtitle", track_id: "captions", speaker: "b", text: "第二句", start_sec: 3.433, end_sec: 6.0 },
    { id: "e0", kind: "expression", track_id: "expressions", speaker: "a", expression: "smile", start_sec: 0.5, end_sec: 3.433 },
  ];
  return { tracks, cues };
}

test("display state holds the last line through every silent gap and has no mid-show default", () => {
  const timeline = fixture();
  assert.equal(heldLine(timeline, 0.2), undefined, "before the first line only the open owns the copy");
  for (let t = 3.0; t < 3.433; t += 1 / 30) {
    assert.equal(heldLine(timeline, t).id, "c0", `caption at ${t.toFixed(3)}s`);
    assert.equal(heldSpeaker(timeline, t), "a", `PIP speaker at ${t.toFixed(3)}s`);
  }
  assert.equal(heldLine(timeline, 3.44).id, "c1");
  assert.equal(heldSpeaker(timeline, 3.44), "b");
  assert.equal(heldLine(timeline, 9).id, "c1");
});

test("speech drive stretches with the voice, rebounds past rest and eases down after it stops", () => {
  const timeline = fixture(), fps = 30;
  const series = Array.from({ length: 7 * fps }, (_, f) => speechDrive(timeline, "a", f / fps).stretch);
  const speaking = series.slice(0.6 * fps, 3.0 * fps);
  const peak = Math.max(...speaking);
  assert.ok(peak > 0.6, `stretch follows loud syllables (peak ${peak.toFixed(3)})`);
  let rebounds = 0;
  for (let i = 1; i < speaking.length - 4; i++) {
    if (speaking[i] >= speaking[i - 1] && speaking[i] > speaking[i + 1] && speaking[i] - Math.min(...speaking.slice(i, i + 5)) > 0.2) rebounds++;
  }
  assert.ok(rebounds >= 4, `stretch rebounds between syllables (${rebounds} rebounds)`);
  assert.ok(Math.min(...series.slice(3.0 * fps, 4 * fps)) <= 0, "settling overshoots rest slightly instead of freezing stretched");
  const steps = series.slice(1).map((v, i) => Math.abs(v - series[i]));
  const maxStep = Math.max(...steps);
  const endStep = Math.max(...steps.slice(2.9 * fps, 3.3 * fps));
  assert.ok(endStep < maxStep, "no snap when the voice stops");
  assert.ok(Math.abs(series[3.0 * fps + 2]) > 0.05, "still moving right after the voice ends (eases, not cuts)");
  assert.ok(Math.max(...series.slice(4.3 * fps, 7 * fps).map(Math.abs)) < 0.12 * peak, "settles once silence continues");
  assert.ok(Math.max(...series.slice(0, 0.45 * fps).map(Math.abs)) < 1e-6, "no motion before speech");
});

test("sticker motion is a pure function of absolute time and visible at PIP size", () => {
  const timeline = fixture();
  const times = [5.2, 0.7, 3.1, 1.9, 3.1, 5.2];
  const random = times.map((t) => stickerTransform(timeline, "a", t, 0));
  const fresh = times.map((t) => stickerTransform(fixture(), "a", t, 0));
  assert.deepEqual(random, fresh);
  let lo = Infinity, hi = -Infinity;
  for (let f = 15; f < 90; f++) { const s = stickerTransform(timeline, "a", f / 30, 0).scaleY; lo = Math.min(lo, s); hi = Math.max(hi, s); }
  assert.ok((hi - lo) * 135 >= 3, `≥ 3 px vertical travel on a 135 px PIP (got ${((hi - lo) * 135).toFixed(2)} px)`);
});

test("sprite frames use whole-image differentials and fall back to the base image", () => {
  const timeline = fixture();
  const host = { id: "a", expressions: { neutral: "n.png", smile: "s.png", smile_talk: "st.png", smile_blink: "sb.png" } };
  const speaking = [];
  for (let f = 18; f < 85; f++) speaking.push(spriteFrame(timeline, host, f / 30).current);
  assert.ok(speaking.includes("smile_talk") && speaking.includes("smile"), "mouth differential alternates with speech");
  assert.equal(spriteFrame(timeline, host, 1.2, { blink: 1 }).current, "smile_blink");
  assert.equal(spriteFrame(timeline, { id: "a", expressions: { neutral: "n.png" } }, 1.2).current, "neutral");
  const crossing = spriteFrame(timeline, host, 3.433 + 0.05);
  assert.ok(crossing.mix < 1 && crossing.previous.startsWith("smile") && crossing.current === "neutral", "expression change cross-fades");
});
