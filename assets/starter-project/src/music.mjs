import fs from "node:fs/promises";
import path from "node:path";

export const musicStyles={
  electronic:{label:"电子节拍",bpm:120,drums:1,bass:1,arp:1,pad:1},
  soft:{label:"轻柔铺底",bpm:80,drums:.08,bass:.45,arp:.25,pad:2.8},
  pulse:{label:"轻快脉冲",bpm:108,drums:.5,bass:.7,arp:1.35,pad:1.2},
  ambient:{label:"氛围冥想",bpm:60,drums:.02,bass:.15,arp:.1,pad:3.5},
};
export async function composeMusic(root, { duration, bpm = 120, seed = 19, style="electronic", output:outputPath="audio/music/original-score.wav", overwrite=false }) {
  if(!Number.isFinite(duration)||duration<.1||duration>600)throw new Error("Music duration must be 0.1 to 600 seconds");
  if(!Number.isFinite(bpm)||bpm<40||bpm>220)throw new Error("Music BPM must be 40 to 220");
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error("Music seed must be a uint32");
  if(!Object.hasOwn(musicStyles,style))throw new Error("Unknown procedural music style");
  if(typeof outputPath!=="string"||!/^audio\/music\/[a-z0-9][a-z0-9._-]*\.wav$/i.test(outputPath))throw new Error("Music output must be audio/music/<name>.wav");
  const mix=musicStyles[style];
  const sampleRate = 32000, length = Math.ceil(duration * sampleRate), beat = 60 / bpm;
  const output = Buffer.alloc(44 + length * 4);
  output.write("RIFF"); output.writeUInt32LE(output.length - 8, 4);
  output.write("WAVEfmt ", 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22); output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 4, 28);
  output.writeUInt16LE(4, 32); output.writeUInt16LE(16, 34); output.write("data", 36);
  output.writeUInt32LE(length * 4, 40);
  const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]];
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  let noise = seed >>> 0, peak = 0, rms = 0;
  const features = [], window = Math.round(sampleRate / 30);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate, b = t / beat, bar = Math.floor(b / 4);
    const chord = chords[Math.floor(bar / 2) % chords.length];
    const phase = t % beat, half = t % (beat / 2), quarter = t % (beat / 4);
    const section = t / duration;
    const intensity = section < 0.16 ? 0.45 : section < 0.35 ? 0.7 : section < 0.8 ? 1 : 0.6;
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const n = noise / 2147483648 - 1;
    const kick = Math.sin(2 * Math.PI * (46 * phase + 2.1 * (1 - Math.exp(-phase * 30)))) * Math.exp(-phase * 22) * 0.48;
    const snarePhase = t % (beat * 2) - beat;
    const snare = snarePhase >= 0 ? (n * 0.7 + Math.sin(2 * Math.PI * 180 * snarePhase) * 0.3) * Math.exp(-snarePhase * 23) * 0.23 : 0;
    const hat = n * Math.exp(-half * 120) * 0.065 * intensity;
    const bassHz = hz(chord[0]), bass = (Math.sin(2 * Math.PI * bassHz * t) + Math.sin(4 * Math.PI * bassHz * t) * 0.2) * Math.exp(-phase * 6) * 0.19;
    const arpHz = hz(chord[[0, 2, 1, 3, 2, 1, 3, 2][Math.floor(b * 4) % 8]] + 24);
    const arp = Math.sin(2 * Math.PI * arpHz * quarter) * Math.exp(-quarter * 16) * 0.095 * intensity;
    const pad = chord.reduce((sum, note, j) => sum + Math.sin(2 * Math.PI * hz(note + 12) * t + j * 0.3), 0) * 0.013;
    const pump = style==="soft"?1:0.35 + 0.65 * Math.min(1, phase / 0.14);
    const fade = Math.min(1, t / 0.15, Math.max(0, (duration - t) / 1.3));
    const center = ((kick * intensity + snare * intensity + hat)*mix.drums + (bass*mix.bass + arp*mix.arp + pad*mix.pad) * pump) * fade;
    const side = Math.sin(2 * Math.PI * arpHz * quarter + 0.2) * Math.exp(-quarter * 12) * 0.018 * mix.arp * fade;
    for (let channel = 0; channel < 2; channel++) {
      const value = Math.max(-0.98, Math.min(0.98, center + (channel ? side : -side)));
      output.writeInt16LE(Math.round(value * 32767), 44 + i * 4 + channel * 2);
    }
    peak = Math.max(peak, Math.abs(center)); rms += center * center;
    if ((i + 1) % window === 0 || i === length - 1) {
      features.push({ time: i / sampleRate, rms: Math.sqrt(rms / window), peak }); rms = 0; peak = 0;
    }
  }
  await fs.mkdir(path.join(root, "audio/music"), { recursive: true });
  await fs.writeFile(path.join(root, outputPath), output,{flag:overwrite?"w":"wx"});
  return { src: outputPath, duration, bpm, seed, style, features, provenance: "Original deterministic procedural instrumental; no sampled song or cloned voice." };
}
