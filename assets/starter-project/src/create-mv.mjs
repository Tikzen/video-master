#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { generateMusic, musicStatus } from "./music-tools.mjs";
import { inside, atomicJson, probe } from "./media.mjs";
import { frame, validate } from "./model.js";
import { audioEnergy } from "./analyze-audio.mjs";
import { compileMvPlan } from "./mv-plan.mjs";
import { synthesizeMotionSfx } from "./motion-sfx.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const prompt = arg("--prompt", "");
if (!prompt.trim()) throw new Error("--prompt is required");
const old = JSON.parse(await fs.readFile(path.join(root, "video.json")));
if (old.mode && !args.includes("--replace-draft")) throw new Error("Draft exists; use a new project or explicit --replace-draft");
const authoredPlan = arg("--plan") ? JSON.parse(await fs.readFile(inside(root, arg("--plan")), "utf8")) : null;
const fps = Number(arg("--fps", authoredPlan?.project?.fps ?? 30));
const duration = frame(Number(arg("--duration", authoredPlan?.project?.duration_seconds ?? 24)), fps);
let bpm = Number(arg("--bpm", "120"));
const width = Number(arg("--width", authoredPlan?.project?.width ?? 1920)), height = Number(arg("--height", authoredPlan?.project?.height ?? 1080));
if (![duration,bpm,width,height].every(Number.isFinite) || !Number.isInteger(fps) || fps < 1 || fps > 120 ||
    duration < 4 || duration > 300 || bpm < 40 || bpm > 220) throw new Error("Invalid duration/bpm/dimensions/fps");
const theme = arg("--theme", /太空|宇宙|space|orbit/i.test(prompt) ? "space" : /极简|黑白|minimal/i.test(prompt) ? "minimal" : "kinetic");
const palettes = { space: ["#f3f1e9","#101716","#e96147","#77d6ba"], minimal: ["#f1f1ec","#111514","#d84534","#8fc4be"], kinetic: ["#eff0e9","#141719","#f14e40","#72d5be"] };
if (!palettes[theme]) throw new Error("Choose theme space, minimal, kinetic; customize the design/scene code for other styles");
const compiled = authoredPlan ? compileMvPlan(authoredPlan, old, { width, height, fps, duration_seconds: duration }) : null;
let assets = [];
if (arg("--manifest")) {
  const manifestPath = inside(root, arg("--manifest"));
  const manifest = JSON.parse(await fs.readFile(manifestPath));
  for (const asset of manifest.assets || manifest) {
    if (!["image","footage"].includes(asset.kind) || !asset.source || !asset.usage || !asset.credit) throw new Error("Every asset needs kind, source, usage and credit");
    if (asset.url && !asset.local) {
      const url = new URL(asset.url);
      if (url.protocol !== "https:") throw new Error("Asset URL must use HTTPS");
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`Asset fetch failed: ${res.status} ${url}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 80e6) throw new Error("Asset exceeds 80 MB; download/preprocess separately");
      const ext = path.extname(url.pathname).toLowerCase();
      if (![".jpg",".jpeg",".png",".webp",".svg",".mp4",".webm"].includes(ext)) throw new Error("Unsupported visual asset extension");
      const file = `assets/media/${createHash("sha256").update(buffer).digest("hex").slice(0,16)}${ext}`;
      await fs.mkdir(inside(root, "assets/media"), { recursive: true });
      await fs.writeFile(inside(root, file), buffer); asset.local = file;
    }
    await fs.access(inside(root, asset.local));
    asset.sha256 = createHash("sha256").update(await fs.readFile(inside(root, asset.local))).digest("hex");
    if (asset.kind === "footage") asset.duration = Number((await probe(inside(root, asset.local))).format.duration);
    assets.push(asset);
  }
}
const seed = createHash("sha256").update(prompt).digest().readUInt32LE(0);
let selected;
try{await fs.access(path.join(root,"music_tool.json"));selected=(await musicStatus(root)).selected;}
catch(error){if(error.code!=="ENOENT")throw error;}
if(!args.includes("--bpm")&&selected)bpm=selected.bpm;
const explicitAudio = arg("--audio");
if (explicitAudio && args.includes("--no-music")) throw new Error("--audio and --no-music conflict");
if (args.includes("--music-style") && args.includes("--no-music")) throw new Error("--music-style and --no-music conflict");
const mode = args.includes("--no-music") ? "none" : explicitAudio ? "provided" :
  args.includes("--music-style") ? "procedural" : selected?.mode ?? "procedural";
const audio = mode === "provided" ? explicitAudio ?? selected?.src : undefined;
if(mode==="custom")throw new Error("Custom music needs Agent adaptation before building");
let music;
if (audio) {
  const src = audio, info = await probe(inside(root, src));
  if (!info.streams.some((s) => s.codec_type === "audio") || Number(info.format.duration) < duration) throw new Error("Audio missing or shorter than the requested video; choose actual duration");
  music = { src, bpm, features: await audioEnergy(inside(root,src)), provenance: "User-supplied track. BPM is a supplied timing assumption, not automatic beat detection." };
} else if(mode==="none")music={bpm,features:[],provenance:"No music selected."};
else music = await generateMusic(root, { duration, bpm, seed:selected?.seed??seed,style:arg("--music-style",selected?.style??"electronic") });
const project = { ...(compiled?.project ?? old), name: compiled?.project.name ?? `mv-${theme}`, mode: "mv",
  creation_mode: compiled ? "agent-plan" : "scaffold", width, height, fps, duration_seconds: frame(duration,fps), prompt };
const timeline = compiled?.timeline ?? { schema: "video-master.timeline.v1", fps, duration_seconds: project.duration_seconds,
  design: { title: arg("--title", theme === "space" ? "ORBIT / SIGNAL" : "RHYTHM / FORM"), theme, palette: palettes[theme] },
  creation: { kind: "scaffold", status: "needs_direction" },
  music, tracks: [
    { id: "scenes", kind: "video", name: "代码镜头", visible: true, muted: false, exclusive: true },
    { id: "media", kind: "video", name: "素材合成", visible: true, muted: false, exclusive: true },
    { id: "titles", kind: "graphics", name: "动态字卡", visible: true, muted: false },
    { id: "vm-music", kind: "music", name: "音乐", visible: true, muted: false },
  ], cues: [] };
timeline.music = music;
if (compiled) {
  timeline.tracks.push({ id: "vm-music", kind: "music", name: "Music", visible: true, muted: false });
  if (arg("--title")) timeline.design.title = arg("--title");
}
const motionSfx = compiled ? await synthesizeMotionSfx(root, compiled.soundEvents, { duration, fps }) : null;
if (motionSfx?.src) {
  if (timeline.tracks.some((track) => track.id === "vm-motion-sfx") || timeline.cues.some((cue) => cue.id === "vm-motion-sfx")) {
    throw new Error("vm-motion-sfx track/cue is reserved for sound_events");
  }
  timeline.tracks.push({ id: "vm-motion-sfx", kind: "sfx", name: "Motion Sound Events", visible: true, muted: false });
  timeline.cues.push({ id: "vm-motion-sfx", kind: "sfx", track_id: "vm-motion-sfx", title: "Authored motion hits and transitions",
    src: motionSfx.src, start_sec: 0, end_sec: duration, source_offset: 0, volume: 0.6 });
  timeline.sound_events = motionSfx.events;
}
const transform = () => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
const types = theme === "space" ? ["orbit","tunnel","type","ribbons","grid"] : ["type","grid","ribbons","tunnel","orbit"];
let start = 0, index = 0;
while (!compiled && start < timeline.duration_seconds - 1e-6) {
  const phase = start / timeline.duration_seconds;
  const beatCount = phase < 0.2 ? 8 : phase < 0.75 ? 4 : 8;
  const end = frame(Math.min(timeline.duration_seconds, start + beatCount * 60 / bpm), fps);
  const id = `scene-${String(index+1).padStart(2,"0")}`, type = types[index % types.length];
  timeline.cues.push({ id, track_id: "scenes", kind: "scene", scene: type, title: `${index+1} / ${type}`,
    start_sec: start, end_sec: end, word: ["SIGNAL","MOVE","BEYOND","FEEL","ORBIT"][index % 5], transform: transform() });
  if (assets.length && index % 2 === 1) {
    const asset = assets[Math.floor(index/2) % assets.length];
    timeline.cues.push({ id: `media-${index}`, track_id: "media", kind: asset.kind, src: asset.local,
      start_sec: start, end_sec: asset.duration ? frame(Math.min(end,start+asset.duration-1/fps),fps) : end,
      source_offset: 0, title: asset.title || asset.credit, credit:asset.credit, transform: transform(), mask: index % 4 === 1 ? "diagonal" : "full",
      asset_refs: [asset.local] });
  }
  const titleStart = frame(start + 0.2, fps);
  if (type !== "type" && end - titleStart >= 1/fps - 1e-6) timeline.cues.push({ id: `title-${index}`, track_id: "titles", kind: "title",
    start_sec: titleStart, end_sec: end, title: `字卡 ${index+1}`, text: ["FOLLOW THE SIGNAL","A NEW FREQUENCY","BEYOND THE FRAME","STAY IN MOTION"][index % 4],
    transform: transform(), keyframes: [] });
  start = end; index++;
}
if(music.src)timeline.cues.push({ id: "vm-music-bed", track_id: "vm-music", kind: "music", title: "Music", src: music.src,
  start_sec: 0, end_sec: timeline.duration_seconds, source_offset: 0, source_duration: duration,
  volume: selected?.volume??0.85, fade_in: 0.1, fade_out: 0.6, duck_gain:.28 });
const errors = validate(project, timeline); if (errors.length) throw new Error(errors.join("; "));
await atomicJson(path.join(root,"video.json"),project);
await atomicJson(path.join(root,"timeline.json"),timeline);
await atomicJson(path.join(root,"storyboard.json"),compiled?.storyboard ?? timeline.cues.filter((c)=>c.kind==="scene"));
await atomicJson(path.join(root,"assets/provenance.json"),{ assets, music: music.provenance,
  ...(authoredPlan ? { plan: { src: arg("--plan"), sha256: createHash("sha256").update(JSON.stringify(authoredPlan)).digest("hex"),
    declarations: authoredPlan.provenance ?? null } } : {}) });
if (motionSfx?.src) await atomicJson(path.join(root, "validation/motion-sfx.json"), motionSfx);
await fs.writeFile(path.join(root,"video_brief.md"), `# MV Brief\n\nPrompt: ${prompt}\n\n${compiled ? "Agent-authored executable plan" : `Scaffold only; style seed: ${theme}`}. ${duration}s, ${width}x${height}, ${fps}fps, ${bpm} BPM.\nMusic: ${music.provenance}\n\nThis is an execution draft, not a human confirmation receipt.${compiled ? "" : " Fixed visualization presets are infrastructure tests, not a finished directed music video."}\n`);
console.log(JSON.stringify({ status: compiled ? "directed_draft" : "scaffold", project,
  scenes: timeline.cues.filter((cue) => cue.kind === "scene").length, media: assets.length, music: music.src,
  next: compiled ? "Inspect representative action/transition previews before delivery." : "Author --plan or scene code; do not deliver this preset scaffold as a finished MV." }));
