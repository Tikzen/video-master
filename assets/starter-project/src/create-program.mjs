#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inside, atomicJson, probe } from "./media.mjs";
import { frame, validate } from "./model.js";
import { audioEnergy } from "./analyze-audio.mjs";
import { voiceConfig, speechRequest, synthesizeSpeech } from "./voice-tools.mjs";
import { localSpeech } from "./local-tts.mjs";
import { musicStatus, musicActions } from "./music-tools.mjs";
import { applyActions } from "./control.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
if(!arg("--input"))throw new Error("--input <project-relative-program.json> is required");
const input=inside(root,arg("--input")),program=JSON.parse(await fs.readFile(input));
if(!["studio","report","product"].includes(program.genre))throw new Error("genre must be studio, report or product");
const original=JSON.parse(await fs.readFile(path.join(root,"video.json")));
if(original.mode && !args.includes("--replace-draft"))throw new Error("Draft exists; use a new workspace or explicit --replace-draft");
if(program.genre!=="studio"){
  if(!program.pages?.length)throw new Error("Presentation needs pages");
  program.lines=program.pages.map((page,i)=>({text:page.narration||page.title,speaker:"narrator",voice:page.voice,voice_id:page.voice_id,emotion:page.emotion,page_index:i,audio:page.audio,audio_start:page.audio_start,audio_end:page.audio_end}));
}
if(!program.lines?.length)throw new Error("Program needs spoken lines");
const tts=await voiceConfig(root,program.tts||{});
if(tts.provider==="provided"&&program.lines.some((line)=>!line.audio))throw new Error("Existing-recording mode requires an authorized audio path for every line/page");
if(tts.provider==="minimax"&&program.lines.some((line)=>!line.audio)){
  if(!args.includes("--authorize-tts"))throw new Error("MiniMax paid TTS requires --authorize-tts after user approval");
  // Validate every missing line before sending the first billable request.
  for(const line of program.lines.filter((item)=>!item.audio))await speechRequest(root,tts,line);
  for(const line of program.lines.filter((item)=>!item.audio)){
    const result=await synthesizeSpeech(root,tts,line,{authorized:true});
    line.audio=result.src;
    console.log(JSON.stringify({tts:"minimax",speaker:line.speaker,cached:result.cached}));
  }
}
if(program.lines.some((line)=>!line.audio)){
  for(const line of program.lines.filter((item)=>!item.audio)){
    const result=await localSpeech(root,tts,line);line.audio=result.src;
    console.log(JSON.stringify({tts:result.backend,voice:result.voice_id,cached:result.cached}));
  }
}
const tracks=[
  {id:"scenes",kind:"video",name:program.genre==="studio"?"演播室镜头":"动态页面",visible:true,muted:false,exclusive:true},
  {id:"media",kind:"video",name:"大屏素材",visible:true,muted:false,exclusive:true},
  {id:"expressions",kind:"graphics",name:"角色表情",visible:true,muted:false},
  {id:"captions",kind:"graphics",name:"字幕",visible:true,muted:false},
];
for(const speaker of new Set(program.lines.map((line)=>line.speaker||"host-a")))tracks.push({id:`voice-${speaker}`,kind:"voice",name:`配音 / ${speaker}`,visible:true,muted:false,exclusive:true});
let timeline={schema:"video-master.timeline.v1",fps:30,duration_seconds:0,tracks,cues:[]};
const transform=()=>({x:0,y:0,scale:1,rotation:0,opacity:1});
function transitionFor(previous,current,index,genre,screenRect){
  if(!previous)return undefined;
  const page=genre==="studio"?undefined:program.pages?.[current.page_index];
  if(genre==="studio"){
    const before=previous.camera||"studio",after=current.camera||"studio";
    if(before===after)return undefined;
    return {type:"iris",duration_sec:.42,origin_x:(screenRect[0]+screenRect[2]/2)/1280,
      origin_y:(screenRect[1]+screenRect[3]/2)/720};
  }
  if(genre==="product"&&page?.type==="media")return {type:"iris",duration_sec:.46,origin_x:.5,origin_y:.52};
  const direction=page?.type==="chart"?"right":page?.type==="metrics"?"up":index%2?"left":"right";
  return {type:"flow",direction,duration_sec:.42};
}
let cursor=0;
for(const [i,line] of program.lines.entries()){
  const src=line.audio||`audio/voice/line-${String(i).padStart(3,"0")}.wav`,info=await probe(inside(root,src));
  const sourceDuration=Number(info.format.duration),offset=line.audio_start??0,sourceEnd=line.audio_end??sourceDuration;
  if(!Number.isFinite(offset)||!Number.isFinite(sourceEnd)||offset<0||sourceEnd>sourceDuration+.05||sourceEnd<=offset)throw new Error(`Invalid recording interval for line ${i}`);
  const duration=sourceEnd-offset,speaker=line.speaker||"host-a",start=frame(cursor,30),end=frame(start+duration,30);
  const sceneEnd=frame(end+(program.gap_seconds??.3),30);
  const page=program.pages?.[line.page_index];
  const screenRect=program.screen_rect||[55,141,870,360];
  const transition=line.transition===false||page?.transition===false
    ?undefined:line.transition||page?.transition||transitionFor(program.lines[i-1],line,i,program.genre,screenRect);
  timeline.cues.push({id:`scene-${i}`,track_id:"scenes",kind:"scene",title:page?.title||line.headline||`镜头 ${i+1}`,
    start_sec:start,end_sec:sceneEnd,camera:line.camera||"studio",headline:line.headline,body:line.body,
    page,page_number:i+1,transform:transform(),...(transition?{transition}:{})});
  const energy=(await audioEnergy(inside(root,src))).filter((feature)=>feature.time>=offset&&feature.time<sourceEnd).map((feature)=>feature.rms);
  timeline.cues.push({id:`voice-${i}`,track_id:`voice-${speaker}`,kind:"voice",title:line.text,speaker,src,start_sec:start,end_sec:end,
    source_offset:offset,source_duration:sourceDuration,volume:1,energy});
  // Three clocks per line: voice = actual speech (start..end); caption/scene = what the
  // viewer should still see (start..sceneEnd). Silence after a line is not "no content".
  timeline.cues.push({id:`caption-${i}`,track_id:"captions",kind:"subtitle",title:`字幕 ${i+1}`,text:line.text,speaker,
    start_sec:start,end_sec:sceneEnd,speech_end_sec:end,transform:transform()});
  if(program.genre==="studio")timeline.cues.push({id:`expression-${i}`,track_id:"expressions",kind:"expression",speaker,
    expression:line.expression||"neutral",title:`${speaker} / ${line.expression||"neutral"}`,start_sec:start,end_sec:sceneEnd});
  const media=line.media||page?.media;
  if(media){
    await fs.access(inside(root,media.src));
    timeline.cues.push({id:`media-${i}`,track_id:"media",kind:media.kind||"image",src:media.src,title:media.title||"大屏素材",
      role:program.genre==="studio"?"screen":"page",fit:media.fit||"contain",start_sec:start,end_sec:sceneEnd,source_offset:media.source_offset||0,
      transform:{...transform(),...(media.transform||{})},asset_refs:[media.src]});
  }
  cursor=sceneEnd;
}
timeline.duration_seconds=frame(cursor,30);
if(program.genre==="studio"){
  timeline.studio={brand:"VM NEWS",title:program.title||"代码演播室",ticker:program.ticker||"代码制作 · 双主播讲解 · 大屏聚焦 · 可编辑时间线",
    background:program.background,desk:program.desk,screen_rect:program.screen_rect||[55,141,870,360],skin:"diagnostic-vector",
    hosts:program.hosts||[{id:"host-a",name:"阿岚",color:"#c95353",expressions:{}},{id:"host-b",name:"小青",color:"#36a59d",expressions:{}}]};
  if(timeline.studio.hosts.length!==2)throw new Error("Studio baseline requires exactly two hosts");
  if(program.background&&timeline.studio.hosts.every((host)=>host.expressions?.neutral))timeline.studio.skin="custom";
  if(program.accept_vector_skin)timeline.studio.skin="approved-code-vector";
  for(const host of timeline.studio.hosts)for(const src of Object.values(host.expressions||{}))await fs.access(inside(root,src));
  // A script expression without its differential image silently falls back to neutral; report it.
  timeline.studio.missing_expressions=[...new Set(program.lines.filter((line)=>{
    const host=timeline.studio.hosts.find((h)=>h.id===(line.speaker||"host-a"));
    return host&&Object.keys(host.expressions||{}).length&&line.expression&&!host.expressions[line.expression];
  }).map((line)=>`${line.speaker||"host-a"}:${line.expression}`))];
  if(timeline.studio.background)await fs.access(inside(root,timeline.studio.background));
  if(timeline.studio.desk)await fs.access(inside(root,timeline.studio.desk));
}else timeline.presentation={brand:program.title,accent:program.accent||"#c94b3c",pages:program.pages.length,genre:program.genre};
const project={...original,name:program.title||program.genre,mode:program.genre,width:program.width||1920,height:program.height||1080,fps:30,duration_seconds:timeline.duration_seconds};
const music=program.music||(await musicStatus(root)).selected;
const bed=await musicActions(root,{project,timeline},music);
if(bed.actions.length)timeline=applyActions({project,timeline},bed.actions).timeline;
const errors=validate(project,timeline);if(errors.length)throw new Error(errors.join("; "));
await atomicJson(path.join(root,"video.json"),project);await atomicJson(path.join(root,"timeline.json"),timeline);
await atomicJson(path.join(root,"storyboard.json"),timeline.cues.filter((c)=>c.kind==="scene"));
console.log(JSON.stringify({status:"ready",genre:program.genre,duration:timeline.duration_seconds,voice_stems:program.lines.length,
  skin:timeline.studio?.skin,warning:timeline.studio?.skin==="diagnostic-vector"?"Diagnostic vector skin, not final generated anime assets.":undefined,
  missing_expressions:timeline.studio?.missing_expressions?.length?timeline.studio.missing_expressions:undefined}));
