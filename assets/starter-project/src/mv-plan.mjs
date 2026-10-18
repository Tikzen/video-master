import { clone, validate } from "./model.js";
import { validateSoundEvents } from "./motion-sfx.mjs";

const DEFAULT_TRACKS = [
  { id: "scenes", kind: "video", name: "Directed Scenes", visible: true, muted: false, exclusive: true },
  { id: "media", kind: "video", name: "Media", visible: true, muted: false },
  { id: "titles", kind: "graphics", name: "Typography", visible: true, muted: false },
];
const SETTINGS = ["width", "height", "fps", "duration_seconds"];

export function compileMvPlan(input, baseProject, overrides = {}) {
  if (!input || input.schema !== "video-master.mv-plan.v1") throw new Error("Expected schema video-master.mv-plan.v1");
  const plan = clone(input);
  if (!plan.project || typeof plan.project !== "object") throw new Error("Plan needs project settings");
  for (const key of SETTINGS) {
    if (!Number.isFinite(plan.project[key])) throw new Error(`Plan project needs ${key}`);
    if (overrides[key] != null && Math.abs(overrides[key] - plan.project[key]) > 1e-6) {
      throw new Error(`--${key === "duration_seconds" ? "duration" : key} conflicts with plan; revise the plan explicitly`);
    }
  }
  if (!Array.isArray(plan.cues) || !plan.cues.length) throw new Error("Plan needs executable cues, not only storyboard notes");
  if (plan.design?.palette != null && (!Array.isArray(plan.design.palette) || plan.design.palette.length < 4 ||
    plan.design.palette.some((color) => typeof color !== "string" || !color.trim()))) {
    throw new Error("Plan design palette needs at least four color strings");
  }
  if (!plan.cues.some((cue) => cue.kind === "scene")) throw new Error("Plan needs at least one scene cue");
  if (plan.cues.some((cue) => ["vm-music-bed", "vm-motion-sfx"].includes(cue.id) ||
      ["vm-music", "vm-motion-sfx"].includes(cue.track_id))) {
    throw new Error("Managed music and motion-SFX track/cue IDs are reserved");
  }
  if (plan.tracks?.some((track) => ["vm-music", "vm-motion-sfx"].includes(track.id))) throw new Error("Managed music and motion-SFX tracks are reserved");
  const project = { ...baseProject, ...Object.fromEntries(SETTINGS.map((key) => [key, plan.project[key]])),
    name: plan.project.name ?? "directed-mv", mode: "mv", creation_mode: "agent-plan" };
  const timeline = {
    schema: "video-master.timeline.v1", fps: project.fps, duration_seconds: project.duration_seconds,
    design: { title: project.name, palette: ["#f4f4f2", "#111416", "#f1455c", "#73bdf2"], ...plan.design },
    creation: { kind: "agent-plan", status: "directed_draft" },
    tracks: plan.tracks ?? clone(DEFAULT_TRACKS), cues: plan.cues,
  };
  if (timeline.cues.some((cue) => cue.kind === "music" &&
      timeline.tracks.some((track) => track.id === cue.track_id && !track.muted) && (cue.volume ?? 1) > 0)) {
    throw new Error("Plan contains an active music bed; select it through --audio/music-tool instead of stacking a second soundtrack");
  }
  const errors = validate(project, timeline);
  errors.push(...validateSoundEvents(plan.sound_events ?? [], project.duration_seconds, project.fps));
  if (errors.length) throw new Error(`Invalid executable plan: ${errors.join("; ")}`);
  const scenes = timeline.cues.filter((cue) => cue.kind === "scene").sort((a, b) => a.start_sec - b.start_sec);
  if (scenes[0].start_sec !== 0 || Math.abs(scenes.at(-1).end_sec - project.duration_seconds) > 1e-6 ||
      scenes.some((cue, index) => index > 0 && Math.abs(cue.start_sec - scenes[index - 1].end_sec) > 1e-6)) {
    throw new Error("Directed plan scene roster must cover the complete duration without gaps or overlapping shots");
  }
  const notes = plan.storyboard ?? [];
  if (!Array.isArray(notes)) throw new Error("Plan storyboard must be an array");
  if (notes.some((note) => !scenes.some((cue) => cue.id === note.id))) throw new Error("Storyboard refers to an unknown scene");
  return { project, timeline, soundEvents: plan.sound_events ?? [], storyboard: scenes.map((cue) => ({
    ...notes.find((note) => note.id === cue.id), ...cue,
  })) };
}
