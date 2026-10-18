import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { atomicJson, probe, run, ffmpegPath } from "./media.mjs";

export const voiceDefaults = {
  provider: "local", region: "cn", model: "speech-2.8-turbo",
  speed: 1, pitch: 0, language_boost: "auto",
  voices: { "host-a": "", "host-b": "", narrator: "" },
  local_voices: { "host-a": "", "host-b": "", narrator: "" },
};
const endpoints = { cn: "https://api.minimax.cn/v1/t2a_v2", global: "https://api.minimax.io/v1/t2a_v2" };
const inFlight = new Map();

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
function checked(choice) {
  const config = { ...voiceDefaults, ...choice, voices: { ...voiceDefaults.voices, ...choice?.voices } };
  if (!["local", "minimax", "provided"].includes(config.provider)) throw new Error("Unknown voice provider");
  if (!endpoints[config.region]) throw new Error("Choose cn or global region");
  if (!/^speech-[a-z0-9.-]+$/.test(config.model)) throw new Error("Invalid speech model");
  if (!Number.isFinite(config.speed) || config.speed < .5 || config.speed > 2) throw new Error("Speech speed must be 0.5 to 2");
  if (!Number.isInteger(config.pitch) || Math.abs(config.pitch) > 12) throw new Error("Pitch must be an integer from -12 to 12");
  if (typeof config.language_boost !== "string" || config.language_boost.length > 40) throw new Error("Invalid speech language");
  config.local_voices={...voiceDefaults.local_voices,...choice?.local_voices};
  for (const value of [...Object.values(config.voices),...Object.values(config.local_voices)]) {
    if (typeof value !== "string" || value.length > 256 || /[\r\n]/.test(value)) throw new Error("Invalid voice ID");
  }
  // Persist only known, non-secret options, never the caller's extra fields.
  return Object.fromEntries(Object.keys(voiceDefaults).map((key) => [key, config[key]]));
}
async function environment(root) {
  let local = {};
  try { local = parseEnv(await fs.readFile(path.join(root, ".env"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return { ...local, ...process.env };
}
export async function voiceConfig(root, override = {}) {
  return checked({ ...await readJson(path.join(root, "voice_tools.json"), voiceDefaults), ...override });
}
export async function configureVoice(root, choice) {
  const config = checked(choice);
  if (config.provider === "minimax") {
    const fields = { MINIMAX_API_KEY: "", MINIMAX_TTS_BASE_URL: "", MINIMAX_TTS_MODEL: "" };
    const heading = "\n# Video Master TTS. Fill locally; setup makes no paid request.\n# Blank URL/model use the region/model in voice_tools.json.\n";
    for (const filename of [".env", ".env.example"]) {
      const file = path.join(root, filename);
      let old = "";
      try { old = await fs.readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      const existing = parseEnv(old);
      const missing = Object.keys(fields).filter((key) => !Object.hasOwn(existing, key));
      if (missing.length) await fs.appendFile(file, `${heading}${missing.map((key) => `${key}=\n`).join("")}`, { mode: 0o600 });
    }
    let ignore = "";
    try { ignore = await fs.readFile(path.join(root, ".gitignore"), "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!ignore.split(/\r?\n/).includes(".env")) await fs.appendFile(path.join(root, ".gitignore"), "\n.env\n.env.*\n!.env.example\n");
  }
  await atomicJson(path.join(root, "voice_tools.json"), config);
  return { selected: config, env_file: config.provider === "minimax" ? ".env" : null };
}
export async function voiceStatus(root) {
  const env = await environment(root);
  return { selected: await voiceConfig(root), key_configured: Boolean(env.MINIMAX_API_KEY), defaults: voiceDefaults };
}
export async function minimaxConnection(root, config) {
  config = checked(config);
  const env = await environment(root);
  let url;
  try {
    url = new URL(env.MINIMAX_TTS_BASE_URL?.trim() || endpoints[config.region]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new Error("MINIMAX_TTS_BASE_URL must be an HTTPS API URL without credentials or query"); }
  if (!url.pathname.endsWith("/t2a_v2")) url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/v1$/, "")}/v1/t2a_v2`;
  if (!env.MINIMAX_API_KEY?.trim()) throw new Error("Fill MINIMAX_API_KEY in the project's local .env");
  return { url: url.href, key: env.MINIMAX_API_KEY.trim(), model: env.MINIMAX_TTS_MODEL?.trim() || config.model };
}
export async function speechRequest(root, config, line) {
  config = checked(config);
  const connection = await minimaxConnection(root, config);
  const voiceId = line.voice_id || config.voices[line.speaker || "host-a"];
  if (typeof voiceId !== "string" || !voiceId.trim() || /[\r\n]/.test(voiceId)) throw new Error(`Choose a MiniMax voice ID for ${line.speaker || "host-a"}`);
  if (typeof line.text !== "string" || !line.text.trim() || [...line.text].length >= 10000) throw new Error("Speech text must contain 1 to 9999 characters; split long paragraphs");
  const emotion = line.emotion;
  const model = connection.model;
  if (emotion && !["happy","sad","angry","fearful","disgusted","surprised","calm","fluent","whisper"].includes(emotion)) throw new Error("Invalid speech emotion");
  if (["fluent","whisper"].includes(emotion) && !["speech-2.6-hd","speech-2.6-turbo"].includes(model)) throw new Error("fluent/whisper requires a speech-2.6 model");
  return {
    url: connection.url, key: connection.key,
    payload: { model, text: line.text, stream: false, output_format: "hex", language_boost: config.language_boost,
      voice_setting: { voice_id: voiceId, speed: config.speed, pitch: config.pitch, vol: 1, ...(emotion ? { emotion } : {}) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 } },
  };
}
export async function synthesizeSpeech(root, config, line, options = {}) {
  if (options.authorized !== true) throw new Error("MiniMax sends text to an external paid service; explicit authorization is required");
  const request = await speechRequest(root, config, line);
  const hash = createHash("sha256").update(JSON.stringify([request.url, request.payload])).digest("hex");
  const key = `${path.resolve(root)}:${hash}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = (async () => {
    const folder = path.join(root, "audio/minimax"), src = `audio/minimax/${hash}.wav`;
    await fs.mkdir(folder, { recursive: true });
    const wav = path.join(root, src), mp3 = path.join(folder, `${hash}.mp3`);
    try {
      const info = await probe(wav);
      if (info.streams.some((stream) => stream.codec_type === "audio")) return { src, duration: Number(info.format.duration), cached: true };
    } catch {}
    let cached = true;
    try { await fs.access(mp3); }
    catch {
      cached = false;
      let response;
      try {
        response = await (options.fetchImpl || fetch)(request.url, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(180000),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${request.key}` },
          body: JSON.stringify(request.payload),
        });
      } catch { throw new Error("MiniMax network failure or timeout; no automatic retry was made"); }
      if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}; check credentials, region and quota`);
      let data;
      try { data = await response.json(); } catch { throw new Error("MiniMax returned invalid JSON"); }
      if (Number(data.base_resp?.status_code) !== 0) {
        const code = Number(data.base_resp?.status_code);
        throw new Error(`MiniMax rejected speech request (code ${Number.isFinite(code) ? code : "unknown"})`);
      }
      const hex = data.data?.audio;
      if (typeof hex !== "string" || !hex.length || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) throw new Error("MiniMax returned no valid hex audio");
      // Keep the paid response before normalization, so a local decode failure doesn't rebill.
      await fs.writeFile(mp3, Buffer.from(hex, "hex"), { flag: "wx" });
    }
    const tmp = path.join(folder, `${hash}.tmp.wav`);
    await run(ffmpegPath, ["-v","error","-y","-i",mp3,"-vn","-ac","1","-ar","48000",tmp]);
    const info = await probe(tmp);
    if (!(Number(info.format.duration) > 0)) throw new Error("Generated speech has no measurable duration");
    await fs.rename(tmp, wav);
    await atomicJson(path.join(folder, `${hash}.json`), {
      provider: "minimax", model: request.payload.model, voice_id: request.payload.voice_setting.voice_id,
      request_hash: hash, duration: Number(info.format.duration),
    });
    return { src, duration: Number(info.format.duration), cached };
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { inFlight.delete(key); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const [provider = "local", region = "cn"] = process.argv.slice(2);
  console.log(JSON.stringify(await configureVoice(root, { ...await voiceConfig(root), provider, region }), null, 2));
}
