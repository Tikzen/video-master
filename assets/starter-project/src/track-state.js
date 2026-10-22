// Shared by the editor, legacy renderer and optional rendering backends.
export const isAudio = cue => ["music", "voice", "sfx"].includes(cue.kind);
export const trackEnabled = (timeline, cue) => {
  const track = timeline.tracks.find(row => row.id === cue.track_id);
  return !!track && (isAudio(cue) ? !track.muted : track.visible);
};
