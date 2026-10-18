import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { composeMusic, musicStyles } from "./music.mjs";
import { atomicJson, inside, probe } from "./media.mjs";

export function musicConfig(input={}){
  const selected={mode:input.mode??"none",style:input.style??"electronic",bpm:input.bpm??musicStyles[input.style??"electronic"]?.bpm??120,
    seed:input.seed??19,volume:input.volume??.18,src:input.src??"",custom:input.custom??""};
  if(!["none","procedural","provided","custom"].includes(selected.mode))throw new Error("Invalid music mode");
  if(!Object.hasOwn(musicStyles,selected.style))throw new Error("Unknown music style");
  if(!Number.isFinite(selected.bpm)||selected.bpm<40||selected.bpm>220)throw new Error("BPM must be 40 to 220");
  if(!Number.isInteger(selected.seed)||selected.seed<0||selected.seed>0xffffffff)throw new Error("Seed must be a uint32");
  if(!Number.isFinite(selected.volume)||selected.volume<0||selected.volume>1)throw new Error("Music volume must be 0 to 1");
  if(typeof selected.src!=="string"||selected.src&&!/^(audio|assets\/imports)\/[a-z0-9/._-]+\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(selected.src))throw new Error("Choose a project-local audio file");
  if(typeof selected.custom!=="string"||selected.custom.length>4000||selected.mode==="custom"&&!selected.custom.trim())throw new Error("Describe the custom music request");
  if(selected.mode==="provided"&&!selected.src)throw new Error("Upload or choose an authorized recording");
  return selected;
}
export async function musicStatus(root){
  let input={};
  try{input=JSON.parse(await fs.readFile(path.join(root,"music_tool.json"),"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  return {selected:musicConfig(input),styles:Object.entries(musicStyles).map(([id,{label,bpm}])=>({id,label,bpm})),local:true};
}
export async function configureMusic(root,input){
  const selected=musicConfig(input);
  if(selected.mode==="provided"){
    const info=await probe(inside(root,selected.src));
    if(!info.streams.some((stream)=>stream.codec_type==="audio"))throw new Error("File has no audio stream");
  }
  await atomicJson(path.join(root,"music_tool.json"),selected);
  return {selected};
}
export async function generateMusic(root,input){
  const config=musicConfig({...input,mode:"procedural"}),duration=input.duration;
  if(!Number.isFinite(duration)||duration<.1||duration>600)throw new Error("Duration must be 0.1 to 600 seconds");
  const spec={version:2,duration,style:config.style,bpm:config.bpm,seed:config.seed};
  const hash=createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0,20);
  const src=`audio/music/score-${hash}.wav`,metadata=`audio/music/score-${hash}.json`;
  try{
    const saved=JSON.parse(await fs.readFile(inside(root,metadata),"utf8"));
    await fs.access(inside(root,src));
    return {...saved,cached:true};
  }catch(error){if(error.code!=="ENOENT")throw error;}
  // An incomplete prior output is never overwritten; the caller can choose a new seed.
  const result=await composeMusic(root,{...spec,output:src});
  await atomicJson(inside(root,metadata),result);
  return {...result,cached:false};
}
export async function musicActions(root,current,selected){
  selected=musicConfig(selected);
  const timeline=current.timeline,id="vm-music-bed",trackId="vm-music";
  const managed=timeline.cues.find((cue)=>cue.id===id);
  if(managed&&(managed.kind!=="music"||managed.track_id!==trackId))throw new Error("Managed music ID is used by another clip");
  const actions=managed?[{type:"cue.delete",id}]:[];
  if(selected.mode==="none")return {actions,result:{mode:"none",removed:!!managed}};
  if(selected.mode==="custom")throw new Error("Custom music needs Agent adaptation before applying");
  const others=timeline.cues.filter((cue)=>cue.kind==="music"&&cue.id!==id&&!timeline.tracks.find((track)=>track.id===cue.track_id)?.muted);
  if(others.length)throw new Error("Existing music is preserved. Ask the Agent to reconcile or explicitly replace it first.");
  let result;
  if(selected.mode==="procedural")result=await generateMusic(root,{...selected,duration:timeline.duration_seconds});
  else{
    const info=await probe(inside(root,selected.src)),duration=Number(info.format.duration);
    if(!info.streams.some((stream)=>stream.codec_type==="audio")||!Number.isFinite(duration)||duration<timeline.duration_seconds)throw new Error("Supplied music is shorter than the timeline; Agent must arrange it explicitly");
    result={src:selected.src,duration,provenance:"User-selected local recording; rights must be verified."};
  }
  const existingTrack=timeline.tracks.find((track)=>track.id===trackId);
  if(existingTrack&&existingTrack.kind!=="music")throw new Error("Managed music track ID is already used");
  actions.push(existingTrack?{type:"track.update",id:trackId,patch:{muted:false}}:{type:"track.add",track:{id:trackId,kind:"music",name:"配乐",muted:false,visible:true}});
  actions.push({type:"cue.add",cue:{id,track_id:trackId,kind:"music",title:selected.mode==="procedural"?musicStyles[selected.style].label:"已有音乐",
    src:result.src,start_sec:0,end_sec:timeline.duration_seconds,source_duration:result.duration,source_offset:0,volume:selected.volume,
    fade_in:Math.min(.5,timeline.duration_seconds/4),fade_out:Math.min(1.3,timeline.duration_seconds/4),duck_gain:.28}});
  return {actions,result};
}
