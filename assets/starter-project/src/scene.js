import { trackEnabled } from "./model.js";
import { drawMV, drawMedia, drawMVOverlay, getVisual } from "./mv.js";
import { drawStudio, drawPresentation } from "./program.js";
import { smoothstep as smooth } from "./motion.js";
import { sampleMotion, drawComposition, animationTime, animationDuration } from "./composition.js";
import { drawSceneTransition } from "./composition-transitions.js";

const TAU = Math.PI * 2;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBackdrop(ctx, width, height, time) {
  ctx.fillStyle = "#111416";
  ctx.fillRect(0, 0, width, height);

  const sweep = (time * 210) % (width + 520) - 260;
  const light = ctx.createLinearGradient(sweep - 220, 0, sweep + 220, height);
  light.addColorStop(0, "rgba(29, 187, 171, 0)");
  light.addColorStop(0.46, "rgba(29, 187, 171, 0.15)");
  light.addColorStop(0.52, "rgba(243, 106, 83, 0.08)");
  light.addColorStop(1, "rgba(29, 187, 171, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#d8d5ca";
  ctx.lineWidth = 1;
  for (let i = -4; i < 9; i += 1) {
    const x = i * 170 + ((time * 24) % 170);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 350, height);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#d8d5ca";
  ctx.globalAlpha = 0.6;
  ctx.fillRect(72, 78, 42, 3);
  ctx.globalAlpha = 1;
  ctx.font = "500 13px Arial, sans-serif";
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#d8d5ca";
  ctx.fillText("V / M   MOTION STUDY", 72, 63);
  ctx.textAlign = "right";
  ctx.fillText("CODE-RENDERED  /  001", width - 72, 63);
  ctx.textAlign = "left";
}

function drawDevice(ctx, width, height, time, cue) {
  const local = clamp(
    animationTime(cue, time) / Math.max(0.001, animationDuration(cue)),
  );
  const enter = smooth(local / 0.25);
  const leave = smooth((1 - local) / 0.18);
  const transform = sampleMotion(cue.transform, cue.keyframes, animationTime(cue, time));
  const sway = Math.sin(local * TAU * 0.62) * 0.055;
  const angle = sway + (Number(transform.rotation) || 0) * (Math.PI / 180);
  const scale =
    transform.scale *
    (0.82 + enter * 0.18) *
    (1 + Math.sin(local * Math.PI) * 0.025);
  const alpha = clamp((transform.opacity ?? 1) * enter * leave);
  const cx = width * 0.51 + (Number(transform.x) || 0);
  const cy = height * 0.51 + (Number(transform.y) || 0);

  ctx.save();
  if (transform.reveal < 1) {
    ctx.beginPath(); ctx.rect(0, 0, width * transform.reveal, height); ctx.clip();
  }
  ctx.translate(cx, cy + (1 - enter) * 54);
  ctx.rotate(angle);
  ctx.scale(scale * transform.scale_x, scale * transform.scale_y);
  ctx.globalAlpha *= alpha;

  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 26;
  const body = ctx.createLinearGradient(-130, -190, 155, 230);
  body.addColorStop(0, "#373d3e");
  body.addColorStop(0.28, "#14191a");
  body.addColorStop(0.72, "#202727");
  body.addColorStop(1, "#090c0d");
  roundRect(ctx, -138, -214, 276, 428, 40);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(225, 225, 211, 0.34)";
  ctx.stroke();

  const screen = ctx.createLinearGradient(-100, -150, 110, 160);
  screen.addColorStop(0, "#202a2a");
  screen.addColorStop(0.55, "#101617");
  screen.addColorStop(1, "#1a201f");
  roundRect(ctx, -112, -184, 224, 368, 27);
  ctx.fillStyle = screen;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, -112, -184, 224, 368, 27);
  ctx.clip();
  const streak = ctx.createLinearGradient(-140, 170, 125, -190);
  streak.addColorStop(0, "rgba(29, 187, 171, 0)");
  streak.addColorStop(0.45, "rgba(29, 187, 171, 0.14)");
  streak.addColorStop(0.51, "rgba(249, 197, 89, 0.36)");
  streak.addColorStop(0.58, "rgba(243, 106, 83, 0.1)");
  streak.addColorStop(1, "rgba(243, 106, 83, 0)");
  ctx.fillStyle = streak;
  ctx.fillRect(-140, -210, 280, 430);
  ctx.restore();

  const lensPulse = 0.5 + 0.5 * Math.sin(local * TAU * 1.25);
  ctx.beginPath();
  ctx.arc(0, 0, 47 + lensPulse * 2, 0, TAU);
  ctx.fillStyle = "#090d0e";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, TAU);
  const lens = ctx.createRadialGradient(-12, -14, 3, 0, 0, 38);
  lens.addColorStop(0, "#566b65");
  lens.addColorStop(0.38, "#1c3334");
  lens.addColorStop(0.76, "#0a1519");
  lens.addColorStop(1, "#05090b");
  ctx.fillStyle = lens;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d6a65a";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-9, -12, 5, 0, TAU);
  ctx.fillStyle = "rgba(242, 239, 224, 0.82)";
  ctx.fill();
  ctx.fillStyle = "#dad6c8";
  ctx.font = "600 17px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.letterSpacing = "0px";
  ctx.fillText("NOVA   /   01", 0, 270);
  ctx.restore();
}

function drawCaption(ctx, width, height, time, cue) {
  const progress = clamp(animationTime(cue, time) / animationDuration(cue));
  const enter = smooth(progress / 0.18);
  const leave = smooth((1 - progress) / 0.16);
  const transform = sampleMotion(cue.transform, cue.keyframes, animationTime(cue, time));
  const alpha = clamp((transform.opacity ?? 1) * enter * leave);
  const x = width * 0.08 + (Number(transform.x) || 0);
  const y = height * 0.83 + (Number(transform.y) || 0);
  const fontSize = Math.round(36 * transform.scale);

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y + (1 - enter) * 20);
  ctx.rotate((Number(transform.rotation) || 0) * (Math.PI / 180));
  ctx.scale(transform.scale_x, transform.scale_y);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${fontSize}px Arial, sans-serif`;
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#f2efe4";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  if (transform.reveal < 1) {
    ctx.beginPath(); ctx.rect(0, -fontSize, width * 0.72 * transform.reveal, fontSize * 2); ctx.clip();
  }
  ctx.strokeText(cue.text || "", 0, 0, width * 0.72);
  ctx.fillText(cue.text || "", 0, 0, width * 0.72);
  ctx.restore();
}

function withCamera(ctx, cue, time, width, height, draw) {
  if (!cue.camera || typeof cue.camera !== "object") { draw(); return; }
  const motion = sampleMotion(cue.camera.transform, cue.camera.keyframes, animationTime(cue, time));
  ctx.save();
  if (motion.reveal < 1) { ctx.beginPath(); ctx.rect(0, 0, width * motion.reveal, height); ctx.clip(); }
  ctx.translate(width / 2 + motion.x, height / 2 + motion.y);
  ctx.rotate(motion.rotation * Math.PI / 180);
  ctx.scale(motion.scale * motion.scale_x, motion.scale * motion.scale_y);
  ctx.translate(-width / 2, -height / 2);
  ctx.globalAlpha *= motion.opacity;
  draw();
  ctx.restore();
}

function drawProgramScene(ctx, timeline, cue, time, width, height) {
  const transform = sampleMotion(cue.transform, cue.keyframes, animationTime(cue, time));
  ctx.save();
  if (transform.reveal < 1) { ctx.beginPath(); ctx.rect(0, 0, width * transform.reveal, height); ctx.clip(); }
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
  ctx.rotate(transform.rotation * Math.PI / 180);
  ctx.scale(transform.scale * transform.scale_x, transform.scale * transform.scale_y);
  ctx.translate(-width / 2, -height / 2);
  ctx.globalAlpha *= transform.opacity;
  withCamera(ctx, cue, time, width, height, () => {
    if (timeline.studio) drawStudio(ctx, timeline, time, width, height);
    else drawPresentation(ctx, timeline, time, width, height);
  });
  ctx.restore();
}

function drawSceneCue(ctx, timeline, cue, time, width, height) {
  if (cue.scene === "composition") {
    drawComposition(ctx, timeline, time, width, height, cue, getVisual);
  } else {
    withCamera(ctx, cue, time, width, height, () => {
      if (timeline.design) drawMV(ctx, timeline, time, width, height, cue);
      else drawDevice(ctx, width, height, time, cue);
    });
  }
}

export function renderFrame(ctx, timeline, time, width, height) {
  const safeTime = clamp(time, 0, timeline.duration_seconds);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.textBaseline="alphabetic";ctx.textAlign="left";ctx.letterSpacing="0px";
  ctx.fillStyle="#111416";ctx.fillRect(0,0,width,height);
  const compositionActive = timeline.cues.some((cue) => cue.kind === "scene" && cue.scene === "composition" &&
    safeTime >= cue.start_sec && safeTime < cue.end_sec && trackEnabled(timeline, cue));
  if (!compositionActive && (timeline.studio || timeline.presentation)) {
    const current=timeline.cues.find((c)=>c.kind==="scene"&&safeTime>=c.start_sec&&safeTime<c.end_sec&&trackEnabled(timeline,c));
    if(!current)return;
    const drawCue=(context,item,sampleTime)=>drawProgramScene(context,timeline,item,sampleTime,width,height);
    if(!drawSceneTransition(ctx,timeline,safeTime,width,height,current,drawCue))drawCue(ctx,current,safeTime);
    return;
  }
  const musicVideo = !!timeline.design;
  if (musicVideo) { ctx.fillStyle = timeline.design.palette[1]; ctx.fillRect(0,0,width,height); }
  else if (!compositionActive) drawBackdrop(ctx, width, height, safeTime);

  for (const cue of timeline.cues.filter((c) => c.kind === "scene" &&
    safeTime >= c.start_sec && safeTime < c.end_sec && trackEnabled(timeline, c))) {
    const drawCue=(context,item,sampleTime)=>drawSceneCue(context,timeline,item,sampleTime,width,height);
    if(!drawSceneTransition(ctx,timeline,safeTime,width,height,cue,drawCue))drawCue(ctx,cue,safeTime);
  }
  for (const cue of timeline.cues.filter((c) => ["image","footage"].includes(c.kind) &&
    safeTime >= c.start_sec && safeTime < c.end_sec && trackEnabled(timeline, c))) {
    drawMedia(ctx, cue, safeTime, width, height);
  }

  const titles = timeline.cues
    .filter(
      (cue) =>
        cue.kind === "title" &&
        safeTime >= cue.start_sec &&
        safeTime < cue.end_sec,
    )
    .filter((cue) =>
      timeline.tracks.find((track) => track.id === cue.track_id)?.visible,
    );
  for (const cue of titles) drawCaption(ctx, width, height, safeTime, cue);
  if (compositionActive) return;
  if (musicVideo) { drawMVOverlay(ctx,timeline,safeTime,width,height); return; }

  ctx.save();
  ctx.fillStyle = "rgba(242, 239, 228, 0.68)";
  ctx.font = "500 12px Arial, sans-serif";
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
  ctx.fillText("FORM STUDY    /    2026", width * 0.08, height * 0.93);
  ctx.textAlign = "right";
  ctx.fillText("V / M", width * 0.92, height * 0.93);
  ctx.restore();
}
