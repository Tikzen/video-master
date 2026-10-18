// Flat-illustration presenter for the JS studio (port of motionkit.studio.VectorHost).
// drawHost(ctx, x, y, size, look, state): (x, y) is the old anchor point (chest), size the old sprite size.
// look:  {skin, hair, outfit, outfit2, shirt, hairStyle: "bob"|"short", glasses}
// state: {mouth 0..1, blink 0..1, brow -1..1, smile 0..1, nod, tilt, breathe -1..1}
// Code-vector hosts still need explicit user acceptance as a final style (studio-explainer rule).

const TAU = Math.PI * 2;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x45d9f3b) ^ Math.imul(b | 0, 0x119de1f3)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// deterministic blink: one every ~3.1 s, occasional double blink
export function blinkAt(t, seed = 1) {
  const k = Math.floor(t / 3.1), tb = k * 3.1 + 0.4 + 2.2 * hash01(k, seed);
  let v = Math.max(0, 1 - Math.abs(t - tb) / 0.07);
  if (hash01(k, seed + 7) > 0.75) v = Math.max(v, 1 - Math.abs(t - tb - 0.22) / 0.06);
  return v;
}

function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), 0, 0, TAU); }

function cap(ctx, rx, ry, cy) { ctx.ellipse(0, cy, rx, ry, 0, Math.PI, TAU); }

export function drawHost(ctx, x, y, size, look, st) {
  const U = size * 0.235;
  const skin = look.skin || "#f1c7a3", hair = look.hair || "#2a1e1c", outfit = look.outfit || "#2e86ab";
  const outfit2 = look.outfit2 || shade(outfit, -0.25), shirt = look.shirt || "#f4f1ea", line = "#2a2324";
  ctx.save();
  ctx.translate(x, y + size * 0.12);
  ctx.scale(U, U);
  // torso (breathing)
  ctx.save();
  ctx.scale(1, 1 + 0.012 * (st.breathe || 0));
  ctx.fillStyle = shade(skin, -0.12);
  ctx.fillRect(-0.2, -1.25, 0.4, 0.62);
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.72); ctx.bezierCurveTo(-0.2, -0.62, 0.2, -0.62, 0.55, -0.72);
  ctx.bezierCurveTo(0.95, -0.66, 1.2, -0.5, 1.26, -0.2); ctx.lineTo(1.36, 0.45); ctx.lineTo(-1.36, 0.45); ctx.lineTo(-1.26, -0.2);
  ctx.bezierCurveTo(-1.2, -0.5, -0.95, -0.66, -0.55, -0.72); ctx.closePath();
  ctx.fillStyle = outfit; ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.moveTo(-0.32, -0.7); ctx.lineTo(0.32, -0.7); ctx.lineTo(0, -0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = outfit2;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0.36 * s, -0.71); ctx.lineTo(0.05 * s, -0.12); ctx.lineTo(0.18 * s, 0.05); ctx.lineTo(0.55 * s, -0.55); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // head group pivots at the neck
  ctx.save();
  ctx.translate(0, -1.05);
  ctx.rotate(st.tilt || 0);
  ctx.translate(0, 0.02 * (st.nod || 0));
  ctx.fillStyle = hair;
  if (look.hairStyle !== "short") {
    ctx.beginPath(); ctx.moveTo(-0.78, -0.55); ctx.bezierCurveTo(-0.86, 0.05, -0.75, 0.25, -0.5, 0.28); ctx.lineTo(0.5, 0.28);
    ctx.bezierCurveTo(0.75, 0.25, 0.86, 0.05, 0.78, -0.55); ctx.bezierCurveTo(0.7, -1.25, -0.7, -1.25, -0.78, -0.55); ctx.fill();
  }
  ctx.fillStyle = shade(skin, -0.06);
  ell(ctx, -0.63, -0.3, 0.12, 0.17); ctx.fill(); ell(ctx, 0.63, -0.3, 0.12, 0.17); ctx.fill();
  // face: soft superellipse with a gentle chin
  ctx.beginPath();
  for (let i = 0; i <= 120; i += 1) {
    const th = (i / 120) * TAU, c = Math.cos(th), s = Math.sin(th);
    const r = (Math.abs(c) ** 2.5 + Math.abs(s) ** 2.5) ** (-1 / 2.5);
    let px = c * r * 0.62, py = s * r * 0.74 - 0.32;
    if (py > -0.1) py = -0.1 + (py + 0.1) * (1 - 0.18 * Math.abs(c));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.fillStyle = skin; ctx.fill();
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(s * 0.36, -0.1, 0, s * 0.36, -0.1, 0.16);
    g.addColorStop(0, "rgba(242,115,107,0.22)"); g.addColorStop(1, "rgba(242,115,107,0)");
    ctx.fillStyle = g; ell(ctx, s * 0.36, -0.1, 0.16, 0.16); ctx.fill();
  }
  // eyes + blink
  const open = Math.max(0.06, (1 - (st.blink || 0)) * (1 + 0.15 * (st.brow || 0)));
  for (const s of [-1, 1]) {
    ctx.fillStyle = line; ell(ctx, s * 0.24, -0.3, 0.072, 0.098 * open); ctx.fill();
    if (open > 0.4) { ctx.fillStyle = "rgba(255,255,255,0.9)"; ell(ctx, s * 0.24 + 0.022, -0.3 - 0.03 * open, 0.022, 0.022); ctx.fill(); }
  }
  // brows
  ctx.strokeStyle = shade(hair, 0.05); ctx.lineWidth = 0.055; ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    const y0 = -0.5 - 0.06 * (st.brow || 0);
    ctx.beginPath(); ctx.moveTo(s * 0.13, y0); ctx.bezierCurveTo(s * 0.22, y0 - 0.05, s * 0.3, y0 - 0.05, s * 0.37, y0 + 0.01); ctx.stroke();
  }
  // nose
  ctx.strokeStyle = shade(skin, -0.25); ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.moveTo(0.02, -0.22); ctx.bezierCurveTo(0.05, -0.14, 0.04, -0.1, -0.02, -0.08); ctx.stroke();
  // mouth: smile line → open shape driven by speech energy
  const m = st.mouth || 0, sm = st.smile ?? 0.35, w = 0.14 * (0.85 + 0.3 * sm), my = 0.04;
  if (m < 0.08) {
    ctx.strokeStyle = line; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(-w, my - 0.02 * sm); ctx.bezierCurveTo(-w * 0.4, my + 0.06 * sm + 0.01, w * 0.4, my + 0.06 * sm + 0.01, w, my - 0.02 * sm); ctx.stroke();
  } else {
    const h = 0.03 + 0.15 * m;
    ctx.fillStyle = line;
    ctx.beginPath(); ctx.moveTo(-w, my - 0.01); ctx.bezierCurveTo(-w * 0.5, my - 0.02, w * 0.5, my - 0.02, w, my - 0.01);
    ctx.bezierCurveTo(w * 0.8, my + h, -w * 0.8, my + h, -w, my - 0.01); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(-w * 0.62, my - 0.005, w * 1.24, Math.min(0.035, h * 0.3));
  }
  // hair front: cap over the skull + side-swept fringe
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (look.hairStyle === "short") {
    cap(ctx, 0.69, 0.84, -0.42);
    ctx.bezierCurveTo(0.62, -0.62, 0.45, -0.78, 0.2, -0.8); ctx.bezierCurveTo(-0.1, -0.7, -0.45, -0.78, -0.58, -0.6); ctx.closePath();
  } else {
    cap(ctx, 0.71, 0.82, -0.4);
    ctx.bezierCurveTo(0.55, -0.72, 0.15, -0.86, -0.12, -0.68); ctx.bezierCurveTo(-0.35, -0.85, -0.6, -0.72, -0.7, -0.45);
  }
  ctx.fill();
  if (look.glasses) {
    ctx.strokeStyle = line; ctx.lineWidth = 0.035;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect?.(s * 0.24 - 0.15, -0.42, 0.3, 0.22, 0.07); ctx.stroke(); }
  }
  ctx.restore();
  ctx.restore();
}
