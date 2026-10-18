import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";
import { generateMusic } from "./music-tools.mjs";
import { probe } from "./media.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("music round: local audition, custom requests, uploads, guarded independent bed and real export",{timeout:180000},async()=>{
  await fs.mkdir(path.join(root,".editor"),{recursive:true});
  const fixture=await fs.mkdtemp(path.join(root,".editor","music-ui-"));
  let server,browser;
  try{
    for(const folder of ["src","assets"])await fs.cp(path.join(root,folder),path.join(fixture,folder),{recursive:true});
    for(const file of ["video.json","timeline.json","package.json"])await fs.copyFile(path.join(root,file),path.join(fixture,file));
    await fs.symlink(path.join(root,"node_modules"),path.join(fixture,"node_modules"),process.platform==="win32"?"junction":"dir");
    const instance=await createProjectServer(fixture);server=instance.server;
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on("pageerror",(error)=>errors.push(error.message));
    const api=async(route,data)=>{
      const reply=await page.request.fetch(`${instance.url}/api/${route}`,{method:data===undefined?"GET":"POST",...(data===undefined?{}:{data})});
      return {status:reply.status(),data:await reply.json()};
    };
    await page.goto(`${instance.url}/create?panel=music`);
    await page.waitForSelector("#music-form");
    assert.equal(await page.locator("[name=mode]").count(),4);
    assert.equal(await page.locator("#music-form input[type=text]:visible").count(),0);
    assert.equal(await page.locator("[data-music-procedural]").isVisible(),false);
    let state=(await api("workspace")).data;
    const untouched=state.revision;
    await page.locator('[name=mode][value=procedural]').check();
    assert.equal(await page.locator("[name=style]").count(),4);
    await page.locator("[data-music-preview]").click();
    await page.waitForFunction(()=>!document.querySelector("[data-music-audio]").hidden);
    await page.locator("[data-music-audio]").evaluate((audio)=>audio.load());
    await page.waitForFunction(()=>document.querySelector("[data-music-audio]").readyState>=2);
    assert.ok(await page.locator("[data-music-audio]").evaluate((audio)=>Math.abs(audio.duration-8)<.01));
    assert.equal((await api("workspace")).data.revision,untouched);
    assert.equal((await api("music-tool")).data.selected.mode,"none","Audition isn't a saved choice");
    await page.locator('[name=style][value=__custom__]').check();
    await page.locator('[name=style_custom]').fill("Slow jazz piano without drums");
    assert.equal(await page.locator("[data-music-preview]").isDisabled(),true);
    await page.locator("#music-form [type=submit]").click();
    await page.waitForFunction(()=>document.querySelector("[data-music-status]").textContent.includes("等待 Agent"));
    assert.equal((await api("music-tool")).data.selected.custom,"Slow jazz piano without drums");
    assert.equal((await api("workspace")).data.revision,untouched);
    await page.locator('[name=style][value=soft]').check();
    await page.locator("#music-form [type=submit]").click();
    await page.waitForSelector("[data-music-apply]:visible");
    assert.equal((await api("music-tool")).data.selected.bpm,80);
    const clip=await generateMusic(fixture,{duration:3,style:"pulse"});
    // A test signal stands in for speech; no TTS, cloning, ASR or paid calls.
    const project={width:640,height:360,duration_seconds:3};
    const timeline={...state.timeline,duration_seconds:3,
      tracks:[{id:"scenes",kind:"video",name:"Test",muted:false,visible:true},{id:"voice",kind:"voice",name:"Test voice",muted:false,visible:true}],
      cues:[{id:"test-scene",track_id:"scenes",kind:"scene",scene:"type",word:"AUDIO",start_sec:0,end_sec:3},
        {id:"test-voice",track_id:"voice",kind:"voice",src:clip.src,start_sec:.5,end_sec:2,source_offset:0,source_duration:3,volume:.3}]};
    assert.equal((await api("actions",{expected_revision:state.revision,actions:[
      {type:"project.update",patch:project},{type:"timeline.replace",timeline}]})).status,200);
    assert.equal((await api("music-apply",{expected_revision:untouched})).status,409);
    state=(await api("workspace")).data;
    await api("editor-presence",{dirty:true});
    assert.equal((await api("music-apply",{expected_revision:state.revision})).status,409);
    await api("editor-presence",{dirty:false});
    await page.locator("[data-music-apply]").click();
    await page.waitForFunction(()=>document.querySelector("[data-music-status]").textContent.includes("已加入时间线"));
    state=(await api("workspace")).data;
    assert.equal(state.timeline.cues.filter((cue)=>cue.kind==="music").length,1);
    assert.equal(state.timeline.cues.find((cue)=>cue.id==="vm-music-bed").duck_gain,.28);
    await page.locator("[data-music-apply]").click();
    await page.waitForFunction(()=>!document.querySelector("[data-music-apply]").disabled);
    assert.equal((await api("workspace")).data.timeline.cues.filter((cue)=>cue.kind==="music").length,1);
    for(const [name,width,height] of [["desktop",1440,1000],["mobile",390,844],["small",320,700]]){
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: no overflow`);
      await fs.mkdir(path.join(root,"validation"),{recursive:true});
      await page.screenshot({path:path.join(root,`validation/music-${name}.png`),fullPage:true});
    }
    assert.equal((await api("render",{})).status,202);
    const start=Date.now();let render;
    do{
      await new Promise((resolve)=>setTimeout(resolve,300));
      render=(await api("render-status")).data;
      if(render.state==="error")throw new Error(render.error);
    }while(render.state!=="done"&&Date.now()-start<90000);
    assert.equal(render.state,"done");
    const info=await probe(path.join(fixture,render.output));
    assert.ok(info.streams.some((stream)=>stream.codec_type==="audio"));
    assert.ok(info.streams.some((stream)=>stream.codec_type==="video"&&stream.width===640));
    assert.ok(Math.abs(Number(info.format.duration)-3)<.15);
    await page.locator('[name=mode][value=provided]').check();
    await page.locator("[data-music-file]").setInputFiles(path.join(fixture,clip.src));
    await page.waitForFunction(()=>document.querySelector("[data-music-status]").textContent.includes("已导入"));
    await page.locator("#music-form [type=submit]").click();
    await page.waitForSelector("[data-music-apply]:visible");
    assert.equal((await api("music-tool")).data.selected.mode,"provided");
    await page.locator("[data-music-apply]").click();
    await page.waitForFunction(()=>!document.querySelector("[data-music-apply]").disabled);
    assert.equal((await api("workspace")).data.timeline.cues.filter((cue)=>cue.kind==="music").length,1);
    await page.locator('[name=mode][value=none]').check();
    await page.locator("#music-form [type=submit]").click();
    await page.waitForSelector("[data-music-apply]:visible");
    await page.locator("[data-music-apply]").click();
    await page.waitForFunction(()=>document.querySelector("[data-music-status]").textContent.includes("已移除"));
    state=(await api("workspace")).data;
    assert.equal(state.timeline.cues.filter((cue)=>cue.kind==="voice").length,1);
    assert.equal(state.timeline.cues.filter((cue)=>cue.kind==="music").length,0);
    await page.goto(instance.url);await page.waitForFunction(()=>window.__editorReady);
    assert.equal(await page.locator('a[href="/create?panel=music"]').count(),1);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();if(server)await new Promise((resolve)=>server.close(resolve));
    assert.ok(path.resolve(fixture).startsWith(path.resolve(root,".editor")+path.sep));
    await fs.rm(fixture,{recursive:true,force:true});
  }
});
