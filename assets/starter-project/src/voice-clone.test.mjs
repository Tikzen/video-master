import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureVoice, voiceConfig } from "./voice-tools.mjs";
import { listSamples, importSample, cloneVoice } from "./voice-clone.mjs";
import { ffmpegPath, run } from "./media.mjs";

test("clone: local validation, consent, upload contract, reusable ID and uncertain retry guard",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vm-clone-"));
  try{
    await configureVoice(root,{provider:"minimax"});
    await fs.writeFile(path.join(root,".env"),"MINIMAX_API_KEY=private-clone-test\n");
    const fixture=path.join(root,"tone.wav");
    await run(ffmpegPath,["-v","error","-f","lavfi","-i","sine=frequency=220:duration=10.2",fixture]);
    const sample=await importSample(root,"test.wav",await fs.readFile(fixture));
    assert.ok(sample.duration>=10);
    assert.equal((await listSamples(root)).files.length,1);
    await assert.rejects(()=>importSample(root,"bad.exe",Buffer.from("x")),/mp3/);
    const input={sample:sample.name,voice_id:"CloneTest001",speaker:"host-a",rights_confirmed:true,authorized:true};
    let calls=0;
    const fetchImpl=async(url,options)=>{
      calls++;
      assert.equal(options.headers.Authorization,"Bearer private-clone-test");
      if(url.endsWith("/files/upload")){
        assert.ok(options.body instanceof FormData);assert.equal(options.body.get("purpose"),"voice_clone");
        assert.ok((await options.body.get("file").arrayBuffer()).byteLength>100);
        return Response.json({base_resp:{status_code:0},file:{file_id:123456}});
      }
      assert.equal(url,"https://api.minimax.cn/v1/voice_clone");
      const payload=JSON.parse(options.body);
      assert.equal(payload.file_id,123456);assert.equal(payload.voice_id,input.voice_id);assert.equal(payload.text,undefined);
      return Response.json({base_resp:{status_code:0}});
    };
    await assert.rejects(()=>cloneVoice(root,{...input,authorized:false},{fetchImpl}),/authorize/);
    await assert.rejects(()=>cloneVoice(root,{...input,rights_confirmed:false},{fetchImpl}),/rights/);
    await assert.rejects(()=>cloneVoice(root,{...input,voice_id:"short"},{fetchImpl}),/Voice ID/);
    assert.equal(calls,0);
    assert.equal((await cloneVoice(root,input,{fetchImpl})).cached,false);
    assert.equal((await voiceConfig(root)).voices["host-a"],input.voice_id);
    assert.equal((await cloneVoice(root,input,{fetchImpl})).cached,true);assert.equal(calls,2);
    const unknown={...input,voice_id:"Unknown001"};
    await assert.rejects(()=>cloneVoice(root,unknown,{fetchImpl:async(url,opts)=>{
      if(url.endsWith("/upload"))return fetchImpl(url,opts);
      throw new Error("private-clone-test");
    }}),(error)=>error.message.includes("unknown")&&!error.message.includes("private-clone-test"));
    await assert.rejects(()=>cloneVoice(root,unknown,{fetchImpl}),/uncertain/);
    const receipts=await fs.readFile(path.join(root,"voice-samples/clones.json"),"utf8");
    assert.ok(!receipts.includes("private-clone-test"));
    assert.match(await fs.readFile(path.join(root,".gitignore"),"utf8"),/voice-samples/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
