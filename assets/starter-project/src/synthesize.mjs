import fs from "node:fs/promises";
import path from "node:path";
export async function ensureDemoAudio(root, duration = 8) {
  const output = path.join(root, "audio/demo-score.wav");
  try { await fs.access(output); return output; } catch {}
  const rate = 24000, samples = Math.ceil(rate * duration);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  const notes = [110, 130.8128, 164.8138, 146.8324, 110, 196, 164.8138, 130.8128];
  for (let i = 0; i < samples; i++) {
    const t = i / rate, beat = t % 0.5, sub = t % 0.25;
    const frequency = notes[Math.floor(t / 0.5) % notes.length];
    const bass = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-beat * 7) * 0.23;
    const kick = Math.sin(2 * Math.PI * (48 * beat + 1.6 * (1 - Math.exp(-beat * 25)))) * Math.exp(-beat * 24) * 0.3;
    const chime = Math.sin(2 * Math.PI * frequency * 4 * t) * Math.exp(-sub * 35) * 0.07;
    const envelope = Math.min(1, t * 20, Math.max(0, (duration - t) * 4));
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bass + kick + chime)) * envelope * 32760), 44 + i * 2);
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, wav);
  return output;
}
