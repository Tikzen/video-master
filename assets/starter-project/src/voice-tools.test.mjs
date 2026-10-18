import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureVoice, voiceStatus, voiceConfig, speechRequest, synthesizeSpeech } from "./voice-tools.mjs";
import { ffmpegPath, run } from "./media.mjs";

test("voice setup preserves keys, appends missing env fields and strips unknown secrets",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-voice-"));
  try{
    await fs.writeFile(path.join(root,".env"),"MINIMAX_API_KEY=private-fixture\nOPENAI_API_KEY=other-fixture\n");
    await configureVoice(root,{provider:"minimax",region:"global",api_key:"must-not-persist",voices:{"host-a":"voice-a","host-b":"voice-b"}});
    const env=await fs.readFile(path.join(root,".env"),"utf8");
    assert.match(env,/MINIMAX_API_KEY=private-fixture/);
    assert.match(env,/OPENAI_API_KEY=other-fixture/);
    assert.equal((env.match(/^MINIMAX_API_KEY=/gm)||[]).length,1);
    assert.match(env,/MINIMAX_TTS_BASE_URL=/);
    const status=await voiceStatus(root);
    assert.equal(status.key_configured,true);
    assert.ok(!JSON.stringify(status).includes("private-fixture"));
    const serialized=await fs.readFile(path.join(root,"voice_tools.json"),"utf8");
    assert.ok(!serialized.includes("must-not-persist"));
    assert.ok(!(await fs.readFile(path.join(root,".env.example"),"utf8")).includes("private-fixture"));
    const request=await speechRequest(root,await voiceConfig(root),{speaker:"host-b",text:"test"});
    assert.equal(request.url,"https://api.minimax.io/v1/t2a_v2");
    assert.equal(request.payload.voice_setting.voice_id,"voice-b");
    await assert.rejects(()=>speechRequest(root,status.selected,{speaker:"unknown",text:"test"}),/voice ID/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test("MiniMax mock contract, paid gate, real audio decode, cache and redacted failures",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-tts-"));
  try{
    await fs.writeFile(path.join(root,".env"),"MINIMAX_API_KEY=secret-fixture\n");
    const fixture=path.join(root,"fixture.mp3");
    await run(ffmpegPath,["-v","error","-f","lavfi","-i","sine=frequency=330:duration=0.5","-codec:a","libmp3lame",fixture]);
    const audio=await fs.readFile(fixture);
    const config=await voiceConfig(root,{provider:"minimax",voices:{narrator:"voice-test"}});
    let calls=0;
    const fetchImpl=async(url,options)=>{
      calls++;
      const body=JSON.parse(options.body);
      assert.equal(url,"https://api.minimax.cn/v1/t2a_v2");
      assert.equal(body.stream,false);assert.equal(body.output_format,"hex");
      assert.equal(options.headers.Authorization,"Bearer secret-fixture");
      assert.equal(body.voice_setting.voice_id,"voice-test");
      return Response.json({base_resp:{status_code:0},data:{audio:audio.toString("hex")}});
    };
    const line={speaker:"narrator",text:"Mock synthesis only"};
    await assert.rejects(()=>synthesizeSpeech(root,config,line,{fetchImpl}),/authorization/);
    assert.equal(calls,0);
    const first=await synthesizeSpeech(root,config,line,{authorized:true,fetchImpl});
    assert.ok(first.duration>.4);assert.equal(first.cached,false);
    const second=await synthesizeSpeech(root,config,line,{authorized:true,fetchImpl});
    assert.equal(second.src,first.src);assert.equal(second.cached,true);assert.equal(calls,1);
    await assert.rejects(()=>synthesizeSpeech(root,config,{...line,text:"failure"},{authorized:true,
      fetchImpl:async()=>Response.json({base_resp:{status_code:1004,status_msg:"secret-fixture"}})}),
      (error)=>error.message.includes("1004")&&!error.message.includes("secret-fixture"));
    await assert.rejects(()=>synthesizeSpeech(root,config,{...line,text:"http failure"},{authorized:true,
      fetchImpl:async()=>new Response("secret-fixture",{status:401})}),/HTTP 401/);
    await assert.rejects(()=>synthesizeSpeech(root,config,{...line,text:"bad audio"},{authorized:true,
      fetchImpl:async()=>Response.json({base_resp:{status_code:0},data:{audio:"abc!"}})}),/hex/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
