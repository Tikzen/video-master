import test from "node:test";
import assert from "node:assert/strict";
import { applyActions,defaultView } from "./control.mjs";
const current=()=>({
  project:{name:"test",width:1280,height:720,fps:30,duration_seconds:8},
  timeline:{fps:30,duration_seconds:8,tracks:[{id:"g",kind:"graphics",visible:true}],cues:[
    {id:"a",track_id:"g",kind:"title",title:"a",text:"before",start_sec:1,end_sec:3,transform:{x:0,y:0,scale:1,rotation:0,opacity:1}},
  ]},view:defaultView,
});
test("agent actions cover inspector, add/delete, tracks, timing, view and project atomically",()=>{
  const original=current();
  const edited=applyActions(original,[
    {type:"cue.update",id:"a",patch:{text:"after",transform:{scale:1.2}}},
    {type:"cue.move",id:"a",time:2},
    {type:"cue.trim",id:"a",edge:"right",time:3.5},
    {type:"track.update",id:"g",patch:{visible:false}},
    {type:"track.add",track:{id:"v",kind:"voice",visible:true,muted:false}},
    {type:"cue.add",cue:{id:"voice",track_id:"v",kind:"voice",title:"voice",src:"audio/voice.wav",start_sec:0,end_sec:1,volume:1}},
    {type:"cue.update",id:"voice",patch:{volume:.5,fade_out:.2}},
    {type:"view.set",patch:{time:4,selected_id:"a",playing:true,zoom:120,snap:false,panel:"voice"}},
    {type:"project.update",patch:{name:"edited",width:1920,height:1080}},
  ]);
  assert.equal(original.timeline.cues[0].text,"before");
  assert.equal(edited.timeline.cues[0].text,"after");assert.equal(edited.timeline.cues[0].start_sec,2);
  assert.equal(edited.timeline.cues[0].end_sec,3.5);assert.equal(edited.timeline.cues[0].transform.x,0);
  assert.equal(edited.timeline.cues[0].transform.scale,1.2);
  assert.equal(edited.timeline.tracks[0].visible,false);assert.equal(edited.view.time,4);
  const deleted=applyActions(edited,[{type:"cue.delete",id:"a"},{type:"track.delete",id:"v"}]);
  assert.equal(deleted.timeline.cues.length,0);assert.equal(deleted.view.selected_id,null);
  assert.throws(()=>applyActions(original,[{type:"cue.update",id:"a",patch:{text:"new"}},{type:"view.set",patch:{zoom:999}}]),/Zoom/);
  assert.equal(original.timeline.cues[0].text,"before");
  assert.throws(()=>applyActions(original,[{type:"cue.move",id:"missing",time:1}]),/not found/);
});
