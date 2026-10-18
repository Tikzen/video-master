import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, isAudio } from "./model.js";
import { inside } from "./media.mjs";
import { ensureDemoAudio } from "./synthesize.mjs";
import { collectCompositionVisuals } from "./composition.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(await fs.readFile(path.join(root, "video.json"), "utf8"));
const timeline = JSON.parse(await fs.readFile(path.join(root, "timeline.json"), "utf8"));
if (timeline.cues.some((c) => c.src === "audio/demo-score.wav")) await ensureDemoAudio(root, timeline.duration_seconds);
const errors = validate(project, timeline);
for (const c of [...timeline.cues, ...collectCompositionVisuals(timeline)]) {
  for (const file of [...(c.asset_refs || []), ...(c.src ? [c.src] : [])]) {
    try { await fs.access(inside(root, file)); } catch { errors.push(`${c.id}: missing asset ${file}`); }
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`Passed: ${timeline.cues.length} cues · ${timeline.duration_seconds}s · ${project.fps}fps`);
