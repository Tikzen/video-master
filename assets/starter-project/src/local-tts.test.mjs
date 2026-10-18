import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { localVoices,localSpeech } from "./local-tts.mjs";
import { probe } from "./media.mjs";
test("local narration: installed voice, real PCM WAV, measured duration and cache",async(t)=>{
  const voices=await localVoices();
  if(!voices.available||!voices.voices.length){t.skip("OS speech engine/voices not installed");return;}
  const voice=voices.voices.find((item)=>item.language.startsWith("zh"))||voices.voices[0];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-local-test-"));
  try{
    const line={speaker:"narrator",voice:voice.id,text:voice.language.startsWith("zh")?"今天我们用代码制作视频。":"Today we create a video using code."};
    const first=await localSpeech(root,{speed:1},line),second=await localSpeech(root,{speed:1},line);
    assert.ok(first.duration>0.5);assert.equal(second.cached,true);assert.equal(first.src,second.src);
    const info=await probe(path.join(root,first.src)),audio=info.streams.find((item)=>item.codec_type==="audio");
    assert.equal(audio.codec_name,"pcm_s16le");assert.equal(audio.sample_rate,"48000");assert.equal(audio.channels,1);
    await assert.rejects(()=>localSpeech(root,{}, {...line,voice:"not-installed"}),/unavailable/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
