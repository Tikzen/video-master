export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const lerp = (from, to, progress) => from + (to - from) * progress;

export function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(value) {
  return 1 - (1 - clamp01(value)) ** 3;
}

export function progressAt(time, start, duration) {
  return duration <= 0 ? Number(time >= start) : clamp01((time - start) / duration);
}

export function springOut(value, { damping = 7, frequency = 11 } = {}) {
  if (!Number.isFinite(damping) || damping <= 0 || !Number.isFinite(frequency) || frequency <= 0) {
    throw new Error("Spring damping and frequency must be finite and positive");
  }
  const t = clamp01(value);
  const response = (x) => 1 - Math.exp(-damping * x) * Math.cos(frequency * x);
  return response(t) / response(1);
}

export function staggeredProgress(time, index, { start = 0, delay = 0.07, duration = 0.36 } = {}) {
  return easeOutCubic(progressAt(time, start + index * delay, duration));
}

// ---------------------------------------------------------------------------
// Easing vocabulary shared with motionkit (references/craft/motion-craft.md).
// Keyframe `ease` accepts any name below, "bezier(x1,y1,x2,y2)" or "spring(damping,frequency)".
export function cubicBezier(x1, y1, x2, y2) {
  const bx = (s) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const by = (s) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
  return (value) => {
    const u = clamp01(value);
    let lo = 0, hi = 1, s = u;
    for (let i = 0; i < 28; i += 1) {
      const x = bx(s);
      if (Math.abs(x - u) < 1e-7) break;
      if (x < u) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return by(s);
  };
}

const backOut = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

export const EASINGS = Object.freeze({
  linear: (t) => t,
  step: (t) => (t >= 1 ? 1 : 0),
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) ** 2,
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  cubicIn: (t) => t ** 3,
  cubicOut: (t) => 1 - (1 - t) ** 3,
  cubicInOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  quartIn: (t) => t ** 4,
  quartOut: (t) => 1 - (1 - t) ** 4,
  quartInOut: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  expoIn: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  expoOut: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  sineInOut: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  backIn: (t) => 2.70158 * t ** 3 - 1.70158 * t * t,
  backOut: (t) => backOut(t),
  backOutStrong: (t) => backOut(t, 2.5),
  elasticOut: (t) => (t <= 0 || t >= 1 ? t : 2 ** (-10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1),
  spring: (t) => springOut(t),
  springSoft: (t) => springOut(t, { damping: 4.5, frequency: 13 }),
  springFirm: (t) => springOut(t, { damping: 10, frequency: 9 }),
  snap: cubicBezier(0.16, 1, 0.3, 1),      // fast attack, long settle — titles, UI arrivals
  swift: cubicBezier(0.7, 0, 0.2, 1),      // decisive big moves
  gentle: cubicBezier(0.4, 0, 0.2, 1),     // product UI
});

const PARAM = /^(bezier|spring)\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*(?:,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*)?\)$/;
const cache = new Map();

export function easeByName(name = "linear") {
  if (EASINGS[name]) return EASINGS[name];
  if (cache.has(name)) return cache.get(name);
  const m = typeof name === "string" ? name.match(PARAM) : null;
  if (!m) return null;
  let fn = null;
  if (m[1] === "bezier" && m[5] != null) {
    const [x1, y1, x2, y2] = [m[2], m[3], m[4], m[5]].map(Number);
    if (x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) fn = cubicBezier(x1, y1, x2, y2);
  } else if (m[1] === "spring" && m[4] == null) {
    const damping = Number(m[2]), frequency = Number(m[3]);
    if (damping > 0 && frequency > 0) fn = (t) => springOut(t, { damping, frequency });
  }
  if (fn) cache.set(name, fn);
  return fn;
}

export const isEaseName = (name) => easeByName(name) != null;
