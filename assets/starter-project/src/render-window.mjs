import { isAudio, trackEnabled } from "./model.js";

export function renderWindow(timeline, { start = 0, duration, fps = timeline.fps } = {}) {
  if (!Number.isInteger(fps) || fps <= 0 || !Number.isFinite(start) || start < 0) {
    throw new Error("Invalid start/fps override");
  }
  const startFrame = Math.round(start * fps), sourceStart = startFrame / fps;
  const requestedDuration = duration ?? timeline.duration_seconds - sourceStart;
  if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) throw new Error("Invalid duration override");
  const frames = Math.round(requestedDuration * fps), end = sourceStart + frames / fps;
  if (frames < 1 || sourceStart >= timeline.duration_seconds || end > timeline.duration_seconds + 1e-6) {
    throw new Error("Render range must contain frames within the timeline");
  }
  return { start: sourceStart, end, duration: frames / fps, fps, frames };
}

export function audioSlices(timeline, window) {
  return timeline.cues.filter((cue) => isAudio(cue) && trackEnabled(timeline, cue))
    .filter((cue) => cue.start_sec < window.end && cue.end_sec > window.start)
    .map((cue) => {
      const sourceStart = Math.max(cue.start_sec, window.start);
      return {
        cue,
        source_start_sec: sourceStart,
        start_sec: sourceStart - window.start,
        duration: Math.min(cue.end_sec, window.end) - sourceStart,
        source_offset: (cue.source_offset || 0) + sourceStart - cue.start_sec,
      };
    });
}
