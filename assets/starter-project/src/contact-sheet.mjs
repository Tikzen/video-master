#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditMotion, buildMotionSamples, readMotionProject, parseReviewArgs, DEFAULT_MAX_SAMPLES } from "./motion-review.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngBytes = (data) => {
  if (typeof data !== "string" || !data.startsWith("data:image/png;base64,")) throw new Error("Renderer must return a PNG data URL.");
  const bytes = Buffer.from(data.slice("data:image/png;base64,".length), "base64");
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Renderer returned invalid PNG bytes.");
  return bytes;
};
const absent = async (file) => {
  try { await fs.access(file); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`Output already exists; choose another versioned path: ${file}`);
};
const deadline = async (operation) => {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Renderer timed out after 45 seconds.")), 45000);
  })]); }
  finally { clearTimeout(timer); }
};

export async function createContactSheet(projectRoot, options = {}) {
  const root = path.resolve(projectRoot), columns = options.columns ?? 4;
  if (!Number.isInteger(columns) || columns < 1 || columns > 8) throw new Error("--columns must be an integer from 1 to 8.");
  const data = await readMotionProject(root, options.storyboard);
  const samples = buildMotionSamples(data.project, data.timeline, {
    storyboard: data.storyboard, start: options.start, end: options.end, maxSamples: options.maxSamples,
  });
  const stamp = `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  const output = path.resolve(root, options.output || `renders/preview/contact-sheet-${stamp}.png`);
  if (path.extname(output).toLowerCase() !== ".png") throw new Error("--output must name a PNG file.");
  const manifestPath = output.slice(0, -4) + ".json";
  await Promise.all([absent(output), absent(manifestPath)]);
  const framesFolder = options.saveFrames ? output.slice(0, -4) + "-frames" : null;
  if (framesFolder) {
    await absent(framesFolder);
    await fs.mkdir(framesFolder, { recursive: true });
  }
  for (const file of ["package.json", "src/server.mjs", "src/render.html"]) {
    try { await fs.access(path.join(root, file)); }
    catch { throw new Error(`Missing project runtime file: ${file}. Initialize a Video Master project first.`); }
  }
  // Older read-only servers still synthesize this one demo asset if it is absent.
  if (data.timeline.cues.some((cue) => cue.src === "audio/demo-score.wav")) {
    try { await fs.access(path.join(root, "audio/demo-score.wav")); }
    catch { throw new Error("Missing audio/demo-score.wav. Contact-sheet review is read-only and never creates demo audio; use the project's normal setup first."); }
  }
  let chromium, createProjectServer;
  try { ({ chromium } = createRequire(path.join(root, "package.json"))("playwright")); }
  catch { throw new Error("Project Playwright dependency is missing. Run npm install in the project, then npx playwright install chromium."); }
  try { ({ createProjectServer } = await import(pathToFileURL(path.join(root, "src/server.mjs")).href)); }
  catch (error) { throw new Error(`Cannot load project server: ${error.message}. Run npm install in the project and verify src/server.mjs.`); }
  if (typeof createProjectServer !== "function") throw new Error("Project server must export createProjectServer(root, port, readOnly).");
  const tile = { width: 320, height: 180, label: 44, gap: 8, pad: 12 };
  const rows = Math.ceil(samples.length / columns);
  const sheetWidth = tile.pad * 2 + columns * tile.width + (columns - 1) * tile.gap;
  const sheetHeight = tile.pad * 2 + rows * (tile.height + tile.label) + (rows - 1) * tile.gap;
  if (sheetWidth > 32767 || sheetHeight > 32767 || sheetWidth * sheetHeight > 32e6) {
    throw new Error("Contact sheet is too large. Use fewer samples or a shorter review range.");
  }
  let browser, server, wrotePng = false, wroteManifest = false;
  try {
    const instance = await createProjectServer(root, 0, true);
    server = instance.server;
    try { browser = await chromium.launch({ headless: true, timeout: 30000 }); }
    catch (error) { throw new Error(`Cannot launch Chromium: ${error.message}. Run npx playwright install chromium in the project.`); }
    const page = await browser.newPage({ viewport: { width: data.project.width, height: data.project.height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    await page.goto(`${instance.url}/src/render.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof window.renderFrameAt === "function", undefined, { timeout: 15000 });
    await page.evaluate(async ({ width, height }) => {
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#171b20"; context.fillRect(0, 0, width, height);
      context.font = "13px system-ui, sans-serif"; context.textBaseline = "middle";
      window.__vmMotionSheet = { canvas, context };
    }, { width: sheetWidth, height: sheetHeight });
    for (const [index, sample] of samples.entries()) {
      const frame = await deadline(page.evaluate(async ({ project, timeline, sample, index, columns, tile }) => {
        const png = await window.renderFrameAt(timeline, project, sample.time_sec);
        const image = new Image(); image.src = png; await image.decode();
        const { context: ctx } = window.__vmMotionSheet;
        const x = tile.pad + (index % columns) * (tile.width + tile.gap);
        const y = tile.pad + Math.floor(index / columns) * (tile.height + tile.label + tile.gap);
        ctx.fillStyle = "#222831"; ctx.fillRect(x, y, tile.width, tile.height);
        const scale = Math.min(tile.width / image.width, tile.height / image.height);
        const width = image.width * scale, height = image.height * scale;
        ctx.drawImage(image, x + (tile.width - width) / 2, y + (tile.height - height) / 2, width, height);
        ctx.fillStyle = "#f1f3f5";
        ctx.fillText(`${sample.timecode} | ${sample.scene_ids.join("+") || "no scene"}`, x, y + tile.height + 13, tile.width);
        ctx.fillStyle = "#bbc1c8";
        ctx.fillText(sample.labels.join(" / "), x, y + tile.height + 32, tile.width);
        return png;
      }, { project: data.project, timeline: data.timeline, sample, index, columns, tile }));
      const bytes = pngBytes(frame);
      sample.sha256 = hash(bytes);
      if (framesFolder) {
        const frameFile = path.join(framesFolder, `frame-${String(sample.frame).padStart(7, "0")}.png`);
        await fs.writeFile(frameFile, bytes, { flag: "wx" });
        sample.src = path.relative(root, frameFile).split(path.sep).join("/");
      }
    }
    const first = samples[0];
    let betweenFrame = samples[samples.length - 1].frame;
    if (samples.length === 1) {
      betweenFrame = first.frame === 0 ? Math.ceil(data.timeline.duration_seconds * data.timeline.fps - 1e-6) - 1 : 0;
      await deadline(page.evaluate(({ project, timeline, time }) => window.renderFrameAt(timeline, project, time),
        { project: data.project, timeline: data.timeline, time: betweenFrame / data.timeline.fps }));
    }
    const revisit = await deadline(page.evaluate(({ project, timeline, time }) => window.renderFrameAt(timeline, project, time),
      { project: data.project, timeline: data.timeline, time: first.time_sec }));
    const revisitHash = hash(pngBytes(revisit));
    if (revisitHash !== first.sha256) throw new Error(`Renderer is seek/order dependent: frame ${first.frame} changed after visiting frame ${betweenFrame}.`);
    if (errors.length) throw new Error(`Renderer browser errors: ${errors.join("; ")}`);
    const png = pngBytes(await page.evaluate(() => window.__vmMotionSheet.canvas.toDataURL("image/png")));
    const manifest = {
      schema: "video-master.contact-sheet.v1", status: "created", created_at: new Date().toISOString(),
      project: root, output, manifest: manifestPath, dimensions: [sheetWidth, sheetHeight],
      fps: data.timeline.fps, range: { start_sec: options.start ?? 0, end_sec: options.end ?? data.timeline.duration_seconds },
      sample_count: samples.length, max_samples: options.maxSamples ?? DEFAULT_MAX_SAMPLES,
      samples, sha256: hash(png), project_sha256: hash(Buffer.from(JSON.stringify(data.project))),
      timeline_sha256: hash(Buffer.from(JSON.stringify(data.timeline))),
      seek_independence: { verified: true, frame: first.frame, visited_between_frame: betweenFrame,
        first_sha256: first.sha256, repeated_sha256: revisitHash },
      review: auditMotion(data.project, data.timeline, data.storyboard),
      limitation: "Sampled stills and a seek-independence check do not establish animation quality, complete coverage or human approval. Play short clips around important actions and cuts.",
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, png, { flag: "wx" }); wrotePng = true;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" }); wroteManifest = true;
    return manifest;
  } catch (error) {
    if (wrotePng && !wroteManifest) await fs.rm(output, { force: true });
    throw error;
  } finally {
    try { await browser?.close(); }
    finally {
      if (server) {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      }
    }
  }
}

async function main() {
  const args = parseReviewArgs(process.argv.slice(2), true);
  if (args.help) {
    console.log(`Usage: node contact-sheet.mjs --project DIR [--storyboard FILE] [--output PNG] [--columns 1..8]
  [--start SECONDS] [--end SECONDS] [--max-samples 1..128] [--save-frames] [--json]
Creates a versioned PNG and paired JSON manifest with scene timecodes, frame hashes
and a timestamp revisit check. --save-frames also writes each sampled full-size PNG.
Read-only; never overwrites output or creates audio.
Default sample cap: ${DEFAULT_MAX_SAMPLES}. Use shorter ranges for larger projects.`);
    return;
  }
  const options = { storyboard: args.storyboard, output: args.output, saveFrames: args.saveFrames };
  for (const [key, name] of [["columns", "columns"], ["start", "start"], ["end", "end"], ["max-samples", "maxSamples"]]) {
    if (args[key] != null) options[name] = Number(args[key]);
  }
  const manifest = await createContactSheet(args.project || process.cwd(), options);
  if (args.json) console.log(JSON.stringify(manifest, null, 2));
  else console.log(`Created ${manifest.sample_count} samples: ${manifest.output}\nManifest: ${manifest.manifest}\nSeek independence: verified. Visual quality remains an advisory human/agent review.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Contact sheet: ${error.message}`); process.exitCode = 1; });
}
