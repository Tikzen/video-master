import { clamp01, lerp, easeByName, isEaseName } from "./motion.js";

const DEFAULTS = Object.freeze({
  x: 0, y: 0, scale: 1, scale_x: 1, scale_y: 1,
  rotation: 0, opacity: 1, reveal: 1,
});
const PROPERTIES = Object.keys(DEFAULTS);
const KINDS = new Set(["text", "path", "image", "footage", "rect", "ellipse", "group"]);
const positive = (value) => Number.isFinite(value) && value > 0;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const animationDuration = (cue) => cue.animation_duration_sec ?? cue.end_sec - cue.start_sec;
export const animationTime = (cue, time) => time - cue.start_sec + (cue.animation_offset_sec ?? 0);

export function validateAnimationSpan(cue) {
  if (cue.animation_offset_sec == null && cue.animation_duration_sec == null) return [];
  const errors = [];
  const duration = animationDuration(cue), offset = cue.animation_offset_sec ?? 0;
  if (!positive(duration)) errors.push("animation_duration_sec: expected a positive number");
  if (!Number.isFinite(offset) || offset < 0) errors.push("animation_offset_sec: expected a nonnegative number");
  if (offset + cue.end_sec - cue.start_sec > duration + 1e-6) errors.push("animation source span: visible interval exceeds source duration");
  return errors;
}

function eased(value, name = "linear") {
  const fn = easeByName(name) || easeByName("linear");
  return fn(clamp01(value));
}

export function sampleMotion(base = {}, keyframes = [], localSec = 0) {
  const sampled = { ...DEFAULTS, ...base };
  const frames = [...keyframes].sort((a, b) => a.at - b.at);
  // Sparse keyframes form separate property tracks, not frame-to-frame snapshots.
  for (const key of PROPERTIES) {
    let previous = { at: 0, value: sampled[key] };
    for (const next of frames) {
      if (!own(next, key)) continue;
      if (localSec < next.at) {
        const span = next.at - previous.at;
        sampled[key] = span <= 0 ? next[key] : lerp(previous.value, next[key], eased((localSec - previous.at) / span, next.ease));
        break;
      }
      sampled[key] = next[key];
      previous = { at: next.at, value: next[key] };
    }
  }
  sampled.opacity = clamp01(sampled.opacity);
  sampled.reveal = clamp01(sampled.reveal);
  return sampled;
}

function propertyErrors(values, prefix, frame = false) {
  const errors = [];
  if (!values || typeof values !== "object" || Array.isArray(values)) return [`${prefix}: expected an object`];
  for (const [key, value] of Object.entries(values)) {
    if (frame && ["at", "ease"].includes(key)) continue;
    if (!PROPERTIES.includes(key)) {
      errors.push(`${prefix}: unsupported motion property ${key}`);
      continue;
    }
    if (!Number.isFinite(value)) errors.push(`${prefix}.${key}: expected a finite number`);
    if (key === "scale" && value < 0) errors.push(`${prefix}.scale: expected a nonnegative number`);
    if (["opacity", "reveal"].includes(key) && (value < 0 || value > 1)) errors.push(`${prefix}.${key}: expected 0..1`);
  }
  return errors;
}

export function validateMotion(keyframes = [], duration, base = {}) {
  const errors = propertyErrors(base, "transform");
  if (!positive(duration)) errors.push("motion duration: expected a positive number");
  if (!Array.isArray(keyframes)) return [...errors, "keyframes: expected an array"];
  let previous = -Infinity;
  const times = new Map();
  for (const [index, frame] of keyframes.entries()) {
    const prefix = `keyframes[${index}]`;
    errors.push(...propertyErrors(frame, prefix, true));
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
    if (!Number.isFinite(frame.at) || frame.at < 0 || frame.at > duration) errors.push(`${prefix}.at: outside cue duration`);
    if (frame.at < previous) errors.push(`${prefix}.at: keyframes must be ordered`);
    previous = frame.at;
    if (frame.ease != null && !isEaseName(frame.ease)) errors.push(`${prefix}.ease: unsupported easing (see EASINGS in motion.js, bezier(x1,y1,x2,y2) or spring(damping,frequency))`);
    const properties = PROPERTIES.filter((key) => own(frame, key));
    if (!properties.length) errors.push(`${prefix}: expected at least one motion property`);
    const used = times.get(frame.at) || new Set();
    for (const key of properties) {
      if (used.has(key)) errors.push(`${prefix}: duplicate ${key} at ${frame.at}`);
      used.add(key);
    }
    times.set(frame.at, used);
  }
  return errors;
}

function safeSource(source) {
  if (typeof source !== "string" || !source || /[\u0000-\u001f?#]/.test(source)) return false;
  let decoded = source;
  try {
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return false;
  }
  return !/^[\\/]|^[a-z][a-z\d+.-]*:|(^|[\\/])\.\.([\\/]|$)|[\u0000-\u001f?#]/i.test(decoded);
}

function pointPairs(points) {
  return points.map((point) => Array.isArray(point) ? point : [point?.x, point?.y]);
}

export function samplePoints(points, keyframes = [], localSec = 0) {
  let previous = { at: 0, points: pointPairs(points) };
  for (const next of [...keyframes].sort((a, b) => a.at - b.at)) {
    const target = pointPairs(next.points);
    if (localSec < next.at) {
      const progress = eased((localSec - previous.at) / (next.at - previous.at), next.ease);
      return previous.points.map((point, index) => [
        lerp(point[0], target[index][0], progress),
        lerp(point[1], target[index][1], progress),
      ]);
    }
    previous = { at: next.at, points: target };
  }
  return previous.points.map((point) => [...point]);
}

function validPoints(points, length) {
  return Array.isArray(points) && points.length >= 2 && (length == null || points.length === length) &&
    pointPairs(points).every((point) => point.length === 2 && point.every(Number.isFinite));
}

function pointMotionErrors(layer, duration) {
  if (layer.point_keyframes == null) return [];
  if (layer.kind !== "path" || !validPoints(layer.points)) return ["point_keyframes: requires a path with base points"];
  if (!Array.isArray(layer.point_keyframes)) return ["point_keyframes: expected an array"];
  const errors = [];
  let previous = -Infinity;
  for (const [index, frame] of layer.point_keyframes.entries()) {
    const prefix = `point_keyframes[${index}]`;
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) { errors.push(`${prefix}: expected an object`); continue; }
    if (!Number.isFinite(frame.at) || frame.at < 0 || frame.at > duration || frame.at <= previous) errors.push(`${prefix}.at: expected unique ordered times inside the animation duration`);
    previous = frame.at;
    if (!validPoints(frame.points, layer.points.length)) errors.push(`${prefix}.points: expected finite points with the same count as the base path`);
    if (frame.ease != null && !isEaseName(frame.ease)) errors.push(`${prefix}.ease: unsupported easing (see EASINGS in motion.js, bezier(x1,y1,x2,y2) or spring(damping,frequency))`);
    if (Object.keys(frame).some((key) => !["at", "points", "ease"].includes(key))) errors.push(`${prefix}: unsupported property`);
  }
  return errors;
}

function pathErrors(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000000) return ["path: expected SVG path data"];
  const tokens = value.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const residue = value.replace(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g, "");
  if (/[^,\s]/.test(residue) || !/^[Mm]$/.test(tokens[0] || "")) return ["path: invalid SVG path data"];
  const sizes = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (!/^[MLHVCSQTAZ]$/i.test(command)) return ["path: expected a command"];
    const numbers = [];
    while (index < tokens.length && !/^[MLHVCSQTAZ]$/i.test(tokens[index])) numbers.push(Number(tokens[index++]));
    const size = sizes[command.toUpperCase()];
    if (numbers.some((number) => !Number.isFinite(number)) || (size === 0 ? numbers.length !== 0 : !numbers.length || numbers.length % size !== 0)) {
      return ["path: invalid command arguments"];
    }
    if (command.toUpperCase() === "A") {
      for (let j = 0; j < numbers.length; j += size) {
        if (numbers[j] < 0 || numbers[j + 1] < 0 || ![0, 1].includes(numbers[j + 3]) || ![0, 1].includes(numbers[j + 4])) return ["path: invalid arc arguments"];
      }
    }
  }
  return [];
}

function maskErrors(mask) {
  if (!mask || typeof mask !== "object" || Array.isArray(mask)) return ["mask: expected an object"];
  if (![undefined, 0].includes(mask.x) && !Number.isFinite(mask.x)) return ["mask.x: expected a finite number"];
  if (![undefined, 0].includes(mask.y) && !Number.isFinite(mask.y)) return ["mask.y: expected a finite number"];
  if (mask.kind === "rect" && positive(mask.width) && positive(mask.height)) return [];
  if (mask.kind === "circle" && positive(mask.radius)) return [];
  return ["mask: expected rect width/height or circle radius"];
}

const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

function objectErrors(value, prefix, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${prefix}: expected an object`];
  return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => `${prefix}: unsupported property ${key}`);
}

function boundsErrors(bounds, prefix) {
  const errors = objectErrors(bounds, prefix, ["x", "y", "width", "height"]);
  if (!Number.isFinite(bounds?.x) || !Number.isFinite(bounds?.y) ||
      !positive(bounds?.width) || !positive(bounds?.height)) errors.push(`${prefix}: expected finite x/y and positive width/height`);
  return errors;
}

function validateMaterial(layer, prefix) {
  const material = layer.material;
  if (material == null) return [];
  const errors = objectErrors(material, `${prefix}.material`, ["gradient", "glow", "extrusion", "glass", "blend"]);
  if (["group", "image", "footage"].includes(layer.kind)) errors.push(`${prefix}.material: unsupported for ${layer.kind}`);
  if (material.blend != null && !["source-over", "screen", "lighter", "multiply", "overlay", "soft-light"].includes(material.blend)) {
    errors.push(`${prefix}.material.blend: unsupported composite mode`);
  }
  const gradient = material.gradient;
  if (gradient != null) {
    errors.push(...objectErrors(gradient, `${prefix}.material.gradient`, ["type", "angle_deg", "stops", "bounds", "center_x", "center_y", "radius"]));
    if (gradient && typeof gradient === "object" && !Array.isArray(gradient)) {
      if (gradient.type != null && !["linear", "radial"].includes(gradient.type)) errors.push(`${prefix}.material.gradient.type: expected linear or radial`);
      if (gradient.angle_deg != null && (!Number.isFinite(gradient.angle_deg) || Math.abs(gradient.angle_deg) > 360)) errors.push(`${prefix}.material.gradient.angle_deg: expected -360..360`);
      for (const key of ["center_x", "center_y"]) {
        if (gradient[key] != null && (!Number.isFinite(gradient[key]) || gradient[key] < 0 || gradient[key] > 1)) errors.push(`${prefix}.material.gradient.${key}: expected 0..1`);
      }
      if (gradient.radius != null && (!positive(gradient.radius) || gradient.radius > 2)) errors.push(`${prefix}.material.gradient.radius: expected 0..2`);
      if (gradient.type !== "radial" && ["center_x", "center_y", "radius"].some((key) => gradient[key] != null)) {
        errors.push(`${prefix}.material.gradient: center and radius require type radial`);
      }
      if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 8) errors.push(`${prefix}.material.gradient.stops: expected 2..8 color stops`);
      else {
        let previous = -Infinity;
        for (const [index, stop] of gradient.stops.entries()) {
          const stopPrefix = `${prefix}.material.gradient.stops[${index}]`;
          errors.push(...objectErrors(stop, stopPrefix, ["offset", "color"]));
          if (!Number.isFinite(stop?.offset) || stop.offset < 0 || stop.offset > 1 || stop.offset <= previous) errors.push(`${stopPrefix}.offset: expected strictly increasing 0..1`);
          if (typeof stop?.color !== "string" || !HEX_COLOR.test(stop.color)) errors.push(`${stopPrefix}.color: expected a hex color`);
          previous = stop?.offset;
        }
      }
      if (gradient.bounds != null) errors.push(...boundsErrors(gradient.bounds, `${prefix}.material.gradient.bounds`));
      if (layer.kind === "path" && layer.points == null && gradient.bounds == null) errors.push(`${prefix}.material.gradient.bounds: required for SVG path gradients`);
    }
  }
  const glow = material.glow;
  if (glow != null) {
    errors.push(...objectErrors(glow, `${prefix}.material.glow`, ["color", "blur", "opacity"]));
    if (typeof glow?.color !== "string" || !HEX_COLOR.test(glow.color)) errors.push(`${prefix}.material.glow.color: expected a hex color`);
    if (!Number.isFinite(glow?.blur) || glow.blur < 0 || glow.blur > 64) errors.push(`${prefix}.material.glow.blur: expected 0..64`);
    if (!Number.isFinite(glow?.opacity) || glow.opacity < 0 || glow.opacity > 1) errors.push(`${prefix}.material.glow.opacity: expected 0..1`);
  }
  const extrusion = material.extrusion;
  if (extrusion != null) {
    errors.push(...objectErrors(extrusion, `${prefix}.material.extrusion`, ["color", "distance", "angle_deg", "steps"]));
    if (typeof extrusion?.color !== "string" || !HEX_COLOR.test(extrusion.color)) errors.push(`${prefix}.material.extrusion.color: expected a hex color`);
    if (!positive(extrusion?.distance) || extrusion.distance > 64) errors.push(`${prefix}.material.extrusion.distance: expected 0..64`);
    if (!Number.isFinite(extrusion?.angle_deg) || Math.abs(extrusion.angle_deg) > 360) errors.push(`${prefix}.material.extrusion.angle_deg: expected -360..360`);
    if (!Number.isInteger(extrusion?.steps) || extrusion.steps < 1 || extrusion.steps > 8) errors.push(`${prefix}.material.extrusion.steps: expected integer 1..8`);
  }
  const glass = material.glass;
  if (glass != null) {
    errors.push(...objectErrors(glass, `${prefix}.material.glass`, ["tint", "opacity", "rim", "rim_width", "sheen", "sheen_offset", "sheen_width", "angle_deg"]));
    if (!["rect", "ellipse"].includes(layer.kind)) errors.push(`${prefix}.material.glass: supported only on rect and ellipse layers`);
    if (typeof glass?.tint !== "string" || !HEX_COLOR.test(glass.tint)) errors.push(`${prefix}.material.glass.tint: expected a hex color`);
    if (!Number.isFinite(glass?.opacity) || glass.opacity < 0 || glass.opacity > 0.55) errors.push(`${prefix}.material.glass.opacity: expected 0..0.55`);
    if (typeof glass?.rim !== "string" || !HEX_COLOR.test(glass.rim)) errors.push(`${prefix}.material.glass.rim: expected a hex color`);
    if (!Number.isFinite(glass?.rim_width) || glass.rim_width < 0 || glass.rim_width > 8) errors.push(`${prefix}.material.glass.rim_width: expected 0..8`);
    if (!Number.isFinite(glass?.sheen) || glass.sheen < 0 || glass.sheen > 0.55) errors.push(`${prefix}.material.glass.sheen: expected 0..0.55`);
    if (glass?.sheen_offset != null && (!Number.isFinite(glass.sheen_offset) || glass.sheen_offset < 0 || glass.sheen_offset > 1)) errors.push(`${prefix}.material.glass.sheen_offset: expected 0..1`);
    const sheenWidth = glass?.sheen_width ?? 0.16, sheenOffset = glass?.sheen_offset ?? 0.28;
    if (glass?.sheen_width != null && (!Number.isFinite(glass.sheen_width) || glass.sheen_width <= 0 || glass.sheen_width >= 0.5)) errors.push(`${prefix}.material.glass.sheen_width: expected 0..0.5`);
    if (glass?.sheen > 0 && (sheenOffset <= sheenWidth || sheenOffset >= 1 - sheenWidth)) errors.push(`${prefix}.material.glass.sheen_offset: must leave room for sheen edges`);
    if (glass?.angle_deg != null && (!Number.isFinite(glass.angle_deg) || Math.abs(glass.angle_deg) > 360)) errors.push(`${prefix}.material.glass.angle_deg: expected -360..360`);
  }
  return errors;
}

function hasReveal(layer) {
  return layer.transform?.reveal != null && layer.transform.reveal !== 1 ||
    Array.isArray(layer.keyframes) && layer.keyframes.some((frame) => frame && own(frame, "reveal") && frame.reveal !== 1);
}

export function validateComposition(cue) {
  if (!cue || typeof cue !== "object" || Array.isArray(cue)) return ["composition: expected a cue"];
  const errors = [];
  const duration = animationDuration(cue);
  if (cue.scene !== "composition") errors.push("composition: expected scene composition");
  if (!Number.isFinite(cue.start_sec) || !positive(cue.end_sec - cue.start_sec)) errors.push("composition: invalid cue interval");
  errors.push(...validateAnimationSpan(cue));
  if (typeof cue.id !== "string" || !cue.id || cue.id.includes("::")) errors.push("composition: missing cue ID or reserved ::");
  if (cue.canvas != null && (!positive(cue.canvas.width) || !positive(cue.canvas.height))) errors.push("canvas: expected positive width/height");
  if (cue.camera != null) {
    if (!cue.camera || typeof cue.camera !== "object" || Array.isArray(cue.camera)) errors.push("camera: expected an object");
    else errors.push(...validateMotion(cue.camera.keyframes, duration, cue.camera.transform).map((error) => `camera.${error}`));
  }
  const visit = (layers, prefix) => {
    if (!Array.isArray(layers) || !layers.length) {
      errors.push(`${prefix}: expected a nonempty layers array`);
      return;
    }
    const ids = new Set();
    for (const [index, layer] of layers.entries()) {
      const path = `${prefix}[${index}]`;
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
        errors.push(`${path}: expected a layer`);
        continue;
      }
      if (typeof layer.id !== "string" || !layer.id || layer.id.includes("::") || ids.has(layer.id)) errors.push(`${path}: missing/duplicate layer ID or reserved ::`);
      ids.add(layer.id);
      if (!KINDS.has(layer.kind)) errors.push(`${path}: unsupported layer kind`);
      errors.push(...validateMaterial(layer, path));
      errors.push(...validateMotion(layer.keyframes, duration, layer.transform).map((error) => `${path}.${error}`));
      errors.push(...pointMotionErrors(layer, duration).map((error) => `${path}.${error}`));
      const start = layer.in_sec ?? 0, end = layer.out_sec ?? duration;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration || end <= start) errors.push(`${path}: invalid layer interval`);
      if (layer.mask != null) errors.push(...maskErrors(layer.mask).map((error) => `${path}.${error}`));
      if (["image", "footage", "rect", "ellipse"].includes(layer.kind) &&
        (!positive(layer.width) || !positive(layer.height))) errors.push(`${path}: expected positive width/height`);
      if (layer.stroke_width != null && (!Number.isFinite(layer.stroke_width) || layer.stroke_width < 0)) errors.push(`${path}: invalid stroke_width`);
      if (layer.kind === "image" || layer.kind === "footage") {
        if (!safeSource(layer.src)) errors.push(`${path}.src: expected a safe project-relative file`);
        if (layer.source_offset != null && (!Number.isFinite(layer.source_offset) || layer.source_offset < 0)) errors.push(`${path}: invalid source_offset`);
        if (layer.fit != null && !["contain", "cover", "stretch"].includes(layer.fit)) errors.push(`${path}: invalid fit`);
      }
      if (layer.kind === "text") {
        if (typeof layer.text !== "string") errors.push(`${path}: expected text`);
        if (layer.font_size != null && !positive(layer.font_size)) errors.push(`${path}: invalid font_size`);
        if (layer.max_width != null && !positive(layer.max_width)) errors.push(`${path}: invalid max_width`);
        if (layer.line_height != null && !positive(layer.line_height)) errors.push(`${path}: invalid line_height`);
        if (layer.font_weight != null && typeof layer.font_weight !== "string" && !positive(layer.font_weight)) errors.push(`${path}: invalid font_weight`);
        if (layer.font_family != null && (typeof layer.font_family !== "string" || /[\r\n]/.test(layer.font_family))) errors.push(`${path}: invalid font_family`);
        if (layer.align != null && !["left", "center", "right", "start", "end"].includes(layer.align)) errors.push(`${path}: invalid align`);
        if (layer.letter_reveal != null && typeof layer.letter_reveal !== "boolean") errors.push(`${path}: letter_reveal must be boolean`);
      }
      if (layer.kind === "path") {
        if (layer.closed != null && typeof layer.closed !== "boolean") errors.push(`${path}: closed must be boolean`);
        if (layer.line_cap != null && !["butt", "round", "square"].includes(layer.line_cap)) errors.push(`${path}: invalid line_cap`);
        if (layer.line_join != null && !["round", "bevel", "miter"].includes(layer.line_join)) errors.push(`${path}: invalid line_join`);
        if (layer.points != null) {
          if (!validPoints(layer.points)) errors.push(`${path}: invalid points`);
        } else errors.push(...pathErrors(layer.d ?? layer.path).map((error) => `${path}.${error}`));
        if (layer.path_length != null && !positive(layer.path_length)) errors.push(`${path}: invalid path_length`);
        if (hasReveal(layer) && layer.points == null && !positive(layer.path_length)) errors.push(`${path}: SVG stroke reveal requires path_length or points`);
        if (layer.dasharray != null && (!Array.isArray(layer.dasharray) || !layer.dasharray.length || layer.dasharray.some((value) => !Number.isFinite(value) || value < 0) || !layer.dasharray.some((value) => value > 0))) errors.push(`${path}: invalid dasharray`);
        if (layer.dash_offset != null && !Number.isFinite(layer.dash_offset)) errors.push(`${path}: invalid dash_offset`);
        const pattern = layer.dasharray;
        if (hasReveal(layer) && layer.points == null && Array.isArray(pattern) &&
          layer.path_length / pattern.reduce((sum, value) => sum + value, 0) * pattern.length > 10000) errors.push(`${path}: SVG reveal dash pattern is too dense`);
      }
      if (layer.kind === "group") {
        if (hasReveal(layer) && (!positive(layer.width) || !positive(layer.height))) errors.push(`${path}: group reveal requires width/height`);
        visit(layer.layers, `${path}.layers`);
      }
    }
  };
  visit(cue.layers, "layers");
  return errors;
}

export function collectCompositionVisuals(timeline) {
  const cues = [];
  for (const cue of timeline.cues || []) {
    if (cue.scene !== "composition") continue;
    const duration = animationDuration(cue), offset = cue.animation_offset_sec ?? 0;
    const visit = (layers, path, lower, upper) => {
      for (const layer of layers || []) {
        const ids = [...path, layer.id];
        const ownStart = layer.in_sec ?? 0;
        const start = Math.max(lower, ownStart), end = Math.min(upper, layer.out_sec ?? duration);
        if (end <= start) continue;
        if (["image", "footage"].includes(layer.kind)) {
          cues.push({
            id: `${cue.id}::${ids.join("::")}`, track_id: cue.track_id,
            kind: layer.kind, src: layer.src,
            source_offset: (layer.source_offset ?? 0) + (layer.kind === "footage" ? start - ownStart : 0),
            start_sec: cue.start_sec + start - offset, end_sec: cue.start_sec + end - offset,
          });
        }
        if (layer.kind === "group") visit(layer.layers, ids, start, end);
      }
    };
    visit(cue.layers, [], offset, offset + cue.end_sec - cue.start_sec);
  }
  return cues;
}

function applyTransform(ctx, motion) {
  ctx.translate(motion.x, motion.y);
  ctx.rotate(motion.rotation * Math.PI / 180);
  ctx.scale(motion.scale * motion.scale_x, motion.scale * motion.scale_y);
  ctx.globalAlpha *= motion.opacity;
}

function clipRect(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
}

function applyMask(ctx, mask) {
  if (!mask) return;
  ctx.beginPath();
  if (mask.kind === "circle") ctx.arc(mask.x ?? 0, mask.y ?? 0, mask.radius, 0, Math.PI * 2);
  else ctx.rect(mask.x ?? 0, mask.y ?? 0, mask.width, mask.height);
  ctx.clip();
}

function textWidth(ctx, text, maxWidth) {
  const width = ctx.measureText(text).width;
  return maxWidth == null ? width : Math.min(width, maxWidth);
}

function directionGradient(ctx, bounds, angleDeg) {
  const angle = angleDeg * Math.PI / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const halfLength = (Math.abs(bounds.width * dx) + Math.abs(bounds.height * dy)) / 2;
  const centerX = bounds.x + bounds.width / 2, centerY = bounds.y + bounds.height / 2;
  return ctx.createLinearGradient(
    centerX - dx * halfLength, centerY - dy * halfLength,
    centerX + dx * halfLength, centerY + dy * halfLength,
  );
}

function radialGradient(ctx, bounds, gradient) {
  const centerX = bounds.x + bounds.width * (gradient.center_x ?? 0.5);
  const centerY = bounds.y + bounds.height * (gradient.center_y ?? 0.5);
  const radius = Math.hypot(bounds.width, bounds.height) * (gradient.radius ?? 0.7);
  return ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
}

function colorWithAlpha(color, alpha) {
  const raw = color.slice(1);
  const digits = raw.length <= 4 ? [...raw].map((digit) => digit + digit) : raw.match(/../g);
  const [red, green, blue, sourceAlpha = "ff"] = digits;
  return `rgba(${parseInt(red, 16)},${parseInt(green, 16)},${parseInt(blue, 16)},${alpha * parseInt(sourceAlpha, 16) / 255})`;
}

function materialBounds(ctx, layer, local) {
  const explicit = layer.material?.gradient?.bounds;
  if (explicit) return explicit;
  if (["rect", "ellipse"].includes(layer.kind)) return { x: 0, y: 0, width: layer.width, height: layer.height };
  if (layer.kind === "text") {
    const size = layer.font_size ?? 64;
    ctx.font = `${layer.font_weight ?? 700} ${size}px ${layer.font_family ?? "Arial, sans-serif"}`;
    const lines = (layer.text || "").split("\n");
    const width = Math.max(1, ...lines.map((line) => textWidth(ctx, line, layer.max_width)));
    const align = layer.align ?? "left";
    return {
      x: ["right", "end"].includes(align) ? -width : align === "center" ? -width / 2 : 0,
      y: 0, width, height: Math.max(1, lines.length * (layer.line_height ?? size * 1.2)),
    };
  }
  if (layer.kind === "path" && layer.points) {
    const points = pointPairs(samplePoints(layer.points, layer.point_keyframes, local));
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(1, Math.max(...xs) - left), height: Math.max(1, Math.max(...ys) - top) };
  }
  return null;
}

function materialPaint(ctx, layer, bounds, local, override) {
  if (override) return override;
  const gradient = layer.material?.gradient;
  if (!gradient || !bounds) return null;
  const paint = gradient.type === "radial"
    ? radialGradient(ctx, bounds, gradient)
    : directionGradient(ctx, bounds, gradient.angle_deg ?? 0);
  for (const stop of gradient.stops) paint.addColorStop(stop.offset, stop.color);
  return paint;
}

function drawText(ctx, layer, reveal, local, override) {
  const size = layer.font_size ?? 64, lineHeight = layer.line_height ?? size * 1.2;
  const align = layer.align ?? "left";
  ctx.font = `${layer.font_weight ?? 700} ${size}px ${layer.font_family ?? "Arial, sans-serif"}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.letterSpacing = "0px";
  const paint = materialPaint(ctx, layer, materialBounds(ctx, layer, local), local, override) ?? layer.color ?? "#ffffff";
  ctx.fillStyle = override ?? (layer.material?.gradient && layer.fill !== false && layer.fill !== "none"
    ? paint : typeof layer.fill === "string" ? layer.fill : paint);
  ctx.strokeStyle = override ?? (typeof layer.stroke === "string" ? layer.stroke : paint);
  ctx.lineWidth = layer.stroke_width ?? 2;
  const letters = Array.from(layer.text || "");
  const text = layer.letter_reveal ? letters.slice(0, Math.floor(letters.length * reveal)).join("") : layer.text || "";
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const y = index * lineHeight;
    if (layer.stroke && ctx.lineWidth > 0) {
      if (layer.max_width == null) ctx.strokeText(line, 0, y);
      else ctx.strokeText(line, 0, y, layer.max_width);
    }
    if (layer.fill === false || layer.fill === "none") continue;
    ctx.save();
    if (!layer.letter_reveal && reveal < 1) {
      const width = textWidth(ctx, line, layer.max_width);
      const x = ["right", "end"].includes(align) ? -width : align === "center" ? -width / 2 : 0;
      clipRect(ctx, x, y - size * 0.15, width * reveal, lineHeight + size * 0.3);
    }
    if (layer.max_width == null) ctx.fillText(line, 0, y);
    else ctx.fillText(line, 0, y, layer.max_width);
    ctx.restore();
  }
}

function partialPolyline(ctx, points, reveal, closed) {
  const pairs = pointPairs(points);
  const vertices = closed ? [...pairs, pairs[0]] : pairs;
  let total = 0;
  for (let i = 1; i < vertices.length; i += 1) total += Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1]);
  let remaining = total * reveal;
  ctx.beginPath();
  ctx.moveTo(...vertices[0]);
  for (let i = 1; i < vertices.length && remaining > 0; i += 1) {
    const from = vertices[i - 1], to = vertices[i];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const progress = length === 0 ? 1 : Math.min(1, remaining / length);
    ctx.lineTo(lerp(from[0], to[0], progress), lerp(from[1], to[1], progress));
    remaining -= length;
  }
  if (closed && reveal >= 1) ctx.closePath();
}

function revealedDash(length, reveal, dasharray, offset) {
  const pattern = dasharray.length % 2 ? [...dasharray, ...dasharray] : [...dasharray];
  const sum = pattern.reduce((total, value) => total + value, 0);
  let phase = ((offset % sum) + sum) % sum, index = 0;
  while (phase >= pattern[index] && index < pattern.length - 1) phase -= pattern[index++];
  const result = index % 2 ? [0] : [];
  let remaining = length * reveal, count = 0;
  while (remaining > 1e-9 && count++ < 10002) {
    const segment = Math.min(remaining, pattern[index] - phase);
    result.push(segment);
    remaining -= segment;
    phase = 0;
    index = (index + 1) % pattern.length;
  }
  const hidden = length * (2 - reveal);
  if (result.length % 2) result.push(hidden);
  else result[result.length - 1] += hidden;
  return result;
}

function drawPath(ctx, layer, reveal, local, override) {
  const paint = materialPaint(ctx, layer, materialBounds(ctx, layer, local), local, override) ?? layer.color ?? "#ffffff";
  ctx.strokeStyle = override ?? (typeof layer.stroke === "string" ? layer.stroke : paint);
  ctx.fillStyle = override ?? (layer.material?.gradient && layer.fill !== false && layer.fill !== "none"
    ? paint : typeof layer.fill === "string" ? layer.fill : paint);
  ctx.lineWidth = layer.stroke_width ?? 2;
  ctx.lineCap = layer.line_cap ?? "round";
  ctx.lineJoin = layer.line_join ?? "round";
  ctx.setLineDash(layer.dasharray ?? []);
  ctx.lineDashOffset = layer.dash_offset ?? 0;
  const path = layer.points ? null : new Path2D(layer.d ?? layer.path);
  if (layer.points) partialPolyline(ctx, samplePoints(layer.points, layer.point_keyframes, local), reveal, layer.closed);
  else if (reveal < 1 && layer.path_length > 0) {
    if (layer.dasharray?.length) {
      ctx.setLineDash(revealedDash(layer.path_length, reveal, layer.dasharray, layer.dash_offset ?? 0));
      ctx.lineDashOffset = 0;
    } else {
      ctx.setLineDash([layer.path_length, layer.path_length]);
      ctx.lineDashOffset = layer.path_length * (1 - reveal) + (layer.dash_offset ?? 0);
    }
  }
  if (layer.fill && layer.fill !== "none" && reveal >= 1) path ? ctx.fill(path) : ctx.fill();
  if (layer.stroke !== false && layer.stroke !== "none" && ctx.lineWidth > 0 && reveal > 0) path ? ctx.stroke(path) : ctx.stroke();
}

function drawPrimitive(ctx, layer, local, override) {
  const bounds = materialBounds(ctx, layer, local);
  const paint = materialPaint(ctx, layer, bounds, local, override) ?? layer.color ?? "#ffffff";
  ctx.beginPath();
  if (layer.kind === "ellipse") ctx.ellipse(layer.width / 2, layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
  else ctx.rect(0, 0, layer.width, layer.height);
  ctx.fillStyle = override ?? (layer.material?.gradient && layer.fill !== false && layer.fill !== "none"
    ? paint : typeof layer.fill === "string" ? layer.fill : paint);
  if (layer.fill !== false && layer.fill !== "none") ctx.fill();
  if (layer.stroke && layer.stroke !== "none") {
    ctx.strokeStyle = override ?? (typeof layer.stroke === "string" ? layer.stroke : paint);
    ctx.lineWidth = layer.stroke_width ?? 2;
    if (ctx.lineWidth > 0) ctx.stroke();
  }
}

function drawLayerBody(ctx, layer, reveal, local, getVisual, override) {
  if (layer.kind === "text") drawText(ctx, layer, reveal, local, override);
  else if (layer.kind === "path") drawPath(ctx, layer, reveal, local, override);
  else if (layer.kind === "image" || layer.kind === "footage") drawMedia(ctx, layer, getVisual?.(layer.src));
  else drawPrimitive(ctx, layer, local, override);
}

function drawGlass(ctx, layer) {
  const glass = layer.material?.glass;
  if (!glass) return;
  const shape = () => {
    ctx.beginPath();
    if (layer.kind === "ellipse") ctx.ellipse(layer.width / 2, layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
    else ctx.rect(0, 0, layer.width, layer.height);
  };
  const bounds = { x: 0, y: 0, width: layer.width, height: layer.height };
  ctx.save();
  shape();
  ctx.clip();
  ctx.globalAlpha *= glass.opacity;
  ctx.fillStyle = glass.tint;
  ctx.fillRect(0, 0, layer.width, layer.height);
  if (glass.sheen > 0) {
    const gradient = directionGradient(ctx, bounds, glass.angle_deg ?? -35);
    const center = glass.sheen_offset ?? 0.28, half = glass.sheen_width ?? 0.16;
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(Math.max(0, center - half), "rgba(255,255,255,0)");
    gradient.addColorStop(center, `rgba(255,255,255,${glass.sheen})`);
    gradient.addColorStop(Math.min(1, center + half), "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, layer.width, layer.height);
  }
  ctx.restore();
  if (glass.rim_width > 0) {
    shape();
    ctx.strokeStyle = glass.rim;
    ctx.globalAlpha *= 0.9;
    ctx.lineWidth = glass.rim_width;
    ctx.stroke();
  }
}

function drawMaterialLayer(ctx, layer, reveal, local, getVisual) {
  const material = layer.material;
  const extrusion = material?.extrusion;
  if (extrusion) {
    const angle = extrusion.angle_deg * Math.PI / 180;
    const dx = Math.cos(angle) * extrusion.distance, dy = Math.sin(angle) * extrusion.distance;
    for (let step = extrusion.steps; step >= 1; step -= 1) {
      ctx.save();
      ctx.translate(dx * step / extrusion.steps, dy * step / extrusion.steps);
      drawLayerBody(ctx, layer, reveal, local, getVisual, extrusion.color);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.shadowColor = material?.glow ? colorWithAlpha(material.glow.color, material.glow.opacity) : "rgba(0,0,0,0)";
  ctx.shadowBlur = material?.glow?.blur ?? 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawLayerBody(ctx, layer, reveal, local, getVisual);
  ctx.restore();
  drawGlass(ctx, layer);
}

function drawMedia(ctx, layer, visual) {
  const source = visual?.element ?? visual?.image ?? visual?.video ?? visual;
  if (!source) return;
  const width = layer.width, height = layer.height, fit = layer.fit ?? "contain";
  if (fit === "stretch") {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width;
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const factor = fit === "cover" ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * factor, drawHeight = sourceHeight * factor;
  clipRect(ctx, 0, 0, width, height);
  ctx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function drawComposition(ctx, timeline, time, width, height, cue, getVisual) {
  const visibleTime = time - cue.start_sec, duration = animationDuration(cue), local = animationTime(cue, time);
  if (visibleTime < 0 || time >= cue.end_sec) return;
  const canvasWidth = cue.canvas?.width ?? width, canvasHeight = cue.canvas?.height ?? height;
  ctx.save();
  clipRect(ctx, 0, 0, width, height);
  ctx.scale(width / canvasWidth, height / canvasHeight);
  if (cue.transform || cue.keyframes?.length) {
    const motion = sampleMotion(cue.transform, cue.keyframes, local);
    if (motion.reveal < 1) clipRect(ctx, 0, 0, canvasWidth * motion.reveal, canvasHeight);
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    applyTransform(ctx, motion);
    ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  }
  const camera = sampleMotion(cue.camera?.transform, cue.camera?.keyframes, local);
  if (camera.reveal < 1) clipRect(ctx, 0, 0, canvasWidth * camera.reveal, canvasHeight);
  // Camera transforms the world about the viewport center; it is not a shake preset.
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  applyTransform(ctx, camera);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  const visit = (layers, path) => {
    for (const layer of layers || []) {
      if (local < (layer.in_sec ?? 0) || local >= (layer.out_sec ?? duration)) continue;
      const ids = [...path, layer.id];
      const motion = sampleMotion(layer.transform, layer.keyframes, local);
      ctx.save();
      applyTransform(ctx, motion);
      applyMask(ctx, layer.mask);
      if (layer.material?.blend) ctx.globalCompositeOperation = layer.material.blend;
      if (!["text", "path"].includes(layer.kind) && motion.reveal < 1 && layer.width != null && layer.height != null) {
        clipRect(ctx, 0, 0, layer.width * motion.reveal, layer.height);
      }
      if (layer.kind === "group") visit(layer.layers, ids);
      else if (layer.kind === "image" || layer.kind === "footage") drawMedia(ctx, layer, getVisual?.(layer.src, `${cue.id}::${ids.join("::")}`));
      else drawMaterialLayer(ctx, layer, motion.reveal, local, (src) => getVisual?.(src, `${cue.id}::${ids.join("::")}`));
      ctx.restore();
    }
  };
  visit(cue.layers, []);
  ctx.restore();
}
