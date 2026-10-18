import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inside, atomicJson, run, probe, ffmpegPath } from "./media.mjs";

export async function transcribeRecording(root, src, options = {}) {
  if (!/^assets\/imports\/[a-z0-9-]+\.wav$/i.test(src)) throw new Error("Transcription requires an imported local WAV");
  const input = inside(root, src), info = await probe(input);
  if (Number(info.format.duration) > 1800) throw new Error("Split narration longer than 30 minutes");
  const output = `audio/transcripts/${path.basename(src, ".wav")}.json`;
  let transcript,cached=true;
  try { transcript=JSON.parse(await fs.readFile(inside(root, output), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if(!transcript){
    cached=false;
    await run(options.python || process.env.VIDEO_MASTER_PYTHON || "python", [
    inside(root, "src/transcribe_audio.py"), "--input", input, "--output", inside(root, output),
    "--ffmpeg",ffmpegPath,
    ...(options.model ? ["--model", options.model] : []),
    "--language", options.language || "auto",
    ]);
    transcript=JSON.parse(await fs.readFile(inside(root, output), "utf8"));
  }
  if (!transcript.segments?.length) throw new Error("No speech recognized");
  const record = { id: randomUUID(), src, transcript_path: output, duration: Number(info.format.duration),
    created_at: new Date().toISOString(), role: "narration", speaker:options.speaker||"narrator", speaker_diarization: false };
  let assets = [];
  try { assets = JSON.parse(await fs.readFile(path.join(root, "narration_assets.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const existing=assets.find((item)=>item.src===src);
  if(existing)return {...existing,transcript,cached};
  assets.push(record);
  await atomicJson(path.join(root, "narration_assets.json"), assets);
  return { ...record, transcript, cached };
}
