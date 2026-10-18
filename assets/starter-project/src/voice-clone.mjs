import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { atomicJson, probe } from "./media.mjs";
import { voiceConfig, configureVoice, minimaxConnection } from "./voice-tools.mjs";

const extensions = new Set([".mp3", ".m4a", ".wav"]);
const active = new Set();
const hash = (data) => createHash("sha256").update(data).digest("hex");
async function json(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
export async function sampleFolder(root) {
  const folder = path.join(path.resolve(root), "voice-samples");
  await fs.mkdir(folder, { recursive: true });
  const realRoot = await fs.realpath(root), real = await fs.realpath(folder);
  if (path.relative(realRoot, real) !== "voice-samples") throw new Error("Voice sample folder must not be a symlink outside the project");
  const ignoreFile = path.join(root, ".gitignore");
  let ignore = "";
  try { ignore = await fs.readFile(ignoreFile, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!ignore.split(/\r?\n/).includes("voice-samples/")) await fs.appendFile(ignoreFile, "\nvoice-samples/\n");
  return folder;
}
export async function inspectSample(root, name) {
  if (typeof name !== "string" || path.basename(name) !== name || /[\\/\0]/.test(name) || !extensions.has(path.extname(name).toLowerCase())) throw new Error("Choose an mp3, m4a or wav in voice-samples");
  const folder = await sampleFolder(root), file = path.join(folder, name), real = await fs.realpath(file);
  if (path.dirname(real) !== folder) throw new Error("Sample must be a regular local file, not an external link");
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 20 * 1024 * 1024) throw new Error("Voice sample must be at most 20 MB");
  let info;
  try { info = await probe(real); } catch { throw new Error("Cannot decode voice sample"); }
  const duration = Number(info.format.duration);
  if (!info.streams.some((item) => item.codec_type === "audio") || !Number.isFinite(duration) || duration < 10 || duration > 300) throw new Error("Voice sample must contain 10 to 300 seconds of audio");
  return { name, path: real, bytes: stat.size, duration };
}
export async function importSample(root, name, bytes) {
  const ext = path.extname(path.basename(name)).toLowerCase();
  if (!extensions.has(ext) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Upload mp3, m4a or wav, at most 20 MB");
  const folder = await sampleFolder(root), stored = `sample-${randomUUID()}${ext}`;
  await fs.writeFile(path.join(folder, stored), bytes, { flag: "wx", mode: 0o600 });
  try { return await inspectSample(root, stored); }
  catch (error) { await fs.unlink(path.join(folder, stored)); throw error; }
}
export async function listSamples(root) {
  const folder = await sampleFolder(root), files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
    try { files.push({ ...await inspectSample(root, entry.name), valid: true }); }
    catch (error) { files.push({ name: entry.name, valid: false, error: error.message }); }
  }
  const receipts = await json(path.join(folder, "clones.json"), []);
  return { folder, files, clones: receipts.map(({ voice_id, speaker, status, created_at }) => ({ voice_id, speaker, status, created_at })) };
}
async function remote(fetchImpl, url, init, key) {
  let response;
  try { response = await fetchImpl(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}` }, redirect: "error", signal: AbortSignal.timeout(180000) }); }
  catch { throw new Error("MiniMax network failure; result may be unknown. No automatic retry was made"); }
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}; check account, region and quota`);
  let result;
  try { result = await response.json(); } catch { throw new Error("MiniMax returned invalid JSON; check the account before retrying"); }
  if (Number(result.base_resp?.status_code) !== 0) throw new Error(`MiniMax rejected request (code ${Number(result.base_resp?.status_code) || "unknown"})`);
  return result;
}
export async function cloneVoice(root, input, options = {}) {
  if (input.authorized !== true || input.rights_confirmed !== true) throw new Error("Confirm voice rights and authorize external sample upload and possible charges");
  if (!/^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/.test(input.voice_id || "")) throw new Error("Voice ID: 8-256 characters, starts with a letter, ends with a letter or digit");
  if (!["host-a", "host-b", "narrator"].includes(input.speaker)) throw new Error("Choose a target speaker");
  const config = await voiceConfig(root);
  if (config.provider !== "minimax") throw new Error("Save MiniMax as the selected provider first");
  const connection = await minimaxConnection(root, config);
  // Cloning is available on the verified official services, not arbitrary TTS proxies.
  const origin = new URL(connection.url).origin;
  if (!["https://api.minimax.cn", "https://api.minimax.io"].includes(origin)) throw new Error("Cloning requires an official MiniMax endpoint; remove the custom TTS URL");
  const sample = await inspectSample(root, input.sample), bytes = await fs.readFile(sample.path);
  const folder = await sampleFolder(root), receiptFile = path.join(folder, "clones.json");
  const key = path.resolve(root);
  if (active.has(key)) throw new Error("A voice cloning operation is already running");
  active.add(key);
  try {
    const receipts = await json(receiptFile, []);
    const fingerprint = hash(JSON.stringify([origin, hash(bytes), input.voice_id]));
    let record = receipts.find((item) => item.voice_id === input.voice_id && item.origin === origin);
    if (record && record.fingerprint !== fingerprint) throw new Error("Voice ID already has a different local sample; choose another ID");
    if (record?.status === "uncertain") throw new Error("Previous clone result is uncertain; inspect MiniMax account before another request");
    if (record?.status === "cloned") {
      if(Date.now()-Date.parse(record.created_at)>7*24*3600*1000)throw new Error("Clone receipt is older than 7 days; verify formal use in MiniMax or clone with a new authorized ID");
      await configureVoice(root, { ...config, voices: { ...config.voices, [input.speaker]: input.voice_id } });
      return { voice_id: input.voice_id, speaker: input.speaker, cached: true };
    }
    const fetchImpl = options.fetchImpl || fetch;
    if (!record) {
      const form = new FormData();
      form.set("purpose", "voice_clone");
      form.set("file", new Blob([bytes]), sample.name);
      const result = await remote(fetchImpl, `${origin}/v1/files/upload`, { method: "POST", body: form }, connection.key);
      if (!Number.isSafeInteger(result.file?.file_id) || result.file.file_id <= 0) throw new Error("MiniMax returned an invalid file ID");
      record = { fingerprint, sample: sample.name, origin, file_id: result.file.file_id, voice_id: input.voice_id,
        speaker: input.speaker, status: "uploaded", created_at: new Date().toISOString(),
        consent: { rights_confirmed: true, authorized: true, at: new Date().toISOString(), purpose: "voice-clone" } };
      receipts.push(record);
      await atomicJson(receiptFile, receipts);
    }
    // Persist uncertainty before calling: crashes/timeouts must never silently resubmit.
    record.status = "uncertain";
    await atomicJson(receiptFile, receipts);
    try {
      await remote(fetchImpl, `${origin}/v1/voice_clone`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: record.file_id, voice_id: input.voice_id,
          need_noise_reduction: input.noise_reduction === true, need_volume_normalization: input.normalize === true }) }, connection.key);
    } catch (error) {
      // Only an explicit provider rejection proves the operation failed.
      if (/rejected request/.test(error.message)) { record.status = "rejected"; await atomicJson(receiptFile, receipts); }
      throw error;
    }
    record.status = "cloned";
    record.speaker = input.speaker;
    await atomicJson(receiptFile, receipts);
    const latest = await voiceConfig(root);
    await configureVoice(root, { ...latest, voices: { ...latest.voices, [input.speaker]: input.voice_id } });
    return { voice_id: input.voice_id, speaker: input.speaker, cached: false, reminder: "Use in formal TTS within 7 days; a separate authorized TTS request is required" };
  } finally { active.delete(key); }
}
