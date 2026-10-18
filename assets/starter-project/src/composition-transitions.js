import { trackEnabled } from "./model.js";
import { clamp01, easeOutCubic } from "./motion.js";

const TYPES = new Set(["cut", "push", "wipe", "zoom", "dissolve", "flow", "iris"]);
const DIRECTIONS = new Set(["left", "right", "up", "down"]);
const surfaces = new WeakMap();

export function validateTransition(cue) {
  if (cue.transition == null) return [];
  const value = cue.transition;
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["transition: expected an object"];
  const errors = [];
  if (!TYPES.has(value.type)) errors.push("transition.type: unsupported transition");
  if (value.type !== "cut" && (!Number.isFinite(value.duration_sec) || value.duration_sec <= 0 ||
      value.duration_sec > cue.end_sec - cue.start_sec)) errors.push("transition.duration_sec: outside incoming scene");
  if (value.direction != null && !DIRECTIONS.has(value.direction)) errors.push("transition.direction: unsupported direction");
  for (const key of ["origin_x", "origin_y"]) {
    if (value[key] != null && (value.type !== "iris" || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)) {
      errors.push(`transition.${key}: expected 0..1 for iris`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!["type", "duration_sec", "direction", "origin_x", "origin_y"].includes(key)) errors.push(`transition: unsupported property ${key}`);
  }
  return errors;
}

function sceneFamily(timeline, cue) {
  if (cue.scene === "composition") return "composition";
  if (timeline.studio) return "studio";
  if (timeline.presentation) return "presentation";
  if (timeline.design) return "music-video";
  return "legacy";
}

export function transitionSource(timeline, cue, time) {
  const transition = cue.transition;
  if (!transition || transition.type === "cut" || time < cue.start_sec || time >= cue.end_sec ||
      time - cue.start_sec >= transition.duration_sec || !trackEnabled(timeline, cue)) return null;
  const family = sceneFamily(timeline, cue);
  const previous = timeline.cues.find((item) => item.kind === "scene" &&
    sceneFamily(timeline, item) === family && item.track_id === cue.track_id &&
    Math.abs(item.end_sec - cue.start_sec) < 1e-6 && trackEnabled(timeline, item));
  if (!previous) return null;
  // Contiguous cues have no outgoing post-roll; hold the last visible frame, never replay its tail.
  return { cue: previous, time: Math.max(previous.start_sec, previous.end_sec - 1 / timeline.fps) };
}

function getSurfaces(ctx, width, height) {
  let pair = surfaces.get(ctx);
  if (!pair || pair[0].width !== width || pair[0].height !== height) {
    const create = () => {
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      return canvas;
    };
    pair = [create(), create()];
    surfaces.set(ctx, pair);
  }
  return pair;
}

function drawScaled(ctx, surface, width, height, scale) {
  const drawWidth = width * scale, drawHeight = height * scale;
  ctx.drawImage(surface, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function flowEdge(width, height, progress, direction) {
  const horizontal = direction === "left" || direction === "right";
  const positive = direction === "right" || direction === "down";
  const travel = horizontal ? width : height, cross = horizontal ? height : width;
  const wave = Math.sin(Math.PI * progress) * travel * 0.024;
  const points = [];
  for (let index = 0; index <= 64; index += 1) {
    const along = index / 64, phase = along * Math.PI * 4 + progress * Math.PI * 1.4;
    const offset = wave * (Math.sin(phase) + 0.24 * Math.sin(phase * 2.1 - 0.7));
    const boundary = (positive ? progress : 1 - progress) * travel + offset;
    points.push(horizontal ? [boundary, along * cross] : [along * cross, boundary]);
  }
  return { horizontal, positive, points };
}

function traceFlowEdge(ctx, edge, width, height) {
  ctx.beginPath();
  ctx.moveTo(...edge.points[0]);
  for (const point of edge.points.slice(1)) ctx.lineTo(...point);
  if (edge.horizontal) {
    if (edge.positive) { ctx.lineTo(0, height); ctx.lineTo(0, 0); }
    else { ctx.lineTo(width, height); ctx.lineTo(width, 0); }
  } else if (edge.positive) {
    ctx.lineTo(width, 0); ctx.lineTo(0, 0);
  } else {
    ctx.lineTo(width, height); ctx.lineTo(0, height);
  }
  ctx.closePath();
}

function traceBoundary(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
}

function transitionAccent(timeline) {
  return timeline.design?.palette?.[2] ?? timeline.presentation?.accent ??
    timeline.studio?.hosts?.[0]?.color ?? "#f4f4ef";
}

function drawFlow(ctx, pair, timeline, width, height, progress, direction) {
  const p = progress * progress * (3 - 2 * progress);
  const edge = flowEdge(width, height, p, direction);
  const edgeWidth = Math.max(1.5, Math.min(width, height) * 0.008);
  const edgeAlpha = 1 - clamp01((p - 0.86) / 0.14);
  ctx.save();
  drawScaled(ctx, pair[0], width, height, 1 + 0.018 * p);
  traceFlowEdge(ctx, edge, width, height);
  ctx.clip();
  drawScaled(ctx, pair[1], width, height, 1.035 - 0.035 * p);
  ctx.restore();

  traceBoundary(ctx, edge.points);
  ctx.save();
  ctx.globalAlpha *= edgeAlpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = transitionAccent(timeline);
  ctx.shadowBlur = edgeWidth * 2.5;
  ctx.strokeStyle = transitionAccent(timeline);
  ctx.lineWidth = edgeWidth;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = edgeWidth * 0.24;
  ctx.stroke();
  ctx.restore();
}

function drawIris(ctx, pair, timeline, width, height, progress, transition) {
  const p = progress * progress * (3 - 2 * progress);
  const x = width * (transition.origin_x ?? 0.5), y = height * (transition.origin_y ?? 0.5);
  const maxRadius = Math.max(
    Math.hypot(x, y), Math.hypot(width - x, y),
    Math.hypot(x, height - y), Math.hypot(width - x, height - y),
  );
  const radius = maxRadius * p;
  const edgeAlpha = 1 - clamp01((p - 0.86) / 0.14);
  drawScaled(ctx, pair[0], width, height, 1 + 0.02 * p);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, radius), 0, Math.PI * 2);
  ctx.clip();
  drawScaled(ctx, pair[1], width, height, 1.045 - 0.045 * p);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= edgeAlpha;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.007);
  ctx.shadowColor = transitionAccent(timeline);
  ctx.shadowBlur = ctx.lineWidth * 2.5;
  ctx.strokeStyle = transitionAccent(timeline);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth *= 0.24;
  ctx.stroke();
  ctx.restore();
}

export function drawSceneTransition(ctx, timeline, time, width, height, cue, drawCue) {
  const source = transitionSource(timeline, cue, time);
  if (!source) return false;
  const pair = getSurfaces(ctx, width, height);
  for (const [index, item] of [source, { cue, time }].entries()) {
    const surface = pair[index].getContext("2d");
    surface.setTransform(1, 0, 0, 1, 0, 0);
    surface.globalAlpha = 1;
    surface.clearRect(0, 0, width, height);
    surface.fillStyle = timeline.design?.palette?.[1] ?? "#111416";
    surface.fillRect(0, 0, width, height);
    drawCue(surface, item.cue, item.time);
  }
  const transition = cue.transition, progress = clamp01((time - cue.start_sec) / transition.duration_sec);
  const p = easeOutCubic(progress), direction = transition.direction ?? "left";
  const vertical = direction === "up" || direction === "down";
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  const size = vertical ? height : width;
  ctx.save();
  if (transition.type === "push") {
    const outgoing = sign * size * p, incoming = sign * size * (p - 1);
    ctx.drawImage(pair[0], vertical ? 0 : outgoing, vertical ? outgoing : 0);
    ctx.drawImage(pair[1], vertical ? 0 : incoming, vertical ? incoming : 0);
  } else if (transition.type === "wipe") {
    ctx.drawImage(pair[0], 0, 0);
    ctx.beginPath();
    if (vertical) ctx.rect(0, sign < 0 ? height * (1 - p) : 0, width, height * p);
    else ctx.rect(sign < 0 ? width * (1 - p) : 0, 0, width * p, height);
    ctx.clip();
    ctx.drawImage(pair[1], 0, 0);
  } else if (transition.type === "zoom") {
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha *= 1 - p;
    const outgoingScale = 1 + p * 0.6;
    ctx.drawImage(pair[0], width * (1 - outgoingScale) / 2, height * (1 - outgoingScale) / 2,
      width * outgoingScale, height * outgoingScale);
    ctx.globalAlpha = alpha * p;
    const incomingScale = 0.72 + 0.28 * p;
    ctx.drawImage(pair[1], width * (1 - incomingScale) / 2, height * (1 - incomingScale) / 2,
      width * incomingScale, height * incomingScale);
  } else if (transition.type === "flow") {
    drawFlow(ctx, pair, timeline, width, height, progress, direction);
  } else if (transition.type === "iris") {
    drawIris(ctx, pair, timeline, width, height, progress, transition);
  } else {
    ctx.drawImage(pair[0], 0, 0);
    ctx.globalAlpha *= p;
    ctx.drawImage(pair[1], 0, 0);
  }
  ctx.restore();
  return true;
}

export const drawCompositionTransition = drawSceneTransition;
