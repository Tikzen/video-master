import { validateFinish } from "./finish.js";
import { validateMotion, validateComposition, validateAnimationSpan, animationDuration } from "./composition.js";
import { validateTransition } from "./composition-transitions.js";
import { isAudio, trackEnabled } from "./track-state.js";
export { isAudio, trackEnabled } from "./track-state.js";

export const clone = (value) => JSON.parse(JSON.stringify(value));
export const frame = (seconds, fps) => Math.round(seconds * fps) / fps;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function timecode(seconds, fps) {
  const f = Math.max(0, Math.round(seconds * fps));
  return [Math.floor(f / fps / 3600), Math.floor(f / fps / 60) % 60,
    Math.floor(f / fps) % 60, f % fps]
    .map((n) => String(n).padStart(2, "0")).join(":");
}

export function validate(project, timeline) {
  const errors = [];
  for (const key of ["width", "height", "fps"]) {
    if (!Number.isInteger(project[key]) || project[key] <= 0) errors.push(`${key}: expected a positive integer`);
  }
  if (project.width % 2 || project.height % 2) errors.push("H.264 dimensions must be even");
  errors.push(...validateFinish(project));
  if (!Number.isFinite(timeline.duration_seconds) || timeline.duration_seconds <= 0) errors.push("Invalid duration");
  if (timeline.fps !== project.fps) errors.push("Timeline and project fps differ");
  if (timeline.duration_seconds !== project.duration_seconds) errors.push("Timeline and project duration differ");
  if (!Array.isArray(timeline.tracks) || !Array.isArray(timeline.cues)) return ["Tracks/cues must be arrays"];
  const tracks = new Set(timeline.tracks.map((t) => t.id));
  if (tracks.size !== timeline.tracks.length) errors.push("Duplicate track ID");
  const ids = new Set();
  for (const c of timeline.cues) {
    if (typeof c.id !== "string" || !c.id || c.id.includes("::") || ids.has(c.id)) errors.push(`Invalid/duplicate cue ID (reserved ::): ${c.id}`);
    ids.add(c.id);
    if (!tracks.has(c.track_id)) errors.push(`${c.id}: unknown track`);
    if (!Number.isFinite(c.start_sec) || !Number.isFinite(c.end_sec) ||
      c.start_sec < 0 || c.end_sec > timeline.duration_seconds + 1e-6 ||
      c.end_sec - c.start_sec < 1 / timeline.fps - 1e-6) errors.push(`${c.id}: invalid time interval`);
    for (const key of ["start_sec", "end_sec"]) {
      if (Math.abs(c[key] * timeline.fps - Math.round(c[key] * timeline.fps)) > 0.001) errors.push(`${c.id}: ${key} not aligned to a frame`);
    }
    if (isAudio(c) && !c.src) errors.push(`${c.id}: missing audio file`);
    if (["image","footage"].includes(c.kind) && !c.src) errors.push(`${c.id}: missing visual file`);
    if (c.src && (typeof c.src !== "string" || /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[A-Za-z]:/.test(c.src))) errors.push(`${c.id}: source must be project-relative`);
    for (const key of ["volume","source_offset","source_duration","fade_in","fade_out"]) {
      if (c[key] != null && (!Number.isFinite(c[key]) || c[key] < 0)) errors.push(`${c.id}: invalid ${key}`);
    }
    if(c.duck_gain!=null&&(!Number.isFinite(c.duck_gain)||c.duck_gain<0||c.duck_gain>1))errors.push(`${c.id}: invalid duck_gain`);
    errors.push(...validateAnimationSpan(c).map((error) => `${c.id}: ${error}`));
    errors.push(...validateMotion(c.keyframes, animationDuration(c), c.transform).map((error) => `${c.id}: ${error}`));
    if (c.scene === "composition") errors.push(...validateComposition(c).map((error) => `${c.id}: ${error}`));
    else if (c.camera && typeof c.camera === "object") {
      errors.push(...validateMotion(c.camera.keyframes, animationDuration(c), c.camera.transform).map((error) => `${c.id}: camera.${error}`));
    }
    if (c.transition) errors.push(...validateTransition(c).map((error) => `${c.id}: ${error}`));
  }
  for (const track of timeline.tracks.filter((t) => t.exclusive)) {
    const cues = timeline.cues.filter((c) => c.track_id === track.id).sort((a, b) => a.start_sec - b.start_sec);
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start_sec < cues[i - 1].end_sec - 1e-6) errors.push(`${track.id}: clips overlap`);
    }
  }
  return errors;
}

export function moveCue(timeline, id, proposed, mode = "move") {
  const cue = timeline.cues.find((c) => c.id === id);
  if (!cue) return;
  const fps = timeline.fps, min = 1 / fps, length = cue.end_sec - cue.start_sec;
  const exclusive = timeline.tracks.find((t) => t.id === cue.track_id)?.exclusive;
  const siblings = exclusive ? timeline.cues.filter((c) => c.track_id === cue.track_id && c.id !== id) : [];
  const previous = siblings.filter((c) => c.end_sec <= cue.start_sec + 1e-6).sort((a,b) => b.end_sec - a.end_sec)[0];
  const next = siblings.filter((c) => c.start_sec >= cue.end_sec - 1e-6).sort((a,b) => a.start_sec - b.start_sec)[0];
  const lower = previous?.end_sec ?? 0, upper = next?.start_sec ?? timeline.duration_seconds;
  const animated = cue.scene === "composition" || cue.keyframes?.length ||
    cue.camera?.keyframes?.length || cue.animation_duration_sec != null;
  const sourceLength = animationDuration(cue), offset = cue.animation_offset_sec ?? 0;
  if (mode === "left") {
    let sourceLower = isAudio(cue) || cue.kind === "footage" ? Math.max(lower, cue.start_sec - (cue.source_offset || 0)) : lower;
    if (animated) sourceLower = Math.max(sourceLower, cue.start_sec - offset);
    const start = frame(clamp(proposed, sourceLower, cue.end_sec - min), fps);
    const delta = start - cue.start_sec;
    if (isAudio(cue) || cue.kind === "footage") cue.source_offset = Math.max(0, (cue.source_offset || 0) + delta);
    if (animated) {
      cue.animation_duration_sec = sourceLength;
      cue.animation_offset_sec = Math.max(0, offset + delta);
    }
    cue.start_sec = start;
  } else if (mode === "right") {
    let max = upper;
    if ((isAudio(cue) || cue.kind === "footage") && cue.source_duration) max = Math.min(max, cue.start_sec + cue.source_duration - (cue.source_offset || 0));
    if (animated) {
      max = Math.min(max, cue.start_sec + sourceLength - offset);
      cue.animation_duration_sec = sourceLength;
      cue.animation_offset_sec = offset;
    }
    cue.end_sec = frame(clamp(proposed, cue.start_sec + min, max), fps);
  } else {
    const start = frame(clamp(proposed, lower, upper - length), fps);
    cue.start_sec = start;
    cue.end_sec = frame(start + length, fps);
  }
}
