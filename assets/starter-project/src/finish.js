// Export-time finishing for the JS compositor: temporal motion blur + bloom + grain + vignette + flashes.
// Configured in video.json → "finish" (all optional). Applied by render.html (export, contact sheets);
// the live editor preview stays unfinished for speed. Deterministic: grain is seeded by frame index.
//
// "finish": {
//   "motion_blur": {"samples": 6, "shutter": 0.5, "windows": [{"start_sec": 3.2, "end_sec": 3.8, "samples": 10}]},
//   "bloom": {"amount": 0.5, "threshold": 0.6, "radius": 18},
//   "grain": 0.02, "vignette": 0.2,
//   "flashes": [{"at": 7.5, "amount": 0.85, "decay": 0.09, "color": "#ffffff"}]
// }
// Taste defaults (references/craft/finish.md): bloom 0 on paper/UI, 0.3–0.5 dark graphics, 0.8–1.2 emissive;
// grain 0.015–0.025 (0 for product UI); vignette 0.15–0.25; flashes only on the 1–2 biggest hits.

export function finishConfig(project = {}) {
  const f = project.finish || {};
  const mb = f.motion_blur || {};
  return {
    samples: Math.max(1, Math.round(mb.samples ?? 1)),
    shutter: Math.min(1, Math.max(0, mb.shutter ?? 0.5)),
    windows: Array.isArray(mb.windows) ? mb.windows : [],
    bloom: f.bloom ? { amount: f.bloom.amount ?? 0.4, threshold: f.bloom.threshold ?? 0.6, radius: f.bloom.radius ?? 18 } : null,
    grain: f.grain ?? 0,
    vignette: f.vignette ?? 0,
    flashes: Array.isArray(f.flashes) ? f.flashes : [],
    active: Boolean(f.motion_blur || f.bloom || f.grain || f.vignette || f.flashes),
  };
}

export function samplesAt(cfg, time) {
  let n = cfg.samples;
  for (const w of cfg.windows) if (time >= w.start_sec && time <= w.end_sec) n = Math.max(1, Math.round(w.samples));
  return n;
}

export function validateFinish(project = {}) {
  const errors = [], f = project.finish;
  if (f == null) return errors;
  if (typeof f !== "object") return ["finish: expected an object"];
  const num = (v, lo, hi, key) => { if (v != null && !(Number.isFinite(v) && v >= lo && v <= hi)) errors.push(`finish.${key}: expected ${lo}..${hi}`); };
  num(f.motion_blur?.samples, 1, 16, "motion_blur.samples");
  num(f.motion_blur?.shutter, 0, 1, "motion_blur.shutter");
  num(f.bloom?.amount, 0, 2, "bloom.amount");
  num(f.bloom?.threshold, 0, 1, "bloom.threshold");
  num(f.grain, 0, 0.1, "grain");
  num(f.vignette, 0, 0.6, "vignette");
  for (const [i, w] of (f.motion_blur?.windows || []).entries()) {
    if (!(w.end_sec > w.start_sec)) errors.push(`finish.motion_blur.windows[${i}]: end_sec must exceed start_sec`);
    num(w.samples, 1, 16, `motion_blur.windows[${i}].samples`);
  }
  return errors;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offscreen(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Render one finished frame into `canvas`. drawScene(ctx, t) must be the same deterministic scene function.
export function renderFinished(canvas, project, time, drawScene) {
  const cfg = finishConfig(project);
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, fps = project.fps || 30;
  const n = samplesAt(cfg, time);
  if (n > 1) {
    const acc = new Float32Array(W * H * 4);
    for (let k = 0; k < n; k += 1) {
      const ts = time + ((k + 0.5) / n - 0.5) * cfg.shutter / fps;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.restore();
      drawScene(ctx, Math.max(0, ts));
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 1) acc[i] += d[i];
    }
    const out = ctx.createImageData(W, H);
    for (let i = 0; i < acc.length; i += 1) out.data[i] = acc[i] / n;
    ctx.putImageData(out, 0, 0);
  } else {
    drawScene(ctx, time);
  }
  if (cfg.bloom && cfg.bloom.amount > 0) {
    const w = Math.max(1, W >> 2), h = Math.max(1, H >> 2);
    const small = offscreen(w, h), sctx = small.getContext("2d");
    sctx.drawImage(canvas, 0, 0, w, h);
    const img = sctx.getImageData(0, 0, w, h), d = img.data, thr = cfg.bloom.threshold * 255;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      const k = m <= thr ? 0 : (m - thr) / (255 - thr + 1e-6);
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, cfg.bloom.amount);
    ctx.filter = `blur(${cfg.bloom.radius}px)`;
    ctx.drawImage(small, 0, 0, W, H);
    ctx.restore();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const fl of cfg.flashes) {
    const tau = time - fl.at;
    if (tau < 0) continue;
    const a = (fl.amount ?? 0.8) * Math.exp(-tau / (fl.decay ?? 0.09));
    if (a < 0.005) continue;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = fl.color || "#ffffff";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  if (cfg.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.22, W / 2, H / 2, W * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${cfg.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (cfg.grain > 0) {
    const w = Math.max(1, W >> 1), h = Math.max(1, H >> 1);
    const noise = offscreen(w, h), nctx = noise.getContext("2d");
    const img = nctx.createImageData(w, h), d = img.data;
    const rnd = mulberry32(Math.round(time * fps) * 7919 + 13), amp = cfg.grain * 255 * 2.2;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + ((rnd() + rnd() + rnd()) / 1.5 - 1) * amp;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = "soft-light";
    ctx.drawImage(noise, 0, 0, W, H);
  }
  ctx.restore();
  return cfg;
}
