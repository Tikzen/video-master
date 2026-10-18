import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeStatic from "ffprobe-static";

export const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller.path;
export const ffprobePath = process.env.FFPROBE_PATH || ffprobeStatic.path;
export function inside(root, relative) {
  if (typeof relative !== "string" || relative.includes("\0")) throw new Error("Invalid local path");
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path outside project");
  return target;
}
export async function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { err = (err + data).slice(-16000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(err || `${binary}: exit ${code}`)));
  });
}
export async function probe(file) {
  return JSON.parse(await run(ffprobePath, ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]));
}
export async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await fs.rename(tmp, file);
}
