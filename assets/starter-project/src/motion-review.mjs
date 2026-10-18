#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackEnabled, validate, timecode } from "./model.js";

export const DEFAULT_MAX_SAMPLES = 96;
export const MAX_SAMPLES = 128;
const EPSILON = 1e-6;
const text = (...values) => values.flat().filter((value) => typeof value === "string" && value.trim())
  .join(" ").toLowerCase().replace(/\s+/g, " ").trim();
const present = (row, keys) => keys.some((key) => {
  const value = row[key];
  return value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
});

export function storyboardScenes(storyboard = []) {
  const rows = Array.isArray(storyboard) ? storyboard : storyboard?.scenes ?? storyboard?.shots ?? [];
  if (!Array.isArray(rows)) throw new Error("Storyboard scenes/shots must be an array.");
  return rows.filter((row) => row && typeof row === "object");
}

export function visibleScenes(timeline, storyboard = []) {
  const byId = new Map(storyboardScenes(storyboard).filter((row) => row.id).map((row) => [row.id, row]));
  return timeline.cues.filter((cue) => cue.kind === "scene" && trackEnabled(timeline, cue))
    .map((cue) => ({ ...byId.get(cue.id), ...cue }))
    .sort((a, b) => a.start_sec - b.start_sec || String(a.id).localeCompare(String(b.id)));
}

export function validateMotionProject(project, timeline) {
  if (!project || typeof project !== "object" || !timeline || typeof timeline !== "object") {
    throw new Error("video.json and timeline.json must contain project/timeline objects.");
  }
  const errors = validate(project, timeline);
  if (errors.length) throw new Error(`Project validation failed: ${errors.join("; ")}`);
}

export function auditMotion(project, timeline, storyboard = []) {
  validateMotionProject(project, timeline);
  const scenes = visibleScenes(timeline, storyboard);
  const findings = [];
  const addGroup = (code, rows, message) => {
    if (rows.length) findings.push({ code, scene_id: null, start_sec: null,
      related_scene_ids: rows.map((row) => row.id), message });
  };
  addGroup("MOTION_INTENT_NOT_IN_DATA", scenes.filter((scene) =>
    !present(scene, ["visual_job", "action", "motion", "animation", "event", "reveal", "keyframes"])),
  "Motion intent is absent from these JSON rows. Animation may live in renderer code; this does not mean the frames are static. Review rendered action peaks and short clips.");
  addGroup("PURPOSE_OR_RESULT_NOT_IN_DATA", scenes.filter((scene) =>
    !present(scene, ["purpose", "action_result", "result", "payoff", "visual_job"])),
  "Purpose or result is not recorded here. Check what information or emotion each scene advances without adding mandatory user form fields.");
  if (!scenes.length) findings.push({ code: "VISIBLE_SCENES_NOT_FOUND", scene_id: null,
    start_sec: null, related_scene_ids: [],
    message: "No enabled scene cues were found. Other visual tracks or custom renderer code may still contain the video; review the actual output." });
  const motif = (scene) => text(scene.motif) || text(scene.scene, scene.page?.type, scene.subject) || text(scene.visual_job);
  const signature = (scene) => text(motif(scene), scene.camera, scene.shot_size, scene.composition,
    scene.layout, scene.word, scene.headline, scene.text, scene.page?.title, scene.visual_job,
    scene.action, scene.state, scene.material, scene.purpose, scene.action_result, scene.result, scene.payoff);
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index], anchor = motif(scene);
    if (anchor) {
      const previous = scenes.slice(0, index).filter((row) => motif(row) === anchor);
      if (previous.length) findings.push({ code: "MOTIF_RETURN_REVIEW", scene_id: scene.id,
        start_sec: scene.start_sec, related_scene_ids: previous.map((row) => row.id),
        message: `Motif "${anchor}" returns. Check intentional variation in role, state, scale, composition, material or result; recurrence itself is not a defect.` });
    }
    const before = scenes[index - 1];
    if (before && signature(scene) && signature(before) === signature(scene)) findings.push({
      code: "ADJACENT_SCENE_REVIEW", scene_id: scene.id, start_sec: scene.start_sec,
      related_scene_ids: [before.id],
      message: "Adjacent visible semantic fields match. Compare rendered frames for progression or intentional continuity; JSON alone cannot prove repetition.",
    });
  }
  return { schema: "video-master.motion-review.v1", status: "advisory", scene_count: scenes.length,
    finding_count: findings.length, findings,
    limitation: "JSON review is not a visual quality score or proof of motion. A contact sheet shows sampled frames, not the flow of the complete video." };
}

export function buildMotionSamples(project, timeline, options = {}) {
  validateMotionProject(project, timeline);
  const { storyboard = [], start = 0, end = timeline.duration_seconds, maxSamples = DEFAULT_MAX_SAMPLES } = options;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > timeline.duration_seconds || end <= start) {
    throw new Error("--start/--end must define a nonempty range inside the project duration.");
  }
  if (!Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > MAX_SAMPLES) {
    throw new Error(`--max-samples must be an integer from 1 to ${MAX_SAMPLES}.`);
  }
  const fps = timeline.fps, lastFrame = Math.ceil(timeline.duration_seconds * fps - EPSILON) - 1;
  const rangeFirst = Math.max(0, Math.ceil(start * fps - EPSILON));
  const rangeLast = Math.min(lastFrame, Math.ceil(end * fps - EPSILON) - 1);
  if (rangeFirst > rangeLast) throw new Error("The selected range contains no complete frame timestamp.");
  const scenes = visibleScenes(timeline, storyboard);
  const samples = new Map();
  const firstFrame = (scene) => Math.round(scene.start_sec * fps);
  const finalFrame = (scene) => Math.round(scene.end_sec * fps) - 1;
  const add = (frame, label) => {
    if (frame < rangeFirst || frame > rangeLast) return;
    const sample = samples.get(frame) || { frame, time_sec: frame / fps,
      timecode: timecode(frame / fps, fps), scene_ids: scenes.filter((scene) =>
        frame >= firstFrame(scene) && frame <= finalFrame(scene)).map((scene) => scene.id), labels: [] };
    if (!sample.labels.includes(label)) sample.labels.push(label);
    samples.set(frame, sample);
  };
  for (const scene of scenes) {
    const first = Math.max(rangeFirst, firstFrame(scene)), final = Math.min(rangeLast, finalFrame(scene));
    if (first <= final) {
      add(first, first === firstFrame(scene) ? "start" : "range start");
      add(Math.round((first + final) / 2), "middle");
      add(final, final === finalFrame(scene) ? "end" : "range end");
    }
    if (scene.review_times != null) {
      if (!Array.isArray(scene.review_times)) throw new Error(`${scene.id}: review_times must be an array of absolute seconds.`);
      for (const seconds of scene.review_times) {
        if (!Number.isFinite(seconds) || seconds < scene.start_sec || seconds >= scene.end_sec) {
          throw new Error(`${scene.id}: review_times must contain finite absolute seconds inside that scene.`);
        }
        if (seconds >= start && seconds < end) add(Math.min(finalFrame(scene),
          Math.max(firstFrame(scene), Math.round(seconds * fps))), "action peak");
      }
    }
  }
  for (const scene of scenes.slice(1)) {
    const cut = firstFrame(scene);
    add(cut - 1, "cut before");
    add(cut, "cut after");
  }
  const ordered = [...samples.values()].sort((a, b) => a.frame - b.frame);
  if (!ordered.length) throw new Error("No visible scene frame timestamps occur in the selected range.");
  if (ordered.length > maxSamples) throw new Error(`${ordered.length} samples exceed --max-samples ${maxSamples}. Shorten --start/--end or raise the cap (maximum ${MAX_SAMPLES}); cut sides are not silently discarded.`);
  return ordered;
}

export async function readMotionProject(root, storyboardFile = "storyboard.json") {
  root = path.resolve(root);
  const read = async (file) => {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { throw new Error(`Cannot read ${file}: ${error.message}`); }
  };
  const [project, timeline] = await Promise.all([read(path.join(root, "video.json")), read(path.join(root, "timeline.json"))]);
  let storyboard = [];
  const storyboardPath = path.resolve(root, storyboardFile);
  try { storyboard = JSON.parse(await fs.readFile(storyboardPath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT" || storyboardFile !== "storyboard.json") throw new Error(`Cannot read storyboard ${storyboardPath}: ${error.message}`);
  }
  storyboardScenes(storyboard);
  return { project, timeline, storyboard };
}

export function parseReviewArgs(args, sheet = false) {
  const allowed = new Set(["--project", "--storyboard", ...(sheet ? ["--output", "--columns", "--start", "--end", "--max-samples", "--save-frames"] : [])]);
  const values = { json: false, help: false, saveFrames: false };
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (["--json", "--help", "-h"].includes(key)) { values[key === "--json" ? "json" : "help"] = true; continue; }
    if (key === "--save-frames") {
      if (!sheet) throw new Error(`Unknown option: ${key}. Use --help.`);
      values.saveFrames = true;
      continue;
    }
    if (!allowed.has(key)) throw new Error(`Unknown option: ${key}. Use --help.`);
    if (args[index + 1] == null || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${key}.`);
    values[key.slice(2)] = args[++index];
  }
  return values;
}

export function printMotionAudit(result) {
  console.log(`Motion review: ${result.scene_count} visible scenes, ${result.finding_count} advisory prompts.`);
  for (const finding of result.findings) {
    const subject = finding.scene_id || finding.related_scene_ids.join(", ") || "project";
    console.log(`- ${finding.code} [${subject}]: ${finding.message}`);
  }
  console.log(`Note: ${result.limitation}`);
}

async function main() {
  const args = parseReviewArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node motion-review.mjs --project DIR [--storyboard FILE] [--json]\nRead-only advisory motion review. Storyboard metadata is optional; creative prompts never fail the command.");
    return;
  }
  const root = path.resolve(args.project || process.cwd()), data = await readMotionProject(root, args.storyboard);
  const result = { project: root, ...auditMotion(data.project, data.timeline, data.storyboard) };
  if (args.json) console.log(JSON.stringify(result, null, 2)); else printMotionAudit(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Motion review: ${error.message}`); process.exitCode = 1; });
}
