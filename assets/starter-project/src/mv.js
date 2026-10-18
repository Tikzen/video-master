import { smoothstep as smooth } from "./motion.js";
import { sampleMotion, collectCompositionVisuals, animationDuration, animationTime } from "./composition.js";
import { transitionSource } from "./composition-transitions.js";

const TAU = Math.PI * 2;
const images = new Map(), videos = new Map();
const pendingImages = new Map(), pendingVideos = new Map();

function visualCues(timeline) {
  return [
    ...timeline.cues.filter((cue) => cue.src && ["image", "footage"].includes(cue.kind)),
    ...collectCompositionVisuals(timeline),
  ];
}

function visible(timeline, cue) {
  return timeline.tracks.find((track) => track.id === cue.track_id)?.visible !== false;
}

async function loadImage(src) {
  if (images.has(src)) return;
  if (!pendingImages.has(src)) {
    pendingImages.set(src, (async () => {
      const image = new Image();
      image.src = `/${src.replaceAll("\\", "/")}`;
      await image.decode();
      images.set(src, image);
    })().finally(() => pendingImages.delete(src)));
  }
  await pendingImages.get(src);
}

async function loadVideo(cue) {
  if (videos.get(cue.id)?.src === cue.src) return;
  const key = `${cue.id}\0${cue.src}`;
  if (!pendingVideos.has(key)) {
    pendingVideos.set(key, (async () => {
      const video = document.createElement("video");
      video.muted = true; video.preload = "auto"; video.playsInline = true;
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); video.onloadeddata = null; video.onerror = null; };
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Video decode timeout: ${cue.src}`)); }, 20000);
        video.onloadeddata = () => { cleanup(); resolve(); };
        video.onerror = () => { cleanup(); reject(new Error(`Video decode failed: ${cue.src}`)); };
        video.src = `/${cue.src.replaceAll("\\", "/")}`;
      });
      const old = videos.get(cue.id)?.element;
      if (old) { old.removeAttribute("src"); old.load(); }
      videos.set(cue.id, { src: cue.src, element: video });
    })().finally(() => pendingVideos.delete(key)));
  }
  await pendingVideos.get(key);
}

export async function loadVisuals(timeline) {
  const configured = [];
  if (timeline.studio?.background) configured.push({kind:"image",src:timeline.studio.background});
  if (timeline.studio?.desk) configured.push({kind:"image",src:timeline.studio.desk});
  for (const host of timeline.studio?.hosts || []) {
    for (const src of Object.values(host.expressions || {})) configured.push({kind:"image",src});
  }
  const cues = [...configured, ...visualCues(timeline)];
  for (const cue of cues) {
    if (cue.kind === "image") await loadImage(cue.src);
    else await loadVideo(cue);
  }
  const required = new Set(cues.filter((cue) => cue.kind === "footage").map((cue) => cue.id));
  for (const [id, item] of videos) {
    if (required.has(id)) continue;
    item.element.removeAttribute("src"); item.element.load(); videos.delete(id);
  }
}

export const getVisual = (src, id) => {
  const video = videos.get(id);
  if (!src) return undefined;
  return video && video.src === src ? video.element : images.get(src);
};

export async function prepareVisuals(timeline, time) {
  const cues = visualCues(timeline);
  const active = cues.filter((cue) => cue.kind === "footage" && visible(timeline, cue) && time >= cue.start_sec && time < cue.end_sec)
    .map((cue) => ({ cue, time }));
  for (const incoming of timeline.cues.filter((cue) => cue.kind === "scene" && visible(timeline, cue) &&
      time >= cue.start_sec && time < cue.end_sec)) {
    const previous = transitionSource(timeline, incoming, time);
    if (!previous) continue;
    const previousVisuals = previous.cue.scene === "composition"
      ? collectCompositionVisuals({ cues: [previous.cue] })
      : cues;
    for (const cue of previousVisuals) {
      if (cue.kind === "footage" && previous.time >= cue.start_sec && previous.time < cue.end_sec) active.push({ cue, time: previous.time });
    }
  }
  const targets = new Map(active.map((item) => [item.cue.id, item]));
  await Promise.all([...targets.values()].map(async ({ cue, time: sampleTime }) => {
    const cached = videos.get(cue.id), video = cached?.src === cue.src ? cached.element : null;
    if (!video) throw new Error(`Missing video: ${cue.id} (${cue.src})`);
    const target = Math.max(0, Math.min(video.duration - 0.002, (cue.source_offset || 0) + sampleTime - cue.start_sec));
    if (Math.abs(video.currentTime - target) < 0.0001 && video.readyState >= 2) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.onseeked = null; video.onerror = null; };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Video seek timeout: ${cue.src}`)); }, 12000);
      video.onseeked = () => { cleanup(); resolve(); };
      video.onerror = () => { cleanup(); reject(new Error(`Video seek failed: ${cue.src}`)); };
      video.currentTime = target;
    });
  }));
}

export function drawMedia(ctx, cue, time, width, height) {
  const media = getVisual(cue.src, cue.id);
  if (!media) return;
  const local = animationTime(cue, time) / animationDuration(cue);
  const t = sampleMotion(cue.transform, cue.keyframes, animationTime(cue, time));
  const iw = media.naturalWidth || media.videoWidth, ih = media.naturalHeight || media.videoHeight;
  const scale = (cue.fit === "contain" ? Math.min(width/iw,height/ih) : Math.max(width/iw,height/ih)) *
    t.scale * (cue.fit === "contain" ? 1 : 1.03 + smooth(local) * 0.13);
  ctx.save();
  ctx.globalAlpha *= t.opacity;
  if (t.reveal < 1) {
    ctx.beginPath(); ctx.rect(0, 0, width * t.reveal, height); ctx.clip();
  }
  ctx.translate(width / 2 + (t.x || 0), height / 2 + (t.y || 0));
  ctx.rotate((t.rotation || 0) * Math.PI / 180);
  ctx.scale(t.scale_x, t.scale_y);
  if (cue.mask === "diagonal") {
    ctx.beginPath(); ctx.moveTo(-width / 2, -height / 2); ctx.lineTo(width * 0.18, -height / 2);
    ctx.lineTo(width * 0.42, height / 2); ctx.lineTo(-width / 2, height / 2); ctx.closePath(); ctx.clip();
  }
  ctx.drawImage(media, -iw * scale / 2, -ih * scale / 2, iw * scale, ih * scale);
  ctx.restore();
}

export function drawMV(ctx, timeline, time, width, height, cue) {
  const design = timeline.design || {}, palette = design.palette || ["#f2f1ea", "#131719", "#e85542", "#7ad5c8"];
  const [paper, ink, accent, cool] = palette;
  const bpm = timeline.music?.bpm || 120, beat = time * bpm / 60, pulse = Math.exp(-(beat % 1) * 8);
  const local = animationTime(cue, time), progress = local / animationDuration(cue);
  const energy = timeline.music?.features?.[Math.min(timeline.music.features.length - 1, Math.floor(time * 30))]?.rms || 0;
  const type = cue.scene, bright = type === "type" || type === "grid";
  ctx.save();
  const t = sampleMotion(cue.transform, cue.keyframes, local);
  ctx.globalAlpha *= t.opacity;
  if (t.reveal < 1) {
    ctx.beginPath(); ctx.rect(0, 0, width * t.reveal, height); ctx.clip();
  }
  ctx.translate(width / 2 + (t.x || 0), height / 2 + (t.y || 0));
  ctx.rotate((t.rotation || 0) * Math.PI / 180); ctx.scale(t.scale * t.scale_x, t.scale * t.scale_y);
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = bright ? paper : ink; ctx.fillRect(0, 0, width, height);
  if (type === "tunnel") {
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate(time * 0.16);
    const max = Math.max(width, height);
    const alpha = ctx.globalAlpha;
    for (let i = 16; i >= 0; i--) {
      const depth = ((i + progress * 5) % 17) / 17;
      const size = max * depth ** 2 * 1.7;
      ctx.strokeStyle = i % 3 === 0 ? accent : cool; ctx.globalAlpha = alpha * (0.2 + depth * 0.8);
      ctx.lineWidth = (1 + pulse * 3) * width / 1280;
      ctx.strokeRect(-size / 2, -size * 0.29, size, size * 0.58);
    }
    ctx.restore();
  } else if (type === "grid") {
    const cols = 8, rows = 5, cell = Math.min(width / cols, height / rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      ctx.save(); ctx.translate((x + 0.5) * width / cols, (y + 0.5) * height / rows);
      ctx.rotate((Math.floor(beat / 2) % 4) * Math.PI / 2 + Math.sin(time * 2 + x + y) * 0.12);
      ctx.fillStyle = (x + y + Math.floor(beat)) % 3 === 0 ? accent : ink;
      const size = cell * (0.45 + 0.2 * Math.sin(x * 2 + y + time * 3) + energy * 0.8);
      ctx.fillRect(-size / 2, -size / 2, size, size * 0.27); ctx.restore();
    }
  } else if (type === "ribbons") {
    for (let strip = 0; strip < 10; strip++) {
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 12) {
        const y = height * (0.15 + strip * 0.075) + Math.sin(x / width * 6 + time * 2.8 + strip * 0.42) * height * (0.1 + energy * 0.3);
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = strip % 3 === 0 ? accent : cool;
      ctx.lineWidth = height * (0.012 + pulse * 0.004); ctx.stroke();
    }
  } else if (type === "type") {
    ctx.fillStyle = accent;
    const x = width * (0.15 + smooth(progress) * 0.55);
    ctx.fillRect(x, 0, width * 0.16, height);
    ctx.fillStyle = ink; ctx.font = `800 ${Math.round(height * 0.24)}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let row = -1; row <= 3; row++) {
      const shift = Math.sin(time * 2 + row) * width * 0.07;
      ctx.fillText((cue.word || "MOVE").toUpperCase(), width / 2 + shift, height * (row * 0.28 + 0.22), width * 0.85);
    }
  } else {
    // A code-defined orbital instrument, not an image-generated animation.
    ctx.save(); ctx.translate(width * 0.5, height * 0.5);
    for (let ring = 0; ring < 5; ring++) {
      ctx.save(); ctx.rotate(time * (0.2 + ring * 0.035) + ring * 0.52);
      const r = height * (0.13 + ring * 0.064) * (1 + pulse * 0.025);
      ctx.strokeStyle = ring % 2 ? cool : accent; ctx.lineWidth = ring === 2 ? height * 0.012 : 2;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.55, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = paper; ctx.fillRect(r * 1.5 - 5, -5, 10, 10); ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawMVOverlay(ctx, timeline, time, width, height) {
  if (timeline.cues.some((cue) => cue.scene === "composition" && visible(timeline, cue) && time >= cue.start_sec && time < cue.end_sec)) return;
  const design = timeline.design || {}, palette = design.palette || ["#f2f1ea", "#131719", "#e85542", "#7ad5c8"];
  const beat = time * (timeline.music?.bpm || 120) / 60;
  ctx.save();
  ctx.font = `600 ${Math.round(height * 0.018)}px Arial, sans-serif`;
  ctx.fillStyle = palette[0]; ctx.textAlign = "left";
  ctx.fillText(design.title || "ORBIT / MOTION", width * 0.045, height * 0.065);
  ctx.textAlign = "right"; ctx.fillText(`${Math.floor(beat).toString().padStart(3,"0")} / ${timeline.music?.bpm || 120} BPM`, width * 0.955, height * 0.065);
  const asset=timeline.cues.find((c)=>c.credit&&time>=c.start_sec&&time<c.end_sec);
  if(asset){
    ctx.font=`500 ${Math.round(height*.017)}px Arial,sans-serif`;
    const credit=`SOURCE / ${asset.credit}`,w=Math.min(width*.55,ctx.measureText(credit).width+24);
    ctx.fillStyle="#101716cc";ctx.fillRect(width*.955-w,height*.91,w,height*.04);
    ctx.fillStyle=palette[0];ctx.fillText(credit,width*.945,height*.938,width*.53);
  }
  for (let i = 0; i < 48; i++) {
    const phase = Math.sin(i * 0.9 + time * 8), energy = timeline.music?.features?.[Math.floor(time * 30)]?.rms || 0.1;
    const h = height * (0.008 + energy * 0.15 * Math.abs(phase));
    ctx.fillStyle = i % 4 === 0 ? palette[2] : palette[0];
    ctx.fillRect(width * 0.045 + i * width * 0.0033, height * 0.93 - h, width * 0.0018, h);
  }
  ctx.restore();
}
