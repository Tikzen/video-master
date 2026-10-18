#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { validate } from "./model.js";
import { inside, probe, run, atomicJson, ffmpegPath } from "./media.mjs";
import { voiceIntervals, mixGainExpression } from "./audio-mix.js";
import { renderWindow, audioSlices } from "./render-window.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const numberArg = (key, fallback) => args.includes(key) ? Number(arg(key)) : fallback;
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node src/render.mjs [--output PROJECT-RELATIVE.mp4] [--start SEC] [--duration SEC] [--fps N] [--snapshot DIR] [--audio FILE]\nRange previews retain absolute scene time and the original audio offset, fades and speech ducking. Existing output files are never overwritten.");
  process.exit(0);
}
const source = arg("--snapshot", ".");
const project = JSON.parse(await fs.readFile(inside(ROOT, `${source}/video.json`), "utf8"));
const timeline = JSON.parse(await fs.readFile(inside(ROOT, `${source}/timeline.json`), "utf8"));
const errors = validate(project, timeline);
if (errors.length) throw new Error(errors.join("; "));
const window = renderWindow(timeline, { start: numberArg("--start", 0), duration: numberArg("--duration"), fps: numberArg("--fps", project.fps) });
const { start: sourceStart, duration, fps, frames } = window;
const output = inside(ROOT, arg("--output", `delivery/video-${Date.now()}.mp4`));
try { await fs.access(output); throw new Error("Output already exists; choose a new versioned path"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const temporary = `${output}.partial.mp4`;
await fs.mkdir(path.dirname(output), { recursive: true });
const tracks = audioSlices(arg("--audio") ? {
  tracks: [{ id: "override", muted: false }],
  cues: [{ kind: "music", track_id: "override", src: arg("--audio"), start_sec: 0, end_sec: timeline.duration_seconds, source_offset: 0, volume: 1 }],
} : timeline, window);
const { server, url } = await createProjectServer(ROOT, 0, true);
let browser, encoder, finished, stderr = "";
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: project.width, height: project.height } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${url}/src/render.html`);
  await page.waitForFunction(() => typeof window.renderFrameAt === "function");
  await page.evaluate(() => document.fonts.ready);
  const pngAt = async (t) => {
    const data = await page.evaluate(({ sequence, config, time }) => window.renderFrameAt(sequence, config, time),
      { sequence: timeline, config: project, time: t });
    return Buffer.from(data.split(",")[1], "base64");
  };
  const sampleTime = sourceStart + Math.min(duration / 2, duration - 1 / fps);
  const a = await pngAt(sampleTime), b = await pngAt(sampleTime);
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  if (hash(a) !== hash(b)) throw new Error("Renderer is not deterministic at the same timestamp");
  const previewDir = inside(ROOT, `renders/preview/${path.basename(output, ".mp4")}`);
  await fs.mkdir(previewDir, { recursive: true });
  for (const [name, t] of [["first", sourceStart], ["middle", sampleTime], ["last", sourceStart + (frames - 1) / fps]]) {
    await fs.writeFile(path.join(previewDir, `${name}.png`), await pngAt(t));
  }
  if (pageErrors.length) throw new Error(pageErrors.join("; "));
  const ffargs = ["-v", "error", "-f", "image2pipe", "-vcodec", "png", "-framerate", String(fps), "-i", "pipe:0"];
  const filters = [];
  const speaking=arg("--audio")?[]:voiceIntervals(timeline);
  for (const [i, audio] of tracks.entries()) {
    const file = inside(ROOT, audio.cue.src);
    await fs.access(file);
    ffargs.push("-i", file);
    let chain = `[${i + 1}:a]atrim=start=${audio.source_offset}:duration=${audio.duration},asetpts=PTS-STARTPTS,volume='${mixGainExpression(audio.cue,speaking,audio.source_start_sec)}':eval=frame`;
    const delay = Math.round(audio.start_sec * 1000);
    chain += `,aformat=channel_layouts=stereo,adelay=${delay}|${delay},apad,atrim=duration=${duration}[a${i}]`;
    filters.push(chain);
  }
  if (tracks.length) {
    // Full-length padded tracks keep amix normalization constant on older and newer FFmpeg.
    filters.push(`${tracks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${tracks.length}:dropout_transition=0,volume=${tracks.length},alimiter=limit=0.95:level=false,atrim=start=0.005,asetpts=PTS-STARTPTS,apad[mix]`);
    ffargs.push("-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[mix]", "-c:a", project.audio_codec || "aac");
  }
  ffargs.push("-c:v", project.video_codec || "libx264", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-t", String(frames / fps), temporary);
  encoder = spawn(ffmpegPath, ffargs, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let stdinError;
  encoder.stdin.on("error", (error) => { stdinError = error; });
  encoder.stderr.on("data", (data) => { stderr = (stderr + data).slice(-12000); });
  finished = new Promise((resolve) => {
    encoder.on("error", (error) => resolve({ error }));
    encoder.on("close", (code) => resolve({ code }));
  });
  for (let index = 0; index < frames; index++) {
    if (stdinError) throw new Error(stderr || stdinError.message);
    const png = await pngAt(sourceStart + index / fps);
    if (!encoder.stdin.write(png)) await once(encoder.stdin, "drain");
    if (index % 10 === 0) console.log(JSON.stringify({ progress: Math.round(index / frames * 90) }));
  }
  encoder.stdin.end();
  const result = await finished;
  if (result.error || result.code !== 0) throw new Error(stderr || result.error?.message || "Encoder failed");
  if (pageErrors.length) throw new Error(pageErrors.join("; "));
  const info = await probe(temporary);
  const stream = info.streams.find((s) => s.codec_type === "video");
  const [numerator, denominator] = stream.avg_frame_rate.split("/").map(Number);
  if (stream.width !== project.width || stream.height !== project.height ||
    Math.abs(numerator / denominator - fps) > 0.01 ||
    Math.abs(Number(info.format.duration) - frames / fps) > 0.15) throw new Error("Encoded format/duration mismatch");
  if (tracks.length && !info.streams.some((s) => s.codec_type === "audio")) throw new Error("Encoded audio missing");
  await run(ffmpegPath, ["-v", "error", "-xerror", "-i", temporary, "-f", "null", "-"]);
  await fs.rename(temporary, output);
  const receipt = {
    schema: "video-master.delivery.v1", status: "passed", output,
    created_at: new Date().toISOString(), dimensions: [stream.width, stream.height],
    fps: numerator / denominator, duration_seconds: Number(info.format.duration),
    source_start_sec: sourceStart, source_end_sec: window.end,
    audio_streams: info.streams.filter((s) => s.codec_type === "audio").length,
    video_codec: stream.codec_name, deterministic_frame_sha256: hash(a),
    sha256: hash(await fs.readFile(output)), timeline_sha256: hash(Buffer.from(JSON.stringify(timeline))),
    checks: ["schema", "same-time pixel hash", "browser runtime errors", "ffprobe metadata", "full FFmpeg decode"],
    human_review: "not_recorded", previews: previewDir,
  };
  await atomicJson(inside(ROOT, `validation/${path.basename(output, ".mp4")}.json`), receipt);
  console.log(JSON.stringify({ progress: 100, ...receipt }));
} catch (error) {
  encoder?.kill();
  if (finished) await finished;
  console.error(`${error.stack || error.message}${stderr ? `\nFFmpeg: ${stderr}` : ""}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
