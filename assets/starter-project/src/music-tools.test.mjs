import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { composeMusic } from "./music.mjs";
import { configureMusic,generateMusic,musicActions } from "./music-tools.mjs";
import { duckGain,duckExpression,voiceIntervals } from "./audio-mix.js";
import { applyActions } from "./control.mjs";
import { probe,run,ffmpegPath } from "./media.mjs";

function samples(wav){
  for(let pos=12;pos+8<wav.length;){
    const length=wav.readUInt32LE(pos+4);
    if(wav.toString("ascii",pos,pos+4)==="data")return wav.subarray(pos+8,pos+8+length);
    pos+=8+length+(length%2);
  }throw new Error("WAV has no data");
}
function rms(wav,start,end,rate=32000){
  const data=samples(wav);let energy=0,n=0;
  for(let i=Math.floor(start*rate)*4;i<Math.min(data.length,Math.floor(end*rate)*4);i+=2){const value=data.readInt16LE(i)/32768;energy+=value*value;n++;}
  return Math.sqrt(energy/n);
}
test("procedural music: three distinct PCM styles, deterministic cache, safe bounds and ducked mix",{timeout:30000},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-music-test-"));
  try{
    const electronic=await generateMusic(root,{duration:3,style:"electronic",seed:19,bpm:120});
    const original=await fs.readFile(path.join(root,electronic.src));
    assert.equal(original.toString("ascii",0,4),"RIFF");
    assert.ok(Math.abs(Number((await probe(path.join(root,electronic.src))).format.duration)-3)<.001);
    assert.ok(rms(original,.5,1)>.01);
    const repeated=await generateMusic(root,{duration:3,style:"electronic",seed:19,bpm:120});
    assert.equal(repeated.cached,true);assert.equal(repeated.src,electronic.src);
    const second=await composeMusic(root,{duration:3,bpm:120,seed:19,output:"audio/music/repeated.wav"});
    assert.deepEqual(await fs.readFile(path.join(root,second.src)),original);
    for(const style of ["soft","pulse"]){
      const other=await generateMusic(root,{duration:3,style,seed:19,bpm:120});
      assert.notDeepEqual(await fs.readFile(path.join(root,other.src)),original);
    }
    await assert.rejects(()=>composeMusic(root,{duration:Infinity}),/duration/);
    await assert.rejects(()=>composeMusic(root,{duration:3,bpm:0}),/BPM/);
    await assert.rejects(()=>composeMusic(root,{duration:3,output:"../outside.wav"}),/output/);
    await assert.rejects(()=>composeMusic(root,{duration:3,bpm:120,seed:19,output:"audio/music/repeated.wav"}),/EEXIST/);
    const timeline={fps:30,duration_seconds:3,tracks:[{id:"voice",kind:"voice",muted:false}],cues:[
      {id:"v",track_id:"voice",kind:"voice",start_sec:.5,end_sec:2,src:electronic.src,volume:1}]};
    const project={width:1280,height:720,fps:30,duration_seconds:3};
    const selected=(await configureMusic(root,{mode:"procedural",style:"soft",volume:.2})).selected;
    const {actions}=await musicActions(root,{project,timeline},selected);
    const withMusic=applyActions({project,timeline},actions).timeline;
    const cue=withMusic.cues.find((item)=>item.id==="vm-music-bed"),intervals=voiceIntervals(withMusic);
    assert.equal(cue.end_sec,3);assert.equal(cue.volume,.2);assert.equal(cue.duck_gain,.28);
    assert.equal(duckGain(cue,intervals,.3),1);
    assert.ok(Math.abs(duckGain(cue,intervals,1)-.28)<1e-6);
    assert.equal(duckGain(cue,intervals,2.5),1);
    const muted={...withMusic,tracks:withMusic.tracks.map((track)=>({...track,muted:track.id==="voice"}))};
    assert.deepEqual(voiceIntervals(muted),[]);
    const source=await fs.readFile(path.join(root,cue.src)),output=path.join(root,"ducked.wav");
    await run(ffmpegPath,["-v","error","-i",path.join(root,cue.src),"-af",`volume='${duckExpression({...cue,volume:1},intervals)}':eval=frame`,"-c:a","pcm_s16le",output]);
    const mixed=await fs.readFile(output);
    const ratio=rms(mixed,.9,1.4)/rms(source,.9,1.4);
    assert.ok(Math.abs(ratio-.28)<.02,`Real FFmpeg duck gain: ${ratio}`);
    const fresh=await musicActions(root,{project,timeline:withMusic},selected);
    assert.equal(applyActions({project,timeline:withMusic},fresh.actions).timeline.cues.filter((item)=>item.kind==="music").length,1,"Reapply doesn't stack beds");
    await assert.rejects(()=>musicActions(root,{project,timeline:{...timeline,tracks:[...timeline.tracks,{id:"existing",muted:false}],cues:[...timeline.cues,{...cue,id:"existing",track_id:"existing"}]}},selected),/Existing music/);
    const none=await musicActions(root,{project,timeline:withMusic},{mode:"none"});
    assert.equal(applyActions({project,timeline:withMusic},none.actions).timeline.cues.some((item)=>item.kind==="music"),false);
    const untouched=await musicActions(root,{project,timeline:{...withMusic,cues:[...withMusic.cues,{...cue,id:"user-music"}]}},{mode:"none"});
    assert.deepEqual(untouched.actions,[{type:"cue.delete",id:"vm-music-bed"}],"No-music preserves all non-managed audio");
    await assert.rejects(()=>configureMusic(root,{mode:"custom"}),/Describe/);
    const provided=await musicActions(root,{project,timeline},{mode:"provided",src:electronic.src});
    assert.equal(provided.result.src,electronic.src);
    const short=await generateMusic(root,{duration:.5,style:"pulse"});
    await assert.rejects(()=>musicActions(root,{project,timeline},{mode:"provided",src:short.src}),/shorter/);
    await assert.rejects(()=>musicActions(root,{project,timeline},{mode:"custom",custom:"Jazz piano"}),/Agent adaptation/);
  }finally{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    await fs.rm(root,{recursive:true,force:true});
  }
});
