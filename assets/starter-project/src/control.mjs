import { clone, frame, clamp, moveCue, validate } from "./model.js";

export const defaultView = { time: 0, selected_id: null, playing: false, zoom: 96, snap: true, panel: null };
export function applyActions(current, actions) {
  if (!Array.isArray(actions) || !actions.length || actions.length > 200) throw new Error("Supply 1 to 200 actions");
  const state = clone(current);
  state.view = { ...defaultView, ...state.view };
  for (const action of actions) {
    const { timeline, project } = state;
    const cue = () => {
      const item = timeline.cues.find((value) => value.id === action.id);
      if (!item) throw new Error(`Cue not found: ${action.id}`);
      return item;
    };
    const track = () => {
      const item = timeline.tracks.find((value) => value.id === action.id);
      if (!item) throw new Error(`Track not found: ${action.id}`);
      return item;
    };
    switch (action.type) {
      case "cue.update": {
        const item = cue(), patch = action.patch || {};
        const allowed = ["title","text","speaker","expression","camera","headline","body","src","volume","source_offset","source_duration","fade_in","fade_out","duck_gain","transform","keyframes","role","fit","page","asset_refs","evidence_refs","layers","canvas","transition"];
        if (Object.keys(patch).some((key) => !allowed.includes(key))) throw new Error("Unknown cue property; use cue.move/trim for timing");
        Object.assign(item, patch, patch.transform ? { transform: { ...item.transform, ...patch.transform } } : {});
        break;
      }
      case "cue.move":
      case "cue.trim":
        cue();
        if (!Number.isFinite(action.time)) throw new Error("Cue time must be finite");
        if (action.type === "cue.trim" && !["left","right"].includes(action.edge)) throw new Error("Trim edge must be left or right");
        moveCue(timeline, action.id, action.time, action.type === "cue.move" ? "move" : action.edge);
        break;
      case "cue.add": timeline.cues.push(clone(action.cue)); break;
      case "cue.delete": cue(); timeline.cues = timeline.cues.filter((item) => item.id !== action.id); break;
      case "track.add": timeline.tracks.push(clone(action.track)); break;
      case "track.update": {
        const patch = action.patch || {};
        if (Object.keys(patch).some((key) => !["name","visible","muted","exclusive"].includes(key))) throw new Error("Unknown track property");
        if (["visible","muted","exclusive"].some((key) => key in patch && typeof patch[key] !== "boolean")) throw new Error("Track toggles must be boolean");
        Object.assign(track(), patch); break;
      }
      case "track.delete":
        track(); timeline.tracks = timeline.tracks.filter((item) => item.id !== action.id);
        timeline.cues = timeline.cues.filter((item) => item.track_id !== action.id); break;
      case "timeline.replace": state.timeline = clone(action.timeline); break;
      case "project.update": {
        const patch = action.patch || {};
        const allowed = ["name","width","height","fps","duration_seconds","mode","container","video_codec","audio_codec","color_space"];
        if (Object.keys(patch).some((key) => !allowed.includes(key))) throw new Error("Unknown project property");
        Object.assign(project, patch);
        timeline.fps = project.fps; timeline.duration_seconds = project.duration_seconds; break;
      }
      case "view.set": {
        const patch = action.patch || {};
        if (Object.keys(patch).some((key) => !Object.hasOwn(defaultView, key))) throw new Error("Unknown view property");
        if (patch.time != null && !Number.isFinite(patch.time)) throw new Error("Invalid playhead time");
        if (patch.zoom != null && (!Number.isFinite(patch.zoom) || patch.zoom < 48 || patch.zoom > 160)) throw new Error("Zoom must be 48 to 160");
        if (["playing","snap"].some((key) => key in patch && typeof patch[key] !== "boolean")) throw new Error("View toggles must be boolean");
        if ("panel" in patch && ![null,"plan","image","voice"].includes(patch.panel)) throw new Error("Invalid panel");
        Object.assign(state.view, patch); break;
      }
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }
  const errors = validate(state.project, state.timeline);
  if (errors.length) throw new Error(errors.join("; "));
  state.view.time = frame(clamp(state.view.time, 0, state.timeline.duration_seconds - 1 / state.timeline.fps), state.timeline.fps);
  if (!state.timeline.cues.some((item) => item.id === state.view.selected_id)) state.view.selected_id = null;
  return state;
}
